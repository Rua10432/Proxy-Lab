import { initNavigation,initSelects,initSwitches,initSnackbar, showDialog } from "./navigation.js";
import { appendLog,$, $$  } from "./utils.js";
import { AppState } from "./state.js";
document.addEventListener('DOMContentLoaded', () => {
  /* ── Initialize All Systems ── */
  initNavigation();
  initSelects();
  initSwitches();
  initSnackbar();

  // Page-specific initializations are now handled on-demand by the router

  /* ── Performance Monitor ── */
  initPerfMonitor();

  /* ── Loading Screen ── */
  setTimeout(() => {
    const loadingScreen = $('#loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
    AppState.isLoading = false;

    // Add stagger entry animations
    $$('#sidebar, #main-content, #status-bar').forEach((el, i) => {
      el.classList.add('stagger-entry', `stagger-delay-${i + 1}`);
    });
  }, 1200);

  /* ── Window Controls (Desktop Titlebar) ── */
  initWindowControls();

  // Apply saved title bar mode (system/custom)
  const savedMode = loadFromStorage('titleBarMode', 'custom');
  AppState.titleBarMode = savedMode;
  if (typeof applyTitleBarMode === 'function') {
    applyTitleBarMode(savedMode);
  }

  // Intercept native close (system title bar / Alt+F4) to minimize to tray
  if (window.__TAURI__?.window?.getCurrentWindow) {
    window.__TAURI__.window.getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      const closeConfirm = loadFromStorage('closeConfirm', true);
      const dontAskDate = loadFromStorage('dontAskDate', '');
      if (!closeConfirm || dontAskDate === new Date().toDateString()) {
        tauriInvoke('win_close');
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

function tauriListen(event, handler) {
  if (window.__TAURI__?.event?.listen) {
    window.__TAURI__.event.listen(event, handler);
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
      // Only drag if the click is on the drag region and not on a button
      if (e.target.closest('.win-btn')) return;

      if (window.__TAURI__?.window?.getCurrentWindow) {
        window.__TAURI__.window.getCurrentWindow().startDragging();
      } else if (window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow) {
        window.__TAURI__.webviewWindow.getCurrentWebviewWindow().startDragging();
      } else {
        tauriInvoke('win_start_drag');
      }
    });
  }

  $('#win-minimize')?.addEventListener('click', () => {
    tauriInvoke('win_minimize');
  });
  $('#win-maximize')?.addEventListener('click', () => {
    tauriInvoke('win_toggle_maximize');
  });
  $('#win-close')?.addEventListener('click', handleCloseClick);
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
    tauriInvoke('win_close');
    return;
  }

  // Check "don't ask again today"
  const dontAskDate = loadFromStorage('dontAskDate', '');
  if (dontAskDate === new Date().toDateString()) {
    tauriInvoke('win_close');
    return;
  }

  showCloseDialog();
}

function showCloseDialog() {
  const bodyEl = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, [
    createElement('p', { textContent: 'Are you sure you want to exit Proxy Tester?' }),
    createElement('label', { className: 'dont-ask-label' }, [
      createElement('input', { type: 'checkbox', id: 'dont-ask-checkbox', className: 'dont-ask-checkbox' }),
      createElement('span', { textContent: "Don't ask again today" }),
    ]),
  ]);

  showDialog({
    title: 'Exit Application',
    icon: 'warning',
    body: bodyEl,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-text',
        onClick: () => { tauriInvoke('win_minimize'); },
      },
      {
        label: 'Exit',
        class: 'btn-primary',
        onClick: () => {
          const checkbox = $('#dont-ask-checkbox');
          if (checkbox?.checked) {
            saveToStorage('dontAskDate', new Date().toDateString());
          }
          tauriInvoke('win_close');
        },
      },
    ],
  });
}

window.tauriInvoke = tauriInvoke;
window.tauriListen = tauriListen;
window.isTauriAvailable = isTauriAvailable;

