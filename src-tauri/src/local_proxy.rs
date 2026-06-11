// ─── Local Proxy Server ─────────────────────────────────────────────────────
// Embedded SOCKS5 / HTTP CONNECT proxy for AppOnly mode.
// Listens on 127.0.0.1, accepts connections from local applications,
// and forwards all traffic through the configured upstream proxy.
// Pure Rust networking — no OS system-proxy API involved.

use std::net::IpAddr;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::collections::HashMap;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{timeout, Duration};

use chrono::Local;

// ─── Constants ──────────────────────────────────────────────────────────────

const SOCKS5_VERSION: u8 = 0x05;
const SOCKS5_CMD_CONNECT: u8 = 0x01;
const SOCKS5_ATYP_IPV4: u8 = 0x01;
const SOCKS5_ATYP_DOMAIN: u8 = 0x03;
const SOCKS5_ATYP_IPV6: u8 = 0x04;
const SOCKS5_REP_SUCCESS: u8 = 0x00;
const SOCKS5_REP_GENERAL_FAILURE: u8 = 0x01;
const SOCKS5_REP_CONN_REFUSED: u8 = 0x05;
const SOCKS5_REP_CMD_NOT_SUPPORTED: u8 = 0x07;

const CONNECTION_TIMEOUT_SECS: u64 = 15;

// ─── Types ──────────────────────────────────────────────────────────────────

/// The protocol used when connecting to the upstream proxy.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UpstreamProtocol {
    Socks5,
    Http,
}

impl UpstreamProtocol {
    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "SOCKS5" | "SOCKS" => UpstreamProtocol::Socks5,
            _ => UpstreamProtocol::Http,
        }
    }
}

/// Status info returned to the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct LocalProxyStatus {
    pub running: bool,
    pub listen_port: u16,
    pub bind_addr: String,
    pub lan_ip: String,
    pub shared: bool,
    pub active_connections: usize,
    pub total_connections: usize,
    pub upstream_host: String,
    pub upstream_port: u16,
    pub upstream_protocol: String,
}

/// Get the machine's LAN IP via a dummy UDP "connect" (no data sent).
fn get_lan_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:53").is_ok() {
            if let Ok(local) = socket.local_addr() {
                let ip = local.ip().to_string();
                if ip != "0.0.0.0" && ip != "127.0.0.1" {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

/// Per-IP cumulative traffic stats.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct ClientStats {
    pub upload_bytes: u64,
    pub download_bytes: u64,
}

/// Active client entry exposed to the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ActiveClientEntry {
    pub client_ip: String,
    pub upload_bytes: u64,
    pub download_bytes: u64,
}

// ─── Server ─────────────────────────────────────────────────────────────────

pub struct LocalProxyServer {
    pub listen_port: Arc<std::sync::Mutex<Option<u16>>>,
    stop_flag: Arc<AtomicBool>,
    bind_addr: String,
    upstream_host: String,
    upstream_port: u16,
    upstream_protocol: UpstreamProtocol,
    username: Option<String>,
    password: Option<String>,
    pub active_connections: Arc<AtomicUsize>,
    pub total_connections: Arc<AtomicUsize>,
    blocked_ips: Arc<Vec<String>>,
    log_dir: Option<PathBuf>,
    /// Per-IP concurrent connection count (for tracking "currently active" clients).
    pub active_ips: Arc<std::sync::Mutex<HashMap<String, usize>>>,
    /// Per-IP cumulative traffic stats.
    pub client_stats: Arc<std::sync::Mutex<HashMap<String, ClientStats>>>,
}

impl LocalProxyServer {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        shared: bool,
        upstream_host: String,
        upstream_port: u16,
        upstream_protocol: UpstreamProtocol,
        username: Option<String>,
        password: Option<String>,
    ) -> Self {
        let bind_addr = if shared { "0.0.0.0" } else { "127.0.0.1" };
        Self {
            listen_port: Arc::new(std::sync::Mutex::new(None)),
            stop_flag: Arc::new(AtomicBool::new(false)),
            bind_addr: bind_addr.to_string(),
            upstream_host,
            upstream_port,
            upstream_protocol,
            username,
            password,
            active_connections: Arc::new(AtomicUsize::new(0)),
            total_connections: Arc::new(AtomicUsize::new(0)),
            blocked_ips: Arc::new(Vec::new()),
            log_dir: None,
            active_ips: Arc::new(std::sync::Mutex::new(HashMap::new())),
            client_stats: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }

    /// Return a snapshot of active client IPs with their cumulative traffic stats.
    pub fn get_active_clients(&self) -> Vec<ActiveClientEntry> {
        let ips = self.active_ips.lock().unwrap();
        let stats = self.client_stats.lock().unwrap();
        ips.iter().map(|(ip, _)| {
            let s = stats.get(ip).cloned().unwrap_or_default();
            ActiveClientEntry {
                client_ip: ip.clone(),
                upload_bytes: s.upload_bytes,
                download_bytes: s.download_bytes,
            }
        }).collect()
    }

    /// Set the list of blocked target IP addresses (exact IP or CIDR notation).
    pub fn set_blocked_ips(&mut self, ips: Vec<String>) {
        self.blocked_ips = Arc::new(ips);
    }

    /// Set the HostConnectionLog root directory for connection logging.
    pub fn set_log_dir(&mut self, dir: PathBuf) {
        self.log_dir = Some(dir);
    }

    /// Start listening on a local port and spawn the accept loop.
    /// If `config_port` is 0 the OS assigns a random port.
    /// Returns the port number assigned.
    pub async fn start(&self, config_port: u16) -> Result<u16, String> {
        let port_str = if config_port > 0 { config_port.to_string() } else { "0".to_string() };
        let bind_sock = format!("{}:{}", self.bind_addr, port_str);
        let listener = TcpListener::bind(&bind_sock)
            .await
            .map_err(|e| format!("Failed to bind local port: {e}"))?;

        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local address: {e}"))?
            .port();

        *self.listen_port.lock().unwrap() = Some(port);
        self.stop_flag.store(false, Ordering::SeqCst);

        let stop_flag = self.stop_flag.clone();
        let upstream_host = self.upstream_host.clone();
        let upstream_port = self.upstream_port;
        let upstream_protocol = self.upstream_protocol;
        let username = self.username.clone();
        let password = self.password.clone();
        let active_connections = self.active_connections.clone();
        let total_connections = self.total_connections.clone();
        let blocked_ips = self.blocked_ips.clone();
        let log_dir = self.log_dir.clone();
        let active_ips = self.active_ips.clone();
        let client_stats = self.client_stats.clone();

        tokio::spawn(async move {
            loop {
                if stop_flag.load(Ordering::SeqCst) {
                    break;
                }

                // Use a short timeout so stop_flag is checked regularly.
                let accept = timeout(Duration::from_millis(500), listener.accept()).await;

                match accept {
                    Ok(Ok((stream, addr))) => {
                        active_connections.fetch_add(1, Ordering::SeqCst);
                        total_connections.fetch_add(1, Ordering::SeqCst);

                        let up_host = upstream_host.clone();
                        let up_port = upstream_port;
                        let up_proto = upstream_protocol;
                        let uname = username.clone();
                        let pwd = password.clone();
                        let _stop = stop_flag.clone();
                        let conn_count = active_connections.clone();
                        let blocked = blocked_ips.clone();
                        let log = log_dir.clone();
                        let ips = active_ips.clone();
                        let stats = client_stats.clone();

                        tokio::spawn(async move {
                            if let Err(e) =
                                handle_client(stream, &up_host, up_port, up_proto, uname, pwd, &blocked, log, ips, stats).await
                            {
                                eprintln!("[local-proxy] client {addr} error: {e}");
                            }
                            conn_count.fetch_sub(1, Ordering::SeqCst);
                        });
                    }
                    Ok(Err(e)) => {
                        if !stop_flag.load(Ordering::SeqCst) {
                            eprintln!("[local-proxy] accept error: {e}");
                        }
                    }
                    Err(_) => {
                        // Timeout — loop back to check stop_flag.
                    }
                }
            }
        });

        Ok(port)
    }

    /// Signal the accept loop to stop. Existing connections are not disrupted.
    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::SeqCst);
    }

    pub fn is_running(&self) -> bool {
        self.listen_port.lock().unwrap().is_some() && !self.stop_flag.load(Ordering::SeqCst)
    }

    pub fn status(&self) -> LocalProxyStatus {
        let port = self.listen_port.lock().unwrap().unwrap_or(0);
        LocalProxyStatus {
            running: self.is_running(),
            listen_port: port,
            bind_addr: self.bind_addr.clone(),
            lan_ip: get_lan_ip(),
            shared: self.bind_addr == "0.0.0.0",
            active_connections: self.active_connections.load(Ordering::SeqCst),
            total_connections: self.total_connections.load(Ordering::SeqCst),
            upstream_host: self.upstream_host.clone(),
            upstream_port: self.upstream_port,
            upstream_protocol: format!("{:?}", self.upstream_protocol),
        }
    }
}

// ─── Connection Handler ─────────────────────────────────────────────────────

/// Data collected for a single connection log entry.
struct ConnLog {
    log_dir: Option<PathBuf>,
    client_ip_str: String,   // connecting client IP → db filename
    target_ip: String,        // destination IP     → table `ip` column
    src_port: u16,
    dst_port: u16,
}

impl ConnLog {
    fn new(log_dir: Option<PathBuf>, client_ip_str: &str, target_ip: &str, src_port: u16, dst_port: u16) -> Self {
        Self {
            log_dir,
            client_ip_str: client_ip_str.to_string(),
            target_ip: target_ip.to_string(),
            src_port,
            dst_port,
        }
    }

    /// Write this connection to the database.
    async fn write(&self, upload_bytes: u64, download_bytes: u64, status_code: u16) {
        let log_dir = match &self.log_dir {
            Some(d) => d.clone(),
            None => {
                eprintln!("[local-proxy:log] skipped — no log_dir configured");
                return;
            }
        };

        let now = Local::now();
        let timestamp = now.timestamp_millis();
        let date_str = now.format("%Y-%m-%d").to_string();
        let client_ip = self.client_ip_str.clone();
        let target_ip = self.target_ip.clone();
        let src_port = self.src_port;
        let dst_port = self.dst_port;

        eprintln!(
            "[local-proxy:log] writing client={} → {}:{}  src={}  ↑{} ↓{}  status={}",
            client_ip, target_ip, dst_port, src_port, upload_bytes, download_bytes, status_code,
        );

        // Get MAC address (fast cached ARP lookup on Windows).
        let mac = tokio::task::block_in_place(|| {
            // Parse back to IpAddr for the platform helper
            let ip: std::net::IpAddr = client_ip.parse().unwrap_or_else(|_| "127.0.0.1".parse().unwrap());
            std::panic::catch_unwind(|| crate::platform::get_mac_address(ip))
                .ok()
                .flatten()
                .unwrap_or_default()
        });

        let result = crate::db::insert_connection_log(
            &log_dir,
            &date_str,
            timestamp,
            &client_ip,   // db filename key
            &target_ip,   // table `ip` column
            src_port,
            dst_port,
            "TCP",
            upload_bytes,
            download_bytes,
            status_code,
            &mac,
        );

        if let Err(e) = result {
            eprintln!("[local-proxy:log] ERROR: {e}");
        } else {
            eprintln!("[local-proxy:log] OK — {}/{}  → {}/{}.db", date_str, client_ip, date_str, target_ip);
        }
    }
}

// Helper: register a client IP on creation, unregister + update stats on drop.
struct ClientConnectionTracker {
    ip: String,
    active_ips: Arc<std::sync::Mutex<HashMap<String, usize>>>,
    client_stats: Arc<std::sync::Mutex<HashMap<String, ClientStats>>>,
    upload: u64,
    download: u64,
}

impl ClientConnectionTracker {
    fn new(
        ip: &str,
        active_ips: Arc<std::sync::Mutex<HashMap<String, usize>>>,
        client_stats: Arc<std::sync::Mutex<HashMap<String, ClientStats>>>,
    ) -> Self {
        {
            let mut map = active_ips.lock().unwrap();
            *map.entry(ip.to_string()).or_insert(0) += 1;
        }
        Self {
            ip: ip.to_string(),
            active_ips,
            client_stats,
            upload: 0,
            download: 0,
        }
    }

    fn add_traffic(&mut self, upload: u64, download: u64) {
        self.upload += upload;
        self.download += download;
    }
}

impl Drop for ClientConnectionTracker {
    fn drop(&mut self) {
        // Decrement active count for this IP.
        {
            let mut map = self.active_ips.lock().unwrap();
            if let Some(count) = map.get_mut(&self.ip) {
                *count -= 1;
                if *count == 0 {
                    map.remove(&self.ip);
                }
            }
        }
        // Add traffic to cumulative stats.
        if self.upload > 0 || self.download > 0 {
            let mut map = self.client_stats.lock().unwrap();
            let entry = map.entry(self.ip.clone()).or_default();
            entry.upload_bytes += self.upload;
            entry.download_bytes += self.download;
        }
    }
}

async fn handle_client(
    mut client: TcpStream,
    upstream_host: &str,
    upstream_port: u16,
    upstream_protocol: UpstreamProtocol,
    username: Option<String>,
    password: Option<String>,
    blocked_ips: &[String],
    log_dir: Option<PathBuf>,
    active_ips: Arc<std::sync::Mutex<HashMap<String, usize>>>,
    client_stats: Arc<std::sync::Mutex<HashMap<String, ClientStats>>>,
) -> Result<(), String> {
    // ══ Phase 0: Get client info ══════════════════════════════════════════
    let client_addr = client
        .peer_addr()
        .map_err(|e| format!("peer_addr error: {e}"))?;
    let client_ip = client_addr.ip();
    let src_port = client_addr.port();

    // Track this client connection (auto-cleans on function exit via Drop).
    let mut tracker = ClientConnectionTracker::new(
        &client_ip.to_string(),
        active_ips,
        client_stats,
    );

    // ══ Phase 0.5: Block banned client IPs (source IP blocking) ═══════════
    if is_client_blocked(&client_ip, blocked_ips) {
        eprintln!("[local-proxy] blocked client {client_ip}:{src_port} — source IP in blocklist");
        // Send HTTP 403 so the client gets feedback instead of a silent hang
        let _ = client
            .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await;
        return Err(format!("blocked client IP: {client_ip}"));
    }

    // ══ Phase 1: Parse client request ═════════════════════════════════════
    let mut peek_buf = [0u8; 1];
    let n = client
        .peek(&mut peek_buf)
        .await
        .map_err(|e| format!("peek error: {e}"))?;
    if n == 0 {
        return Err("connection closed before any data".to_string());
    }

    let client_is_socks5 = peek_buf[0] == SOCKS5_VERSION;

    if client_is_socks5 {
        // ── SOCKS5 path (existing tunnel logic) ──────────────────────────
        let (target_addr, target_port) = socks5_handshake(&mut client).await?;

        let log = ConnLog::new(log_dir, &client_ip.to_string(), &target_addr, src_port, target_port);

        // Phase 1.5: blocked check
        if is_target_blocked(&target_addr, target_port, blocked_ips) {
            eprintln!("[local-proxy] blocked: {target_addr}:{target_port}");
            let _ = socks5_send_failure(&mut client, SOCKS5_REP_CONN_REFUSED).await;
            log.write(0, 0, crate::db::STATUS_BLOCKED).await;
            return Err(format!("blocked target: {target_addr}:{target_port}"));
        }

        // Phases 2-5: Connect → Tunnel → Relay
        let result = connect_tunnel_relay(
            &mut client, upstream_host, upstream_port, upstream_protocol,
            &target_addr, target_port, &username, &password, true,
        )
        .await;

        match &result {
            Ok((up, down)) => {
                tracker.add_traffic(*up, *down);
                log.write(*up, *down, crate::db::STATUS_OK).await;
            }
            Err(msg) => {
                let code = if msg.contains("timeout") {
                    crate::db::STATUS_UPSTREAM_TIMEOUT
                } else {
                    crate::db::STATUS_UPSTREAM_FAIL
                };
                log.write(0, 0, code).await;
            }
        }

        result.map(|_| ())
    } else {
        // ── HTTP path (CONNECT tunnel or regular HTTP proxy) ──────────────
        let http_req = parse_http_request(&mut client).await?;

        match http_req {
            ClientHttpRequest::Connect { host: target_addr, port: target_port } => {
                // HTTP CONNECT tunnel — same logic as SOCKS5 tunnel
                let log = ConnLog::new(log_dir, &client_ip.to_string(), &target_addr, src_port, target_port);

                if is_target_blocked(&target_addr, target_port, blocked_ips) {
                    eprintln!("[local-proxy] blocked: {target_addr}:{target_port}");
                    let _ = http_send_403(&mut client).await;
                    log.write(0, 0, crate::db::STATUS_BLOCKED).await;
                    return Err(format!("blocked target: {target_addr}:{target_port}"));
                }

                let result = connect_tunnel_relay(
                    &mut client, upstream_host, upstream_port, upstream_protocol,
                    &target_addr, target_port, &username, &password, false,
                )
                .await;

                match &result {
                    Ok((up, down)) => {
                tracker.add_traffic(*up, *down);
                log.write(*up, *down, crate::db::STATUS_OK).await;
            }
                    Err(msg) => {
                        let code = if msg.contains("timeout") {
                            crate::db::STATUS_UPSTREAM_TIMEOUT
                        } else {
                            crate::db::STATUS_UPSTREAM_FAIL
                        };
                        log.write(0, 0, code).await;
                    }
                }

                result.map(|_| ())
            }
            ClientHttpRequest::Regular { raw_request, host: target_addr, port: target_port } => {
                // Regular HTTP proxy request (GET, POST, etc.) — forward to upstream
                let log = ConnLog::new(log_dir, &client_ip.to_string(), &target_addr, src_port, target_port);

                if is_target_blocked(&target_addr, target_port, blocked_ips) {
                    eprintln!("[local-proxy] blocked: {target_addr}:{target_port}");
                    let _ = http_send_403(&mut client).await;
                    log.write(0, 0, crate::db::STATUS_BLOCKED).await;
                    return Err(format!("blocked target: {target_addr}:{target_port}"));
                }

                let result = forward_http_request(
                    &mut client, &raw_request,
                    &target_addr, target_port,
                    upstream_host, upstream_port, upstream_protocol,
                    &username, &password,
                )
                .await;

                match &result {
                    Ok((up, down)) => {
                tracker.add_traffic(*up, *down);
                log.write(*up, *down, crate::db::STATUS_OK).await;
            }
                    Err(msg) => {
                        let code = if msg.contains("timeout") {
                            crate::db::STATUS_UPSTREAM_TIMEOUT
                        } else {
                            crate::db::STATUS_UPSTREAM_FAIL
                        };
                        log.write(0, 0, code).await;
                    }
                }

                result.map(|_| ())
            }
        }
    }
}

/// Phases 2–5: connect to upstream proxy, establish tunnel, tell client,
/// then relay bidirectional data.  Returns (upload_bytes, download_bytes).
async fn connect_tunnel_relay(
    client: &mut TcpStream,
    upstream_host: &str,
    upstream_port: u16,
    upstream_protocol: UpstreamProtocol,
    target_addr: &str,
    target_port: u16,
    username: &Option<String>,
    password: &Option<String>,
    client_is_socks5: bool,
) -> Result<(u64, u64), String> {
    let up_addr = format_upstream_addr(upstream_host, upstream_port);

    let mut upstream = timeout(
        Duration::from_secs(CONNECTION_TIMEOUT_SECS),
        TcpStream::connect(&up_addr),
    )
    .await
    .map_err(|_| "upstream connection timeout".to_string())?
    .map_err(|e| format!("upstream connection failed: {e}"))?;

    // Tunnel through upstream
    match upstream_protocol {
        UpstreamProtocol::Socks5 => {
            tunnel_via_socks5(&mut upstream, target_addr, target_port, username, password).await?;
        }
        UpstreamProtocol::Http => {
            tunnel_via_http(&mut upstream, target_addr, target_port, username, password).await?;
        }
    }

    // Inform client the tunnel is ready
    if client_is_socks5 {
        socks5_send_success(client).await?;
    } else {
        http_send_200(client).await?;
    }

    // Relay data bidirectionally and return byte counts
    let (to_upstream, from_upstream) = relay_data(client, &mut upstream).await?;
    Ok((to_upstream, from_upstream))
}

fn format_upstream_addr(host: &str, port: u16) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

// ─── SOCKS5 Client Handshake ───────────────────────────────────────────────

/// Read SOCKS5 greeting + connect request from the client and return the
/// target (host, port).  Does NOT yet send the success response — that must
/// happen after the upstream tunnel is established.
async fn socks5_handshake(client: &mut TcpStream) -> Result<(String, u16), String> {
    // ── Greeting ──────────────────────────────────────────────────────
    let mut ver_nmethods = [0u8; 2];
    client
        .read_exact(&mut ver_nmethods)
        .await
        .map_err(|_| "failed to read SOCKS5 greeting".to_string())?;

    if ver_nmethods[0] != SOCKS5_VERSION {
        return Err(format!(
            "unsupported SOCKS version: 0x{:02x}",
            ver_nmethods[0]
        ));
    }

    let nmethods = ver_nmethods[1] as usize;
    if nmethods > 0 {
        let mut methods = vec![0u8; nmethods];
        client
            .read_exact(&mut methods)
            .await
            .map_err(|_| "failed to read SOCKS5 methods".to_string())?;
    }

    // Respond: we accept NO AUTH (0x00). If the client *only* offered
    // username/password (0x02), we could respond with that, but for
    // the local proxy we keep it simple.
    client
        .write_all(&[SOCKS5_VERSION, 0x00])
        .await
        .map_err(|e| format!("failed to send SOCKS5 greeting response: {e}"))?;

    // ── Connect request ──────────────────────────────────────────────
    let mut header = [0u8; 4];
    client
        .read_exact(&mut header)
        .await
        .map_err(|_| "failed to read SOCKS5 connect request".to_string())?;

    let ver = header[0];
    let cmd = header[1];
    let atyp = header[3];

    if ver != SOCKS5_VERSION {
        return Err(format!("bad SOCKS version after greeting: 0x{ver:02x}"));
    }
    if cmd != SOCKS5_CMD_CONNECT {
        let _ = client
            .write_all(&[SOCKS5_VERSION, SOCKS5_REP_CMD_NOT_SUPPORTED, 0x00, SOCKS5_ATYP_IPV4, 0, 0, 0, 0, 0, 0])
            .await;
        return Err(format!("unsupported SOCKS5 command: 0x{cmd:02x} (only CONNECT supported)"));
    }

    let addr_str = match atyp {
        SOCKS5_ATYP_IPV4 => {
            let mut octets = [0u8; 4];
            client
                .read_exact(&mut octets)
                .await
                .map_err(|_| "failed to read IPv4 address".to_string())?;
            format!("{}.{}.{}.{}", octets[0], octets[1], octets[2], octets[3])
        }
        SOCKS5_ATYP_DOMAIN => {
            let mut len_byte = [0u8; 1];
            client
                .read_exact(&mut len_byte)
                .await
                .map_err(|_| "failed to read domain length".to_string())?;
            let domain_len = len_byte[0] as usize;
            let mut domain = vec![0u8; domain_len];
            client
                .read_exact(&mut domain)
                .await
                .map_err(|_| "failed to read domain name".to_string())?;
            String::from_utf8_lossy(&domain).into_owned()
        }
        SOCKS5_ATYP_IPV6 => {
            let _ = client
                .write_all(&[SOCKS5_VERSION, SOCKS5_REP_GENERAL_FAILURE, 0x00, SOCKS5_ATYP_IPV4, 0, 0, 0, 0, 0, 0])
                .await;
            return Err("IPv6 is not supported".to_string());
        }
        _ => {
            let _ = client
                .write_all(&[SOCKS5_VERSION, SOCKS5_REP_GENERAL_FAILURE, 0x00, SOCKS5_ATYP_IPV4, 0, 0, 0, 0, 0, 0])
                .await;
            return Err(format!("unsupported SOCKS5 address type: 0x{atyp:02x}"));
        }
    };

    let mut port_bytes = [0u8; 2];
    client
        .read_exact(&mut port_bytes)
        .await
        .map_err(|_| "failed to read port".to_string())?;
    let port = u16::from_be_bytes(port_bytes);

    Ok((addr_str, port))
}

/// Send a SOCKS5 success response back to the client.
async fn socks5_send_success(client: &mut TcpStream) -> Result<(), String> {
    // VER, REP, RSV, ATYP=IPv4, BIND.ADDR=0.0.0.0, BIND.PORT=0
    let response = [
        SOCKS5_VERSION,
        SOCKS5_REP_SUCCESS,
        0x00,
        SOCKS5_ATYP_IPV4,
        0,
        0,
        0,
        0,
        0,
        0,
    ];
    client
        .write_all(&response)
        .await
        .map_err(|e| format!("failed to send SOCKS5 success: {e}"))
}

// ─── HTTP CONNECT Client Handshake ─────────────────────────────────────────

/// Represents a parsed HTTP request from the client.
enum ClientHttpRequest {
    /// HTTP CONNECT tunnel request (for HTTPS).
    Connect { host: String, port: u16 },
    /// Regular HTTP proxy request (GET, POST, etc.) — contains the raw request
    /// bytes plus the extracted target host/port for logging and filtering.
    Regular {
        raw_request: Vec<u8>,
        host: String,
        port: u16,
    },
}

/// Read and parse an HTTP request from the client.
/// Returns either a CONNECT tunnel request or a regular HTTP proxy request.
async fn parse_http_request(client: &mut TcpStream) -> Result<ClientHttpRequest, String> {
    // Read headers until we see the double CRLF.
    let mut buf = vec![0u8; 8192];
    let mut total = 0usize;

    loop {
        let n = client
            .read(&mut buf[total..])
            .await
            .map_err(|e| format!("failed to read HTTP request: {e}"))?;
        if n == 0 {
            return Err("client closed connection before HTTP request was complete".to_string());
        }
        total += n;

        // Check for end of headers.
        if total >= 4 && buf[total - 4..total] == [b'\r', b'\n', b'\r', b'\n'] {
            break;
        }
        if total >= buf.len() {
            return Err("HTTP request header too large (max 8KiB)".to_string());
        }
    }

    // Check Content-Length to read the request body if present.
    let headers_str = String::from_utf8_lossy(&buf[..total]);
    let content_length = headers_str
        .lines()
        .find(|l| l.to_lowercase().starts_with("content-length:"))
        .and_then(|l| l.split(':').nth(1)?.trim().parse::<usize>().ok())
        .unwrap_or(0);

    let total_with_body = if content_length > 0 {
        let needed = total + content_length;
        if buf.len() < needed {
            buf.resize(needed, 0);
        }
        while total < needed {
            let n = client
                .read(&mut buf[total..])
                .await
                .map_err(|e| format!("failed to read HTTP request body: {e}"))?;
            if n == 0 {
                return Err("client closed connection during HTTP request body".to_string());
            }
            total += n;
        }
        total
    } else {
        total
    };

    let raw_request = buf[..total_with_body].to_vec();
    let request_str = String::from_utf8_lossy(&raw_request);
    let first_line = request_str.lines().next().ok_or("empty HTTP request")?;
    let parts: Vec<&str> = first_line.split_whitespace().collect();

    if parts.len() < 2 {
        return Err(format!("malformed HTTP request line: {first_line}"));
    }

    let method = parts[0];
    let uri = parts[1];

    if method == "CONNECT" {
        // CONNECT host:port  —  HTTPS tunnel
        if let Some(colon) = uri.rfind(':') {
            let host = &uri[..colon];
            let port: u16 = uri[colon + 1..]
                .parse()
                .map_err(|_| format!("invalid port in CONNECT: {uri}"))?;
            Ok(ClientHttpRequest::Connect {
                host: host.to_string(),
                port,
            })
        } else {
            Err(format!("invalid CONNECT destination (no port): {uri}"))
        }
    } else {
        // Regular HTTP proxy request — extract target host from the absolute URL.
        let (host, port) = parse_proxy_url(uri).map_err(|e| {
            format!("failed to parse proxy URL in {method} request: {e}")
        })?;
        Ok(ClientHttpRequest::Regular {
            raw_request,
            host,
            port,
        })
    }
}

/// Parse an absolute URL from an HTTP proxy request to extract host and port.
/// e.g. "http://example.com:8080/path" → ("example.com", 8080)
///      "http://example.com/path"     → ("example.com", 80)
fn parse_proxy_url(url: &str) -> Result<(String, u16), String> {
    let url_str = url.trim();
    let after_scheme = url_str
        .splitn(2, "://")
        .nth(1)
        .ok_or_else(|| format!("URL has no scheme: {url_str}"))?;

    // Split off the path part: "host:port/path" → "host:port"
    let host_part = after_scheme.splitn(2, '/').next().unwrap_or(after_scheme);

    // Strip trailing ':' or '.' from malformed URLs
    let host_part = host_part.trim_end_matches(|c| c == ':' || c == '.');

    if host_part.is_empty() {
        return Err(format!("empty host in URL: {url_str}"));
    }

    let default_port = if url_str.to_lowercase().starts_with("https://") {
        443u16
    } else {
        80u16
    };

    if let Some(colon) = host_part.rfind(':') {
        let host = &host_part[..colon];
        if host.is_empty() {
            return Err(format!("empty host in URL: {url_str}"));
        }
        let port_str = &host_part[colon + 1..];
        let port: u16 = port_str
            .parse()
            .map_err(|_| format!("invalid port in URL: {url_str}"))?;
        Ok((host.to_string(), port))
    } else {
        Ok((host_part.to_string(), default_port))
    }
}

/// For SOCKS5 upstream: strip the absolute URL from an HTTP proxy request
/// down to a path-only request.
/// e.g. "GET http://example.com/path HTTP/1.1" → "GET /path HTTP/1.1"
fn strip_proxy_url_to_path(request: &[u8]) -> Vec<u8> {
    let s = String::from_utf8_lossy(request);
    let first_line_end = s.find("\r\n").unwrap_or(s.len());
    let first_line = &s[..first_line_end];
    let rest = &s[first_line_end..];

    let parts: Vec<&str> = first_line.splitn(3, ' ').collect();
    if parts.len() == 3 {
        let method = parts[0];
        let url = parts[1];
        let version = parts[2];

        // Find the path portion after scheme + host
        if let Some(path_start) = url.find("://") {
            let after_scheme = &url[path_start + 3..];
            let path = if let Some(slash_pos) = after_scheme.find('/') {
                // Have a path (or root "/")
                &after_scheme[slash_pos..]
            } else {
                // No path at all — use "/"
                "/"
            };
            let new_first = format!("{} {} {}", method, path, version);
            let mut result = new_first.into_bytes();
            result.extend_from_slice(rest.as_bytes());
            return result;
        }
    }
    // Fallback: return as-is
    request.to_vec()
}

/// Forward a regular HTTP proxy request (GET, POST, etc.) through the upstream.
///
/// For HTTP upstream:  sends the raw request as-is (it already has the absolute URL).
/// For SOCKS5 upstream: creates a tunnel to the target and sends a path-only request.
async fn forward_http_request(
    client: &mut TcpStream,
    raw_request: &[u8],
    target_host: &str,
    target_port: u16,
    upstream_host: &str,
    upstream_port: u16,
    upstream_protocol: UpstreamProtocol,
    username: &Option<String>,
    password: &Option<String>,
) -> Result<(u64, u64), String> {
    let up_addr = format_upstream_addr(upstream_host, upstream_port);

    let mut upstream = timeout(
        Duration::from_secs(CONNECTION_TIMEOUT_SECS),
        TcpStream::connect(&up_addr),
    )
    .await
    .map_err(|_| "upstream connection timeout".to_string())?
    .map_err(|e| format!("upstream connection failed: {e}"))?;

    match upstream_protocol {
        UpstreamProtocol::Socks5 => {
            // Create a SOCKS5 tunnel to the *target* server (not the upstream proxy),
            // then send a path-only HTTP request through the tunnel.
            tunnel_via_socks5(&mut upstream, target_host, target_port, username, password).await?;
            let modified = strip_proxy_url_to_path(raw_request);
            upstream
                .write_all(&modified)
                .await
                .map_err(|e| format!("write to upstream failed: {e}"))?;
        }
        UpstreamProtocol::Http => {
            // Send the raw request as-is — HTTP upstream proxies understand
            // the absolute-URL format.
            upstream
                .write_all(raw_request)
                .await
                .map_err(|e| format!("write to upstream failed: {e}"))?;
        }
    }

    // Relay response data bidirectionally (supports HTTP/1.1 keep-alive).
    let (to_upstream, from_upstream) = tokio::io::copy_bidirectional(client, &mut upstream)
        .await
        .map_err(|e| format!("relay error: {e}"))?;

    Ok((to_upstream, from_upstream))
}

/// Send an HTTP 200 Connection established response.
async fn http_send_200(client: &mut TcpStream) -> Result<(), String> {
    let resp = "HTTP/1.1 200 Connection established\r\n\r\n";
    client
        .write_all(resp.as_bytes())
        .await
        .map_err(|e| format!("failed to send HTTP 200: {e}"))
}

// ─── Upstream Tunnel (SOCKS5) ──────────────────────────────────────────────

/// Connect through an upstream SOCKS5 proxy to the given target.
async fn tunnel_via_socks5(
    upstream: &mut TcpStream,
    target_addr: &str,
    target_port: u16,
    username: &Option<String>,
    password: &Option<String>,
) -> Result<(), String> {
    // ── Greeting ──────────────────────────────────────────────────────
    let has_auth = username
        .as_ref()
        .map_or(false, |u| !u.is_empty());

    let greeting = if has_auth {
        // Offer no-auth + user/pass
        vec![SOCKS5_VERSION, 0x02, 0x00, 0x02]
    } else {
        vec![SOCKS5_VERSION, 0x01, 0x00]
    };

    upstream
        .write_all(&greeting)
        .await
        .map_err(|e| format!("upstream SOCKS5 greeting write: {e}"))?;

    let mut resp = [0u8; 2];
    upstream
        .read_exact(&mut resp)
        .await
        .map_err(|_| "upstream SOCKS5 greeting response read failed".to_string())?;

    if resp[0] != SOCKS5_VERSION {
        return Err("upstream is not a SOCKS5 proxy".to_string());
    }

    match resp[1] {
        0x00 => { /* no auth — proceed */ }
        0x02 => {
            // Username/password authentication
            if !has_auth {
                return Err("upstream requires authentication but none was provided".to_string());
            }
            let u = username.as_deref().unwrap_or("");
            let p = password.as_deref().unwrap_or("");
            let mut auth_req = Vec::with_capacity(3 + u.len() + p.len());
            auth_req.push(0x01); // sub-negotiation version
            auth_req.push(u.len() as u8);
            auth_req.extend_from_slice(u.as_bytes());
            auth_req.push(p.len() as u8);
            auth_req.extend_from_slice(p.as_bytes());

            upstream
                .write_all(&auth_req)
                .await
                .map_err(|e| format!("upstream SOCKS5 auth write: {e}"))?;

            let mut auth_resp = [0u8; 2];
            upstream
                .read_exact(&mut auth_resp)
                .await
                .map_err(|_| "upstream SOCKS5 auth response read failed".to_string())?;

            if auth_resp[1] != 0x00 {
                return Err("upstream SOCKS5 authentication failed".to_string());
            }
        }
        0xFF => {
            return Err("upstream SOCKS5: no acceptable authentication method".to_string());
        }
        m => {
            return Err(format!(
                "upstream SOCKS5: unexpected auth method 0x{m:02x}"
            ));
        }
    }

    // ── Connect request ────────────────────────────────────────────────
    let mut req = Vec::with_capacity(6 + target_addr.len() + 2);
    req.push(SOCKS5_VERSION); // VER
    req.push(SOCKS5_CMD_CONNECT); // CMD
    req.push(0x00); // RSV

    // Encode the target address (prefer domain name when it's not a pure IP).
    let is_ip = target_addr.parse::<std::net::IpAddr>().is_ok();
    if is_ip {
        match target_addr.parse::<std::net::IpAddr>().unwrap() {
            std::net::IpAddr::V4(v4) => {
                req.push(SOCKS5_ATYP_IPV4);
                req.extend_from_slice(&v4.octets());
            }
            std::net::IpAddr::V6(_) => {
                return Err("target is IPv6, which is not supported".to_string());
            }
        }
    } else {
        req.push(SOCKS5_ATYP_DOMAIN);
        req.push(target_addr.len() as u8);
        req.extend_from_slice(target_addr.as_bytes());
    }

    req.extend_from_slice(&target_port.to_be_bytes());

    upstream
        .write_all(&req)
        .await
        .map_err(|e| format!("upstream SOCKS5 connect write: {e}"))?;

    let mut connect_resp = [0u8; 4]; // VER, REP, RSV, ATYP
    upstream
        .read_exact(&mut connect_resp)
        .await
        .map_err(|_| "upstream SOCKS5 connect response read failed".to_string())?;

    if connect_resp[0] != SOCKS5_VERSION {
        return Err("upstream SOCKS5: bad version in connect response".to_string());
    }
    if connect_resp[1] != SOCKS5_REP_SUCCESS {
        let errors = [
            (0x01, "general failure"),
            (0x02, "connection not allowed"),
            (0x03, "network unreachable"),
            (0x04, "host unreachable"),
            (0x05, "connection refused"),
            (0x06, "TTL expired"),
            (0x07, "command not supported"),
            (0x08, "address type not supported"),
        ];
        let reason = errors
            .iter()
            .find(|&&(c, _)| c == connect_resp[1])
            .map(|&(_, s)| s)
            .unwrap_or("unknown error");
        return Err(format!(
            "upstream SOCKS5 connect failed: {reason} (0x{:02x})",
            connect_resp[1]
        ));
    }

    // Consume the BND.ADDR + BND.PORT portion of the response.
    let atyp = connect_resp[3];
    let addr_len = match atyp {
        SOCKS5_ATYP_IPV4 => 4usize,
        SOCKS5_ATYP_IPV6 => 16usize,
        SOCKS5_ATYP_DOMAIN => {
            let mut len_byte = [0u8; 1];
            upstream
                .read_exact(&mut len_byte)
                .await
                .map_err(|_| "failed to read BND.ADDR length".to_string())?;
            len_byte[0] as usize
        }
        _ => return Err(format!("unexpected BND.ATYP: 0x{atyp:02x}")),
    };

    let mut _bnd_addr = vec![0u8; addr_len];
    upstream
        .read_exact(&mut _bnd_addr)
        .await
        .map_err(|_| "failed to read BND.ADDR".to_string())?;

    let mut _bnd_port = [0u8; 2];
    upstream
        .read_exact(&mut _bnd_port)
        .await
        .map_err(|_| "failed to read BND.PORT".to_string())?;

    Ok(())
}

// ─── Upstream Tunnel (HTTP CONNECT) ────────────────────────────────────────

/// Connect through an upstream HTTP proxy to the given target via CONNECT.
async fn tunnel_via_http(
    upstream: &mut TcpStream,
    target_addr: &str,
    target_port: u16,
    username: &Option<String>,
    password: &Option<String>,
) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose};

    let auth_header = match (username.as_deref(), password.as_deref()) {
        (Some(u), Some(p)) if !u.is_empty() => {
            let auth = general_purpose::STANDARD.encode(format!("{u}:{p}"));
            format!("Proxy-Authorization: Basic {auth}\r\n")
        }
        _ => String::new(),
    };

    let connect_req = format!(
        "CONNECT {target_addr}:{target_port} HTTP/1.1\r\n\
         Host: {target_addr}:{target_port}\r\n\
         {auth_header}\r\n"
    );

    timeout(Duration::from_secs(CONNECTION_TIMEOUT_SECS), async {
        upstream
            .write_all(connect_req.as_bytes())
            .await
            .map_err(|e| format!("HTTP CONNECT write to upstream: {e}"))?;

        // Read the response status line + headers.
        let mut buf = [0u8; 4096];
        let mut total = 0usize;

        loop {
            let n = upstream
                .read(&mut buf[total..])
                .await
                .map_err(|e| format!("HTTP CONNECT read from upstream: {e}"))?;
            if n == 0 {
                return Err("upstream closed connection during HTTP CONNECT".to_string());
            }
            total += n;
            if total >= 4 && buf[total - 4..total] == [b'\r', b'\n', b'\r', b'\n'] {
                break;
            }
            if total >= buf.len() {
                return Err("upstream HTTP CONNECT response too large".to_string());
            }
        }

        let resp = String::from_utf8_lossy(&buf[..total]);
        let status_line = resp.lines().next().unwrap_or("");
        if !status_line.contains("200") {
            let msg = resp
                .lines()
                .next()
                .unwrap_or("unknown response")
                .to_string();
            return Err(format!("upstream HTTP CONNECT failed: {msg}"));
        }

        Ok::<_, String>(())
    })
    .await
    .map_err(|_| "upstream HTTP CONNECT timed out".to_string())?
}

// ─── IP Blocking Helpers ────────────────────────────────────────────────────

/// Check whether the connecting *client* IP is banned from using this proxy.
/// Supports exact IP addresses and CIDR notation.
fn is_client_blocked(client_ip: &std::net::IpAddr, blocked_ips: &[String]) -> bool {
    if blocked_ips.is_empty() {
        return false;
    }

    for entry in blocked_ips {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }

        // CIDR notation: "192.168.1.0/24"
        if let Some(slash_pos) = entry.find('/') {
            let base = &entry[..slash_pos];
            let bits_str = &entry[slash_pos + 1..];
            if let (Ok(base_ip), Ok(bits)) = (std::net::IpAddr::from_str(base), bits_str.parse::<u8>()) {
                if cidr_matches(*client_ip, base_ip, bits) {
                    return true;
                }
            }
        }
        // Exact IP match
        else if let Ok(block_ip) = std::net::IpAddr::from_str(entry) {
            if *client_ip == block_ip {
                return true;
            }
        }
    }

    false
}

/// Check whether the target (IP or hostname) is in the blocked list.
/// Supports exact IP addresses and CIDR notation (e.g. "10.0.0.0/8", "192.168.0.0/16").
/// Hostnames that are not valid IPs are NOT blocked — only literal IP addresses are checked.
fn is_target_blocked(target_addr: &str, _port: u16, blocked_ips: &[String]) -> bool {
    if blocked_ips.is_empty() {
        return false;
    }

    // Try to parse the target as an IP address.
    let target_ip = match IpAddr::from_str(target_addr) {
        Ok(ip) => ip,
        Err(_) => return false, // hostname — cannot block by name, only by IP
    };

    for entry in blocked_ips {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }

        // Try CIDR notation: "192.168.0.0/16"
        if let Some(slash_pos) = entry.find('/') {
            let base = &entry[..slash_pos];
            let bits_str = &entry[slash_pos + 1..];
            if let (Ok(base_ip), Ok(bits)) = (IpAddr::from_str(base), bits_str.parse::<u8>()) {
                if cidr_matches(target_ip, base_ip, bits) {
                    return true;
                }
            }
        }
        // Exact IP match
        else if let Ok(block_ip) = IpAddr::from_str(entry) {
            if target_ip == block_ip {
                return true;
            }
        }
    }

    false
}

/// Check if `ip` falls within the CIDR range defined by `base` + `prefix_len`.
fn cidr_matches(ip: IpAddr, base: IpAddr, prefix_len: u8) -> bool {
    match (ip, base) {
        (IpAddr::V4(ip), IpAddr::V4(base)) => {
            let bits = if prefix_len > 32 { 32 } else { prefix_len };
            if bits == 0 {
                return true; // /0 matches everything
            }
            let mask = !0u32 << (32 - bits);
            (u32::from(ip) & mask) == (u32::from(base) & mask)
        }
        (IpAddr::V6(ip), IpAddr::V6(base)) => {
            let bits = if prefix_len > 128 { 128 } else { prefix_len };
            if bits == 0 {
                return true;
            }
            let (ip_a, ip_b) = (u128::from(ip), u128::from(base));
            let mask = !0u128 << (128 - bits);
            (ip_a & mask) == (ip_b & mask)
        }
        _ => false, // version mismatch
    }
}

/// Send a SOCKS5 failure response with the given error code.
async fn socks5_send_failure(client: &mut TcpStream, rep: u8) -> Result<(), String> {
    let response = [
        SOCKS5_VERSION,
        rep,
        0x00,
        SOCKS5_ATYP_IPV4,
        0, 0, 0, 0,
        0, 0,
    ];
    client
        .write_all(&response)
        .await
        .map_err(|e| format!("failed to send SOCKS5 failure: {e}"))
}

/// Send an HTTP 403 Forbidden response.
async fn http_send_403(client: &mut TcpStream) -> Result<(), String> {
    let resp = "HTTP/1.1 403 Forbidden\r\n\r\n";
    client
        .write_all(resp.as_bytes())
        .await
        .map_err(|e| format!("failed to send HTTP 403: {e}"))
}

// ─── Bidirectional Relay ───────────────────────────────────────────────────

/// Relay data in both directions until one side closes.
/// Returns (bytes_to_upstream, bytes_from_upstream) — i.e. (upload, download).
async fn relay_data(
    client: &mut TcpStream,
    upstream: &mut TcpStream,
) -> Result<(u64, u64), String> {
    tokio::io::copy_bidirectional(client, upstream)
        .await
        .map_err(|e| format!("relay error: {e}"))
}
