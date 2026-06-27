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
#[serde(rename_all = "camelCase")]
pub struct ScanPreferences {
    #[serde(alias = "default_mask")]
    pub default_mask: String,
    #[serde(alias = "default_start_port")]
    pub default_start_port: u16,
    #[serde(alias = "default_end_port")]
    pub default_end_port: u16,
    #[serde(alias = "default_concurrent")]
    pub default_concurrent: usize,
    #[serde(alias = "timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_syn_timeout", alias = "syn_timeout_ms")]
    pub syn_timeout_ms: u64,
    #[serde(default = "default_verify_concurrent", alias = "verify_concurrent")]
    pub verify_concurrent: usize,
    /// 代理检测时需要匹配的响应头列表（HTTP 代理）
    #[serde(default = "default_detection_headers", alias = "detection_headers")]
    pub detection_headers: Vec<String>,
    /// 是否启用严格模式：要求至少匹配一个 detection_headers 才算 HTTP 代理
    #[serde(default, alias = "strict_detection")]
    pub strict_detection: bool,
}

fn default_detection_headers() -> Vec<String> {
    vec![
        "Via".into(),
        "X-Cache".into(),
        "X-Proxy".into(),
        "Proxy-Connection".into(),
        "X-Proxy-Agent".into(),
    ]
}

fn default_syn_timeout() -> u64 { 500 }
fn default_verify_concurrent() -> usize { 50 }

impl Default for ScanPreferences {
    fn default() -> Self {
        Self {
            default_mask: "255.255.255.0".into(),
            default_start_port: 1,
            default_end_port: 65535,
            default_concurrent: 80,
            timeout_ms: 1500,
            syn_timeout_ms: 500,
            verify_concurrent: 50,
            detection_headers: default_detection_headers(),
            strict_detection: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ProxyMode {
    System,
    AppOnly,
    Pac,
}

impl Default for ProxyMode {
    fn default() -> Self { Self::System }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PacRule {
    pub domain_pattern: String,
    pub proxy: String,          // e.g. "PROXY 127.0.0.1:7890" or "SOCKS5 127.0.0.1:1080" or "DIRECT"
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProxyRule {
    pub app_path: String,
    pub app_name: String,
    pub enabled: bool,
    pub added_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UwpProxyRule {
    pub package_family_name: String,
    pub package_full_name: String,
    pub app_name: String,
    pub enabled: bool,
    pub added_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IpRateLimitEntry {
    pub ip: String,
    pub upload_limit_kbps: u64,
    pub download_limit_kbps: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppOnlyConfig {
    /// 是否在应用启动时自动启动本地代理
    #[serde(default)]
    pub auto_start: bool,
    /// 上次使用的本地代理监听端口（0 = 随机）
    #[serde(default)]
    pub listen_port: u16,
    /// 是否允许局域网共享（绑定 0.0.0.0）
    #[serde(default)]
    pub shared: bool,
    /// 是否启用 IP 封锁功能
    #[serde(default)]
    pub blocked_ips_enabled: bool,
    /// 要封锁的目标IP列表（支持具体 IP 和 CIDR 格式）
    #[serde(default)]
    pub blocked_ips: Vec<String>,
    /// 是否启用 IP 白名单功能
    #[serde(default)]
    pub allowed_ips_enabled: bool,
    /// 允许访问本地代理或目标地址的 IP 列表（支持具体 IP 和 CIDR 格式）
    #[serde(default)]
    pub allowed_ips: Vec<String>,
    /// 是否启用 IP 限速功能
    #[serde(default)]
    pub rate_limit_enabled: bool,
    /// 按客户端IP限速配置
    #[serde(default)]
    pub ip_rate_limits: Vec<IpRateLimitEntry>,
    /// 是否启用客户端认证（连接本地代理时需要用户名密码）
    #[serde(default)]
    pub local_auth_enabled: bool,
    /// 客户端认证用户名
    #[serde(default)]
    pub local_username: Option<String>,
    /// 客户端认证密码
    #[serde(default)]
    pub local_password: Option<String>,
}

impl Default for AppOnlyConfig {
    fn default() -> Self {
        Self {
            auto_start: false,
            listen_port: 0,
            shared: false,
            blocked_ips_enabled: false,
            blocked_ips: Vec::new(),
            allowed_ips_enabled: false,
            allowed_ips: Vec::new(),
            rate_limit_enabled: false,
            ip_rate_limits: Vec::new(),
            local_auth_enabled: false,
            local_username: None,
            local_password: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UiPreferences {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_primary_color")]
    pub primary_color: String,
    #[serde(default = "default_title_bar_mode")]
    pub title_bar_mode: String,
    #[serde(default = "default_close_confirm")]
    pub close_confirm: bool,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub export_directory: String,
    #[serde(default)]
    pub dont_ask_date: String,
}

fn default_theme() -> String { "dark".to_string() }
fn default_primary_color() -> String { "#9eddc8".to_string() }
fn default_title_bar_mode() -> String { "custom".to_string() }
fn default_close_confirm() -> bool { true }

impl Default for UiPreferences {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            primary_color: default_primary_color(),
            title_bar_mode: default_title_bar_mode(),
            close_confirm: default_close_confirm(),
            language: String::new(),
            export_directory: String::new(),
            dont_ask_date: String::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FrontendTestHistoryItem {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub protocol: String,
    #[serde(default)]
    pub avg_latency: Option<u64>,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FrontendConfigHistoryItem {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub protocol: String,
    #[serde(default)]
    pub username: Option<String>,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FrontendProxyPoolItem {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub protocol: String,
    #[serde(default)]
    pub latency: Option<f64>,
    #[serde(default)]
    pub status: String,
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
    #[serde(default)]
    pub proxy_rules: Vec<ProxyRule>,
    #[serde(default)]
    pub uwp_proxy_rules: Vec<UwpProxyRule>,
    #[serde(default)]
    pub ui_preferences: UiPreferences,
    #[serde(default)]
    pub frontend_test_history: Vec<FrontendTestHistoryItem>,
    #[serde(default)]
    pub frontend_config_history: Vec<FrontendConfigHistoryItem>,
    #[serde(default)]
    pub frontend_proxy_pool: Vec<FrontendProxyPoolItem>,
    #[serde(default)]
    pub force_all_proxy: bool,
    #[serde(default)]
    pub proxy_mode: ProxyMode,
    #[serde(default)]
    pub pac_rules: Vec<PacRule>,
    #[serde(default)]
    pub pac_enabled: bool,
    #[serde(default)]
    pub app_only: AppOnlyConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            proxies: Vec::new(),
            scan_preferences: ScanPreferences::default(),
            scan_history: Vec::new(),
            recent_configs: Vec::new(),
            recent_tests: Vec::new(),
            proxy_rules: Vec::new(),
            uwp_proxy_rules: Vec::new(),
            ui_preferences: UiPreferences::default(),
            frontend_test_history: Vec::new(),
            frontend_config_history: Vec::new(),
            frontend_proxy_pool: Vec::new(),
            force_all_proxy: false,
            proxy_mode: ProxyMode::default(),
            pac_rules: Vec::new(),
            pac_enabled: false,
            app_only: AppOnlyConfig::default(),
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
