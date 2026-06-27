// ─── Ping Commands ───────────────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::service;
use crate::types::BatchProxy;
use crate::AppState;
use super::validation;

#[tauri::command]
pub async fn start_ping_test(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    host: String,
    port: u16,
    protocol: String,
    count: u32,
    timeout_ms: u64,
    interval_ms: u64,
    username: Option<String>,
    password: Option<String>,
    request_id: Option<String>,
) -> Result<(), String> {
    validation::validate_ping_request(
        &host,
        port,
        &protocol,
        count,
        timeout_ms,
        interval_ms,
        &username,
        &password,
    )?;
    service::start_ping_test(
        &app, &state, host, port, protocol, count, timeout_ms, interval_ms,
        username, password, request_id,
    );
    Ok(())
}

#[tauri::command]
pub fn stop_ping_test(state: tauri::State<'_, AppState>) {
    service::stop_ping_test(&state);
}

#[tauri::command]
pub async fn start_batch_ping_test(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    proxies: Vec<BatchProxy>,
    timeout_ms: u64,
    request_id: Option<String>,
) -> Result<(), String> {
    validation::validate_batch_ping(&proxies, timeout_ms)?;
    service::start_batch_ping_test(&app, &state, proxies, timeout_ms, request_id);
    Ok(())
}

#[tauri::command]
pub fn stop_batch_ping_test(state: tauri::State<'_, AppState>) {
    service::stop_batch_ping_test(&state);
}
