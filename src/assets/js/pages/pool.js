import { invoke } from '../api.js';
import { runSilentPing } from './test.js';
import { appendLog, fmtMs } from '../utils.js';
import { M3MessageBox } from '../dialog.js';

let poolProxies = [];
let isTesting = false;
let stopFlag = false;

const tableBody = document.getElementById('pool-table-body');
const emptyState = document.getElementById('pool-empty-state');
const countLabel = document.getElementById('pool-count-label');
const btnTestAll = document.getElementById('btn-pool-test-all');
const btnStop = document.getElementById('btn-pool-stop');
const btnRefresh = document.getElementById('btn-pool-refresh');

export async function initPool() {
  const tabs = document.getElementById('test-page-tabs');
  const manualContent = document.getElementById('test-manual-content');
  const poolContent = document.getElementById('test-pool-content');

  const showManual = () => {
    manualContent.style.setProperty('display', 'flex', 'important');
    manualContent.hidden = false;
    poolContent.style.setProperty('display', 'none', 'important');
    poolContent.hidden = true;
  };

  const showPool = () => {
    manualContent.style.setProperty('display', 'none', 'important');
    manualContent.hidden = true;
    poolContent.style.setProperty('display', 'flex', 'important');
    poolContent.hidden = false;
    refreshPool();
  };

  if (tabs) {
    // Wait for custom element to be ready
    customElements.whenDefined('md-tabs').then(() => {
      tabs.activeTabIndex = 0;
    });

    tabs.addEventListener('change', () => {
      const activeId = tabs.activeTab?.id;
      if (activeId === 'tab-manual') showManual();
      else if (activeId === 'tab-pool') showPool();
    });

    // Individual tab clicks as fallback
    document.getElementById('tab-manual')?.addEventListener('click', showManual);
    document.getElementById('tab-pool')?.addEventListener('click', showPool);
  }

  // Set initial state
  showManual();

  if (btnRefresh) btnRefresh.addEventListener('click', refreshPool);
  if (btnTestAll) btnTestAll.addEventListener('click', startPoolTest);
  if (btnStop) btnStop.addEventListener('click', () => { stopFlag = true; });

  const btnFetch = document.getElementById('btn-pool-fetch');
  const urlInput = document.getElementById('pool-sub-url');
  if (btnFetch && urlInput) {
    btnFetch.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) return;
      
      btnFetch.disabled = true;
      const logArea = document.getElementById("global-log");
      appendLog(logArea, `[Network] Fetching proxies from: ${url}...`, 'log-default');

      try {
        const newProxies = await invoke('fetch_proxies_from_url', { url });
        appendLog(logArea, `[Network] Successfully parsed ${newProxies.length} proxies.`, 'log-ok');
        
        // Save them to the backend to persist
        for (const p of newProxies) {
           await invoke('save_proxy', { entry: p });
        }
        
        await refreshPool();
      } catch (e) {
        appendLog(logArea, `[Network] Fetch Error: ${e}`, 'log-error');
      } finally {
        btnFetch.disabled = false;
      }
    });
  }

  const btnClear = document.getElementById('btn-pool-clear');
  if (btnClear) {
    btnClear.addEventListener('click', async() => {
      const m3Dialog = new M3MessageBox();
      const confirmed = await m3Dialog.show(
        'Clear Entire Pool',
        'Are you sure you want to permanently delete all saved proxies from the pool?',
        //icon: 'delete_sweep',
        'Clear All',
        'Cancel'
        //isAlert: false
      );

      if (confirmed) {
        try {
          await invoke('clear_proxies');
          refreshPool();
        } catch (e) {
          //console.error();
          showSnackbar("Failed to clear pool:", e, 5000, "error");
        }
      }
    });
  }

  // Initial load
  refreshPool();
}

export async function refreshPool() {
  try {
    const config = await invoke('get_config');
    poolProxies = config.proxies || [];
    renderPool();
  } catch (e) {
    console.error('Failed to refresh pool:', e);
  }
}

function renderPool() {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  if (poolProxies.length === 0) {
    emptyState.style.display = 'flex';
    countLabel.textContent = '0 Proxies';
    return;
  }

  emptyState.style.display = 'none';
  countLabel.textContent = `${poolProxies.length} Proxies`;

  poolProxies.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.id = `pool-row-${i}`;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${p.ip}</td>
      <td>${p.port}</td>
      <td><span class="proto-chip ${p.protocol.toLowerCase()}">${p.protocol}</span></td>
      <td id="pool-latency-${i}" class="pool-latency">--</td>
      <td id="pool-status-${i}">
        <span class="pool-status">Idle</span>
      </td>
      <td>
        <div style="display: flex; gap: 4px;">
          <md-icon-button class="btn-test-single" data-idx="${i}" title="Test Single">
             <md-icon>play_circle</md-icon>
          </md-icon-button>
          <md-icon-button class="btn-delete-single" data-idx="${i}" title="Delete" style="--md-icon-button-icon-color: var(--md-sys-color-error);">
             <md-icon>delete</md-icon>
          </md-icon-button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Attach listeners
  tableBody.querySelectorAll('.btn-test-single').forEach(btn => {
    btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        testSingleProxy(idx);
    });
  });

  tableBody.querySelectorAll('.btn-delete-single').forEach(btn => {
    btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        const p = poolProxies[idx];
        
        const confirmed = await showM3Dialog({
          title: 'Delete Proxy',
          content: `Confirm deletion of proxy node ${p.ip}:${p.port}?`,
          icon: 'delete',
          confirmText: 'Delete',
          cancelText: 'Keep'
        });

        if (confirmed) {
            try {
                await invoke('remove_proxy', { ip: p.ip, port: p.port });
                await refreshPool();
            } catch (e) {
                console.error('Delete failed:', e);
            }
        }
    });
  });
}

async function testSingleProxy(idx) {
    if (isTesting) return;
    const p = poolProxies[idx];
    updateStatus(idx, 'testing', 'Testing...');
    
    // Default timeout 2s
    const ok = await runSilentPing(p.ip, p.port, p.protocol, 2000);
    
    if (ok) {
        updateStatus(idx, 'online', 'Online');
        // Since runSilentPing is simplified, we don't have the exact ms here 
        // without more changes, but for pool we just want working/non-working
        // for now. Or we could modify runSilentPing to return ms.
    } else {
        updateStatus(idx, 'offline', 'Offline');
    }
}

async function startPoolTest() {
  if (isTesting || poolProxies.length === 0) return;
  
  isTesting = true;
  stopFlag = false;
  btnTestAll.disabled = true;
  btnStop.disabled = false;
  
  const logArea = document.getElementById("global-log");
  appendLog(logArea, `+-- Starting Pool Test (${poolProxies.length} nodes)`, 'log-header');

  // Test in small batches to not overwhelm the network/backend
  const batchSize = 3;
  for (let i = 0; i < poolProxies.length; i += batchSize) {
    if (stopFlag) break;
    
    const batch = poolProxies.slice(i, i + batchSize);
    const promises = batch.map((p, bIdx) => {
        const realIdx = i + bIdx;
        updateStatus(realIdx, 'testing', 'Testing...');
        return runSilentPing(p.ip, p.port, p.protocol, 2500).then(ok => {
            if (ok) {
                updateStatus(realIdx, 'online', 'Online');
            } else {
                updateStatus(realIdx, 'offline', 'Offline');
            }
        });
    });
    
    await Promise.all(promises);
  }

  appendLog(logArea, `+-- Pool Test finished.`, 'log-header');
  isTesting = false;
  btnTestAll.disabled = false;
  btnStop.disabled = true;
}

function updateStatus(idx, type, text) {
  const statusEl = document.getElementById(`pool-status-${idx}`);
  if (statusEl) {
    statusEl.innerHTML = `<span class="pool-status ${type}">${text}</span>`;
  }
}
