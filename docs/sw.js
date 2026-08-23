/* ============================================================
   LiveSky Weather Pro — Service Worker (PWA + offline)
   ============================================================ */
'use strict';

const VERSION = 'livesky-v1.3-lazy-map';
const SHELL_CACHE = `${VERSION}-shell`;
const FORECAST_CACHE = `${VERSION}-forecast`;

/* index.html loads the shell with cache-buster query strings (?v=25, ?v=21…).
   We store every same-origin asset under a query-free key so all versions of a
   URL resolve to one cached copy — this keeps the cache bounded and, crucially,
   makes offline cold-start work right after the first install (previously the
   versioned requests weren't in the cache, so the page came up unstyled/broken
   when going offline before a second visit). */
function trimCacheUrl(url) {
  const u = new URL(url.href);
  u.search = '';
  u.hash = '';
  return u.href;
}
/* Keep the forecast mirror bounded — each city/model is a different URL. */
async function trimForecastCache(maxEntries) {
  try {
    const cache = await caches.open(FORECAST_CACHE);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
    }
  } catch (e) { /* non-critical */ }
}

/* App shell — everything needed to boot the page offline.
   NOTE: 11-map-radar.js is a LAZY module (fetched on first map/radar use, not
   during boot) but it stays precached on purpose: after one online visit the
   offline shell must still be able to open the map — the SW serves the cached
   copy when the network is unavailable. Same for the MapLibre GL library and
   its stylesheet, which the LiveSkyMap loader injects on demand. */
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/i18n.js',
  './js/app.js',
  './js/modules/01-core.js',
  './js/modules/02-weather-data.js',
  './js/modules/03-rendering.js',
  './js/modules/04-chart.js',
  './js/modules/05-hourly-alerts.js',
  './js/modules/06-air.js',
  './js/modules/07-effects.js',
  './js/modules/08-search-modals.js',
  './js/modules/09-lifecycle.js',
  './js/modules/10-bootstrap.js',
  './js/modules/11-map-radar.js',
  './legal/privacy.html',
  './legal/terms.html',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-128.png',
  './icons/icon-96.png',
  './icons/icon-64.png',
  './icons/icon-32.png',
  './icons/icon-16.png',
  './assets/fonts/fonts.css',
  './assets/fonts/files/montserrat-cyrillic-400-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-500-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-600-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-700-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-800-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-ext-400-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-ext-500-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-ext-600-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-ext-700-normal.woff2',
  './assets/fonts/files/montserrat-cyrillic-ext-800-normal.woff2',
  './assets/fonts/files/montserrat-latin-400-normal.woff2',
  './assets/fonts/files/montserrat-latin-500-normal.woff2',
  './assets/fonts/files/montserrat-latin-600-normal.woff2',
  './assets/fonts/files/montserrat-latin-700-normal.woff2',
  './assets/fonts/files/montserrat-latin-800-normal.woff2',
  './assets/fonts/files/montserrat-latin-ext-400-normal.woff2',
  './assets/fonts/files/montserrat-latin-ext-500-normal.woff2',
  './assets/fonts/files/montserrat-latin-ext-600-normal.woff2',
  './assets/fonts/files/montserrat-latin-ext-700-normal.woff2',
  './assets/fonts/files/montserrat-latin-ext-800-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-400-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-500-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-600-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-700-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-800-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-ext-400-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-ext-500-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-ext-600-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-ext-700-normal.woff2',
  './assets/fonts/files/unbounded-cyrillic-ext-800-normal.woff2',
  './assets/fonts/files/unbounded-latin-400-normal.woff2',
  './assets/fonts/files/unbounded-latin-500-normal.woff2',
  './assets/fonts/files/unbounded-latin-600-normal.woff2',
  './assets/fonts/files/unbounded-latin-700-normal.woff2',
  './assets/fonts/files/unbounded-latin-800-normal.woff2',
  './assets/fonts/files/unbounded-latin-ext-400-normal.woff2',
  './assets/fonts/files/unbounded-latin-ext-500-normal.woff2',
  './assets/fonts/files/unbounded-latin-ext-600-normal.woff2',
  './assets/fonts/files/unbounded-latin-ext-700-normal.woff2',
  './assets/fonts/files/unbounded-latin-ext-800-normal.woff2',
  './assets/vendor/maplibre-gl/maplibre-gl.js',
  './assets/vendor/maplibre-gl/maplibre-gl.css',
  './assets/vendor/phosphor/regular/style.css',
  './assets/vendor/phosphor/bold/style.css',
  './assets/vendor/phosphor/fill/style.css',
  './assets/vendor/phosphor/duotone/style.css',
  './assets/vendor/phosphor/regular/Phosphor.woff2',
  './assets/vendor/phosphor/regular/Phosphor.woff',
  './assets/vendor/phosphor/bold/Phosphor-Bold.woff2',
  './assets/vendor/phosphor/bold/Phosphor-Bold.woff',
  './assets/vendor/phosphor/fill/Phosphor-Fill.woff2',
  './assets/vendor/phosphor/fill/Phosphor-Fill.woff',
  './assets/vendor/phosphor/duotone/Phosphor-Duotone.woff2',
  './assets/vendor/phosphor/duotone/Phosphor-Duotone.woff',
  './assets/flags/ru.svg',
  './assets/flags/gb.svg',
  './assets/flags/es.svg'
];

/* Open-Meteo hosts whose responses we mirror into the forecast cache
   so the last loaded forecast stays available offline. */
function isDataApi(url) {
  return /(api|air-quality-api|geocoding-api)\.open-meteo\.com\//.test(url.host + url.pathname);
}
function isForecastApi(url) {
  return /(api|air-quality-api)\.open-meteo\.com\//.test(url.host + url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Network-first for everything, falling back to the cache. The shell is
   re-validated in the background; data APIs are mirrored so a later offline
   open still shows the last forecast. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Data APIs (Open-Meteo): network first, then last-good cache. */
  if (isDataApi(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && isForecastApi(url)) {
            const clone = res.clone();
            caches.open(FORECAST_CACHE)
              .then((cache) => cache.put(req, clone).then(() => trimForecastCache(25)));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  /* Same-origin app requests (navigation + static). Network-first; on failure
     fall back to the query-stripped cache key. */
  if (url.origin === self.location.origin) {
    const reqMode = req.mode;
    const cacheKey = (url.search || url.hash) ? trimCacheUrl(url) : url.href;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(cacheKey, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(cacheKey).then((hit) => {
            if (hit) return hit;
            if (reqMode === 'navigate') return caches.match('./index.html');
            return Response.error();
          })
        )
    );
    return;
  }

  /* Cross-origin non-API (basemap / radar tiles). Fonts, icon fonts and all
     libraries are same-origin now (./assets), so this branch only serves the
     post-consent map stack: network first, cache fallback. */
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((hit) => hit || Response.error()))
  );
});

/* ============================================================
   Notifications — Web Push ready + notification click handling
   ============================================================ */
/* A real push requires a backend + VAPID keys; this handler is here so that
   if/when such a backend is wired up, notifications arrive and work.
   Local forecast-driven alerts are sent from the page via showNotification. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* ignore */ }
  const title = data.title || 'LiveSky · Опасная погода';
  const body = data.body || 'Обратите внимание на прогноз погоды';
  const options = {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-96.png',
    tag: data.tag || 'livesky-alert',
    data: { url: data.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
