// ─── Monitor Commands ────────────────────────────────────────────────────────
// Thin Tauri wrappers — delegates to service layer.

use crate::service;
use crate::types::{MonitorData, MemoryInfo, LocalProxyPort, UwpAppInfo};
use crate::platform;
use crate::AppState;

#[tauri::command]
pub fn get_tcp_connections(state: tauri::State<'_, AppState>) -> MonitorData {
    service::get_tcp_connections(&state)
}

#[tauri::command]
pub fn get_local_proxy_ports(state: tauri::State<'_, AppState>) -> Vec<LocalProxyPort> {
    service::get_local_proxy_ports(&state)
}

#[tauri::command]
pub fn shittim_mem_task() -> MemoryInfo {
    service::get_memory_info()
}

#[tauri::command]
pub fn get_uwp_apps() -> Vec<UwpAppInfo> {
    platform::get_uwp_processes()
}
