export const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || (async () => { console.error("Tauri invoke not found"); return {}; });
export const listen = window.__TAURI__?.event?.listen || window.__TAURI__?.listen || (async () => { console.error("Tauri listen not found"); return () => {}; });
