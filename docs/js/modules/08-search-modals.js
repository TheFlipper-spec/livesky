/* ============================================================
   LiveSky Weather Pro — INTERACTIVE UI (layer 3)
   ------------------------------------------------------------
   Overlays, settings and global event wiring:
     • accessible modal infrastructure (focus trap)
     • detail views (hourly / daily / monthly / sun)
     • advice & lifestyle scoring (run, car-wash, walk)
     • theme / units / model / effects / language settings & menu
     • fullscreen, reveal-on-scroll, global key/resize handlers
   Consumes: all lower layers.
   ============================================================ */
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

/* Smart precipitation advice from the map engine (hybrid IMERG+RainViewer+
   own extrapolation). Independent of Open-Meteo's hourly grid: catches rain
   the hourly model misses and can see it clearing when OM still says rain.
   Returns a list-row tuple or null. No-op until the lazy map module has run
   — `typeof NOWCAST` is safe before it loads (shared lexical scope). */
function radarAdviceItem(raining, upcomingRain) {
  if (typeof NOWCAST === 'undefined' || !NOWCAST.active || !state.weather) return null;
  try {
    const wetNow = NOWCAST.sampleNowcast(state.lat, state.lon, 0);
    if (wetNow != null && wetNow > 0.05) {
      /* Rain overhead per the map: when does the field clear at the pin? */
      for (let m = 30; m <= 180; m += 30) {
        const v = NOWCAST.sampleNowcast(state.lat, state.lon, m);
        if (v != null && v <= 0.05) {
          return ['ph-umbrella', 'text:#60a5fa', t('advice_radar_stops').replace('{d}', fmtDurSmart(m))];
        }
      }
      return null;
    }
    /* OM says dry — does the map see rain approaching that the hourly grid
       has not caught yet? Only then it adds value (no duplicate warnings). */
    if (!raining && !upcomingRain) {
      for (let m = 15; m <= 120; m += 15) {
        const v = NOWCAST.sampleNowcast(state.lat, state.lon, m);
        if (v != null && v > 0.05) {
          return ['ph-drop-half', 'text:#38bdf8', t('advice_radar_arrive').replace('{d}', fmtDurSmart(m))];
        }
      }
    }
  } catch (e) { /* engine busy/unavailable → Open-Meteo advice stands */ }
  return null;
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

  /* 2b. Precip-map check — an independent source, only adds lines when it has
      something Open-Meteo's hourly grid does not already say. */
  const radarTip = radarAdviceItem(raining, upcomingRain);
  if (radarTip) items.push(radarTip);

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

  const lifeNowBlock = renderLifeNowBlock(h, i);

  const body = `
    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:14px">${list}</div>
    <div class="m-note"><i class="ph-fill ph-t-shirt"></i><p><b>${t('wear_title')}:</b> ${wear}</p></div>
    ${lifeNowBlock}`;
  openModal(state.locationName, t('analysis_title') + ' · ' + fmtTempDeg(temp) + ' · ' + wmoLabel(code), body);
  bindLifeNowCards(i);
}

/* ---------------- LifeSky "right now" mini-scores (inside Weather analysis) --------- */
const LIFE_NOW_TYPES = [
  { type: 'run', icon: 'ph-sneaker-move', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
  { type: 'car', icon: 'ph-car', color: '#60a5fa', bg: 'rgba(96,165,250,.14)' },
  { type: 'walk', icon: 'ph-footprints', color: '#fb923c', bg: 'rgba(251,146,60,.14)' }
];
/* Renders the compact 3-card "score right now" strip. Falls back to an empty
   string (rather than throwing) if the hourly slot has no usable data yet,
   so a partially-loaded forecast never breaks the rest of the modal. */
function renderLifeNowBlock(h, i) {
  if (!h || !h.time || i == null || i < 0 || i >= h.time.length) return '';
  const scoreFns = { run: scoreRun, car: scoreCarWash, walk: scoreWalk };
  const titles = { run: t('life_run_title'), car: t('life_car_title'), walk: t('life_walk_title') };
  let cards = '';
  for (const cfg of LIFE_NOW_TYPES) {
    let score = 0;
    try { score = scoreFns[cfg.type](h, i); } catch (e) { score = 0; }
    const color = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';
    cards += `
      <div class="life-now-card" data-life-now="${cfg.type}" role="button" tabindex="0" aria-label="${escHtml(titles[cfg.type])} · ${score}/100">
        <div class="life-now-ico" style="background:${cfg.bg};color:${cfg.color}"><i class="ph-fill ${cfg.icon}"></i></div>
        <span class="life-now-label">${escHtml(titles[cfg.type])}</span>
        <span class="life-now-score" style="color:${color}">${score}</span>
        <span class="life-now-tag" style="background:${color}1a;color:${color}">${escHtml(scoreLabel(score))}</span>
      </div>`;
  }
  return `
    <div class="life-now-title"><i class="ph-fill ph-heartbeat"></i><span>${escHtml(t('life_now_title'))}</span></div>
    <div class="life-now-grid">${cards}</div>
    <p class="life-now-hint">${escHtml(t('life_now_tap'))}</p>`;
}
/* Wires the "right now" cards to drill straight into that activity's detail
   view for the current hour (same detail screen the 7-day list uses). */
function bindLifeNowCards(nowIndex) {
  const nodes = el.modalBody.querySelectorAll('.life-now-card[data-life-now]');
  nodes.forEach(node => {
    const type = node.dataset.lifeNow;
    const open = () => showLifeSkySlot(nowIndex, type);
    node.addEventListener('click', open);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
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



/* ---------------- maps & radar: LAZY subsystem ---------------- */
/* The MapLibre views, the RainViewer radar and all their UI wiring live in
   the on-demand module js/modules/11-map-radar.js. They are fetched by the
   LiveSkyMap facade (10-bootstrap.js) on the first real map/radar
   interaction and are never part of the boot path. Eager code below only
   talks to the facade, which is a safe no-op until the subsystem loads. */

/* ---------------- theme / lang / settings ---------------- */
const THEME_CYCLE = { adaptive: 'light', light: 'dark', dark: 'adaptive' };
const THEME_KEYS = { adaptive: 'theme_adaptive', light: 'theme_light', dark: 'theme_dark' };

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  updateThemeLabel();
  if (window.LiveSkyMap) LiveSkyMap.refreshTiles();
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
/* Segment-radio helpers: mark the active choice in a [data-*] group. */
function syncSegment(container, attr, value) {
  if (!container) return;
  container.querySelectorAll('[' + attr + ']').forEach(b => {
    const sel = b.getAttribute(attr) === value;
    b.classList.toggle('seg-selected', sel);
    b.setAttribute('aria-checked', String(sel));
  });
}
/* Debounce guard for the menu toggle. On some Android WebViews a single tap can
   fire two click events on the button; because the toggle reads the current
   `open` state, the second click would immediately undo the just-changed state
   (open → instantly closed, "every other tap"). Ignoring a toggle that arrives
   within 250ms of the previous one absorbs that ghost event without affecting
   normal taps (a human can't tap twice that fast). */
let lastMenuToggleAt = 0;
function setMenuOpen(open) {
  if (el.mainMenu) el.mainMenu.classList.toggle('open', open);
  if (el.menuBtn) el.menuBtn.setAttribute('aria-expanded', String(open));
  /* Prevent scrolling behind the menu on mobile + show the sheet backdrop */
  document.body.classList.toggle('menu-scroll-lock', open);
  document.body.classList.toggle('menu-open', open);
}
function syncMenuChecks() {
  if (!el.mainMenu) return;
  syncSegment(el.mainMenu, 'data-lang', state.lang);
  syncSegment(el.mainMenu, 'data-theme-pick', state.theme);
  syncSegment(el.unitsSeg, 'data-units', state.units);
  syncSegment(el.modelSeg, 'data-model', state.model);
  syncSegment(el.effectsSeg, 'data-effects', state.effects);
}
function updateThemeLabel() {
  if (!el.themeLabel) return;
  el.themeLabel.dataset.translate = THEME_KEYS[state.theme];
  el.themeLabel.textContent = t(THEME_KEYS[state.theme]);
}

/* Segmented settings choices. Same-value clicks are no-ops (the menu stay
   open so the user can keep adjusting); real changes re-render and close. */
function setUnits(v) {
  if (!['metric', 'imperial'].includes(v) || state.units === v) return;
  state.units = v;
  store.set('livesky:units', v);
  syncMenuChecks();
  setMenuOpen(false);
  if (state.weather) renderAll();
}
function setModel(v) {
  if (!['auto', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'].includes(v) || state.model === v) return;
  state.model = v;
  store.set('livesky:model', v);
  syncMenuChecks();
  setMenuOpen(false);
  fetchWeather();
}
function setEffects(v) {
  if (!['auto', 'full', 'eco'].includes(v) || state.effects === v) return;
  state.effects = v;
  store.set('livesky:effects', v);
  syncMenuChecks();
  setMenuOpen(false);
  if (v === 'full') state._perfLow = false;
  applyEffects();
  /* FPS watchdog runs only on Auto; Maximum/Eco never keep an rAF loop alive
     in the background. */
  if (v === 'auto') PERF.start();
  else PERF.stop();
}

function applyTranslations() {
  document.querySelectorAll('[data-translate]').forEach(node => {
    const key = node.dataset.translate;
    if (!key) return;
    node.textContent = t(key);
  });
  /* segmented controls carry [data-translate] and are covered by the pass above;
     the model/unit/effect labels live inside them, no option list to sync. */
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
  if (state.weather) {
    renderAll();
    /* The Air Quality card is rendered outside renderAll() (it paints only
       after /v1/air-quality resolves) — without this explicit re-render the
       AQI labels stayed in the old language until the next refresh. This was
       one of the "blocks don't translate immediately" bugs. */
    if (typeof renderAir === 'function') renderAir();
  }
  /* Radar/precipitation chrome (badge, time and ETA line) is built lazily;
     the map subsystem must repaint its labels in the new language at once. */
  if (window.LiveSkyMap) LiveSkyMap.refreshLang();
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
    const now = Date.now();
    if (now - lastMenuToggleAt < 250) return; /* absorb ghost double-click from a single tap */
    lastMenuToggleAt = now;
    setMenuOpen(!el.mainMenu.classList.contains('open'));
  });
  on(el.mainMenu, 'click', (e) => {
    const langBtn = e.target.closest('[data-lang]');
    if (langBtn) { setLang(langBtn.dataset.lang); return; }
    const themeBtn = e.target.closest('[data-theme-pick]');
    if (themeBtn) { setTheme(themeBtn.dataset.themePick); setMenuOpen(false); return; }
    const unitsBtn = e.target.closest('[data-units]');
    if (unitsBtn) { setUnits(unitsBtn.dataset.units); return; }
    const modelBtn = e.target.closest('[data-model]');
    if (modelBtn) { setModel(modelBtn.dataset.model); return; }
    const effectsBtn = e.target.closest('[data-effects]');
    if (effectsBtn) { setEffects(effectsBtn.dataset.effects); return; }
    /* Any other click inside the panel just closes it after a short delay. */
    clearTimeout(state._menuCloseTimer);
    state._menuCloseTimer = setTimeout(() => setMenuOpen(false), 800);
  });
  on(el.menuClose, 'click', () => setMenuOpen(false));
  on(el.menuBackdrop, 'click', () => setMenuOpen(false));
  on(el.fsItem, 'click', () => { setMenuOpen(false); toggleFullscreen(); });
  on(el.refreshItem, 'click', () => { setMenuOpen(false); fetchWeather(true); });
  on(el.geoItem, 'click', () => { setMenuOpen(false); getUserLocation(true); });
  on(el.installItem, 'click', promptInstall);
  on(el.notifItem, 'click', () => { setMenuOpen(false); toggleNotifications(); });

  /* ---- lazy map / radar entry points -------------------------------------
     The whole map subsystem (MapLibre GL + 11-map-radar.js) is fetched on the
     first tap below; the facade then opens the expected screen directly. The
     radar controls themselves are bound inside the lazy module, exactly once. */

  /* Mini-map: a tap (NOT a drag) opens the fullscreen map. The handlers are
     eager because they must work before the map subsystem exists; drag
     distance keeps panning the mini map from opening the overlay. */
  let mapTapStart = null;
  on(el.mapSmall, 'pointerdown', (e) => { mapTapStart = { x: e.clientX, y: e.clientY }; });
  on(el.mapSmall, 'pointerup', (e) => {
    if (!mapTapStart) return;
    const dist = Math.hypot(e.clientX - mapTapStart.x, e.clientY - mapTapStart.y);
    mapTapStart = null;
    if (dist < 6) LiveSkyMap.open();
  });
  /* small-map badge opens fullscreen map with radar already on */
  on(el.mapRadarBadge, 'click', (e) => {
    e.preventDefault(); e.stopPropagation();
    LiveSkyMap.open({ radar: true });
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

  /* merged forecast card: chart ⇄ hourly blocks toggle */
  on(el.forecastChartBtn, 'click', () => setForecastView('chart'));
  on(el.forecastBlocksBtn, 'click', () => setForecastView('blocks'));

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
      if (el.mapModal.classList.contains('open')) { LiveSkyMap.close(); return; }
      if (el.modal.classList.contains('open')) { closeModal(); return; }
      setMenuOpen(false);
      closeAutocomplete();
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing || el.modal.classList.contains('open') || el.mapModal.classList.contains('open')) return;
    if (e.key === '/' ) { e.preventDefault(); el.input.focus(); el.input.select(); return; }
    /* Arrows scroll whichever 24h view is visible (hourly blocks or the chart). */
    const target = state.forecastView === 'blocks' ? el.hStrip : el.chartScroll;
    if (e.key === 'ArrowRight' && target) target.scrollBy({ left: 220, behavior: 'smooth' });
    if (e.key === 'ArrowLeft' && target) target.scrollBy({ left: -220, behavior: 'smooth' });
  });

  window.addEventListener('resize', () => {
    FX.resize();
    /* Recalc aspect-corrected rain hatch when the plot size changes. */
    clearTimeout(window.__chartHatchT);
    window.__chartHatchT = setTimeout(() => {
      if (state.weather && typeof renderChart === 'function') {
        try { SECTION_MANAGER.renderSection('forecast'); } catch (e) { try { renderChart(); } catch (e2) {} }
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
      if (window.LiveSkyMap) LiveSkyMap.radarRefresh();
    } else {
      if (FX.running) {
        cancelAnimationFrame(FX.raf);
        FX.running = false;
      }
      PERF.stop();
      if (window.LiveSkyMap) LiveSkyMap.radarPause();
    }
  });
  /* Backup auto-refresh + weather-alert check. The live ticker already pulls
     every 3 minutes; this is a safety net for long background tabs. */
  setInterval(() => {
    if (!document.hidden && Date.now() - state.lastFetchTs > 3 * 60 * 1000) fetchWeather(true);
    if (!document.hidden) checkWeatherAlerts();
    if (!document.hidden && window.LiveSkyMap) LiveSkyMap.radarRefresh();
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
