// ─── Export Commands ─────────────────────────────────────────────────────────
// Write export files to a user-specified path.

use std::fs;
use std::path::Path;

#[tauri::command]
pub fn write_export_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);

    // Create parent directories if they don't exist
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::write(p, &content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}
