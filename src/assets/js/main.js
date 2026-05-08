import { invoke } from './api.js';
import { clearFieldError } from './utils.js';
import { restoreTheme, initThemeListeners } from './theme.js';
import { startTest, stopTest, renderStats } from './pages/test.js';
import { startScan, stopScan, resetScanStats } from './pages/scan.js';
import {
  configProxy,
  checkProxyStatus,
  disconnectProxy,
  startMtr,
  stopMtr,
  initMtrSorting,
  runRouteTrace
} from './pages/config.js';
import { initPool } from './pages/pool.js';
import { initTitlebar } from './titlebar.js';

// ── Disable Browser Context Menu (native app feel) ────────────────────
document.addEventListener('contextmenu', (e) => {
  // Always permit in development mode (localhost)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return;
  }

  // In production, allow right-click only in text inputs for paste/copy
  const tag = e.target.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  // Also allow inside Material text-field shadow DOM
  const closest = e.target.closest?.('md-outlined-text-field, md-filled-text-field');
  if (closest) return;

  e.preventDefault();
});

// ── Global Refs ────────────────────────────────────────────────────────
const logArea = document.getElementById("global-log");
const scanTableBody = document.getElementById("scan-table-body");
const scanEmptyState = document.getElementById("scan-empty-state");
const scanProgressFill = document.getElementById("scan-progress-fill");
const scanProgressLabel = document.getElementById("scan-progress-label");
const scanFoundLabel = document.getElementById("scan-found-label");

// ── Page Navigation ────────────────────────────────────────────────────
const pages = ["test", "scan", "config", "logs", "settings"];

const switchPage = (idx) => {
  pages.forEach((p, i) => {
    const pageEl = document.getElementById(`page-${p}`);
    if (pageEl) {
      if (i === idx) {
        pageEl.removeAttribute("hidden");
      } else {
        pageEl.setAttribute("hidden", "");
      }
    }

    // Sync active state on tabs manually
    const railTab = document.getElementById(`rail-${p}`);
    const barTab = document.getElementById(`bar-${p}`);

    if (railTab) {
      if (i === idx) {
        railTab.setAttribute("active", "");
        // Dynamic position calculation to fix alignment bug
        const indicator = document.getElementById("rail-indicator");
        if (indicator) {
          // Calculate offset relative to the rail container
          indicator.style.transform = `translateY(${railTab.offsetTop}px)`;
        }
      } else {
        railTab.removeAttribute("active");
      }
    }

    if (barTab) {
      if (i === idx) {
        barTab.setAttribute("active", "");
        // Move mobile indicator
        const bIndicator = document.getElementById("bar-indicator");
        if (bIndicator) {
          bIndicator.style.transform = `translateX(${i * 100}%)`;
        }
      } else {
        barTab.removeAttribute("active");
      }
    }
  });

  if (idx === 2) {
    checkProxyStatus();
  }
};

pages.forEach((p, idx) => {
  const railTab = document.getElementById(`rail-${p}`);
  if (railTab) railTab.addEventListener("click", () => switchPage(idx));

  const barTab = document.getElementById(`bar-${p}`);
  if (barTab) barTab.addEventListener("click", () => switchPage(idx));
});

// ── Extended FAB & Scan ──────────────────────────────────────────────
const fabScan = document.getElementById("fab-scan");
if (fabScan) {
  fabScan.addEventListener("click", () => {
    const btnScanStart = document.getElementById("btn-scan-start");
    if (btnScanStart) btnScanStart.click();
  });
}

// ── Event Bindings ─────────────────────────────────────────────────────
const btnTest = document.getElementById("btn-test");
const btnStop = document.getElementById("btn-stop");
if (btnTest) btnTest.addEventListener("click", startTest);
if (btnStop) btnStop.addEventListener("click", stopTest);

const btnClearLog = document.getElementById("btn-clear-log");
if (btnClearLog) {
  btnClearLog.addEventListener("click", () => {
    if (logArea) logArea.innerHTML = "";
  });
}

const btnClearFields = document.getElementById("btn-clear-fields");
if (btnClearFields) {
  btnClearFields.addEventListener("click", () => {
    ["test-host", "test-port", "test-count", "test-timeout", "test-interval"]
      .forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
  });
}

const btnConfig = document.getElementById("btn-config");
if (btnConfig) btnConfig.addEventListener("click", configProxy);

const btnDisconnect = document.getElementById("btn-config-disconnect");
if (btnDisconnect) btnDisconnect.addEventListener("click", disconnectProxy);

const btnClearGlobalLog = document.getElementById("btn-clear-global-log");
if (btnClearGlobalLog) {
  btnClearGlobalLog.addEventListener("click", () => {
    const gl = document.getElementById("global-log");
    if (gl) gl.innerHTML = "";
  });
}

const btnScanStart = document.getElementById("btn-scan-start");
const btnScanStop = document.getElementById("btn-scan-stop");
if (btnScanStart) btnScanStart.addEventListener("click", startScan);
if (btnScanStop) btnScanStop.addEventListener("click", stopScan);

const btnScanClear = document.getElementById("btn-scan-clear");
if (btnScanClear) {
  btnScanClear.addEventListener("click", () => {
    if (scanTableBody) scanTableBody.innerHTML = "";
    if (scanEmptyState) scanEmptyState.style.display = "flex";
    if (scanProgressFill) scanProgressFill.style.width = "0%";
    if (scanProgressLabel) scanProgressLabel.textContent = "Scanned: 0 / 0";
    if (scanFoundLabel) scanFoundLabel.textContent = "Found: 0";
    resetScanStats();
  });
}

const btnMtrStart = document.getElementById('btn-mtr-start');
const btnMtrStop = document.getElementById('btn-mtr-stop');
if (btnMtrStart) btnMtrStart.addEventListener('click', startMtr);
if (btnMtrStop) btnMtrStop.addEventListener('click', stopMtr);

const btnRouteTrace = document.getElementById('btn-route-trace');
if (btnRouteTrace) btnRouteTrace.addEventListener('click', runRouteTrace);

// ── Table Resizing Logic ──────────────────────────────────────────────
function initTableResizers() {
  document.querySelectorAll('.resizer').forEach(handle => {
    let startX, startW, th;
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      th = handle.parentElement;
      startX = e.clientX;
      startW = th.offsetWidth;
      handle.classList.add('resizing');

      const onMove = ev => {
        const deltaX = ev.clientX - startX;
        th.style.width = Math.max(50, startW + deltaX) + 'px';
      };

      const onUp = () => {
        handle.classList.remove('resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

/**
 * ── Performance Monitor (RAM & Sparkline) ──
 */
function initPerformanceMonitor() {
  const ramText = document.getElementById("ram-text");
  const ramBar = document.getElementById("ram-bar");
  const canvas = document.getElementById("ram-sparkline");
  if (!canvas || !ramText || !ramBar) return;

  const ctx = canvas.getContext("2d");
  const history = new Array(24).fill(0);

  async function update() {
    try {
      // Call Rust backend for REAL system memory info
      const mem = await invoke("shittim_mem_task");
      const { used_mb, total_gb, percent } = mem;

      // Update Text
      ramText.textContent = `${used_mb}MB / ${total_gb}GB (${percent.toFixed(1)}%)`;

      // Update Bar
      ramBar.style.width = `${percent}%`;
      ramBar.classList.remove("warning", "critical");
      if (percent > 90) ramBar.classList.add("critical");
      else if (percent > 60) ramBar.classList.add("warning");

      // Update History for Sparkline
      history.push(percent);
      history.shift();
      renderSparkline();
    } catch (e) {
      console.warn("Failed to fetch real memory info:", e);
      // Optional: keep last known good or clear
    }
  }

  function renderSparkline() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Theme-aware colors
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const strokeColor = isLight ? "#006b5b" : "#A0FFB0";
    const glowColor = isLight ? "rgba(0, 107, 91, 0.3)" : "rgba(160, 255, 176, 0.5)";

    // Glow effect
    ctx.shadowBlur = 4;
    ctx.shadowColor = glowColor;
    
    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const step = canvas.width / (history.length - 1);
    // Find a local scale factor so the pulse is always visible
    const max = Math.max(...history, 1);
    const min = Math.min(...history);
    const range = (max - min) || 1;

    for (let i = 0; i < history.length; i++) {
        const x = i * step;
        const normalized = (history[i] - min) / range;
        const y = canvas.height - 2 - (normalized * (canvas.height - 4));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  setInterval(update, 2000); // 2s refresh to feel stable
  update();
}

// ── App Initialization ───────────────────────────────────────────────
(async function init() {
  const screen = document.getElementById("loading-screen");
  const hideLoading = () => {
    if (screen && !screen.classList.contains("hidden")) {
      screen.classList.add("hidden");
      setTimeout(() => screen.remove(), 500);
    }
  };

  const failsafeTimeout = setTimeout(() => {
    console.warn("Initialization taking too long, forcing UI display...");
    hideLoading();
  }, 3000);

  try {
    initMtrSorting();
    initTableResizers();
    initThemeListeners();
    
    // Clear errors on input
    document.querySelectorAll('md-outlined-text-field').forEach(field => {
      field.addEventListener('input', () => clearFieldError(field));
    });

    initTitlebar();
    initPool();
    restoreTheme();
    renderStats();
    initPerformanceMonitor();

    await Promise.race([
      customElements.whenDefined("md-tabs"),
      new Promise(r => setTimeout(r, 1500))
    ]);

    const cfg = await invoke("get_config").catch(e => {
      console.warn("Backend config unavailable:", e);
      return null;
    });

    if (cfg) {
      if (cfg.scan_preferences) {
        const p = cfg.scan_preferences;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal("scan-mask", p.default_mask || "255.255.255.0");
        setVal("scan-start-port", p.default_start_port || 1);
        setVal("scan-end-port", p.default_end_port || 65535);
        setVal("scan-concurrent", p.default_concurrent || 250);
        setVal("scan-syn-timeout", p.syn_timeout_ms || 500);
        setVal("scan-verify-concurrent", p.verify_concurrent || 50);
      }
      if (cfg.scan_history && cfg.scan_history.length > 0) {
        const netField = document.getElementById("scan-network");
        if (netField) netField.placeholder = cfg.scan_history[0];
      }
    }

    // Trigger initial page state and position indicator
    switchPage(0);

    // Initial check on startup
    checkProxyStatus();

  } catch (e) {
    console.error("Initialization failed unexpectedly:", e);
  } finally {
    clearTimeout(failsafeTimeout);
    hideLoading();
    console.info("Application initialized.");
  }
})();
