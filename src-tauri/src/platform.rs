use std::collections::{HashMap, HashSet};
use std::io;
use std::process::Command as ProcCmd;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

use sysinfo::System;
#[cfg(target_os = "linux")]
use std::process::Command;
#[cfg(windows)]
use winreg::{enums::*, RegKey};

use crate::config;
use crate::types::{TcpConnection, UwpAppInfo};

// ══════════════════════════════════════════════════════════════════════════════
// UWP Process Detection (Windows only)
// ══════════════════════════════════════════════════════════════════════════════

/// 枚举所有正在运行的 UWP 进程，获取包族名称等信息。
///
/// 对每个进程尝试调用 GetPackageFamilyName API，若成功则该进程属于某个 UWP 包。
/// 使用 OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION) 打开进程句柄，无需管理员权限。
#[cfg(windows)]
pub fn get_uwp_processes() -> Vec<UwpAppInfo> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut result = Vec::new();

    for (pid, proc_entry) in sys.processes() {
        let pid_u32 = pid.as_u32();
        let proc_name = proc_entry.name().to_string_lossy().to_string();
        let proc_path = proc_entry
            .exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid_u32);
            if handle == 0 {
                continue;
            }

            // 先获取所需缓冲区大小
            let mut buf_len: u32 = 0;
            let rc = GetPackageFamilyName(handle, &mut buf_len, std::ptr::null_mut());

            if rc == 0 || rc == ERROR_INSUFFICIENT_BUFFER {
                // 分配缓冲区并重新调用
                let mut buf: Vec<u16> = vec![0u16; buf_len as usize];
                let rc2 = GetPackageFamilyName(handle, &mut buf_len, buf.as_mut_ptr());
                if rc2 == 0 {
                    let family_name = String::from_utf16_lossy(&buf[..buf_len as usize])
                        .trim_end_matches('\0')
                        .to_string();

                    // 尝试获取完整包名
                    let full_name = try_get_package_full_name(handle);

                    result.push(UwpAppInfo {
                        package_family_name: family_name,
                        package_full_name: full_name,
                        pid: pid_u32,
                        process_name: proc_name,
                        executable_path: proc_path,
                    });
                }
            }

            CloseHandle(handle);
        }
    }

    result
}

#[cfg(windows)]
unsafe fn try_get_package_full_name(handle: isize) -> Option<String> {
    let mut buf_len: u32 = 0;
    let rc = unsafe{GetPackageFullName(handle, &mut buf_len, std::ptr::null_mut())};
    if rc == 0 || rc == ERROR_INSUFFICIENT_BUFFER {
        let mut buf: Vec<u16> = vec![0u16; buf_len as usize];
        let rc2 = unsafe {GetPackageFullName(handle, &mut buf_len, buf.as_mut_ptr())};
        if rc2 == 0 {
            let name = String::from_utf16_lossy(&buf[..buf_len as usize])
                .trim_end_matches('\0')
                .to_string();
            return Some(name);
        }
    }
    None
}

#[cfg(not(windows))]
pub fn get_uwp_processes() -> Vec<UwpAppInfo> {
    Vec::new()
}

// ─── Windows FFI ──────────────────────────────────────────────────────────────

#[cfg(windows)]
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
#[cfg(windows)]
const ERROR_INSUFFICIENT_BUFFER: i32 = 122;

// ─── TCP Table FFI (replaces netstat) ───────────────────────────────────

#[cfg(windows)]
#[link(name = "iphlpapi")]
unsafe extern "system" {
    fn GetExtendedTcpTable(
        pTcpTable: *mut std::ffi::c_void,
        pdwSize: *mut u32,
        bOrder: i32,
        ulAf: u32,
        TableClass: u32,
        Reserved: u32,
    ) -> u32;
    fn SendARP(
        DestIp: u32,
        SrcIP: u32,
        pMacAddr: *mut u8,
        PhyAddrLen: *mut u32,
    ) -> u32;
}

#[cfg(windows)]
const AF_INET: u32 = 2;
#[cfg(windows)]
const TCP_TABLE_OWNER_PID_ALL: u32 = 5;

#[cfg(windows)]
#[repr(C)]
struct MIB_TCPROW_OWNER_PID {
    dwState: u32,
    dwLocalAddr: u32,
    dwLocalPort: u32,
    dwRemoteAddr: u32,
    dwRemotePort: u32,
    dwOwningPid: u32,
}

/// Fetch TCP connection table directly via Win32 API (no external process).
/// Returns (state_str, local_addr_str, local_port, remote_addr_str, remote_port, pid).
#[cfg(windows)]
fn get_tcp_table_api() -> Vec<(String, String, u16, String, u16, u32)> {
    use std::net::Ipv4Addr;
    let mut result = Vec::new();

    unsafe {
        let mut size: u32 = 0;
        let rc = GetExtendedTcpTable(
            std::ptr::null_mut(),
            &mut size,
            0,
            AF_INET,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );

        // First call should return ERROR_INSUFFICIENT_BUFFER (122)
        if rc != 122 {
            return result;
        }

        let mut buf: Vec<u8> = vec![0u8; size as usize];

        let rc = GetExtendedTcpTable(
            buf.as_mut_ptr() as *mut std::ffi::c_void,
            &mut size,
            0,
            AF_INET,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );

        if rc != 0 {
            return result;
        }

        let num_entries = *(buf.as_ptr() as *const u32) as usize;
        let row_size = std::mem::size_of::<MIB_TCPROW_OWNER_PID>();

        for i in 0..num_entries {
            let offset = 4 + i * row_size;
            if offset + row_size > buf.len() {
                break;
            }
            let row = &*(buf.as_ptr().add(offset) as *const MIB_TCPROW_OWNER_PID);

            let local_ip = Ipv4Addr::from(u32::from_be(row.dwLocalAddr));
            let remote_ip = Ipv4Addr::from(u32::from_be(row.dwRemoteAddr));
            let local_port = u16::from_be((row.dwLocalPort & 0xFFFF) as u16);
            let remote_port = u16::from_be((row.dwRemotePort & 0xFFFF) as u16);

            let state_str = match row.dwState {
                1 => "ESTABLISHED",
                2 => "SYN_SENT",
                3 => "SYN_RECV",
                4 => "FIN_WAIT1",
                5 => "FIN_WAIT2",
                6 => "TIME_WAIT",
                7 => "CLOSE",
                8 => "CLOSE_WAIT",
                9 => "LAST_ACK",
                10 => "LISTENING",
                11 => "CLOSING",
                s => {
                    // Keep the raw code as a debug hint
                    Box::leak(format!("UNKNOWN({s})").into_boxed_str())
                }
            };

            result.push((
                state_str.to_string(),
                local_ip.to_string(),
                local_port,
                remote_ip.to_string(),
                remote_port,
                row.dwOwningPid,
            ));
        }
    }

    result
}

#[cfg(windows)]
unsafe extern "system" {
    fn OpenProcess(
        dwDesiredAccess: u32,
        bInheritHandle: i32,
        dwProcessId: u32,
    ) -> isize;
    fn CloseHandle(hObject: isize) -> i32;
    fn GetPackageFamilyName(
        hProcess: isize,
        packageFamilyNameLength: *mut u32,
        packageFamilyName: *mut u16,
    ) -> i32;
    fn GetPackageFullName(
        hProcess: isize,
        packageFullNameLength: *mut u32,
        packageFullName: *mut u16,
    ) -> i32;
}

// ══════════════════════════════════════════════════════════════════════════════
// Windows Proxy
// ══════════════════════════════════════════════════════════════════════════════

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
            let full_proxy_addr = format!("{}:{}", proxy_addr, proxy_port);

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

        // ── WINHTTP Proxy (covers .NET / modern Windows apps) ──
        let protocol_upper = protocol.to_uppercase();
        let skip_winhttp = protocol_upper == "SOCKS5" || protocol_upper == "SOCKS";
        if !skip_winhttp || !enable {
            let winhttp_result = if enable {
                let full = format!("{}:{}", proxy_addr, proxy_port);
                ProcCmd::new("netsh")
                    .creation_flags(0x08000000)
                    .args(["winhttp", "set", "proxy", &full, "<-loopback>"])
                    .output()
            } else {
                ProcCmd::new("netsh")
                    .creation_flags(0x08000000)
                    .args(["winhttp", "reset", "proxy"])
                    .output()
            };
            if let Ok(output) = winhttp_result {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("[proxy] netsh winhttp warning: {}", stderr);
                }
            }
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

// ══════════════════════════════════════════════════════════════════════════════
// PAC (Proxy Auto-Config)
// ══════════════════════════════════════════════════════════════════════════════

/// 设置 PAC URL（写入注册表 AutoConfigURL），同时清除 ProxyEnable
pub fn set_pac_url(pac_url: &str) -> io::Result<()> {
    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let cur_ver = hkcu.open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_SET_VALUE,
        )?;

        // 关闭普通代理（PAC 和普通代理不能同时启用）
        cur_ver.set_value("ProxyEnable", &0u32)?;
        cur_ver.set_value("AutoConfigURL", &pac_url)?;

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

    #[cfg(not(windows))]
    let _ = pac_url;

    Ok(())
}

/// 清除 PAC URL（删除注册表 AutoConfigURL）
pub fn clear_pac_url() -> io::Result<()> {
    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let cur_ver = hkcu.open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_SET_VALUE | KEY_READ,
        )?;

        // 删除 AutoConfigURL（忽略不存在的情况）
        let _ = cur_ver.delete_value("AutoConfigURL");

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

/// 获取当前 PAC URL（如果已设置）
pub fn get_pac_url() -> Option<String> {
    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
        if let Ok(key) = hkcu.open_subkey(path) {
            if let Ok(url) = key.get_value::<String, _>("AutoConfigURL") {
                if !url.is_empty() {
                    return Some(url);
                }
            }
        }
    }
    None
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
// Admin Check (direct Win32 API, no `net session` spawn)
// ══════════════════════════════════════════════════════════════════════════════

#[cfg(windows)]
const TOKEN_QUERY: u32 = 0x0008;
#[cfg(windows)]
const TOKEN_ELEVATION: u32 = 20;

#[cfg(windows)]
#[repr(C)]
struct TOKEN_ELEVATION {
    TokenIsElevated: u32,
}

#[cfg(windows)]
unsafe extern "system" {
    fn GetCurrentProcess() -> isize;
    fn OpenProcessToken(
        TokenHandle: isize,
        DesiredAccess: u32,
        TokenHandleOut: *mut isize,
    ) -> i32;
    fn GetTokenInformation(
        TokenHandle: isize,
        TokenInformationClass: u32,
        TokenInformation: *mut std::ffi::c_void,
        TokenInformationLength: u32,
        ReturnLength: *mut u32,
    ) -> i32;
}

/// Check if the current process is running with administrator privileges
/// using native Win32 API instead of spawning `net session`.
pub fn is_admin() -> bool {
    #[cfg(windows)]
    {
        unsafe {
            let h_process = GetCurrentProcess();
            let mut h_token: isize = 0;

            if OpenProcessToken(h_process, TOKEN_QUERY, &mut h_token) == 0 {
                return false;
            }

            let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
            let mut return_len: u32 = 0;

            let ok = GetTokenInformation(
                h_token,
                TOKEN_ELEVATION,
                &mut elevation as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                &mut return_len,
            );

            // CloseHandle is already declared above (UWP FFI)
            let _ = CloseHandle(h_token);

            ok != 0 && elevation.TokenIsElevated != 0
        }
    }
    #[cfg(not(windows))]
    false
}

// ══════════════════════════════════════════════════════════════════════════════
// Netstat

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

        let ruled_paths: HashSet<String> = proxy_rules.iter()
            .filter(|r| r.enabled)
            .map(|r| r.app_path.clone())
            .collect();

        // Use direct Win32 API instead of spawning netstat
        let rows = get_tcp_table_api();

        for (state, local_addr, local_port, remote_addr, remote_port, pid) in rows {
            let (proc_name, proc_path) = pid_name.get(&pid)
                .map(|(n, p)| (n.clone(), p.clone()))
                .unwrap_or(("Unknown".to_string(), String::new()));

            let is_proxy = if proxy_port > 0 && (local_port == proxy_port || remote_port == proxy_port) {
                true
            } else if ruled_paths.contains(&proc_path) {
                true
            } else {
                false
            };

            result.push(TcpConnection {
                local_addr,
                local_port,
                remote_addr,
                remote_port,
                state,
                pid,
                process_name: proc_name,
                process_path: proc_path,
                is_proxy_traffic: is_proxy,
                protocol: "TCP".to_string(),
            });
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

// pub fn parse_addr_port(s: &str) -> (String, u16) {
//     if s.starts_with('[') {
//         if let Some(bracket_end) = s.find(']') {
//             let addr = s[1..bracket_end].to_string();
//             let port: u16 = s[bracket_end + 2..].parse().unwrap_or(0);
//             (addr, port)
//         } else {
//             (s.to_string(), 0)
//         }
//     } else if let Some(colon) = s.rfind(':') {
//         let addr = s[..colon].to_string();
//         let port: u16 = s[colon + 1..].parse().unwrap_or(0);
//         (addr, port)
//     } else {
//         (s.to_string(), 0)
//     }
// }

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

/// 获取指定 IP 的 MAC 地址字符串。
/// Windows 使用 SendARP，返回如 "AA:BB:CC:DD:EE:FF" 格式。
/// 本机地址 (127.0.0.1) 返回 "00:00:00:00:00:00"。
/// 失败或者 IPv6 地址返回 None。
/// 内部用 catch_unwind 保护 FFI 调用，确保不 panic。
#[cfg(windows)]
pub fn get_mac_address(ip: std::net::IpAddr) -> Option<String> {
    let result = std::panic::catch_unwind(|| {
        // Loopback has no real MAC
        if ip.is_loopback() {
            return Some("00:00:00:00:00:00".to_string());
        }

        match ip {
            std::net::IpAddr::V4(v4) => {
                unsafe {
                    let dest_ip = u32::from(v4).to_be(); // network byte order
                    let mut mac_addr = [0u8; 6];
                    let mut mac_len = mac_addr.len() as u32;

                    let result = SendARP(dest_ip, 0, mac_addr.as_mut_ptr(), &mut mac_len);

                    if result == 0 && mac_len >= 6 {
                        Some(format!(
                            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                            mac_addr[0], mac_addr[1], mac_addr[2],
                            mac_addr[3], mac_addr[4], mac_addr[5]
                        ))
                    } else {
                        None
                    }
                }
            }
            _ => None,
        }
    });

    match result {
        Ok(val) => val,
        Err(_) => {
            eprintln!("[platform] get_mac_address panicked (SendARP)");
            None
        }
    }
}

#[cfg(not(windows))]
pub fn get_mac_address(_ip: std::net::IpAddr) -> Option<String> {
    None
}

// ══════════════════════════════════════════════════════════════════════════════
// UWP Loopback Exemption (Windows only)
// ══════════════════════════════════════════════════════════════════════════════

/// 从包族名称派生 SID（用于回环豁免）
#[cfg(windows)]
pub fn derive_package_sid(package_family_name: &str) -> Result<*mut std::ffi::c_void, String> {
    let wide: Vec<u16> = package_family_name.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let mut sid: *mut std::ffi::c_void = std::ptr::null_mut();
        let hr = DeriveAppContainerSidFromAppContainerName(wide.as_ptr(), &mut sid);
        if hr != 0 {
            return Err(format!("DeriveAppContainerSid failed: HRESULT 0x{:x}", hr));
        }
        Ok(sid)
    }
}

/// 获取当前所有回环豁免的 UWP 包 SID 列表
#[cfg(windows)]
pub fn get_loopback_exempt_sids() -> Result<Vec<*mut std::ffi::c_void>, String> {
    unsafe {
        let mut count: u32 = 0;
        let mut sids: *mut SID_AND_ATTRIBUTES = std::ptr::null_mut();
        let rc = NetworkIsolationGetAppContainerConfig(&mut count, &mut sids);
        if rc != 0 {
            return Err(format!("NetworkIsolationGetAppContainerConfig failed: {}", rc));
        }

        let mut result = Vec::with_capacity(count as usize);
        for i in 0..count as usize {
            let entry = sids.add(i).read();
            result.push(entry.sid);
        }

        // 释放数组（不释放 SID，返回给调用者）
        HeapFree(GetProcessHeap(), 0, sids as *mut std::ffi::c_void);
        Ok(result)
    }
}

/// 添加包族名称到回环豁免列表
#[cfg(windows)]
pub fn add_loopback_exemption(package_family_name: &str) -> Result<(), String> {
    let new_sid = derive_package_sid(package_family_name)?;
    let mut existing = get_loopback_exempt_sids().unwrap_or_default();

    // 检查是否已存在
    for &sid in &existing {
        unsafe {
            if EqualSid(new_sid, sid) != 0 {
                FreeSid(new_sid);
                return Ok(()); // 已存在，无需重复添加
            }
        }
    }

    existing.push(new_sid);
    let result = set_loopback_exempt_sids(&existing);
    unsafe { FreeSid(new_sid); }
    result
}

/// 从回环豁免列表中移除包族名称
#[cfg(windows)]
pub fn remove_loopback_exemption(package_family_name: &str) -> Result<(), String> {
    let target_sid = derive_package_sid(package_family_name)?;
    let existing = get_loopback_exempt_sids().unwrap_or_default();

    let filtered: Vec<*mut std::ffi::c_void> = existing.into_iter()
        .filter(|&sid| {
            unsafe { EqualSid(target_sid, sid) == 0 }
        })
        .collect();

    unsafe { FreeSid(target_sid); }

    let result = set_loopback_exempt_sids(&filtered);

    // 释放过滤掉的 SID
    for &sid in &filtered {
        unsafe { FreeSid(sid); }
    }

    result
}

/// 设置回环豁免列表
#[cfg(windows)]
fn set_loopback_exempt_sids(sids: &[*mut std::ffi::c_void]) -> Result<(), String> {
    let mut entries: Vec<SID_AND_ATTRIBUTES> = sids.iter().map(|&sid| SID_AND_ATTRIBUTES {
        sid: sid,
        attributes: 0,
    }).collect();

    unsafe {
        let rc = NetworkIsolationSetAppContainerConfig(
            entries.len() as u32,
            entries.as_mut_ptr(),
        );
        if rc != 0 {
            return Err(format!("NetworkIsolationSetAppContainerConfig failed: {}", rc));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn add_loopback_exemption(_package_family_name: &str) -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}

#[cfg(not(windows))]
pub fn remove_loopback_exemption(_package_family_name: &str) -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}

// ─── UWP Loopback Exemption FFI ──────────────────────────────────────────────

#[cfg(windows)]
#[warn(non_snake_case)]
#[repr(C)]
struct SID_AND_ATTRIBUTES {
    sid: *mut std::ffi::c_void,
    attributes: u32,
}

#[cfg(windows)]
#[link(name = "firewallapi")]
unsafe extern "system" {
    fn NetworkIsolationGetAppContainerConfig(
        pdwNumPublicMatches: *mut u32,
        appContainerSids: *mut *mut SID_AND_ATTRIBUTES,
    ) -> i32;
    fn NetworkIsolationSetAppContainerConfig(
        dwNumAppContainerSids: u32,
        appContainerSids: *mut SID_AND_ATTRIBUTES,
    ) -> i32;
}

#[cfg(windows)]
unsafe extern "system" {
    fn DeriveAppContainerSidFromAppContainerName(
        pszAppContainerName: *const u16,
        ppsidAppContainerSid: *mut *mut std::ffi::c_void,
    ) -> i32;
    fn FreeSid(pSid: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn EqualSid(pSid1: *mut std::ffi::c_void, pSid2: *mut std::ffi::c_void) -> i32;
    fn GetProcessHeap() -> *mut std::ffi::c_void;
    fn HeapFree(
        hHeap: *mut std::ffi::c_void,
        dwFlags: u32,
        lpMem: *mut std::ffi::c_void,
    ) -> i32;
}

// ─── User Environment Variables ───────────────────────────────────────────

#[cfg(windows)]
pub fn set_user_env_var(name: &str, value: &str) -> io::Result<()> {
    use winreg::{enums::*, RegKey};
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env = hkcu.open_subkey_with_flags("Environment", KEY_SET_VALUE)?;
    env.set_value(name, &value)?;
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
        let setting: Vec<u16> = "Environment\0".encode_utf16().collect();
        SendNotifyMessageW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, setting.as_ptr());
    }
    Ok(())
}

#[cfg(windows)]
pub fn delete_user_env_var(name: &str) -> io::Result<()> {
    use winreg::{enums::*, RegKey};
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env = hkcu.open_subkey_with_flags("Environment", KEY_SET_VALUE)?;
    env.delete_value(name)?;
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
        let setting: Vec<u16> = "Environment\0".encode_utf16().collect();
        SendNotifyMessageW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, setting.as_ptr());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn set_user_env_var(_name: &str, _value: &str) -> io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
pub fn delete_user_env_var(_name: &str) -> io::Result<()> {
    Ok(())
}
