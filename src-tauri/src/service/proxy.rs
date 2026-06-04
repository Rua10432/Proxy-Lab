// ─── Proxy Service ───────────────────────────────────────────────────────────
// Business logic for system proxy configuration, status detection, PAC mode,
// and URL fetching.

use chrono::Local;
use std::time::Duration;

use crate::config::{self, ProxyMode, ProxyEntry, PacRule};
use crate::platform;
use crate::types::ProxyStatus;
use crate::AppState;
use tauri::Manager;

fn save_recent_config(
    app: &tauri::AppHandle,
    state: &AppState,
    host: &str,
    port: &str,
    protocol: &str,
    username: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let port_num: u16 = port.trim().parse().unwrap_or(0);
    let mut cfg = state.config.lock().unwrap();
    let entry = ProxyEntry {
        ip: host.trim().to_string(),
        port: port_num,
        protocol: protocol.to_string(),
        added_at: timestamp,
        latency_ms: 0,
        last_tested: None,
        username,
        password,
    };
    cfg.recent_configs.retain(|p| p.ip != entry.ip || p.port != entry.port);
    cfg.recent_configs.insert(0, entry);
    if cfg.recent_configs.len() > 5 {
        cfg.recent_configs.truncate(5);
    }
    config::save_config(app, &cfg)
}

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

    let mode = state.config.lock().unwrap().proxy_mode.clone();

    match mode {
        ProxyMode::System => {
            // System-wide proxy (platform specific)
            platform::enable_proxy(host.trim(), port.trim(), protocol)
                .map_err(|e| format!("[{}] [ERROR] {}", timestamp, e))?;
            save_recent_config(app, state, host, port, protocol, username, password)?;
            Ok(format!(
                "[{}] [INFO] System proxy configured [{}] {}:{}",
                timestamp, protocol, host.trim(), port.trim()
            ))
        }
        ProxyMode::AppOnly => {
            save_recent_config(app, state, host, port, protocol, username, password)?;
            Ok(format!(
                "[{}] [INFO] App-only proxy saved [{}] {}:{} (no system changes)",
                timestamp, protocol, host.trim(), port.trim()
            ))
        }
        ProxyMode::Pac => {
            // Save config and regenerate PAC file
            save_recent_config(app, state, host, port, protocol, username, password)?;

            // Build a catch-all PAC rule from the current proxy config
            let proxy_target = match protocol.to_uppercase().as_str() {
                "SOCKS5" | "SOCKS" => format!("SOCKS5 {}:{}", host.trim(), port.trim()),
                _ => format!("PROXY {}:{}", host.trim(), port.trim()),
            };

            // Add or update a default catch-all rule
            let mut cfg = state.config.lock().unwrap();
            let has_catchall = cfg.pac_rules.iter().any(|r| r.domain_pattern == "*");
            if !has_catchall {
                cfg.pac_rules.push(PacRule {
                    domain_pattern: "*".to_string(),
                    proxy: proxy_target,
                    enabled: true,
                });
            } else {
                if let Some(r) = cfg.pac_rules.iter_mut().find(|r| r.domain_pattern == "*") {
                    r.proxy = proxy_target;
                    r.enabled = true;
                }
            }
            let rules = cfg.pac_rules.clone();
            let pac_enabled = cfg.pac_enabled;
            drop(cfg);

            if pac_enabled {
                apply_pac(app, &rules)?;
            }

            Ok(format!(
                "[{}] [INFO] PAC proxy saved [{}] {}:{}",
                timestamp, protocol, host.trim(), port.trim()
            ))
        }
    }
}

pub fn disconnect_proxy(state: &AppState) -> Result<String, String> {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mode = state.config.lock().unwrap().proxy_mode.clone();
    match mode {
        ProxyMode::System => {
            platform::disable_proxy().map_err(|e| format!("[{}] [ERROR] {}", timestamp, e))?;
        }
        ProxyMode::AppOnly => {
            // Nothing to undo at system level
        }
        ProxyMode::Pac => {
            let _ = platform::clear_pac_url();
        }
    }

    Ok(format!("[{}] [INFO] Proxy disconnected", timestamp))
}

pub fn get_proxy_status() -> ProxyStatus {
    // Check PAC URL first
    if let Some(pac_url) = platform::get_pac_url() {
        return ProxyStatus {
            is_active: true,
            host: pac_url,
            port: String::new(),
            protocol: "PAC".to_string(),
            username: None,
            password: None,
        };
    }

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

// ─── Proxy Mode ────────────────────────────────────────────────────────────

pub fn get_proxy_mode(state: &AppState) -> ProxyMode {
    state.config.lock().unwrap().proxy_mode.clone()
}

pub fn set_proxy_mode(
    app: &tauri::AppHandle,
    state: &AppState,
    mode: ProxyMode,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.proxy_mode = mode;
    config::save_config(app, &cfg)
}

// ─── PAC Support ───────────────────────────────────────────────────────────

/// Generate PAC file JavaScript content from rules
pub fn generate_pac_content(rules: &[PacRule]) -> String {
    let mut lines = Vec::new();

    // Build rule conditions
    let mut rule_lines = Vec::new();
    for rule in rules {
        if !rule.enabled {
            continue;
        }
        let pattern = &rule.domain_pattern;
        let proxy = &rule.proxy;

        if pattern == "*" {
            // Catch-all: no condition, just use this proxy
            continue;
        }

        let cond = if pattern.starts_with("*.") {
            let domain = &pattern[2..];
            format!("    if (dnsDomainIs(host, \".{}\")) return \"{}\";", domain, proxy)
        } else if pattern.contains('*') || pattern.contains('?') {
            format!("    if (shExpMatch(host, \"{}\")) return \"{}\";", pattern, proxy)
        } else {
            format!("    if (host == \"{}\") return \"{}\";", pattern, proxy)
        };
        rule_lines.push(cond);
    }

    // Find catch-all rule
    let default_proxy = rules
        .iter()
        .find(|r| r.domain_pattern == "*" && r.enabled)
        .map(|r| r.proxy.as_str())
        .unwrap_or("DIRECT");

    lines.push("function FindProxyForURL(url, host) {".to_string());
    lines.extend(rule_lines);
    lines.push(format!("    return \"{}\";", default_proxy));
    lines.push("}".to_string());

    lines.join("\n")
}

/// Apply PAC: write file + set registry
pub fn apply_pac(app: &tauri::AppHandle, rules: &[PacRule]) -> Result<(), String> {
    let content = generate_pac_content(rules);

    let dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {}", e))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let pac_path = dir.join("proxy.pac");
    std::fs::write(&pac_path, &content)
        .map_err(|e| format!("Failed to write PAC file: {}", e))?;

    // Use file:// URL
    let pac_url = format!("file:///{}", pac_path.display().to_string().replace('\\', "/"));
    platform::set_pac_url(&pac_url)
        .map_err(|e| format!("Failed to set PAC URL: {}", e))?;

    Ok(())
}

/// Clear PAC: remove registry + delete file
pub fn clear_pac(app: &tauri::AppHandle) -> Result<(), String> {
    let _ = platform::clear_pac_url();

    if let Ok(dir) = app.path().app_config_dir() {
        let pac_path = dir.join("proxy.pac");
        let _ = std::fs::remove_file(pac_path);
    }

    Ok(())
}

pub fn set_pac_enabled(
    app: &tauri::AppHandle,
    state: &AppState,
    enabled: bool,
) -> Result<(), String> {
    let rules = {
        let mut cfg = state.config.lock().unwrap();
        cfg.pac_enabled = enabled;
        let rules = cfg.pac_rules.clone();
        config::save_config(app, &cfg)?;
        rules
    };

    if enabled {
        apply_pac(app, &rules)?;
    } else {
        clear_pac(app)?;
    }

    Ok(())
}

pub fn get_pac_rules(state: &AppState) -> Vec<PacRule> {
    state.config.lock().unwrap().pac_rules.clone()
}

pub fn get_pac_enabled(state: &AppState) -> bool {
    state.config.lock().unwrap().pac_enabled
}

pub fn update_pac_rules(
    app: &tauri::AppHandle,
    state: &AppState,
    rules: Vec<PacRule>,
) -> Result<(), String> {
    let enabled = {
        let mut cfg = state.config.lock().unwrap();
        cfg.pac_rules = rules.clone();
        config::save_config(app, &cfg)?;
        cfg.pac_enabled
    };

    if enabled {
        apply_pac(app, &rules)?;
    }

    Ok(())
}

pub fn add_pac_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    rule: PacRule,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.pac_rules.push(rule);
    let rules = cfg.pac_rules.clone();
    let enabled = cfg.pac_enabled;
    config::save_config(app, &cfg)?;
    drop(cfg);

    if enabled {
        apply_pac(app, &rules)?;
    }

    Ok(())
}

pub fn remove_pac_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    index: usize,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    if index >= cfg.pac_rules.len() {
        return Err("Rule index out of bounds".to_string());
    }
    cfg.pac_rules.remove(index);
    let rules = cfg.pac_rules.clone();
    let enabled = cfg.pac_enabled;
    config::save_config(app, &cfg)?;
    drop(cfg);

    if enabled {
        apply_pac(app, &rules)?;
    }

    Ok(())
}

// ─── Existing functions ───────────────────────────────────────────────────

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
        use std::os::windows::process::CommandExt;
        let output = Command::new("net")
            .arg("session")
            .creation_flags(0x08000000)
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

pub fn set_force_all_proxy(
    app: &tauri::AppHandle,
    state: &AppState,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        let (host, port, protocol, active) = platform::detect_system_proxy();
        if !active || host.is_empty() || port == 0 {
            return Err("No active system proxy configured. Please set up a proxy first on the Config page.".to_string());
        }
        let proto_prefix = match protocol.to_uppercase().as_str() {
            "SOCKS5" | "SOCKS" => "socks5://",
            _ => "http://",
        };
        let proxy_url = format!("{}{}:{}", proto_prefix, host, port);
        platform::set_user_env_var("HTTP_PROXY", &proxy_url)
            .map_err(|e| format!("Failed to set HTTP_PROXY: {}", e))?;
        platform::set_user_env_var("HTTPS_PROXY", &proxy_url)
            .map_err(|e| format!("Failed to set HTTPS_PROXY: {}", e))?;
        platform::set_user_env_var("http_proxy", &proxy_url)
            .map_err(|e| format!("Failed to set http_proxy: {}", e))?;
        platform::set_user_env_var("https_proxy", &proxy_url)
            .map_err(|e| format!("Failed to set https_proxy: {}", e))?;
    } else {
        let _ = platform::delete_user_env_var("HTTP_PROXY");
        let _ = platform::delete_user_env_var("HTTPS_PROXY");
        let _ = platform::delete_user_env_var("http_proxy");
        let _ = platform::delete_user_env_var("https_proxy");
    }

    let mut cfg = state.config.lock().unwrap();
    cfg.force_all_proxy = enabled;
    config::save_config(app, &cfg)
}

pub fn get_force_all_proxy(state: &AppState) -> bool {
    state.config.lock().unwrap().force_all_proxy
}
