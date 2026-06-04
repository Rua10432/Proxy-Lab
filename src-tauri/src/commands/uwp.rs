// ─── UWP Commands ──────────────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::config;
use crate::service;
use crate::AppState;

#[tauri::command]
pub fn get_uwp_proxy_rules(state: tauri::State<'_, AppState>) -> Vec<config::UwpProxyRule> {
    service::get_uwp_proxy_rules(&state)
}

#[tauri::command]
pub fn add_uwp_proxy_rule(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    package_family_name: String,
    package_full_name: String,
    app_name: String,
) -> Result<config::UwpProxyRule, String> {
    service::add_uwp_proxy_rule(&app, &state, &package_family_name, &package_full_name, &app_name)
}

#[tauri::command]
pub fn remove_uwp_proxy_rule(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    package_family_name: String,
) -> Result<(), String> {
    service::remove_uwp_proxy_rule(&app, &state, &package_family_name)
}

#[tauri::command]
pub fn toggle_uwp_proxy_rule(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    package_family_name: String,
    enabled: bool,
) -> Result<(), String> {
    service::toggle_uwp_proxy_rule(&app, &state, &package_family_name, enabled)
}
