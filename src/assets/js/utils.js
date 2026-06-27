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
  return escapeHtml(protocol);
}

function statusBadge(status) {
  const map = {
    untested: '<span class="badge badge-outline">Untested</span>',
    ok: '<span class="badge badge-green">OK</span>',
    fail: '<span class="badge badge-pink">Fail</span>',
  };
  return map[status] || escapeHtml(status);
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
  AppState.logs = [{
    id: 'cleared-' + Date.now(),
    level: 'info',
    content: '----- Message cleared -----',
    timestamp: new Date(),
    source: '',
  }];
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

/* ── IP & Subnet Validation ── */
function isValidIPv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return false;
    if (part.length > 1 && part[0] === '0') return false; // no leading zeros
    return String(n) === part;
  });
}

function isValidIPv6(ip) {
  // Strip brackets [::1] -> ::1
  const raw = ip.replace(/^\[|\]$/g, '');
  if (raw.length < 2) return false;
  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 8) return false;

  // Count empty segments (:: compression)
  const emptyCount = parts.filter(p => p === '').length;
  if (emptyCount > 1) return false; // :: used more than once

  // Allow exactly one :: compression
  const compressed = raw.includes('::');
  if (compressed && parts.length > 8) return false;
  if (!compressed && parts.length !== 8) return false;

  return parts.every((part, i) => {
    if (part === '') return true; // empty from ::
    if (part.length > 4) return false;
    // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1)
    if (part.includes('.') && i >= parts.length - 2) return isValidIPv4(part);
    return /^[0-9a-fA-F]{1,4}$/.test(part);
  });
}

function isValidIP(ip) {
  if (!ip || typeof ip !== 'string') return false;
  return isValidIPv4(ip) || isValidIPv6(ip);
}

function isValidSubnetMask(mask) {
  const parts = mask.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map(p => {
    const n = parseInt(p, 10);
    return isNaN(n) ? -1 : n;
  });
  if (nums.some(n => n < 0 || n > 255)) return false;

  // Convert to 32-bit binary string
  const binary = nums.map(n => n.toString(2).padStart(8, '0')).join('');
  // Valid mask: 1s followed by 0s
  const firstZero = binary.indexOf('0');
  if (firstZero === -1) return true; // 255.255.255.255 (valid, though unusual)
  return binary.indexOf('1', firstZero) === -1;
}

function isValidPort(port) {
  const n = parseInt(port, 10);
  return !isNaN(n) && n >= 1 && n <= 65535 && String(n) === String(port).trim();
}

function validateAndStyle(inputEl) {
  const wrap = inputEl.closest('.input-wrap');
  const field = wrap?.closest('.input-field');
  if (!wrap) return true;
  const val = inputEl.value.trim();
  if (!val) {
    wrap.classList.remove('valid', 'error');
    const errEl = field?.querySelector('.error-text');
    if (errEl) errEl.remove();
    return true; // empty = no validation error (required handled elsewhere)
  }

  const type = inputEl.dataset.validate;
  let valid = false;
  let msg = '';
  if (type === 'ip') {
    valid = isValidIP(val);
    if (!valid) msg = '无效的 IP 地址格式';
  } else if (type === 'subnet') {
    valid = isValidSubnetMask(val);
    if (!valid) msg = '无效的子网掩码格式';
  } else if (type === 'port') {
    valid = isValidPort(val);
    if (!valid) msg = '端口范围 1-65535';
  } else {
    return true;
  }

  wrap.classList.remove('valid', 'error');
  const errEl = field?.querySelector('.error-text');
  if (valid) {
    wrap.classList.add('valid');
    if (errEl) errEl.remove();
  } else {
    wrap.classList.add('error');
    if (field) {
      if (!errEl) {
        const el = document.createElement('span');
        el.className = 'error-text';
        el.textContent = msg;
        field.appendChild(el);
      } else {
        errEl.textContent = msg;
      }
    }
  }
  return valid;
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

/* ── In-Memory Config Cache (backed by config.json via IPC) ── */
const _configCache = {
  theme: 'dark',
  primaryColor: '#9eddc8',
  titleBarMode: 'custom',
  closeConfirm: true,
  language: 'en',
  exportDirectory: '',
  dontAskDate: '',
  testHistory: [],
  configHistory: [],
  proxyPool: [],
  scanPreferences: {
    defaultMask: '255.255.255.0',
    defaultStartPort: 1,
    defaultEndPort: 65535,
    defaultConcurrent: 80,
    timeoutMs: 1500,
    synTimeoutMs: 500,
    verifyConcurrent: 50,
  },
};

function saveToStorage(key, data) {
  _configCache[key] = data;
  if (window.tauriInvoke) {
    window.tauriInvoke('save_frontend_key', { key, value: JSON.stringify(data) }).catch(() => {});
  }
}

function loadFromStorage(key, fallback) {
  return key in _configCache ? _configCache[key] : fallback;
}

/**
 * Load config.json from disk and populate the in-memory cache.
 * Call this early in app init, before pages read their data.
 */
async function loadFullConfig() {
  if (!window.tauriInvoke) return;
  try {
    const cfg = await window.tauriInvoke('get_config');
    if (!cfg) return;

    const ui = cfg.ui_preferences || {};
    _configCache.theme = ui.theme ?? 'dark';
    _configCache.primaryColor = ui.primaryColor ?? '#9eddc8';
    _configCache.titleBarMode = ui.titleBarMode ?? 'custom';
    _configCache.closeConfirm = ui.closeConfirm ?? true;
    _configCache.language = ui.language ?? 'en';
    _configCache.exportDirectory = ui.exportDirectory ?? '';
    _configCache.dontAskDate = ui.dontAskDate ?? '';

    if (cfg.frontend_test_history) _configCache.testHistory = cfg.frontend_test_history;
    if (cfg.frontend_config_history) _configCache.configHistory = cfg.frontend_config_history;
    if (cfg.frontend_proxy_pool) _configCache.proxyPool = cfg.frontend_proxy_pool;
    if (cfg.scan_preferences) _configCache.scanPreferences = { ..._configCache.scanPreferences, ...cfg.scan_preferences };
  } catch (e) {
    console.warn('Failed to load config from disk, using defaults:', e);
  }
}

/* ── Export Helpers (JSON / XML / XLSX) ── */
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function saveExportFile(content, filename, mimeType) {
  const exportDir = loadFromStorage('exportDirectory', '');
  if (exportDir && window.tauriInvoke) {
    try {
      const fullPath = exportDir.replace(/\\$/, '') + '\\' + filename;
      await window.tauriInvoke('write_export_file', { path: fullPath, content });
      return true;
    } catch (err) {
      console.warn('Tauri file write failed, falling back to browser download:', err);
    }
  }
  downloadBlob(content, filename, mimeType);
  return false;
}

async function exportAsJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  await saveExportFile(json, filename, 'application/json;charset=utf-8');
}

async function exportAsXML(data, rootTag, itemTag, fields, filename) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<${rootTag}>\n`;
  (data || []).forEach(item => {
    xml += `  <${itemTag}>\n`;
    fields.forEach(f => {
      const val = item[f.key] !== undefined && item[f.key] !== null ? item[f.key] : '';
      xml += `    <${f.key}>${escapeXml(String(val))}</${f.key}>\n`;
    });
    xml += `  </${itemTag}>\n`;
  });
  xml += `</${rootTag}>\n`;
  await saveExportFile(xml, filename, 'application/xml;charset=utf-8');
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function exportAsXLSX(data, fields, filename) {
  let table = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  table += '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>';
  table += '<body><table>';
  // Header row
  table += '<tr>';
  fields.forEach(f => { table += `<th>${escapeXml(f.label)}</th>`; });
  table += '</tr>';
  // Data rows
  (data || []).forEach(item => {
    table += '<tr>';
    fields.forEach(f => {
      const val = item[f.key] !== undefined && item[f.key] !== null ? item[f.key] : '';
      table += `<td>${escapeXml(String(val))}</td>`;
    });
    table += '</tr>';
  });
  table += '</table></body></html>';
  await saveExportFile(table, filename, 'application/vnd.ms-excel;charset=utf-8');
}

/* ── Table Render Helper ── */
/**
 * Unified table renderer with automatic empty-state toggling.
 * @param {Array} data        - Data array (may be null/undefined/empty)
 * @param {HTMLElement} tbody - <tbody> element to populate
 * @param {HTMLElement} emptyState - .empty-state / .table-empty element
 * @param {Function} renderRowFn - (item, index) => HTMLTableRowElement | DocumentFragment | HTML string for one <tr>
 * @param {Function} [onAfterRender] - Optional callback after data rendered
 */
function renderTable(data, tbody, emptyState, renderRowFn, onAfterRender) {
  tbody.replaceChildren();
  const table = tbody.closest('table');

  if (!data || data.length === 0) {
    if (table) table.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  if (table) table.classList.remove('hidden');
  emptyState.classList.add('hidden');

  const fragment = document.createDocumentFragment();
  data.forEach((item, index) => {
    const rendered = renderRowFn(item, index);
    if (!rendered) return;
    if (rendered instanceof HTMLTableRowElement || rendered instanceof DocumentFragment) {
      fragment.appendChild(rendered);
      return;
    }
    if (rendered instanceof HTMLElement) {
      const tr = document.createElement('tr');
      tr.appendChild(rendered);
      fragment.appendChild(tr);
      return;
    }
    if (typeof rendered === 'string') {
      const template = document.createElement('template');
      template.innerHTML = rendered.trim();
      template.content.querySelectorAll('script').forEach(el => el.remove());
      template.content.querySelectorAll('*').forEach(el => {
        [...el.attributes].forEach(attr => {
          if (/^on/i.test(attr.name) || /^javascript:/i.test(attr.value.trim())) {
            el.removeAttribute(attr.name);
          }
        });
      });
      fragment.appendChild(template.content);
    }
  });
  tbody.appendChild(fragment);

  if (typeof onAfterRender === 'function') onAfterRender(tbody);
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
window.loadFullConfig = loadFullConfig;
window.isValidIP = isValidIP;
window.isValidIPv4 = isValidIPv4;
window.isValidIPv6 = isValidIPv6;
window.isValidSubnetMask = isValidSubnetMask;
window.isValidPort = isValidPort;
window.validateAndStyle = validateAndStyle;
window.exportAsJSON = exportAsJSON;
window.exportAsXML = exportAsXML;
window.exportAsXLSX = exportAsXLSX;
window.renderTable = renderTable;
