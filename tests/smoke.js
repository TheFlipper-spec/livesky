/* LiveSky smoke test — runs the app in jsdom with stubbed APIs.
   Usage: npm install && npm test
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DOCS = path.join(__dirname, '..', 'docs');
const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');

const errors = [];
const dom = new JSDOM(html, {
  url: 'https://livesky.local/',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

/* ---- polyfills / stubs ---- */
window.requestAnimationFrame = (cb) => setTimeout(() => cb(window.performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.IntersectionObserver = class { constructor(cb) {} observe() {} unobserve() {} };
window.HTMLElement.prototype.scrollBy = function (opts) {
  if (opts && typeof opts.left === 'number') this.scrollLeft = (this.scrollLeft || 0) + opts.left;
};
window.HTMLElement.prototype.scrollTo = function (opts) {
  if (opts && typeof opts.left === 'number') this.scrollLeft = opts.left;
};
/* jsdom has no PointerEvent — minimal stub for scrub tests */
if (typeof window.PointerEvent !== 'function') {
  window.PointerEvent = class PointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId || 1;
      this.pointerType = init.pointerType || 'mouse';
      this.isPrimary = init.isPrimary !== false;
    }
  };
}
window.HTMLElement.prototype.setPointerCapture = function () {};
window.HTMLElement.prototype.releasePointerCapture = function () {};

/* canvas stub */
const gradientStub = { addColorStop() {} };
const ctxStub = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas') return null;
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradientStub;
    if (!(p in t)) t[p] = () => {};
    return t[p];
  },
  set(t, p, v) { t[p] = v; return true; }
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;

/* maplibre gl stub */
const fakeMap = () => {
  const sources = {};
  const layers = {};
  return {
    setStyle() {}, addControl() {}, flyTo() {}, easeTo() {}, resize() {}, stop() {},
    getZoom() { return 10; }, on() {}, once() {}, remove() {}, triggerRepaint() {},
    isStyleLoaded() { return true; },
    getSource(id) { return sources[id] || null; },
    getLayer(id) { return layers[id] || null; },
    addSource(id, spec) { sources[id] = { ...spec, setTiles(t) { this.tiles = t; } }; },
    addLayer(spec) { layers[spec.id] = spec; },
    removeLayer(id) { delete layers[id]; },
    removeSource(id) { delete sources[id]; },
    setPaintProperty() {},
    setTiles() {}
  };
};
window.maplibregl = {
  Map: function () { return fakeMap(); },
  Marker: function () { return { setLngLat() { return this; }, addTo() { return this; }, remove() {} }; },
  Popup: function () { return { setLngLat() { return this; }, setHTML() { return this; }, addTo() { return this; }, remove() {} }; },
  NavigationControl: function () {},
  AttributionControl: function () {}
};

/* ---- synthetic Open-Meteo data (local time = Europe/Moscow) ---- */
function pad(n) { return String(n).padStart(2, '0'); }
function genForecast() {
  const hourly = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weathercode: [], windspeed_10m: [], windgusts_10m: [], winddirection_10m: [], relativehumidity_2m: [], surface_pressure: [], dewpoint_2m: [], visibility: [], uv_index: [], is_day: [] };
  const daily = { time: [], weathercode: [], temperature_2m_max: [], temperature_2m_min: [], sunrise: [], sunset: [], precipitation_probability_max: [], precipitation_sum: [], uv_index_max: [], windspeed_10m_max: [], winddirection_10m_dominant: [] };
  const base = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' })); base.setHours(0, 0, 0, 0);
  for (let dI = -16; dI <= 16; dI++) {
    const day = new Date(base.getTime() + dI * 86400000);
    const ds = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    const rainy = dI % 3 === 1; /* today (0) clear so minutely nowcast can drive rain-status */
    daily.time.push(ds);
    daily.weathercode.push(rainy ? 61 : 2);
    daily.temperature_2m_max.push(18 + (dI % 5));
    daily.temperature_2m_min.push(8 + (dI % 4));
    daily.sunrise.push(`${ds}T05:12`); daily.sunset.push(`${ds}T20:35`);
    daily.precipitation_probability_max.push(rainy ? 70 : 10);
    daily.precipitation_sum.push(rainy ? 5.2 : 0);
    daily.uv_index_max.push(5.5);
    daily.windspeed_10m_max.push(12); daily.winddirection_10m_dominant.push(270);
    for (let h = 0; h < 24; h++) {
      const hs = `${ds}T${pad(h)}:00`;
      hourly.time.push(hs);
      const t = 10 + 8 * Math.sin(((h - 6) / 24) * Math.PI * 2) + dI * 0.1;
      hourly.temperature_2m.push(+t.toFixed(1));
      hourly.apparent_temperature.push(+(t - 1).toFixed(1));
      /* Put a clear rain window on "today" 14:00–17:00 so the 24h chart shows hatched bands. */
      const todayRain = dI === 0 && h >= 14 && h <= 17;
      const wetH = rainy || todayRain;
      hourly.precipitation_probability.push(wetH ? 80 : 5);
      hourly.precipitation.push(todayRain ? 1.4 : (rainy ? 0.8 : 0));
      hourly.weathercode.push(todayRain ? 63 : (rainy ? 61 : 2));
      hourly.windspeed_10m.push(7);
      hourly.windgusts_10m.push(11);
      hourly.winddirection_10m.push(270);
      hourly.relativehumidity_2m.push(60);
      hourly.surface_pressure.push(1013);
      hourly.dewpoint_2m.push(5);
      hourly.visibility.push(12000);
      hourly.uv_index.push(h > 7 && h < 18 ? 4 : 0);
      hourly.is_day.push(h > 5 && h < 20 ? 1 : 0);
    }
  }
  /* The app now requests models=best_match, so Open-Meteo returns *_best_match
     columns. Mirror each key so getVal() resolves in Auto mode too. */
  [hourly, daily].forEach(obj => {
    const mirror = {};
    for (const k in obj) {
      if (k === 'time') { mirror[k] = obj[k]; continue; }
      mirror[k + '_best_match'] = obj[k];
    }
    Object.assign(obj, mirror);
  });
  /* 15-minute nowcast aligned to Europe/Moscow wall clock (matches forecast tz). */
  const minutely_15 = { time: [], temperature_2m: [], precipitation: [], weather_code: [], weathercode: [], apparent_temperature: [], windspeed_10m: [], relativehumidity_2m: [], is_day: [] };
  const mskNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const baseMin = new Date(mskNow.getFullYear(), mskNow.getMonth(), mskNow.getDate(), mskNow.getHours(), Math.floor(mskNow.getMinutes() / 15) * 15, 0, 0);
  for (let k = 0; k < 24; k++) {
    const d = new Date(baseMin.getTime() + k * 15 * 60000);
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    minutely_15.time.push(ts);
    const t = 12 + 3 * Math.sin(k / 6);
    minutely_15.temperature_2m.push(+t.toFixed(1));
    minutely_15.apparent_temperature.push(+(t - 1).toFixed(1));
    /* Slot 0 dry-ish, then rain for a few slots so "starts/ends in N min" works. */
    const wet = k >= 1 && k <= 5;
    minutely_15.precipitation.push(wet ? 0.6 : 0);
    minutely_15.weather_code.push(wet ? 61 : 2);
    minutely_15.weathercode.push(wet ? 61 : 2);
    minutely_15.windspeed_10m.push(7);
    minutely_15.relativehumidity_2m.push(60);
    minutely_15.is_day.push(d.getHours() > 5 && d.getHours() < 20 ? 1 : 0);
  }
  /* Also paint a clear wet stretch 14:00–17:45 on "today" so chart chips refine to minutes. */
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const ds = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    for (let h = 14; h <= 17; h++) {
      for (const mm of [0, 15, 30, 45]) {
        if (h === 17 && mm > 30) break; /* ends 17:45 */
        const ts = `${ds}T${pad(h)}:${pad(mm)}`;
        if (!minutely_15.time.includes(ts)) {
          minutely_15.time.push(ts);
          minutely_15.temperature_2m.push(14);
          minutely_15.apparent_temperature.push(13);
          minutely_15.precipitation.push(0.8);
          minutely_15.weather_code.push(63);
          minutely_15.weathercode.push(63);
          minutely_15.windspeed_10m.push(7);
          minutely_15.relativehumidity_2m.push(70);
          minutely_15.is_day.push(1);
        } else {
          const ix = minutely_15.time.indexOf(ts);
          minutely_15.precipitation[ix] = 0.8;
          minutely_15.weather_code[ix] = 63;
          minutely_15.weathercode[ix] = 63;
        }
      }
    }
    /* sort minutely by time */
    const order = minutely_15.time.map((t,i)=>[t,i]).sort((a,b)=>a[0]<b[0]?-1:1).map(x=>x[1]);
    for (const key of Object.keys(minutely_15)) {
      minutely_15[key] = order.map(i => minutely_15[key][i]);
    }
  } catch (e) { /* ignore */ }
  return { timezone: 'Europe/Moscow', timezone_abbreviation: 'GMT+3', elevation: 140, hourly, daily, minutely_15 };
}

function genAir() {
  const hourly = { time: [], pm2_5: [], pm10: [], nitrogen_dioxide: [], ozone: [], european_aqi: [] };
  const base = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' })); base.setHours(0, 0, 0, 0);
  for (let h = 0; h < 72; h++) {
    const d = new Date(base.getTime() + h * 3600000);
    hourly.time.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`);
    hourly.pm2_5.push(12); hourly.pm10.push(18); hourly.nitrogen_dioxide.push(25); hourly.ozone.push(50);
    hourly.european_aqi.push(30);
  }
  return { timezone: 'Europe/Moscow', hourly };
}

function makeFetchStub() {
  return async (url) => {
    const u = String(url);
    if (u.includes('/v1/forecast')) return { ok: true, json: async () => genForecast() };
    if (u.includes('air-quality-api')) return { ok: true, json: async () => genAir() };
    if (u.includes('geocoding-api')) return {
      ok: true,
      json: async () => ({ results: [{ name: 'Санкт-Петербург', latitude: 59.93, longitude: 30.34, country_code: 'RU', admin1: 'Санкт-Петербург', country: 'Россия' }] })
    };
    if (u.includes('nominatim')) return {
      ok: true,
      json: async () => ({ address: { road: 'Тверская улица', city: 'Москва', country_code: 'ru', state: 'Москва', country: 'Россия' } })
    };
    if (u.includes('bigdatacloud')) return { ok: true, json: async () => ({ city: 'Москва', countryCode: 'RU' }) };
    if (u.includes('rainviewer.com')) {
      const now = Math.floor(Date.now() / 1000);
      const past = [];
      for (let i = 12; i >= 0; i--) past.push({ time: now - i * 600, path: '/v2/radar/' + (now - i * 600) });
      const nowcast = [];
      for (let i = 1; i <= 6; i++) nowcast.push({ time: now + i * 600, path: '/v2/radar/' + (now + i * 600) });
      return { ok: true, json: async () => ({ host: 'https://tilecache.rainviewer.com', radar: { past, nowcast }, generated: now }) };
    }
    throw new Error('unhandled url: ' + u);
  };
}
window.fetch = makeFetchStub();

/* Capacitor's App.addListener may return a handle directly (not a Promise).
   Keep the primary smoke run in native mode to guard Android startup. */
let nativeBackHandler = null;
window.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    App: {
      addListener(event, handler) { nativeBackHandler = handler; return { remove() {} }; },
      exitApp() {}
    }
  }
};

window.addEventListener('error', (e) => errors.push('window error: ' + e.message));
process.on('unhandledRejection', (r) => errors.push('unhandled rejection: ' + (r && r.message)));

/* ---- run app scripts (as classic inline scripts, like a browser) ---- */
window.LIVE_FAV_DELAY_MS = 0;   /* open favorites list synchronously on focus */
window.LIVE_UI_LOCK_MS = 200;   /* short UI lock after closing overlays */
const i18nSrc = fs.readFileSync(path.join(DOCS, 'js', 'i18n.js'), 'utf8');
/* Eager modules: inlined in order, exactly like index.html's classic script tags. */
const moduleNames = ['01-core.js', '02-weather-data.js', '03-rendering.js', '04-chart.js',
  '05-hourly-alerts.js', '06-air.js', '07-effects.js', '08-search-modals.js',
  '09-lifecycle.js', '10-bootstrap.js'];
/* The map/radar module is a LAZY subsystem: index.html must not load it and the
   smoke run delivers it below the way the LiveSkyMap loader would. */
const lazyModuleName = '11-map-radar.js';
const lazySrc = fs.readFileSync(path.join(DOCS, 'js', 'modules', lazyModuleName), 'utf8');
/* Inline each source in order: this mirrors index.html's classic script tags. */
const appSrc = moduleNames.map((name) => fs.readFileSync(path.join(DOCS, 'js', 'modules', name), 'utf8')).join('\n;\n');
/* Combined sources: the lazy module shares the classic-script global scope with
   the eager ones once it executes, so checks like name conflicts cover both. */
const allSrc = appSrc + '\n;\n' + lazySrc;
try {
  const s1 = document.createElement('script');
  s1.textContent = i18nSrc;
  document.body.appendChild(s1);
  const s2 = document.createElement('script');
  s2.textContent = appSrc;
  document.body.appendChild(s2);
} catch (e) { errors.push('script failed: ' + e.message); }

const q = (id) => document.getElementById(id);
const assert = (cond, msg) => { if (!cond) errors.push('ASSERT: ' + msg); console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); };

setTimeout(() => {
  try {
    /* CSS regressions: closed overlay must be inert, input must use text cursor */
    {
      const compatibilityLoader = fs.readFileSync(path.join(DOCS, 'js', 'app.js'), 'utf8');
      const swSrc = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');
      assert(Buffer.byteLength(compatibilityLoader) < 2500, 'app.js remains a small compatibility loader');
      assert(!/src=\"js\/app\.js/.test(html), 'index.html does not load the legacy app.js bundle');
      assert((appSrc.match(/try \{\n  init\(\);/g) || []).length === 1,
        'the module sequence has exactly one application initialization call');
      assert((lazySrc.match(/try \{\n  init\(\);/g) || []).length === 0 && !/\binit\(\)\s*;/.test(lazySrc),
        'the lazy map module never calls the application init()');
      assert(/LiveSkyMap\._register/.test(lazySrc) && /window\.LiveSkyMap/.test(appSrc),
        'lazy map module registers with the LiveSkyMap loader facade');
      let previous = -1;
      moduleNames.forEach((name) => {
        const position = html.indexOf('js/modules/' + name);
        assert(position > previous, 'index.html loads ' + name + ' in dependency order');
        previous = position;
        assert(swSrc.includes('./js/modules/' + name), 'service worker precaches ' + name);
      });
      /* ---- lazy map/radar loading guarantees ---- */
      assert(!new RegExp('<script[^>]*' + lazyModuleName.replace(/\./g, '\\.')).test(html),
        'index.html keeps the map/radar module off the initial script path');
      assert(swSrc.includes('./js/modules/' + lazyModuleName),
        'service worker precaches the lazy map/radar module (offline shell stays complete)');
      assert(!/<script[^>]*maplibre-gl\.js/.test(html) && !/maplibre-gl\.css/.test(html),
        'MapLibre GL library and stylesheet are no longer loaded eagerly by index.html');
      assert(swSrc.includes('./assets/vendor/maplibre-gl/maplibre-gl.js') && swSrc.includes('./assets/vendor/maplibre-gl/maplibre-gl.css'),
        'service worker precaches the lazily injected MapLibre library and stylesheet');
      /* the white city-name tooltip must stay gone; vendor CSS must not override app.css */
      assert(!/maplibregl\.Popup/.test(lazySrc),
        'fullscreen map shows no city-name popup (white tooltip regression)');
      assert(/link\[rel="stylesheet"\]\[href\*="app\.css"\]/.test(appSrc) && /insertBefore\(link, appCss\)/.test(appSrc),
        'lazy MapLibre CSS is inserted before app.css so theme overrides keep winning');
      assert(/shouldPrefetch\(\)/.test(appSrc) && /schedulePrefetch\(\)/.test(appSrc) && /hardwareConcurrency/.test(appSrc) && /deviceMemory/.test(appSrc),
        'device-aware map prefetch (capable devices preload, weak devices stay lazy)');
      const cssSrc = fs.readFileSync(path.join(DOCS, 'css', 'app.css'), 'utf8');
      const mm = cssSrc.match(/\.map-modal\s*\{[^}]*\}/s);
      assert(mm && /visibility:\s*hidden/.test(mm[0]) && /pointer-events:\s*none/.test(mm[0]), 'closed map modal is fully inert (visibility + pointer-events)');
      assert(/\.search-form input\s*\{[^}]*cursor:\s*text/s.test(cssSrc), 'search input uses a text cursor');
      /* hourly strip must be a horizontal no-wrap flex row (regression: items stacked vertically) */
      const hs = cssSrc.match(/\.hourly-strip\s*\{[^}]*\}/s);
      assert(hs && /display:\s*flex/.test(hs[0]) && /flex-direction:\s*row/.test(hs[0]) && /flex-wrap:\s*nowrap/.test(hs[0]), 'hourly strip is a horizontal no-wrap flex row');
      /* the 24-hour temperature chart must remain swipeable instead of being squeezed on phones */
      const chartScroller = cssSrc.match(/\.chart-scroll\s*\{[^}]*\}/s);
      const chartTrack = cssSrc.match(/\.chart-track\s*\{[^}]*\}/s);
      assert(chartScroller && /overflow-x:\s*auto/.test(chartScroller[0]) && /touch-action:\s*pan-x\s+pan-y/.test(chartScroller[0]), 'temperature chart supports native horizontal touch scrolling');
      assert(chartTrack && /min-width:\s*1120px/.test(chartTrack[0]), 'temperature chart keeps touch-friendly hourly spacing');
      assert(/\.shell\s*\{[^}]*max-width:\s*1560px/s.test(cssSrc), 'shell uses the full width on big screens');
      assert(/min-width:\s*1750px/.test(cssSrc), 'wide-screen edge decorations exist');

      /* Capacitor/Android project must stay wired to the static docs build. */
      const root = path.join(DOCS, '..');
      const cap = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const manifest = fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
      assert(cap.appId === 'io.github.theflipperspec.livesky' && cap.webDir === 'docs', 'Capacitor uses the permanent LiveSky app id and docs web assets');
      assert(pkg.dependencies['@capacitor/android'] && pkg.dependencies['@capacitor/geolocation'] && pkg.dependencies['@capacitor/local-notifications'], 'native Android, geolocation and notifications plugins are installed');
      assert(pkg.scripts['android:build'] && pkg.scripts['cap:sync'], 'Android sync and APK build scripts exist');
      const gradlew = fs.readFileSync(path.join(root, 'android', 'gradlew'), 'utf8');
      assert(/JAVA_HOME_21_X64/.test(gradlew), 'Capacitor Android build selects its required Java 21 toolchain');
      assert(/ACCESS_COARSE_LOCATION/.test(manifest) && /ACCESS_FINE_LOCATION/.test(manifest), 'Android location permissions are declared');
      assert(/SCHEDULE_EXACT_ALARM[\s\S]*tools:node="remove"/.test(manifest), 'unused restricted exact-alarm permission is removed');
      assert(/nativePlugin\('Geolocation'\)/.test(appSrc) && /nativePlugin\('LocalNotifications'\)/.test(appSrc) && /if \(isNativeApp\(\)\) return/.test(appSrc), 'web app includes native Capacitor adapters and skips PWA cache in Android');

      /* Legal compliance static documents */
      const privacyHtml = fs.readFileSync(path.join(DOCS, 'legal', 'privacy.html'), 'utf8');
      const termsHtml = fs.readFileSync(path.join(DOCS, 'legal', 'terms.html'), 'utf8');
      assert(privacyHtml.includes('Сервис LiveSky уважает вашу конфиденциальность') &&
             privacyHtml.includes('Open-Meteo') &&
             privacyHtml.includes('не сохраняет историю перемещений'),
             'legal/privacy.html exists and contains complete privacy policy compliance text');
      const privacyClause = 'Координаты не сохраняются на серверах LiveSky. Они передаются исключительно доверенным внешним провайдерам API (включая, но не ограничиваясь: Open-Meteo, Nominatim, RainViewer) строго в момент использования приложения для предоставления метеоданных и обратного геокодирования. Данные не профилируются и не передаются в маркетинговых целях.';
      const privacyMd = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
      assert(privacyHtml.includes(privacyClause) && privacyMd.includes(privacyClause),
             'external API data-flow clause is present in privacy.html and PRIVACY.md');
      assert(!/не передает данные третьим лицам/.test(privacyHtml) && !/не передает данные третьим лицам/.test(privacyMd),
             'obsolete "no third parties" wording is removed everywhere');
      assert(termsHtml.includes('Пункт: Ограничение ответственности за метеорологические данные') &&
             termsHtml.includes('автоматической математической экстраполяции') &&
             termsHtml.includes('не является сертифицированной государственной системой гражданского оповещения'),
             'legal/terms.html exists and contains complete terms of service liability limitation text');

      /* Every route from a legal document back into the app must explicitly
         enter the consent flow instead of relying on a possibly stale record. */
      const termsReturnLinks = [...termsHtml.matchAll(/href="([^"#]*index\.html[^"#]*)"/g)].map((m) => m[1]);
      const privacyReturnLinks = [...privacyHtml.matchAll(/href="([^"#]*index\.html[^"#]*)"/g)].map((m) => m[1]);
      assert(termsReturnLinks.length === 3 &&
             termsReturnLinks.every((href) => href === '../index.html?consent=required'),
             'terms-page return links request a fresh ToS confirmation');
      assert(privacyReturnLinks.length === 3 &&
             privacyReturnLinks.every((href) => href === '../index.html'),
             'privacy-page return links do not re-lock the app');

      /* ---- IT-compliance: zero third-party subresources before consent ---- */
      const cdnRe = /unpkg\.com|googleapis\.com|gstatic\.com|flagcdn\.com|jsdelivr\.net/;
      assert(!cdnRe.test(html) && !cdnRe.test(termsHtml) && !cdnRe.test(privacyHtml) && !cdnRe.test(appSrc) && !cdnRe.test(lazySrc) && !cdnRe.test(i18nSrc),
             'no CDN subresource references remain — fonts, libs, icons and flags are self-hosted');
      [
        'assets/fonts/fonts.css',
        'assets/vendor/maplibre-gl/maplibre-gl.js',
        'assets/vendor/maplibre-gl/maplibre-gl.css',
        'assets/vendor/phosphor/regular/style.css',
        'assets/vendor/phosphor/bold/style.css',
        'assets/vendor/phosphor/fill/style.css',
        'assets/vendor/phosphor/duotone/style.css',
        'assets/flags/ru.svg', 'assets/flags/gb.svg', 'assets/flags/es.svg'
      ].forEach((p) => assert(fs.existsSync(path.join(DOCS, p)), 'self-hosted asset exists: ' + p));
      /* every url() inside local stylesheets must resolve to a bundled file */
      const fontsCssSrc = fs.readFileSync(path.join(DOCS, 'assets', 'fonts', 'fonts.css'), 'utf8');
      [...fontsCssSrc.matchAll(/url\(\.\/(files\/[\w.-]+)\)/g)].forEach((m) =>
        assert(fs.existsSync(path.join(DOCS, 'assets', 'fonts', m[1])), 'font file bundled: ' + m[1]));

      /* ---- Attribution (CC BY 4.0 / RainViewer / OSM / CARTO) ---- */
      assert(/footer-attribution/.test(html) &&
             /href="https:\/\/open-meteo\.com\/"/.test(html) &&
             /creativecommons\.org\/licenses\/by\/4\.0/.test(html) &&
             /rainviewer\.com/.test(html) &&
             /openstreetmap\.org\/copyright/.test(html) &&
             /carto\.com\/attributions/.test(html),
             'footer carries the mandatory provider attribution with clickable links');
      const attribCtrlCount = (allSrc.match(/attributionControl:\s*\{\s*compact:\s*true\s*\}/g) || []).length;
      assert(attribCtrlCount >= 2, 'both MapLibre views show compact OSM/CARTO attribution');

      /* ---- Privacy policy matches the real architecture ---- */
      assert(privacyHtml.includes('В целях обеспечения отказоустойчивости сервиса') &&
             privacyHtml.includes('резервными провайдерами') &&
             privacyHtml.includes('BigDataCloud') && privacyHtml.includes('CARTO') &&
             privacyMd.includes('В целях обеспечения отказоустойчивости сервиса') && privacyMd.includes('BigDataCloud'),
             'privacy policy discloses fallback geodata providers (BigDataCloud, CARTO)');
      assert(privacyHtml.includes('localStorage / Cache API') &&
             privacyHtml.includes('очистку данных сайта в настройках браузера') &&
             privacyMd.includes('localStorage / Cache API') && privacyMd.includes('очистку данных сайта в настройках браузера'),
             'privacy policy documents local-only city history (localStorage / Cache API)');

      /* ---- Basemap tiles wait for the ToS consent ---- */
      assert(!/initMap\s*\(/.test(appSrc),
             'no map initialisation runs on the boot path (the map stack is lazy)');
      const facadeOpen = appSrc.match(/open\(opts\) \{[\s\S]{0,160}/);
      assert(!!facadeOpen && /consentLocked\(\)\) return;/.test(facadeOpen[0]),
             'the lazy map loader refuses map requests while the ToS consent is locked');
      assert(/!consentLocked\(\)\) initMap\(\);/.test(lazySrc),
             'the lazy module itself skips map tile init while consent is locked');
      assert(/flagUrl\(/.test(appSrc) && !/flagcdn/.test(appSrc),
             'country flags resolve from self-hosted SVG assets only');

      /* Regression: even a previously valid record must not let the legal-page
         "На главную" route bypass the consent dialog. Only the inline gate is
         needed for this pre-render test; external scripts are intentionally not loaded. */
      const forcedReturnDom = new JSDOM(html, {
        url: 'https://livesky.local/index.html?consent=required',
        runScripts: 'dangerously',
        beforeParse(w) {
          w.localStorage.setItem('livesky:legal_consent', JSON.stringify({
            accepted: true, version: '3.0', terms: true, privacy: false, ts: Date.now()
          }));
          w.localStorage.setItem('livesky:legal_accepted', 'true');
          w.localStorage.setItem('livesky:tos_accepted', 'true');
        }
      });
      assert(forcedReturnDom.window.document.documentElement.classList.contains('consent-locked') &&
             forcedReturnDom.window.localStorage.getItem('livesky:legal_consent') === null &&
             forcedReturnDom.window.localStorage.getItem('livesky:legal_accepted') === null &&
             forcedReturnDom.window.localStorage.getItem('livesky:tos_accepted') === null &&
             forcedReturnDom.window.sessionStorage.getItem('livesky:legal_consent_required') === 'true',
             'terms-page return revokes stale ToS and keeps the app locked');
      assert(!new URL(forcedReturnDom.window.location.href).searchParams.has('consent'),
             'one-time consent query is removed to avoid re-locking after acceptance');
      forcedReturnDom.window.close();

      /* Release signing configuration and CI workflow */
      const appGradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
      assert(appGradle.includes('signingConfigs') && appGradle.includes('KEYSTORE_PASSWORD') && appGradle.includes('KEYSTORE_BASE64'),
             'android/app/build.gradle contains release signingConfigs with environment variables');
      const releaseWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'android-release.yml'), 'utf8');
      assert(releaseWorkflow.includes('assembleRelease') && releaseWorkflow.includes('KEYSTORE_BASE64') && releaseWorkflow.includes('upload-artifact'),
             '.github/workflows/android-release.yml exists and builds signed release APK');
    }
    assert(typeof nativeBackHandler === 'function', 'Capacitor back-button listener accepts a direct listener handle');
    assert(q('boot-error').classList.contains('hidden'), 'Capacitor native bridge does not block application startup');

    /* Legal consent modal tests */
    assert(q('consent-modal') !== null, 'consent modal element exists in DOM');
    assert(!q('consent-modal').classList.contains('hidden'), 'consent modal is displayed on first launch');
    assert(document.documentElement.classList.contains('consent-locked'), 'document is hard-locked until consent is given');
    assert(/consent-locked/.test(html) &&
           /CONSENT_KEY\s*=\s*'livesky:legal_consent'/.test(html) &&
           /localStorage.getItem\(CONSENT_KEY\)/.test(html),
           'index.html locks the UI in an inline pre-render script');
    const consentCss = fs.readFileSync(path.join(DOCS, 'css', 'app.css'), 'utf8');
    assert(/html\.consent-locked body > \*:not\(#consent-modal\)/.test(consentCss),
           'CSS makes everything but the consent dialog unreachable while locked');
    assert(q('consent-modal').querySelector('a[href*="terms.html"]') !== null,
           'ToS modal contains a link to the terms of service');
    assert(q('consent-modal').querySelector('a[href*="privacy.html"]') === null,
           'ToS modal does not require the Privacy Policy');
    assert(/вероятност|AS IS|как есть/i.test(q('consent-modal').textContent),
           'ToS modal warns that forecasts are probabilistic and provided AS IS');
    assert(q('consent-accept-btn') !== null && q('consent-accept-btn').disabled !== true,
           'ToS has a single enabled Accept-and-continue button');
    assert(/принять и продолжить/i.test(q('consent-accept-btn').textContent),
           'ToS button is labelled Accept and continue');
    q('consent-accept-btn').click();
    assert(q('consent-modal').classList.contains('hidden'), 'consent modal closes after accepting ToS');
    assert(!document.documentElement.classList.contains('consent-locked'), 'document unlocks only after a valid ToS');
    assert(window.localStorage.getItem('livesky:legal_accepted') === 'true', 'legal acceptance is persisted in localStorage');
    assert(window.localStorage.getItem('livesky:tos_accepted') === 'true', 'ToS acceptance is persisted in localStorage');
    {
      const rec = JSON.parse(window.localStorage.getItem('livesky:legal_consent'));
      assert(rec && rec.accepted === true && rec.terms === true && rec.privacy !== true &&
             rec.version === '3.0' && typeof rec.ts === 'number',
             'consent record stores ToS only (privacy is independent) plus version and timestamp');
      /* Sequential Step 2 opens immediately after ToS, before any geolocation. */
      assert(q('privacy-modal') !== null && !q('privacy-modal').classList.contains('hidden'),
             'privacy modal opens sequentially right after ToS');
      assert(window.localStorage.getItem('livesky:privacy_accepted') !== 'true',
             'accepting ToS does not grant privacy / geolocation consent');

      /* tampering / clearing the record must lock the app again */
      window.localStorage.setItem('livesky:legal_consent', JSON.stringify({ accepted: true, version: '0.1', terms: true, privacy: true, ts: Date.now() }));
      window.dispatchEvent(new window.Event('focus'));
      assert(!q('consent-modal').classList.contains('hidden') && document.documentElement.classList.contains('consent-locked'),
             'outdated consent version re-locks the app');
      window.localStorage.setItem('livesky:legal_consent', JSON.stringify(rec));
      q('consent-accept-btn').click();
      assert(q('consent-modal').classList.contains('hidden'), 'valid consent restores access');

      /* Returning from the Terms page overrides even a valid stored record until
         the user explicitly confirms again. */
      window.sessionStorage.setItem('livesky:legal_consent_required', 'true');
      window.dispatchEvent(new window.Event('focus'));
      assert(!q('consent-modal').classList.contains('hidden') && document.documentElement.classList.contains('consent-locked'),
             'fresh-consent marker re-locks an already accepted app');
      q('consent-accept-btn').click();
      assert(q('consent-modal').classList.contains('hidden') &&
             window.sessionStorage.getItem('livesky:legal_consent_required') === null,
             'explicit confirmation clears the marker and restores access');
    }

    /* Sequential Step 2 + just-in-time geo button. */
    assert(q('privacy-modal') !== null, 'privacy consent modal exists in DOM');
    assert(!q('privacy-modal').classList.contains('hidden'), 'privacy modal is showing after the ToS step');
    {
      const geoCount = () => {
        const probe = document.createElement('script');
        probe.textContent = 'window.__geoN = state.geoRequests || 0;';
        document.body.appendChild(probe);
        return window.__geoN || 0;
      };
      assert(geoCount() === 0, 'geolocation has not run before the user decides on Step 2');
      assert(/геолокац|Open-Meteo|Политик/i.test(q('privacy-modal').textContent),
             'privacy modal explains why location is needed and links the policy');
      assert(q('privacy-cancel-btn') !== null && q('privacy-accept-btn') !== null,
             'privacy modal has Decline and Allow buttons');

      q('privacy-cancel-btn').click();
      assert(q('privacy-modal').classList.contains('hidden'), 'privacy modal closes on Decline');
      assert(geoCount() === 0, 'Decline aborts geolocation (no native API call)');
      assert(window.localStorage.getItem('livesky:privacy_accepted') === 'false',
             'Decline persists privacy_accepted = false');
      assert(q('location').textContent === 'Москва', 'Decline keeps the default city');

      q('geo-item').click();
      assert(!q('privacy-modal').classList.contains('hidden'), 'privacy modal reappears when the user later taps geolocation');
      q('privacy-accept-btn').click();
      assert(q('privacy-modal').classList.contains('hidden'), 'privacy modal closes on Allow');
      assert(window.localStorage.getItem('livesky:privacy_accepted') === 'true',
             'Allow persists privacy_accepted in localStorage');
      assert(geoCount() === 1, 'Allow continues to the Geolocation API');

      q('geo-item').click();
      assert(q('privacy-modal').classList.contains('hidden'), 'accepted privacy is not asked again');
      assert(geoCount() === 2, 'later geolocation clicks proceed immediately');
      if (q('loader')) q('loader').classList.add('done');
    }

    /* Footer & Menu legal links */
    assert(document.querySelector('.site-footer a[href*="legal/terms.html"]') !== null &&
           document.querySelector('.site-footer a[href*="legal/privacy.html"]') !== null,
           'site footer contains links to legal terms and privacy policy');
    assert(document.querySelector('#main-menu a[href*="legal/terms.html"]') !== null &&
           document.querySelector('#main-menu a[href*="legal/privacy.html"]') !== null,
           'settings / main-menu contains links to legal terms and privacy policy');

    assert(q('loader').classList.contains('done'), 'loader hidden after data load');
    assert(/[-\d]+°/.test(q('temperature').textContent), 'temperature rendered: ' + q('temperature').textContent);
    assert(!q('temp-unit'), 'double degree span removed');
    assert(/^-?\d+°$/.test(q('temperature').textContent), 'single degree sign: ' + q('temperature').textContent);
    assert(!q('feels-line'), 'feels-like line removed (no duplication)');
    assert(q('m-feels') !== null, 'feels-like metric kept in grid');
    assert(q('condition').textContent.length > 1, 'condition label rendered: ' + q('condition').textContent);
    assert(!q('rain-status').classList.contains('hidden'), 'rain status visible next to temperature');
    {
      const pl = q('m-precip-label').textContent.trim();
      assert(pl === 'Дождь сегодня' || pl === 'Дождь за 24 часа', 'rain tile label is clear: ' + pl);
    }
    assert(q('map-card').querySelector('.map-placeholder') !== null, 'map placeholder exists behind tiles');
    assert(q('geo-item') !== null, 'geolocation moved into the unified menu');
    assert(q('loader') !== null && q('loader').querySelector('.loader-orb') !== null, 'premium loader orb exists');
    assert(q('loader').querySelector('.loader-bar') !== null, 'loader progress bar exists');
    {
      const rs = q('rain-status-text').textContent;
      assert(/Вероятность дождя сейчас|Дождь закончится|Снег закончится|Дождь весь день|Дождь через|Снег через|Дождь вот-вот|Снег вот-вот|Идёт|заканчивается/.test(rs), 'rain status is smart (prob or end/start time): ' + rs);
    }
    /* Chart has minute-precision scrub surface (no separate minutely block). */
    assert(q('chart-scrub') !== null, 'chart scrub hit-target exists');
    assert(q('chart-guide') !== null && q('chart-guide-dot') !== null, 'chart guide handle exists');
    {
      const cssSrc2 = fs.readFileSync(path.join(DOCS, 'css', 'app.css'), 'utf8');
      const plot = cssSrc2.match(/\.chart-plot\s*\{[^}]*\}/s);
      assert(plot && /touch-action:\s*none/.test(plot[0]), 'chart plot owns touch for finger scrubbing');
      assert(cssSrc2.includes('chart-scrub'), 'chart scrub styles present');
    }
    assert(q('map-radar-badge') !== null, 'map radar badge exists');
    assert(q('radar-opacity') !== null && q('radar-speed') !== null && q('radar-live') !== null, 'radar controls exist');

    /* ---- lazy map/radar loading (first user request simulation) ---- */
    {
      const lazyTags = () => document.querySelectorAll('script[src*="11-map-radar"]');
      assert(typeof window.RADAR === 'undefined', 'radar module is NOT executed during boot');
      assert(window.LiveSkyMap && !window.LiveSkyMap.isLoaded(), 'LiveSkyMap loader starts unloaded');
      assert(lazyTags().length === 0, 'no lazy map script tag exists before the first request');
      const lazyP1 = window.LiveSkyMap.load();
      const lazyP2 = window.LiveSkyMap.load();
      lazyP1.catch(() => {}); lazyP2.catch(() => {}); /* jsdom never fetches src scripts */
      assert(lazyP1 === lazyP2, 'concurrent load() calls share one promise');
      assert(lazyTags().length === 1, 'the loader inserts the lazy module exactly once');
      assert(q('map-card').classList.contains('loading'), 'mini-map card shows a loading state during the first fetch');
      /* Deliver the module like the network would (jsdom does not fetch src scripts). */
      const lazyScript = document.createElement('script');
      lazyScript.textContent = lazySrc;
      document.body.appendChild(lazyScript);
      assert(window.LiveSkyMap.isLoaded(), 'lazy map module registered itself after execution');
      window.LiveSkyMap.load().catch(() => {});
      assert(lazyTags().length === 1, 'load() after registration never inserts a second script');
      /* The user lands on the expected screen without a second tap. */
      window.LiveSkyMap.open();
      assert(q('map-modal').classList.contains('open'), 'lazy map opens the fullscreen map directly');
      window.LiveSkyMap.close();
      assert(!q('map-modal').classList.contains('open'), 'lazy map closes cleanly');
      assert(typeof window.closeFullMap === 'function', 'map globals become available after lazy load');
      /* Facade wrappers must be safe no-ops AND working passthroughs. */
      window.LiveSkyMap.update();
      window.LiveSkyMap.refreshTiles();
      window.LiveSkyMap.radarRefresh();
      window.LiveSkyMap.radarPause();
      assert(window.LiveSkyMap.radarActive() === false, 'radar is inactive until enabled');

      /* ---- device-aware prefetch heuristic ----
         jsdom reports 2 CPU cores → the default world must count as weak and
         stay fully lazy. Overriding the hardware signals flips the decision. */
      assert(window.LiveSkyMap.shouldPrefetch() === false,
        'weak device (few CPU cores) keeps the map lazy');
      Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 8, configurable: true });
      Object.defineProperty(window.navigator, 'deviceMemory', { value: 8, configurable: true });
      assert(window.LiveSkyMap.shouldPrefetch() === true,
        'capable device (8 cores / 8 GB) qualifies for the background prefetch');
      delete window.navigator.hardwareConcurrency;
      delete window.navigator.deviceMemory;
      {
        const probe = document.createElement('script');
        probe.textContent = `
          Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true });
          const eff = state.effects;
          state.effects = 'eco';
          const ecoLazy = LiveSkyMap.shouldPrefetch();
          state.effects = 'full';
          const fullEager = LiveSkyMap.shouldPrefetch();
          state.effects = eff;
          delete navigator.hardwareConcurrency;
          window.__prefetchProbe = { ecoLazy, fullEager };`;
        document.body.appendChild(probe);
        const pp = window.__prefetchProbe || {};
        assert(pp.ecoLazy === false, 'Eco quality preset always keeps the map lazy');
        assert(pp.fullEager === true, 'Maximum quality preset forces the map prefetch even on weak hardware');
      }
    }

    {
      const probe = document.createElement('script');
      probe.textContent = `window.__radarProbe = { hasEnsureLayers: typeof RADAR.ensureLayers === 'function', hasRenderFrame: typeof RADAR.renderFrame === 'function', tileSize: RADAR.tileSize() };
        window.__chartProbe = { hasSample: typeof chartSampleAt === 'function', hasShow: typeof showChartAtFrac === 'function', meta: !!chartMeta, n: chartData.length };`;
      document.body.appendChild(probe);
      const rp = window.__radarProbe || {};
      assert(rp.hasEnsureLayers && rp.hasRenderFrame, 'radar dual-layer API exists');
      assert(rp.tileSize === 256, 'radar uses stable 256px tiles: ' + rp.tileSize);
      const cp = window.__chartProbe || {};
      assert(cp.hasSample && cp.hasShow && cp.meta && cp.n >= 2, 'chart minute-scrub API ready: ' + JSON.stringify(cp));
    }
    assert(q('location').textContent === 'Москва', 'default location: ' + q('location').textContent);
    assert(q('hourly-strip').children.length === 24, 'hourly strip has 24 items');
    assert(q('daily-strip').children.length === 8, 'daily strip has 7 days + more button');
    assert(q('chart-scroll') && q('chart-scroll').contains(q('chart-plot')), 'temperature chart is inside its horizontal scroll viewport');
    assert(q('chart-scroll').getAttribute('tabindex') === '0', 'temperature chart scroller is keyboard focusable');
    assert(/Тяните|минут/i.test(q('chart-swipe-hint').textContent), 'temperature chart has a minute-scrub gesture hint: ' + q('chart-swipe-hint').textContent);
    assert(q('chart-svg').querySelectorAll('path').length >= 2, 'chart svg has paths');
    assert(q('chart-rain-summary') !== null, 'chart rain summary exists');
    {
      const svg = q('chart-svg').innerHTML;
      const hasHatch = /tempUnderClip/.test(svg) && /rainHatch_/.test(svg);
      const badges = q('chart-plot').querySelectorAll('.crm-badge').length;
      const sum = q('chart-rain-summary').textContent;
      assert(hasHatch || /Дождь|Rain|Без осадков|No rain/.test(sum), 'chart shows rain hatching under temp line or dry summary: ' + sum.slice(0, 80));
      assert(badges >= 1 || /Без осадков|No rain/.test(sum), 'rain badges on temp line (or dry): ' + badges);
      /* Chips must show HH:MM (minutes), never bare hours like "14–17". */
      if (!/Без осадков|No rain/.test(sum)) {
        assert(/\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/.test(sum), 'rain chips use minute precision HH:MM–HH:MM: ' + sum.slice(0, 100));
      }
      /* refineBandMinutes + labels exist on chartMeta bands */
      const probe = document.createElement('script');
      probe.textContent = `window.__bandProbe = (chartMeta && chartMeta.bands || []).map(b => ({a:b.startLabel,b:b.endLabel,p:!!b.precise}));`;
      document.body.appendChild(probe);
      const bp = window.__bandProbe || [];
      if (bp.length) {
        assert(bp.every(x => x.a && x.b && /\d{2}:\d{2}/.test(x.a) && /\d{2}:\d{2}/.test(x.b)), 'every band has HH:MM labels: ' + JSON.stringify(bp));
      }
    }
    assert(q('sun-arc').querySelectorAll('path').length >= 1, 'sun arc rendered');
    assert(q('chart-axis').children.length === 5, 'chart axis 5 labels');
    assert(q('m-wind').textContent !== '--', 'wind metric: ' + q('m-wind').textContent);
    assert(q('m-wind-dir').textContent.includes('Запад'), 'wind direction is a full word (not "З"): ' + q('m-wind-dir').textContent);
    assert(q('m-wind-dir').textContent.includes('Порывы'), 'wind tile shows gusts');
    assert(document.querySelectorAll('.metric-ico').length === 8, 'metrics redesigned with icon chips');
    assert(q('m-press').textContent !== '--', 'pressure metric');
    assert(q('aqi-value').textContent !== '--', 'AQI value: ' + q('aqi-value').textContent);
    assert(/Норма|Чуть|Много|OK|High|—/.test(q('aqi-pm25').textContent), 'AQI PM shows plain level not µg: ' + q('aqi-pm25').textContent);
    assert(q('aqi-card').textContent.includes('Мелкая пыль') || q('aqi-card').textContent.includes('Fine dust'), 'AQI card uses plain dust label');
    assert(q('m-wind-arrow').style.transform.includes('deg'), 'wind arrow rotated');
    assert(q('alert-box').classList.contains('hidden'), 'no alert in calm weather');
    /* Hazard engine: minute-aware multi-type alerts */
    {
      const probe = document.createElement('script');
      probe.textContent = `
        // Inject a storm + wind hour into current weather and re-render alerts
        const h = state.weather.hourly;
        const i = state.nowIdx + 2;
        if (h.weathercode) h.weathercode[i] = 95;
        if (h.weathercode_best_match) h.weathercode_best_match[i] = 95;
        if (h.windgusts_10m) h.windgusts_10m[i] = 30;
        if (h.windgusts_10m_best_match) h.windgusts_10m_best_match[i] = 30;
        if (h.windspeed_10m) h.windspeed_10m[i] = 22;
        if (h.windspeed_10m_best_match) h.windspeed_10m_best_match[i] = 22;
        renderAlerts();
        const list = collectHazardAlerts(24);
        window.__alertProbe = {
          visible: !document.getElementById('alert-box').classList.contains('hidden'),
          msg: document.getElementById('alert-msg').textContent,
          types: list.map(a => a.type),
          hasMin: list.some(a => a.t && /\\d{2}:\\d{2}/.test(a.t.slice(11,16))),
          sample: list[0] ? { type: list[0].type, t: list[0].t, abs: list[0].abs } : null
        };
        // restore calm for later tests
        if (h.weathercode) h.weathercode[i] = 2;
        if (h.weathercode_best_match) h.weathercode_best_match[i] = 2;
        if (h.windgusts_10m) h.windgusts_10m[i] = 11;
        if (h.windgusts_10m_best_match) h.windgusts_10m_best_match[i] = 11;
        if (h.windspeed_10m) h.windspeed_10m[i] = 7;
        if (h.windspeed_10m_best_match) h.windspeed_10m_best_match[i] = 7;
        renderAlerts();
      `;
      document.body.appendChild(probe);
      const ap = window.__alertProbe || {};
      assert(ap.visible, 'alert banner shows when hazards injected');
      assert(/Гроза|Ливень|Ветер|Шторм|Storm|Wind|Gale|Tormenta|Viento/i.test(ap.msg || ''), 'alert message is human: ' + ap.msg);
      assert(/мин|now|сейчас|через|in |en |\d{2}:\d{2}/i.test(ap.msg || ''), 'alert has minute timing: ' + ap.msg);
      assert((ap.msg || '').length < 56, 'alert message is short: ' + (ap.msg || '').length + ' chars — ' + ap.msg);
      assert(/\d{2}:\d{2}/.test(ap.msg || ''), 'alert shows HH:MM minutes: ' + ap.msg);
      assert(ap.types && ap.types.includes('storm'), 'hazard list includes storm: ' + JSON.stringify(ap.types));
      assert(ap.types.some(t => t === 'wind' || t === 'wind_extreme'), 'hazard list includes wind: ' + JSON.stringify(ap.types));
      assert(q('alert-box').classList.contains('hidden'), 'alert hidden again after restore');
    }
    assert(q('location-admin').textContent.includes('140'), 'elevation shown in admin line');
    assert(/temp-(frigid|cold|mild|warm|hot)/.test(q('temperature').className), 'temperature has colour class');

    /* interactions */
    window.setLang('en');
    assert(q('theme-label').textContent === 'Adaptive', 'theme label en: ' + q('theme-label').textContent);
    assert(q('city-input').placeholder === 'Search city...', 'placeholder en');
    window.setLang('ru');

    /* unified menu */
    q('menu-btn').click();
    assert(q('main-menu').classList.contains('open'), 'unified menu opens');
    assert(q('menu-btn').getAttribute('aria-expanded') === 'true', 'menu aria-expanded');
    assert(q('main-menu').querySelector('[data-lang]') && q('main-menu').querySelector('[data-theme-pick]'), 'menu has lang + theme items');
    assert(q('fs-item') !== null && q('refresh-item') !== null, 'menu has fullscreen + refresh actions');
    q('main-menu').querySelector('[data-lang="en"]').click();
    assert(q('theme-label').textContent === 'Adaptive', 'lang pick via menu (theme label en)');
    assert(q('city-input').placeholder === 'Search city...', 'lang pick via menu (placeholder)');
    assert(!q('main-menu').classList.contains('open'), 'menu closes after language pick');
    window.setLang('ru');
    q('menu-btn').click();
    q('main-menu').querySelector('[data-theme-pick="light"]').click();
    assert(document.documentElement.dataset.theme === 'light', 'theme pick via menu works');
    assert(!q('main-menu').classList.contains('open'), 'menu closes after theme pick');
    window.setTheme('adaptive');

    /* autocomplete keyboard navigation */
    q('fav-btn').click(); /* add current city to favorites so the list has items */
    q('city-input').focus();
    q('city-input').dispatchEvent(new window.Event('focus'));
    assert(!q('autocomplete-list').classList.contains('hidden'), 'autocomplete opens on focus');
    q('city-input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert(q('autocomplete-list').querySelector('.ac-item.active') !== null, 'arrow key highlights autocomplete item');
    q('city-input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(q('autocomplete-list').classList.contains('hidden'), 'escape closes autocomplete');
    q('fav-btn').click(); /* remove favorite again */

    /* search clear button */
    q('city-input').value = 'abc';
    q('city-input').dispatchEvent(new window.Event('input'));
    assert(!q('search-clear').classList.contains('hidden'), 'clear button appears when typing');
    q('search-clear').click();
    assert(q('city-input').value === '' && q('search-clear').classList.contains('hidden'), 'clear button clears input');

    /* chart detail bar + minute scrub */
    assert(q('chart-detail') !== null, 'chart detail bar exists');
    assert(q('chart-detail').innerHTML.length > 20, 'detail bar filled by default');
    assert(/°/.test(q('chart-detail').textContent), 'detail bar shows temperature degrees (not --)');
    {
      const probe = document.createElement('script');
      probe.textContent = `
        const s0 = chartSampleAt(0);
        const sHalf = chartSampleAt(0.5);
        const s1 = chartSampleAt(1);
        window.__scrubProbe = {
          t0: s0 && s0.temp, tHalf: sHalf && sHalf.temp, t1: s1 && s1.temp,
          when0: s0 && s0.when, whenHalf: sHalf && sHalf.when,
          guide: document.getElementById('chart-guide').style.opacity
        };
        showChartAtFrac(2.25);
        window.__scrubProbe.after = document.getElementById('chart-detail').textContent;
        window.__scrubProbe.guideAfter = document.getElementById('chart-guide').style.opacity;
        window.__scrubProbe.whenAfter = chartSampleAt(2.25).when;
      `;
      document.body.appendChild(probe);
      const sp = window.__scrubProbe || {};
      assert(sp.t0 != null && !isNaN(sp.t0), 'chart sample at 0 has temp: ' + sp.t0);
      assert(sp.tHalf != null && !isNaN(sp.tHalf), 'chart sample mid-hour has temp (minutes): ' + sp.tHalf);
      assert(sp.whenHalf && /:/.test(sp.whenHalf) && !/:00$/.test(sp.whenHalf), 'mid-hour label shows minutes: ' + sp.whenHalf);
      assert(sp.guideAfter === '1', 'guide visible while scrubbing');
      assert(/°/.test(sp.after), 'detail still shows degrees after scrub');
      assert(sp.whenAfter && sp.whenAfter.includes(':'), 'scrubbed time label: ' + sp.whenAfter);
      /* simulate finger drag on scrub surface */
      const scrub = q('chart-scrub');
      const rect = { left: 0, width: 400, top: 0, height: 190 };
      scrub.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 190, right: 400, bottom: 190, x: 0, y: 0, toJSON(){} });
      q('chart-plot').getBoundingClientRect = scrub.getBoundingClientRect;
      scrub.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 40, pointerId: 1, pointerType: 'touch', button: 0 }));
      scrub.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, clientX: 260, clientY: 40, pointerId: 1, pointerType: 'touch' }));
      scrub.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, clientX: 260, clientY: 40, pointerId: 1, pointerType: 'touch' }));
      assert(q('chart-guide').style.opacity === '1', 'guide stays visible after touch scrub');
      assert(/°/.test(q('chart-detail').textContent), 'detail shows temp after touch scrub');
    }
    /* air quality detail modal — plain language, no abstract sparklines */
    q('aqi-card').click();
    assert(q('modal').classList.contains('open'), 'air quality card opens detail modal');
    assert(q('modal-body').querySelector('.air-day-strip') !== null, 'air modal has simple hour strip');
    assert(q('modal-body').querySelectorAll('.air-poll-card .air-bar').length === 4, 'air modal has 4 level bars');
    assert(q('modal-body').innerHTML.includes('Совет') || q('modal-body').innerHTML.includes('Tip'), 'air modal has short advice');
    assert(q('modal-body').textContent.includes('Мелкая пыль') || q('modal-body').textContent.includes('Fine dust'), 'air modal uses plain pollutant names');
    q('modal-close').click();

    window.showAdvice();
    assert(q('modal').classList.contains('open'), 'advice modal opens');
    assert(document.body.classList.contains('no-scroll'), 'body scroll locked on modal');
    assert(q('modal-body').innerHTML.includes('Что надеть'), 'advice modal has wear note');
    q('modal-close').click();
    assert(!q('modal').classList.contains('open'), 'modal closes');
    assert(!document.body.classList.contains('no-scroll'), 'body scroll unlocked after close');

    window.showMonthly('forecast');
    assert(q('modal-body').querySelectorAll('.mo-row').length === 17, 'forecast modal rows (16 days + today)');
    q('modal-close').click();
    window.showMonthly('history');
    assert(q('modal-body').querySelectorAll('.mo-row').length === 16, 'history modal rows');
    q('modal-close').click();

    window.showLifestyle('run');
    assert(q('modal').classList.contains('open'), 'lifestyle modal opens');
    q('modal-close').click();

    window.showSunDetails();
    assert(q('modal').classList.contains('open'), 'sun modal opens');
    assert(q('modal-body').innerHTML.includes('Фаза луны'), 'sun modal shows moon phase');
    q('modal-close').click();

    /* hourly modal via click on strip item */
    q('hourly-strip').firstChild.click();
    assert(q('modal').classList.contains('open'), 'hourly modal opens');
    assert(q('modal-body').querySelector('.m-tile') !== null, 'hourly modal has tiles');
    q('modal-close').click();

    /* favorite toggle + persistence */
    const before = q('fav-icon').classList.contains('ph-fill');
    q('fav-btn').click();
    assert(q('fav-icon').classList.contains('ph-fill') !== before, 'favorite toggles');
    q('fav-btn').click();

    /* theme cycle */
    window.cycleTheme();
    assert(document.documentElement.dataset.theme === 'light', 'theme cycles to light');
    window.cycleTheme();
    assert(document.documentElement.dataset.theme === 'dark', 'theme cycles to dark');
    window.cycleTheme();
    assert(document.documentElement.dataset.theme === 'adaptive', 'theme cycles back');

    /* search */
    q('city-input').value = 'Санкт-Петербург';
    q('search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    setTimeout(() => {
      try {
        assert(q('location').textContent === 'Санкт-Петербург', 'search changes city: ' + q('location').textContent);
        assert(q('updated-chip').classList.contains('hidden') === false, 'updated chip visible');
        const recent = JSON.parse(window.localStorage.getItem('livesky:recent') || '[]');
        assert(recent.length > 0 && recent[0].name === 'Санкт-Петербург', 'recent city saved');
        const favs = JSON.parse(window.localStorage.getItem('livesky:favorites') || '[]');
        assert(Array.isArray(favs), 'favorites storage works');
        /* after closing the fullscreen map the autocomplete must NOT pop up instantly */
        window.closeFullMap();
        q('city-input').focus();
        q('city-input').dispatchEvent(new window.Event('focus'));
        assert(q('autocomplete-list').classList.contains('hidden'), 'autocomplete stays closed right after closing fullscreen map');
        setTimeout(() => {
          try {
            q('city-input').blur();
            q('city-input').focus();
            q('city-input').dispatchEvent(new window.Event('focus'));
            assert(!q('autocomplete-list').classList.contains('hidden'), 'autocomplete opens again after the lock expires');
          } catch (e) { errors.push('lock test crashed: ' + e.message); }
          phase2();
        }, 350);
      } finally {
        /* phase2 is chained from the nested timeout above */
      }
    }, 700);
  } catch (e) {
    errors.push('test crashed: ' + e.message + '\n' + e.stack);
    phase2();
  }
}, 900);

/* ================= failure scenarios ================= */
function makeWorld(htmlMod) {
  const d = new JSDOM(html, { url: 'https://livesky.local/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = d.window, doc = d.window.document;
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(w.performance.now()), 16);
  w.cancelAnimationFrame = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.IntersectionObserver = class { observe() {} unobserve() {} };
  w.HTMLElement.prototype.scrollBy = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
  w.maplibregl = { Map: function () { return fakeMap(); }, Marker: function () { return { setLngLat() { return this; }, addTo() { return this; }, remove() {} }; }, Popup: function () { return { setLngLat() { return this; }, setHTML() { return this; }, addTo() { return this; }, remove() {} }; }, NavigationControl: function () {}, AttributionControl: function () {} };
  w.addEventListener('error', (e) => errors.push('window error: ' + e.message));
  return { w, doc };
}

/* phase 2: network hangs forever — watchdog must hide the loader and offer retry */
function phase2() {
  const { w, doc } = makeWorld();
  w.LIVE_WATCHDOG_MS = 1200;
  w.LIVE_FETCH_TIMEOUT_MS = 600000; /* fetch never aborts: only the watchdog can save us */
  w.fetch = () => new Promise(() => {}); /* hangs forever */
  const s1 = doc.createElement('script'); s1.textContent = i18nSrc; doc.body.appendChild(s1);
  const s2 = doc.createElement('script'); s2.textContent = appSrc; doc.body.appendChild(s2);
  const q2 = (id) => doc.getElementById(id);
  setTimeout(() => {
    try {
      assert(q2('loader').classList.contains('done'), 'phase2: watchdog hides loader on hung network');
      assert(q2('boot-error').classList.contains('hidden'), 'phase2: no boot-error panel');
      assert(doc.querySelectorAll('.toast').length >= 1, 'phase2: error toast with retry shown');
      phase3();
    } catch (e) { errors.push('phase2 crashed: ' + e.message); phase3(); }
  }, 2500);
}

/* phase 3: stale page (menu elements missing) — app must boot gracefully, no eternal loader */
function phase3() {
  const { w, doc } = makeWorld();
  w.fetch = makeFetchStub();
  ['menu-btn', 'main-menu', 'search-clear'].forEach((id) => { const n = doc.getElementById(id); if (n) n.remove(); });
  const s1 = doc.createElement('script'); s1.textContent = i18nSrc; doc.body.appendChild(s1);
  const s2 = doc.createElement('script'); s2.textContent = appSrc; doc.body.appendChild(s2);
  const q3 = (id) => doc.getElementById(id);
  setTimeout(() => {
    try {
      assert(q3('loader').classList.contains('done'), 'phase3: boots fine without menu elements');
      assert(/[^--]+/.test(q3('temperature').textContent), 'phase3: data rendered');
      assert(q3('boot-error').classList.contains('hidden'), 'phase3: no boot-error panel');
      phase4();
    } catch (e) { errors.push('phase3 crashed: ' + e.message); phase4(); }
  }, 1200);
}

/* phase 4: i18n script missing — boot-error panel must replace the loader */
function phase4() {
  const { w, doc } = makeWorld();
  w.fetch = makeFetchStub();
  const s2 = doc.createElement('script'); s2.textContent = appSrc; doc.body.appendChild(s2);
  const q4 = (id) => doc.getElementById(id);
  setTimeout(() => {
    try {
      assert(q4('loader').classList.contains('done'), 'phase4: loader hidden on boot failure');
      assert(!q4('boot-error').classList.contains('hidden'), 'phase4: boot-error panel shown');
      phase5();
    } catch (e) { errors.push('phase4 crashed: ' + e.message); phase5(); }
  }, 800);
}

/* phase 5 (regression, Smart Visibility v2): on a real device the browser's
   IntersectionObserver fires immediately for visible sections and calls
   SECTION_MANAGER.activate('chart'/'hourly'/'daily') BEFORE the first fetch
   has resolved (state.weather === null). This used to crash with
   "Cannot read properties of null (reading 'hourly')". The manager must:
     1) not throw,
     2) keep those sections dirty (render skipped — no data yet),
     3) render them and clear dirty as soon as the slow fetch resolves. */
function phase5() {
  const { w, doc } = makeWorld();
  let releaseFetch;
  const gate = new Promise((res) => { releaseFetch = res; });
  const stub = makeFetchStub();
  w.fetch = (url) => gate.then(() => stub(url)); /* slow network: nothing resolves until we say so */
  const s1 = doc.createElement('script'); s1.textContent = i18nSrc; doc.body.appendChild(s1);
  const s2 = doc.createElement('script'); s2.textContent = appSrc; doc.body.appendChild(s2);

  /* SECTION_MANAGER / state are top-level consts inside the page, not window
     globals — poke them from an injected inline script, like a devtools call. */
  const probe = doc.createElement('script');
  probe.textContent = `
    try {
      const names = ['chart', 'hourly', 'daily'];
      const res = { threw: null, weatherNull: state.weather === null, dirtyBefore: {}, dirtyAfter: {} };
      names.forEach((n) => { res.dirtyBefore[n] = SECTION_MANAGER.sections.get(n).dirty; });
      names.forEach((n) => { const s = SECTION_MANAGER.sections.get(n); SECTION_MANAGER.activate(n, s.el); });
      names.forEach((n) => { res.dirtyAfter[n] = SECTION_MANAGER.sections.get(n).dirty; });
      window.__sectionProbe = res;
    } catch (e) { window.__sectionProbe = { threw: e.message }; }
  `;
  doc.body.appendChild(probe);
  const p = w.__sectionProbe || { threw: 'probe did not run' };
  assert(p.threw == null, 'phase5: activate() before first fetch does not throw (' + (p.threw || 'ok') + ')');
  assert(p.weatherNull === true, 'phase5: probe ran while state.weather was still null');
  assert(p.dirtyBefore && p.dirtyBefore.chart === true, 'phase5: sections start dirty (nothing rendered yet)');
  assert(p.dirtyAfter && p.dirtyAfter.chart === true && p.dirtyAfter.hourly === true && p.dirtyAfter.daily === true,
    'phase5: sections stay dirty when render is skipped (no data yet)');

  releaseFetch(); /* the slow network finally answers */
  setTimeout(() => {
    try {
      const q5 = (id) => doc.getElementById(id);
      assert(q5('hourly-strip').children.length > 0, 'phase5: hourly section renders once the slow fetch resolves');
      const probe2 = doc.createElement('script');
      probe2.textContent = `
        window.__sectionProbe2 = {
          chart: SECTION_MANAGER.sections.get('chart').dirty,
          hourly: SECTION_MANAGER.sections.get('hourly').dirty,
          daily: SECTION_MANAGER.sections.get('daily').dirty
        };
      `;
      doc.body.appendChild(probe2);
      const p2 = w.__sectionProbe2 || {};
      assert(p2.chart === false && p2.hourly === false && p2.daily === false,
        'phase5: dirty flags cleared after the sections actually rendered');

      /* Regression: unloading and restoring the chart used to render while its
         card was detached. The global id lookup then missed the cached summary
         and injected another "No rain" chip on every restore. */
      const probe3 = doc.createElement('script');
      probe3.textContent = `
        const chartSection = SECTION_MANAGER.sections.get('chart');
        SECTION_MANAGER.unload('chart', chartSection.el);
        SECTION_MANAGER.activate('chart', chartSection.el);
        window.__chartSummaryCount = chartSection.el.querySelectorAll('#chart-rain-summary').length;
      `;
      doc.body.appendChild(probe3);
      assert(w.__chartSummaryCount === 1,
        'phase6: chart restore keeps exactly one rain summary (' + w.__chartSummaryCount + ')');
      phase6();
    } catch (e) { errors.push('phase5 crashed: ' + e.message); phase6(); }
  }, 900);
}

/* phase 6 (lazy map loader): the map module is off the boot path. Requests are
   refused while the ToS dialog is up; a failed script load must surface an
   error toast with a working retry instead of hanging the UI. */
function phase6() {
  const { w, doc } = makeWorld();
  w.fetch = makeFetchStub();
  const s1 = doc.createElement('script'); s1.textContent = i18nSrc; doc.body.appendChild(s1);
  const s2 = doc.createElement('script'); s2.textContent = appSrc; doc.body.appendChild(s2);
  const q6 = (sel) => doc.querySelector(sel);
  setTimeout(() => {
    try {
      const LM = w.LiveSkyMap;
      const tags = () => doc.querySelectorAll('script[src*="11-map-radar"]');
      assert(LM && !LM.isLoaded(), 'phase6: map subsystem starts unloaded');
      assert(typeof w.RADAR === 'undefined' && tags().length === 0,
        'phase6: boot does not touch the map module');
      /* While the ToS dialog is up, map requests must be refused. */
      LM.open({ radar: true });
      LM.toggleRadar();
      assert(tags().length === 0, 'phase6: loader refuses to fetch the map while consent is locked');
      /* Accept ToS, then request the radar — the loader kicks in. */
      doc.getElementById('consent-accept-btn').click();
      assert(!doc.documentElement.classList.contains('consent-locked'), 'phase6: ToS accepted');
      LM.toggleRadar();
      assert(tags().length === 1, 'phase6: first radar request inserts the lazy script once');
      const firstTag = tags()[0];
      /* Simulate the network failing for that script. */
      if (firstTag && typeof firstTag.onerror === 'function') firstTag.onerror(new w.Event('error'));
      setTimeout(() => {
        try {
          assert(!LM.isLoaded(), 'phase6: failed load leaves the subsystem unloaded');
          assert(tags().length === 0, 'phase6: the failed script tag is cleaned up');
          assert(doc.querySelectorAll('.toast').length >= 1,
            'phase6: failed lazy load surfaces an error toast');
          const retryBtn = q6('.toast .t-action');
          assert(!!retryBtn, 'phase6: the toast offers a retry action');
          retryBtn.click();
          assert(tags().length === 1 && tags()[0] !== firstTag,
            'phase6: retry inserts a fresh script tag');
          phase7();
        } catch (e) { errors.push('phase6 crashed: ' + e.message); phase7(); }
      }, 60);
    } catch (e) { errors.push('phase6 crashed: ' + e.message); phase7(); }
  }, 900);
}

/* phase 7 (device-aware prefetch): on a capable device the map subsystem is
   silently prefetched in the background right after the ToS consent — the
   mini-map appears like the old eager behaviour, and no screen is opened. */
function phase7() {
  const { w, doc } = makeWorld();
  w.LIVE_MAP_PREFETCH_MS = 50; /* fast-forward the prefetch delay */
  /* make this world look like capable hardware (jsdom defaults to 2 cores) */
  Object.defineProperty(w.navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  Object.defineProperty(w.navigator, 'deviceMemory', { value: 8, configurable: true });
  w.fetch = makeFetchStub();
  const s1 = doc.createElement('script'); s1.textContent = i18nSrc; doc.body.appendChild(s1);
  const s2 = doc.createElement('script'); s2.textContent = appSrc; doc.body.appendChild(s2);
  const q7 = (id) => doc.getElementById(id);
  setTimeout(() => {
    try {
      const LM = w.LiveSkyMap;
      const tags = () => doc.querySelectorAll('script[src*="11-map-radar"]');
      /* consent is still locked: the boot-time prefetch must have been refused */
      assert(LM.shouldPrefetch() === false, 'phase7: prefetch refused while the ToS dialog is up');
      assert(tags().length === 0 && !LM.isLoaded(), 'phase7: locked boot prefetches nothing');
      q7('consent-accept-btn').click();
      setTimeout(() => {
        try {
          assert(!doc.documentElement.classList.contains('consent-locked'), 'phase7: ToS accepted');
          assert(LM.shouldPrefetch() === true, 'phase7: capable unlocked device wants the map');
          assert(tags().length === 1, 'phase7: background prefetch fetched the lazy module');
          assert(q7('map-card').classList.contains('loading'), 'phase7: mini-map shows the loading state');
          assert(!q7('map-modal').classList.contains('open'), 'phase7: prefetch does not open any screen');
          /* deliver the module like the network would */
          const s3 = doc.createElement('script'); s3.textContent = lazySrc; doc.body.appendChild(s3);
          const tag = tags()[0];
          if (tag && typeof tag.onload === 'function') tag.onload();
          setTimeout(() => {
            try {
              assert(LM.isLoaded(), 'phase7: prefetched module registered');
              assert(!q7('map-card').classList.contains('loading'), 'phase7: loading state cleared after registration');
              const probe = doc.createElement('script');
              probe.textContent = 'window.__prefetchMapProbe = { miniMapReady: !!(mapInst), fullscreenOpen: !!fullMapInst };';
              doc.body.appendChild(probe);
              const mp = w.__prefetchMapProbe || {};
              assert(mp.miniMapReady === true, 'phase7: mini-map initialised in the background (old eager behaviour)');
              assert(mp.fullscreenOpen === false, 'phase7: fullscreen map not created by the prefetch');
              finish();
            } catch (e) { errors.push('phase7 crashed: ' + e.message); finish(); }
          }, 120);
        } catch (e) { errors.push('phase7 crashed: ' + e.message); finish(); }
      }, 220);
    } catch (e) { errors.push('phase7 crashed: ' + e.message); finish(); }
  }, 300);
}

function finish() {
  console.log('\nERRORS: ' + (errors.length ? errors.join('\n - ') : 'none'));
  process.exit(errors.length ? 1 : 0);
}
