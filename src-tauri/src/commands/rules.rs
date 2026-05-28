// ─── Rules Commands ──────────────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::config;
use crate::service;
use crate::AppState;

#[tauri::command]
pub fn get_proxy_rules(state: tauri::State<'_, AppState>) -> Vec<config::ProxyRule> {
    service::get_proxy_rules(&state)
}

#[tauri::command]
pub fn set_app_proxy_rule(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    app_path: String,
) -> Result<config::ProxyRule, String> {
    service::set_app_proxy_rule(&app, &state, &app_path)
}

#[tauri::command]
pub fn remove_app_proxy_rule(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    app_path: String,
) -> Result<(), String> {
    service::remove_app_proxy_rule(&app, &state, &app_path)
}

#[tauri::command]
pub fn toggle_app_proxy_rule(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    app_path: String,
    enabled: bool,
) -> Result<(), String> {
    service::toggle_app_proxy_rule(&app, &state, &app_path, enabled)
}
