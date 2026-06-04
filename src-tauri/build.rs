use std::path::PathBuf;
use std::process::Command;

fn main() {
    // ── Version management ───────────────────────────────────────────────────
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let count_path = manifest_dir.join("build_count.txt");

    // Read, increment, write build counter
    let build_count: u64 = {
        let content = std::fs::read_to_string(&count_path).unwrap_or_else(|_| "0".into());
        let num: u64 = content.trim().parse().unwrap_or(0);
        let next = num + 1;
        std::fs::write(&count_path, next.to_string()).ok();
        next
    };

    // Expose as compile-time env vars
    println!("cargo:rustc-env=BUILD_COUNT={}", build_count);
    println!("cargo:rerun-if-changed={}", count_path.display());

    // ── WebView2 workaround ──────────────────────────────────────────────────
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let out_path = PathBuf::from(&out_dir);
    let build_root = out_path.ancestors().nth(3).unwrap().to_path_buf();

    if let Ok(entries) = std::fs::read_dir(&build_root) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("webview2-com-sys") {
                let x64 = entry.path().join("out").join("x64");
                let dll  = x64.join("WebView2Loader.dll");
                let def  = x64.join("WebView2Loader.def");
                let lib  = x64.join("libWebView2Loader.dll.a");

                if dll.exists() && !lib.exists() {
                    Command::new("gendef")
                        .arg(&dll)
                        .current_dir(&x64)
                        .status()
                        .expect("gendef failed");

                    Command::new("dlltool")
                        .args(["-d", def.to_str().unwrap(),
                               "-l", lib.to_str().unwrap(),
                               "-D", "WebView2Loader.dll"])
                        .status()
                        .expect("dlltool failed");
                }

                println!("cargo:rustc-link-search={}", x64.display());
                break;
            }
        }
    }

    // ── Generate default config.json ──────────────────────────────────────
    let default_config = r##"{
  "proxies": [],
  "scan_preferences": {
    "defaultMask": "255.255.255.0",
    "defaultStartPort": 1,
    "defaultEndPort": 65535,
    "defaultConcurrent": 250,
    "timeoutMs": 1500,
    "synTimeoutMs": 500,
    "verifyConcurrent": 50,
    "detectionHeaders": ["Via", "X-Cache", "X-Proxy", "Proxy-Connection", "X-Proxy-Agent"],
    "strictDetection": false
  },
  "scan_history": [],
  "recent_configs": [],
  "recent_tests": [],
  "proxy_rules": [],
  "ui_preferences": {
    "theme": "dark",
    "primaryColor": "#9eddc8",
    "titleBarMode": "custom",
    "closeConfirm": true,
    "language": "",
    "exportDirectory": "",
    "dontAskDate": ""
  },
  "frontend_test_history": [],
  "frontend_config_history": [],
  "frontend_proxy_pool": []
}"##;
    std::fs::write(build_root.join("config.json"), default_config).ok();

    tauri_build::build()
}
