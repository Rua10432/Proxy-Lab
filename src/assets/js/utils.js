export function appendLog(container, text, cls = "log-default") {
  if (!container) return;

  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;

  const line = document.createElement("div");
  line.className = `log-line ${cls}`;

  // 1. Timestamp
  const timeSpan = document.createElement("span");
  timeSpan.className = "log-time";
  timeSpan.textContent = `[${ts}]`;
  line.appendChild(timeSpan);

  // 2. Status Icon
  const icon = document.createElement("md-icon");
  icon.className = "log-status-icon";
  let iconName = "radio_button_checked"; // Default dot
  if (cls.includes("ok")) iconName = "check_circle";
  else if (cls.includes("error")) iconName = "error_outline";
  else if (cls.includes("header")) iconName = "terminal";
  else if (cls.includes("info")) iconName = "info";
  icon.textContent = iconName;
  line.appendChild(icon);

  // 3. Content
  const content = document.createElement("span");
  content.className = "log-content";
  content.textContent = text;
  line.appendChild(content);

  container.appendChild(line);
  
  // Auto-scroll logic (usually handled by caller switch, but standard here)
  const autoScroll = document.getElementById("switch-auto-scroll");
  if (!autoScroll || autoScroll.selected) {
    container.scrollTop = container.scrollHeight;
  }
}

export function classifyTestLine(text) {
  if (text.startsWith("+") || text.startsWith("|--") || text === "|") return "log-header";
  if (text.includes("fail") || text.includes("Error")) return "log-error";
  return "log-ok";
}

export function classifyConfigLine(text) {
  if (text.includes("[ERROR]") || text.includes("[Error]")) return "log-error";
  if (text.includes("[INFO]") || text.includes("[info]")) return "log-info";
  return "log-default";
}

export function fmtMs(v) {
  if (v === null) return "--";
  return v < 1000 ? `< 1 ms` : `${Math.round(v / 1000)} ms`;
}

export function setFieldError(el, msg) {
  if (el) {
    el.error = true;
    el.errorText = msg;
  }
}

export function clearFieldError(el) {
  if (el && el.error) {
    el.error = false;
    el.errorText = "";
  }
}

