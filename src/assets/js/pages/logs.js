/* ═══════════════════════════════════════════════════════════════════════════════
   Page: Logs — Terminal Log Viewer
   ═══════════════════════════════════════════════════════════════════════════════ */

let _logAutoScroll = true;

function initLogsPage() {
  /* ── Level Chips ── */
  $$('#level-chips .level-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#level-chips .level-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      AppState.logLevelFilter = chip.dataset.level;
      renderLogConsole();
    });
  });

  /* ── Log Filter Input ── */
  $('#log-filter').addEventListener('input', () => {
    AppState.logFilter = $('#log-filter').value;
    renderLogConsole();
  });

  /* ── Copy Dropdown ── */
  const copyBtn = $('#btn-copy-log');
  const copyDropdown = $('#copy-dropdown');

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyDropdown.classList.toggle('open');
  });

  $$('.copy-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const mode = item.dataset.copyMode;
      copyLogs(mode);
      copyDropdown.classList.remove('open');
    });
  });

  /* ── Clear Logs ── */
  $('#btn-clear-global-log').addEventListener('click', () => {
    clearLogs();
    renderLogConsole();
    showSnackbar('Logs cleared', 'success');
  });

  /* ── Auto-scroll Switch ── */
  const autoScrollSwitch = $('#switch-auto-scroll');
  autoScrollSwitch.addEventListener('toggle', (e) => {
    _logAutoScroll = e.detail;
    AppState.autoScroll = _logAutoScroll;
  });

  /* ── New Entries Float Button ── */
  $('#new-entries-float').addEventListener('click', () => {
    const console = $('.console-area');
    if (console) {
      console.scrollTop = console.scrollHeight;
      $('#new-entries-float').classList.remove('visible');
    }
  });
}

function renderLogConsole() {
  const container = $('#global-log');
  const emptyState = $('#log-empty-state');
  const consoleArea = $('.console-area');
  if (!container) return;

  let logs = AppState.logs;

  // Filter by level
  if (AppState.logLevelFilter !== 'all') {
    logs = logs.filter(l => l.level === AppState.logLevelFilter);
  }

  // Filter by text
  if (AppState.logFilter) {
    const filter = AppState.logLevelFilter.toLowerCase();
    logs = logs.filter(l => l.content.toLowerCase().includes(AppState.logFilter.toLowerCase()));
  }

  if (logs.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      container.appendChild(emptyState);
      emptyState.style.display = '';
    }
    $('#log-count-text').textContent = '0';
    return;
  }

  // Hide empty state
  if (emptyState) emptyState.style.display = 'none';

  // Build HTML
  container.innerHTML = logs.map(log => {
    const time = formatTime(log.timestamp);
    const levelClass = log.level;
    return `<div class="log-line ${levelClass}">
      <span class="log-time">${time}</span>
      <span class="log-badge ${levelClass}">${log.level.toUpperCase()}</span>
      <span class="log-content">${escapeHtml(log.content)}</span>
      <span class="icon icon-sm log-copy-btn" onclick="copySingleLog('${log.id}')" title="Copy">content_copy</span>
    </div>`;
  }).join('');

  // Update count
  $('#log-count-text').textContent = logs.length;

  // Auto-scroll
  if (_logAutoScroll && consoleArea) {
    consoleArea.scrollTop = consoleArea.scrollHeight;
  }
}

function copyLogs(mode) {
  let text = '';
  if (mode === 'all') {
    text = AppState.logs.map(l => `[${formatTime(l.timestamp)}] [${l.level.toUpperCase()}] ${l.content}`).join('\n');
  } else {
    // Visible only
    const container = $('#global-log');
    const lines = container.querySelectorAll('.log-line');
    text = Array.from(lines).map(l => l.textContent.trim()).join('\n');
  }

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showSnackbar('Copied to clipboard', 'success');
    });
  } else {
    showSnackbar('Copy not supported', 'error');
  }
}

function copySingleLog(id) {
  const log = AppState.logs.find(l => l.id === id);
  if (!log) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(log.content).then(() => {
      showSnackbar('Line copied', 'success');
    });
  }
}

window.initLogsPage = initLogsPage;
window.renderLogConsole = renderLogConsole;
window.copySingleLog = copySingleLog;

