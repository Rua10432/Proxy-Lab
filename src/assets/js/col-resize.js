/* ═══════════════════════════════════════════════════════════════════════════════
   Column Resizer — drag right edge of <th> to resize columns in .data-table
   ═══════════════════════════════════════════════════════════════════════════════ */

const HIT_ZONE = 10;  // px from right edge of th to trigger resize

let _resizing = null;

document.addEventListener('mousedown', (e) => {
  // Ignore if already resizing or clicking interactive elements
  if (_resizing) return;
  if (e.target.closest('a, button, input, select, textarea, .btn, .icon')) return;

  const th = e.target.closest('.data-table thead th');
  if (!th) return;

  // Check if click is in the resize hit zone (right edge)
  const rect = th.getBoundingClientRect();
  if (rect.right - e.clientX > HIT_ZONE) return;

  e.preventDefault();
  _resizing = {
    th,
    startX: e.clientX,
    startWidth: rect.width,
  };
  th.classList.add('resizing');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!_resizing) return;
  const { th, startX, startWidth } = _resizing;
  const dx = e.clientX - startX;
  const newWidth = Math.max(30, startWidth + dx);
  th.style.width = newWidth + 'px';
});

document.addEventListener('mouseup', () => {
  if (!_resizing) return;
  _resizing.th.classList.remove('resizing');
  document.querySelectorAll('.data-table thead th.resizing').forEach(el => el.classList.remove('resizing'));
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  _resizing = null;
});
