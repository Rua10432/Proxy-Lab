/* ═══════════════════════════════════════════════════════════════════════════════
   State Management — Global application state (vanilla JS)
   ═══════════════════════════════════════════════════════════════════════════════ */

export const AppState = {
  // Navigation
  currentPage: 'test',

  // Test page
  testTab: 'manual',
  testStatus: 'ready',  // ready | testing | done | error
  testResults: [],
  testHistory: [],

  // Scan page
  scanStatus: 'idle',  // idle | scanning | done | error
  scanResults: [],
  scanStats: {
    scanned: 0,
    total: 0,
    portsOpen: 0,
    found: 0,
    avgLatency: 0,
    speed: 0,
  },

  // Proxy Pool
  proxyPool: [],

  // Logs
  logs: [],
  logFilter: '',
  logLevelFilter: 'all',
  autoScroll: true,

  // Config
  proxyActive: false,
  configHistory: [],

  // Monitor
  monitorData: null,
  monitorRules: [],
  monitorAutoRefresh: true,
  monitorInterval: 3000,

  // Theme
  theme: 'dark',
  primaryColor: '#9eddc8',

  // Title Bar
  titleBarMode: 'custom',  // 'system' | 'custom'

  // UI
  isLoading: true,
};

/* ── State Change Listeners ── */
const _listeners = [];

function subscribeState(listener) {
  _listeners.push(listener);
  return () => {
    const idx = _listeners.indexOf(listener);
    if (idx > -1) _listeners.splice(idx, 1);
  };
}

function notifyListeners(key) {
  _listeners.forEach(fn => fn(key, AppState));
}

function setState(updates) {
  Object.assign(AppState, updates);
  Object.keys(updates).forEach(key => notifyListeners(key));
}

/* ── Helper: Generate unique ID ── */
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

window.AppState = AppState;
window.genId = genId;

