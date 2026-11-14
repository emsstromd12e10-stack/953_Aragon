// v18.1 lane W: the looping weather clip behind the Feed weather card.
// The app draws the poster and a CSS gradient itself (so the card is never empty); this file only picks the scene and adds the <video>.
// Browser: window.V181W. Node tests: require('./weather-bg.js').
(function (g) {
  'use strict';
  var SCENES = ['clear', 'dusk', 'night', 'cloudy', 'overcast', 'rain', 'rain-night', 'storm-day', 'storm', 'haze'];
  // gradient shown while the poster loads, and kept if the poster fails (one per scene)
  var GRAD = {
    clear: 'linear-gradient(180deg,#2a7fcf,#8fb6e3)', dusk: 'linear-gradient(180deg,#5b6fa8,#e9b98a)', night: 'linear-gradient(180deg,#060d22,#1f2f66)',
    cloudy: 'linear-gradient(180deg,#4a7fb5,#9db8d2)', overcast: 'linear-gradient(180deg,#505c6c,#8392a6)', rain: 'linear-gradient(180deg,#2f3d52,#566a85)',
    'rain-night': 'linear-gradient(180deg,#0d1422,#243350)', 'storm-day': 'linear-gradient(180deg,#241f3c,#4b4873)', storm: 'linear-gradient(180deg,#0a0919,#252143)',
    haze: 'linear-gradient(180deg,#8a8f98,#c6beb0)'
  };
  var DUSK_MS = 45 * 60e3;

  // group is v15wGroup(code, 0, 0): clear | partly | overcast | rain | storm | fog | neutral (windy never applies here).
  // sunrise / sunset are epoch ms or null (unknown is null, never 0). Order: thunder, rain, haze (fog or AQI over 100), dusk (45 min either side of sunrise or sunset), night, then the daytime sky.
  function pickScene(o) {
    var grp = o.group, day = !!o.isDay, now = o.now, aqi = o.aqi;
    if (grp === 'storm') return day ? 'storm-day' : 'storm';
    if (grp === 'rain') return day ? 'rain' : 'rain-night';
    if (grp === 'fog' || (typeof aqi === 'number' && isFinite(aqi) && aqi > 100)) return 'haze';
    var near = function (t) { return typeof t === 'number' && isFinite(t) && typeof now === 'number' && Math.abs(now - t) <= DUSK_MS; };
    if (near(o.sunrise) || near(o.sunset)) return 'dusk';
    if (!day) return 'night';
    return grp === 'clear' ? 'clear' : grp === 'partly' ? 'cloudy' : 'overcast';
  }

  function url(scene, ext) { return 'assets/wx/' + scene + '.' + ext; }
  function bg(scene) { return 'url(' + url(scene, 'jpg') + '),' + GRAD[scene]; }

  // no clip in Low data, with Save-Data, or when the phone asks for less motion
  function skip() {
    try {
      if (g.LOWDATA) return true;
      var c = g.navigator && g.navigator.connection;
      if (c && c.saveData === true) return true;
      if (g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (e) {}
    return false;
  }

  // One host per card. State lives on the element (host.__wb) so a second attach does nothing.
  function attach(host) {
    if (!host || host.__wb || !g.document) return;
    var st = host.__wb = { on: false, v: null, scene: '', io: null, mo: null, off: [] };
    var set = function (s) { host.setAttribute('data-wb', s); };
    var drop = function () { if (st.v) { try { st.v.pause(); } catch (e) {} if (st.v.parentNode) st.v.parentNode.removeChild(st.v); st.v = null; st.scene = ''; } };
    var sync = function () {
      if (!host.__wb) return;
      var scene = host.getAttribute('data-scene');
      if (!scene || !GRAD[scene] || skip() || g.document.hidden || !st.on) {
        if (st.v) { try { st.v.pause(); } catch (e) {} }
        if (!scene || skip()) { drop(); set('poster'); } else set(st.v ? 'paused' : 'poster');
        return;
      }
      if (st.v && st.scene !== scene) drop();
      if (!st.v) {
        var v = g.document.createElement('video');
        v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = 'none';
        v.setAttribute('muted', ''); v.setAttribute('loop', ''); v.setAttribute('playsinline', ''); v.setAttribute('autoplay', ''); v.setAttribute('preload', 'none');
        v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1; v.poster = url(scene, 'jpg');
        [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(function (p) { var s = g.document.createElement('source'); s.src = url(scene, p[0]); s.type = p[1]; v.appendChild(s); });
        // every source failed: keep the poster
        v.lastChild.addEventListener('error', function () { if (st.v === v) { drop(); set('poster'); } });
        host.appendChild(v); st.v = v; st.scene = scene;
      }
      set('video');
      try { var pr = st.v.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
    };
    // first paint first: the clip is requested from the observer's first callback (after layout) or the next frame, never during the render
    if (g.IntersectionObserver) {
      st.io = new g.IntersectionObserver(function (es) { st.on = es[es.length - 1].isIntersecting; sync(); }, { threshold: 0.05 });
      st.io.observe(host);
    } else {
      st.on = true; (g.requestAnimationFrame || g.setTimeout)(function () { sync(); });
    }
    st.mo = new g.MutationObserver(sync);
    st.mo.observe(host, { attributes: true, attributeFilter: ['data-scene', 'data-low'] });
    var vis = function () { sync(); };
    g.document.addEventListener('visibilitychange', vis); st.off.push(function () { g.document.removeEventListener('visibilitychange', vis); });
    try { var mq = g.matchMedia('(prefers-reduced-motion: reduce)'); if (mq.addEventListener) { mq.addEventListener('change', vis); st.off.push(function () { mq.removeEventListener('change', vis); }); } } catch (e) {}
    set('poster');
  }

  function detach(host) {
    var st = host && host.__wb; if (!st) return;
    if (st.io) st.io.disconnect(); if (st.mo) st.mo.disconnect();
    st.off.forEach(function (f) { f(); });
    if (st.v) { try { st.v.pause(); } catch (e) {} if (st.v.parentNode) st.v.parentNode.removeChild(st.v); }
    delete host.__wb;
  }

  var V = { SCENES: SCENES, GRAD: GRAD, pickScene: pickScene, bg: bg, url: url, skip: skip, attach: attach, detach: detach };
  if (typeof module !== 'undefined' && module.exports) module.exports = V; else g.V181W = V;
})(typeof window !== 'undefined' ? window : globalThis);
