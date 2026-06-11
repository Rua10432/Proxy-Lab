// ─── Connection Log Database ───────────────────────────────────────────────────
// Stores per-client-IP connection logs in SQLite files organized by date.
//
// Directory structure (relative to the running executable):
//   HostConnectionLog/
//     yyyy-mm-dd/
//       client_ip.db   (e.g. "192.168.1.100.db")
//
// Each db file has a `connections` table with:
//   timestamp, ip(target), src_port, dst_port, protocol,
//   upload_bytes, download_bytes, status_code, mac_addr

use rusqlite::Connection;
use std::path::PathBuf;

/// Status codes
pub const STATUS_OK: u16 = 200;
pub const STATUS_BLOCKED: u16 = 403;
pub const STATUS_UPSTREAM_FAIL: u16 = 502;
pub const STATUS_UPSTREAM_TIMEOUT: u16 = 504;

/// Return the HostConnectionLog directory (relative to the executable's parent dir).
pub fn get_log_base_dir() -> PathBuf {
    let mut dir = std::env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("."))
        .parent()
        .unwrap_or(&PathBuf::from("."))
        .to_path_buf();
    dir.push("HostConnectionLog");
    dir
}

/// Ensure a db file exists for `date_str`/`client_ip`.
/// Creates the directory and table if needed. WAL mode for concurrent writes.
pub fn ensure_db(base_dir: &PathBuf, date_str: &str, client_ip: &str) -> Result<Connection, String> {
    let day_dir = base_dir.join(date_str);
    std::fs::create_dir_all(&day_dir)
        .map_err(|e| format!("Failed to create log directory {day_dir:?}: {e}"))?;

    let safe_key = client_ip.replace(':', "_");
    let db_path = day_dir.join(format!("{safe_key}.db"));

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open log db {db_path:?}: {e}"))?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS connections (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp       INTEGER NOT NULL,
            ip              TEXT NOT NULL,
            src_port        INTEGER NOT NULL,
            dst_port        INTEGER NOT NULL,
            protocol        TEXT NOT NULL DEFAULT 'TCP',
            upload_bytes    INTEGER NOT NULL DEFAULT 0,
            download_bytes  INTEGER NOT NULL DEFAULT 0,
            status_code     INTEGER NOT NULL DEFAULT 200,
            mac_addr        TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_conn_ts ON connections(timestamp);
        CREATE INDEX IF NOT EXISTS idx_conn_ip ON connections(ip);",
    )
    .map_err(|e| format!("Failed to create connections table: {e}"))?;

    Ok(conn)
}

/// Insert a single connection log entry.
///
/// - `base_dir`: HostConnectionLog root (from `get_log_base_dir`)
/// - `date_str`: date folder, e.g. "2026-06-10"
/// - `timestamp`: unix millisecond timestamp
/// - `client_ip`: **connecting client's IP** — used for the db filename
/// - `target_ip`: **destination IP** — stored in the `ip` column
/// - `src_port`: client source port
/// - `dst_port`: destination port
/// - `protocol`: "TCP" or "UDP"
/// - `upload_bytes`: bytes sent client → upstream
/// - `download_bytes`: bytes sent upstream → client
/// - `status_code`: 200/403/502/504
/// - `mac_addr`: e.g. "AA:BB:CC:DD:EE:FF" or empty
pub fn insert_connection_log(
    base_dir: &PathBuf,
    date_str: &str,
    timestamp: i64,
    client_ip: &str,
    target_ip: &str,
    src_port: u16,
    dst_port: u16,
    protocol: &str,
    upload_bytes: u64,
    download_bytes: u64,
    status_code: u16,
    mac_addr: &str,
) -> Result<(), String> {
    let conn = ensure_db(base_dir, date_str, client_ip)?;

    conn.execute(
        "INSERT INTO connections (timestamp, ip, src_port, dst_port, protocol, upload_bytes, download_bytes, status_code, mac_addr)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            timestamp,
            target_ip,
            src_port as i64,
            dst_port as i64,
            protocol,
            upload_bytes as i64,
            download_bytes as i64,
            status_code as i64,
            mac_addr,
        ],
    )
    .map_err(|e| format!("Failed to insert connection log: {e}"))?;

    Ok(())
}
