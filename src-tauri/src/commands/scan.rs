// ─── Scan Commands ───────────────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::service;
use crate::AppState;
use super::validation;

#[tauri::command]
pub async fn start_proxy_scan(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    network: String,
    mask: String,
    start_port: u16,
    end_port: u16,
    concurrent: usize,
    syn_timeout_ms: u64,
    verify_concurrent: usize,
) -> Result<(), String> {
    validation::validate_scan_request(
        &network,
        &mask,
        start_port,
        end_port,
        concurrent,
        syn_timeout_ms,
        verify_concurrent,
    )?;
    service::start_proxy_scan(
        &app, &state, network, mask, start_port, end_port,
        concurrent, syn_timeout_ms, verify_concurrent,
    )
}

#[tauri::command]
pub fn stop_proxy_scan(state: tauri::State<'_, AppState>) {
    service::stop_proxy_scan(&state);
}
