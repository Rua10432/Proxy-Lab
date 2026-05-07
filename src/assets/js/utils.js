export function appendLog(container, text, cls = "log-default") {
  if (!container) return;
  const line = document.createElement("div");
  line.className = `log-line ${cls}`;
  line.textContent = text;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
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
