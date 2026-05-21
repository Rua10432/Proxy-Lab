/* ═══════════════════════════════════════════════════════════════════════════════
   Page: Config — System Proxy Setup
   ═══════════════════════════════════════════════════════════════════════════════ */
import { getSelectValue } from "../navigation";

function initConfigPage() {
  $('#btn-config').addEventListener('click', applyProxyConfig);
  $('#btn-config-disconnect').addEventListener('click', disconnectProxy);
  $('#btn-clear-recent').addEventListener('click', () => {
    AppState.configHistory = [];
    renderConfigHistory();
    showSnackbar('Config history cleared', 'success');
  });

  AppState.configHistory = loadFromStorage('configHistory', []);
  renderConfigHistory();
  checkProxyStatus();
  scanLocalProxyPorts();
  $('#btn-refresh-local-proxy').addEventListener('click', scanLocalProxyPorts);
}

function applyProxyConfig() {
  const host = $('#config-host').value.trim();
  const port = $('#config-port').value.trim();
  const proto = getSelectValue('config-proto-select');
  const user = $('#config-user').value.trim() || null;
  const pass = $('#config-pass').value.trim() || null;

  if (!host) {
    setFieldError($('#config-host').closest('.input-wrap'), 'Address is required');
    return;
  }
  if (!port) {
    setFieldError($('#config-port').closest('.input-wrap'), 'Port is required');
    return;
  }
  clearFieldError($('#config-host').closest('.input-wrap'));
  clearFieldError($('#config-port').closest('.input-wrap'));
  if (!isTauriAvailable()) return;

  appendLog('info', `Applying proxy: ${host}:${port} (${proto})...`);
  renderLogConsole();

  tauriInvoke('config_proxy', {
    host, port, protocol: proto,
    username: user, password: pass,
  }).then((result) => {
    AppState.proxyActive = true;
    $('#btn-config-disconnect').disabled = false;
    updateAdminLock(true);
    appendLog('ok', result || `Proxy configured: ${host}:${port} (${proto})`);
    renderLogConsole();
    showSnackbar('Proxy applied successfully', 'success');
    saveConfigHistory(host, parseInt(port), proto, user);
  }).catch(() => {
    updateAdminLock(false);
  });
}

function disconnectProxy() {
  if (!isTauriAvailable()) return;
  appendLog('info', 'Disconnecting proxy...');
  renderLogConsole();

  tauriInvoke('disconnect_proxy').then((result) => {
    AppState.proxyActive = false;
    $('#btn-config-disconnect').disabled = true;
    updateAdminLock(false);
    appendLog('ok', result || 'Proxy disconnected');
    renderLogConsole();
    showSnackbar('Proxy disconnected', 'success');
  });
}

async function checkProxyStatus() {
  if (isTauriAvailable()) {
    try {
      const status = await tauriInvoke('get_proxy_status');
      if (status && status.is_active) {
        AppState.proxyActive = true;
        $('#config-host').value = status.host;
        $('#config-port').value = status.port;
        const selectField = $('#config-proto-select');
        selectField.querySelectorAll('.select-option').forEach(o => {
          o.classList.toggle('selected', o.dataset.value === status.protocol);
        });
        selectField.querySelector('.select-value').textContent = status.protocol;
        $('#btn-config-disconnect').disabled = false;
        updateAdminLock(true);
      }
    } catch (_) {}
  }

  if (isTauriAvailable()) {
    try {
      const admin = await tauriInvoke('is_admin');
      if (admin) {
        $('#admin-lock-icon').textContent = 'admin_panel_settings';
        $('#admin-lock-icon').style.color = 'var(--color-accent-yellow)';
      }
    } catch (_) {}
  }
}

function updateAdminLock(active) {
  const icon = $('#admin-lock-icon');
  if (active) {
    icon.textContent = 'lock_open';
    icon.style.color = 'var(--color-accent-green)';
  } else {
    icon.textContent = 'lock';
    icon.style.color = '';
  }
}

function saveConfigHistory(host, port, protocol, username) {
  AppState.configHistory.unshift({
    id: genId(),
    host, port, protocol,
    username: username || undefined,
    timestamp: new Date().toISOString(),
  });
  if (AppState.configHistory.length > 20) AppState.configHistory = AppState.configHistory.slice(0, 20);
  saveToStorage('configHistory', AppState.configHistory);
  renderConfigHistory();
}

function renderConfigHistory() {
  const section = $('#recent-configs-section');
  const list = $('#recent-configs-list');
  if (AppState.configHistory.length === 0) {
    section.classList.remove('visible');
    return;
  }
  section.classList.add('visible');
  list.innerHTML = '';
  AppState.configHistory.forEach(item => {
    const card = createElement('div', { className: 'history-card' });
    const date = new Date(item.timestamp);
    card.innerHTML = `
      <div class="card-title">${item.host}:${item.port} <span class="proto-badge ${item.protocol === 'HTTP' ? 'proto-http' : 'proto-socks5'}">${item.protocol}</span></div>
      <div class="card-meta">${item.username ? item.username + ' · ' : ''}${formatTime(date)}</div>
    `;
    card.addEventListener('click', () => {
      $('#config-host').value = item.host;
      $('#config-port').value = item.port;
      $('#config-user').value = item.username || '';
      const selectField = $('#config-proto-select');
      selectField.querySelectorAll('.select-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.value === item.protocol);
      });
      selectField.querySelector('.select-value').textContent = item.protocol;
    });
    list.appendChild(card);
  });
}

// ─── Local Proxy Port Detection ────────────────────────────────────────────

// 常见代理端口 → 默认协议映射（主要用于提示）
const PROXY_PORT_PROTOCOLS = {
  1080: 'SOCKS5', 1081: 'SOCKS5', 1088: 'SOCKS5',
  3128: 'HTTP', 3129: 'HTTP',
  7890: 'HTTP', 7891: 'HTTP', 7892: 'HTTP',
  8080: 'HTTP', 8081: 'HTTP',
  8118: 'HTTP',
  8443: 'HTTPS',
  8888: 'HTTP',
  9050: 'SOCKS5', 9150: 'SOCKS5',
  9090: 'HTTP',
  10000: 'HTTP',
};

async function scanLocalProxyPorts() {
  const list = $('#local-proxy-list');
  list.innerHTML = '<div class="local-proxy-empty">正在检测本地代理服务...</div>';

  if (!isTauriAvailable()) {
    list.innerHTML = '<div class="local-proxy-empty" style="color:var(--color-text-muted)">代理检测仅在桌面应用中可用</div>';
    return;
  }

  try {
    const ports = await tauriInvoke('get_local_proxy_ports');
    if (!ports || ports.length === 0) {
      list.innerHTML = '<div class="local-proxy-empty">未检测到本机正在运行的代理服务</div>';
      return;
    }

    list.innerHTML = '';
    ports.forEach(p => {
      const proto = PROXY_PORT_PROTOCOLS[p.port] || (p.protocol === 'TCP6' ? 'HTTP' : 'SOCKS5');
      const card = createElement('div', { className: 'local-proxy-card' });
      card.innerHTML = `
        <div class="lpc-left">
          <span class="lpc-port">${p.port}</span>
          <span class="lpc-proto-badge">${proto}</span>
        </div>
        <div class="lpc-right">
          <span class="lpc-proc">${p.process_name}</span>
          <span class="lpc-state">${p.state}</span>
        </div>
      `;
      // 点击填充到配置表单
      card.addEventListener('click', () => {
        $('#config-host').value = '127.0.0.1';
        $('#config-port').value = p.port;
        const selectField = $('#config-proto-select');
        selectField.querySelectorAll('.select-option').forEach(o => {
          o.classList.toggle('selected', o.dataset.value === proto);
        });
        selectField.querySelector('.select-value').textContent = proto;
        showSnackbar(`已填入 127.0.0.1:${p.port} (${proto})`, 'success');
      });
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = `<div class="local-proxy-empty" style="color:var(--color-accent-red)">检测失败: ${err}</div>`;
  }
}

window.initConfigPage = initConfigPage;

