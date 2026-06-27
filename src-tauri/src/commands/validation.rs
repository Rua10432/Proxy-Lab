use std::net::{IpAddr, Ipv4Addr};
use std::str::FromStr;

use crate::config::{
    FrontendConfigHistoryItem, FrontendProxyPoolItem, FrontendTestHistoryItem, PacRule,
    ProxyEntry, ScanPreferences, UiPreferences,
};
use crate::types::BatchProxy;

pub(super) const MAX_SCAN_CONCURRENT: usize = 500;
pub(super) const MAX_VERIFY_CONCURRENT: usize = 200;
pub(super) const MAX_SCAN_HOSTS: u64 = 65_534;
pub(super) const MAX_SCAN_TASKS: u64 = 20_000_000;
pub(super) const MIN_TIMEOUT_MS: u64 = 50;
pub(super) const MAX_TIMEOUT_MS: u64 = 30_000;
pub(super) const MAX_PING_COUNT: u32 = 100;
pub(super) const MAX_PING_INTERVAL_MS: u64 = 60_000;
pub(super) const MAX_BATCH_PROXIES: usize = 5_000;
pub(super) const MAX_RATE_LIMIT_KBPS: u64 = 1_000_000;
pub(super) const MAX_FRONTEND_ITEMS: usize = 5_000;
pub(super) const MAX_FRONTEND_VALUE_BYTES: usize = 512 * 1024;

fn nonzero_port(port: u16, field: &str) -> Result<(), String> {
    if port == 0 {
        return Err(format!("{field} must be between 1 and 65535"));
    }
    Ok(())
}

fn parse_nonzero_port(port: &str, field: &str) -> Result<u16, String> {
    let port = port.trim();
    if port.is_empty() {
        return Err(format!("{field} cannot be empty"));
    }
    let parsed = port
        .parse::<u16>()
        .map_err(|_| format!("{field} must be between 1 and 65535"))?;
    nonzero_port(parsed, field)?;
    Ok(parsed)
}

fn trim_brackets(host: &str) -> &str {
    host.strip_prefix('[')
        .and_then(|v| v.strip_suffix(']'))
        .unwrap_or(host)
}

fn has_forbidden_host_chars(value: &str) -> bool {
    value.chars().any(|c| {
        c.is_control() || c.is_whitespace() || matches!(c, '/' | '\\' | '@' | '#' | '?' | '&' | '=')
    })
}

fn is_valid_domain(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    if host.len() > 253 || host.starts_with('.') || host.ends_with('.') {
        return false;
    }

    host.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    })
}

pub(super) fn validate_host(host: &str) -> Result<(), String> {
    let host = host.trim();
    if host.is_empty() {
        return Err("Host cannot be empty".to_string());
    }
    if host.len() > 253 {
        return Err("Host is too long".to_string());
    }

    let unwrapped = trim_brackets(host);
    if unwrapped.parse::<IpAddr>().is_ok() {
        return Ok(());
    }

    if has_forbidden_host_chars(host) || host.contains(':') {
        return Err(format!("Invalid host: {host}"));
    }
    if !is_valid_domain(host) {
        return Err(format!("Invalid host: {host}"));
    }
    Ok(())
}

pub(super) fn validate_proxy_protocol(protocol: &str) -> Result<(), String> {
    match protocol.trim().to_ascii_uppercase().as_str() {
        "HTTP" | "HTTPS" | "SOCKS" | "SOCKS5" => Ok(()),
        _ => Err("Protocol must be HTTP, HTTPS, or SOCKS5".to_string()),
    }
}

pub(super) fn validate_auth(
    username: &Option<String>,
    password: &Option<String>,
) -> Result<(), String> {
    for (label, value) in [("Username", username), ("Password", password)] {
        if let Some(value) = value {
            if value.len() > 255 {
                return Err(format!("{label} must be 255 bytes or less"));
            }
        }
    }
    Ok(())
}

pub(super) fn validate_proxy_target(
    host: &str,
    port: u16,
    protocol: &str,
    username: &Option<String>,
    password: &Option<String>,
) -> Result<(), String> {
    validate_host(host)?;
    nonzero_port(port, "Port")?;
    validate_proxy_protocol(protocol)?;
    validate_auth(username, password)
}

pub(super) fn validate_proxy_target_str_port(
    host: &str,
    port: &str,
    protocol: &str,
    username: &Option<String>,
    password: &Option<String>,
) -> Result<u16, String> {
    validate_host(host)?;
    let parsed = parse_nonzero_port(port, "Port")?;
    validate_proxy_protocol(protocol)?;
    validate_auth(username, password)?;
    Ok(parsed)
}

pub(super) fn validate_proxy_entry(entry: &ProxyEntry) -> Result<(), String> {
    validate_proxy_target(
        &entry.ip,
        entry.port,
        &entry.protocol,
        &entry.username,
        &entry.password,
    )
}

pub(super) fn validate_scan_request(
    network: &str,
    mask: &str,
    start_port: u16,
    end_port: u16,
    concurrent: usize,
    syn_timeout_ms: u64,
    verify_concurrent: usize,
) -> Result<(), String> {
    let start_ip = Ipv4Addr::from_str(network.trim())
        .map_err(|_| "Network must be a valid IPv4 address".to_string())?;
    let mask_ip = Ipv4Addr::from_str(mask.trim())
        .map_err(|_| "Subnet mask must be a valid IPv4 address".to_string())?;
    validate_subnet_mask(mask_ip)?;
    validate_port_range(start_port, end_port)?;

    if concurrent == 0 || concurrent > MAX_SCAN_CONCURRENT {
        return Err(format!(
            "Scan concurrency must be between 1 and {MAX_SCAN_CONCURRENT}"
        ));
    }
    validate_timeout(syn_timeout_ms, "SYN timeout")?;
    if verify_concurrent == 0 || verify_concurrent > MAX_VERIFY_CONCURRENT {
        return Err(format!(
            "Verify concurrency must be between 1 and {MAX_VERIFY_CONCURRENT}"
        ));
    }

    let start_u32 = u32::from(start_ip);
    let mask_u32 = u32::from(mask_ip);
    let network_id = start_u32 & mask_u32;
    let broadcast_id = network_id | !mask_u32;
    let host_count = (broadcast_id - network_id).saturating_sub(1) as u64;
    if host_count == 0 {
        return Err("Subnet has no usable IPv4 hosts to scan".to_string());
    }
    if host_count > MAX_SCAN_HOSTS {
        return Err(format!(
            "Subnet is too large; scan at most {MAX_SCAN_HOSTS} hosts at a time"
        ));
    }

    let port_count = end_port as u64 - start_port as u64 + 1;
    let task_count = host_count.saturating_mul(port_count);
    if task_count > MAX_SCAN_TASKS {
        return Err(format!(
            "Scan request is too large ({task_count} probes); narrow the subnet or port range"
        ));
    }

    Ok(())
}

pub(super) fn validate_scan_preferences(prefs: &ScanPreferences) -> Result<(), String> {
    let mask = Ipv4Addr::from_str(prefs.default_mask.trim())
        .map_err(|_| "Default subnet mask must be a valid IPv4 address".to_string())?;
    validate_subnet_mask(mask)?;
    validate_port_range(prefs.default_start_port, prefs.default_end_port)?;

    if prefs.default_concurrent == 0 || prefs.default_concurrent > MAX_SCAN_CONCURRENT {
        return Err(format!(
            "Default concurrency must be between 1 and {MAX_SCAN_CONCURRENT}"
        ));
    }
    validate_timeout(prefs.timeout_ms, "Timeout")?;
    validate_timeout(prefs.syn_timeout_ms, "SYN timeout")?;
    if prefs.verify_concurrent == 0 || prefs.verify_concurrent > MAX_VERIFY_CONCURRENT {
        return Err(format!(
            "Verify concurrency must be between 1 and {MAX_VERIFY_CONCURRENT}"
        ));
    }
    if prefs.detection_headers.len() > 32 {
        return Err("Too many detection headers".to_string());
    }
    for header in &prefs.detection_headers {
        if header.is_empty() || header.len() > 64 || header.chars().any(|c| c.is_control()) {
            return Err("Detection headers must be 1-64 printable characters".to_string());
        }
    }

    Ok(())
}

pub(super) fn validate_ping_request(
    host: &str,
    port: u16,
    protocol: &str,
    count: u32,
    timeout_ms: u64,
    interval_ms: u64,
    username: &Option<String>,
    password: &Option<String>,
) -> Result<(), String> {
    validate_proxy_target(host, port, protocol, username, password)?;
    if count == 0 || count > MAX_PING_COUNT {
        return Err(format!("Ping count must be between 1 and {MAX_PING_COUNT}"));
    }
    validate_timeout(timeout_ms, "Timeout")?;
    if interval_ms > MAX_PING_INTERVAL_MS {
        return Err(format!(
            "Ping interval must be {MAX_PING_INTERVAL_MS} ms or less"
        ));
    }
    Ok(())
}

pub(super) fn validate_batch_ping(
    proxies: &[BatchProxy],
    timeout_ms: u64,
) -> Result<(), String> {
    validate_timeout(timeout_ms, "Timeout")?;
    if proxies.is_empty() {
        return Err("Proxy pool is empty".to_string());
    }
    if proxies.len() > MAX_BATCH_PROXIES {
        return Err(format!(
            "Batch proxy test supports at most {MAX_BATCH_PROXIES} proxies"
        ));
    }
    for proxy in proxies {
        validate_proxy_target(&proxy.host, proxy.port, &proxy.protocol, &None, &None)
            .map_err(|e| format!("Proxy #{} is invalid: {e}", proxy.index + 1))?;
    }
    Ok(())
}

pub(super) fn validate_fetch_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.len() > 2048 {
        return Err("URL is too long".to_string());
    }
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("Only http:// and https:// URLs are allowed".to_string());
    }
    if url.chars().any(|c| c.is_control()) {
        return Err("URL contains invalid characters".to_string());
    }
    Ok(())
}

pub(super) fn validate_local_proxy_listen_port(port: u16) -> Result<(), String> {
    if port > 0 && port < 1024 {
        return Err("Ports below 1024 require administrator privileges".to_string());
    }
    Ok(())
}

pub(super) fn validate_local_proxy_auth(
    enabled: bool,
    username: &Option<String>,
    password: &Option<String>,
) -> Result<(), String> {
    validate_auth(username, password)?;
    if enabled && username.as_deref().unwrap_or("").trim().is_empty() {
        return Err("Username is required when local proxy authentication is enabled".to_string());
    }
    Ok(())
}

pub(super) fn validate_rate_limit(upload_kbps: u64, download_kbps: u64) -> Result<(), String> {
    if upload_kbps > MAX_RATE_LIMIT_KBPS || download_kbps > MAX_RATE_LIMIT_KBPS {
        return Err(format!(
            "Rate limit must be {MAX_RATE_LIMIT_KBPS} KB/s or less"
        ));
    }
    Ok(())
}

pub(super) fn validate_pac_rule(rule: &PacRule) -> Result<(), String> {
    validate_pac_domain(&rule.domain_pattern)?;
    validate_pac_proxy(&rule.proxy)?;
    Ok(())
}

pub(super) fn validate_frontend_payload_size(value: &str) -> Result<(), String> {
    if value.len() > MAX_FRONTEND_VALUE_BYTES {
        return Err(format!(
            "Stored frontend value is too large; limit is {MAX_FRONTEND_VALUE_BYTES} bytes"
        ));
    }
    Ok(())
}

pub(super) fn validate_ui_preferences(prefs: &UiPreferences) -> Result<(), String> {
    for value in [
        prefs.theme.as_str(),
        prefs.primary_color.as_str(),
        prefs.title_bar_mode.as_str(),
        prefs.language.as_str(),
        prefs.export_directory.as_str(),
        prefs.dont_ask_date.as_str(),
    ] {
        if value.len() > 1024 || value.chars().any(|c| c.is_control() && c != '\t') {
            return Err("UI preferences contain invalid text".to_string());
        }
    }
    Ok(())
}

pub(super) fn validate_frontend_test_history(
    items: &[FrontendTestHistoryItem],
) -> Result<(), String> {
    if items.len() > MAX_FRONTEND_ITEMS {
        return Err(format!("Test history supports at most {MAX_FRONTEND_ITEMS} items"));
    }
    for item in items {
        validate_proxy_target(&item.host, item.port, &item.protocol, &None, &None)?;
    }
    Ok(())
}

pub(super) fn validate_frontend_config_history(
    items: &[FrontendConfigHistoryItem],
) -> Result<(), String> {
    if items.len() > MAX_FRONTEND_ITEMS {
        return Err(format!(
            "Config history supports at most {MAX_FRONTEND_ITEMS} items"
        ));
    }
    for item in items {
        validate_proxy_target(
            &item.host,
            item.port,
            &item.protocol,
            &item.username,
            &None,
        )?;
    }
    Ok(())
}

pub(super) fn validate_frontend_proxy_pool(
    items: &[FrontendProxyPoolItem],
) -> Result<(), String> {
    if items.len() > MAX_FRONTEND_ITEMS {
        return Err(format!("Proxy pool supports at most {MAX_FRONTEND_ITEMS} items"));
    }
    for item in items {
        validate_proxy_target(&item.host, item.port, &item.protocol, &None, &None)?;
    }
    Ok(())
}

fn validate_port_range(start_port: u16, end_port: u16) -> Result<(), String> {
    nonzero_port(start_port, "Start port")?;
    nonzero_port(end_port, "End port")?;
    if start_port > end_port {
        return Err("End port must be greater than or equal to start port".to_string());
    }
    Ok(())
}

fn validate_timeout(timeout_ms: u64, label: &str) -> Result<(), String> {
    if !(MIN_TIMEOUT_MS..=MAX_TIMEOUT_MS).contains(&timeout_ms) {
        return Err(format!(
            "{label} must be between {MIN_TIMEOUT_MS} and {MAX_TIMEOUT_MS} ms"
        ));
    }
    Ok(())
}

fn validate_subnet_mask(mask: Ipv4Addr) -> Result<(), String> {
    let mask_u32 = u32::from(mask);
    if mask_u32 == 0 {
        return Err("Subnet mask is too broad".to_string());
    }
    let inverted = !mask_u32;
    if inverted & (inverted + 1) != 0 {
        return Err("Subnet mask must be contiguous".to_string());
    }
    Ok(())
}

fn validate_pac_domain(pattern: &str) -> Result<(), String> {
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern.len() > 253 {
        return Err("PAC domain pattern is invalid".to_string());
    }
    if pattern == "*" {
        return Ok(());
    }
    if pattern.chars().any(|c| c.is_control() || matches!(c, '"' | '\'' | '\\' | ';')) {
        return Err("PAC domain pattern contains invalid characters".to_string());
    }
    if !pattern
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'*' | b'?'))
    {
        return Err("PAC domain pattern contains invalid characters".to_string());
    }
    Ok(())
}

fn validate_pac_proxy(proxy: &str) -> Result<(), String> {
    let proxy = proxy.trim();
    if proxy.eq_ignore_ascii_case("DIRECT") {
        return Ok(());
    }
    if proxy.chars().any(|c| c.is_control() || matches!(c, '"' | '\'' | '\\' | ';')) {
        return Err("PAC proxy target contains invalid characters".to_string());
    }

    let mut parts = proxy.split_whitespace();
    let protocol = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    if parts.next().is_some() || target.is_empty() {
        return Err("PAC proxy must be DIRECT or '<protocol> host:port'".to_string());
    }
    match protocol.to_ascii_uppercase().as_str() {
        "PROXY" | "HTTP" | "HTTPS" | "SOCKS" | "SOCKS5" => {}
        _ => return Err("PAC proxy protocol must be PROXY, HTTP, HTTPS, or SOCKS5".to_string()),
    }
    let (host, port) = split_host_port(target)
        .ok_or_else(|| "PAC proxy target must include host and port".to_string())?;
    let parsed_port = port
        .parse::<u16>()
        .map_err(|_| "PAC proxy port must be between 1 and 65535".to_string())?;
    let target_protocol = if protocol.eq_ignore_ascii_case("PROXY") {
        "HTTP"
    } else {
        protocol
    };
    validate_proxy_target(host, parsed_port, target_protocol, &None, &None)
}

fn split_host_port(value: &str) -> Option<(&str, &str)> {
    if let Some(rest) = value.strip_prefix('[') {
        let end = rest.find(']')?;
        let host = &rest[..end];
        let port = rest.get(end + 1..)?.strip_prefix(':')?;
        return Some((host, port));
    }

    let idx = value.rfind(':')?;
    Some((&value[..idx], &value[idx + 1..]))
}
