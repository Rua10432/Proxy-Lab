// ─── Proxy Config Commands ───────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::config::{PacRule, ProxyEntry, ProxyMode};
use crate::service;
use crate::types::ProxyStatus;
use crate::AppState;

#[tauri::command]
pub fn is_admin() -> bool {
    service::is_admin()
}

#[tauri::command]
pub fn config_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    host: String,
    port: String,
    protocol: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<String, String> {
    service::config_proxy(&app, &state, &host, &port, &protocol, username, password)
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
