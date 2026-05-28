use std::net::IpAddr;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::timeout;

/// 格式化地址为 "host:port"，IPv6 自动加中括号
fn format_addr(ip: IpAddr, port: u16) -> String {
    match ip {
        IpAddr::V4(v4) => format!("{}:{}", v4, port),
        IpAddr::V6(v6) => format!("[{}]:{}", v6, port),
    }
}

/// 代理协议级探测逻辑
pub async fn verify_proxy_handshake(
    addr: &str,
    protocol: &str,
    timeout_ms: u64,
    username: Option<String>,
    password: Option<String>,
) -> Result<u128, String> {
    let timeout_duration = Duration::from_millis(timeout_ms);
    let start = Instant::now();

    match protocol.to_uppercase().as_str() {
        "SOCKS5" | "SOCKS" => {
            let mut stream = timeout(timeout_duration, tokio::net::TcpStream::connect(addr))
                .await
                .map_err(|_| "Connection timed out".to_string())?
                .map_err(|e| format!("Connection failed: {e}"))?;

            let socks5_greeting = [0x05, 0x02, 0x00, 0x02];
            stream.write_all(&socks5_greeting).await.map_err(|e| format!("Write failed: {e}"))?;

            let mut buf = [0u8; 2];
            timeout(timeout_duration, stream.read_exact(&mut buf))
                .await
                .map_err(|_| "Handshake read timed out".to_string())?
                .map_err(|e| format!("Read failed: {e}"))?;

            if buf[0] != 0x05 {
                return Err("Handshake failed: Target is not a SOCKS5 proxy".into());
            }

            match buf[1] {
                0x00 => Ok(start.elapsed().as_micros()),
                0x02 => {
                    let user = username.unwrap_or_default();
                    let pass = password.unwrap_or_default();

                    let mut auth_req = Vec::new();
                    auth_req.push(0x01);
                    auth_req.push(user.len() as u8);
                    auth_req.extend_from_slice(user.as_bytes());
                    auth_req.push(pass.len() as u8);
                    auth_req.extend_from_slice(pass.as_bytes());

                    stream.write_all(&auth_req).await.map_err(|e| format!("Auth write failed: {e}"))?;

                    let mut auth_res = [0u8; 2];
                    timeout(timeout_duration, stream.read_exact(&mut auth_res))
                        .await
                        .map_err(|_| "Auth read timed out".to_string())?
                        .map_err(|e| format!("Auth read failed: {e}"))?;

                    if auth_res[1] == 0x00 {
                        Ok(start.elapsed().as_micros())
                    } else {
                        Err("SOCKS5 Authentication failed".into())
                    }
                }
                0xFF => Err("SOCKS5: No acceptable authentication methods".into()),
                _ => Err(format!("SOCKS5: Unsupported auth method 0x{:02X}", buf[1])),
            }
        }
        _ => {
            let mut stream = timeout(timeout_duration, tokio::net::TcpStream::connect(addr))
                .await
                .map_err(|_| "Connection timed out".to_string())?
                .map_err(|e| format!("Connection failed: {e}"))?;

            let mut request = format!("CONNECT 1.1.1.1:80 HTTP/1.1\r\nHost: 1.1.1.1:80\r\n");

            if let (Some(u), Some(p)) = (username, password) {
                if !u.is_empty() {
                    use base64::{Engine as _, engine::general_purpose};
                    let auth = format!("{}:{}", u, p);
                    let encoded = general_purpose::STANDARD.encode(auth);
                    request.push_str(&format!("Proxy-Authorization: Basic {}\r\n", encoded));
                }
            }
            request.push_str("\r\n");

            stream.write_all(request.as_bytes()).await.map_err(|e| format!("Write failed: {e}"))?;

            let mut buf = [0u8; 1024];
            let n = timeout(timeout_duration, stream.read(&mut buf))
                .await
                .map_err(|_| "Handshake read timed out".to_string())?
                .map_err(|e| format!("Read failed: {e}"))?;

            if n >= 12 {
                if buf.starts_with(b"HTTP/1.1 200") || buf.starts_with(b"HTTP/1.0 200") {
                    let response_str = String::from_utf8_lossy(&buf[..n]);
                    let lower_resp = response_str.to_lowercase();
                    if lower_resp.contains("connection established") || lower_resp.contains("proxy-connection") {
                        return Ok(start.elapsed().as_micros());
                    }
                } else if buf.starts_with(b"HTTP/1.1 407") || buf.starts_with(b"HTTP/1.0 407") {
                    return Err("Proxy Authentication Required (407)".into());
                } else if buf.starts_with(b"HTTP/1.1 401") || buf.starts_with(b"HTTP/1.0 401") {
                    return Err("Unauthorized (401)".into());
                }
            }
            Err("Handshake failed: Target is not an HTTP proxy or verification failed".into())
        }
    }
}

/// Phase 1: 快速 TCP 探测 — 判断端口是否开放（支持 IPv4/IPv6）
pub async fn syn_probe(ip: IpAddr, port: u16, timeout_ms: u64) -> bool {
    let addr = format_addr(ip, port);
    timeout(
        Duration::from_millis(timeout_ms),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    .map(|r| r.is_ok())
    .unwrap_or(false)
}

/// Phase 2: 探测代理协议的具体逻辑（支持 IPv4/IPv6）
pub async fn check_proxy(ip: IpAddr, port: u16, verify_timeout_ms: u64) -> Option<(&'static str, u64)> {
    let addr = format_addr(ip, port);
    let timeout_duration = Duration::from_millis(verify_timeout_ms);

    // 尝试探测 SOCKS5
    let start = Instant::now();
    if let Ok(Ok(mut stream)) = timeout(timeout_duration, tokio::net::TcpStream::connect(&addr)).await {
        let socks5_greeting = [0x05, 0x02, 0x00, 0x02];
        if stream.write_all(&socks5_greeting).await.is_ok() {
            let mut buf = [0u8; 2];
            if let Ok(Ok(2)) = timeout(timeout_duration, stream.read_exact(&mut buf)).await {
                if buf[0] == 0x05 {
                    let latency = start.elapsed().as_millis() as u64;
                    return match buf[1] {
                        0x00 => Some(("SOCKS5", latency)),
                        0x02 => Some(("SOCKS5 (Auth)", latency)),
                        _    => Some(("SOCKS5", latency)),
                    };
                }
            }
        }
    }

    // 重新连接探测 HTTP 代理
    let start = Instant::now();
    if let Ok(Ok(mut stream)) = timeout(timeout_duration, tokio::net::TcpStream::connect(&addr)).await {
        let http_connect = b"CONNECT 1.1.1.1:80 HTTP/1.1\r\nHost: 1.1.1.1:80\r\n\r\n";
        if stream.write_all(http_connect).await.is_ok() {
            let mut buf = [0u8; 1024];
            if let Ok(Ok(n)) = timeout(timeout_duration, stream.read(&mut buf)).await {
                if n >= 12 {
                    let lower_resp = String::from_utf8_lossy(&buf[..n]).to_lowercase();

                    let is_200 = buf.starts_with(b"HTTP/1.1 200")
                        || buf.starts_with(b"HTTP/1.0 200");
                    let is_407 = buf.starts_with(b"HTTP/1.1 407")
                        || buf.starts_with(b"HTTP/1.0 407");
                    let is_html = lower_resp.contains("<html")
                        || lower_resp.contains("content-type: text/html");

                    if is_200 && !is_html {
                        let latency = start.elapsed().as_millis() as u64;
                        return Some(("HTTP", latency));
                    } else if is_407 {
                        let latency = start.elapsed().as_millis() as u64;
                        return Some(("HTTP (Auth)", latency));
                    }
                }
            }
        }
    }

    None
}
