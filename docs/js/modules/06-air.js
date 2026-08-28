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
  if (!state.air) {
    /* The card tapped before data ever loaded, or after it failed — tell the
       user instead of doing nothing (the click used to be a silent no-op,
       which looked exactly like a broken air-quality block). */
    toast(t('toast_air_error'), 'error', t('toast_retry'), () => fetchAir(fetchSeq, false));
    return;
  }
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


