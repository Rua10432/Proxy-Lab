// ─── Config Service ──────────────────────────────────────────────────────────
// Business logic for configuration CRUD operations.

use crate::config::{self, AppConfig, ProxyEntry, ScanPreferences};
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
