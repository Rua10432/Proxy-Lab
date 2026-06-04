import { getSelectValue } from "../navigation";

let _testedOk = false;
let _currentMode = 'System';
let _editingPacRuleIndex = -1;

function initConfigPage() {
  $('#btn-test-config').addEventListener('click', testProxyConfig);
  $('#btn-config').addEventListener('click', applyProxyConfig);
  $('#btn-config-disconnect').addEventListener('click', disconnectProxy);
  $('#btn-clear-recent').addEventListener('click', () => {
    AppState.configHistory = [];
    renderConfigHistory();
    showSnackbar('配置历史已清除', 'success');
  });

  ['config-host', 'config-port', 'config-user', 'config-pass'].forEach(id => {
    $('#' + id).addEventListener('input', resetTestState);
  });
  $('#config-proto-select').addEventListener('click', () => {
    setTimeout(resetTestState, 50);
  });

  // Mode selector
  $('#config-mode-selector').addEventListener('click', (e) => {
    const tab = e.target.closest('.mode-tab');
    if (!tab) return;
    switchProxyMode(tab.dataset.mode);
  });

  // PAC controls
  $('#pac-toggle').addEventListener('change', togglePac);
  $('#btn-add-pac-rule').addEventListener('click', showPacRuleForm);
  $('#btn-save-pac-rule').addEventListener('click', savePacRule);
  $('#btn-cancel-pac-rule').addEventListener('click', hidePacRuleForm);
  $('#btn-preview-pac').addEventListener('click', togglePacPreview);
  $('#btn-close-pac-preview').addEventListener('click', () => {
    $('#pac-preview').style.display = 'none';
  });

  AppState.configHistory = loadFromStorage('configHistory', []);
  renderConfigHistory();
  checkProxyStatus();
  scanLocalProxyPorts();
  $('#btn-refresh-local-proxy').addEventListener('click', scanLocalProxyPorts);
  updateExportPoolCount();

  loadProxyMode();
}

// ─── Proxy Mode ──────────────────────────────────────────────────────────

async function loadProxyMode() {
  if (!isTauriAvailable()) return;
  try {
    const mode = await tauriInvoke('get_proxy_mode');
    _currentMode = mode;
    applyModeUI(mode);
    highlightModeTab(mode);
  } catch (_) {}
}

async function switchProxyMode(mode) {
  if (mode === _currentMode) return;
  _currentMode = mode;
  highlightModeTab(mode);
  applyModeUI(mode);

  if (isTauriAvailable()) {
    try {
      await tauriInvoke('set_proxy_mode', { mode });
      appendLog('info', '切换代理模式: ' + mode);
      renderLogConsole();
    } catch (err) {
      showSnackbar('切换模式失败: ' + err, 'error');
    }
  }

  if (mode === 'Pac') {
    loadPacRules();
  }
}

function highlightModeTab(mode) {
  $$('#config-mode-selector .mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });
}

function applyModeUI(mode) {
  const titleText = $('#config-title-text');
  const badge = $('#config-mode-badge');
  const btnText = $('#btn-config-text');
  const pacEditor = $('#pac-editor-section');
  const testBtn = $('#btn-test-config');

  switch (mode) {
    case 'System':
      titleText.textContent = '系统代理设置';
      badge.textContent = '系统代理';
      btnText.textContent = '应用系统代理';
      pacEditor.style.display = 'none';
      testBtn.style.display = '';
      break;
    case 'AppOnly':
      titleText.textContent = '应用内部代理配置';
      badge.textContent = '应用内部';
      btnText.textContent = '保存配置';
      pacEditor.style.display = 'none';
      testBtn.style.display = 'none';
      break;
    case 'Pac':
      titleText.textContent = 'PAC 代理配置';
      badge.textContent = 'PAC 模式';
      btnText.textContent = '保存到 PAC';
      pacEditor.style.display = '';
      testBtn.style.display = '';
      break;
  }

  resetTestState();
}

// ─── PAC Rules ───────────────────────────────────────────────────────────

async function loadPacRules() {
  if (!isTauriAvailable()) return;
  try {
    const rules = await tauriInvoke('get_pac_rules');
    const enabled = await tauriInvoke('get_pac_enabled');
    $('#pac-toggle').checked = enabled;
    $('#pac-toggle-text').textContent = enabled ? '已启用' : '已禁用';
    renderPacRules(rules);
  } catch (_) {}
}

function renderPacRules(rules) {
  const list = $('#pac-rules-list');
  if (!rules || rules.length === 0) {
    list.innerHTML = '<div class="pac-rules-empty">暂无规则，添加新规则或直接配置代理服务器后会自动创建默认规则</div>';
    return;
  }

  list.innerHTML = '';
  rules.forEach((rule, idx) => {
    const card = createElement('div', { className: 'pac-rule-card' });
    const domainLabel = rule.domain_pattern === '*' ? '全部流量' : rule.domain_pattern;
    card.innerHTML = [
      '<div class="pac-rule-info">',
      '  <span class="pac-rule-domain">', escapeHtml(domainLabel), '</span>',
      '  <span class="pac-rule-arrow">→</span>',
      '  <span class="pac-rule-proxy">', escapeHtml(rule.proxy), '</span>',
      '</div>',
      '<div class="pac-rule-actions">',
      '  <label class="toggle-label-sm">',
      '    <input type="checkbox" class="pac-rule-toggle" data-index="', idx, '"', rule.enabled ? ' checked' : '', '>',
      '    <span class="toggle-track-sm"><span class="toggle-thumb-sm"></span></span>',
      '  </label>',
      '  <button class="btn btn-text-icon pac-rule-edit" data-index="', idx, '" title="编辑">',
      '    <span class="icon icon-sm">edit</span>',
      '  </button>',
      '  <button class="btn btn-text-icon pac-rule-delete" data-index="', idx, '" title="删除">',
      '    <span class="icon icon-sm">delete</span>',
      '  </button>',
      '</div>',
    ].join('');
    list.appendChild(card);

    card.querySelector('.pac-rule-toggle').addEventListener('change', async (e) => {
      const i = parseInt(e.target.dataset.index);
      rules[i].enabled = e.target.checked;
      await savePacRules(rules);
    });

    card.querySelector('.pac-rule-edit').addEventListener('click', () => {
      showPacRuleForm(idx, rules[idx]);
    });

    card.querySelector('.pac-rule-delete').addEventListener('click', async () => {
      if (isTauriAvailable()) {
        try {
          await tauriInvoke('remove_pac_rule', { index: idx });
          showSnackbar('规则已删除', 'success');
          loadPacRules();
        } catch (err) {
          showSnackbar('删除失败: ' + err, 'error');
        }
      }
    });
  });
}

async function savePacRules(rules) {
  if (!isTauriAvailable()) return;
  try {
    await tauriInvoke('update_pac_rules', { rules });
    const enabled = $('#pac-toggle').checked;
    if (enabled) {
      showSnackbar('PAC 规则已更新', 'success');
    }
  } catch (err) {
    showSnackbar('保存 PAC 规则失败: ' + err, 'error');
  }
}

function showPacRuleForm(index, rule) {
  _editingPacRuleIndex = index;
  $('#pac-rule-form').style.display = '';
  if (rule) {
    $('#pac-rule-domain').value = rule.domain_pattern;
    $('#pac-rule-proxy').value = rule.proxy;
  } else {
    $('#pac-rule-domain').value = '';
    $('#pac-rule-proxy').value = '';
    setTimeout(() => $('#pac-rule-domain').focus(), 100);
  }
}

function hidePacRuleForm() {
  $('#pac-rule-form').style.display = 'none';
  _editingPacRuleIndex = -1;
}

async function savePacRule() {
  const domain = $('#pac-rule-domain').value.trim();
  const proxy = $('#pac-rule-proxy').value.trim();

  if (!domain) {
    showSnackbar('请输入域名模式', 'error');
    return;
  }
  if (!proxy) {
    showSnackbar('请输入代理目标', 'error');
    return;
  }

  if (_editingPacRuleIndex >= 0) {
    const currentRules = await tauriInvoke('get_pac_rules');
    if (_editingPacRuleIndex < currentRules.length) {
      currentRules[_editingPacRuleIndex] = { domain_pattern: domain, proxy: proxy, enabled: true };
      await savePacRules(currentRules);
    }
  } else {
    if (isTauriAvailable()) {
      try {
        await tauriInvoke('add_pac_rule', { rule: { domainPattern: domain, proxy: proxy, enabled: true } });
      } catch (err) {
        showSnackbar('添加规则失败: ' + err, 'error');
        return;
      }
    }
  }

  hidePacRuleForm();
  showSnackbar('规则已保存', 'success');
  loadPacRules();
}

async function togglePac() {
  const enabled = $('#pac-toggle').checked;
  $('#pac-toggle-text').textContent = enabled ? '已启用' : '已禁用';

  if (isTauriAvailable()) {
    try {
      await tauriInvoke('set_pac_enabled', { enabled: enabled });
      showSnackbar(enabled ? 'PAC 已启用' : 'PAC 已禁用', 'success');
    } catch (err) {
      showSnackbar('操作失败: ' + err, 'error');
      $('#pac-toggle').checked = !enabled;
      $('#pac-toggle-text').textContent = !enabled ? '已启用' : '已禁用';
    }
  }
}

async function togglePacPreview() {
  const preview = $('#pac-preview');
  if (preview.style.display !== 'none') {
    preview.style.display = 'none';
    return;
  }

  if (isTauriAvailable()) {
    try {
      const content = await tauriInvoke('get_pac_content');
      $('#pac-preview-content').textContent = content;
      preview.style.display = '';
    } catch (_) {
      showSnackbar('获取 PAC 内容失败', 'error');
    }
  }
}

function resetTestState() {
  _testedOk = false;
  $('#btn-config').disabled = true;
  $('#test-result').className = 'test-result';
  $('#test-result').textContent = '';
}

function testProxyConfig() {
  const host = $('#config-host').value.trim();
  const port = $('#config-port').value.trim();
  const proto = getSelectValue('config-proto-select');
  const user = $('#config-user').value.trim() || null;
  const pass = $('#config-pass').value.trim() || null;

  if (!host) {
    setFieldError($('#config-host').closest('.input-wrap'), '请输入地址');
    return;
  }
  if (!port) {
    setFieldError($('#config-port').closest('.input-wrap'), '请输入端口');
    return;
  }
  clearFieldError($('#config-host').closest('.input-wrap'));
  clearFieldError($('#config-port').closest('.input-wrap'));

  const btn = $('#btn-test-config');
  const result = $('#test-result');

  btn.disabled = true;
  result.className = 'test-result loading';
  result.innerHTML = '<span class="icon icon-sm spin">sync</span> 测试中...';

  if (!isTauriAvailable()) {
    btn.disabled = false;
    result.className = 'test-result error';
    result.innerHTML = '<span class="icon icon-sm">error</span> 仅在桌面应用中可用';
    return;
  }

  tauriInvoke('test_proxy_connectivity', {
    host, port: parseInt(port), protocol: proto,
    username: user, password: pass,
  }).then((latencyMs) => {
    _testedOk = true;
    $('#btn-config').disabled = false;
    btn.disabled = false;
    result.className = 'test-result success';
    result.innerHTML = '<span class="icon icon-sm">check_circle</span> 连接成功 (' + latencyMs + 'ms)';
    showSnackbar('代理连通性 OK (' + latencyMs + 'ms)', 'success');
  }).catch((err) => {
    _testedOk = false;
    $('#btn-config').disabled = true;
    btn.disabled = false;
    result.className = 'test-result error';
    const msg = typeof err === 'string' ? err : '连接失败';
    result.innerHTML = '<span class="icon icon-sm">error</span> ' + msg;
    showSnackbar('代理测试失败', 'error');
  });
}

function applyProxyConfig() {
  const host = $('#config-host').value.trim();
  const port = $('#config-port').value.trim();
  const proto = getSelectValue('config-proto-select');
  const user = $('#config-user').value.trim() || null;
  const pass = $('#config-pass').value.trim() || null;

  if (!host) {
    setFieldError($('#config-host').closest('.input-wrap'), '请输入地址');
    return;
  }
  if (!port) {
    setFieldError($('#config-port').closest('.input-wrap'), '请输入端口');
    return;
  }
  clearFieldError($('#config-host').closest('.input-wrap'));
  clearFieldError($('#config-port').closest('.input-wrap'));

  if (!isTauriAvailable()) return;

  // AppOnly: just save config, no system changes
  if (_currentMode === 'AppOnly') {
    appendLog('info', '保存配置: ' + host + ':' + port + ' (' + proto + ')...');
    renderLogConsole();

    tauriInvoke('config_proxy', {
      host, port, protocol: proto,
      username: user, password: pass,
    }).then((result) => {
      AppState.proxyActive = true;
      appendLog('ok', result);
      renderLogConsole();
      showSnackbar('配置已保存（未修改系统代理）', 'success');
    }).catch(() => {
      showSnackbar('保存失败', 'error');
    });
    return;
  }

  // System mode: require test first
  if (!_testedOk && _currentMode === 'System') {
    showSnackbar('请先测试连通性', 'error');
    return;
  }

  appendLog('info', (_currentMode === 'Pac' ? '应用 PAC' : '应用系统代理') + ': ' + host + ':' + port + ' (' + proto + ')...');
  renderLogConsole();

  tauriInvoke('config_proxy', {
    host, port, protocol: proto,
    username: user, password: pass,
  }).then((result) => {
    AppState.proxyActive = true;
    $('#btn-config-disconnect').disabled = false;
    updateAdminLock(true);
    appendLog('ok', result);
    renderLogConsole();
    showSnackbar(_currentMode === 'Pac' ? 'PAC 配置已应用' : '代理已应用', 'success');
    saveConfigHistory(host, parseInt(port), proto, user);

    if (_currentMode === 'Pac') {
      loadPacRules();
    }
  }).catch(() => {
    updateAdminLock(false);
  });
}

function disconnectProxy() {
  if (!isTauriAvailable()) return;
  appendLog('info', '断开代理...');
  renderLogConsole();

  tauriInvoke('disconnect_proxy').then((result) => {
    AppState.proxyActive = false;
    $('#btn-config-disconnect').disabled = true;
    updateAdminLock(false);
    appendLog('ok', result || '代理已断开');
    renderLogConsole();
    showSnackbar('代理已断开', 'success');
    resetTestState();
  });
}

async function checkProxyStatus() {
  if (isTauriAvailable()) {
    try {
      const status = await tauriInvoke('get_proxy_status');
      if (status && status.is_active) {
        AppState.proxyActive = true;
        if (status.protocol === 'PAC') {
          $('#config-host').value = status.host;
          $('#config-port').value = '';
        } else {
          $('#config-host').value = status.host;
          $('#config-port').value = status.port;
        }
        const selectField = $('#config-proto-select');
        selectField.querySelectorAll('.select-option').forEach(o => {
          o.classList.toggle('selected', o.dataset.value === status.protocol);
        });
        selectField.querySelector('.select-value').textContent = status.protocol;
        $('#btn-config-disconnect').disabled = false;
        updateAdminLock(true);
        _testedOk = true;
        $('#btn-config').disabled = false;
        $('#test-result').className = 'test-result success';
        $('#test-result').innerHTML = '<span class="icon icon-sm">check_circle</span> 代理已激活';
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
        resetTestState();
    });
    list.appendChild(card);
  });
}




// ─── Local Proxy Port Detection ────────────────────────────────────────────

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

    const knownProxies = ports.filter(p => p.is_known_proxy);

    list.innerHTML = '';

    // ── Proxy Service Cards ──
    if (knownProxies.length > 0) {
      const grid = createElement('div', { className: 'local-proxy-grid' });
      knownProxies.forEach(p => grid.appendChild(createProxyCard(p)));
      list.appendChild(grid);
    }

  } catch (err) {
    list.innerHTML = `<div class="local-proxy-empty" style="color:var(--color-accent-red)">检测失败: ${err}</div>`;
  }
}

function createProxyCard(p) {
  const proto = PROXY_PORT_PROTOCOLS[p.port] || (p.protocol === 'TCP6' ? 'HTTP' : 'SOCKS5');
  const addrText = p.local_addr === '0.0.0.0' || p.local_addr === '::' ? '*' : p.local_addr;
  const card = createElement('div', { className: 'local-proxy-card' });
  card.innerHTML = `
    <div class="lpc-left">
      <span class="lpc-port">${p.port}</span>
      <span class="lpc-proto-badge">${proto}</span>
    </div>
    <div class="lpc-mid">
      <span class="lpc-proc">${p.process_name || 'Unknown'}</span>
      <span class="lpc-pid">PID ${p.process_pid || '?'}</span>
    </div>
    <div class="lpc-right">
      <span class="lpc-addr">${addrText}</span>
      <span class="lpc-state">${p.state}</span>
    </div>
  `;
  card.addEventListener('click', () => {
    $('#config-host').value = '127.0.0.1';
    $('#config-port').value = p.port;
    const selectField = $('#config-proto-select');
    selectField.querySelectorAll('.select-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.value === proto);
    });
    selectField.querySelector('.select-value').textContent = proto;
    showSnackbar(`已填入 127.0.0.1:${p.port} (${proto})`, 'success');
    resetTestState();
  });
  return card;
}

// ─── Proxy Pool Export ───────────────────────────────────────────────────

function updateExportPoolCount() {
  const count = (AppState.proxyPool || []).length;
  const badge = $('#export-pool-count');
  if (badge) badge.textContent = count;
}

async function exportPoolData(format) {
  const pool = AppState.proxyPool || [];
  if (pool.length === 0) {
    showSnackbar('Proxy pool is empty — add proxies first', 'error');
    return;
  }

  const fields = [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port' },
    { key: 'protocol', label: 'Protocol' },
    { key: 'latency', label: 'Latency (ms)' },
    { key: 'status', label: 'Status' },
  ];
  const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const prefix = `proxy-pool-${ts}`;

  try {
    switch (format) {
      case 'json':
        await exportAsJSON(pool, `${prefix}.json`);
        showSnackbar(`Exported ${pool.length} proxies as JSON`, 'success');
        break;
      case 'xml':
        await exportAsXML(pool, 'proxies', 'proxy', fields, `${prefix}.xml`);
        showSnackbar(`Exported ${pool.length} proxies as XML`, 'success');
        break;
      case 'xlsx':
        await exportAsXLSX(pool, fields, `${prefix}.xls`);
        showSnackbar(`Exported ${pool.length} proxies as XLSX`, 'success');
        break;
    }
  } catch (err) {
    showSnackbar('Export failed: ' + err, 'error');
  }
}

window.initConfigPage = initConfigPage;
window.exportPoolData = exportPoolData;
