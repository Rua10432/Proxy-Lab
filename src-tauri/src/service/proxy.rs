// ─── Proxy Service ───────────────────────────────────────────────────────────
// Business logic for system proxy configuration, status detection, and URL fetching.

use chrono::Local;
use std::time::Duration;

use crate::config::{self, ProxyEntry};
use crate::platform;
use crate::types::ProxyStatus;
use crate::AppState;

pub fn config_proxy(
    app: &tauri::AppHandle,
    state: &AppState,
    host: &str,
    port: &str,
    protocol: &str,
    username: Option<String>,
    password: Option<String>,
) -> Result<String, String> {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if host.trim().is_empty() {
        return Err(format!("[{}] [ERROR] Address must be filled", timestamp));
    }
    if port.trim().is_empty() {
        return Err(format!("[{}] [ERROR] Invalid port", timestamp));
    }

    // System-wide proxy (platform specific)
    platform::enable_proxy(host.trim(), port.trim(), protocol)
        .map_err(|e| format!("[{}] [ERROR] {}", timestamp, e))?;

    // Persist to recent configs
    let port_num: u16 = port.trim().parse().unwrap_or(0);
    let mut cfg = state.config.lock().unwrap();
    let entry = ProxyEntry {
        ip: host.trim().to_string(),
        port: port_num,
        protocol: protocol.to_string(),
        added_at: timestamp.clone(),
        latency_ms: 0,
        last_tested: None,
        username: username.clone(),
        password: password.clone(),
    };
    cfg.recent_configs.retain(|p| p.ip != entry.ip || p.port != entry.port);
    cfg.recent_configs.insert(0, entry);
    if cfg.recent_configs.len() > 5 {
        cfg.recent_configs.truncate(5);
    }
    config::save_config(app, &cfg)?;

    Ok(format!(
        "[{}] [INFO] System proxy configured [{}] {}:{}",
        timestamp, protocol, host.trim(), port.trim()
    ))
}

pub fn disconnect_proxy() -> Result<String, String> {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    platform::disable_proxy().map_err(|e| format!("[{}] [ERROR] {}", timestamp, e))?;
    Ok(format!("[{}] [INFO] System proxy disconnected", timestamp))
}

pub fn get_proxy_status() -> ProxyStatus {
    #[cfg(windows)]
    {
        let (host, port, protocol, is_active) = platform::detect_system_proxy();
        if is_active {
            return ProxyStatus {
                is_active: true,
                host,
                port: port.to_string(),
                protocol,
                username: None,
                password: None,
            };
        }
    }

    ProxyStatus {
        is_active: false,
        host: String::new(),
        port: String::new(),
        protocol: "HTTP".to_string(),
        username: None,
        password: None,
    }
}

pub async fn fetch_proxies_from_url(url: &str) -> Result<Vec<ProxyEntry>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    let mut body = res.text().await.map_err(|e| e.to_string())?;

    if !body.contains(':') && body.len() > 10 {
        use base64::{Engine as _, engine::general_purpose};
        let body_clean = body.trim().replace("\r\n", "").replace("\n", "").replace(" ", "");
        if let Ok(decoded) = general_purpose::STANDARD.decode(body_clean) {
            if let Ok(s) = String::from_utf8(decoded) {
                body = s;
            }
        }
    }

    if body.to_lowercase().contains("<!doctype html") || body.to_lowercase().contains("<html") {
        return Err("The link returned an HTML page instead of a proxy list. This might be due to anti-bot protection or an error page.".to_string());
    }

    let mut entries = Vec::new();
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    use regex::Regex;
    let re = Regex::new(r"(?i)([a-z0-9.-]{4,}):(\d{2,5})").map_err(|e| e.to_string())?;

    for cap in re.captures_iter(&body) {
        let addr = cap[1].to_string();
        if let Ok(port) = cap[2].parse::<u16>() {
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
        return Err(format!(
            "Successfully fetched content, but no valid proxies (Host:Port) were found. \nPreview: {}",
            body.chars().take(100).collect::<String>()
        ));
    }

    Ok(entries)
}

pub fn is_admin() -> bool {
    #[cfg(windows)]
    {
        use std::process::Command;
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
