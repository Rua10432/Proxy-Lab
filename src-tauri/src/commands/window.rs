#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};

#[tauri::command]
pub fn win_minimize(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn win_toggle_maximize(window: tauri::Window) {
    if let Ok(is_maximized) = window.is_maximized() {
        if is_maximized {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub fn win_close(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn win_hide_to_tray(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
pub fn win_start_drag(window: tauri::Window) {
    // Unmaximize first if maximized — standard Windows: dragging titlebar restores the window
    if let Ok(max) = window.is_maximized() {
        if max {
            let _ = window.unmaximize();
        }
    }
    let _ = window.start_dragging();
}

#[tauri::command]
pub fn win_is_maximized(window: tauri::Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
pub fn win_set_decorations(window: tauri::Window, decorations: bool) {
    let _ = window.set_decorations(decorations);

    #[cfg(target_os = "windows")]
    {
        if let Ok(handle) = window.window_handle() {
            if let RawWindowHandle::Win32(wh) = handle.as_raw() {
                unsafe extern "system" {
                    fn GetWindowLongW(hWnd: *mut std::ffi::c_void, nIndex: i32) -> i32;
                    fn SetWindowLongW(hWnd: *mut std::ffi::c_void, nIndex: i32, dwNewLong: i32) -> i32;
                }
                unsafe {
                    const GWL_EXSTYLE: i32 = -20;
                    const WS_EX_LAYERED: i32 = 0x0008_0000;
                    const WS_EX_TRANSPARENT: i32 = 0x0000_0020;
                    let hwnd = wh.hwnd.get() as *mut std::ffi::c_void;
                    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                    if decorations {
                        let new_ex = ex_style & !(WS_EX_LAYERED | WS_EX_TRANSPARENT);
                        SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex);
                    } else {
                        let new_ex = ex_style | WS_EX_LAYERED;
                        SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex);
                    }
                }
            }
        }
    }
}
