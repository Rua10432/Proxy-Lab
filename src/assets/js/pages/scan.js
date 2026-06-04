/* ═══════════════════════════════════════════════════════════════════════════════
   Page: Scan — Network Scanner
   ═══════════════════════════════════════════════════════════════════════════════ */

function initScanPage() {
  // Load saved scan preferences into form fields
  const prefs = loadFromStorage('scanPreferences', {});
  if (prefs.defaultMask) $('#scan-mask').value = prefs.defaultMask;
  if (prefs.defaultStartPort) $('#scan-start-port').value = prefs.defaultStartPort;
  if (prefs.defaultEndPort) $('#scan-end-port').value = prefs.defaultEndPort;
  if (prefs.defaultConcurrent) $('#scan-concurrent').value = prefs.defaultConcurrent;
  if (prefs.synTimeoutMs) $('#scan-syn-timeout').value = prefs.synTimeoutMs;
  if (prefs.verifyConcurrent) $('#scan-verify-concurrent').value = prefs.verifyConcurrent;

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

function setScanFormDisabled(disabled) {
  // Input fields
  ['scan-network', 'scan-mask', 'scan-start-port', 'scan-end-port',
   'scan-concurrent', 'scan-syn-timeout', 'scan-verify-concurrent'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.disabled = disabled;
  });
  // Action buttons
  $('#btn-scan-clear').disabled = disabled;
  ['btn-scan-export-json', 'btn-scan-export-xml', 'btn-scan-export-xlsx', 'btn-scan-export-label'].forEach(id => {
    const btn = $(`#${id}`);
    if (btn) btn.disabled = disabled;
  });
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
  _scanStartTime = Date.now();
  _scanLastSpeedSample = 0;
  $('#scan-eta').style.display = 'none';
  updateScanStatusChip();
  updateScanStats();

  $('#btn-scan-start').disabled = true;
  $('#btn-scan-stop').disabled = false;
  setScanFormDisabled(true);

  appendLog('info', `Starting scan on ${network}...`);
  renderLogConsole();

  const mask = $('#scan-mask').value.trim() || '255.255.255.0';
  const concurrent = parseInt($('#scan-concurrent').value) || 250;
  const synTimeout = parseInt($('#scan-syn-timeout').value) || 500;
  const verifyConcurrent = parseInt($('#scan-verify-concurrent').value) || 50;

  // Persist current scan preferences to config.json
  const scanPrefs = {
    defaultMask: mask,
    defaultStartPort: startPort,
    defaultEndPort: endPort,
    defaultConcurrent: concurrent,
    synTimeoutMs: synTimeout,
    verifyConcurrent: verifyConcurrent,
  };
  saveToStorage('scanPreferences', scanPrefs);
  tauriInvoke('update_scan_preferences', {
    prefs: {
      default_mask: mask,
      default_start_port: startPort,
      default_end_port: endPort,
      default_concurrent: concurrent,
      timeout_ms: 1500,
      syn_timeout_ms: synTimeout,
      verify_concurrent: verifyConcurrent,
      detection_headers: [],
      strict_detection: false,
    },
  }).catch(() => {});

  tauriInvoke('start_proxy_scan', {
    network, mask,
    startPort, endPort,
    concurrent, synTimeoutMs: synTimeout,
    verifyConcurrent,
  });
}

let _scanProgressThrottle = 0;
let _scanStartTime = 0;
let _scanLastSpeedSample = 0;
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

  // ETA calculation
  if (payload.scanned > _scanLastSpeedSample) {
    _scanLastSpeedSample = payload.scanned;
    const elapsed = (Date.now() - _scanStartTime) / 1000;
    if (elapsed > 2 && payload.scanned > 10) {
      const speed = payload.scanned / elapsed;
      const remaining = (total - payload.scanned) / speed;
      const eta = $('#scan-eta');
      if (remaining > 0 && remaining < 3600) {
        const m = Math.floor(remaining / 60);
        const s = Math.floor(remaining % 60);
        eta.textContent = `ETA ${m}:${s.toString().padStart(2, '0')}`;
        eta.style.display = '';
      } else {
        eta.style.display = 'none';
      }
    }
  }
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
  setScanFormDisabled(false);
  $('#scan-eta').style.display = 'none';
  // Force progress to 100% (last throttled update may have skipped it)
  const total = AppState.scanStats.total || 1;
  $('#scan-progress-label').textContent = `Scanned: ${total} / ${total}`;
  $('#scan-ring-pct').textContent = '100.0%';
  $('#scan-progress-fill').style.width = '100%';
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
  setScanFormDisabled(false);
  $('#scan-eta').style.display = 'none';
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
  $('#scan-eta').style.display = 'none';
  updateScanExportButtons();
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
    const wrapper = $('#scan-table-container .table-wrapper');
    if (wrapper) wrapper.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  const wrapper = $('#scan-table-container .table-wrapper');
  if (wrapper) wrapper.style.display = '';

  tbody.innerHTML = results.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.ip}</td>
      <td>${r.port}</td>
      <td>${protocolBadge(r.protocol)}</td>
      <td style="color:${latencyColor(r.latency)}">${r.latency !== undefined ? r.latency + 'ms' : '--'}</td>
      <td><div style="display:flex;gap:4px;align-items:center">
${r.protocol.includes('(Auth)')
  ? `<button class="btn btn-text" style="padding:4px 6px;font-size:12px;height:auto;min-width:0;color:var(--color-ink-600)" onclick="applyProxyWithAuth('${r.ip}',${r.port},'${r.protocol}')" title="使用凭据"><span class="icon icon-sm">key</span></button>`
  : `<button class="btn btn-text" style="padding:4px 6px;font-size:12px;height:auto;min-width:0" onclick="applyProxy('${r.ip}',${r.port},'${r.protocol}')" title="直接应用"><span class="icon icon-sm">arrow_forward</span></button>`
}
</div></td>
    </tr>
  `).join('');
  updateScanExportButtons();
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
  if (!isTauriAvailable()) return;

  appendLog('info', `Applying proxy: ${host}:${port} (${protocol})`);
  renderLogConsole();

  tauriInvoke('config_proxy', {
    host, port: String(port), protocol,
    username: null,
    password: null,
  }).then((result) => {
    AppState.proxyActive = true;
    appendLog('ok', result || `Proxy configured: ${host}:${port} (${protocol})`);
    renderLogConsole();
    showSnackbar('Proxy applied successfully', 'success');
  }).catch(() => {
    showSnackbar('Failed to apply proxy', 'error');
  });
}

function applyProxyWithAuth(host, port, protocol) {
  const bodyEl = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
    createElement('p', {
      style: { fontSize: 'var(--text-small)', color: 'var(--color-text-subtle)' },
      textContent: `${host}:${port} (${protocol})`,
    }),
    createElement('div', { className: 'field-row', style: { margin: 0 } }, [
      createElement('div', { className: 'input-field', style: { flex: 1 } }, [
        createElement('label', { textContent: 'Username' }),
        createElement('div', { className: 'input-wrap' }, [
          createElement('span', { className: 'icon icon-sm leading-icon', textContent: 'person' }),
          createElement('input', { type: 'text', id: 'apply-username', placeholder: 'Optional', autocomplete: 'off' }),
        ]),
      ]),
    ]),
    createElement('div', { className: 'field-row', style: { margin: 0 } }, [
      createElement('div', { className: 'input-field', style: { flex: 1 } }, [
        createElement('label', { textContent: 'Password' }),
        createElement('div', { className: 'input-wrap' }, [
          createElement('span', { className: 'icon icon-sm leading-icon', textContent: 'key' }),
          createElement('input', { type: 'password', id: 'apply-password', placeholder: 'Optional', autocomplete: 'new-password' }),
        ]),
      ]),
    ]),
  ]);

  showDialog({
    title: `Apply Proxy: ${protocol}`,
    icon: 'settings_ethernet',
    body: bodyEl,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-text',
      },
      {
        label: 'Apply',
        class: 'btn-primary',
        onClick: async () => {
          const user = $('#apply-username')?.value?.trim() || null;
          const pass = $('#apply-password')?.value?.trim() || null;

          if (!isTauriAvailable()) return;

          appendLog('info', `Verifying proxy: ${host}:${port} (${protocol})${user ? ' with auth' : ''}`);
          renderLogConsole();

          try {
            await tauriInvoke('test_proxy_connectivity', {
              host, port: parseInt(port), protocol,
              username: user,
              password: pass,
            });
          } catch (e) {
            appendLog('error', `Verification failed: ${e}`);
            renderLogConsole();
            showSnackbar('代理验证失败，请检查凭据', 'error');
            return;
          }

          appendLog('info', `Applying proxy: ${host}:${port} (${protocol})${user ? ' with auth' : ''}`);
          renderLogConsole();

          try {
            const result = await tauriInvoke('config_proxy', {
              host, port: String(port), protocol,
              username: user,
              password: pass,
            });
            AppState.proxyActive = true;
            appendLog('ok', result || `Proxy configured: ${host}:${port} (${protocol})`);
            renderLogConsole();
            showSnackbar('Proxy applied successfully', 'success');
          } catch (_) {
            showSnackbar('Failed to apply proxy', 'error');
          }
        },
      },
    ],
  });
}

// ─── Scan Results Export ─────────────────────────────────────────────────

function updateScanExportButtons() {
  const hasResults = (AppState.scanResults || []).length > 0;
  ['btn-scan-export-json', 'btn-scan-export-xml', 'btn-scan-export-xlsx'].forEach(id => {
    const btn = $(`#${id}`);
    if (btn) btn.disabled = !hasResults;
  });
}

async function exportScanData(format) {
  const results = AppState.scanResults || [];
  if (results.length === 0) {
    showSnackbar('No scan results to export', 'error');
    return;
  }

  const fields = [
    { key: 'ip', label: 'IP Address' },
    { key: 'port', label: 'Port' },
    { key: 'protocol', label: 'Protocol' },
    { key: 'latency', label: 'Latency (ms)' },
  ];
  const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const prefix = `scan-results-${ts}`;

  try {
    switch (format) {
      case 'json':
        await exportAsJSON(results, `${prefix}.json`);
        showSnackbar(`Exported ${results.length} scan results as JSON`, 'success');
        break;
      case 'xml':
        await exportAsXML(results, 'scanResults', 'result', fields, `${prefix}.xml`);
        showSnackbar(`Exported ${results.length} scan results as XML`, 'success');
        break;
      case 'xlsx':
        await exportAsXLSX(results, fields, `${prefix}.xls`);
        showSnackbar(`Exported ${results.length} scan results as XLSX`, 'success');
        break;
    }
  } catch (err) {
    showSnackbar('Export failed: ' + err, 'error');
  }
}

window.initScanPage = initScanPage;
window.applyProxy = applyProxy;
window.applyProxyWithAuth = applyProxyWithAuth;
window.exportScanData = exportScanData;

