use serde::Serialize;
use std::net::{IpAddr};

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

pub fn resolve_host(host: &str) -> Result<IpAddr, String> {
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Ok(ip);
    }
    let clean = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = clean.parse::<IpAddr>() {
        return Ok(ip);
    }
    use std::net::ToSocketAddrs;
    let addr = format!("{}:0", clean)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?
        .next()
        .ok_or_else(|| "No address found for host".to_string())?;
    Ok(addr.ip())
}

// pub fn resolve_ipv4(host: &str) -> Result<Ipv4Addr, String> {
//     let ip = resolve_host(host)?;
//     match ip {
//         IpAddr::V4(v4) => Ok(v4),
//         _ => Err("Not an IPv4 address".into()),
//     }
// }

// ══════════════════════════════════════════════════════════════════════════════
// Windows Implementation
// ══════════════════════════════════════════════════════════════════════════════

#[cfg(windows)]
mod platform {
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
    use std::ptr;
    use std::process::Command;

    const INVALID_HANDLE_VALUE: isize = -1;
    pub const IP_SUCCESS: u32 = 0;
    pub const IP_TTL_EXPIRED_TRANSIT: u32 = 11013;

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
        fn ping(&self, dest: Ipv4Addr, ttl: u8, timeout_ms: u32)
            -> Result<(Ipv4Addr, u32, bool), String>
        {
            let dest_addr = u32::from_ne_bytes(dest.octets());
            let send_data = b"MTRPROBE";
            let options = IP_OPTION_INFORMATION {
                Ttl: ttl, Tos: 0, Flags: 0, OptionsSize: 0,
                OptionsData: ptr::null_mut(),
            };
            let reply_size = std::mem::size_of::<ICMP_ECHO_REPLY>() + send_data.len() + 64;
            let mut reply_buf = vec![0u8; reply_size];
            let ret = unsafe {
                IcmpSendEcho(self.0, dest_addr, send_data.as_ptr(),
                    send_data.len() as u16, &options,
                    reply_buf.as_mut_ptr(), reply_size as u32, timeout_ms)
            };
            if ret == 0 { return Err("timeout".into()); }
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
        fn drop(&mut self) { unsafe { IcmpCloseHandle(self.0); } }
    }

    fn discover_route_v4(dest: Ipv4Addr, max_hops: u8, timeout_ms: u32)
        -> Result<Vec<(u8, IpAddr)>, String>
    {
        let icmp = IcmpHandle::new()?;
        let mut hops = Vec::new();
        for ttl in 1..=max_hops {
            match icmp.ping(dest, ttl, timeout_ms) {
                Ok((ip, _, reached)) => {
                    hops.push((ttl, IpAddr::V4(ip)));
                    if reached { break; }
                }
                Err(_) => hops.push((ttl, IpAddr::V4(Ipv4Addr::UNSPECIFIED))),
            }
        }
        Ok(hops)
    }

    fn ping_ip_v4(dest: Ipv4Addr, timeout_ms: u32) -> Option<u32> {
        IcmpHandle::new().ok().and_then(|icmp| {
            icmp.ping(dest, 128, timeout_ms).ok().map(|(_, rtt, _)| rtt)
        })
    }

    fn ping_ip_v6(dest: Ipv6Addr, timeout_ms: u32) -> Option<u32> {
        let w = timeout_ms.to_string();
        let output = Command::new("ping")
            .args(["-6", "-n", "1", "-w", &w, &dest.to_string()])
            .output().ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Some(pos) = line.find("time") {
                let after = &line[pos..];
                if let Some(digit_start) = after.find(|c: char| c.is_ascii_digit()) {
                    let rest = &after[digit_start..];
                    let num: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
                    if let Ok(v) = num.parse::<f64>() {
                        return if after.contains("time<") { Some(0.max(v as u32)) } else { Some(v as u32) };
                    }
                }
            }
        }
        None
    }

    fn discover_route_v6(dest: Ipv6Addr, max_hops: u8, timeout_ms: u32)
        -> Result<Vec<(u8, IpAddr)>, String>
    {
        let w = timeout_ms.to_string();
        let mut hops = Vec::new();
        for ttl in 1..=max_hops {
            let output = Command::new("ping")
                .args(["-6", "-n", "1", "-i", &ttl.to_string(), "-w", &w, &dest.to_string()])
                .output().map_err(|e| format!("ping failed: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("Reply from") || stdout.contains("time=") {
                let resp_ip = stdout.lines().next().and_then(|line| {
                    if let Some(from_pos) = line.find("from") {
                        let rest = &line[from_pos + 5..];
                        let ip_str = rest.split(' ').next().unwrap_or("").trim_end_matches(':');
                        if ip_str.contains(':') {
                            ip_str.trim_start_matches('[').trim_end_matches(']').parse::<Ipv6Addr>().ok().map(IpAddr::V6)
                        } else {
                            ip_str.parse::<Ipv4Addr>().ok().map(IpAddr::V4)
                        }
                    } else { None }
                }).unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));
                let reached = stdout.contains("time=");
                hops.push((ttl, resp_ip));
                if reached { break; }
            } else {
                hops.push((ttl, IpAddr::V4(Ipv4Addr::UNSPECIFIED)));
            }
            if hops.last().map_or(false, |(_, ip)| *ip == IpAddr::V6(dest)) { break; }
        }
        if hops.is_empty() { Err("No route discovered".into()) } else { Ok(hops) }
    }

    pub fn discover_route(dest: IpAddr, max_hops: u8, timeout_ms: u32)
        -> Result<Vec<(u8, IpAddr)>, String>
    {
        match dest {
            IpAddr::V4(v4) => discover_route_v4(v4, max_hops, timeout_ms),
            IpAddr::V6(v6) => discover_route_v6(v6, max_hops, timeout_ms),
        }
    }

    pub fn ping_ip(dest: IpAddr, timeout_ms: u32) -> Option<u32> {
        match dest {
            IpAddr::V4(v4) => ping_ip_v4(v4, timeout_ms),
            IpAddr::V6(v6) => ping_ip_v6(v6, timeout_ms),
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Linux Implementation
// ══════════════════════════════════════════════════════════════════════════════

#[cfg(not(windows))]
mod platform {
    use std::net::{IpAddr, Ipv4Addr};
    use std::process::Command;

    pub fn discover_route(dest: IpAddr, max_hops: u8, _timeout_ms: u32)
        -> Result<Vec<(u8, IpAddr)>, String>
    {
        let is_ipv6 = matches!(dest, IpAddr::V6(_));
        let traceroute = if is_ipv6 { "traceroute6" } else { "traceroute" };

        let output = Command::new(traceroute)
            .args(["-n", "-w", "2", "-q", "1", "-m", &max_hops.to_string(), &dest.to_string()])
            .output()
            .or_else(|_| {
                Command::new("traceroute")
                    .args(["-n", "-w", "2", "-q", "1", "-m", &max_hops.to_string(), &dest.to_string()])
                    .output()
            })
            .map_err(|e| format!("traceroute failed: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut hops = Vec::new();
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let hop: u8 = parts[0].parse().unwrap_or(0);
                if hop == 0 { continue; }
                let ip = if parts[1] == "*" {
                    IpAddr::V4(Ipv4Addr::UNSPECIFIED)
                } else {
                    parts[1].parse::<IpAddr>().unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
                };
                hops.push((hop, ip));
            }
        }
        Ok(hops)
    }

    pub fn ping_ip(dest: IpAddr, timeout_ms: u32) -> Option<u32> {
        let timeout_s = (timeout_ms as f64 / 1000.0).max(1.0);
        let is_ipv6 = matches!(dest, IpAddr::V6(_));
        let output = (if is_ipv6 {
            Command::new("ping").args(["-6", "-c", "1", "-W", &format!("{:.0}", timeout_s), &dest.to_string()]).output()
        } else {
            Command::new("ping").args(["-c", "1", "-W", &format!("{:.0}", timeout_s), &dest.to_string()]).output()
        }).ok()?;
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
