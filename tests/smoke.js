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
window.HTMLElement.prototype.scrollBy = function () {};

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

/* leaflet stub */
const fakeMap = () => ({ setView() { return this; }, removeLayer() { return this; }, invalidateSize() {}, getZoom() { return 10; }, on() {} });
window.L = {
  map: fakeMap,
  tileLayer: () => ({ addTo() { return this; }, setUrl() {} }),
  marker: () => ({ addTo() { return this; }, bindPopup() { return { openPopup() {} }; } }),
  divIcon: (o) => o
};

/* ---- synthetic Open-Meteo data (local time = Europe/Moscow) ---- */
function pad(n) { return String(n).padStart(2, '0'); }
function genForecast() {
  const hourly = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weathercode: [], windspeed_10m: [], windgusts_10m: [], winddirection_10m: [], relativehumidity_2m: [], surface_pressure: [], dewpoint_2m: [], visibility: [], uv_index: [], is_day: [] };
  const daily = { time: [], weathercode: [], temperature_2m_max: [], temperature_2m_min: [], sunrise: [], sunset: [], precipitation_probability_max: [], precipitation_sum: [], uv_index_max: [], windspeed_10m_max: [], winddirection_10m_dominant: [] };
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let dI = -16; dI <= 16; dI++) {
    const day = new Date(base.getTime() + dI * 86400000);
    const ds = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    const rainy = dI % 3 === 0;
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
      hourly.precipitation_probability.push(rainy ? 80 : 5);
      hourly.precipitation.push(rainy ? 0.8 : 0);
      hourly.weathercode.push(rainy ? 61 : 2);
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
  return { timezone: 'Europe/Moscow', timezone_abbreviation: 'GMT+3', elevation: 140, hourly, daily };
}

function genAir() {
  const hourly = { time: [], pm2_5: [], pm10: [], nitrogen_dioxide: [], ozone: [], european_aqi: [] };
  const base = new Date(); base.setHours(0, 0, 0, 0);
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
    throw new Error('unhandled url: ' + u);
  };
}
window.fetch = makeFetchStub();

window.addEventListener('error', (e) => errors.push('window error: ' + e.message));
process.on('unhandledRejection', (r) => errors.push('unhandled rejection: ' + (r && r.message)));

/* ---- run app scripts (as classic inline scripts, like a browser) ---- */
const i18nSrc = fs.readFileSync(path.join(DOCS, 'js', 'i18n.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DOCS, 'js', 'app.js'), 'utf8');
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
    assert(q('loader').classList.contains('done'), 'loader hidden after data load');
    assert(/[-\d]+°/.test(q('temperature').textContent), 'temperature rendered: ' + q('temperature').textContent);
    assert(!q('temp-unit'), 'double degree span removed');
    assert(/^-?\d+°$/.test(q('temperature').textContent), 'single degree sign: ' + q('temperature').textContent);
    assert(!q('feels-line'), 'feels-like line removed (no duplication)');
    assert(q('m-feels') !== null, 'feels-like metric kept in grid');
    assert(q('condition').textContent.length > 1, 'condition label rendered: ' + q('condition').textContent);
    assert(q('location').textContent === 'Москва', 'default location: ' + q('location').textContent);
    assert(q('hourly-strip').children.length === 24, 'hourly strip has 24 items');
    assert(q('daily-strip').children.length === 8, 'daily strip has 7 days + more button');
    assert(q('chart-svg').querySelectorAll('path').length >= 2, 'chart svg has paths');
    assert(q('sun-arc').querySelectorAll('path').length >= 1, 'sun arc rendered');
    assert(q('chart-axis').children.length === 5, 'chart axis 5 labels');
    assert(q('m-wind').textContent !== '--', 'wind metric: ' + q('m-wind').textContent);
    assert(q('m-wind-dir').textContent.includes('Запад'), 'wind direction is a full word (not "З"): ' + q('m-wind-dir').textContent);
    assert(q('m-wind-dir').textContent.includes('Порывы'), 'wind tile shows gusts');
    assert(document.querySelectorAll('.metric-ico').length === 8, 'metrics redesigned with icon chips');
    assert(q('menu-scrim') !== null, 'menu scrim element exists');
    assert(q('m-press').textContent !== '--', 'pressure metric');
    assert(q('aqi-value').textContent !== '--', 'AQI value: ' + q('aqi-value').textContent);
    assert(q('m-wind-arrow').style.transform.includes('deg'), 'wind arrow rotated');
    assert(q('alert-box').classList.contains('hidden'), 'no alert in calm weather');
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
    assert(q('menu-scrim').classList.contains('on'), 'scrim dims page when menu is open');
    assert(q('main-menu').querySelector('[data-lang]') && q('main-menu').querySelector('[data-theme]'), 'menu has lang + theme items');
    assert(q('fs-item') !== null && q('refresh-item') !== null, 'menu has fullscreen + refresh actions');
    q('main-menu').querySelector('[data-lang="en"]').click();
    assert(q('theme-label').textContent === 'Adaptive', 'lang pick via menu (theme label en)');
    assert(q('city-input').placeholder === 'Search city...', 'lang pick via menu (placeholder)');
    assert(!q('main-menu').classList.contains('open'), 'menu closes after language pick');
    assert(!q('menu-scrim').classList.contains('on'), 'scrim hides after menu closes');
    window.setLang('ru');
    q('menu-btn').click();
    q('main-menu').querySelector('[data-theme="light"]').click();
    assert(document.documentElement.dataset.theme === 'light', 'theme pick via menu works');
    assert(!q('main-menu').classList.contains('open'), 'menu closes after theme pick');
    window.setTheme('adaptive');

    /* autocomplete keyboard navigation */
    q('fav-btn').click(); /* add current city to favorites so the list has items */
    q('city-input').focus();
    q('city-input').dispatchEvent(new window.Event('focus'));
    assert(!q('autocomplete-list').classList.contains('hidden'), 'autocomplete opens on focus');
    assert(q('menu-scrim').classList.contains('on'), 'scrim dims page when autocomplete is open');
    q('city-input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert(q('autocomplete-list').querySelector('.ac-item.active') !== null, 'arrow key highlights autocomplete item');
    q('city-input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(q('autocomplete-list').classList.contains('hidden'), 'escape closes autocomplete');
    assert(!q('menu-scrim').classList.contains('on'), 'scrim hides after autocomplete closes');
    q('fav-btn').click(); /* remove favorite again */

    /* search clear button */
    q('city-input').value = 'abc';
    q('city-input').dispatchEvent(new window.Event('input'));
    assert(!q('search-clear').classList.contains('hidden'), 'clear button appears when typing');
    q('search-clear').click();
    assert(q('city-input').value === '' && q('search-clear').classList.contains('hidden'), 'clear button clears input');

    const col = q('chart-cols').firstChild;
    col.dispatchEvent(new window.MouseEvent('mouseenter'));
    assert(!q('chart-tooltip').classList.contains('hidden'), 'chart tooltip shows on hover');
    assert(q('chart-tooltip').innerHTML.includes('Порывы'), 'tooltip shows wind gusts');
    q('chart-cols').onmouseleave();

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
      } finally {
        phase2();
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
  w.L = { map: fakeMap, tileLayer: () => ({ addTo() { return this; }, setUrl() {} }), marker: () => ({ addTo() { return this; } }), divIcon: (o) => o };
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
      finish();
    } catch (e) { errors.push('phase4 crashed: ' + e.message); finish(); }
  }, 800);
}

function finish() {
  console.log('\nERRORS: ' + (errors.length ? errors.join('\n - ') : 'none'));
  process.exit(errors.length ? 1 : 0);
}
