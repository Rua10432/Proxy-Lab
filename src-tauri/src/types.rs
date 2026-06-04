use serde::{Serialize, Deserialize};
use crate::config;

// ─── Event Payloads ───────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
pub struct PingResultPayload {
    pub seq: u32,
    pub ms: Option<u128>,
    pub error: Option<String>,
    pub request_id: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct PingDonePayload {
    pub request_id: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct PingStoppedPayload {
    pub request_id: Option<String>,
}

// ─── Batch Ping Types ─────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
pub struct BatchProxy {
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub index: usize,
}

#[derive(Clone, Serialize)]
pub struct BatchPingResultPayload {
    pub index: usize,
    pub host: String,
    pub port: u16,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub request_id: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct BatchPingDonePayload {
    pub total: usize,
    pub ok: usize,
    pub fail: usize,
    pub request_id: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct ScanResultPayload {
    pub ip: String,
    pub port: u16,
    pub protocol: String,
    pub latency_ms: u64,
}

#[derive(Clone, Serialize)]
pub struct ScanProgressPayload {
    pub scanned: u64,
    pub total: u64,
    pub found: u64,
}

#[derive(Clone, Serialize)]
pub struct ScanPortOpenPayload {
    pub open_count: u64,
}

// ─── Monitor Types ────────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Debug)]
pub struct TcpConnection {
    pub local_addr: String,
    pub local_port: u16,
    pub remote_addr: String,
    pub remote_port: u16,
    pub state: String,
    pub pid: u32,
    pub process_name: String,
    pub process_path: String,
    pub is_proxy_traffic: bool,
    pub protocol: String,
}

#[derive(Clone, Serialize, Debug)]
pub struct MonitorData {
    pub connections: Vec<TcpConnection>,
    pub proxy_active: bool,
    pub proxy_host: String,
    pub proxy_port: u16,
    pub proxy_rules: Vec<config::ProxyRule>,
    pub summary: MonitorSummary,
}

#[derive(Clone, Serialize, Debug)]
pub struct MonitorSummary {
    pub total_connections: usize,
    pub proxy_connections: usize,
    pub direct_connections: usize,
    pub listening_ports: usize,
    pub unique_processes: usize,
    pub unique_proxy_processes: usize,
}

// ─── Proxy Status ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ProxyStatus {
    pub is_active: bool,
    pub host: String,
    pub port: String,
    pub protocol: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Serialize)]
pub struct MemoryInfo {
    pub used_mb: u64,
    pub total_gb: f64,
    pub percent: f64,
}

#[derive(Serialize)]
pub struct LocalProxyPort {
    pub port: u16,
    pub protocol: String,
    pub process_name: String,
    pub process_pid: u32,
    pub process_path: String,
    pub state: String,
    pub is_known_proxy: bool,
    pub local_addr: String,
}

// ─── UWP App Info ─────────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Debug)]
pub struct UwpAppInfo {
    pub package_family_name: String,
    pub package_full_name: Option<String>,
    pub pid: u32,
    pub process_name: String,
    pub executable_path: String,
}
