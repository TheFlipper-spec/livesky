/* ============================================================
   LiveSky Weather Pro — THEME STUDIO PRO (layer 3, eager)
   ------------------------------------------------------------
   Custom user themes + the visual builder:
     • `CustomTheme` — storage (multiple named themes), active-theme
       tracking, and application via inline CSS variables that override
       the design tokens (works on top of either light or dark base —
       `data-theme` keeps carrying the base so every existing
       `[data-theme="light"]` component override keeps applying).
     • `openThemeStudio` / `closeThemeStudio` — the builder modal with a
       live mini-preview of the site, weather scenarios, contrast checks,
       manual HEX inputs, export/import, and deep granular controls.
   Consumes: kernel (store/state/t), settings (setTheme/applyTheme,
   trapFocus, applyTranslations), effects (applyWeatherTheme re-asserts
   custom accents unless weather-tint is on), data (toast).
   Loaded after 10-bootstrap.js; calls into other modules happen only
   at runtime, never at load, so dependency order stays safe.
   ============================================================ */

/* ---------------- color helpers (self-contained) ---------------- */
function studioHex(h) {
  h = String(h || '').trim();
  if (/^#[0-9a-fA-F]{3}$/.test(h)) return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toLowerCase();
  return '#38bdf8';
}
function studioRgb(hex) {
  hex = studioHex(hex);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function studioRgba(hex, a) {
  const c = studioRgb(hex);
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
}
function studioMix(h1, h2, w) {
  const a = studioRgb(h1), b = studioRgb(h2);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * w));
  return '#' + m.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function studioLum(hex) {
  const c = studioRgb(hex).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function studioContrast(c1, c2) {
  const l1 = studioLum(c1), l2 = studioLum(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function studioHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)]
    .map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

/* ---------------- theme model ---------------- */
const STUDIO_STORE_KEY = 'livesky:custom_themes';
/* Every CSS variable the studio manages — cleared when leaving custom mode
   so the built-in themes render exactly as authored. */
const STUDIO_VARS = [
  '--bg-0', '--bg-1', '--surface', '--surface-2', '--surface-3', '--surface-hover', '--surface-input', '--menu-bg',
  '--stroke', '--stroke-strong',
  '--text-1', '--text-2', '--text-3',
  '--accent', '--accent-2', '--accent-soft', '--accent-contrast', '--stroke-accent', '--glow-accent', '--grad-logo',
  '--btn-bg', '--btn-text',
  '--icon-accent',
  '--chart-line', '--chart-fill',
  '--blob-1', '--blob-2', '--blob-3',
  '--glass-blur', '--radius-lg', '--radius-md', '--radius-sm',
  '--shadow-card', '--shadow-pop', '--aurora-o'
];

const SWATCH_PALETTE = ['#2563eb', '#0284c7', '#059669', '#d97706', '#e11d48', '#dc2626', '#0d9488', '#4f46e5', '#475569', '#ffffff', '#0f172a'];

function studioDefaults(base) {
  const dark = base !== 'light';
  return dark ? {
    base: 'dark', bg0: '#05070f', bg1: '#0a1020',
    card: '#0d1528', cardAlpha: 55,
    strokeColor: '#94a3b8', strokeAlpha: 13,
    text1: '#f4f7fb', text2: '#c7d2e0', text3: '#8ca0b5',
    accent: '#38bdf8', accent2: '#818cf8', weatherTint: false,
    btnBg: '#38bdf8', btnText: '#04101f',
    iconAccent: '#38bdf8',
    chartLine: '#38bdf8', chartFill: '#38bdf8',
    blur: 18, radius: 28, shadow: 70, aurora: 90
  } : {
    base: 'light', bg0: '#eef4fb', bg1: '#f7fafd',
    card: '#ffffff', cardAlpha: 72,
    strokeColor: '#0f172a', strokeAlpha: 9,
    text1: '#16202f', text2: '#33415a', text3: '#64748b',
    accent: '#2563eb', accent2: '#0284c7', weatherTint: false,
    btnBg: '#2563eb', btnText: '#ffffff',
    iconAccent: '#2563eb',
    chartLine: '#2563eb', chartFill: '#2563eb',
    blur: 18, radius: 28, shadow: 60, aurora: 55
  };
}
const STUDIO_PRESETS = [
  { name: 'Arctic Sky', base: 'dark', bg0: '#05070f', bg1: '#0a1020', card: '#0d1528', cardAlpha: 55, strokeColor: '#94a3b8', strokeAlpha: 13, text1: '#f4f7fb', text2: '#c7d2e0', text3: '#8ca0b5', accent: '#38bdf8', accent2: '#0284c7', btnBg: '#38bdf8', btnText: '#04101f', iconAccent: '#38bdf8', chartLine: '#38bdf8' },
  { name: 'Sunset Rose', base: 'dark', bg0: '#170b12', bg1: '#251016', card: '#2b1420', cardAlpha: 60, strokeColor: '#fb7185', strokeAlpha: 16, text1: '#fff5f0', text2: '#e8c4b8', text3: '#a07a70', accent: '#fb7185', accent2: '#fbbf24', btnBg: '#fb7185', btnText: '#251016', iconAccent: '#fbbf24', chartLine: '#fb7185' },
  { name: 'Emerald Forest', base: 'dark', bg0: '#04120c', bg1: '#07231a', card: '#0a2a1e', cardAlpha: 60, strokeColor: '#34d399', strokeAlpha: 14, text1: '#eefbf3', text2: '#bfe3cf', text3: '#7ba58f', accent: '#34d399', accent2: '#10b981', btnBg: '#34d399', btnText: '#04120c', iconAccent: '#34d399', chartLine: '#34d399' },
  { name: 'Pure Daylight', base: 'light', bg0: '#eef4fb', bg1: '#f7fafd', card: '#ffffff', cardAlpha: 72, strokeColor: '#0f172a', strokeAlpha: 9, text1: '#16202f', text2: '#33415a', text3: '#64748b', accent: '#2563eb', accent2: '#0284c7', btnBg: '#2563eb', btnText: '#ffffff', iconAccent: '#2563eb', chartLine: '#2563eb' },
  { name: 'Warm Sand', base: 'light', bg0: '#faf6f0', bg1: '#fdfbf7', card: '#ffffff', cardAlpha: 80, strokeColor: '#78350f', strokeAlpha: 10, text1: '#292524', text2: '#57534e', text3: '#78716c', accent: '#d97706', accent2: '#ea580c', btnBg: '#d97706', btnText: '#ffffff', iconAccent: '#d97706', chartLine: '#d97706' },
  { name: 'Alpine Slate', base: 'light', bg0: '#f1f5f9', bg1: '#f8fafc', card: '#ffffff', cardAlpha: 82, strokeColor: '#0f172a', strokeAlpha: 10, text1: '#0f172a', text2: '#334155', text3: '#64748b', accent: '#059669', accent2: '#0d9488', btnBg: '#059669', btnText: '#ffffff', iconAccent: '#059669', chartLine: '#059669' }
];
function studioNewId() {
  return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}
function studioClone(o) { return JSON.parse(JSON.stringify(o)); }
function studioNum(v, fb, lo, hi) {
  v = Number(v);
  if (!isFinite(v)) return fb;
  return Math.max(lo, Math.min(hi, v));
}
/* Fill gaps in a stored/preset theme so old records never break apply(). */
function studioNormalize(raw) {
  const base = raw && raw.base === 'light' ? 'light' : 'dark';
  const d = studioDefaults(base);
  const th = Object.assign(d, raw || {});
  th.id = typeof th.id === 'string' && th.id ? th.id : studioNewId();
  th.name = typeof th.name === 'string' && th.name.trim() ? th.name.slice(0, 40) : 'Custom';
  th.base = base;
  ['bg0', 'bg1', 'card', 'strokeColor', 'text1', 'text2', 'text3', 'accent', 'accent2', 'btnBg', 'btnText', 'iconAccent', 'chartLine', 'chartFill'].forEach(k => {
    if (th[k]) th[k] = studioHex(th[k]);
  });
  th.cardAlpha = studioNum(th.cardAlpha, d.cardAlpha, 5, 100);
  th.strokeAlpha = studioNum(th.strokeAlpha, d.strokeAlpha, 0, 100);
  th.blur = studioNum(th.blur, 18, 0, 30);
  th.radius = studioNum(th.radius, 28, 8, 32);
  th.shadow = studioNum(th.shadow, 70, 0, 100);
  th.aurora = studioNum(th.aurora, 90, 0, 100);
  th.weatherTint = Boolean(raw && raw.weatherTint);
  return th;
}

const CustomTheme = {
  list: null, activeId: null, draft: null, _saveTimer: null,

  ensureLoaded() {
    if (this.list) return;
    let rec = null;
    try { rec = store.get(STUDIO_STORE_KEY, null); } catch (e) { rec = null; }
    let list = rec && Array.isArray(rec.list) ? rec.list : [];
    list = list.map(studioNormalize);
    if (!list.length) {
      const seed = studioNormalize({ name: (typeof t === 'function' ? t('theme_custom') : 'Custom') });
      list = [seed];
    }
    this.list = list;
    const savedActive = rec && (rec.activeId || rec.active);
    this.activeId = (savedActive && list.some(x => x.id === savedActive)) ? savedActive : list[0].id;
    this.draft = studioClone(this.getActive());
  },
  persist() {
    try { store.set(STUDIO_STORE_KEY, { v: 2, list: this.list, activeId: this.activeId }); } catch (e) { /* ignore */ }
  },
  saveSoon() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), 350);
  },
  saveNow() {
    clearTimeout(this._saveTimer);
    this.ensureLoaded();
    const i = this.list.findIndex(x => x.id === this.activeId);
    if (i >= 0 && this.draft) this.list[i] = studioClone(this.draft);
    this.persist();
  },
  getActive() {
    this.ensureLoaded();
    return this.list.find(x => x.id === this.activeId) || this.list[0];
  },
  base() {
    this.ensureLoaded();
    const src = this.draft || this.getActive();
    return src && src.base === 'light' ? 'light' : 'dark';
  },
  isLight() { return this.base() === 'light'; },
  weatherTint() {
    this.ensureLoaded();
    const src = this.draft || this.getActive();
    return Boolean(src && src.weatherTint);
  },

  /* Push a theme onto the page as inline custom properties */
  apply(th) {
    th = studioNormalize(th || this.draft || this.getActive());
    const root = document.documentElement;
    const light = th.base === 'light';
    root.dataset.theme = th.base;
    root.dataset.custom = '1';
    if (document.body) {
      document.body.dataset.theme = th.base;
      document.body.dataset.custom = '1';
    }
    const set = (k, v) => root.style.setProperty(k, v);

    set('--bg-0', th.bg0);
    set('--bg-1', th.bg1);
    const bgGrad = `linear-gradient(180deg, ${th.bg0} 0%, ${th.bg1} 100%)`;
    try {
      document.body.style.background = bgGrad;
      const bgC = document.getElementById('bg-container');
      if (bgC) bgC.style.background = bgGrad;
      if (typeof el !== 'undefined') {
        if (el.bg1) el.bg1.style.background = bgGrad;
        if (el.bg2) el.bg2.style.background = bgGrad;
      }
    } catch (e) { /* ignore */ }
    const a = th.cardAlpha / 100;
    set('--surface', studioRgba(th.card, a));
    const tile = studioMix(th.card, th.text1, 0.12);
    set('--surface-2', studioRgba(tile, Math.max(0.05, Math.min(0.55, a * 0.45))));
    set('--surface-3', studioRgba(tile, Math.max(0.08, Math.min(0.75, a * 0.7))));
    set('--surface-hover', studioRgba(tile, Math.max(0.12, Math.min(0.9, a * 0.85 + 0.06))));
    set('--surface-input', studioRgba(th.card, Math.min(1, a + 0.22)));
    set('--menu-bg', studioRgba(studioMix(th.bg1, th.card, 0.55), 0.96));

    // Custom borders
    const sColor = th.strokeColor || (light ? '#0f172a' : '#94a3b8');
    const sA = (th.strokeAlpha != null ? th.strokeAlpha : (light ? 9 : 13)) / 100;
    set('--stroke', studioRgba(sColor, sA));
    set('--stroke-strong', studioRgba(sColor, Math.min(1, sA * 2)));

    // Custom typography
    set('--text-1', th.text1);
    set('--text-2', th.text2);
    set('--text-3', th.text3);

    // Custom buttons & actions
    const btnBg = th.btnBg || th.accent;
    set('--btn-bg', btnBg);
    set('--btn-text', th.btnText || (studioLum(btnBg) > 0.45 ? '#04101f' : '#ffffff'));

    // Custom icons
    set('--icon-accent', th.iconAccent || th.accent);

    // Custom charts
    const cLine = th.chartLine || th.accent;
    set('--chart-line', cLine);
    set('--chart-fill', th.chartFill ? studioRgba(th.chartFill, 0.18) : studioRgba(cLine, 0.14));

    this.applyAccents(th);
    set('--glass-blur', `${Math.round(th.blur)}px`);
    const r = Math.round(th.radius);
    set('--radius-lg', `${r}px`);
    set('--radius-md', `${Math.max(6, Math.round(r * 0.72))}px`);
    set('--radius-sm', `${Math.max(4, Math.round(r * 0.5))}px`);
    const sa = (th.shadow / 100 * (light ? 0.35 : 0.85)).toFixed(3);
    const ink = light ? '30, 41, 59' : '1, 4, 14';
    set('--shadow-card', `0 24px 70px -28px rgba(${ink}, ${sa})`);
    set('--shadow-pop', `0 18px 50px -12px rgba(${ink}, ${sa})`);
    set('--aurora-o', (th.aurora / 100 * (light ? 0.55 : 0.9)).toFixed(2));
    try { studioRenderDiag(); } catch (e) { /* studio may be closed */ }
    try {
      if (typeof state !== 'undefined' && state.weather) {
        if (typeof renderSunArc === 'function') renderSunArc();
        if (typeof renderAir === 'function') renderAir();
      }
    } catch (e) { /* ignore */ }
    return th;
  },

  applyAccents(th) {
    th = th || this.draft || this.getActive();
    const root = document.documentElement;
    const set = (k, v) => root.style.setProperty(k, v);
    set('--accent', th.accent);
    set('--accent-2', th.accent2);
    set('--accent-soft', studioRgba(th.accent, 0.13));
    set('--stroke-accent', studioRgba(th.accent, 0.4));
    set('--glow-accent', studioRgba(th.accent, 0.35));
    set('--grad-logo', `linear-gradient(135deg, ${th.accent}, ${th.accent2})`);
    set('--accent-contrast', studioLum(th.accent) > 0.45 ? '#04101f' : '#ffffff');
    set('--blob-1', studioRgba(th.accent, 0.16));
    set('--blob-2', studioRgba(th.accent2, 0.12));
    set('--blob-3', studioRgba(studioMix(th.accent, th.accent2, 0.5), 0.10));
    try { state.accent = th.accent; state.accent2 = th.accent2; } catch (e) { /* ignore */ }
  },
  applyActive() {
    this.ensureLoaded();
    this.draft = studioClone(this.getActive());
    const applied = this.apply(this.draft);
    try { console.info(`[LiveSky] custom theme applied: ${applied.name} (${applied.base})`); } catch (e) { /* ignore */ }
    return applied;
  },
  clear() {
    const root = document.documentElement;
    STUDIO_VARS.forEach(k => root.style.removeProperty(k));
    root.removeAttribute('data-custom');
    try {
      document.body.style.removeProperty('background');
      document.body.removeAttribute('data-custom');
      const bgC = document.getElementById('bg-container');
      if (bgC) bgC.style.removeProperty('background');
      if (typeof lastBgKey !== 'undefined') lastBgKey = '';
    } catch (e) { /* ignore */ }
    root.dataset.theme = state.theme;
    if (document.body) document.body.dataset.theme = state.theme;
  },

  setActive(id) {
    this.saveNow();
    if (!this.list.some(x => x.id === id)) return;
    this.activeId = id;
    this.draft = studioClone(this.getActive());
    this.apply(this.draft);
    this.persist();
  },
  create(source, name) {
    this.saveNow();
    const th = studioNormalize(Object.assign({}, source || studioDefaults(this.base())));
    th.id = studioNewId();
    th.name = (name || `${typeof t === 'function' ? t('theme_custom') : 'Custom'} ${this.list.length + 1}`).slice(0, 40);
    this.list.push(th);
    this.activeId = th.id;
    this.draft = studioClone(th);
    this.apply(this.draft);
    this.persist();
    return th;
  },
  duplicate() {
    const src = this.draft || this.getActive();
    return this.create(src, `${src.name} +`);
  },
  removeActive() {
    this.ensureLoaded();
    if (this.list.length <= 1) return false;
    this.list = this.list.filter(x => x.id !== this.activeId);
    this.activeId = this.list[0].id;
    this.draft = studioClone(this.getActive());
    this.apply(this.draft);
    this.persist();
    return true;
  },
  resetDraft() {
    this.ensureLoaded();
    const keep = { id: this.draft.id, name: this.draft.name };
    this.draft = Object.assign(studioNormalize({ base: this.draft.base }), keep);
    this.apply(this.draft);
    this.saveNow();
  },
  randomize() {
    this.ensureLoaded();
    const d = this.draft;
    const light = d.base === 'light';
    const h = Math.floor(Math.random() * 360);
    d.accent = studioHsl(h, light ? 0.75 : 0.85, light ? 0.5 : 0.65);
    d.accent2 = studioHsl(h + 45 + Math.random() * 60, light ? 0.7 : 0.8, light ? 0.45 : 0.62);
    d.btnBg = d.accent;
    d.btnText = studioLum(d.btnBg) > 0.45 ? '#04101f' : '#ffffff';
    d.iconAccent = d.accent;
    d.chartLine = d.accent;
    d.chartFill = d.accent;
    d.bg0 = studioHsl(h, light ? 0.35 : 0.45, light ? 0.94 : 0.05);
    d.bg1 = studioHsl((h + 25) % 360, light ? 0.3 : 0.5, light ? 0.96 : 0.09);
    d.card = light ? '#ffffff' : studioHsl(h, 0.4, 0.1);
    d.cardAlpha = light ? 75 : 58;
    if (light) { d.text1 = '#16202f'; d.text2 = '#33415a'; d.text3 = '#8b98ab'; d.strokeColor = '#0f172a'; d.strokeAlpha = 9; }
    else { d.text1 = '#f4f7fb'; d.text2 = '#c7d2e0'; d.text3 = '#8ca0b5'; d.strokeColor = '#94a3b8'; d.strokeAlpha = 13; }
    this.apply(d);
    this.saveNow();
  },
  exportActive() {
    const th = this.draft || this.getActive();
    return JSON.stringify(th, null, 2);
  },
  importTheme(rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object') return null;
      const th = studioNormalize(parsed);
      th.id = studioNewId();
      th.name = (th.name || 'Imported').slice(0, 40);
      this.list.push(th);
      this.activeId = th.id;
      this.draft = studioClone(th);
      this.apply(this.draft);
      this.persist();
      return th;
    } catch (e) {
      return null;
    }
  }
};

/* ---------------- studio modal ---------------- */
let studioEl = null, studioBound = false, studioChartT = null, studioScenario = 'clear';

function studioColorRow(key, labelKey, withSwatches) {
  const swatchesHtml = withSwatches ? `
    <div class="st-swatches" data-swatch-for="${key}">
      ${SWATCH_PALETTE.map(c => `<button type="button" class="st-swatch" style="background:${c}" data-color="${c}" title="${c}"></button>`).join('')}
    </div>` : '';
  return `<div class="st-row">
    <label data-translate="${labelKey}"></label>
    <span class="st-color">
      <input type="color" data-k="${key}" value="#38bdf8" aria-label="${key}">
      <input type="text" class="st-hex" data-hex-input="${key}" maxlength="7" spellcheck="false" aria-label="HEX code">
    </span>
  </div>${swatchesHtml}`;
}

function studioRangeRow(key, labelKey, min, max, unit) {
  return `<div class="st-row"><label data-translate="${labelKey}"></label>
    <span class="st-range-wrap"><input type="range" class="st-range" data-k="${key}" data-unit="${unit}"
      min="${min}" max="${max}" step="1"><b class="st-val" data-val="${key}"></b></span></div>`;
}
function studioGroup(icon, titleKey, inner) {
  return `<section class="st-group"><div class="st-title"><i class="ph ${icon}"></i><span data-translate="${titleKey}"></span></div>${inner}</section>`;
}

function studioBuild() {
  if (studioEl) return studioEl;
  const wrap = document.createElement('div');
  wrap.id = 'studio-overlay';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
  <div class="studio-sheet">
    <div class="studio-head">
      <div class="studio-title-ico"><i class="ph-fill ph-palette"></i></div>
      <div class="studio-title-wrap"><h3 data-translate="studio_title"></h3><p data-translate="studio_sub"></p></div>
      <input class="studio-name" id="studio-name" data-translate-ph="studio_name_ph" maxlength="40" autocomplete="off">
      <button class="studio-close" id="studio-close" type="button" aria-label="×"><i class="ph ph-x"></i></button>
    </div>
    <div class="studio-main">
      <div class="st-tabs" role="tablist">
        <button type="button" data-stab="preview" role="tab" aria-selected="true"><i class="ph ph-eye"></i><span data-translate="studio_preview"></span></button>
        <button type="button" data-stab="tune" role="tab" aria-selected="false"><i class="ph ph-sliders-horizontal"></i><span data-translate="studio_tune"></span></button>
      </div>

      <!-- Mobile mini live preview indicator shown on Tune tab -->
      <div class="st-mobile-mini-pv" id="st-mobile-mini-pv">
        <span class="st-mini-pv-temp" id="st-m-temp">21°</span>
        <span class="st-mini-pv-cond" id="st-m-cond">Ясно</span>
        <span class="st-mini-pv-icon" id="st-m-icon"><i class="ph-fill ph-sun"></i></span>
        <button type="button" class="st-mini-pv-btn">Кнопка</button>
      </div>

      <div class="studio-preview">
        <div class="studio-preview-cap"><span class="live-dot"></span><span data-translate="studio_preview"></span></div>
        
        <!-- Weather scenario switchers -->
        <div class="pv-scenarios" id="pv-scenarios">
          <button type="button" class="pv-scen active" data-scen="clear"><i class="ph-fill ph-sun"></i> Ясно</button>
          <button type="button" class="pv-scen" data-scen="rain"><i class="ph-fill ph-cloud-rain"></i> Дождь</button>
          <button type="button" class="pv-scen" data-scen="storm"><i class="ph-fill ph-cloud-lightning"></i> Гроза</button>
          <button type="button" class="pv-scen" data-scen="snow"><i class="ph-fill ph-snowflake"></i> Снег</button>
          <button type="button" class="pv-scen" data-scen="night"><i class="ph-fill ph-moon-stars"></i> Ночь</button>
        </div>

        <div class="pv-stage"><div class="pv-mini" id="pv-mini"></div></div>
        <p class="pv-hint" data-translate="studio_hint"></p>
      </div>
      <div class="st-controls" id="st-controls">
        ${studioGroup('ph-swatches', 'studio_mine', `
          <div class="st-themes" id="st-themes"></div>
          <div class="st-name-row" style="margin-top:10px; flex-wrap:wrap; gap:8px;">
            <button class="st-btn st-btn-ghost" id="st-duplicate" type="button" style="flex:1;min-width:110px;height:38px"><i class="ph ph-copy"></i><span data-translate="studio_duplicate"></span></button>
            <button class="st-btn st-btn-ghost" id="st-export" type="button" style="flex:1;min-width:100px;height:38px"><i class="ph ph-export"></i><span data-translate="studio_export"></span></button>
            <button class="st-btn st-btn-ghost" id="st-import-btn" type="button" style="flex:1;min-width:100px;height:38px"><i class="ph ph-download"></i><span data-translate="studio_import"></span></button>
            <button class="st-btn st-btn-ghost" id="st-delete" type="button" style="flex:1;min-width:110px;height:38px"><i class="ph ph-trash"></i><span data-translate="studio_delete"></span></button>
          </div>
          <div class="st-io-panel hidden" id="st-io-panel">
            <textarea id="st-io-text" placeholder=""></textarea>
            <div class="st-io-actions">
              <button type="button" class="st-btn st-btn-ghost" id="st-io-cancel" style="height:32px;font-size:11.5px">Отмена</button>
              <button type="button" class="st-btn st-btn-primary" id="st-io-apply" style="height:32px;font-size:11.5px">Импортировать</button>
            </div>
          </div>`)}
        ${studioGroup('ph-grid-four', 'studio_presets', `<div class="st-presets" id="st-presets"></div>`)}
        ${studioGroup('ph-circle-half', 'studio_base', `
          <div class="st-seg" id="st-base">
            <button type="button" data-base="dark"><i class="ph ph-moon"></i><span data-translate="studio_dark"></span></button>
            <button type="button" data-base="light"><i class="ph ph-sun"></i><span data-translate="studio_light"></span></button>
          </div>`)}
        ${studioGroup('ph-image', 'studio_bg',
          studioColorRow('bg0', 'studio_bg_top', true) +
          studioColorRow('bg1', 'studio_bg_bottom', false))}
        ${studioGroup('ph-squares-four', 'studio_blocks',
          studioColorRow('card', 'studio_card_color', true) +
          studioRangeRow('cardAlpha', 'studio_card_alpha', 5, 100, '%'))}
        ${studioGroup('ph-bounding-box', 'studio_borders',
          studioColorRow('strokeColor', 'studio_stroke_color', false) +
          studioRangeRow('strokeAlpha', 'studio_stroke_alpha', 0, 100, '%'))}
        ${studioGroup('ph-text-aa', 'studio_text', `
          ${studioColorRow('text1', 'studio_text_main', false)}
          ${studioColorRow('text2', 'studio_text_sub', false)}
          ${studioColorRow('text3', 'studio_text_mute', false)}
          <div class="st-contrast-box" id="st-contrast-box">
            <span class="st-contrast-label" data-translate="studio_contrast"></span>
            <span class="st-contrast-badge good" id="st-contrast-badge">7.2:1 · AAA</span>
          </div>`)}
        ${studioGroup('ph-palette', 'studio_accents', `
          ${studioColorRow('accent', 'studio_accent1', true)}
          ${studioColorRow('accent2', 'studio_accent2', true)}
          <div class="st-row"><label><span data-translate="studio_weather_tint"></span><small data-translate="studio_weather_tint_d"></small></label>
          <span class="st-switch"><input type="checkbox" data-k="weatherTint"><span class="st-track"></span></span></div>`)}
        ${studioGroup('ph-cursor-click', 'studio_buttons', `
          ${studioColorRow('btnBg', 'studio_btn_bg', true)}
          ${studioColorRow('btnText', 'studio_btn_text', false)}`)}
        ${studioGroup('ph-bezier-curve', 'studio_icons', `
          ${studioColorRow('iconAccent', 'studio_icon_accent', true)}
          ${studioColorRow('chartLine', 'studio_chart_line', false)}`)}
        ${studioGroup('ph-sliders-horizontal', 'studio_shape',
          studioRangeRow('blur', 'studio_blur', 0, 30, 'px') +
          studioRangeRow('radius', 'studio_radius', 8, 32, 'px') +
          studioRangeRow('shadow', 'studio_shadow', 0, 100, '%'))}
        ${studioGroup('ph-sun-dim', 'studio_glow', studioRangeRow('aurora', 'studio_aurora', 0, 100, '%'))}
      </div>
    </div>
    <div class="studio-foot">
      <div class="studio-diag" id="studio-diag"></div>
      <button class="st-btn st-btn-ghost" id="st-reset" type="button"><i class="ph ph-arrow-counter-clockwise"></i><span data-translate="studio_reset"></span></button>
      <button class="st-btn st-btn-soft" id="st-random" type="button"><i class="ph ph-dice-five"></i><span data-translate="studio_random"></span></button>
      <button class="st-btn st-btn-primary" id="st-done" type="button"><i class="ph ph-check"></i><span data-translate="studio_done"></span></button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  studioEl = wrap;
  const ph = wrap.querySelector('[data-translate-ph]');
  if (ph && typeof t === 'function') ph.setAttribute('placeholder', t(ph.dataset.translatePh));
  studioBind();
  studioRenderPresets();
  return studioEl;
}

/* Dynamic weather preview mock */
function studioRenderPreview() {
  const host = document.getElementById('pv-mini');
  if (!host) return;
  const T = (k, fb) => { try { const v = t(k); return v === k ? fb : v; } catch (e) { return fb; } };

  let cond = 'Ясно', temp = '21°', sub = 'H:24° · L:16°', mainIcon = 'ph-sun';
  if (studioScenario === 'rain') {
    cond = 'Дождь'; temp = '14°'; sub = 'H:16° · L:11°'; mainIcon = 'ph-cloud-rain';
  } else if (studioScenario === 'storm') {
    cond = 'Гроза'; temp = '17°'; sub = 'H:19° · L:13°'; mainIcon = 'ph-cloud-lightning';
  } else if (studioScenario === 'snow') {
    cond = 'Снегопад'; temp = '-3°'; sub = 'H:-1° · L:-6°'; mainIcon = 'ph-snowflake';
  } else if (studioScenario === 'night') {
    cond = 'Ясно · Ночь'; temp = '12°'; sub = 'Осадки: 0%'; mainIcon = 'ph-moon-stars';
  }

  let d0 = 'Сегодня', d1 = 'Завтра', d2 = '';
  try {
    const locale = loc();
    d0 = T('today', 'Сегодня');
    const plus1 = new Date(Date.now() + 864e5).toLocaleDateString(locale, { weekday: 'long' });
    const plus2 = new Date(Date.now() + 2 * 864e5).toLocaleDateString(locale, { weekday: 'long' });
    d1 = plus1.charAt(0).toUpperCase() + plus1.slice(1);
    d2 = plus2.charAt(0).toUpperCase() + plus2.slice(1);
  } catch (e) { /* ignore */ }

  const hours = [14, 20, 30, 42, 36, 26].map((h, i) =>
    `<div class="pv-hour"><i style="height:${h}px; background:linear-gradient(180deg, var(--chart-line, var(--accent)), var(--accent-2));"></i><span>${String(i * 3).padStart(2, '0')}</span></div>`).join('');

  host.innerHTML = `
    <div class="pv-bar">
      <div class="pv-logo">
        <img src="icons/LiveSky_icon.png" class="pv-wind-img" alt="" />
      </div>
      <div class="pv-search"></div>
      <button type="button" class="pv-btn">Обновить</button>
      <div class="pv-dot"></div>
    </div>
    <div class="pv-card">
      <div class="pv-hero">
        <div>
          <div class="pv-temp">${temp}</div>
          <div class="pv-cond">${cond}</div>
          <div class="pv-sub">${sub}</div>
        </div>
        <div class="pv-icon"><i class="ph-fill ${mainIcon}"></i></div>
      </div>
      <svg class="pv-chart" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,34 C25,30 35,16 60,19 S95,31 120,24 S165,7 200,11 L200,44 L0,44 Z" fill="var(--chart-fill, var(--accent-soft))" stroke="none"/>
        <path d="M0,34 C25,30 35,16 60,19 S95,31 120,24 S165,7 200,11" fill="none" stroke="var(--chart-line, var(--accent))" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="120" cy="24" r="3.5" fill="var(--accent-2)"/>
      </svg>
    </div>
    <div class="pv-chips">
      <div class="pv-chip"><b>${temp}</b><span>${T('feels_like', 'Ощущается')}</span></div>
      <div class="pv-chip"><b>4 м/с</b><span>${T('wind', 'Ветер')}</span></div>
      <div class="pv-chip"><b>62%</b><span>${T('humidity', 'Влажность')}</span></div>
      <div class="pv-chip"><b>3</b><span>УФ</span></div>
    </div>
    <div class="pv-card"><div class="pv-hours">${hours}</div></div>
    <div class="pv-card"><div class="pv-rows">
      <div class="pv-row"><i class="ph-fill ${mainIcon}"></i><span>${d0}</span><b>${temp}</b></div>
      <div class="pv-row"><i class="ph-fill ph-cloud"></i><span>${d1}</span><b>21°</b></div>
      <div class="pv-row"><i class="ph-fill ph-cloud-rain"></i><span>${d2}</span><b>18°</b></div>
    </div></div>`;

  // Update mobile mini preview
  const mTemp = document.getElementById('st-m-temp');
  const mCond = document.getElementById('st-m-cond');
  const mIcon = document.getElementById('st-m-icon');
  if (mTemp) mTemp.textContent = temp;
  if (mCond) mCond.textContent = cond;
  if (mIcon) mIcon.innerHTML = `<i class="ph-fill ${mainIcon}"></i>`;
}

function studioRenderChips() {
  const host = document.getElementById('st-themes');
  if (!host) return;
  CustomTheme.ensureLoaded();
  host.innerHTML = CustomTheme.list.map(th => `
    <button type="button" class="st-chip${th.id === CustomTheme.activeId ? ' active' : ''}" data-theme-id="${th.id}">
      <span class="st-dot" style="background:linear-gradient(135deg, ${th.accent}, ${th.accent2})"></span>
      <span>${th.name.replace(/</g, '&lt;')}</span>
    </button>`).join('') + `
    <button type="button" class="st-chip st-chip-add" data-add="1"><i class="ph ph-plus"></i><span data-translate="studio_new">${typeof t === 'function' ? t('studio_new') : 'Новая'}</span></button>`;

  const delBtn = document.getElementById('st-delete');
  if (delBtn) {
    const single = CustomTheme.list.length <= 1;
    delBtn.style.opacity = single ? '0.45' : '1';
    delBtn.style.cursor = single ? 'not-allowed' : 'pointer';
    delBtn.title = single ? (typeof t === 'function' ? t('studio_delete_only_one') : 'Нельзя удалить единственную тему') : '';
  }
}

function studioRenderPresets() {
  const host = document.getElementById('st-presets');
  if (!host) return;
  host.innerHTML = STUDIO_PRESETS.map((p, i) => `
    <button type="button" class="st-preset" data-preset="${i}">
      <span class="st-sw" style="background:linear-gradient(135deg, ${p.bg0} 0%, ${p.accent} 55%, ${p.accent2} 100%)"></span>
      <span>${p.name}</span>
    </button>`).join('');
}

function studioSyncControls() {
  if (!studioEl) return;
  const d = CustomTheme.draft || CustomTheme.getActive();
  studioEl.querySelectorAll('input[type="color"][data-k]').forEach(inp => {
    inp.value = studioHex(d[inp.dataset.k] || '#38bdf8');
  });
  studioEl.querySelectorAll('input.st-hex[data-hex-input]').forEach(inp => {
    inp.value = studioHex(d[inp.dataset.hexInput] || '').toUpperCase();
  });
  studioEl.querySelectorAll('input[type="range"][data-k]').forEach(inp => {
    const v = Number(d[inp.dataset.k] != null ? d[inp.dataset.k] : 0);
    inp.value = v;
    const pct = (v - Number(inp.min)) / (Number(inp.max) - Number(inp.min)) * 100;
    inp.style.setProperty('--p', pct + '%');
    const val = studioEl.querySelector(`[data-val="${inp.dataset.k}"]`);
    if (val) val.textContent = v + (inp.dataset.unit || '');
  });
  if (studioEl) {
    studioEl.dataset.base = d.base;
    const stage = studioEl.querySelector('.pv-stage');
    if (stage) stage.dataset.base = d.base;
  }
  studioEl.querySelectorAll('#st-base button').forEach(b => {
    b.classList.toggle('active', b.dataset.base === d.base);
  });
  const sw = studioEl.querySelector('[data-k="weatherTint"]');
  if (sw) sw.checked = Boolean(d.weatherTint);
  const name = document.getElementById('studio-name');
  if (name && document.activeElement !== name) name.value = d.name || '';

  // Calculate and update contrast badge
  const crBadge = document.getElementById('st-contrast-badge');
  if (crBadge) {
    const cardBg = d.card || (d.base === 'light' ? '#ffffff' : '#0d1528');
    const textCol = d.text1 || (d.base === 'light' ? '#16202f' : '#f4f7fb');
    const ratio = studioContrast(cardBg, textCol);
    const rNum = ratio.toFixed(1);
    crBadge.className = 'st-contrast-badge ' + (ratio >= 7 ? 'good' : (ratio >= 4.5 ? 'warn' : 'bad'));
    const verdict = ratio >= 7 ? 'AAA · Отлично' : (ratio >= 4.5 ? 'AA · Хорошо' : 'Слабый контраст');
    crBadge.textContent = `${rNum}:1 · ${verdict}`;
  }

  studioRenderDiag();
}

function studioRenderDiag() {
  if (!studioEl) return;
  const node = studioEl.querySelector('#studio-diag');
  if (!node) return;
  const root = document.documentElement;
  const gv = (k) => root.style.getPropertyValue(k) || '(none)';
  let build = 'dev';
  try { build = typeof APP_BUILD === 'string' ? APP_BUILD : 'dev'; } catch (e) { /* ignore */ }
  node.textContent = `build ${build} · theme=${state.theme} · base=${root.dataset.theme || '?'} · ` +
    `custom=${root.dataset.custom || '—'} · surface=${gv('--surface')} · text=${gv('--text-1')}`;
}

function studioSyncLinkedAccent(d, prevAccent, nextAccent) {
  if (!d || !nextAccent) return;
  const prev = prevAccent ? studioHex(prevAccent) : '';
  const next = studioHex(nextAccent);
  if (!d.btnBg || studioHex(d.btnBg) === prev) {
    d.btnBg = next;
    d.btnText = studioLum(next) > 0.45 ? '#04101f' : '#ffffff';
  }
  if (!d.iconAccent || studioHex(d.iconAccent) === prev) d.iconAccent = next;
  if (!d.chartLine || studioHex(d.chartLine) === prev) d.chartLine = next;
  if (!d.chartFill || studioHex(d.chartFill) === prev) d.chartFill = next;
}

function studioApplyInput(node) {
  const k = node.dataset.k;
  if (!k) return;
  const d = CustomTheme.draft;
  const prevVal = d[k];
  if (node.type === 'color') {
    d[k] = studioHex(node.value);
    if (k === 'accent') studioSyncLinkedAccent(d, prevVal, d[k]);
    if (k === 'accent' || k === 'accent2') d.weatherTint = false;
    const hexInput = studioEl.querySelector(`input.st-hex[data-hex-input="${k}"]`);
    if (hexInput && document.activeElement !== hexInput) hexInput.value = d[k].toUpperCase();
  } else if (node.type === 'range') {
    d[k] = Number(node.value);
    const pct = (d[k] - Number(node.min)) / (Number(node.max) - Number(node.min)) * 100;
    node.style.setProperty('--p', pct + '%');
    const val = studioEl.querySelector(`[data-val="${k}"]`);
    if (val) val.textContent = d[k] + (node.dataset.unit || '');
  } else if (node.type === 'checkbox') {
    d[k] = node.checked;
  }
  if (k === 'base') {
    if (typeof applyTheme === 'function') applyTheme();
  } else {
    CustomTheme.apply(d);
  }
  if (k === 'accent' || k === 'accent2') studioSyncControls();
  if (k === 'weatherTint' && typeof applyWeatherTheme === 'function') applyWeatherTheme();
  if ((k === 'accent' || k === 'accent2' || k === 'chartLine') && typeof SECTION_MANAGER !== 'undefined') {
    clearTimeout(studioChartT);
    studioChartT = setTimeout(() => {
      try { if (state.weather) SECTION_MANAGER.renderSection('forecast'); } catch (e) { /* ignore */ }
    }, 600);
  }
  studioRenderPreview();
  studioRenderChips();
  CustomTheme.saveSoon();
}

function studioBind() {
  if (studioBound || !studioEl) return;
  studioBound = true;
  const controls = document.getElementById('st-controls');

  const onControlInput = (e) => {
    if (e.target && e.target.dataset && e.target.dataset.k) studioApplyInput(e.target);
  };
  controls.addEventListener('input', onControlInput);
  controls.addEventListener('change', onControlInput);

  // Manual HEX text input handler
  controls.addEventListener('input', (e) => {
    const hexTarget = e.target.closest('input.st-hex[data-hex-input]');
    if (!hexTarget) return;
    const k = hexTarget.dataset.hexInput;
    let val = hexTarget.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      const prevVal = CustomTheme.draft[k];
      CustomTheme.draft[k] = val.toLowerCase();
      if (k === 'accent') studioSyncLinkedAccent(CustomTheme.draft, prevVal, CustomTheme.draft[k]);
      if (k === 'accent' || k === 'accent2') CustomTheme.draft.weatherTint = false;
      const colorPicker = studioEl.querySelector(`input[type="color"][data-k="${k}"]`);
      if (colorPicker) colorPicker.value = val.toLowerCase();
      CustomTheme.apply(CustomTheme.draft);
      if (k === 'accent' || k === 'accent2') studioSyncControls();
      studioRenderPreview();
      studioRenderChips();
      CustomTheme.saveSoon();
    }
  });

  const nameInput = document.getElementById('studio-name');
  nameInput.addEventListener('input', () => {
    CustomTheme.draft.name = nameInput.value.slice(0, 40) || (typeof t === 'function' ? t('theme_custom') : 'Custom');
    CustomTheme.saveSoon();
    studioRenderChips();
  });

  studioEl.addEventListener('click', (e) => {
    if (e.target === studioEl) { closeThemeStudio(); return; }

    // Swatch pill clicked
    const swatch = e.target.closest('.st-swatch');
    if (swatch) {
      const container = swatch.closest('[data-swatch-for]');
      if (container) {
        const k = container.dataset.swatchFor;
        const color = swatch.dataset.color;
        const prevVal = CustomTheme.draft[k];
        CustomTheme.draft[k] = color;
        if (k === 'accent') studioSyncLinkedAccent(CustomTheme.draft, prevVal, color);
        if (k === 'accent' || k === 'accent2') CustomTheme.draft.weatherTint = false;
        const colorInput = studioEl.querySelector(`input[type="color"][data-k="${k}"]`);
        const hexInput = studioEl.querySelector(`input.st-hex[data-hex-input="${k}"]`);
        if (colorInput) colorInput.value = color;
        if (hexInput) hexInput.value = color.toUpperCase();
        CustomTheme.apply(CustomTheme.draft);
        studioSyncControls();
        studioRenderPreview();
        studioRenderChips();
        CustomTheme.saveSoon();
      }
      return;
    }

    // Weather scenario toggle in preview
    const scenBtn = e.target.closest('.pv-scen');
    if (scenBtn) {
      studioScenario = scenBtn.dataset.scen || 'clear';
      studioEl.querySelectorAll('.pv-scen').forEach(b => b.classList.toggle('active', b === scenBtn));
      studioRenderPreview();
      return;
    }

    const chip = e.target.closest('[data-theme-id]');
    if (chip) {
      CustomTheme.setActive(chip.dataset.themeId);
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls(); studioRenderChips(); studioRenderPreview();
      return;
    }
    if (e.target.closest('[data-add]')) {
      CustomTheme.create();
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls(); studioRenderChips(); studioRenderPreview();
      nameInput.focus(); nameInput.select();
      return;
    }
    const stab = e.target.closest('[data-stab]');
    if (stab) {
      const main = studioEl.querySelector('.studio-main');
      if (main) main.classList.toggle('show-tune', stab.dataset.stab === 'tune');
      studioEl.querySelectorAll('[data-stab]').forEach(b => b.setAttribute('aria-selected', String(b === stab)));
      return;
    }
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const p = STUDIO_PRESETS[Number(preset.dataset.preset)];
      if (p) {
        CustomTheme.create(p, p.name);
        if (typeof applyTheme === 'function') applyTheme();
        studioSyncControls(); studioRenderChips(); studioRenderPreview();
      }
      return;
    }
    const baseBtn = e.target.closest('#st-base button');
    if (baseBtn) {
      CustomTheme.draft.base = baseBtn.dataset.base;
      const d0 = studioDefaults(CustomTheme.draft.base);
      ['bg0', 'bg1', 'card', 'cardAlpha', 'strokeColor', 'strokeAlpha', 'text1', 'text2', 'text3', 'accent', 'accent2', 'weatherTint', 'shadow', 'aurora', 'btnBg', 'btnText', 'iconAccent', 'chartLine', 'chartFill'].forEach(k => {
        CustomTheme.draft[k] = d0[k];
      });
      CustomTheme.saveNow();
      if (typeof applyTheme === 'function') applyTheme();
      CustomTheme.apply(CustomTheme.draft);
      studioSyncControls();
      studioRenderChips();
      studioRenderPreview();
      return;
    }
    if (e.target.closest('#st-duplicate')) {
      CustomTheme.duplicate();
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls(); studioRenderChips(); studioRenderPreview();
      return;
    }
    if (e.target.closest('#st-delete')) {
      if (CustomTheme.list.length <= 1) {
        if (typeof toast === 'function') toast(t('studio_delete_only_one') || 'Нельзя удалить единственную тему', 'warn');
        return;
      }
      const confirmed = typeof confirm !== 'function' || confirm(t('studio_delete_confirm') || 'Удалить эту тему?');
      if (confirmed && CustomTheme.removeActive()) {
        if (typeof applyTheme === 'function') applyTheme();
        studioSyncControls(); studioRenderChips(); studioRenderPreview();
        if (typeof toast === 'function') toast(t('studio_deleted') || 'Тема удалена', 'info');
      }
      return;
    }
    // Export theme
    if (e.target.closest('#st-export')) {
      const json = CustomTheme.exportActive();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(() => {
          if (typeof toast === 'function') toast(t('studio_export_copied') || 'Код темы скопирован!', 'success');
        }).catch(() => {
          showIoPanel(json);
        });
      } else {
        showIoPanel(json);
      }
      return;
    }
    // Import theme toggle
    if (e.target.closest('#st-import-btn')) {
      toggleIoPanel();
      return;
    }
    if (e.target.closest('#st-io-cancel')) {
      const p = document.getElementById('st-io-panel');
      if (p) p.classList.add('hidden');
      return;
    }
    if (e.target.closest('#st-io-apply')) {
      const txt = document.getElementById('st-io-text');
      if (txt && txt.value.trim()) {
        const imported = CustomTheme.importTheme(txt.value.trim());
        if (imported) {
          if (typeof applyTheme === 'function') applyTheme();
          studioSyncControls(); studioRenderChips(); studioRenderPreview();
          document.getElementById('st-io-panel').classList.add('hidden');
          if (typeof toast === 'function') toast('Тема успешно импортирована!', 'success');
        } else {
          if (typeof toast === 'function') toast(t('studio_import_err') || 'Ошибка импорта', 'error');
        }
      }
      return;
    }
    if (e.target.closest('#st-reset')) {
      CustomTheme.resetDraft();
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls();
      studioRenderPreview();
      return;
    }
    if (e.target.closest('#st-random')) {
      CustomTheme.randomize();
      studioSyncControls();
      studioRenderPreview();
      return;
    }
    if (e.target.closest('#st-done') || e.target.closest('#studio-close')) { closeThemeStudio(); return; }
  });

  studioEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeThemeStudio(); }
  });
}

function showIoPanel(text) {
  const p = document.getElementById('st-io-panel');
  const t = document.getElementById('st-io-text');
  if (p && t) {
    p.classList.remove('hidden');
    t.value = text || '';
    t.select();
  }
}
function toggleIoPanel() {
  const p = document.getElementById('st-io-panel');
  const t = document.getElementById('st-io-text');
  if (p) {
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden') && t) {
      t.value = '';
      t.focus();
    }
  }
}

function openThemeStudio() {
  CustomTheme.ensureLoaded();
  state.theme = 'custom';
  try { store.set('livesky:theme', 'custom'); } catch (e) { /* ignore */ }
  if (typeof applyTheme === 'function') { try { applyTheme(); } catch (e) { /* local pass */ } }
  if (!document.documentElement.dataset.custom) {
    const b = CustomTheme.base();
    document.documentElement.dataset.theme = b;
    if (document.body) document.body.dataset.theme = b;
    document.documentElement.dataset.custom = '1';
    CustomTheme.applyActive();
  }
  studioBuild();
  const stMain = studioEl.querySelector('.studio-main');
  if (stMain) stMain.classList.remove('show-tune');
  studioEl.querySelectorAll('[data-stab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.stab === 'preview')));
  studioRenderPreview();
  studioRenderChips();
  studioSyncControls();
  CustomTheme.apply(CustomTheme.draft);
  if (typeof applyTranslations === 'function') applyTranslations();
  const ph = studioEl.querySelector('[data-translate-ph]');
  if (ph && typeof t === 'function') ph.setAttribute('placeholder', t(ph.dataset.translatePh));
  studioEl.classList.add('open');
  document.body.classList.add('no-scroll');
  if (typeof trapFocus === 'function') trapFocus(studioEl);
}

function closeThemeStudio() {
  if (!studioEl) return;
  CustomTheme.saveNow();
  studioEl.classList.remove('open');
  document.body.classList.remove('no-scroll');
  if (typeof releaseFocus === 'function') releaseFocus(studioEl);
  try {
    state.uiLockUntil = Date.now() + (typeof UI_LOCK_MS !== 'undefined' ? UI_LOCK_MS : 350);
    clearTimeout(state.favOpenTimer);
  } catch (e) { /* ignore */ }
}

try {
  if (typeof state !== 'undefined' && state.theme === 'custom' && typeof CustomTheme !== 'undefined') {
    const bootBase = CustomTheme.base();
    document.documentElement.dataset.theme = bootBase;
    if (document.body) document.body.dataset.theme = bootBase;
    document.documentElement.dataset.custom = '1';
    CustomTheme.applyActive();
  }
} catch (e) { /* boot must never fail */ }
