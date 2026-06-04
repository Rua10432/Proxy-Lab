// ─── Monitor Service ─────────────────────────────────────────────────────────
// Business logic for TCP connection monitoring, proxy port detection, memory info.

use std::collections::{HashMap, HashSet};
use crate::platform;
use crate::types::{MonitorData, MonitorSummary, MemoryInfo, LocalProxyPort};
use crate::AppState;
use sysinfo::System;

const PROXY_PROC_KEYWORDS: &[&str] = &[
    "clash", "mihomo",
    "v2ray", "xray",
    "ss-local", "shadowsocks", "ss-",
    "trojan",
    "hysteria",
    "sing-box", "singbox",
    "naive",
    "qv2ray", "nekobox", "nekoray",
    "tun2socks", "socks",
    "proxy", "proxifier",
    "relay", "forwarder", "tunnel",
    "sniff",
    "redsocks", "redir",
    "mitmproxy", "mitm", "middle",
];

fn is_known_proxy_process(name: &str) -> bool {
    let lower = name.to_lowercase();
    PROXY_PROC_KEYWORDS.iter().any(|kw| lower.contains(kw))
}

pub fn get_tcp_connections(state: &AppState) -> MonitorData {
    let cfg = state.config.lock().unwrap();
    let proxy_rules = cfg.proxy_rules.clone();

    #[cfg(windows)]
    let (sys_host, sys_port, _sys_proto, sys_active) = platform::detect_system_proxy();
    #[cfg(not(windows))]
    let (sys_host, sys_port, _sys_proto, sys_active) = (String::new(), 0u16, String::new(), false);

    let proxy_active = sys_active || cfg.proxies.iter().any(|p| !p.ip.is_empty());
    let proxy_host = if !sys_host.is_empty() { sys_host } else { cfg.proxies.first().map(|p| p.ip.clone()).unwrap_or_default() };
    let proxy_port = if sys_port > 0 { sys_port } else { cfg.proxies.first().map(|p| p.port).unwrap_or(0) };

    let connections = platform::get_netstat_connections(&proxy_rules, proxy_port);
    let total = connections.len();
    let proxy_count = connections.iter().filter(|c| c.is_proxy_traffic).count();
    let direct = total - proxy_count;
    let listen_count = connections.iter().filter(|c| c.state == "LISTENING").count();

    let mut unique_procs: HashSet<String> = HashSet::new();
    let mut unique_proxy_procs: HashSet<String> = HashSet::new();
    for c in &connections {
        unique_procs.insert(c.process_name.clone());
        if c.is_proxy_traffic {
            unique_proxy_procs.insert(c.process_name.clone());
        }
    }

    MonitorData {
        connections,
        proxy_active,
        proxy_host,
        proxy_port,
        proxy_rules: proxy_rules.to_vec(),
        summary: MonitorSummary {
            total_connections: total,
            proxy_connections: proxy_count,
            direct_connections: direct,
            listening_ports: listen_count,
            unique_processes: unique_procs.len(),
            unique_proxy_processes: unique_proxy_procs.len(),
        },
    }
}

pub fn get_local_proxy_ports() -> Vec<LocalProxyPort> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    use std::process::Command as ProcCmd;

    let pid_name: HashMap<u32, String> = platform::get_process_map();

    #[cfg(windows)]
    let pid_path: HashMap<u32, String> = {
        let mut m = HashMap::new();
        if let Ok(output) = ProcCmd::new("wmic")
            .creation_flags(0x08000000)
            .args(["process", "get", "processid,executablepath", "/format:csv"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 3 {
                    if let Ok(pid) = parts[1].trim().parse::<u32>() {
                        m.insert(pid, parts[2].trim().to_string());
                    }
                }
            }
        }
        m
    };

    #[cfg(not(windows))]
    let pid_path: HashMap<u32, String> = HashMap::new();

    let proxy_port_set: HashSet<u16> = platform::PROXY_PORTS.iter().copied().collect();
    let mut found: Vec<(String, u16, String, u32, String)> = Vec::new();

    #[cfg(windows)]
    if let Ok(output) = ProcCmd::new("netstat").creation_flags(0x08000000).args(["-ano"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(4) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 5 { continue; }

            let proto = parts[0].to_string();
            if proto != "TCP" && proto != "TCP6" { continue; }

            let state = parts[3];
            if state != "LISTENING" { continue; }

            let pid: u32 = parts[4].parse().unwrap_or(0);
            let (local_addr, port) = parse_addr_port(parts[1]);
            if port == 0 { continue; }

            found.push((proto, port, local_addr, pid, state.to_string()));
        }
    }

    let mut unique: Vec<LocalProxyPort> = Vec::new();
    for (proto, port, local_addr, pid, state) in found {
        let pname = pid_name.get(&pid).cloned().unwrap_or_default();
        let ppath = pid_path.get(&pid).cloned().unwrap_or_default();
        let is_known = is_known_proxy_process(&pname)
            || is_known_proxy_process(&ppath)
            || proxy_port_set.contains(&port);

        if !is_known && port < 1024 { continue; }

        unique.push(LocalProxyPort {
            port,
            protocol: proto,
            process_name: pname,
            process_pid: pid,
            process_path: ppath,
            state,
            is_known_proxy: is_known,
            local_addr,
        });
    }

    unique.sort_by(|a, b| {
        b.is_known_proxy.cmp(&a.is_known_proxy)
            .then(a.port.cmp(&b.port))
    });
    unique
}

fn parse_addr_port(s: &str) -> (String, u16) {
    if let Some(bracket_end) = s.find(']') {
        let addr = s[1..bracket_end].to_string();
        let port: u16 = s[bracket_end + 2..].parse().unwrap_or(0);
        (addr, port)
    } else if let Some(colon) = s.rfind(':') {
        let addr = s[..colon].to_string();
        let port: u16 = s[colon + 1..].parse().unwrap_or(0);
        (addr, port)
    } else {
        (s.to_string(), 0)
    }
}

pub fn get_memory_info() -> MemoryInfo {
    let mut sys = System::new_all();
    sys.refresh_memory();
    let total_bytes = sys.total_memory();
    let total_gb = total_bytes as f64 / 1024.0 / 1024.0 / 1024.0;
    let mut total_process_memory = 0;
    if let Ok(root_pid) = sysinfo::get_current_pid() {
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
    MemoryInfo { used_mb, total_gb: (total_gb * 10.0).round() / 10.0, percent: (percent * 10.0).round() / 10.0 }
}
