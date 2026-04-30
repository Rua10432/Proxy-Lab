use std::path::PathBuf;
use std::process::Command;

fn main() {
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let out_path = PathBuf::from(&out_dir);

    let build_root = out_path
        .ancestors()
        .nth(3)
        .unwrap()
        .to_path_buf();

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
                        .args([
                            "-d", def.to_str().unwrap(),
                            "-l", lib.to_str().unwrap(),
                            "-D", "WebView2Loader.dll",
                        ])
                        .status()
                        .expect("dlltool failed");
                }

                println!("cargo:rustc-link-search={}", x64.display());
                break;
            }
        }
    }

    tauri_build::build()
}