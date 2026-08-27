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

