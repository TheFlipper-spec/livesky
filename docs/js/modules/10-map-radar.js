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
