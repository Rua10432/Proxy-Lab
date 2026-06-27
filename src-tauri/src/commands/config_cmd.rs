// ─── Config Commands ─────────────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::config::{
    AppConfig, FrontendConfigHistoryItem, FrontendProxyPoolItem,
    FrontendTestHistoryItem, ProxyEntry, ScanPreferences, UiPreferences,
};
use crate::service;
use crate::AppState;
use super::validation;

#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>) -> AppConfig {
    service::get_config(&state)
}

#[tauri::command]
pub fn clear_recent_configs(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    service::clear_recent_configs(&app, &state)
}

#[tauri::command]
pub fn add_test_history(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    entry: ProxyEntry,
) -> Result<(), String> {
    validation::validate_proxy_entry(&entry)?;
    service::add_test_history(&app, &state, entry)
}

#[tauri::command]
pub fn clear_test_configs(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    service::clear_test_configs(&app, &state)
}

#[tauri::command]
pub fn save_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    entry: ProxyEntry,
) -> Result<(), String> {
    validation::validate_proxy_entry(&entry)?;
    service::save_proxy(&app, &state, entry)
}

#[tauri::command]
pub fn remove_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    ip: String,
    port: u16,
) -> Result<(), String> {
    validation::validate_host(&ip)?;
    if port == 0 {
        return Err("Port must be between 1 and 65535".to_string());
    }
    service::remove_proxy(&app, &state, ip, port)
}

#[tauri::command]
pub fn clear_proxies(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    service::clear_proxies(&app, &state)
}

#[tauri::command]
pub fn update_scan_preferences(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    prefs: ScanPreferences,
) -> Result<(), String> {
    validation::validate_scan_preferences(&prefs)?;
    service::update_scan_preferences(&app, &state, prefs)
}

#[tauri::command]
pub fn add_scan_history(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    network: String,
) -> Result<(), String> {
    validation::validate_host(&network)?;
    service::add_scan_history(&app, &state, network)
}

#[tauri::command]
pub fn save_full_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    ui_preferences: UiPreferences,
    test_history: Vec<FrontendTestHistoryItem>,
    config_history: Vec<FrontendConfigHistoryItem>,
    proxy_pool: Vec<FrontendProxyPoolItem>,
) -> Result<(), String> {
    validation::validate_ui_preferences(&ui_preferences)?;
    validation::validate_frontend_test_history(&test_history)?;
    validation::validate_frontend_config_history(&config_history)?;
    validation::validate_frontend_proxy_pool(&proxy_pool)?;
    service::save_full_config(&app, &state, ui_preferences, test_history, config_history, proxy_pool)
}

#[tauri::command]
pub fn save_ui_preference(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    validation::validate_frontend_payload_size(&value)?;
    service::save_ui_preference(&app, &state, &key, &value)
}

#[tauri::command]
pub fn save_frontend_key(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    validation::validate_frontend_payload_size(&value)?;
    match key.as_str() {
        "scanPreferences" => {
            let prefs: ScanPreferences =
                serde_json::from_str(&value).map_err(|e| format!("Invalid scan preferences: {e}"))?;
            validation::validate_scan_preferences(&prefs)?;
        }
        "testHistory" => {
            let items: Vec<FrontendTestHistoryItem> =
                serde_json::from_str(&value).map_err(|e| format!("Invalid test history: {e}"))?;
            validation::validate_frontend_test_history(&items)?;
        }
        "configHistory" => {
            let items: Vec<FrontendConfigHistoryItem> =
                serde_json::from_str(&value).map_err(|e| format!("Invalid config history: {e}"))?;
            validation::validate_frontend_config_history(&items)?;
        }
        "proxyPool" => {
            let items: Vec<FrontendProxyPoolItem> =
                serde_json::from_str(&value).map_err(|e| format!("Invalid proxy pool: {e}"))?;
            validation::validate_frontend_proxy_pool(&items)?;
        }
        _ => {}
    }
    service::save_frontend_key(&app, &state, &key, &value)
}
