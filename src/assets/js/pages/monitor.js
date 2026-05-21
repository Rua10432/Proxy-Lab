/* ═══════════════════════════════════════════════════════════════════════════════
   Page: Monitor — TCP Connection & Proxy Traffic Monitor
   ═══════════════════════════════════════════════════════════════════════════════ */

let _monitorAutoRefresh = null;
let _monitorInterval = 3000;
let _monitorTab = 'connections';
let _monitorFilter = 'all';
let _monitorSearch = '';
let _monitorData = null;
let _monitorRules = [];

function initMonitorPage() {
  /* ── Tab Switching ── */
  $$('.monitor-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.monitor-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _monitorTab = btn.dataset.tab;
      $$('.monitor-tab-content').forEach(tc => tc.classList.remove('active'));
      $('#mon-tab-' + _monitorTab).classList.add('active');
      if (_monitorTab === 'rules') renderRulesList();
    });
  });

  /* ── Filter Chips ── */
  $$('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _monitorFilter = btn.dataset.filter;
      if (_monitorData) renderConnectionsTable();
    });
  });

  /* ── Search Filter ── */
  const filterInput = $('#mon-filter');
  if (filterInput) {
    filterInput.addEventListener('input', () => {
      _monitorSearch = filterInput.value.toLowerCase();
      if (_monitorData) renderConnectionsTable();
    });
  }

  /* ── Refresh Button ── */
  $('#btn-refresh-monitor').addEventListener('click', () => {
    fetchMonitorData();
  });

  /* ── Auto-refresh Switch ── */
  const autoSwitch = $('#switch-monitor-auto');
  autoSwitch.addEventListener('toggle', (e) => {
    if (e.detail) {
      startMonitorAutoRefresh();
    } else {
      stopMonitorAutoRefresh();
    }
  });

  /* ── Add Rule Button ── */
  $('#btn-add-rule').addEventListener('click', () => {
    promptAddRule();
  });

  /* ── Initial Fetch ── */
  fetchMonitorData();
}

async function fetchMonitorData() {
  try {
    const data = await tauriInvoke('get_tcp_connections');
    _monitorData = data;
    _monitorRules = data.proxy_rules || [];
    updateSummaryCards(data.summary);
    updateProxyStatusBar(data);
    if (_monitorTab === 'connections') renderConnectionsTable();
    if (_monitorTab === 'rules') renderRulesList();
  } catch (err) {
    appendLog('error', 'Monitor: Failed to fetch connections - ' + err);
  }
}

function updateSummaryCards(summary) {
  if (!summary) return;
  $('#mon-total-conn').textContent = summary.total_connections;
  $('#mon-proxy-conn').textContent = summary.proxy_connections;
  $('#mon-direct-conn').textContent = summary.direct_connections;
  $('#mon-listen-conn').textContent = summary.listening_ports;
  $('#mon-processes').textContent = summary.unique_processes;
  $('#mon-proxy-procs').textContent = summary.unique_proxy_processes;
}

function updateProxyStatusBar(data) {
  const bar = $('#proxy-status-bar');
  const msgEl = $('#proxy-status-msg');
  bar.classList.remove('active', 'inactive');
  if (data.proxy_active) {
    bar.classList.add('active');
    msgEl.textContent = 'System proxy ACTIVE — ' + data.proxy_host + ':' + data.proxy_port;
  } else {
    bar.classList.add('inactive');
    msgEl.textContent = 'System proxy INACTIVE — No proxy configured';
  }
}

function renderConnectionsTable() {
  const tbody = $('#monitor-table-body');
  const emptyState = $('#monitor-empty-state');
  if (!tbody || !_monitorData) return;

  let conns = _monitorData.connections || [];

  // Apply chip filter
  if (_monitorFilter === 'proxy') {
    conns = conns.filter(c => c.is_proxy_traffic);
  } else if (_monitorFilter === 'direct') {
    conns = conns.filter(c => !c.is_proxy_traffic && c.state === 'ESTABLISHED');
  } else if (_monitorFilter === 'listen') {
    conns = conns.filter(c => c.state === 'LISTENING');
  }

  // Apply search filter
  if (_monitorSearch) {
    conns = conns.filter(c =>
      c.process_name.toLowerCase().includes(_monitorSearch) ||
      c.local_addr.toLowerCase().includes(_monitorSearch) ||
      c.remote_addr.toLowerCase().includes(_monitorSearch) ||
      c.pid.toString().includes(_monitorSearch)
    );
  }

  // Sort: proxy traffic first, then by process name
  conns.sort((a, b) => {
    if (a.is_proxy_traffic !== b.is_proxy_traffic) return a.is_proxy_traffic ? -1 : 1;
    const stateOrder = { 'ESTABLISHED': 0, 'LISTENING': 1, 'CLOSE_WAIT': 2, 'TIME_WAIT': 3 };
    const sa = stateOrder[a.state] || 99;
    const sb = stateOrder[b.state] || 99;
    if (sa !== sb) return sa - sb;
    return a.process_name.localeCompare(b.process_name);
  });

  if (conns.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  const ruledPaths = new Set(_monitorRules.map(r => r.app_path));
  const proxyPort = _monitorData.proxy_port;

  tbody.innerHTML = conns.map(c => {
    const trafficType = getTrafficType(c, proxyPort);
    const trafficLabel = trafficType === 'proxy' ? 'Proxy' : trafficType === 'listen' ? 'Listen' : 'Direct';
    const hasRule = c.process_path && ruledPaths.has(c.process_path);
    return `
      <tr>
        <td><span class="icon icon-sm process-icon">${getProcessIcon(c.process_name)}</span></td>
        <td title="${escapeAttr(c.process_path)}">
          <div class="process-cell">
            <span class="truncate" style="max-width:150px">${escapeHtml(c.process_name)}</span>
          </div>
        </td>
        <td><span class="text-caption" style="font-family:var(--font-mono);color:var(--color-ink-500)">${c.pid}</span></td>
        <td><span style="font-family:var(--font-mono);font-size:12px">${escapeHtml(c.local_addr)}:${c.local_port}</span></td>
        <td><span style="font-family:var(--font-mono);font-size:12px">${escapeHtml(c.remote_addr)}:${c.remote_port}</span></td>
        <td><span class="text-caption" style="color:var(--color-ink-500)">${c.state}</span></td>
        <td><span class="traffic-dot ${trafficType}">${trafficLabel}</span></td>
        <td>
          ${c.process_path ? `
          <button class="monitor-action-btn ${hasRule ? 'ruled' : ''}"
                  title="${hasRule ? 'Remove proxy rule' : 'Force proxy for this app'}"
                  data-path="${escapeAttr(c.process_path)}">
            <span class="icon icon-sm">${hasRule ? 'link_off' : 'add_link'}</span>
          </button>` : ''}
        </td>
      </tr>`;
  }).join('');

  // Attach click handlers for rule buttons
  tbody.querySelectorAll('.monitor-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.dataset.path;
      if (btn.classList.contains('ruled')) {
        removeProxyRule(path);
      } else {
        addProxyRule(path);
      }
    });
  });
}

function getTrafficType(conn, proxyPort) {
  if (conn.is_proxy_traffic) return 'proxy';
  if (conn.state === 'LISTENING') return 'listen';
  return 'direct';
}

function getProcessIcon(name) {
  const lower = name.toLowerCase();
  if (lower.includes('chrome') || lower.includes('msedge') || lower.includes('firefox')) return 'language';
  if (lower.includes('explorer') || lower.includes('msedge')) return 'folder_open';
  if (lower.includes('svchost') || lower.includes('services')) return 'dns';
  if (lower.includes('cmd') || lower.includes('powershell') || lower.includes('terminal')) return 'terminal';
  if (lower.includes('java') || lower.includes('python') || lower.includes('node')) return 'code';
  if (lower.includes('system')) return 'memory';
  if (lower.includes('lsass')) return 'security';
  return 'apps';
}

async function addProxyRule(appPath) {
  try {
    const rule = await tauriInvoke('set_app_proxy_rule', { appPath });
    _monitorRules = _monitorRules.filter(r => r.app_path !== appPath);
    _monitorRules.push(rule);
    renderConnectionsTable();
    if (_monitorTab === 'rules') renderRulesList();
    showSnackbar('Proxy rule added for: ' + rule.app_name, 'success');
  } catch (err) {
    showSnackbar('Failed to add rule: ' + err, 'error');
  }
}

async function removeProxyRule(appPath) {
  try {
    await tauriInvoke('remove_app_proxy_rule', { appPath });
    _monitorRules = _monitorRules.filter(r => r.app_path !== appPath);
    renderConnectionsTable();
    if (_monitorTab === 'rules') renderRulesList();
    showSnackbar('Proxy rule removed', 'success');
  } catch (err) {
    showSnackbar('Failed to remove rule: ' + err, 'error');
  }
}

async function toggleProxyRule(appPath, enabled) {
  try {
    await tauriInvoke('toggle_app_proxy_rule', { appPath, enabled });
    const rule = _monitorRules.find(r => r.app_path === appPath);
    if (rule) rule.enabled = enabled;
    renderRulesList();
  } catch (err) {
    showSnackbar('Failed to toggle rule: ' + err, 'error');
  }
}

function renderRulesList() {
  const container = $('#rules-list');
  const emptyState = $('#rules-empty-state');
  if (!container) return;

  if (_monitorRules.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.style.display = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = _monitorRules.map(rule => `
    <div class="rules-list-item">
      <div class="rules-item-icon">
        <span class="icon">terminal</span>
      </div>
      <div class="rules-item-info">
        <div class="rules-item-name">${escapeHtml(rule.app_name)}</div>
        <div class="rules-item-path">${escapeHtml(rule.app_path)}</div>
        <div class="rules-item-meta">Added: ${rule.added_at}</div>
      </div>
      <div class="rules-item-actions">
        <div class="switch ${rule.enabled ? 'on' : ''}" data-path="${escapeAttr(rule.app_path)}">
          <div class="thumb"></div>
        </div>
        <button class="btn-icon" data-remove="${escapeAttr(rule.app_path)}" title="Remove rule">
          <span class="icon icon-sm">delete</span>
        </button>
      </div>
    </div>
  `).join('');

  // Switch handlers
  container.querySelectorAll('.switch').forEach(sw => {
    sw.addEventListener('click', () => {
      const path = sw.dataset.path;
      const enabled = !sw.classList.contains('on');
      sw.classList.toggle('on');
      toggleProxyRule(path, enabled);
    });
  });

  // Remove handlers
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      removeProxyRule(btn.dataset.remove);
    });
  });
}

function promptAddRule() {
  showDialog({
    title: 'Add Application to Proxy',
    icon: 'add_link',
    body: createAddRuleForm(),
    actions: [
      { label: 'Cancel', class: 'btn-text', onClick: () => {} },
      {
        label: 'Add',
        class: 'btn-primary',
        onClick: () => {
          const path = $('#rule-path-input').value.trim();
          if (path) addProxyRule(path);
        },
      },
    ],
  });
}

function createAddRuleForm() {
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="input-field" style="margin-top:0">
      <label>Application Path</label>
      <div class="input-wrap">
        <span class="icon icon-sm leading-icon">terminal</span>
        <input type="text" id="rule-path-input" placeholder="C:\\Program Files\\App\\app.exe">
      </div>
      <span class="text-caption" style="color:var(--color-text-subtle);margin-top:4px;display:block">
        Enter the full path to the executable you want to force through the proxy.
      </span>
    </div>
  `;
  return div;
}

function startMonitorAutoRefresh() {
  if (_monitorAutoRefresh) return;
  _monitorAutoRefresh = setInterval(fetchMonitorData, _monitorInterval);
  appendLog('info', 'Monitor: Auto-refresh started');
}

function stopMonitorAutoRefresh() {
  if (_monitorAutoRefresh) {
    clearInterval(_monitorAutoRefresh);
    _monitorAutoRefresh = null;
    appendLog('info', 'Monitor: Auto-refresh stopped');
  }
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.initMonitorPage = initMonitorPage;

