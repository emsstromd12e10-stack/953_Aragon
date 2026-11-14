// v18 lane L: Low data mode helpers and the one-time loader for the heavy optional scripts. Browser: window.V18L; Node tests: require('./lowdata.js').
// Kept as a plain (not deferred) script: it sets html.low-data and window.LOWDATA before the app's first render.
(function (g) {
  'use strict';
  var KEY = '953.lowData', ASKED = '953.lowDataAsked';

  // A slow link: the phone says Save-Data, or reports 2G/3G. Unknown (no Network Information API) is not slow: never offer on a missing signal.
  function shouldOffer(conn) {
    if (!conn) return false;
    if (conn.saveData === true) return true;
    return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g';
  }

  function read(k) { try { return g.localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { g.localStorage.setItem(k, v); } catch (e) {} }
  function isOn() { return read(KEY) === '1'; }
  function asked() { return read(ASKED) === '1'; }
  function markAsked() { write(ASKED, '1'); }

  // The one place that writes the mode: storage, window.LOWDATA and the html class stay in step.
  function apply(on) {
    on = !!on;
    g.LOWDATA = on;
    try { g.document.documentElement.classList.toggle('low-data', on); } catch (e) {}
    return on;
  }
  function set(on) { write(KEY, on ? '1' : '0'); return apply(on); }

  // Inject a script once; the same promise comes back for the same src. A failed load is forgotten so a later call can retry.
  var loaded = {};
  function load(src) {
    if (loaded[src]) return loaded[src];
    var p = new Promise(function (ok, no) {
      var d = g.document;
      if (!d) return no(new Error('no document'));
      var s = d.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { s.remove(); no(new Error('failed to load ' + src)); };
      d.head.appendChild(s);
    });
    loaded[src] = p;
    p.catch(function () { if (loaded[src] === p) delete loaded[src]; });
    return p;
  }

  var V = { shouldOffer: shouldOffer, load: load, isOn: isOn, asked: asked, markAsked: markAsked, apply: apply, set: set, KEY: KEY, ASKED: ASKED };
  if (typeof module !== 'undefined' && module.exports) module.exports = V; else { g.V18L = V; apply(isOn()); }
})(typeof window !== 'undefined' ? window : globalThis);
