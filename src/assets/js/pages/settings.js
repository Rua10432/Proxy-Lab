/* ═══════════════════════════════════════════════════════════════════════════════
   Page: Settings — Theme, Color & Title Bar
   ═══════════════════════════════════════════════════════════════════════════════ */

function initSettingsPage() {
  /* ── Theme Select ── */
  const themeSelect = $('#theme-select');
  themeSelect.addEventListener('change', (e) => {
    const theme = e.detail;
    AppState.theme = theme;
    applyTheme(theme);
    saveToStorage('theme', theme);
    showSnackbar('Theme: ' + theme.charAt(0).toUpperCase() + theme.slice(1), 'info');
  });

  /* ── Primary Color Picker ── */
  const colorPicker = $('#primary-color-picker');
  colorPicker.addEventListener('input', (e) => {
    const color = e.target.value;
    AppState.primaryColor = color;
    applyPrimaryColor(color);
    saveToStorage('primaryColor', color);
  });

  /* ── Title Bar Select ── */
  const titlebarSelect = $('#titlebar-select');
  if (titlebarSelect) {
    titlebarSelect.addEventListener('change', (e) => {
      const mode = e.detail;
      AppState.titleBarMode = mode;
      applyTitleBarMode(mode);
      saveToStorage('titleBarMode', mode);
    });
  }

  /* ── Close Confirm Switch ── */
  const closeSwitch = $('#close-confirm-switch');
  if (closeSwitch) {
    closeSwitch.addEventListener('toggle', (e) => {
      saveToStorage('closeConfirm', e.detail);
    });
  }

  // Restore saved settings
  const savedTheme = loadFromStorage('theme', 'dark');
  const savedColor = loadFromStorage('primaryColor', '#9eddc8');
  const savedTitleBar = loadFromStorage('titleBarMode', 'custom');
  const savedCloseConfirm = loadFromStorage('closeConfirm', true);

  AppState.theme = savedTheme;
  AppState.primaryColor = savedColor;
  AppState.titleBarMode = savedTitleBar;

  applyTheme(savedTheme);
  applyPrimaryColor(savedColor);

  // Update theme select UI
  themeSelect.querySelectorAll('.select-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === savedTheme);
  });
  themeSelect.querySelector('.select-value').textContent =
    savedTheme.charAt(0).toUpperCase() + savedTheme.slice(1);

  colorPicker.value = savedColor;

  // Update titlebar select UI
  if (titlebarSelect) {
    titlebarSelect.querySelectorAll('.select-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.value === savedTitleBar);
    });
    titlebarSelect.querySelector('.select-value').textContent =
      savedTitleBar.charAt(0).toUpperCase() + savedTitleBar.slice(1);
    applyTitleBarMode(savedTitleBar);
  }

  // Update close confirm switch
  if (closeSwitch) {
    closeSwitch.classList.toggle('on', savedCloseConfirm);
  }

  /* ── Language Select ── */
  const langSelect = $('#lang-select');
  if (langSelect) {
    langSelect.addEventListener('change', function(e) {
      applyLanguage(e.detail);
      langSelect.querySelector('.select-value').textContent = getLangLabel(e.detail);
    });

    // Restore saved language
    var savedLang = getCurrentLang();
    langSelect.querySelectorAll('.select-option').forEach(function(o) {
      o.classList.toggle('selected', o.dataset.value === savedLang);
    });
    langSelect.querySelector('.select-value').textContent = getLangLabel(savedLang);
  }

  // Update select display values when language changes
  document.addEventListener('language-changed', function() {
    document.querySelectorAll('.select-field').forEach(function(field) {
      var selected = field.querySelector('.select-option.selected');
      var valueSpan = field.querySelector('.select-value');
      if (selected && valueSpan) {
        valueSpan.textContent = selected.textContent;
      }
    });
  });

  // Apply language to this page
  applyLanguage();
}

function applyTitleBarMode(mode) {
  const titlebar = $('#titlebar');
  const closeCard = $('#close-behavior-card');
  if (mode === 'system') {
    titlebar?.classList.add('hidden');
    closeCard?.classList.add('hidden');
  } else {
    titlebar?.classList.remove('hidden');
    closeCard?.classList.remove('hidden');
  }
  if (window.tauriInvoke) {
    window.tauriInvoke('win_set_decorations', { decorations: mode === 'system' });
  }
}

window.initSettingsPage = initSettingsPage;
window.applyTitleBarMode = applyTitleBarMode;
