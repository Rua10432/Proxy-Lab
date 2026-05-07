import { invoke, listen } from '../api.js';
import { state } from '../state.js';
import { appendLog, setFieldError, classifyConfigLine } from '../utils.js';

const scanTableBody = document.getElementById("scan-table-body");
const scanEmptyState = document.getElementById("scan-empty-state");
const scanLinearProgress = document.getElementById("scan-linear-progress");
const scanProgressLabel = document.getElementById("scan-progress-label");
const scanFoundLabel = document.getElementById("scan-found-label");
const scanStatusChip = document.getElementById("scan-status-chip");
const scanStatusText = document.getElementById("scan-status-text");
const btnScanStart = document.getElementById("btn-scan-start");
const btnScanStop = document.getElementById("btn-scan-stop");
const fabScan = document.getElementById("fab-scan");
const scanRingPct = document.getElementById("scan-ring-pct");
const statScanned = document.getElementById("stat-scanned");
const statPortsOpen = document.getElementById("stat-ports-open");
const statFound = document.getElementById("stat-found");
const statAvgLatency = document.getElementById("stat-avg-latency");
const statScanSpeed = document.getElementById("stat-scan-speed");
const scanLog = document.getElementById("global-log");
const configLog = document.getElementById("global-log");

// New elements for filtering and sorting
const scanFilter = document.getElementById("scan-filter");
const scanCountBadge = document.getElementById("scan-count-badge");
const sortableHeaders = document.querySelectorAll("#scan-table thead th.sortable");

let scanFoundCount = 0;
let scanLatencySum = 0;
let scanStartTime = null;
let scanPortsOpen = 0;
let unlistenScanFound = null;
let unlistenScanDone = null;
let unlistenScanProgress = null;
let unlistenScanPortOpen = null;

// Data state
let scanResults = [];
let currentSortCol = null;
let currentSortDir = 'none'; // 'ascending', 'descending', 'none'
let currentFilter = '';

export function setScanRunning(running) {
  state.isScanRunning = running;
  if (btnScanStart) btnScanStart.disabled = running;
  if (btnScanStop) btnScanStop.disabled = !running;

  // Toggle inputs
  ["scan-network", "scan-mask", "scan-start-port", "scan-end-port", "scan-concurrent", "scan-syn-timeout", "scan-verify-concurrent"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = running;
    });
  
  if (fabScan) {
    fabScan.label = running ? "Stop" : "Scan";
    fabScan.variant = running ? "secondary" : "primary";
    const icon = fabScan.querySelector('md-icon');
    if (icon) icon.textContent = running ? "stop" : "radar";
  }

  if (scanLinearProgress) {
    scanLinearProgress.indeterminate = running;
  }

  if (running) {
    if (scanStatusChip) scanStatusChip.className = "status-chip testing";
    if (scanStatusText) scanStatusText.textContent = "scanning";
  } else {
    if (scanStatusChip) scanStatusChip.className = "status-chip ready";
    if (scanStatusText) scanStatusText.textContent = "idle";
  }
}

function cleanupScanListeners() {
  if (unlistenScanFound) { unlistenScanFound(); unlistenScanFound = null; }
  if (unlistenScanDone) { unlistenScanDone(); unlistenScanDone = null; }
  if (unlistenScanProgress) { unlistenScanProgress(); unlistenScanProgress = null; }
  if (unlistenScanPortOpen) { unlistenScanPortOpen(); unlistenScanPortOpen = null; }
}

function latencyClass(ms) {
  if (ms <= 100) return "latency-fast";
  if (ms <= 500) return "latency-medium";
  return "latency-slow";
}

function updateRing(pct) {
  if (scanRingPct) scanRingPct.textContent = `${Math.round(pct)}%`;
}

function appendScanLog(text, cls) {
  const line = document.createElement("div");
  line.className = `scan-log-line ${cls || ''}`;
  line.textContent = text;
  if (scanLog) {
    scanLog.appendChild(line);
    scanLog.scrollTop = scanLog.scrollHeight;
    while (scanLog.children.length > 200) scanLog.removeChild(scanLog.firstChild);
  }
}

function updateScanStats(scanned, total, found) {
  if (statScanned) statScanned.textContent = scanned.toLocaleString();
  if (statFound) statFound.textContent = found;
  if (scanFoundCount > 0 && statAvgLatency) {
    statAvgLatency.textContent = `${Math.round(scanLatencySum / scanFoundCount)} ms`;
  }
  if (scanStartTime && statScanSpeed) {
    const elapsed = (Date.now() - scanStartTime) / 1000;
    if (elapsed > 0) statScanSpeed.textContent = `${Math.round(scanned / elapsed)}/s`;
  }
}

export function resetScanStats() {
  scanFoundCount = 0;
  scanLatencySum = 0;
  scanStartTime = null;
  scanPortsOpen = 0;
  scanResults = [];
  if (statScanned) statScanned.textContent = "0";
  if (statPortsOpen) statPortsOpen.textContent = "0";
  if (statFound) statFound.textContent = "0";
  if (statAvgLatency) statAvgLatency.textContent = "-- ms";
  if (statScanSpeed) statScanSpeed.textContent = "0/s";
  if (scanCountBadge) scanCountBadge.textContent = "0 results";
  updateRing(0);
  if (scanLinearProgress) scanLinearProgress.value = 0;
  if (scanLog) scanLog.innerHTML = "";
}

export async function applyProxy(ip, port, protocol) {
  try {
    const msg = await invoke("config_proxy", { host: ip, port, protocol });
    appendLog(configLog, msg, classifyConfigLine(msg));
    const chip = document.createElement("div");
    chip.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
      padding: 8px 20px; border-radius: 20px; font-size: 13px; font-weight: 500;
      z-index: 100; transition: opacity 0.5s; pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    chip.textContent = `✓ Applied ${protocol} proxy ${ip}:${port}`;
    document.body.appendChild(chip);
    setTimeout(() => { chip.style.opacity = "0"; }, 1500);
    setTimeout(() => chip.remove(), 2000);
  } catch (err) {
    appendLog(configLog, String(err), "log-error");
  }
}

/**
 * Renders the table based on filtered and sorted results
 */
function renderTable() {
  if (!scanTableBody) return;

  // Filter
  const filtered = scanResults.filter(r => {
    if (!currentFilter) return true;
    const f = currentFilter.toLowerCase();
    return r.ip.toLowerCase().includes(f) || 
           r.port.toString().includes(f) || 
           r.protocol.toLowerCase().includes(f);
  });

  // Sort
  if (currentSortCol && currentSortDir !== 'none') {
    filtered.sort((a, b) => {
      let valA = a[currentSortCol];
      let valB = b[currentSortCol];
      
      // Numeric sort for latency and port
      if (currentSortCol === 'latency' || currentSortCol === 'port') {
        valA = Number(a[currentSortCol === 'latency' ? 'latency_ms' : 'port']);
        valB = Number(b[currentSortCol === 'latency' ? 'latency_ms' : 'port']);
      }

      if (valA < valB) return currentSortDir === 'ascending' ? -1 : 1;
      if (valA > valB) return currentSortDir === 'ascending' ? 1 : -1;
      return 0;
    });
  }

  // Update UI stats
  if (scanCountBadge) scanCountBadge.textContent = `${filtered.length} results`;
  if (scanEmptyState) scanEmptyState.style.display = filtered.length === 0 ? "flex" : "none";

  // Rebuild DOM efficiently
  const fragment = document.createDocumentFragment();
  filtered.forEach((r, idx) => {
    const tr = document.createElement("tr");
    
    // #
    const tdNum = document.createElement("td");
    tdNum.textContent = idx + 1;
    tdNum.className = "col-num";
    tdNum.style.color = "var(--md-sys-color-outline)";
    tr.appendChild(tdNum);

    // IP
    const tdIp = document.createElement("td");
    tdIp.textContent = r.ip;
    tdIp.style.fontWeight = "500";
    tr.appendChild(tdIp);

    // Port
    const tdPort = document.createElement("td");
    tdPort.textContent = r.port;
    tr.appendChild(tdPort);

    // Protocol
    const tdProto = document.createElement("td");
    const chip = document.createElement("span");
    chip.className = `proto-chip ${r.protocol.toLowerCase()}`;
    chip.textContent = r.protocol;
    tdProto.appendChild(chip);
    tr.appendChild(tdProto);

    // Latency
    const tdLatency = document.createElement("td");
    tdLatency.textContent = `${r.latency_ms} ms`;
    tdLatency.className = latencyClass(r.latency_ms);
    tdLatency.style.fontWeight = "500";
    tr.appendChild(tdLatency);

    // Apply
    const tdApply = document.createElement("td");
    tdApply.className = "col-apply";
    const btn = document.createElement("md-icon-button");
    btn.title = `Apply ${r.ip}:${r.port} as system proxy`;
    const icon = document.createElement("md-icon");
    icon.textContent = "play_circle";
    btn.appendChild(icon);
    btn.addEventListener("click", () => applyProxy(r.ip, String(r.port), r.protocol));
    tdApply.appendChild(btn);
    tr.appendChild(tdApply);

    fragment.appendChild(tr);
  });

  scanTableBody.innerHTML = "";
  scanTableBody.appendChild(fragment);
}

function handleSort(header) {
  const col = header.dataset.col;
  if (!col || col === 'num') return;

  // Reset all other headers
  sortableHeaders.forEach(h => {
    if (h !== header) {
      h.setAttribute('aria-sort', 'none');
      const icon = h.querySelector('.sort-icon');
      if (icon) icon.textContent = 'unfold_more';
    }
  });

  if (currentSortCol === col) {
    if (currentSortDir === 'none') currentSortDir = 'ascending';
    else if (currentSortDir === 'ascending') currentSortDir = 'descending';
    else currentSortDir = 'none';
  } else {
    currentSortCol = col;
    currentSortDir = 'ascending';
  }

  header.setAttribute('aria-sort', currentSortDir);
  const icon = header.querySelector('.sort-icon');
  if (icon) {
    if (currentSortDir === 'none') {
      icon.textContent = 'unfold_more';
    } else {
      icon.textContent = 'arrow_upward';
    }
  }
  
  renderTable();
}

// Initial Listeners
if (scanFilter) {
  scanFilter.addEventListener("input", (e) => {
    currentFilter = e.target.value;
    renderTable();
  });
}

sortableHeaders.forEach(header => {
  header.addEventListener("click", () => handleSort(header));
});

function addScanRow(payload) {
  scanFoundCount++;
  scanLatencySum += payload.latency_ms;
  
  // Storage for filter/sort
  scanResults.push(payload);
  
  // If no filtering/sorting is active, we can just append for performance
  // but if they are active, we must re-render.
  if (!currentFilter && (currentSortDir === 'none')) {
    if (scanEmptyState) scanEmptyState.style.display = "none";
    if (scanCountBadge) scanCountBadge.textContent = `${scanResults.length} results`;
    
    // Quick append code... (repeating logic for IDX)
    renderTable(); 
  } else {
    renderTable();
  }

  // Scroll to bottom only if no specific sorting is active
  if (currentSortDir === 'none') {
    const tableWrapper = document.querySelector("#scan-table-container .table-wrapper");
    if (tableWrapper) tableWrapper.scrollTop = tableWrapper.scrollHeight;
  }

  // Auto-save to config
  invoke("save_proxy", {
    entry: {
      ip: payload.ip,
      port: payload.port,
      protocol: payload.protocol,
      latency_ms: payload.latency_ms,
      added_at: new Date().toISOString(),
      last_tested: null,
    }
  }).catch(e => console.error("save_proxy:", e));
}

export async function startScan() {
  const netEl = document.getElementById("scan-network");
  const maskEl = document.getElementById("scan-mask");
  const sPortEl = document.getElementById("scan-start-port");
  const ePortEl = document.getElementById("scan-end-port");
  const concEl = document.getElementById("scan-concurrent");
  const synTimeoutEl = document.getElementById("scan-syn-timeout");
  const verifyConEl = document.getElementById("scan-verify-concurrent");

  let hasError = false;
  const network = netEl.value.trim();
  if (!network) { setFieldError(netEl, "Network is required"); hasError = true; }
  const mask = maskEl.value.trim();
  if (!mask) { setFieldError(maskEl, "Mask is required"); hasError = true; }

  const startPort = parseInt(sPortEl.value, 10);
  const endPort = parseInt(ePortEl.value, 10);
  if (isNaN(startPort) || startPort < 1 || startPort > 65535) { setFieldError(sPortEl, "Invalid port"); hasError = true; }
  if (isNaN(endPort) || endPort < 1 || endPort > 65535) { setFieldError(ePortEl, "Invalid port"); hasError = true; }
  if (!isNaN(startPort) && !isNaN(endPort) && startPort > endPort) {
    setFieldError(sPortEl, "Start > End"); setFieldError(ePortEl, "End < Start"); hasError = true;
  }
  if (hasError) return;

  const concurrent = Math.min(Math.max(parseInt(concEl.value, 10) || 250, 1), 50000);
  const synTimeoutMs = Math.min(Math.max(parseInt(synTimeoutEl.value, 10) || 500, 50), 5000);
  const verifyConcurrent = Math.min(Math.max(parseInt(verifyConEl.value, 10) || 50, 1), 500);

  if (scanTableBody) scanTableBody.innerHTML = "";
  if (scanEmptyState) scanEmptyState.style.display = "flex";
  if (scanProgressLabel) scanProgressLabel.textContent = "Scanned: 0 / 0";
  if (scanFoundLabel) scanFoundLabel.textContent = "Found: 0";
  resetScanStats();
  scanStartTime = Date.now();

  setScanRunning(true);
  appendScanLog(`[START] 2-Phase scan: ${network}/${mask} ports ${startPort}-${endPort}`, "log-info");

  invoke("add_scan_history", { network }).catch(e => console.error("add_scan_history:", e));

  unlistenScanPortOpen = await listen("scan-port-open", (event) => {
    scanPortsOpen = event.payload.open_count;
    if (statPortsOpen) statPortsOpen.textContent = scanPortsOpen;
  });

  unlistenScanFound = await listen("scan-found", (event) => {
    addScanRow(event.payload);
    if (scanFoundLabel) scanFoundLabel.textContent = `Found: ${scanFoundCount}`;
    appendScanLog(`[FOUND] ${event.payload.protocol} proxy at ${event.payload.ip}:${event.payload.port} (${event.payload.latency_ms}ms)`, "log-found");
  });

  unlistenScanProgress = await listen("scan-progress", (event) => {
    const { scanned, total, found } = event.payload;
    const pct = total > 0 ? ((scanned / total) * 100) : 0;
    if (scanLinearProgress) scanLinearProgress.value = (scanned / total);
    if (scanProgressLabel) scanProgressLabel.textContent = `Scanned: ${scanned.toLocaleString()} / ${total.toLocaleString()} (${pct.toFixed(1)}%)`;
    if (scanFoundLabel) scanFoundLabel.textContent = `Found: ${found}`;
    updateRing(pct);
    updateScanStats(scanned, total, found);
  });

  unlistenScanDone = await listen("scan-done", () => {
    cleanupScanListeners();
    setScanRunning(false);
    if (scanLinearProgress) scanLinearProgress.value = 1;
    updateRing(100);
    const elapsed = scanStartTime ? ((Date.now() - scanStartTime) / 1000).toFixed(1) : "?";
    appendScanLog(`[DONE] Scan completed in ${elapsed}s — ${scanPortsOpen} ports open, ${scanFoundCount} proxies found`, "log-done");
  });

  try {
    await invoke("start_proxy_scan", { network, mask, startPort, endPort, concurrent, synTimeoutMs, verifyConcurrent });
  } catch (err) {
    appendScanLog(`[ERROR] ${err}`, "log-error");
    cleanupScanListeners();
    setScanRunning(false);
  }
}

export async function stopScan() {
  try {
    await invoke("stop_proxy_scan");
    appendScanLog(`[STOP] Scan stopped by user`, "log-info");
  } catch (err) {
    console.error("stop_proxy_scan error:", err);
  }
}
