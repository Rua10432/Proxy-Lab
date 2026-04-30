import { invoke, listen } from "./api.js";

export function initTitlebar() {
  const titlebar = document.getElementById("titlebar");
  if (!titlebar) return;

  const maximizeBtn = document.getElementById("titlebar-maximize");
  const maximizeIcon = maximizeBtn?.querySelector("md-icon");

  // 1. 平台检测与样式适配
  const platform = window.navigator.userAgent.toLowerCase();
  if (platform.includes("mac")) {
    document.body.classList.add("is-macos");
  } else {
    document.body.classList.add("is-windows");
  }

  // 2. 窗口状态同步
  const updateMaximizeIcon = (isMaximized) => {
    if (maximizeIcon) {
      maximizeIcon.textContent = isMaximized ? "filter_none" : "crop_square";
    }
  };

  // 初始状态检查
  invoke("win_is_maximized").then(updateMaximizeIcon).catch(() => {});

  // 监听 Tauri 窗口事件 (适用于 v1/v2，具体取决于后端发送)
  // 在 Tauri 中，resize 事件通常能捕获到最大化状态变化
  listen("tauri://resize", () => {
    invoke("win_is_maximized").then(updateMaximizeIcon).catch(() => {});
  });

  // 3. 窗口控制按钮监听
  document.getElementById("titlebar-minimize")?.addEventListener("click", () => {
    invoke("win_minimize");
  });

  maximizeBtn?.addEventListener("click", () => {
    invoke("win_toggle_maximize");
  });

  document.getElementById("titlebar-close")?.addEventListener("click", () => {
    invoke("win_close");
  });

  // 4. 显式窗口拖拽拦截 (Tauri 稳健拖拽)
  const titlebarLeft = titlebar.querySelector(".titlebar-left");
  if (titlebarLeft) {
    titlebarLeft.addEventListener("mousedown", (e) => {
      // 仅限鼠标左键触发拖拽
      if (e.button === 0) {
        invoke("win_start_drag");
      }
    });
  }
}
