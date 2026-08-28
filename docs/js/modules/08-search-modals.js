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

/* ---------------- modals ---------------- */
/* Accessible overlays: trap the Tab key inside the dialog, make the background
   inert, focus the dialog on open and restore focus to the opener on close. */
let lastFocused = null;
function modalFocusables(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  )].filter(n => n.getClientRects().length > 0);
}
function onTrapKey(e) {
  if (e.key !== 'Tab') return;
  const container = (el.consentModal && !el.consentModal.classList.contains('hidden')) ? el.consentModal
    : (el.privacyModal && !el.privacyModal.classList.contains('hidden')) ? el.privacyModal
    : (el.modal && el.modal.classList.contains('open')) ? el.modal
    : (el.mapModal && el.mapModal.classList.contains('open')) ? el.mapModal : null;
  if (!container) return;
  const f = modalFocusables(container);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function trapFocus(container) {
  if (!container) return;
  if (lastFocused == null) lastFocused = document.activeElement;
  /* make everything outside the dialog inert so tabbing / AT stay inside it */
  [...document.body.children].forEach(n => {
    if (n === container || n.contains(container)) return;
    if (!n.hasAttribute('inert')) { n._liveskyInert = true; n.setAttribute('inert', ''); }
  });
  container.addEventListener('keydown', onTrapKey);
  setTimeout(() => {
    const f = modalFocusables(container);
    if (f.length) f[0].focus(); else if (container.focus) container.focus();
  }, 20);
}
function releaseFocus(container) {
  if (container) container.removeEventListener('keydown', onTrapKey);
  [...document.body.children].forEach(n => {
    if (n._liveskyInert) { n.removeAttribute('inert'); delete n._liveskyInert; }
  });
  if (lastFocused && lastFocused.focus) { try { lastFocused.focus(); } catch (e) { /* ignore */ } }
  lastFocused = null;
}

/* ---------------- legal consent gate ----------------
   Sequential consent:
   Stage 1 — Terms of Service (hard block). One button unlocks the app.
   Stage 2 — Privacy / geolocation (soft block). Shown immediately after
   ToS, and again just-in-time if the user later taps the geo button.
   Auto-geolocation runs ONLY after an explicit «Allow».

   The ToS record is validated field by field on every boot and re-validated
   whenever the tab regains focus or storage changes, so a cleared, tampered
   or outdated record locks the interface again. */
const CONSENT_VERSION = '3.0';
const CONSENT_KEY = 'livesky:legal_consent';
const TOS_KEY = 'livesky:tos_accepted';
const PRIVACY_KEY = 'livesky:privacy_accepted';
const CONSENT_REQUIRED_KEY = 'livesky:legal_consent_required';

function readConsentRecord() {
  const rec = store.get(CONSENT_KEY, null);
  if (!rec || typeof rec !== 'object') return null;
  return rec;
}

function consentConfirmationRequired() {
  try { return sessionStorage.getItem(CONSENT_REQUIRED_KEY) === 'true'; }
  catch (e) { return true; } /* storage uncertainty must never bypass the gate */
}

/* Migrate the old bundled ToS+Privacy record so existing users are not
   re-prompted, while keeping the two grants independent going forward. */
function migrateLegacyConsent() {
  const rec = readConsentRecord();
  if (!rec || rec.accepted !== true || rec.version !== '2.1') return;
  if (rec.terms !== true) return;
  const next = {
    accepted: true,
    version: CONSENT_VERSION,
    terms: true,
    privacy: rec.privacy === true,
    ts: (typeof rec.ts === 'number' && rec.ts > 0) ? rec.ts : Date.now()
  };
  store.set(CONSENT_KEY, next);
  store.set(TOS_KEY, true);
  store.set('livesky:legal_accepted', true);
  if (next.privacy) store.set(PRIVACY_KEY, true);
}

/* strict ToS validation — privacy is intentionally NOT required here */
function isValidConsentRecord(rec) {
  if (!rec) return false;
  if (rec.accepted !== true) return false;
  if (rec.version !== CONSENT_VERSION) return false;   /* documents updated → ask again */
  if (rec.terms !== true) return false;
  if (typeof rec.ts !== 'number' || !isFinite(rec.ts) || rec.ts <= 0) return false;
  if (rec.ts > Date.now() + 86400000) return false;    /* clock-skew / tampering */
  return true;
}

function hasValidConsent() {
  /* A return from the Terms page always requires a fresh explicit action,
     even if this browser still contains an older valid ToS record. */
  if (consentConfirmationRequired()) return false;
  return isValidConsentRecord(readConsentRecord());
}

function lockAppForConsent() {
  privacyOnGranted = null;
  hidePrivacyDialog();
  document.documentElement.classList.add('consent-locked');
  if (!el.consentModal) return;
  if (el.consentModal.classList.contains('hidden') || !el.consentModal._liveskyLocked) {
    el.consentModal.classList.remove('hidden');
    el.consentModal._liveskyLocked = true;
    document.body.classList.add('no-scroll');
    syncConsentButton();
    trapFocus(el.consentModal);
  }
}

function unlockAppAfterConsent() {
  document.documentElement.classList.remove('consent-locked');
  if (!el.consentModal) return;
  el.consentModal.classList.add('hidden');
  el.consentModal._liveskyLocked = false;
  if (!privacyDialogOpen() && (!el.modal || !el.modal.classList.contains('open'))) {
    document.body.classList.remove('no-scroll');
  }
  releaseFocus(el.consentModal);
}

function consentLocked() {
  return document.documentElement.classList.contains('consent-locked') ||
    !!(el.consentModal && !el.consentModal.classList.contains('hidden'));
}

/* Single «Accept and continue» button — enabled unless a leftover checkbox is present and unchecked. */
function syncConsentButton() {
  const hasBox = !!(el.consentCheckbox);
  const ok = hasBox ? !!el.consentCheckbox.checked : true;
  if (el.consentAcceptBtn) {
    el.consentAcceptBtn.disabled = !ok;
    el.consentAcceptBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }
  if (ok && el.consentError) el.consentError.classList.add('hidden');
}

function rejectConsentAttempt() {
  if (el.consentError) el.consentError.classList.remove('hidden');
  const card = el.consentModal && el.consentModal.querySelector('.consent-card');
  if (card) {
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }
  if (el.consentCheckbox && el.consentCheckbox.focus) el.consentCheckbox.focus();
}

function checkLegalConsent() {
  migrateLegacyConsent();
  if (!el.consentModal) return;
  if (hasValidConsent()) unlockAppAfterConsent();
  else lockAppForConsent();
}

function acceptLegalConsent() {
  if (el.consentCheckbox && !el.consentCheckbox.checked) {
    rejectConsentAttempt();
    return;
  }
  store.set(CONSENT_KEY, {
    accepted: true,
    version: CONSENT_VERSION,
    terms: true,
    privacy: hasPrivacyConsent(),
    ts: Date.now()
  });
  store.set(TOS_KEY, true);
  store.set('livesky:legal_accepted', true);

  /* Verify the new record before clearing the forced-confirmation marker. This
     prevents an old or failed write from unlocking the page after legal review. */
  if (!isValidConsentRecord(readConsentRecord())) {
    rejectConsentAttempt();
    return;
  }
  try { sessionStorage.removeItem(CONSENT_REQUIRED_KEY); }
  catch (e) {
    rejectConsentAttempt();
    return;
  }
  if (!hasValidConsent()) {
    rejectConsentAttempt();
    return;
  }
  unlockAppAfterConsent();
  /* Basemap tiles stay behind the ToS gate — the map stack is a lazy
     subsystem and only loads on the first explicit map/radar interaction
     (see the LiveSkyMap facade in 10-bootstrap.js). On capable devices the
     facade now starts a silent background prefetch right here, so the
     mini-map appears essentially like the old eager behaviour. */
  if (window.LiveSkyMap) LiveSkyMap.schedulePrefetch();
  /* Sequential Step 2: ask for geolocation immediately after ToS. */
  offerPrivacyIfNeeded();
  /* Optional Step 3: a single, self-retiring install invitation. It waits
     for the privacy dialog and disappears for good once dismissed. */
  scheduleInstallPrompt();
}

/* continuous re-validation: clearing or editing the record re-locks the app */
function guardLegalConsent() {
  migrateLegacyConsent();
  if (!el.consentModal) return;
  if (!hasValidConsent()) lockAppForConsent();
}

/* ---------------- privacy / geolocation consent (just-in-time) ---------------- */
let privacyOnGranted = null;

function privacyDecision() {
  const v = store.get(PRIVACY_KEY, null);
  if (v === true) return true;
  if (v === false) return false;
  const rec = readConsentRecord();
  if (rec && rec.version === CONSENT_VERSION && rec.privacy === true) return true;
  return null;
}

function hasPrivacyConsent() {
  return privacyDecision() === true;
}

function persistPrivacyConsent(allowed) {
  const ok = allowed !== false;
  store.set(PRIVACY_KEY, ok);
  const rec = readConsentRecord();
  if (rec && typeof rec === 'object') {
    rec.privacy = ok;
    store.set(CONSENT_KEY, rec);
  }
}

/* After ToS: if privacy is already granted and there is no saved city,
   auto-request geolocation. If never decided, show the soft-block dialog.
   An explicit decline leaves the default / last city in place. */
function offerPrivacyIfNeeded() {
  if (!hasValidConsent()) return;
  if (hasPrivacyConsent()) {
    const last = store.get('livesky:last_city', null);
    if (!last || last.lat == null) getUserLocation();
    return;
  }
  if (privacyDecision() === false) return;
  requestPrivacyConsent(() => requestUserPosition());
}

function privacyDialogOpen() {
  return !!(el.privacyModal && !el.privacyModal.classList.contains('hidden'));
}

function showPrivacyDialog() {
  if (!el.privacyModal) return;
  el.privacyModal.classList.remove('hidden');
  document.body.classList.add('no-scroll');
  trapFocus(el.privacyModal);
}

function hidePrivacyDialog() {
  if (!el.privacyModal) return;
  el.privacyModal.classList.add('hidden');
  if (!consentLocked() && (!el.modal || !el.modal.classList.contains('open'))) {
    document.body.classList.remove('no-scroll');
  }
  releaseFocus(el.privacyModal);
  /* the gate is clear — the install invitation may now take its turn */
  if (typeof scheduleInstallPrompt === 'function') scheduleInstallPrompt();
}

function requestPrivacyConsent(onGranted) {
  if (hasPrivacyConsent()) {
    if (typeof onGranted === 'function') onGranted();
    return;
  }
  if (!el.privacyModal) return;
  privacyOnGranted = onGranted || null;
  showPrivacyDialog();
}

function acceptPrivacyConsent() {
  persistPrivacyConsent(true);
  const cont = privacyOnGranted;
  privacyOnGranted = null;
  hidePrivacyDialog();
  if (hasPrivacyConsent() && typeof cont === 'function') cont();
}

function cancelPrivacyConsent() {
  persistPrivacyConsent(false);
  privacyOnGranted = null;
  hidePrivacyDialog();
}

function openModal(title, subtitle, bodyHtml) {
  el.modalTitle.textContent = title;
  el.modalSubtitle.textContent = subtitle || '';
  el.modalBody.innerHTML = bodyHtml;
  el.modalBody.scrollTop = 0;
  el.modal.classList.add('open');
  document.body.classList.add('no-scroll');
  trapFocus(el.modal);
}
function closeModal() {
  el.modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  releaseFocus(el.modal);
  state.uiLockUntil = Date.now() + UI_LOCK_MS;
  clearTimeout(state.favOpenTimer);
}

function showModalHourly(h, i) {
  const code = getVal(h, 'weathercode', i);
  const temp = getVal(h, 'temperature_2m', i);
  const feels = getVal(h, 'apparent_temperature', i);
  const hum = getVal(h, 'relativehumidity_2m', i);
  const wind = getVal(h, 'windspeed_10m', i);
  const dir = getVal(h, 'winddirection_10m', i);
  const press = getVal(h, 'surface_pressure', i);
  const dew = getVal(h, 'dewpoint_2m', i);
  const vis = getVal(h, 'visibility', i);
  const uv = getVal(h, 'uv_index', i);
  const prob = getVal(h, 'precipitation_probability', i);
  const prec = getVal(h, 'precipitation', i);
  const gust = getVal(h, 'windgusts_10m', i);
  const night = hourIsNight(i);
  const timeStr = h.time[i].slice(11, 16);
  const dateObj = parseLocal(h.time[i]);
  const dateStr = dateObj.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });

  const body = `
    <div class="m-detail-hero">
      <i class="ph-duotone ${wmoIcon(code, night)} m-icon"></i>
      <div class="m-temp">${fmtTempDeg(temp)}</div>
      <div class="m-desc">${wmoLabel(code)}</div>
    </div>
    <div class="m-grid">
      ${mTile('ph-thermometer', t('feels_like'), fmtTempDeg(feels))}
      ${mTile('ph-wind', windDir(dir) ? `${t('wind')} · ${windDir(dir)}` : t('wind'), fmtWind(wind))}
      ${mTile('ph-drop', t('humidity'), hum != null ? Math.round(hum) + '%' : '--')}
      ${mTile('ph-gauge', t('pressure'), fmtPress(press))}
      ${mTile('ph-drop-half', t('dew_point'), fmtTempDeg(dew))}
      ${mTile('ph-eye', t('visibility'), fmtVis(vis))}
      ${mTile('ph-sun', t('uv_index'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
      ${mTile('ph-cloud-rain', t('rain_chance'), `${prob != null ? Math.round(prob) + '%' : '--'}${prec != null && prec > 0 ? ' · ' + fmtPrecip(prec) : ''}`)}
      ${mTile('ph-wind', t('wind_gusts'), fmtWind(gust))}
    </div>`;
  openModal(`${t('modal_hourly')} ${timeStr}`, dateStr, body);
}

function mTile(icon, label, value) {
  return `<div class="m-tile"><div class="m-label"><i class="ph ${icon}"></i>${escHtml(label)}</div><div class="m-val">${value}</div></div>`;
}

function showModalDaily(d, i) {
  const code = getVal(d, 'weathercode', i);
  const mx = getVal(d, 'temperature_2m_max', i);
  const mn = getVal(d, 'temperature_2m_min', i);
  const uv = getVal(d, 'uv_index_max', i);
  const prob = getVal(d, 'precipitation_probability_max', i);
  const windMax = getVal(d, 'windspeed_10m_max', i);
  const precipSum = getVal(d, 'precipitation_sum', i);
  const sr = getVal(d, 'sunrise', i);
  const ss = getVal(d, 'sunset', i);
  const dateObj = parseLocal(d.time[i]);
  const target = d.time[i];
  const h = state.weather.hourly;

  let strip = '';
  let visSum = 0, visCount = 0;
  for (let j = 0; j < h.time.length; j++) {
    if (h.time[j].startsWith(target)) {
      const hCode = getVal(h, 'weathercode', j);
      const hTemp = getVal(h, 'temperature_2m', j);
      const hNight = hourIsNight(j);
      strip += `
        <div class="hour-item" style="width:64px" data-j="${j}">
          <span class="h-time">${h.time[j].slice(11, 16)}</span>
          <i class="ph-duotone ${wmoIcon(hCode, hNight)} h-icon w-${wmo(hCode).type}"></i>
          <span class="h-temp">${fmtTemp(hTemp)}°</span>
        </div>`;
      const v = getVal(h, 'visibility', j);
      if (v != null) { visSum += v; visCount++; }
    }
  }
  const avgVis = visCount > 0 ? fmtVis(visSum / visCount) : '--';

  const body = `
    <div class="m-detail-hero">
      <i class="ph-duotone ${wmoIcon(code, false)} m-icon"></i>
      <div class="m-temp"><span>${fmtTemp(mx)}°</span> <span style="color:var(--text-4);font-size:26px">${fmtTemp(mn)}°</span></div>
      <div class="m-desc">${wmoLabel(code)}</div>
    </div>
    ${strip ? `<div class="hourly-strip" id="modal-hourly" style="margin-bottom:14px">${strip}</div>` : ''}
    <div class="m-grid">
      ${mTile('ph-sun', t('uv_max'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
      ${mTile('ph-cloud-rain', t('rain_chance'), prob != null ? Math.round(prob) + '%' : '--')}
      ${mTile('ph-drop', t('precip'), fmtPrecip(precipSum))}
      ${mTile('ph-wind', t('wind_max'), fmtWind(windMax))}
      ${mTile('ph-sun-horizon', t('sunrise'), hhmm(sr))}
      ${mTile('ph-moon-stars', t('sunset'), hhmm(ss))}
      ${mTile('ph-eye', t('avg_vis'), avgVis)}
      ${mTile('ph-hourglass', t('day_len'), ss && sr ? fmtDur(Math.max(0, minOfDay(ss) - minOfDay(sr)), true) : '--')}
    </div>
    <div class="m-note"><i class="ph-fill ph-camera"></i><p><b>${t('golden_title')}.</b> ${t('golden_desc')}</p></div>`;
  openModal(dateObj.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }), t('modal_daily'), body);

  el.modalBody.querySelectorAll('#modal-hourly .hour-item').forEach(node => {
    node.addEventListener('click', () => showModalHourly(h, +node.dataset.j));
  });
}

function showMonthly(mode) {
  const d = state.weather.daily;
  const today = state.todayIdx;
  const isHistory = mode === 'history';
  const list = [];
  for (let i = isHistory ? 0 : today; i < (isHistory ? today : d.time.length); i++) list.push(i);
  if (!list.length) return;

  let tmin = Infinity, tmax = -Infinity;
  list.forEach(i => {
    const mn = getVal(d, 'temperature_2m_min', i), mx = getVal(d, 'temperature_2m_max', i);
    if (mn < tmin) tmin = mn;
    if (mx > tmax) tmax = mx;
  });
  const span = Math.max(1, tmax - tmin);

  let rows = '';
  list.forEach(i => {
    const dt = parseLocal(d.time[i]);
    const wd = dt.toLocaleDateString(loc(), { weekday: 'short' }).replace('.', '');
    const code = getVal(d, 'weathercode', i);
    const mn = getVal(d, 'temperature_2m_min', i);
    const mx = getVal(d, 'temperature_2m_max', i);
    const prob = getVal(d, 'precipitation_probability_max', i);
    const left = ((mn - tmin) / span) * 100;
    const width = Math.max(8, ((mx - mn) / span) * 100);
    rows += `
      <div class="mo-row" data-i="${i}">
        <i class="ph-duotone ${wmoIcon(code, false)} mo-icon w-${wmo(code).type}"></i>
        <span class="mo-date">${wd.charAt(0).toUpperCase() + wd.slice(1)}<small>${dt.toLocaleDateString(loc(), { day: 'numeric', month: 'long' })}</small></span>
        <span class="mo-range"><i style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i></span>
        <span class="mo-temps">${fmtTemp(mx)}°<small>${fmtTemp(mn)}°</small></span>
        <span class="mo-rain ${prob == null || prob < 5 ? 'zero' : ''}"><i class="ph-fill ph-drop"></i>${prob != null ? Math.round(prob) : 0}%</span>
      </div>`;
  });

  openModal(isHistory ? t('history_title') : t('forecast_title'), state.locationName, `<div style="display:flex;flex-direction:column;gap:9px">${rows}</div>`);
  el.modalBody.querySelectorAll('.mo-row').forEach(node => {
    node.addEventListener('click', () => showModalDaily(d, +node.dataset.i));
  });
}

function showSunDetails() {
  const d = state.weather.daily;
  const srIso = getVal(d, 'sunrise', state.todayIdx);
  const ssIso = getVal(d, 'sunset', state.todayIdx);
  if (!srIso || !ssIso) return;
  const h = state.weather.hourly;
  const srIdx = h.time.findIndex(tm => tm.startsWith(srIso.slice(0, 13)));
  const ssIdx = h.time.findIndex(tm => tm.startsWith(ssIso.slice(0, 13)));

  const block = (title, iso, idx, color) => {
    const i = idx >= 0 ? idx : 0;
    const temp = getVal(h, 'temperature_2m', i);
    const wind = getVal(h, 'windspeed_10m', i);
    const code = getVal(h, 'weathercode', i);
    const night = hourIsNight(i);
    return `
      <div class="m-tile" style="grid-column:1/-1">
        <div class="m-label"><i class="ph-fill ph-sun-horizon" style="color:${color}"></i>${escHtml(title)} · ${hhmm(iso)}</div>
        <div style="display:flex;align-items:center;gap:14px;margin-top:4px">
          <i class="ph-duotone ${wmoIcon(code, night)}" style="font-size:34px;color:var(--text-2)"></i>
          <span style="font-family:var(--font-display);font-weight:600">${fmtTempDeg(temp)}</span>
          <span style="font-size:13px;color:var(--text-3);display:inline-flex;align-items:center;gap:6px"><i class="ph ph-wind"></i>${fmtWind(wind)}</span>
          <span style="font-size:13px;color:var(--text-3)">${wmoLabel(code)}</span>
        </div>
      </div>`;
  };

  const body = `
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;background:linear-gradient(100deg,rgba(251,146,60,.14),rgba(129,140,248,.14));border:1px solid var(--stroke);border-radius:20px;padding:20px;text-align:center;margin-bottom:14px">
      <div><div style="font-family:var(--font-display);font-size:22px;font-weight:600">${hhmm(srIso)}</div><div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-top:4px">${t('sunrise')}</div></div>
      <div><div style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--accent)">${fmtDur(Math.max(0, minOfDay(ssIso) - minOfDay(srIso)), true)}</div><div style="font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-4);margin-top:4px">${t('day_len')}</div></div>
      <div><div style="font-family:var(--font-display);font-size:22px;font-weight:600">${hhmm(ssIso)}</div><div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-top:4px">${t('sunset')}</div></div>
    </div>
    <div class="m-grid">
      ${block(t('sunrise'), srIso, srIdx, '#fb923c')}
      ${block(t('sunset'), ssIso, ssIdx, '#818cf8')}
    </div>
    <div class="m-tile" style="grid-column:1/-1;margin-top:2px">
      <div class="m-label"><i class="ph ph-moon-stars"></i>${t('moon_phase_label')}</div>
      <div class="m-val" style="font-size:15px;font-family:var(--font-body)">${moonPhaseInfo(new Date()).emoji} ${moonPhaseInfo(new Date()).label}</div>
    </div>
    <div class="m-note"><i class="ph-fill ph-camera"></i><p><b>${t('golden_title')}.</b> ${t('golden_desc')}</p></div>`;
  openModal(t('sun_modal_title'), state.locationName, body);
}

function showAdvice() {
  if (!state.weather) return;
  const h = state.weather.hourly, i = state.nowIdx;
  const d = state.weather.daily;
  const now = tzNow(state.tz);
  const temp = getVal(h, 'temperature_2m', i);
  const feels = getVal(h, 'apparent_temperature', i);
  const code = getVal(h, 'weathercode', i);
  const wind = getVal(h, 'windspeed_10m', i);
  const gust = getVal(h, 'windgusts_10m', i);
  const vis = getVal(h, 'visibility', i);
  const uv = getVal(h, 'uv_index', i);
  const hum = getVal(h, 'relativehumidity_2m', i);
  const press = getVal(h, 'surface_pressure', i);
  const dew = getVal(h, 'dewpoint_2m', i);
  const precipProb = getVal(h, 'precipitation_probability', i) || 0;
  const precip = getVal(h, 'precipitation', i) || 0;
  const type = wmo(code).type;
  const night = hourIsNight(i);
  const raining = RAIN_CODES.includes(code);
  const snowing = SNOW_CODES.includes(code);
  const tempDiff = feels != null && temp != null ? Math.round(feels - temp) : 0;

  /* Pressure trend */
  const pPrev = i - 3 >= 0 ? getVal(h, 'surface_pressure', i - 3) : null;
  let pressTrend = '';
  if (press != null && pPrev != null) {
    const diff = press - pPrev;
    pressTrend = diff > 0.5 ? t('press_rising') : diff < -0.5 ? t('press_falling') : '';
  }

  /* Upcoming rain */
  const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  let upcomingRain = false, rainIn = 0;
  for (let k = i + 1; k < Math.min(i + 6, h.time.length); k++) {
    if (rainCodes.includes(getVal(h, 'weathercode', k)) && (getVal(h, 'precipitation_probability', k) || 0) >= 30) {
      upcomingRain = true; rainIn = k - i; break;
    }
  }

  /* Dew point comfort */
  let dewFeel = '';
  if (dew != null) {
    if (dew > 18) dewFeel = t('dew_uncomfortable');
    else if (dew > 13) dewFeel = t('dew_sticky');
    else if (dew > 8) dewFeel = t('dew_pleasant');
  }

  const items = [];

  /* 1. Temperature experience */
  if (tempDiff <= -3) items.push(['ph-thermometer-cold', 'text:#38bdf8', t('advice_colder') + ' ' + Math.abs(tempDiff) + '°']);
  else if (tempDiff >= 3) items.push(['ph-thermometer-hot', 'text:#f87171', t('advice_hotter') + ' ' + tempDiff + '°']);
  else items.push(['ph-thermometer', 'text:#34d399', t('feels_like') + ': ' + fmtTempDeg(feels)]);

  /* 2. Precipitation */
  if (snowing) items.push(['ph-snowflake', 'text:#e2e8f0', t('advice_snow_now') + (precip > 0 ? ' (' + fmtPrecip(precip) + ')' : '')]);
  else if (type === 'storm') items.push(['ph-cloud-lightning', 'text:#c084fc', t('advice_storm')]);
  else if (raining) items.push(['ph-umbrella', 'text:#60a5fa', t('advice_rain_now') + (precip > 0 ? ' (' + fmtPrecip(precip) + ')' : '')]);
  else if (upcomingRain) items.push(['ph-umbrella', 'text:#60a5fa', t('advice_rain_soon').replace('{h}', String(rainIn))]);

  /* 3. Wind */
  if (gust != null && gust >= 20) items.push(['ph-wind', 'text:#f87171', t('advice_windy') + ' (' + t('wind_gusts') + ' ' + fmtWind(gust) + ')']);
  else if (wind > 15) items.push(['ph-wind', 'text:#cbd5e1', t('advice_windy')]);

  /* 4. UV */
  if (uv != null && !night) {
    if (uv >= 8) items.push(['ph-sun-dim', 'text:#f87171', t('uv_index') + ': ' + uvLabel(uv) + ' — ' + t('advice_uv_extreme')]);
    else if (uv >= 6) items.push(['ph-sun-dim', 'text:#fbbf24', t('uv_index') + ': ' + uvLabel(uv) + ' — ' + t('advice_uv_high')]);
    else if (uv >= 3) items.push(['ph-sun-dim', 'text:#fbbf24', t('uv_index') + ': ' + uvLabel(uv) + ' — ' + t('advice_uv_moderate')]);
  }

  /* 5. Visibility */
  if (vis != null && vis < 200) items.push(['ph-cloud-fog', 'text:#94a3b8', t('advice_fog_dense')]);
  else if (vis != null && vis < 1000) items.push(['ph-cloud-fog', 'text:#94a3b8', t('advice_fog')]);

  /* 6. Dew point */
  if (dewFeel) items.push(['ph-drop-half', 'text:#818cf8', dewFeel]);

  /* 7. Pressure trend */
  if (pressTrend) items.push(['ph-trend-up', 'text:#a78bfa', t('pressure') + ' ' + Math.round(press) + ' ' + t('unit_hpa') + ' · ' + pressTrend]);

  /* 8. Golden hour */
  const srIso = getVal(d, 'sunrise', state.todayIdx);
  const ssIso = getVal(d, 'sunset', state.todayIdx);
  if (srIso && ssIso && !night) {
    const nMin = now.hour * 60 + now.minute;
    const sr = minOfDay(srIso), ss = minOfDay(ssIso);
    if (nMin >= sr && nMin <= sr + 60) items.push(['ph-camera', 'text:#fbbf24', t('golden_morning')]);
    else if (nMin >= ss - 60 && nMin <= ss) items.push(['ph-camera', 'text:#fb923c', t('golden_evening')]);
  }

  /* Clothing */
  let wear = '';
  if (snowing || (feels != null && feels < -5)) wear = t('wear_arctic');
  else if (feels != null && feels < 5) wear = t('wear_cold');
  else if (feels != null && feels < 12) wear = t('wear_cool');
  else if (feels != null && feels < 22) wear = t('wear_mild');
  else if (feels != null && feels < 28) wear = t('wear_warm');
  else wear = t('wear_hot');
  if (raining || upcomingRain) wear += ' · ' + t('wear_rain_gear');

  const list = items.map(it => `
    <div class="m-list-row" style="cursor:default">
      <span class="row-ico" style="background:var(--accent-soft)"><i class="ph-fill ${it[0]}" style="color:${it[1].split(':')[1]}"></i></span>
      <span class="row-main"><b>${it[2]}</b></span>
    </div>`).join('');

  const lifeNowBlock = renderLifeNowBlock(h, i);

  const body = `
    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:14px">${list}</div>
    <div class="m-note"><i class="ph-fill ph-t-shirt"></i><p><b>${t('wear_title')}:</b> ${wear}</p></div>
    ${lifeNowBlock}`;
  openModal(state.locationName, t('analysis_title') + ' · ' + fmtTempDeg(temp) + ' · ' + wmoLabel(code), body);
  bindLifeNowCards(i);
}

/* ---------------- LifeSky "right now" mini-scores (inside Weather analysis) --------- */
const LIFE_NOW_TYPES = [
  { type: 'run', icon: 'ph-sneaker-move', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
  { type: 'car', icon: 'ph-car', color: '#60a5fa', bg: 'rgba(96,165,250,.14)' },
  { type: 'walk', icon: 'ph-footprints', color: '#fb923c', bg: 'rgba(251,146,60,.14)' }
];
/* Renders the compact 3-card "score right now" strip. Falls back to an empty
   string (rather than throwing) if the hourly slot has no usable data yet,
   so a partially-loaded forecast never breaks the rest of the modal. */
function renderLifeNowBlock(h, i) {
  if (!h || !h.time || i == null || i < 0 || i >= h.time.length) return '';
  const scoreFns = { run: scoreRun, car: scoreCarWash, walk: scoreWalk };
  const titles = { run: t('life_run_title'), car: t('life_car_title'), walk: t('life_walk_title') };
  let cards = '';
  for (const cfg of LIFE_NOW_TYPES) {
    let score = 0;
    try { score = scoreFns[cfg.type](h, i); } catch (e) { score = 0; }
    const color = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';
    cards += `
      <div class="life-now-card" data-life-now="${cfg.type}" role="button" tabindex="0" aria-label="${escHtml(titles[cfg.type])} · ${score}/100">
        <div class="life-now-ico" style="background:${cfg.bg};color:${cfg.color}"><i class="ph-fill ${cfg.icon}"></i></div>
        <span class="life-now-label">${escHtml(titles[cfg.type])}</span>
        <span class="life-now-score" style="color:${color}">${score}</span>
        <span class="life-now-tag" style="background:${color}1a;color:${color}">${escHtml(scoreLabel(score))}</span>
      </div>`;
  }
  return `
    <div class="life-now-title"><i class="ph-fill ph-heartbeat"></i><span>${escHtml(t('life_now_title'))}</span></div>
    <div class="life-now-grid">${cards}</div>
    <p class="life-now-hint">${escHtml(t('life_now_tap'))}</p>`;
}
/* Wires the "right now" cards to drill straight into that activity's detail
   view for the current hour (same detail screen the 7-day list uses). */
function bindLifeNowCards(nowIndex) {
  const nodes = el.modalBody.querySelectorAll('.life-now-card[data-life-now]');
  nodes.forEach(node => {
    const type = node.dataset.lifeNow;
    const open = () => showLifeSkySlot(nowIndex, type);
    node.addEventListener('click', open);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

/* ---------------- lifestyle ---------------- */
/* ---------- Lifestyle: smart multi-signal analysis ---------- */
/* Check precipitation probability for next N hours starting from index i */
function futurePrecipMax(h, startIdx, hours) {
  let maxP = 0;
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const p = getVal(h, 'precipitation_probability', k) || 0;
    if (p > maxP) maxP = p;
  }
  return maxP;
}
/* Check weather codes for rain/storm/snow in next N hours */
function futureHasRain(h, startIdx, hours) {
  const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  const snowCodes = [71, 73, 75, 77, 85, 86];
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const c = getVal(h, 'weathercode', k);
    const p = getVal(h, 'precipitation_probability', k) || 0;
    if (rainCodes.includes(c) && p >= 30) return true;
    if (snowCodes.includes(c) && p >= 30) return true;
  }
  return false;
}
/* Get max wind gusts for next N hours */
function futureMaxWind(h, startIdx, hours) {
  let maxW = 0;
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const w = getVal(h, 'windspeed_10m', k) || 0;
    const g = getVal(h, 'windgusts_10m', k) || 0;
    if (g > maxW) maxW = g;
    if (w > maxW) maxW = w;
  }
  return maxW;
}
/* Check for fog (visibility < 1km) in next N hours */
function futureHasFog(h, startIdx, hours) {
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const v = getVal(h, 'visibility', k);
    if (v != null && v < 1000) return true;
  }
  return false;
}
/* Check for storm/lightning in next N hours */
function futureHasStorm(h, startIdx, hours) {
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const c = getVal(h, 'weathercode', k);
    if ([95, 96, 99].includes(c)) return true;
  }
  return false;
}
/* Get min temp for next N hours */
function futureMinTemp(h, startIdx, hours) {
  let min = Infinity;
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const t = getVal(h, 'temperature_2m', k);
    if (t != null && t < min) min = t;
  }
  return min;
}
/* Get max UV for next N hours */
function futureMaxUV(h, startIdx, hours) {
  let max = 0;
  for (let k = startIdx; k < Math.min(startIdx + hours, h.time.length); k++) {
    const u = getVal(h, 'uv_index', k);
    if (u != null && u > max) max = u;
  }
  return max;
}
/* Format a score 0-100 into a human label */
function scoreLabel(score) {
  if (score >= 90) return t('life_score_excellent');
  if (score >= 70) return t('life_score_good');
  if (score >= 50) return t('life_score_fair');
  if (score >= 30) return t('life_score_poor');
  return t('life_score_bad');
}
/* Score a slot for running — 0-100 */
function scoreRun(h, i) {
  const temp = getVal(h, 'temperature_2m', i) || 15;
  const wind = futureMaxWind(h, i, 2);
  const code = getVal(h, 'weathercode', i);
  const rainProb = futurePrecipMax(h, i, 12);
  const uv = getVal(h, 'uv_index', i) || 0;
  const vis = getVal(h, 'visibility', i) || 20000;
  const hr = parseInt(h.time[i].slice(11, 13), 10);
  let s = 100;

  // Rain check
  if (futureHasRain(h, i, 12)) s -= 45;
  else if (rainProb > 40) s -= 25;

  // Storm
  if (futureHasStorm(h, i, 6)) s -= 50;

  // Wind
  if (wind > 30) s -= 35;
  else if (wind > 20) s -= 15;

  // Temperature comfort (ideal: 8-18°C)
  const tempComfort = temp >= 8 && temp <= 18;
  if (temp < 0) s -= 30;
  else if (temp < 5) s -= 15;
  else if (temp > 28) s -= 20;
  else if (!tempComfort) s -= 5;

  // UV exposure
  if (uv >= 8) s -= 20;
  else if (uv >= 6) s -= 10;

  // Visibility
  if (vis < 1000) s -= 30;
  else if (vis < 3000) s -= 10;

  // Time of day
  if (hr < 6 || hr > 21) s -= 20;
  else if (hr < 7 || hr > 20) s -= 5;

  // Snow
  const snowCodes = [71, 73, 75, 77, 85, 86];
  if (snowCodes.includes(code)) s -= 30;

  return Math.max(0, Math.min(100, s));
}
/* Score a slot for car wash — 0-100 (higher = better day to wash) */
function scoreCarWash(h, i) {
  const wind = futureMaxWind(h, i, 24);
  const rainProb = futurePrecipMax(h, i, 24);
  const code = getVal(h, 'weathercode', i);
  const temp = getVal(h, 'temperature_2m', i) || 15;
  const hr = parseInt(h.time[i].slice(11, 13), 10);
  let s = 100;

  // CRITICAL: rain within 24h destroys wash quality
  if (futureHasRain(h, i, 24)) s -= 60;
  else if (rainProb >= 40) s -= 40;
  else if (rainProb >= 20) s -= 15;

  // Drying wind: 5-15 km/h is ideal, too much wind = dust/dirt
  if (wind > 35) s -= 25;  // Very strong wind = blowing dirt
  else if (wind > 25) s -= 15;
  else if (wind < 3) s -= 10;  // No wind = slow drying

  // Temperature for drying: < 0 means water freezes, > 35 means water spots
  if (temp < 0) s -= 40;  // Water freezes on car!
  if (temp > 35) s -= 15;
  else if (temp < 5) s -= 5;

  // Time of day: early morning (before sun heats the car) or evening are best
  if (hr >= 8 && hr <= 10) s += 5;  // Sweet spot
  else if (hr >= 11 && hr <= 14) s -= 10;  // Sun heats car, causes water spots
  else if (hr >= 19 || hr < 6) s += 5;

  // Snow or ice
  const snowCodes = [71, 73, 75, 77, 85, 86];
  if (snowCodes.includes(code)) s -= 40;

  return Math.max(0, Math.min(100, s));
}
/* Score a slot for walking — 0-100 */
function scoreWalk(h, i) {
  const temp = getVal(h, 'temperature_2m', i) || 15;
  const wind = futureMaxWind(h, i, 6);
  const code = getVal(h, 'weathercode', i);
  const rainProb = futurePrecipMax(h, i, 12);
  const uv = getVal(h, 'uv_index', i) || 0;
  const vis = getVal(h, 'visibility', i) || 20000;
  const hum = getVal(h, 'relativehumidity_2m', i) || 50;
  const hr = parseInt(h.time[i].slice(11, 13), 10);
  let s = 100;

  // Weather conditions
  if (futureHasStorm(h, i, 6)) s -= 50;
  if (futureHasRain(h, i, 12)) s -= 30;
  else if (rainProb > 40) s -= 20;
  else if (rainProb > 20) s -= 8;

  // Wind
  if (wind > 40) s -= 30;
  else if (wind > 25) s -= 15;
  else if (wind > 15) s -= 5;

  // Temperature comfort (ideal: 15-25°C)
  if (temp < -10) s -= 40;
  else if (temp < 0) s -= 20;
  else if (temp < 10) s -= 10;
  else if (temp > 35) s -= 25;
  else if (temp > 30) s -= 10;

  // Visibility
  if (vis < 500) s -= 40;
  else if (vis < 1000) s -= 25;
  else if (vis < 3000) s -= 10;

  // UV
  if (uv >= 8) s -= 15;
  else if (uv >= 6) s -= 8;

  // Humidity: too high = sticky
  if (hum > 85) s -= 10;

  // Fog
  if (futureHasFog(h, i, 6)) s -= 15;

  // Time of day
  if (hr < 7 || hr > 21) s -= 10;

  // Snow (walking in snow can be beautiful, but slippery)
  const snowCodes = [71, 73, 75, 77, 85, 86];
  if (snowCodes.includes(code)) s -= 15;

  return Math.max(0, Math.min(100, s));
}

function showLifestyle(type) {
  if (!state.weather) return;
  const h = state.weather.hourly;
  const titles = { run: t('life_run_title'), car: t('life_car_title'), walk: t('life_walk_title') };
  const scoreFn = { run: scoreRun, car: scoreCarWash, walk: scoreWalk }[type];

  /* Scan next 7 days for the best slots */
  const slots = [];
  const start = state.nowIdx;
  const end = Math.min(start + 168, h.time.length);
  for (let i = start; i < end; i++) {
    const hr = parseInt(h.time[i].slice(11, 13), 10);
    const score = scoreFn(h, i);
    /* Only show slots where the score is reasonable (>20) and at a normal time */
    if (score > 20 && hr >= 5 && hr <= 23) {
      const temp = getVal(h, 'temperature_2m', i);
      const wind = futureMaxWind(h, i, 3);
      const rain = futurePrecipMax(h, i, 6);
      const code = getVal(h, 'weathercode', i);
      slots.push({ i, score, temp, wind, rain, code });
    }
    if (slots.length >= 8) break;
  }

  /* Sort by score descending, then by time ascending */
  slots.sort((a, b) => b.score - a.score || a.i - b.i);
  /* Take only top 8 unique time slots */
  const shown = slots.slice(0, 8);

  let rows = '';
  if (shown.length) {
    shown.forEach(s => {
      const dt = parseLocal(h.time[s.i]);
      const color = s.score >= 70 ? '#34d399' : s.score >= 40 ? '#fbbf24' : '#f87171';
      const icon = s.score >= 70 ? 'ph-check-circle' : s.score >= 40 ? 'ph-minus-circle' : 'ph-x-circle';
      rows += `
        <div class="m-list-row" data-slot="${s.i}">
          <span class="row-ico" style="background:${color}14"><i class="ph-fill ${icon}" style="color:${color}"></i></span>
          <span class="row-main"><b>${dt.toLocaleDateString(loc(), { weekday: 'short' }).replace('.', '')} · ${h.time[s.i].slice(11, 16)}</b><span>${dt.toLocaleDateString(loc(), { day: 'numeric', month: 'short' })}</span></span>
          <span class="row-side">${scoreLabel(s.score)}<small>${fmtTemp(s.temp)}° · ${fmtWind(s.wind)}</small></span>
          <i class="ph-bold ph-caret-right" style="color:var(--text-4)"></i>
        </div>`;
    });
  } else {
    rows = `<div class="ac-empty" style="padding:20px">${t('life_no_slots')}</div>`;
  }

  const body = `
    <p style="font-size:12.5px;color:var(--text-3);font-weight:600;margin-bottom:12px">${t('life_best_time')}</p>
    <div style="display:flex;flex-direction:column;gap:9px">${rows}</div>`;
  openModal(`${titles[type]} · ${t('life_analysis_7days')}`, state.locationName, body);

  el.modalBody.querySelectorAll('.m-list-row[data-slot]').forEach(node => {
    node.addEventListener('click', () => showLifeSkySlot(+node.dataset.slot, type));
  });
}

function showLifeSkySlot(index, type) {
  const h = state.weather.hourly;
  const temp = getVal(h, 'temperature_2m', index);
  const wind = getVal(h, 'windspeed_10m', index);
  const gust = getVal(h, 'windgusts_10m', index);
  const hum = getVal(h, 'relativehumidity_2m', index);
  const uv = getVal(h, 'uv_index', index);
  const vis = getVal(h, 'visibility', index);
  const dew = getVal(h, 'dewpoint_2m', index);
  const press = getVal(h, 'surface_pressure', index);
  const rain = futurePrecipMax(h, index, 12);
  const scoreFn = { run: scoreRun, car: scoreCarWash, walk: scoreWalk }[type];
  const score = scoreFn(h, index);
  const dt = parseLocal(h.time[index]);
  const timeStr = dt.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const titles = { run: t('life_run_title'), car: t('life_car_title'), walk: t('life_walk_title') };

  let advice = '';
  if (type === 'run') {
    let wear;
    if (temp < 5) wear = t('wear_cold');
    else if (temp < 12) wear = t('wear_cool');
    else if (temp < 20) wear = t('wear_mild');
    else wear = t('wear_warm');
    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px;border-color:${score >= 50 ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)'}">
        <i class="ph-fill ${score >= 50 ? 'ph-check-circle' : 'ph-warning-circle'}" style="color:${score >= 50 ? '#34d399' : '#f87171'}"></i>
        <p><b>${t('life_score')} ${score}/100</b> · ${scoreLabel(score)}</p>
      </div>
      <div class="m-note" style="margin-top:0;margin-bottom:12px"><i class="ph-fill ph-t-shirt"></i><p><b>${t('wear_title')}:</b> ${wear}</p></div>
      <div class="m-grid">
        ${mTile('ph-wind', t('wind'), fmtWind(wind) + (gust && gust > wind ? ' · ' + t('wind_gusts') + ' ' + fmtWind(gust) : ''))}
        ${mTile('ph-sun', t('uv_index'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
        ${mTile('ph-eye', t('visibility'), fmtVis(vis))}
        ${mTile('ph-cloud-rain', t('rain_chance'), Math.round(rain) + '%')}
        ${mTile('ph-drop', t('humidity'), hum != null ? Math.round(hum) + '%' : '--')}
        ${mTile('ph-drop-half', t('dew_point'), fmtTempDeg(dew))}
      </div>`;
  } else if (type === 'car') {
    const risk = rain;
    let riskAdvice;
    if (score >= 70) riskAdvice = t('car_advice_great');
    else if (score >= 40) riskAdvice = t('car_advice_ok');
    else riskAdvice = t('car_advice_bad');

    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px;border-color:${score >= 50 ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)'}">
        <i class="ph-fill ${score >= 50 ? 'ph-check-circle' : 'ph-warning-circle'}" style="color:${score >= 50 ? '#34d399' : '#f87171'}"></i>
        <p><b>${t('life_score')} ${score}/100</b> · ${scoreLabel(score)}<br>${riskAdvice}</p>
      </div>
      <div class="m-grid">
        ${mTile('ph-cloud-rain', t('rain_risk_title') + ' · 24ч', Math.round(risk) + '%')}
        ${mTile('ph-wind', t('wind'), fmtWind(wind) + (gust && gust > wind ? ' · ' + t('wind_gusts') + ' ' + fmtWind(gust) : ''))}
        ${mTile('ph-thermometer', t('temp'), fmtTempDeg(temp))}
        ${mTile('ph-eye', t('visibility'), fmtVis(vis))}
      </div>`;
  } else {
    let comfort = t('comfort_good');
    if (temp < -10) comfort = t('comfort_cold');
    else if (temp < 5) comfort = t('comfort_cool');
    else if (temp > 30) comfort = t('comfort_hot');
    else if (temp > 25) comfort = t('comfort_warm');
    const windDesc = wind > 15 ? t('wind_windy') : wind > 8 ? t('wind_light') : t('wind_none');
    advice = `
      <div class="m-note" style="margin-top:0;margin-bottom:12px;border-color:${score >= 50 ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)'}">
        <i class="ph-fill ${score >= 50 ? 'ph-check-circle' : 'ph-warning-circle'}" style="color:${score >= 50 ? '#34d399' : '#f87171'}"></i>
        <p><b>${t('life_score')} ${score}/100</b> · ${scoreLabel(score)}</p>
      </div>
      <div class="m-note" style="margin-top:0;margin-bottom:12px"><i class="ph-fill ph-smiley"></i><p><b>${t('comfort_title')}:</b> ${comfort}. ${windDesc}</p></div>
      <div class="m-grid">
        ${mTile('ph-wind', t('wind'), fmtWind(wind) + (gust && gust > wind ? ' · ' + t('wind_gusts') + ' ' + fmtWind(gust) : ''))}
        ${mTile('ph-sun', t('uv_index'), uv != null ? (Math.round(uv * 10) / 10).toLocaleString(loc()) + ' · ' + uvLabel(uv) : '--')}
        ${mTile('ph-drop', t('humidity'), hum != null ? Math.round(hum) + '%' : '--')}
        ${mTile('ph-drop-half', t('dew_point'), fmtTempDeg(dew))}
        ${mTile('ph-cloud-rain', t('rain_chance'), Math.round(rain) + '%')}
        ${mTile('ph-eye', t('visibility'), fmtVis(vis))}
      </div>`;
  }

  const body = `
    <button class="m-back" id="life-back"><i class="ph-bold ph-arrow-left"></i>${titles[type]} · ${t('life_analysis_7days')}</button>
    <div class="m-detail-hero" style="padding-top:0">
      <div class="m-temp" style="font-size:26px">${timeStr}</div>
      <div class="m-desc">${t('slot_details')}</div>
    </div>
    ${advice}`;
  openModal(titles[type], state.locationName, body);
  $('life-back').addEventListener('click', () => showLifestyle(type));
}



/* ---------------- maps & radar: LAZY subsystem ---------------- */
/* The MapLibre views, the RainViewer radar and all their UI wiring live in
   the on-demand module js/modules/11-map-radar.js. They are fetched by the
   LiveSkyMap facade (10-bootstrap.js) on the first real map/radar
   interaction and are never part of the boot path. Eager code below only
   talks to the facade, which is a safe no-op until the subsystem loads. */

/* ---------------- theme / lang / settings ---------------- */
const THEME_CYCLE = { adaptive: 'light', light: 'dark', dark: 'adaptive' };
const THEME_KEYS = { adaptive: 'theme_adaptive', light: 'theme_light', dark: 'theme_dark' };

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  updateThemeLabel();
  if (window.LiveSkyMap) LiveSkyMap.refreshTiles();
  applyWeatherTheme();
  syncMenuChecks();
  store.set('livesky:theme', state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'light' ? '#eef4fb' : '#05070f');
  if (window.pywebview && window.pywebview.api && window.pywebview.api.set_window_theme) {
    window.pywebview.api.set_window_theme(state.theme).catch(() => {});
  }
}
function cycleTheme() {
  state.theme = THEME_CYCLE[state.theme] || 'adaptive';
  applyTheme();
}
function setTheme(theme) {
  if (!THEME_KEYS[theme]) return;
  state.theme = theme;
  applyTheme();
}
function setMenuOpen(open) {
  if (el.mainMenu) el.mainMenu.classList.toggle('open', open);
  if (el.menuBtn) el.menuBtn.setAttribute('aria-expanded', String(open));
  /* Every open starts at the top of the scroll area. */
  if (open && el.spBody) el.spBody.scrollTop = 0;
  /* Scrim behind the bottom sheet (phones) */
  if (el.menuBackdrop) el.menuBackdrop.classList.toggle('show', open);
  /* Prevent scrolling behind the menu on mobile */
  if (open) document.body.classList.add('menu-scroll-lock');
  else document.body.classList.remove('menu-scroll-lock');
}

/* Phones: drag the sheet's handle down to dismiss it. */
function initSheetDrag() {
  if (!el.spGrab || !el.mainMenu || typeof window.PointerEvent !== 'function') return;
  let startY = null;
  const reset = () => {
    if (!el.mainMenu) return;
    el.mainMenu.style.transition = '';
    el.mainMenu.style.transform = '';
    startY = null;
  };
  on(el.spGrab, 'pointerdown', (e) => {
    startY = e.clientY;
    el.mainMenu.style.transition = 'none';
    if (el.spGrab.setPointerCapture) { try { el.spGrab.setPointerCapture(e.pointerId); } catch (err) {} }
  });
  on(el.spGrab, 'pointermove', (e) => {
    if (startY == null) return;
    const dy = Math.max(0, e.clientY - startY);
    el.mainMenu.style.transform = `translateY(${dy}px)`;
  });
  const end = (e) => {
    if (startY == null) return;
    const dy = Math.max(0, (e.clientY || 0) - startY);
    reset();
    if (dy > 90) setMenuOpen(false);
  };
  on(el.spGrab, 'pointerup', end);
  on(el.spGrab, 'pointercancel', () => reset());
}
function syncMenuChecks() {
  if (!el.mainMenu) return;
  el.mainMenu.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('selected', b.dataset.lang === state.lang));
  el.mainMenu.querySelectorAll('[data-theme-pick]').forEach(b => b.classList.toggle('selected', b.dataset.themePick === state.theme));
  if (el.modelSelect) el.modelSelect.value = state.model;
  if (el.unitsSelect) el.unitsSelect.value = state.units;
}
function updateThemeLabel() {
  if (!el.themeLabel) return;
  el.themeLabel.dataset.translate = THEME_KEYS[state.theme];
  el.themeLabel.textContent = t(THEME_KEYS[state.theme]);
}

function applyTranslations() {
  document.querySelectorAll('[data-translate]').forEach(node => {
    const key = node.dataset.translate;
    if (!key) return;
    node.textContent = t(key);
  });
  /* select options */
  const modelLabels = { auto: 'source_model_auto', ecmwf_ifs025: 'source_model_ecmwf', gfs_seamless: 'source_model_gfs', icon_seamless: 'source_model_icon' };
  if (el.modelSelect) [...el.modelSelect.options].forEach(o => { o.textContent = t(modelLabels[o.value] || o.value); });
  const unitsLabels = { metric: 'units_metric', imperial: 'units_imperial' };
  if (el.unitsSelect) [...el.unitsSelect.options].forEach(o => { o.textContent = t(unitsLabels[o.value]); });
  /* the header button carries a visible label in some layouts */
  if (el.menuBtn) {
    const label = t('settings');
    el.menuBtn.setAttribute('aria-label', label);
    el.menuBtn.setAttribute('title', label);
  }
  const versionNode = document.getElementById('sp-version');
  if (versionNode) versionNode.textContent = APP_VERSION;
  syncMenuChecks();
}

function setLang(lang) {
  if (!I18N[lang]) return;
  state.lang = lang;
  store.set('livesky:lang', lang);
  el.input.placeholder = t('search_ph');
  setMenuOpen(false);
  applyTranslations();
  updateThemeLabel();
  syncMenuChecks();
  clockTick();
  if (state.weather) renderAll();
}

/* ---------------- fullscreen ---------------- */
let isFullscreen = false;
function toggleFullscreen() {
  if (window.pywebview && window.pywebview.api && window.pywebview.api.toggle_fullscreen) {
    window.pywebview.api.toggle_fullscreen()
      .then((s) => { isFullscreen = !!s; updateFsIcon(); })
      .catch(() => nativeFullscreenToggle());
  } else nativeFullscreenToggle();
}
function nativeFullscreenToggle() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => { isFullscreen = true; updateFsIcon(); }).catch(() => {});
  } else if (document.exitFullscreen) {
    document.exitFullscreen().then(() => { isFullscreen = false; updateFsIcon(); });
  }
}
function updateFsIcon() {
  el.fsIcon.classList.toggle('ph-corners-out', !isFullscreen);
  el.fsIcon.classList.toggle('ph-corners-in', isFullscreen);
}

/* ---------------- events ---------------- */
function bindEvents() {
  on(el.searchForm, 'submit', handleSearch);
  on(el.input, 'input', handleInput);
  on(el.input, 'focus', () => {
    if (el.input.value.trim()) return;
    clearTimeout(state.favOpenTimer);
    if (Date.now() < state.uiLockUntil) return; /* just closed an overlay — don't pop the list under the pointer */
    if (FAV_LIST_DELAY_MS === 0) { renderFavoritesList(); return; }
    state.favOpenTimer = setTimeout(() => {
      if (Date.now() < state.uiLockUntil) return;
      if (document.activeElement !== el.input) return;
      if (el.input.value.trim()) return;
      renderFavoritesList();
    }, FAV_LIST_DELAY_MS);
  });
  on(el.input, 'blur', () => clearTimeout(state.favOpenTimer));
  on(el.input, 'keydown', (e) => {
    if (e.key === 'Escape') { closeAutocomplete(); el.input.blur(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      acMove(e.key === 'ArrowDown' ? 1 : -1);
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      const active = el.autoList.querySelector('.ac-item.active');
      if (active && !el.autoList.classList.contains('hidden')) { e.preventDefault(); active.click(); }
    }
  });
  on(el.searchClear, 'click', () => {
    el.input.value = '';
    el.searchClear.classList.add('hidden');
    el.input.focus();
    renderFavoritesList();
  });
  on(el.favBtn, 'click', (e) => { e.preventDefault(); toggleFavorite(); });

  /* unified menu: language, theme, units, model, geolocation, fullscreen, refresh */
  on(el.menuBtn, 'click', (e) => {
    e.stopPropagation();
    setMenuOpen(!el.mainMenu.classList.contains('open'));
  });
  on(el.mainMenu, 'click', (e) => {
    const langBtn = e.target.closest('[data-lang]');
    if (langBtn) { setLang(langBtn.dataset.lang); return; }
    const themeBtn = e.target.closest('[data-theme-pick]');
    if (themeBtn) { setTheme(themeBtn.dataset.themePick); setMenuOpen(false); return; }
    /* Selects (and their labels) stay open while being used. */
    const isSelect = e.target.closest('.sp-select, .sp-field');
    if (!isSelect) {
      clearTimeout(state._menuCloseTimer);
      state._menuCloseTimer = setTimeout(() => setMenuOpen(false), 800);
    }
  });
  on(el.menuClose, 'click', () => setMenuOpen(false));
  on(el.menuBackdrop, 'click', () => setMenuOpen(false));
  on(el.modelSelect, 'change', () => {
    state.model = el.modelSelect.value;
    store.set('livesky:model', state.model);
    setMenuOpen(false);
    fetchWeather();
  });
  on(el.unitsSelect, 'change', () => {
    state.units = el.unitsSelect.value;
    store.set('livesky:units', state.units);
    setMenuOpen(false);
    if (state.weather) renderAll();
  });
  on(el.fsItem, 'click', () => { setMenuOpen(false); toggleFullscreen(); });
  on(el.refreshItem, 'click', () => { setMenuOpen(false); fetchWeather(true); });
  on(el.geoItem, 'click', () => { setMenuOpen(false); getUserLocation(true); });

  /* quality preset (auto / maximum / eco) */
  on(el.effectsSelect, 'change', () => {
    state.effects = el.effectsSelect.value;
    store.set('livesky:effects', state.effects);
    setMenuOpen(false);
    if (state.effects === 'full') state._perfLow = false;
    applyEffects();
    /* start the FPS watchdog only on Auto; stop it otherwise so it never
       keeps an rAF loop running in the background on Maximum/Eco */
    if (state.effects === 'auto') PERF.start();
    else PERF.stop();
  });
  on(el.installItem, 'click', promptInstall);
  on(el.notifItem, 'click', () => { setMenuOpen(false); toggleNotifications(); });

  /* one-time install invitation */
  on(el.installCta, 'click', promptInstall);
  on(el.installClose, 'click', () => hideInstallPrompt(true));
  on(el.installLater, 'click', () => hideInstallPrompt(true));

  /* ---- lazy map / radar entry points -------------------------------------
     The whole map subsystem (MapLibre GL + 11-map-radar.js) is fetched on the
     first tap below; the facade then opens the expected screen directly. The
     radar controls themselves are bound inside the lazy module, exactly once. */

  /* Mini-map: a tap (NOT a drag) opens the fullscreen map. The handlers are
     eager because they must work before the map subsystem exists; drag
     distance keeps panning the mini map from opening the overlay. */
  let mapTapStart = null;
  on(el.mapSmall, 'pointerdown', (e) => { mapTapStart = { x: e.clientX, y: e.clientY }; });
  on(el.mapSmall, 'pointerup', (e) => {
    if (!mapTapStart) return;
    const dist = Math.hypot(e.clientX - mapTapStart.x, e.clientY - mapTapStart.y);
    mapTapStart = null;
    if (dist < 6) LiveSkyMap.open();
  });
  /* small-map badge opens fullscreen map with radar already on */
  on(el.mapRadarBadge, 'click', (e) => {
    e.preventDefault(); e.stopPropagation();
    LiveSkyMap.open({ radar: true });
  });

  on(el.adviceBtn, 'click', showAdvice);
  on(el.historyBtn, 'click', () => showMonthly('history'));
  on(el.sunCard, 'click', showSunDetails);
  on(el.aqiCard, 'click', showAirDetails);
  on(el.aqiCard, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showAirDetails(); } });
  on(el.sunCard, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSunDetails(); } });

  document.getElementById('life-run').addEventListener('click', () => showLifestyle('run'));
  document.getElementById('life-car').addEventListener('click', () => showLifestyle('car'));
  document.getElementById('life-walk').addEventListener('click', () => showLifestyle('walk'));
  ['life-run', 'life-car', 'life-walk'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById(id).click(); }
    });
  });

  if (el.consentAcceptBtn) {
    on(el.consentAcceptBtn, 'click', acceptLegalConsent);
  }
  if (el.consentCheckbox) {
    on(el.consentCheckbox, 'change', syncConsentButton);
    on(el.consentCheckbox, 'keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.consentCheckbox.checked = !el.consentCheckbox.checked; syncConsentButton(); }
    });
  }
  if (el.consentModal) {
    /* the overlay is not dismissible: clicking outside the card only nudges the user */
    on(el.consentModal, 'click', (e) => {
      if (e.target === el.consentModal) rejectConsentAttempt();
    });
    /* re-validate the stored record whenever the page could have been tampered with */
    on(window, 'storage', (e) => {
      if (!e || !e.key || e.key === CONSENT_KEY || e.key === TOS_KEY) guardLegalConsent();
    });
    on(window, 'focus', guardLegalConsent);
    on(window, 'pageshow', guardLegalConsent);
    on(document, 'visibilitychange', () => { if (!document.hidden) guardLegalConsent(); });
  }
  if (el.privacyAcceptBtn) on(el.privacyAcceptBtn, 'click', acceptPrivacyConsent);
  if (el.privacyCancelBtn) on(el.privacyCancelBtn, 'click', cancelPrivacyConsent);
  if (el.privacyModal) {
    on(el.privacyModal, 'click', (e) => {
      if (e.target === el.privacyModal) cancelPrivacyConsent();
    });
  }

  on(el.modalClose, 'click', closeModal);
  on(el.modal, 'click', (e) => { if (e.target === el.modal) closeModal(); });

  /* The 24-hour graph is a native horizontal scroller on touch screens.
     Arrow-key support keeps the focusable chart equally usable without touch. */
  on(el.chartScroll, 'keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const step = Math.max(180, Math.round((el.chartScroll.clientWidth || 320) * 0.65));
    el.chartScroll.scrollBy({ left: e.key === 'ArrowRight' ? step : -step, behavior: 'smooth' });
  });

  on(el.hLeft, 'click', () => el.hStrip.scrollBy({ left: -420, behavior: 'smooth' }));
  on(el.hRight, 'click', () => el.hStrip.scrollBy({ left: 420, behavior: 'smooth' }));

  on(el.brand, 'click', () => location.reload());

  document.addEventListener('click', (e) => {
    if (!el.searchForm.contains(e.target) && !el.autoList.contains(e.target)) closeAutocomplete();
    if (!el.menuBtn.contains(e.target) && !el.mainMenu.contains(e.target)) setMenuOpen(false);
  });

  initSheetDrag();

  document.addEventListener('keydown', (e) => {
    /* while the legal gate is up no shortcut may reach the application */
    if (consentLocked()) {
      if (e.key === 'Escape') e.preventDefault();
      return;
    }
    if (privacyDialogOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); cancelPrivacyConsent(); }
      return;
    }
    if (e.key === 'Escape') {
      if (el.mapModal.classList.contains('open')) { LiveSkyMap.close(); return; }
      if (el.modal.classList.contains('open')) { closeModal(); return; }
      if (installVisible) { hideInstallPrompt(true); return; }
      setMenuOpen(false);
      closeAutocomplete();
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing || el.modal.classList.contains('open') || el.mapModal.classList.contains('open')) return;
    if (e.key === '/' ) { e.preventDefault(); el.input.focus(); el.input.select(); return; }
    if (e.key === 'ArrowRight') el.hStrip.scrollBy({ left: 220, behavior: 'smooth' });
    if (e.key === 'ArrowLeft') el.hStrip.scrollBy({ left: -220, behavior: 'smooth' });
  });

  window.addEventListener('resize', () => {
    FX.resize();
    /* Recalc aspect-corrected rain hatch when the plot size changes. */
    clearTimeout(window.__chartHatchT);
    window.__chartHatchT = setTimeout(() => {
      if (state.weather && typeof renderChart === 'function') {
        try { SECTION_MANAGER.renderSection('chart'); } catch (e) { try { renderChart(); } catch (e2) {} }
      }
    }, 180);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clockTick();
      liveTick(true);
      FX.resume();
      if (state.effects === 'auto') PERF.start();
      /* On return: refresh if data is older than 2 minutes so rain that just
         stopped is reflected immediately. */
      if (Date.now() - state.lastFetchTs > 2 * 60 * 1000) fetchWeather(true);
      if (window.LiveSkyMap) LiveSkyMap.radarRefresh();
    } else {
      if (FX.running) {
        cancelAnimationFrame(FX.raf);
        FX.running = false;
      }
      PERF.stop();
      if (window.LiveSkyMap) LiveSkyMap.radarPause();
    }
  });
  /* Backup auto-refresh + weather-alert check. The live ticker already pulls
     every 3 minutes; this is a safety net for long background tabs. */
  setInterval(() => {
    if (!document.hidden && Date.now() - state.lastFetchTs > 3 * 60 * 1000) fetchWeather(true);
    if (!document.hidden) checkWeatherAlerts();
    if (!document.hidden && window.LiveSkyMap) LiveSkyMap.radarRefresh();
  }, 60 * 1000);
  /* offline state is surfaced by the offline banner (see initConnectivity) */
}

/* ---------------- reveal on scroll ---------------- */
function initReveal() {
  /* SECTION_MANAGER handles the outer .section-root containers.
     Only observe standalone .reveal elements not inside a managed section. */
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  if (!('IntersectionObserver' in window) || motionReduce) {
    items.forEach(n => n.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.06 });
  items.forEach(n => io.observe(n));
}

/* ---------------- PWA: service worker + install --------------- */
let deferredInstallPrompt = null;

function registerServiceWorker() {
  if (isNativeApp()) return; /* Capacitor bundles the shell; a second cache layer only causes stale assets */
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return; /* skip file:// and data: */
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* non-critical */ });
  });
}

/* ---- One-time install invitation ----------------------------------------
   The banner is a single, unobtrusive invitation at the bottom of the screen:

   · it appears only AFTER the Terms gate unlocks the app;
   · only where installing is actually possible — Chromium fires
     beforeinstallprompt, iOS Safari offers «Add to Home Screen» (we then show
     the two-step hint instead of a button the browser cannot honour);
   · never when LiveSky already runs as an installed app (standalone display
     mode / iOS home screen) or inside the native Android shell;
   · it slides away on its own if ignored, and a dismissed invitation never
     comes back — no nagging on every visit. */
const INSTALL_KEY = 'livesky:install_prompt';
/* Tests (and embeds) can shorten the delay — see tests/smoke.js phase10. */
const INSTALL_SHOW_DELAY_MS = window.LIVE_INSTALL_SHOW_DELAY_MS != null
  ? window.LIVE_INSTALL_SHOW_DELAY_MS : 1600;     /* after the gate unlocks */
const INSTALL_AUTO_HIDE_MS = 14000;              /* ignored → slides away */
const INSTALL_REPEAT_MS = 7 * 24 * 3600 * 1000;  /* ignored → at most once a week */
const INSTALL_MAX_SHOWS = 2;                     /* and never more than twice */

const installTimers = { show: null, hide: null };
let installVisible = false;
let installRearms = 0; /* bounds the "wait for the privacy dialog" re-arming */

function installState() {
  const s = store.get(INSTALL_KEY, null);
  return s && typeof s === 'object' ? s : {};
}
function writeInstallState(patch) {
  const next = Object.assign(installState(), patch);
  store.set(INSTALL_KEY, next);
  return next;
}

/* Running as an installed app? Standalone display mode, iOS home screen,
   a TWA/Capacitor shell, or a recorded appinstalled event. */
function isStandaloneDisplay() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch (e) { /* matchMedia/display-mode unsupported → assume a browser tab */ }
  if (window.navigator && window.navigator.standalone === true) return true;
  return false;
}
function isAppInstalled() {
  if (isNativeApp()) return true;
  const s = installState();
  if (s.installed === true) return true;
  return isStandaloneDisplay();
}

/* iOS Safari cannot install a PWA programmatically — it needs the Share →
   «Add to Home Screen» flow, so the banner shows the steps instead of a CTA.
   Chromium-based iOS browsers are excluded: they cannot install either. */
function isIosInstallable() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  if (!ios) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua);
}

/* Is there anything the banner could actually offer? */
function installSupported() {
  if (isAppInstalled()) return false;
  return !!deferredInstallPrompt || isIosInstallable();
}

function installCanAppear() {
  if (!el.installPrompt) return false;
  if (installVisible) return false;
  if (!installSupported()) return false;
  /* Never compete with the legal gate: ToS first, geolocation second. */
  if (typeof consentLocked === 'function' && consentLocked()) return false;
  if (typeof hasValidConsent === 'function' && !hasValidConsent()) return false;
  if (typeof privacyDialogOpen === 'function' && privacyDialogOpen()) return false;
  if (document.hidden) return false;
  const s = installState();
  if (s.dismissed === true) return false;          /* explicitly declined → gone for good */
  if ((s.shows || 0) >= INSTALL_MAX_SHOWS) return false;
  if (s.last && Date.now() - s.last < INSTALL_REPEAT_MS) return false;
  return true;
}

function scheduleInstallPrompt() {
  if (installTimers.show) return;
  if (!installCanAppear()) return;
  installTimers.show = setTimeout(() => {
    installTimers.show = null;
    /* The privacy dialog may still be up (or the tab sent to the background)
       — re-arm a bounded number of times instead of losing the invitation. */
    if (!installCanAppear()) {
      if (!installVisible && installRearms < 20) { installRearms++; scheduleInstallPrompt(); }
      return;
    }
    installRearms = 0;
    openInstallPrompt();
  }, INSTALL_SHOW_DELAY_MS);
}

function openInstallPrompt() {
  if (!el.installPrompt || installVisible) return;
  const iosHint = !deferredInstallPrompt && isIosInstallable();
  if (el.installSteps) el.installSteps.classList.toggle('hidden', !iosHint);
  if (el.installCta) el.installCta.classList.toggle('hidden', iosHint);
  if (el.installLater) el.installLater.classList.remove('hidden');

  el.installPrompt.classList.remove('hidden');
  el.installPrompt.classList.remove('out');
  installVisible = true;
  document.body.classList.add('install-prompt-open');
  /* Keep toasts (and the bottom of the page) clear of the banner. */
  const h = el.installPrompt.offsetHeight || 0;
  document.body.style.setProperty('--install-prompt-h', (h + 14) + 'px');

  const s = installState();
  writeInstallState({ shows: (s.shows || 0) + 1, last: Date.now() });

  clearTimeout(installTimers.hide);
  installTimers.hide = setTimeout(() => hideInstallPrompt(false), INSTALL_AUTO_HIDE_MS);
}

function hideInstallPrompt(dismissed) {
  clearTimeout(installTimers.hide);
  installTimers.hide = null;
  if (!el.installPrompt || !installVisible) return;
  installVisible = false;
  el.installPrompt.classList.add('out');
  document.body.classList.remove('install-prompt-open');
  document.body.style.removeProperty('--install-prompt-h');
  setTimeout(() => {
    if (installVisible) return; /* re-opened in the meantime */
    el.installPrompt.classList.add('hidden');
    el.installPrompt.classList.remove('out');
  }, 320);
  if (dismissed) writeInstallState({ dismissed: true, shows: INSTALL_MAX_SHOWS, last: Date.now() });
}

function markInstalled() {
  deferredInstallPrompt = null;
  writeInstallState({ installed: true, dismissed: true });
  hideInstallPrompt(false);
  updateInstallItem();
}

function updateInstallItem() {
  const show = installSupported();
  if (el.installGroup) el.installGroup.classList.toggle('hidden', !show);
  if (el.installItem) el.installItem.classList.toggle('hidden', !show);
}
function promptInstall() {
  if (!deferredInstallPrompt) {
    /* No native dialog (iOS Safari): the banner itself explains the way. */
    if (isIosInstallable() && !isAppInstalled()) {
      setMenuOpen(false);
      if (installVisible) hideInstallPrompt(true);
      else openInstallPrompt();
    }
    return;
  }
  hideInstallPrompt(true); /* the banner has done its job */
  const p = deferredInstallPrompt;
  deferredInstallPrompt = null;
  updateInstallItem();
  try {
    p.prompt();
  } catch (e) { /* a rejected prompt must never break the UI */ }
  if (p.userChoice && typeof p.userChoice.then === 'function') {
    p.userChoice.then((choice) => {
      if (choice && choice.outcome === 'accepted') markInstalled();
      else writeInstallState({ last: Date.now() }); /* refused → stay quiet for now */
    }).catch(() => {});
  }
}
function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallItem();
    scheduleInstallPrompt(); /* fires immediately if the gate is already open */
  });
  window.addEventListener('appinstalled', markInstalled);
  if (isStandaloneDisplay()) writeInstallState({ installed: true });
  updateInstallItem();
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

