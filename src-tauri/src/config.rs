use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ─── Data Structures ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProxyEntry {
    pub ip: String,
    pub port: u16,
    pub protocol: String,
    pub latency_ms: u64,
    pub added_at: String,
    pub last_tested: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScanPreferences {
    pub default_mask: String,
    pub default_start_port: u16,
    pub default_end_port: u16,
    pub default_concurrent: usize,
    pub timeout_ms: u64,
    #[serde(default = "default_syn_timeout")]
    pub syn_timeout_ms: u64,
    #[serde(default = "default_verify_concurrent")]
    pub verify_concurrent: usize,
}

fn default_syn_timeout() -> u64 { 500 }
fn default_verify_concurrent() -> usize { 50 }

impl Default for ScanPreferences {
    fn default() -> Self {
        Self {
            default_mask: "255.255.255.0".into(),
            default_start_port: 1,
            default_end_port: 65535,
            default_concurrent: 250,
            timeout_ms: 1500,
            syn_timeout_ms: 500,
            verify_concurrent: 50,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub proxies: Vec<ProxyEntry>,
    pub scan_preferences: ScanPreferences,
    pub scan_history: Vec<String>,
    #[serde(default)]
    pub recent_configs: Vec<ProxyEntry>,
    #[serde(default)]
    pub recent_tests: Vec<ProxyEntry>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            proxies: Vec::new(),
            scan_preferences: ScanPreferences::default(),
            scan_history: Vec::new(),
            recent_configs: Vec::new(),
            recent_tests: Vec::new(),
        }
    }
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

/// 获取配置文件的完整路径
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {}", e))?;

    // 确保目录存在
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    Ok(dir.join("config.json"))
}

/// 从磁盘加载配置，文件不存在则返回默认值
pub fn load_config(app: &tauri::AppHandle) -> AppConfig {
    match config_path(app) {
        Ok(path) => {
            if path.exists() {
                match fs::read_to_string(&path) {
                    Ok(content) => {
                        serde_json::from_str(&content).unwrap_or_else(|e| {
                            eprintln!("Config parse error, using defaults: {}", e);
                            AppConfig::default()
                        })
                    }
                    Err(e) => {
                        eprintln!("Config read error, using defaults: {}", e);
                        AppConfig::default()
                    }
                }
            } else {
                AppConfig::default()
            }
        }
        Err(e) => {
            eprintln!("Config path error, using defaults: {}", e);
            AppConfig::default()
        }
    }
}

/// 将配置写入磁盘
pub fn save_config(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Config serialize error: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Config write error: {}", e))
}

use tauri::Manager;
