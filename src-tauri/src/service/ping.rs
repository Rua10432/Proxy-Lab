// ─── Ping Service ────────────────────────────────────────────────────────────
// Business logic for proxy ping / latency test.

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::Semaphore;

use crate::proxy;
use crate::types::{
    PingResultPayload, PingDonePayload, PingStoppedPayload,
    BatchProxy, BatchPingResultPayload, BatchPingDonePayload,
};
use crate::AppState;

pub fn start_ping_test(
    app: &tauri::AppHandle,
    state: &AppState,
    host: String,
    port: u16,
    protocol: String,
    count: u32,
    timeout_ms: u64,
    interval_ms: u64,
    username: Option<String>,
    password: Option<String>,
    request_id: Option<String>,
) {
    state.stop_flag.store(false, Ordering::SeqCst);
    let stop_flag = Arc::clone(&state.stop_flag);
    let app_handle = app.clone();

    tokio::spawn(async move {
        for i in 1..=count {
            if stop_flag.load(Ordering::SeqCst) {
                let _ = app_handle.emit("ping-stopped", PingStoppedPayload {
                    request_id: request_id.clone(),
                });
                return;
            }

            let addr = if host.contains(':') && !host.starts_with('[') {
                format!("[{}]:{}", host, port)
            } else {
                format!("{}:{}", host, port)
            };
            let result = proxy::verify_proxy_handshake(
                &addr, &protocol, timeout_ms, username.clone(), password.clone(),
            ).await;

            let payload = match result {
                Ok(ms) => PingResultPayload {
                    seq: i,
                    ms: Some(ms),
                    error: None,
                    request_id: request_id.clone(),
                },
                Err(e) => PingResultPayload {
                    seq: i,
                    ms: None,
                    error: Some(e),
                    request_id: request_id.clone(),
                },
            };
            let _ = app_handle.emit("ping-result", payload);

            if i < count {
                let steps = (interval_ms / 50).max(1);
                for _ in 0..steps {
                    if stop_flag.load(Ordering::SeqCst) { break; }
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
            }
        }
        let _ = app_handle.emit("ping-done", PingDonePayload {
            request_id: request_id.clone(),
        });
    });
}

pub fn stop_ping_test(state: &AppState) {
    state.stop_flag.store(true, Ordering::SeqCst);
}

// ─── Batch / Concurrent Pool Ping ────────────────────────────────────────────

const DEFAULT_CONCURRENCY: usize = 20;

pub fn start_batch_ping_test(
    app: &tauri::AppHandle,
    state: &AppState,
    proxies: Vec<BatchProxy>,
    timeout_ms: u64,
    request_id: Option<String>,
) {
    state.batch_stop_flag.store(false, Ordering::SeqCst);
    let stop_flag = Arc::clone(&state.batch_stop_flag);
    let app_handle = app.clone();
    let semaphore = Arc::new(Semaphore::new(DEFAULT_CONCURRENCY));

    tokio::spawn(async move {
        let total = proxies.len();
        let mut handles = Vec::with_capacity(total);

        for proxy in proxies {
            if stop_flag.load(Ordering::SeqCst) { break; }

            let permit = Arc::clone(&semaphore).acquire_owned().await;
            if permit.is_err() { break; }
            let permit = permit.unwrap();

            let app_handle = app_handle.clone();
            let stop_flag = Arc::clone(&stop_flag);
            let request_id = request_id.clone();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                if stop_flag.load(Ordering::SeqCst) { return None; }

                let addr = if proxy.host.contains(':') && !proxy.host.starts_with('[') {
                    format!("[{}]:{}", proxy.host, proxy.port)
                } else {
                    format!("{}:{}", proxy.host, proxy.port)
                };

                let result = proxy::verify_proxy_handshake(
                    &addr, &proxy.protocol, timeout_ms, None, None,
                ).await;

                let payload = match result {
                    Ok(ms) => BatchPingResultPayload {
                        index: proxy.index,
                        host: proxy.host,
                        port: proxy.port,
                        latency_ms: Some((ms / 1000) as u64),
                        error: None,
                        request_id: request_id.clone(),
                    },
                    Err(e) => BatchPingResultPayload {
                        index: proxy.index,
                        host: proxy.host,
                        port: proxy.port,
                        latency_ms: None,
                        error: Some(e),
                        request_id: request_id.clone(),
                    },
                };

                let _ = app_handle.emit("batch-ping-result", payload);
                Some(true)
            }));
        }

        // Wait for all to finish
        let mut ok = 0usize;
        let mut fail = 0usize;
        for h in handles {
            match h.await {
                Ok(Some(_)) => ok += 1,
                _ => fail += 1,
            }
        }

        let _ = app_handle.emit("batch-ping-done", BatchPingDonePayload {
            total,
            ok,
            fail,
            request_id,
        });
    });
}

pub fn stop_batch_ping_test(state: &AppState) {
    state.batch_stop_flag.store(true, Ordering::SeqCst);
}
