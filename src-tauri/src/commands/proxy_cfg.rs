// ─── Proxy Config Commands ───────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::config::ProxyEntry;
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
pub fn disconnect_proxy() -> Result<String, String> {
    service::disconnect_proxy()
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
