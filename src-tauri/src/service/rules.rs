// ─── Rules Service ───────────────────────────────────────────────────────────
// Business logic for per-application proxy rules.

use crate::config;
use crate::AppState;

pub fn get_proxy_rules(state: &AppState) -> Vec<config::ProxyRule> {
    state.config.lock().unwrap().proxy_rules.clone()
}

pub fn set_app_proxy_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    app_path: &str,
) -> Result<config::ProxyRule, String> {
    let mut cfg = state.config.lock().unwrap();

    if let Some(existing) = cfg.proxy_rules.iter_mut().find(|r| r.app_path == app_path) {
        existing.enabled = true;
        let rule = existing.clone();
        config::save_config(app, &cfg)?;
        return Ok(rule);
    }

    let app_name = std::path::Path::new(app_path)
        .file_stem()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let now = chrono::Local::now();
    let rule = config::ProxyRule {
        app_path: app_path.to_string(),
        app_name,
        enabled: true,
        added_at: now.format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    cfg.proxy_rules.push(rule.clone());
    config::save_config(app, &cfg)?;
    Ok(rule)
}

pub fn remove_app_proxy_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    app_path: &str,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.proxy_rules.retain(|r| r.app_path != app_path);
    config::save_config(app, &cfg)
}

pub fn toggle_app_proxy_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    app_path: &str,
    enabled: bool,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    if let Some(rule) = cfg.proxy_rules.iter_mut().find(|r| r.app_path == app_path) {
        rule.enabled = enabled;
    }
    config::save_config(app, &cfg)
}
