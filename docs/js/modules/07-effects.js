/* ---------- weather theme / background / effects ---------- */
const ACCENTS = {
  clear:  { day: ['#fbbf24', '#fb923c'], night: ['#a5b4fc', '#818cf8'] },
  cloudy: { day: ['#94a3b8', '#38bdf8'], night: ['#818cf8', '#6366f1'] },
  rain:   { day: ['#38bdf8', '#60a5fa'], night: ['#6366f1', '#818cf8'] },
  snow:   { day: ['#7dd3fc', '#60a5fa'], night: ['#93c5fd', '#818cf8'] },
  fog:    { day: ['#94a3b8', '#cbd5e1'], night: ['#94a3b8', '#64748b'] },
  storm:  { day: ['#a78bfa', '#818cf8'], night: ['#8b5cf6', '#6366f1'] }
};
const BGS = {
  clear: { day: 'linear-gradient(180deg, #1273b5 0%, #2f9fe0 55%, #7cc0ec 100%)', night: 'linear-gradient(180deg, #020617 0%, #0b1a3a 55%, #12264f 100%)' },
  cloudy: { day: 'linear-gradient(180deg, #3d5873 0%, #5d7b96 55%, #7d99b0 100%)', night: 'linear-gradient(180deg, #0a0f1e 0%, #141d33 100%)' },
  rain: { day: 'linear-gradient(180deg, #33445a 0%, #42566e 60%, #5a7089 100%)', night: 'linear-gradient(180deg, #060b1d 0%, #101a36 100%)' },
  snow: { day: 'linear-gradient(180deg, #7f9cb8 0%, #a8c1d8 60%, #d5e5f2 100%)', night: 'linear-gradient(180deg, #0e1626 0%, #1c2b47 100%)' },
  fog: { day: 'linear-gradient(180deg, #5a6878 0%, #7d8b9a 100%)', night: 'linear-gradient(180deg, #2a3340 0%, #3d4857 100%)' },
  storm: { day: 'linear-gradient(180deg, #222c40 0%, #39455e 100%)', night: 'linear-gradient(180deg, #080a14 0%, #171c33 100%)' }
};
const BLOBS = {
  clear: { day: ['rgba(251,191,36,0.16)', 'rgba(251,146,60,0.10)', 'rgba(125,211,252,0.10)'], night: ['rgba(129,140,248,0.13)', 'rgba(99,102,241,0.10)', 'rgba(59,130,246,0.09)'] },
  cloudy: { day: ['rgba(148,163,184,0.14)', 'rgba(56,189,248,0.08)', 'rgba(203,213,225,0.07)'], night: ['rgba(129,140,248,0.12)', 'rgba(99,102,241,0.10)', 'rgba(148,163,184,0.08)'] },
  rain: { day: ['rgba(96,165,250,0.15)', 'rgba(56,189,248,0.10)', 'rgba(129,140,248,0.08)'], night: ['rgba(99,102,241,0.13)', 'rgba(96,165,250,0.09)', 'rgba(59,130,246,0.09)'] },
  snow: { day: ['rgba(186,230,253,0.18)', 'rgba(147,197,253,0.12)', 'rgba(224,242,254,0.09)'], night: ['rgba(147,197,253,0.13)', 'rgba(129,140,248,0.10)', 'rgba(186,230,253,0.08)'] },
  fog: { day: ['rgba(148,163,184,0.14)', 'rgba(203,213,225,0.10)', 'rgba(100,116,139,0.09)'], night: ['rgba(148,163,184,0.12)', 'rgba(100,116,139,0.10)', 'rgba(203,213,225,0.07)'] },
  storm: { day: ['rgba(167,139,250,0.15)', 'rgba(129,140,248,0.10)', 'rgba(96,165,250,0.09)'], night: ['rgba(139,92,246,0.14)', 'rgba(99,102,241,0.10)', 'rgba(96,165,250,0.08)'] }
};
const LOGOS = {
  clear: { day: 'linear-gradient(135deg,#fbbf24,#fb923c)', night: 'linear-gradient(135deg,#4338ca,#312e81)' },
  cloudy: { day: 'linear-gradient(135deg,#94a3b8,#64748b)', night: 'linear-gradient(135deg,#6366f1,#4338ca)' },
  rain: { day: 'linear-gradient(135deg,#38bdf8,#1d4ed8)', night: 'linear-gradient(135deg,#6366f1,#312e81)' },
  snow: { day: 'linear-gradient(135deg,#bae6fd,#60a5fa)', night: 'linear-gradient(135deg,#93c5fd,#4f46e5)' },
  fog: { day: 'linear-gradient(135deg,#cbd5e1,#94a3b8)', night: 'linear-gradient(135deg,#94a3b8,#475569)' },
  storm: { day: 'linear-gradient(135deg,#a78bfa,#7c3aed)', night: 'linear-gradient(135deg,#8b5cf6,#4c1d95)' }
};

let lastBgKey = '';
/* heavy effects are disabled when the user is in Eco mode or the FPS detector flagged a weak device */
function effectsReduced() { return state.effects === 'eco' || (state.effects === 'auto' && state._perfLow); }
function setBackground(gradient, key) {
  if (key && key === lastBgKey) return;
  lastBgKey = key || '';
  const active = el.bg1.classList.contains('active') ? el.bg1 : el.bg2;
  const next = active === el.bg1 ? el.bg2 : el.bg1;
  next.style.background = gradient;
  active.classList.remove('active');
  next.classList.add('active');
}

function applyWeatherTheme() {
  const root = document.documentElement;
  const code = currentWeatherCode();
  const type = code != null ? wmo(code).type : 'cloudy';
  const night = code != null ? !isDayNow() : false;
  const time = night ? 'night' : 'day';
  const mode = state.theme;

  if (mode === 'light') {
    setBackground('linear-gradient(180deg, #e8f3fd 0%, #f7fafd 100%)', 'light');
    root.style.setProperty('--accent', '#7c3aed');
    root.style.setProperty('--accent-2', '#06b6d4');
    ['--blob-1', '--blob-2', '--blob-3'].forEach((v, k) => root.style.removeProperty(v));
    root.style.removeProperty('--grad-logo');
    FX.stop(); stopStorm(); GlassFX.stop();
    state.accent = '#7c3aed'; state.accent2 = '#06b6d4';
    return;
  }
  if (mode === 'dark') {
    setBackground('linear-gradient(180deg, #070b16 0%, #04060d 100%)', 'dark');
    root.style.setProperty('--accent', '#38bdf8');
    root.style.setProperty('--accent-2', '#818cf8');
    ['--blob-1', '--blob-2', '--blob-3'].forEach(v => root.style.removeProperty(v));
    root.style.removeProperty('--grad-logo');
    FX.stop(); stopStorm(); GlassFX.stop();
    state.accent = '#38bdf8'; state.accent2 = '#818cf8';
    return;
  }

  /* adaptive */
  const acc = ACCENTS[type] || ACCENTS.cloudy;
  const [a1, a2] = acc[time];
  root.style.setProperty('--accent', a1);
  root.style.setProperty('--accent-2', a2);
  state.accent = a1; state.accent2 = a2;
  const blobs = (BLOBS[type] || BLOBS.cloudy)[time];
  root.style.setProperty('--blob-1', blobs[0]);
  root.style.setProperty('--blob-2', blobs[1]);
  root.style.setProperty('--blob-3', blobs[2]);
  const logo = (LOGOS[type] || LOGOS.cloudy)[time];
  root.style.setProperty('--grad-logo', logo);
  setBackground((BGS[type] || BGS.cloudy)[time], `${type}-${time}`);

  let fx = null;
  if (type === 'rain' || type === 'storm') fx = 'rain';
  else if (type === 'snow') fx = 'snow';
  else if (type === 'clear' && night) fx = 'stars';
  else if (type === 'clear') fx = null;
  else if (type === 'fog') fx = 'fog';
  else if (type === 'cloudy') fx = 'clouds';

  if (effectsReduced()) { FX.stop(); stopStorm(); GlassFX.stop(); }
  else {
    FX.start(fx);
    if (type === 'storm') startStorm(); else stopStorm();
    /* Glass droplets only make sense for actual rain/storm — reuses the same
       intensity value FX already computed from live precipitation data. */
    if (type === 'rain' || type === 'storm') GlassFX.start(FX.intensity);
    else GlassFX.stop();
  }
}

function stopStorm() {
  if (state.stormTimer) { clearInterval(state.stormTimer); state.stormTimer = null; }
  el.flash.classList.remove('flash');
}
function startStorm() {
  if (state.stormTimer || motionReduce) return;
  state.stormTimer = setInterval(() => {
    el.flash.classList.remove('flash');
    void el.flash.offsetWidth; /* restart animation */
    el.flash.classList.add('flash');
  }, 3200 + Math.random() * 3800);
}

/* ---------- FX canvas ---------- */
const FX = {
  parts: [], kind: null, raf: 0, last: 0, w: 0, h: 0, dpr: 1, shoot: null, intensity: 0.5,
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    el.fxCanvas.width = this.w * this.dpr;
    el.fxCanvas.height = this.h * this.dpr;
    el.fxCanvas.style.width = this.w + 'px';
    el.fxCanvas.style.height = this.h + 'px';
    const ctx = el.fxCanvas.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.kind) this.build(); /* reposition particles for the new viewport */
  },
  build() {
    this.parts = [];
    /* Base particle counts scaled by intensity (0-1) */
    const base = { rain: 110, snow: 85, stars: 110, clouds: 5, fog: 6 }[this.kind] || 0;
    const n = Math.max(1, Math.round(base * this.intensity));
    for (let i = 0; i < n; i++) {
      if (this.kind === 'rain') {
        /* More intense = faster, thicker, more opaque drops */
        const len = 14 + Math.random() * (18 + this.intensity * 12);
        const sp = 780 + Math.random() * (420 + this.intensity * 200);
        const a = 0.12 + this.intensity * (0.15 + Math.random() * 0.18);
        this.parts.push({ x: Math.random() * this.w, y: Math.random() * this.h, len, sp, a });
      } else if (this.kind === 'snow') {
        const r = 1 + Math.random() * (2.4 + this.intensity * 1.5);
        const sp = 26 + Math.random() * (34 + this.intensity * 20);
        const a = 0.3 + this.intensity * (0.3 + Math.random() * 0.3);
        this.parts.push({ x: Math.random() * this.w, y: Math.random() * this.h, r, sp, ph: Math.random() * Math.PI * 2, sw: 18 + Math.random() * 22, a });
      } else if (this.kind === 'stars') this.parts.push({ x: Math.random() * this.w, y: Math.random() * this.h * 0.72, r: Math.random() * 1.5 + 0.4, tw: 0.6 + Math.random() * 2.2, ph: Math.random() * Math.PI * 2 });
      else if (this.kind === 'clouds') this.parts.push({ x: Math.random() * this.w, y: 20 + Math.random() * this.h * 0.5, w: 220 + Math.random() * 320, sp: 8 + Math.random() * 16, a: 0.05 + Math.random() * 0.07 });
      else if (this.kind === 'fog') this.parts.push({ x: Math.random() * this.w, y: this.h * (0.3 + Math.random() * 0.6), w: this.w * (0.7 + Math.random() * 0.6), sp: 10 + Math.random() * 22, a: 0.05 + Math.random() * 0.05 });
    }
    this.shoot = null;
  },
  /* Update intensity in real-time (0-1 scale, 0=light rain, 1=downpour) */
  setIntensity(val) {
    this.intensity = Math.max(0, Math.min(1, val || 0.5));
    /* If running, rebuild with new intensity */
    if (this.running && (this.kind === 'rain' || this.kind === 'snow')) {
      this.build();
    }
  },
  start(kind) {
    if (kind === this.kind) return;
    if (!kind) { this.stop(); return; }
    this.kind = kind;
    this.resize();
    this.build();
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }
  },
  stop() {
    this.kind = null;
    this.parts = [];
    this.running = false;
    cancelAnimationFrame(this.raf);
    const ctx = el.fxCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.w, this.h);
  },
  resume() {
    if (!this.kind || this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  },
  loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const ctx = el.fxCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.w, this.h);

    if (this.kind === 'rain') {
      ctx.lineWidth = 1.1;
      for (const p of this.parts) {
        p.y += p.sp * dt; p.x -= 26 * dt;
        if (p.y > this.h + 30) { p.y = -30; p.x = Math.random() * (this.w + 80); }
        ctx.strokeStyle = `rgba(180,210,255,${p.a})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3.5, p.y + p.len);
        ctx.stroke();
      }
    } else if (this.kind === 'snow') {
      for (const p of this.parts) {
        p.y += p.sp * dt;
        p.ph += dt * 1.4;
        p.x += Math.sin(p.ph) * p.sw * dt;
        if (p.y > this.h + 8) { p.y = -8; p.x = Math.random() * this.w; }
        ctx.fillStyle = `rgba(240,246,255,${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.kind === 'stars') {
      for (const p of this.parts) {
        const a = p.a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t / 1000 * p.tw + p.ph));
        ctx.fillStyle = `rgba(226,232,240,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      /* occasional shooting star */
      if (!this.shoot && Math.random() < 0.006) {
        this.shoot = { x: this.w * (0.2 + Math.random() * 0.6), y: this.h * 0.15, vx: -260 - Math.random() * 160, vy: 90 + Math.random() * 70, life: 1 };
      }
      if (this.shoot) {
        const s = this.shoot;
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.4;
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.16, s.y - s.vy * 0.16);
        grad.addColorStop(0, `rgba(255,255,255,${Math.max(0, s.life)})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.16, s.y - s.vy * 0.16);
        ctx.stroke();
        if (s.life <= 0) this.shoot = null;
      }
    } else if (this.kind === 'clouds') {
      for (const p of this.parts) {
        p.x += p.sp * dt;
        if (p.x - p.w > this.w) { p.x = -p.w; p.y = 20 + Math.random() * this.h * 0.5; }
        const g = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, p.w);
        g.addColorStop(0, `rgba(226,232,240,${p.a})`);
        g.addColorStop(1, 'rgba(226,232,240,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.w, p.w * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.kind === 'fog') {
      for (const p of this.parts) {
        p.x += p.sp * dt;
        if (p.x - p.w > this.w) { p.x = -p.w; }
        const g = ctx.createRadialGradient(p.x, p.y, 20, p.x, p.y, p.w * 0.5);
        g.addColorStop(0, `rgba(200,212,228,${p.a})`);
        g.addColorStop(1, 'rgba(200,212,228,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.w * 0.5, p.w * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
  }
};

/* ---------- Rain-on-glass droplets (per-card, not a full-screen overlay) ----------
   Rewritten after user feedback: the first version was a single full-viewport
   canvas with large soft "bokeh" sprites on top of everything, which read as
   glowing balls obscuring the UI. This version instead injects one small
   <canvas class="glass-fx-layer"> INSIDE each content card/the search bar,
   positioned to fill that card and painted at z-index: -1 *within the card's
   own stacking context* (see CSS) — that guarantees the canvas always paints
   after the card's background but strictly before the card's own text/icons,
   so droplets sit behind the interface, never over it, no matter what markup
   a given card contains.
   Droplets themselves are small and sharp (≈2-8px), not glowing circles: a
   flat semi-transparent fill, a thin darker rim along the bottom (implies
   the glass casts a tiny shadow under the drop) and a small bright highlight
   top-left (implies refraction) — three cheap primitive draws per drop, no
   gradients rebuilt per frame. Most droplets stay put or barely creep; a
   small fraction occasionally slide down and leave a short, fast-fading
   trail, then rejoin the resting population.
   Performance: a single requestAnimationFrame loop drives every card's
   canvas; canvases that are currently detached from the document (a
   SECTION_MANAGER-unloaded chart/hourly/daily/lifestyle card scrolled far
   away) are skipped for free via a cheap `isConnected` check. Droplet count
   per card scales with that card's own pixel area, not a fixed global count,
   so small cards (search bar, sun/AQI tiles) get a handful and the hero gets
   more — total drops on screen stay modest. Fully stopped (canvases cleared,
   rAF cancelled) in Eco mode / on detected low-power devices via the exact
   same effectsReduced()/applyEffects() gate as the ambient FX canvas, with a
   CSS `display:none` on [data-perf="eco"/"low"] as a second safety net. */
const GlassFX = {
  HOST_SELECTOR: '.card, .search-form',
  hosts: [], raf: 0, running: false, last: 0, intensity: 0.5, inited: false,

  /* Discovers every card / search-bar host once and injects its canvas as
     the very first child (so it paints first, i.e. furthest back). Safe to
     call repeatedly — already-equipped hosts are skipped. */
  init() {
    const found = document.querySelectorAll(this.HOST_SELECTOR);
    found.forEach((host) => {
      if (host.querySelector(':scope > canvas.glass-fx-layer')) return;
      const canvas = document.createElement('canvas');
      canvas.className = 'glass-fx-layer';
      canvas.setAttribute('aria-hidden', 'true');
      host.insertBefore(canvas, host.firstChild);
      this.hosts.push({ host, canvas, ctx: null, w: 0, h: 0, drops: [] });
    });
    this.inited = true;
  },
  resizeHost(hd) {
    const w = hd.host.clientWidth || 0, h = hd.host.clientHeight || 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    hd.w = w; hd.h = h;
    hd.canvas.width = Math.max(1, Math.round(w * dpr));
    hd.canvas.height = Math.max(1, Math.round(h * dpr));
    hd.ctx = hd.canvas.getContext('2d');
    if (hd.ctx) {
      hd.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* Resizing a canvas (setting .width/.height) resets the whole 2D
         context to its defaults, so smoothing must be re-applied every
         time. 'high' quality resampling is what keeps the shared droplet
         sprite (rasterized once at a fixed resolution) looking soft and
         crisp instead of muddy/blocky when drawImage() scales it down to
         the handful of on-screen pixels a drop actually occupies. */
      hd.ctx.imageSmoothingEnabled = true;
      hd.ctx.imageSmoothingQuality = 'high';
    }
  },
  resize() {
    if (!this.inited) return;
    this.hosts.forEach((hd) => this.resizeHost(hd));
    if (this.running) this.hosts.forEach((hd) => this.buildHost(hd));
  },
  /* One shared droplet "lens" sprite, pre-rendered once at a fixed, high
     enough resolution that it stays crisp when drawImage()'d at any of the
     small on-screen sizes we actually use (2-8px diameter). Reusing a single
     sprite for every drop on every card means the per-frame cost is just a
     cheap drawImage() call — no gradients are ever rebuilt during the
     animation loop, which is what keeps this fast even with several cards
     animating at once. The look is modeled on a real glass droplet: a soft
     lens-like body lit from the top-left, a subtle darker meniscus rim along
     the bottom (implies a tiny shadow/thickness), a thin light rim along the
     top, and two small specular catchlights — the double-highlight is what
     actually reads as "glass" rather than a flat dot. */
  buildDropSprite() {
    /* Rasterized well above the largest size it's ever drawn at (a drop's
       on-screen diameter tops out around size=d.r*2.6 ~= 10-ish CSS px,
       up to ~2x that in device pixels on a hi-dpi screen) so drawImage()
       is always downscaling into more detail than it needs rather than
       stretching a coarse source up — that's what avoids the pixelated /
       blocky look while still costing nothing per-frame (built once). */
    const S = 160;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    if (!ctx) { this.dropSprite = c; return; }
    const cx = S / 2, cy = S / 2, R = S / 2 - 3;
    const g = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.38, R * 0.12, cx, cy, R);
    g.addColorStop(0, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.35, 'rgba(210,228,248,0.42)');
    g.addColorStop(0.72, 'rgba(150,175,205,0.3)');
    g.addColorStop(1, 'rgba(70,90,120,0.16)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    /* darker meniscus rim, concentrated along the bottom */
    ctx.strokeStyle = 'rgba(4,8,18,0.55)';
    ctx.lineWidth = Math.max(1, R * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, R - ctx.lineWidth / 2, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
    /* thin light rim along the top, catching ambient light */
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = Math.max(0.6, R * 0.09);
    ctx.beginPath();
    ctx.arc(cx, cy, R - ctx.lineWidth, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    /* two specular catchlights — the "glassy" double-highlight */
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(cx - R * 0.32, cy - R * 0.36, R * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(cx + R * 0.2, cy - R * 0.05, R * 0.08, 0, Math.PI * 2); ctx.fill();
    this.dropSprite = c;
  },
  spawnDrop(hd) {
    /* Most drops are plain round lenses (radius 1-4px, ~2-8px diameter).
       A minority spawn already "streaked" — a static elongated tail frozen
       above them, like a droplet caught mid-slide on real wet glass (see
       the reference photo: several drops there are long thin vertical
       comets rather than round dots). These barely move on their own; the
       occasional active slide (below) is a separate, rarer event. */
    const streaked = Math.random() < 0.22;
    return {
      x: Math.random() * hd.w,
      y: Math.random() * hd.h,
      r: 1 + Math.random() * 3, /* radius 1-4px -> visible diameter ~2-8px */
      alpha: 0.4 + Math.random() * 0.45,
      stretch: streaked ? (2.2 + Math.random() * 3.5) : 0, /* static tail length multiplier */
      sliding: false, slideSpeed: 0, slideLife: 0, trail: 0,
      /* Per-drop wobble signature: two layered sine waves (different phase,
         seed and frequency per drop) that get sampled along the tail's
         vertical extent to bend it into a gentle, unique S-curve instead of
         a straight/identical line for every drop — mimicking how a real
         bead of water drifts sideways over tiny imperfections in glass.
         Cheap: just two sin() calls per sample point, no history arrays. */
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSeed: Math.random() * Math.PI * 2,
      wobbleAmp1: 0.5 + Math.random() * 1.2,
      wobbleAmp2: 0.25 + Math.random() * 0.7,
      wobbleFreq1: 0.05 + Math.random() * 0.05,
      wobbleFreq2: 0.1 + Math.random() * 0.09,
      wobbleDist: 0, lastWobbleOffset: 0
    };
  },
  /* Horizontal drift at a given distance `dy` above the drop's current
     position. Using distance-along-the-tail (rather than stored history
     points) as the sampling axis means the wavy path can be recomputed on
     the fly for any drop, at any frame, with zero extra memory. */
  wobbleOffset(d, dy) {
    return Math.sin(d.wobblePhase + dy * d.wobbleFreq1) * d.wobbleAmp1 +
           Math.sin(d.wobbleSeed + dy * d.wobbleFreq2) * d.wobbleAmp2;
  },
  buildHost(hd) {
    if (!hd.w && !hd.h) this.resizeHost(hd);
    /* density scales with the card's own area + current rain intensity;
       clamped so even the hero (largest card) stays visually restrained. */
    const area = hd.w * hd.h;
    const n = Math.max(3, Math.min(30, Math.round((area / 9000) * (0.4 + this.intensity * 0.9))));
    hd.drops = [];
    for (let i = 0; i < n; i++) hd.drops.push(this.spawnDrop(hd));
  },
  setIntensity(val) {
    this.intensity = Math.max(0, Math.min(1, val == null ? 0.5 : val));
    if (this.running) this.hosts.forEach((hd) => this.buildHost(hd));
  },
  start(intensity) {
    if (intensity != null) this.intensity = Math.max(0, Math.min(1, intensity));
    if (!this.inited) this.init();
    if (!this.hosts.length) return;
    if (!this.dropSprite) this.buildDropSprite();
    if (!this.running) {
      this.running = true;
      this.hosts.forEach((hd) => { this.resizeHost(hd); this.buildHost(hd); hd.canvas.classList.add('on'); });
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }
  },
  stop() {
    if (!this.running && !this.hosts.some(h => h.drops.length)) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.hosts.forEach((hd) => {
      hd.canvas.classList.remove('on');
      hd.drops = [];
      if (hd.ctx) hd.ctx.clearRect(0, 0, hd.w, hd.h);
    });
  },
  resume() {
    if (!this.running) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  },
  pause() { cancelAnimationFrame(this.raf); },
  /* Builds the wavy centerline of a tail as a short list of {x,y} points
     from the drop's base up to tailLen, each nudged sideways by
     wobbleOffset(). Capped at a handful of points (never stored between
     frames) so it stays essentially free next to the drawImage() calls
     that dominate this loop. */
  tailPath(d, size, tailLen) {
    const steps = 5; /* enough segments to read as a smooth curve, cheap to build every frame */
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const dy = f * (tailLen - size * 0.3) + size * 0.3; /* distance above d.y */
      pts.push({ x: d.x + this.wobbleOffset(d, dy), y: d.y - dy });
    }
    return pts;
  },
  /* Strokes/fills a smooth curve through a small point list using
     quadraticCurveTo with midpoints as control anchors — the standard cheap
     trick for turning a jittered poly-line into a soft continuous curve
     without needing full bezier fitting. */
  strokeThrough(ctx, pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  },
  drawTail(ctx, d, size, tailLen, strength) {
    const path = this.tailPath(d, size, tailLen);
    const top = path[path.length - 1], base = path[0];
    const g = ctx.createLinearGradient(base.x, base.y, top.x, top.y);
    g.addColorStop(0, 'rgba(180,205,235,0)');
    g.addColorStop(0.6, `rgba(190,212,240,${0.16 * strength})`);
    g.addColorStop(1, `rgba(210,228,248,${0.3 * strength})`);
    /* build the wobbly ribbon by walking up one side of the path and back
       down a slightly offset copy of the other, so the tail has real width
       (not just a stroked line) while still following the curve. */
    const half = Math.max(0.6, d.r * 0.42);
    const n = path.length;
    const leftSide = path.map((p, i) => ({ x: p.x - half * (0.5 - 0.15 * (i / (n - 1))), y: p.y }));
    const rightSide = path.map((p, i) => ({ x: p.x + half * (0.35 + 0.1 * (i / (n - 1))), y: p.y })).reverse();
    ctx.fillStyle = g;
    ctx.beginPath();
    this.strokeThrough(ctx, leftSide);
    this.strokeThrough(ctx, rightSide);
    ctx.closePath();
    ctx.fill();
    /* thin bright core streak following the same wobble — refraction highlight */
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * strength})`;
    ctx.lineWidth = Math.max(0.5, d.r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    this.strokeThrough(ctx, path);
    ctx.stroke();
  },
  drawDrop(ctx, d) {
    const size = d.r * 2.6; /* on-screen draw size for the shared sprite */
    /* static "already streaked" drops (frozen mid-slide look, per the
       reference photo) always show a fixed-length tail. */
    if (d.stretch > 0) this.drawTail(ctx, d, size, size * (1 + d.stretch * 0.5), 0.75);
    /* a currently/recently ACTIVELY sliding droplet gets its own animated
       comet tail on top, scaled by how fast it's currently moving. */
    if (d.trail > 0.02) this.drawTail(ctx, d, size, size * (1.6 + d.slideSpeed * 0.02), d.trail);
    ctx.globalAlpha = d.alpha;
    ctx.drawImage(this.dropSprite, d.x - size / 2, d.y - size / 2, size, size);
    ctx.globalAlpha = 1;
  },
  loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    for (const hd of this.hosts) {
      /* off-screen / unloaded cards (SECTION_MANAGER detaches them from the
         document while scrolled far away) cost nothing — skip entirely. */
      if (!hd.canvas.isConnected) continue;
      const ctx = hd.ctx;
      if (!ctx) continue;
      ctx.clearRect(0, 0, hd.w, hd.h);
      for (const d of hd.drops) {
        if (!d.sliding) {
          if (Math.random() < 0.0018) {
            d.sliding = true; d.slideSpeed = 14 + Math.random() * 16; d.slideLife = 0.35 + Math.random() * 0.55; d.trail = 1;
            d.wobbleDist = 0; d.lastWobbleOffset = 0; /* reset the drift tracker for this slide */
          }
        } else {
          d.y += d.slideSpeed * dt;
          d.wobbleDist += d.slideSpeed * dt;
          /* the bead itself drifts sideways as it descends — not just the
             tail behind it — by riding the same wobble curve the tail is
             drawn with, applied as an incremental delta so the drop never
             jumps when the slide starts/stops. Same 2-sine cost as the
             tail, just once per drop per frame. */
          const off = this.wobbleOffset(d, d.wobbleDist);
          d.x += off - d.lastWobbleOffset;
          d.lastWobbleOffset = off;
          d.slideSpeed += 12 * dt; /* gentle acceleration, like gravity on a pane */
          d.slideLife -= dt;
          if (d.slideLife <= 0) d.sliding = false;
        }
        if (!d.sliding && d.trail > 0) d.trail = Math.max(0, d.trail - dt * 3.2); /* fades quickly once it stops */
        if (d.y - d.r > hd.h) { Object.assign(d, this.spawnDrop(hd)); d.y = -d.r; }
        this.drawDrop(ctx, d);
      }
    }
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
  }
};

