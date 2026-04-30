// ─── MTR (My Traceroute) Module ───────────────────────────────────────────────
//
// Windows: Direct FFI to iphlpapi.dll (IcmpSendEcho) — no admin required
// Linux:   Falls back to parsing `traceroute` / `ping` command output

use serde::Serialize;
use std::net::Ipv4Addr;

// ── Public Data Types ─────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Debug)]
pub struct MtrHop {
    pub hop: u8,
    pub ip: String,
    pub loss_pct: f64,
    pub sent: u32,
    pub recv: u32,
    pub last: f64,
    pub avg: f64,
    pub best: f64,
    pub worst: f64,
    pub history: Vec<f64>,
}

#[derive(Clone, Serialize)]
pub struct MtrUpdatePayload {
    pub hops: Vec<MtrHop>,
    pub round: u32,
}

#[derive(Clone, Serialize)]
pub struct RouteHopPayload {
    pub hop: u8,
    pub ip: String,
    pub rtt_ms: f64,
    pub node_type: String,
    pub network: String,
    pub timestamp: String,
}

// ── Hop Statistics Tracker ────────────────────────────────────────────────────

pub struct HopStats {
    pub sent: u32,
    pub recv: u32,
    pub last: f64,
    total: f64,
    pub best: f64,
    pub worst: f64,
    pub history: Vec<f64>,
}

impl HopStats {
    pub fn new() -> Self {
        Self {
            sent: 0,
            recv: 0,
            last: 0.0,
            total: 0.0,
            best: f64::MAX,
            worst: 0.0,
            history: Vec::with_capacity(20),
        }
    }

    pub fn update(&mut self, rtt: Option<u32>) {
        self.sent += 1;
        if let Some(ms) = rtt {
            let ms = ms as f64;
            self.recv += 1;
            self.last = ms;
            self.total += ms;
            if ms < self.best { self.best = ms; }
            if ms > self.worst { self.worst = ms; }
            self.history.push(ms);
        } else {
            self.history.push(-1.0);
        }
        if self.history.len() > 20 {
            self.history.remove(0);
        }
    }

    pub fn loss_pct(&self) -> f64 {
        if self.sent == 0 { 0.0 } else {
            ((self.sent - self.recv) as f64 / self.sent as f64) * 100.0
        }
    }

    pub fn avg(&self) -> f64 {
        if self.recv == 0 { 0.0 } else { self.total / self.recv as f64 }
    }
}

// ── DNS Helper ────────────────────────────────────────────────────────────────

pub fn resolve_ipv4(host: &str) -> Result<Ipv4Addr, String> {
    if let Ok(ip) = host.parse::<Ipv4Addr>() {
        return Ok(ip);
    }
    use std::net::ToSocketAddrs;
    let addr = format!("{}:0", host)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?
        .find(|a| a.is_ipv4())
        .ok_or_else(|| "No IPv4 address found".to_string())?;
    match addr.ip() {
        std::net::IpAddr::V4(v4) => Ok(v4),
        _ => Err("No IPv4 address".into()),
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Windows Implementation — IcmpSendEcho FFI
// ══════════════════════════════════════════════════════════════════════════════

#[cfg(windows)]
mod platform {
    use std::net::Ipv4Addr;
    use std::ptr;

    const INVALID_HANDLE_VALUE: isize = -1;
    pub const IP_SUCCESS: u32 = 0;
    pub const IP_TTL_EXPIRED_TRANSIT: u32 = 11013;
    #[allow(dead_code)]
    pub const IP_REQ_TIMED_OUT: u32 = 11010;

    #[repr(C)]
    #[allow(non_snake_case)]
    struct IP_OPTION_INFORMATION {
        Ttl: u8,
        Tos: u8,
        Flags: u8,
        OptionsSize: u8,
        OptionsData: *mut u8,
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct ICMP_ECHO_REPLY {
        Address: u32,
        Status: u32,
        RoundTripTime: u32,
        DataSize: u16,
        Reserved: u16,
        Data: *mut u8,
        Options: IP_OPTION_INFORMATION,
    }

    #[link(name = "iphlpapi")]
    unsafe extern "system" {
        fn IcmpCreateFile() -> isize;
        fn IcmpCloseHandle(handle: isize) -> i32;
        fn IcmpSendEcho(
            IcmpHandle: isize,
            DestinationAddress: u32,
            RequestData: *const u8,
            RequestSize: u16,
            RequestOptions: *const IP_OPTION_INFORMATION,
            ReplyBuffer: *mut u8,
            ReplySize: u32,
            Timeout: u32,
        ) -> u32;
    }

    struct IcmpHandle(isize);

    impl IcmpHandle {
        fn new() -> Result<Self, String> {
            let h = unsafe { IcmpCreateFile() };
            if h == INVALID_HANDLE_VALUE {
                Err("Failed to create ICMP handle".into())
            } else {
                Ok(Self(h))
            }
        }

        /// Send ICMP echo. Returns (responding_ip, rtt_ms, reached_destination)
        fn ping(&self, dest: Ipv4Addr, ttl: u8, timeout_ms: u32)
            -> Result<(Ipv4Addr, u32, bool), String>
        {
            let dest_addr = u32::from_ne_bytes(dest.octets());
            let send_data = b"MTRPROBE";

            let options = IP_OPTION_INFORMATION {
                Ttl: ttl,
                Tos: 0,
                Flags: 0,
                OptionsSize: 0,
                OptionsData: ptr::null_mut(),
            };

            let reply_size = std::mem::size_of::<ICMP_ECHO_REPLY>() + send_data.len() + 64;
            let mut reply_buf = vec![0u8; reply_size];

            let ret = unsafe {
                IcmpSendEcho(
                    self.0,
                    dest_addr,
                    send_data.as_ptr(),
                    send_data.len() as u16,
                    &options,
                    reply_buf.as_mut_ptr(),
                    reply_size as u32,
                    timeout_ms,
                )
            };

            if ret == 0 {
                return Err("timeout".into());
            }

            let reply = unsafe { &*(reply_buf.as_ptr() as *const ICMP_ECHO_REPLY) };
            let reply_ip = Ipv4Addr::from(reply.Address.to_ne_bytes());
            let rtt = reply.RoundTripTime;

            if reply.Status == IP_SUCCESS {
                Ok((reply_ip, rtt, true))
            } else if reply.Status == IP_TTL_EXPIRED_TRANSIT {
                Ok((reply_ip, rtt, false))
            } else {
                Err(format!("ICMP status {}", reply.Status))
            }
        }
    }

    impl Drop for IcmpHandle {
        fn drop(&mut self) {
            unsafe { IcmpCloseHandle(self.0); }
        }
    }

    // ── Public Platform API ───────────────────────────────────────────────

    pub fn discover_route(dest: Ipv4Addr, max_hops: u8, timeout_ms: u32)
        -> Result<Vec<(u8, Ipv4Addr)>, String>
    {
        let icmp = IcmpHandle::new()?;
        let mut hops = Vec::new();

        for ttl in 1..=max_hops {
            match icmp.ping(dest, ttl, timeout_ms) {
                Ok((ip, _rtt, reached)) => {
                    hops.push((ttl, ip));
                    if reached { break; }
                }
                Err(_) => {
                    hops.push((ttl, Ipv4Addr::UNSPECIFIED));
                }
            }
        }
        Ok(hops)
    }

    pub fn ping_ip(dest: Ipv4Addr, timeout_ms: u32) -> Option<u32> {
        let icmp = IcmpHandle::new().ok()?;
        match icmp.ping(dest, 128, timeout_ms) {
            Ok((_, rtt, _)) => Some(rtt),
            Err(_) => None,
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Linux Implementation — Command-line fallback
// ══════════════════════════════════════════════════════════════════════════════

#[cfg(not(windows))]
mod platform {
    use std::net::Ipv4Addr;
    use std::process::Command;

    pub fn discover_route(dest: Ipv4Addr, max_hops: u8, _timeout_ms: u32)
        -> Result<Vec<(u8, Ipv4Addr)>, String>
    {
        let output = Command::new("traceroute")
            .args(["-n", "-w", "2", "-q", "1", "-m", &max_hops.to_string(), &dest.to_string()])
            .output()
            .map_err(|e| format!("traceroute failed: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut hops = Vec::new();

        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let hop: u8 = parts[0].parse().unwrap_or(0);
                if hop == 0 { continue; }
                let ip = if parts[1] == "*" {
                    Ipv4Addr::UNSPECIFIED
                } else {
                    parts[1].parse().unwrap_or(Ipv4Addr::UNSPECIFIED)
                };
                hops.push((hop, ip));
            }
        }
        Ok(hops)
    }

    pub fn ping_ip(dest: Ipv4Addr, timeout_ms: u32) -> Option<u32> {
        let timeout_s = (timeout_ms as f64 / 1000.0).max(1.0);
        let output = Command::new("ping")
            .args(["-c", "1", "-W", &format!("{:.0}", timeout_s), &dest.to_string()])
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Some(pos) = line.find("time=") {
                let after = &line[pos + 5..];
                if let Some(end) = after.find(' ') {
                    return after[..end].parse::<f64>().ok().map(|v| v as u32);
                }
            }
        }
        None
    }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

pub use platform::{discover_route, ping_ip};
