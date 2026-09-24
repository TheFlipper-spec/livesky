#!/usr/bin/env node
/* ============================================================
   LiveSky — weather snapshot builder
   ------------------------------------------------------------
   Builds the app's same-origin fallback forecast: a compact copy of
   real Open-Meteo data for a handful of cities, published with the
   site so the dashboard can still show numbers when the visitor's
   network cannot reach api.open-meteo.com (blocked ISP, filtered
   DNS, hospital/office wifi, or a plain outage).

   Output:
     docs/data/snapshot.json           index (city list + file names)
     docs/data/snapshot/<slug>.json    provider-shaped payload per city

   Modes
     (default)        fetch fresh data from Open-Meteo
     --from-seed      rebuild from scripts/snapshot-seed/*.json
                      (offline edits / machines without provider access)

   Usage
     node scripts/build-snapshot.js
     node scripts/build-snapshot.js --from-seed
     node scripts/build-snapshot.js --base http://127.0.0.1:8099 \
                                    --air-base http://127.0.0.1:8099 \
                                    --cities "Казань:55.7963:49.1088:RU:Татарстан, Россия"

   Plain Node 18+ (global fetch), no dependencies.
   Data: Open-Meteo (CC BY 4.0).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'data');
const CITY_DIR = path.join(OUT_DIR, 'snapshot');
const SEED_DIR = path.join(__dirname, 'snapshot-seed');

/* Window sizes — keep them in sync with the web app's expectations:
   72 h of hourly detail (now + 2 days), 24 quarter-hour nowcast slots
   (6 h), 10 forecast days, 48 h of air quality. */
const HOURS = 72;
const MINUTE_SLOTS = 24;
const DAYS = 10;
const AIR_HOURS = 48;

const HOURLY_VARS = [
  'temperature_2m', 'apparent_temperature', 'weathercode', 'precipitation',
  'precipitation_probability', 'windspeed_10m', 'windgusts_10m',
  'winddirection_10m', 'relativehumidity_2m', 'surface_pressure',
  'dewpoint_2m', 'visibility', 'uv_index', 'is_day'
];
const DAILY_VARS = [
  'weathercode', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset',
  'precipitation_probability_max', 'precipitation_sum', 'uv_index_max',
  'windspeed_10m_max', 'winddirection_10m_dominant'
];
const MINUTELY_VARS = ['temperature_2m', 'precipitation', 'weather_code'];
const AIR_VARS = ['pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone', 'european_aqi'];

const HOURLY_UNITS = {
  time: 'iso8601', temperature_2m: '°C', apparent_temperature: '°C', weathercode: 'wmo code',
  precipitation: 'mm', precipitation_probability: '%', windspeed_10m: 'm/s', windgusts_10m: 'm/s',
  winddirection_10m: '°', relativehumidity_2m: '%', surface_pressure: 'hPa', dewpoint_2m: '°C',
  visibility: 'm', uv_index: '', is_day: ''
};
const DAILY_UNITS = {
  time: 'iso8601', weathercode: 'wmo code', temperature_2m_max: '°C', temperature_2m_min: '°C',
  sunrise: 'iso8601', sunset: 'iso8601', precipitation_probability_max: '%',
  precipitation_sum: 'mm', uv_index_max: '', windspeed_10m_max: 'm/s', winddirection_10m_dominant: '°'
};
const MINUTELY_UNITS = { time: 'iso8601', temperature_2m: '°C', precipitation: 'mm', weather_code: 'wmo code' };
const AIR_UNITS = {
  time: 'iso8601', pm2_5: 'μg/m³', pm10: 'μg/m³', nitrogen_dioxide: 'μg/m³',
  ozone: 'μg/m³', european_aqi: 'EAQI'
};

/* Cities fetched by default: the app's own default location plus the largest
   RU/CIS population centres, so a first-time visitor usually finds real
   numbers for their area. Add more with --cities "Name:lat:lon:CC:Region". */
const DEFAULT_CITIES = [
  { name: 'Москва', lat: 55.7558, lon: 37.6173, cc: 'RU', admin: 'Москва, Россия' },
  { name: 'Санкт-Петербург', lat: 59.9386, lon: 30.3141, cc: 'RU', admin: 'Санкт-Петербург, Россия' },
  { name: 'Казань', lat: 55.7963, lon: 49.1088, cc: 'RU', admin: 'Татарстан, Россия' }
];

/* Ranges used to sanity-check the numbers before they are published. A
   snapshot with a swapped column or a truncated array is worse than no
   snapshot, so anything out of range aborts the run. */
const RANGES = {
  temperature_2m: [-80, 60], apparent_temperature: [-90, 70], weathercode: [0, 99],
  precipitation: [0, 200], precipitation_probability: [0, 100], windspeed_10m: [0, 120],
  windgusts_10m: [0, 200], winddirection_10m: [0, 360], relativehumidity_2m: [0, 100],
  surface_pressure: [800, 1100], dewpoint_2m: [-90, 60], visibility: [0, 200000],
  uv_index: [0, 20], is_day: [0, 1],
  temperature_2m_max: [-80, 70], temperature_2m_min: [-90, 60], precipitation_sum: [0, 400],
  precipitation_probability_max: [0, 100], uv_index_max: [0, 20], windspeed_10m_max: [0, 150],
  winddirection_10m_dominant: [0, 360],
  weather_code: [0, 99], pm2_5: [0, 2000], pm10: [0, 3000],
  nitrogen_dioxide: [0, 2000], ozone: [0, 1000], european_aqi: [0, 500]
};

/* ---------------------------- cli ---------------------------- */
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const FROM_SEED = process.argv.includes('--from-seed');
const BASE_FORECAST = arg('base', 'https://api.open-meteo.com');
const BASE_AIR = arg('air-base', BASE_FORECAST === 'https://api.open-meteo.com'
  ? 'https://air-quality-api.open-meteo.com' : BASE_FORECAST);

const slugify = (name) => name.toLowerCase()
  .replace(/[а-яё]/gi, (ch) => {
    const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
    return map[ch.toLowerCase()] || '';
  })
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'city';

/* --------------------- time array helpers -------------------- */
const pad = (n) => String(n).padStart(2, '0');
function stamp(baseIso, addMinutes) {
  const d = new Date(baseIso.replace(' ', 'T') + (baseIso.length <= 16 ? ':00Z' : 'Z'));
  const t = new Date(d.getTime() + addMinutes * 60000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
function dateStamp(baseDate, addDays) {
  const d = new Date(baseDate + 'T00:00:00Z');
  const t = new Date(d.getTime() + addDays * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/* ------------------------ validation ------------------------- */
function checkSeries(label, series, vars, len, optional) {
  for (const v of vars) {
    const arr = series && series[v];
    if (!arr) {
      if (v === 'sunrise' || v === 'sunset') { if (optional) continue; }
      throw new Error(`${label}: missing series "${v}"`);
    }
    if (arr.length !== len) throw new Error(`${label}: "${v}" has ${arr.length} values, expected ${len}`);
    const range = RANGES[v];
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (typeof n !== 'number' && !(v === 'sunrise' || v === 'sunset')) {
        throw new Error(`${label}: "${v}[${i}]" is not a number (${JSON.stringify(n)})`);
      }
      if (range && (n < range[0] || n > range[1])) {
        throw new Error(`${label}: "${v}[${i}]" = ${n} is outside ${range[0]}..${range[1]}`);
      }
    }
  }
}
function validateSeed(seed) {
  const who = `${seed.name} (${seed.slug})`;
  if (!Number.isFinite(seed.lat) || !Number.isFinite(seed.lon)) throw new Error(`${who}: bad coordinates`);
  if (!seed.start || !seed.start.hourly) throw new Error(`${who}: missing start.hourly`);
  checkSeries(who + ' hourly', seed.hourly, HOURLY_VARS, HOURS);
  checkSeries(who + ' minutely', seed.minutely_15, MINUTELY_VARS, MINUTE_SLOTS);
  checkSeries(who + ' daily', seed.daily, DAILY_VARS, DAYS);
  if (seed.air) checkSeries(who + ' air', seed.air, AIR_VARS, AIR_HOURS); /* air quality is optional */
  for (let i = 0; i < DAYS; i++) {
    if (!/^\d\d:\d\d$/.test(seed.daily.sunrise[i])) throw new Error(`${who}: sunrise[${i}] not HH:MM`);
    if (!/^\d\d:\d\d$/.test(seed.daily.sunset[i])) throw new Error(`${who}: sunset[${i}] not HH:MM`);
  }
}

/* ------------------------- assembly ------------------------- */
function assemble(seed) {
  validateSeed(seed);
  const hourly = { time: Array.from({ length: HOURS }, (_, i) => stamp(seed.start.hourly, i * 60)) };
  for (const v of HOURLY_VARS) hourly[v] = seed.hourly[v].slice();

  const minutely = { time: Array.from({ length: MINUTE_SLOTS }, (_, i) => stamp(seed.start.minutely, i * 15)) };
  for (const v of MINUTELY_VARS) minutely[v] = seed.minutely_15[v].slice();

  const daily = { time: Array.from({ length: DAYS }, (_, i) => dateStamp(seed.start.daily, i)) };
  for (const v of DAILY_VARS) {
    daily[v] = seed.daily[v].slice();
    if (v === 'sunrise' || v === 'sunset') daily[v] = daily[v].map((hm, i) => `${daily.time[i]}T${hm}`);
  }

  let air = null;
  if (seed.air) {
    const airHourly = { time: Array.from({ length: AIR_HOURS }, (_, i) => stamp(seed.start.air, i * 60)) };
    for (const v of AIR_VARS) airHourly[v] = seed.air[v].slice();
    air = {
      latitude: seed.lat, longitude: seed.lon, timezone: seed.timezone || 'auto',
      hourly_units: AIR_UNITS, hourly: airHourly
    };
  }

  return {
    generated: seed.generated,
    name: seed.name, cc: seed.cc, admin: seed.admin,
    lat: seed.lat, lon: seed.lon,
    forecast: {
      latitude: seed.lat, longitude: seed.lon, timezone: seed.timezone || 'auto',
      elevation: seed.elevation != null ? seed.elevation : null,
      utc_offset_seconds: seed.utc_offset_seconds != null ? seed.utc_offset_seconds : null,
      hourly_units: HOURLY_UNITS, hourly,
      daily_units: DAILY_UNITS, daily,
      minutely_15_units: MINUTELY_UNITS, minutely_15: minutely
    },
    air
  };
}

/* --------------------------- fetch --------------------------- */
async function getJson(url, tries) {
  let lastErr;
  for (let i = 0; i < (tries || 3); i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'LiveSky-snapshot/1.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastErr;
}
const qs = (o) => new URLSearchParams(o).toString();

async function fetchSeed(city) {
  /* Same shape as a seed file, but pulled from the provider. */
  const hourly = await getJson(`${BASE_FORECAST}/v1/forecast?${qs({
    latitude: city.lat, longitude: city.lon,
    hourly: HOURLY_VARS.join(','),
    minutely_15: MINUTELY_VARS.join(','),
    forecast_minutely_15: String(MINUTE_SLOTS),
    wind_speed_unit: 'ms', timezone: 'auto', forecast_days: '3', models: 'best_match'
  })}`);
  const daily = await getJson(`${BASE_FORECAST}/v1/forecast?${qs({
    latitude: city.lat, longitude: city.lon,
    daily: DAILY_VARS.join(','),
    wind_speed_unit: 'ms', timezone: 'auto', forecast_days: String(DAYS), models: 'best_match'
  })}`);
  if (!hourly.hourly || !hourly.minutely_15 || !daily.daily) throw new Error('provider payload missing hourly/minutely/daily');

  const air = await getJson(`${BASE_AIR}/v1/air-quality?${qs({
    latitude: city.lat, longitude: city.lon,
    hourly: AIR_VARS.join(','), timezone: 'auto', forecast_days: '2'
  })}`).catch(() => null);

  const cut = (obj, vars, len) => {
    const out = {};
    for (const v of vars) {
      const arr = obj[v] || [];
      out[v] = arr.slice(0, len);
      if (out[v].length !== len) throw new Error(`${city.name}: provider returned ${out[v].length} of ${len} values for ${v}`);
    }
    return out;
  };
  const seed = {
    name: city.name, slug: slugify(city.name), cc: city.cc || '', admin: city.admin || '',
    lat: city.lat, lon: city.lon,
    timezone: hourly.timezone || 'auto',
    elevation: hourly.elevation != null ? hourly.elevation : daily.elevation,
    utc_offset_seconds: hourly.utc_offset_seconds,
    generated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    start: {
      hourly: hourly.hourly.time[0],
      minutely: hourly.minutely_15.time[0],
      daily: daily.daily.time[0],
      air: air && air.hourly ? air.hourly.time[0] : hourly.hourly.time[0]
    },
    hourly: cut(hourly.hourly, HOURLY_VARS, HOURS),
    minutely_15: cut(hourly.minutely_15, MINUTELY_VARS, MINUTE_SLOTS),
    daily: (() => {
      const out = {};
      for (const v of DAILY_VARS) {
        const arr = daily.daily[v] || [];
        out[v] = v === 'sunrise' || v === 'sunset'
          ? arr.slice(0, DAYS).map((s) => String(s).slice(11, 16))
          : arr.slice(0, DAYS);
        if (out[v].length !== DAYS) throw new Error(`${city.name}: provider returned ${out[v].length} of ${DAYS} values for ${v}`);
      }
      return out;
    })(),
    air: air && air.hourly ? cut(air.hourly, AIR_VARS, AIR_HOURS) : null
  };
  /* Air quality is decorative and not always available; fall back to zeros-free
     "unavailable" by duplicating nothing — the app hides the card when the
     snapshot has no air block. */
  return seed;
}

function loadSeeds() {
  const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) throw new Error(`no seed files in ${SEED_DIR}`);
  return files.map((f) => {
    const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf8'));
    seed.slug = path.basename(f, '.json');
    return seed;
  });
}

function parseCities() {
  const raw = arg('cities', process.env.SNAPSHOT_CITIES || '');
  if (!raw.trim()) return DEFAULT_CITIES;
  return raw.split(';').map((entry) => {
    const [name, lat, lon, cc, admin] = entry.split(':');
    return { name: name.trim(), lat: +lat, lon: +lon, cc: (cc || '').trim(), admin: (admin || '').trim() };
  }).filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

/* ---------------------------- main --------------------------- */
async function main() {
  fs.mkdirSync(CITY_DIR, { recursive: true });
  const sources = FROM_SEED ? loadSeeds() : [];
  if (!FROM_SEED) {
    for (const city of parseCities()) {
      try {
        sources.push(await fetchSeed(city));
      } catch (e) {
        console.warn(`[snapshot] ${city.name}: FAILED — ${e && e.message}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!sources.length) {
    console.error('[snapshot] nothing to publish — keeping the previous snapshot');
    process.exit(1);
  }

  const index = {
    generated: sources.map((s) => s.generated).sort().pop(),
    generator: 'livesky-weather-snapshot/1',
    source: 'Open-Meteo (CC BY 4.0)',
    cities: []
  };
  for (const seed of sources) {
    const payload = assemble(seed);
    const file = path.join(CITY_DIR, seed.slug + '.json');
    fs.writeFileSync(file, JSON.stringify(payload));
    index.cities.push({
      name: payload.name, cc: payload.cc, admin: payload.admin,
      lat: payload.lat, lon: payload.lon, slug: seed.slug,
      generated: payload.generated, file: `data/snapshot/${seed.slug}.json`
    });
    console.log(`[snapshot] ${payload.name}: ok (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'snapshot.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`[snapshot] ${index.cities.length} cities → docs/data/snapshot.json (generated ${index.generated})`);
}

main().catch((e) => { console.error('[snapshot] fatal:', e && e.message ? e.message : e); process.exit(1); });
