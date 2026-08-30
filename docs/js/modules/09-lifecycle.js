/* ============================================================
   LiveSky Weather Pro — LIFECYCLE & GATING (layer 3)
   ------------------------------------------------------------
     • `SECTION_MANAGER` — Smart Visibility (active/unload/mount)
     • legal consent + privacy/geolocation gate (sequential)
   Consumes: lower layers; `applyEffects` re-applied on state changes.
   ============================================================ */
/* ---------- Section Lifecycle Manager (Smart Visibility) ---------- */
/*
   Genuine "heavy DOM removed" optimization. Each section lives in one of three
   states:

     - 'active':   in/near the viewport — content mounted and rendered.
     - 'inactive': off-screen but not far — content stays mounted (cheap CSS
                   backdrop reduction) so it appears instantly when scrolled to.
     - 'unloaded': way off-screen — the heavy card is DETACHED from the DOM and
                   swapped for a lightweight, height-preserving skeleton. The
                   detached card is cached so it can be re-inserted instantly
                   on scroll-back without a re-render when data is still fresh.

   To avoid thrashing during fast scroll, unloads are debounced (adaptive: far
   faster in Eco/low-perf mode). Heavy renderers (chart/hourly/daily) are routed
   through renderSection(), which SKIPS building DOM for unloaded sections and
   only rebuilds lazily when the section returns to view and its data changed.
*/
const SECTION_MANAGER = {
  io: null,
  ioUnload: null,
  sections: new Map(),
  priorities: ['hero', 'forecast', 'daily', 'lifestyle'],

  /* Heavy per-section renderers. Hero + sidebar content is always rendered
     eagerly (it's the first thing the user sees), so only these are deferred.
     The 24h temperature chart and the hourly blocks now live in ONE section
     ("forecast") and are both painted together — the user switches between
     them with the in-card toggle, without a second section. */
  renderers: {
    forecast: () => { renderChart(); renderHourly(); },
    daily: () => renderDaily()
  },

  /* Adaptive unload debounce: on weak devices / Eco we drop off-screen DOM
     almost immediately; otherwise wait to avoid flicker during fast scroll. */
  unloadDelay() {
    if (state.effects === 'eco' || (state.effects === 'auto' && state._perfLow)) return 1000;
    return 4000;
  },

  init() {
    if (motionReduce) {
      /* If user prefers reduced motion, just mark all sections as active without animation */
      document.querySelectorAll('.section-root').forEach(el => {
        el.dataset.sectionState = 'active';
        el.classList.add('section-enter-active');
      });
      return;
    }

    /* Main IntersectionObserver: marks sections near viewport */
    this.io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const name = entry.target.dataset.section;
        if (entry.isIntersecting) {
          this.activate(name, entry.target);
        } else {
          this.deactivate(name, entry.target);
        }
      });
    }, {
      rootMargin: '400px 0px 400px 0px', /* 400px buffer before/after viewport */
      threshold: 0.01
    });

    /* Secondary observer: fully unload sections that are very far */
    this.ioUnload = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const name = entry.target.dataset.section;
        if (!entry.isIntersecting) {
          this.scheduleUnload(name, entry.target);
        } else {
          this.cancelUnload(name);
        }
      });
    }, {
      rootMargin: '-25% 0px -25% 0px', /* only consider sections outside middle 50% */
      threshold: 0
    });

    /* Observe all section roots */
    document.querySelectorAll('.section-root').forEach(el => {
      const name = el.dataset.section;
      this.sections.set(name, {
        el, state: 'inactive', unloadTimer: null, rendered: false,
        dirty: true, /* nothing rendered yet */
        card: null, skeleton: null
      });
      this.io.observe(el);
      this.ioUnload.observe(el);
      /* Start with enter animation class */
      el.classList.add('section-enter');
    });

    /* Priority-based initial rendering: render hero immediately */
    this.priorities.forEach((name, idx) => {
      const section = this.sections.get(name);
      if (!section) return;
      if (idx === 0) {
        /* Hero: render immediately, no observer needed */
        this.activate(name, section.el, true);
      }
    });
  },

  /* Re-apply [data-translate] inside a section's card. Heavy renderers paint
     their dynamic strings via t(), but static data-translate headers inside the
     card (e.g. #chart-title) are handled by applyTranslations(), which only
     runs over the LIVE DOM — a cached card restored from unload keeps the old
     language unless we translate it again here (the "blocks don't translate
     until reload" bug). */
  applySectionTranslations(name) {
    const s = this.sections.get(name);
    if (!s || !s.el) return;
    s.el.querySelectorAll('[data-translate]').forEach(node => {
      const key = node.dataset.translate;
      if (key && typeof t === 'function') node.textContent = t(key);
    });
  },

  /* Runs a heavy renderer. Returns true only if the render actually happened.
     On a real device the IntersectionObserver fires immediately for the
     sections that are in the viewport (chart/hourly/daily) — BEFORE the first
     fetch has delivered a forecast. At that moment state.weather === null and
     renderChart()/renderHourly()/renderDaily() would crash on
     `state.weather.hourly`. So: no data → no render → return false, and the
     caller must keep the section dirty so renderAll() paints it as soon as
     the data arrives. */
  runRenderer(name) {
    const r = this.renderers[name];
    if (!r) return false;
    if (!state.weather) return false; /* first fetch still in flight */
    r();
    const s = this.sections.get(name);
    if (s) s.rendered = true;
    return true;
  },

  /* Route a heavy render through the manager. Unloaded sections skip the work
     entirely (their DOM is detached anyway) and are marked dirty so they'll be
     rebuilt lazily on their next activation. */
  renderSection(name) {
    const s = this.sections.get(name);
    if (!s || !this.renderers[name]) return;
    if (s.state === 'unloaded') {
      s.dirty = true; /* rebuild later, when the user scrolls back */
      return;
    }
    /* Only clear the dirty flag if the render really happened (there may be
       no data yet) — otherwise the section must stay dirty to be re-tried. */
    s.dirty = !this.runRenderer(name);
  },

  activate(name, el, immediate) {
    const section = this.sections.get(name);
    if (!section) return;
    const wasUnloaded = section.state === 'unloaded';
    section.state = 'active';
    this.cancelUnload(name);
    el.dataset.sectionState = 'active';

    /* Restore the cached card before rendering it. Renderers look up dynamic
       nodes (for example #chart-rain-summary) through document.getElementById.
       If rendering happened while the card was detached, that lookup returned
       null and renderChartRainSummary() injected a second summary into the
       cached card every time it was restored. */
    this.mount(name);

    /* If we just came back from being unloaded, rebuild (only if the data
       changed while away) and re-insert the cached card. Keep the section
       dirty when the render was skipped (no forecast yet): renderAll() will
       repaint it as soon as the first fetch resolves. */
    if (wasUnloaded || section.dirty) {
      if (this.runRenderer(name)) section.dirty = false;
    }
    /* A card restored from unload may predate a language switch — repaint its
       static data-translate nodes in the current language. */
    this.applySectionTranslations(name);
    el.classList.remove('section-skeleton');

    if (immediate) {
      /* Hero on first load: go directly to visible — no flash, no animation */
      el.classList.remove('section-enter', 'section-enter-active');
      void el.offsetWidth;
      el.classList.add('section-enter-active');
      return;
    }

    if (wasUnloaded) {
      /* Restoring already-seen content: keep it fully visible (opacity stays 1),
         never re-run the enter transition (would flash from opacity 0). */
      el.classList.remove('section-enter');
      el.classList.add('section-enter-active');
      return;
    }

    /* Normal sections: animate entry from .section-enter → .section-enter-active
       Both classes must be present simultaneously for the CSS transition to fire. */
    void el.offsetWidth; /* force reflow so transition starts from current computed styles */
    el.classList.add('section-enter-active');

    /* Clean up .section-enter after animation completes */
    if (section._enterTimer) clearTimeout(section._enterTimer);
    section._enterTimer = setTimeout(() => {
      el.classList.remove('section-enter');
      section._enterTimer = null;
    }, 900);
  },

  deactivate(name, el) {
    const section = this.sections.get(name);
    if (!section) return;
    section.state = 'inactive';
    el.dataset.sectionState = 'inactive';
    /* Content stays mounted; CSS reduces backdrop cost until it's far away. */
  },

  scheduleUnload(name, el) {
    const section = this.sections.get(name);
    if (!section || name === 'hero') return; /* never unload hero */

    if (section.unloadTimer) return;
    section.unloadTimer = setTimeout(() => {
      section.unloadTimer = null;
      if (section.state === 'inactive' || section.state === 'unloaded') {
        this.unload(name, el);
      }
    }, this.unloadDelay());
  },

  cancelUnload(name) {
    const section = this.sections.get(name);
    if (!section || !section.unloadTimer) return;
    clearTimeout(section.unloadTimer);
    section.unloadTimer = null;
  },

  /* The real "heavy DOM removed": detach the section's card and drop in a
     height-preserving skeleton so scroll position is unchanged. The detached
     card is cached so scrolling back re-inserts it without a re-render. */
  unload(name, el) {
    const section = this.sections.get(name);
    if (!section) return;
    section.state = 'unloaded';
    el.dataset.sectionState = 'unloaded';

    const card = section.card || el.firstElementChild;
    if (card) {
      const h = card.offsetHeight || 0;
      const sk = document.createElement('div');
      sk.className = 'section-skeleton-box';
      if (h > 0) sk.style.minHeight = h + 'px';
      section.el.replaceChild(sk, card);
      section.skeleton = sk;
      section.card = card;
    }
    el.classList.add('section-skeleton');

    /* Pause any running timers related to this section */
    if (name === 'forecast') hideChartGuide();
  },

  /* Re-insert the cached card (if it was unloaded) — instant, no re-render. */
  mount(name) {
    const section = this.sections.get(name);
    if (!section) return;
    if (section.skeleton && section.card) {
      section.el.replaceChild(section.card, section.skeleton);
      section.skeleton = null;
      section.card = null;
    }
  },

  /* Called when data is refreshed — re-renders sections that are visible */
  refreshVisible() {
    this.sections.forEach((section, name) => {
      if (section.state === 'active' || section.state === 'unloaded') return;
      if (section.state === 'inactive') {
        /* Inactive sections might become active soon. Reset them to
           enter state so they animate smoothly when scrolled into view. */
        const el = section.el;
        el.classList.remove('section-enter-active');
        el.classList.add('section-enter');
      }
    });
  },

  /* Destroy observers + restore any unloaded content (cleanup) */
  destroy() {
    if (this.io) this.io.disconnect();
    if (this.ioUnload) this.ioUnload.disconnect();
    this.sections.forEach(section => {
      if (section.unloadTimer) clearTimeout(section.unloadTimer);
      if (section.skeleton && section.card) this.mount(section.el.dataset.section);
    });
    this.sections.clear();
  }
};

/* Apply the current quality mode: Eco/low disable heavy canvas FX + storm flashes. */
function applyEffects() {
  const eco = state.effects === 'eco';
  const low = eco || (state.effects === 'auto' && state._perfLow);
  document.documentElement.setAttribute('data-perf', low ? (eco ? 'eco' : 'low') : '');
  if (low) { FX.stop(); stopStorm(); }
  else if (state.weather) applyWeatherTheme();
}
function syncEffectsSelect() {
  /* The settings panel now uses segmented radios (no <select>); its marker is
     synced through syncMenuChecks() from the menu module. */
  if (typeof syncMenuChecks === 'function') syncMenuChecks();
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
