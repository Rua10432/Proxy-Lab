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
  applyPrimaryColor(savedColor);

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

function applyTheme(theme) {
  const root = document.documentElement;
  // Clean up previous system theme listener
  if (window._themeMq) {
    window._themeMq.removeEventListener('change', window._themeHandler);
    window._themeMq = null;
    window._themeHandler = null;
  }

  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // System
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    root.classList.toggle('dark', mq.matches);
    window._themeMq = mq;
    window._themeHandler = (e) => root.classList.toggle('dark', e.matches);
    mq.addEventListener('change', window._themeHandler);
  }
}

function applyPrimaryColor(color) {
  // Update CSS custom properties for accent colors
  document.documentElement.style.setProperty('--color-accent-green', color);

  // Also update related border/shadow colors with transparency
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  // Update active status chip color
  document.documentElement.style.setProperty('--color-status-active', color);
}

  /* ── Language Select ── */
  const langSelect = $('#lang-select');
  if (langSelect) {
    langSelect.addEventListener('change', function(e) {
      applyLanguage(e.detail);
      // Update select value text
      langSelect.querySelector('.select-value').textContent = getLangLabel(e.detail);
    });

    // Restore saved language
    var savedLang = getCurrentLang();
    langSelect.querySelectorAll('.select-option').forEach(function(o) {
      o.classList.toggle('selected', o.dataset.value === savedLang);
    });
    langSelect.querySelector('.select-value').textContent = getLangLabel(savedLang);
  }

  // Apply language to this page
  applyLanguage();

window.initSettingsPage = initSettingsPage;
window.applyTheme = applyTheme;
window.applyPrimaryColor = applyPrimaryColor;
window.applyTitleBarMode = applyTitleBarMode;

