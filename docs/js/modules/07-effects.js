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

/* ---------- Rain-on-glass droplet overlay ----------
   A second, foreground canvas that sits *above* the content (unlike FX,
   which sits behind everything) to read as "looking at the weather through
   a wet window pane" — only shown for rain/storm. Design constraints from
   the product ask:
     - content underneath must stay fully readable: no blur, no darkening.
       The canvas is composited with mix-blend-mode: screen (see CSS), so a
       black pixel is fully transparent and only bright highlight pixels can
       ever lighten what's under them — text contrast is never reduced.
     - must not tank FPS on weak devices: droplets are pre-rendered ONCE to
       small offscreen sprite canvases, then each frame just does a handful
       of ctx.drawImage() calls (cheap) instead of re-building gradients per
       particle per frame (what FX's rain/snow do, fine at their scale but
       wasteful here since droplets barely move). Particle count is small
       (≈16-34, scaled by the same rain intensity already computed in
       updateFXIntensity()) and most droplets are near-static, so the loop
       is lighter than the existing ambient rain effect.
     - fully disabled in Eco mode / on detected low-power devices: gated by
       the exact same effectsReduced() check as FX (see applyWeatherTheme
       and applyEffects), and hard-hidden via CSS on [data-perf="eco"/"low"]
       as a second safety net. */
const GlassFX = {
  drops: [], raf: 0, running: false, w: 0, h: 0, dpr: 1, last: 0, intensity: 0.5, sprites: null,
  ensureCanvas() { return el.glassCanvas; },
  buildSprites() {
    /* Three droplet sizes, each pre-rendered once. A droplet sprite is just
       a soft radial highlight (bright center fading to transparent) plus a
       thin brighter rim to fake refraction — no dark pixels at all, so on
       screen-blend it can only ever brighten the page, never obscure it. */
    const sizes = [16, 28, 42];
    this.sprites = sizes.map((s) => {
      const c = document.createElement('canvas');
      c.width = c.height = s * 2;
      const ctx = c.getContext('2d');
      if (!ctx) return c;
      const cx = s, cy = s;
      const g = ctx.createRadialGradient(cx - s * 0.28, cy - s * 0.32, 1, cx, cy, s);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, 'rgba(200,225,255,0.45)');
      g.addColorStop(0.75, 'rgba(170,205,255,0.12)');
      g.addColorStop(1, 'rgba(170,205,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, s, 0, Math.PI * 2);
      ctx.fill();
      /* rim highlight */
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.82, Math.PI * 1.1, Math.PI * 1.85);
      ctx.stroke();
      return c;
    });
  },
  resize() {
    const cvs = this.ensureCanvas();
    if (!cvs) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    cvs.width = this.w * this.dpr;
    cvs.height = this.h * this.dpr;
    cvs.style.width = this.w + 'px';
    cvs.style.height = this.h + 'px';
    const ctx = cvs.getContext('2d');
    if (ctx) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.running) this.build();
  },
  build() {
    if (!this.sprites) this.buildSprites();
    const n = Math.max(10, Math.min(36, Math.round(16 + this.intensity * 24)));
    this.drops = [];
    for (let i = 0; i < n; i++) {
      const sizeIdx = Math.random() < 0.55 ? 0 : (Math.random() < 0.7 ? 1 : 2);
      this.drops.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        size: sizeIdx,
        /* most drops just sit there and creep very slowly (surface tension);
           occasionally one "runs" — accelerates and leaves a short trail. */
        creep: 2 + Math.random() * 5,
        running: false,
        runSpeed: 0,
        trail: 0,
        wobble: Math.random() * Math.PI * 2,
        alpha: 0.5 + Math.random() * 0.5
      });
    }
  },
  setIntensity(val) {
    this.intensity = Math.max(0, Math.min(1, val || 0.5));
    if (this.running) this.build();
  },
  start(intensity) {
    if (intensity != null) this.intensity = Math.max(0, Math.min(1, intensity));
    const cvs = this.ensureCanvas();
    if (!cvs) return;
    if (!this.running) {
      this.running = true;
      this.resize();
      this.build();
      cvs.classList.add('on');
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }
  },
  stop() {
    if (!this.running && this.drops.length === 0) return;
    this.running = false;
    this.drops = [];
    cancelAnimationFrame(this.raf);
    const cvs = el.glassCanvas;
    if (cvs) {
      cvs.classList.remove('on');
      const ctx = cvs.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.w, this.h);
    }
  },
  resume() {
    if (!this.running) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  },
  pause() { cancelAnimationFrame(this.raf); },
  loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const cvs = el.glassCanvas;
    const ctx = cvs && cvs.getContext('2d');
    if (!ctx) { this.raf = requestAnimationFrame((tt) => this.loop(tt)); return; }
    ctx.clearRect(0, 0, this.w, this.h);
    const sprite0 = this.sprites[0];
    const spriteSizes = [16, 28, 42];
    for (const d of this.drops) {
      /* rare trigger: a resting droplet starts sliding down the pane */
      if (!d.running && Math.random() < 0.0025) { d.running = true; d.runSpeed = 60 + Math.random() * 90; d.trail = 1; }
      if (d.running) {
        d.y += d.runSpeed * dt;
        d.runSpeed += 40 * dt; /* gentle acceleration, like gravity on a pane */
        d.trail = Math.min(1, d.trail + dt * 2);
      } else {
        d.y += d.creep * dt;
        d.wobble += dt * 0.6;
        d.x += Math.sin(d.wobble) * 0.6 * dt;
      }
      if (d.y - spriteSizes[d.size] > this.h) {
        d.y = -spriteSizes[d.size];
        d.x = Math.random() * this.w;
        d.running = false; d.trail = 0; d.runSpeed = 0;
      }
      const sp = this.sprites[d.size] || sprite0;
      const s = spriteSizes[d.size];
      /* trail: a soft vertical streak above a running droplet */
      if (d.running && d.trail > 0) {
        const trailLen = 24 + s * 1.4;
        const g = ctx.createLinearGradient(d.x, d.y - trailLen, d.x, d.y);
        g.addColorStop(0, 'rgba(200,225,255,0)');
        g.addColorStop(1, `rgba(210,230,255,${0.22 * d.trail})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1.2, s * 0.09);
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - trailLen);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }
      ctx.globalAlpha = d.alpha;
      ctx.drawImage(sp, d.x - s, d.y - s, s * 2, s * 2);
      ctx.globalAlpha = 1;
    }
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
  }
};

