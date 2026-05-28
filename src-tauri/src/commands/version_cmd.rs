// ─── Version Command ────────────────────────────────────────────────────────

use crate::version;

#[tauri::command]
pub fn get_app_version() -> version::VersionInfo {
    version::info()
}
