import { invoke, listen } from '../api.js';
import { state } from '../state.js';
import { appendLog, setFieldError, classifyConfigLine } from '../utils.js';
import { runSilentPing } from './test.js';
import { showSnackbar } from '../snackbar.js';

const configLog = document.getElementById("global-log");
const mtrTableBody = document.getElementById('mtr-table-body');
const mtrEmpty = document.getElementById('mtr-empty');
const mtrSparklines = document.getElementById('mtr-sparklines');
const btnMtrStart = document.getElementById('btn-mtr-start');
const btnMtrStop = document.getElementById('btn-mtr-stop');
const logArea = document.getElementById("global-log");

let mtrHopsData = [];
let mtrSortKey = null;
let mtrSortAsc = true;
let unlistenMtrUpdate = null;
let unlistenMtrStopped = null;
let unlistenMtrError = null;

export async function configProxy() {
  const hostEl = document.getElementById("config-host");
  const portEl = document.getElementById("config-port");
  const protoEl = document.getElementById("config-proto");
  const btnConfig = document.getElementById("btn-config");

  let hasError = false;
  const host = hostEl.value.trim();
  if (!host) { setFieldError(hostEl, "Address is required"); hasError = true; }
  const port = parseInt(portEl.value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    setFieldError(portEl, "Invalid port");
    hasError = true;
  }

  if (hasError) return;

  // Enter Loading State
  if (btnConfig) {
    btnConfig.classList.add("btn-loading");
    btnConfig.disabled = true;
  }
  ["config-host", "config-port", "config-proto", "config-user", "config-pass"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  try {
    const protocol = protoEl.value.trim();
    const username = document.getElementById("config-user")?.value || null;
    const password = document.getElementById("config-pass")?.value || null;

    // 1. SILENT TEST BEFORE APPLY
    appendLog(configLog, `[Verification] probing ${protocol} proxy at ${host}:${port}...`, "log-info");
    const ok = await runSilentPing(host, port, protocol, 3000, username, password);

    if (!ok) {
      showSnackbar("协议验证失败：端口未开启代理服务", 5000, "error");
      appendLog(configLog, `[Verification] Failed. ${protocol} service not detected at ${host}:${port}`, "log-error");
      return;
    }

    // 2. APPLY PROXY
    const msg = await invoke("config_proxy", { host, port: String(port), protocol, username, password });
    appendLog(configLog, msg, classifyConfigLine(msg));
    showSnackbar("代理配置已应用", 3000, "default");
    
    await checkProxyStatus();
    await renderRecentConfigs();

  } catch (err) {
    if (typeof err === 'string' && err.includes("PERMISSION_DENIED")) {
       showUacPrompt();
    }
    appendLog(configLog, err, "log-error");
    showSnackbar(`应用失败: ${err}`, 4000, "error");
  } finally {
    // Exit Loading State
    if (btnConfig) {
      btnConfig.classList.remove("btn-loading");
    }
  }
}

export async function checkProxyStatus() {
  const hostEl = document.getElementById("config-host");
  const portEl = document.getElementById("config-port");
  const protoEl = document.getElementById("config-proto");
  const userEl = document.getElementById("config-user");
  const passEl = document.getElementById("config-pass");
  const btnConfig = document.getElementById("btn-config");
  const btnDisconnect = document.getElementById("btn-config-disconnect");

  try {
    const status = await invoke("get_proxy_status");
    
    if (status.is_active) {
      if (hostEl) { hostEl.value = status.host; hostEl.disabled = true; }
      if (portEl) { portEl.value = status.port; portEl.disabled = true; }
      if (protoEl) { protoEl.value = status.protocol; protoEl.disabled = true; }
      if (userEl) { userEl.value = status.username || ""; userEl.disabled = true; }
      if (passEl) { passEl.value = status.password || ""; passEl.disabled = true; }
      if (btnConfig) btnConfig.disabled = true;
      if (btnDisconnect) btnDisconnect.disabled = false;
      
      const globalStatus = document.getElementById("global-status-text");
      if (globalStatus) globalStatus.textContent = "Connected";
    } else {
      if (hostEl) hostEl.disabled = false;
      if (portEl) portEl.disabled = false;
      if (protoEl) protoEl.disabled = false;
      if (userEl) userEl.disabled = false;
      if (passEl) passEl.disabled = false;
      if (btnConfig) btnConfig.disabled = false;
      if (btnDisconnect) btnDisconnect.disabled = true;

      const globalStatus = document.getElementById("global-status-text");
      if (globalStatus) globalStatus.textContent = "Ready";
    }
  } catch (err) {
    console.error("Failed to check proxy status:", err);
  }
}

export async function renderRecentConfigs() {
  const container = document.getElementById("recent-configs-container");
  const listEl    = document.getElementById("recent-configs-list");
  const clearBtn  = document.getElementById("btn-clear-recent");
  if (!container || !listEl) return;

  // Bind clear button once
  if (clearBtn && !clearBtn.onclick) {
    clearBtn.onclick = async () => {
      await invoke("clear_recent_configs");
      renderRecentConfigs();
      showSnackbar("配置历史已清空", 2000);
    };
  }

  try {
    const config  = await invoke("get_config");
    const recents = config.recent_configs || [];

    if (recents.length === 0) {
      container.style.display = "none";
      return;
    }

    container.style.display = "flex"; // Changed from block to flex to support better gap/label layout
    listEl.innerHTML = "";

    recents.forEach((p, idx) => {
      const card = document.createElement("div");
      card.className = "recent-config-card";
      card.title     = "点击自动填充";

      // ── Header row ──────────────────────────────────────────
      const header = document.createElement("div");
      header.className = "recent-config-card-header";

      const proto = document.createElement("span");
      proto.className   = "recent-config-proto";
      proto.textContent = p.protocol;

      const date = document.createElement("span");
      date.className   = "recent-config-date";
      date.textContent = (p.added_at || "").split("T")[0] || (p.added_at || "").split(" ")[0] || "";

      header.appendChild(proto);
      header.appendChild(date);

      // ── Address ─────────────────────────────────────────────
      const addr = document.createElement("div");
      addr.className   = "recent-config-addr";
      addr.textContent = `${p.ip}:${p.port}`;

      card.appendChild(header);
      card.appendChild(addr);

      // ── Username (if present) ────────────────────────────────
      if (p.username) {
        const user = document.createElement("div");
        user.className   = "recent-config-user";
        user.textContent = `👤 ${p.username}`;
        card.appendChild(user);
      }

      // ── Click: fill the form ─────────────────────────────────
      card.addEventListener("click", () => {
        const hostEl  = document.getElementById("config-host");
        const portEl  = document.getElementById("config-port");
        const protoEl = document.getElementById("config-proto");
        const userEl  = document.getElementById("config-user");
        const passEl  = document.getElementById("config-pass");

        if (hostEl)  hostEl.value  = p.ip;
        if (portEl)  portEl.value  = String(p.port);
        if (protoEl) protoEl.value = p.protocol;
        if (userEl)  userEl.value  = p.username || "";
        if (passEl)  passEl.value  = p.password || "";

        showSnackbar(`已填充: ${p.protocol} ${p.ip}:${p.port}`, 2000);
      });

      listEl.appendChild(card);
    });
  } catch (err) {
    console.warn("Failed to render recent configs:", err);
  }
}

export async function checkAdminStatus() {
  const lockIcon = document.getElementById("admin-lock-icon");
  if (!lockIcon) return;
  
  try {
    const isAdmin = await invoke("is_admin");
    if (isAdmin) {
      lockIcon.textContent = "lock_open";
      lockIcon.style.color = "var(--md-sys-color-primary)";
      lockIcon.title = "Running with Administrator Privileges (Full Access)";
    } else {
      lockIcon.textContent = "lock";
      lockIcon.style.color = "var(--md-sys-color-outline)";
      lockIcon.title = "Running as Standard User (Limited Registry Access)";
    }
  } catch (e) {
    console.warn("Failed to check admin status:", e);
  }
}

async function showUacPrompt() {
  const msg = "Insufficient permissions to modify system proxy settings.\n\nPlease restart the application by right-clicking the icon and selecting 'Run as Administrator'.";
  
  try {
    // 1. Try specialized dialog API first (Tauri 2 logic)
    const dialog = window.__TAURI__?.dialog || window.__TAURI__?.plugins?.dialog;
    if (dialog && dialog.message) {
      await dialog.message(msg, { title: 'Permission Required', type: 'warning' });
      return;
    }

    // 2. Try direct invoke for plugin:dialog (Tauri 2 backend command)
    await invoke('plugin:dialog|message', { 
        message: msg, 
        title: 'Permission Required', 
        kind: 'Warning' // Tauri 2 plugin-dialog often uses 'kind' internally
    });
  } catch (e) {
    console.error("Dialog failed:", e);
    alert(msg);
  }
}

export async function disconnectProxy() {
  const btnDisconnect = document.getElementById("btn-config-disconnect");
  if (btnDisconnect) {
    btnDisconnect.classList.add("btn-loading");
    btnDisconnect.disabled = true;
  }

  try {
    const msg = await invoke("disconnect_proxy");
    appendLog(configLog, msg, classifyConfigLine(msg));
    showSnackbar("代理已断开", 3000, "default");
    await checkProxyStatus();
  } catch (err) {
    appendLog(configLog, err, "log-error");
    showSnackbar(`断开失败: ${err}`, 4000, "error");
  } finally {
    if (btnDisconnect) btnDisconnect.classList.remove("btn-loading");
  }
}

export function setMtrRunning(running) {
  state.isMtrRunning = running;
  if (btnMtrStart) btnMtrStart.disabled = running;
  if (btnMtrStop) btnMtrStop.disabled = !running;

  // Toggle inputs
  ["mtr-host", "mtr-max-hops"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = running;
  });
}

function cleanupMtrListeners() {
  if (unlistenMtrUpdate) { unlistenMtrUpdate(); unlistenMtrUpdate = null; }
  if (unlistenMtrStopped) { unlistenMtrStopped(); unlistenMtrStopped = null; }
  if (unlistenMtrError) { unlistenMtrError(); unlistenMtrError = null; }
}

export function renderMtrTable(hops) {
  let sorted = [...hops];
  if (mtrSortKey) {
    sorted.sort((a, b) => {
      let va = a[mtrSortKey], vb = b[mtrSortKey];
      if (typeof va === 'string') return mtrSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return mtrSortAsc ? va - vb : vb - va;
    });
  }
  if (mtrTableBody) mtrTableBody.innerHTML = '';
  if (mtrEmpty) mtrEmpty.style.display = sorted.length ? 'none' : 'block';

  sorted.forEach(h => {
    const tr = document.createElement('tr');
    tr.className = 'mtr-row-flash';
    const dot = h.last > 0 ? '<span class="pulse-dot"></span>' : '<span class="pulse-dot timeout"></span>';
    const lossColor = h.loss_pct > 10 ? '#EF5350' : h.loss_pct > 0 ? '#FFA726' : '#66BB6A';
    tr.innerHTML = `
      <td>${h.hop}</td>
      <td style="font-weight:500">${h.ip}</td>
      <td style="color:${lossColor};font-weight:500">${h.loss_pct.toFixed(1)}%</td>
      <td>${h.sent}</td>
      <td>${dot}${h.last > 0 ? h.last.toFixed(0) + ' ms' : '—'}</td>
      <td>${h.avg > 0 ? h.avg.toFixed(1) + ' ms' : '—'}</td>
      <td style="color:#66BB6A">${h.best > 0 ? h.best.toFixed(0) + ' ms' : '—'}</td>
      <td style="color:#EF5350">${h.worst > 0 ? h.worst.toFixed(0) + ' ms' : '—'}</td>
    `;
    if (mtrTableBody) mtrTableBody.appendChild(tr);
  });
}

export function renderSparklines(hops) {
  if (!mtrSparklines) return;
  while (mtrSparklines.children.length > 1) mtrSparklines.removeChild(mtrSparklines.lastChild);
  hops.forEach(h => {
    const hist = h.history.filter(v => v >= 0);
    if (hist.length < 2) return;
    const w = 180, ht = 28;
    const max = Math.max(...hist, 1);
    const points = hist.map((v, i) => {
      const x = (i / (hist.length - 1)) * w;
      const y = ht - (v / max) * (ht - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', w); svg.setAttribute('height', ht);
    svg.setAttribute('viewBox', `0 0 ${w} ${ht}`);
    svg.innerHTML = `<polyline points="${points}" fill="none" stroke="var(--md-sys-color-primary)" stroke-width="1.5" stroke-linejoin="round"/>`;
    const label = document.createElement('div');
    label.className = 'spark-label';
    label.textContent = `Hop ${h.hop} (${h.ip})`;
    mtrSparklines.appendChild(label);
    mtrSparklines.appendChild(svg);
  });
}

export async function startMtr() {
  const hostEl = document.getElementById('mtr-host');
  const host = hostEl.value.trim();
  if (!host) { setFieldError(hostEl, 'Host is required'); return; }
  const maxHops = parseInt(document.getElementById('mtr-max-hops').value) || 30;

  mtrHopsData = [];
  if (mtrTableBody) mtrTableBody.innerHTML = '';
  if (mtrEmpty) mtrEmpty.style.display = 'block';
  setMtrRunning(true);

  unlistenMtrUpdate = await listen('mtr-update', e => {
    mtrHopsData = e.payload.hops;
    renderMtrTable(mtrHopsData);
    renderSparklines(mtrHopsData);
  });
  unlistenMtrStopped = await listen('mtr-stopped', () => {
    cleanupMtrListeners();
    setMtrRunning(false);
  });
  unlistenMtrError = await listen('mtr-error', e => {
    cleanupMtrListeners();
    setMtrRunning(false);
    appendLog(logArea, `[MTR ERROR] ${e.payload}`, 'log-error');
  });

  try {
    await invoke('start_mtr', { host, maxHops });
  } catch (err) {
    appendLog(logArea, `[MTR ERROR] ${err}`, 'log-error');
    cleanupMtrListeners();
    setMtrRunning(false);
  }
}

export async function stopMtr() {
  try { await invoke('stop_mtr'); } catch (e) { console.error(e); }
}

export function initMtrSorting() {
  document.querySelectorAll('#mtr-table thead th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (mtrSortKey === key) { mtrSortAsc = !mtrSortAsc; }
      else { mtrSortKey = key; mtrSortAsc = true; }
      
      // Reset all headers
      document.querySelectorAll('#mtr-table thead th').forEach(t => {
        t.classList.remove('active-sort', 'desc');
        t.removeAttribute('aria-sort');
      });

      th.classList.add('active-sort');
      if (!mtrSortAsc) th.classList.add('desc');
      th.setAttribute('aria-sort', mtrSortAsc ? 'ascending' : 'descending');
      
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = 'arrow_upward';

      if (mtrHopsData.length) renderMtrTable(mtrHopsData);
    });
  });
}

export async function runRouteTrace() {
  const hostEl = document.getElementById('route-host');
  const host = hostEl.value.trim();
  if (!host) { setFieldError(hostEl, 'Host is required'); return; }
  const tbody = document.getElementById('route-table-body');
  const empty = document.getElementById('route-empty');
  tbody.innerHTML = '';
  empty.style.display = 'block';
  empty.textContent = 'Tracing route...';

  const routeHost = document.getElementById('route-host');
  const btnRouteTrace = document.getElementById('btn-route-trace');
  if (routeHost) routeHost.disabled = true;
  if (btnRouteTrace) btnRouteTrace.disabled = true;

  try {
    const hops = await invoke('run_traceroute', { host, maxHops: 30 });
    empty.style.display = hops.length ? 'none' : 'block';
    const ts = document.getElementById('route-timestamp');
    if (ts) ts.textContent = hops.length ? hops[0].timestamp : '--';
    hops.forEach(h => {
      const tr = document.createElement('tr');
      const badgeCls = h.node_type.toLowerCase();
      tr.innerHTML = `
        <td style="color:var(--md-sys-color-outline)">${h.hop}</td>
        <td style="font-weight:500">🌐 ${h.ip}</td>
        <td><span class="route-badge ${badgeCls}">${h.node_type}</span></td>
        <td style="color:var(--md-sys-color-outline)">${h.network}</td>
        <td style="font-family:'Roboto Mono',monospace;font-size:12px;color:var(--md-sys-color-outline)">${h.timestamp}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    empty.textContent = `Error: ${err}`;
    empty.style.display = 'block';
  } finally {
    if (routeHost) routeHost.disabled = false;
    if (btnRouteTrace) btnRouteTrace.disabled = false;
  }
}
