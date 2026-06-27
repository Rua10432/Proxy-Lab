/* ═══════════════════════════════════════════════════════════════════════════════
   Navigation — Page switching, sidebar, mobile nav
   ═══════════════════════════════════════════════════════════════════════════════ */
import { $$,$,createElement } from "./utils.js";
import { AppState } from "./state.js";
const LoadedPages = new Set();

/* ── First-page-ready signal for loading screen ── */
let _resolveFirstPage;
export const firstPageReady = new Promise((resolve) => { _resolveFirstPage = resolve; });

/* ── Lazy-load page JS modules only when first needed ── */
const PAGE_MODULES = {
  test: () => import('./pages/test.js'),
  scan: () => import('./pages/scan.js'),
  config: () => import('./pages/config.js'),
  logs: () => import('./pages/logs.js'),
  monitor: () => import('./pages/monitor.js'),
  settings: () => import('./pages/settings.js'),
};
/* Pages with tables also get column resizer */
const TABLE_PAGES = new Set(['test', 'scan', 'monitor']);
let _colResizeLoaded = false;
const _initializedPages = new Set();
let _renderSeq = 0;
let _activePage = null;

// Lazy load page-specific CSS (returns promise that resolves when loaded)
const _loadedCSS = new Set();
function loadPageCSS(pageName) {
  if (_loadedCSS.has(pageName)) return Promise.resolve();
  _loadedCSS.add(pageName);
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `assets/css/page-${pageName}.css`;
    link.onload = resolve;
    link.onerror = resolve; // don't block on error
    document.head.appendChild(link);
  });
}

async function renderPageFromHash() {
  const renderSeq = ++_renderSeq;
  let hash = window.location.hash.substring(1);
  if (!hash) {
    window.location.hash = '#test';
    return;
  }

  if (!PAGE_MODULES[hash]) {
    window.location.hash = '#test';
    return;
  }

  const container = $('#pages-container');
  if (!container) return;

  const existingPage = $('#page-' + hash);
  if (LoadedPages.has(hash) && !existingPage) {
    LoadedPages.delete(hash);
    _initializedPages.delete(hash);
  }

  if (!LoadedPages.has(hash)) {
    try {
      // Lazy load page CSS before injecting HTML
      await loadPageCSS(hash);

      const response = await fetch(`/pages/${hash}.html`);
      if (!response.ok) throw new Error(`Failed to load page: ${hash}`);
      const html = await response.text();

      const temp = document.createElement('div');
      temp.innerHTML = html;
      // Vite dev server injects <script type="module" src="/@vite/client"></script> at the top.
      // We must explicitly extract the actual .page container.
      const pageEl = temp.querySelector('.page');
      if (!pageEl) throw new Error(`Valid page structure not found in ${hash}.html`);
      pageEl.id = pageEl.id || `page-${hash}`;
      pageEl.classList.remove('active');

      container.appendChild(pageEl);
      LoadedPages.add(hash);
      if (renderSeq === _renderSeq && window.location.hash.substring(1) === hash) {
        activatePage(hash, pageEl);
      }

      // 页面 HTML 已渲染，立即隐藏加载屏幕
      if (_resolveFirstPage) {
        _resolveFirstPage();
        _resolveFirstPage = null;
      }

      // 以下初始化在后台继续执行，不阻塞用户看到界面
      await initializeLoadedPage(hash, pageEl);
    } catch (err) {
      console.error(err);
      if (typeof showSnackbar !== 'undefined') showSnackbar(`Navigation error: ${err.message}`, 'error');
      const failedPage = $('#page-' + hash);
      if (failedPage) {
        LoadedPages.add(hash);
        if (renderSeq === _renderSeq && window.location.hash.substring(1) === hash) {
          activatePage(hash, failedPage);
          queueRouteVisibilityCheck();
        }
      } else {
        LoadedPages.delete(hash);
      }
      _initializedPages.delete(hash);
      return;
    }
  }

  if (renderSeq !== _renderSeq || window.location.hash.substring(1) !== hash) {
    return;
  }

  const targetPage = $('#page-' + hash);
  if (!activatePage(hash, targetPage)) {
    LoadedPages.delete(hash);
    _initializedPages.delete(hash);
    renderPageFromHash();
    return;
  }

  if (!_initializedPages.has(hash)) {
    try {
      await initializeLoadedPage(hash, targetPage);
    } catch (err) {
      console.error(err);
      if (typeof showSnackbar !== 'undefined') showSnackbar(`Navigation error: ${err.message}`, 'error');
      _initializedPages.delete(hash);
    }
  }

  // Page-specific hooks
  if (hash === 'logs') {
    if (typeof window.renderLogConsole === 'function') window.renderLogConsole();
  }

  queueRouteVisibilityCheck();
}

function activatePage(hash, targetPage) {
  if (!targetPage) return false;

  if (_activePage && _activePage !== hash) {
    const cleanupName = `cleanup${_activePage.charAt(0).toUpperCase()}${_activePage.slice(1)}Page`;
    const cleanupFn = window[cleanupName];
    if (typeof cleanupFn === 'function') {
      try { cleanupFn(); } catch (err) { console.warn(`Page cleanup failed: ${_activePage}`, err); }
    }
  }
  _activePage = hash;
  AppState.currentPage = hash;

  $$('.page').forEach(p => p.classList.remove('active'));
  targetPage.classList.add('active');

  $$('.sidebar-nav .nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === hash);
  });

  $$('#mobile-nav .mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === hash);
  });

  return true;
}

async function initializeLoadedPage(hash, pageEl) {
  if (_initializedPages.has(hash)) return;

  await PAGE_MODULES[hash]();

  if (TABLE_PAGES.has(hash) && !_colResizeLoaded) {
    await import('./col-resize.js');
    _colResizeLoaded = true;
  }

  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => setTimeout(resolve, 0));

  initSelects(pageEl);
  initSwitches(pageEl);

  const PAGE_INIT_MAP = {
    test: typeof window.initTestPage !== 'undefined' ? window.initTestPage : null,
    scan: typeof window.initScanPage !== 'undefined' ? window.initScanPage : null,
    config: typeof window.initConfigPage !== 'undefined' ? window.initConfigPage : null,
    logs: typeof window.initLogsPage !== 'undefined' ? window.initLogsPage : null,
    monitor: typeof window.initMonitorPage !== 'undefined' ? window.initMonitorPage : null,
    settings: typeof window.initSettingsPage !== 'undefined' ? window.initSettingsPage : null,
  };

  const initFn = PAGE_INIT_MAP[hash];
  if (initFn) initFn();

  _initializedPages.add(hash);

  if (typeof applyLanguage !== 'undefined') applyLanguage();
}

function queueRouteVisibilityCheck() {
  requestAnimationFrame(ensureRouteVisible);
  setTimeout(ensureRouteVisible, 0);
  setTimeout(ensureRouteVisible, 100);
}

function ensureRouteVisible() {
  const hash = window.location.hash.substring(1) || 'test';
  if (!PAGE_MODULES[hash]) return;

  const targetPage = $('#page-' + hash);
  if (targetPage) {
    if (!targetPage.classList.contains('active')) {
      activatePage(hash, targetPage);
    }
    return;
  }

  if (LoadedPages.has(hash)) {
    LoadedPages.delete(hash);
    _initializedPages.delete(hash);
    renderPageFromHash();
  }
}

function switchPage(pageId) {
  const nextHash = '#' + pageId;
  if (window.location.hash === nextHash) {
    renderPageFromHash();
    return;
  }
  window.location.hash = nextHash;
}

export function initNavigation() {
  $$('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });

  $$('#mobile-nav .mobile-nav-item').forEach(item => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });

  // Listen for hash changes
  window.addEventListener('hashchange', renderPageFromHash);

  // Trigger initial routing
  renderPageFromHash();
}

/* ── Select Dropdown Component ── */
export function initSelects(container = document) {
  $$('.select-field', container).forEach(selectField => {
    const trigger = selectField.querySelector('.select-trigger');
    const dropdown = selectField.querySelector('.select-dropdown');
    const valueSpan = trigger.querySelector('.select-value');
    const options = dropdown.querySelectorAll('.select-option');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close other selects first
      $$('.select-field .select-dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
      });
      $$('.select-field .select-trigger.open').forEach(t => {
        if (t !== trigger) t.classList.remove('open');
      });
      dropdown.classList.toggle('open');
      trigger.classList.toggle('open');
    });

    options.forEach(opt => {
      opt.addEventListener('click', () => {
        const val = opt.dataset.value;
        valueSpan.textContent = opt.textContent;
        options.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
        // Dispatch custom event
        selectField.dispatchEvent(new CustomEvent('change', { detail: val }));
      });
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    $$('.select-field .select-dropdown.open').forEach(d => d.classList.remove('open'));
    $$('.select-field .select-trigger.open').forEach(t => t.classList.remove('open'));
    $$('.copy-dropdown.open').forEach(d => d.classList.remove('open'));
  });
}

export function getSelectValue(selectFieldId) {
  const field = $('#' + selectFieldId);
  if (!field) return '';
  const selected = field.querySelector('.select-option.selected');
  return selected ? selected.dataset.value : '';
}

/* ── Switch Toggle ── */
export function initSwitches() {
  $$('.switch').forEach(sw => {
    sw.addEventListener('click', () => {
      sw.classList.toggle('on');
      sw.dispatchEvent(new CustomEvent('toggle', { detail: sw.classList.contains('on') }));
    });
  });
}

/* ── Dialog Component ── */
export function showDialog({ title, icon, body, actions, onBackdropClick }) {
  const overlay = $('#dialog-overlay');
  const titleEl = $('#dialog-title');
  const iconEl = $('#dialog-icon');
  const bodyEl = $('#dialog-body');
  const actionsEl = $('#dialog-actions');

  titleEl.textContent = title || '';
  if (icon) {
    iconEl.textContent = icon;
    iconEl.style.display = '';
  } else {
    iconEl.style.display = 'none';
  }
  if (typeof body === 'string') {
    bodyEl.textContent = body;
  } else {
    bodyEl.innerHTML = '';
    bodyEl.appendChild(body);
  }

  actionsEl.innerHTML = '';
  if (actions && actions.length) {
    actions.forEach(act => {
      const btn = createElement('button', {
        className: 'btn ' + (act.class || 'btn-text'),
        textContent: act.label,
        onClick: () => {
          closeDialog();
          if (act.onClick) act.onClick();
        },
      });
      actionsEl.appendChild(btn);
    });
  }

  overlay.classList.add('open');

  // Backdrop click
  const backdrop = $('#dialog-backdrop');
  backdrop.onclick = () => {
    if (onBackdropClick !== false) closeDialog();
  };

  // Close button (may not exist)
  const closeBtn = $('#dialog-close');
  if (closeBtn) closeBtn.onclick = closeDialog;
}

export function closeDialog() {
  $('#dialog-overlay').classList.remove('open');
}

/* ── Snackbar Component ── */
let _snackTimer = null;
export function showSnackbar(text, type = 'info', duration = 4000) {
  const snack = $('#snackbar');
  const iconEl = $('#snack-icon');
  const textEl = $('#snack-text');

  const iconMap = { info: 'info', success: 'check_circle', error: 'error' };
  iconEl.textContent = iconMap[type] || 'info';

  const colorMap = {
    info: 'var(--color-accent-blue)',
    success: 'var(--color-accent-green)',
    error: 'var(--color-accent-pink)',
  };
  iconEl.style.color = colorMap[type] || colorMap.info;

  textEl.textContent = text;
  snack.classList.add('visible');

  if (_snackTimer) clearTimeout(_snackTimer);
  _snackTimer = setTimeout(() => {
    snack.classList.remove('visible');
  }, duration);
}

// Snackbar close button
export function initSnackbar() {
  $('#snack-close').addEventListener('click', () => {
    $('#snackbar').classList.remove('visible');
    if (_snackTimer) clearTimeout(_snackTimer);
  });
}

window.initNavigation = initNavigation;
window.initSelects = initSelects;
window.initSwitches = initSwitches;
window.showDialog = showDialog;
window.closeDialog = closeDialog;
window.showSnackbar = showSnackbar;
window.initSnackbar = initSnackbar;
window.switchPage = switchPage;
