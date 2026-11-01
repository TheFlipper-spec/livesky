/* ============================================================
   LiveSky Weather Pro — THEME STUDIO (layer 3, eager)
   ------------------------------------------------------------
   Custom user themes + the visual builder:
     • `CustomTheme` — storage (multiple named themes), active-theme
       tracking, and application via inline CSS variables that override
       the design tokens (works on top of either light or dark base —
       `data-theme` keeps carrying the base so every existing
       `[data-theme="light"]` component override keeps applying).
     • `openThemeStudio` / `closeThemeStudio` — the builder modal with a
       live mini-preview of the site and instant-apply controls.
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
const STUDIO_VARS = ['--bg-0', '--bg-1', '--surface', '--surface-2', '--surface-3', '--surface-hover', '--surface-input', '--menu-bg',
  '--text-1', '--text-2', '--text-3', '--accent', '--accent-2', '--accent-soft',
  '--accent-contrast', '--stroke-accent', '--glow-accent', '--grad-logo',
  '--glass-blur', '--radius-lg', '--radius-md', '--radius-sm',
  '--shadow-card', '--shadow-pop', '--aurora-o'];

function studioDefaults(base) {
  const dark = base !== 'light';
  return dark ? {
    base: 'dark', bg0: '#05070f', bg1: '#0a1020', card: '#0d1528', cardAlpha: 55,
    text1: '#f4f7fb', text2: '#c7d2e0', text3: '#8ca0b5',
    accent: '#38bdf8', accent2: '#818cf8', weatherTint: true,
    blur: 18, radius: 28, shadow: 70, aurora: 90
  } : {
    base: 'light', bg0: '#eef4fb', bg1: '#f7fafd', card: '#ffffff', cardAlpha: 72,
    text1: '#16202f', text2: '#33415a', text3: '#8b98ab',
    accent: '#7c3aed', accent2: '#06b6d4', weatherTint: true,
    blur: 18, radius: 28, shadow: 60, aurora: 55
  };
}
const STUDIO_PRESETS = [
  { name: 'Neon Night', base: 'dark', bg0: '#05070f', bg1: '#0a1020', card: '#0d1528', cardAlpha: 55, text1: '#f4f7fb', text2: '#c7d2e0', text3: '#8ca0b5', accent: '#38bdf8', accent2: '#818cf8' },
  { name: 'Sunset', base: 'dark', bg0: '#170b12', bg1: '#251016', card: '#2b1420', cardAlpha: 60, text1: '#fff5f0', text2: '#e8c4b8', text3: '#a07a70', accent: '#fb7185', accent2: '#fbbf24' },
  { name: 'Forest', base: 'dark', bg0: '#04120c', bg1: '#07231a', card: '#0a2a1e', cardAlpha: 60, text1: '#eefbf3', text2: '#bfe3cf', text3: '#7ba58f', accent: '#34d399', accent2: '#a3e635' },
  { name: 'Pure Light', base: 'light', bg0: '#eef4fb', bg1: '#f7fafd', card: '#ffffff', cardAlpha: 72, text1: '#16202f', text2: '#33415a', text3: '#8b98ab', accent: '#7c3aed', accent2: '#06b6d4' },
  { name: 'Sakura', base: 'light', bg0: '#fdf0f4', bg1: '#fff7fa', card: '#ffffff', cardAlpha: 70, text1: '#3d2233', text2: '#7a4a63', text3: '#b08aa0', accent: '#ec4899', accent2: '#8b5cf6' }
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
  ['bg0', 'bg1', 'card', 'text1', 'text2', 'text3', 'accent', 'accent2'].forEach(k => { th[k] = studioHex(th[k]); });
  th.cardAlpha = studioNum(th.cardAlpha, d.cardAlpha, 5, 100);
  th.blur = studioNum(th.blur, 18, 0, 30);
  th.radius = studioNum(th.radius, 28, 8, 32);
  th.shadow = studioNum(th.shadow, 70, 0, 100);
  th.aurora = studioNum(th.aurora, 90, 0, 100);
  th.weatherTint = th.weatherTint !== false;
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
    this.activeId = (rec && rec.activeId && list.some(x => x.id === rec.activeId)) ? rec.activeId : list[0].id;
    this.draft = studioClone(this.getActive());
  },
  persist() {
    try { store.set(STUDIO_STORE_KEY, { v: 1, list: this.list, activeId: this.activeId }); } catch (e) { /* ignore */ }
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
  base() { return this.getActive().base === 'light' ? 'light' : 'dark'; },
  isLight() { return this.base() === 'light'; },
  weatherTint() { return this.getActive().weatherTint !== false; },

  /* Push a theme onto the page as inline custom properties (they win over
     every stylesheet rule, including the [data-theme] token blocks). */
  apply(th) {
    th = studioNormalize(th || this.draft || this.getActive());
    const root = document.documentElement;
    const light = th.base === 'light';
    const set = (k, v) => root.style.setProperty(k, v);
    set('--bg-0', th.bg0);
    set('--bg-1', th.bg1);
    try { document.body.style.background = `linear-gradient(180deg, ${th.bg0} 0%, ${th.bg1} 100%)`; } catch (e) { /* ignore */ }
    const a = th.cardAlpha / 100;
    set('--surface', studioRgba(th.card, a));
    /* inner tiles (metrics, hourly/daily cards, modal rows) live on
       --surface-2/3 — derive them from the block color so the setting
       visibly repaints them on either base (mixed slightly toward the text
       color so tiles keep separating from their parent card). */
    const tile = studioMix(th.card, th.text1, 0.12);
    set('--surface-2', studioRgba(tile, Math.max(0.05, Math.min(0.55, a * 0.45))));
    set('--surface-3', studioRgba(tile, Math.max(0.08, Math.min(0.75, a * 0.7))));
    set('--surface-hover', studioRgba(tile, Math.max(0.12, Math.min(0.9, a * 0.85 + 0.06))));
    set('--surface-input', studioRgba(th.card, Math.min(1, a + 0.22)));
    set('--menu-bg', studioRgba(studioMix(th.bg1, th.card, 0.55), 0.96));
    set('--text-1', th.text1);
    set('--text-2', th.text2);
    set('--text-3', th.text3);
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
    return th;
  },
  /* Accents alone — re-asserted after every weather-theme pass when the
     theme opts out of the weather tint, so storm/sun never hijack them. */
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
    try { document.body.style.removeProperty('background'); } catch (e) { /* ignore */ }
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
    const th = studioNormalize(Object.assign({}, source || this.draft || this.getActive()));
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
  /* Harmless fun: a harmonious random palette on the current base. */
  randomize() {
    this.ensureLoaded();
    const d = this.draft;
    const light = d.base === 'light';
    const h = Math.floor(Math.random() * 360);
    d.accent = studioHsl(h, light ? 0.72 : 0.85, light ? 0.5 : 0.65);
    d.accent2 = studioHsl(h + 45 + Math.random() * 60, light ? 0.7 : 0.8, light ? 0.45 : 0.62);
    d.bg0 = studioHsl(h, light ? 0.35 : 0.45, light ? 0.93 : 0.05);
    d.bg1 = studioHsl((h + 25) % 360, light ? 0.3 : 0.5, light ? 0.96 : 0.09);
    d.card = light ? '#ffffff' : studioHsl(h, 0.4, 0.1);
    d.cardAlpha = light ? 72 : 58;
    if (light) { d.text1 = '#16202f'; d.text2 = '#33415a'; d.text3 = '#8b98ab'; }
    else { d.text1 = '#f4f7fb'; d.text2 = '#c7d2e0'; d.text3 = '#8ca0b5'; }
    this.apply(d);
    this.saveNow();
  }
};

/* ---------------- studio modal ---------------- */
let studioEl = null, studioBound = false, studioChartT = null;

function studioColorRow(key, labelKey) {
  return `<div class="st-row"><label data-translate="${labelKey}"></label>
    <span class="st-color"><input type="color" data-k="${key}" value="#38bdf8" aria-label="${key}">
    <code class="st-hex" data-hex="${key}">#38BDF8</code></span></div>`;
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
      <div class="studio-preview">
        <div class="studio-preview-cap"><span class="live-dot"></span><span data-translate="studio_preview"></span></div>
        <div class="pv-stage"><div class="pv-mini" id="pv-mini"></div></div>
        <p class="pv-hint" data-translate="studio_hint"></p>
      </div>
      <div class="st-controls" id="st-controls">
        ${studioGroup('ph-swatches', 'studio_mine', `
          <div class="st-themes" id="st-themes"></div>
          <div class="st-name-row" style="margin-top:10px">
            <button class="st-btn st-btn-ghost" id="st-duplicate" type="button" style="flex:1;height:40px"><i class="ph ph-copy"></i><span data-translate="studio_duplicate"></span></button>
            <button class="st-btn st-btn-ghost" id="st-delete" type="button" style="flex:1;height:40px"><i class="ph ph-trash"></i><span data-translate="studio_delete"></span></button>
          </div>`)}
        ${studioGroup('ph-sparkle', 'studio_presets', `<div class="st-presets" id="st-presets"></div>`)}
        ${studioGroup('ph-circle-half', 'studio_base', `
          <div class="st-seg" id="st-base">
            <button type="button" data-base="dark"><i class="ph ph-moon"></i><span data-translate="studio_dark"></span></button>
            <button type="button" data-base="light"><i class="ph ph-sun"></i><span data-translate="studio_light"></span></button>
          </div>`)}
        ${studioGroup('ph-image', 'studio_bg', studioColorRow('bg0', 'studio_bg_top') + studioColorRow('bg1', 'studio_bg_bottom'))}
        ${studioGroup('ph-squares-four', 'studio_blocks',
          studioColorRow('card', 'studio_card_color') + studioRangeRow('cardAlpha', 'studio_card_alpha', 5, 100, '%'))}
        ${studioGroup('ph-text-aa', 'studio_text',
          studioColorRow('text1', 'studio_text_main') + studioColorRow('text2', 'studio_text_sub') + studioColorRow('text3', 'studio_text_mute'))}
        ${studioGroup('ph-palette', 'studio_accents', `
          ${studioColorRow('accent', 'studio_accent1')}
          ${studioColorRow('accent2', 'studio_accent2')}
          <div class="st-row"><label><span data-translate="studio_weather_tint"></span><small data-translate="studio_weather_tint_d"></small></label>
          <span class="st-switch"><input type="checkbox" data-k="weatherTint"><span class="st-track"></span></span></div>`)}
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
  /* placeholders aren't covered by applyTranslations — sync by hand */
  const ph = wrap.querySelector('[data-translate-ph]');
  if (ph && typeof t === 'function') ph.setAttribute('placeholder', t(ph.dataset.translatePh));
  studioBind();
  studioRenderPresets();
  return studioEl;
}

/* A tiny mirror of the site. Every painted value comes from the live CSS
   variables, so the mock (and the blurred real site behind the overlay)
   updates on every control tick with zero extra wiring. */
function studioRenderPreview() {
  const host = document.getElementById('pv-mini');
  if (!host) return;
  const T = (k, fb) => { try { const v = t(k); return v === k ? fb : v; } catch (e) { return fb; } };
  let cond = 'Clear sky', d0 = 'Today', d1 = 'Tomorrow', d2 = '';
  try { cond = wmoLabel(0); } catch (e) { /* ignore */ }
  try {
    const locale = loc();
    d0 = T('today', 'Today');
    const plus1 = new Date(Date.now() + 864e5).toLocaleDateString(locale, { weekday: 'long' });
    const plus2 = new Date(Date.now() + 2 * 864e5).toLocaleDateString(locale, { weekday: 'long' });
    d1 = plus1.charAt(0).toUpperCase() + plus1.slice(1);
    d2 = plus2.charAt(0).toUpperCase() + plus2.slice(1);
  } catch (e) { /* ignore */ }
  const hours = [14, 20, 30, 42, 36, 26].map((h, i) =>
    `<div class="pv-hour"><i style="height:${h}px"></i><span>${String(i * 3).padStart(2, '0')}</span></div>`).join('');
  host.innerHTML = `
    <div class="pv-bar"><div class="pv-logo"><i class="ph-fill ph-cloud-sun"></i></div><div class="pv-search"></div><div class="pv-dot"></div><div class="pv-dot"></div></div>
    <div class="pv-card"><div class="pv-hero">
      <div><div class="pv-temp">21°</div><div class="pv-cond">${cond}</div><div class="pv-sub">H:24° · L:16°</div></div>
      <div class="pv-icon"><i class="ph-fill ph-sun"></i></div>
    </div>
    <svg class="pv-chart" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,34 C25,30 35,16 60,19 S95,31 120,24 S165,7 200,11 L200,44 L0,44 Z" fill="var(--accent-soft)" stroke="none"/>
      <path d="M0,34 C25,30 35,16 60,19 S95,31 120,24 S165,7 200,11" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="120" cy="24" r="3.5" fill="var(--accent-2)"/>
    </svg></div>
    <div class="pv-chips">
      <div class="pv-chip"><b>19°</b><span>${T('feels_like', 'Feels')}</span></div>
      <div class="pv-chip"><b>4 m/s</b><span>${T('wind', 'Wind')}</span></div>
      <div class="pv-chip"><b>62%</b><span>${T('humidity', 'Hum')}</span></div>
      <div class="pv-chip"><b>3</b><span>UV</span></div>
    </div>
    <div class="pv-card"><div class="pv-hours">${hours}</div></div>
    <div class="pv-card"><div class="pv-rows">
      <div class="pv-row"><i class="ph-fill ph-sun"></i><span>${d0}</span><b>24°</b></div>
      <div class="pv-row"><i class="ph-fill ph-cloud"></i><span>${d1}</span><b>21°</b></div>
      <div class="pv-row"><i class="ph-fill ph-cloud-rain"></i><span>${d2}</span><b>18°</b></div>
    </div></div>`;
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
    <button type="button" class="st-chip st-chip-add" data-add="1"><i class="ph ph-plus"></i><span data-translate="studio_new">${typeof t === 'function' ? t('studio_new') : 'New'}</span></button>`;
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
  studioEl.querySelectorAll('.st-hex[data-hex]').forEach(code => {
    code.textContent = studioHex(d[code.dataset.hex] || '').toUpperCase();
  });
  studioEl.querySelectorAll('input[type="range"][data-k]').forEach(inp => {
    const v = Number(d[inp.dataset.k] || 0);
    inp.value = v;
    const pct = (v - Number(inp.min)) / (Number(inp.max) - Number(inp.min)) * 100;
    inp.style.setProperty('--p', pct + '%');
    const val = studioEl.querySelector(`[data-val="${inp.dataset.k}"]`);
    if (val) val.textContent = v + (inp.dataset.unit || '');
  });
  studioEl.querySelectorAll('#st-base button').forEach(b => {
    b.classList.toggle('active', b.dataset.base === d.base);
  });
  const sw = studioEl.querySelector('[data-k="weatherTint"]');
  if (sw) sw.checked = d.weatherTint !== false;
  const name = document.getElementById('studio-name');
  if (name && document.activeElement !== name) name.value = d.name || '';
  studioRenderDiag();
}

/* Visible build + theme-state readout (footer). Proves which build paints
   and what the live variables hold — decisive in bug-report screenshots. */
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

function studioApplyInput(node) {
  const k = node.dataset.k;
  if (!k) return;
  const d = CustomTheme.draft;
  if (node.type === 'color') {
    d[k] = studioHex(node.value);
    const code = studioEl.querySelector(`[data-hex="${k}"]`);
    if (code) code.textContent = d[k].toUpperCase();
  } else if (node.type === 'range') {
    d[k] = Number(node.value);
    const pct = (d[k] - Number(node.min)) / (Number(node.max) - Number(node.min)) * 100;
    node.style.setProperty('--p', pct + '%');
    const val = studioEl.querySelector(`[data-val="${k}"]`);
    if (val) val.textContent = d[k] + (node.dataset.unit || '');
  } else if (node.type === 'checkbox') {
    d[k] = node.checked;
  }
  /* Base flips need the full theme pass (dataset + weather accents). */
  if (k === 'base') {
    if (typeof applyTheme === 'function') applyTheme();
  } else {
    CustomTheme.apply(d);
  }
  /* Weather-tint toggles re-run the weather pass so accents snap immediately. */
  if (k === 'weatherTint' && typeof applyWeatherTheme === 'function') applyWeatherTheme();
  /* Accent edits repaint the forecast chart behind the modal (debounced). */
  if ((k === 'accent' || k === 'accent2') && typeof SECTION_MANAGER !== 'undefined') {
    clearTimeout(studioChartT);
    studioChartT = setTimeout(() => {
      try { if (state.weather) SECTION_MANAGER.renderSection('forecast'); } catch (e) { /* ignore */ }
    }, 600);
  }
  CustomTheme.saveSoon();
}

function studioBind() {
  if (studioBound || !studioEl) return;
  studioBound = true;
  const controls = document.getElementById('st-controls');
  /* Both `input` (live) and `change` (commit): most pickers fire `input`
     continuously, but some flows (keyboard, exotic webviews, picker-dismiss)
     only deliver `change`. The handler is idempotent, so double delivery is
     harmless. */
  const onControlInput = (e) => {
    if (e.target && e.target.dataset && e.target.dataset.k) studioApplyInput(e.target);
  };
  controls.addEventListener('input', onControlInput);
  controls.addEventListener('change', onControlInput);
  const nameInput = document.getElementById('studio-name');
  nameInput.addEventListener('input', () => {
    CustomTheme.draft.name = nameInput.value.slice(0, 40) || (typeof t === 'function' ? t('theme_custom') : 'Custom');
    CustomTheme.saveSoon();
    studioRenderChips();
  });
  studioEl.addEventListener('click', (e) => {
    if (e.target === studioEl) { closeThemeStudio(); return; }
    const chip = e.target.closest('[data-theme-id]');
    if (chip) {
      CustomTheme.setActive(chip.dataset.themeId);
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls(); studioRenderChips();
      return;
    }
    if (e.target.closest('[data-add]')) {
      CustomTheme.create();
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls(); studioRenderChips();
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
        studioSyncControls(); studioRenderChips();
      }
      return;
    }
    const baseBtn = e.target.closest('#st-base button');
    if (baseBtn) {
      CustomTheme.draft.base = baseBtn.dataset.base;
      /* A fresh base deserves fresh readable defaults for text + surfaces. */
      const d0 = studioDefaults(CustomTheme.draft.base);
      ['bg0', 'bg1', 'card', 'cardAlpha', 'text1', 'text2', 'text3', 'shadow', 'aurora'].forEach(k => {
        CustomTheme.draft[k] = d0[k];
      });
      CustomTheme.saveNow(); /* applyTheme re-clones the draft from storage */
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls();
      return;
    }
    if (e.target.closest('#st-duplicate')) {
      CustomTheme.duplicate();
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls(); studioRenderChips();
      return;
    }
    if (e.target.closest('#st-delete')) {
      if (CustomTheme.removeActive()) {
        if (typeof applyTheme === 'function') applyTheme();
        studioSyncControls(); studioRenderChips();
        if (typeof toast === 'function') toast(t('studio_deleted'));
      }
      return;
    }
    if (e.target.closest('#st-reset')) {
      CustomTheme.resetDraft();
      if (typeof applyTheme === 'function') applyTheme();
      studioSyncControls();
      return;
    }
    if (e.target.closest('#st-random')) {
      CustomTheme.randomize();
      studioSyncControls();
      return;
    }
    if (e.target.closest('#st-done') || e.target.closest('#studio-close')) { closeThemeStudio(); return; }
  });
  studioEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeThemeStudio(); }
  });
}

function openThemeStudio() {
  CustomTheme.ensureLoaded();
  /* The studio always edits the custom theme — entering activates it.
     Done directly (not gated on the previous state.theme) so activation
     can never silently no-op: whatever path led here, the open studio
     always ends with the draft painted. */
  state.theme = 'custom';
  try { store.set('livesky:theme', 'custom'); } catch (e) { /* ignore */ }
  if (typeof applyTheme === 'function') { try { applyTheme(); } catch (e) { /* fall through to the local pass */ } }
  if (!document.documentElement.dataset.custom) {
    /* ancient/mixed shell without a custom-aware applyTheme: do it here */
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
  /* belt-and-braces: whatever path led here, the open studio paints the draft */
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

/* Late-boot repair: 10-bootstrap's init() runs before this module is parsed,
   so a stored custom theme is never painted at boot (dataset.theme is left
   as the literal 'custom' with no variables). Repair it now — still
   synchronously during page load. */
try {
  if (typeof state !== 'undefined' && state.theme === 'custom' && typeof CustomTheme !== 'undefined') {
    const bootBase = CustomTheme.base();
    document.documentElement.dataset.theme = bootBase;
    if (document.body) document.body.dataset.theme = bootBase;
    document.documentElement.dataset.custom = '1';
    CustomTheme.applyActive();
  }
} catch (e) { /* boot must never fail on theming */ }
