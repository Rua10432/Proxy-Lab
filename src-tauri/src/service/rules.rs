// ─── Rules Service ───────────────────────────────────────────────────────────
// Business logic for per-application proxy rules.

use std::path::Path;

use sysinfo::System;

use crate::config;
use crate::AppState;

/// Returned when adding a proxy rule, includes whether the app is currently running.
#[derive(Clone, serde::Serialize)]
pub struct AddRuleResult {
    #[serde(flatten)]
    pub rule: config::ProxyRule,
    pub running: bool,
}

fn is_process_running(app_path: &str) -> bool {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let target = Path::new(app_path);
    sys.processes().iter().any(|(_, p)| {
        p.exe().map(|e| Path::new(e.as_os_str()) == target).unwrap_or(false)
    })
}

pub fn get_proxy_rules(state: &AppState) -> Vec<config::ProxyRule> {
    state.config.lock().unwrap().proxy_rules.clone()
}

pub fn set_app_proxy_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    app_path: &str,
) -> Result<AddRuleResult, String> {
    let mut cfg = state.config.lock().unwrap();

    if let Some(existing) = cfg.proxy_rules.iter_mut().find(|r| r.app_path == app_path) {
        existing.enabled = true;
        let rule = existing.clone();
        config::save_config(app, &cfg)?;
        return Ok(AddRuleResult { rule, running: is_process_running(app_path) });
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

    let running = is_process_running(app_path);
    cfg.proxy_rules.push(rule.clone());
    config::save_config(app, &cfg)?;
    Ok(AddRuleResult { rule, running })
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
