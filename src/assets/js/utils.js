import { genId,AppState } from "./state.js";

/* ═══════════════════════════════════════════════════════════════════════════════
   Utility Functions
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ── DOM Helpers ── */
export function $(selector, context = document) { return context.querySelector(selector); }
export function $$(selector, context = document) { return context.querySelectorAll(selector); }

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, val]) => {
    if (key === 'className') el.className = val;
    else if (key === 'textContent') el.textContent = val;
    else if (key === 'innerHTML') el.innerHTML = val;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else el.setAttribute(key, val);
  });
  children.forEach(child => {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  });
  return el;
}

/* ── Format Helpers ── */
function formatMs(microseconds) {
  if (microseconds < 1000) return microseconds + 'μs';
  const ms = microseconds / 1000;
  if (ms < 1000) return ms.toFixed(1) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

function formatLatency(ms) {
  if (ms < 0) return 'timeout';
  if (ms < 1) return (ms * 1000).toFixed(0) + 'μs';
  if (ms < 1000) return ms.toFixed(1) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

function latencyColor(ms) {
  if (ms === undefined || ms === null) return 'var(--color-text-subtle)';
  if (ms < 100) return 'var(--color-accent-green)';
  if (ms < 300) return 'var(--color-accent-yellow)';
  return 'var(--color-accent-pink)';
}

function latencyClass(ms) {
  if (ms === undefined || ms === null) return '';
  if (ms < 100) return 'fast';
  if (ms < 300) return 'medium';
  return 'slow';
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function protocolBadge(protocol) {
  if (protocol === 'HTTP') return '<span class="proto-badge proto-http">HTTP</span>';
  if (protocol === 'SOCKS5') return '<span class="proto-badge proto-socks5">SOCKS5</span>';
  return protocol;
}

function statusBadge(status) {
  const map = {
    untested: '<span class="badge badge-outline">Untested</span>',
    ok: '<span class="badge badge-green">OK</span>',
    fail: '<span class="badge badge-pink">Fail</span>',
  };
  return map[status] || status;
}

/* ── Log Helpers ── */
export function appendLog(level, content, source) {
  const log = {
    id: genId(),
    level: level,   // info | ok | error | warn
    content: content,
    timestamp: new Date(),
    source: source || '',
  };
  AppState.logs.push(log);
  return log;
}

function clearLogs() {
  AppState.logs = [];
}

/* ── Classification ── */
function classifyTestLine(line) {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('timeout') || lower.includes('refused')) return 'error';
  if (lower.includes('ok') || lower.includes('success') || lower.includes('connected') || lower.includes('passed')) return 'ok';
  return 'info';
}

function classifyConfigLine(line) {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('denied')) return 'error';
  if (lower.includes('ok') || lower.includes('success') || lower.includes('applied') || lower.includes('configured')) return 'ok';
  return 'info';
}

/* ── Field Error ── */
function setFieldError(inputWrap, msg) {
  inputWrap.classList.add('error');
  const field = inputWrap.closest('.input-field');
  if (field) {
    let errEl = field.querySelector('.error-text');
    if (!errEl) {
      errEl = createElement('span', { className: 'error-text', textContent: msg });
      field.appendChild(errEl);
    } else {
      errEl.textContent = msg;
    }
  }
}

function clearFieldError(inputWrap) {
  inputWrap.classList.remove('error');
  const field = inputWrap.closest('.input-field');
  if (field) {
    const errEl = field.querySelector('.error-text');
    if (errEl) errEl.remove();
  }
}

/* ── HTML Escaping ── */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── LocalStorage Helpers ── */
function saveToStorage(key, data) {
  try {
    localStorage.setItem('proxy-tester-' + key, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem('proxy-tester-' + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

window.$ = $;
window.$$ = $$;
window.createElement = createElement;
window.formatMs = formatMs;
window.formatLatency = formatLatency;
window.latencyColor = latencyColor;
window.latencyClass = latencyClass;
window.formatTime = formatTime;
window.protocolBadge = protocolBadge;
window.statusBadge = statusBadge;
window.appendLog = appendLog;
window.clearLogs = clearLogs;
window.classifyTestLine = classifyTestLine;
window.classifyConfigLine = classifyConfigLine;
window.setFieldError = setFieldError;
window.clearFieldError = clearFieldError;
window.escapeHtml = escapeHtml;
window.saveToStorage = saveToStorage;
window.loadFromStorage = loadFromStorage;

