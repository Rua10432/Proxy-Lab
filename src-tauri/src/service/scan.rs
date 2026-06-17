// ─── Scan Service ────────────────────────────────────────────────────────────
// Business logic for proxy network scanning (SYN probe + protocol verification).

use std::net::{IpAddr, Ipv4Addr};
use std::str::FromStr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Emitter;
use tokio::sync::{Mutex, Semaphore};

use crate::AppState;
use crate::proxy;
use crate::types::{
    ScanPortOpenPayload, ScanProgressPayload, ScanResultPayload, ScanSynDonePayload,
};

pub fn start_proxy_scan(
    app: &tauri::AppHandle,
    state: &AppState,
    network: String,
    mask: String,
    start_port: u16,
    end_port: u16,
    concurrent: usize,
    syn_timeout_ms: u64,
    verify_concurrent: usize,
) -> Result<(), String> {
    if network.contains(':') {
        return Err("IPv6 网段扫描暂不支持，仅支持 IPv4".to_string());
    }
    let start_ip =
        Ipv4Addr::from_str(&network).map_err(|_| "无效的网络段格式 (仅支持 IPv4)".to_string())?;
    let mask_ip = Ipv4Addr::from_str(&mask).map_err(|_| "无效的子网掩码格式".to_string())?;

    state.scan_stop_flag.store(false, Ordering::SeqCst);
    let stop_flag = Arc::clone(&state.scan_stop_flag);

    let start_u32 = u32::from(start_ip);
    let mask_u32 = u32::from(mask_ip);

    let network_id = start_u32 & mask_u32;
    let broadcast_id = network_id | !mask_u32;

    let ip_count = (broadcast_id - network_id).saturating_sub(1) as u64;
    let port_count = (end_port as u64).saturating_sub(start_port as u64) + 1;
    let total_tasks = ip_count * port_count;

    let verify_timeout_ms: u64 = 1500;
    let app_handle = app.clone();

    tokio::spawn(async move {
        let scanned_count = Arc::new(AtomicU64::new(0));
        let found_count = Arc::new(AtomicU64::new(0));
        let open_count = Arc::new(AtomicU64::new(0));
        let open_ports = Arc::new(Mutex::new(Vec::<(IpAddr, u16)>::new()));

        // Phase 1: SYN probe all requested ports first.
        let p1_stop = stop_flag.clone();
        let p1_app = app_handle.clone();
        let p1_scanned = scanned_count.clone();
        let p1_open = open_count.clone();
        let p1_open_ports = open_ports.clone();

        let p1_handle = tokio::spawn(async move {
            let semaphore = Arc::new(Semaphore::new(concurrent.max(1)));
            let mut tasks = Vec::new();

            for ip_u32 in (network_id + 1)..broadcast_id {
                if p1_stop.load(Ordering::SeqCst) {
                    break;
                }
                let ip = Ipv4Addr::from(ip_u32);

                for port in start_port..=end_port {
                    if p1_stop.load(Ordering::SeqCst) {
                        break;
                    }

                    let permit = semaphore.clone().acquire_owned().await.unwrap();
                    let stop = p1_stop.clone();
                    let app_c = p1_app.clone();
                    let scanned = p1_scanned.clone();
                    let open = p1_open.clone();
                    let open_ports = p1_open_ports.clone();

                    let task = tokio::spawn(async move {
                        if stop.load(Ordering::SeqCst) {
                            drop(permit);
                            return;
                        }

                        if proxy::syn_probe(IpAddr::V4(ip), port, syn_timeout_ms).await {
                            {
                                let mut ports = open_ports.lock().await;
                                ports.push((IpAddr::V4(ip), port));
                            }

                            let current_open = open.fetch_add(1, Ordering::Relaxed) + 1;
                            let _ = app_c.emit(
                                "scan-port-open",
                                ScanPortOpenPayload {
                                    open_count: current_open,
                                },
                            );
                        }

                        let current = scanned.fetch_add(1, Ordering::Relaxed) + 1;
                        let progress = ScanProgressPayload {
                            scanned: current,
                            total: total_tasks,
                            found: open.load(Ordering::Relaxed),
                        };
                        let _ = app_c.emit("scan-progress", progress);

                        drop(permit);
                    });
                    tasks.push(task);
                }
            }

            for task in tasks {
                let _ = task.await;
            }
        });

        let _ = p1_handle.await;

        let final_syn_progress = ScanProgressPayload {
            scanned: scanned_count.load(Ordering::Relaxed),
            total: total_tasks,
            found: open_count.load(Ordering::Relaxed),
        };
        let _ = app_handle.emit("scan-progress", final_syn_progress);
        let _ = app_handle.emit(
            "scan-syn-done",
            ScanSynDonePayload {
                total_ports: total_tasks,
                open_count: open_count.load(Ordering::Relaxed),
            },
        );

        // Phase 2: verify proxy protocols only on ports found open by Phase 1.
        let ports_to_verify = {
            let ports = open_ports.lock().await;
            ports.clone()
        };

        let p2_stop = stop_flag.clone();
        let p2_app = app_handle.clone();
        let p2_found = found_count.clone();

        let p2_handle = tokio::spawn(async move {
            let semaphore = Arc::new(Semaphore::new(verify_concurrent.max(1)));
            let mut tasks = Vec::new();

            for (ip, port) in ports_to_verify {
                if p2_stop.load(Ordering::SeqCst) {
                    break;
                }

                let permit = semaphore.clone().acquire_owned().await.unwrap();
                let stop = p2_stop.clone();
                let app_c = p2_app.clone();
                let found = p2_found.clone();

                let task = tokio::spawn(async move {
                    if stop.load(Ordering::SeqCst) {
                        drop(permit);
                        return;
                    }

                    if let Some((protocol, latency_ms)) =
                        proxy::check_proxy(ip, port, verify_timeout_ms).await
                    {
                        found.fetch_add(1, Ordering::Relaxed);
                        let payload = ScanResultPayload {
                            ip: ip.to_string(),
                            port,
                            protocol: protocol.to_string(),
                            latency_ms,
                        };
                        let _ = app_c.emit("scan-found", payload);
                    }

                    drop(permit);
                });
                tasks.push(task);
            }

            for task in tasks {
                let _ = task.await;
            }
        });

        let _ = p2_handle.await;
        let _ = app_handle.emit("scan-done", ());
    });

    Ok(())
}

pub fn stop_proxy_scan(state: &AppState) {
    state.scan_stop_flag.store(true, Ordering::SeqCst);
}
