// ─── Version Module ──────────────────────────────────────────────────────────
// Public version (semver from Cargo.toml) + internal build counter.
// BUILD_COUNT is set by build.rs at compile time.

use serde::Serialize;

pub const PUBLIC: &str = env!("CARGO_PKG_VERSION");
pub const BUILD: &str = env!("BUILD_COUNT");

/// Full display string: "v1.0.0 (build #123)"
pub fn display() -> String {
    format!("v{} (build #{})", PUBLIC, BUILD)
}

/// Short display: "v1.0.0"
#[warn(unused)]
pub fn short() -> String {
    format!("v{}", PUBLIC)
}

#[derive(Serialize)]
pub struct VersionInfo {
    pub public: String,
    pub build: String,
    pub display: String,
}

pub fn info() -> VersionInfo {
    VersionInfo {
        public: PUBLIC.to_string(),
        build: BUILD.to_string(),
        display: display(),
    }
}
