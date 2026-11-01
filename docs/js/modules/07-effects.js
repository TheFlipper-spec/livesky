/* ============================================================
   LiveSky Weather Pro — VISUAL EFFECTS & THEME (layer 2)
   ------------------------------------------------------------
   Weather-driven theme/background, canvas FX, storm flashes and
   the GlassFX layer. Consumes: kernel (state).
   ============================================================ */
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
  /* Custom themes ride the adaptive pipeline (weather FX + blobs) but keep
     the user's own page background and — unless weather-tint is on — accents. */
  const isCustomTheme = state.theme === 'custom' && typeof CustomTheme !== 'undefined';
  const mode = isCustomTheme ? 'adaptive' : state.theme;
  const customFixedAccents = isCustomTheme && !CustomTheme.weatherTint();

  if (mode === 'light') {
    setBackground('linear-gradient(180deg, #e8f3fd 0%, #f7fafd 100%)', 'light');
    root.style.setProperty('--accent', '#7c3aed');
    root.style.setProperty('--accent-2', '#06b6d4');
    ['--blob-1', '--blob-2', '--blob-3'].forEach((v, k) => root.style.removeProperty(v));
    root.style.removeProperty('--grad-logo');
    FX.stop(); stopStorm();
    state.accent = '#7c3aed'; state.accent2 = '#06b6d4';
    duskInfo = null; updateDuskBlend();
    return;
  }
  if (mode === 'dark') {
    setBackground('linear-gradient(180deg, #070b16 0%, #04060d 100%)', 'dark');
    root.style.setProperty('--accent', '#38bdf8');
    root.style.setProperty('--accent-2', '#818cf8');
    ['--blob-1', '--blob-2', '--blob-3'].forEach(v => root.style.removeProperty(v));
    root.style.removeProperty('--grad-logo');
    FX.stop(); stopStorm();
    state.accent = '#38bdf8'; state.accent2 = '#818cf8';
    duskInfo = null; updateDuskBlend();
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
  if (isCustomTheme) fadeBgLayers();
  else setBackground((BGS[type] || BGS.cloudy)[time], `${type}-${time}`);
  if (customFixedAccents) CustomTheme.applyAccents();
  /* dusk glide source data (adaptive only — fixed/custom modes hide the veil) */
  if (isCustomTheme) { duskInfo = null; }
  else {
    const dAcc = ACCENTS[type] || ACCENTS.cloudy;
    const dBlobs = BLOBS[type] || BLOBS.cloudy;
    const dLogo = LOGOS[type] || LOGOS.cloudy;
    duskInfo = {
      nightBg: (BGS[type] || BGS.cloudy).night,
      dayAcc: dAcc.day, nightAcc: dAcc.night,
      dayBlobs: dBlobs.day, nightBlobs: dBlobs.night,
      dayLogo: dLogo.day, nightLogo: dLogo.night
    };
    const veil = document.getElementById('dusk-veil');
    if (veil && veil._duskBg !== duskInfo.nightBg) {
      veil._duskBg = duskInfo.nightBg;
      veil.style.background = duskInfo.nightBg;
    }
  }

  let fx = null;
  if (type === 'rain' || type === 'storm') fx = 'rain';
  else if (type === 'snow') fx = 'snow';
  else if (type === 'clear' && night) fx = 'stars';
  else if (type === 'clear') fx = null;
  else if (type === 'fog') fx = 'fog';
  else if (type === 'cloudy') fx = 'clouds';

  if (effectsReduced()) { FX.stop(); stopStorm(); }
  else {
    FX.start(fx);
    if (type === 'storm') startStorm(); else stopStorm();
  }
  /* ambient life: night fireflies + the after-rain rainbow */
  const liveCode = typeof currentWeatherCodeLive === 'function' ? currentWeatherCodeLive() : code;
  if (effectsReduced()) { FX.setOverlay(null); updateRainbowAftermath(null, false); }
  else {
    FX.setOverlay(!night && (liveCode === 0 || liveCode === 1 || liveCode === 2) ? 'fireflies' : null);
    updateRainbowAftermath(liveCode, !night);
  }
  updateDuskBlend();
}

/* Fade out the weather background layers so a custom theme's own page
   gradient (painted on <body> by the studio) shows through. */
function fadeBgLayers() {
  if (lastBgKey === 'custom-clear') return;
  lastBgKey = 'custom-clear';
  [el.bg1, el.bg2].forEach(l => { if (l) l.classList.remove('active'); });
}

/* Rainbow aftermath: liquid-precipitation codes whose end may reveal a bow. */
const RAINBOW_RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
const RAINBOW_AFTER_MS = 20 * 60 * 1000;
let rainbowHideTimer = null;
/* Tracks rain→clear transitions and shows the rainbow arc for a while after
   the rain ends (daytime + clearing sky only — it needs the sun). */
function updateRainbowAftermath(liveCode, day) {
  const bow = document.getElementById('rainbow');
  const rainy = liveCode != null && RAINBOW_RAIN_CODES.includes(liveCode);
  if (rainy) {
    state._wasRainy = true;
    state._rainEndedAt = 0;
    try { store.set('livesky:rain_ended_at', 0); } catch (e) { /* ignore */ }
    if (bow) bow.classList.remove('show');
    return;
  }
  let endedAt = state._rainEndedAt || 0;
  if (state._wasRainy) {
    state._wasRainy = false;
    endedAt = Date.now();
    state._rainEndedAt = endedAt;
    try { store.set('livesky:rain_ended_at', endedAt); } catch (e) { /* ignore */ }
  } else if (!endedAt) {
    try { endedAt = store.get('livesky:rain_ended_at', 0) || 0; } catch (e) { endedAt = 0; }
    state._rainEndedAt = endedAt;
  }
  const fresh = endedAt && (Date.now() - endedAt < RAINBOW_AFTER_MS);
  const ok = !!fresh && !!day &&
    (liveCode === 0 || liveCode === 1 || liveCode === 2 || liveCode === 3) && !effectsReduced();
  if (bow) bow.classList.toggle('show', ok);
  clearTimeout(rainbowHideTimer);
  if (ok) {
    rainbowHideTimer = setTimeout(() => {
      const b = document.getElementById('rainbow');
      if (b) b.classList.remove('show');
    }, RAINBOW_AFTER_MS - (Date.now() - endedAt) + 500);
  }
}

/* ---------- dusk glide: day melts into night over the sunset/sunrise hour -----
   Around sunrise/sunset (±30 min, cosine-eased) a veil carrying the NIGHT
   gradient fades over the base background, while accents + aurora blobs lerp
   between their day/night values. Outside the windows everything snaps to the
   exact endpoint values, so non-transition rendering is pixel-identical. */
const DUSK_HALF_MIN = 30;
let duskInfo = null;     /* { nightBg, dayAcc, nightAcc, dayBlobs, nightBlobs, dayLogo, nightLogo } */
let duskSnapped = false; /* endpoint values are already exact for the current zone */
let duskLogoSide = '';   /* logo gradient flips once, at the glide midpoint */
let duskZone = '';       /* 'day' | 'dusk' | 'night' — repaints the chart on change */

/* 0 = full day … 1 = full night, eased across a one-hour window. */
function duskFactor() {
  try {
    if (!state.weather) return isDayNow() ? 0 : 1;
    const d = state.weather.daily;
    const sr = minOfDay(getVal(d, 'sunrise', state.todayIdx));
    const ss = minOfDay(getVal(d, 'sunset', state.todayIdx));
    if (!sr || !ss || ss <= sr) return isDayNow() ? 0 : 1;
    const now = tzNow(state.tz);
    const nowMin = now.hour * 60 + now.minute;
    const DAY = 1440, W = DUSK_HALF_MIN * 2;
    const since = (a, b) => (a - b + DAY) % DAY;
    const inWindow = (delta) => {
      if (delta <= DUSK_HALF_MIN) return delta + DUSK_HALF_MIN;
      if (delta >= DAY - DUSK_HALF_MIN) return delta - (DAY - DUSK_HALF_MIN);
      return -1;
    };
    const xSet = inWindow(since(nowMin, ss));
    if (xSet >= 0) return 0.5 - 0.5 * Math.cos(Math.PI * xSet / W); /* day → night */
    const xRise = inWindow(since(nowMin, sr));
    if (xRise >= 0) return 0.5 + 0.5 * Math.cos(Math.PI * xRise / W); /* night → day */
    return isDayNow() ? 0 : 1;
  } catch (e) {
    return isDayNow() ? 0 : 1;
  }
}
function duskLerp(a, b, f) { return Math.round(a + (b - a) * f); }
function duskMixHex(h1, h2, f) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const A = p(h1), B = p(h2);
  return '#' + A.map((v, i) => duskLerp(v, B[i], f).toString(16).padStart(2, '0')).join('');
}
function duskMixRgba(r1, r2, f) {
  const p = (st) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(st || '');
    return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : [0, 0, 0, 0];
  };
  const A = p(r1), B = p(r2);
  return `rgba(${duskLerp(A[0], B[0], f)}, ${duskLerp(A[1], B[1], f)}, ${duskLerp(A[2], B[2], f)}, ${(A[3] + (B[3] - A[3]) * f).toFixed(3)})`;
}
/* Cheap per-tick updater: veil opacity every 15s (+16s CSS glide between
   ticks), lerped accents/blobs inside the window, exact snaps outside it. */
function updateDuskBlend() {
  const veil = document.getElementById('dusk-veil');
  if (!veil) return;
  if (!duskInfo || state.theme !== 'adaptive' || !state.weather) {
    if (veil.style.opacity !== '0' && veil.style.opacity !== '') veil.style.opacity = '0';
    duskSnapped = false; duskZone = ''; duskLogoSide = '';
    return;
  }
  const f = Math.max(0, Math.min(1, duskFactor()));
  veil.style.opacity = f.toFixed(3);
  const root = document.documentElement;
  const di = duskInfo;
  const zone = f <= 0.001 ? 'day' : f >= 0.999 ? 'night' : 'dusk';
  if (zone !== duskZone) {
    duskZone = zone;
    duskSnapped = false;
    /* the chart snapshots accents at render time — repaint it when the glide
       starts/ends so its gradient never sits an hour behind the sky */
    if (typeof SECTION_MANAGER !== 'undefined' && state.weather) {
      try { SECTION_MANAGER.renderSection('forecast'); } catch (e) { /* ignore */ }
    }
  }
  if (zone === 'dusk') {
    const a1 = duskMixHex(di.dayAcc[0], di.nightAcc[0], f);
    const a2 = duskMixHex(di.dayAcc[1], di.nightAcc[1], f);
    root.style.setProperty('--accent', a1);
    root.style.setProperty('--accent-2', a2);
    for (let i = 0; i < 3; i++) root.style.setProperty('--blob-' + (i + 1), duskMixRgba(di.dayBlobs[i], di.nightBlobs[i], f));
    const side = f < 0.5 ? 'day' : 'night';
    if (side !== duskLogoSide) { duskLogoSide = side; root.style.setProperty('--grad-logo', side === 'day' ? di.dayLogo : di.nightLogo); }
    state.accent = a1; state.accent2 = a2;
  } else if (!duskSnapped) {
    duskSnapped = true;
    const night = zone === 'night';
    const acc = night ? di.nightAcc : di.dayAcc;
    root.style.setProperty('--accent', acc[0]);
    root.style.setProperty('--accent-2', acc[1]);
    const blobs = night ? di.nightBlobs : di.dayBlobs;
    for (let i = 0; i < 3; i++) root.style.setProperty('--blob-' + (i + 1), blobs[i]);
    duskLogoSide = night ? 'night' : 'day';
    root.style.setProperty('--grad-logo', night ? di.nightLogo : di.dayLogo);
    state.accent = acc[0]; state.accent2 = acc[1];
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
  overlay: null, op: [], _fly: null,
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
    if (this.overlay === 'fireflies') this.buildFireflies();
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
    this.overlay = null;
    this.op = [];
    this.running = false;
    cancelAnimationFrame(this.raf);
    const ctx = el.fxCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.w, this.h);
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
    if (!ctx) { this.running = false; return; }
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
    if (this.overlay === 'fireflies' && this.op.length) this.drawFireflies(ctx, t, dt);
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
  },
  /* ---- ambient overlay: fireflies drift above the base kind ---- */
  setOverlay(kind) {
    if (kind && effectsReduced()) kind = null;
    if (this.overlay === kind) return;
    this.overlay = kind;
    this.op = [];
    if (kind === 'fireflies') {
      if (!this.w) { try { this.resize(); } catch (e) { /* ignore */ } }
      this.buildFireflies();
      if (!this.running) {
        this.running = true;
        this.last = performance.now();
        this.raf = requestAnimationFrame((t) => this.loop(t));
      }
    }
  },
  buildFireflies() {
    this.op = [];
    const w = this.w || window.innerWidth, h = this.h || window.innerHeight;
    const n = Math.max(10, Math.min(24, Math.round(w / 56)));
    for (let i = 0; i < n; i++) {
      this.op.push({
        x: Math.random() * w, y: h * (0.35 + Math.random() * 0.6),
        r: 5 + Math.random() * 6,
        ph: Math.random() * Math.PI * 2,
        blink: 0.22 + Math.random() * 0.4,
        drift: 3 + Math.random() * 7,
        rise: 1.5 + Math.random() * 3.5
      });
    }
  },
  /* Pre-rendered glow sprite: one drawImage per firefly, no shadowBlur. */
  fireflySprite() {
    if (this._fly) return this._fly;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 246, 200, 1)');
    grad.addColorStop(0.25, 'rgba(253, 230, 138, 0.85)');
    grad.addColorStop(0.6, 'rgba(190, 242, 100, 0.25)');
    grad.addColorStop(1, 'rgba(190, 242, 100, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this._fly = c;
    return c;
  },
  drawFireflies(ctx, t, dt) {
    const spr = this.fireflySprite();
    if (!spr) return;
    const w = this.w, h = this.h, sec = t / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const still = motionReduce;
    for (const p of this.op) {
      if (!still) {
        p.x += Math.sin(sec * 0.5 + p.ph) * p.drift * dt;
        p.y -= p.rise * dt;
        if (p.y < h * 0.3) { p.y = h * (0.85 + Math.random() * 0.12); p.x = Math.random() * w; }
        if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      }
      /* faint lantern breathing: dim, slow, never a sharp flash */
      const pulse = still ? 0.4 : Math.sin(sec * p.blink * 2 + p.ph * 3);
      const glow = 0.10 + 0.42 * Math.pow(Math.max(0, pulse), 2);
      if (glow < 0.04) continue;
      const s = p.r * (0.6 + glow * 0.5);
      ctx.globalAlpha = Math.min(0.55, glow);
      ctx.drawImage(spr, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
};

/* GlassFX stub — rain-on-glass droplet effect removed; kept as no-ops so
   existing call sites (lifecycle, bootstrap) don't need changes. */
const GlassFX = {
  running: false, inited: true,
  init() {}, start() {}, stop() {}, resize() {}, resume() {}, pause() {},
  setIntensity() {}
};
