use std::collections::{HashMap, HashSet};
use std::io;
use std::process::Command as ProcCmd;

use sysinfo::System;
#[cfg(target_os = "linux")]
use std::process::Command;
#[cfg(windows)]
use winreg::{enums::*, RegKey};

use crate::config;
use crate::types::TcpConnection;

// ══════════════════════════════════════════════════════════════════════════════
// Windows Proxy
// ══════════════════════════════════════════════════════════════════════════════

pub fn set_windows_proxy(proxy_addr: &str, proxy_port: &str, enable: bool, protocol: &str) -> io::Result<()> {
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
                _ => format!("{}:{}", proxy_addr, proxy_port),
            };

            cur_ver.set_value("ProxyServer", &full_proxy_addr)?;
        }

        unsafe {
            unsafe extern "system" {
                fn SendNotifyMessageW(
                    hWnd: *mut std::ffi::c_void,
                    Msg: u32,
                    wParam: usize,
                    lParam: *const u16,
                ) -> isize;
            }
            const HWND_BROADCAST: *mut std::ffi::c_void = 0xFFFF as _;
            const WM_SETTINGCHANGE: u32 = 0x001A;
            let setting: Vec<u16> = "InternetSettings\0".encode_utf16().collect();
            SendNotifyMessageW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, setting.as_ptr());
        }
    }

    Ok(())
}

/// 从 Windows 注册表动态检测系统代理配置
#[cfg(windows)]
pub fn detect_system_proxy() -> (String, u16, String, bool) {
    use winreg::{enums::*, RegKey};
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

    if let Ok(key) = hkcu.open_subkey(path) {
        // PAC 模式
        if let Ok(pac_url) = key.get_value::<String, _>("AutoConfigURL") {
            if !pac_url.is_empty() {
                let rest = pac_url
                    .trim_start_matches("http://")
                    .trim_start_matches("https://");
                if let Some(host_part) = rest.split('/').next() {
                    if let Some(colon_pos) = host_part.rfind(':') {
                        let port: u16 = host_part[colon_pos + 1..]
                            .parse()
                            .unwrap_or(10809);
                        let host = host_part[..colon_pos]
                            .trim_start_matches('[')
                            .trim_end_matches(']')
                            .to_string();
                        return (host, port, "HTTP".to_string(), true);
                    }
                    let host = host_part
                        .trim_start_matches('[')
                        .trim_end_matches(']')
                        .to_string();
                    return (host, 10809, "HTTP".to_string(), true);
                }
            }
        }

        // 全局代理模式
        let enabled: u32 = key.get_value("ProxyEnable").unwrap_or(0);
        if enabled == 1 {
            if let Ok(server) = key.get_value::<String, _>("ProxyServer") {
                if !server.is_empty() {
                    let mut protocol = "HTTP".to_string();
                    let mut host_port = server.clone();

                    let lower = server.to_lowercase();
                    if lower.starts_with("socks=") {
                        protocol = "SOCKS5".to_string();
                        host_port = server[6..].to_string();
                    } else if lower.starts_with("http=") {
                        host_port = server[5..].to_string();
                    } else if lower.starts_with("https=") {
                        protocol = "HTTPS".to_string();
                        host_port = server[6..].to_string();
                    }

                    let parts: Vec<&str> = host_port.split(':').collect();
                    if parts.len() >= 2 {
                        if let Ok(port) = parts[1].parse::<u16>() {
                            return (parts[0].to_string(), port, protocol, true);
                        }
                    }
                    return (host_port, 80, protocol, true);
                }
            }
        }
    }

    (String::new(), 0, "HTTP".to_string(), false)
}

#[cfg(not(windows))]
pub fn detect_system_proxy() -> (String, u16, String, bool) {
    (String::new(), 0, "HTTP".to_string(), false)
}

#[cfg(windows)]
pub fn is_permission_denied(e: &io::Error) -> bool {
    e.kind() == io::ErrorKind::PermissionDenied || e.raw_os_error() == Some(5)
}

// ══════════════════════════════════════════════════════════════════════════════
// Linux Proxy
// ══════════════════════════════════════════════════════════════════════════════

#[cfg(target_os = "linux")]
pub fn set_linux_proxy(protocol: &str, address: &str, port: u16) {
    let proxy_url = format!("{}:{}", address, port);

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

    let env_protocol = if protocol.to_lowercase() == "socks" { "socks5" } else { "http" };
    let full_proxy = format!("{}://{}", env_protocol, proxy_url);

    std::env::set_var("http_proxy", &full_proxy);
    std::env::set_var("https_proxy", &full_proxy);
    std::env::set_var("all_proxy", &full_proxy);
    std::env::set_var("HTTP_PROXY", &full_proxy);
    std::env::set_var("HTTPS_PROXY", &full_proxy);
    std::env::set_var("ALL_PROXY", &full_proxy);
}

// ══════════════════════════════════════════════════════════════════════════════
// Unified Proxy API
// ══════════════════════════════════════════════════════════════════════════════

/// 启用系统代理（跨平台统一接口）
pub fn enable_proxy(host: &str, port: &str, protocol: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        set_windows_proxy(host, port, true, protocol).map_err(|e| {
            if is_permission_denied(&e) {
                "PERMISSION_DENIED: Registry access restricted. Please run as Administrator.".to_string()
            } else {
                format!("System proxy configuration failed: {}", e)
            }
        })
    }

    #[cfg(target_os = "linux")]
    {
        let port_u16: u16 = port.parse().map_err(|_| "Invalid port".to_string())?;
        set_linux_proxy(protocol, host, port_u16);
        Ok(())
    }

    #[cfg(not(any(windows, target_os = "linux")))]
    Err("Unsupported platform".to_string())
}

/// 禁用系统代理（跨平台统一接口）
pub fn disable_proxy() -> Result<(), String> {
    #[cfg(windows)]
    {
        set_windows_proxy("", "", false, "HTTP")
            .map_err(|e| format!("Disconnect failed: {}", e))
    }

    #[cfg(not(windows))]
    Ok(())
}

// ══════════════════════════════════════════════════════════════════════════════
// Netstat
// ══════════════════════════════════════════════════════════════════════════════

pub fn get_netstat_connections(
    proxy_rules: &[config::ProxyRule],
    proxy_port: u16,
) -> Vec<TcpConnection> {
    let mut result = Vec::new();

    #[cfg(windows)]
    {
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let mut pid_name: HashMap<u32, (String, String)> = HashMap::new();
        for (pid, proc) in sys.processes() {
            pid_name.insert(pid.as_u32(), (
                proc.name().to_string_lossy().to_string(),
                proc.exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
            ));
        }

        if let Ok(output) = ProcCmd::new("netstat").arg("-ano").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let ruled_paths: HashSet<String> = proxy_rules.iter()
                .filter(|r| r.enabled)
                .map(|r| r.app_path.clone())
                .collect();

            for line in stdout.lines().skip(4) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() < 4 { continue; }

                let protocol = match parts[0] {
                    "TCP" => {
                        if parts.len() < 5 { continue; }
                        "TCP".to_string()
                    }
                    "UDP" => "UDP".to_string(),
                    _ => continue,
                };

                let local = parse_addr_port(parts[1]);
                let remote = parse_addr_port(parts[2]);

                // UDP has no State column: Proto Local Remote PID
                let state = if protocol == "UDP" {
                    "UDP".to_string()
                } else {
                    parts[3].to_string()
                };
                let pid_str = parts.last().unwrap_or(&"0");
                let pid: u32 = pid_str.parse().unwrap_or(0);

                let (proc_name, proc_path) = pid_name.get(&pid)
                    .map(|(n, p)| (n.clone(), p.clone()))
                    .unwrap_or(("Unknown".to_string(), String::new()));

                let is_proxy = if proxy_port > 0 && (local.1 == proxy_port || remote.1 == proxy_port) {
                    true
                } else if ruled_paths.contains(&proc_path) {
                    true
                } else {
                    false
                };

                result.push(TcpConnection {
                    local_addr: local.0,
                    local_port: local.1,
                    remote_addr: remote.0,
                    remote_port: remote.1,
                    state,
                    pid,
                    process_name: proc_name,
                    process_path: proc_path,
                    is_proxy_traffic: is_proxy,
                    protocol,
                });
            }
        }
    }

    #[cfg(not(windows))]
    {
        if let Ok(output) = ProcCmd::new("netstat").arg("-anp").arg("tcp").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let ruled_paths: HashSet<String> = proxy_rules.iter()
                .filter(|r| r.enabled)
                .map(|r| r.app_path.clone())
                .collect();

            for line in stdout.lines().skip(2) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() < 6 { continue; }

                let protocol = "TCP".to_string();
                let local = parse_addr_port(parts[3]);
                let remote = parse_addr_port(parts[4]);
                let state_code: u32 = parts[5].parse().unwrap_or(0);
                let state = tcp_state_str(state_code);

                let mut pid: u32 = 0;
                let mut proc_name = String::new();
                if let Some(last) = parts.last() {
                    if let Some(pid_start) = last.find('/') {
                        if let Ok(p) = last[..pid_start].parse() {
                            pid = p;
                        }
                        proc_name = last[pid_start + 1..].to_string();
                    }
                }

                let proc_path = String::new();
                let is_proxy = proxy_port > 0 && (local.1 == proxy_port || remote.1 == proxy_port)
                    || ruled_paths.contains(&proc_path);

                result.push(TcpConnection {
                    local_addr: local.0,
                    local_port: local.1,
                    remote_addr: remote.0,
                    remote_port: remote.1,
                    state,
                    pid,
                    process_name: proc_name,
                    process_path: proc_path,
                    is_proxy_traffic: is_proxy,
                    protocol,
                });
            }
        }
    }

    result
}

#[cfg(not(windows))]
fn tcp_state_str(code: u32) -> String {
    match code {
        1 => "ESTABLISHED".to_string(),
        2 => "SYN_SENT".to_string(),
        3 => "SYN_RECV".to_string(),
        4 => "FIN_WAIT1".to_string(),
        5 => "FIN_WAIT2".to_string(),
        6 => "TIME_WAIT".to_string(),
        7 => "CLOSE".to_string(),
        8 => "CLOSE_WAIT".to_string(),
        9 => "LAST_ACK".to_string(),
        10 => "LISTENING".to_string(),
        11 => "CLOSING".to_string(),
        _ => format!("UNKNOWN({})", code),
    }
}

pub fn parse_addr_port(s: &str) -> (String, u16) {
    if s.starts_with('[') {
        if let Some(bracket_end) = s.find(']') {
            let addr = s[1..bracket_end].to_string();
            let port: u16 = s[bracket_end + 2..].parse().unwrap_or(0);
            (addr, port)
        } else {
            (s.to_string(), 0)
        }
    } else if let Some(colon) = s.rfind(':') {
        let addr = s[..colon].to_string();
        let port: u16 = s[colon + 1..].parse().unwrap_or(0);
        (addr, port)
    } else {
        (s.to_string(), 0)
    }
}

/// 常见代理服务端口列表
pub const PROXY_PORTS: &[u16] = &[
    1080, 1081, 1088,  // SOCKS
    3128, 3129,        // Squid
    7890, 7891, 7892,  // Clash
    8080, 8081,        // HTTP
    8118,              // Privoxy
    8443,              // HTTPS
    8888,              // mitmproxy
    9050, 9150,        // Tor
    9090,              // 管理面板
    10000,             // 其他
];

/// 获取进程名映射表
pub fn get_process_map() -> HashMap<u32, String> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let mut pid_name: HashMap<u32, String> = HashMap::new();
    for (pid, proc) in sys.processes() {
        pid_name.insert(pid.as_u32(), proc.name().to_string_lossy().to_string());
    }
    pid_name
}
