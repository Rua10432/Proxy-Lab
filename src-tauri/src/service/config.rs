// ─── Config Service ──────────────────────────────────────────────────────────
// Business logic for configuration CRUD operations.

use crate::config::{
    self, AppConfig, FrontendConfigHistoryItem, FrontendProxyPoolItem,
    FrontendTestHistoryItem, ProxyEntry, ScanPreferences, UiPreferences,
};
use crate::AppState;

pub fn get_config(state: &AppState) -> AppConfig {
    state.config.lock().unwrap().clone()
}

pub fn clear_recent_configs(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.recent_configs.clear();
    config::save_config(app, &cfg)
}

pub fn add_test_history(app: &tauri::AppHandle, state: &AppState, entry: ProxyEntry) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.recent_tests.retain(|p| p.ip != entry.ip || p.port != entry.port);
    cfg.recent_tests.insert(0, entry);
    if cfg.recent_tests.len() > 5 {
        cfg.recent_tests.truncate(5);
    }
    config::save_config(app, &cfg)
}

pub fn clear_test_configs(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.recent_tests.clear();
    config::save_config(app, &cfg)
}

pub fn save_proxy(app: &tauri::AppHandle, state: &AppState, entry: ProxyEntry) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    if let Some(existing) = cfg.proxies.iter_mut().find(|p| p.ip == entry.ip && p.port == entry.port) {
        *existing = entry;
    } else {
        cfg.proxies.push(entry);
    }
    config::save_config(app, &cfg)
}

pub fn remove_proxy(app: &tauri::AppHandle, state: &AppState, ip: String, port: u16) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.proxies.retain(|p| !(p.ip == ip && p.port == port));
    config::save_config(app, &cfg)
}

pub fn clear_proxies(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.proxies.clear();
    config::save_config(app, &cfg)
}

pub fn update_scan_preferences(app: &tauri::AppHandle, state: &AppState, prefs: ScanPreferences) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.scan_preferences = prefs;
    config::save_config(app, &cfg)
}

pub fn add_scan_history(app: &tauri::AppHandle, state: &AppState, network: String) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.scan_history.retain(|h| h != &network);
    cfg.scan_history.insert(0, network);
    cfg.scan_history.truncate(20);
    config::save_config(app, &cfg)
}

pub fn save_ui_preference(
    app: &tauri::AppHandle,
    state: &AppState,
    key: &str,
    value: &str,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    match key {
        "language" => cfg.ui_preferences.language = value.to_string(),
        "dontAskDate" => cfg.ui_preferences.dont_ask_date = value.to_string(),
        "theme" => cfg.ui_preferences.theme = value.to_string(),
        "primaryColor" => cfg.ui_preferences.primary_color = value.to_string(),
        "titleBarMode" => cfg.ui_preferences.title_bar_mode = value.to_string(),
        "closeConfirm" => cfg.ui_preferences.close_confirm = value == "true",
        "exportDirectory" => cfg.ui_preferences.export_directory = value.to_string(),
        _ => return Err(format!("Unknown preference key: {}", key)),
    }
    config::save_config(app, &cfg)
}

pub fn save_frontend_key(
    app: &tauri::AppHandle,
    state: &AppState,
    key: &str,
    value: &str,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    match key {
        "language" => cfg.ui_preferences.language = serde_json::from_str(value).unwrap_or_default(),
        "dontAskDate" => cfg.ui_preferences.dont_ask_date = serde_json::from_str(value).unwrap_or_default(),
        "theme" => cfg.ui_preferences.theme = serde_json::from_str(value).unwrap_or_default(),
        "primaryColor" => cfg.ui_preferences.primary_color = serde_json::from_str(value).unwrap_or_default(),
        "titleBarMode" => cfg.ui_preferences.title_bar_mode = serde_json::from_str(value).unwrap_or_default(),
        "closeConfirm" => cfg.ui_preferences.close_confirm = serde_json::from_str(value).unwrap_or(false),
        "exportDirectory" => cfg.ui_preferences.export_directory = serde_json::from_str(value).unwrap_or_default(),
        "testHistory" => { cfg.frontend_test_history = serde_json::from_str(value).unwrap_or_default(); }
        "configHistory" => { cfg.frontend_config_history = serde_json::from_str(value).unwrap_or_default(); }
        "proxyPool" => { cfg.frontend_proxy_pool = serde_json::from_str(value).unwrap_or_default(); }
        "scanPreferences" => {
            cfg.scan_preferences = serde_json::from_str(value).unwrap_or_default();
        }
        _ => return Err(format!("Unknown frontend key: {}", key)),
    }
    config::save_config(app, &cfg)
}

pub fn save_full_config(
    app: &tauri::AppHandle,
    state: &AppState,
    ui_preferences: UiPreferences,
    test_history: Vec<FrontendTestHistoryItem>,
    config_history: Vec<FrontendConfigHistoryItem>,
    proxy_pool: Vec<FrontendProxyPoolItem>,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.ui_preferences = ui_preferences;
    cfg.frontend_test_history = test_history;
    cfg.frontend_config_history = config_history;
    cfg.frontend_proxy_pool = proxy_pool;
    config::save_config(app, &cfg)
}
