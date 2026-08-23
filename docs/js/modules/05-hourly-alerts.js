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

