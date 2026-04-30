import { invoke, listen } from '../api.js';
import { state, resetStats } from '../state.js';
import { appendLog, fmtMs, setFieldError } from '../utils.js';

const logArea = document.getElementById("global-log");
const statsBar = document.getElementById("stats-bar");
const statusChip = document.getElementById("status-chip");
const statusText = document.getElementById("status-text");
const btnTest = document.getElementById("btn-test");
const btnStop = document.getElementById("btn-stop");

let unlistenResult = null;
let unlistenDone = null;
let unlistenStopped = null;

export function renderStats() {
  const avg = state.stats.ok > 0 ? Number(state.stats.sum / BigInt(state.stats.ok)) : null;
  const total = state.stats.ok + state.stats.fail;
  const pct = total > 0 ? ((state.stats.fail / total) * 100).toFixed(0) : 0;
  if (statsBar) {
    statsBar.textContent = `min: ${fmtMs(state.stats.min)}  |  max: ${fmtMs(state.stats.max)}  |  ave: ${fmtMs(avg)}  |  loss: ${state.stats.fail}/${total} (${pct}%)`;
  }
}

export function setRunning(running) {
  state.isRunning = running;
  if (btnTest) btnTest.disabled = running;
  if (btnStop) btnStop.disabled = !running;

  // Toggle inputs
  ["test-host", "test-port", "test-count", "test-timeout", "test-interval", "test-proto"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = running;
    });

  if (running) {
    if (statusChip) statusChip.className = "status-chip testing";
    if (statusText) statusText.textContent = "testing";
  } else {
    if (statusChip) statusChip.className = "status-chip ready";
    if (statusText) statusText.textContent = "ready";
  }
}

function cleanupListeners() {
  if (unlistenResult) { unlistenResult(); unlistenResult = null; }
  if (unlistenDone) { unlistenDone(); unlistenDone = null; }
  if (unlistenStopped) { unlistenStopped(); unlistenStopped = null; }
}

function recordPingOk(us) {
  state.stats.ok++;
  state.stats.sum += BigInt(us);
  if (state.stats.min === null || us < state.stats.min) state.stats.min = us;
  if (state.stats.max === null || us > state.stats.max) state.stats.max = us;
}

export async function startTest() {
  const hostEl = document.getElementById("test-host");
  const portEl = document.getElementById("test-port");
  const countEl = document.getElementById("test-count");
  const toEl = document.getElementById("test-timeout");
  const itvlEl = document.getElementById("test-interval");
  const protoEl = document.getElementById("test-proto");
  const proto = protoEl ? protoEl.value : "HTTP";

  let hasError = false;
  const host = hostEl.value.trim();
  if (!host) { setFieldError(hostEl, "Address is required"); hasError = true; }

  const port = parseInt(portEl.value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    setFieldError(portEl, "Invalid port (1-65535)");
    hasError = true;
  }

  const count = parseInt(countEl.value, 10);
  if (isNaN(count) || count < 1 || count > 500) {
    setFieldError(countEl, "Invalid times (1-500)");
    hasError = true;
  }

  if (hasError) return;

  const timeoutMs = Math.min(Math.max(parseInt(toEl.value, 10) || 3000, 200), 30000);
  const intervalMs = Math.min(parseInt(itvlEl.value, 10) || 500, 10000);

  state.stats = resetStats();
  renderStats();
  setRunning(true);

  appendLog(logArea, "", "log-default");
  appendLog(logArea, `+-- test  ${host}:${port}  [${proto}]`, "log-header");
  appendLog(logArea, `times:${count}  timeout: ${timeoutMs} ms  interval: ${intervalMs} ms`, "log-header");

  unlistenResult = await listen("ping-result", (event) => {
    const { seq, ms, error } = event.payload;
    const seqStr = String(seq).padStart(4);
    if (ms !== null && ms !== undefined) {
      recordPingOk(ms);
      const display = ms < 1000 ? `< 1 ms (${ms} us)` : `${Math.round(ms / 1000)} ms`;
      appendLog(logArea, `|  [${seqStr}]   ${display}`, "log-ok");
    } else {
      state.stats.fail++;
      appendLog(logArea, `|  [${seqStr}]   fail ${error}`, "log-error");
    }
    renderStats();
  });

  unlistenDone = await listen("ping-done", () => finishTest(false));
  unlistenStopped = await listen("ping-stopped", () => finishTest(true));

  try {
    await invoke("start_ping_test", { host, port, protocol: proto, count, timeoutMs, intervalMs });
  } catch (err) {
    appendLog(logArea, `Error: ${err}`, "log-error");
    cleanupListeners();
    setRunning(false);
  }
}

export function finishTest(stopped) {
  cleanupListeners();
  setRunning(false);

  const avg = state.stats.ok > 0 ? Number(state.stats.sum / BigInt(state.stats.ok)) : null;
  const total = state.stats.ok + state.stats.fail;

  appendLog(logArea, "|", "log-header");
  if (stopped) {
    appendLog(logArea, `+-- stopped  | ${state.stats.ok} success  | ${state.stats.fail} fail`, "log-header");
  } else {
    appendLog(logArea, `+-- finish  |  min ${fmtMs(state.stats.min)}  |  max ${fmtMs(state.stats.max)}  |  ave ${fmtMs(avg)}  |  loss ${state.stats.fail}/${total}`, "log-header");
  }
  renderStats();
}

export async function runSilentPing(host, port, protocol = "HTTP", timeoutMs = 2000) {
  let resolvePing;
  let unlistenRes, unlistenD;

  const cleanup = () => {
    if (unlistenRes) unlistenRes(); unlistenRes = null;
    if (unlistenD) unlistenD(); unlistenD = null;
  };

  const promise = new Promise((res) => {
    resolvePing = res;
    setTimeout(() => {
      cleanup();
      res(false);
    }, 3500);
  });

  unlistenRes = await listen("ping-result", (event) => {
    const { ms, error } = event.payload;
    if (ms !== null && ms !== undefined && !error) {
      cleanup();
      resolvePing(true);
    } else {
      cleanup();
      resolvePing(false);
    }
  });

  unlistenD = await listen("ping-done", () => {
    cleanup();
    resolvePing(false);
  });

  try {
    // 传递 protocol 参数，以便后端进行协议级别的握手验证
    await invoke("start_ping_test", { host, port, protocol, count: 1, timeoutMs, intervalMs: 100 });
  } catch (err) {
    cleanup();
    resolvePing(false);
  }

  return promise;
}

export async function stopTest() {
  try {
    await invoke("stop_ping_test");
  } catch (err) {
    console.error("stop_ping_test error:", err);
  }
}
