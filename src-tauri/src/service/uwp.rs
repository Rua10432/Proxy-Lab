// ─── UWP Service ───────────────────────────────────────────────────────────
// Business logic for UWP proxy rules (loopback exemption via Win32 API).

use crate::config;
use crate::platform;
use crate::AppState;

pub fn get_uwp_proxy_rules(state: &AppState) -> Vec<config::UwpProxyRule> {
    state.config.lock().unwrap().uwp_proxy_rules.clone()
}

pub fn add_uwp_proxy_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    package_family_name: &str,
    package_full_name: &str,
    app_name: &str,
) -> Result<config::UwpProxyRule, String> {
    let mut cfg = state.config.lock().unwrap();

    // Check if already exists
    if let Some(existing) = cfg.uwp_proxy_rules.iter_mut().find(|r| r.package_family_name == package_family_name) {
        existing.enabled = true;
        let rule = existing.clone();
        config::save_config(app, &cfg)?;

        // Ensure loopback exemption is active
        #[cfg(windows)]
        {
            platform::add_loopback_exemption(package_family_name)
                .map_err(|e| format!("Loopback exemption failed: {}", e))?;
        }
        return Ok(rule);
    }

    let now = chrono::Local::now();
    let rule = config::UwpProxyRule {
        package_family_name: package_family_name.to_string(),
        package_full_name: package_full_name.to_string(),
        app_name: app_name.to_string(),
        enabled: true,
        added_at: now.format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    cfg.uwp_proxy_rules.push(rule.clone());
    config::save_config(app, &cfg)?;

    #[cfg(windows)]
    {
        platform::add_loopback_exemption(package_family_name)?;
    }

    Ok(rule)
}

pub fn remove_uwp_proxy_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    package_family_name: &str,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.uwp_proxy_rules.retain(|r| r.package_family_name != package_family_name);
    config::save_config(app, &cfg)?;

    #[cfg(windows)]
    {
        platform::remove_loopback_exemption(package_family_name)?;
    }

    Ok(())
}

pub fn toggle_uwp_proxy_rule(
    app: &tauri::AppHandle,
    state: &AppState,
    package_family_name: &str,
    enabled: bool,
) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    if let Some(rule) = cfg.uwp_proxy_rules.iter_mut().find(|r| r.package_family_name == package_family_name) {
        rule.enabled = enabled;
    }
    config::save_config(app, &cfg)?;

    #[cfg(windows)]
    {
        if enabled {
            platform::add_loopback_exemption(package_family_name)?;
        } else {
            platform::remove_loopback_exemption(package_family_name)?;
        }
    }

    Ok(())
}
