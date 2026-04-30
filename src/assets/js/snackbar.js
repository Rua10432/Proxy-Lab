/**
 * Simple M3 Snackbar Utility
 */
let snackbarContainer = null;

function ensureContainer() {
  if (!snackbarContainer) {
    snackbarContainer = document.createElement('div');
    snackbarContainer.id = 'snackbar-container';
    document.body.appendChild(snackbarContainer);
  }
}

export function showSnackbar(message, duration = 4000, type = 'default') {
  ensureContainer();

  const snackbar = document.createElement('div');
  snackbar.className = `snackbar snackbar-${type}`;
  
  const text = document.createElement('span');
  text.className = 'snackbar-text';
  text.textContent = message;
  
  snackbar.appendChild(text);
  
  // Close button
  const closeBtn = document.createElement('md-icon-button');
  closeBtn.innerHTML = '<md-icon>close</md-icon>';
  closeBtn.addEventListener('click', () => {
    snackbar.classList.add('closing');
    setTimeout(() => snackbar.remove(), 300);
  });
  snackbar.appendChild(closeBtn);

  snackbarContainer.appendChild(snackbar);

  // Auto remove
  setTimeout(() => {
    if (snackbar.parentElement) {
      snackbar.classList.add('closing');
      setTimeout(() => snackbar.remove(), 300);
    }
  }, duration);
}
