/* ============================================================
   LiveSky Weather Pro — Application Logic
   ============================================================ */
'use strict';

/* ---------------- DOM refs ---------------- */
const $ = (id) => document.getElementById(id);
const el = {
  loader: $('loader'), loaderPhrase: $('loader-phrase'), progress: $('progress'),
  bg1: $('bg-layer-1'), bg2: $('bg-layer-2'), aurora: $('aurora'), fxCanvas: $('fx-canvas'), flash: $('flash'),
  location: $('location'), locationFlag: $('location-flag'), locationAdmin: $('location-admin'),
  date: $('current-date'), clock: $('realtime-clock'), updatedChip: $('updated-chip'), updatedAt: $('updated-at'),
  temp: $('temperature'), cond: $('condition'), bigIcon: $('weather-icon-big'),
  mFeels: $('m-feels'), mWind: $('m-wind'), mWindDir: $('m-wind-dir'), mWindArrow: $('m-wind-arrow'),
  mHum: $('m-hum'), mVis: $('m-vis'), mPress: $('m-press'), mDew: $('m-dew'),
  mUv: $('m-uv'), mUvLabel: $('m-uv-label'), mPrecip: $('m-precip'),
  sunrise: $('sunrise'), sunset: $('sunset'), dayLength: $('day-length'), dayLengthLabel: $('day-length-label'),
  sunArc: $('sun-arc'), sunCard: $('sun-card'),
  aqiRing: $('aqi-ring-fg'), aqiValue: $('aqi-value'), aqiLabel: $('aqi-label'),
  aqiPm25: $('aqi-pm25'), aqiPm10: $('aqi-pm10'), aqiO3: $('aqi-o3'), aqiNo2: $('aqi-no2'),
  chartSvg: $('chart-svg'), chartCols: $('chart-cols'), chartTooltip: $('chart-tooltip'), chartAxis: $('chart-axis'), chartPlot: $('chart-plot'),
  hStrip: $('hourly-strip'), hLeft: $('hourly-left'), hRight: $('hourly-right'),
  dStrip: $('daily-strip'), historyBtn: $('history-btn'),
  alertBox: $('alert-box'), alertMsg: $('alert-msg'), alertTitle: $('alert-title'),
  modal: $('modal'), modalTitle: $('modal-title'), modalSubtitle: $('modal-subtitle'), modalBody: $('modal-body'), modalClose: $('modal-close'),
  mapModal: $('map-modal'), fullMap: $('full-map'), mapClose: $('map-close'), mapInstr: $('map-instr'), mapApply: $('map-apply-btn'), mapSmall: $('map'),
  rainStatus: $('rain-status'), rainStatusText: $('rain-status-text'), moonChip: $('moon-chip'), mPressTrend: $('m-press-trend'),
  toastWrap: $('toast-wrap'),
  searchForm: $('search-form'), input: $('city-input'), autoList: $('autocomplete-list'),
  favBtn: $('fav-btn'), favIcon: $('fav-icon'), searchClear: $('search-clear'),
  menuBtn: $('menu-btn'), mainMenu: $('main-menu'), modelSelect: $('model-select'), unitsSelect: $('units-select'), geoItem: $('geo-item'),
  themeLabel: $('theme-label'), fsIcon: $('fs-icon'), fsItem: $('fs-item'), refreshItem: $('refresh-item'),
  logoBox: $('logo-box'), brand: $('brand'), adviceBtn: $('advice-btn'), mPrecipLabel: $('m-precip-label')
};
/* safe event binding — never crashes if an element is missing */
function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }

/* ---------------- state & storage ---------------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
};

/* migrate legacy storage keys from LiveSky v1 */
try {
  if (!localStorage.getItem('livesky:favorites')) {
    const old = localStorage.getItem('livesky_favorites');
    if (old) {
      const favs = JSON.parse(old);
      localStorage.setItem('livesky:favorites', JSON.stringify(favs.map(f => ({ name: f.name, country: f.country || '', admin: '', lat: f.lat, lon: f.lon }))));
    }
  }
  if (!localStorage.getItem('livesky:last_city')) {
    const old = localStorage.getItem('livesky_last_city');
    if (old) {
      const c = JSON.parse(old);
      localStorage.setItem('livesky:last_city', JSON.stringify({ lat: c.lat, lon: c.lon, name: c.name, cc: c.countryCode || c.cc || '', admin: '' }));
    }
  }
} catch (e) { /* ignore */ }

const state = {
  lang: store.get('livesky:lang', 'ru'),
  theme: store.get('livesky:theme', 'adaptive'),
  units: store.get('livesky:units', 'metric'),
  model: store.get('livesky:model', 'auto'),
  lat: 55.7558, lon: 37.6173,
  locationName: 'Москва', countryCode: 'RU', admin: '',
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  weather: null, air: null,
  nowIdx: 0, todayIdx: 16,
  favorites: store.get('livesky:favorites', []),
  recent: store.get('livesky:recent', []),
  elevation: null, lastFetchTs: Date.now(),
  loading: 0, slowTimer: null,
  lastTemp: null, currentIcon: null,
  fxKind: null, stormTimer: null,
  accent: '#38bdf8', accent2: '#818cf8'
};
let fetchSeq = 0; /* guards against stale/out-of-order responses */

const I18N = window.LIVE_I18N;
const WMO = window.LIVE_WMO;
const LOCALES = { ru: 'ru-RU', en: 'en-US', es: 'es-ES' };
const LOC_SHORT = { ru: 'ru', en: 'en', es: 'es' };
const motionReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function t(key) { const d = I18N[state.lang] || I18N.en; return d[key] != null ? d[key] : key; }
function loc() { return LOCALES[state.lang] || 'en-US'; }

/* ---------------- time helpers ---------------- */
function tzNow(tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const p = {};
    for (const part of fmt.formatToParts(new Date())) if (part.type !== 'literal') p[part.type] = part.value;
    const hour = p.hour === '24' ? '00' : p.hour;
    return { iso: `${p.year}-${p.month}-${p.day}T${hour}:00`, date: `${p.year}-${p.month}-${p.day}`, hour: +hour, minute: +p.minute };
  } catch (e) {
    const d = new Date();
    return { iso: d.toISOString().slice(0, 13) + ':00', date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
}
function parseLocal(iso) { /* treat city-local ISO as wall clock, no TZ shift */
  if (!iso) return null;
  const [d, tm] = iso.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = (tm || '00:00').split(':').map(Number);
  return new Date(y, m - 1, dd, hh || 0, mm || 0);
}
function hhmm(iso) { return iso ? iso.slice(11, 16) : '--:--'; }
function minOfDay(iso) { if (!iso) return 0; const [h, m] = iso.slice(11, 16).split(':').map(Number); return h * 60 + m; }
function fmtDur(totalMin, short) {
  const h = Math.floor(totalMin / 60), m = Math.round(totalMin % 60);
  if (short) return state.lang === 'en' ? `${h}h ${m}m` : state.lang === 'es' ? `${h}h ${m}m` : `${h}ч ${m}м`;
  return state.lang === 'en' ? `${h}h ${m}m` : state.lang === 'es' ? `${h} h ${m} min` : `${h} ч ${m} мин`;
}

/* ---------------- unit formatting ---------------- */
function convTemp(c) { return state.units === 'imperial' ? c * 9 / 5 + 32 : c; }
function fmtTemp(c, withDeg) {
  if (c == null || isNaN(c)) return '--';
  return Math.round(convTemp(c)) + (withDeg ? '°' : '');
}
function fmtTempDeg(c) { return fmtTemp(c) + '°'; }
function fmtWind(ms) {
  if (ms == null || isNaN(ms)) return '--';
  return state.units === 'imperial' ? `${Math.round(ms * 2.23694)} ${t('unit_mph')}` : `${Math.round(ms * 3.6)} ${t('unit_kmh')}`;
}
function fmtVis(m) {
  if (m == null || isNaN(m)) return '--';
  return state.units === 'imperial' ? `${(m / 1609.34).toFixed(1)} ${t('unit_mi')}` : `${(m / 1000).toFixed(1)} ${t('unit_km')}`;
}
function fmtPress(hPa) {
  if (hPa == null || isNaN(hPa)) return '--';
  return state.units === 'imperial' ? `${(hPa * 0.02953).toFixed(2)} ${t('unit_inhg')}` : `${Math.round(hPa)} ${t('unit_hpa')}`;
}
function fmtPrecip(mm) {
  if (mm == null || isNaN(mm)) return '--';
  return state.units === 'imperial' ? `${(mm / 25.4).toFixed(2)} ${t('unit_in')}` : `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} ${t('unit_mm')}`;
}
function windDir(deg) {
  if (deg == null || isNaN(deg)) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return t('w_dir_full_' + dirs[Math.round(deg / 45) % 8]);
}
function uvLabel(u) {
  if (u == null || isNaN(u)) return '';
  if (u < 3) return t('uv_low');
  if (u < 6) return t('uv_moderate');
  if (u < 8) return t('uv_high');
  if (u < 11) return t('uv_very_high');
  return t('uv_extreme');
}
/* temperature colour coding (based on raw °C) */
function tempClass(c) {
  if (c == null || isNaN(c)) return '';
  if (c < 0) return 'temp-frigid';
  if (c < 10) return 'temp-cold';
  if (c < 22) return 'temp-mild';
  if (c < 30) return 'temp-warm';
  return 'temp-hot';
}
/* moon phase */
const MOON_EMOJI = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
const MOON_KEYS = ['moon_new', 'moon_waxing_crescent', 'moon_first_quarter', 'moon_waxing_gibbous', 'moon_full', 'moon_waning_gibbous', 'moon_last_quarter', 'moon_waning_crescent'];
function moonPhaseInfo(date) {
  const synodic = 29.53058867;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const phase = (((date.getTime() - knownNew) / (synodic * 86400000)) % 1 + 1) % 1;
  const idx = Math.round(phase * 8) % 8;
  return { idx, emoji: MOON_EMOJI[idx], label: t(MOON_KEYS[idx]) };
}
function rainSoonNow() {
  if (!state.weather) return false;
  const h = state.weather.hourly;
  const raining = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  for (let k = state.nowIdx; k <= state.nowIdx + 1 && k < h.time.length; k++) {
    const p = getVal(h, 'precipitation_probability', k) || 0;
    const c = getVal(h, 'weathercode', k);
    if (p >= 40 || (raining.includes(c) && p >= 25)) return true;
  }
  return false;
}

const RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
const SNOW_CODES = [71, 73, 75, 77, 85, 86];

/* smart rain status shown right next to the temperature:
   - no rain now → "Вероятность дождя N%"
   - raining now  → "Дождь закончится в 18:00 · ещё 2ч 15м" (scanned from hourly forecast) */
function updateRainStatus() {
  if (!state.weather) { el.rainStatus.classList.add('hidden'); return; }
  const h = state.weather.hourly, i = state.nowIdx;
  const code = getVal(h, 'weathercode', i);
  const snowNow = SNOW_CODES.includes(code);
  const rainingNow = snowNow || RAIN_CODES.includes(code);

  if (!rainingNow) {
    const p = getVal(h, 'precipitation_probability', i) || 0;
    el.rainStatus.classList.remove('hidden', 'snow');
    el.rainStatus.querySelector('i').className = 'ph-fill ph-cloud-rain';
    el.rainStatusText.textContent = t('rain_prob').replace('{p}', Math.round(p));
    return;
  }

  /* find the first dry hour ahead */
  let endIdx = -1;
  for (let k = i + 1; k < Math.min(i + 13, h.time.length); k++) {
    const c = getVal(h, 'weathercode', k);
    const p = getVal(h, 'precipitation_probability', k) || 0;
    if (!RAIN_CODES.includes(c) && !SNOW_CODES.includes(c) && p < 30) { endIdx = k; break; }
  }

  el.rainStatus.classList.remove('hidden');
  el.rainStatus.classList.toggle('snow', snowNow);
  el.rainStatus.querySelector('i').className = 'ph-fill ' + (snowNow ? 'ph-snowflake' : 'ph-cloud-rain');

  let text;
  if (endIdx === -1) {
    text = snowNow ? t('snow_all_day') : t('rain_all_day');
  } else {
    const endHH = h.time[endIdx].slice(11, 16);
    const today = tzNow(state.tz).date;
    const endDate = h.time[endIdx].slice(0, 10);
    const durMin = Math.max(0, Math.round((parseLocal(h.time[endIdx]) - parseLocal(h.time[i])) / 60000));
    const dur = fmtDur(durMin, true);
    const endsKey = snowNow ? 'snow_ends' : 'rain_ends';
    const when = t(endsKey).replace('{t}', endHH) + (endDate !== today ? ` (${t('tomorrow_word')})` : '');
    text = `${when} · ${t('rain_till').replace('{d}', dur)}`;
  }
  el.rainStatusText.textContent = text;
}

/* ---------------- data helpers ---------------- */
function getVal(obj, key, i) {
  if (!obj) return null;
  const candidates = [];
  if (state.model && state.model !== 'auto') candidates.push(`${key}_${state.model}`);
  candidates.push(key, `${key}_best_match`);
  for (const k of candidates) {
    const arr = obj[k];
    if (arr && arr[i] != null) return arr[i];
  }
  return null;
}
function currentWeatherCode() {
  if (!state.weather) return null;
  return getVal(state.weather.hourly, 'weathercode', state.nowIdx);
}
function hourIsNight(i) {
  const h = state.weather && state.weather.hourly;
  if (!h) return false;
  const day = getVal(h, 'is_day', i);
  if (day === 0) return true;
  if (day === 1) return false;
  /* fallback: compare with sunrise/sunset minutes */
  const d = state.weather.daily;
  const hh = parseInt(h.time[i].slice(11, 13), 10);
  const sr = minOfDay(getVal(d, 'sunrise', state.todayIdx));
  const ss = minOfDay(getVal(d, 'sunset', state.todayIdx));
  const nowMin = hh * 60;
  return nowMin < sr || nowMin >= ss;
}
function isDayNow() {
  if (!state.weather) return true;
  const day = getVal(state.weather.hourly, 'is_day', state.nowIdx);
  if (day === 0) return false;
  if (day === 1) return true;
  return !hourIsNight(state.nowIdx);
}
function wmo(code) { return WMO[code] || WMO[0]; }
function wmoLabel(code) {
  const w = wmo(code);
  return w.label[state.lang] || w.label.en;
}
function wmoIcon(code, night) {
  const w = wmo(code);
  return night ? (w.night || w.icon) : w.icon;
}

/* ---------------- loader / progress / toasts ---------------- */
let phraseTimer = null;
let loaderWatchdog = null;
const WATCHDOG_MS = window.LIVE_WATCHDOG_MS || 15000;
const FETCH_MS = window.LIVE_FETCH_TIMEOUT_MS || 15000;

/* fetch that can never hang forever */
async function fetchWithTimeout(url, ms) {
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms || FETCH_MS) : null;
  try {
    return await fetch(url, ctrl ? { signal: ctrl.signal } : {});
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function showLoader() {
  el.loader.classList.remove('done');
  if (!phraseTimer) {
    const setPhrase = () => {
      const ph = t('loading_phrases');
      el.loaderPhrase.classList.add('swap');
      setTimeout(() => {
        el.loaderPhrase.textContent = ph[Math.floor(Math.random() * ph.length)];
        el.loaderPhrase.classList.remove('swap');
      }, 300);
    };
    setPhrase();
    phraseTimer = setInterval(setPhrase, 2600);
  }
  /* watchdog: the loader must never stay on screen forever */
  clearTimeout(loaderWatchdog);
  loaderWatchdog = setTimeout(() => {
    if (state._bootFailed || state.weather) return;
    console.warn('LiveSky: loading watchdog fired — falling back');
    hideLoader();
    toast(t('toast_network'), 'error', t('toast_retry'), () => fetchWeather());
    if (!state.weather) fetchWeather();
  }, WATCHDOG_MS);
}
function hideLoader() {
  if (phraseTimer) { clearInterval(phraseTimer); phraseTimer = null; }
  clearTimeout(loaderWatchdog);
  el.loader.classList.add('done');
}
function bootFail(msg) {
  if (state._bootFailed) return;
  state._bootFailed = true;
  console.error('LiveSky boot error:', msg);
  hideLoader();
  el.progress.classList.remove('on');
  const panel = $('boot-error');
  if (panel) {
    panel.classList.remove('hidden');
    const m = $('boot-error-msg');
    if (m) m.textContent = String(msg || '').slice(0, 200);
  }
}
function setLoading(on) {
  state.loading = Math.max(0, state.loading + (on ? 1 : -1));
  el.progress.classList.toggle('on', state.loading > 0);
  if (on && !state.slowTimer) {
    state.slowTimer = setTimeout(() => {
      if (state.loading > 0) toast(t('toast_loading_slow'), 'info');
      state.slowTimer = null;
    }, 9000);
  }
}

function toast(msg, type, actionLabel, actionFn) {
  if (state.toastCount >= 3) return; /* keep max 3 on screen */
  const node = document.createElement('div');
  node.className = `toast ${type || 'info'}`;
  const icons = { info: 'ph-info', error: 'ph-warning-circle', success: 'ph-check-circle' };
  node.innerHTML = `<span class="t-ico"><i class="ph-fill ${icons[type] || 'ph-info'}"></i></span><span>${msg}</span>`;
  if (actionLabel && actionFn) {
    const a = document.createElement('button');
    a.className = 't-action';
    a.textContent = actionLabel;
    a.onclick = () => { actionFn(); dismiss(); };
    node.appendChild(a);
  }
  el.toastWrap.appendChild(node);
  state.toastCount = (state.toastCount || 0) + 1;
  const dismiss = () => {
    if (node._gone) return;
    node._gone = true;
    node.classList.add('out');
    setTimeout(() => node.remove(), 320);
    state.toastCount = Math.max(0, (state.toastCount || 1) - 1);
  };
  setTimeout(dismiss, type === 'error' ? 5200 : 3600);
}

/* ---------------- clock ---------------- */
let clockInterval = null;
function clockTick() {
  const now = new Date();
  try {
    el.clock.textContent = now.toLocaleTimeString(loc(), { timeZone: state.tz, hour: '2-digit', minute: '2-digit' });
    el.date.textContent = now.toLocaleDateString(loc(), { timeZone: state.tz, weekday: 'long', day: 'numeric', month: 'long' });
  } catch (e) {
    el.clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockTick();
  clockInterval = setInterval(clockTick, 1000);
}

/* ---------------- number animation ---------------- */
let countRaf = 0;
function animateNumber(node, to) {
  if (motionReduce || node.dataset.v == null) { node.textContent = to + '°'; node.dataset.v = to; return; }
  const from = parseFloat(node.dataset.v) || 0;
  node.dataset.v = to;
  if (from === to) { node.textContent = to + '°'; return; }
  cancelAnimationFrame(countRaf);
  const t0 = performance.now(), dur = 800;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = Math.round(from + (to - from) * e) + '°';
    if (k < 1) countRaf = requestAnimationFrame(step);
  };
  countRaf = requestAnimationFrame(step);
}
function setBigIcon(iconClass) {
  if (el.bigIcon.dataset.icon === iconClass) return;
  el.bigIcon.dataset.icon = iconClass;
  const icon = el.bigIcon.querySelector('i');
  if (icon && !motionReduce) {
    icon.classList.add('swap-out');
    setTimeout(() => { el.bigIcon.innerHTML = `<i class="ph-duotone ${iconClass}"></i>`; }, 280);
  } else {
    el.bigIcon.innerHTML = `<i class="ph-duotone ${iconClass}"></i>`;
  }
}

/* ---------------- data fetching ---------------- */
async function fetchWeather(silent) {
  const seq = ++fetchSeq;
  if (!silent) setLoading(true);
  try {
    const params = new URLSearchParams({
      latitude: state.lat, longitude: state.lon,
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weathercode,windspeed_10m,windgusts_10m,winddirection_10m,relativehumidity_2m,surface_pressure,dewpoint_2m,visibility,uv_index,is_day',
      daily: 'weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,uv_index_max,windspeed_10m_max,winddirection_10m_dominant',
      timezone: 'auto', forecast_days: 16, past_days: 16
    });
    if (state.model && state.model !== 'auto') params.append('models', `${state.model},best_match`);

    const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, FETCH_MS);
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    if (!data || !data.hourly || !data.daily) throw new Error('Bad payload');
    if (seq !== fetchSeq) return; /* a newer request is in flight */

    if (data.timezone) state.tz = data.timezone;
    if (data.elevation != null) state.elevation = Math.round(data.elevation);
    state.weather = data;
    state.nowIdx = data.hourly.time.findIndex(tm => tm.startsWith(tzNow(state.tz).iso));
    if (state.nowIdx === -1) state.nowIdx = data.hourly.time.length - 25;
    state.todayIdx = data.daily.time.findIndex(tm => tm === tzNow(state.tz).date);
    if (state.todayIdx === -1) state.todayIdx = 16;
    state.lastFetchTs = Date.now();

    store.set('livesky:last_city', { lat: state.lat, lon: state.lon, name: state.locationName, cc: state.countryCode, admin: state.admin });
    renderAll();
    updateMap();
    fetchAir(seq);
  } catch (e) {
    if (seq !== fetchSeq) return;
    console.error('fetchWeather failed:', e);
    if (!silent) toast(t('toast_network'), 'error', t('toast_retry'), () => fetchWeather());
  } finally {
    if (seq !== fetchSeq) return;
    if (!silent) setLoading(false);
    hideLoader();
  }
}

async function fetchAir(seq) {
  try {
    const res = await fetchWithTimeout(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${state.lat}&longitude=${state.lon}&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,european_aqi&timezone=auto`, 12000);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.hourly) return;
    if (seq && seq !== fetchSeq) return;
    state.air = data;
    renderAir();
  } catch (e) { /* non-critical */ }
}

/* ---------------- geo ---------------- */
async function reverseGeo(lat, lon) {
  try {
    const r = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=${state.lang}`, 8000);
    if (r.ok) {
      const d = await r.json();
      if (d && d.address) {
        const a = d.address;
        const road = a.road || a.pedestrian || a.street || a.square || '';
        const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.city_district || a.municipality || '';
        state.locationName = (city && road) ? `${city}, ${road}` : (city || road || d.name || 'Unknown location');
        state.countryCode = (a.country_code || '').toUpperCase();
        state.admin = [a.state || a.region, a.country].filter(Boolean).join(', ');
        return;
      }
    }
  } catch (e) { console.warn('Nominatim failed', e); }
  try {
    const r = await fetchWithTimeout(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${state.lang}`, 8000);
    const d = await r.json();
    state.locationName = d.city || d.locality || d.principalSubdivision || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    state.countryCode = (d.countryCode || '').toUpperCase();
    state.admin = d.principalSubdivision || '';
  } catch (e) {
    state.locationName = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    state.countryCode = '';
    state.admin = '';
  }
}

let geoWarned = false;
function getUserLocation(notify) {
  showLoader();
  if (!navigator.geolocation) { fetchWeather(); return; }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      state.lat = pos.coords.latitude;
      state.lon = pos.coords.longitude;
      await reverseGeo(state.lat, state.lon);
      if (notify) toast(t('toast_loc_set'), 'success');
      fetchWeather();
    },
    () => {
      if (!geoWarned) { geoWarned = true; toast(t('toast_geo_denied'), 'info'); }
      fetchWeather();
    },
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 300000 }
  );
}

/* ---------------- rendering ---------------- */
function renderAll() {
  applyWeatherTheme();
  updateHero();
  updateMetrics();
  renderSunArc();
  renderChart();
  renderHourly();
  renderDaily();
  renderAlerts();
  updateFavIcon();
  document.title = `${state.locationName} · LiveSky`;
}

function updateHero() {
  el.location.textContent = state.locationName;
  el.locationFlag.classList.toggle('hidden', !state.countryCode);
  if (state.countryCode) el.locationFlag.src = `https://flagcdn.com/w40/${state.countryCode.toLowerCase()}.png`;
  let adminLine = state.admin || '';
  if (state.elevation != null) {
    const elev = state.units === 'imperial'
      ? `${Math.round(state.elevation * 3.28084)} ft`
      : `${state.elevation} ${state.lang === 'ru' ? 'м' : 'm'}`;
    adminLine = adminLine ? `${adminLine} · ${elev}` : elev;
  }
  el.locationAdmin.textContent = adminLine;
  el.locationAdmin.classList.toggle('hidden', !adminLine);

  const h = state.weather.hourly, i = state.nowIdx;
  const temp = getVal(h, 'temperature_2m', i);
  const code = getVal(h, 'weathercode', i);
  const feels = getVal(h, 'apparent_temperature', i);
  const night = hourIsNight(i);

  el.temp.className = 'temp-num' + (tempClass(temp) ? ' ' + tempClass(temp) : '');
  if (temp == null || isNaN(temp)) { el.temp.textContent = '--'; delete el.temp.dataset.v; }
  else animateNumber(el.temp, Math.round(convTemp(temp)));
  el.cond.textContent = wmoLabel(code);
  setBigIcon(wmoIcon(code, night));
  updateRainStatus();

  const now = tzNow(state.tz);
  el.updatedAt.textContent = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
  el.updatedChip.classList.remove('hidden');
  clockTick();
}

function updateMetrics() {
  const h = state.weather.hourly, i = state.nowIdx;
  el.mFeels.textContent = fmtTempDeg(getVal(h, 'apparent_temperature', i));
  updateWindTile();
  el.mHum.textContent = getVal(h, 'relativehumidity_2m', i) != null ? Math.round(getVal(h, 'relativehumidity_2m', i)) + '%' : '--';
  el.mVis.textContent = fmtVis(getVal(h, 'visibility', i));
  const pNow = getVal(h, 'surface_pressure', i);
  el.mPress.textContent = fmtPress(pNow);
  const pPrev = i - 3 >= 0 ? getVal(h, 'surface_pressure', i - 3) : null;
  let trend = '';
  if (pNow != null && pPrev != null) {
    const diff = pNow - pPrev;
    if (diff > 0.5) trend = '↗ ' + t('press_rising');
    else if (diff < -0.5) trend = '↘ ' + t('press_falling');
  }
  el.mPressTrend.textContent = trend;
  el.mDew.textContent = fmtTempDeg(getVal(h, 'dewpoint_2m', i));
  const uv = getVal(h, 'uv_index', i);
  el.mUv.textContent = uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) : '--';
  el.mUvLabel.textContent = uvLabel(uv);
  /* precipitation: "today" (rest of the local day), falling back to 24h near midnight */
  const now = tzNow(state.tz);
  const hoursLeftToday = 24 - now.hour;
  let maxToday = null;
  for (let k = i; k < h.time.length && h.time[k].slice(0, 10) === now.date; k++) {
    const p = getVal(h, 'precipitation_probability', k);
    if (p != null && (maxToday == null || p > maxToday)) maxToday = p;
  }
  let maxP = null;
  for (let k = i; k < i + 24 && k < h.time.length; k++) {
    const p = getVal(h, 'precipitation_probability', k);
    if (p != null && (maxP == null || p > maxP)) maxP = p;
  }
  if (hoursLeftToday >= 6 && maxToday != null) {
    if (el.mPrecipLabel) el.mPrecipLabel.textContent = t('rain_today');
    el.mPrecip.textContent = Math.round(maxToday) + '%';
  } else {
    if (el.mPrecipLabel) el.mPrecipLabel.textContent = t('rain_24h');
    el.mPrecip.textContent = maxP != null ? Math.round(maxP) + '%' : '--';
  }
}

/* wind tile: full direction word + gusts, no cryptic abbreviations */
function updateWindTile() {
  const h = state.weather.hourly, i = state.nowIdx;
  const wind = getVal(h, 'windspeed_10m', i);
  const dir = getVal(h, 'winddirection_10m', i);
  const gust = getVal(h, 'windgusts_10m', i);
  el.mWind.textContent = fmtWind(wind);
  const parts = [];
  const dirFull = windDir(dir);
  if (dirFull) parts.push(dirFull);
  if (gust != null && gust > 0.1) parts.push(t('wind_gusts') + ' ' + fmtWind(gust));
  el.mWindDir.textContent = parts.join(' · ');
  el.mWindArrow.style.transform = `rotate(${(dir || 45) - 45}deg)`;
}

/* ---------- sun arc ---------- */
const SUN_P0 = [14, 104], SUN_P1 = [110, -40], SUN_P2 = [206, 104];
function qPoint(t) {
  const u = 1 - t;
  return [u * u * SUN_P0[0] + 2 * u * t * SUN_P1[0] + t * t * SUN_P2[0],
          u * u * SUN_P0[1] + 2 * u * t * SUN_P1[1] + t * t * SUN_P2[1]];
}
function renderSunArc() {
  const d = state.weather.daily;
  const srIso = getVal(d, 'sunrise', state.todayIdx);
  const ssIso = getVal(d, 'sunset', state.todayIdx);
  el.sunrise.textContent = hhmm(srIso);
  el.sunset.textContent = hhmm(ssIso);

  const srMin = minOfDay(srIso), ssMin = minOfDay(ssIso);
  const dayLen = Math.max(0, ssMin - srMin);
  el.dayLength.textContent = fmtDur(dayLen, true);
  el.dayLengthLabel.dataset.translate = 'day_length';
  el.dayLengthLabel.textContent = t('day_length');

  const now = tzNow(state.tz);
  const nowMin = now.hour * 60 + now.minute;
  const p = (nowMin - srMin) / (dayLen || 1);
  const isDay = p >= 0 && p <= 1;

  let svg = `
    <defs>
      <linearGradient id="sunGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#fb923c"/>
      </linearGradient>
      <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#fb923c"/><stop offset="100%" stop-color="#818cf8"/>
      </linearGradient>
      <mask id="moonMask"><rect width="220" height="118" fill="#fff"/><circle cx="117" cy="30" r="9.5" fill="#000"/></mask>
    </defs>
    <line class="sun-base" x1="10" y1="104" x2="210" y2="104" stroke-width="1" stroke-dasharray="3 5" opacity="0.6"/>
    <path class="arc-track" d="M ${SUN_P0[0]} ${SUN_P0[1]} Q ${SUN_P1[0]} ${SUN_P1[1]} ${SUN_P2[0]} ${SUN_P2[1]}"
      fill="none" stroke-width="2.5" stroke-linecap="round" opacity="0.45"
      style="transition: opacity .3s"/>`;

  if (isDay) {
    const sun = qPoint(p);
    /* partial arc up to the sun */
    const c1 = [SUN_P0[0] + (SUN_P1[0] - SUN_P0[0]) * p, SUN_P0[1] + (SUN_P1[1] - SUN_P0[1]) * p];
    const mid = [SUN_P1[0] + (SUN_P2[0] - SUN_P1[0]) * p, SUN_P1[1] + (SUN_P2[1] - SUN_P1[1]) * p];
    const c2 = [c1[0] + (mid[0] - c1[0]) * p, c1[1] + (mid[1] - c1[1]) * p];
    svg += `<path d="M ${SUN_P0[0]} ${SUN_P0[1]} C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${sun[0].toFixed(1)} ${sun[1].toFixed(1)}"
      fill="none" stroke="url(#arcGrad)" stroke-width="3.5" stroke-linecap="round"/>`;
    svg += `<circle cx="${sun[0].toFixed(1)}" cy="${sun[1].toFixed(1)}" r="15" fill="#fb923c" opacity="0.18"/>`;
    svg += `<circle cx="${sun[0].toFixed(1)}" cy="${sun[1].toFixed(1)}" r="8" fill="url(#sunGrad)" stroke="#fff" stroke-width="1.6"/>`;
  } else {
    /* night: moon on the arc */
    svg += `<circle class="moon-body" cx="106" cy="32" r="12" mask="url(#moonMask)" opacity="0.95"/>`;
    svg += `<circle cx="70" cy="12" r="1.3" fill="#e2e8f0" opacity="0.8"/><circle cx="150" cy="8" r="1" fill="#e2e8f0" opacity="0.6"/><circle cx="178" cy="20" r="1.4" fill="#e2e8f0" opacity="0.7"/>`;
    let label;
    if (p < 0) { label = `${fmtDur(srMin - nowMin, true)} ${t('hours_to_sunrise')}`; }
    else { label = `${fmtDur(nowMin - ssMin, true)} ${t('hours_after_sunset')}`; }
    el.dayLengthLabel.dataset.translate = '';
    el.dayLengthLabel.textContent = label;
  }

  /* moon phase chip (night only) */
  const moon = moonPhaseInfo(new Date());
  if (!isDay) {
    el.moonChip.textContent = `${moon.emoji} ${moon.label}`;
    el.moonChip.classList.remove('hidden');
  } else {
    el.moonChip.classList.add('hidden');
  }

  el.sunArc.innerHTML = svg;
}

/* ---------- 24h chart ---------- */
function smoothPath(pts) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let chartData = [];
function renderChart() {
  const h = state.weather.hourly;
  const n = 24, start = state.nowIdx;
  const temps = [], precs = [], times = [];
  let tmin = Infinity, tmax = -Infinity, pmax = 0;
  for (let k = 0; k <= n; k++) {
    const i = start + k;
    if (i >= h.time.length) break;
    const tv = getVal(h, 'temperature_2m', i);
    const pv = getVal(h, 'precipitation', i) || 0;
    times.push(h.time[i]);
    temps.push(tv); precs.push(pv);
    if (tv != null) { if (tv < tmin) tmin = tv; if (tv > tmax) tmax = tv; }
    if (pv > pmax) pmax = pv;
  }
  const m = temps.length;
  if (!m || !isFinite(tmin)) return;
  if (tmax - tmin < 2) { tmax += 1; tmin -= 1; }
  const pad = (tmax - tmin) * 0.18;
  tmin -= pad; tmax += pad;
  pmax = Math.max(pmax, 2.5);

  const X = k => (k / n) * 100;
  const Y = v => 8 + (1 - (v - tmin) / (tmax - tmin)) * 84;
  const pts = [];
  for (let k = 0; k < m; k++) if (temps[k] != null) pts.push([X(k), Y(temps[k])]);
  const line = smoothPath(pts);
  const area = `${line} L ${X(m - 1).toFixed(2)} 100 L 0 100 Z`;

  let bars = '';
  for (let k = 0; k < m; k++) {
    const ph = Math.min(1, precs[k] / pmax) * 26;
    if (ph <= 0.4) continue;
    const bw = (100 / n) * 0.52;
    bars += `<rect x="${(X(k) - bw / 2).toFixed(2)}" y="${(100 - ph).toFixed(2)}" width="${bw.toFixed(2)}" height="${ph.toFixed(2)}" rx="2" fill="#60a5fa" opacity="0.55"/>`;
  }

  /* grid lines */
  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const y = 8 + g * 21;
    grid += `<line class="grid-line" x1="0" y1="${y}" x2="100" y2="${y}"/>`;
  }

  el.chartSvg.innerHTML = `
    <defs>
      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${state.accent}"/><stop offset="100%" stop-color="${state.accent2}"/>
      </linearGradient>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${hexToRgba(state.accent, 0.30)}"/><stop offset="100%" stop-color="${hexToRgba(state.accent, 0)}"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#areaGrad)"/>
    <path d="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <line x1="${X(0).toFixed(2)}" y1="5" x2="${X(0).toFixed(2)}" y2="100" stroke="${state.accent}" stroke-width="0.7" opacity="0.3"/>
    ${bars}`;

  /* hover columns */
  el.chartCols.innerHTML = '';
  chartData = [];
  for (let k = 0; k < m; k++) {
    const col = document.createElement('div');
    col.className = 'chart-col';
    const i = start + k;
    const tv = getVal(h, 'temperature_2m', i);
    const pv = getVal(h, 'precipitation', i) || 0;
    const wv = getVal(h, 'windspeed_10m', i);
    const gv = getVal(h, 'windgusts_10m', i);
    const hv = getVal(h, 'relativehumidity_2m', i);
    chartData.push({ k, i, time: times[k], temp: tv, prec: pv, wind: wv, gust: gv, hum: hv });
    col.addEventListener('mouseenter', () => showChartTip(k));
    col.addEventListener('mousemove', () => showChartTip(k));
    col.addEventListener('click', () => showModalHourly(state.weather.hourly, i));
    el.chartCols.appendChild(col);
  }
  el.chartCols.onmouseleave = () => el.chartTooltip.classList.add('hidden');

  /* axis labels every 6 hours */
  let axis = '';
  for (let k = 0; k <= n; k += 6) {
    const i = start + k;
    const hr = i < h.time.length ? parseInt(h.time[i].slice(11, 13), 10) : 0;
    axis += `<span>${k === 0 ? t('now') : String(hr).padStart(2, '0') + ':00'}</span>`;
  }
  el.chartAxis.innerHTML = axis;
}

function showChartTip(k) {
  const d = chartData[k];
  if (!d) return;
  const hr = parseInt(d.time.slice(11, 13), 10);
  const when = k === 0 ? t('now') : `${String(hr).padStart(2, '0')}:00`;
  el.chartTooltip.innerHTML = `
    <div class="tt-time">${when}</div>
    <div class="tt-row"><span>${t('temp')}</span><b class="tt-temp">${fmtTempDeg(d.temp)}</b></div>
    <div class="tt-row"><span>${t('precip')}</span><b>${fmtPrecip(d.prec)}</b></div>
    <div class="tt-row"><span>${t('wind')}</span><b>${fmtWind(d.wind)}</b></div>
    ${d.gust != null && d.gust > 0.1 ? `<div class="tt-row"><span>${t('wind_gusts')}</span><b>${fmtWind(d.gust)}</b></div>` : ''}
    <div class="tt-row"><span>${t('humidity')}</span><b>${d.hum != null ? Math.round(d.hum) + '%' : '--'}</b></div>`;
  /* clamp so the tooltip never clips at chart edges */
  const pct = Math.min(90, Math.max(10, ((k + 0.5) / chartData.length) * 100));
  el.chartTooltip.style.left = `${pct}%`;
  el.chartTooltip.classList.remove('hidden');
}

/* ---------- hourly strip ---------- */
function renderHourly() {
  const h = state.weather.hourly;
  el.hStrip.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let k = 0; k < 24; k++) {
    const i = state.nowIdx + k;
    if (i >= h.time.length) break;
    const hr = parseInt(h.time[i].slice(11, 13), 10);
    const code = getVal(h, 'weathercode', i);
    const temp = getVal(h, 'temperature_2m', i);
    const prob = getVal(h, 'precipitation_probability', i);
    const night = hourIsNight(i);
    const isNow = k === 0;

    const item = document.createElement('div');
    item.className = 'hour-item' + (isNow ? ' active' : '');
    item.innerHTML = `
      <span class="h-time">${isNow ? t('now') : String(hr).padStart(2, '0') + ':00'}</span>
      <i class="ph-duotone ${wmoIcon(code, night)} h-icon w-${wmo(code).type}"></i>
      <span class="h-temp">${fmtTemp(temp)}°</span>
      <span class="h-rain" style="${prob == null || prob < 5 ? 'opacity:.45' : ''}"><i class="ph-fill ph-drop"></i>${prob != null ? Math.round(prob) : 0}%</span>`;
    item.title = `${h.time[i].slice(11, 16)} · ${wmoLabel(code)}`;
    item.addEventListener('click', () => showModalHourly(h, i));
    frag.appendChild(item);
  }
  el.hStrip.appendChild(frag);
}

/* ---------- daily ---------- */
function renderDaily() {
  const d = state.weather.daily;
  const start = state.todayIdx;
  const days = [];
  let tmin = Infinity, tmax = -Infinity;
  for (let k = 0; k < 7; k++) {
    const i = start + k;
    if (i >= d.time.length) break;
    const mn = getVal(d, 'temperature_2m_min', i), mx = getVal(d, 'temperature_2m_max', i);
    if (mn < tmin) tmin = mn;
    if (mx > tmax) tmax = mx;
    days.push(i);
  }
  const span = Math.max(1, tmax - tmin);

  el.dStrip.innerHTML = '';
  const frag = document.createDocumentFragment();
  days.forEach((i, k) => {
    const dt = parseLocal(d.time[i]);
    const wd = dt.toLocaleDateString(loc(), { weekday: 'short' }).replace('.', '');
    const wdCap = wd.charAt(0).toUpperCase() + wd.slice(1);
    const code = getVal(d, 'weathercode', i);
    const mx = getVal(d, 'temperature_2m_max', i);
    const mn = getVal(d, 'temperature_2m_min', i);
    const prob = getVal(d, 'precipitation_probability_max', i);
    const isToday = k === 0;
    const left = ((mn - tmin) / span) * 100;
    const width = Math.max(8, ((mx - mn) / span) * 100);

    const item = document.createElement('div');
    item.className = 'day-card' + (isToday ? ' today' : '');
    item.innerHTML = `
      <span class="d-weekday">${isToday ? t('today') : wdCap}</span>
      <span class="d-date">${dt.getDate()} ${dt.toLocaleDateString(loc(), { month: 'short' }).replace('.', '')}</span>
      <i class="ph-duotone ${wmoIcon(code, false)} d-icon w-${wmo(code).type}"></i>
      <div class="d-temps"><span class="tmax">${fmtTemp(mx)}°</span><span class="tmin">${fmtTemp(mn)}°</span></div>
      <div class="d-range"><i style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i></div>
      <span class="d-rain ${prob == null || prob < 5 ? 'zero' : ''}"><i class="ph-fill ph-drop"></i>${prob != null ? Math.round(prob) : 0}%</span>`;
    item.addEventListener('click', () => showModalDaily(d, i));
    frag.appendChild(item);
  });

  const more = document.createElement('button');
  more.className = 'day-more';
  more.innerHTML = `<i class="ph ph-calendar-plus"></i><span data-translate="more_days">${t('more_days')}</span>`;
  more.addEventListener('click', () => showMonthly('forecast'));
  frag.appendChild(more);

  el.dStrip.appendChild(frag);
}

/* ---------- alerts ---------- */
function renderAlerts() {
  const h = state.weather.hourly, i = state.nowIdx;
  const wind = getVal(h, 'windspeed_10m', i) || 0;
  const feels = getVal(h, 'apparent_temperature', i);
  const code = getVal(h, 'weathercode', i);
  const vis = getVal(h, 'visibility', i);
  const msgs = [];
  if (wind >= 18) msgs.push(t('alert_wind'));
  if ([95, 96, 99].includes(code)) msgs.push(t('alert_storm'));
  if (feels != null && feels <= -25) msgs.push(t('alert_cold'));
  if (feels != null && feels >= 37) msgs.push(t('alert_heat'));
  if (vis != null && vis < 1000) msgs.push(t('alert_fog'));
  if (msgs.length) {
    el.alertMsg.textContent = msgs.join(' · ');
    el.alertBox.classList.remove('hidden');
  } else {
    el.alertBox.classList.add('hidden');
  }
}

/* ---------- air quality ---------- */
const AQI_LEVELS = [
  { max: 20, color: '#34d399', label: 'aqi_good' },
  { max: 40, color: '#84cc16', label: 'aqi_fair' },
  { max: 60, color: '#fbbf24', label: 'aqi_moderate' },
  { max: 80, color: '#fb923c', label: 'aqi_poor' },
  { max: 100, color: '#f87171', label: 'aqi_very_poor' },
  { max: Infinity, color: '#c084fc', label: 'aqi_extreme' }
];
function renderAir() {
  if (!state.air) return;
  const h = state.air.hourly;
  const nowIso = tzNow(state.tz).iso;
  let idx = h.time.findIndex(tm => tm === nowIso);
  if (idx === -1) idx = h.time.length - 1;
  while (idx >= 0 && getVal(h, 'european_aqi', idx) == null) idx--;
  if (idx < 0) return;
  const aqi = getVal(h, 'european_aqi', idx);
  const lvl = AQI_LEVELS.find(l => aqi <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
  const C = 263.9;
  el.aqiRing.style.stroke = lvl.color;
  el.aqiRing.style.strokeDashoffset = String(C * (1 - Math.min(aqi, 120) / 120));
  el.aqiValue.textContent = Math.round(aqi);
  el.aqiValue.style.color = lvl.color;
  el.aqiLabel.textContent = t(lvl.label);
  el.aqiPm25.textContent = getVal(h, 'pm2_5', idx) != null ? Math.round(getVal(h, 'pm2_5', idx)) + ' µg/m³' : '--';
  el.aqiPm10.textContent = getVal(h, 'pm10', idx) != null ? Math.round(getVal(h, 'pm10', idx)) + ' µg/m³' : '--';
  el.aqiO3.textContent = getVal(h, 'ozone', idx) != null ? Math.round(getVal(h, 'ozone', idx)) + ' µg/m³' : '--';
  el.aqiNo2.textContent = getVal(h, 'nitrogen_dioxide', idx) != null ? Math.round(getVal(h, 'nitrogen_dioxide', idx)) + ' µg/m³' : '--';
}

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
    FX.stop(); stopStorm();
    state.accent = '#7c3aed'; state.accent2 = '#06b6d4';
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
  FX.start(fx);

  if (type === 'storm') startStorm(); else stopStorm();
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
  parts: [], kind: null, raf: 0, last: 0, w: 0, h: 0, dpr: 1, shoot: null,
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
    const n = { rain: 110, snow: 85, stars: 110, clouds: 5, fog: 6 }[this.kind] || 0;
    for (let i = 0; i < n; i++) {
      if (this.kind === 'rain') this.parts.push({ x: Math.random() * this.w, y: Math.random() * this.h, len: 14 + Math.random() * 18, sp: 780 + Math.random() * 420, a: 0.18 + Math.random() * 0.25 });
      else if (this.kind === 'snow') this.parts.push({ x: Math.random() * this.w, y: Math.random() * this.h, r: 1 + Math.random() * 2.4, sp: 26 + Math.random() * 34, ph: Math.random() * Math.PI * 2, sw: 18 + Math.random() * 22, a: 0.5 + Math.random() * 0.4 });
      else if (this.kind === 'stars') this.parts.push({ x: Math.random() * this.w, y: Math.random() * this.h * 0.72, r: Math.random() * 1.5 + 0.4, tw: 0.6 + Math.random() * 2.2, ph: Math.random() * Math.PI * 2 });
      else if (this.kind === 'clouds') this.parts.push({ x: Math.random() * this.w, y: 20 + Math.random() * this.h * 0.5, w: 220 + Math.random() * 320, sp: 8 + Math.random() * 16, a: 0.05 + Math.random() * 0.07 });
      else if (this.kind === 'fog') this.parts.push({ x: Math.random() * this.w, y: this.h * (0.3 + Math.random() * 0.6), w: this.w * (0.7 + Math.random() * 0.6), sp: 10 + Math.random() * 22, a: 0.05 + Math.random() * 0.05 });
    }
    this.shoot = null;
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

/* ---------------- favorites ---------------- */
function toggleFavorite() {
  if (!state.locationName) return;
  const idx = state.favorites.findIndex(f => f.name === state.locationName && f.lat === state.lat);
  if (idx > -1) {
    state.favorites.splice(idx, 1);
    toast(t('toast_fav_removed'), 'info');
  } else {
    state.favorites.push({ name: state.locationName, country: state.countryCode, admin: state.admin, lat: state.lat, lon: state.lon });
    toast(t('toast_fav_added'), 'success');
  }
  store.set('livesky:favorites', state.favorites);
  updateFavIcon();
}
function updateFavIcon() {
  const isFav = state.favorites.some(f => f.name === state.locationName && f.lat === state.lat);
  el.favIcon.classList.toggle('ph-fill', isFav);
  el.favBtn.classList.toggle('fav-on', isFav);
}

/* ---------------- search ---------------- */
let searchTimer = null;
function saveRecent() {
  state.recent = state.recent.filter(r => !(r.name === state.locationName && r.lat === state.lat));
  state.recent.unshift({ name: state.locationName, country: state.countryCode, admin: state.admin, lat: state.lat, lon: state.lon });
  state.recent = state.recent.slice(0, 5);
  store.set('livesky:recent', state.recent);
}
function selectCity(c, isFav) {
  state.lat = c.lat; state.lon = c.lon;
  state.locationName = c.name;
  state.countryCode = c.country || '';
  state.admin = c.admin || '';
  saveRecent();
  closeAutocomplete();
  el.input.value = '';
  el.searchClear.classList.add('hidden');
  el.input.blur();
  fetchWeather();
}
function closeAutocomplete() {
  el.autoList.classList.add('hidden');
  acIndex = -1;
  acSeq++; /* invalidate any in-flight autocomplete response */
}
/* keyboard navigation inside autocomplete list */
let acIndex = -1;
function acMove(dir) {
  const items = [...el.autoList.querySelectorAll('.ac-item')];
  if (!items.length) return;
  acIndex = Math.min(items.length - 1, Math.max(0, acIndex + dir));
  items.forEach((it, k) => it.classList.toggle('active', k === acIndex));
  if (items[acIndex].scrollIntoView) items[acIndex].scrollIntoView({ block: 'nearest' });
}

function renderFavoritesList() {
  el.autoList.innerHTML = '';
  acIndex = -1;
  const title = document.createElement('div');
  title.className = 'ac-list-title';
  title.textContent = t('favorites');
  el.autoList.appendChild(title);
  if (!state.favorites.length) {
    const empty = document.createElement('div');
    empty.className = 'ac-empty';
    empty.textContent = t('favorites_empty');
    el.autoList.appendChild(empty);
  } else {
    state.favorites.forEach(f => {
      const div = document.createElement('div');
      div.className = 'ac-item';
      div.innerHTML = `
        ${f.country ? `<img class="ac-flag" src="https://flagcdn.com/20x15/${f.country.toLowerCase()}.png" alt="">` : '<span class="ac-flag"></span>'}
        <span><span class="ac-name">${escHtml(f.name)}</span>${f.admin ? `<br><span class="ac-admin">${escHtml(f.admin)}</span>` : ''}</span>
        <button class="ac-remove" aria-label="Удалить"><i class="ph-bold ph-x"></i></button>`;
      div.addEventListener('click', (e) => {
        if (e.target.closest('.ac-remove')) return;
        selectCity({ lat: f.lat, lon: f.lon, name: f.name, country: f.country, admin: f.admin }, true);
      });
      div.querySelector('.ac-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        state.favorites = state.favorites.filter(x => !(x.name === f.name && x.lat === f.lat));
        store.set('livesky:favorites', state.favorites);
        updateFavIcon();
        renderFavoritesList();
      });
      el.autoList.appendChild(div);
    });
  }

  /* recent cities (excluding favorites) */
  const recents = state.recent.filter(r => !state.favorites.some(f => f.name === r.name && f.lat === r.lat));
  if (recents.length) {
    const rTitle = document.createElement('div');
    rTitle.className = 'ac-list-title';
    rTitle.textContent = t('recent');
    el.autoList.appendChild(rTitle);
    recents.forEach(f => {
      const div = document.createElement('div');
      div.className = 'ac-item';
      div.innerHTML = `
        ${f.country ? `<img class="ac-flag" src="https://flagcdn.com/20x15/${f.country.toLowerCase()}.png" alt="">` : '<span class="ac-flag"></span>'}
        <span><span class="ac-name">${escHtml(f.name)}</span>${f.admin ? `<br><span class="ac-admin">${escHtml(f.admin)}</span>` : ''}</span>
        <i class="ph ph-clock-counter-clockwise ac-star"></i>`;
      div.addEventListener('click', () => selectCity({ lat: f.lat, lon: f.lon, name: f.name, country: f.country, admin: f.admin }));
      el.autoList.appendChild(div);
    });
  }
  el.autoList.classList.remove('hidden');
}

let acSeq = 0; /* autocomplete generation: stale responses are dropped */
async function handleInput() {
  clearTimeout(searchTimer);
  const q = el.input.value.trim();
  el.searchClear.classList.toggle('hidden', !el.input.value);
  if (!q) {
    renderFavoritesList();
    return;
  }
  if (q.length < 3) {
    el.autoList.innerHTML = '';
    el.autoList.classList.add('hidden');
    return;
  }
  const seq = ++acSeq;
  /* hide stale suggestions immediately — never show results for an old query */
  el.autoList.innerHTML = '';
  el.autoList.classList.add('hidden');
  searchTimer = setTimeout(async () => {
    if (el.input.value.trim() !== q) return; /* query changed while waiting */
    try {
      const r = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${state.lang}&format=json`, 8000);
      const d = await r.json();
      if (seq !== acSeq || el.input.value.trim() !== q) return; /* stale response */
      const results = d.results || [];
      acIndex = -1;
      el.autoList.innerHTML = '';
      if (!results.length) {
        const empty = document.createElement('div');
        empty.className = 'ac-empty';
        empty.textContent = t('no_results');
        el.autoList.appendChild(empty);
      } else {
        results.forEach(c => {
          const div = document.createElement('div');
          div.className = 'ac-item';
          div.innerHTML = `
            ${c.country_code ? `<img class="ac-flag" src="https://flagcdn.com/20x15/${c.country_code.toLowerCase()}.png" alt="">` : ''}
            <span><span class="ac-name">${escHtml(c.name)}</span><br><span class="ac-admin">${escHtml([c.admin1, c.country].filter(Boolean).join(', '))}</span></span>`;
          div.addEventListener('click', () => selectCity({ lat: c.latitude, lon: c.longitude, name: c.name, country: c.country_code, admin: [c.admin1, c.country].filter(Boolean).join(', ') }));
          el.autoList.appendChild(div);
        });
      }
      el.autoList.classList.remove('hidden');
        } catch (e) { /* silent */ }
  }, 280);
}

async function handleSearch(e) {
  e.preventDefault();
  const q = el.input.value.trim();
  if (!q) return;
  closeAutocomplete();
  try {
    const r = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=${state.lang}&format=json`, 10000);
    const d = await r.json();
    if (!d.results || !d.results.length) {
      toast(t('toast_city_not_found'), 'error');
      return;
    }
    const c = d.results[0];
    state.lat = c.latitude; state.lon = c.longitude;
    state.locationName = c.name;
    state.countryCode = c.country_code || '';
    state.admin = [c.admin1, c.country].filter(Boolean).join(', ');
    saveRecent();
    el.input.value = '';
    el.searchClear.classList.add('hidden');
    el.input.blur();
    fetchWeather();
  } catch (e) {
    toast(t('toast_network'), 'error', t('toast_retry'), () => handleSearch(e));
  }
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- modals ---------------- */
function openModal(title, subtitle, bodyHtml) {
  el.modalTitle.textContent = title;
  el.modalSubtitle.textContent = subtitle || '';
  el.modalBody.innerHTML = bodyHtml;
  el.modalBody.scrollTop = 0;
  el.modal.classList.add('open');
  document.body.classList.add('no-scroll');
}
function closeModal() {
  el.modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
}

function showModalHourly(h, i) {
  const code = getVal(h, 'weathercode', i);
  const temp = getVal(h, 'temperature_2m', i);
  const feels = getVal(h, 'apparent_temperature', i);
  const hum = getVal(h, 'relativehumidity_2m', i);
  const wind = getVal(h, 'windspeed_10m', i);
  const dir = getVal(h, 'winddirection_10m', i);
  const press = getVal(h, 'surface_pressure', i);
  const dew = getVal(h, 'dewpoint_2m', i);
  const vis = getVal(h, 'visibility', i);
  const uv = getVal(h, 'uv_index', i);
  const prob = getVal(h, 'precipitation_probability', i);
  const prec = getVal(h, 'precipitation', i);
  const gust = getVal(h, 'windgusts_10m', i);
  const night = hourIsNight(i);
  const timeStr = h.time[i].slice(11, 16);
  const dateObj = parseLocal(h.time[i]);
  const dateStr = dateObj.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });

  const body = `
    <div class="m-detail-hero">
      <i class="ph-duotone ${wmoIcon(code, night)} m-icon"></i>
      <div class="m-temp">${fmtTempDeg(temp)}</div>
      <div class="m-desc">${wmoLabel(code)}</div>
    </div>
    <div class="m-grid">
      ${mTile('ph-thermometer', t('feels_like'), fmtTempDeg(feels))}
      ${mTile('ph-wind', windDir(dir) ? `${t('wind')} · ${windDir(dir)}` : t('wind'), fmtWind(wind))}
      ${mTile('ph-drop', t('humidity'), hum != null ? Math.round(hum) + '%' : '--')}
      ${mTile('ph-gauge', t('pressure'), fmtPress(press))}
      ${mTile('ph-drop-half', t('dew_point'), fmtTempDeg(dew))}
      ${mTile('ph-eye', t('visibility'), fmtVis(vis))}
      ${mTile('ph-sun', t('uv_index'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
      ${mTile('ph-cloud-rain', t('rain_chance'), `${prob != null ? Math.round(prob) + '%' : '--'}${prec != null && prec > 0 ? ' · ' + fmtPrecip(prec) : ''}`)}
      ${mTile('ph-wind', t('wind_gusts'), fmtWind(gust))}
    </div>`;
  openModal(`${t('modal_hourly')} ${timeStr}`, dateStr, body);
}

function mTile(icon, label, value) {
  return `<div class="m-tile"><div class="m-label"><i class="ph ${icon}"></i>${escHtml(label)}</div><div class="m-val">${value}</div></div>`;
}

function showModalDaily(d, i) {
  const code = getVal(d, 'weathercode', i);
  const mx = getVal(d, 'temperature_2m_max', i);
  const mn = getVal(d, 'temperature_2m_min', i);
  const uv = getVal(d, 'uv_index_max', i);
  const prob = getVal(d, 'precipitation_probability_max', i);
  const windMax = getVal(d, 'windspeed_10m_max', i);
  const precipSum = getVal(d, 'precipitation_sum', i);
  const sr = getVal(d, 'sunrise', i);
  const ss = getVal(d, 'sunset', i);
  const dateObj = parseLocal(d.time[i]);
  const target = d.time[i];
  const h = state.weather.hourly;

  let strip = '';
  let visSum = 0, visCount = 0;
  for (let j = 0; j < h.time.length; j++) {
    if (h.time[j].startsWith(target)) {
      const hCode = getVal(h, 'weathercode', j);
      const hTemp = getVal(h, 'temperature_2m', j);
      const hNight = hourIsNight(j);
      strip += `
        <div class="hour-item" style="width:64px" data-j="${j}">
          <span class="h-time">${h.time[j].slice(11, 16)}</span>
          <i class="ph-duotone ${wmoIcon(hCode, hNight)} h-icon w-${wmo(hCode).type}"></i>
          <span class="h-temp">${fmtTemp(hTemp)}°</span>
        </div>`;
      const v = getVal(h, 'visibility', j);
      if (v != null) { visSum += v; visCount++; }
    }
  }
  const avgVis = visCount > 0 ? fmtVis(visSum / visCount) : '--';

  const body = `
    <div class="m-detail-hero">
      <i class="ph-duotone ${wmoIcon(code, false)} m-icon"></i>
      <div class="m-temp"><span>${fmtTemp(mx)}°</span> <span style="color:var(--text-4);font-size:26px">${fmtTemp(mn)}°</span></div>
      <div class="m-desc">${wmoLabel(code)}</div>
    </div>
    ${strip ? `<div class="hourly-strip" id="modal-hourly" style="margin-bottom:14px">${strip}</div>` : ''}
    <div class="m-grid">
      ${mTile('ph-sun', t('uv_max'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
      ${mTile('ph-cloud-rain', t('rain_chance'), prob != null ? Math.round(prob) + '%' : '--')}
      ${mTile('ph-drop', t('precip'), fmtPrecip(precipSum))}
      ${mTile('ph-wind', t('wind_max'), fmtWind(windMax))}
      ${mTile('ph-sun-horizon', t('sunrise'), hhmm(sr))}
      ${mTile('ph-moon-stars', t('sunset'), hhmm(ss))}
      ${mTile('ph-eye', t('avg_vis'), avgVis)}
      ${mTile('ph-hourglass', t('day_len'), ss && sr ? fmtDur(Math.max(0, minOfDay(ss) - minOfDay(sr)), true) : '--')}
    </div>
    <div class="m-note"><i class="ph-fill ph-camera"></i><p><b>${t('golden_title')}.</b> ${t('golden_desc')}</p></div>`;
  openModal(dateObj.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }), t('modal_daily'), body);

  el.modalBody.querySelectorAll('#modal-hourly .hour-item').forEach(node => {
    node.addEventListener('click', () => showModalHourly(h, +node.dataset.j));
  });
}

function showMonthly(mode) {
  const d = state.weather.daily;
  const today = state.todayIdx;
  const isHistory = mode === 'history';
  const list = [];
  for (let i = isHistory ? 0 : today; i < (isHistory ? today : d.time.length); i++) list.push(i);
  if (!list.length) return;

  let tmin = Infinity, tmax = -Infinity;
  list.forEach(i => {
    const mn = getVal(d, 'temperature_2m_min', i), mx = getVal(d, 'temperature_2m_max', i);
    if (mn < tmin) tmin = mn;
    if (mx > tmax) tmax = mx;
  });
  const span = Math.max(1, tmax - tmin);

  let rows = '';
  list.forEach(i => {
    const dt = parseLocal(d.time[i]);
    const wd = dt.toLocaleDateString(loc(), { weekday: 'short' }).replace('.', '');
    const code = getVal(d, 'weathercode', i);
    const mn = getVal(d, 'temperature_2m_min', i);
    const mx = getVal(d, 'temperature_2m_max', i);
    const prob = getVal(d, 'precipitation_probability_max', i);
    const left = ((mn - tmin) / span) * 100;
    const width = Math.max(8, ((mx - mn) / span) * 100);
    rows += `
      <div class="mo-row" data-i="${i}">
        <i class="ph-duotone ${wmoIcon(code, false)} mo-icon w-${wmo(code).type}"></i>
        <span class="mo-date">${wd.charAt(0).toUpperCase() + wd.slice(1)}<small>${dt.toLocaleDateString(loc(), { day: 'numeric', month: 'long' })}</small></span>
        <span class="mo-range"><i style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i></span>
        <span class="mo-temps">${fmtTemp(mx)}°<small>${fmtTemp(mn)}°</small></span>
        <span class="mo-rain ${prob == null || prob < 5 ? 'zero' : ''}"><i class="ph-fill ph-drop"></i>${prob != null ? Math.round(prob) : 0}%</span>
      </div>`;
  });

  openModal(isHistory ? t('history_title') : t('forecast_title'), state.locationName, `<div style="display:flex;flex-direction:column;gap:9px">${rows}</div>`);
  el.modalBody.querySelectorAll('.mo-row').forEach(node => {
    node.addEventListener('click', () => showModalDaily(d, +node.dataset.i));
  });
}

function showSunDetails() {
  const d = state.weather.daily;
  const srIso = getVal(d, 'sunrise', state.todayIdx);
  const ssIso = getVal(d, 'sunset', state.todayIdx);
  if (!srIso || !ssIso) return;
  const h = state.weather.hourly;
  const srIdx = h.time.findIndex(tm => tm.startsWith(srIso.slice(0, 13)));
  const ssIdx = h.time.findIndex(tm => tm.startsWith(ssIso.slice(0, 13)));

  const block = (title, iso, idx, color) => {
    const i = idx >= 0 ? idx : 0;
    const temp = getVal(h, 'temperature_2m', i);
    const wind = getVal(h, 'windspeed_10m', i);
    const code = getVal(h, 'weathercode', i);
    const night = hourIsNight(i);
    return `
      <div class="m-tile" style="grid-column:1/-1">
        <div class="m-label"><i class="ph-fill ph-sun-horizon" style="color:${color}"></i>${escHtml(title)} · ${hhmm(iso)}</div>
        <div style="display:flex;align-items:center;gap:14px;margin-top:4px">
          <i class="ph-duotone ${wmoIcon(code, night)}" style="font-size:34px;color:var(--text-2)"></i>
          <span style="font-family:var(--font-display);font-weight:600">${fmtTempDeg(temp)}</span>
          <span style="font-size:13px;color:var(--text-3);display:inline-flex;align-items:center;gap:6px"><i class="ph ph-wind"></i>${fmtWind(wind)}</span>
          <span style="font-size:13px;color:var(--text-3)">${wmoLabel(code)}</span>
        </div>
      </div>`;
  };

  const body = `
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;background:linear-gradient(100deg,rgba(251,146,60,.14),rgba(129,140,248,.14));border:1px solid var(--stroke);border-radius:20px;padding:20px;text-align:center;margin-bottom:14px">
      <div><div style="font-family:var(--font-display);font-size:22px;font-weight:600">${hhmm(srIso)}</div><div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-top:4px">${t('sunrise')}</div></div>
      <div><div style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--accent)">${fmtDur(Math.max(0, minOfDay(ssIso) - minOfDay(srIso)), true)}</div><div style="font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-4);margin-top:4px">${t('day_len')}</div></div>
      <div><div style="font-family:var(--font-display);font-size:22px;font-weight:600">${hhmm(ssIso)}</div><div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-top:4px">${t('sunset')}</div></div>
    </div>
    <div class="m-grid">
      ${block(t('sunrise'), srIso, srIdx, '#fb923c')}
      ${block(t('sunset'), ssIso, ssIdx, '#818cf8')}
    </div>
    <div class="m-tile" style="grid-column:1/-1;margin-top:2px">
      <div class="m-label"><i class="ph ph-moon-stars"></i>${t('moon_phase_label')}</div>
      <div class="m-val" style="font-size:15px;font-family:var(--font-body)">${moonPhaseInfo(new Date()).emoji} ${moonPhaseInfo(new Date()).label}</div>
    </div>
    <div class="m-note"><i class="ph-fill ph-camera"></i><p><b>${t('golden_title')}.</b> ${t('golden_desc')}</p></div>`;
  openModal(t('sun_modal_title'), state.locationName, body);
}

function showAdvice() {
  if (!state.weather) return;
  const h = state.weather.hourly, i = state.nowIdx;
  const temp = getVal(h, 'temperature_2m', i);
  const feels = getVal(h, 'apparent_temperature', i);
  const code = getVal(h, 'weathercode', i);
  const wind = getVal(h, 'windspeed_10m', i);
  const vis = getVal(h, 'visibility', i);
  const uv = getVal(h, 'uv_index', i);
  const type = wmo(code).type;
  const raining = type === 'rain' || type === 'storm';
  const snowing = type === 'snow';

  const items = [];
  if (feels < -10) items.push(['ph-snowflake', 'text:#93c5fd', t('advice_freezing')]);
  else if (feels < 5) items.push(['ph-coat-hanger', 'text:#38bdf8', t('advice_cold')]);
  else if (feels > 28) items.push(['ph-thermometer-hot', 'text:#f87171', t('advice_hot')]);
  else items.push(['ph-smiley', 'text:#34d399', t('advice_warm')]);

  if (snowing) items.push(['ph-snowflake', 'text:#e2e8f0', t('advice_snow_now')]);
  else if (type === 'storm') items.push(['ph-cloud-lightning', 'text:#c084fc', t('advice_storm')]);
  else if (raining) items.push(['ph-umbrella', 'text:#60a5fa', t('advice_rain_now')]);
  else if (vis != null && vis < 1500) items.push(['ph-cloud-fog', 'text:#94a3b8', t('advice_fog')]);
  else if (wind > 15) items.push(['ph-wind', 'text:#cbd5e1', t('advice_windy')]);
  else items.push(['ph-sun', 'text:#fbbf24', t('advice_clear')]);

  if (uv != null && uv >= 6) items.push(['ph-sun-dim', 'text:#fbbf24', `${t('uv_index')}: ${(Math.round(uv * 10) / 10).toLocaleString(loc())} (${uvLabel(uv)})`]);

  let wear;
  if (feels < 0) wear = t('wear_cold');
  else if (feels < 12) wear = t('wear_cool');
  else if (feels < 22) wear = t('wear_mild');
  else wear = t('wear_warm');

  const list = items.map(it => `
    <div class="m-list-row" style="cursor:default">
      <span class="row-ico" style="background:var(--accent-soft)"><i class="ph-fill ${it[0]}" style="color:${it[1].split(':')[1]}"></i></span>
      <span class="row-main"><b>${it[2]}</b></span>
    </div>`).join('');

  const body = `
    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:14px">${list}</div>
    <div class="m-note"><i class="ph-fill ph-t-shirt"></i><p><b>${t('wear_title')}:</b> ${wear}</p></div>`;
  openModal(state.locationName, `${t('analysis_title')} · ${fmtTempDeg(temp)} · ${wmoLabel(code)}`, body);
}

/* ---------------- lifestyle ---------------- */
function showLifestyle(type) {
  if (!state.weather) return;
  const h = state.weather.hourly;
  const titles = { run: t('life_run_title'), car: t('life_car_title'), walk: t('life_walk_title') };
  const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];

  const slots = [];
  const start = state.nowIdx;
  const end = Math.min(start + 168, h.time.length);
  for (let i = start; i < end; i++) {
    const temp = getVal(h, 'temperature_2m', i);
    const rain = getVal(h, 'precipitation_probability', i) || 0;
    const wind = getVal(h, 'windspeed_10m', i);
    const code = getVal(h, 'weathercode', i);
    const isRaining = rainCodes.includes(code);
    const hr = parseInt(h.time[i].slice(11, 13), 10);
    let good = false;
    if (type === 'run') good = !isRaining && temp >= 5 && temp <= 22 && wind < 20 && hr >= 6 && hr <= 22;
    else if (type === 'car') good = !isRaining && rain < 10 && hr >= 8 && hr <= 20;
    else good = !isRaining && temp >= -5 && temp <= 30 && wind < 25 && hr >= 8 && hr <= 23;
    if (good) slots.push({ i, temp, rain, wind });
    if (slots.length >= 8) break;
  }

  let rows = '';
  if (slots.length) {
    slots.forEach(s => {
      const dt = parseLocal(h.time[s.i]);
      rows += `
        <div class="m-list-row" data-slot="${s.i}">
          <span class="row-ico" style="background:rgba(52,211,153,.14)"><i class="ph-fill ph-check-circle" style="color:#34d399"></i></span>
          <span class="row-main"><b>${dt.toLocaleDateString(loc(), { weekday: 'short' }).replace('.', '')} · ${h.time[s.i].slice(11, 16)}</b><span>${dt.toLocaleDateString(loc(), { day: 'numeric', month: 'short' })}</span></span>
          <span class="row-side">${fmtTemp(s.temp)}°<small>${fmtWind(s.wind)}</small></span>
          <i class="ph-bold ph-caret-right" style="color:var(--text-4)"></i>
        </div>`;
    });
  } else {
    rows = `<div class="ac-empty" style="padding:20px">${t('life_no_slots')}</div>`;
  }

  const body = `
    <p style="font-size:12.5px;color:var(--text-3);font-weight:600;margin-bottom:12px">${t('life_best_time')}</p>
    <div style="display:flex;flex-direction:column;gap:9px">${rows}</div>`;
  openModal(`${titles[type]} · ${t('life_analysis_7days')}`, state.locationName, body);

  el.modalBody.querySelectorAll('.m-list-row[data-slot]').forEach(node => {
    node.addEventListener('click', () => showLifeSkySlot(+node.dataset.slot, type));
  });
}

function showLifeSkySlot(index, type) {
  const h = state.weather.hourly;
  const temp = getVal(h, 'temperature_2m', index);
  const wind = getVal(h, 'windspeed_10m', index);
  const hum = getVal(h, 'relativehumidity_2m', index);
  const uv = getVal(h, 'uv_index', index);
  const dt = parseLocal(h.time[index]);
  const timeStr = dt.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  let advice = '';
  if (type === 'run') {
    let wear;
    if (temp < 5) wear = t('wear_cold');
    else if (temp < 12) wear = t('wear_cool');
    else if (temp < 20) wear = t('wear_mild');
    else wear = t('wear_warm');
    const windMsg = wind > 10 ? t('wind_windy') : t('wind_calm');
    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px"><i class="ph-fill ph-t-shirt"></i><p><b>${t('wear_title')}:</b> ${wear}</p></div>
      <div class="m-grid">
        ${mTile('ph-wind', t('wind'), fmtWind(wind) + ' · ' + windMsg)}
        ${mTile('ph-drop', t('humidity'), hum != null ? Math.round(hum) + '%' : '--')}
      </div>`;
  } else if (type === 'car') {
    let risk = 0;
    const end = Math.min(index + 24, h.time.length);
    for (let k = index + 1; k < end; k++) {
      const p = getVal(h, 'precipitation_probability', k) || 0;
      if (p > risk) risk = p;
    }
    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px;border-color:${risk > 30 ? 'rgba(248,113,113,.4)' : 'rgba(52,211,153,.4)'}">
        <i class="ph-fill ph-cloud-rain" style="color:${risk > 30 ? '#f87171' : '#34d399'}"></i>
        <p><b>${t('rain_risk_label')}</b> <b style="color:${risk > 30 ? '#f87171' : '#34d399'}">${Math.round(risk)}%</b><br>${risk > 30 ? t('car_dirty') : t('car_clean')}</p>
      </div>`;
  } else {
    let comfort = t('comfort_good');
    if (temp < 0) comfort = t('comfort_cold');
    if (temp > 25) comfort = t('comfort_hot');
    const windDesc = wind > 8 ? t('wind_light') : t('wind_none');
    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px"><i class="ph-fill ph-smiley"></i><p><b>${t('comfort_title')}:</b> ${comfort}. ${windDesc}</p></div>
      <div class="m-grid">
        ${mTile('ph-sun', t('uv_index'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
        ${mTile('ph-drop', t('humidity'), hum != null ? Math.round(hum) + '%' : '--')}
      </div>`;
  }

  const titles = { run: t('life_run_title'), car: t('life_car_title'), walk: t('life_walk_title') };
  const body = `
    <button class="m-back" id="life-back"><i class="ph-bold ph-arrow-left"></i>${titles[type]} · ${t('life_analysis_7days')}</button>
    <div class="m-detail-hero" style="padding-top:0">
      <div class="m-temp" style="font-size:26px">${timeStr}</div>
      <div class="m-desc">${t('slot_details')}</div>
    </div>
    ${advice}`;
  openModal(titles[type], state.locationName, body);
  $('life-back').addEventListener('click', () => showLifestyle(type));
}

/* ---------------- maps (MapLibre GL, reliable raster tiles) ---------------- */
let mapInst = null, mapMarkEl = null, smallMapFallback = false;
let fullMapInst = null, fullMarkEl = null, fullPopup = null, fullMapFallback = false;
let tempLat = null, tempLon = null;

/* Raster tiles proven to load reliably (CARTO). Four explicit subdomains
   because MapLibre does not expand the {s} token itself. */
function cartoTiles(theme) {
  const variant = theme === 'light' ? 'light_all' : 'dark_all';
  return ['a', 'b', 'c', 'd'].map(s => `https://${s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`);
}
function mapStyle() {
  return {
    version: 8,
    sources: {
      raster: { type: 'raster', tiles: cartoTiles(state.theme), tileSize: 256, attribution: '© OpenStreetMap contributors © CARTO' }
    },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }]
  };
}
/* last-resort fallback: OSM standard tiles */
function osmStyle() {
  return {
    version: 8,
    sources: {
      raster: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' }
    },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }]
  };
}
function makePinEl() {
  const d = document.createElement('div');
  d.className = 'map-pin';
  return d;
}

function initMap() {
  if (!window.maplibregl) { console.warn('LiveSky: MapLibre GL unavailable'); return; }
  /* open fullscreen map on tap/click, but NOT after dragging the map */
  let dragStart = null;
  on(el.mapSmall, 'pointerdown', (e) => { dragStart = { x: e.clientX, y: e.clientY }; });
  on(el.mapSmall, 'pointerup', (e) => {
    if (!dragStart) return;
    const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    dragStart = null;
    if (dist < 6) openFullMap();
  });
  try {
    mapInst = new maplibregl.Map({
      container: 'map',
      style: mapStyle(),
      center: [state.lon, state.lat],
      zoom: 10,
      attributionControl: false,
      scrollZoom: false,
      boxZoom: false,
      doubleClickZoom: false
    });
    mapInst.on('error', () => {
      if (!smallMapFallback) { smallMapFallback = true; try { mapInst.setStyle(osmStyle()); } catch (e) { /* ignore */ } }
    });
    mapMarkEl = new maplibregl.Marker({ element: makePinEl() }).setLngLat([state.lon, state.lat]).addTo(mapInst);
    setTimeout(() => { if (mapInst) mapInst.resize(); }, 300);
  } catch (e) { console.warn('LiveSky: map init failed', e); }
}
function updateMap() {
  if (!mapInst || !window.maplibregl) return;
  mapInst.flyTo({ center: [state.lon, state.lat], zoom: Math.max(mapInst.getZoom(), 10), duration: 900 });
  if (mapMarkEl) mapMarkEl.setLngLat([state.lon, state.lat]);
  else mapMarkEl = new maplibregl.Marker({ element: makePinEl() }).setLngLat([state.lon, state.lat]).addTo(mapInst);
}
function updateMapTiles() {
  if (!window.maplibregl) return;
  smallMapFallback = false; fullMapFallback = false;
  if (mapInst) mapInst.setStyle(mapStyle());
  if (fullMapInst) fullMapInst.setStyle(mapStyle());
}

function openFullMap() {
  if (!window.maplibregl) return;
  el.mapModal.classList.add('open');
  document.body.classList.add('no-scroll');
  tempLat = null; tempLon = null;
  el.mapInstr.style.display = '';
  el.mapApply.classList.add('hidden');
  if (!fullMapInst) {
    setTimeout(() => {
      try {
        fullMapInst = new maplibregl.Map({
          container: 'full-map',
          style: mapStyle(),
          center: [state.lon, state.lat],
          zoom: 10,
          attributionControl: { compact: true }
        });
        fullMapInst.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'bottom-right');
        fullMarkEl = new maplibregl.Marker({ element: makePinEl() }).setLngLat([state.lon, state.lat]).addTo(fullMapInst);
        fullPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16 })
          .setLngLat([state.lon, state.lat])
          .setHTML('<b>' + escHtml(state.locationName) + '</b>')
          .addTo(fullMapInst);
        /* picking a spot works only once the map actually rendered */
        fullMapInst.on('load', () => {
          fullMapInst.on('click', (e) => {
            tempLat = e.lngLat.lat; tempLon = e.lngLat.lng;
            if (fullMarkEl) fullMarkEl.setLngLat([tempLon, tempLat]);
            if (fullPopup) { fullPopup.remove(); fullPopup = null; }
            el.mapInstr.style.display = 'none';
            el.mapApply.classList.remove('hidden');
          });
        });
        fullMapInst.on('error', () => {
          if (!fullMapFallback) { fullMapFallback = true; try { fullMapInst.setStyle(osmStyle()); } catch (e) { /* ignore */ } }
        });
        fullMapInst.resize();
      } catch (e) { console.warn('LiveSky: full map init failed', e); }
    }, 320);
  } else {
    fullMapInst.flyTo({ center: [state.lon, state.lat], zoom: 10, duration: 600 });
    if (fullMarkEl) fullMarkEl.setLngLat([state.lon, state.lat]);
    if (fullPopup) { fullPopup.remove(); fullPopup = null; }
    fullPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16 })
      .setLngLat([state.lon, state.lat])
      .setHTML('<b>' + escHtml(state.locationName) + '</b>')
      .addTo(fullMapInst);
    setTimeout(() => fullMapInst.resize(), 120);
  }
}
function closeFullMap() {
  el.mapModal.classList.remove('open');
  document.body.classList.remove('no-scroll');
}
async function applyMapLocation() {
  if (tempLat == null || tempLon == null) return;
  closeFullMap();
  state.lat = tempLat; state.lon = tempLon;
  showLoader();
  await reverseGeo(state.lat, state.lon);
  toast(t('toast_loc_set'), 'success');
  fetchWeather();
}

/* ---------------- theme / lang / settings ---------------- */
const THEME_CYCLE = { adaptive: 'light', light: 'dark', dark: 'adaptive' };
const THEME_KEYS = { adaptive: 'theme_adaptive', light: 'theme_light', dark: 'theme_dark' };

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  updateThemeLabel();
  updateMapTiles();
  applyWeatherTheme();
  syncMenuChecks();
  store.set('livesky:theme', state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'light' ? '#eef4fb' : '#05070f');
  if (window.pywebview && window.pywebview.api && window.pywebview.api.set_window_theme) {
    window.pywebview.api.set_window_theme(state.theme).catch(() => {});
  }
}
function cycleTheme() {
  state.theme = THEME_CYCLE[state.theme] || 'adaptive';
  applyTheme();
}
function setTheme(theme) {
  if (!THEME_KEYS[theme]) return;
  state.theme = theme;
  applyTheme();
}
function setMenuOpen(open) {
  if (el.mainMenu) el.mainMenu.classList.toggle('open', open);
  if (el.menuBtn) el.menuBtn.setAttribute('aria-expanded', String(open));
}
function syncMenuChecks() {
  if (!el.mainMenu) return;
  el.mainMenu.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('selected', b.dataset.lang === state.lang));
  el.mainMenu.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('selected', b.dataset.theme === state.theme));
  if (el.modelSelect) el.modelSelect.value = state.model;
  if (el.unitsSelect) el.unitsSelect.value = state.units;
}
function updateThemeLabel() {
  if (!el.themeLabel) return;
  el.themeLabel.dataset.translate = THEME_KEYS[state.theme];
  el.themeLabel.textContent = t(THEME_KEYS[state.theme]);
}

function applyTranslations() {
  document.querySelectorAll('[data-translate]').forEach(node => {
    const key = node.dataset.translate;
    if (!key) return;
    node.textContent = t(key);
  });
  /* select options */
  const modelLabels = { auto: 'source_model_auto', ecmwf_ifs04: 'source_model_ecmwf', gfs_seamless: 'source_model_gfs', icon_seamless: 'source_model_icon' };
  if (el.modelSelect) [...el.modelSelect.options].forEach(o => { o.textContent = t(modelLabels[o.value] || o.value); });
  const unitsLabels = { metric: 'units_metric', imperial: 'units_imperial' };
  if (el.unitsSelect) [...el.unitsSelect.options].forEach(o => { o.textContent = t(unitsLabels[o.value]); });
  syncMenuChecks();
}

function setLang(lang) {
  if (!I18N[lang]) return;
  state.lang = lang;
  store.set('livesky:lang', lang);
  el.input.placeholder = t('search_ph');
  setMenuOpen(false);
  applyTranslations();
  updateThemeLabel();
  syncMenuChecks();
  clockTick();
  if (state.weather) renderAll();
}

/* ---------------- fullscreen ---------------- */
let isFullscreen = false;
function toggleFullscreen() {
  if (window.pywebview && window.pywebview.api && window.pywebview.api.toggle_fullscreen) {
    window.pywebview.api.toggle_fullscreen()
      .then((s) => { isFullscreen = !!s; updateFsIcon(); })
      .catch(() => nativeFullscreenToggle());
  } else nativeFullscreenToggle();
}
function nativeFullscreenToggle() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => { isFullscreen = true; updateFsIcon(); }).catch(() => {});
  } else if (document.exitFullscreen) {
    document.exitFullscreen().then(() => { isFullscreen = false; updateFsIcon(); });
  }
}
function updateFsIcon() {
  el.fsIcon.classList.toggle('ph-corners-out', !isFullscreen);
  el.fsIcon.classList.toggle('ph-corners-in', isFullscreen);
}

/* ---------------- events ---------------- */
function bindEvents() {
  on(el.searchForm, 'submit', handleSearch);
  on(el.input, 'input', handleInput);
  on(el.input, 'focus', () => { if (!el.input.value.trim()) renderFavoritesList(); });
  on(el.input, 'keydown', (e) => {
    if (e.key === 'Escape') { closeAutocomplete(); el.input.blur(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      acMove(e.key === 'ArrowDown' ? 1 : -1);
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      const active = el.autoList.querySelector('.ac-item.active');
      if (active && !el.autoList.classList.contains('hidden')) { e.preventDefault(); active.click(); }
    }
  });
  on(el.searchClear, 'click', () => {
    el.input.value = '';
    el.searchClear.classList.add('hidden');
    el.input.focus();
    renderFavoritesList();
  });
  on(el.favBtn, 'click', (e) => { e.preventDefault(); toggleFavorite(); });

  /* unified menu: language, theme, units, model, geolocation, fullscreen, refresh */
  on(el.menuBtn, 'click', (e) => {
    e.stopPropagation();
    setMenuOpen(!el.mainMenu.classList.contains('open'));
  });
  on(el.mainMenu, 'click', (e) => {
    const langBtn = e.target.closest('[data-lang]');
    if (langBtn) { setLang(langBtn.dataset.lang); return; }
    const themeBtn = e.target.closest('[data-theme]');
    if (themeBtn) { setTheme(themeBtn.dataset.theme); setMenuOpen(false); return; }
  });
  on(el.modelSelect, 'change', () => {
    state.model = el.modelSelect.value;
    store.set('livesky:model', state.model);
    setMenuOpen(false);
    fetchWeather();
  });
  on(el.unitsSelect, 'change', () => {
    state.units = el.unitsSelect.value;
    store.set('livesky:units', state.units);
    setMenuOpen(false);
    if (state.weather) renderAll();
  });
  on(el.fsItem, 'click', () => { setMenuOpen(false); toggleFullscreen(); });
  on(el.refreshItem, 'click', () => { setMenuOpen(false); fetchWeather(true); });
  on(el.geoItem, 'click', () => { setMenuOpen(false); getUserLocation(true); });

  on(el.adviceBtn, 'click', showAdvice);
  on(el.historyBtn, 'click', () => showMonthly('history'));
  on(el.sunCard, 'click', showSunDetails);
  on(el.sunCard, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSunDetails(); } });

  document.getElementById('life-run').addEventListener('click', () => showLifestyle('run'));
  document.getElementById('life-car').addEventListener('click', () => showLifestyle('car'));
  document.getElementById('life-walk').addEventListener('click', () => showLifestyle('walk'));
  ['life-run', 'life-car', 'life-walk'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById(id).click(); }
    });
  });

  on(el.modalClose, 'click', closeModal);
  on(el.modal, 'click', (e) => { if (e.target === el.modal) closeModal(); });
  on(el.mapClose, 'click', closeFullMap);
  on(el.mapApply, 'click', applyMapLocation);

  on(el.hLeft, 'click', () => el.hStrip.scrollBy({ left: -420, behavior: 'smooth' }));
  on(el.hRight, 'click', () => el.hStrip.scrollBy({ left: 420, behavior: 'smooth' }));

  on(el.brand, 'click', () => location.reload());

  document.addEventListener('click', (e) => {
    if (!el.searchForm.contains(e.target) && !el.autoList.contains(e.target)) closeAutocomplete();
    if (!el.menuBtn.contains(e.target) && !el.mainMenu.contains(e.target)) setMenuOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (el.mapModal.classList.contains('open')) { closeFullMap(); return; }
      if (el.modal.classList.contains('open')) { closeModal(); return; }
      setMenuOpen(false);
      closeAutocomplete();
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing || el.modal.classList.contains('open') || el.mapModal.classList.contains('open')) return;
    if (e.key === '/' ) { e.preventDefault(); el.input.focus(); el.input.select(); return; }
    if (e.key === 'ArrowRight') el.hStrip.scrollBy({ left: 220, behavior: 'smooth' });
    if (e.key === 'ArrowLeft') el.hStrip.scrollBy({ left: -220, behavior: 'smooth' });
  });

  window.addEventListener('resize', () => FX.resize());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clockTick();
      FX.resume();
      if (Date.now() - state.lastFetchTs > 15 * 60 * 1000) fetchWeather(true);
    } else if (FX.running) {
      cancelAnimationFrame(FX.raf);
      FX.running = false;
    }
  });
  /* silent auto-refresh every 15 minutes */
  setInterval(() => {
    if (!document.hidden && Date.now() - state.lastFetchTs > 15 * 60 * 1000) fetchWeather(true);
  }, 60 * 1000);
  window.addEventListener('offline', () => toast(t('toast_network'), 'error'));
}

/* ---------------- reveal on scroll ---------------- */
function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || motionReduce) {
    items.forEach(n => n.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.08 });
  items.forEach(n => io.observe(n));
}

/* ---------------- init ---------------- */
function init() {
  /* sanitize persisted settings (old/foreign values must never break boot) */
  if (!I18N[state.lang]) state.lang = 'ru';
  if (!['adaptive', 'light', 'dark'].includes(state.theme)) state.theme = 'adaptive';
  if (!['metric', 'imperial'].includes(state.units)) state.units = 'metric';
  if (!['auto', 'ecmwf_ifs04', 'gfs_seamless', 'icon_seamless'].includes(state.model)) state.model = 'auto';

  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  el.input.placeholder = t('search_ph');
  applyTranslations();
  updateThemeLabel();
  syncMenuChecks();
  updateFavIcon();
  startClock();
  bindEvents();
  initReveal();
  showLoader();
  initMap();

  const last = store.get('livesky:last_city', null);
  if (last && last.lat != null) {
    state.lat = last.lat;
    state.lon = last.lon;
    state.locationName = last.name || 'Москва';
    state.countryCode = last.cc || '';
    state.admin = last.admin || '';
    fetchWeather();
  } else {
    getUserLocation();
  }
}

/* fatal errors must never leave the user staring at the loader */
window.addEventListener('error', (e) => {
  if (e && e.filename && /(app|i18n)\.js/.test(e.filename)) bootFail(e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  if (!state.weather) bootFail((e.reason && e.reason.message) || String(e.reason || 'Unknown error'));
});

try {
  init();
} catch (err) {
  bootFail(err && err.message ? err.message : String(err));
}
