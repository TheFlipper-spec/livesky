/* ---------------- loader / progress / toasts ---------------- */
let phraseTimer = null;
let loaderWatchdog = null;
const WATCHDOG_MS = window.LIVE_WATCHDOG_MS || 15000;
const FETCH_MS = window.LIVE_FETCH_TIMEOUT_MS || 15000;
const UI_LOCK_MS = window.LIVE_UI_LOCK_MS || 800;          /* UI quiet period after closing overlays */
const FAV_LIST_DELAY_MS = window.LIVE_FAV_DELAY_MS != null ? window.LIVE_FAV_DELAY_MS : 350; /* debounce before auto-opening favorites */

/* fetch that can never hang forever */
async function fetchWithTimeout(url, ms) {
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms || FETCH_MS) : null;
  try {
    return await fetch(url, ctrl ? { signal: ctrl.signal } : {});
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function showLoader() {
  el.loader.classList.remove('done');
  if (!phraseTimer) {
    const setPhrase = () => {
      const ph = t('loading_phrases');
      el.loaderPhrase.classList.add('swap');
      setTimeout(() => {
        el.loaderPhrase.textContent = ph[Math.floor(Math.random() * ph.length)];
        el.loaderPhrase.classList.remove('swap');
      }, 300);
    };
    setPhrase();
    phraseTimer = setInterval(setPhrase, 2600);
  }
  /* watchdog: the loader must never stay on screen forever */
  clearTimeout(loaderWatchdog);
  loaderWatchdog = setTimeout(() => {
    if (state._bootFailed || state.weather) return;
    console.warn('LiveSky: loading watchdog fired — falling back');
    hideLoader();
    toast(t('toast_network'), 'error', t('toast_retry'), () => fetchWeather());
    if (!state.weather) fetchWeather();
  }, WATCHDOG_MS);
}
function hideLoader() {
  if (phraseTimer) { clearInterval(phraseTimer); phraseTimer = null; }
  clearTimeout(loaderWatchdog);
  el.loader.classList.add('done');
}
function bootFail(msg) {
  if (state._bootFailed) return;
  state._bootFailed = true;
  console.error('LiveSky boot error:', msg);
  hideLoader();
  el.progress.classList.remove('on');
  const panel = $('boot-error');
  if (panel) {
    panel.classList.remove('hidden');
    const m = $('boot-error-msg');
    if (m) m.textContent = String(msg || '').slice(0, 200);
    const r = $('boot-report-btn');
    if (r) r.href = reportBugUrl(msg);
  }
}
function setLoading(on) {
  state.loading = Math.max(0, state.loading + (on ? 1 : -1));
  el.progress.classList.toggle('on', state.loading > 0);
  if (on && !state.slowTimer) {
    state.slowTimer = setTimeout(() => {
      if (state.loading > 0) toast(t('toast_loading_slow'), 'info');
      state.slowTimer = null;
    }, 9000);
  }
}

/* Builds a GitHub issues URL with the bug context pre-filled so the user can
   describe the problem without copy-pasting details manually.
   Safe even when i18n itself failed to load (that is exactly when bootFail runs). */
function safeT(key, fallback) {
  try { return t(key); } catch (e) { return fallback; }
}
function reportBugUrl(message) {
  const title = safeT('report_bug', 'report a bug');
  const hint = safeT('bug_report_hint', 'Please describe what went wrong');
  const body = [
    hint,
    '',
    '---',
    '**Страница / Page:** ' + (location.href || ''),
    '**Версия сайта и сервиса / Site and service version:** ' + APP_VERSION,
    '**Браузер / Browser:** ' + (navigator.appVersion || ''),
    '**Ошибка / Error:** ' + (message || '—'),
    '',
    '**Что случилось / What happened:**',
    ''
  ].join('\n');
  return 'https://github.com/TheFlipper-spec/livesky/issues/new?title='
    + encodeURIComponent('LiveSky: ' + title)
    + '&body=' + encodeURIComponent(body);
}

function toast(msg, type, actionLabel, actionFn) {
  if (state.toastCount >= 3) return; /* keep max 3 on screen */
  const node = document.createElement('div');
  node.className = `toast ${type || 'info'}`;
  const icons = { info: 'ph-info', error: 'ph-warning-circle', success: 'ph-check-circle' };
  node.innerHTML = `<span class="t-ico"><i class="ph-fill ${icons[type] || 'ph-info'}"></i></span><span>${msg}</span>`;
  /* right-aligned action cluster (retry + report-bug) */
  const actions = document.createElement('div');
  actions.className = 't-actions';
  if (actionLabel && actionFn) {
    const a = document.createElement('button');
    a.className = 't-action';
    a.textContent = actionLabel;
    a.onclick = () => { actionFn(); dismiss(); };
    actions.appendChild(a);
  }
  /* on any error toast, offer a one-click way to report the bug on GitHub */
  if (type === 'error') {
    const b = document.createElement('a');
    b.className = 't-bug';
    b.href = reportBugUrl(msg);
    b.target = '_blank';
    b.rel = 'noopener';
    b.innerHTML = '<i class="ph-bold ph-bug"></i>';
    b.title = t('report_bug');
    b.setAttribute('aria-label', t('report_bug'));
    actions.appendChild(b);
  }
  if (actions.children.length) node.appendChild(actions);
  el.toastWrap.appendChild(node);
  state.toastCount = (state.toastCount || 0) + 1;
  const dismiss = () => {
    if (node._gone) return;
    node._gone = true;
    node.classList.add('out');
    setTimeout(() => node.remove(), 320);
    state.toastCount = Math.max(0, (state.toastCount || 1) - 1);
  };
  setTimeout(dismiss, type === 'error' ? 5200 : 3600);
}

/* ---------------- clock ---------------- */
let clockInterval = null;
function clockTick() {
  const now = new Date();
  try {
    el.clock.textContent = now.toLocaleTimeString(loc(), { timeZone: state.tz, hour: '2-digit', minute: '2-digit' });
    el.date.textContent = now.toLocaleDateString(loc(), { timeZone: state.tz, weekday: 'long', day: 'numeric', month: 'long' });
  } catch (e) {
    el.clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  /* Drive the minute-precision live layer off the same 1s clock so rain chips
     and the nowcast strip flip the instant the minute changes. */
  if (typeof liveTick === 'function') liveTick(false);
}
function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockTick();
  clockInterval = setInterval(clockTick, 1000);
}

/* ---------------- number animation ---------------- */
let countRaf = 0;
function animateNumber(node, to) {
  if (motionReduce || node.dataset.v == null) { node.textContent = to + '°'; node.dataset.v = to; return; }
  const from = parseFloat(node.dataset.v) || 0;
  node.dataset.v = to;
  if (from === to) { node.textContent = to + '°'; return; }
  cancelAnimationFrame(countRaf);
  const t0 = performance.now(), dur = 800;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = Math.round(from + (to - from) * e) + '°';
    if (k < 1) countRaf = requestAnimationFrame(step);
  };
  countRaf = requestAnimationFrame(step);
}
function setBigIcon(iconClass) {
  if (el.bigIcon.dataset.icon === iconClass) return;
  el.bigIcon.dataset.icon = iconClass;
  const icon = el.bigIcon.querySelector('i');
  if (icon && !motionReduce) {
    icon.classList.add('swap-out');
    setTimeout(() => { el.bigIcon.innerHTML = `<i class="ph-duotone ${iconClass}"></i>`; }, 280);
  } else {
    el.bigIcon.innerHTML = `<i class="ph-duotone ${iconClass}"></i>`;
  }
}

/* ---------------- data fetching ---------------- */
async function fetchWeather(silent) {
  const seq = ++fetchSeq;
  if (!silent) setLoading(true);
  try {
    const params = new URLSearchParams({
      latitude: state.lat, longitude: state.lon,
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weathercode,windspeed_10m,windgusts_10m,winddirection_10m,relativehumidity_2m,surface_pressure,dewpoint_2m,visibility,uv_index,is_day',
      daily: 'weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,uv_index_max,windspeed_10m_max,winddirection_10m_dominant',
      /* 15-minute nowcast: ~next 24h of minute-precision precip/temp so the UI
         can say "rain ends in 23 min" and show a live minute strip. */
      minutely_15: 'temperature_2m,precipitation,weather_code,apparent_temperature,wind_speed_10m,relative_humidity_2m,is_day',
      forecast_minutely_15: '96',
      timezone: 'auto', forecast_days: 16, past_days: 16
    });
    /* Accuracy: ask Open-Meteo for the skill-ranked "best_match" model. In Auto
       mode we also nudge the baseline toward the region's strongest model
       (ECMWF over Europe, GFS over N.America); in manual modes we blend the
       chosen model with best_match (getVal prefers the chosen model first).
       getVal reads the plain key (= first requested model) then _best_match. */
    if (state.model && state.model !== 'auto') params.append('models', `${state.model},best_match`);
    else {
      const rm = regionModel();
      params.append('models', rm ? `${rm},best_match` : 'best_match');
    }

    const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, FETCH_MS);
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    if (!data || !data.hourly || !data.daily) throw new Error('Bad payload');
    if (seq !== fetchSeq) return; /* a newer request is in flight */

    if (data.timezone) state.tz = data.timezone;
    if (data.elevation != null) state.elevation = Math.round(data.elevation);
    state.weather = data;
    /* Minutely nowcast is optional — some model combos omit it. Keep previous
       series if the new payload has none, so the live strip doesn't flicker. */
    if (data.minutely_15 && data.minutely_15.time && data.minutely_15.time.length) {
      state.minutely = data.minutely_15;
    }
    state.nowIdx = data.hourly.time.findIndex(tm => tm.startsWith(tzNow(state.tz).iso));
    if (state.nowIdx === -1) state.nowIdx = data.hourly.time.length - 25;
    state.todayIdx = data.daily.time.findIndex(tm => tm === tzNow(state.tz).date);
    if (state.todayIdx === -1) state.todayIdx = 16;
    state.lastFetchTs = Date.now();
    /* Advance the hourly pointer if the clock crossed an hour while data sat
       in memory — keeps "now" correct between auto-refreshes. */
    syncNowIdx();

    store.set('livesky:last_city', { lat: state.lat, lon: state.lon, name: state.locationName, cc: state.countryCode, admin: state.admin });
    renderAll();
    /* The mini map (if the lazy map subsystem is already on board) follows the
       city change; until then this is a safe no-op. */
    if (window.LiveSkyMap) LiveSkyMap.update();
    fetchAir(seq);
    checkWeatherAlerts();
    /* Keep the radar frames fresh when the user is looking at the map. */
    if (window.LiveSkyMap) LiveSkyMap.radarRefresh();
  } catch (e) {
    if (seq !== fetchSeq) return;
    console.error('fetchWeather failed:', e);
    if (!silent) toast(t('toast_network'), 'error', t('toast_retry'), () => fetchWeather());
  } finally {
    if (seq !== fetchSeq) return;
    if (!silent) setLoading(false);
    hideLoader();
  }
}

/* Air quality must never fail silently: on error the card used to stay on
   "--" forever with zero feedback, which looked exactly like "the air
   quality block doesn't work". Now a failed fetch is retried once
   automatically, and if it still fails the card gets an explicit
   "unavailable" state plus a toast with a manual retry action. */
async function fetchAir(seq, isRetry) {
  try {
    const res = await fetchWithTimeout(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${state.lat}&longitude=${state.lon}&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,european_aqi&timezone=auto`, 12000);
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    if (!data || !data.hourly) throw new Error('Bad payload');
    if (seq && seq !== fetchSeq) return;
    state.air = data;
    renderAirError(false);
    renderAir();
  } catch (e) {
    if (seq && seq !== fetchSeq) return;
    if (!isRetry) {
      /* transient errors (slow network, brief API hiccup) usually clear up
         a second later — retry once, quietly, before bothering the user */
      setTimeout(() => { if (!seq || seq === fetchSeq) fetchAir(seq, true); }, 2500);
      return;
    }
    console.warn('fetchAir failed:', e);
    state.air = null;
    renderAirError(true);
    toast(t('toast_air_error'), 'error', t('toast_retry'), () => fetchAir(fetchSeq, false));
  }
}
/* Explicit "no data" state for the AQI card instead of a silent, permanent "--". */
function renderAirError(on) {
  if (!el.aqiCard) return;
  el.aqiCard.classList.toggle('aqi-error', !!on);
  if (on) {
    if (el.aqiValue) el.aqiValue.textContent = '—';
    if (el.aqiLabel) el.aqiLabel.textContent = t('aqi_unavailable');
    [el.aqiPm25, el.aqiPm10, el.aqiO3, el.aqiNo2].forEach((n) => { if (n) n.textContent = '--'; });
  }
}

/* ---------------- geo ---------------- */
async function reverseGeo(lat, lon) {
  try {
    const r = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=${state.lang}`, 8000);
    if (r.ok) {
      const d = await r.json();
      if (d && d.address) {
        const a = d.address;
        const road = a.road || a.pedestrian || a.street || a.square || '';
        const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.city_district || a.municipality || '';
        state.locationName = (city && road) ? `${city}, ${road}` : (city || road || d.name || 'Unknown location');
        state.countryCode = (a.country_code || '').toUpperCase();
        state.admin = [a.state || a.region, a.country].filter(Boolean).join(', ');
        return;
      }
    }
  } catch (e) { console.warn('Nominatim failed', e); }
  try {
    const r = await fetchWithTimeout(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${state.lang}`, 8000);
    const d = await r.json();
    state.locationName = d.city || d.locality || d.principalSubdivision || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    state.countryCode = (d.countryCode || '').toUpperCase();
    state.admin = d.principalSubdivision || '';
  } catch (e) {
    state.locationName = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    state.countryCode = '';
    state.admin = '';
  }
}

let geoWarned = false;
/* `seq` is the locSeq value claimed the instant the geolocation request
   started. Geolocation (and its reverse-geocoding follow-up) can take a
   couple of seconds — long enough for the user to search for a different
   city while the GPS fix is still pending. Without this guard, a slow
   geolocation result that resolves AFTER a manual search silently jumps
   the app back to the user's current location, making the search look
   like it "didn't work". */
async function applyUserPosition(pos, notify, seq) {
  if (seq !== state.locSeq) return; /* a newer location request already won */
  state.lat = pos.coords.latitude;
  state.lon = pos.coords.longitude;
  await reverseGeo(state.lat, state.lon);
  if (seq !== state.locSeq) return; /* re-check: reverseGeo awaited a network call too */
  if (notify) toast(t('toast_loc_set'), 'success');
  fetchWeather();
}
function handleLocationFailure(seq) {
  if (seq !== state.locSeq) return; /* the user already moved on to a different city */
  if (!geoWarned) { geoWarned = true; toast(t('toast_geo_denied'), 'info'); }
  fetchWeather();
}
/* Interceptor: never call the native Geolocation API until the user has
   independently accepted the Privacy Policy. Cancel leaves the app usable
   via manual city search. Continuation is synchronous so a granted click
   proceeds in the same turn. */
function getUserLocation(notify) {
  if (consentLocked()) return;
  requestPrivacyConsent(() => requestUserPosition(notify));
}
function requestUserPosition(notify) {
  state.geoRequests = (state.geoRequests || 0) + 1;
  const seq = ++state.locSeq; /* claim this as the newest location request in flight */
  showLoader();
  const options = { enableHighAccuracy: true, timeout: 7000, maximumAge: 300000 };
  const nativeGeo = nativePlugin('Geolocation');

  if (nativeGeo) {
    (async () => {
      try {
        let permission = await nativeGeo.checkPermissions();
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          permission = await nativeGeo.requestPermissions();
        }
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') throw new Error('Location permission denied');
        const pos = await nativeGeo.getCurrentPosition(options);
        await applyUserPosition(pos, notify, seq);
      } catch (e) {
        handleLocationFailure(seq);
      }
    })();
    return;
  }

  if (!navigator.geolocation) { fetchWeather(); return; }
  showLoader();
  navigator.geolocation.getCurrentPosition(
    (pos) => { applyUserPosition(pos, notify, seq).catch(() => handleLocationFailure(seq)); },
    () => handleLocationFailure(seq),
    options
  );
}

/* ---------------- favorites ---------------- */
function toggleFavorite() {
  if (!state.locationName) return;
  const idx = state.favorites.findIndex(f => f.name === state.locationName && f.lat === state.lat);
  if (idx > -1) {
    state.favorites.splice(idx, 1);
    toast(t('toast_fav_removed'), 'info');
  } else {
    state.favorites.push({ name: state.locationName, country: state.countryCode, admin: state.admin, lat: state.lat, lon: state.lon });
    toast(t('toast_fav_added'), 'success');
  }
  store.set('livesky:favorites', state.favorites);
  updateFavIcon();
}
function updateFavIcon() {
  const isFav = state.favorites.some(f => f.name === state.locationName && f.lat === state.lat);
  el.favIcon.classList.toggle('ph-fill', isFav);
  el.favBtn.classList.toggle('fav-on', isFav);
}

/* ---------------- fuzzy / wrong-keyboard-layout city search ---------------- */
/* Open-Meteo's geocoding API does normalized prefix matching (case- and
   diacritic-insensitive) but no fuzzy/typo correction and no keyboard-layout
   awareness — a garbled query like "Vjcrdf" (Москва typed with an EN layout
   selected) or "Моксва" (a typo of Москва) simply returns zero results.
   These helpers add two cheap, deterministic client-side correction passes
   that only kick in when the *raw* query draws a blank:
     1) a full keyboard-layout remap (Cyrillic ЙЦУКЕН <-> Latin QWERTY,
        matched by physical key position) — fixes "wrong layout" typing.
     2) single adjacent-letter transpositions + single-letter deletions of
        the (possibly remapped) query — fixes the most common typos, e.g.
        "Моксва" -> "Москва". This is intentionally scoped to these two
        patterns rather than a full fuzzy/Levenshtein search over every
        possible edit, to keep the number of extra network requests small
        and the behavior predictable. */
const EN_TO_RU_KEYMAP = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ', '`': 'ё',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю'
};
const RU_TO_EN_KEYMAP = Object.fromEntries(Object.entries(EN_TO_RU_KEYMAP).map(([en, ru]) => [ru, en]));

function convertKeyboardLayout(str, map) {
  let out = '';
  for (const ch of str) {
    const lower = ch.toLowerCase();
    const mapped = map[lower];
    if (mapped == null) { out += ch; continue; }
    out += (ch === lower) ? mapped : mapped.toUpperCase();
  }
  return out;
}
function hasCyrillic(s) { return /[а-яёА-ЯЁ]/.test(s); }
function hasLatin(s) { return /[a-zA-Z]/.test(s); }
/* Only remap "pure" single-script queries — mixed scripts or queries that
   already contain both alphabets are left untouched to avoid nonsense. */
function layoutSwapCandidate(q) {
  const cyr = hasCyrillic(q), lat = hasLatin(q);
  if (lat && !cyr) return convertKeyboardLayout(q, EN_TO_RU_KEYMAP);
  if (cyr && !lat) return convertKeyboardLayout(q, RU_TO_EN_KEYMAP);
  return null;
}
function typoVariants(q) {
  const out = new Set();
  for (let i = 0; i < q.length - 1; i++) {
    if (q[i] === q[i + 1]) continue;
    out.add(q.slice(0, i) + q[i + 1] + q[i] + q.slice(i + 2)); /* adjacent transposition */
  }
  for (let i = 0; i < q.length; i++) {
    out.add(q.slice(0, i) + q.slice(i + 1)); /* single-letter deletion */
  }
  out.delete(q);
  return [...out];
}
function buildCorrectionCandidates(q) {
  const list = [];
  const swapped = layoutSwapCandidate(q);
  if (swapped && swapped.toLowerCase() !== q.toLowerCase()) list.push(swapped);
  if (q.length >= 4 && q.length <= 24) {
    typoVariants(q).forEach(c => list.push(c));
    if (swapped) typoVariants(swapped).forEach(c => list.push(c));
  }
  const seen = new Set([q.toLowerCase()]);
  return list.filter(c => {
    const k = c.toLowerCase();
    if (!c || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 14); /* cap extra requests per search */
}
async function geocodeQuery(q, count) {
  const r = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=${state.lang}&format=json`, 8000);
  const d = await r.json();
  return d.results || [];
}
/* Tries the query as typed first; only if that comes back empty does it
   fire off the (small, capped) set of correction candidates in parallel
   and use the first one that actually resolves. Returns which corrected
   string (if any) produced the results, so the UI can be transparent
   about the fact that it auto-corrected the query. */
async function geocodeSmart(q, count) {
  const direct = await geocodeQuery(q, count);
  if (direct.length) return { results: direct, corrected: null };
  const candidates = buildCorrectionCandidates(q);
  if (!candidates.length) return { results: [], corrected: null };
  const settled = await Promise.all(candidates.map(async (cand) => {
    try { return { cand, results: await geocodeQuery(cand, count) }; }
    catch (e) { return { cand, results: [] }; }
  }));
  const hit = settled.find(s => s.results.length);
  return hit ? { results: hit.results, corrected: hit.cand } : { results: [], corrected: null };
}

/* ---------------- search ---------------- */
let searchTimer = null;
function saveRecent() {
  state.recent = state.recent.filter(r => !(r.name === state.locationName && r.lat === state.lat));
  state.recent.unshift({ name: state.locationName, country: state.countryCode, admin: state.admin, lat: state.lat, lon: state.lon });
  state.recent = state.recent.slice(0, 5);
  store.set('livesky:recent', state.recent);
}
function selectCity(c, isFav) {
  state.locSeq++; /* a manual pick always wins over any slower, older request in flight */
  state.lat = c.lat; state.lon = c.lon;
  state.locationName = c.name;
  state.countryCode = c.country || '';
  state.admin = c.admin || '';
  saveRecent();
  closeAutocomplete();
  el.input.value = '';
  el.searchClear.classList.add('hidden');
  el.input.blur();
  fetchWeather();
}
function closeAutocomplete() {
  el.autoList.classList.add('hidden');
  acIndex = -1;
  acSeq++; /* invalidate any in-flight autocomplete response */
  clearTimeout(state.favOpenTimer);
}
/* keyboard navigation inside autocomplete list */
let acIndex = -1;
function acMove(dir) {
  const items = [...el.autoList.querySelectorAll('.ac-item')];
  if (!items.length) return;
  acIndex = Math.min(items.length - 1, Math.max(0, acIndex + dir));
  items.forEach((it, k) => it.classList.toggle('active', k === acIndex));
  if (items[acIndex].scrollIntoView) items[acIndex].scrollIntoView({ block: 'nearest' });
}

function renderFavoritesList() {
  el.autoList.innerHTML = '';
  acIndex = -1;
  const title = document.createElement('div');
  title.className = 'ac-list-title';
  title.textContent = t('favorites');
  el.autoList.appendChild(title);
  if (!state.favorites.length) {
    const empty = document.createElement('div');
    empty.className = 'ac-empty';
    empty.textContent = t('favorites_empty');
    el.autoList.appendChild(empty);
  } else {
    state.favorites.forEach(f => {
      const div = document.createElement('div');
      div.className = 'ac-item';
      div.innerHTML = `
        ${flagUrl(f.country) ? `<img class="ac-flag" src="${flagUrl(f.country)}" alt="" loading="lazy" onerror="this.remove()">` : '<span class="ac-flag"></span>'}
        <span><span class="ac-name">${escHtml(f.name)}</span>${f.admin ? `<br><span class="ac-admin">${escHtml(f.admin)}</span>` : ''}</span>
        <button class="ac-remove" aria-label="Удалить"><i class="ph-bold ph-x"></i></button>`;
      div.addEventListener('click', (e) => {
        if (e.target.closest('.ac-remove')) return;
        selectCity({ lat: f.lat, lon: f.lon, name: f.name, country: f.country, admin: f.admin }, true);
      });
      div.querySelector('.ac-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        state.favorites = state.favorites.filter(x => !(x.name === f.name && x.lat === f.lat));
        store.set('livesky:favorites', state.favorites);
        updateFavIcon();
        renderFavoritesList();
      });
      el.autoList.appendChild(div);
    });
  }

  /* recent cities (excluding favorites) */
  const recents = state.recent.filter(r => !state.favorites.some(f => f.name === r.name && f.lat === r.lat));
  if (recents.length) {
    const rTitle = document.createElement('div');
    rTitle.className = 'ac-list-title';
    rTitle.textContent = t('recent');
    el.autoList.appendChild(rTitle);
    recents.forEach(f => {
      const div = document.createElement('div');
      div.className = 'ac-item';
      div.innerHTML = `
        ${flagUrl(f.country) ? `<img class="ac-flag" src="${flagUrl(f.country)}" alt="" loading="lazy" onerror="this.remove()">` : '<span class="ac-flag"></span>'}
        <span><span class="ac-name">${escHtml(f.name)}</span>${f.admin ? `<br><span class="ac-admin">${escHtml(f.admin)}</span>` : ''}</span>
        <i class="ph ph-clock-counter-clockwise ac-star"></i>`;
      div.addEventListener('click', () => selectCity({ lat: f.lat, lon: f.lon, name: f.name, country: f.country, admin: f.admin }));
      el.autoList.appendChild(div);
    });
  }
  el.autoList.classList.remove('hidden');
}

let acSeq = 0; /* autocomplete generation: stale responses are dropped */
async function handleInput() {
  clearTimeout(searchTimer);
  const q = el.input.value.trim();
  el.searchClear.classList.toggle('hidden', !el.input.value);
  if (!q) {
    renderFavoritesList();
    return;
  }
  if (q.length < 3) {
    el.autoList.innerHTML = '';
    el.autoList.classList.add('hidden');
    return;
  }
  const seq = ++acSeq;
  /* hide stale suggestions immediately — never show results for an old query */
  el.autoList.innerHTML = '';
  el.autoList.classList.add('hidden');
  searchTimer = setTimeout(async () => {
    if (el.input.value.trim() !== q) return; /* query changed while waiting */
    try {
      const { results, corrected } = await geocodeSmart(q, 6);
      if (seq !== acSeq || el.input.value.trim() !== q) return; /* stale response */
      acIndex = -1;
      el.autoList.innerHTML = '';
      if (!results.length) {
        const empty = document.createElement('div');
        empty.className = 'ac-empty';
        empty.textContent = t('no_results');
        el.autoList.appendChild(empty);
      } else {
        if (corrected) {
          const hint = document.createElement('div');
          hint.className = 'ac-list-title ac-corrected-hint';
          hint.textContent = t('search_corrected').replace('{q}', corrected);
          el.autoList.appendChild(hint);
        }
        results.forEach(c => {
          const div = document.createElement('div');
          div.className = 'ac-item';
          div.innerHTML = `
            ${flagUrl(c.country_code) ? `<img class="ac-flag" src="${flagUrl(c.country_code)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
            <span><span class="ac-name">${escHtml(c.name)}</span><br><span class="ac-admin">${escHtml([c.admin1, c.country].filter(Boolean).join(', '))}</span></span>`;
          div.addEventListener('click', () => selectCity({ lat: c.latitude, lon: c.longitude, name: c.name, country: c.country_code, admin: [c.admin1, c.country].filter(Boolean).join(', ') }));
          el.autoList.appendChild(div);
        });
      }
      el.autoList.classList.remove('hidden');
        } catch (e) { /* silent */ }
  }, 280);
}

async function handleSearch(e) {
  e.preventDefault();
  const q = el.input.value.trim();
  if (!q) return;
  closeAutocomplete();
  const seq = ++state.locSeq; /* claim this as the newest location request in flight */
  try {
    const { results, corrected } = await geocodeSmart(q, 1);
    if (seq !== state.locSeq) return; /* the user already moved on to a newer city */
    if (!results.length) {
      toast(t('toast_city_not_found'), 'error');
      return;
    }
    const c = results[0];
    state.lat = c.latitude; state.lon = c.longitude;
    state.locationName = c.name;
    state.countryCode = c.country_code || '';
    state.admin = [c.admin1, c.country].filter(Boolean).join(', ');
    saveRecent();
    el.input.value = '';
    el.searchClear.classList.add('hidden');
    el.input.blur();
    if (corrected) toast(t('search_corrected').replace('{q}', corrected), 'info');
    fetchWeather();
  } catch (e) {
    /* Note: handleSearch expects an Event (uses e.preventDefault() on the first line),
       so the retry callback must not forward the error object. */
    toast(t('toast_network'), 'error', t('toast_retry'), () => handleSearch());
  }
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
