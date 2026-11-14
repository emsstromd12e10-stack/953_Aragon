// v18.2 lane B: personal birthday cards.
// greeting(): pure. Member data + year -> {title, text, palette}; the choice is seeded by member and year, so it never changes on a re-render
// and two members on the same day get different text (their names) and, with `taken`, different colours.
// record(): draws the card on a canvas and records a 4-6 s loop with MediaRecorder (mp4 where the phone can, else webm).
// Browser: window.V182B. Node tests: require('./birthday-card.js').
(function (g) {
  'use strict';
  // white text on both stops of every gradient is at least 4.5:1 (checked in tests/unit/v182-b-greeting.unit.mjs)
  var PALETTES = [
    { id: 'navy', from: '#15233a', to: '#3b5a8c', glow: '#e2c47e' },
    { id: 'plum', from: '#4a1d5c', to: '#8a3f7f', glow: '#f2c1e6' },
    { id: 'teal', from: '#0b4f52', to: '#1f7f7b', glow: '#9fe8de' },
    { id: 'ember', from: '#6b2410', to: '#b4521f', glow: '#ffd1a1' },
    { id: 'forest', from: '#12432b', to: '#2f7d52', glow: '#b8f0c8' },
    { id: 'rose', from: '#7a1f47', to: '#c0457a', glow: '#ffc4dc' },
    { id: 'indigo', from: '#26237a', to: '#5a55c9', glow: '#c9c6ff' },
    { id: 'cocoa', from: '#4a3210', to: '#8f6112', glow: '#f5d9a0' }
  ];
  // {n} first name, {v} vessel, {b} back date, {d} where their department works ("on deck"). A template is used only when every token it holds is known.
  // Every line is about the celebrant: never their years in the house (owner decision 2026-11-12).
  var T = {
    house: [
      'Today is all about you, {n}. Take it easy, eat well and let the house spoil you a little.',
      'You are right here at the house today, {n}, so the first slice of cake is yours.',
      '{n}, may this year bring you good health, safe voyages and lots of reasons to smile.',
      'A day off from everything {d}, {n}. Today you just enjoy being you.'
    ],
    onboard: [
      'Calm seas and a quiet watch on {v} today, {n}. We are raising a glass to you.',
      'Fair winds on {v}, {n}. Your slice is waiting for you when you are back on {b}.',
      'Far from home but never far from our thoughts, {n}. Have a great birthday onboard!',
      'Even {d} on your birthday, {n}, you deserve the best day. Stay safe out there.'
    ],
    vacation: [
      'Enjoy every minute of your vacation, {n}. Rest, celebrate and make it a birthday to remember.',
      'Celebrate big, {n}! We will toast you properly when you are back on {b}.',
      'A birthday at home with the people you love is the best kind, {n}. Enjoy it!'
    ],
    unknown: [
      'Wherever you are today, {n}, we hope your birthday is as good as you are.',
      '{n}, wishing you good health, calm seas and a year full of good news.',
      'Here is to you, {n}: more adventures, safe travels and many happy returns.'
    ]
  };
  var DEPT_AT = { Deck: 'on deck', Engine: 'in the engine room', Culinary: 'in the galley' };

  // ---- scenes: photo backgrounds (assets/bday/<id>.webp, 720x960). Zones are fractions of the card: sign [x0,y0,x1,y1], ring [cx,cy,r] (r is a fraction of the WIDTH), candles [x,y] (the flame point).
  // fx: t burst|confetti|glint|ember|steam|spark, n particles, box [x0,y0,x1,y1] to spread over or at [x,y] to start from. The candle glow is added to every scene. At most 12 particles per card.
  var SCENES = {
    deck: { sign: [.06, .14, .50, .27], ring: [.50, .50, .08], candles: [.78, .46], fx: [{ t: 'glint', n: 4, box: [.62, .04, .96, .26] }, { t: 'confetti', n: 4, box: [.55, .02, .97, .3] }] },
    engine: { sign: [.07, .11, .50, .27], ring: [.495, .505, .095], candles: [.87, .42], fx: [{ t: 'spark', n: 3, at: [.88, .30] }, { t: 'spark', n: 3, at: [.16, .56] }] },
    galley: { sign: [.04, .13, .48, .29], ring: [.51, .445, .08], candles: [.84, .51], fx: [{ t: 'steam', n: 3, at: [.62, .30] }, { t: 'confetti', n: 4, box: [.2, .0, .97, .3] }] },
    rooftop: { sign: [.06, .11, .50, .25], ring: [.495, .50, .095], candles: [.86, .47], fx: [{ t: 'burst', n: 3, box: [.68, .03, .96, .26] }, { t: 'glint', n: 4, box: [.1, .3, .95, .42] }] },
    dining: { sign: [.05, .10, .52, .28], ring: [.50, .475, .10], candles: [.82, .46], fx: [{ t: 'confetti', n: 5, box: [.1, .0, .97, .3] }, { t: 'glint', n: 3, box: [.1, .15, .95, .4] }] },
    beach: { sign: [.06, .11, .53, .23], ring: [.50, .495, .085], candles: [.82, .47], fx: [{ t: 'burst', n: 3, box: [.68, .03, .96, .26] }, { t: 'ember', n: 4, at: [.18, .70] }] }
  };
  var SCENE_IDS = ['deck', 'engine', 'galley', 'rooftop', 'dining', 'beach'], BY_DEPT = { Deck: 'deck', Engine: 'engine', Culinary: 'galley' };
  var frac = function (x) { return x - Math.floor(x); };
  // particles of a scene: [{t, x, y, ph (phase 0-1), k (cycles per 5 s: 1 or 2, so a 5 s clip loops cleanly)}]; the same list drives the CSS card and the saved clip
  function particles(id) {
    var sc = SCENES[id]; if (!sc) return []; var L = [{ t: 'glow', x: sc.candles[0], y: sc.candles[1], ph: 0, k: 2 }], j = 0;
    sc.fx.forEach(function (f) { for (var i = 0; i < f.n; i++, j++) {
      var u = frac(i * .618 + .13 + j * .07), v = frac(i * .382 + .37 + j * .11), b = f.box;
      L.push({ t: f.t, x: b ? b[0] + (b[2] - b[0]) * u : f.at[0] + (f.t === 'spark' ? (u - .5) * .04 : (u - .5) * .05), y: b ? b[1] + (b[3] - b[1]) * v : f.at[1] + (f.t === 'spark' ? (v - .5) * .03 : 0), ph: frac(i / f.n + j * .13), k: f.t === 'confetti' || f.t === 'steam' || f.t === 'ember' ? 1 : 2 });
    } });
    return L;
  }
  // values for the card's styles (one per CSS property): sign / ring boxes, name size (cqw: a long name shrinks to one line) and the particles
  function layout(id, first) {
    var sc = SCENES[id]; if (!sc) return null;
    var w = (sc.sign[2] - sc.sign[0]) * 100, h = (sc.sign[3] - sc.sign[1]) * 100, nm = String(first || '').trim(), len = nm.length + 1, avail = w * .88 / .62, one = avail / len, ns = Math.max(2.6, Math.min(7.6, one)), d = sc.ring[2] * 210;
    // a name that would shrink under 4.4cqw on one line may wrap at spaces (two lines, height permitting) before it shrinks further; one long word shrinks to the floor and only then breaks
    var words = nm.split(/\s+/), cap = (h * 4 / 3 - 8.5) / 2.1;
    if (one < 4.4 && words.length > 1) { var m = len; for (var i = 1; i < words.length; i++) m = Math.min(m, Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length + 1)); ns = Math.max(ns, Math.min(7.6, cap, avail / m)); }
    return {
      sign: { l: sc.sign[0] * 100 + '%', t: sc.sign[1] * 100 + '%', w: w + '%', h: h + '%' },
      name: ns.toFixed(2) + 'cqw',
      ring: { l: sc.ring[0] * 100 + '%', t: sc.ring[1] * 100 + '%', d: d.toFixed(2) + 'cqw', fs: (sc.ring[2] * 90).toFixed(2) + 'cqw' },
      fx: particles(id).map(function (p) { var dur = 5 / p.k; return { c: 'v182b-f v182b-f-' + p.t, x: (p.x * 100).toFixed(1) + '%', y: (p.y * 100).toFixed(1) + '%', d: dur + 's', dl: '-' + (p.ph * dur).toFixed(2) + 's' }; })
    };
  }
  // the scene for a member: vacation -> beach; onboard -> by department (Deck deck, Engine engine, Culinary galley, other deck); onhouse -> rooftop or dining; unknown -> any. A scene taken today is skipped while another fits the rule, else any free one.
  function pickScene(o, seed) {
    var st = o.status, rule = st === 'onvacation' ? ['beach'] : st === 'onboard' ? [BY_DEPT[str(o.dept)] || 'deck'] : st === 'onhouse' ? ['rooftop', 'dining'] : SCENE_IDS;
    var taken = Array.isArray(o.takenS) ? o.takenS : [], free = function (l) { return l.filter(function (x) { return taken.indexOf(x) < 0; }); };
    var l = free(rule); if (!l.length) l = free(SCENE_IDS); if (!l.length) l = rule;
    return l[(seed >>> 16) % l.length];
  }

  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function str(x) { return typeof x === 'string' ? x.trim() : ''; }
  function ordinal(n) { var m = n % 100, d = n % 10; return n + (m >= 11 && m <= 13 ? 'th' : d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; } // unknown is null, never 0

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function backDate(b) { var m = /^\d{4}-(\d\d)-(\d\d)$/.exec(b); return m && +m[1] >= 1 && +m[1] <= 12 ? MON[+m[1] - 1] + ' ' + +m[2] : b; } // a date from the record reads "Dec 5"; any other text is kept as written
  // o: {memberId, first, year, showAge, age, dept 'Deck'|'Engine'|'Culinary' (members.rank), status 'onhouse'|'onboard'|'onvacation'|other, vessel, back, taken[] palette ids, takenT[] template ids (tid) and takenS[] scene ids already used today}
  // showAge must be true for the age to appear: the caller decides who may see it (admins and the member themself).
  function greeting(o) {
    o = o || {};
    var first = str(o.first) || 'Housemate', year = num(o.year) || new Date().getFullYear();
    var age = o.showAge === true ? num(o.age) : null; if (age !== null && (age < 1 || age > 120 || age % 1)) age = null;
    var tok = { n: first, d: DEPT_AT[str(o.dept)] || null, v: str(o.vessel) || null, b: str(o.back) ? backDate(str(o.back)) : null };
    var st = o.status, key = st === 'onhouse' ? 'house' : st === 'onboard' ? 'onboard' : st === 'onvacation' ? 'vacation' : 'unknown';
    var usable = function (k) { var r = []; T[k].forEach(function (t, i) { if ((t.match(/\{(\w)\}/g) || []).every(function (m) { return tok[m[1]] !== null; })) r.push({ tid: k + ':' + i, t: t }); }); return r; };
    var ok = usable(key); if (!ok.length) ok = usable('unknown');
    var takenT = Array.isArray(o.takenT) ? o.takenT : [], fresh = ok.filter(function (x) { return takenT.indexOf(x.tid) < 0; }); if (fresh.length) ok = fresh; // a template another member got today is skipped while another one fits
    var seed = hash(String(o.memberId) + ':' + year), pick = ok[seed % ok.length];
    var text = pick.t.replace(/\{(\w)\}/g, function (_, k) { return tok[k]; });
    var pi = (seed >>> 8) % PALETTES.length, taken = Array.isArray(o.taken) ? o.taken : [];
    for (var i = 0; i < PALETTES.length && taken.indexOf(PALETTES[pi].id) >= 0; i++) pi = (pi + 1) % PALETTES.length;
    var plain = 'Happy birthday, ' + first + '!', sc = pickScene(o, seed);
    // plainTitle never holds the age: the saved clip and the house post use it, the on-screen title may show the age to an admin
    return { title: age !== null ? 'Happy ' + ordinal(age) + ', ' + first + '!' : plain, plainTitle: plain, text: text, tid: pick.tid, palette: PALETTES[pi], scene: sc, first: first, line1: age !== null ? 'Happy ' + ordinal(age) + ',' : 'Happy birthday,', line1Plain: 'Happy birthday,' };
  }

  // ---- recorder ----
  function canRecord() {
    try { return !!(g.MediaRecorder && g.document && typeof g.document.createElement('canvas').captureStream === 'function'); } catch (e) { return false; }
  }
  function pickMime() {
    var c = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < c.length; i++) { try { if (g.MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
    return '';
  }
  function loadPhoto(url) {
    return new Promise(function (res) {
      if (!url) return res(null);
      var im = new g.Image(), t = setTimeout(function () { res(null); }, 4000);
      im.crossOrigin = 'anonymous'; // a tainted canvas cannot be recorded: a photo that refuses CORS falls back to initials
      im.onload = function () { clearTimeout(t); res(im); }; im.onerror = function () { clearTimeout(t); res(null); };
      im.src = url;
    });
  }
  function wrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  var BUB = [[.12, .9, 26, 0], [.3, .7, 14, .3], [.52, .95, 34, .55], [.7, .8, 18, .15], [.86, .98, 28, .75], [.2, .5, 10, .9], [.62, .6, 12, .45], [.92, .55, 16, .2]];
  function draw(ctx, W, H, t, c, ini, img) {
    var p = c.palette, a = t * 2 * Math.PI, gr = ctx.createLinearGradient(W * (.5 - .5 * Math.cos(a)), 0, W * (.5 + .5 * Math.cos(a)), H);
    gr.addColorStop(0, p.from); gr.addColorStop(1, p.to); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    BUB.forEach(function (b) { var k = (t + b[3]) % 1; ctx.beginPath(); ctx.arc(W * b[0], H * (b[1] - k * 1.05), b[2] * W / 360, 0, 7); ctx.fill(); });
    var cx = W / 2, cy = H * .3, r = W * .17;
    ctx.save(); ctx.shadowColor = p.glow; ctx.shadowBlur = 40 + 14 * Math.sin(a); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    if (img) { var s = Math.max(2 * r / img.width, 2 * r / img.height); ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s); }
    else { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r); ctx.fillStyle = '#15233a'; ctx.font = '700 ' + Math.round(r * .8) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ini, cx, cy + 2); }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var ts = Math.round(W * .085); ctx.font = '700 ' + ts + 'px Georgia,serif';
    var y = cy + r + ts + 28; wrap(ctx, c.plainTitle || c.title, W * .84).forEach(function (l) { ctx.fillText(l, cx, y); y += ts * 1.2; });
    var fs = Math.round(W * .05); ctx.font = '400 ' + fs + 'px system-ui,sans-serif'; y += fs * .6;
    wrap(ctx, c.text, W * .82).forEach(function (l) { ctx.fillText(l, cx, y); y += fs * 1.45; });
    ctx.font = '600 ' + Math.round(W * .035) + 'px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText('From everyone at 953 C. Aragon', cx, H - 30);
  }

  // ---- scene clip: the photo background with the same sign, ring photo, fade, greeting and effects as the card ----
  var ease = function (x) { return x < .5 ? 2 * x : 2 - 2 * x; };
  function drawFx(ctx, W, H, t, id) {
    var u = W / 100;
    particles(id).forEach(function (p) {
      var q = frac(t * p.k + p.ph), x = p.x * W, y = p.y * H, a = Math.sin(Math.PI * q); ctx.save(); ctx.translate(x, y);
      if (p.t === 'glow') { var r = 4.5 * u * (.8 + .4 * a), gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(255,214,120,' + (.55 + .35 * a) + ')'); gr.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = gr; ctx.fillRect(-r, -r, 2 * r, 2 * r); }
      else if (p.t === 'burst') { ctx.globalAlpha = Math.min(1, (1 - q) * 1.6) * Math.min(1, q * 8); var R = 5 * u * (.2 + 2.2 * q); ctx.fillStyle = '#ffe6a0'; for (var i = 0; i < 8; i++) { var an = i * Math.PI / 4; ctx.beginPath(); ctx.arc(Math.cos(an) * R, Math.sin(an) * R, .6 * u, 0, 7); ctx.fill(); } }
      else if (p.t === 'confetti') { ctx.globalAlpha = Math.min(1, q * 8) * (1 - q * q); ctx.translate(Math.sin(q * 6) * 2 * u, q * 55 * u); ctx.rotate(q * 9); ctx.fillStyle = '#e2c47e'; ctx.fillRect(-.6 * u, -1.1 * u, 1.2 * u, 2.2 * u); }
      else if (p.t === 'glint') { ctx.globalAlpha = a; var g2 = 1.2 * u * (.5 + a), gr2 = ctx.createRadialGradient(0, 0, 0, 0, 0, g2); gr2.addColorStop(0, '#fff'); gr2.addColorStop(1, 'rgba(255,236,170,0)'); ctx.fillStyle = gr2; ctx.fillRect(-g2, -g2, 2 * g2, 2 * g2); }
      else if (p.t === 'ember') { ctx.globalAlpha = Math.min(1, q * 6) * (1 - q); ctx.translate(Math.sin(q * 5 + p.ph * 9) * 2 * u, -q * 30 * u); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(0, 0, .6 * u, 0, 7); ctx.fill(); }
      else if (p.t === 'steam') { ctx.globalAlpha = .32 * Math.sin(Math.PI * q); var sr = 3 * u * (1 + q), sg = ctx.createRadialGradient(0, -q * 14 * u, 0, 0, -q * 14 * u, sr); sg.addColorStop(0, 'rgba(255,255,255,.8)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(-sr, -q * 14 * u - sr, 2 * sr, 2 * sr); }
      else if (p.t === 'spark') { ctx.globalAlpha = 1 - q; ctx.strokeStyle = '#ffd77a'; ctx.lineWidth = .35 * u; var L = 3 * u * q; for (var j = 0; j < 6; j++) { var b = j * 1.05 + p.ph * 6; ctx.beginPath(); ctx.moveTo(Math.cos(b) * L * .4, Math.sin(b) * L * .4); ctx.lineTo(Math.cos(b) * L, Math.sin(b) * L); ctx.stroke(); } }
      ctx.restore();
    });
  }
  // c: card {scene, first, line1Plain, sub, count, text}; sub is "12 Nov · Deck"
  function drawScene(ctx, W, H, t, c, ini, img, bg) {
    var sc = SCENES[c.scene], u = W / 100, z = 1 + .05 * ease(t), cx = W / 2, cy = H / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); ctx.drawImage(bg, 0, 0, W, H);
    drawFx(ctx, W, H, t, c.scene);
    var rx = sc.ring[0] * W, ry = sc.ring[1] * H, rr = sc.ring[2] * W * 1.05;
    ctx.save(); ctx.beginPath(); ctx.arc(rx, ry, rr, 0, 7); ctx.clip();
    if (img) { var s = Math.max(2 * rr / img.width, 2 * rr / img.height); ctx.drawImage(img, rx - img.width * s / 2, ry - img.height * s / 2, img.width * s, img.height * s); }
    else { ctx.fillStyle = '#f6e7c8'; ctx.fillRect(rx - rr, ry - rr, 2 * rr, 2 * rr); ctx.fillStyle = '#3a2a16'; ctx.font = '700 ' + Math.round(rr * .8) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ini, rx, ry + 2); }
    var sh = ctx.createRadialGradient(rx, ry, rr * .8, rx, ry, rr); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = sh; ctx.fillRect(rx - rr, ry - rr, 2 * rr, 2 * rr); ctx.restore();
    var sx = sc.sign[0] * W, sy = sc.sign[1] * H, sw = (sc.sign[2] - sc.sign[0]) * W, shh = (sc.sign[3] - sc.sign[1]) * H, mx = sx + sw / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f6e7c8'; ctx.shadowColor = 'rgba(20,10,0,.75)'; ctx.shadowOffsetY = 1.2; ctx.shadowBlur = 1;
    var name = c.first + '!', ns = 7.6 * u; ctx.font = '700 ' + ns + 'px Georgia,serif'; while (ctx.measureText(name).width > sw * .88 && ns > 3 * u) { ns *= .94; ctx.font = '700 ' + ns + 'px Georgia,serif'; }
    var s1 = 2.5 * u, s3 = 2.4 * u, tot = s1 * 1.3 + ns * 1.05 + s3 * 1.3, y = sy + (shh - tot) / 2 + s1;
    ctx.font = '600 ' + s1 + 'px Georgia,serif'; if ('letterSpacing' in ctx) ctx.letterSpacing = (.12 * s1) + 'px'; ctx.fillText((c.line1Plain || 'Happy birthday,').toUpperCase(), mx, y); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    y += s1 * .3 + ns; ctx.font = '700 ' + ns + 'px Georgia,serif'; ctx.fillText(name, mx, y);
    y += ns * .05 + s3 * 1.2; ctx.font = '600 ' + s3 + 'px Georgia,serif'; ctx.fillText(c.sub || '', mx, y);
    ctx.restore(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    var fs = Math.round(4.2 * u), lines = (ctx.font = '400 ' + fs + 'px Georgia,serif', wrap(ctx, c.text, W * .88)), blockH = lines.length * fs * 1.45, foot = 3.2 * u, top = H - 3.5 * u - foot - 2 * u - blockH - 10 * u;
    var fg = ctx.createLinearGradient(0, top, 0, H); fg.addColorStop(0, 'rgba(12,9,6,0)'); fg.addColorStop(.4, 'rgba(12,9,6,.8)'); fg.addColorStop(1, 'rgba(12,9,6,.82)'); ctx.fillStyle = fg; ctx.fillRect(0, top, W, H - top);
    ctx.fillStyle = '#f6e7c8'; ctx.textAlign = 'center'; var ty = top + 10 * u + fs; lines.forEach(function (l) { ctx.fillText(l, cx, ty); ty += fs * 1.45; });
    ctx.font = '600 ' + foot + 'px system-ui,sans-serif'; ctx.fillStyle = '#e2c47e'; ctx.fillText(c.count ? 'From all ' + c.count + ' of us at 953' : 'From all of us at 953', cx, H - 3.5 * u);
  }
  function loadBg(id) {
    return new Promise(function (res) {
      if (!id || !SCENES[id]) return res(null);
      var im = new g.Image(), t = setTimeout(function () { res(null); }, 5000);
      im.onload = function () { clearTimeout(t); res(im); }; im.onerror = function () { clearTimeout(t); res(null); };
      im.src = 'assets/bday/' + id + '.webp'; // same origin: the canvas stays clean
    });
  }
  // card: greeting() result (+ scene, sub, count); o: {ini, photoUrl, ms (4000-6000)} -> Promise<{blob, ext}>
  function record(card, o) {
    o = o || {};
    return Promise.all([loadPhoto(o.photoUrl), loadBg(card.scene)]).then(function (a) {
      var img = a[0], bg = a[1];
      return new Promise(function (resolve, reject) {
        if (!canRecord()) return reject(new Error('Recording is not supported on this phone.'));
        var ms = Math.min(6000, Math.max(4000, o.ms || 5000)), W = 540, H = 720, cv = g.document.createElement('canvas'); cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d'), mime = pickMime(), rec, chunks = [], now = function () { return g.performance.now(); }, t0 = now(), stop = false; // a monotonic clock, so a clock set by the OS or a test cannot stall or cut the clip
        try { rec = new g.MediaRecorder(cv.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined); } catch (e) { return reject(e); }
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onerror = function (e) { stop = true; reject(e.error || new Error('Recording failed.')); };
        rec.onstop = function () { var type = rec.mimeType || mime || 'video/webm'; resolve({ blob: new Blob(chunks, { type: type }), ext: /mp4/.test(type) ? 'mp4' : 'webm' }); };
        var tick = function () {
          if (stop) return; var el = now() - t0;
          if (bg) drawScene(ctx, W, H, (el % 5000) / 5000, card, o.ini || '', img, bg); else draw(ctx, W, H, (el % 5000) / 5000, card, o.ini || '', img); // no scene (Low data, or the picture failed): today's gradient clip
          if (el >= ms) { stop = true; try { rec.stop(); } catch (e) { reject(e); } return; }
          setTimeout(tick, 33); // a timer, not rAF: a hidden tab still finishes the clip
        };
        rec.start(); tick();
      });
    });
  }

  var V = { drawScene: drawScene, loadBg: loadBg, SCENES: SCENES, SCENE_IDS: SCENE_IDS, layout: layout, PALETTES: PALETTES, TEMPLATES: T, greeting: greeting, ordinal: ordinal, canRecord: canRecord, record: record };
  if (typeof module !== 'undefined' && module.exports) module.exports = V; else g.V182B = V;
})(typeof window !== 'undefined' ? window : globalThis);
