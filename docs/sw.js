/* ============================================================
   LiveSky Weather Pro — Service Worker (PWA + offline)
   ============================================================ */
'use strict';

const VERSION = 'livesky-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const FORECAST_CACHE = `${VERSION}-forecast`;

/* App shell — everything needed to boot the page offline. */
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/i18n.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-128.png',
  './icons/icon-96.png',
  './icons/icon-64.png',
  './icons/icon-32.png',
  './icons/icon-16.png'
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
            caches.open(FORECAST_CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  /* Same-origin app requests (navigation + static). */
  if (url.origin === self.location.origin) {
    const reqMode = req.mode;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => {
            if (hit) return hit;
            if (reqMode === 'navigate') return caches.match('./index.html');
            return Response.error();
          })
        )
    );
    return;
  }

  /* Cross-origin non-API (fonts, icons, map tiles): network first, cache fallback. */
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((hit) => hit || Response.error()))
  );
});
