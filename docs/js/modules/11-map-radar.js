/* ============================================================
   LiveSky — map & precipitation radar (LAZY subsystem)
   ------------------------------------------------------------
   This file is NOT part of the initial page load. It is injected
   by the LiveSkyMap facade in 10-bootstrap.js on the first real
   map/radar interaction and registers its implementation back
   with the loader, so it is fetched and executed exactly once.

   It is a classic script that shares the global lexical scope of
   modules 01–10 and therefore only executes after they have run
   (the loader guarantees this). All map/radar UI handlers are
   bound here exactly once, when the module first executes.
   ============================================================ */

/* ---------------- maps (MapLibre GL, reliable raster tiles) ---------------- */
let mapInst = null, mapMarkEl = null, smallMapFallback = false;
/* The fullscreen map instance is created lazily inside openFullMap(); the
   pending flag keeps a rapid double-tap from creating two MapLibre views. */
let fullMapInst = null, fullMapPending = false, fullMarkEl = null, fullMapFallback = false;
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

/* The small map is created only once this module is on board — i.e. after the
   user actually asked for the map. Opening the mini-map itself is bound
   eagerly in bindEvents() (it must work before this file exists). */
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
        /* No city-name popup here: the pin marks the spot, the instruction bar
           explains the tap-to-pick flow (regression: the default white
           MapLibre popup tooltip showed up over the map). */
        fullMapInst.on('load', () => {
          fullMapInst.on('click', (e) => {
            /* Ignore clicks that are really the end of a pan. */
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
          /* Only fall back the basemap — ignore missing radar tile 404 noise. */
          const msg = (e && e.error && (e.error.message || e.error.status)) || '';
          if (/radar/i.test(String(msg))) return;
          if (!fullMapFallback) { fullMapFallback = true; try { fullMapInst.setStyle(osmStyle()); } catch (err) { /* ignore */ } }
        });
        fullMapInst.resize();
      } catch (e) { console.warn('LiveSky: full map init failed', e); }
    }, 320);
  } else if (fullMapInst) {
    /* Don't yank zoom back to 10 if the user was inspecting precip. */
    const z = RADAR.active ? Math.min(fullMapInst.getZoom(), 8) : Math.max(fullMapInst.getZoom(), 9);
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

/* ---------------- map / radar UI wiring (bound once, right here) ---------------- */
/* These controls live inside the map modal / radar panel, which only becomes
   reachable after this module has loaded — so binding them here, exactly once
   at first execution, is safe and keeps bindEvents() free of map internals. */
function bindMapEvents() {
  on(el.mapClose, 'click', closeFullMap);
  on(el.mapApply, 'click', applyMapLocation);

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
}

/* Hand every implementation to the loader facade. From here on, all later
   calls go straight to these functions — nothing is ever loaded twice. */
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
    /* impl-side guard: only refresh frames while the radar layer is on screen */
    radarRefresh: () => { if (RADAR.active) RADAR.refreshSilent(); },
    radarActive: () => RADAR.active
  });
}

/* First activation: create the small map and wire the map/radar UI once.
   Basemap tiles still never load before the ToS consent. */
if (!consentLocked()) initMap();
bindMapEvents();
