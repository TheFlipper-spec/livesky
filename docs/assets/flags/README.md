# Country flags (self-hosted)

SVG flags in 4:3 aspect for every ISO 3166-1 alpha-2 country code, plus the
GB subdivisions (`gb-eng`, `gb-nir`, `gb-sct`, `gb-wls`) and `eu` / `un`.

- Source: [flag-icons](https://github.com/lipis/flag-icons) v7.2.3 (MIT — see `LICENSE`).
- Naming matches the codes returned by Open-Meteo / Nominatim / BigDataCloud
  (`country_code`, lowercased), e.g. `de.svg`, `ru.svg`, `gb.svg`.
- The app resolves them via `flagUrl()` in `docs/js/app.js`; unknown or invalid
  codes never produce a network request (the flag image is simply hidden).

These files are served from the same origin as the app so that opening
LiveSky never contacts a third-party flag CDN.
