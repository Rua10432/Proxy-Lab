// ─── MTR Commands ────────────────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::mtr;
use crate::service;
use crate::AppState;

#[tauri::command]
pub async fn start_mtr(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    host: String,
    max_hops: u8,
) -> Result<(), String> {
    service::start_mtr(&app, &state, host, max_hops);
    Ok(())
}

#[tauri::command]
pub fn stop_mtr(state: tauri::State<'_, AppState>) {
    service::stop_mtr(&state);
}

#[tauri::command]
pub async fn run_traceroute(host: String, max_hops: u8) -> Result<Vec<mtr::RouteHopPayload>, String> {
    service::run_traceroute(host, max_hops).await
}
