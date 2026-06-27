/* ── Magic Starburst Click Effect ──────────────────────────────────────── */

const COLORS = [
  { r: 130, g: 210, b: 255 },  // light blue
  { r: 120, g: 180, b: 255 },  // sky blue
  { r: 190, g: 130, b: 255 },  // dreamy purple
  { r: 220, g: 170, b: 255 },  // soft purple
  { r: 255, g: 255, b: 255 },  // highlight white
];

let canvas = null;
let ctx = null;
let particles = [];
let rafId = null;
let resizeCleanup = null;
let clickCleanup = null;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'click-effect-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);

  const onResize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  if (typeof window.addManagedListener === 'function') {
    resizeCleanup = window.addManagedListener(window, 'resize', onResize);
  } else {
    window.addEventListener('resize', onResize);
    resizeCleanup = () => window.removeEventListener('resize', onResize);
  }
}

class Particle {
  constructor(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 280 + Math.random() * 420;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.baseSize = 2 + Math.random() * 4;
    this.size = this.baseSize;
    this.type = Math.random() < 0.55 ? 'star' : 'dot';
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.life = 1;
    this.decay = 1.8 + Math.random() * 1.2;
    // Slight rotation for stars
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 8;
  }

  update(dt) {
    this.vx *= Math.exp(-5.5 * dt);
    this.vy *= Math.exp(-5.5 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= this.decay * dt;
    this.size = this.baseSize * (this.life * this.life);
    this.rotation += this.rotSpeed * dt;
    return this.life > 0;
  }

  draw(ctx) {
    const a = Math.max(0, this.life);
    if (a < 0.01) return;
    const { r, g, b } = this.color;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const blur = Math.min(12, 4 + this.size * 1.5);
    ctx.shadowBlur = blur;
    ctx.shadowColor = `rgba(${r},${g},${b},${a * 0.6})`;
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;

    if (this.type === 'star') {
      this.drawStar(ctx);
    } else {
      this.drawDot(ctx);
    }

    ctx.restore();
  }

  drawStar(ctx) {
    const s = this.size;
    if (s < 0.3) { this.drawDot(ctx); return; }
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const outer = i * Math.PI / 2;
      const inner = outer + Math.PI / 4;
      ctx.lineTo(Math.cos(outer) * s, Math.sin(outer) * s);
      ctx.lineTo(Math.cos(inner) * s * 0.3, Math.sin(inner) * s * 0.3);
    }
    ctx.closePath();
    ctx.fill();
  }

  drawDot(ctx) {
    const r = this.size * 0.5;
    if (r < 0.3) return;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function spawnBurst(x, y) {
  ensureCanvas();
  for (let i = 0; i < 26; i++) {
    particles.push(new Particle(x, y));
  }
  if (!rafId) rafId = requestAnimationFrame(tick);
}

let lastTime = 0;

function tick(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000);
  lastTime = time;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles = particles.filter(p => p.update(dt));
  particles.forEach(p => p.draw(ctx));

  if (particles.length > 0) {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/* ── Install ──────────────────────────────────────────────────────────── */
export function initClickEffect() {
  if (clickCleanup) return;
  const onClick = (e) => {
    // Only left button, ignore modifier keys
    if (e.button !== 0) return;
    spawnBurst(e.clientX, e.clientY);
  };

  if (typeof window.addManagedListener === 'function') {
    clickCleanup = window.addManagedListener(document, 'click', onClick);
  } else {
    document.addEventListener('click', onClick);
    clickCleanup = () => document.removeEventListener('click', onClick);
  }

  if (typeof window.registerAppCleanup === 'function') {
    window.registerAppCleanup(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      particles = [];
      if (resizeCleanup) resizeCleanup();
      if (clickCleanup) clickCleanup();
      resizeCleanup = null;
      clickCleanup = null;
      canvas?.remove();
      canvas = null;
      ctx = null;
    });
  }
}
