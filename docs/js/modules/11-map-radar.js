/* ============================================================
   LiveSky — map & precipitation (LAZY subsystem, v1.4)
   ------------------------------------------------------------
   This file is NOT part of the initial page load. It is injected
   by the LiveSkyMap facade in 10-bootstrap.js on the first real
   map/radar interaction and registers its implementation back
   with the loader, so it is fetched and executed exactly once.

   It is a classic script that shares the global lexical scope of
   modules 01-10 and therefore only executes after they have run
   (the loader guarantees this). All map/radar UI handlers are
   bound here exactly once, when the module first executes.

   Precipitation model (all free, no API keys, worldwide):
     1. NASA GIBS IMERG (public domain, GPM 30-min precipitation,
        global incl. Russia) — the global observation base layer.
     2. RainViewer radar (free, station-grade detail where radar
        networks exist) — blended on top of the satellite base in
        "auto" mode, so regions without radar stations (e.g. most
        of Russia) still show IMERG instead of empty space.
     3. LiveSky's own short-range nowcast: the client estimates the
        motion of the last two IMERG fields (hierarchical block
        matching) and advects the latest field forward (+3 h max).
        It is always labelled as an extrapolation, never as a model.

   The timeline is anchored to the real wall clock (now − 6 h →
   now + 90 min, 30-min steps). Every step is resolved to the
   best available provider; when the provider's data is older than
   the step, the data time is shown in #radar-time and the badge
   marks the layer as "past" — nothing is ever silently relabeled.
   ============================================================ */

/* ---------------- maps (MapLibre GL, free no-key vector basemap) ---------------- */
let mapInst = null, mapMarkEl = null, smallMapFallback = false;
let fullMapInst = null, fullMapPending = false, fullMarkEl = null, fullMapFallback = false;
let tempLat = null, tempLon = null;

/* Free, no-API-key vector basemap (OpenFreeMap — public instance, unlimited
   requests, no registration, no watermark). CARTO's raster basemaps now
   require a paid API key, so they are no longer usable here. */
function mapStyle() {
  return state.theme === 'light'
    ? 'https://tiles.openfreemap.org/styles/positron'
    : 'https://tiles.openfreemap.org/styles/dark';
}
/* last-resort fallback if the vector style ever fails to load: plain OSM raster tiles. */
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
    mapInst.on('error', (ev) => {
      /* Only the basemap decides the fallback — never precipitation tiles. */
      if (ev && ev.sourceId && String(ev.sourceId).startsWith('precip')) return;
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
  const openZoom = RADAR.active ? 6 : 10;
  if (!fullMapInst && !fullMapPending) {
    fullMapPending = true;
    setTimeout(() => {
      fullMapPending = false;
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
        fullMapInst.on('load', () => {
          fullMapInst.on('click', (e) => {
            if (fullMapInst._liveskyDragging) return;
            tempLat = e.lngLat.lat; tempLon = e.lngLat.lng;
            if (fullMarkEl) fullMarkEl.setLngLat([tempLon, tempLat]);
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
          /* Only fall back the basemap — ignore missing precip tile noise. */
          if (e && e.sourceId && String(e.sourceId).startsWith('precip')) return;
          const msg = String((e && e.error && ((e.error.message || '') + ' ' + (e.error.status || ''))) || '');
          if (/radar|imerg|gibs|precip/i.test(msg)) return;
          if (!fullMapFallback) { fullMapFallback = true; try { fullMapInst.setStyle(osmStyle()); } catch (err) { /* ignore */ } }
        });
        fullMapInst.resize();
      } catch (e) { console.warn('LiveSky: full map init failed', e); }
    }, 320);
  } else if (fullMapInst) {
    /* Don't yank zoom back to 10 if the user was inspecting precip. */
    const z = RADAR.active ? Math.min(fullMapInst.getZoom(), 7) : Math.max(fullMapInst.getZoom(), 9);
    fullMapInst.flyTo({ center: [state.lon, state.lat], zoom: z, duration: 500 });
    if (fullMarkEl) fullMarkEl.setLngLat([state.lon, state.lat]);
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
  if (fullMapInst) { try { fullMapInst.stop(); } catch (e) { /* ignore */ } }
  /* Pause animation while the map is hidden — saves tiles + battery. State stays. */
  RADAR.pause();
}
async function applyMapLocation() {
  if (tempLat == null || tempLon == null) return;
  const lat = tempLat, lon = tempLon;
  tempLat = null; tempLon = null;
  closeFullMap();
  const seq = ++state.locSeq; /* a manual map pick always wins over any slower, older request */
  state.lat = lat; state.lon = lon;
  showLoader();
  await reverseGeo(state.lat, state.lon);
  if (seq !== state.locSeq) return; /* the user already moved on to a different city */
  toast(t('toast_loc_set'), 'success');
  fetchWeather();
}

/* ============================================================
   Custom MapLibre protocol: fetches/renders precipitation tiles
   for the active frame (satellite / radar / our nowcast).
   MapLibre expects a promise of { data: ImageBitmap }.
   ============================================================ */
const PRECIP_PROTOCOL = 'precip';
/* Runtime identity — the loader compares this stamp and re-injects the module
   if a stale cached copy managed to sneak in (the "still squares" bug). */
const PRECIP_ENGINE_VERSION = 'precip-engine-v13';
window.__liveskyPrecipVersion = PRECIP_ENGINE_VERSION;

/* Quality knob: phones / weak machines get cheaper tiles + less blurring.
   state._perfLow is maintained by the FPS watchdog in 07-effects.js. */
function precipLowDevice() {
  if (state && state._perfLow) return true;
  try {
    const cores = navigator.hardwareConcurrency || 8;
    const mem = navigator.deviceMemory || 8;
    return cores <= 4 || mem <= 4;
  } catch (e) { return false; }
}
const PRECIP_LOW = precipLowDevice();

const tileCache = new Map(); /* url -> Promise<{data: ImageBitmap}> */
/* Phones must not hold ~50 MB of decoded 256px bitmaps. */
const TILE_CACHE_MAX = PRECIP_LOW ? 48 : 96;
function cacheGet(url) { return tileCache.get(url); }
function cachePut(url, promise) {
  if (tileCache.size >= TILE_CACHE_MAX) {
    const first = tileCache.keys().next().value;
    if (first != null) tileCache.delete(first);
  }
  tileCache.set(url, promise);
}
const transparentP = (function () {
  let p = null;
  return () => {
    if (!p) {
      p = (async () => {
        const c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        return { data: await createImageBitmap(c) };
      })();
    }
    return p;
  };
})();

/* Soften a precipitation tile before MapLibre paints it. Raw provider tiles are
   hard-edged coloured cells (GIBS IMERG 0.1° blocks, our own nowcast pixels) —
   at low zoom they render as blocky confetti, not precipitation. The tile is
   mipmapped down to 32–40px, alpha-premultiplied blurred with 4–7 box passes,
   and scaled back up with high-quality smoothing → soft cloud blobs instead
   of coloured squares. Low devices use a smaller buffer and fewer passes. */
async function softenTile(src, passes) {
  try {
    const bmp = src instanceof ImageBitmap ? src : await createImageBitmap(src);
    const SIZE = PRECIP_LOW ? 32 : 40;
    const small = document.createElement('canvas');
    small.width = SIZE; small.height = SIZE;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(bmp, 0, 0, SIZE, SIZE);
    const blurred = blurRgba(sctx.getImageData(0, 0, SIZE, SIZE), SIZE, SIZE, passes || (PRECIP_LOW ? 4 : 7));
    sctx.putImageData(blurred, 0, 0);
    const out = document.createElement('canvas');
    out.width = 256; out.height = 256;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(small, 0, 0, 256, 256);
    if (bmp.close) bmp.close();
    return createImageBitmap(out);
  } catch (e) {
    /* smoothing is an enhancement — never break the tile on canvas limits */
    return src instanceof ImageBitmap ? src : null;
  }
}
/* Multi-pass 3×3 blur done properly for straight-alpha images: colour is
   averaged weighted by alpha so blob edges blur into faint mist instead of
   dark/black halos. 40×40 = 1.6k pixels, runs once per tile — cheap. */
function blurRgba(imgData, w, h, passes) {
  const src = imgData.data;
  const out = new Uint8ClampedArray(src);
  for (let pass = 0; pass < (passes || 5); pass++) {
    const cur = new Uint8ClampedArray(out);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let ar = 0, ag = 0, ab = 0, aa = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const o = (yy * w + xx) * 4;
            const a = cur[o + 3];
            ar += cur[o] * a; ag += cur[o + 1] * a; ab += cur[o + 2] * a;
            aa += a; n++;
          }
        }
        const o = (y * w + x) * 4;
        if (aa > 0) { out[o] = ar / aa; out[o + 1] = ag / aa; out[o + 2] = ab / aa; }
        out[o + 3] = aa / n;
      }
    }
  }
  return { data: out, width: w, height: h };
}

function precipHandler(params, abort) {
  const url = params.url || '';
  const m = url.match(/^precip:\/\/(sat|radar|now)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/);
  if (!m) return transparentP();
  const kind = m[1], key = decodeURIComponent(m[2]);
  const z = +m[3], x = +m[4], y = +m[5];

  if (kind === 'now') {
    /* Own extrapolation, generated client-side — no third-party call. */
    if (!NOWCAST.active) return transparentP();
    const cached = cacheGet(url);
    if (cached) return cached;
    const p = NOWCAST.tile(z, x, y, +key).then(bmp => ({ data: bmp }), () => transparentP());
    cachePut(url, p);
    return p;
  }

  const fetchUrl = kind === 'sat' ? SAT.tileUrl(key, z, x, y)
    : kind === 'radar' ? RADAR.tileUrlByPath(key, z, x, y)
    : '';
  if (!fetchUrl) return transparentP();
  const cached = cacheGet(url);
  if (cached) return cached;
  const p = (async () => {
    try {
      const r = await fetchWithTimeout(fetchUrl, 15000);
      if (abort && abort.signal && abort.signal.aborted) return transparentP();
      if (!r.ok) throw new Error('precip ' + r.status + ' ' + kind);
      const blob = await r.blob();
      if (blob.size < 80) return transparentP(); /* empty/identical tiles */
      /* RainViewer already renders soft cloud blobs — use it as-is.
         Only IMERG (coarse 0.1° cells) gets our cloud smoothing. */
      if (kind === 'radar') return { data: await createImageBitmap(blob) };
      const soft = await softenTile(blob);
      if (!soft) return { data: await createImageBitmap(blob) };
      return { data: soft };
    } catch (e) {
      console.warn('LiveSky precip tile', e && e.message);
      return transparentP();
    }
  })();
  cachePut(url, p);
  return p;
}

/* ---------------- NASA GIBS IMERG (global satellite precipitation) --------------- */
/* WMTS REST:
   https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tms}/{z}/{y}/{x}.png
   Public domain NASA data, no key, CORS enabled, ~3-5 h latency, 30-min frames. */
const SAT = {
  base: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
  layer: 'IMERG_Precipitation_Rate_30min',
  /* Verified against GIBS capacities: on epsg3857/best this layer is only
     published in the GoogleMapsCompatible_Level6 tile matrix (Level7/8 return
     "TILEMATRIXSET is invalid for LAYER"). 0.1° data → overzoom is fine. */
  tms: 'GoogleMapsCompatible_Level6',
  maxZoom: 6, /* tiles stop at z6; MapLibre overzooms from there */
  times: [],            /* available ISO timestamps, oldest → newest */
  latest: null,         /* newest available ISO */
  latestEpoch: 0,       /* seconds */
  probeSeq: 0,
  ready: false,

  tileUrl(time, z, x, y) {
    const t = encodeURIComponent(time);
    return `${this.base}/${this.layer}/default/${t}/${this.tms}/${z}/${y}/${x}.png`;
  },
  /* Probe whether a 30-min step exists (cheap: one world tile, z0). */
  async probe(time) {
    try {
      const r = await fetchWithTimeout(this.tileUrl(time, 0, 0, 0), 9000);
      const len = r.headers.get('content-length');
      return r.ok && len !== '0';
    } catch (e) { return false; }
  },
  /* Discover the latest N available 30-min frames. IMERG lands a few hours
     behind "now"; scan 16 half-hour steps back, probing in parallel. */
  async discover(count) {
    const gen = ++this.probeSeq;
    const stepMs = 30 * 60 * 1000;
    const floor = Math.floor(Date.now() / stepMs) * stepMs;
    const candidates = [];
    for (let k = 0; k < 16; k++) candidates.push(new Date(floor - k * stepMs));
    const results = await Promise.all(candidates.map(d => this.probe(d.toISOString().replace(/\.\d{3}Z$/, 'Z'))));
    if (gen !== this.probeSeq) return false;
    const times = candidates.filter((d, i) => results[i]).map(d => d.toISOString().replace(/\.\d{3}Z$/, 'Z'));
    times.reverse(); /* oldest → newest */
    if (!times.length) return false;
    this.times = times.slice(-(count || 8));
    this.latest = this.times[this.times.length - 1];
    this.latestEpoch = Date.parse(this.latest) / 1000;
    this.ready = true;
    return true;
  },
  /* Cheap incremental refresh once the frame list is known: probe exactly the
     next 30-min candidate instead of re-scanning 16 tiles every 2 minutes. */
  async refreshLatest() {
    if (!this.ready || !this.latest) return false;
    const gen = this.probeSeq;
    const next = new Date((this.latestEpoch + 1800) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const ok = await this.probe(next);
    if (gen !== this.probeSeq) return false;
    if (!ok) return false;
    this.times.push(next);
    if (this.times.length > 9) this.times.shift();
    const changed = this.latest !== next;
    this.latest = next;
    this.latestEpoch += 1800;
    return changed;
  },
  /* Nearest available sat frame at/before the given epoch (seconds). */
  nearestIndex(epochSec) {
    let idx = -1;
    for (let k = 0; k < this.times.length; k++) {
      if (Date.parse(this.times[k]) / 1000 <= epochSec) idx = k;
      else break;
    }
    return idx;
  },
  /* Sample precipitation intensity (0..25 mm/h approx) at lat/lon for a frame. */
  async sampleAt(time, lat, lon) {
    if (!this.ready || !time) return null;
    try {
      const z = this.maxZoom;
      const n = Math.pow(2, z);
      const x = Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
      const latRad = lat * Math.PI / 180;
      const y = Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)));
      const r = await fetchWithTimeout(this.tileUrl(time, z, x, y), 12000);
      if (!r.ok) return null;
      const blob = await r.blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const tz = n * 256;
      const px = Math.floor(((lon + 180) / 360) * tz - x * 256);
      const latRad2 = lat * Math.PI / 180;
      const py = Math.floor(((1 - Math.log(Math.tan(latRad2) + 1 / Math.cos(latRad2)) / Math.PI) / 2) * tz - y * 256);
      const d = ctx.getImageData(Math.min(bmp.width - 1, Math.max(0, px)), Math.min(bmp.height - 1, Math.max(0, py)), 1, 1).data;
      if (d[3] < 8) return 0;
      return rateFromColor(d);
    } catch (e) { return null; }
  }
};

/* GIBS IMERG palette → approximate precipitation rate (mm/h).
   Green → yellow → orange → red → magenta = increasing rain;
   blue/cyan/purple = snow (liquid-equivalent, capped low). */
function rateFromColor(rgba) {
  const [r, g, b, a] = rgba;
  if (a < 8) return 0;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const blueish = b > r && b > g;
  const intensity = blueish ? (lum / 255) * 0.5 : lum / 255;
  return Math.max(0.08, Math.min(25, 0.08 + intensity * intensity * 24));
}
/* Continuous precipitation palette, matched to RainViewer's look so our
   nowcast blends with the radar overlay: faint mist → cyan → green → yellow
   → orange → red → magenta. Colours are interpolated in log-space, never
   stepped, so a cloud fades through the ramp smoothly instead of showing
   hard colour bands. */
const PRECIP_STOPS = [
  [0.05, 30, 144, 255],   /* light rain — blue mist, like the radar layer */
  [0.18, 0, 190, 255],    /* cyan  */
  [0.5, 45, 215, 110],    /* green */
  [1.3, 245, 205, 45],    /* yellow */
  [3, 255, 150, 40],      /* orange */
  [8, 240, 62, 50],       /* red   */
  [18, 200, 70, 220]      /* magenta, extreme */
];
function rainColor(rate) {
  const r = Math.max(0.05, Math.min(25, rate));
  const lg = Math.log10(r);
  let a = PRECIP_STOPS[0], b = PRECIP_STOPS[PRECIP_STOPS.length - 1];
  for (let i = 0; i < PRECIP_STOPS.length - 1; i++) {
    if (lg <= Math.log10(PRECIP_STOPS[i + 1][0])) { a = PRECIP_STOPS[i]; b = PRECIP_STOPS[i + 1]; break; }
  }
  const fa = Math.log10(a[0]), fb = Math.log10(b[0]);
  const u = fb > fa ? (lg - fa) / (fb - fa) : 0;
  return [
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
    Math.round(a[3] + (b[3] - a[3]) * u)
  ];
}
/* Smooth alpha ramp: edges of a cloud fade into mist instead of a hard cut.
   t is the rate in mm/h; conf ≤ 1 fades long extrapolations. */
function rainAlpha(rate, conf) {
  const t = Math.max(0, Math.min(1, (rate - 0.035) / 0.5));
  const s = t * t * (3 - 2 * t); /* smoothstep */
  return Math.round((0.08 + 0.72 * s) * conf * 255);
}

/* ---------------- precipitation layer manager ---------------- */
/* Two raster pairs:
     base-a/base-b — IMERG satellite (or our nowcast);
     radar-a/radar-b — RainViewer radar, blended above the base in "auto",
     and the only layer in "radar" mode.
   Each pair cross-fades on frame change so the map never flashes blank. */
const RADAR = {
  frames: [], idx: -1, nowIdx: -1, playing: false, playTimer: null,
  layerReady: false, active: false, opacity: 0.78,
  speed: 700, host: 'https://tilecache.rainviewer.com', lastMetaTs: 0, refreshTimer: null,
  front: 0, radarFront: 0,
  loadGen: 0, styleHooked: false,
  source: 'auto', /* auto | sat | radar */
  timeline: [],
  etaGen: 0,

  /* steps: wall-clock now − 6 h … now + 6 h, every 30 min.
     IMERG observations arrive with a 3-5 h latency, so the newest data can be
     hours old — the extrapolation horizon (NOWCAST_MAX_MIN) is measured from
     the wall-clock step to the newest observation and must cover the whole
     future part of the timeline, or the forecast steps would just repeat the
     newest satellite frame with a "past" badge. */
  TIMELINE_PAST_H: 6,
  TIMELINE_FUTURE_MIN: 360,
  NOWCAST_MAX_MIN: 480, /* data-time offset at which we stop extrapolating */

  baseSrcId(i) { return i === 0 ? 'precip-base-a' : 'precip-base-b'; },
  baseLayerId(i) { return i === 0 ? 'precip-base-a' : 'precip-base-b'; },
  radarSrcId(i) { return i === 0 ? 'precip-radar-a' : 'precip-radar-b'; },
  radarLayerId(i) { return i === 0 ? 'precip-radar-a' : 'precip-radar-b'; },

  tileSize() { return 256; },
  /* RainViewer tile URL; tiles exist only through z7. */
  tileUrlByPath(path, z, x, y) {
    if (z > 7 || !path || path === 'null') return '';
    return `${this.host}${path}/${this.tileSize()}/{z}/{x}/{y}/2/1_1.png`
      .replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  },

  async load(silent) {
    const gen = ++this.loadGen;
    if (!silent) this.showLoading(true);
    try {
      /* RainViewer availability is independent of IMERG. */
      try {
        const rv = await fetchWithTimeout('https://api.rainviewer.com/public/weather-maps.json', 12000);
        if (rv.ok && gen === this.loadGen) {
          const d = await rv.json();
          if (gen !== this.loadGen) return;
          const past = (d.radar && d.radar.past) || [];
          const nowcast = (d.radar && d.radar.nowcast) || [];
          this.host = d.host || this.host;
          this.frames = past.concat(nowcast).map((f, i) => ({
            time: f.time, path: f.path,
            url: (d.host || this.host) + f.path,
            kind: i < past.length ? (i === past.length - 1 ? 'now' : 'past') : 'forecast'
          }));
          this.nowIdx = Math.max(0, past.length - 1);
        }
      } catch (e) { /* RainViewer down — IMERG still covers the world */ }

      /* IMERG discovery drives the global timeline, but the timeline itself
         is wall-clock — if the satellite service is briefly unavailable the
         radar frames (or nothing) are shown rather than freezing the UI. */
      let satChanged = false;
      if (SAT.ready) satChanged = await SAT.refreshLatest();
      else satChanged = await SAT.discover(9);
      if (gen !== this.loadGen) return;
      if (!SAT.ready && !this.frames.length) {
        if (!silent) toast(t('toast_network'), 'error');
        return;
      }
      this.lastMetaTs = Date.now();
      this.buildTimeline();
      if (this.idx < 0 || this.idx >= this.timeline.length) this.idx = this.nowTickIndex();
      if (this.active) {
        this.ensureLayers();
        this.renderFrame(true);
        if (!this.layerReady) this.retryUntilReady();
      }
      /* A new observation arrived → re-run the motion estimate on the fresh pair. */
      if (satChanged && NOWCAST.active) NOWCAST.prep(true);
      this.scheduleAutoRefresh();
      /* Nowcast prep is fire-and-forget: the map works with observations while it runs. */
      this.prepNowcast();
    } catch (e) {
      console.warn('LiveSky precip load failed', e);
      if (!silent) toast(t('toast_network'), 'error');
    } finally {
      if (gen === this.loadGen && !silent) this.showLoading(false);
    }
  },

  /* 30-min steps anchored to the real wall clock. */
  buildTimeline() {
    const stepMs = 30 * 60 * 1000;
    const nowMs = Math.floor(Date.now() / stepMs) * stepMs;
    const start = nowMs - this.TIMELINE_PAST_H * 3600 * 1000;
    const end = nowMs + this.TIMELINE_FUTURE_MIN * 60 * 1000;
    const steps = [];
    for (let t = start; t <= end + 1; t += stepMs) steps.push(t);
    this.timeline = steps.map(t => ({ t: t / 1000, epochMs: t }));
    if (el.radarSlider) {
      el.radarSlider.max = String(Math.max(0, this.timeline.length - 1));
      el.radarSlider.value = String(Math.max(0, this.idx));
    }
    this.updateTime();
  },

  /* Resolve a timeline step to the frames actually shown.
     base = sat | now | null, radar = radar frame | null. */
  frameOut(step) {
    const t = step.t;
    let satIdx = SAT.nearestIndex(t);
    if (satIdx < 0 && SAT.times.length) satIdx = 0; /* before the sat run: show its start */
    const latestEpoch = SAT.latestEpoch;
    let base = null;

    if (this.source !== 'radar') {
      if (satIdx >= 0 && t <= latestEpoch + 60) {
        base = { kind: 'sat', key: SAT.times[satIdx], time: Date.parse(SAT.times[satIdx]) / 1000 };
      } else if (satIdx >= 0) {
        /* Step is newer than the newest observation. Use our own extrapolation
           for the next 3 h of DATA-time; afterwards show the newest frame as-is
           (it is the best global truth we have — and the UI shows its age). */
        const mins = Math.round((t - latestEpoch) / 60);
        if (mins <= this.NOWCAST_MAX_MIN && NOWCAST.active) {
          base = { kind: 'now', key: String(Math.max(15, mins)), time: t };
        } else {
          base = { kind: 'sat', key: SAT.times[satIdx], time: latestEpoch };
        }
      }
    }

    let radar = null;
    const rIdx = this.nearestRadar(t, this.source === 'radar');
    if (this.source === 'radar') {
      if (rIdx >= 0) radar = { kind: 'radar', key: this.frames[rIdx].path, time: this.frames[rIdx].time };
      return { base: null, radar, satIdx: -1 };
    }
    if (this.source === 'auto' && rIdx >= 0) {
      radar = { kind: 'radar', key: this.frames[rIdx].path, time: this.frames[rIdx].time };
    }
    return { base, radar, satIdx };
  },
  /* Latest radar frame with time ≤ t and within radar cadence (10-min frames).
     In radar-only mode we are looser: any frame no older than 6 h is shown so
     the user sees the nearest available frame instead of a blank map. */
  nearestRadar(t, loose) {
    if (!this.frames.length) return -1;
    let idx = -1;
    for (let k = 0; k < this.frames.length; k++) {
      if (this.frames[k].time <= t) idx = k;
      else break;
    }
    if (idx < 0) {
      if (!loose) return -1;
      return 0; /* step is before the whole radar run — show its start */
    }
    if (t - this.frames[idx].time > (loose ? 6 * 3600 : 25 * 60)) {
      if (!loose) return -1;
      let best = idx, bestGap = t - this.frames[idx].time;
      for (let k = idx; k < this.frames.length; k++) {
        const gap = Math.abs(this.frames[k].time - t);
        if (gap < bestGap) { bestGap = gap; best = k; }
      }
      return best;
    }
    return idx;
  },

  /* ---------------- map layers ---------------- */
  mapReady() {
    return !!(fullMapInst && window.maplibregl && (!fullMapInst.isStyleLoaded || fullMapInst.isStyleLoaded()));
  },
  ensureLayers() {
    if (!fullMapInst || !this.timeline.length || this.idx < 0 || this.idx >= this.timeline.length) return false;
    if (!this.mapReady()) return false;
    const out = this.frameOut(this.timeline[this.idx]);
    if (!out.base && !out.radar) return false;
    try {
      /* base pair — always present so cross-fade never creates a gap */
      const baseTpl = this.tileTemplate(out.base ? out.base.kind : 'sat', out.base ? out.base.key : SAT.latest || 'null');
      for (let i = 0; i < 2; i++) {
        const sid = this.baseSrcId(i), lid = this.baseLayerId(i);
        if (!fullMapInst.getSource(sid)) {
          fullMapInst.addSource(sid, {
            type: 'raster', tiles: [baseTpl], tileSize: 256,
            minzoom: 0, maxzoom: this.tileMaxZoom(out.base && out.base.kind),
            attribution: 'NASA GPM IMERG'
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
      /* radar pair only when a radar frame is part of this step */
      if (out.radar) this.ensureRadarPair();
      this.layerReady = true;
      this.hookStyle();
      return true;
    } catch (e) {
      console.warn('LiveSky precip ensureLayers', e);
      return false;
    }
  },
  tileMaxZoom(kind) { return kind === 'now' ? 8 : kind === 'sat' ? SAT.maxZoom : 7; },
  ensureRadarPair() {
    if (!fullMapInst) return;
    const tpl = this.tileTemplate('radar', this.frameOut(this.timeline[this.idx]).radar ? this.frameOut(this.timeline[this.idx]).radar.key : 'null');
    for (let i = 0; i < 2; i++) {
      const sid = this.radarSrcId(i), lid = this.radarLayerId(i);
      if (!fullMapInst.getSource(sid)) {
        fullMapInst.addSource(sid, {
          type: 'raster', tiles: [tpl], tileSize: 256,
          minzoom: 0, maxzoom: 7, attribution: '© RainViewer'
        });
      }
      if (!fullMapInst.getLayer(lid)) {
        fullMapInst.addLayer({
          id: lid, type: 'raster', source: sid,
          paint: {
            'raster-opacity': 0,
            'raster-opacity-transition': { duration: 0 },
            'raster-fade-duration': 0,
            'raster-resampling': 'linear'
          }
        });
      }
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
  tileTemplate(kind, key) {
    return `precip://${kind}/${encodeURIComponent(key || 'null')}/{z}/{x}/{y}`;
  },

  /* hard=true seeds both buffers (first paint / rebuild); false cross-fades. */
  renderFrame(hard) {
    if (!this.framesReady() || this.idx < 0 || this.idx >= this.timeline.length) return;
    const step = this.timeline[this.idx];
    const out = this.frameOut(step);
    if (!fullMapInst) { this.updateChrome(); return; }
    if (!this.layerReady && !this.ensureLayers()) { this.updateChrome(); return; }
    if (!out.base && !out.radar) { this.clearLayers(); this.updateChrome(); return; }

    try {
      /* base pair (IMERG / nowcast) */
      if (out.base) {
        const tpl = this.tileTemplate(out.base.kind, out.base.key);
        if (hard) {
          for (let i = 0; i < 2; i++) {
            const src = fullMapInst.getSource(this.baseSrcId(i));
            if (src && src.setTiles) src.setTiles([tpl]);
            try { fullMapInst.setPaintProperty(this.baseLayerId(i), 'raster-opacity', i === this.front ? this.opacity : 0); } catch (e) { /* ignore */ }
          }
        } else {
          const back = 1 - this.front;
          const backSrc = fullMapInst.getSource(this.baseSrcId(back));
          if (backSrc && backSrc.setTiles) backSrc.setTiles([tpl]);
          const frontId = this.baseLayerId(this.front), backId = this.baseLayerId(back);
          try {
            fullMapInst.setPaintProperty(backId, 'raster-opacity-transition', { duration: 0 });
            fullMapInst.setPaintProperty(backId, 'raster-opacity', 0);
          } catch (e) { /* ignore */ }
          requestAnimationFrame(() => {
            if (!this.active || !fullMapInst) return;
            try {
              fullMapInst.setPaintProperty(backId, 'raster-opacity-transition', { duration: 280 });
              fullMapInst.setPaintProperty(frontId, 'raster-opacity-transition', { duration: 280 });
              fullMapInst.setPaintProperty(backId, 'raster-opacity', this.opacity);
              fullMapInst.setPaintProperty(frontId, 'raster-opacity', 0);
              this.front = back;
            } catch (e) { /* ignore */ }
          });
        }
      } else {
        this.setLayersOpacity([this.baseLayerId(0), this.baseLayerId(1)], this.source === 'sat' ? this.opacity : 0);
      }

      /* radar pair */
      if (out.radar) {
        this.ensureRadarPair();
        const tpl = this.tileTemplate('radar', out.radar.key);
        const op = this.source === 'auto' ? Math.min(0.62, this.opacity) : this.opacity;
        if (hard) {
          for (let i = 0; i < 2; i++) {
            const src = fullMapInst.getSource(this.radarSrcId(i));
            if (src && src.setTiles) src.setTiles([tpl]);
            try { fullMapInst.setPaintProperty(this.radarLayerId(i), 'raster-opacity', i === this.radarFront ? op : 0); } catch (e) { /* ignore */ }
          }
        } else {
          const back = 1 - this.radarFront;
          const backSrc = fullMapInst.getSource(this.radarSrcId(back));
          if (backSrc && backSrc.setTiles) backSrc.setTiles([tpl]);
          const frontId = this.radarLayerId(this.radarFront), backId = this.radarLayerId(back);
          try {
            fullMapInst.setPaintProperty(backId, 'raster-opacity-transition', { duration: 0 });
            fullMapInst.setPaintProperty(backId, 'raster-opacity', 0);
          } catch (e) { /* ignore */ }
          requestAnimationFrame(() => {
            if (!this.active || !fullMapInst) return;
            try {
              fullMapInst.setPaintProperty(backId, 'raster-opacity-transition', { duration: 280 });
              fullMapInst.setPaintProperty(frontId, 'raster-opacity-transition', { duration: 280 });
              fullMapInst.setPaintProperty(backId, 'raster-opacity', op);
              fullMapInst.setPaintProperty(frontId, 'raster-opacity', 0);
              this.radarFront = back;
            } catch (e) { /* ignore */ }
          });
        }
      } else {
        this.setLayersOpacity([this.radarLayerId(0), this.radarLayerId(1)], 0);
      }
    } catch (e) {
      console.warn('LiveSky precip renderFrame', e);
      this.layerReady = false;
    }
    this.updateChrome();
  },
  setLayersOpacity(lids, op) {
    if (!fullMapInst) return;
    try {
      for (const lid of lids) if (fullMapInst.getLayer(lid)) fullMapInst.setPaintProperty(lid, 'raster-opacity', op);
    } catch (e) { /* ignore */ }
  },
  clearLayers() {
    this.setLayersOpacity([
      this.baseLayerId(0), this.baseLayerId(1),
      this.radarLayerId(0), this.radarLayerId(1)
    ], 0);
  },
  framesReady() {
    /* Timeline is wall-clock; a layer exists if either provider has data. */
    return !!(this.timeline.length && (SAT.ready || this.frames.length));
  },

  /* ---------------- chrome / slider / ETA ---------------- */
  updateChrome() {
    if (el.radarSlider && this.timeline.length) el.radarSlider.value = String(Math.max(0, this.idx));
    this.updateTime();
  },
  updateTime() {
    const step = this.timeline[this.idx];
    if (!step) return;
    const out = this.frameOut(step);
    /* #radar-time shows the DATA time of the topmost layer, not the slider
       position — so a stale satellite frame is never dressed as "now". */
    const shown = out.radar ? out.radar.time : out.base ? out.base.time : step.t;
    const d = new Date(shown * 1000);
    if (el.radarTime) {
      try { el.radarTime.textContent = d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }); }
      catch (e) { el.radarTime.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
    }
    if (el.radarBadge) {
      const kind = this.source === 'radar' ? (out.radar ? 'radar' : 'none')
        : out.radar && out.base ? 'hybrid' : out.base ? out.base.kind : out.radar ? 'radar' : 'none';
      el.radarBadge.classList.remove('past', 'forecast');
      if (kind === 'hybrid') {
        el.radarBadge.textContent = t('radar_src_auto');
      } else if (kind === 'now') {
        el.radarBadge.textContent = t('radar_badge_forecast');
        el.radarBadge.classList.add('forecast');
      } else if (kind === 'radar') {
        el.radarBadge.textContent = t('radar_src_radar');
      } else if (kind === 'sat') {
        el.radarBadge.textContent = t('radar_src_sat');
        /* mark frames whose data is older than the slider step */
        if (step.t - out.base.time > 20 * 60) el.radarBadge.classList.add('past');
      } else {
        el.radarBadge.textContent = t('radar_no_data');
        el.radarBadge.classList.add('past');
      }
    }
    if (el.radarTicks && this.timeline.length > 1) {
      const nowPct = (this.nowTickIndex() / Math.max(1, this.timeline.length - 1)) * 100;
      el.radarTicks.style.setProperty('--radar-now-pct', nowPct.toFixed(2) + '%');
    }
    this.updateEta(step, out);
  },
  nowTickIndex() {
    const nowEpoch = nowEpochSec();
    let idx = 0;
    for (let k = 0; k < this.timeline.length; k++) if (this.timeline[k].t <= nowEpoch) idx = k; else break;
    return idx;
  },
  /* The headline above the timeline: rain ETA for the pin + where it goes. */
  updateEta(step, out) {
    if (!el.radarEta || !el.radarEtaText) return;
    const box = el.radarEta;
    const gen = ++this.etaGen;
    const setText = (html, cls) => {
      if (gen !== this.etaGen) return;
      box.classList.remove('hidden', 'wet', 'dry', 'storm');
      if (cls) box.classList.add(cls);
      el.radarEtaText.innerHTML = html;
    };
    if (!step) { box.classList.add('hidden'); return; }
    const nowEpoch = nowEpochSec();
    const isRealNow = Math.abs(step.t - nowEpoch) < 12 * 60;
    const lat = state.lat, lon = state.lon;

    /* Near "now": minute-precision Open-Meteo forecast at the pin (globally
       available, Russia included). This is the "reaches you in ~35 min" line. */
    if (isRealNow) {
      let info = null;
      try { info = minutelyPrecipInfo(); } catch (e) { /* ignore */ }
      if (!info) { try { info = hourlyPrecipInfo(); } catch (e) { /* ignore */ } }
      const nowA = nowAbsMin();
      if (info && info.wet) {
        const end = info.endAbs != null ? hhmmFromAbs(info.endAbs) : '—';
        setText(t('radar_eta_raining').replace('{t}', end), 'wet');
      } else if (info && info.startAbs != null) {
        const mins = Math.max(1, Math.round(info.startAbs - nowA));
        const at = hhmmFromAbs(info.startAbs);
        setText(t('radar_eta_arrive').replace('{d}', fmtDurSmart(mins)) + ' <small>(' + at + ')</small>', 'wet');
      } else {
        setText(t('radar_eta_dry'), 'dry');
      }
    } else {
      const when = new Date(step.t * 1000).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
      if (out.base && out.base.kind === 'now') {
        const mins = +out.base.key;
        const val = NOWCAST.active ? NOWCAST.sampleNowcast(lat, lon, mins) : null;
        if (val != null && val > 0.05) setText(t('radar_frame_wet').replace('{t}', when).replace('{p}', val.toFixed(1)), 'wet');
        else setText(t('radar_frame_dry').replace('{t}', when), 'dry');
      } else if (out.radar && !out.base) {
        setText(t('radar_frame_radar').replace('{t}', when), 'dry');
      } else {
        /* past/current satellite frame: sample the actual frame at the pin */
        const satTime = out.base && out.base.kind === 'sat' ? out.base.key : (out.satIdx >= 0 ? SAT.times[out.satIdx] : SAT.latest);
        if (!satTime) { setText(t('radar_frame_sat').replace('{t}', when), 'dry'); }
        else {
          SAT.sampleAt(satTime, lat, lon).then(v => {
            if (v == null) setText(t('radar_frame_sat').replace('{t}', when), 'dry');
            else if (v > 0.05) setText(t('radar_frame_wet').replace('{t}', when).replace('{p}', v.toFixed(1)), 'wet');
            else setText(t('radar_frame_dry').replace('{t}', when), 'dry');
          }).catch(() => setText(t('radar_frame_sat').replace('{t}', when), 'dry'));
        }
      }
    }

    /* Motion line from the nowcast vector field, when computed. */
    const motion = NOWCAST.motionAt(lat, lon);
    if (gen === this.etaGen && motion && motion.speed > 3) {
      const dirKey = motionDirKey(motion.angleDeg);
      const extra = document.createElement('small');
      extra.className = 'radar-motion';
      extra.textContent = ' · ' + t('radar_motion').replace('{dir}', t(dirKey)).replace('{v}', String(Math.round(motion.speed)));
      el.radarEtaText.appendChild(extra);
    }
  },

  /* ---------------- controls ---------------- */
  setSource(src) {
    if (!['auto', 'sat', 'radar'].includes(src)) return;
    this.source = src;
    if (el.radarSources) {
      el.radarSources.querySelectorAll('.radar-source').forEach(b => b.classList.toggle('on', b.dataset.source === src));
    }
    if (this.active && this.timeline.length) {
      this.layerReady = false;
      this.ensureLayers();
      this.renderFrame(true);
      this.updateTime();
    }
  },
  step(dir) {
    if (!this.timeline.length) return;
    this.idx = Math.min(this.timeline.length - 1, Math.max(0, this.idx + dir));
    this.renderFrame(false);
  },
  goto(i) {
    if (!this.timeline.length) return;
    i = Math.max(0, Math.min(this.timeline.length - 1, i | 0));
    if (i === this.idx) { this.updateChrome(); return; }
    this.idx = i;
    this.renderFrame(false);
  },
  goLive() {
    if (!this.timeline.length) return;
    this.idx = this.nowTickIndex();
    this.renderFrame(false);
  },
  togglePlay() { this.playing ? this.pause() : this.play(); },
  play() {
    if (!this.timeline.length) return;
    this.playing = true;
    if (el.radarPlay) {
      el.radarPlay.classList.add('playing');
      el.radarPlay.innerHTML = '<i class="ph-fill ph-pause"></i>';
      el.radarPlay.setAttribute('aria-label', 'Pause');
    }
    if (this.playTimer) clearInterval(this.playTimer);
    this.playTimer = setInterval(() => {
      if (!this.timeline.length) return;
      this.idx = this.idx >= this.timeline.length - 1 ? 0 : this.idx + 1;
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
        fullMapInst.setPaintProperty(this.baseLayerId(this.front), 'raster-opacity', this.opacity);
        if (this.source === 'radar') fullMapInst.setPaintProperty(this.radarLayerId(this.radarFront), 'raster-opacity', this.opacity);
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
    if (!fullMapInst) {
      openFullMap();
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
    if (el.radarSources) {
      el.radarSources.querySelectorAll('.radar-source').forEach(b => b.classList.toggle('on', b.dataset.source === this.source));
    }
    if (first) this.fitZoom();
    try { fullMapInst.resize(); } catch (e) { /* ignore */ }

    if (this.timeline.length) {
      this.idx = this.nowTickIndex();
      this.ensureLayers();
      this.renderFrame(true);
      this.scheduleAutoRefresh();
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
          for (const lid of [this.baseLayerId(i), this.radarLayerId(i)]) if (fullMapInst.getLayer(lid)) fullMapInst.removeLayer(lid);
          for (const sid of [this.baseSrcId(i), this.radarSrcId(i)]) if (fullMapInst.getSource(sid)) fullMapInst.removeSource(sid);
        }
      } catch (e) { /* ignore */ }
      this.layerReady = false;
      this.front = 0; this.radarFront = 0;
    }
  },
  toggle() { this.active ? this.disable() : this.enable(); },

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

  /* Kick the nowcast engine once the satellite basis is known. */
  prepNowcast() {
    if (!SAT.ready || NOWCAST.active) return;
    NOWCAST.prep();
  }
};

function nowEpochSec() { return Math.floor(Date.now() / 1000); }
let motionClampWarned = false;
function motionDirKey(angleDeg) {
  /* angle: direction the precipitation moves TOWARD, degrees from north. */
  const steps = ['w_dir_full_N', 'w_dir_full_NE', 'w_dir_full_E', 'w_dir_full_SE', 'w_dir_full_S', 'w_dir_full_SW', 'w_dir_full_W', 'w_dir_full_NW'];
  return steps[Math.round(((angleDeg % 360) + 360) % 360 / 45) % 8];
}

/* ============================================================
   LiveSky nowcast: client-side extrapolation of the last two
   IMERG fields (hierarchical block matching + advection).
   Honest by design: every generated frame is labelled as an
   extrapolation and decays over time — it is not a model.
   ============================================================ */
const NOWCAST = {
  active: false,
  /* Global web-mercator grid. Phones/weak hardware get a 4× cheaper field
     (720×360 instead of 1440×720) and a smaller motion lattice — the visual
     difference is minor at world zoom, the CPU/memory difference is large. */
  W: PRECIP_LOW ? 720 : 1440,
  H: PRECIP_LOW ? 360 : 720,
  latest: null,              /* Float32Array W*H, mm/h approx */
  prev: null,
  vx: null, vy: null,        /* grid cells per hour (Float32Array, coarse) */
  cw: PRECIP_LOW ? 48 : 96,
  ch: PRECIP_LOW ? 24 : 48,
  prepSeq: 0,

  async prep(force) {
    if (!SAT.ready || !SAT.latest) return;
    if (this.active && !force) return;
    const gen = ++this.prepSeq;
    try {
      const latest = await this.fetchField(SAT.latest);
      if (gen !== this.prepSeq) return;
      const prevTime = SAT.times.length > 1 ? SAT.times[SAT.times.length - 2] : null;
      const prev = prevTime ? await this.fetchField(prevTime) : null;
      if (gen !== this.prepSeq) return;
      if (!latest) return;
      this.latest = latest;
      this.prev = prev || latest;
      this.computeMotion();
      this.active = true;
      /* A nowcast became available — repaint if the user is on a forecast step. */
      if (this.active && RADAR.active && RADAR.idx >= 0 && RADAR.timeline.length) {
        const out = RADAR.frameOut(RADAR.timeline[RADAR.idx]);
        if (out.base && out.base.kind === 'now') RADAR.renderFrame(true);
      }
    } catch (e) {
      console.warn('LiveSky nowcast prep failed', e);
    }
  },

  /* WMS GetMap for the WHOLE world (EPSG:3857): one image per frame. */
  async fetchField(time) {
    try {
      const url = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi'
        + '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
        + '&LAYERS=' + encodeURIComponent(SAT.layer)
        + '&STYLES=&FORMAT=image/png&TRANSPARENT=true'
        + '&WIDTH=' + this.W + '&HEIGHT=' + this.H
        + '&SRS=EPSG:3857&BBOX=-20037508.34,-20037508.34,20037508.34,20037508.34'
        + '&TIME=' + encodeURIComponent(time);
      const r = await fetchWithTimeout(url, 30000);
      if (!r.ok) return null;
      const blob = await r.blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = this.W; c.height = this.H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, this.W, this.H);
      const d = ctx.getImageData(0, 0, this.W, this.H).data;
      const out = new Float32Array(this.W * this.H);
      let maxv = 0;
      for (let i = 0, p = 0; i < out.length; i++, p += 4) {
        const v = d[p + 3] < 8 ? 0 : rateFromColor([d[p], d[p + 1], d[p + 2], d[p + 3]]);
        out[i] = v;
        if (v > maxv) maxv = v;
      }
      return maxv < 0.01 ? null : out; /* fully empty field: nothing to track */
    } catch (e) { return null; }
  },

  /* Coarse block matching between prev → latest fields, with two guards that
     keep the result physical:
       1. blocks with no rain at all (oceans, clear sky) produce zero motion
          instead of matching random noise;
       2. the SSD is regularized by the displacement magnitude so an empty or
          repeating field never yields a huge jump (this is what produced the
          absurd "≈1857 км/ч" earlier);
       3. the result is clamped to a realistic advection speed. */
  computeMotion() {
    const cw = this.cw, ch = this.ch;
    const bw = this.W / cw, bh = this.H / ch;
    const vx = new Float32Array(cw * ch);
    const vy = new Float32Array(cw * ch);
    const a = this.prev, b = this.latest;
    const sample = (arr, x, y) => {
      const xi = Math.max(0, Math.min(this.W - 1, Math.round(x)));
      const yi = Math.max(0, Math.min(this.H - 1, Math.round(y)));
      return arr[yi * this.W + xi];
    };
    const MAX_V_PX = 6; /* ≈1.5°/h — rain systems don't move faster */
    for (let by = 0; by < ch; by++) {
      for (let bx = 0; bx < cw; bx++) {
        const cx = (bx + 0.5) * bw, cy = (by + 0.5) * bh;
        /* Local rain energy at the CURRENT pixel — used as the weight. */
        let energy = 0;
        for (let sy = -3; sy <= 3; sy++) {
          for (let sx = -3; sx <= 3; sx++) energy += sample(b, cx + sx, cy + sy);
        }
        if (energy < 0.05) { vx[by * cw + bx] = 0; vy[by * cw + bx] = 0; continue; }
        let best = Infinity, bdx = 0, bdy = 0;
        const R = 5;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            let s = 0;
            for (let sy = -3; sy <= 3; sy++) {
              for (let sx = -3; sx <= 3; sx++) {
                const px = cx + sx, py = cy + sy;
                const va = sample(a, px + dx, py + dy);
                const vb = sample(b, px, py);
                const diff = vb - va;
                s += diff * diff;
              }
            }
            /* Regularize: prefer small displacement unless the match is much
               better. λ scales with the local rain energy. */
            const cost = s + 0.05 * energy * (dx * dx + dy * dy);
            if (cost < best) { best = cost; bdx = dx; bdy = dy; }
          }
        }
        /* cells per 30 min → per hour, clamped to a physical maximum */
        let px = bdx * (this.W / cw) / 2;
        let py = bdy * (this.H / ch) / 2;
        const m = Math.hypot(px, py);
        if (m > MAX_V_PX) { px *= MAX_V_PX / m; py *= MAX_V_PX / m; }
        vx[by * cw + bx] = px;
        vy[by * cw + bx] = py;
      }
    }
    /* Smooth the motion field with two 3×3 passes, so neighbouring lattice
       cells never have a sharp jump in displacement. Combined with bilinear
       interpolation in motionAtGrid() this is what makes advected rain look
       like a flowing cloud field instead of hard square blocks. */
    let fx = new Float32Array(vx), fy = new Float32Array(vy);
    for (let pass = 0; pass < 2; pass++) {
      const nx = new Float32Array(fx.length), ny = new Float32Array(fy.length);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          let ax = 0, ay = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= ch || xx < 0 || xx >= cw) continue;
              ax += fx[yy * cw + xx]; ay += fy[yy * cw + xx]; n++;
            }
          }
          nx[y * cw + x] = ax / n; ny[y * cw + x] = ay / n;
        }
      }
      fx = nx; fy = ny;
    }
    this.vx = fx; this.vy = fy;
  },

  /* Bilinear sample of the advected latest field after `mins` minutes
     at a geographic coordinate. Returns mm/h approx or null. */
  sampleNowcast(lat, lon, mins) {
    if (!this.active || !this.latest) return null;
    const dt = Math.min(8, Math.max(0.25, mins / 60)); /* caps the horizon */
    const x = this.lonToGx(lon), y = this.latToGy(lat);
    const mv = this.motionAtGrid(x, y);
    const bx = x - mv.vx * dt, by = y - mv.vy * dt;
    return this.bilinear(this.latest, bx, by);
  },
  motionAt(lat, lon) {
    if (!this.active || !this.vx) return null;
    const x = this.lonToGx(lon), y = this.latToGy(lat);
    const mv = this.motionAtGrid(x, y);
    /* grid cells → degrees → km at this latitude, per hour. */
    const dLon = mv.vx * (360 / this.W);
    const dLat = mv.vy * (180 / this.H);
    let kmH = Math.hypot(dLon * 111.32 * Math.cos(lat * Math.PI / 180), dLat * 110.57);
    if (kmH > 140) {
      /* Physically plausible ceiling. Logged once (not per frame) so a console
         capture can prove v13's clamp is active — and reveal the raw unit
         path when it isn't. */
      if (!motionClampWarned) {
        motionClampWarned = true;
        try { console.warn('[LiveSky] motion clamp: raw ' + Math.round(kmH) + ' km/h → 140'); } catch (e) { /* ignore */ }
      }
      kmH = 140;
    }
    const angleDeg = (Math.atan2(dLon * Math.cos(lat * Math.PI / 180), dLat) * 180 / Math.PI + 360) % 360;
    return { speed: kmH, angleDeg };
  },
  /* Bilinear interpolation over the coarse motion lattice. Nearest sampling
     moved every 3.75°-cell as one rigid block — the rectangular "cube" look.
     Continuous interpolation makes the advection field vary smoothly, so rain
     patches deform like clouds instead of jumping in squares. */
  motionAtGrid(x, y) {
    const cw = this.cw, ch = this.ch;
    const gx = (x / this.W) * cw - 0.5;
    const gy = (y / this.H) * ch - 0.5;
    const x0 = Math.max(0, Math.min(cw - 1, Math.floor(gx)));
    const y0 = Math.max(0, Math.min(ch - 1, Math.floor(gy)));
    const x1 = Math.min(cw - 1, x0 + 1);
    const y1 = Math.min(ch - 1, y0 + 1);
    const fx = Math.max(0, Math.min(1, gx - x0));
    const fy = Math.max(0, Math.min(1, gy - y0));
    const i00 = y0 * cw + x0, i10 = y0 * cw + x1;
    const i01 = y1 * cw + x0, i11 = y1 * cw + x1;
    const vxTop = this.vx[i00] * (1 - fx) + this.vx[i10] * fx;
    const vxBot = this.vx[i01] * (1 - fx) + this.vx[i11] * fx;
    const vyTop = this.vy[i00] * (1 - fx) + this.vy[i10] * fx;
    const vyBot = this.vy[i01] * (1 - fx) + this.vy[i11] * fx;
    return { vx: vxTop * (1 - fy) + vxBot * fy, vy: vyTop * (1 - fy) + vyBot * fy };
  },
  lonToGx(lon) { return ((lon + 180) / 360) * this.W; },
  latToGy(lat) {
    const latRad = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
    const merc = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return ((1 - merc / Math.PI) / 2) * this.H;
  },
  bilinear(arr, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 >= this.W - 1 || y0 >= this.H - 1) return 0;
    const fx = x - x0, fy = y - y0;
    const i = y0 * this.W + x0;
    const a = arr[i], b = arr[i + 1], c = arr[i + this.W], d = arr[i + this.W + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  },
  /* Catmull-Rom (bicubic) sampling of the source field. The nowcast grid is
     0.25° coarse; plain bilinear still leaves visible 1-cell plateaus that
     read as squares at high zoom. Bicubic makes the field continuous — a
     smooth gradient across cell borders, i.e. clouds instead of cuboids. */
  bicubic(arr, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 1 || y0 < 1 || x0 >= this.W - 2 || y0 >= this.H - 2) return this.bilinear(arr, x, y);
    const fx = x - x0, fy = y - y0;
    const fx2 = fx * fx, fx3 = fx2 * fx;
    const fy2 = fy * fy, fy3 = fy2 * fy;
    /* Catmull-Rom weights: [-0.5t³+t²-0.5t, 1.5t³-2.5t²+1, -1.5t³+2t²+0.5t, 0.5t³-0.5t²] */
    const wx0 = -0.5 * fx3 + fx2 - 0.5 * fx, wx1 = 1.5 * fx3 - 2.5 * fx2 + 1;
    const wx2 = -1.5 * fx3 + 2 * fx2 + 0.5 * fx, wx3 = 0.5 * fx3 - 0.5 * fx2;
    const wy0 = -0.5 * fy3 + fy2 - 0.5 * fy, wy1 = 1.5 * fy3 - 2.5 * fy2 + 1;
    const wy2 = -1.5 * fy3 + 2 * fy2 + 0.5 * fy, wy3 = 0.5 * fy3 - 0.5 * fy2;
    const W = this.W;
    const p = (dx, dy) => arr[(y0 + dy) * W + (x0 + dx)];
    let v = 0;
    v += (p(-1, -1) * wx0 + p(0, -1) * wx1 + p(1, -1) * wx2 + p(2, -1) * wx3) * wy0;
    v += (p(-1, 0) * wx0 + p(0, 0) * wx1 + p(1, 0) * wx2 + p(2, 0) * wx3) * wy1;
    v += (p(-1, 1) * wx0 + p(0, 1) * wx1 + p(1, 1) * wx2 + p(2, 1) * wx3) * wy2;
    v += (p(-1, 2) * wx0 + p(0, 2) * wx1 + p(1, 2) * wx2 + p(2, 2) * wx3) * wy3;
    return v < 0 ? 0 : v;
  },

  /* Render one 256px tile of the extrapolated field (custom protocol).
     The field is sampled with Catmull-Rom (bicubic) interpolation so cell
     borders of the coarse 0.25° grid never appear as plateaus, then the tile
     is alpha-blurred and upscaled — the same "soft cloud" pipeline.
     Confidence decays with the extrapolation distance: beyond ~3 h the
     colour fades and the rate is damped, so a long advection never renders
     as a confident forecast. */
  async tile(z, x, y, mins) {
    /* 96 samples/edge ≈ 4 samples per 0.25° cell — smooth. Weak devices use
       64 (2.7 per cell, ~55% fewer samples per tile). The subsequent
       softenTile() pass hides the difference entirely. */
    const RES = PRECIP_LOW ? 64 : 96;
    const SP = 256 / RES; /* source pixels per output pixel */
    const c = document.createElement('canvas');
    c.width = RES; c.height = RES;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const n = Math.pow(2, z);
    const dt = Math.min(8, Math.max(0.25, mins / 60));
    const conf = Math.max(0.35, 1 - dt / 8);
    const image = ctx.createImageData(RES, RES);
    const data = image.data;
    for (let py = 0; py < RES; py++) {
      const lat = latFromTileY(z, y, py * SP + SP / 2);
      if (lat == null) continue;
      for (let px = 0; px < RES; px++) {
        const lon = ((x * 256 + px * SP + SP / 2) / (n * 256)) * 360 - 180;
        const gx = this.lonToGx(lon), gy = this.latToGy(lat);
        const mv = this.motionAtGrid(gx, gy);
        const v = this.bicubic(this.latest, gx - mv.vx * dt, gy - mv.vy * dt);
        const o = (py * RES + px) * 4;
        if (v > 0.02) {
          const col = rainColor(v * conf);
          data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2];
          data[o + 3] = rainAlpha(v, conf);
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    /* α-weighted blur + high-quality upscale → cloud-like masses. */
    const soft = await softenTile(c);
    if (soft) return soft;
    /* Fallback must still hand MapLibre a 256×256 tile, not a 96×96 one. */
    const up = document.createElement('canvas');
    up.width = 256; up.height = 256;
    const uctx = up.getContext('2d');
    uctx.imageSmoothingEnabled = true;
    uctx.imageSmoothingQuality = 'high';
    uctx.drawImage(c, 0, 0, 256, 256);
    return createImageBitmap(up);
  }
};

function latFromTileY(z, y, py) {
  const n = Math.pow(2, z);
  const yy = (y * 256 + py) / (n * 256); /* 0..1 mercator */
  const clamped = Math.max(0, Math.min(1, yy));
  const merc = Math.PI * (1 - 2 * clamped);
  return Math.atan(Math.sinh(merc)) * 180 / Math.PI;
}

/* ---------------- map / radar UI wiring (bound once, right here) ---------------- */
function bindMapEvents() {
  on(el.mapClose, 'click', closeFullMap);
  on(el.mapApply, 'click', applyMapLocation);

  on(el.radarToggle, 'click', () => RADAR.toggle());
  on(el.radarClose, 'click', () => RADAR.disable());
  on(el.radarPlay, 'click', () => RADAR.togglePlay());
  on(el.radarNext, 'click', () => RADAR.step(1));
  on(el.radarBack, 'click', () => RADAR.step(-1));
  on(el.radarSlider, 'input', (e) => RADAR.goto(+e.target.value));
  on(el.radarLive, 'click', () => RADAR.goLive());
  on(el.radarOpacity, 'input', (e) => RADAR.setOpacity(+e.target.value / 100));
  on(el.radarSpeed, 'change', (e) => RADAR.setSpeed(+e.target.value));
  if (el.radarSources) {
    el.radarSources.querySelectorAll('.radar-source').forEach(btn => {
      on(btn, 'click', () => RADAR.setSource(btn.dataset.source));
    });
  }
  /* Opacity / animation speed live behind a settings gear to keep the panel slim. */
  on(el.radarSettings, 'click', () => {
    const open = !el.radarAdvanced.classList.contains('hidden');
    el.radarAdvanced.classList.toggle('hidden', open);
    el.radarSettings.classList.toggle('on', !open);
    if (el.radarSettings) el.radarSettings.setAttribute('aria-expanded', String(!open));
  });
}

/* Custom protocol for all precipitation tiles (sat / radar / nowcast). */
if (window.maplibregl && typeof window.maplibregl.addProtocol === 'function') {
  window.maplibregl.addProtocol(PRECIP_PROTOCOL, precipHandler);
}

/* Hand every implementation to the loader facade. */
if (window.LiveSkyMap && typeof window.LiveSkyMap._register === 'function') {
  window.LiveSkyMap._register({
    open: openFullMap,
    close: closeFullMap,
    applyLocation: applyMapLocation,
    updateSmall: updateMap,
    refreshTiles: updateMapTiles,
    radarToggle: () => RADAR.toggle(),
    radarEnable: () => RADAR.enable(),
    radarDisable: () => RADAR.disable(),
    radarPause: () => RADAR.pause(),
    radarRefresh: () => { if (RADAR.active) RADAR.refreshSilent(); },
    radarActive: () => RADAR.active,
    /* language switch: repaint the badge, time and ETA line at once */
    refreshLang: () => {
      if (!RADAR.active || !RADAR.timeline.length) return;
      RADAR.updateTime();
      if (el.radarSources) {
        el.radarSources.querySelectorAll('.radar-source').forEach(b => b.classList.toggle('on', b.dataset.source === RADAR.source));
      }
    }
  });
}

/* First activation: create the small map and wire the map/radar UI once.
   Basemap tiles still never load before the ToS consent. */
if (!consentLocked()) initMap();
bindMapEvents();

if (typeof console !== 'undefined') console.info('[LiveSky] ' + PRECIP_ENGINE_VERSION + ' loaded');
