/* ============================================================
   LiveSky Weather Pro — application bootstrap (eager)
   ------------------------------------------------------------
   This module finishes the boot sequence: it owns the lazy-map
   loader facade, weather notifications, the Capacitor bridge and
   the single application init() call. The map/radar subsystem
   itself (11-map-radar.js) is NOT loaded here — it is fetched on
   the first real map/radar interaction via window.LiveSkyMap.
   ============================================================ */

/* ---------------- lazy map / radar subsystem ----------------
   The map stack is deliberately OFF the boot path: MapLibre GL
   (~800 KB of JavaScript), its stylesheet and the map/radar module
   are fetched on the FIRST real user intent (mini-map tap, radar
   badge, fullscreen map, radar toggle) and only once per session.
   The service worker still precaches all of these files, so the
   offline shell keeps the full map available after one online visit.

   Capable devices additionally PREFETCH the subsystem in the
   background right after boot / ToS consent (see shouldPrefetch),
   which restores the old "map is simply there" experience. Weak
   devices stay fully lazy. Eager modules never touch RADAR or the
   map internals directly — they call this facade, which is a safe
   no-op until the subsystem has loaded. The facade never bypasses
   the Terms of Service gate. */
window.LiveSkyMap = (function () {
  /* Engine stamp the lazy module publishes on load. If the executing module
     advertises anything else (older cached copy), we re-inject it once with a
     fresh cache-buster — this is what ended the "still squares" staleness
     where a v6 module kept running after the file on disk was updated. */
  const PRECIP_STAMP = 'precip-engine-v13';
  const MODULE_URL = 'js/modules/11-map-radar.js?v=13';
  const MAPLIBRE_URL = 'assets/vendor/maplibre-gl/maplibre-gl.js?v=4.7.1';
  const MAPLIBRE_CSS_URL = 'assets/vendor/maplibre-gl/maplibre-gl.css?v=4.7.1';
  const LOAD_TIMEOUT_MS = 20000;
  const PREFETCH_DELAY_MS = window.LIVE_MAP_PREFETCH_MS != null ? window.LIVE_MAP_PREFETCH_MS : 1200;

  /* Inject one classic <script> and settle on onload/onerror. A watchdog
     keeps a stalled WebView from hanging the loading state forever. */
  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const node = document.createElement('script');
      let settled = false;
      const timer = setTimeout(() => fail(new Error('timeout loading ' + src)), LOAD_TIMEOUT_MS);
      function done() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        node.onload = node.onerror = null;
        resolve();
      }
      function fail(err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        node.onload = node.onerror = null;
        node.remove(); /* a dead tag must not block a retry */
        reject(err);
      }
      node.onload = done;
      node.onerror = () => fail(new Error('failed to load ' + src));
      node.src = src;
      document.head.appendChild(node);
    });
  }

  const facade = {
    ready: false,        /* the lazy module has registered its implementation */
    _impl: null,
    _loadPromise: null,
    _registerResolve: null,
    _prefetchTimer: null,

    isLoaded() { return this.ready; },

    /* Capable devices get the map back on the boot path (as before): a silent
       background prefetch shortly after start / consent. Weak devices keep the
       stage-1 behaviour — the map loads on the first interaction. */
    shouldPrefetch() {
      if (typeof consentLocked === 'function' && consentLocked()) return false;
      if (typeof state !== 'undefined') {
        if (state.effects === 'eco' || state._perfLow) return false; /* explicit / detected low power */
        if (state.effects === 'full') return true;                   /* user asked for maximum quality */
      }
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const cores = (nav && nav.hardwareConcurrency) || 0; /* 0 = unknown */
      const mem = (nav && nav.deviceMemory) || 0;           /* 0 = unknown (iOS) */
      if (cores && cores < 4) return false; /* few CPU cores → weak device */
      if (mem && mem < 4) return false;     /* little RAM → weak device */
      return true; /* unknown hardware (desktops, iOS Safari) → assume capable */
    },

    schedulePrefetch() {
      if (this._prefetchTimer) return;
      this._prefetchTimer = setTimeout(() => {
        this._prefetchTimer = null;
        if (this.ready || this._loadPromise) return; /* already on board / loading */
        if (document.hidden || !this.shouldPrefetch()) return;
        /* A background fetch is silent: on failure the lazy path stays intact
           for the first real user interaction (no toast, no retry button). */
        this.load().catch(() => { /* silent */ });
      }, PREFETCH_DELAY_MS);
    },

    /* Load MapLibre + the map module exactly once. Concurrent callers share
       one promise (the script is never inserted twice); after a failure the
       cached promise is dropped so the next interaction can retry. */
    load() {
      if (this.ready) return Promise.resolve();
      if (this._loadPromise) return this._loadPromise;
      const p = this._startLoad();
      p.then(() => {}, () => { if (this._loadPromise === p) this._loadPromise = null; });
      this._loadPromise = p;
      return p;
    },

    _startLoad() {
      const self = this;
      this.setCardLoading(true);
      const registered = new Promise((resolve) => { self._registerResolve = resolve; });
      let chain;
      if (!window.maplibregl) {
        /* The stylesheet is not render-critical: inject it alongside the
           library but never block the map on it. It must land BEFORE the
           app.css link so LiveSky's theme overrides (dark controls,
           attribution, popups) keep winning the cascade — exactly the order
           the old eager <head> tags had. */
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = MAPLIBRE_CSS_URL;
        const appCss = document.querySelector('link[rel="stylesheet"][href*="app.css"]');
        if (appCss && appCss.parentNode) appCss.parentNode.insertBefore(link, appCss);
        else document.head.appendChild(link);
        chain = injectScript(MAPLIBRE_URL).then(() => injectScript(MODULE_URL));
      } else {
        /* Library already on board (Android assets, legacy embeds): fetch the
           module right away so the tag exists immediately. */
        chain = injectScript(MODULE_URL);
      }
      return chain
        .then(() => {
          /* Stale-copy guard: an old module (or a cached copy served under a
             fresh URL) may execute but publish an older engine stamp. Reject
             once and retry with a busted URL so the newest build wins. */
          if (self.ready && window.__liveskyPrecipVersion && window.__liveskyPrecipVersion !== PRECIP_STAMP && !self._stampRetried) {
            self._stampRetried = true;
            self._impl = null; self.ready = false;
            const busted = MODULE_URL + (MODULE_URL.includes('?') ? '&' : '?') + '_b=' + Date.now();
            return injectScript(busted).then(() => registered).then(() => {
              if (window.__liveskyPrecipVersion !== PRECIP_STAMP) {
                throw new Error('stale precip module after retry');
              }
            });
          }
          return registered;
        })
        .then(() => new Promise((resolve, reject) => {
          /* The module registers synchronously while executing. If the file
             loaded but never registered, it is a stale/broken build — fail
             fast instead of leaving the UI in a loading state. */
          setTimeout(() => (self.ready ? resolve() : reject(new Error('map module did not initialize'))), 80);
        }))
        .catch((err) => {
          self._registerResolve = null;
          throw err;
        });
    },

    /* Called by the lazy module itself right after it executes. */
    _register(impl) {
      this._impl = impl;
      this.ready = true;
      this.setCardLoading(false);
      if (this._registerResolve) {
        const resolve = this._registerResolve;
        this._registerResolve = null;
        resolve();
      }
    },

    _call(name) {
      if (!this.ready || !this._impl) return false;
      const fn = this._impl[name];
      if (typeof fn !== 'function') return false;
      fn();
      return true;
    },

    /* ---- safe wrappers for the eager modules (no-ops until loaded) ---- */
    update() { this._call('updateSmall'); },          /* keep the mini map in sync */
    refreshTiles() { this._call('refreshTiles'); },   /* theme switch restyle */
    refreshLang() { this._call('refreshLang'); },     /* language switch: repaint radar chrome */
    radarRefresh() { this._call('radarRefresh'); },   /* impl checks .active itself */
    radarPause() { this._call('radarPause'); },       /* battery: pause hidden radar */
    radarActive() { return !!(this.ready && this._impl && typeof this._impl.radarActive === 'function' && this._impl.radarActive()); },
    close() { this._call('close'); },
    applyLocation() { return this.ready && this._impl && typeof this._impl.applyLocation === 'function' ? this._impl.applyLocation() : Promise.resolve(); },

    /* ---- user entry points: lazy-load, then land on the expected screen ---- */
    open(opts) {
      if (consentLocked()) return; /* the map stack must never bypass the ToS gate */
      if (this.ready) { this._openLoaded(opts); return; }
      this.load()
        .then(() => this._openLoaded(opts))
        .catch((err) => this._fail(err, () => this.open(opts)));
    },
    _openLoaded(opts) {
      if (!this.ready || !this._impl) return;
      this._impl.open();
      /* Enable radar after the map container is sized — avoid adding the
         layer to a 0×0 canvas (same timing the radar badge always used). */
      if (opts && opts.radar) {
        setTimeout(() => { if (this.ready && this._impl) this._impl.radarEnable(); }, 420);
      }
    },
    toggleRadar() {
      if (consentLocked()) return;
      if (this._call('radarToggle')) return;
      this.load()
        .then(() => this._call('radarToggle'))
        .catch((err) => this._fail(err, () => this.toggleRadar()));
    },

    _fail(err, retry) {
      this.setCardLoading(false);
      console.warn('LiveSky: map subsystem failed to load', err);
      if (typeof toast === 'function' && typeof t === 'function') {
        toast(t('toast_network'), 'error', t('toast_retry'), retry);
      }
    },

    /* Compact loading state on the mini-map card while the subsystem is
       being fetched for the first time. Restores the tap hint on end. */
    setCardLoading(on) {
      const card = el.mapCard;
      if (!card) return;
      card.classList.toggle('loading', !!on);
      const span = card.querySelector('.map-placeholder span');
      if (span) {
        const key = on ? 'map_loading' : 'map_tap_open';
        span.dataset.translate = key;
        span.textContent = t(key);
      }
      const ico = card.querySelector('.map-placeholder i');
      if (ico) ico.className = on ? 'ph-fill ph-circle-notch' : 'ph ph-globe-hemisphere-west';
    }
  };

  return facade;
}());

/* ---------------- PWA: service worker + install --------------- */
let deferredInstallPrompt = null;

/* The sandbox preview (and local dev) must NEVER keep the long-lived SW cache:
   sw.js stores same-origin assets under query-stripped keys, so an old build
   of a lazy module (e.g. 11-map-radar.js?v=6) can keep being served after the
   code was updated — exactly the "still squares" staleness. Production hosts
   keep full offline support. */
function isStaleCacheProneHost() {
  return /(^|\.)e2b\.app$/.test(location.hostname) ||
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}
function dropServiceWorkerForDev() {
  if (!('serviceWorker' in navigator)) return;
  /* Unregister whatever an older build may have left controlling this page. */
  if (navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister()))
      .catch(() => { /* non-critical */ });
  }
  if ('caches' in window && caches.keys) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => { /* non-critical */ });
  }
}
function registerServiceWorker() {
  if (isNativeApp()) return; /* Capacitor bundles the shell; a second cache layer only causes stale assets */
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return; /* skip file:// and data: */
  if (isStaleCacheProneHost()) { dropServiceWorkerForDev(); return; }
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
    el.notifLabel.dataset.translate = on ? 'notif_enabled_short' : 'notif_enable_short';
    el.notifLabel.textContent = t(on ? 'notif_enabled_short' : 'notif_enable_short');
  }
  el.notifItem.classList.toggle('seg-selected', on);
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
        if (el.mapModal.classList.contains('open')) { LiveSkyMap.close(); return; }
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
  if (state.model === 'ecmwf_ifs04') state.model = 'ecmwf_ifs025'; /* migrate the old, now-deprecated model id */
  if (!['auto', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'].includes(state.model)) state.model = 'auto';
  if (!['auto', 'full', 'eco'].includes(state.effects)) state.effects = 'auto';
  if (!['chart', 'blocks'].includes(state.forecastView)) state.forecastView = 'chart';
  if (typeof applyForecastView === 'function') applyForecastView();

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
  /* No third-party request of any kind on a locked boot: fonts, icons and
     flags are self-hosted, and the whole map stack (MapLibre GL, its
     stylesheet and the map/radar module) is lazy — it is only fetched on the
     first explicit map/radar interaction, never during boot, and never before
     the ToS consent. Weather for the default / last city is the app's own
     first data request and stays exactly where it was in the boot sequence. */

  /* PWA + adaptive performance + offline */
  registerServiceWorker();
  initInstallPrompt();
  updateInstallItem();
  initConnectivity();
  if (state.effects === 'auto') PERF.start();

  /* Capable devices: bring the map back onto the boot path (like the old
     eager behaviour) with a silent background prefetch shortly after start.
     Weak devices / Eco mode stay fully lazy — see shouldPrefetch(). */
  LiveSkyMap.schedulePrefetch();

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
