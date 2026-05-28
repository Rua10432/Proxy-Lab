// ─── MTR Service ─────────────────────────────────────────────────────────────
// Business logic for MTR (My TraceRoute) and traceroute operations.

use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;

use crate::mtr;
use crate::AppState;

fn ip_is_unspecified(ip: &IpAddr) -> bool {
    *ip == IpAddr::V4(Ipv4Addr::UNSPECIFIED)
        || *ip == IpAddr::V6(std::net::Ipv6Addr::UNSPECIFIED)
}

pub fn start_mtr(
    app: &tauri::AppHandle,
    state: &AppState,
    host: String,
    max_hops: u8,
) {
    state.mtr_stop_flag.store(false, Ordering::SeqCst);
    let stop_flag = Arc::clone(&state.mtr_stop_flag);
    let max_hops = if max_hops == 0 { 30 } else { max_hops };
    let app_handle = app.clone();

    tokio::spawn(async move {
        let dest = match tokio::task::spawn_blocking({
            let h = host.clone();
            move || mtr::resolve_host(&h)
        }).await {
            Ok(Ok(ip)) => ip,
            Ok(Err(e)) => { let _ = app_handle.emit("mtr-error", e); return; }
            Err(e) => { let _ = app_handle.emit("mtr-error", format!("{}", e)); return; }
        };

        let route = match tokio::task::spawn_blocking({
            let d = dest;
            move || mtr::discover_route(d, max_hops, 2000)
        }).await {
            Ok(Ok(r)) => r,
            Ok(Err(e)) => { let _ = app_handle.emit("mtr-error", e); return; }
            Err(e) => { let _ = app_handle.emit("mtr-error", format!("{}", e)); return; }
        };

        if route.is_empty() {
            let _ = app_handle.emit("mtr-error", "No route discovered".to_string());
            return;
        }

        let mut stats: Vec<mtr::HopStats> = route.iter().map(|_| mtr::HopStats::new()).collect();
        let mut round = 0u32;

        while !stop_flag.load(Ordering::SeqCst) {
            round += 1;
            let mut handles = Vec::new();

            for (i, (_hop, ip)) in route.iter().enumerate() {
                if ip_is_unspecified(ip) {
                    handles.push((i, None));
                    continue;
                }
                let ip_copy = *ip;
                let jh = tokio::task::spawn_blocking(move || mtr::ping_ip(ip_copy, 2000));
                handles.push((i, Some(jh)));
            }

            for (i, jh_opt) in handles {
                if let Some(jh) = jh_opt {
                    let result = jh.await.unwrap_or(None);
                    stats[i].update(result);
                } else {
                    stats[i].update(None);
                }
            }

            let hops: Vec<mtr::MtrHop> = route.iter().enumerate().map(|(i, (hop, ip))| {
                let s = &stats[i];
                mtr::MtrHop {
                    hop: *hop,
                    ip: if ip_is_unspecified(ip) { "*".into() } else { ip.to_string() },
                    loss_pct: s.loss_pct(),
                    sent: s.sent,
                    recv: s.recv,
                    last: s.last,
                    avg: s.avg(),
                    best: if s.best == f64::MAX { 0.0 } else { s.best },
                    worst: s.worst,
                    history: s.history.clone(),
                }
            }).collect();

            let _ = app_handle.emit("mtr-update", mtr::MtrUpdatePayload { hops, round });
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        let _ = app_handle.emit("mtr-stopped", ());
    });
}

pub fn stop_mtr(state: &AppState) {
    state.mtr_stop_flag.store(true, Ordering::SeqCst);
}

pub async fn run_traceroute(host: String, max_hops: u8) -> Result<Vec<mtr::RouteHopPayload>, String> {
    let max_hops = if max_hops == 0 { 30 } else { max_hops };
    let dest = tokio::task::spawn_blocking({
        let h = host.clone();
        move || mtr::resolve_host(&h)
    }).await.map_err(|e| format!("{}", e))??;

    let route = tokio::task::spawn_blocking({
        let d = dest;
        move || mtr::discover_route(d, max_hops, 2000)
    }).await.map_err(|e| format!("{}", e))??;

    let total = route.len();
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let hops: Vec<mtr::RouteHopPayload> = route.into_iter().enumerate().map(|(i, (hop, ip))| {
        let node_type = if i == 0 { "Gateway" }
            else if i == total - 1 { "Target" }
            else { "Transit" };
        mtr::RouteHopPayload {
            hop,
            ip: if ip_is_unspecified(&ip) { "*".into() } else { ip.to_string() },
            rtt_ms: 0.0,
            node_type: node_type.to_string(),
            network: "\u{2014}".to_string(),
            timestamp: timestamp.clone(),
        }
    }).collect();

    Ok(hops)
}
