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

/* The 24h chart is anchored to the LOCAL day (00:00 → 24:00), not to the
   current hour. That way the "now" cursor sits exactly where the current time
   is (e.g. 58% of the width at 14:00) instead of always hugging the left edge.
   With past_days=16 the hourly series always contains 00:00 of today. */
function chartDayStartIdx(h) {
  const date = tzNow(state.tz).date;
  const idx = h.time.findIndex(tm => tm.startsWith(date + 'T00:'));
  return idx >= 0 ? idx : state.nowIdx; /* graceful fallback for odd payloads */
}

function renderChart() {
  const h = state.weather && state.weather.hourly;
  if (!h) return;
  /* Day-anchored 24h window: today 00:00 … tomorrow 00:00 (25 samples). */
  const n = 24, start = chartDayStartIdx(h);
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
  /* Cursor position = real current time inside the day window (hours since 00:00). */
  const nowTz = tzNow(state.tz);
  const nowFrac = Math.min(hours, Math.max(0, (nowTz.hour * 60 + nowTz.minute) / 60));
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
    <line class="chart-now-line" x1="${X(nowFrac).toFixed(2)}" y1="5" x2="${X(nowFrac).toFixed(2)}" y2="100" stroke="${state.accent}" stroke-width="0.7" opacity="0.4"/>
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
  chartMeta = { n: hours, m, start, tmin, tmax, Y, X, hours, bands, nowFrac };

  let axis = '';
  for (let k = 0; k <= hours; k += 6) {
    const i = start + k;
    const hr = i < h.time.length ? parseInt(h.time[i].slice(11, 13), 10) : 0;
    axis += `<span>${String(hr).padStart(2, '0')}:00</span>`;
  }
  el.chartAxis.innerHTML = axis;

  /* Big-icons overlay (HTML, never stretched by the SVG). */
  renderChartRainMarkers(bands, temps, X, Y, hours);
  renderChartRainSummary(bands, times);
  bindChartScrub();
  chartSelFrac = Math.min(hours, Math.max(0, nowFrac));
  showChartAtFrac(chartSelFrac);
  updateChartNowTag();
}

/* "Now" tag pinned at the current time position on the chart. */
function updateChartNowTag() {
  const plot = el.chartPlot;
  if (!plot || !chartMeta) return;
  let tag = plot.querySelector('.chart-now-tag');
  if (!tag) {
    tag = document.createElement('span');
    tag.className = 'chart-now-tag';
    tag.setAttribute('aria-hidden', 'true');
    plot.appendChild(tag);
  }
  const f = chartMeta.nowFrac != null ? chartMeta.nowFrac : chartSelFrac;
  const x = (f / chartMeta.hours) * 100;
  tag.style.left = x.toFixed(2) + '%';
  tag.textContent = t('now');
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
  /* Prefer the chart card that owns the cached refs. During section unload that
     card is detached, so document.getElementById() cannot find its summary. */
  const card = el.chartDetail && (el.chartDetail.closest('.chart-card') || el.chartDetail.closest('.forecast-card'));
  let box = card ? card.querySelector('#chart-rain-summary') : $('chart-rain-summary');
  if (card) {
    /* Keep this renderer idempotent even if an older render left duplicates. */
    card.querySelectorAll('#chart-rain-summary').forEach((node, index) => {
      if (index === 0) return;
      node.remove();
    });
  }
  if (!box) {
    /* inject once under the chart title area if markup is missing */
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
    const idx = chartMeta.start + Math.round(frac);
    if (idx >= 0 && idx < state.weather.hourly.time.length) showModalHourly(state.weather.hourly, idx);
  });
}

/* ---------- merged 24h block: chart ⇄ hourly toggle ---------- */
function applyForecastView() {
  const view = state.forecastView === 'blocks' ? 'blocks' : 'chart';
  state.forecastView = view;
  if (el.forecastChartPane) el.forecastChartPane.classList.toggle('hidden', view !== 'chart');
  if (el.forecastBlocksPane) el.forecastBlocksPane.classList.toggle('hidden', view !== 'blocks');
  if (el.forecastChartBtn) el.forecastChartBtn.classList.toggle('active', view === 'chart');
  if (el.forecastBlocksBtn) el.forecastBlocksBtn.classList.toggle('active', view === 'blocks');
  if (el.forecastChartBtn) el.forecastChartBtn.setAttribute('aria-selected', String(view === 'chart'));
  if (el.forecastBlocksBtn) el.forecastBlocksBtn.setAttribute('aria-selected', String(view === 'blocks'));
}

/* Smooth chart ⇄ hours switch. The incoming pane slides up while the outgoing
   one fades out on top of it; the card keeps its height the whole time, so the
   page never jumps. prefers-reduced-motion users get the instant switch.
   Rapid re-clicks are safe: any in-flight animation state on BOTH panes is
   cleared before the new switch starts, so the pair can never end up frozen
   invisible (old bug: pane-out + pane-in stuck on the two panes at once). */
let paneSwitchToken = 0;
function animatePaneSwitch(outPane, inPane) {
  const panes = [el.forecastChartPane, el.forecastBlocksPane];
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clearAnim = () => {
    panes.forEach(p => {
      if (!p) return;
      p.classList.remove('pane-out', 'pane-in', 'pane-in-enter');
      p.removeAttribute('style');
    });
  };
  const finish = () => {
    clearAnim();
    if (outPane) outPane.classList.add('hidden');
    if (inPane) inPane.classList.remove('hidden');
  };
  if (reduce || !outPane || !inPane || outPane === inPane) { finish(); return; }
  const card = outPane.closest('.forecast-card');
  if (!card) { finish(); return; }
  /* A switch may already be mid-flight — clear it so classes/inline styles
     from the previous direction cannot leak onto the new pair. */
  clearAnim();
  const token = ++paneSwitchToken;
  const guarded = () => { if (token === paneSwitchToken) finish(); };
  /* Pin the outgoing pane exactly where it sits right now … */
  const prect = card.getBoundingClientRect();
  const rect = outPane.getBoundingClientRect();
  outPane.style.position = 'absolute';
  outPane.style.top = (rect.top - prect.top) + 'px';
  outPane.style.left = (rect.left - prect.left) + 'px';
  outPane.style.width = rect.width + 'px';
  outPane.style.height = rect.height + 'px';
  outPane.classList.add('pane-out');
  /* … and bring the incoming one in underneath it. */
  inPane.classList.remove('hidden');
  inPane.classList.add('pane-in', 'pane-in-enter');
  void inPane.offsetWidth; /* commit the off-state before the transition */
  inPane.classList.remove('pane-in-enter');
  window.setTimeout(guarded, 420);
}

function setForecastView(view) {
  if (view !== 'chart' && view !== 'blocks') return;
  if (state.forecastView === view) return;
  state.forecastView = view;
  store.set('livesky:forecast_view', view);
  /* Button states flip instantly; only the panel crossfades. */
  if (el.forecastChartBtn) el.forecastChartBtn.classList.toggle('active', view === 'chart');
  if (el.forecastBlocksBtn) el.forecastBlocksBtn.classList.toggle('active', view === 'blocks');
  if (el.forecastChartBtn) el.forecastChartBtn.setAttribute('aria-selected', String(view === 'chart'));
  if (el.forecastBlocksBtn) el.forecastBlocksBtn.setAttribute('aria-selected', String(view === 'blocks'));
  animatePaneSwitch(
    view === 'chart' ? el.forecastBlocksPane : el.forecastChartPane,
    view === 'chart' ? el.forecastChartPane : el.forecastBlocksPane
  );
  if (state.weather) SECTION_MANAGER.renderSection('forecast');
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
let liveEffectSignature = '';
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
  /* Re-evaluate the weather-driven effect when the live weather state changes.
     The 15-second ticker still catches minutely rain transitions, but avoids
     rebuilding particles when the code, theme, and performance mode are the
     same as on the previous tick. */
  const liveEffectKey = [state.theme, state.effects, state._perfLow, currentWeatherCodeLive(), isDayNow()].join('|');
  if (liveEffectKey !== liveEffectSignature) {
    liveEffectSignature = liveEffectKey;
    applyWeatherTheme();
    updateFXIntensity();
  }
  renderAlerts();
  /* Nudge the chart "now" cursor with the real clock when the user isn't scrubbing.
     The cursor is positioned by the TIME OF DAY (0–24h window), so it moves
     continuously across the chart instead of sitting at the left edge. */
  if (chartMeta && el.chartPlot && !el.chartPlot.classList.contains('is-scrubbing')) {
    const nt = tzNow(state.tz);
    const minuteOfDay = nt.hour * 60 + nt.minute;
    chartMeta.nowFrac = Math.min(chartMeta.hours, minuteOfDay / 60);
    showChartAtFrac(chartMeta.nowFrac);
    updateChartNowTag();
  }
  renderSunArc();

  if (hourChanged) {
    /* Hour boundary: rebuild the heavier forecast section (chart + hourly
       blocks live in it after the v1.4 merge — re-render it only once). */
    SECTION_MANAGER.renderSection('forecast');
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

