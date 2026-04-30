export function isDarkModeActive() {
  const theme = localStorage.getItem("theme") || "system";
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export async function applyPrimaryColor(color) {
  localStorage.setItem("primary-color", color);
  const picker = document.getElementById("primary-color-picker");
  if (picker) picker.value = color;

  try {
    const mcu = await import("@material/material-color-utilities");
    const { argbFromHex, themeFromSourceColor, applyTheme } = mcu;
    const theme = themeFromSourceColor(argbFromHex(color));
    applyTheme(theme, { target: document.documentElement, dark: isDarkModeActive() });
  } catch (e) {
    console.error("Failed to apply Material 3 theme:", e);
  }
}

export function applyTheme(t) {
  localStorage.setItem("theme", t);
  const html = document.documentElement;
  if (t === "dark") html.setAttribute("data-theme", "dark");
  else if (t === "light") html.setAttribute("data-theme", "light");
  else html.removeAttribute("data-theme");

  const savedColor = localStorage.getItem("primary-color") || "#6750A4";
  applyPrimaryColor(savedColor);
}

export function restoreTheme() {
  const savedTheme = localStorage.getItem("theme") || "system";
  applyTheme(savedTheme);

  // 这里的 async 等待不应阻塞 hideLoading 的执行，因此不使用 await。
  // 它会在自定义元素可用后自动更新 UI。
  customElements.whenDefined("md-filled-select")
    .then(() => {
      const protoSelect = document.getElementById("test-proto");
      const themeSelect = document.getElementById("theme-select");
      if (protoSelect) protoSelect.value = "HTTP";
      if (themeSelect) themeSelect.value = savedTheme;
    })
    .catch(e => console.warn("UI components failed to ready in time:", e));
}

export function initThemeListeners() {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const theme = localStorage.getItem("theme") || "system";
    if (theme === "system") {
      const savedColor = localStorage.getItem("primary-color") || "#6750A4";
      applyPrimaryColor(savedColor);
    }
  });

  const themeSelect = document.getElementById("theme-select");
  if (themeSelect) {
    themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));
  }

  const colorPicker = document.getElementById("primary-color-picker");
  if (colorPicker) {
    colorPicker.addEventListener("input", (e) => applyPrimaryColor(e.target.value));
  }
}
