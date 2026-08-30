# LiveSky Weather Pro — Architecture

## Loading model (hard constraints)

The app is deliberately **not** an ES-module bundle. `tests/smoke.js` loads the
real `docs/index.html` into jsdom with `runScripts:'dangerously'` and inlines the
module sources **in order** as classic `<script>` bodies, so:

- every module **must** be a classic script (no `type="module"`);
- modules share one global scope — this is the only inter-module seam;
- the 11 files below and their load order are fixed (smoke asserts them);
- `js/app.js` stays a tiny (<2.5 KB) compatibility loader and is **not**
  referenced from `index.html`;
- `11-map-radar.js` is lazy: loaded on the first real map/radar interaction via
  the `window.LiveSkyMap` facade, and it never calls the app `init()`.

## Module responsibilities

Modules are arranged in layers. A lower layer never depends on a higher one;
higher layers consume the layers below via the shared global scope (calls happen
only at runtime, after all eager modules have loaded).

| # | File | Layer / responsibility |
|---|------|------------------------|
| 01 | `01-core.js` | **Kernel (root).** `el` DOM refs, `store` (persistence), `state` (runtime), `$`/`on`, Capacitor helpers, `t()`/`loc()` i18n access, time/unit formatters, WMO catalogue, rain-merge + minute-precision helpers, `getVal`/`getMinVal`, `regionModel`, moon phase. |
| 02 | `02-weather-data.js` | **Data services & search.** Forecast/air fetching + loader/toast/watchdog, clock, geolocation + reverse geocoding, city search/geocoding (wrong-layout & typo correction), favorites & recent-cities persistence/rendering. |
| 03 | `03-rendering.js` | **Dashboard rendering.** `renderAll` orchestration, hero, metrics, wind tile, sun arc. |
| 04 | `04-chart.js` | **Forecast chart & live layer.** 24 h chart, scrubbing, now-tag, rain markers, live minute ticker. |
| 05 | `05-hourly-alerts.js` | **Hourly/daily lists + hazard alerts.** Renders strips; detects/scores hazards (rain, snow, wind, heat, cold, fog, UV). |
| 06 | `06-air.js` | **Air quality.** AQI card, day strip, detail modal. |
| 07 | `07-effects.js` | **Visual effects & theme.** Weather theme/background, canvas FX, storm flashes, GlassFX. |
| 08 | `08-search-modals.js` | **Interactive UI layer.** Accessible modal infra (focus trap), detail views (hourly/daily/monthly/sun), advice & lifestyle scoring, theme/units/model/effects/language settings + menu, fullscreen, reveal-on-scroll, global event wiring. |
| 09 | `09-lifecycle.js` | **Lifecycle & gating.** `SECTION_MANAGER` (Smart Visibility: active/unload/mount), legal consent + privacy/geolocation gate (sequential). |
| 10 | `10-bootstrap.js` | **Bootstrap & platform shell.** Single `init()`; `window.LiveSkyMap` facade, PWA (service worker/install/offline banner), adaptive FPS detector (`PERF`), weather notifications, Capacitor native bridge. |
| 11 | `11-map-radar.js` | **Map & precipitation (lazy).** RainViewer + NASA IMERG nowcast engine; registers with `LiveSkyMap._register`. |

## Refactor history (this branch)

The former `08-search-modals.js` (≈1876 lines) was a grab-bag. Its subsystems
were redistributed so each file has a single responsibility:

- **search / geocoding / favorites** → moved into `02-weather-data.js` (the data
  layer already owned `fetchWithTimeout`, `toast`, `fetchWeather`, `flagUrl`);
- **legal consent + privacy/geolocation gate** → moved into `09-lifecycle.js`;
- **PWA install, offline/online banner, FPS detector (`PERF`)** → moved into
  `10-bootstrap.js` (platform shell; `const PERF` sits before `init()`).

No loading contract, file names, or smoke-test markers were changed.

## Testing

- `npm test` (`node tests/smoke.js`) — full behavioural suite in jsdom (fetch
  stubbed); asserts structure, boot, consent, data rendering, search correction,
  chart, sections, lazy map.
- Browser check (headless Chromium via `repro-refactor.js`-style launcher) is only
  usable for wiring/consent/DOM checks — the sandbox blocks the external
  weather/geocoding APIs, so live data cannot be fetched there.
