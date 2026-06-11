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
    $('#' + id).addEventListener('input', () => {
      resetTestState();
      if (_currentMode === 'AppOnly') enableConfigBtnIfFilled();
    });
  });
  $('#config-proto-select').addEventListener('click', () => {
    setTimeout(() => {
      resetTestState();
      if (_currentMode === 'AppOnly') enableConfigBtnIfFilled();
    }, 50);
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

  // Local proxy control buttons
  $('#btn-copy-proxy-addr').addEventListener('click', copyLocalProxyAddr);
  $('#btn-stop-local-proxy').addEventListener('click', stopLocalProxy);
  $('#btn-restart-local-proxy').addEventListener('click', restartLocalProxy);

  // Shared proxy toggle
  $('#lps-shared-toggle').addEventListener('change', async (e) => {
    const shared = e.target.checked;
    if (isTauriAvailable()) {
      try {
        await tauriInvoke('set_app_only_shared', { shared });
        showSnackbar(shared ? '局域网共享已启用，重启代理后生效' : '局域网共享已禁用', 'info');
      } catch (err) {
        showSnackbar('保存失败: ' + err, 'error');
        e.target.checked = !shared;
      }
    }
  });

  // Load initial shared state
  if (isTauriAvailable()) {
    tauriInvoke('get_app_only_shared').then(shared => {
      $('#lps-shared-toggle').checked = shared;
    });
  }

  updateExportPoolCount();

  // Blocked IP management (AppOnly)
  initBlockedIpControls();
  loadBlockedIps();

  // Listen port config (AppOnly)
  initListenPortControls();
  loadListenPort();

  loadProxyMode();
}

// ─── Proxy Mode ──────────────────────────────────────────────────────────

// Per-mode form field state — each mode remembers its own host/port/proto/user/pass
const _modeFormState = {
  System: { host: '', port: '', proto: 'HTTP', user: '', pass: '' },
  AppOnly: { host: '', port: '', proto: 'HTTP', user: '', pass: '' },
  Pac: { host: '', port: '', proto: 'HTTP', user: '', pass: '' },
};

function saveCurrentModeForm() {
  const state = _modeFormState[_currentMode];
  if (!state) return;
  state.host = $('#config-host').value;
  state.port = $('#config-port').value;
  state.proto = getSelectValue('config-proto-select');
  state.user = $('#config-user').value;
  state.pass = $('#config-pass').value;
}

function loadModeForm(mode) {
  const state = _modeFormState[mode];
  if (!state) return;
  $('#config-host').value = state.host;
  $('#config-port').value = state.port;
  $('#config-user').value = state.user;
  $('#config-pass').value = state.pass;
  const selectField = $('#config-proto-select');
  selectField.querySelectorAll('.select-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === state.proto);
  });
  selectField.querySelector('.select-value').textContent = state.proto;
}

async function loadProxyMode() {
  if (!isTauriAvailable()) return;
  try {
    const mode = await tauriInvoke('get_proxy_mode');
    _currentMode = mode;
    applyModeUI(mode);
    highlightModeTab(mode);

    // Auto-fill AppOnly form from last saved config
    if (mode === 'AppOnly') {
      const lastCfg = await tauriInvoke('get_last_proxy_config');
      if (lastCfg) {
        _modeFormState.AppOnly.host = lastCfg.ip || '';
        _modeFormState.AppOnly.port = lastCfg.port ? String(lastCfg.port) : '';
        _modeFormState.AppOnly.proto = lastCfg.protocol || 'HTTP';
        _modeFormState.AppOnly.user = lastCfg.username || '';
        _modeFormState.AppOnly.pass = lastCfg.password || '';
      }
    }

    loadModeForm(mode);
  } catch (_) {}
}

async function switchProxyMode(mode) {
  if (mode === _currentMode) return;
  // Save current form values before switching away
  saveCurrentModeForm();
  _currentMode = mode;
  highlightModeTab(mode);
  // Restore target mode's form values
  loadModeForm(mode);
  applyModeUI(mode);

  if (isTauriAvailable()) {
    try {
      await tauriInvoke('set_proxy_mode', { mode });
      window.renderLogConsole?.();
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
  const localProxyCard = $('#local-proxy-status-card');

  resetTestState(); // 先重置按钮状态

  switch (mode) {
    case 'System':
      titleText.textContent = '系统代理设置';
      badge.textContent = '系统代理';
      btnText.textContent = '应用系统代理';
      pacEditor.style.display = 'none';
      testBtn.style.display = '';
      localProxyCard.style.display = 'none';
      break;
    case 'AppOnly':
      titleText.textContent = '应用内部代理配置';
      badge.textContent = '应用内部';
      btnText.textContent = '保存配置';
      pacEditor.style.display = 'none';
      testBtn.style.display = 'none';
      localProxyCard.style.display = '';
      $('#test-result').textContent = '';
      // AppOnly: 只要 host+port 有内容就启用保存按钮
      enableConfigBtnIfFilled();
      // 断开按钮状态由 updateLocalProxyUI 控制
      pollLocalProxyStatus();
      break;
    case 'Pac':
      titleText.textContent = 'PAC 代理配置';
      badge.textContent = 'PAC 模式';
      btnText.textContent = '保存到 PAC';
      pacEditor.style.display = '';
      testBtn.style.display = '';
      localProxyCard.style.display = 'none';
      break;
  }
}

function enableConfigBtnIfFilled() {
  const host = $('#config-host').value.trim();
  const port = $('#config-port').value.trim();
  $('#btn-config').disabled = !(host && port);
}

// ─── Local Proxy Status Polling ────────────────────────────────────────

let _lpsTimer = null;

async function pollLocalProxyStatus() {
  if (!isTauriAvailable()) return;
  if (_currentMode !== 'AppOnly') {
    if (_lpsTimer) { clearInterval(_lpsTimer); _lpsTimer = null; }
    if (_activeClientsTimer) { clearInterval(_activeClientsTimer); _activeClientsTimer = null; }
    const section = $('#lps-clients-section');
    if (section) section.style.display = 'none';
    return;
  }

  // Immediate fetch
  await updateLocalProxyUI();

  // Poll every 3 seconds
  if (_lpsTimer) clearInterval(_lpsTimer);
  _lpsTimer = setInterval(updateLocalProxyUI, 3000);
  startActiveClientsPolling();
}

async function updateLocalProxyUI() {
  if (!isTauriAvailable()) return;
  try {
    const status = await tauriInvoke('get_local_proxy_status');
    const badge = $('#lps-badge');
    const addr = $('#lps-address');
    const conn = $('#lps-connections');
    const upstream = $('#lps-upstream');
    const proto = $('#lps-protocol');

    if (status && status.running) {
      const bindDisplay = status.shared ? (status.lan_ip || "0.0.0.0") : "127.0.0.1";
      badge.textContent = '运行中 · ' + status.active_connections + ' 连接';
      badge.className = 'lps-badge running';
      addr.textContent = (status.lan_ip ? status.lan_ip + ':' : bindDisplay + ':') + status.listen_port;
      conn.textContent = status.active_connections + ' / ' + status.total_connections + ' (累计)';
      upstream.textContent = status.upstream_host + ':' + status.upstream_port;
      proto.textContent = status.upstream_protocol;
      // 更新提示文字 — 优先显示运行中服务器的实际状态
      const hint = $('#lps-hint');
      const toggleChecked = $('#lps-shared-toggle').checked;
      const configDiffers = status.shared !== toggleChecked;
      if (status.shared) {
        hint.innerHTML = '代理在 <code>0.0.0.0</code> 监听，局域网内其他设备可使用 <code>' +
          status.lan_ip || window.location.hostname + ':' + status.listen_port + '</code> 连接。' +
          (configDiffers ? '<br><span style="color:var(--color-accent-pink)">⚠ 共享已关闭，重启代理后生效</span>' : '');
      } else {
        hint.innerHTML = '代理仅在 <code>127.0.0.1</code> 监听，仅本机应用可连接。' +
          (configDiffers ? '<br><span style="color:var(--color-accent-pink)">⚠ 共享已开启，重启代理后生效</span>' : '');
      }
      // 本地代理运行中 → 断开/重启按钮可用
      if (_currentMode === 'AppOnly') {
        $('#btn-config-disconnect').disabled = false;
        $('#btn-restart-local-proxy').disabled = false;
        $('#btn-restart-local-proxy').innerHTML = '<span class="icon icon-sm">refresh</span> 重启代理';
      }
    } else {
      badge.textContent = '未运行';
      badge.className = 'lps-badge stopped';
      addr.textContent = '—';
      conn.textContent = '0';
      upstream.textContent = '—';
      proto.textContent = '—';
      // 恢复默认提示
      $('#lps-hint').innerHTML = '代理仅在 <code>127.0.0.1</code> 监听，仅本机应用可连接。';
      // 本地代理未运行 → 断开/重启按钮禁用
      if (_currentMode === 'AppOnly') {
        $('#btn-config-disconnect').disabled = true;
        $('#btn-restart-local-proxy').disabled = true;
        $('#btn-restart-local-proxy').innerHTML = '<span class="icon icon-sm">refresh</span> 重启代理';
      }
    }
  } catch (_) {}
}

// ─── Active Clients (real-time connection monitoring) ────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return val.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

let _activeClientsTimer = null;

async function pollActiveClients() {
  if (!isTauriAvailable() || _currentMode !== 'AppOnly') {
    if (_activeClientsTimer) { clearInterval(_activeClientsTimer); _activeClientsTimer = null; }
    const section = $('#lps-clients-section');
    if (section) section.style.display = 'none';
    return;
  }

  try {
    const clients = await tauriInvoke('get_active_clients');
    const section = $('#lps-clients-section');
    const tbody = $('#lps-clients-tbody');
    const count = $('#lps-clients-count');
    const empty = $('#lps-clients-empty');
    if (!section || !tbody) return;

    section.style.display = '';
    count.textContent = clients.length;

    if (!clients || clients.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = '';
    clients.forEach((c, idx) => {
      const tr = createElement('tr');
      tr.innerHTML = `
        <td class="col-id">${idx + 1}</td>
        <td class="col-ip">${escapeHtml(c.client_ip)}</td>
        <td class="col-up">${formatBytes(c.upload_bytes)}</td>
        <td class="col-down">${formatBytes(c.download_bytes)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (_) {}
}

function startActiveClientsPolling() {
  if (_activeClientsTimer) clearInterval(_activeClientsTimer);
  pollActiveClients(); // immediate
  _activeClientsTimer = setInterval(pollActiveClients, 3000);
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

  // AppOnly: start embedded local proxy server
  if (_currentMode === 'AppOnly') {
    appendLog('info', '启动本地代理: ' + host + ':' + port + ' (' + proto + ')...');
    window.renderLogConsole?.();

    tauriInvoke('config_proxy', {
      host, port, protocol: proto,
      username: user, password: pass,
    }).then((result) => {
      AppState.proxyActive = true;
      appendLog('ok', result);
      window.renderLogConsole?.();
      showSnackbar('本地代理已启动', 'success');
      updateLocalProxyUI();
    }).catch((err) => {
      showSnackbar('启动失败: ' + (typeof err === 'string' ? err : '未知错误'), 'error');
    });
    return;
  }

  // System mode: require test first
  if (!_testedOk && _currentMode === 'System') {
    showSnackbar('请先测试连通性', 'error');
    return;
  }

  appendLog('info', (_currentMode === 'Pac' ? '应用 PAC' : '应用系统代理') + ': ' + host + ':' + port + ' (' + proto + ')...');
  window.renderLogConsole?.();

  tauriInvoke('config_proxy', {
    host, port, protocol: proto,
    username: user, password: pass,
  }).then((result) => {
    AppState.proxyActive = true;
    $('#btn-config-disconnect').disabled = false;
    updateAdminLock(true);
    appendLog('ok', result);
    window.renderLogConsole?.();
    showSnackbar(_currentMode === 'Pac' ? 'PAC 配置已应用' : '代理已应用', 'success');
    saveConfigHistory(host, parseInt(port), proto, user);
    // Local proxy (if any) is now stopped by the backend
    updateLocalProxyUI();

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
  window.renderLogConsole?.();

  tauriInvoke('disconnect_proxy').then((result) => {
    AppState.proxyActive = false;
    $('#btn-config-disconnect').disabled = true;
    updateAdminLock(false);
    appendLog('ok', result || '代理已断开');
    window.renderLogConsole?.();
    showSnackbar('代理已断开', 'success');
    resetTestState();
    updateLocalProxyUI();
  });
}

async function checkProxyStatus() {
  if (isTauriAvailable()) {
    try {
      const status = await tauriInvoke('get_proxy_status');
      if (status && status.is_active) {
        AppState.proxyActive = true;
        // Only auto-fill form in System mode — AppOnly/Pac have their own data
        if (_currentMode === 'System') {
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
        }
        // 断开按钮：System/PAC 由系统代理状态控制，AppOnly 由本地代理状态控制
        if (_currentMode !== 'AppOnly') {
          $('#btn-config-disconnect').disabled = false;
        }
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
      // Sync into current mode's form state so switch doesn't lose it
      saveCurrentModeForm();
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
    saveCurrentModeForm();
    showSnackbar(`已填入 127.0.0.1:${p.port} (${proto})`, 'success');
    resetTestState();
  });
  return card;
}

async function copyLocalProxyAddr() {
  const addr = $('#lps-address').textContent;
  if (!addr || addr === '—') {
    showSnackbar('本地代理未运行', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(addr);
    showSnackbar('已复制: ' + addr, 'success');
  } catch (_) {
    showSnackbar('复制失败', 'error');
  }
}

async function stopLocalProxy() {
  if (!isTauriAvailable()) return;
  try {
    await tauriInvoke('stop_local_proxy');
    showSnackbar('本地代理已停止', 'success');
    updateLocalProxyUI();
  } catch (err) {
    showSnackbar('停止失败: ' + err, 'error');
  }
}

async function restartLocalProxy() {
  if (!isTauriAvailable()) return;
  const btn = $('#btn-restart-local-proxy');
  btn.disabled = true;
  btn.innerHTML = '<span class="icon icon-sm spin">sync</span> 重启中...';
  try {
    const result = await tauriInvoke('restart_local_proxy');
    showSnackbar('本地代理已重启', 'success');
    appendLog('ok', result);
    window.renderLogConsole?.();
    updateLocalProxyUI();
  } catch (err) {
    showSnackbar('重启失败: ' + err, 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="icon icon-sm">refresh</span> 重启代理';
  }
}

// ─── Listen Port Config (AppOnly) ─────────────────────────────────────────────

let _savedPort = 0;

async function loadListenPort() {
  if (!isTauriAvailable()) return;
  try {
    const port = await tauriInvoke('get_local_proxy_listen_port');
    _savedPort = port;
    const input = $('#input-listen-port');
    if (port > 0) {
      input.value = port;
    } else {
      input.value = '';
    }
    $('#btn-apply-port').disabled = true;
  } catch (_) {}
}

function initListenPortControls() {
  const input = $('#input-listen-port');
  const applyBtn = $('#btn-apply-port');
  const randomBtn = $('#btn-random-port');

  // Enable apply button when value changes
  input.addEventListener('input', () => {
    const val = input.value.trim();
    if (val === '') {
      // Empty = random, enable if _savedPort != 0
      applyBtn.disabled = _savedPort === 0;
    } else {
      const num = parseInt(val, 10);
      applyBtn.disabled = !(num >= 1024 && num <= 65535) || num === _savedPort;
    }
  });

  // Apply button
  applyBtn.addEventListener('click', async () => {
    const val = input.value.trim();
    const port = val === '' ? 0 : Math.min(65535, Math.max(0, parseInt(val, 10) || 0));
    if (port > 0 && port < 1024) {
      showSnackbar('端口 1024 以下需要管理员权限', 'error');
      return;
    }
    try {
      await tauriInvoke('set_local_proxy_listen_port', { port });
      _savedPort = port;
      applyBtn.disabled = true;
      showSnackbar(port > 0 ? '监听端口已设为 ' + port : '监听端口已设为随机', 'success');
    } catch (err) {
      showSnackbar('保存失败: ' + err, 'error');
    }
  });

  // Random button
  randomBtn.addEventListener('click', () => {
    const port = Math.floor(Math.random() * 54511) + 10241; // 10241-64751
    input.value = port;
    applyBtn.disabled = port === _savedPort;
    input.focus();
  });
}

// ─── Blocked IP Management ───────────────────────────────────────────────────

async function loadBlockedIps() {
  if (!isTauriAvailable()) return;
  try {
    const ips = await tauriInvoke('get_blocked_ips');
    renderBlockedIps(ips);
  } catch (_) {}
}

function renderBlockedIps(ips) {
  const list = $('#lps-blocked-list');
  const count = $('#lps-blocked-count');
  if (!list) return;

  count.textContent = ips.length;

  if (!ips || ips.length === 0) {
    list.innerHTML = '<div class="lps-blocked-empty">暂无封锁 IP</div>';
    return;
  }

  list.innerHTML = '<div class="lps-blocked-table-header">' +
    '<span class="col-id">#</span>' +
    '<span class="col-ip">IP 地址</span>' +
    '<span class="col-action">操作</span>' +
    '</div>';

  ips.forEach((ip, idx) => {
    const item = createElement('div', { className: 'lps-blocked-item' });
    item.innerHTML = `
      <span class="col-id">${idx + 1}</span>
      <span class="col-ip"><span class="ip-value">${escapeHtml(ip)}</span></span>
      <span class="col-action">
        <button class="btn-remove-ip" title="移除封锁" data-ip="${escapeHtml(ip)}">
          <span class="icon icon-sm">close</span>
        </button>
      </span>
    `;
    item.querySelector('.btn-remove-ip').addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetIp = e.currentTarget.dataset.ip;
      try {
        await tauriInvoke('remove_blocked_ip', { ip: targetIp });
        showSnackbar('已移除封锁: ' + targetIp, 'success');
        loadBlockedIps();
      } catch (err) {
        showSnackbar('移除失败: ' + err, 'error');
      }
    });
    list.appendChild(item);
  });
}

function initBlockedIpControls() {
  const input = $('#input-blocked-ip');
  const addBtn = $('#btn-add-blocked-ip');
  const errorEl = createElement('div', { className: 'lps-blocked-error', id: 'lps-blocked-error' });

  function showError(msg) {
    errorEl.textContent = msg;
    if (!errorEl.parentNode) {
      input.closest('.lps-blocked-input-row').after(errorEl);
    }
  }

  function clearError() {
    errorEl.textContent = '';
  }

  async function addBlockedIp() {
    const ip = input.value.trim();
    if (!ip) {
      showError('请输入要封锁的 IP 地址');
      return;
    }
    clearError();
    try {
      await tauriInvoke('add_blocked_ip', { ip });
      showSnackbar('已添加封锁: ' + ip, 'success');
      input.value = '';
      loadBlockedIps();
    } catch (err) {
      showError(typeof err === 'string' ? err : '添加失败');
    }
  }

  addBtn.addEventListener('click', addBlockedIp);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBlockedIp();
    }
    clearError();
  });
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
