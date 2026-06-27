import { initNavigation,initSelects,initSwitches,initSnackbar, showDialog, firstPageReady } from "./navigation.js";
import { appendLog,$, $$  } from "./utils.js";
import { AppState } from "./state.js";
import { initClickEffect } from "./click-effect.js";

const APP_CLEANUPS = [];
const TAURI_INVOKE_TIMEOUT_MS = 15000;

function registerCleanup(cleanup) {
  if (typeof cleanup === 'function') APP_CLEANUPS.push(cleanup);
  return cleanup;
}

function runAppCleanups() {
  while (APP_CLEANUPS.length) {
    const cleanup = APP_CLEANUPS.pop();
    try { cleanup(); } catch (err) { console.warn('Cleanup failed:', err); }
  }
}

function addManagedListener(target, type, handler, options) {
  if (!target?.addEventListener) return () => {};
  target.addEventListener(type, handler, options);
  return registerCleanup(() => target.removeEventListener(type, handler, options));
}

function setManagedInterval(handler, delay) {
  const id = window.setInterval(handler, delay);
  registerCleanup(() => window.clearInterval(id));
  return id;
}

function setManagedTimeout(handler, delay) {
  const id = window.setTimeout(handler, delay);
  registerCleanup(() => window.clearTimeout(id));
  return id;
}

document.addEventListener('DOMContentLoaded', () => {
  /* ── Block Browser Context Menu (dev mode: right-click to inspect) ── */
  const isDesktop = isTauriAvailable();
  const isDev = import.meta.env?.DEV === true || ['5173', '1420'].includes(window.location.port);
  if (isDesktop && !isDev) {
    addManagedListener(document, 'contextmenu', (e) => e.preventDefault());
  }
  addManagedListener(document, 'keydown', (e) => {
    if (!isDesktop || isDev) return;
    if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
      e.preventDefault();
    }
  });
  addManagedListener(window, 'beforeunload', runAppCleanups);

  /* ── Restore persisted data before pages load ── */
  // Use an IIFE so we await disk I/O before triggering page init
  (async () => {
    await loadFullConfig();

    // Apply saved theme and color (must happen after loadFullConfig populates cache)
    const savedTheme = loadFromStorage('theme', 'dark');
    const savedColor = loadFromStorage('primaryColor', '#9eddc8');
    AppState.theme = savedTheme;
    AppState.primaryColor = savedColor;
    applyTheme(savedTheme);
    applyPrimaryColor(savedColor);

    // Apply saved language (i18n initLanguage ran before loadFullConfig, so re-apply)
    const savedLang = loadFromStorage('language', 'en');
    if (savedLang) applyLanguage(savedLang);

    // Apply saved title bar mode (system/custom)
    const savedMode = loadFromStorage('titleBarMode', 'custom');
    AppState.titleBarMode = savedMode;
    if (typeof applyTitleBarMode === 'function') {
      applyTitleBarMode(savedMode);
    }

    /* ── Initialize All Systems ── */
    initNavigation();
    initSelects();
    initSwitches();
    initSnackbar();
    initClickEffect();
    firstPageReady.then(() => {
      hideLoadingScreen();
    });

    // 安全兜底：5秒后强制隐藏，防止初始化卡死导致白屏
    setManagedTimeout(hideLoadingScreen, 5000);

    function hideLoadingScreen() {
      const loadingScreen = $('#loading-screen');
      if (!loadingScreen || loadingScreen.style.display === 'none') return;
      loadingScreen.classList.add('fade-out');
      setManagedTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 200);
      AppState.isLoading = false;

      $$('#sidebar, #main-content, #status-bar').forEach((el, i) => {
        if (!el.classList.contains('stagger-entry')) {
          el.classList.add('stagger-entry', `stagger-delay-${i + 1}`);
        }
      });
    }
  })();

  // Page-specific initializations are now handled on-demand by the router

  /* ── Performance Monitor ── */
  initPerfMonitor();

  /* ── Window Controls (Desktop Titlebar) ── */
  initWindowControls();

  // Auto-init validation for data-validate inputs
  addManagedListener(document, 'input', (e) => {
    if (e.target.dataset.validate) validateAndStyle(e.target);
  });
  addManagedListener(document, 'blur', (e) => {
    if (e.target.dataset.validate) validateAndStyle(e.target);
  });

  // Intercept native close (system title bar / Alt+F4) to minimize to tray
  if (window.__TAURI__?.window?.getCurrentWindow) {
    Promise.resolve(window.__TAURI__.window.getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      const closeConfirm = loadFromStorage('closeConfirm', true);
      const dontAskDate = loadFromStorage('dontAskDate', '');
      if (!closeConfirm || dontAskDate === new Date().toDateString()) {
        tauriInvoke('win_hide_to_tray');
        return;
      }
      showCloseDialog();
    })).then((unlisten) => {
      if (typeof unlisten === 'function') registerCleanup(unlisten);
    }).catch((err) => appendLog('error', `Failed to bind close handler: ${err}`));
  }

  // Welcome log
  appendLog('info', '----- Proxy Tester ready -----');
});

/* ── Tauri Helpers ── */
async function tauriInvoke(cmd, args = {}) {
  if (!window.__TAURI__) {
    appendLog('info', `[Tauri] ${cmd} (not in Tauri environment)`);
    return undefined;
  }

  const fn = window.__TAURI__.core?.invoke ?? window.__TAURI__.invoke;
  if (typeof fn !== 'function') {
    const err = new Error('Tauri invoke API is unavailable');
    appendLog('error', `Tauri command unavailable: ${cmd}`);
    throw err;
  }

  let timer = null;
  try {
    return await Promise.race([
      fn(cmd, args),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => {
          reject(new Error(`Tauri command timed out after ${TAURI_INVOKE_TIMEOUT_MS}ms: ${cmd}`));
        }, TAURI_INVOKE_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    appendLog('error', `Tauri command failed: ${cmd} - ${e?.message || e}`);
    throw e;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function tauriListen(event, handler) {
  if (window.__TAURI__?.event?.listen) {
    const unlisten = await window.__TAURI__.event.listen(event, handler);
    if (typeof unlisten === 'function') registerCleanup(unlisten);
    return unlisten;
  }
}

function isTauriAvailable() { return !!window.__TAURI__; }

function initPerfMonitor() {
  const ramText = $('#ram-text');
  const ramBar = $('#ram-bar');
  const canvas = $('#ram-sparkline');
  const sparklineData = [];
  let ctx = null;

  if (canvas) ctx = canvas.getContext('2d');

  async function update() {
    if (!isTauriAvailable()) return;
    try {
      const mem = await tauriInvoke('get_memory_info');
      if (mem) {
        const pct = mem.percent;
        if (ramText) ramText.textContent = `${mem.used_mb} MB / ${mem.total_gb} GB (${pct.toFixed(1)}%)`;
        if (ramBar) ramBar.style.width = Math.min(pct, 100) + '%';
        updateSparkline(pct);
      }
    } catch (_) { }
  }

  function updateSparkline(pct) {
    sparklineData.push(pct);
    if (sparklineData.length > 24) sparklineData.shift();
    if (!ctx || !canvas || sparklineData.length < 2) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-green').trim() || '#9eddc8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < sparklineData.length; i++) {
      const x = (i / (sparklineData.length - 1)) * canvas.width;
      const y = canvas.height - (sparklineData[i] / 100) * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  update();
  setManagedInterval(update, 2000);
}

export function initWindowControls() {
  const titlebar = $('#titlebar');
  if (titlebar) {
    addManagedListener(titlebar, 'mousedown', (e) => {
      if (e.target.closest('.win-btn')) return;
      if (e.detail > 1) return; // double-click — let dblclick handle maximize

      // Use Tauri command to start dragging (handles maximized check in Rust)
      tauriInvoke('win_start_drag');
    });

    // Double-click titlebar to toggle maximize (standard Windows behavior)
    addManagedListener(titlebar, 'dblclick', (e) => {
      if (e.target.closest('.win-btn')) return;
      tauriInvoke('win_toggle_maximize');
    });
  }

  addManagedListener($('#win-minimize'), 'click', () => {
    tauriInvoke('win_minimize');
  });
  addManagedListener($('#win-maximize'), 'click', () => {
    tauriInvoke('win_toggle_maximize');
  });
  addManagedListener($('#win-close'), 'click', handleCloseClick);

  // Sync maximize/restore button icon with window state
  updateMaximizeIcon();

  if (isTauriAvailable()) {
    try {
      const win = window.__TAURI__.window?.getCurrentWindow?.();
      if (win) {
        const onResize = () => updateMaximizeIcon();
        if (win.onResized) {
          Promise.resolve(win.onResized(onResize))
            .then((unlisten) => {
              if (typeof unlisten === 'function') registerCleanup(unlisten);
            })
            .catch(() => {});
        } else if (win.listen) {
          Promise.resolve(win.listen('tauri://resize', onResize))
            .then((unlisten) => {
              if (typeof unlisten === 'function') registerCleanup(unlisten);
            })
            .catch(() => {});
        }
      }
    } catch (_) { /* ignore */ }
  }
}

function updateMaximizeIcon() {
  const icon = document.querySelector('#win-maximize .icon');
  if (!icon) return;

  if (isTauriAvailable()) {
    try {
      const win = window.__TAURI__.window?.getCurrentWindow?.();
      if (win?.isMaximized) {
        win.isMaximized().then((maximized) => {
          icon.textContent = maximized ? 'filter_none' : 'crop_square';
        }).catch(() => {});
      }
    } catch (_) { /* ignore */ }
  }
}

function handleCloseClick() {
  // If using system title bar, the custom close button is hidden
  // but handle gracefully anyway
  if (AppState.titleBarMode === 'system') {
    tauriInvoke('win_minimize');
    return;
  }

  // Check if close confirmation is enabled
  const closeConfirm = loadFromStorage('closeConfirm', true);
  if (!closeConfirm) {
    tauriInvoke('win_hide_to_tray');
    return;
  }

  // Check "don't ask again today"
  const dontAskDate = loadFromStorage('dontAskDate', '');
  if (dontAskDate === new Date().toDateString()) {
    tauriInvoke('win_hide_to_tray');
    return;
  }

  showCloseDialog();
}

function showCloseDialog() {
  const bodyEl = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, [
    createElement('p', { textContent: '是否最小化到系统托盘？关闭窗口后应用将在后台继续运行。' }),
    createElement('label', { className: 'dont-ask-label' }, [
      createElement('input', { type: 'checkbox', id: 'dont-ask-checkbox', className: 'dont-ask-checkbox' }),
      createElement('span', { textContent: '今日不再提示' }),
    ]),
  ]);

  showDialog({
    title: '关闭提示',
    icon: 'info',
    body: bodyEl,
    actions: [
      {
        label: '最小化到托盘',
        class: 'btn-primary',
        onClick: () => {
          const checkbox = $('#dont-ask-checkbox');
          if (checkbox?.checked) {
            const date = new Date().toDateString();
            saveToStorage('dontAskDate', date);
          }
          tauriInvoke('win_hide_to_tray');
        },
      },
      {
        label: '退出应用',
        class: 'btn-danger',
        onClick: () => {
          const checkbox = $('#dont-ask-checkbox');
          if (checkbox?.checked) {
            const date = new Date().toDateString();
            saveToStorage('dontAskDate', date);
          }
          tauriInvoke('win_close');
        },
      },
    ],
  });
}

/* ── Theme / Color ── */
function applyTheme(theme) {
  const root = document.documentElement;
  if (window._themeMq) {
    window._themeMq.removeEventListener('change', window._themeHandler);
    window._themeMq = null;
    window._themeHandler = null;
  }

  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    root.classList.toggle('dark', mq.matches);
    window._themeMq = mq;
    window._themeHandler = (e) => root.classList.toggle('dark', e.matches);
    addManagedListener(mq, 'change', window._themeHandler);
  }
}

function applyPrimaryColor(color) {
  document.documentElement.style.setProperty('--color-accent-green', color);
  document.documentElement.style.setProperty('--color-status-active', color);
}

window.tauriInvoke = tauriInvoke;
window.tauriListen = tauriListen;
window.isTauriAvailable = isTauriAvailable;
window.registerAppCleanup = registerCleanup;
window.addManagedListener = addManagedListener;
window.setManagedInterval = setManagedInterval;
window.setManagedTimeout = setManagedTimeout;
window.applyTheme = applyTheme;
window.applyPrimaryColor = applyPrimaryColor;

