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
  priorities: ['hero', 'chart', 'hourly', 'daily', 'lifestyle'],

  /* Heavy per-section renderers. Hero + sidebar content is always rendered
     eagerly (it's the first thing the user sees), so only these are deferred. */
  renderers: {
    chart: () => renderChart(),
    hourly: () => renderHourly(),
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
    if (name === 'chart') hideChartGuide();
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
  if (el.effectsSelect) el.effectsSelect.value = state.effects;
}

