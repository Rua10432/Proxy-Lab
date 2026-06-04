import { initNavigation,initSelects,initSwitches,initSnackbar, showDialog, firstPageReady } from "./navigation.js";
import { appendLog,$, $$  } from "./utils.js";
import { AppState } from "./state.js";
document.addEventListener('DOMContentLoaded', () => {
  /* ── Block Browser Context Menu (dev mode: right-click to inspect) ── */
  const isDev = window.location.port === '5173' || window.location.port === '1420';
  if (!isDev) {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.key === 'R')) {
      e.preventDefault();
    }
  });

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

    /* ── Wait for first page to be ready, then hide loading screen ── */
    firstPageReady.then(() => {
      const loadingScreen = $('#loading-screen');
      if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
          loadingScreen.style.display = 'none';
        }, 200);
      }
      AppState.isLoading = false;

      // Add stagger entry animations
      $$('#sidebar, #main-content, #status-bar').forEach((el, i) => {
        el.classList.add('stagger-entry', `stagger-delay-${i + 1}`);
      });
    });
  })();

  // Page-specific initializations are now handled on-demand by the router

  /* ── Performance Monitor ── */
  initPerfMonitor();

  /* ── Window Controls (Desktop Titlebar) ── */
  initWindowControls();

  // Auto-init validation for data-validate inputs
  document.addEventListener('input', (e) => {
    if (e.target.dataset.validate) validateAndStyle(e.target);
  });
  document.addEventListener('blur', (e) => {
    if (e.target.dataset.validate) validateAndStyle(e.target);
  });

  // Intercept native close (system title bar / Alt+F4) to minimize to tray
  if (window.__TAURI__?.window?.getCurrentWindow) {
    window.__TAURI__.window.getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      const closeConfirm = loadFromStorage('closeConfirm', true);
      const dontAskDate = loadFromStorage('dontAskDate', '');
      if (!closeConfirm || dontAskDate === new Date().toDateString()) {
        tauriInvoke('win_hide_to_tray');
        return;
      }
      showCloseDialog();
    });
  }

  // Welcome logs
  appendLog('info', 'Proxy Tester initialized');
  appendLog('ok', 'System ready — all modules loaded');
  appendLog('info', 'Navigate using the sidebar to access different tools');
});

/* ── Tauri Helpers ── */
async function tauriInvoke(cmd, args = {}) {
  if (window.__TAURI__) {
    try {
      const fn = window.__TAURI__.core?.invoke ?? window.__TAURI__.invoke;
      return await fn(cmd, args);
    } catch (e) {
      appendLog('error', `Tauri command failed: ${cmd} - ${e}`);
      throw e;
    }
  } else {
    appendLog('info', `[Tauri] ${cmd} (not in Tauri environment)`);
  }
}

async function tauriListen(event, handler) {
  if (window.__TAURI__?.event?.listen) {
    return window.__TAURI__.event.listen(event, handler);
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
      const mem = await tauriInvoke('shittim_mem_task');
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

  setInterval(update, 2000);
}

export function initWindowControls() {
  const titlebar = $('#titlebar');
  if (titlebar) {
    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.win-btn')) return;
      if (e.detail > 1) return; // double-click — let dblclick handle maximize

      // Use Tauri command to start dragging (handles maximized check in Rust)
      tauriInvoke('win_start_drag');
    });

    // Double-click titlebar to toggle maximize (standard Windows behavior)
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.win-btn')) return;
      tauriInvoke('win_toggle_maximize');
    });
  }

  $('#win-minimize')?.addEventListener('click', () => {
    tauriInvoke('win_minimize');
  });
  $('#win-maximize')?.addEventListener('click', () => {
    tauriInvoke('win_toggle_maximize');
  });
  $('#win-close')?.addEventListener('click', handleCloseClick);

  // Sync maximize/restore button icon with window state
  updateMaximizeIcon();

  if (isTauriAvailable()) {
    try {
      const win = window.__TAURI__.window?.getCurrentWindow?.();
      if (win) {
        const onResize = () => updateMaximizeIcon();
        if (win.onResized) {
          win.onResized(onResize);
        } else if (win.listen) {
          win.listen('tauri://resize', onResize);
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
    mq.addEventListener('change', window._themeHandler);
  }
}

function applyPrimaryColor(color) {
  document.documentElement.style.setProperty('--color-accent-green', color);
  document.documentElement.style.setProperty('--color-status-active', color);
}

window.tauriInvoke = tauriInvoke;
window.tauriListen = tauriListen;
window.isTauriAvailable = isTauriAvailable;
window.applyTheme = applyTheme;
window.applyPrimaryColor = applyPrimaryColor;

