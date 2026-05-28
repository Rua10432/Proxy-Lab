/* ═══════════════════════════════════════════════════════════════════════════════
   Page: Scan — Network Scanner
   ═══════════════════════════════════════════════════════════════════════════════ */

function initScanPage() {
  $('#btn-scan-start').addEventListener('click', startScan);
  $('#btn-scan-stop').addEventListener('click', stopScan);
  $('#btn-scan-clear').addEventListener('click', clearScan);
  $('#scan-filter').addEventListener('input', renderScanTable);

  $$('#scan-table .sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      const currentDir = th.classList.contains('sort-asc') ? 'asc' : (th.classList.contains('sort-desc') ? 'desc' : '');
      $$('#scan-table .sortable').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
      const newDir = currentDir === 'asc' ? 'desc' : 'asc';
      th.classList.add('sort-' + newDir);
      sortScanResults(col, newDir);
    });
  });

  if (isTauriAvailable()) {
    tauriListen('scan-progress', (e) => onScanProgress(e.payload));
    tauriListen('scan-port-open', (e) => onScanPortOpen(e.payload));
    tauriListen('scan-found', (e) => onScanFound(e.payload));
    tauriListen('scan-done', () => finishScan());
  }
}

function startScan() {
  const network = $('#scan-network').value.trim();
  if (!network) {
    setFieldError($('#scan-network').closest('.input-wrap'), 'Network address is required');
    return;
  }
  clearFieldError($('#scan-network').closest('.input-wrap'));
  if (!isTauriAvailable()) return;

  // Validate port range
  const startPort = parseInt($('#scan-start-port').value) || 0;
  const endPort = parseInt($('#scan-end-port').value) || 0;
  if (startPort < 1 || startPort > 65535) {
    setFieldError($('#scan-start-port').closest('.input-wrap'), '端口范围 1-65535');
    return;
  }
  clearFieldError($('#scan-start-port').closest('.input-wrap'));
  if (endPort < 1 || endPort > 65535) {
    setFieldError($('#scan-end-port').closest('.input-wrap'), '端口范围 1-65535');
    return;
  }
  clearFieldError($('#scan-end-port').closest('.input-wrap'));
  if (startPort > endPort) {
    setFieldError($('#scan-end-port').closest('.input-wrap'), '结束端口不能小于起始端口');
    return;
  }
  clearFieldError($('#scan-end-port').closest('.input-wrap'));

  AppState.scanStatus = 'scanning';
  AppState.scanResults = [];
  AppState.scanStats = { scanned: 0, total: 0, portsOpen: 0, found: 0, avgLatency: 0, speed: 0 };
  updateScanStatusChip();
  updateScanStats();

  $('#btn-scan-start').disabled = true;
  $('#btn-scan-stop').disabled = false;

  appendLog('info', `Starting scan on ${network}...`);
  renderLogConsole();

  const mask = $('#scan-mask').value.trim() || '255.255.255.0';
  const concurrent = parseInt($('#scan-concurrent').value) || 250;
  const synTimeout = parseInt($('#scan-syn-timeout').value) || 500;
  const verifyConcurrent = parseInt($('#scan-verify-concurrent').value) || 50;

  tauriInvoke('start_proxy_scan', {
    network, mask,
    startPort, endPort,
    concurrent, synTimeoutMs: synTimeout,
    verifyConcurrent,
  });
}

let _scanProgressThrottle = 0;
function onScanProgress(payload) {
  AppState.scanStats.scanned = payload.scanned;
  AppState.scanStats.total = payload.total;

  const now = Date.now();
  if (now - _scanProgressThrottle < 33) return; // throttle DOM to ~30fps
  _scanProgressThrottle = now;

  const total = payload.total || 1;
  const pct = ((payload.scanned / total) * 100).toFixed(1);
  $('#scan-progress-label').textContent = `Scanned: ${payload.scanned} / ${payload.total}`;
  $('#scan-ring-pct').textContent = pct + '%';
  $('#scan-progress-fill').style.width = pct + '%';
  $('#scan-found-label').textContent = `Open: ${payload.found}`;
  updateScanStats();
}

function onScanPortOpen(payload) {
  AppState.scanStats.portsOpen = payload.open_count;
  updateScanStats();
}

function onScanFound(payload) {
  AppState.scanResults.push({
    id: genId(),
    ip: payload.ip,
    port: payload.port,
    protocol: payload.protocol,
    latency: payload.latency_ms,
    open: true,
  });
  AppState.scanStats.found++;
  renderScanTable();
  updateScanStats();
  appendLog('ok', `Found: ${payload.ip}:${payload.port} (${payload.protocol}) — ${payload.latency_ms}ms`);
  renderLogConsole();

}

function finishScan() {
  AppState.scanStatus = 'done';
  updateScanStatusChip();
  $('#btn-scan-start').disabled = false;
  $('#btn-scan-stop').disabled = true;
  appendLog('ok', `Scan complete. Found ${AppState.scanStats.found} proxies.`);
  renderLogConsole();
}

function stopScan() {
  if (!isTauriAvailable()) return;
  tauriInvoke('stop_proxy_scan');
  AppState.scanStatus = 'idle';
  updateScanStatusChip();
  $('#btn-scan-start').disabled = false;
  $('#btn-scan-stop').disabled = true;
  appendLog('warn', 'Scan stopped by user');
  renderLogConsole();
}

function clearScan() {
  AppState.scanResults = [];
  AppState.scanStats = { scanned: 0, total: 0, portsOpen: 0, found: 0, avgLatency: 0, speed: 0 };
  updateScanStats();
  renderScanTable();
  $('#scan-progress-label').textContent = 'Scanned: 0 / 0';
  $('#scan-ring-pct').textContent = '0%';
  $('#scan-progress-fill').style.width = '0%';
  $('#scan-found-label').textContent = 'Open: 0';
  showSnackbar('Scan results cleared', 'success');
}

function updateScanStatusChip() {
  const chip = $('#scan-status-chip');
  const text = $('#scan-status-text');
  chip.className = 'status-chip';
  switch (AppState.scanStatus) {
    case 'idle':     chip.classList.add('status-ready'); text.textContent = 'idle'; break;
    case 'scanning': chip.classList.add('status-active'); text.textContent = 'scanning'; break;
    case 'done':     chip.classList.add('status-active'); text.textContent = 'done'; break;
    case 'error':    chip.classList.add('status-error'); text.textContent = 'error'; break;
  }
}

function updateScanStats() {
  $('#stat-scanned').textContent = AppState.scanStats.scanned;
  $('#stat-ports-open').textContent = AppState.scanStats.portsOpen;
  $('#stat-found').textContent = AppState.scanStats.found;
  $('#stat-avg-latency').textContent = AppState.scanStats.avgLatency > 0
    ? AppState.scanStats.avgLatency.toFixed(0) + ' ms' : '-- ms';
  $('#stat-scan-speed').textContent = AppState.scanStats.speed + '/s';
  $('#scan-count-badge').textContent = AppState.scanResults.length + ' results';
}

function renderScanTable() {
  const tbody = $('#scan-table-body');
  const emptyState = $('#scan-empty-state');
  const filter = ($('#scan-filter')?.value || '').toLowerCase();

  let results = AppState.scanResults.filter(r => {
    if (!filter) return true;
    return (r.ip + ':' + r.port + ' ' + r.protocol).toLowerCase().includes(filter);
  });

  if (results.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = results.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.ip}</td>
      <td>${r.port}</td>
      <td>${protocolBadge(r.protocol)}</td>
      <td style="color:${latencyColor(r.latency)}">${r.latency !== undefined ? r.latency + 'ms' : '--'}</td>
      <td><button class="btn btn-text" style="padding:4px 8px;font-size:12px;height:auto" onclick="applyProxy('${r.ip}',${r.port},'${r.protocol}')"><span class="icon icon-sm">arrow_forward</span></button></td>
    </tr>
  `).join('');
}

function sortScanResults(column, direction) {
  const dir = direction === 'asc' ? 1 : -1;
  AppState.scanResults.sort((a, b) => {
    let va = a[column], vb = b[column];
    if (typeof va === 'string') return va.localeCompare(vb) * dir;
    if (typeof va === 'number') return (va - vb) * dir;
    return 0;
  });
  renderScanTable();
}

function applyProxy(host, port, protocol) {
  $('#config-host').value = host;
  $('#config-port').value = port;
  const selectField = $('#config-proto-select');
  selectField.querySelectorAll('.select-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === protocol);
  });
  selectField.querySelector('.select-value').textContent = protocol;
  switchPage('config');
  showSnackbar('Proxy address filled. Click Apply to set.', 'info');
}

window.initScanPage = initScanPage;
window.applyProxy = applyProxy;

