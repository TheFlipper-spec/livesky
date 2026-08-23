/* ============================================================
   LiveSky Weather Pro — Application Logic
   ============================================================ */
'use strict';

/* Canonical public version of the website and service. */
const APP_VERSION = '1.3';

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
  aqiCard: $('aqi-card'),
  sunArc: $('sun-arc'), sunCard: $('sun-card'),
  aqiRing: $('aqi-ring-fg'), aqiValue: $('aqi-value'), aqiLabel: $('aqi-label'),
  aqiPm25: $('aqi-pm25'), aqiPm10: $('aqi-pm10'), aqiO3: $('aqi-o3'), aqiNo2: $('aqi-no2'),
  chartScroll: $('chart-scroll'), chartSvg: $('chart-svg'), chartAxis: $('chart-axis'), chartPlot: $('chart-plot'),
  chartScrub: $('chart-scrub'), chartDetail: $('chart-detail'), chartGuide: $('chart-guide'), chartGuideDot: $('chart-guide-dot'),
  hStrip: $('hourly-strip'), hLeft: $('hourly-left'), hRight: $('hourly-right'),
  dStrip: $('daily-strip'), historyBtn: $('history-btn'),
  alertBox: $('alert-box'), alertMsg: $('alert-msg'), alertTitle: $('alert-title'),
  modal: $('modal'), modalTitle: $('modal-title'), modalSubtitle: $('modal-subtitle'), modalBody: $('modal-body'), modalClose: $('modal-close'),
  mapModal: $('map-modal'), fullMap: $('full-map'), mapClose: $('map-close'), mapInstr: $('map-instr'), mapApply: $('map-apply-btn'), mapSmall: $('map'), mapCard: $('map-card'),
  rainStatus: $('rain-status'), rainStatusText: $('rain-status-text'), moonChip: $('moon-chip'), mPressTrend: $('m-press-trend'),
  toastWrap: $('toast-wrap'),
  searchForm: $('search-form'), input: $('city-input'), autoList: $('autocomplete-list'),
  favBtn: $('fav-btn'), favIcon: $('fav-icon'), searchClear: $('search-clear'),
  menuBtn: $('menu-btn'), mainMenu: $('main-menu'), modelSelect: $('model-select'), unitsSelect: $('units-select'), geoItem: $('geo-item'),
  themeLabel: $('theme-label'), fsIcon: $('fs-icon'), fsItem: $('fs-item'), refreshItem: $('refresh-item'),
  logoBox: $('logo-box'), brand: $('brand'), adviceBtn: $('advice-btn'), mPrecipLabel: $('m-precip-label'),
  effectsSelect: $('effects-select'), installItem: $('install-item'), offlineBanner: $('offline-banner'),
  notifItem: $('notif-item'), notifIco: $('notif-ico'), notifLabel: $('notif-label'),
  radarToggle: $('radar-toggle'), radarPanel: $('radar-panel'), radarLoading: $('radar-loading'),
  radarTime: $('radar-time'), radarSlider: $('radar-slider'), radarBack: $('radar-back'),
  radarNext: $('radar-next'), radarPlay: $('radar-play'), radarClose: $('radar-close'),
  radarBadge: $('radar-badge'), radarLive: $('radar-live'), radarOpacity: $('radar-opacity'),
  radarSpeed: $('radar-speed'), radarTicks: $('radar-ticks'),
  mapRadarBadge: $('map-radar-badge'),
  consentModal: $('consent-modal'), consentAcceptBtn: $('consent-accept-btn'),
  consentCheckbox: $('consent-checkbox'), consentError: $('consent-error'),
  privacyModal: $('privacy-modal'), privacyAcceptBtn: $('privacy-accept-btn'),
  privacyCancelBtn: $('privacy-cancel-btn')
};
/* safe event binding — never crashes if an element is missing */
function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }

/* Capacitor injects this bridge before the page loads inside the Android app.
   Browser/PWA builds simply return null and keep using standard Web APIs. */
function isNativeApp() {
  const cap = window.Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}
function nativePlugin(name) {
  const cap = window.Capacitor;
  return isNativeApp() && cap.Plugins ? cap.Plugins[name] || null : null;
}

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
  effects: store.get('livesky:effects', 'auto'),
  notif: store.get('livesky:notif', false),
  lat: 55.7558, lon: 37.6173,
  locationName: 'Москва', countryCode: 'RU', admin: '',
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  weather: null, air: null, minutely: null,
  nowIdx: 0, todayIdx: 16, minutelyIdx: 0,
  favorites: store.get('livesky:favorites', []),
  recent: store.get('livesky:recent', []),
  elevation: null, lastFetchTs: Date.now(),
  loading: 0, slowTimer: null, uiLockUntil: 0, favOpenTimer: null,
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
/* ---------------- self-hosted flag assets ----------------
   Country flags are bundled locally (assets/flags/*.svg, built from the
   MIT-licensed flag-icons set) so opening the app never pings a flag CDN.
   Returns '' for codes we do not ship — callers hide the <img> in that case. */
function flagUrl(cc) {
  const code = String(cc || '').trim().toLowerCase();
  return /^[a-z]{2}(-[a-z]{2,4})?$/.test(code) ? `assets/flags/${code}.svg` : '';
}
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
/* Human-friendly remaining duration with real minutes (not rounded to half-hours). */
function fmtDurSmart(totalMin) {
  const m = Math.max(0, Math.round(totalMin));
  if (m <= 1) {
    if (state.lang === 'en') return 'now';
    if (state.lang === 'es') return 'ahora';
    return 'сейчас';
  }
  if (m < 60) return t('remaining_min').replace('{n}', String(m));
  const h = Math.floor(m / 60), mm = m % 60;
  if (mm === 0) return t('remaining_h').replace('{h}', String(h));
  return t('remaining_hm').replace('{h}', String(h)).replace('{m}', String(mm));
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

/* Minute-aware precip status.
   Prefer Open-Meteo 15-min nowcast (precise start/end in minutes); fall back to
   hourly when minutely is unavailable. Remaining time always uses the REAL
   current minute so the chip ticks down live without a reload. */
function precipWetAt(code, precipMm, prob) {
  if (SNOW_CODES.includes(code) || RAIN_CODES.includes(code)) return true;
  if (precipMm != null && precipMm >= 0.1) return true;
  if (prob != null && prob >= 55 && precipMm != null && precipMm > 0) return true;
  return false;
}
function isSnowCode(code) { return SNOW_CODES.includes(code); }

/* Absolute minutes since a fixed epoch for a city-local ISO (YYYY-MM-DDTHH:MM). */
function absMinLocal(iso) {
  if (!iso) return 0;
  const d = iso.slice(0, 10), tm = (iso.slice(11, 16) || '00:00');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = tm.split(':').map(Number);
  return Math.floor(Date.UTC(y, m - 1, dd, hh || 0, mm || 0) / 60000);
}
function nowAbsMin() {
  const n = tzNow(state.tz);
  return absMinLocal(`${n.date}T${String(n.hour).padStart(2,'0')}:${String(n.minute).padStart(2,'0')}`);
}
function hhmmFromAbs(abs) {
  const d = new Date(abs * 60000);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

/* Scan 15-min series for current wet state + next transition. */
function minutelyPrecipInfo() {
  const m = state.minutely;
  if (!m || !m.time || !m.time.length) return null;
  const nowA = nowAbsMin();
  /* find current/last started slot */
  let i = 0;
  for (let k = 0; k < m.time.length; k++) {
    if (absMinLocal(m.time[k]) <= nowA) i = k;
    else break;
  }
  state.minutelyIdx = i;
  const code = getMinVal(m, 'weathercode', i) ?? getMinVal(m, 'weather_code', i);
  const precip = getMinVal(m, 'precipitation', i) || 0;
  const wetNow = precipWetAt(code, precip, null);
  const snowNow = isSnowCode(code) || (wetNow && precip > 0 && (getMinVal(m, 'temperature_2m', i) ?? 2) < 0.5);

  if (wetNow) {
    let endIdx = -1;
    for (let k = i + 1; k < m.time.length; k++) {
      const c = getMinVal(m, 'weathercode', k) ?? getMinVal(m, 'weather_code', k);
      const p = getMinVal(m, 'precipitation', k) || 0;
      if (!precipWetAt(c, p, null)) { endIdx = k; break; }
    }
    if (endIdx === -1) {
      /* keep raining through the nowcast window — try hourly for a longer end */
      return { source: 'minutely', wet: true, snow: snowNow, endAbs: null, startAbs: null, precip, code, idx: i };
    }
    return { source: 'minutely', wet: true, snow: snowNow, endAbs: absMinLocal(m.time[endIdx]), startAbs: null, precip, code, idx: i };
  }

  /* dry now — look for upcoming precip in the next ~6h of minutely.
     `code` stays the CURRENT slot code (for icons/theme); upcoming type is in nextCode. */
  let startIdx = -1;
  for (let k = i + 1; k < m.time.length; k++) {
    const c = getMinVal(m, 'weathercode', k) ?? getMinVal(m, 'weather_code', k);
    const p = getMinVal(m, 'precipitation', k) || 0;
    if (precipWetAt(c, p, null)) { startIdx = k; break; }
  }
  if (startIdx === -1) return { source: 'minutely', wet: false, snow: false, endAbs: null, startAbs: null, precip: 0, code, idx: i };
  const sc = getMinVal(m, 'weathercode', startIdx) ?? getMinVal(m, 'weather_code', startIdx);
  const st = getMinVal(m, 'temperature_2m', startIdx);
  const snow = isSnowCode(sc) || ((st != null && st < 0.5) && (getMinVal(m, 'precipitation', startIdx) || 0) > 0);
  return { source: 'minutely', wet: false, snow, endAbs: null, startAbs: absMinLocal(m.time[startIdx]), precip: getMinVal(m, 'precipitation', startIdx) || 0, code, nextCode: sc, idx: i, prob: null };
}

function hourlyPrecipInfo() {
  if (!state.weather) return null;
  const h = state.weather.hourly, i = state.nowIdx;
  const code = getVal(h, 'weathercode', i);
  const snowNow = SNOW_CODES.includes(code);
  const rainingNow = snowNow || RAIN_CODES.includes(code);
  const now = tzNow(state.tz);
  const nowA = nowAbsMin();
  if (!rainingNow) {
    const p = getVal(h, 'precipitation_probability', i) || 0;
    let firstRain = null;
    for (let k = i + 1; k < Math.min(i + 7, h.time.length); k++) {
      const c = getVal(h, 'weathercode', k);
      const pr = getVal(h, 'precipitation_probability', k) || 0;
      if ((RAIN_CODES.includes(c) || SNOW_CODES.includes(c)) && pr >= 30) {
        firstRain = { idx: k, prob: pr }; break;
      }
    }
    if (firstRain) {
      return {
        source: 'hourly', wet: false, snow: SNOW_CODES.includes(getVal(h, 'weathercode', firstRain.idx)),
        startAbs: absMinLocal(h.time[firstRain.idx]), endAbs: null,
        precip: getVal(h, 'precipitation', firstRain.idx) || 0,
        code: getVal(h, 'weathercode', firstRain.idx), idx: i, prob: firstRain.prob
      };
    }
    return { source: 'hourly', wet: false, snow: false, startAbs: null, endAbs: null, precip: 0, code, idx: i, prob: p };
  }
  let endIdx = -1;
  for (let k = i + 1; k < Math.min(i + 13, h.time.length); k++) {
    const c = getVal(h, 'weathercode', k);
    const p = getVal(h, 'precipitation_probability', k) || 0;
    if (!RAIN_CODES.includes(c) && !SNOW_CODES.includes(c) && p < 30) { endIdx = k; break; }
  }
  return {
    source: 'hourly', wet: true, snow: snowNow,
    endAbs: endIdx === -1 ? null : absMinLocal(h.time[endIdx]),
    startAbs: null, precip: getVal(h, 'precipitation', i) || 0, code, idx: i, prob: null
  };
}

function updateRainStatus() {
  if (!state.weather) { el.rainStatus.classList.add('hidden'); return; }
  const nowA = nowAbsMin();
  /* Merge minutely (precise, short window) with hourly (longer look-ahead).
     Rules:
       1. Minutely wet → trust it (optionally extend end time via hourly).
       2. Minutely dry with a near start → trust the minute start.
       3. Minutely dry with no start, but hourly says wet NOW → trust hourly
          (minutely window can be misaligned / empty after a TZ edge).
       4. Otherwise fall back to hourly start / probability. */
  let info = minutelyPrecipInfo();
  const hourly = hourlyPrecipInfo();
  if (!info) {
    info = hourly;
  } else if (info.wet) {
    if (info.endAbs == null && hourly && hourly.wet) {
      info = Object.assign({}, info, { endAbs: hourly.endAbs });
    }
  } else if (info.startAbs != null) {
    /* keep minutely start */
  } else if (hourly && hourly.wet) {
    info = hourly;
  } else if (hourly && hourly.startAbs != null) {
    info = hourly;
  } else if (hourly) {
    info = Object.assign({}, info, { prob: hourly.prob });
  }

  const snow = !!(info && info.snow);
  el.rainStatus.classList.remove('hidden');
  el.rainStatus.classList.toggle('snow', snow);
  el.rainStatus.querySelector('i').className = 'ph-fill ' + (snow ? 'ph-snowflake' : 'ph-cloud-rain');

  if (info && info.wet) {
    if (info.endAbs == null) {
      el.rainStatusText.textContent = snow ? t('snow_all_day') : t('rain_all_day');
      return;
    }
    const remaining = Math.max(0, info.endAbs - nowA);
    const endHH = hhmmFromAbs(info.endAbs);
    if (remaining <= 2) {
      el.rainStatusText.textContent = snow ? t('snow_ends_soon') : t('rain_ends_soon');
      return;
    }
    const key = snow ? 'snow_ends_in' : 'rain_ends_in';
    el.rainStatusText.textContent = t(key).replace('{d}', fmtDurSmart(remaining)).replace('{t}', endHH);
    return;
  }

  if (info && info.startAbs != null) {
    const until = Math.max(0, info.startAbs - nowA);
    if (until > 360) {
      /* too far — just show current probability */
      const p = info.prob != null ? info.prob : (getVal(state.weather.hourly, 'precipitation_probability', state.nowIdx) || 0);
      el.rainStatusText.textContent = t('rain_prob').replace('{p}', Math.round(p));
      return;
    }
    if (until <= 2) {
      el.rainStatusText.textContent = snow ? t('snow_starts_soon') : t('rain_starts_soon');
      return;
    }
    const startHH = hhmmFromAbs(info.startAbs);
    const p = info.prob != null ? Math.round(info.prob) : 60;
    const key = snow ? 'snow_starts_in' : 'rain_starts_in';
    el.rainStatusText.textContent = t(key).replace('{d}', fmtDurSmart(until)).replace('{t}', startHH).replace('{p}', String(p));
    return;
  }

  const p = (info && info.prob != null) ? info.prob : (getVal(state.weather.hourly, 'precipitation_probability', state.nowIdx) || 0);
  el.rainStatusText.textContent = t('rain_prob').replace('{p}', Math.round(p));
}

/* Read a value from the minutely_15 payload (no model suffix — Open-Meteo returns plain keys). */
function getMinVal(obj, key, i) {
  if (!obj) return null;
  const arr = obj[key];
  if (arr && arr[i] != null) return arr[i];
  /* tolerate Open-Meteo naming aliases across hourly/minutely payloads */
  const aliases = {
    weathercode: 'weather_code', weather_code: 'weathercode',
    windspeed_10m: 'wind_speed_10m', wind_speed_10m: 'windspeed_10m',
    relativehumidity_2m: 'relative_humidity_2m', relative_humidity_2m: 'relativehumidity_2m'
  };
  const alt = aliases[key];
  if (alt && obj[alt] && obj[alt][i] != null) return obj[alt][i];
  return null;
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
/* Regional model preference for Auto mode. Open-Meteo's `best_match` is already
   the skill-ranked model, but nudging the baseline toward the model that performs
   best in a region gives a small, honest accuracy edge for the headline numbers:
   ECMWF (IFS) is the strongest over Europe, GFS over North America. */
function regionModel() {
  const lat = state.lat, lon = state.lon;
  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
  /* North America */
  if (lat >= 15 && lat <= 72 && lon >= -170 && lon <= -50) return 'gfs_seamless';
  /* Europe incl. European part of Russia */
  if (lat >= 30 && lat <= 72 && lon >= -25 && lon <= 55) return 'ecmwf_ifs04';
  return null; /* fall back to pure best_match everywhere else */
}
/* Smooth "right now" value between two hourly slices, so the current temperature
   isn't stuck at the whole-hour reading but tracks the minute. Falls back to the
   hour value when interpolation isn't possible. */
function interpHour(h, key, i) {
  const a = getVal(h, key, i);
  if (a == null || isNaN(a)) return a;
  const b = getVal(h, key, i + 1);
  if (b == null || isNaN(b)) return a;
  const frac = Math.min(0.999, (tzNow(state.tz).minute) / 60);
  return a + (b - a) * frac;
}
function currentWeatherCode() {
  if (!state.weather) return null;
  /* Prefer minutely when present so theme/FX flip the moment rain starts/stops. */
  if (state.minutely && state.minutely.time && state.minutely.time.length) {
    try {
      const info = minutelyPrecipInfo();
      if (info && info.code != null) return info.code;
    } catch (e) { /* fall through */ }
  }
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

