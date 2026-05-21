/* ═══════════════════════════════════════════════════════════════════════════════
   Page: Test — Manual Probe + Proxy Pool
   ═══════════════════════════════════════════════════════════════════════════════ */

function initTestPage() {
  /* ── Tab Switching ── */
  const tabBtns = $$('#page-test .tab-btn');
  const tabManual = $('#tab-manual');
  const tabPool = $('#tab-pool');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      AppState.testTab = tab;
      if (tab === 'manual') {
        tabManual.classList.remove('hidden');
        tabPool.classList.add('hidden');
      } else {
        tabManual.classList.add('hidden');
        tabPool.classList.remove('hidden');
      }
    });
  });

  /* ── Manual Probe Actions ── */
  $('#btn-test').addEventListener('click', startTest);
  $('#btn-stop').addEventListener('click', stopTest);
  $('#btn-clear-fields').addEventListener('click', clearTestFields);

  /* ── Pool Actions ── */
  $('#btn-pool-test-all').addEventListener('click', startBatchPoolTest);
  $('#btn-pool-stop').addEventListener('click', stopBatchPoolTest);
  $('#btn-pool-fetch').addEventListener('click', fetchPoolSubscription);
  $('#btn-pool-clear').addEventListener('click', clearPool);
  $('#btn-pool-refresh').addEventListener('click', () => { renderPoolTable(); showSnackbar('Pool refreshed', 'info'); });

  /* ── Test History ── */
  $('#btn-clear-test-history').addEventListener('click', () => {
    AppState.testHistory = [];
    renderTestHistory();
    if (isTauriAvailable()) tauriInvoke('clear_test_configs');
    showSnackbar('Test history cleared', 'success');
  });

  /* ── Pool Filter ── */
  $('#pool-filter').addEventListener('input', () => renderPoolTable());

  /* ── Load history from storage ── */
  AppState.testHistory = loadFromStorage('testHistory', []);
  AppState.proxyPool = loadFromStorage('proxyPool', []);
  renderTestHistory();
  renderPoolTable();

  /* ── Listen for Tauri ping events ── */
  if (isTauriAvailable()) {
    tauriListen('ping-result', (e) => onPingResult(e.payload));
    tauriListen('ping-done', () => finishTest());
    tauriListen('ping-stopped', () => onPingStopped());
  }
}

let _testMeta = { host: '', port: 0, count: 0, ok: 0, fail: 0, sum: 0, min: Infinity, max: -Infinity };
let _batchPoolTestActive = false;

/* ── Start Test ── */
function startTest() {
  const host = $('#test-host').value.trim();
  const port = $('#test-port').value.trim();

  if (!host) {
    setFieldError($('#test-host').closest('.input-wrap'), 'Address is required');
    return;
  }
  clearFieldError($('#test-host').closest('.input-wrap'));

  AppState.testStatus = 'testing';
  AppState.testResults = [];
  updateTestStatusChip();

  $('#btn-test').disabled = true;
  $('#btn-stop').disabled = false;
  $('#test-stats-bar').style.display = 'none';

  _testMeta = { host, port: parseInt(port) || 7890, count: 0, ok: 0, fail: 0, sum: 0, min: Infinity, max: -Infinity };
  const count = parseInt($('#test-count').value) || 10;
  const timeout = parseInt($('#test-timeout').value) || 3000;
  const interval = parseInt($('#test-interval').value) || 500;
  const proto = getSelectValue('test-proto-select');
  const user = $('#test-user').value.trim() || null;
  const pass = $('#test-pass').value.trim() || null;

  appendLog('info', `Starting test to ${host}:${port}...`);
  renderLogConsole();

  if (!isTauriAvailable()) return;
  tauriInvoke('start_ping_test', {
    host, port: parseInt(port), protocol: proto,
    count, timeout_ms: timeout, interval_ms: interval,
    username: user, password: pass,
    request_id: 'manual-' + Date.now(),
  });
}

function onPingResult(payload) {
  _testMeta.count++;
  if (payload.ms != null) {
    _testMeta.ok++;
    _testMeta.sum += payload.ms;
    _testMeta.min = Math.min(_testMeta.min, payload.ms);
    _testMeta.max = Math.max(_testMeta.max, payload.ms);
    AppState.testResults.push(payload.ms);
    appendLog('ok', `[${payload.seq}] ${_testMeta.host}:${_testMeta.port} — ${(payload.ms/1000).toFixed(1)}ms`);
  } else {
    _testMeta.fail++;
    AppState.testResults.push(-1);
    appendLog('error', `[${payload.seq}] ${_testMeta.host}:${_testMeta.port} — ${payload.error || 'timeout'}`);
  }
  renderLogConsole();
  updateTestStats();
}

function updateTestStats() {
  const { ok, fail, sum, min, max } = _testMeta;
  if (ok > 0) {
    const avg = (sum / ok).toFixed(1);
    $('#stat-min').textContent = (min / 1000).toFixed(1) + 'ms';
    $('#stat-min').className = 'stat-val ' + latencyClass(min / 1000);
    $('#stat-max').textContent = (max / 1000).toFixed(1) + 'ms';
    $('#stat-max').className = 'stat-val ' + latencyClass(max / 1000);
    $('#stat-avg').textContent = avg + 'ms';
    $('#stat-avg').className = 'stat-val ' + latencyClass(parseFloat(avg));
    $('#stat-loss').textContent = ((fail / (ok + fail)) * 100).toFixed(1) + '%';
    $('#test-stats-bar').style.display = 'flex';
  }
}

function finishTest() {
  AppState.testStatus = 'done';
  updateTestStatusChip();
  $('#btn-test').disabled = false;
  $('#btn-stop').disabled = true;

  const { host, port, ok, fail, sum } = _testMeta;
  const total = ok + fail;
  appendLog(ok > 0 ? 'ok' : 'error', `Test completed: ${ok}/${total} successful${ok > 0 ? ', avg ' + (sum/ok/1000).toFixed(1) + 'ms' : ''}`);
  renderLogConsole();

  const proto = getSelectValue('test-proto-select');
  const entry = {
    id: genId(),
    host, port, protocol: proto,
    avgLatency: ok > 0 ? (sum / ok / 1000).toFixed(0) : null,
    timestamp: new Date().toISOString(),
  };
  AppState.testHistory.unshift(entry);
  if (AppState.testHistory.length > 20) AppState.testHistory = AppState.testHistory.slice(0, 20);
  saveToStorage('testHistory', AppState.testHistory);
  if (isTauriAvailable()) {
    tauriInvoke('add_test_history', {
      entry: {
        ip: host, port: parseInt(port), protocol: proto,
        latency_ms: ok > 0 ? Math.floor(sum / ok / 1000) : 0,
        added_at: entry.timestamp,
        last_tested: entry.timestamp,
        username: null, password: null,
      },
    });
  }
  renderTestHistory();
}

function onPingStopped() {
  AppState.testStatus = 'ready';
  updateTestStatusChip();
  $('#btn-test').disabled = false;
  $('#btn-stop').disabled = true;
  appendLog('warn', 'Test stopped by user');
  renderLogConsole();
}

function stopTest() {
  if (!isTauriAvailable()) return;
  tauriInvoke('stop_ping_test');
  AppState.testStatus = 'ready';
  updateTestStatusChip();
  $('#btn-test').disabled = false;
  $('#btn-stop').disabled = true;
  appendLog('warn', 'Test stopped by user');
  renderLogConsole();
}

function clearTestFields() {
  ['test-host', 'test-port', 'test-user', 'test-pass'].forEach(id => {
    const el = $('#' + id);
    if (el) el.value = '';
  });
  $('#test-count').value = '10';
  $('#test-timeout').value = '3000';
  $('#test-interval').value = '500';
}

function updateTestStatusChip() {
  const chip = $('#status-chip');
  const text = $('#status-text');
  chip.className = 'status-chip';
  switch (AppState.testStatus) {
    case 'ready':   chip.classList.add('status-ready'); text.textContent = 'ready'; break;
    case 'testing': chip.classList.add('status-active'); text.textContent = 'testing'; break;
    case 'done':    chip.classList.add('status-active'); text.textContent = 'done'; break;
    case 'error':   chip.classList.add('status-error'); text.textContent = 'error'; break;
  }
}

/* ── Render Test History ── */
function renderTestHistory() {
  const section = $('#recent-tests-section');
  const list = $('#recent-tests-list');
  if (AppState.testHistory.length === 0) {
    section.classList.remove('visible');
    return;
  }
  section.classList.add('visible');
  list.innerHTML = '';
  AppState.testHistory.forEach(item => {
    const card = createElement('div', { className: 'history-card' });
    const date = new Date(item.timestamp);
    card.innerHTML = `
      <div class="card-title">${item.host}:${item.port} <span class="proto-badge ${item.protocol === 'HTTP' ? 'proto-http' : 'proto-socks5'}">${item.protocol}</span></div>
      <div class="card-meta">${item.avgLatency ? 'Avg: ' + item.avgLatency + 'ms' : 'Failed'} · ${formatTime(date)}</div>
    `;
    card.addEventListener('click', () => {
      $('#test-host').value = item.host;
      $('#test-port').value = item.port;
      const selectField = $('#test-proto-select');
      selectField.querySelectorAll('.select-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.value === item.protocol);
      });
      selectField.querySelector('.select-value').textContent = item.protocol;
    });
    list.appendChild(card);
  });
}

/* ── Render Pool Table ── */
function renderPoolTable() {
  const tbody = $('#pool-table-body');
  const emptyState = $('#pool-empty-state');
  const filter = ($('#pool-filter')?.value || '').toLowerCase();
  const pool = AppState.proxyPool.filter(p => {
    if (!filter) return true;
    return (p.host + ':' + p.port + ' ' + p.protocol).toLowerCase().includes(filter);
  });

  if (pool.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = pool.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.host}</td>
      <td>${p.port}</td>
      <td>${protocolBadge(p.protocol)}</td>
      <td style="color:${latencyColor(p.latency)}">${p.latency !== undefined ? p.latency + 'ms' : '--'}</td>
      <td>${statusBadge(p.status)}</td>
      <td><button class="btn btn-text" style="padding:4px 8px;font-size:12px;height:auto" onclick="testSingleProxy('${p.id}')"><span class="icon icon-sm">play_arrow</span></button></td>
    </tr>
  `).join('');
  $('#pool-count-label').textContent = pool.length + ' Proxies';
}

function testSingleProxy(id) {
  const proxy = AppState.proxyPool.find(p => p.id === id);
  if (!proxy) return;
  if (!isTauriAvailable()) return;
  $('#test-host').value = proxy.host;
  $('#test-port').value = proxy.port;
  const selectField = $('#test-proto-select');
  selectField.querySelectorAll('.select-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === proxy.protocol);
  });
  selectField.querySelector('.select-value').textContent = proxy.protocol;
  startTest();
}

/* ── Pool Actions ── */
async function fetchPoolSubscription() {
  const url = $('#pool-sub-url').value.trim();
  if (!url) { showSnackbar('Please enter a subscription URL', 'error'); return; }
  if (!isTauriAvailable()) return;
  showSnackbar('Fetching subscription...', 'info');
  try {
    const entries = await tauriInvoke('fetch_proxies_from_url', { url });
    if (entries && entries.length > 0) {
      entries.forEach(e => {
        AppState.proxyPool.push({
          id: genId(),
          host: e.ip,
          port: e.port,
          protocol: e.protocol || 'HTTP',
          latency: e.latency_ms || undefined,
          status: 'untested',
        });
      });
      saveToStorage('proxyPool', AppState.proxyPool);
      renderPoolTable();
      showSnackbar(`Imported ${entries.length} proxies`, 'success');
    } else {
      showSnackbar('No proxies found in subscription', 'error');
    }
  } catch (_) {
    showSnackbar('Failed to fetch subscription', 'error');
  }
}

function startBatchPoolTest() {
  const pool = AppState.proxyPool;
  if (pool.length === 0) { showSnackbar('Pool is empty', 'error'); return; }
  if (!isTauriAvailable()) return;
  _batchPoolTestActive = true;
  $('#btn-pool-test-all').disabled = true;
  $('#btn-pool-stop').disabled = false;
  showSnackbar(`Testing ${pool.length} proxies...`, 'info');

  let idx = 0;
  function testNext() {
    if (!_batchPoolTestActive || idx >= pool.length) {
      finishBatchPoolTest();
      return;
    }
    const p = pool[idx];
    tauriInvoke('start_ping_test', {
      host: p.host, port: p.port, protocol: p.protocol,
      count: 1, timeout_ms: 3000, interval_ms: 0,
      username: null, password: null,
      request_id: 'batch-' + Date.now() + '-' + idx,
    });
    const unlisten = tauriListen('ping-result', function handler() {
      unlisten();
      setTimeout(() => { idx++; testNext(); }, 100);
    });
  }
  testNext();
}

function stopBatchPoolTest() {
  if (!isTauriAvailable()) return;
  _batchPoolTestActive = false;
  tauriInvoke('stop_ping_test');
  $('#btn-pool-test-all').disabled = false;
  $('#btn-pool-stop').disabled = true;
  showSnackbar('Batch test stopped', 'warn');
}

function finishBatchPoolTest() {
  _batchPoolTestActive = false;
  $('#btn-pool-test-all').disabled = false;
  $('#btn-pool-stop').disabled = true;
  saveToStorage('proxyPool', AppState.proxyPool);
  showSnackbar('Batch test complete', 'success');
}

function clearPool() {
  AppState.proxyPool = [];
  saveToStorage('proxyPool', AppState.proxyPool);
  if (isTauriAvailable()) tauriInvoke('clear_proxies');
  renderPoolTable();
  showSnackbar('Pool cleared', 'success');
}

window.initTestPage = initTestPage;
window.testSingleProxy = testSingleProxy;

