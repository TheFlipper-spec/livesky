/* LiveSky compatibility loader. The site loads docs/js/modules directly. */
(function loadLiveSkyModules() {
  'use strict';
  /* 11-map-radar.js (map + radar) is intentionally absent: it is a lazy
     subsystem fetched by the LiveSkyMap loader defined in 10-bootstrap.js
     on the first map/radar interaction — never during page load. */
  var modules = [
    '01-core.js', '02-weather-data.js', '03-rendering.js', '04-chart.js',
    '05-hourly-alerts.js', '06-air.js', '07-effects.js', '08-search-modals.js',
    '09-lifecycle.js', '10-bootstrap.js'
  ];
  var base = 'js/modules/';
  if (document.readyState === 'loading') {
    document.write(modules.map(function (name) {
      return '<script src="' + base + name + '"><\/script>';
    }).join(''));
    return;
  }
  /* For legacy pages that add app.js after parsing, retain execution order. */
  var i = 0;
  function next() {
    if (i === modules.length) return;
    var script = document.createElement('script');
    script.src = base + modules[i++];
    script.onload = next;
    document.head.appendChild(script);
  }
  next();
}());
