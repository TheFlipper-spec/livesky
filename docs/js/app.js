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
  mapModal: $('map-modal'), fullMap: $('full-map'), mapClose: $('map-close'), mapInstr: $('map-instr'), mapApply: $('map-apply-btn'), mapSmall: $('map'),
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

/* ---------------- loader / progress / toasts ---------------- */
let phraseTimer = null;
let loaderWatchdog = null;
const WATCHDOG_MS = window.LIVE_WATCHDOG_MS || 15000;
const FETCH_MS = window.LIVE_FETCH_TIMEOUT_MS || 15000;
const UI_LOCK_MS = window.LIVE_UI_LOCK_MS || 800;          /* UI quiet period after closing overlays */
const FAV_LIST_DELAY_MS = window.LIVE_FAV_DELAY_MS != null ? window.LIVE_FAV_DELAY_MS : 350; /* debounce before auto-opening favorites */

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
    const r = $('boot-report-btn');
    if (r) r.href = reportBugUrl(msg);
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

/* Builds a GitHub issues URL with the bug context pre-filled so the user can
   describe the problem without copy-pasting details manually.
   Safe even when i18n itself failed to load (that is exactly when bootFail runs). */
function safeT(key, fallback) {
  try { return t(key); } catch (e) { return fallback; }
}
function reportBugUrl(message) {
  const title = safeT('report_bug', 'report a bug');
  const hint = safeT('bug_report_hint', 'Please describe what went wrong');
  const body = [
    hint,
    '',
    '---',
    '**Страница / Page:** ' + (location.href || ''),
    '**Версия / Version:** ' + (navigator.appVersion || ''),
    '**Ошибка / Error:** ' + (message || '—'),
    '',
    '**Что случилось / What happened:**',
    ''
  ].join('\n');
  return 'https://github.com/TheFlipper-spec/livesky/issues/new?title='
    + encodeURIComponent('LiveSky: ' + title)
    + '&body=' + encodeURIComponent(body);
}

function toast(msg, type, actionLabel, actionFn) {
  if (state.toastCount >= 3) return; /* keep max 3 on screen */
  const node = document.createElement('div');
  node.className = `toast ${type || 'info'}`;
  const icons = { info: 'ph-info', error: 'ph-warning-circle', success: 'ph-check-circle' };
  node.innerHTML = `<span class="t-ico"><i class="ph-fill ${icons[type] || 'ph-info'}"></i></span><span>${msg}</span>`;
  /* right-aligned action cluster (retry + report-bug) */
  const actions = document.createElement('div');
  actions.className = 't-actions';
  if (actionLabel && actionFn) {
    const a = document.createElement('button');
    a.className = 't-action';
    a.textContent = actionLabel;
    a.onclick = () => { actionFn(); dismiss(); };
    actions.appendChild(a);
  }
  /* on any error toast, offer a one-click way to report the bug on GitHub */
  if (type === 'error') {
    const b = document.createElement('a');
    b.className = 't-bug';
    b.href = reportBugUrl(msg);
    b.target = '_blank';
    b.rel = 'noopener';
    b.innerHTML = '<i class="ph-bold ph-bug"></i>';
    b.title = t('report_bug');
    b.setAttribute('aria-label', t('report_bug'));
    actions.appendChild(b);
  }
  if (actions.children.length) node.appendChild(actions);
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
  /* Drive the minute-precision live layer off the same 1s clock so rain chips
     and the nowcast strip flip the instant the minute changes. */
  if (typeof liveTick === 'function') liveTick(false);
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
      /* 15-minute nowcast: ~next 24h of minute-precision precip/temp so the UI
         can say "rain ends in 23 min" and show a live minute strip. */
      minutely_15: 'temperature_2m,precipitation,weather_code,apparent_temperature,wind_speed_10m,relative_humidity_2m,is_day',
      forecast_minutely_15: '96',
      timezone: 'auto', forecast_days: 16, past_days: 16
    });
    /* Accuracy: ask Open-Meteo for the skill-ranked "best_match" model. In Auto
       mode we also nudge the baseline toward the region's strongest model
       (ECMWF over Europe, GFS over N.America); in manual modes we blend the
       chosen model with best_match (getVal prefers the chosen model first).
       getVal reads the plain key (= first requested model) then _best_match. */
    if (state.model && state.model !== 'auto') params.append('models', `${state.model},best_match`);
    else {
      const rm = regionModel();
      params.append('models', rm ? `${rm},best_match` : 'best_match');
    }

    const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, FETCH_MS);
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    if (!data || !data.hourly || !data.daily) throw new Error('Bad payload');
    if (seq !== fetchSeq) return; /* a newer request is in flight */

    if (data.timezone) state.tz = data.timezone;
    if (data.elevation != null) state.elevation = Math.round(data.elevation);
    state.weather = data;
    /* Minutely nowcast is optional — some model combos omit it. Keep previous
       series if the new payload has none, so the live strip doesn't flicker. */
    if (data.minutely_15 && data.minutely_15.time && data.minutely_15.time.length) {
      state.minutely = data.minutely_15;
    }
    state.nowIdx = data.hourly.time.findIndex(tm => tm.startsWith(tzNow(state.tz).iso));
    if (state.nowIdx === -1) state.nowIdx = data.hourly.time.length - 25;
    state.todayIdx = data.daily.time.findIndex(tm => tm === tzNow(state.tz).date);
    if (state.todayIdx === -1) state.todayIdx = 16;
    state.lastFetchTs = Date.now();
    /* Advance the hourly pointer if the clock crossed an hour while data sat
       in memory — keeps "now" correct between auto-refreshes. */
    syncNowIdx();

    store.set('livesky:last_city', { lat: state.lat, lon: state.lon, name: state.locationName, cc: state.countryCode, admin: state.admin });
    renderAll();
    updateMap();
    fetchAir(seq);
    checkWeatherAlerts();
    /* Keep the radar frames fresh when the user is looking at the map. */
    if (typeof RADAR !== 'undefined' && RADAR.active) RADAR.refreshSilent();
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
async function applyUserPosition(pos, notify) {
  state.lat = pos.coords.latitude;
  state.lon = pos.coords.longitude;
  await reverseGeo(state.lat, state.lon);
  if (notify) toast(t('toast_loc_set'), 'success');
  fetchWeather();
}
function handleLocationFailure() {
  if (!geoWarned) { geoWarned = true; toast(t('toast_geo_denied'), 'info'); }
  fetchWeather();
}
/* Interceptor: never call the native Geolocation API until the user has
   independently accepted the Privacy Policy. Cancel leaves the app usable
   via manual city search. Continuation is synchronous so a granted click
   proceeds in the same turn. */
function getUserLocation(notify) {
  if (consentLocked()) return;
  requestPrivacyConsent(() => requestUserPosition(notify));
}
function requestUserPosition(notify) {
  state.geoRequests = (state.geoRequests || 0) + 1;
  showLoader();
  const options = { enableHighAccuracy: true, timeout: 7000, maximumAge: 300000 };
  const nativeGeo = nativePlugin('Geolocation');

  if (nativeGeo) {
    (async () => {
      try {
        let permission = await nativeGeo.checkPermissions();
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          permission = await nativeGeo.requestPermissions();
        }
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') throw new Error('Location permission denied');
        const pos = await nativeGeo.getCurrentPosition(options);
        await applyUserPosition(pos, notify);
      } catch (e) {
        handleLocationFailure();
      }
    })();
    return;
  }

  if (!navigator.geolocation) { fetchWeather(); return; }
  showLoader();
  navigator.geolocation.getCurrentPosition(
    (pos) => { applyUserPosition(pos, notify).catch(handleLocationFailure); },
    handleLocationFailure,
    options
  );
}

/* ---------------- rendering ---------------- */
function renderAll() {
  applyWeatherTheme();
  updateHero();
  updateMetrics();
  renderSunArc();
  /* The heavy chart/hourly/daily renderers are routed through the Section
     Manager so off-screen sections are skipped (and re-rendered lazily when
     they scroll back into view) instead of always rebuilding their DOM. */
  SECTION_MANAGER.renderSection('chart');
  SECTION_MANAGER.renderSection('hourly');
  SECTION_MANAGER.renderSection('daily');
  renderAlerts();
  updateFavIcon();
  document.title = `${state.locationName} · LiveSky`;

  /* Update FX intensity based on actual weather data */
  updateFXIntensity();

  /* Notify Section Manager — trigger re-entry animations for visible sections */
  if (SECTION_MANAGER && SECTION_MANAGER.refreshVisible) {
    SECTION_MANAGER.refreshVisible();
  }
}

/* Calculate and apply rain/snow intensity from actual weather data (0-1 scale).
   Maps precipitation data to particle count, speed, and opacity. */
function updateFXIntensity() {
  if (!state.weather) return;
  const h = state.weather.hourly, i = state.nowIdx;
  const code = currentWeatherCode();
  const precip = getVal(h, 'precipitation', i) || 0;
  const precipProb = getVal(h, 'precipitation_probability', i) || 0;
  const gust = getVal(h, 'windgusts_10m', i) || 0;
  const wind = getVal(h, 'windspeed_10m', i) || 0;

  const rainCodes = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99];
  const snowCodes = [71,73,75,77,85,86];

  let intensity = 0.5; /* default moderate */

  if (FX.kind === 'rain') {
    /* Heavy rain codes: 65 (heavy rain), 82 (violent showers) */
    if ([65, 82, 96, 99].includes(code)) intensity = 0.9;
    else if ([63, 66, 67, 95].includes(code)) intensity = 0.75;
    else if ([53, 55, 57, 80, 81].includes(code)) intensity = 0.55;
    else if ([51, 61].includes(code)) intensity = 0.35;
    else if (precipProb > 60) intensity = 0.4;
    else if (precipProb > 30) intensity = 0.3;
    else intensity = 0.2;

    /* Wind boosts intensity (wind drives rain sideways) */
    if (wind > 15 || gust > 20) intensity = Math.min(1, intensity + 0.15);

    /* Precipitation amount scales intensity */
    if (precip > 5) intensity = Math.min(1, intensity + 0.15);
    else if (precip > 2) intensity = Math.min(1, intensity + 0.1);
  } else if (FX.kind === 'snow') {
    /* Heavy snow: 75, 86 */
    if ([75, 86].includes(code)) intensity = 0.85;
    else if ([73, 85].includes(code)) intensity = 0.65;
    else if ([71, 77].includes(code)) intensity = 0.4;
    else if (precipProb > 50) intensity = 0.35;
    else intensity = 0.25;
  }

  FX.setIntensity(intensity);
}

function updateHero() {
  el.location.textContent = state.locationName;
  const heroFlag = flagUrl(state.countryCode);
  el.locationFlag.classList.toggle('hidden', !heroFlag);
  if (heroFlag) {
    el.locationFlag.onerror = () => el.locationFlag.classList.add('hidden');
    el.locationFlag.src = heroFlag;
  }
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
  const temp = interpHour(h, 'temperature_2m', i); /* interpolated "now" */
  /* Prefer 15-min weather code when available so mid-hour rain start/stop shows. */
  const code = (typeof currentWeatherCodeLive === 'function' ? currentWeatherCodeLive() : null) ?? getVal(h, 'weathercode', i);
  const feels = interpHour(h, 'apparent_temperature', i);
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
  el.mFeels.textContent = fmtTempDeg(interpHour(h, 'apparent_temperature', i));
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
  /* The arrow points the direction the wind comes FROM — the same convention as
     the adjacent text label (e.g. "N wind" → arrow points north), so arrow and
     text can never contradict each other. */
  el.mWindArrow.style.transform = `rotate(${(dir || 45) - 45}deg)`;
  if (el.mWindArrow) {
    el.mWindArrow.title = (dirFull ? dirFull : t('wind')) + ' · ' + t('wind_dir_hint');
    el.mWindArrow.setAttribute('aria-label', (dirFull ? dirFull : t('wind')) + ' · ' + t('wind_dir_hint'));
  }
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
let chartMeta = null; /* { n, start, tmin, tmax, Y, X } for minute scrubbing */
let chartSelFrac = 0; /* 0..n continuous hour index (fractional = minutes) */
let chartScrubBound = false;

function hourIsWet(code, precip) {
  if (SNOW_CODES.includes(code) || RAIN_CODES.includes(code)) return true;
  return precip != null && precip >= 0.2;
}
function hourWetKind(code, precip) {
  if (SNOW_CODES.includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  if (RAIN_CODES.includes(code) || (precip != null && precip >= 0.2)) return 'rain';
  return null;
}
/* Contiguous wet windows on the 24h chart for hatching + start/end labels. */
function buildRainBands(codes, precs) {
  const bands = [];
  let i = 0;
  while (i < codes.length) {
    let kind = hourWetKind(codes[i], precs[i]);
    if (!kind) { i++; continue; }
    const start = i;
    let end = i;
    let heavy = kind === 'storm' || (precs[i] || 0) >= 2;
    while (end + 1 < codes.length) {
      const nk = hourWetKind(codes[end + 1], precs[end + 1]);
      if (!nk) break;
      end++;
      if (nk === 'storm' || (precs[end] || 0) >= 2) heavy = true;
      if (nk === 'storm') kind = 'storm';
      else if (kind !== 'storm' && nk === 'snow') kind = 'snow';
    }
    bands.push({ start, end, kind: heavy && kind === 'rain' ? 'heavy' : kind });
    i = end + 1;
  }
  return bands;
}

/* Pin band edges to real minutes via Open-Meteo minutely_15 when available.
   Hourly alone only knows whole hours — minutely gives ~15-min precision
   (and we still show HH:MM, never bare hours). */
function refineBandMinutes(band, times) {
  const roughStart = absMinLocal(times[band.start]);
  /* Default end = start of the hour AFTER the last wet hour (exclusive). */
  const roughEnd = absMinLocal(times[band.end]) + 60;
  let startAbs = roughStart;
  let endAbs = roughEnd;
  let precise = false;

  const m = state.minutely;
  if (m && m.time && m.time.length) {
    /* Search a small pad around the hourly window for the true wet stretch. */
    const pad = 45;
    let firstWet = null, lastWet = null;
    for (let k = 0; k < m.time.length; k++) {
      const a = absMinLocal(m.time[k]);
      if (a + 15 < roughStart - pad) continue;
      if (a > roughEnd + pad) break;
      const code = getMinVal(m, 'weathercode', k) ?? getMinVal(m, 'weather_code', k);
      const precip = getMinVal(m, 'precipitation', k) || 0;
      const wet = precipWetAt(code, precip, null) || hourIsWet(code, precip);
      if (!wet) continue;
      /* Prefer slots that overlap the rough hourly window. */
      if (a + 15 <= roughStart - 5) continue;
      if (a >= roughEnd + 5) continue;
      if (firstWet == null) firstWet = a;
      lastWet = a;
    }
    if (firstWet != null && lastWet != null) {
      startAbs = firstWet;
      endAbs = lastWet + 15; /* end of the last wet 15-min slot */
      precise = true;
    }
  }

  /* Guard rails */
  if (endAbs <= startAbs) endAbs = startAbs + 15;
  return {
    startAbs,
    endAbs,
    startLabel: hhmmFromAbs(startAbs),
    endLabel: hhmmFromAbs(endAbs),
    precise
  };
}

/* Convert absolute city-local minutes → chart X fraction (hours from chart origin). */
function bandAbsToFrac(abs, chartStartAbs, hours) {
  return Math.max(0, Math.min(hours, (abs - chartStartAbs) / 60));
}

function renderChart() {
  const h = state.weather && state.weather.hourly;
  if (!h) return;
  const n = 24, start = state.nowIdx;
  const temps = [], precs = [], times = [], codes = [];
  let tmin = Infinity, tmax = -Infinity, pmax = 0;
  for (let k = 0; k <= n; k++) {
    const i = start + k;
    if (i >= h.time.length) break;
    const tv = getVal(h, 'temperature_2m', i);
    const pv = getVal(h, 'precipitation', i) || 0;
    const cv = getVal(h, 'weathercode', i);
    times.push(h.time[i]);
    temps.push(tv); precs.push(pv); codes.push(cv);
    if (tv != null) { if (tv < tmin) tmin = tv; if (tv > tmax) tmax = tv; }
    if (pv > pmax) pmax = pv;
  }
  const m = temps.length;
  if (!m || !isFinite(tmin)) {
    chartData = [];
    chartMeta = null;
    if (el.chartSvg) el.chartSvg.innerHTML = '';
    if (el.chartAxis) el.chartAxis.innerHTML = '';
    if (el.chartDetail) el.chartDetail.innerHTML = '';
    const sum = $('chart-rain-summary');
    if (sum) { sum.innerHTML = ''; sum.classList.add('hidden'); }
    if (el.chartPlot) {
      const mk = el.chartPlot.querySelector('.chart-rain-markers');
      if (mk) mk.innerHTML = '';
    }
    hideChartGuide();
    return;
  }
  if (tmax - tmin < 2) { tmax += 1; tmin -= 1; }
  const pad = (tmax - tmin) * 0.18;
  tmin -= pad; tmax += pad;
  pmax = Math.max(pmax, 2.5);

  const hours = Math.max(1, m - 1);
  const X = k => (k / hours) * 100;
  const Y = v => 8 + (1 - (v - tmin) / (tmax - tmin)) * 84;
  const pts = [];
  for (let k = 0; k < m; k++) if (temps[k] != null) pts.push([X(k), Y(temps[k])]);
  const line = smoothPath(pts);
  /* Closed path under the temperature curve — used both as fill and as clip for rain hatch. */
  const area = `${line} L ${X(m - 1).toFixed(2)} 100 L ${X(0).toFixed(2)} 100 Z`;

  /* Rain / snow bands — hatch ONLY under the temperature line (clipped).
     Edges are refined to minutes via minutely_15 so chips say 21:15–01:00, not 21:00–01:00. */
  const bands = buildRainBands(codes, precs);
  const chartStartAbs = times.length ? absMinLocal(times[0]) : 0;
  bands.forEach((b) => {
    const r = refineBandMinutes(b, times);
    b.startAbs = r.startAbs;
    b.endAbs = r.endAbs;
    b.startLabel = r.startLabel;
    b.endLabel = r.endLabel;
    b.precise = r.precise;
    b.f0 = bandAbsToFrac(r.startAbs, chartStartAbs, hours);
    b.f1 = bandAbsToFrac(r.endAbs, chartStartAbs, hours);
  });
  /* Diagonal hatch corrected for SVG stretch (viewBox 100×100 → wide short plot).
     Without this, 45° lines become near-horizontal and look jagged. */
  const plotRect = el.chartPlot ? el.chartPlot.getBoundingClientRect() : { width: 1120, height: 190 };
  const sx = Math.max(1, plotRect.width) / 100;
  const sy = Math.max(1, plotRect.height) / 100;
  /* Target ~32° hatch on screen */
  const screenRad = 32 * Math.PI / 180;
  const userDeg = Math.atan(Math.tan(screenRad) * (sx / sy)) * 180 / Math.PI;
  /* ~9px stripe spacing on screen → spacing in user units along X after rotation */
  const spacingUser = Math.max(1.2, 9 / sx);
  const hatchStroke = Math.max(0.35, 1.6 / sx); /* ~1.6px on screen */

  let rainDefs = '';
  /* One shared hatch pattern per kind (aspect-corrected). */
  const hatchKinds = {
    rain: 'rgba(56,189,248,0.62)',
    heavy: 'rgba(37,99,235,0.72)',
    storm: 'rgba(167,139,250,0.72)',
    snow: 'rgba(186,230,253,0.75)'
  };
  Object.keys(hatchKinds).forEach((kind) => {
    const stroke = hatchKinds[kind];
    const tint = kind === 'snow' ? 'rgba(125,211,252,0.16)'
      : kind === 'storm' ? 'rgba(167,139,250,0.18)'
      : kind === 'heavy' ? 'rgba(37,99,235,0.16)'
      : 'rgba(56,189,248,0.14)';
    rainDefs += `<pattern id="rainHatch_${kind}" patternUnits="userSpaceOnUse" width="${spacingUser.toFixed(3)}" height="${spacingUser.toFixed(3)}" patternTransform="rotate(${(-userDeg).toFixed(2)})">
      <rect width="${spacingUser.toFixed(3)}" height="${spacingUser.toFixed(3)}" fill="${tint}"/>
      <line x1="0" y1="0" x2="0" y2="${spacingUser.toFixed(3)}" stroke="${stroke}" stroke-width="${hatchStroke.toFixed(3)}" stroke-linecap="square"/>
    </pattern>`;
  });

  let rainRects = '';
  bands.forEach((b) => {
    const x1 = X(b.f0);
    const x2 = X(b.f1);
    const w = Math.max(0.6, x2 - x1);
    const kind = (b.kind === 'snow' || b.kind === 'storm' || b.kind === 'heavy') ? b.kind : 'rain';
    rainRects += `<rect class="chart-rain-zone" x="${x1.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="100" fill="url(#rainHatch_${kind})"/>`;
  });

  let bars = '';
  for (let k = 0; k < m; k++) {
    const ph = Math.min(1, precs[k] / pmax) * 22;
    if (ph <= 0.4) continue;
    const bw = (100 / hours) * 0.48;
    const wet = hourIsWet(codes[k], precs[k]);
    const col = SNOW_CODES.includes(codes[k]) ? '#7dd3fc' : '#60a5fa';
    bars += `<rect x="${(X(k) - bw / 2).toFixed(2)}" y="${(100 - ph).toFixed(2)}" width="${bw.toFixed(2)}" height="${ph.toFixed(2)}" rx="1.5" fill="${col}" opacity="${wet ? 0.65 : 0.4}"/>`;
  }

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
        <stop offset="0%" stop-color="${hexToRgba(state.accent, 0.28)}"/><stop offset="100%" stop-color="${hexToRgba(state.accent, 0)}"/>
      </linearGradient>
      <clipPath id="tempUnderClip" clipPathUnits="userSpaceOnUse">
        <path d="${area}"/>
      </clipPath>
      ${rainDefs}
    </defs>
    ${grid}
    <path d="${area}" fill="url(#areaGrad)"/>
    <g class="chart-rain-layer" clip-path="url(#tempUnderClip)">${rainRects}</g>
    <path d="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <line x1="${X(0).toFixed(2)}" y1="5" x2="${X(0).toFixed(2)}" y2="100" stroke="${state.accent}" stroke-width="0.7" opacity="0.3"/>
    ${bars}`;

  chartData = [];
  for (let k = 0; k < m; k++) {
    const i = start + k;
    chartData.push({
      k, i, time: times[k],
      temp: getVal(h, 'temperature_2m', i),
      prec: getVal(h, 'precipitation', i) || 0,
      wind: getVal(h, 'windspeed_10m', i),
      gust: getVal(h, 'windgusts_10m', i),
      hum: getVal(h, 'relativehumidity_2m', i),
      feels: getVal(h, 'apparent_temperature', i),
      code: codes[k],
      wet: hourIsWet(codes[k], precs[k]),
      yPct: temps[k] != null ? Y(temps[k]) : null
    });
  }
  chartMeta = { n: hours, m, start, tmin, tmax, Y, X, hours, bands };

  let axis = '';
  for (let k = 0; k <= hours; k += 6) {
    const i = start + k;
    const hr = i < h.time.length ? parseInt(h.time[i].slice(11, 13), 10) : 0;
    axis += `<span>${k === 0 ? t('now') : String(hr).padStart(2, '0') + ':00'}</span>`;
  }
  el.chartAxis.innerHTML = axis;

  /* Icons as HTML overlays — never stretched by the SVG's preserveAspectRatio=none. */
  renderChartRainMarkers(bands, temps, X, Y, hours);
  renderChartRainSummary(bands, times);
  bindChartScrub();
  const nowMin = tzNow(state.tz).minute;
  chartSelFrac = Math.min(hours, Math.max(0, nowMin / 60));
  showChartAtFrac(chartSelFrac);
}

/* Small round badges on the temperature line at the mid of each rain band. */
function renderChartRainMarkers(bands, temps, X, Y, hours) {
  const plot = el.chartPlot;
  if (!plot) return;
  let layer = plot.querySelector('.chart-rain-markers');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'chart-rain-markers';
    layer.setAttribute('aria-hidden', 'true');
    plot.appendChild(layer);
  }
  if (!bands || !bands.length) { layer.innerHTML = ''; return; }
  layer.innerHTML = bands.map(b => {
    const mid = (b.f0 != null && b.f1 != null) ? (b.f0 + b.f1) / 2 : (b.start + Math.min(hours, b.end + 1)) / 2;
    const i0 = Math.max(0, Math.min(temps.length - 1, Math.floor(mid)));
    const i1 = Math.max(0, Math.min(temps.length - 1, Math.ceil(mid)));
    const u = mid - Math.floor(mid);
    const ta = temps[i0], tb = temps[i1];
    const temp = (ta != null && tb != null) ? ta + (tb - ta) * u : (ta != null ? ta : tb);
    if (temp == null || isNaN(temp)) return '';
    const left = X(mid);
    const top = Y(temp);
    const icon = b.kind === 'snow' ? 'ph-snowflake' : b.kind === 'storm' ? 'ph-cloud-lightning' : 'ph-cloud-rain';
    const cls = b.kind === 'snow' ? 'snow' : b.kind === 'storm' ? 'storm' : b.kind === 'heavy' ? 'heavy' : 'rain';
    return `<span class="crm-badge crm-${cls}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%"><i class="ph-fill ${icon}"></i></span>`;
  }).join('');
}

function renderChartRainSummary(bands, times) {
  let box = $('chart-rain-summary');
  if (!box) {
    /* inject once under the chart title area if markup is missing */
    const card = el.chartDetail && el.chartDetail.parentElement;
    if (!card) return;
    box = document.createElement('div');
    box.id = 'chart-rain-summary';
    box.className = 'chart-rain-summary';
    card.insertBefore(box, el.chartDetail);
  }
  if (!bands || !bands.length) {
    box.innerHTML = `<i class="ph-fill ph-sun"></i><span>${t('chart_no_rain')}</span>`;
    box.classList.remove('hidden', 'has-rain', 'has-snow', 'has-storm');
    box.classList.add('dry');
    return;
  }
  box.classList.remove('hidden', 'dry');
  const parts = bands.slice(0, 4).map(b => {
    /* Always HH:MM — refined from minutely when possible. */
    const ts = b.startLabel || (times[b.start] ? times[b.start].slice(11, 16) : '--:--');
    const te = b.endLabel || (times[Math.min(times.length - 1, b.end)] ? times[Math.min(times.length - 1, b.end)].slice(11, 16) : '--:--');
    const icon = b.kind === 'snow' ? 'ph-snowflake' : b.kind === 'storm' ? 'ph-cloud-lightning' : 'ph-cloud-rain';
    const label = b.kind === 'snow' ? t('chart_snow_window')
      : b.kind === 'storm' ? t('chart_storm_window')
      : b.kind === 'heavy' ? t('chart_heavy_rain_window')
      : t('chart_rain_window');
    return `<span class="crs-item crs-${b.kind}" title="${escHtml(ts)} – ${escHtml(te)}"><i class="ph-fill ${icon}"></i>${label.replace('{a}', ts).replace('{b}', te)}</span>`;
  });
  box.innerHTML = parts.join('');
  box.classList.toggle('has-snow', bands.some(b => b.kind === 'snow'));
  box.classList.toggle('has-storm', bands.some(b => b.kind === 'storm'));
  box.classList.add('has-rain');
}

/* Linear interpolate a field between two hourly samples. */
function chartLerp(a, b, t) {
  if (a == null || isNaN(a)) return b;
  if (b == null || isNaN(b)) return a;
  return a + (b - a) * t;
}

/* Resolve continuous hour-fraction → display values (minutes between hours). */
function chartSampleAt(frac) {
  if (!chartData.length || !chartMeta) return null;
  const maxF = chartMeta.hours;
  frac = Math.max(0, Math.min(maxF, frac));
  const i0 = Math.floor(frac);
  const i1 = Math.min(chartData.length - 1, i0 + 1);
  const u = frac - i0; /* hour fraction 0..1 — NOT named t (that's i18n) */
  const a = chartData[i0], b = chartData[i1];
  if (!a) return null;
  const temp = chartLerp(a.temp, b ? b.temp : a.temp, u);
  const prec = chartLerp(a.prec, b ? b.prec : a.prec, u);
  const wind = chartLerp(a.wind, b ? b.wind : a.wind, u);
  const gust = chartLerp(a.gust, b ? b.gust : a.gust, u);
  const hum = chartLerp(a.hum, b ? b.hum : a.hum, u);
  const feels = chartLerp(a.feels, b ? b.feels : a.feels, u);
  /* Build HH:MM label from the base hour + fractional minutes. */
  let when;
  if (frac < 0.008) {
    when = t('now');
  } else if (Math.abs(u - 1) < 0.001 && b) {
    when = b.time.slice(11, 16);
  } else {
    const hh = parseInt(a.time.slice(11, 13), 10);
    const totalMin = hh * 60 + Math.round(u * 60);
    const H = Math.floor(totalMin / 60) % 24;
    const M = totalMin % 60;
    when = `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
  }
  const yPct = temp != null && chartMeta ? chartMeta.Y(temp) : 50;
  const xPct = (frac / maxF) * 100;
  return { when, temp, prec, wind, gust, hum, feels, yPct, xPct, frac, i0 };
}

function showChartAtFrac(frac) {
  const s = chartSampleAt(frac);
  if (!s || !el.chartDetail) return;
  chartSelFrac = s.frac;
  /* Nearest hourly sample for wet/code */
  const nearest = chartData[Math.round(s.frac)] || chartData[s.i0] || {};
  const wet = nearest.wet || (s.prec != null && s.prec >= 0.15);
  const code = nearest.code;
  let rainChip = '';
  if (wet) {
    const kind = hourWetKind(code, s.prec);
    const icon = kind === 'snow' ? 'ph-snowflake' : kind === 'storm' ? 'ph-cloud-lightning' : 'ph-cloud-rain';
    const lab = kind === 'snow' ? t('chart_at_snow') : kind === 'storm' ? t('chart_at_storm') : t('chart_at_rain');
    rainChip = `<div class="cd-item cd-rain"><span class="cd-label"><i class="ph-fill ${icon}"></i>${lab}</span><span class="cd-val">${fmtPrecip(s.prec)}</span></div>`;
  }
  el.chartDetail.innerHTML = `
    <div class="cd-item cd-time"><span class="cd-label"><i class="ph ph-clock"></i>${s.when}</span><span class="cd-val">${fmtTempDeg(s.temp)}</span></div>
    ${rainChip || `<div class="cd-item"><span class="cd-label"><i class="ph ph-cloud-rain"></i>${t('precip')}</span><span class="cd-val">${fmtPrecip(s.prec)}</span></div>`}
    <div class="cd-item"><span class="cd-label"><i class="ph ph-wind"></i>${t('wind')}</span><span class="cd-val">${fmtWind(s.wind)}</span></div>
    ${s.gust != null && s.gust > 0.1 ? `<div class="cd-item"><span class="cd-label"><i class="ph ph-wind"></i>${t('wind_gusts')}</span><span class="cd-val">${fmtWind(s.gust)}</span></div>` : ''}
    <div class="cd-item"><span class="cd-label"><i class="ph ph-drop"></i>${t('humidity')}</span><span class="cd-val">${s.hum != null ? Math.round(s.hum) + '%' : '--'}</span></div>`;
  el.chartDetail.querySelectorAll('.cd-item').forEach(n => n.classList.add('swap'));
  if (el.chartGuide) {
    el.chartGuide.style.left = `${s.xPct}%`;
    el.chartGuide.style.opacity = '1';
    if (el.chartGuideDot) el.chartGuideDot.style.top = `${s.yPct}%`;
  }
}

function hideChartGuide() {
  if (el.chartGuide) el.chartGuide.style.opacity = '0';
}

/* Pointer scrubbing on the plot: mouse move OR finger drag moves the guide
   continuously across minutes between hours. Vertical page scroll still works
   outside the plot; the plot itself uses touch-action:none. */
function bindChartScrub() {
  const target = el.chartScrub || el.chartPlot;
  if (!target || chartScrubBound) return;
  chartScrubBound = true;
  let active = false;
  let pointerId = null;

  const fracFromEvent = (e) => {
    const plot = el.chartPlot;
    if (!plot || !chartMeta) return 0;
    const rect = plot.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    return Math.max(0, Math.min(1, x)) * chartMeta.hours;
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active = true;
    pointerId = e.pointerId;
    if (el.chartPlot) el.chartPlot.classList.add('is-scrubbing');
    try { target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    showChartAtFrac(fracFromEvent(e));
    if (e.cancelable) e.preventDefault();
  };
  const onMove = (e) => {
    if (!active || (pointerId != null && e.pointerId !== pointerId)) {
      /* Hover preview on desktop without pressing. */
      if (!active && e.pointerType === 'mouse' && chartMeta) showChartAtFrac(fracFromEvent(e));
      return;
    }
    showChartAtFrac(fracFromEvent(e));
    if (e.cancelable) e.preventDefault();
  };
  const onUp = (e) => {
    if (!active) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    active = false;
    pointerId = null;
    if (el.chartPlot) el.chartPlot.classList.remove('is-scrubbing');
    try { target.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove, { passive: false });
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);
  target.addEventListener('lostpointercapture', onUp);
  /* Keep guide visible; clicking opens the nearest hourly modal. */
  target.addEventListener('dblclick', (e) => {
    if (!chartMeta || !state.weather) return;
    const frac = fracFromEvent(e);
    const idx = state.nowIdx + Math.round(frac);
    if (idx >= 0 && idx < state.weather.hourly.time.length) showModalHourly(state.weather.hourly, idx);
  });
}

/* ---------- live clock-driven refresh (no full reload needed) ---------- */
/* Keep nowIdx in sync when the local hour rolls over between fetches. */
function syncNowIdx() {
  if (!state.weather || !state.weather.hourly) return false;
  const iso = tzNow(state.tz).iso;
  const idx = state.weather.hourly.time.findIndex(tm => tm.startsWith(iso));
  if (idx === -1 || idx === state.nowIdx) return false;
  state.nowIdx = idx;
  return true;
}

/* Called every minute (and on tab-focus). Recomputes the "right now" view from
   already-fetched data so rain end/start chips, temperature interpolation and
   the chart cursor tick forward without waiting for the next network pull.
   A silent network refresh is kicked off every ~3 minutes while the tab is open. */
let liveMinuteKey = '';
let liveRefreshTimer = 0;
function liveTick(force) {
  if (!state.weather) return;
  const n = tzNow(state.tz);
  const key = n.date + 'T' + String(n.hour).padStart(2,'0') + ':' + String(n.minute).padStart(2,'0');
  if (!force && key === liveMinuteKey) return;
  liveMinuteKey = key;

  const hourChanged = syncNowIdx();
  /* Lightweight live updates — always cheap. */
  updateRainStatus();
  updateHeroLive();
  renderAlerts();
  /* Nudge the chart "now" cursor with the real minute when the user isn't scrubbing. */
  if (chartMeta && el.chartPlot && !el.chartPlot.classList.contains('is-scrubbing')) {
    const nowMin = tzNow(state.tz).minute;
    showChartAtFrac(Math.min(chartMeta.hours, nowMin / 60));
  }
  renderSunArc();

  if (hourChanged) {
    /* Hour boundary: rebuild heavier hourly-dependent sections. */
    SECTION_MANAGER.renderSection('chart');
    SECTION_MANAGER.renderSection('hourly');
    renderAlerts();
    applyWeatherTheme();
    updateFXIntensity();
  }

  /* Silent network refresh cadence: every 3 minutes while visible.
     Faster than the old 15-min interval so rain ending "this minute" is noticed. */
  if (!document.hidden && Date.now() - state.lastFetchTs > 3 * 60 * 1000) {
    fetchWeather(true);
  }
}

/* Soft hero update used by the live ticker — avoids re-animating the big number
   every minute (only when the rounded ° actually changes). */
function updateHeroLive() {
  if (!state.weather) return;
  const h = state.weather.hourly, i = state.nowIdx;
  const temp = interpHour(h, 'temperature_2m', i);
  const code = currentWeatherCodeLive();
  const night = hourIsNight(i);
  if (temp != null && !isNaN(temp)) {
    const rounded = Math.round(convTemp(temp));
    if (String(el.temp.dataset.v) !== String(rounded)) {
      el.temp.className = 'temp-num' + (tempClass(temp) ? ' ' + tempClass(temp) : '');
      animateNumber(el.temp, rounded);
    }
  }
  el.cond.textContent = wmoLabel(code);
  setBigIcon(wmoIcon(code, night));
  const now = tzNow(state.tz);
  el.updatedAt.textContent = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
  /* feels-like also tracks the minute */
  if (el.mFeels) el.mFeels.textContent = fmtTempDeg(interpHour(h, 'apparent_temperature', i));
}

/* Prefer minutely weather code for "right now" when available — more accurate
   for rain starting/stopping mid-hour. */
function currentWeatherCodeLive() {
  if (state.minutely && state.minutely.time && state.minutely.time.length) {
    const info = minutelyPrecipInfo();
    if (info && info.code != null) return info.code;
  }
  return currentWeatherCode();
}

function startLiveTicker() {
  if (liveRefreshTimer) clearInterval(liveRefreshTimer);
  liveTick(true);
  /* 15s is enough to catch minute rollover quickly without burning battery. */
  liveRefreshTimer = setInterval(() => liveTick(false), 15000);
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

/* ---------- alerts (minute-aware, multi-hazard) ---------- */
/* Time with minutes: "сейчас" | "через 23 мин · 15:47" | "через 2 ч · 15:47". */
function formatAlertWhen(absMin) {
  if (absMin == null) return '';
  const nowA = nowAbsMin();
  const delta = Math.max(0, Math.round(absMin - nowA));
  const at = hhmmFromAbs(absMin); /* always HH:MM */
  if (delta <= 1) return t('alert_when_now') + ' · ' + at;
  if (delta < 60) return t('alert_when_in_min').replace('{n}', String(delta)).replace('{t}', at);
  const h = Math.floor(delta / 60), m = delta % 60;
  if (delta < 24 * 60) {
    if (m === 0) return t('alert_when_in_h').replace('{h}', String(h)).replace('{t}', at);
    return t('alert_when_in_hm').replace('{h}', String(h)).replace('{m}', String(m)).replace('{t}', at);
  }
  return t('alert_when_at').replace('{t}', at);
}
/* Short banner: "Гроза · через 23 мин · 15:47" (+ optional wind). */
function formatAlertMsg(type, absMin, extra) {
  const when = formatAlertWhen(absMin);
  let name = t('alert_name_' + type);
  if (name === 'alert_name_' + type) {
    const fallback = t('alert_msg_' + type);
    name = (fallback && fallback !== 'alert_msg_' + type) ? fallback.split('{')[0].trim() : type;
  }
  let tail = '';
  if ((type === 'wind' || type === 'wind_extreme' || type === 'blizzard') && extra && extra.windMs != null) {
    tail = ' · ' + fmtWind(extra.windMs);
  }
  return (name + ' · ' + when + tail).replace(/\s{2,}/g, ' ').trim();
}

/* Pick the first wet/storm/snow minute inside an hourly slot (or the hour start). */
function alertTimeForHour(hourIdx, preferCodes) {
  const h = state.weather && state.weather.hourly;
  if (!h || hourIdx < 0 || hourIdx >= h.time.length) return nowAbsMin();
  const hourAbs = absMinLocal(h.time[hourIdx]);
  const m = state.minutely;
  if (m && m.time && m.time.length) {
    for (let k = 0; k < m.time.length; k++) {
      const a = absMinLocal(m.time[k]);
      if (a < hourAbs) continue;
      if (a >= hourAbs + 60) break;
      const code = getMinVal(m, 'weathercode', k) ?? getMinVal(m, 'weather_code', k);
      const precip = getMinVal(m, 'precipitation', k) || 0;
      if (preferCodes && preferCodes.length) {
        if (preferCodes.includes(code)) return a;
      } else if (precipWetAt(code, precip, null) || hourIsWet(code, precip)) {
        return a;
      }
    }
  }
  /* Fall back to "now" if this is the current hour and hazard is already on. */
  const nowA = nowAbsMin();
  if (nowA >= hourAbs && nowA < hourAbs + 60) return nowA;
  return hourAbs;
}

function renderAlerts() {
  if (!state.weather) { el.alertBox.classList.add('hidden'); return; }
  const alerts = collectHazardAlerts(12); /* next 12h for the banner */
  if (!alerts.length) {
    el.alertBox.classList.add('hidden');
    el.alertMsg.textContent = '';
    return;
  }
  /* One crisp line — short and scannable (second hazard is still in notifications). */
  const top = alerts.slice(0, 1);
  el.alertMsg.textContent = top.map(a => formatAlertMsg(a.type, a.abs, a.extra)).join(' · ');
  el.alertBox.classList.remove('hidden');
  el.alertBox.dataset.hazard = top[0].type;
}

/* Severity rank — higher = more urgent when times are equal. */
const HAZARD_RANK = {
  storm: 100, hail: 95, blizzard: 90, ice: 85,
  rain_heavy: 70, snow_heavy: 68, wind_extreme: 65, wind: 55,
  heat: 50, cold: 50, fog: 40, uv: 30
};

/* Scan hourly (+ minutely refine) for hazards in the next `hoursAhead` hours. */
function collectHazardAlerts(hoursAhead) {
  if (!state.weather) return [];
  const h = state.weather.hourly;
  const end = Math.min(state.nowIdx + (hoursAhead || 24), h.time.length);
  const nowA = nowAbsMin();
  const found = [];
  const seen = new Set(); /* type|hour bucket — one alert per type per hour */

  const push = (type, hourIdx, extra) => {
    const key = type + '|' + h.time[hourIdx].slice(0, 13);
    if (seen.has(key)) return;
    seen.add(key);
    const codes = type === 'storm' || type === 'hail' ? [95, 96, 99]
      : type === 'blizzard' || type === 'snow_heavy' || type === 'ice' ? SNOW_CODES.concat([66, 67, 56, 57])
      : type === 'rain_heavy' ? [65, 82, 81, 63] : null;
    const abs = alertTimeForHour(hourIdx, codes);
    if (abs + 5 < nowA && hourIdx === state.nowIdx) {
      /* already past within this hour — still show as "now" */
    } else if (abs + 2 < nowA) {
      return; /* fully in the past */
    }
    found.push({
      type,
      t: h.time[hourIdx].slice(0, 11) + hhmmFromAbs(abs), /* synthetic ISO with minutes */
      abs,
      hourIdx,
      extra: extra || null,
      rank: HAZARD_RANK[type] || 0
    });
  };

  for (let i = state.nowIdx; i < end; i++) {
    const code = getVal(h, 'weathercode', i);
    const feels = getVal(h, 'apparent_temperature', i);
    const temp = getVal(h, 'temperature_2m', i);
    const gust = getVal(h, 'windgusts_10m', i);
    const wind = getVal(h, 'windspeed_10m', i) || 0;
    const vis = getVal(h, 'visibility', i);
    const uv = getVal(h, 'uv_index', i);
    const precip = getVal(h, 'precipitation', i) || 0;
    const peakWind = Math.max(wind, gust != null ? gust : 0);

    /* Thunder / hail */
    if (code === 96 || code === 99) push('hail', i);
    else if (code === 95) push('storm', i);

    /* Snow hazards */
    if ([75, 86].includes(code) && peakWind >= 12) push('blizzard', i, { windMs: peakWind });
    else if ([75, 86].includes(code) || (SNOW_CODES.includes(code) && precip >= 2)) push('snow_heavy', i);
    else if ([66, 67, 56, 57].includes(code)) push('ice', i);

    /* Heavy rain / downpour */
    if ([65, 82].includes(code) || (RAIN_CODES.includes(code) && precip >= 5)) push('rain_heavy', i);

    /* Wind — two tiers */
    if (peakWind >= 28) push('wind_extreme', i, { windMs: peakWind });
    else if (peakWind >= 18) push('wind', i, { windMs: peakWind });

    /* Temperature extremes (feels-like) */
    if (feels != null && feels >= 37) push('heat', i, { temp: feels });
    if (feels != null && feels <= -20) push('cold', i, { temp: feels });
    else if (temp != null && temp <= -25) push('cold', i, { temp });

    /* Fog */
    if (vis != null && vis < 500) push('fog', i);
    else if (vis != null && vis < 1000 && [45, 48].includes(code)) push('fog', i);

    /* Extreme UV (daytime only) */
    if (uv != null && uv >= 10) push('uv', i);
  }

  /* Also check minutely nowcast for near-term storm/rain that hourly might still show as dry. */
  const m = state.minutely;
  if (m && m.time && m.time.length) {
    const horizon = nowA + 6 * 60;
    for (let k = 0; k < m.time.length; k++) {
      const a = absMinLocal(m.time[k]);
      if (a < nowA - 5) continue;
      if (a > horizon) break;
      const code = getMinVal(m, 'weathercode', k) ?? getMinVal(m, 'weather_code', k);
      const precip = getMinVal(m, 'precipitation', k) || 0;
      const keyHour = hhmmFromAbs(a).slice(0, 2); /* rough de-dupe by hour */
      if ([96, 99].includes(code) && !seen.has('hail|' + m.time[k].slice(0, 13))) {
        seen.add('hail|' + m.time[k].slice(0, 13));
        found.push({ type: 'hail', t: m.time[k], abs: a, hourIdx: -1, extra: null, rank: HAZARD_RANK.hail });
      } else if (code === 95 && !seen.has('storm|' + m.time[k].slice(0, 13))) {
        seen.add('storm|' + m.time[k].slice(0, 13));
        found.push({ type: 'storm', t: m.time[k], abs: a, hourIdx: -1, extra: null, rank: HAZARD_RANK.storm });
      } else if ((code === 65 || code === 82 || precip >= 5) && RAIN_CODES.includes(code)
        && !seen.has('rain_heavy|' + m.time[k].slice(0, 13))) {
        seen.add('rain_heavy|' + m.time[k].slice(0, 13));
        found.push({ type: 'rain_heavy', t: m.time[k], abs: a, hourIdx: -1, extra: null, rank: HAZARD_RANK.rain_heavy });
      } else if (([75, 86].includes(code) || (SNOW_CODES.includes(code) && precip >= 1.5))
        && !seen.has('snow_heavy|' + m.time[k].slice(0, 13))) {
        seen.add('snow_heavy|' + m.time[k].slice(0, 13));
        found.push({ type: 'snow_heavy', t: m.time[k], abs: a, hourIdx: -1, extra: null, rank: HAZARD_RANK.snow_heavy });
      }
    }
  }

  found.sort((a, b) => (a.abs - b.abs) || (b.rank - a.rank));
  return found;
}

/* ---------- air quality (plain-language) ---------- */
const AQI_LEVELS = [
  { max: 20, color: '#34d399', label: 'aqi_good', emoji: '😊' },
  { max: 40, color: '#84cc16', label: 'aqi_fair', emoji: '🙂' },
  { max: 60, color: '#fbbf24', label: 'aqi_moderate', emoji: '😐' },
  { max: 80, color: '#fb923c', label: 'aqi_poor', emoji: '😷' },
  { max: 100, color: '#f87171', label: 'aqi_very_poor', emoji: '😨' },
  { max: Infinity, color: '#c084fc', label: 'aqi_extreme', emoji: '☠️' }
];
/* Human labels for pollutants — no chemical jargon on the card. */
const AIR_POLLS = [
  { key: 'pm2_5', short: 'pm25', id: 'aqiPm25', nameKey: 'air_dust_fine', tipKey: 'air_dust_fine_tip', color: '#60a5fa', good: 10, bad: 50 },
  { key: 'pm10', short: 'pm10', id: 'aqiPm10', nameKey: 'air_dust_coarse', tipKey: 'air_dust_coarse_tip', color: '#a78bfa', good: 20, bad: 80 },
  { key: 'ozone', short: 'o3', id: 'aqiO3', nameKey: 'air_ozone', tipKey: 'air_ozone_tip', color: '#34d399', good: 60, bad: 140 },
  { key: 'nitrogen_dioxide', short: 'no2', id: 'aqiNo2', nameKey: 'air_traffic', tipKey: 'air_traffic_tip', color: '#fbbf24', good: 25, bad: 80 }
];
function aqiLevel(v) {
  return AQI_LEVELS.find(l => v <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}
function pollLevel(val, good, bad) {
  if (val == null || isNaN(val)) return { key: 'air_lvl_unknown', color: 'var(--text-4)' };
  if (val <= good) return { key: 'air_lvl_ok', color: '#34d399' };
  if (val <= (good + bad) / 2) return { key: 'air_lvl_fair', color: '#fbbf24' };
  if (val <= bad) return { key: 'air_lvl_high', color: '#fb923c' };
  return { key: 'air_lvl_bad', color: '#f87171' };
}
function airNowIdx() {
  if (!state.air) return -1;
  const h = state.air.hourly;
  const nowIso = tzNow(state.tz).iso;
  let idx = h.time.findIndex(tm => tm === nowIso);
  if (idx === -1) idx = h.time.length - 1;
  while (idx >= 0 && getVal(h, 'european_aqi', idx) == null) idx--;
  return idx;
}
function renderAir() {
  if (!state.air) return;
  const h = state.air.hourly;
  const idx = airNowIdx();
  if (idx < 0) return;
  const aqi = getVal(h, 'european_aqi', idx);
  const lvl = aqiLevel(aqi);
  const C = 263.9;
  el.aqiRing.style.stroke = lvl.color;
  el.aqiRing.style.strokeDashoffset = String(C * (1 - Math.min(aqi, 120) / 120));
  el.aqiValue.textContent = Math.round(aqi);
  el.aqiValue.style.color = lvl.color;
  el.aqiLabel.textContent = t(lvl.label);
  /* Plain words + simple level, not raw µg/m³ formulas. */
  AIR_POLLS.forEach(p => {
    const node = el[p.id];
    if (!node) return;
    const v = getVal(h, p.key, idx);
    const lv = pollLevel(v, p.good, p.bad);
    node.textContent = t(lv.key);
    node.style.color = lv.color;
    const label = node.previousElementSibling;
    if (label && label.tagName === 'SPAN') label.textContent = t(p.nameKey);
  });
  const note = el.aqiCard && el.aqiCard.querySelector('.aqi-note span');
  if (note) note.textContent = t('aqi_note_plain');
}

/* Simple 24h quality bars — one coloured pill per hour, no abstract graphs. */
function airDayStrip(series) {
  if (!series.length) return '';
  const cells = series.map((s, k) => {
    const lvl = aqiLevel(s.aqi == null ? 999 : s.aqi);
    const title = `${s.time.slice(11, 16)} · ${t(lvl.label)}`;
    const isNow = k === 0;
    return `<i class="air-hour${isNow ? ' now' : ''}" style="background:${lvl.color}" title="${escHtml(title)}"></i>`;
  }).join('');
  return `<div class="air-day-strip" role="img" aria-label="${escHtml(t('air_trend_plain'))}">${cells}</div>
    <div class="air-day-axis"><span>${t('now')}</span><span>+6h</span><span>+12h</span><span>+18h</span></div>`;
}
/* Horizontal level bar for one pollutant — much clearer than a sparkline. */
function airLevelBar(val, good, bad, color) {
  const v = val == null || isNaN(val) ? 0 : val;
  const max = Math.max(bad * 1.25, v, 1);
  const pct = Math.min(100, (v / max) * 100);
  const okPct = Math.min(100, (good / max) * 100);
  return `<div class="air-bar" aria-hidden="true">
    <i class="air-bar-ok" style="width:${okPct.toFixed(1)}%"></i>
    <b class="air-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></b>
  </div>`;
}

function showAirDetails() {
  if (!state.air) return;
  const idx = airNowIdx();
  if (idx < 0) return;
  const h = state.air.hourly;
  const n = Math.min(24, h.time.length - idx);
  const series = [];
  for (let k = 0; k < n; k++) {
    const i = idx + k;
    series.push({
      time: h.time[i],
      aqi: getVal(h, 'european_aqi', i),
      pm25: getVal(h, 'pm2_5', i),
      pm10: getVal(h, 'pm10', i),
      o3: getVal(h, 'ozone', i),
      no2: getVal(h, 'nitrogen_dioxide', i)
    });
  }
  const nowS = series[0];
  const aqi = nowS.aqi || 0;
  const lvl = aqiLevel(aqi);
  const healthKey = lvl.label.replace('aqi_', 'air_health_');
  const C = 263.9;

  /* Best / worst hour in the next 24h — concrete and useful. */
  let best = nowS, worst = nowS;
  series.forEach(s => {
    if (s.aqi == null) return;
    if (best.aqi == null || s.aqi < best.aqi) best = s;
    if (worst.aqi == null || s.aqi > worst.aqi) worst = s;
  });

  const pollCards = AIR_POLLS.map(p => {
    const cur = nowS[p.short];
    const lv = pollLevel(cur, p.good, p.bad);
    return `
      <div class="air-poll-card anim-pop">
        <div class="ap-head">
          <span class="ap-name" style="color:${p.color}">${t(p.nameKey)}</span>
          <span class="ap-val" style="color:${lv.color}">${t(lv.key)}</span>
        </div>
        ${airLevelBar(cur, p.good, p.bad, p.color)}
        <div class="ap-note">${t(p.tipKey)}</div>
      </div>`;
  }).join('');

  const body = `
    <div class="air-hero anim-pop">
      <div class="aqi-ring-box">
        <svg viewBox="0 0 100 100">
          <circle class="aqi-ring-bg" cx="50" cy="50" r="42"></circle>
          <circle class="aqi-ring-fg" cx="50" cy="50" r="42" stroke="${lvl.color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.min(aqi, 120) / 120)}"></circle>
        </svg>
        <div class="aqi-center"><b style="color:${lvl.color}">${Math.round(aqi)}</b><span>${t(lvl.label)}</span></div>
      </div>
      <div class="air-hero-info">
        <div class="ah-title">${lvl.emoji || ''} ${t(lvl.label)}</div>
        <div class="ah-sub">${t('air_score_plain').replace('{n}', String(Math.round(aqi)))}</div>
        <div class="ah-advice">${t(healthKey)}</div>
      </div>
    </div>

    <div class="air-tips anim-pop">
      <div class="air-tip"><i class="ph-fill ph-thumbs-up" style="color:#34d399"></i>
        <div><b>${t('air_best_hour')}</b><span>${best.time.slice(11, 16)} · ${t(aqiLevel(best.aqi || 0).label)}</span></div>
      </div>
      <div class="air-tip"><i class="ph-fill ph-warning" style="color:#fbbf24"></i>
        <div><b>${t('air_worst_hour')}</b><span>${worst.time.slice(11, 16)} · ${t(aqiLevel(worst.aqi || 0).label)}</span></div>
      </div>
    </div>

    <div class="air-trend anim-pop" style="animation-delay:0.08s">
      <div class="at-title"><i class="ph ph-clock-afternoon"></i>${t('air_trend_plain')}</div>
      ${airDayStrip(series)}
      <div class="air-legend">
        <span><i style="background:#34d399"></i>${t('aqi_good')}</span>
        <span><i style="background:#fbbf24"></i>${t('aqi_moderate')}</span>
        <span><i style="background:#f87171"></i>${t('aqi_poor')}</span>
      </div>
    </div>

    <div class="air-grid">${pollCards}</div>

    <div class="air-health anim-pop" style="animation-delay:0.2s">
      <i class="ph-fill ph-heartbeat"></i>
      <p><b>${t('air_health')}</b>${t(healthKey)}</p>
    </div>`;
  openModal(t('air_quality'), state.locationName, body);
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

  if (effectsReduced()) { FX.stop(); stopStorm(); }
  else {
    FX.start(fx);
    if (type === 'storm') startStorm(); else stopStorm();
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
  clearTimeout(state.favOpenTimer);
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
        ${flagUrl(f.country) ? `<img class="ac-flag" src="${flagUrl(f.country)}" alt="" loading="lazy" onerror="this.remove()">` : '<span class="ac-flag"></span>'}
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
        ${flagUrl(f.country) ? `<img class="ac-flag" src="${flagUrl(f.country)}" alt="" loading="lazy" onerror="this.remove()">` : '<span class="ac-flag"></span>'}
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
            ${flagUrl(c.country_code) ? `<img class="ac-flag" src="${flagUrl(c.country_code)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
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
    /* Note: handleSearch expects an Event (uses e.preventDefault() on the first line),
       so the retry callback must not forward the error object. */
    toast(t('toast_network'), 'error', t('toast_retry'), () => handleSearch());
  }
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- modals ---------------- */
/* Accessible overlays: trap the Tab key inside the dialog, make the background
   inert, focus the dialog on open and restore focus to the opener on close. */
let lastFocused = null;
function modalFocusables(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  )].filter(n => n.getClientRects().length > 0);
}
function onTrapKey(e) {
  if (e.key !== 'Tab') return;
  const container = (el.consentModal && !el.consentModal.classList.contains('hidden')) ? el.consentModal
    : (el.privacyModal && !el.privacyModal.classList.contains('hidden')) ? el.privacyModal
    : (el.modal && el.modal.classList.contains('open')) ? el.modal
    : (el.mapModal && el.mapModal.classList.contains('open')) ? el.mapModal : null;
  if (!container) return;
  const f = modalFocusables(container);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function trapFocus(container) {
  if (!container) return;
  if (lastFocused == null) lastFocused = document.activeElement;
  /* make everything outside the dialog inert so tabbing / AT stay inside it */
  [...document.body.children].forEach(n => {
    if (n === container || n.contains(container)) return;
    if (!n.hasAttribute('inert')) { n._liveskyInert = true; n.setAttribute('inert', ''); }
  });
  container.addEventListener('keydown', onTrapKey);
  setTimeout(() => {
    const f = modalFocusables(container);
    if (f.length) f[0].focus(); else if (container.focus) container.focus();
  }, 20);
}
function releaseFocus(container) {
  if (container) container.removeEventListener('keydown', onTrapKey);
  [...document.body.children].forEach(n => {
    if (n._liveskyInert) { n.removeAttribute('inert'); delete n._liveskyInert; }
  });
  if (lastFocused && lastFocused.focus) { try { lastFocused.focus(); } catch (e) { /* ignore */ } }
  lastFocused = null;
}

/* ---------------- legal consent gate ----------------
   Sequential consent:
   Stage 1 — Terms of Service (hard block). One button unlocks the app.
   Stage 2 — Privacy / geolocation (soft block). Shown immediately after
   ToS, and again just-in-time if the user later taps the geo button.
   Auto-geolocation runs ONLY after an explicit «Allow».

   The ToS record is validated field by field on every boot and re-validated
   whenever the tab regains focus or storage changes, so a cleared, tampered
   or outdated record locks the interface again. */
const CONSENT_VERSION = '3.0';
const CONSENT_KEY = 'livesky:legal_consent';
const TOS_KEY = 'livesky:tos_accepted';
const PRIVACY_KEY = 'livesky:privacy_accepted';
const CONSENT_REQUIRED_KEY = 'livesky:legal_consent_required';

function readConsentRecord() {
  const rec = store.get(CONSENT_KEY, null);
  if (!rec || typeof rec !== 'object') return null;
  return rec;
}

function consentConfirmationRequired() {
  try { return sessionStorage.getItem(CONSENT_REQUIRED_KEY) === 'true'; }
  catch (e) { return true; } /* storage uncertainty must never bypass the gate */
}

/* Migrate the old bundled ToS+Privacy record so existing users are not
   re-prompted, while keeping the two grants independent going forward. */
function migrateLegacyConsent() {
  const rec = readConsentRecord();
  if (!rec || rec.accepted !== true || rec.version !== '2.1') return;
  if (rec.terms !== true) return;
  const next = {
    accepted: true,
    version: CONSENT_VERSION,
    terms: true,
    privacy: rec.privacy === true,
    ts: (typeof rec.ts === 'number' && rec.ts > 0) ? rec.ts : Date.now()
  };
  store.set(CONSENT_KEY, next);
  store.set(TOS_KEY, true);
  store.set('livesky:legal_accepted', true);
  if (next.privacy) store.set(PRIVACY_KEY, true);
}

/* strict ToS validation — privacy is intentionally NOT required here */
function isValidConsentRecord(rec) {
  if (!rec) return false;
  if (rec.accepted !== true) return false;
  if (rec.version !== CONSENT_VERSION) return false;   /* documents updated → ask again */
  if (rec.terms !== true) return false;
  if (typeof rec.ts !== 'number' || !isFinite(rec.ts) || rec.ts <= 0) return false;
  if (rec.ts > Date.now() + 86400000) return false;    /* clock-skew / tampering */
  return true;
}

function hasValidConsent() {
  /* A return from the Terms page always requires a fresh explicit action,
     even if this browser still contains an older valid ToS record. */
  if (consentConfirmationRequired()) return false;
  return isValidConsentRecord(readConsentRecord());
}

function lockAppForConsent() {
  privacyOnGranted = null;
  hidePrivacyDialog();
  document.documentElement.classList.add('consent-locked');
  if (!el.consentModal) return;
  if (el.consentModal.classList.contains('hidden') || !el.consentModal._liveskyLocked) {
    el.consentModal.classList.remove('hidden');
    el.consentModal._liveskyLocked = true;
    document.body.classList.add('no-scroll');
    syncConsentButton();
    trapFocus(el.consentModal);
  }
}

function unlockAppAfterConsent() {
  document.documentElement.classList.remove('consent-locked');
  if (!el.consentModal) return;
  el.consentModal.classList.add('hidden');
  el.consentModal._liveskyLocked = false;
  if (!privacyDialogOpen() && (!el.modal || !el.modal.classList.contains('open'))) {
    document.body.classList.remove('no-scroll');
  }
  releaseFocus(el.consentModal);
}

function consentLocked() {
  return document.documentElement.classList.contains('consent-locked') ||
    !!(el.consentModal && !el.consentModal.classList.contains('hidden'));
}

/* Single «Accept and continue» button — enabled unless a leftover checkbox is present and unchecked. */
function syncConsentButton() {
  const hasBox = !!(el.consentCheckbox);
  const ok = hasBox ? !!el.consentCheckbox.checked : true;
  if (el.consentAcceptBtn) {
    el.consentAcceptBtn.disabled = !ok;
    el.consentAcceptBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }
  if (ok && el.consentError) el.consentError.classList.add('hidden');
}

function rejectConsentAttempt() {
  if (el.consentError) el.consentError.classList.remove('hidden');
  const card = el.consentModal && el.consentModal.querySelector('.consent-card');
  if (card) {
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }
  if (el.consentCheckbox && el.consentCheckbox.focus) el.consentCheckbox.focus();
}

function checkLegalConsent() {
  migrateLegacyConsent();
  if (!el.consentModal) return;
  if (hasValidConsent()) unlockAppAfterConsent();
  else lockAppForConsent();
}

function acceptLegalConsent() {
  if (el.consentCheckbox && !el.consentCheckbox.checked) {
    rejectConsentAttempt();
    return;
  }
  store.set(CONSENT_KEY, {
    accepted: true,
    version: CONSENT_VERSION,
    terms: true,
    privacy: hasPrivacyConsent(),
    ts: Date.now()
  });
  store.set(TOS_KEY, true);
  store.set('livesky:legal_accepted', true);

  /* Verify the new record before clearing the forced-confirmation marker. This
     prevents an old or failed write from unlocking the page after legal review. */
  if (!isValidConsentRecord(readConsentRecord())) {
    rejectConsentAttempt();
    return;
  }
  try { sessionStorage.removeItem(CONSENT_REQUIRED_KEY); }
  catch (e) {
    rejectConsentAttempt();
    return;
  }
  if (!hasValidConsent()) {
    rejectConsentAttempt();
    return;
  }
  unlockAppAfterConsent();
  /* Basemap tiles are the last third-party asset class held back behind the
     ToS gate — release them as soon as the app unlocks. */
  if (mapInitPending) initMap();
  /* Sequential Step 2: ask for geolocation immediately after ToS. */
  offerPrivacyIfNeeded();
}

/* continuous re-validation: clearing or editing the record re-locks the app */
function guardLegalConsent() {
  migrateLegacyConsent();
  if (!el.consentModal) return;
  if (!hasValidConsent()) lockAppForConsent();
}

/* ---------------- privacy / geolocation consent (just-in-time) ---------------- */
let privacyOnGranted = null;

function privacyDecision() {
  const v = store.get(PRIVACY_KEY, null);
  if (v === true) return true;
  if (v === false) return false;
  const rec = readConsentRecord();
  if (rec && rec.version === CONSENT_VERSION && rec.privacy === true) return true;
  return null;
}

function hasPrivacyConsent() {
  return privacyDecision() === true;
}

function persistPrivacyConsent(allowed) {
  const ok = allowed !== false;
  store.set(PRIVACY_KEY, ok);
  const rec = readConsentRecord();
  if (rec && typeof rec === 'object') {
    rec.privacy = ok;
    store.set(CONSENT_KEY, rec);
  }
}

/* After ToS: if privacy is already granted and there is no saved city,
   auto-request geolocation. If never decided, show the soft-block dialog.
   An explicit decline leaves the default / last city in place. */
function offerPrivacyIfNeeded() {
  if (!hasValidConsent()) return;
  if (hasPrivacyConsent()) {
    const last = store.get('livesky:last_city', null);
    if (!last || last.lat == null) getUserLocation();
    return;
  }
  if (privacyDecision() === false) return;
  requestPrivacyConsent(() => requestUserPosition());
}

function privacyDialogOpen() {
  return !!(el.privacyModal && !el.privacyModal.classList.contains('hidden'));
}

function showPrivacyDialog() {
  if (!el.privacyModal) return;
  el.privacyModal.classList.remove('hidden');
  document.body.classList.add('no-scroll');
  trapFocus(el.privacyModal);
}

function hidePrivacyDialog() {
  if (!el.privacyModal) return;
  el.privacyModal.classList.add('hidden');
  if (!consentLocked() && (!el.modal || !el.modal.classList.contains('open'))) {
    document.body.classList.remove('no-scroll');
  }
  releaseFocus(el.privacyModal);
}

function requestPrivacyConsent(onGranted) {
  if (hasPrivacyConsent()) {
    if (typeof onGranted === 'function') onGranted();
    return;
  }
  if (!el.privacyModal) return;
  privacyOnGranted = onGranted || null;
  showPrivacyDialog();
}

function acceptPrivacyConsent() {
  persistPrivacyConsent(true);
  const cont = privacyOnGranted;
  privacyOnGranted = null;
  hidePrivacyDialog();
  if (hasPrivacyConsent() && typeof cont === 'function') cont();
}

function cancelPrivacyConsent() {
  persistPrivacyConsent(false);
  privacyOnGranted = null;
  hidePrivacyDialog();
}

function openModal(title, subtitle, bodyHtml) {
  el.modalTitle.textContent = title;
  el.modalSubtitle.textContent = subtitle || '';
  el.modalBody.innerHTML = bodyHtml;
  el.modalBody.scrollTop = 0;
  el.modal.classList.add('open');
  document.body.classList.add('no-scroll');
  trapFocus(el.modal);
}
function closeModal() {
  el.modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  releaseFocus(el.modal);
  state.uiLockUntil = Date.now() + UI_LOCK_MS;
  clearTimeout(state.favOpenTimer);
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
  const d = state.weather.daily;
  const now = tzNow(state.tz);
  const temp = getVal(h, 'temperature_2m', i);
  const feels = getVal(h, 'apparent_temperature', i);
  const code = getVal(h, 'weathercode', i);
  const wind = getVal(h, 'windspeed_10m', i);
  const gust = getVal(h, 'windgusts_10m', i);
  const vis = getVal(h, 'visibility', i);
  const uv = getVal(h, 'uv_index', i);
  const hum = getVal(h, 'relativehumidity_2m', i);
  const press = getVal(h, 'surface_pressure', i);
  const dew = getVal(h, 'dewpoint_2m', i);
  const precipProb = getVal(h, 'precipitation_probability', i) || 0;
  const precip = getVal(h, 'precipitation', i) || 0;
  const type = wmo(code).type;
  const night = hourIsNight(i);
  const raining = RAIN_CODES.includes(code);
  const snowing = SNOW_CODES.includes(code);
  const tempDiff = feels != null && temp != null ? Math.round(feels - temp) : 0;

  /* Pressure trend */
  const pPrev = i - 3 >= 0 ? getVal(h, 'surface_pressure', i - 3) : null;
  let pressTrend = '';
  if (press != null && pPrev != null) {
    const diff = press - pPrev;
    pressTrend = diff > 0.5 ? t('press_rising') : diff < -0.5 ? t('press_falling') : '';
  }

  /* Upcoming rain */
  const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  let upcomingRain = false, rainIn = 0;
  for (let k = i + 1; k < Math.min(i + 6, h.time.length); k++) {
    if (rainCodes.includes(getVal(h, 'weathercode', k)) && (getVal(h, 'precipitation_probability', k) || 0) >= 30) {
      upcomingRain = true; rainIn = k - i; break;
    }
  }

  /* Dew point comfort */
  let dewFeel = '';
  if (dew != null) {
    if (dew > 18) dewFeel = t('dew_uncomfortable');
    else if (dew > 13) dewFeel = t('dew_sticky');
    else if (dew > 8) dewFeel = t('dew_pleasant');
  }

  const items = [];

  /* 1. Temperature experience */
  if (tempDiff <= -3) items.push(['ph-thermometer-cold', 'text:#38bdf8', t('advice_colder') + ' ' + Math.abs(tempDiff) + '°']);
  else if (tempDiff >= 3) items.push(['ph-thermometer-hot', 'text:#f87171', t('advice_hotter') + ' ' + tempDiff + '°']);
  else items.push(['ph-thermometer', 'text:#34d399', t('feels_like') + ': ' + fmtTempDeg(feels)]);

  /* 2. Precipitation */
  if (snowing) items.push(['ph-snowflake', 'text:#e2e8f0', t('advice_snow_now') + (precip > 0 ? ' (' + fmtPrecip(precip) + ')' : '')]);
  else if (type === 'storm') items.push(['ph-cloud-lightning', 'text:#c084fc', t('advice_storm')]);
  else if (raining) items.push(['ph-umbrella', 'text:#60a5fa', t('advice_rain_now') + (precip > 0 ? ' (' + fmtPrecip(precip) + ')' : '')]);
  else if (upcomingRain) items.push(['ph-umbrella', 'text:#60a5fa', t('advice_rain_soon').replace('{h}', String(rainIn))]);

  /* 3. Wind */
  if (gust != null && gust >= 20) items.push(['ph-wind', 'text:#f87171', t('advice_windy') + ' (' + t('wind_gusts') + ' ' + fmtWind(gust) + ')']);
  else if (wind > 15) items.push(['ph-wind', 'text:#cbd5e1', t('advice_windy')]);

  /* 4. UV */
  if (uv != null && !night) {
    if (uv >= 8) items.push(['ph-sun-dim', 'text:#f87171', t('uv_index') + ': ' + uvLabel(uv) + ' — ' + t('advice_uv_extreme')]);
    else if (uv >= 6) items.push(['ph-sun-dim', 'text:#fbbf24', t('uv_index') + ': ' + uvLabel(uv) + ' — ' + t('advice_uv_high')]);
    else if (uv >= 3) items.push(['ph-sun-dim', 'text:#fbbf24', t('uv_index') + ': ' + uvLabel(uv) + ' — ' + t('advice_uv_moderate')]);
  }

  /* 5. Visibility */
  if (vis != null && vis < 200) items.push(['ph-cloud-fog', 'text:#94a3b8', t('advice_fog_dense')]);
  else if (vis != null && vis < 1000) items.push(['ph-cloud-fog', 'text:#94a3b8', t('advice_fog')]);

  /* 6. Dew point */
  if (dewFeel) items.push(['ph-drop-half', 'text:#818cf8', dewFeel]);

  /* 7. Pressure trend */
  if (pressTrend) items.push(['ph-trend-up', 'text:#a78bfa', t('pressure') + ' ' + Math.round(press) + ' ' + t('unit_hpa') + ' · ' + pressTrend]);

  /* 8. Golden hour */
  const srIso = getVal(d, 'sunrise', state.todayIdx);
  const ssIso = getVal(d, 'sunset', state.todayIdx);
  if (srIso && ssIso && !night) {
    const nMin = now.hour * 60 + now.minute;
    const sr = minOfDay(srIso), ss = minOfDay(ssIso);
    if (nMin >= sr && nMin <= sr + 60) items.push(['ph-camera', 'text:#fbbf24', t('golden_morning')]);
    else if (nMin >= ss - 60 && nMin <= ss) items.push(['ph-camera', 'text:#fb923c', t('golden_evening')]);
  }

  /* Clothing */
  let wear = '';
  if (snowing || (feels != null && feels < -5)) wear = t('wear_arctic');
  else if (feels != null && feels < 5) wear = t('wear_cold');
  else if (feels != null && feels < 12) wear = t('wear_cool');
  else if (feels != null && feels < 22) wear = t('wear_mild');
  else if (feels != null && feels < 28) wear = t('wear_warm');
  else wear = t('wear_hot');
  if (raining || upcomingRain) wear += ' · ' + t('wear_rain_gear');

  const list = items.map(it => `
    <div class="m-list-row" style="cursor:default">
      <span class="row-ico" style="background:var(--accent-soft)"><i class="ph-fill ${it[0]}" style="color:${it[1].split(':')[1]}"></i></span>
      <span class="row-main"><b>${it[2]}</b></span>
    </div>`).join('');

  const body = `
    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:14px">${list}</div>
    <div class="m-note"><i class="ph-fill ph-t-shirt"></i><p><b>${t('wear_title')}:</b> ${wear}</p></div>`;
  openModal(state.locationName, t('analysis_title') + ' · ' + fmtTempDeg(temp) + ' · ' + wmoLabel(code), body);
}

/* ---------------- lifestyle ---------------- */
/* ---------- Lifestyle: smart multi-signal analysis ---------- */
/* Check precipitation probability for next N hours starting from index i */
function futurePrecipMax(h, startIdx, hours) {
  let maxP = 0;
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const p = getVal(h, 'precipitation_probability', k) || 0;
    if (p > maxP) maxP = p;
  }
  return maxP;
}
/* Check weather codes for rain/storm/snow in next N hours */
function futureHasRain(h, startIdx, hours) {
  const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  const snowCodes = [71, 73, 75, 77, 85, 86];
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const c = getVal(h, 'weathercode', k);
    const p = getVal(h, 'precipitation_probability', k) || 0;
    if (rainCodes.includes(c) && p >= 30) return true;
    if (snowCodes.includes(c) && p >= 30) return true;
  }
  return false;
}
/* Get max wind gusts for next N hours */
function futureMaxWind(h, startIdx, hours) {
  let maxW = 0;
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const w = getVal(h, 'windspeed_10m', k) || 0;
    const g = getVal(h, 'windgusts_10m', k) || 0;
    if (g > maxW) maxW = g;
    if (w > maxW) maxW = w;
  }
  return maxW;
}
/* Check for fog (visibility < 1km) in next N hours */
function futureHasFog(h, startIdx, hours) {
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const v = getVal(h, 'visibility', k);
    if (v != null && v < 1000) return true;
  }
  return false;
}
/* Check for storm/lightning in next N hours */
function futureHasStorm(h, startIdx, hours) {
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const c = getVal(h, 'weathercode', k);
    if ([95, 96, 99].includes(c)) return true;
  }
  return false;
}
/* Get min temp for next N hours */
function futureMinTemp(h, startIdx, hours) {
  let min = Infinity;
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const t = getVal(h, 'temperature_2m', k);
    if (t != null && t < min) min = t;
  }
  return min;
}
/* Get max UV for next N hours */
function futureMaxUV(h, startIdx, hours) {
  let max = 0;
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const u = getVal(h, 'uv_index', k);
    if (u != null && u > max) max = u;
  }
  return max;
}
/* Format a score 0-100 into a human label */
function scoreLabel(score) {
  if (score >= 90) return t('life_score_excellent');
  if (score >= 70) return t('life_score_good');
  if (score >= 50) return t('life_score_fair');
  if (score >= 30) return t('life_score_poor');
  return t('life_score_bad');
}
/* Score a slot for running — 0-100 */
function scoreRun(h, i) {
  const temp = getVal(h, 'temperature_2m', i) || 15;
  const wind = futureMaxWind(h, i, 2);
  const code = getVal(h, 'weathercode', i);
  const rainProb = futurePrecipMax(h, i, 12);
  const uv = getVal(h, 'uv_index', i) || 0;
  const vis = getVal(h, 'visibility', i) || 20000;
  const hr = parseInt(h.time[i].slice(11, 13), 10);
  let s = 100;

  // Rain check
  if (futureHasRain(h, i, 12)) s -= 45;
  else if (rainProb > 40) s -= 25;

  // Storm
  if (futureHasStorm(h, i, 6)) s -= 50;

  // Wind
  if (wind > 30) s -= 35;
  else if (wind > 20) s -= 15;

  // Temperature comfort (ideal: 8-18°C)
  const tempComfort = temp >= 8 && temp <= 18;
  if (temp < 0) s -= 30;
  else if (temp < 5) s -= 15;
  else if (temp > 28) s -= 20;
  else if (!tempComfort) s -= 5;

  // UV exposure
  if (uv >= 8) s -= 20;
  else if (uv >= 6) s -= 10;

  // Visibility
  if (vis < 1000) s -= 30;
  else if (vis < 3000) s -= 10;

  // Time of day
  if (hr < 6 || hr > 21) s -= 20;
  else if (hr < 7 || hr > 20) s -= 5;

  // Snow
  const snowCodes = [71, 73, 75, 77, 85, 86];
  if (snowCodes.includes(code)) s -= 30;

  return Math.max(0, Math.min(100, s));
}
/* Score a slot for car wash — 0-100 (higher = better day to wash) */
function scoreCarWash(h, i) {
  const wind = futureMaxWind(h, i, 24);
  const rainProb = futurePrecipMax(h, i, 24);
  const code = getVal(h, 'weathercode', i);
  const temp = getVal(h, 'temperature_2m', i) || 15;
  const hr = parseInt(h.time[i].slice(11, 13), 10);
  let s = 100;

  // CRITICAL: rain within 24h destroys wash quality
  if (futureHasRain(h, i, 24)) s -= 60;
  else if (rainProb >= 40) s -= 40;
  else if (rainProb >= 20) s -= 15;

  // Drying wind: 5-15 km/h is ideal, too much wind = dust/dirt
  if (wind > 35) s -= 25;  // Very strong wind = blowing dirt
  else if (wind > 25) s -= 15;
  else if (wind < 3) s -= 10;  // No wind = slow drying

  // Temperature for drying: < 0 means water freezes, > 35 means water spots
  if (temp < 0) s -= 40;  // Water freezes on car!
  if (temp > 35) s -= 15;
  else if (temp < 5) s -= 5;

  // Time of day: early morning (before sun heats the car) or evening are best
  if (hr >= 8 && hr <= 10) s += 5;  // Sweet spot
  else if (hr >= 11 && hr <= 14) s -= 10;  // Sun heats car, causes water spots
  else if (hr >= 19 || hr < 6) s += 5;

  // Snow or ice
  const snowCodes = [71, 73, 75, 77, 85, 86];
  if (snowCodes.includes(code)) s -= 40;

  return Math.max(0, Math.min(100, s));
}
/* Score a slot for walking — 0-100 */
function scoreWalk(h, i) {
  const temp = getVal(h, 'temperature_2m', i) || 15;
  const wind = futureMaxWind(h, i, 6);
  const code = getVal(h, 'weathercode', i);
  const rainProb = futurePrecipMax(h, i, 12);
  const uv = getVal(h, 'uv_index', i) || 0;
  const vis = getVal(h, 'visibility', i) || 20000;
  const hum = getVal(h, 'relativehumidity_2m', i) || 50;
  const hr = parseInt(h.time[i].slice(11, 13), 10);
  let s = 100;

  // Weather conditions
  if (futureHasStorm(h, i, 6)) s -= 50;
  if (futureHasRain(h, i, 12)) s -= 30;
  else if (rainProb > 40) s -= 20;
  else if (rainProb > 20) s -= 8;

  // Wind
  if (wind > 40) s -= 30;
  else if (wind > 25) s -= 15;
  else if (wind > 15) s -= 5;

  // Temperature comfort (ideal: 15-25°C)
  if (temp < -10) s -= 40;
  else if (temp < 0) s -= 20;
  else if (temp < 10) s -= 10;
  else if (temp > 35) s -= 25;
  else if (temp > 30) s -= 10;

  // Visibility
  if (vis < 500) s -= 40;
  else if (vis < 1000) s -= 25;
  else if (vis < 3000) s -= 10;

  // UV
  if (uv >= 8) s -= 15;
  else if (uv >= 6) s -= 8;

  // Humidity: too high = sticky
  if (hum > 85) s -= 10;

  // Fog
  if (futureHasFog(h, i, 6)) s -= 15;

  // Time of day
  if (hr < 7 || hr > 21) s -= 10;

  // Snow (walking in snow can be beautiful, but slippery)
  const snowCodes = [71, 73, 75, 77, 85, 86];
  if (snowCodes.includes(code)) s -= 15;

  return Math.max(0, Math.min(100, s));
}

function showLifestyle(type) {
  if (!state.weather) return;
  const h = state.weather.hourly;
  const titles = { run: t('life_run_title'), car: t('life_car_title'), walk: t('life_walk_title') };
  const scoreFn = { run: scoreRun, car: scoreCarWash, walk: scoreWalk }[type];

  /* Scan next 7 days for the best slots */
  const slots = [];
  const start = state.nowIdx;
  const end = Math.min(start + 168, h.time.length);
  for (let i = start; i < end; i++) {
    const hr = parseInt(h.time[i].slice(11, 13), 10);
    const score = scoreFn(h, i);
    /* Only show slots where the score is reasonable (>20) and at a normal time */
    if (score > 20 && hr >= 5 && hr <= 23) {
      const temp = getVal(h, 'temperature_2m', i);
      const wind = futureMaxWind(h, i, 3);
      const rain = futurePrecipMax(h, i, 6);
      const code = getVal(h, 'weathercode', i);
      slots.push({ i, score, temp, wind, rain, code });
    }
    if (slots.length >= 8) break;
  }

  /* Sort by score descending, then by time ascending */
  slots.sort((a, b) => b.score - a.score || a.i - b.i);
  /* Take only top 8 unique time slots */
  const shown = slots.slice(0, 8);

  let rows = '';
  if (shown.length) {
    shown.forEach(s => {
      const dt = parseLocal(h.time[s.i]);
      const color = s.score >= 70 ? '#34d399' : s.score >= 40 ? '#fbbf24' : '#f87171';
      const icon = s.score >= 70 ? 'ph-check-circle' : s.score >= 40 ? 'ph-minus-circle' : 'ph-x-circle';
      rows += `
        <div class="m-list-row" data-slot="${s.i}">
          <span class="row-ico" style="background:${color}14"><i class="ph-fill ${icon}" style="color:${color}"></i></span>
          <span class="row-main"><b>${dt.toLocaleDateString(loc(), { weekday: 'short' }).replace('.', '')} · ${h.time[s.i].slice(11, 16)}</b><span>${dt.toLocaleDateString(loc(), { day: 'numeric', month: 'short' })}</span></span>
          <span class="row-side">${scoreLabel(s.score)}<small>${fmtTemp(s.temp)}° · ${fmtWind(s.wind)}</small></span>
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
  const gust = getVal(h, 'windgusts_10m', index);
  const hum = getVal(h, 'relativehumidity_2m', index);
  const uv = getVal(h, 'uv_index', index);
  const vis = getVal(h, 'visibility', index);
  const dew = getVal(h, 'dewpoint_2m', index);
  const press = getVal(h, 'surface_pressure', index);
  const rain = futurePrecipMax(h, index, 12);
  const scoreFn = { run: scoreRun, car: scoreCarWash, walk: scoreWalk }[type];
  const score = scoreFn(h, index);
  const dt = parseLocal(h.time[index]);
  const timeStr = dt.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const titles = { run: t('life_run_title'), car: t('life_car_title'), walk: t('life_walk_title') };

  let advice = '';
  if (type === 'run') {
    let wear;
    if (temp < 5) wear = t('wear_cold');
    else if (temp < 12) wear = t('wear_cool');
    else if (temp < 20) wear = t('wear_mild');
    else wear = t('wear_warm');
    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px;border-color:${score >= 50 ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)'}">
        <i class="ph-fill ${score >= 50 ? 'ph-check-circle' : 'ph-warning-circle'}" style="color:${score >= 50 ? '#34d399' : '#f87171'}"></i>
        <p><b>${t('life_score')} ${score}/100</b> · ${scoreLabel(score)}</p>
      </div>
      <div class="m-note" style="margin-top:0;margin-bottom:12px"><i class="ph-fill ph-t-shirt"></i><p><b>${t('wear_title')}:</b> ${wear}</p></div>
      <div class="m-grid">
        ${mTile('ph-wind', t('wind'), fmtWind(wind) + (gust && gust > wind ? ' · ' + t('wind_gusts') + ' ' + fmtWind(gust) : ''))}
        ${mTile('ph-sun', t('uv_index'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
        ${mTile('ph-eye', t('visibility'), fmtVis(vis))}
        ${mTile('ph-cloud-rain', t('rain_chance'), Math.round(rain) + '%')}
        ${mTile('ph-drop', t('humidity'), hum != null ? Math.round(hum) + '%' : '--')}
        ${mTile('ph-drop-half', t('dew_point'), fmtTempDeg(dew))}
      </div>`;
  } else if (type === 'car') {
    const risk = rain;
    let riskAdvice;
    if (score >= 70) riskAdvice = t('car_advice_great');
    else if (score >= 40) riskAdvice = t('car_advice_ok');
    else riskAdvice = t('car_advice_bad');

    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px;border-color:${score >= 50 ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)'}">
        <i class="ph-fill ${score >= 50 ? 'ph-check-circle' : 'ph-warning-circle'}" style="color:${score >= 50 ? '#34d399' : '#f87171'}"></i>
        <p><b>${t('life_score')} ${score}/100</b> · ${scoreLabel(score)}<br>${riskAdvice}</p>
      </div>
      <div class="m-grid">
        ${mTile('ph-cloud-rain', t('rain_risk_title') + ' · 24ч', Math.round(risk) + '%')}
        ${mTile('ph-wind', t('wind'), fmtWind(wind) + (gust && gust > wind ? ' · ' + t('wind_gusts') + ' ' + fmtWind(gust) : ''))}
        ${mTile('ph-thermometer', t('temp'), fmtTempDeg(temp))}
        ${mTile('ph-eye', t('visibility'), fmtVis(vis))}
      </div>`;
  } else {
    let comfort = t('comfort_good');
    if (temp < -10) comfort = t('comfort_cold');
    else if (temp < 5) comfort = t('comfort_cool');
    else if (temp > 30) comfort = t('comfort_hot');
    else if (temp > 25) comfort = t('comfort_warm');
    const windDesc = wind > 15 ? t('wind_windy') : wind > 8 ? t('wind_light') : t('wind_none');
    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px;border-color:${score >= 50 ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)'}">
        <i class="ph-fill ${score >= 50 ? 'ph-check-circle' : 'ph-warning-circle'}" style="color:${score >= 50 ? '#34d399' : '#f87171'}"></i>
        <p><b>${t('life_score')} ${score}/100</b> · ${scoreLabel(score)}</p>
      </div>
      <div class="m-note" style="margin-top:0;margin-bottom:12px"><i class="ph-fill ph-smiley"></i><p><b>${t('comfort_title')}:</b> ${comfort}. ${windDesc}</p></div>
      <div class="m-grid">
        ${mTile('ph-wind', t('wind'), fmtWind(wind) + (gust && gust > wind ? ' · ' + t('wind_gusts') + ' ' + fmtWind(gust) : ''))}
        ${mTile('ph-sun', t('uv_index'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
        ${mTile('ph-drop', t('humidity'), hum != null ? Math.round(hum) + '%' : '--')}
        ${mTile('ph-drop-half', t('dew_point'), fmtTempDeg(dew))}
        ${mTile('ph-cloud-rain', t('rain_chance'), Math.round(rain) + '%')}
        ${mTile('ph-eye', t('visibility'), fmtVis(vis))}
      </div>`;
  }

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
/* Basemap tiles are third-party requests (CARTO / OSM), so the small map is
   not initialised until the Terms of Service are accepted. The consent
   overlay covers the placeholder on a locked boot — nothing is lost. */
let mapInitPending = false;
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
  mapInitPending = false;
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
      attributionControl: { compact: true },
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
  trapFocus(el.mapModal);
  tempLat = null; tempLon = null;
  el.mapInstr.style.display = '';
  el.mapApply.classList.add('hidden');
  /* Prefer a precip-friendly zoom when radar is (or will be) on. */
  const openZoom = RADAR.active ? 7 : 10;
  if (!fullMapInst) {
    setTimeout(() => {
      try {
        fullMapInst = new maplibregl.Map({
          container: 'full-map',
          style: mapStyle(),
          center: [state.lon, state.lat],
          zoom: openZoom,
          attributionControl: { compact: true },
          maxPitch: 0
        });
        fullMapInst.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'bottom-right');
        fullMarkEl = new maplibregl.Marker({ element: makePinEl() }).setLngLat([state.lon, state.lat]).addTo(fullMapInst);
        fullPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16 })
          .setLngLat([state.lon, state.lat])
          .setHTML('<b>' + escHtml(state.locationName) + '</b>')
          .addTo(fullMapInst);
        fullMapInst.on('load', () => {
          fullMapInst.on('click', (e) => {
            /* Ignore clicks that are really the end of a pan. */
            if (fullMapInst._liveskyDragging) return;
            tempLat = e.lngLat.lat; tempLon = e.lngLat.lng;
            if (fullMarkEl) fullMarkEl.setLngLat([tempLon, tempLat]);
            if (fullPopup) { fullPopup.remove(); fullPopup = null; }
            el.mapInstr.style.display = 'none';
            el.mapApply.classList.remove('hidden');
          });
          fullMapInst.on('dragstart', () => { fullMapInst._liveskyDragging = true; });
          fullMapInst.on('dragend', () => { setTimeout(() => { fullMapInst._liveskyDragging = false; }, 40); });
          if (RADAR.active) {
            RADAR.layerReady = false;
            RADAR.ensureLayers();
            RADAR.renderFrame(true);
          }
        });
        fullMapInst.on('error', (e) => {
          /* Only fall back the basemap — ignore missing radar tile 404 noise. */
          const msg = (e && e.error && (e.error.message || e.error.status)) || '';
          if (/radar/i.test(String(msg))) return;
          if (!fullMapFallback) { fullMapFallback = true; try { fullMapInst.setStyle(osmStyle()); } catch (err) { /* ignore */ } }
        });
        fullMapInst.resize();
      } catch (e) { console.warn('LiveSky: full map init failed', e); }
    }, 320);
  } else {
    /* Don't yank zoom back to 10 if the user was inspecting precip. */
    const z = RADAR.active ? Math.min(fullMapInst.getZoom(), 8) : Math.max(fullMapInst.getZoom(), 9);
    fullMapInst.flyTo({ center: [state.lon, state.lat], zoom: z, duration: 500 });
    if (fullMarkEl) fullMarkEl.setLngLat([state.lon, state.lat]);
    if (fullPopup) { fullPopup.remove(); fullPopup = null; }
    fullPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16 })
      .setLngLat([state.lon, state.lat])
      .setHTML('<b>' + escHtml(state.locationName) + '</b>')
      .addTo(fullMapInst);
    setTimeout(() => {
      try { fullMapInst.resize(); } catch (e) { /* ignore */ }
      if (fullMapInst.triggerRepaint) fullMapInst.triggerRepaint();
      if (RADAR.active) {
        RADAR.ensureLayers();
        RADAR.renderFrame(true);
      }
    }, 140);
  }
}
function closeFullMap() {
  el.mapModal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  releaseFocus(el.mapModal);
  /* quiet period: the just-closed overlay must not leak clicks/cursor into the page */
  state.uiLockUntil = Date.now() + UI_LOCK_MS;
  clearTimeout(state.favOpenTimer);
  if (fullPopup) { fullPopup.remove(); fullPopup = null; }
  if (fullMapInst) { try { fullMapInst.stop(); } catch (e) { /* ignore */ } }
  /* Pause animation while the map is hidden — saves tiles + battery. State stays. */
  if (typeof RADAR !== 'undefined') RADAR.pause();
}
async function applyMapLocation() {
  if (tempLat == null || tempLon == null) return;
  const lat = tempLat, lon = tempLon;
  tempLat = null; tempLon = null;
  closeFullMap();
  state.lat = lat; state.lon = lon;
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
  /* Prevent scrolling behind the menu on mobile */
  if (open) document.body.classList.add('menu-scroll-lock');
  else document.body.classList.remove('menu-scroll-lock');
}
function syncMenuChecks() {
  if (!el.mainMenu) return;
  el.mainMenu.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('selected', b.dataset.lang === state.lang));
  el.mainMenu.querySelectorAll('[data-theme-pick]').forEach(b => b.classList.toggle('selected', b.dataset.themePick === state.theme));
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
  on(el.input, 'focus', () => {
    if (el.input.value.trim()) return;
    clearTimeout(state.favOpenTimer);
    if (Date.now() < state.uiLockUntil) return; /* just closed an overlay — don't pop the list under the pointer */
    if (FAV_LIST_DELAY_MS === 0) { renderFavoritesList(); return; }
    state.favOpenTimer = setTimeout(() => {
      if (Date.now() < state.uiLockUntil) return;
      if (document.activeElement !== el.input) return;
      if (el.input.value.trim()) return;
      renderFavoritesList();
    }, FAV_LIST_DELAY_MS);
  });
  on(el.input, 'blur', () => clearTimeout(state.favOpenTimer));
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
    const themeBtn = e.target.closest('[data-theme-pick]');
    if (themeBtn) { setTheme(themeBtn.dataset.themePick); setMenuOpen(false); return; }
    /* All other clicks inside menu just close it after a short delay */
    const isSelect = e.target.closest('.dd-select');
    if (!isSelect) {
      /* Only close on non-select clicks (selects need to stay open for interaction) */
      clearTimeout(state._menuCloseTimer);
      state._menuCloseTimer = setTimeout(() => setMenuOpen(false), 800);
    }
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

  /* quality preset (auto / maximum / eco) */
  on(el.effectsSelect, 'change', () => {
    state.effects = el.effectsSelect.value;
    store.set('livesky:effects', state.effects);
    setMenuOpen(false);
    if (state.effects === 'full') state._perfLow = false;
    applyEffects();
    /* start the FPS watchdog only on Auto; stop it otherwise so it never
       keeps an rAF loop running in the background on Maximum/Eco */
    if (state.effects === 'auto') PERF.start();
    else PERF.stop();
  });
  on(el.installItem, 'click', promptInstall);
  on(el.notifItem, 'click', () => { setMenuOpen(false); toggleNotifications(); });

  /* precipitation map (radar) */
  on(el.radarToggle, 'click', () => RADAR.toggle());
  on(el.radarClose, 'click', () => RADAR.disable());
  on(el.radarPlay, 'click', () => RADAR.togglePlay());
  on(el.radarNext, 'click', () => RADAR.step(1));
  on(el.radarBack, 'click', () => RADAR.step(-1));
  on(el.radarSlider, 'input', (e) => RADAR.goto(+e.target.value));
  on(el.radarLive, 'click', () => RADAR.goLive());
  on(el.radarOpacity, 'input', (e) => RADAR.setOpacity(+e.target.value / 100));
  on(el.radarSpeed, 'change', (e) => RADAR.setSpeed(+e.target.value));
  /* small-map badge opens fullscreen map with radar already on */
  on(el.mapRadarBadge, 'click', (e) => {
    e.preventDefault(); e.stopPropagation();
    openFullMap();
    /* enable after the map container is sized — avoid adding layer to 0×0 canvas */
    setTimeout(() => RADAR.enable(), 420);
  });

  on(el.adviceBtn, 'click', showAdvice);
  on(el.historyBtn, 'click', () => showMonthly('history'));
  on(el.sunCard, 'click', showSunDetails);
  on(el.aqiCard, 'click', showAirDetails);
  on(el.aqiCard, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showAirDetails(); } });
  on(el.sunCard, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSunDetails(); } });

  document.getElementById('life-run').addEventListener('click', () => showLifestyle('run'));
  document.getElementById('life-car').addEventListener('click', () => showLifestyle('car'));
  document.getElementById('life-walk').addEventListener('click', () => showLifestyle('walk'));
  ['life-run', 'life-car', 'life-walk'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById(id).click(); }
    });
  });

  if (el.consentAcceptBtn) {
    on(el.consentAcceptBtn, 'click', acceptLegalConsent);
  }
  if (el.consentCheckbox) {
    on(el.consentCheckbox, 'change', syncConsentButton);
    on(el.consentCheckbox, 'keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.consentCheckbox.checked = !el.consentCheckbox.checked; syncConsentButton(); }
    });
  }
  if (el.consentModal) {
    /* the overlay is not dismissible: clicking outside the card only nudges the user */
    on(el.consentModal, 'click', (e) => {
      if (e.target === el.consentModal) rejectConsentAttempt();
    });
    /* re-validate the stored record whenever the page could have been tampered with */
    on(window, 'storage', (e) => {
      if (!e || !e.key || e.key === CONSENT_KEY || e.key === TOS_KEY) guardLegalConsent();
    });
    on(window, 'focus', guardLegalConsent);
    on(window, 'pageshow', guardLegalConsent);
    on(document, 'visibilitychange', () => { if (!document.hidden) guardLegalConsent(); });
  }
  if (el.privacyAcceptBtn) on(el.privacyAcceptBtn, 'click', acceptPrivacyConsent);
  if (el.privacyCancelBtn) on(el.privacyCancelBtn, 'click', cancelPrivacyConsent);
  if (el.privacyModal) {
    on(el.privacyModal, 'click', (e) => {
      if (e.target === el.privacyModal) cancelPrivacyConsent();
    });
  }

  on(el.modalClose, 'click', closeModal);
  on(el.modal, 'click', (e) => { if (e.target === el.modal) closeModal(); });
  on(el.mapClose, 'click', closeFullMap);
  on(el.mapApply, 'click', applyMapLocation);

  /* The 24-hour graph is a native horizontal scroller on touch screens.
     Arrow-key support keeps the focusable chart equally usable without touch. */
  on(el.chartScroll, 'keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const step = Math.max(180, Math.round((el.chartScroll.clientWidth || 320) * 0.65));
    el.chartScroll.scrollBy({ left: e.key === 'ArrowRight' ? step : -step, behavior: 'smooth' });
  });

  on(el.hLeft, 'click', () => el.hStrip.scrollBy({ left: -420, behavior: 'smooth' }));
  on(el.hRight, 'click', () => el.hStrip.scrollBy({ left: 420, behavior: 'smooth' }));

  on(el.brand, 'click', () => location.reload());

  document.addEventListener('click', (e) => {
    if (!el.searchForm.contains(e.target) && !el.autoList.contains(e.target)) closeAutocomplete();
    if (!el.menuBtn.contains(e.target) && !el.mainMenu.contains(e.target)) setMenuOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    /* while the legal gate is up no shortcut may reach the application */
    if (consentLocked()) {
      if (e.key === 'Escape') e.preventDefault();
      return;
    }
    if (privacyDialogOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); cancelPrivacyConsent(); }
      return;
    }
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

  window.addEventListener('resize', () => {
    FX.resize();
    /* Recalc aspect-corrected rain hatch when the plot size changes. */
    clearTimeout(window.__chartHatchT);
    window.__chartHatchT = setTimeout(() => {
      if (state.weather && typeof renderChart === 'function') {
        try { SECTION_MANAGER.renderSection('chart'); } catch (e) { try { renderChart(); } catch (e2) {} }
      }
    }, 180);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clockTick();
      liveTick(true);
      FX.resume();
      if (state.effects === 'auto') PERF.start();
      /* On return: refresh if data is older than 2 minutes so rain that just
         stopped is reflected immediately. */
      if (Date.now() - state.lastFetchTs > 2 * 60 * 1000) fetchWeather(true);
      if (typeof RADAR !== 'undefined' && RADAR.active) RADAR.refreshSilent();
    } else {
      if (FX.running) {
        cancelAnimationFrame(FX.raf);
        FX.running = false;
      }
      PERF.stop();
      if (typeof RADAR !== 'undefined') RADAR.pause();
    }
  });
  /* Backup auto-refresh + weather-alert check. The live ticker already pulls
     every 3 minutes; this is a safety net for long background tabs. */
  setInterval(() => {
    if (!document.hidden && Date.now() - state.lastFetchTs > 3 * 60 * 1000) fetchWeather(true);
    if (!document.hidden) checkWeatherAlerts();
    if (!document.hidden && typeof RADAR !== 'undefined' && RADAR.active) RADAR.refreshSilent();
  }, 60 * 1000);
  /* offline state is surfaced by the offline banner (see initConnectivity) */
}

/* ---------------- reveal on scroll ---------------- */
function initReveal() {
  /* SECTION_MANAGER handles the outer .section-root containers.
     Only observe standalone .reveal elements not inside a managed section. */
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  if (!('IntersectionObserver' in window) || motionReduce) {
    items.forEach(n => n.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.06 });
  items.forEach(n => io.observe(n));
}

/* ---------------- PWA: service worker + install --------------- */
let deferredInstallPrompt = null;

function registerServiceWorker() {
  if (isNativeApp()) return; /* Capacitor bundles the shell; a second cache layer only causes stale assets */
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return; /* skip file:// and data: */
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* non-critical */ });
  });
}
function updateInstallItem() {
  if (el.installItem) el.installItem.classList.toggle('hidden', !deferredInstallPrompt);
}
function promptInstall() {
  if (!deferredInstallPrompt) return;
  const p = deferredInstallPrompt;
  p.prompt();
  p.userChoice && p.userChoice.then(() => { deferredInstallPrompt = null; updateInstallItem(); });
}
function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallItem();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallItem();
  });
  /* Show install button even without beforeinstallprompt as a hint */
  if (!deferredInstallPrompt && !isNativeApp()) {
    setTimeout(() => {
      if (el.installItem) el.installItem.classList.remove('hidden');
    }, 3000);
  }
}

/* ---------------- Offline / online banner --------------- */
function initConnectivity() {
  if (typeof navigator === 'undefined') return;
  const show = () => { if (el.offlineBanner) { el.offlineBanner.classList.remove('out'); el.offlineBanner.classList.remove('hidden'); } };
  const hide = () => {
    if (!el.offlineBanner) return;
    el.offlineBanner.classList.add('out');
    setTimeout(() => el.offlineBanner.classList.add('hidden'), 320);
  };
  window.addEventListener('offline', show);
  window.addEventListener('online', () => { hide(); if (state.weather) fetchWeather(true); });
  if (navigator.onLine === false) show();
}

/* ---------------- Adaptive performance (FPS detector) --------------- */
const PERF = {
  raf: 0, windowStart: 0, windowFrames: 0, lowStreak: 0, normalStreak: 0, started: false,
  start() {
    /* only run the FPS watchdog while the user is on Auto mode; it is pointless
       (and burns the battery) when Maximum/Eco is explicitly selected */
    if (motionReduce || this.started || state.effects !== 'auto') return;
    this.started = true;
    this.windowStart = performance.now();
    const tick = (t) => {
      this.windowFrames++;
      if (t - this.windowStart >= 2000) {
        const fps = (this.windowFrames * 1000) / Math.max(1, t - this.windowStart);
        this.windowFrames = 0; this.windowStart = t;
        if (fps < 22) this.lowStreak++; else this.lowStreak = 0;
        if (fps > 42) this.normalStreak++; else this.normalStreak = 0;
        this.evaluate();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
  /* Stop the rAF watchdog entirely. Called when the tab is hidden or the user
     switches off Auto so the loop never keeps the compositor alive in the background. */
  stop() {
    if (!this.started) return;
    this.started = false;
    cancelAnimationFrame(this.raf);
    this.windowFrames = 0; this.lowStreak = 0; this.normalStreak = 0;
  },
  evaluate() {
    if (state.effects !== 'auto') return;
    if (!state._perfLow && this.lowStreak >= 2) {
      state._perfLow = true; this.lowStreak = 0; this.normalStreak = 0;
      applyEffects();
      toast(t('toast_perf_low'), 'info');
    } else if (state._perfLow && this.normalStreak >= 6) {
      state._perfLow = false; this.normalStreak = 0;
      applyEffects();
      toast(t('toast_perf_restored'), 'success');
    }
  }
};

/* ---------- Section Lifecycle Manager (Smart Visibility) ---------- */
/*
   Genuine "heavy DOM removed" optimization. Each section lives in one of three
   states:

     - 'active':   in/near the viewport — content mounted and rendered.
     - 'inactive': off-screen but not far — content stays mounted (cheap CSS
                   backdrop reduction) so it appears instantly when scrolled to.
     - 'unloaded': way off-screen — the heavy card is DETACHED from the DOM and
                   swapped for a lightweight, height-preserving skeleton. The
                   detached card is cached so it can be re-inserted instantly
                   on scroll-back without a re-render when data is still fresh.

   To avoid thrashing during fast scroll, unloads are debounced (adaptive: far
   faster in Eco/low-perf mode). Heavy renderers (chart/hourly/daily) are routed
   through renderSection(), which SKIPS building DOM for unloaded sections and
   only rebuilds lazily when the section returns to view and its data changed.
*/
const SECTION_MANAGER = {
  io: null,
  ioUnload: null,
  sections: new Map(),
  priorities: ['hero', 'chart', 'hourly', 'daily', 'lifestyle'],

  /* Heavy per-section renderers. Hero + sidebar content is always rendered
     eagerly (it's the first thing the user sees), so only these are deferred. */
  renderers: {
    chart: () => renderChart(),
    hourly: () => renderHourly(),
    daily: () => renderDaily()
  },

  /* Adaptive unload debounce: on weak devices / Eco we drop off-screen DOM
     almost immediately; otherwise wait to avoid flicker during fast scroll. */
  unloadDelay() {
    if (state.effects === 'eco' || (state.effects === 'auto' && state._perfLow)) return 1000;
    return 4000;
  },

  init() {
    if (motionReduce) {
      /* If user prefers reduced motion, just mark all sections as active without animation */
      document.querySelectorAll('.section-root').forEach(el => {
        el.dataset.sectionState = 'active';
        el.classList.add('section-enter-active');
      });
      return;
    }

    /* Main IntersectionObserver: marks sections near viewport */
    this.io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const name = entry.target.dataset.section;
        if (entry.isIntersecting) {
          this.activate(name, entry.target);
        } else {
          this.deactivate(name, entry.target);
        }
      });
    }, {
      rootMargin: '400px 0px 400px 0px', /* 400px buffer before/after viewport */
      threshold: 0.01
    });

    /* Secondary observer: fully unload sections that are very far */
    this.ioUnload = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const name = entry.target.dataset.section;
        if (!entry.isIntersecting) {
          this.scheduleUnload(name, entry.target);
        } else {
          this.cancelUnload(name);
        }
      });
    }, {
      rootMargin: '-25% 0px -25% 0px', /* only consider sections outside middle 50% */
      threshold: 0
    });

    /* Observe all section roots */
    document.querySelectorAll('.section-root').forEach(el => {
      const name = el.dataset.section;
      this.sections.set(name, {
        el, state: 'inactive', unloadTimer: null, rendered: false,
        dirty: true, /* nothing rendered yet */
        card: null, skeleton: null
      });
      this.io.observe(el);
      this.ioUnload.observe(el);
      /* Start with enter animation class */
      el.classList.add('section-enter');
    });

    /* Priority-based initial rendering: render hero immediately */
    this.priorities.forEach((name, idx) => {
      const section = this.sections.get(name);
      if (!section) return;
      if (idx === 0) {
        /* Hero: render immediately, no observer needed */
        this.activate(name, section.el, true);
      }
    });
  },

  /* Runs a heavy renderer. Returns true only if the render actually happened.
     On a real device the IntersectionObserver fires immediately for the
     sections that are in the viewport (chart/hourly/daily) — BEFORE the first
     fetch has delivered a forecast. At that moment state.weather === null and
     renderChart()/renderHourly()/renderDaily() would crash on
     `state.weather.hourly`. So: no data → no render → return false, and the
     caller must keep the section dirty so renderAll() paints it as soon as
     the data arrives. */
  runRenderer(name) {
    const r = this.renderers[name];
    if (!r) return false;
    if (!state.weather) return false; /* first fetch still in flight */
    r();
    const s = this.sections.get(name);
    if (s) s.rendered = true;
    return true;
  },

  /* Route a heavy render through the manager. Unloaded sections skip the work
     entirely (their DOM is detached anyway) and are marked dirty so they'll be
     rebuilt lazily on their next activation. */
  renderSection(name) {
    const s = this.sections.get(name);
    if (!s || !this.renderers[name]) return;
    if (s.state === 'unloaded') {
      s.dirty = true; /* rebuild later, when the user scrolls back */
      return;
    }
    /* Only clear the dirty flag if the render really happened (there may be
       no data yet) — otherwise the section must stay dirty to be re-tried. */
    s.dirty = !this.runRenderer(name);
  },

  activate(name, el, immediate) {
    const section = this.sections.get(name);
    if (!section) return;
    const wasUnloaded = section.state === 'unloaded';
    section.state = 'active';
    this.cancelUnload(name);
    el.dataset.sectionState = 'active';

    /* If we just came back from being unloaded, rebuild (only if the data
       changed while away) and re-insert the cached card. Keep the section
       dirty when the render was skipped (no forecast yet): renderAll() will
       repaint it as soon as the first fetch resolves. */
    if (wasUnloaded || section.dirty) {
      if (this.runRenderer(name)) section.dirty = false;
    }
    this.mount(name);
    el.classList.remove('section-skeleton');

    if (immediate) {
      /* Hero on first load: go directly to visible — no flash, no animation */
      el.classList.remove('section-enter', 'section-enter-active');
      void el.offsetWidth;
      el.classList.add('section-enter-active');
      return;
    }

    if (wasUnloaded) {
      /* Restoring already-seen content: keep it fully visible (opacity stays 1),
         never re-run the enter transition (would flash from opacity 0). */
      el.classList.remove('section-enter');
      el.classList.add('section-enter-active');
      return;
    }

    /* Normal sections: animate entry from .section-enter → .section-enter-active
       Both classes must be present simultaneously for the CSS transition to fire. */
    void el.offsetWidth; /* force reflow so transition starts from current computed styles */
    el.classList.add('section-enter-active');

    /* Clean up .section-enter after animation completes */
    if (section._enterTimer) clearTimeout(section._enterTimer);
    section._enterTimer = setTimeout(() => {
      el.classList.remove('section-enter');
      section._enterTimer = null;
    }, 900);
  },

  deactivate(name, el) {
    const section = this.sections.get(name);
    if (!section) return;
    section.state = 'inactive';
    el.dataset.sectionState = 'inactive';
    /* Content stays mounted; CSS reduces backdrop cost until it's far away. */
  },

  scheduleUnload(name, el) {
    const section = this.sections.get(name);
    if (!section || name === 'hero') return; /* never unload hero */

    if (section.unloadTimer) return;
    section.unloadTimer = setTimeout(() => {
      section.unloadTimer = null;
      if (section.state === 'inactive' || section.state === 'unloaded') {
        this.unload(name, el);
      }
    }, this.unloadDelay());
  },

  cancelUnload(name) {
    const section = this.sections.get(name);
    if (!section || !section.unloadTimer) return;
    clearTimeout(section.unloadTimer);
    section.unloadTimer = null;
  },

  /* The real "heavy DOM removed": detach the section's card and drop in a
     height-preserving skeleton so scroll position is unchanged. The detached
     card is cached so scrolling back re-inserts it without a re-render. */
  unload(name, el) {
    const section = this.sections.get(name);
    if (!section) return;
    section.state = 'unloaded';
    el.dataset.sectionState = 'unloaded';

    const card = section.card || el.firstElementChild;
    if (card) {
      const h = card.offsetHeight || 0;
      const sk = document.createElement('div');
      sk.className = 'section-skeleton-box';
      if (h > 0) sk.style.minHeight = h + 'px';
      section.el.replaceChild(sk, card);
      section.skeleton = sk;
      section.card = card;
    }
    el.classList.add('section-skeleton');

    /* Pause any running timers related to this section */
    if (name === 'chart') hideChartGuide();
  },

  /* Re-insert the cached card (if it was unloaded) — instant, no re-render. */
  mount(name) {
    const section = this.sections.get(name);
    if (!section) return;
    if (section.skeleton && section.card) {
      section.el.replaceChild(section.card, section.skeleton);
      section.skeleton = null;
      section.card = null;
    }
  },

  /* Called when data is refreshed — re-renders sections that are visible */
  refreshVisible() {
    this.sections.forEach((section, name) => {
      if (section.state === 'active' || section.state === 'unloaded') return;
      if (section.state === 'inactive') {
        /* Inactive sections might become active soon. Reset them to
           enter state so they animate smoothly when scrolled into view. */
        const el = section.el;
        el.classList.remove('section-enter-active');
        el.classList.add('section-enter');
      }
    });
  },

  /* Destroy observers + restore any unloaded content (cleanup) */
  destroy() {
    if (this.io) this.io.disconnect();
    if (this.ioUnload) this.ioUnload.disconnect();
    this.sections.forEach(section => {
      if (section.unloadTimer) clearTimeout(section.unloadTimer);
      if (section.skeleton && section.card) this.mount(section);
    });
    this.sections.clear();
  }
};

/* Apply the current quality mode: Eco/low disable heavy canvas FX + storm flashes. */
function applyEffects() {
  const eco = state.effects === 'eco';
  const low = eco || (state.effects === 'auto' && state._perfLow);
  document.documentElement.setAttribute('data-perf', low ? (eco ? 'eco' : 'low') : '');
  if (low) { FX.stop(); stopStorm(); }
  else if (state.weather) applyWeatherTheme();
}
function syncEffectsSelect() {
  if (el.effectsSelect) el.effectsSelect.value = state.effects;
}

/* ---------------- Precipitation map (RainViewer) — dual-layer smooth radar --------------- */
/* RainViewer tiles only exist up to zoom 7. We keep TWO raster sources/layers and
   cross-fade between them on every frame change so the map never flashes blank
   while the next tile set loads (the classic setTiles() flicker). */
const RADAR = {
  frames: [], idx: -1, nowIdx: -1, playing: false, playTimer: null,
  layerReady: false, active: false, opacity: 0.78, speed: 700,
  host: 'https://tilecache.rainviewer.com', lastMetaTs: 0, refreshTimer: null,
  preloadSet: new Set(),
  /* which of the two buffers is currently visible: 0 or 1 */
  front: 0,
  loadGen: 0,
  styleHooked: false,

  srcId(i) { return i === 0 ? 'radar-a' : 'radar-b'; },
  layerId(i) { return i === 0 ? 'radar-a' : 'radar-b'; },

  async load(silent) {
    const gen = ++this.loadGen;
    if (!silent) this.showLoading(true);
    try {
      const r = await fetchWithTimeout('https://api.rainviewer.com/public/weather-maps.json', 12000);
      if (!r.ok) throw new Error('rainviewer ' + r.status);
      const d = await r.json();
      if (gen !== this.loadGen) return; /* superseded */
      const past = (d.radar && d.radar.past) || [];
      const nowcast = (d.radar && d.radar.nowcast) || [];
      this.host = d.host || this.host;
      const frames = past.concat(nowcast).map((f, i) => ({
        time: f.time,
        path: f.path,
        url: (d.host || this.host) + f.path,
        kind: i < past.length ? (i === past.length - 1 ? 'now' : 'past') : 'forecast'
      }));
      if (!frames.length) {
        if (!silent) toast(t('toast_network'), 'error');
        return;
      }
      const prevTime = this.frames[this.idx] && this.frames[this.idx].time;
      const wasAtNow = this.idx < 0 || this.idx === this.nowIdx;
      this.frames = frames;
      this.nowIdx = Math.max(0, past.length - 1);
      if (wasAtNow || prevTime == null) this.idx = this.nowIdx;
      else {
        const keep = frames.findIndex(f => f.time === prevTime);
        this.idx = keep >= 0 ? keep : this.nowIdx;
      }
      this.lastMetaTs = Date.now();
      this.setupSlider();
      if (this.active) {
        this.ensureLayers();
        this.renderFrame(true);
        this.preloadAround(this.idx);
        if (!this.layerReady) this.retryUntilReady();
      }
      this.scheduleAutoRefresh();
    } catch (e) {
      console.warn('LiveSky radar load failed', e);
      if (!silent) toast(t('toast_network'), 'error');
    } finally {
      if (gen === this.loadGen && !silent) this.showLoading(false);
    }
  },
  refreshSilent() {
    if (!this.active) return;
    if (Date.now() - this.lastMetaTs < 90 * 1000) return;
    this.load(true);
  },
  scheduleAutoRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      if (!this.active || document.hidden) return;
      this.refreshSilent();
    }, 2 * 60 * 1000);
  },
  retryUntilReady() {
    let tries = 0;
    const tmr = setInterval(() => {
      if (!this.active) { clearInterval(tmr); return; }
      if (this.layerReady) { clearInterval(tmr); return; }
      if (tries++ > 40) { clearInterval(tmr); return; }
      if (this.ensureLayers()) this.renderFrame(true);
    }, 400);
  },
  showLoading(on) {
    if (el.radarLoading) el.radarLoading.classList.toggle('hidden', !on);
    if (el.radarToggle) el.radarToggle.classList.toggle('loading', !!on && this.active);
  },
  setupSlider() {
    if (el.radarSlider) {
      el.radarSlider.max = String(Math.max(0, this.frames.length - 1));
      el.radarSlider.value = String(Math.max(0, this.idx));
    }
    if (el.radarTicks && this.frames.length > 1) {
      const pct = (this.nowIdx / Math.max(1, this.frames.length - 1)) * 100;
      el.radarTicks.style.setProperty('--radar-now-pct', pct.toFixed(2) + '%');
    }
    this.updateTime();
  },
  /* Always 256 — RainViewer 512 tiles + MapLibre often mis-scale on mobile WebViews.
     256 is universally correct and RainViewer serves it for every frame. */
  tileSize() { return 256; },
  /* path options: /{size}/{z}/{x}/{y}/{color}/{options}.png
     color 2 = original RainViewer palette, options 1_1 = smooth + snow. */
  tileUrl(frame) {
    const f = frame || this.frames[this.idx];
    if (!f) return '';
    return `${f.url}/${this.tileSize()}/{z}/{x}/{y}/2/1_1.png`;
  },
  mapReady() {
    return !!(fullMapInst && window.maplibregl && (!fullMapInst.isStyleLoaded || fullMapInst.isStyleLoaded()));
  },
  ensureLayers() {
    if (!fullMapInst || !this.frames.length || this.idx < 0) return false;
    if (!this.mapReady()) return false;
    try {
      const size = this.tileSize();
      const url = this.tileUrl(this.frames[this.idx]);
      for (let i = 0; i < 2; i++) {
        const sid = this.srcId(i);
        const lid = this.layerId(i);
        if (!fullMapInst.getSource(sid)) {
          fullMapInst.addSource(sid, {
            type: 'raster',
            tiles: [url],
            tileSize: size,
            minzoom: 0,
            /* RainViewer only publishes tiles through z7 — higher = 404. */
            maxzoom: 7,
            attribution: '© RainViewer'
          });
        }
        if (!fullMapInst.getLayer(lid)) {
          fullMapInst.addLayer({
            id: lid, type: 'raster', source: sid,
            paint: {
              'raster-opacity': i === this.front ? this.opacity : 0,
              'raster-opacity-transition': { duration: 0 },
              'raster-fade-duration': 0,
              'raster-resampling': 'linear'
            }
          });
        }
      }
      this.layerReady = true;
      this.hookStyle();
      return true;
    } catch (e) {
      console.warn('LiveSky radar ensureLayers', e);
      return false;
    }
  },
  hookStyle() {
    if (!fullMapInst || this.styleHooked) return;
    this.styleHooked = true;
    fullMapInst.on('styledata', () => {
      if (!this.active) return;
      /* Basemap theme swap removes our layers — rebuild after style settles. */
      this.layerReady = false;
      clearTimeout(this._styleTimer);
      this._styleTimer = setTimeout(() => {
        if (!this.active) return;
        if (this.ensureLayers()) this.renderFrame(true);
      }, 120);
    });
  },
  /* hard=true forces both buffers to the current frame (first paint / rebuild).
     hard=false cross-fades onto the back buffer. */
  renderFrame(hard) {
    if (!this.frames.length || this.idx < 0) return;
    if (!fullMapInst) {
      this.updateChrome();
      return;
    }
    if (!this.layerReady && !this.ensureLayers()) {
      this.updateChrome();
      return;
    }
    const url = this.tileUrl(this.frames[this.idx]);
    try {
      if (hard) {
        /* Seed both buffers so there's never a transparent gap. */
        for (let i = 0; i < 2; i++) {
          const src = fullMapInst.getSource(this.srcId(i));
          if (src && src.setTiles) src.setTiles([url]);
          try {
            fullMapInst.setPaintProperty(this.layerId(i), 'raster-opacity', i === this.front ? this.opacity : 0);
          } catch (e) { /* ignore */ }
        }
      } else {
        const back = 1 - this.front;
        const backSrc = fullMapInst.getSource(this.srcId(back));
        if (backSrc && backSrc.setTiles) backSrc.setTiles([url]);
        /* brief delay so the browser can start fetching before we fade in */
        const frontId = this.layerId(this.front);
        const backId = this.layerId(back);
        const op = this.opacity;
        try {
          fullMapInst.setPaintProperty(backId, 'raster-opacity-transition', { duration: 0 });
          fullMapInst.setPaintProperty(backId, 'raster-opacity', 0);
        } catch (e) { /* ignore */ }
        /* Fade in back, fade out front. */
        requestAnimationFrame(() => {
          if (!this.active || !fullMapInst) return;
          try {
            fullMapInst.setPaintProperty(backId, 'raster-opacity-transition', { duration: 280 });
            fullMapInst.setPaintProperty(frontId, 'raster-opacity-transition', { duration: 280 });
            fullMapInst.setPaintProperty(backId, 'raster-opacity', op);
            fullMapInst.setPaintProperty(frontId, 'raster-opacity', 0);
            this.front = back;
          } catch (e) { /* ignore */ }
        });
      }
    } catch (e) {
      console.warn('LiveSky radar renderFrame', e);
      this.layerReady = false;
    }
    this.updateChrome();
    this.preloadAround(this.idx);
  },
  updateChrome() {
    if (el.radarSlider && this.frames.length) el.radarSlider.value = String(this.idx);
    this.updateTime();
  },
  updateTime() {
    const f = this.frames[this.idx];
    if (!f) return;
    if (el.radarTime) {
      try {
        el.radarTime.textContent = new Date(f.time * 1000)
          .toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        const d = new Date(f.time * 1000);
        el.radarTime.textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }
    }
    if (el.radarBadge) {
      el.radarBadge.classList.remove('past', 'forecast');
      if (this.idx > this.nowIdx) {
        el.radarBadge.textContent = t('radar_badge_forecast');
        el.radarBadge.classList.add('forecast');
      } else if (this.idx < this.nowIdx) {
        el.radarBadge.textContent = t('radar_badge_past');
        el.radarBadge.classList.add('past');
      } else {
        el.radarBadge.textContent = t('radar_badge_now');
      }
    }
  },
  preloadAround(center) {
    if (!this.frames.length) return;
    const size = this.tileSize();
    for (let d = -2; d <= 3; d++) {
      const i = center + d;
      if (i < 0 || i >= this.frames.length) continue;
      const key = this.frames[i].path + '|' + size;
      if (this.preloadSet.has(key)) continue;
      this.preloadSet.add(key);
      try {
        const img = new Image();
        img.decoding = 'async';
        /* Warm a low-zoom tile so DNS/TLS + first bytes are hot. */
        img.src = `${this.frames[i].url}/${size}/1/0/0/2/1_1.png`;
      } catch (e) { /* ignore */ }
    }
    if (this.preloadSet.size > 48) {
      this.preloadSet = new Set(Array.from(this.preloadSet).slice(-24));
    }
  },
  step(dir) {
    if (!this.frames.length) return;
    this.idx = Math.min(this.frames.length - 1, Math.max(0, this.idx + dir));
    this.renderFrame(false);
  },
  goto(i) {
    if (!this.frames.length) return;
    i = Math.max(0, Math.min(this.frames.length - 1, i | 0));
    if (i === this.idx) { this.updateChrome(); return; }
    this.idx = i;
    this.renderFrame(false);
  },
  goLive() {
    if (this.nowIdx < 0) return;
    this.idx = this.nowIdx;
    this.renderFrame(false);
  },
  togglePlay() { this.playing ? this.pause() : this.play(); },
  play() {
    if (!this.frames.length) return;
    this.playing = true;
    if (el.radarPlay) {
      el.radarPlay.classList.add('playing');
      el.radarPlay.innerHTML = '<i class="ph-fill ph-pause"></i>';
      el.radarPlay.setAttribute('aria-label', 'Pause');
    }
    if (this.playTimer) clearInterval(this.playTimer);
    this.playTimer = setInterval(() => {
      if (!this.frames.length) return;
      this.idx = this.idx >= this.frames.length - 1 ? 0 : this.idx + 1;
      this.renderFrame(false);
    }, this.speed || 700);
  },
  pause() {
    this.playing = false;
    if (this.playTimer) { clearInterval(this.playTimer); this.playTimer = null; }
    if (el.radarPlay) {
      el.radarPlay.classList.remove('playing');
      el.radarPlay.innerHTML = '<i class="ph-fill ph-play"></i>';
      el.radarPlay.setAttribute('aria-label', 'Play');
    }
  },
  setOpacity(v) {
    this.opacity = Math.max(0.15, Math.min(1, v));
    if (fullMapInst && this.layerReady) {
      try {
        fullMapInst.setPaintProperty(this.layerId(this.front), 'raster-opacity', this.opacity);
      } catch (e) { /* ignore */ }
    }
  },
  setSpeed(ms) {
    this.speed = Math.max(150, ms || 700);
    if (this.playing) { this.pause(); this.play(); }
  },
  fitZoom() {
    if (!fullMapInst) return;
    try {
      const z = fullMapInst.getZoom();
      /* Prefer a readable precip view without yanking the user if they're already in range. */
      if (z > 8.5) fullMapInst.easeTo({ center: [state.lon, state.lat], zoom: 7, duration: 650 });
      else if (z < 3.5) fullMapInst.easeTo({ center: [state.lon, state.lat], zoom: 5.5, duration: 650 });
    } catch (e) { /* ignore */ }
  },
  enable() {
    if (!window.maplibregl) return;
    /* Make sure the fullscreen map exists. */
    if (!fullMapInst) {
      openFullMap();
      /* Map init is async (setTimeout 320) — retry enable shortly. */
      setTimeout(() => this.enable(), 450);
      return;
    }
    const first = !this.active;
    this.active = true;
    if (el.radarPanel) el.radarPanel.classList.remove('hidden');
    if (el.radarToggle) {
      el.radarToggle.classList.add('on');
      el.radarToggle.setAttribute('aria-pressed', 'true');
    }
    if (el.radarOpacity) el.radarOpacity.value = String(Math.round(this.opacity * 100));
    if (el.radarSpeed) el.radarSpeed.value = String(this.speed);

    if (first) this.fitZoom();
    try { fullMapInst.resize(); } catch (e) { /* ignore */ }

    if (this.frames.length) {
      this.ensureLayers();
      this.renderFrame(true);
      this.scheduleAutoRefresh();
      /* Refresh meta if stale */
      if (Date.now() - this.lastMetaTs > 2 * 60 * 1000) this.load(true);
    } else {
      this.load(false);
    }
  },
  disable() {
    this.pause();
    this.active = false;
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    if (el.radarPanel) el.radarPanel.classList.add('hidden');
    if (el.radarToggle) {
      el.radarToggle.classList.remove('on', 'loading');
      el.radarToggle.setAttribute('aria-pressed', 'false');
    }
    if (fullMapInst && this.layerReady) {
      try {
        for (let i = 0; i < 2; i++) {
          const lid = this.layerId(i), sid = this.srcId(i);
          if (fullMapInst.getLayer(lid)) fullMapInst.removeLayer(lid);
          if (fullMapInst.getSource(sid)) fullMapInst.removeSource(sid);
        }
      } catch (e) { /* ignore */ }
      this.layerReady = false;
      this.front = 0;
    }
  },
  toggle() { this.active ? this.disable() : this.enable(); }
};

/* ---------------- weather notifications (local + Web Push ready) ---------------- */
/* Keeps a rolling record of alerts we already notified about so the user isn't
   spammed with the same event every time the forecast refreshes. */
let sentAlerts = store.get('livesky:sent_alerts', []);
function prunSentAlerts() {
  const now = Date.now();
  sentAlerts = sentAlerts.filter(a => now - a.at < 3 * 3600 * 1000); /* 3h window */
}
function alertSignature(type, hourIso) {
  /* Bucket by 30 minutes so refined minutely times of the same event don't re-fire. */
  if (!hourIso) return type + '|?';
  const hh = parseInt(hourIso.slice(11, 13), 10) || 0;
  const mm = parseInt(hourIso.slice(14, 16), 10) || 0;
  const bucket = String(hh).padStart(2, '0') + ':' + (mm < 30 ? '00' : '30');
  return type + '|' + hourIso.slice(0, 10) + 'T' + bucket;
}
function shouldSendAlert(sig) { prunSentAlerts(); return !sentAlerts.some(a => a.sig === sig); }
function markSent(sig) {
  sentAlerts.push({ sig, at: Date.now() });
  sentAlerts = sentAlerts.slice(-60);
  store.set('livesky:sent_alerts', sentAlerts);
}

/* Public list for notifications — same engine as the banner, 24h horizon.
   Each item has .type, .t (ISO with minutes), .abs (absolute minutes). */
function upcomingAlerts() {
  return collectHazardAlerts(24).map(a => ({
    type: a.type,
    t: a.t,
    abs: a.abs,
    extra: a.extra
  }));
}

function nativeNotificationId(alert) {
  const source = alertSignature(alert.type, alert.t);
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = ((hash * 31) + source.charCodeAt(i)) | 0;
  return Math.max(1, hash & 0x7fffffff);
}
function sendNotification(alert) {
  const abs = alert.abs != null ? alert.abs : (alert.t ? absMinLocal(alert.t) : null);
  const title = t('notif_title');
  const body = formatAlertMsg(alert.type, abs, alert.extra);
  const nativeNotifications = nativePlugin('LocalNotifications');

  if (nativeNotifications) {
    return nativeNotifications.schedule({
      notifications: [{
        id: nativeNotificationId(alert), title, body,
        channelId: 'weather-alerts',
        smallIcon: 'ic_stat_livesky',
        iconColor: '#38BDF8',
        extra: { type: alert.type, forecastTime: alert.t }
      }]
    });
  }

  const opts = {
    body, icon: 'icons/icon-192.png', badge: 'icons/icon-96.png',
    tag: 'livesky-' + alert.type, data: { url: location.href },
    renotify: false
  };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    return navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts))
      .catch(() => { try { new Notification(title, opts); } catch (e) { /* ignore */ } });
  }
  try { new Notification(title, opts); } catch (e) { /* ignore */ }
  return Promise.resolve();
}

function dispatchWeatherAlerts() {
  for (const a of upcomingAlerts()) {
    const sig = alertSignature(a.type, a.t);
    if (!shouldSendAlert(sig)) continue;
    markSent(sig);
    Promise.resolve(sendNotification(a)).catch(() => { /* permission can be changed in Android settings */ });
  }
}

/* Called on every forecast refresh and on a periodic timer. Only fires when the
   user enabled alerts, permission is granted and the event hasn't been sent. */
function checkWeatherAlerts() {
  if (!state.notif) return;
  const nativeNotifications = nativePlugin('LocalNotifications');
  if (nativeNotifications) {
    if (state._notifPermissionCheck) return;
    state._notifPermissionCheck = true;
    nativeNotifications.checkPermissions()
      .then(permission => { if (permission.display === 'granted') dispatchWeatherAlerts(); })
      .catch(() => {})
      .finally(() => { state._notifPermissionCheck = false; });
    return;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  dispatchWeatherAlerts();
}

function updateNotifItem() {
  if (!el.notifItem) return;
  const on = state.notif;
  if (el.notifIco) el.notifIco.className = 'ph ' + (on ? 'ph-bell-ringing' : 'ph-bell');
  if (el.notifLabel) {
    el.notifLabel.dataset.translate = on ? 'notif_enabled' : 'notif_enable';
    el.notifLabel.textContent = t(on ? 'notif_enabled' : 'notif_enable');
  }
  el.notifItem.classList.toggle('selected', on);
}
function setNotificationsEnabled() {
  state.notif = true;
  store.set('livesky:notif', true);
  updateNotifItem();
  toast(t('notif_toast_on'), 'success');
  checkWeatherAlerts();
}
function toggleNotifications() {
  if (state.notif) {
    state.notif = false;
    store.set('livesky:notif', false);
    updateNotifItem();
    toast(t('notif_toast_off'), 'info');
    return;
  }

  const nativeNotifications = nativePlugin('LocalNotifications');
  if (nativeNotifications) {
    nativeNotifications.checkPermissions()
      .then(permission => permission.display === 'granted' ? permission : nativeNotifications.requestPermissions())
      .then(permission => {
        if (permission.display === 'granted') setNotificationsEnabled();
        else toast(t('notif_blocked'), 'error');
      })
      .catch(() => { toast(t('notif_unsupported'), 'error'); });
    return;
  }

  if (typeof Notification === 'undefined') { toast(t('notif_unsupported'), 'error'); return; }
  if (Notification.permission === 'denied') { toast(t('notif_blocked'), 'error'); return; }
  if (Notification.permission === 'granted') { setNotificationsEnabled(); return; }
  /* prompt the user for permission first time */
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') setNotificationsEnabled();
    else toast(t('notif_blocked'), 'error');
  }).catch(() => { toast(t('notif_unsupported'), 'error'); });
}

/* ---------------- Capacitor / Android integration ---------------- */
function initNativeBridge() {
  if (!isNativeApp()) return;

  const nativeApp = nativePlugin('App');
  if (nativeApp) {
    try {
      /* Capacitor's addListener can return a PluginListenerHandle directly
         instead of a Promise. Promise.resolve supports both API shapes. */
      Promise.resolve(nativeApp.addListener('backButton', () => {
        if (consentLocked()) return;
        if (privacyDialogOpen()) { cancelPrivacyConsent(); return; }
        if (el.mapModal.classList.contains('open')) { closeFullMap(); return; }
        if (el.modal.classList.contains('open')) { closeModal(); return; }
        if (el.mainMenu && el.mainMenu.classList.contains('open')) { setMenuOpen(false); return; }
        if (el.autoList && !el.autoList.classList.contains('hidden')) { closeAutocomplete(); return; }
        nativeApp.exitApp();
      })).catch(() => {});
    } catch (e) { /* a native listener must never block application startup */ }
  }

  const nativeNotifications = nativePlugin('LocalNotifications');
  if (nativeNotifications) {
    try {
      Promise.resolve(nativeNotifications.createChannel({
        id: 'weather-alerts',
        name: 'LiveSky Weather',
        description: 'Weather warnings and forecast alerts',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#38BDF8'
      })).catch(() => {});
    } catch (e) { /* notifications remain optional */ }
  }
}

/* ---------------- init ---------------- */
function init() {
  /* sanitize persisted settings (old/foreign values must never break boot) */
  if (!I18N[state.lang]) state.lang = 'ru';
  if (!['adaptive', 'light', 'dark'].includes(state.theme)) state.theme = 'adaptive';
  if (!['metric', 'imperial'].includes(state.units)) state.units = 'metric';
  if (!['auto', 'ecmwf_ifs04', 'gfs_seamless', 'icon_seamless'].includes(state.model)) state.model = 'auto';
  if (!['auto', 'full', 'eco'].includes(state.effects)) state.effects = 'auto';

  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  el.input.placeholder = t('search_ph');
  applyTranslations();
  updateThemeLabel();
  syncMenuChecks();
  syncEffectsSelect();
  updateFavIcon();
  updateNotifItem();
  startClock();
  startLiveTicker();
  bindEvents();
  initNativeBridge();
  checkLegalConsent();
  initReveal();
  applyEffects();
  SECTION_MANAGER.init();
  showLoader();
  /* No third-party request of any kind on a locked boot: fonts, icons, the
     map library and flags are self-hosted, and basemap tiles wait for the
     ToS consent. Weather for the default / last city is the app's own first
     data request and stays exactly where it was in the boot sequence. */
  if (!consentLocked()) initMap();
  else mapInitPending = true;

  /* PWA + adaptive performance + offline */
  registerServiceWorker();
  initInstallPrompt();
  updateInstallItem();
  initConnectivity();
  if (state.effects === 'auto') PERF.start();

  const last = store.get('livesky:last_city', null);
  if (last && last.lat != null) {
    state.lat = last.lat;
    state.lon = last.lon;
    state.locationName = last.name || 'Москва';
    state.countryCode = last.cc || '';
    state.admin = last.admin || '';
  }
  /* Always paint a default / last-city forecast so the UI is ready behind
     the sequential dialogs. Auto-geolocation is offered in Step 2. */
  fetchWeather();
  if (hasValidConsent()) offerPrivacyIfNeeded();
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
