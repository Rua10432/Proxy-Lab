mod config;
mod mtr;
mod types;
mod proxy;
mod platform;
mod commands;
mod service;
mod version;

use std::sync::{
    atomic::{AtomicBool},
    Arc, Mutex,
};
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

use config::AppConfig;

// ─── App State ────────────────────────────────────────────────────────────────

pub struct AppState {
    pub stop_flag: Arc<AtomicBool>,
    pub scan_stop_flag: Arc<AtomicBool>,
    pub mtr_stop_flag: Arc<AtomicBool>,
    pub batch_stop_flag: Arc<AtomicBool>,
    pub config: Arc<Mutex<AppConfig>>,
}

// ─── Entry ────────────────────────────────────────────────────────────────────

pub fn run() {
    // Windows: enable transparent visuals for WebView2 so CSS border-radius
    // clips correctly instead of showing an opaque white background at corners.
    #[cfg(target_os = "windows")]
    {
        let current = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        let flags = "--enable-transparent-visuals";
        if !current.contains(flags) {
            let new = if current.is_empty() { flags.to_string() } else { format!("{} {}", current, flags) };
            unsafe{
                std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", &new);
            }
            
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let cfg = config::load_config(&app.handle());
            app.manage(AppState {
                stop_flag: Arc::new(AtomicBool::new(false)),
                scan_stop_flag: Arc::new(AtomicBool::new(false)),
                mtr_stop_flag: Arc::new(AtomicBool::new(false)),
                batch_stop_flag: Arc::new(AtomicBool::new(false)),
                config: Arc::new(Mutex::new(cfg)),
            });

            // Set dynamic window title with version
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&format!("Proxy Test {}", version::display()));
            }

            // ── Tray Icon ──
            let show_item = MenuItem::with_id(app, "show", "Open Main Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Application", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::fetch_proxies_from_url,
            commands::start_ping_test,
            commands::stop_ping_test,
            commands::start_batch_ping_test,
            commands::stop_batch_ping_test,
            commands::config_proxy,
            commands::start_proxy_scan,
            commands::stop_proxy_scan,
            commands::get_config,
            commands::clear_recent_configs,
            commands::add_test_history,
            commands::clear_test_configs,
            commands::save_proxy,
            commands::remove_proxy,
            commands::clear_proxies,
            commands::update_scan_preferences,
            commands::add_scan_history,
            commands::start_mtr,
            commands::stop_mtr,
            commands::run_traceroute,
            commands::win_minimize,
            commands::win_toggle_maximize,
            commands::win_close,
            commands::win_start_drag,
            commands::win_is_maximized,
            commands::win_set_decorations,
            commands::get_tcp_connections,
            commands::get_proxy_rules,
            commands::set_app_proxy_rule,
            commands::remove_app_proxy_rule,
            commands::toggle_app_proxy_rule,
            commands::get_proxy_status,
            commands::get_local_proxy_ports,
            commands::disconnect_proxy,
            commands::shittim_mem_task,
            commands::test_proxy_connectivity,
            commands::is_admin,
            commands::get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
