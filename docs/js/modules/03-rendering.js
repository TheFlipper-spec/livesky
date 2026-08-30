/* ============================================================
   LiveSky Weather Pro — DASHBOARD RENDERING (layer 2)
   ------------------------------------------------------------
   Paints the main dashboard from state.weather:
     • `renderAll` orchestration across sections
     • hero, metrics, wind tile, sun arc
   Consumes: kernel, data, chart, hourly/alerts, effects.
   ============================================================ */
/* ---------------- rendering ---------------- */
function renderAll() {
  applyWeatherTheme();
  updateHero();
  updateMetrics();
  renderSunArc();
  /* The heavy forecast (chart + hourly blocks) and daily renderers are routed
     through the Section Manager so off-screen sections are skipped (and
     re-rendered lazily when they scroll back into view) instead of always
     rebuilding their DOM. */
  SECTION_MANAGER.renderSection('forecast');
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

