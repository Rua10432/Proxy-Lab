// ─── Proxy Config Commands ───────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::config::{PacRule, ProxyEntry, ProxyMode};
use crate::local_proxy::{ActiveClientEntry, LocalProxyStatus};
use crate::service;
use crate::types::ProxyStatus;
use crate::AppState;
use crate::config;

#[tauri::command]
pub fn is_admin() -> bool {
    service::is_admin()
}

#[tauri::command]
pub async fn config_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    host: String,
    port: String,
    protocol: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<String, String> {
    service::config_proxy(&app, &state, &host, &port, &protocol, username, password).await
}

#[tauri::command]
pub fn disconnect_proxy(state: tauri::State<'_, AppState>) -> Result<String, String> {
    service::disconnect_proxy(&state)
}

#[tauri::command]
pub async fn get_proxy_status() -> Result<ProxyStatus, String> {
    Ok(service::get_proxy_status())
}

#[tauri::command]
pub async fn test_proxy_connectivity(
    host: String,
    port: u16,
    protocol: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<u128, String> {
    let addr = if host.contains(':') && !host.starts_with('[') {
        format!("[{}]:{}", host, port)
    } else {
        format!("{}:{}", host, port)
    };
    let timeout_ms = 5000;
    crate::proxy::verify_proxy_handshake(&addr, &protocol, timeout_ms, username, password)
        .await
        .map(|latency_us| {
            let latency_ms = (latency_us as f64 / 1000.0).round() as u128;
            latency_ms.max(1)
        })
        .map_err(|e| format!("Connection failed: {}", e))
}

#[tauri::command]
pub async fn fetch_proxies_from_url(url: String) -> Result<Vec<ProxyEntry>, String> {
    service::fetch_proxies_from_url(&url).await
}

#[tauri::command]
pub fn set_force_all_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    service::set_force_all_proxy(&app, &state, enabled)
}

#[tauri::command]
pub fn get_force_all_proxy(state: tauri::State<'_, AppState>) -> bool {
    service::get_force_all_proxy(&state)
}

// ─── Proxy Mode ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_proxy_mode(state: tauri::State<'_, AppState>) -> ProxyMode {
    service::get_proxy_mode(&state)
}

#[tauri::command]
pub fn set_proxy_mode(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mode: ProxyMode,
) -> Result<(), String> {
    service::set_proxy_mode(&app, &state, mode)
}

// ─── PAC Rules ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_pac_rules(state: tauri::State<'_, AppState>) -> Vec<PacRule> {
    service::get_pac_rules(&state)
}

#[tauri::command]
pub fn get_pac_enabled(state: tauri::State<'_, AppState>) -> bool {
    service::get_pac_enabled(&state)
}

#[tauri::command]
pub fn set_pac_enabled(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    service::set_pac_enabled(&app, &state, enabled)
}

#[tauri::command]
pub fn update_pac_rules(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    rules: Vec<PacRule>,
) -> Result<(), String> {
    service::update_pac_rules(&app, &state, rules)
}

#[tauri::command]
pub fn add_pac_rule(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    rule: PacRule,
) -> Result<(), String> {
    service::add_pac_rule(&app, &state, rule)
}

#[tauri::command]
pub fn remove_pac_rule(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    index: usize,
) -> Result<(), String> {
    service::remove_pac_rule(&app, &state, index)
}

#[tauri::command]
pub fn get_pac_content(state: tauri::State<'_, AppState>) -> String {
    let rules = service::get_pac_rules(&state);
    service::generate_pac_content(&rules)
}

// ─── AppOnly Config ──────────────────────────────────────────────────

#[tauri::command]
pub fn get_last_proxy_config(state: tauri::State<'_, AppState>) -> Option<ProxyEntry> {
    state.config.lock().unwrap().recent_configs.first().cloned()
}

#[tauri::command]
pub fn get_app_only_shared(state: tauri::State<'_, AppState>) -> bool {
    state.config.lock().unwrap().app_only.shared
}

#[tauri::command]
pub fn set_app_only_shared(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    shared: bool,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.app_only.shared = shared;
    config::save_config(&app, &cfg)
}

// ─── Local Proxy (AppOnly) ──────────────────────────────────────────────

#[tauri::command]
pub fn get_local_proxy_status(state: tauri::State<'_, AppState>) -> LocalProxyStatus {
    let guard = state.local_proxy.lock().unwrap();
    match guard.as_ref() {
        Some(server) => server.status(),
        None => LocalProxyStatus {
            running: false,
            listen_port: 0,
            bind_addr: String::new(),
            lan_ip: String::new(),
            shared: false,
            active_connections: 0,
            total_connections: 0,
            upstream_host: String::new(),
            upstream_port: 0,
            upstream_protocol: String::new(),
            auth_enabled: false,
        },
    }
}

#[tauri::command]
pub fn get_active_clients(state: tauri::State<'_, AppState>) -> Vec<ActiveClientEntry> {
    let guard = state.local_proxy.lock().unwrap();
    match guard.as_ref() {
        Some(server) => server.get_active_clients(),
        None => Vec::new(),
    }
}

#[tauri::command]
pub fn stop_local_proxy(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.local_proxy.lock().unwrap();
    if let Some(server) = guard.take() {
        server.stop();
    }
    Ok(())
}

#[tauri::command]
pub async fn restart_local_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Reuse the most recent upstream config from history
    let (host, port, protocol, username, password) = {
        let cfg = state.config.lock().unwrap();
        let recent = cfg
            .recent_configs
            .first()
            .ok_or_else(|| "没有找到上次的代理配置，请先保存配置".to_string())?;
        (
            recent.ip.clone(),
            recent.port.to_string(),
            recent.protocol.clone(),
            recent.username.clone(),
            recent.password.clone(),
        )
    };

    service::config_proxy(&app, &state, &host, &port, &protocol, username, password).await
}

#[tauri::command]
pub fn get_local_proxy_listen_port(state: tauri::State<'_, AppState>) -> u16 {
    state.config.lock().unwrap().app_only.listen_port
}

#[tauri::command]
pub fn set_local_proxy_listen_port(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    port: u16,
) -> Result<(), String> {
    if port > 0 && port < 1024 {
        return Err("Ports below 1024 require administrator privileges".to_string());
    }
    let mut cfg = state.config.lock().unwrap();
    cfg.app_only.listen_port = port;
    crate::config::save_config(&app, &cfg)
}

// ─── Local Proxy Auth ────────────────────────────────────────────────────

#[tauri::command]
pub fn set_local_proxy_auth(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    enabled: bool,
    username: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    // 保存到配置
    {
        let mut cfg = state.config.lock().unwrap();
        cfg.app_only.local_auth_enabled = enabled;
        cfg.app_only.local_username = username.clone();
        cfg.app_only.local_password = password.clone();
        crate::config::save_config(&app, &cfg)?;
    }

    // 如果本地代理正在运行，动态更新认证配置（无需重启）
    if let Some(srv) = state.local_proxy.lock().unwrap().as_mut() {
        srv.set_auth(enabled, username, password);
    }
    Ok(())
}

#[tauri::command]
pub fn get_local_proxy_auth(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let cfg = state.config.lock().unwrap();
    serde_json::json!({
        "enabled": cfg.app_only.local_auth_enabled,
        "username": cfg.app_only.local_username,
        "password": cfg.app_only.local_password,
    })
}

// ─── Blocked IP Management ────────────────────────────────────────────────

#[tauri::command]
pub fn get_blocked_ips_enabled(state: tauri::State<'_, AppState>) -> bool {
    state.config.lock().unwrap().app_only.blocked_ips_enabled
}

#[tauri::command]
pub fn set_blocked_ips_enabled(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let ips = {
        let mut cfg = state.config.lock().unwrap();
        cfg.app_only.blocked_ips_enabled = enabled;
        let ips = cfg.app_only.blocked_ips.clone();
        crate::config::save_config(&app, &cfg)?;
        ips
    };

    // Apply dynamically to running server
    if let Some(srv) = state.local_proxy.lock().unwrap().as_mut() {
        if enabled {
            srv.set_blocked_ips(ips);
        } else {
            srv.set_blocked_ips(Vec::new());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_blocked_ips(state: tauri::State<'_, AppState>) -> Vec<String> {
    state.config.lock().unwrap().app_only.blocked_ips.clone()
}

#[tauri::command]
pub fn add_blocked_ip(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    ip: String,
) -> Result<(), String> {
    let ip = ip.trim().to_string();
    if ip.is_empty() {
        return Err("IP address cannot be empty".to_string());
    }

    // Validate: must be a valid IP or CIDR
    if let Some(slash_pos) = ip.find('/') {
        let base = ip[..slash_pos].trim();
        let bits = ip[slash_pos + 1..].trim();
        base.parse::<std::net::IpAddr>()
            .map_err(|_| format!("Invalid IP address in CIDR: {base}"))?;
        let bits_num: u8 = bits.parse()
            .map_err(|_| format!("Invalid CIDR prefix length: {bits}"))?;
        if bits_num > 128 {
            return Err("CIDR prefix length must be <= 128".to_string());
        }
    } else {
        ip.parse::<std::net::IpAddr>()
            .map_err(|_| format!("Invalid IP address: {ip}"))?;
    }

    let mut cfg = state.config.lock().unwrap();
    if cfg.app_only.blocked_ips.contains(&ip) {
        return Err("IP already in blocked list".to_string());
    }
    cfg.app_only.blocked_ips.push(ip.clone());

    // Update running local proxy if active
    if let Some(_server) = state.local_proxy.lock().unwrap().as_ref() {
        // We can't modify blocked_ips on a running server without restarting,
        // so we update the config and it will take effect on next restart.
        // For now, just save.
    }

    crate::config::save_config(&app, &cfg)?;
    Ok(())
}

#[tauri::command]
pub fn remove_blocked_ip(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    ip: String,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    let idx = cfg.app_only.blocked_ips.iter().position(|x| x == &ip);
    match idx {
        Some(i) => {
            cfg.app_only.blocked_ips.remove(i);
            crate::config::save_config(&app, &cfg)?;
            Ok(())
        }
        None => Err("IP not found in blocked list".to_string()),
    }
}

#[tauri::command]
pub fn clear_blocked_ips(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.app_only.blocked_ips.clear();
    crate::config::save_config(&app, &cfg)
}

// ─── IP Rate Limit (AppOnly) ──────────────────────────────────────────────

#[tauri::command]
pub fn get_rate_limit_enabled(state: tauri::State<'_, AppState>) -> bool {
    state.config.lock().unwrap().app_only.rate_limit_enabled
}

#[tauri::command]
pub async fn set_rate_limit_enabled(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let entries = {
        let mut cfg = state.config.lock().unwrap();
        cfg.app_only.rate_limit_enabled = enabled;
        let entries = cfg.app_only.ip_rate_limits.clone();
        crate::config::save_config(&app, &cfg)?;
        entries
    };

    // Apply dynamically to running server (clone Arc to avoid holding std MutexGuard across await)
    let ip_limiters = state.local_proxy.lock().unwrap().as_ref()
        .map(|s| s.ip_limiters.clone());
    if let Some(limiters) = ip_limiters {
        let mut map = limiters.lock().await;
        map.clear();
        if enabled {
            for entry in &entries {
                if entry.upload_limit_kbps == 0 && entry.download_limit_kbps == 0 {
                    continue;
                }
                let ip = entry.ip.parse::<std::net::IpAddr>()
                    .map(|ip| ip.to_string())
                    .unwrap_or_else(|_| entry.ip.clone());
                map.insert(ip, crate::local_proxy::IpRateLimiters::new(
                    entry.upload_limit_kbps, entry.download_limit_kbps,
                ));
            }
        }
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct IpRateLimitView {
    pub ip: String,
    pub upload_limit_kbps: u64,
    pub download_limit_kbps: u64,
}

fn normalize_ip_for_rate_limit(ip: &str) -> Option<String> {
    ip.trim()
        .parse::<std::net::IpAddr>()
        .map(|ip| ip.to_string())
        .ok()
}

#[tauri::command]
pub fn get_ip_rate_limits(state: tauri::State<'_, AppState>) -> Vec<IpRateLimitView> {
    let cfg = state.config.lock().unwrap();
    cfg.app_only.ip_rate_limits.iter().map(|e| IpRateLimitView {
        ip: e.ip.clone(),
        upload_limit_kbps: e.upload_limit_kbps,
        download_limit_kbps: e.download_limit_kbps,
    }).collect()
}

#[tauri::command]
pub async fn set_ip_rate_limit(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    ip: String,
    upload_limit_kbps: u64,
    download_limit_kbps: u64,
) -> Result<(), String> {
    // Validate IP
    let trimmed = ip.trim();
    if trimmed.is_empty() {
        return Err("IP address cannot be empty".to_string());
    }
    let normalized_ip = normalize_ip_for_rate_limit(trimmed)
        .ok_or_else(|| format!("Invalid IP address: {trimmed}"))?;

    // Save to config
    {
        let mut cfg = state.config.lock().unwrap();
        if let Some(existing) = cfg.app_only.ip_rate_limits.iter_mut().find(|e| {
            normalize_ip_for_rate_limit(&e.ip).as_deref() == Some(normalized_ip.as_str())
        }) {
            existing.upload_limit_kbps = upload_limit_kbps;
            existing.download_limit_kbps = download_limit_kbps;
            existing.ip = normalized_ip.clone();
        } else {
            cfg.app_only.ip_rate_limits.push(crate::config::IpRateLimitEntry {
                ip: normalized_ip.clone(),
                upload_limit_kbps,
                download_limit_kbps,
            });
        }
        crate::config::save_config(&app, &cfg)?;
    }

    // Apply to running local proxy server if active
    let ip_limiters = state.local_proxy.lock().unwrap().as_ref().map(|s| s.ip_limiters.clone());
    if let Some(limiters) = ip_limiters {
        let mut map = limiters.lock().await;
        if upload_limit_kbps == 0 && download_limit_kbps == 0 {
            if let Some(existing) = map.remove(&normalized_ip) {
                existing.upload.set_rate(0);
                existing.download.set_rate(0);
            }
            return Ok(());
        }

        match map.get_mut(&normalized_ip) {
            Some(existing) => {
                existing.upload.set_rate(upload_limit_kbps);
                existing.download.set_rate(download_limit_kbps);
            }
            None => {
                map.insert(normalized_ip.clone(),
                    crate::local_proxy::IpRateLimiters::new(upload_limit_kbps, download_limit_kbps));
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_ip_rate_limit(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    ip: String,
) -> Result<(), String> {
    let trimmed = ip.trim();
    if trimmed.is_empty() {
        return Err("IP address cannot be empty".to_string());
    }
    let normalized_ip =
        normalize_ip_for_rate_limit(trimmed).unwrap_or_else(|| trimmed.to_string());

    // Remove from config
    {
        let mut cfg = state.config.lock().unwrap();
        cfg.app_only.ip_rate_limits.retain(|e| {
            normalize_ip_for_rate_limit(&e.ip).as_deref() != Some(normalized_ip.as_str())
                && e.ip != trimmed
        });
        crate::config::save_config(&app, &cfg)?;
    }

    // Remove from running server
    let ip_limiters = state.local_proxy.lock().unwrap().as_ref().map(|s| s.ip_limiters.clone());
    if let Some(limiters) = ip_limiters {
        let mut map = limiters.lock().await;
        if let Some(existing) = map.remove(&normalized_ip) {
            existing.upload.set_rate(0);
            existing.download.set_rate(0);
        }
    }

    Ok(())
}
