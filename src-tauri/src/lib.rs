mod config;
mod mtr;

use chrono::Local;
use serde::Serialize;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::io;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri::Manager;
use std::net::Ipv4Addr;
use std::str::FromStr;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Semaphore;
use tokio::time::timeout;
use sysinfo::System;
#[cfg(target_os = "linux")]
use std::process::Command;
#[cfg(windows)]
use winreg::{enums::*, RegKey};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

use config::{AppConfig, ProxyEntry, ScanPreferences};

// ─── Original Logic (Unchanged) ───────────────────────────────────────────────

// fn tcp_ping(addr: &str, timeout_ms: u64) -> Result<u128, String> {
//     let sock = addr
//         .to_socket_addrs()
//         .map_err(|e| format!("DNS analysis fail: {e}"))?
//         .next()
//         .ok_or_else(|| "Fail to analysis host".to_string())?;
//     let start = Instant::now();
//     TcpStream::connect_timeout(&sock, Duration::from_millis(timeout_ms)).map_err(|e| {
//         if e.kind() == std::io::ErrorKind::TimedOut {
//             "connection time out".into()
//         } else {
//             format!("{e}")
//         }
//     })?;
//     Ok(start.elapsed().as_micros())
// }


fn set_windows_proxy(proxy_addr: &str, proxy_port: &str, enable: bool, protocol: &str) -> io::Result<()> {
    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let cur_ver = hkcu.open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_SET_VALUE,
        )?;

        let enable_value: u32 = if enable { 1 } else { 0 };
        cur_ver.set_value("ProxyEnable", &enable_value)?;

        if enable {
            let full_proxy_addr = match protocol.to_uppercase().as_str() {
                "SOCKS5" | "SOCKS" => format!("socks={}:{}", proxy_addr, proxy_port),
                _ => format!("{}:{}", proxy_addr, proxy_port), // 默认为 HTTP
            };
            
            cur_ver.set_value("ProxyServer", &full_proxy_addr)?;
        }
    }
    
    Ok(())
}

#[cfg(target_os = "linux")]
fn set_linux_proxy(protocol: &str, address: &str, port: u16) {
    let proxy_url = format!("{}:{}", address, port);

    // 1. 针对 GNOME 桌面环境 (常见于 Ubuntu, Debian, Fedora 等)
    // 使用 gsettings 修改系统级代理设置
    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy", "mode", "manual"])
        .status();

    match protocol.to_lowercase().as_str() {
        "http" | "https" => {
            let _ = Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.http", "host", address])
                .status();
            let _ = Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.http", "port", &port.to_string()])
                .status();
            // 通常同步设置 https 以确保大部分流量走代理
            let _ = Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.https", "host", address])
                .status();
            let _ = Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.https", "port", &port.to_string()])
                .status();
        }
        "socks" => {
            let _ = Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.socks", "host", address])
                .status();
            let _ = Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.socks", "port", &port.to_string()])
                .status();
        }
        _ => {}
    }

    // 2. 设置当前进程的环境变量 (对当前 Tauri 应用发起的网络请求生效)
    let env_protocol = if protocol.to_lowercase() == "socks" { "socks5" } else { "http" };
    let full_proxy = format!("{}://{}", env_protocol, proxy_url);
    
    std::env::set_var("http_proxy", &full_proxy);
    std::env::set_var("https_proxy", &full_proxy);
    std::env::set_var("all_proxy", &full_proxy);
    std::env::set_var("HTTP_PROXY", &full_proxy);
    std::env::set_var("HTTPS_PROXY", &full_proxy);
    std::env::set_var("ALL_PROXY", &full_proxy);
}

// ─── App State ────────────────────────────────────────────────────────────────

pub struct AppState {
    stop_flag: Arc<AtomicBool>,
    scan_stop_flag: Arc<AtomicBool>,
    mtr_stop_flag: Arc<AtomicBool>,
    config: Arc<Mutex<AppConfig>>,
}

// ─── Event Payloads ───────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct PingResultPayload {
    seq: u32,
    ms: Option<u128>,
    error: Option<String>,
    request_id: Option<String>,
}

#[derive(Clone, Serialize)]
struct PingDonePayload {
    request_id: Option<String>,
}

#[derive(Clone, Serialize)]
struct PingStoppedPayload {
    request_id: Option<String>,
}

#[derive(Clone, Serialize)]
struct ScanResultPayload {
    ip: String,
    port: u16,
    protocol: String,
    latency_ms: u64,
}

#[derive(Clone, Serialize)]
struct ScanProgressPayload {
    scanned: u64,
    total: u64,
    found: u64,
}

#[derive(Serialize)]
struct ProxyStatus {
    is_active: bool,
    host: String,
    port: String,
    protocol: String,
    username: Option<String>,
    password: Option<String>,
}

#[derive(Serialize)]
pub struct MemoryInfo {
    used_mb: u64,
    total_gb: f64,
    percent: f64,
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// 代理协议级探测逻辑 (真正判断是否为代理)
async fn verify_proxy_handshake(
    addr: &str, 
    protocol: &str, 
    timeout_ms: u64,
    username: Option<String>,
    password: Option<String>,
) -> Result<u128, String> {
    let timeout_duration = Duration::from_millis(timeout_ms);
    let start = Instant::now();

    match protocol.to_uppercase().as_str() {
        "SOCKS5" | "SOCKS" => {
            let mut stream = timeout(timeout_duration, tokio::net::TcpStream::connect(addr))
                .await
                .map_err(|_| "Connection timed out".to_string())?
                .map_err(|e| format!("Connection failed: {e}"))?;

            // SOCKS5 握手: [版本号, 方法数, 无认证方法, 用户名密码方法]
            let socks5_greeting = [0x05, 0x02, 0x00, 0x02];
            stream.write_all(&socks5_greeting).await.map_err(|e| format!("Write failed: {e}"))?;

            let mut buf = [0u8; 2];
            timeout(timeout_duration, stream.read_exact(&mut buf))
                .await
                .map_err(|_| "Handshake read timed out".to_string())?
                .map_err(|e| format!("Read failed: {e}"))?;

            if buf[0] != 0x05 {
                return Err("Handshake failed: Target is not a SOCKS5 proxy".into());
            }

            match buf[1] {
                0x00 => { // 无需认证
                    Ok(start.elapsed().as_micros())
                }
                0x02 => { // 用户名密码认证
                    let user = username.unwrap_or_default();
                    let pass = password.unwrap_or_default();
                    
                    let mut auth_req = Vec::new();
                    auth_req.push(0x01); // Subnegotiation version
                    auth_req.push(user.len() as u8);
                    auth_req.extend_from_slice(user.as_bytes());
                    auth_req.push(pass.len() as u8);
                    auth_req.extend_from_slice(pass.as_bytes());
                    
                    stream.write_all(&auth_req).await.map_err(|e| format!("Auth write failed: {e}"))?;
                    
                    let mut auth_res = [0u8; 2];
                    timeout(timeout_duration, stream.read_exact(&mut auth_res))
                        .await
                        .map_err(|_| "Auth read timed out".to_string())?
                        .map_err(|e| format!("Auth read failed: {e}"))?;
                    
                    if auth_res[1] == 0x00 {
                        Ok(start.elapsed().as_micros())
                    } else {
                        Err("SOCKS5 Authentication failed".into())
                    }
                }
                0xFF => Err("SOCKS5: No acceptable authentication methods".into()),
                _ => Err(format!("SOCKS5: Unsupported auth method 0x{:02X}", buf[1])),
            }
        }
        _ => { // 默认为 HTTP
            let mut stream = timeout(timeout_duration, tokio::net::TcpStream::connect(addr))
                .await
                .map_err(|_| "Connection timed out".to_string())?
                .map_err(|e| format!("Connection failed: {e}"))?;

            // HTTP 探测: 发送一个 CONNECT 请求
            let mut request = format!("CONNECT 1.1.1.1:80 HTTP/1.1\r\nHost: 1.1.1.1:80\r\n");
            
            if let (Some(u), Some(p)) = (username, password) {
                if !u.is_empty() {
                    use base64::{Engine as _, engine::general_purpose};
                    let auth = format!("{}:{}", u, p);
                    let encoded = general_purpose::STANDARD.encode(auth);
                    request.push_str(&format!("Proxy-Authorization: Basic {}\r\n", encoded));
                }
            }
            request.push_str("\r\n");
            
            stream.write_all(request.as_bytes()).await.map_err(|e| format!("Write failed: {e}"))?;

            let mut buf = [0u8; 1024];
            let n = timeout(timeout_duration, stream.read(&mut buf))
                .await
                .map_err(|_| "Handshake read timed out".to_string())?
                .map_err(|e| format!("Read failed: {e}"))?;

            if n >= 12 {
                let response = &buf[..n];
                let response_str = String::from_utf8_lossy(response);
                
                if response.starts_with(b"HTTP/1.1 200") || response.starts_with(b"HTTP/1.0 200") {
                    let lower_resp = response_str.to_lowercase();
                    if lower_resp.contains("connection established") || lower_resp.contains("proxy-connection") {
                        return Ok(start.elapsed().as_micros());
                    }
                } else if response.starts_with(b"HTTP/1.1 407") || response.starts_with(b"HTTP/1.0 407") {
                    return Err("Proxy Authentication Required (407)".into());
                } else if response.starts_with(b"HTTP/1.1 401") || response.starts_with(b"HTTP/1.0 401") {
                    return Err("Unauthorized (401)".into());
                }
            }
            Err("Handshake failed: Target is not an HTTP proxy or verification failed".into())
        }
    }
}

#[tauri::command]
async fn start_ping_test(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    host: String,
    port: u16,
    protocol: String,
    count: u32,
    timeout_ms: u64,
    interval_ms: u64,
    username: Option<String>,
    password: Option<String>,
    request_id: Option<String>,
) -> Result<(), String> {
    state.stop_flag.store(false, Ordering::SeqCst);
    let stop_flag = Arc::clone(&state.stop_flag);

    tokio::spawn(async move {
        for i in 1..=count {
            if stop_flag.load(Ordering::SeqCst) {
                let _ = app.emit("ping-stopped", PingStoppedPayload {
                    request_id: request_id.clone(),
                });
                return;
            }

            let addr = format!("{}:{}", host, port);
            let result = verify_proxy_handshake(&addr, &protocol, timeout_ms, username.clone(), password.clone()).await;

            let payload = match result {
                Ok(ms) => PingResultPayload {
                    seq: i,
                    ms: Some(ms),
                    error: None,
                    request_id: request_id.clone(),
                },
                Err(e) => PingResultPayload {
                    seq: i,
                    ms: None,
                    error: Some(e),
                    request_id: request_id.clone(),
                },
            };
            let _ = app.emit("ping-result", payload);

            if i < count {
                let steps = (interval_ms / 50).max(1);
                for _ in 0..steps {
                    if stop_flag.load(Ordering::SeqCst) {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
            }
        }
        let _ = app.emit("ping-done", PingDonePayload {
            request_id: request_id.clone(),
        });
    });

    Ok(())
}

#[tauri::command]
fn stop_ping_test(state: tauri::State<'_, AppState>) {
    state.stop_flag.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn is_admin() -> bool {
    #[cfg(windows)]
    {
        use std::process::Command;
        // On Windows, 'net session' returns 0 if admin, non-zero if not.
        let output = Command::new("net")
            .arg("session")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        
        return match output {
            Ok(status) => status.success(),
            Err(_) => false,
        };
    }
    #[cfg(not(windows))]
    false
}

#[tauri::command]
fn config_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    host: String, 
    port: String, 
    protocol: String, 
    username: Option<String>, 
    password: Option<String>
) -> Result<String, String> {
    if host.trim().is_empty() {
        let ts = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        return Err(format!("[{}] [ERROR] Address must be filled", ts));
    }
    if port.trim().is_empty() {
        let ts = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        return Err(format!("[{}] [ERROR] Invalid port", ts));
    }
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    #[cfg(windows)]
    {
        set_windows_proxy(host.trim(), port.trim(), true, &protocol)
            .map(|_| {
                let mut cfg = state.config.lock().unwrap();
                let entry = ProxyEntry {
                    ip: host.trim().to_string(),
                    port: port.trim().parse().unwrap_or(0),
                    protocol: protocol.clone(),
                    added_at: timestamp.clone(),
                    latency_ms: 0,
                    last_tested: None,
                    username: username.clone(),
                    password: password.clone(),
                };
                cfg.recent_configs.retain(|p| p.ip != entry.ip || p.port != entry.port);
                cfg.recent_configs.insert(0, entry);
                if cfg.recent_configs.len() > 5 { cfg.recent_configs.truncate(5); }
                let _ = config::save_config(&app, &cfg);

                format!(
                    "[{}] [INFO] System proxy configured [{}] {}:{}",
                    timestamp,
                    protocol,
                    host.trim(),
                    port.trim()
                )
            })
            .map_err(|e| {
                if is_permission_denied(&e) {
                     format!("[{}] [ERROR] PERMISSION_DENIED: Registry access restricted. Please run as Administrator.", timestamp)
                } else {
                     format!("[{}] [ERROR] System proxy configuration failed: {}", timestamp, e)
                }
            })
    }

    #[cfg(target_os = "linux")]
    {
        let port_u16: u16 = port.trim().parse().map_err(|_| format!("[{}] [ERROR] Invalid port", timestamp))?;
        set_linux_proxy(&protocol, host.trim(), port_u16);
        let res = format!("[{}] [INFO] System proxy configured [{}] {}:{}", timestamp, protocol, host.trim(), port.trim());
        
        let mut cfg = state.config.lock().unwrap();
        let entry = ProxyEntry {
            ip: host.trim().to_string(),
            port: port_u16,
            protocol: protocol.clone(),
            added_at: timestamp.clone(),
            latency_ms: 0,
            last_tested: None,
            username: username.clone(),
            password: password.clone(),
        };
        cfg.recent_configs.retain(|p| p.ip != entry.ip || p.port != entry.port);
        cfg.recent_configs.insert(0, entry);
        if cfg.recent_configs.len() > 5 { cfg.recent_configs.truncate(5); }
        let _ = config::save_config(&app, &cfg);
        
        return Ok(res);
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    Err(format!("[{}] [ERROR] Unsupported platform", timestamp))
}

#[cfg(windows)]
fn is_permission_denied(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::PermissionDenied || e.raw_os_error() == Some(5)
}

// ─── Proxy Scan ───────────────────────────────────────────────────────────────

/// Phase 1: 快速 SYN 探测 — 仅做 TCP connect，判断端口是否开放
async fn syn_probe(ip: Ipv4Addr, port: u16, timeout_ms: u64) -> bool {
    let addr = format!("{}:{}", ip, port);
    timeout(
        Duration::from_millis(timeout_ms),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    .map(|r| r.is_ok())
    .unwrap_or(false)
}

/// Phase 2: 探测代理协议的具体逻辑 (async, 使用 tokio::net::TcpStream)
async fn check_proxy(ip: Ipv4Addr, port: u16, verify_timeout_ms: u64) -> Option<(&'static str, u64)> {
    let addr = format!("{}:{}", ip, port);
    let timeout_duration = Duration::from_millis(verify_timeout_ms);

    // 尝试探测 SOCKS5 — 同时声明支持 无认证(0x00) 和 用户名密码认证(0x02)
    let start = Instant::now();
    if let Ok(Ok(mut stream)) = timeout(timeout_duration, tokio::net::TcpStream::connect(&addr)).await {
        // 声明两种方法: 0x00=无需认证, 0x02=用户名密码认证
        let socks5_greeting = [0x05, 0x02, 0x00, 0x02];
        if stream.write_all(&socks5_greeting).await.is_ok() {
            let mut buf = [0u8; 2];
            if let Ok(Ok(2)) = timeout(timeout_duration, stream.read_exact(&mut buf)).await {
                if buf[0] == 0x05 {
                    let latency = start.elapsed().as_millis() as u64;
                    return match buf[1] {
                        0x00 => Some(("SOCKS5", latency)),       // 无需认证
                        0x02 => Some(("SOCKS5 (Auth)", latency)), // 需要用户名密码
                        _    => Some(("SOCKS5", latency)),        // 其他方法视为正常
                    };
                }
            }
        }
    }

    // 重新连接探测 HTTP 代理
    // 任何对 CONNECT 请求返回 200 的服务器，都极可能是 HTTP 代理
    // （普通 Web 服务器对 CONNECT 会返回 405/400/501，不会返回 200）
    let start = Instant::now();
    if let Ok(Ok(mut stream)) = timeout(timeout_duration, tokio::net::TcpStream::connect(&addr)).await {
        let http_connect = b"CONNECT 1.1.1.1:80 HTTP/1.1\r\nHost: 1.1.1.1:80\r\n\r\n";
        if stream.write_all(http_connect).await.is_ok() {
            let mut buf = [0u8; 1024];
            if let Ok(Ok(n)) = timeout(timeout_duration, stream.read(&mut buf)).await {
                if n >= 12 {
                    let response = &buf[..n];
                    let lower_resp = String::from_utf8_lossy(response).to_lowercase();

                    let is_200 = response.starts_with(b"HTTP/1.1 200")
                        || response.starts_with(b"HTTP/1.0 200");
                    let is_407 = response.starts_with(b"HTTP/1.1 407")
                        || response.starts_with(b"HTTP/1.0 407");
                    // 排除普通 Web 服务器：它们会带 HTML 内容
                    let is_html = lower_resp.contains("<html")
                        || lower_resp.contains("content-type: text/html");

                    if is_200 && !is_html {
                        let latency = start.elapsed().as_millis() as u64;
                        return Some(("HTTP", latency));
                    } else if is_407 {
                        let latency = start.elapsed().as_millis() as u64;
                        return Some(("HTTP (Auth)", latency));
                    }
                }
            }
        }
    }

    None
}

// ─── 新增事件 payload ─────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct ScanPortOpenPayload {
    open_count: u64,
}

#[tauri::command]
async fn start_proxy_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    network: String,
    mask: String,
    start_port: u16,
    end_port: u16,
    concurrent: usize,
    syn_timeout_ms: u64,
    verify_concurrent: usize,
) -> Result<(), String> {
    let start_ip = Ipv4Addr::from_str(&network).map_err(|_| "无效的网络段格式".to_string())?;
    let mask_ip = Ipv4Addr::from_str(&mask).map_err(|_| "无效的子网掩码格式".to_string())?;

    state.scan_stop_flag.store(false, Ordering::SeqCst);
    let stop_flag = Arc::clone(&state.scan_stop_flag);

    let start_u32 = u32::from(start_ip);
    let mask_u32 = u32::from(mask_ip);

    let network_id = start_u32 & mask_u32;
    let broadcast_id = network_id | !mask_u32;

    // 计算总任务数用于进度追踪
    let ip_count = (broadcast_id - network_id).saturating_sub(1) as u64;
    let port_count = (end_port as u64).saturating_sub(start_port as u64) + 1;
    let total_tasks = ip_count * port_count;

    // 协议验证超时（保持原来的 1500ms）
    let verify_timeout_ms: u64 = 1500;

    tokio::spawn(async move {
        // ── Channel: Phase 1 → Phase 2 ──────────────────────────────────────
        let (tx, mut rx) = tokio::sync::mpsc::channel::<(Ipv4Addr, u16)>(4096);

        // 共享计数器
        let scanned_count = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let found_count = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let open_count = Arc::new(std::sync::atomic::AtomicU64::new(0));

        // ── Phase 1: SYN 探测 (高并发) ──────────────────────────────────────
        let phase1_stop = stop_flag.clone();
        let phase1_app = app.clone();
        let phase1_scanned = scanned_count.clone();
        let phase1_found = found_count.clone();
        let phase1_open = open_count.clone();

        let phase1_handle = tokio::spawn(async move {
            let semaphore = Arc::new(Semaphore::new(concurrent));
            let mut tasks = Vec::new();

            for ip_u32 in (network_id + 1)..broadcast_id {
                if phase1_stop.load(Ordering::SeqCst) {
                    break;
                }

                let ip = Ipv4Addr::from(ip_u32);

                for port in start_port..=end_port {
                    if phase1_stop.load(Ordering::SeqCst) {
                        break;
                    }

                    let permit = semaphore.clone().acquire_owned().await.unwrap();
                    let tx = tx.clone();
                    let stop = phase1_stop.clone();
                    let app_c = phase1_app.clone();
                    let scanned = phase1_scanned.clone();
                    let found = phase1_found.clone();
                    let open = phase1_open.clone();

                    let task = tokio::spawn(async move {
                        if stop.load(Ordering::SeqCst) {
                            drop(permit);
                            return;
                        }

                        // SYN 快速探测
                        if syn_probe(ip, port, syn_timeout_ms).await {
                            let current_open = open.fetch_add(1, Ordering::Relaxed) + 1;
                            let _ = app_c.emit("scan-port-open", ScanPortOpenPayload {
                                open_count: current_open,
                            });
                            // 发送到 Phase 2
                            let _ = tx.send((ip, port)).await;
                        }

                        let current = scanned.fetch_add(1, Ordering::Relaxed) + 1;
                        // 每扫描 50 个发送一次进度更新（减少事件频率，提升性能）
                        if current % 50 == 0 || current == total_tasks {
                            let progress = ScanProgressPayload {
                                scanned: current,
                                total: total_tasks,
                                found: found.load(Ordering::Relaxed),
                            };
                            let _ = app_c.emit("scan-progress", progress);
                        }

                        drop(permit);
                    });
                    tasks.push(task);
                }
            }

            // 等待所有 Phase 1 任务完成
            for task in tasks {
                let _ = task.await;
            }
            // tx 离开作用域后 channel 关闭，Phase 2 会退出
            drop(tx);
        });

        // ── Phase 2: 协议验证 (低并发，流水线并行) ──────────────────────────
        let phase2_stop = stop_flag.clone();
        let phase2_app = app.clone();
        let phase2_found = found_count.clone();

        let phase2_handle = tokio::spawn(async move {
            let semaphore = Arc::new(Semaphore::new(verify_concurrent));
            let mut tasks = Vec::new();

            while let Some((ip, port)) = rx.recv().await {
                if phase2_stop.load(Ordering::SeqCst) {
                    break;
                }

                let permit = semaphore.clone().acquire_owned().await.unwrap();
                let stop = phase2_stop.clone();
                let app_c = phase2_app.clone();
                let found = phase2_found.clone();

                let task = tokio::spawn(async move {
                    if stop.load(Ordering::SeqCst) {
                        drop(permit);
                        return;
                    }

                    if let Some((protocol, latency_ms)) = check_proxy(ip, port, verify_timeout_ms).await {
                        found.fetch_add(1, Ordering::Relaxed);
                        let payload = ScanResultPayload {
                            ip: ip.to_string(),
                            port,
                            protocol: protocol.to_string(),
                            latency_ms,
                        };
                        let _ = app_c.emit("scan-found", payload);
                    }

                    drop(permit);
                });
                tasks.push(task);
            }

            // 等待所有 Phase 2 任务完成
            for task in tasks {
                let _ = task.await;
            }
        });

        // 等待两阶段都完成
        let _ = phase1_handle.await;
        let _ = phase2_handle.await;

        // 发送最终进度和完成事件
        let final_progress = ScanProgressPayload {
            scanned: scanned_count.load(Ordering::Relaxed),
            total: total_tasks,
            found: found_count.load(Ordering::Relaxed),
        };
        let _ = app.emit("scan-progress", final_progress);
        let _ = app.emit("scan-done", ());
    });

    Ok(())
}

#[tauri::command]
fn stop_proxy_scan(state: tauri::State<'_, AppState>) {
    state.scan_stop_flag.store(true, Ordering::SeqCst);
}

// ─── Config Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_config(state: tauri::State<'_, AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn clear_recent_configs(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.recent_configs.clear();
    config::save_config(&app, &cfg)
}

#[tauri::command]
fn add_test_history(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    entry: ProxyEntry,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    // Dedup and keep latest 5
    cfg.recent_tests.retain(|p| p.ip != entry.ip || p.port != entry.port);
    cfg.recent_tests.insert(0, entry);
    if cfg.recent_tests.len() > 5 {
        cfg.recent_tests.truncate(5);
    }
    config::save_config(&app, &cfg)
}

#[tauri::command]
fn clear_test_configs(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.recent_tests.clear();
    config::save_config(&app, &cfg)
}

#[tauri::command]
fn save_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    entry: ProxyEntry,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    // 去重：相同 ip+port 则更新
    if let Some(existing) = cfg.proxies.iter_mut().find(|p| p.ip == entry.ip && p.port == entry.port) {
        *existing = entry;
    } else {
        cfg.proxies.push(entry);
    }
    config::save_config(&app, &cfg)
}

#[tauri::command]
fn remove_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    ip: String,
    port: u16,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.proxies.retain(|p| !(p.ip == ip && p.port == port));
    config::save_config(&app, &cfg)
}

#[tauri::command]
fn clear_proxies(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.proxies.clear();
    config::save_config(&app, &cfg)
}

#[tauri::command]
fn update_scan_preferences(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    prefs: ScanPreferences,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.scan_preferences = prefs;
    config::save_config(&app, &cfg)
}

#[tauri::command]
fn add_scan_history(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    network: String,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    // 去重并保持最近 20 条
    cfg.scan_history.retain(|h| h != &network);
    cfg.scan_history.insert(0, network);
    cfg.scan_history.truncate(20);
    config::save_config(&app, &cfg)
}

// ─── MTR Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn start_mtr(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    host: String,
    max_hops: u8,
) -> Result<(), String> {
    state.mtr_stop_flag.store(false, Ordering::SeqCst);
    let stop_flag = Arc::clone(&state.mtr_stop_flag);
    let max_hops = if max_hops == 0 { 30 } else { max_hops };

    tokio::spawn(async move {
        // Phase 1: Discover route (blocking ICMP calls)
        let dest = match tokio::task::spawn_blocking({
            let h = host.clone();
            move || mtr::resolve_ipv4(&h)
        }).await {
            Ok(Ok(ip)) => ip,
            Ok(Err(e)) => { let _ = app.emit("mtr-error", e); return; }
            Err(e) => { let _ = app.emit("mtr-error", format!("{}", e)); return; }
        };

        let route = match tokio::task::spawn_blocking({
            let d = dest;
            move || mtr::discover_route(d, max_hops, 2000)
        }).await {
            Ok(Ok(r)) => r,
            Ok(Err(e)) => { let _ = app.emit("mtr-error", e); return; }
            Err(e) => { let _ = app.emit("mtr-error", format!("{}", e)); return; }
        };

        if route.is_empty() {
            let _ = app.emit("mtr-error", "No route discovered".to_string());
            return;
        }

        // Phase 2: Continuous ping loop
        let mut stats: Vec<mtr::HopStats> = route.iter().map(|_| mtr::HopStats::new()).collect();
        let mut round = 0u32;

        while !stop_flag.load(Ordering::SeqCst) {
            round += 1;

            // Ping all hops in parallel via spawn_blocking
            let mut handles = Vec::new();
            for (i, (_hop, ip)) in route.iter().enumerate() {
                if ip.is_unspecified() {
                    handles.push((i, None));
                    continue;
                }
                let ip_copy = *ip;
                let jh = tokio::task::spawn_blocking(move || mtr::ping_ip(ip_copy, 2000));
                handles.push((i, Some(jh)));
            }

            for (i, jh_opt) in handles {
                if let Some(jh) = jh_opt {
                    let result = jh.await.unwrap_or(None);
                    stats[i].update(result);
                } else {
                    stats[i].update(None);
                }
            }

            // Build payload
            let hops: Vec<mtr::MtrHop> = route.iter().enumerate().map(|(i, (hop, ip))| {
                let s = &stats[i];
                mtr::MtrHop {
                    hop: *hop,
                    ip: if ip.is_unspecified() { "*".into() } else { ip.to_string() },
                    loss_pct: s.loss_pct(),
                    sent: s.sent,
                    recv: s.recv,
                    last: s.last,
                    avg: s.avg(),
                    best: if s.best == f64::MAX { 0.0 } else { s.best },
                    worst: s.worst,
                    history: s.history.clone(),
                }
            }).collect();

            let _ = app.emit("mtr-update", mtr::MtrUpdatePayload { hops, round });

            // Wait 1s between rounds
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        let _ = app.emit("mtr-stopped", ());
    });

    Ok(())
}

#[tauri::command]
fn stop_mtr(state: tauri::State<'_, AppState>) {
    state.mtr_stop_flag.store(true, Ordering::SeqCst);
}

#[tauri::command]
async fn run_traceroute(host: String, max_hops: u8) -> Result<Vec<mtr::RouteHopPayload>, String> {
    let max_hops = if max_hops == 0 { 30 } else { max_hops };
    let dest = tokio::task::spawn_blocking({
        let h = host.clone();
        move || mtr::resolve_ipv4(&h)
    }).await.map_err(|e| format!("{}", e))??;

    let route = tokio::task::spawn_blocking({
        let d = dest;
        move || mtr::discover_route(d, max_hops, 2000)
    }).await.map_err(|e| format!("{}", e))??;

    let total = route.len();
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let hops: Vec<mtr::RouteHopPayload> = route.into_iter().enumerate().map(|(i, (hop, ip))| {
        let node_type = if i == 0 { "Gateway" }
            else if i == total - 1 { "Target" }
            else { "Transit" };
        mtr::RouteHopPayload {
            hop,
            ip: if ip.is_unspecified() { "*".into() } else { ip.to_string() },
            rtt_ms: 0.0,
            node_type: node_type.to_string(),
            network: "—".to_string(),
            timestamp: timestamp.clone(),
        }
    }).collect();

    Ok(hops)
}

// ─── Window Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn win_minimize(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn win_toggle_maximize(window: tauri::Window) {
    if let Ok(is_maximized) = window.is_maximized() {
        if is_maximized {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn win_close(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
fn win_start_drag(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn win_is_maximized(window: tauri::Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
async fn get_proxy_status() -> Result<ProxyStatus, String> {
    #[cfg(windows)]
    {
        use winreg::{enums::*, RegKey};
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let cur_ver = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
            .map_err(|e| e.to_string())?;

        let enabled: u32 = cur_ver.get_value("ProxyEnable").unwrap_or(0);
        let server: String = cur_ver.get_value("ProxyServer").unwrap_or_default();

        if enabled == 1 && !server.is_empty() {
            let mut protocol = "HTTP".to_string();
            let mut host_port = server.clone();

            if server.to_lowercase().starts_with("socks=") {
                protocol = "SOCKS5".to_string();
                host_port = server[6..].to_string();
            }

            let parts: Vec<&str> = host_port.split(':').collect();
            if parts.len() == 2 {
                return Ok(ProxyStatus {
                    is_active: true,
                    host: parts[0].to_string(),
                    port: parts[1].to_string(),
                    protocol,
                    username: None,
                    password: None,
                });
            }
        }
    }
    
    Ok(ProxyStatus {
        is_active: false,
        host: "".into(),
        port: "".into(),
        protocol: "HTTP".into(),
        username: None,
        password: None,
    })
}

#[tauri::command]
fn disconnect_proxy() -> Result<String, String> {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    #[cfg(windows)]
    {
        set_windows_proxy("", "", false, "HTTP")
            .map(|_| format!("[{}] [INFO] System proxy disconnected", timestamp))
            .map_err(|e| format!("[{}] [ERROR] Disconnect failed: {}", timestamp, e))
    }
    #[cfg(not(windows))]
    {
       Ok(format!("[{}] [INFO] System proxy disconnected (no-op on this platform)", timestamp))
    }
}

#[tauri::command]
async fn fetch_proxies_from_url(url: String) -> Result<Vec<ProxyEntry>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .danger_accept_invalid_certs(true) // Sometimes proxy APIs have cert issues
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let mut body = res.text().await.map_err(|e| e.to_string())?;

    // Try Base64 decode if it looks like one (no spaces/colons, just alphanumeric/=/+)
    if !body.contains(':') && body.len() > 10 {
         use base64::{Engine as _, engine::general_purpose};
         let body_clean = body.trim().replace("\r\n", "").replace("\n", "").replace(" ", "");
         if let Ok(decoded) = general_purpose::STANDARD.decode(body_clean) {
             if let Ok(s) = String::from_utf8(decoded) {
                 body = s;
             }
         }
    }

    // Heuristic: If it looks like HTML, it's likely an error page or anti-bot
    if body.to_lowercase().contains("<!doctype html") || body.to_lowercase().contains("<html") {
        return Err("The link returned an HTML page instead of a proxy list. This might be due to anti-bot protection or an error page.".to_string());
    }

    let mut entries = Vec::new();
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Regex for finding Host:Port pairs
    // Group 1: Host/IP, Group 2: Port
    use regex::Regex;
    let re = Regex::new(r"(?i)([a-z0-9.-]{4,}):(\d{2,5})").map_err(|e| e.to_string())?;

    for cap in re.captures_iter(&body) {
        let addr = cap[1].to_string();
        if let Ok(port) = cap[2].parse::<u16>() {
            // Basic sanity check: port range and host length
            if port > 0 && addr.len() > 3 {
                 entries.push(ProxyEntry {
                     ip: addr,
                     port,
                     protocol: "HTTP".to_string(),
                     added_at: timestamp.clone(),
                     latency_ms: 0,
                     last_tested: None,
                     username: None,
                     password: None,
                 });
            }
        }
    }

    if entries.is_empty() {
        return Err(format!("Successfully fetched content, but no valid proxies (Host:Port) were found. \nPreview: {}", 
            body.chars().take(100).collect::<String>()));
    }

    Ok(entries)
}

#[tauri::command]
fn shittim_mem_task() -> MemoryInfo {
    let mut sys = System::new_all();
    sys.refresh_memory();
    
    let total_bytes = sys.total_memory();
    let total_gb = total_bytes as f64 / 1024.0 / 1024.0 / 1024.0;
    
    let mut total_process_memory = 0;
    if let Ok(root_pid) = sysinfo::get_current_pid() {
        // Tauri is multi-process (Backend + WebView + GPU etc.)
        // We sum all processes that are the root or children of the root.
        for (pid, process) in sys.processes() {
            if *pid == root_pid {
                total_process_memory += process.memory();
            } else if let Some(parent_pid) = process.parent() {
                if parent_pid == root_pid {
                    total_process_memory += process.memory();
                }
            }
        }
    }

    let used_mb = total_process_memory / 1024 / 1024;
    let percent = (total_process_memory as f64 / total_bytes as f64) * 100.0;

    MemoryInfo {
        used_mb,
        total_gb: (total_gb * 10.0).round() / 10.0,
        percent: (percent * 10.0).round() / 10.0,
    }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let cfg = config::load_config(&app.handle());
            app.manage(AppState {
                stop_flag: Arc::new(AtomicBool::new(false)),
                scan_stop_flag: Arc::new(AtomicBool::new(false)),
                mtr_stop_flag: Arc::new(AtomicBool::new(false)),
                config: Arc::new(Mutex::new(cfg)),
            });

            // --- Tray Icon Setup ---
            let show_item = MenuItem::with_id(app, "show", "Open Main Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Application", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_proxies_from_url,
            start_ping_test,
            stop_ping_test,
            config_proxy,
            start_proxy_scan,
            stop_proxy_scan,
            get_config,
            clear_recent_configs,
            add_test_history,
            clear_test_configs,
            save_proxy,
            remove_proxy,
            clear_proxies,
            update_scan_preferences,
            add_scan_history,
            start_mtr,
            stop_mtr,
            run_traceroute,
            win_minimize,
            win_toggle_maximize,
            win_close,
            win_start_drag,
            win_is_maximized,
            get_proxy_status,
            disconnect_proxy,
            shittim_mem_task,
            is_admin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}