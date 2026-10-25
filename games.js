// Offline games for the Tools tab: Sudoku, 2048, Memory match, Minesweeper, Word search, Chess (chess.js draws the board). v17.5: finished games can report a score (opts.onScore) and offer a challenge (opts.onChallenge).
// Part 1 (GamesX) is pure logic, node-testable (tests/games.test.js). Part 2 (GamesUI) draws into one host element.
// Everything runs on the phone: state lives in localStorage '953-games'. Only a finished game's score (and a challenge you send) goes to the house board, when you are signed in.
(function (root) {
  'use strict';

  // ---------- seeded random ----------
  const hashSeed = s => { s = String(s); let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  const rng = seed => { let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; };
  const manilaDate = now => new Date((now == null ? Date.now() : now) + 8 * 3600e3).toISOString().slice(0, 10);
  const range = n => Array.from({ length: n }, (_, i) => i);
  const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

  // ---------- Sudoku ----------
  const SDK_LEVELS = ['easy', 'medium', 'hard'];
  const SDK_CLUES = { easy: 40, medium: 32, hard: 26 }; // target clue counts; removal stops early if uniqueness would break
  const pop = m => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  const rowOf = i => (i / 9) | 0, colOf = i => i % 9, boxOf = i => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);
  const PEERS = range(81).map(i => range(81).filter(j => j !== i && (rowOf(i) === rowOf(j) || colOf(i) === colOf(j) || boxOf(i) === boxOf(j))));
  // Backtracking solver with fewest-candidates-first. Counts solutions up to `limit`; r (optional) randomises digit order.
  function sdkSolve(g, limit, r, cap) { // cap: max search nodes (count-based, no clocks); over it the result is {n:0,sol:null}
    const a = g.slice(), rm = Array(9).fill(0), cm = Array(9).fill(0), bm = Array(9).fill(0);
    for (let i = 0; i < 81; i++) if (a[i]) { const b = 1 << (a[i] - 1); if ((rm[rowOf(i)] | cm[colOf(i)] | bm[boxOf(i)]) & b) return { n: 0, sol: null }; rm[rowOf(i)] |= b; cm[colOf(i)] |= b; bm[boxOf(i)] |= b; }
    let n = 0, sol = null, nodes = 0, cut = false;
    const rec = () => {
      if (++nodes > (cap || Infinity)) { cut = true; return true; }
      let best = -1, bc = 10, bmask = 0;
      for (let i = 0; i < 81; i++) if (!a[i]) { const m = ~(rm[rowOf(i)] | cm[colOf(i)] | bm[boxOf(i)]) & 511, c = pop(m); if (c < bc) { bc = c; best = i; bmask = m; if (c <= 1) break; } }
      if (best < 0) { n++; if (!sol) sol = a.slice(); return n >= limit; }
      if (bc === 0) return false;
      const ds = r ? shuffle(range(9), r) : range(9), ro = rowOf(best), co = colOf(best), bo = boxOf(best);
      for (const d of ds) { const b = 1 << d; if (!(bmask & b)) continue; a[best] = d + 1; rm[ro] |= b; cm[co] |= b; bm[bo] |= b; const stop = rec(); a[best] = 0; rm[ro] &= ~b; cm[co] &= ~b; bm[bo] &= ~b; if (stop) return true; }
      return false;
    };
    rec();
    return cut ? { n: 0, sol: null } : { n, sol };
  }
  function sdkMake(seed, level) {
    const r = rng('sdk|' + level + '|' + seed), empty = Array(81).fill(0); let full = null;
    while (!full) full = sdkSolve(empty, 1, r, 500).sol;
    const p = full.slice();
    let clues = 81; const target = SDK_CLUES[level];
    for (const i of shuffle(range(81), r)) { if (clues <= target) break; const v = p[i]; p[i] = 0; if (sdkSolve(p, 2, null, 5000).n === 1) clues--; else p[i] = v; }
    return { p: p.join(''), s: full.join(''), clues };
  }
  function sdkNew(level, seed, daily) {
    const m = sdkMake(seed, level);
    return { lvl: level, seed: String(seed), daily: daily || null, p: m.p, s: m.s, g: m.p.split('').map(Number), n: Array(81).fill(0), t: 0, hints: 0, done: false, u: [] };
  }
  const sdkSnap = st => { st.u.push({ g: st.g.slice(), n: st.n.slice() }); if (st.u.length > 60) st.u.shift(); };
  const sdkStrip = (st, i, d) => { const b = ~(1 << (d - 1)); for (const j of PEERS[i]) st.n[j] &= b; };
  const sdkCheck = st => { st.done = st.g.every((v, i) => v === +st.s[i]); return st.done; };
  function sdkPlace(st, i, d, notes) {
    if (st.done || st.p[i] !== '0' || !isInt(d, 1, 9)) return false;
    if (notes) { if (st.g[i]) return false; sdkSnap(st); st.n[i] ^= 1 << (d - 1); return true; }
    sdkSnap(st);
    if (st.g[i] === d) st.g[i] = 0; else { st.g[i] = d; st.n[i] = 0; sdkStrip(st, i, d); }
    sdkCheck(st); return true;
  }
  function sdkErase(st, i) { if (st.done || st.p[i] !== '0' || (!st.g[i] && !st.n[i])) return false; sdkSnap(st); st.g[i] = 0; st.n[i] = 0; return true; }
  function sdkUndo(st) { const u = st.u.pop(); if (!u) return false; st.g = u.g; st.n = u.n; st.done = false; return true; }
  function sdkHint(st, i) {
    if (st.done || st.hints >= 3 || st.p[i] !== '0' || st.g[i] === +st.s[i]) return false;
    sdkSnap(st); st.g[i] = +st.s[i]; st.n[i] = 0; sdkStrip(st, i, st.g[i]); st.hints++; sdkCheck(st); return true;
  }
  const sdkWrong = (st, i) => st.p[i] === '0' && st.g[i] !== 0 && st.g[i] !== +st.s[i];
  function sdkValidFull(s) { // s: 81-char string of 1-9, every row/col/box unique
    if (!/^[1-9]{81}$/.test(s)) return false;
    for (let k = 0; k < 9; k++) { const R = new Set(), C = new Set(), B = new Set(); for (let j = 0; j < 9; j++) { R.add(s[k * 9 + j]); C.add(s[j * 9 + k]); B.add(s[(((k / 3) | 0) * 3 + ((j / 3) | 0)) * 9 + (k % 3) * 3 + (j % 3)]); } if (R.size !== 9 || C.size !== 9 || B.size !== 9) return false; }
    return true;
  }

  // ---------- 2048 ----------
  function slideLine(line) { // slide toward index 0, merge equal neighbours once
    const t = line.filter(Boolean), out = []; let gained = 0;
    for (let i = 0; i < t.length; i++) { if (t[i] === t[i + 1]) { out.push(t[i] * 2); gained += t[i] * 2; i++; } else out.push(t[i]); }
    while (out.length < line.length) out.push(0);
    return { line: out, gained };
  }
  const G48_LINES = {
    left: range(4).map(r => range(4).map(c => r * 4 + c)), right: range(4).map(r => range(4).map(c => r * 4 + 3 - c)),
    up: range(4).map(c => range(4).map(r => r * 4 + c)), down: range(4).map(c => range(4).map(r => (3 - r) * 4 + c))
  };
  function g48Slide(b, dir) {
    const nb = b.slice(); let gained = 0;
    for (const idx of G48_LINES[dir]) { const s = slideLine(idx.map(i => b[i])); idx.forEach((i, k) => { nb[i] = s.line[k]; }); gained += s.gained; }
    return { b: nb, gained, moved: nb.some((v, i) => v !== b[i]) };
  }
  function g48Spawn(b, r) { const e = []; b.forEach((v, i) => { if (!v) e.push(i); }); if (!e.length) return b; const nb = b.slice(); nb[e[Math.floor(r() * e.length)]] = r() < 0.9 ? 2 : 4; return nb; }
  const g48Over = b => !b.includes(0) && ['left', 'right', 'up', 'down'].every(d => !g48Slide(b, d).moved);
  function g48New(r) { return { b: g48Spawn(g48Spawn(Array(16).fill(0), r), r), sc: 0, pv: null, won: false }; }
  function g48Move(st, dir, r) {
    const m = g48Slide(st.b, dir); if (!m.moved) return false;
    st.pv = { b: st.b, sc: st.sc }; st.sc += m.gained; st.b = g48Spawn(m.b, r); if (st.b.includes(2048)) st.won = true; return true;
  }
  function g48Undo(st) { if (!st.pv) return false; st.b = st.pv.b; st.sc = st.pv.sc; st.pv = null; return true; }

  // ---------- Memory match ----------
  const MEM_EMOJI = ['⚓', '🚢', '🧭', '🌊', '🐬', '⛵', '🛟', '🐙', '🐚', '🦀', '🐋', '🌴', '🦈', '🐟'];
  const MEM_SIZES = { s: 6, m: 8, l: 12 }; // pairs; the board is always 4 columns wide
  function memNew(size, seed) {
    const pairs = MEM_SIZES[size], r = rng('mem|' + seed), pick = shuffle(range(MEM_EMOJI.length), r).slice(0, pairs);
    return { sz: size, deck: shuffle(pick.concat(pick), r), open: [], mt: Array(pairs * 2).fill(0), moves: 0, fin: false };
  }
  function memFlip(st, i) { // 'none' | 'open' | 'match' | 'miss'
    if (st.fin || st.mt[i] || st.open.includes(i) || st.open.length >= 2) return 'none';
    st.open.push(i); if (st.open.length < 2) return 'open';
    st.moves++; const [a, b] = st.open;
    if (st.deck[a] === st.deck[b]) { st.mt[a] = st.mt[b] = 1; st.open = []; if (st.mt.every(Boolean)) st.fin = true; return 'match'; }
    return 'miss';
  }
  const memClose = st => { st.open = []; };

  // ---------- Minesweeper ----------
  const MINE_SIZES = { s: [8, 10, 10], m: [9, 12, 20], l: [9, 14, 30] }; // cols, rows, mines
  const msNeighbours = (st, i) => { const x = i % st.w, y = (i / st.w) | 0, o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < st.w && ny < st.h) o.push(ny * st.w + nx); } return o; };
  function msNew(size) { const [w, h, k] = MINE_SIZES[size]; return { sz: size, w, h, k, mines: null, rev: Array(w * h).fill(0), flg: Array(w * h).fill(0), st: 'play', t: 0, hit: -1 }; }
  function msFromMines(w, h, mines) { return { sz: 'x', w, h, k: mines.reduce((a, b) => a + b, 0), mines: mines.slice(), rev: Array(w * h).fill(0), flg: Array(w * h).fill(0), st: 'play', t: 0, hit: -1 }; }
  const msCount = (st, i) => msNeighbours(st, i).reduce((a, j) => a + st.mines[j], 0);
  function msPlace(st, first, r) { // first tap and its neighbours are mine-free (falls back to the tap alone on a crowded board)
    let ban = new Set([first, ...msNeighbours(st, first)]);
    if (st.w * st.h - ban.size < st.k) ban = new Set([first]);
    const cells = shuffle(range(st.w * st.h).filter(i => !ban.has(i)), r).slice(0, st.k);
    st.mines = Array(st.w * st.h).fill(0); cells.forEach(i => { st.mines[i] = 1; });
  }
  function msWinCheck(st) { if (st.rev.reduce((a, b) => a + b, 0) === st.w * st.h - st.k) { st.st = 'won'; st.mines.forEach((m, i) => { if (m) st.flg[i] = 1; }); } }
  function msReveal(st, i, r) {
    if (st.st !== 'play' || st.flg[i] || st.rev[i]) return false;
    if (!st.mines) msPlace(st, i, r);
    if (st.mines[i]) { st.st = 'lost'; st.hit = i; return true; }
    const stack = [i];
    while (stack.length) { const j = stack.pop(); if (st.rev[j] || st.flg[j]) continue; st.rev[j] = 1; if (!msCount(st, j)) for (const n of msNeighbours(st, j)) if (!st.rev[n]) stack.push(n); }
    msWinCheck(st); return true;
  }
  function msFlag(st, i) { if (st.st !== 'play' || st.rev[i]) return false; st.flg[i] ^= 1; return true; }
  function msChord(st, i) { // tap a number whose flags match it: open the other neighbours
    if (st.st !== 'play' || !st.rev[i] || !st.mines) return false;
    const nb = msNeighbours(st, i); if (!msCount(st, i) || nb.reduce((a, j) => a + st.flg[j], 0) !== msCount(st, i)) return false;
    let any = false; for (const j of nb) if (!st.flg[j] && !st.rev[j]) { msReveal(st, j); any = true; } return any;
  }

  // ---------- Word search ----------
  const WS_WORDS = ('port starboard bridge ballast mooring anchor bow stern hull deck keel rudder propeller compass chart radar sonar helm galley cabin bulkhead hatch winch windlass fender bollard hawser cable chain knot fathom draft freeboard tonnage cargo container crane derrick pilot tug berth quay wharf dock jetty harbor lighthouse beacon buoy channel strait canal lock tide current swell wave gale storm squall typhoon monsoon horizon bearing course heading latitude longitude navigator captain mate bosun cadet engineer oiler welder cook steward purser deckhand lookout watch muster drill lifeboat liferaft lifebuoy flare siren alarm hose pump valve boiler engine piston turbine generator gearbox shaft fuel diesel bunker sludge bilge tank manifold funnel mast boom davit gangway ladder rope shackle splice whistle horn signal flag morse radio sextant logbook voyage passage ocean reef shoal atoll island gulf sail rigging transom bulwark scupper forecastle anchorage pier tanker freighter ferry trawler yacht schooner').split(' ').map(w => w.toUpperCase()).filter((w, i, a) => a.indexOf(w) === i);
  const WS_DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  const WS_N = 10, WS_COUNT = 8;
  function wsMake(seed) {
    const r = rng('ws|' + seed), grid = Array(WS_N * WS_N).fill(''), words = [];
    for (const w of shuffle(WS_WORDS.filter(x => x.length <= WS_N), r)) {
      if (words.length >= WS_COUNT) break;
      for (let a = 0; a < 80; a++) {
        const [dr, dc] = WS_DIRS[Math.floor(r() * 8)], r0 = Math.floor(r() * WS_N), c0 = Math.floor(r() * WS_N), r1 = r0 + dr * (w.length - 1), c1 = c0 + dc * (w.length - 1);
        if (r1 < 0 || c1 < 0 || r1 >= WS_N || c1 >= WS_N) continue;
        let ok = true; for (let k = 0; k < w.length; k++) { const ch = grid[(r0 + dr * k) * WS_N + c0 + dc * k]; if (ch && ch !== w[k]) { ok = false; break; } }
        if (!ok) continue;
        for (let k = 0; k < w.length; k++) grid[(r0 + dr * k) * WS_N + c0 + dc * k] = w[k];
        words.push({ w, r: r0, c: c0, dr, dc }); break;
      }
    }
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = A[Math.floor(r() * 26)];
    return { grid: grid.join(''), words };
  }
  function wsNew(seed) { const m = wsMake(seed); return { seed: String(seed), grid: m.grid, words: m.words, found: [], t: 0, done: false }; }
  function wsFind(grid, word) { // brute force: every start and direction (proves a word is findable)
    for (let r = 0; r < WS_N; r++) for (let c = 0; c < WS_N; c++) for (const [dr, dc] of WS_DIRS) {
      let k = 0; for (; k < word.length; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || cc < 0 || rr >= WS_N || cc >= WS_N || grid[rr * WS_N + cc] !== word[k]) break; }
      if (k === word.length) return true;
    }
    return false;
  }
  function wsLine(a, b) { // straight line of cell indexes from a to b, or null
    const ra = (a / WS_N) | 0, ca = a % WS_N, rb = (b / WS_N) | 0, cb = b % WS_N, dr = rb - ra, dc = cb - ca;
    if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return null;
    const n = Math.max(Math.abs(dr), Math.abs(dc)), sr = Math.sign(dr), sc = Math.sign(dc);
    return range(n + 1).map(k => (ra + sr * k) * WS_N + ca + sc * k);
  }
  function wsSelect(st, cells) { // 'found' | 'done' | null
    const s = cells.map(i => st.grid[i]).join(''), rs = s.split('').reverse().join('');
    const hit = st.words.find(x => (x.w === s || x.w === rs) && !st.found.some(f => f.w === x.w));
    if (!hit || cells.length !== hit.w.length) return null;
    st.found.push({ w: hit.w, cells: cells.slice() });
    if (st.found.length === st.words.length) { st.done = true; return 'done'; }
    return 'found';
  }

  // ---------- storage: validated per game, a bad game resets alone ----------
  const KEY = (() => { try { return /[?&]demo/.test(location.search) ? '953-games-demo' : '953-games'; } catch (e) { return '953-games'; } })();  // demo play never mixes into real stats
  const okT = v => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 360000;
  const okBest = (o, keys) => { const b = {}; for (const k of keys) b[k] = o && okT(o[k]) && o[k] > 0 ? o[k] : 0; return b; };
  const cleanSdk = o => {
    const out = { cur: null, mist: !o || o.mist !== false, best: okBest(o && o.best, SDK_LEVELS), daily: o && o.daily && /^\d{4}-\d\d-\d\d$/.test(o.daily.d) && okT(o.daily.t) ? { d: o.daily.d, t: o.daily.t } : null };
    const c = o && o.cur;
    try {
      if (c && SDK_LEVELS.includes(c.lvl) && typeof c.seed === 'string' && c.seed.length <= 40 && /^[0-9]{81}$/.test(c.p) && sdkValidFull(c.s) && c.p.split('').every((ch, i) => ch === '0' || ch === c.s[i]) &&
        Array.isArray(c.g) && c.g.length === 81 && c.g.every((v, i) => isInt(v, 0, 9) && (c.p[i] === '0' || v === +c.p[i])) && Array.isArray(c.n) && c.n.length === 81 && c.n.every(v => isInt(v, 0, 511)) &&
        okT(c.t) && isInt(c.hints, 0, 3) && (c.daily === null || /^\d{4}-\d\d-\d\d$/.test(c.daily)) && sdkValidFull(c.s)) out.cur = { lvl: c.lvl, seed: c.seed, daily: c.daily, p: c.p, s: c.s, g: c.g, n: c.n, t: c.t, hints: c.hints, done: c.g.every((v, i) => v === +c.s[i]), u: [] };
    } catch (e) { out.cur = null; }
    return out;
  };
  const cleanG48 = o => {
    const out = { cur: null, best: o && isInt(o.best, 0, 1e8) ? o.best : 0 }, c = o && o.cur;
    const bd = b => Array.isArray(b) && b.length === 16 && b.every(v => v === 0 || (isInt(v, 2, 131072) && (v & (v - 1)) === 0));
    if (c && bd(c.b) && isInt(c.sc, 0, 1e8) && (c.pv === null || (c.pv && bd(c.pv.b) && isInt(c.pv.sc, 0, 1e8)))) out.cur = { b: c.b, sc: c.sc, pv: c.pv ? { b: c.pv.b, sc: c.pv.sc } : null, won: !!c.won };
    return out;
  };
  const cleanMem = o => {
    const out = { cur: null, best: okBest(o && o.best, ['s', 'm', 'l']) }, c = o && o.cur;
    if (c && MEM_SIZES[c.sz]) { const p = MEM_SIZES[c.sz];
      if (Array.isArray(c.deck) && c.deck.length === p * 2 && c.deck.every(v => isInt(v, 0, MEM_EMOJI.length - 1)) && new Set(c.deck).size === p && c.deck.every(v => c.deck.filter(x => x === v).length === 2) &&
        Array.isArray(c.mt) && c.mt.length === p * 2 && c.mt.every(v => v === 0 || v === 1) && isInt(c.moves, 0, 99999)) out.cur = { sz: c.sz, deck: c.deck, open: [], mt: c.mt, moves: c.moves, fin: c.mt.every(Boolean) }; }
    return out;
  };
  const cleanMine = o => {
    const out = { cur: null, best: okBest(o && o.best, ['s', 'm', 'l']) }, c = o && o.cur;
    if (c && MINE_SIZES[c.sz]) { const [w, h, k] = MINE_SIZES[c.sz], n = w * h, bits = a => Array.isArray(a) && a.length === n && a.every(v => v === 0 || v === 1);
      if (c.w === w && c.h === h && c.k === k && bits(c.rev) && bits(c.flg) && (c.mines === null || (bits(c.mines) && c.mines.reduce((a, b) => a + b, 0) === k)) && ['play', 'won', 'lost'].includes(c.st) && okT(c.t) && isInt(c.hit, -1, n - 1) &&
        (c.mines || !c.rev.some(Boolean))) out.cur = { sz: c.sz, w, h, k, mines: c.mines, rev: c.rev, flg: c.flg, st: c.st, t: c.t, hit: c.hit }; }
    return out;
  };
  const cleanWs = o => {
    const out = { cur: null, best: o && okT(o.best) && o.best > 0 ? o.best : 0, n: o && isInt(o.n, 0, 99999) ? o.n : 0 }, c = o && o.cur;
    try {
      if (c && typeof c.seed === 'string' && c.seed.length <= 40 && /^[A-Z]{100}$/.test(c.grid) && Array.isArray(c.words) && c.words.length === WS_COUNT && okT(c.t) &&
        c.words.every(x => /^[A-Z]{3,10}$/.test(x.w) && isInt(x.r, 0, 9) && isInt(x.c, 0, 9) && [-1, 0, 1].includes(x.dr) && [-1, 0, 1].includes(x.dc) && (x.dr || x.dc) &&
          x.w.split('').every((ch, k) => { const rr = x.r + x.dr * k, cc = x.c + x.dc * k; return rr >= 0 && cc >= 0 && rr < 10 && cc < 10 && c.grid[rr * 10 + cc] === ch; })) &&
        Array.isArray(c.found) && c.found.length <= WS_COUNT && c.found.every(f => c.words.some(x => x.w === f.w) && Array.isArray(f.cells) && f.cells.length === f.w.length && f.cells.every(v => isInt(v, 0, 99))))
        out.cur = { seed: c.seed, grid: c.grid, words: c.words.map(x => ({ w: x.w, r: x.r, c: x.c, dr: x.dr, dc: x.dc })), found: c.found.map(f => ({ w: f.w, cells: f.cells.slice() })), t: c.t, done: c.found.length === WS_COUNT };
    } catch (e) { out.cur = null; }
    return out;
  };
  function loadStore(raw) {
    let o = null; try { if (typeof raw === 'string' && raw.length <= 200000) o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const sf = (fn, v) => { try { return fn(v && typeof v === 'object' ? v : null); } catch (e) { return fn(null); } };
    return { v: 1, sdk: sf(cleanSdk, o.sdk), g48: sf(cleanG48, o.g48), mem: sf(cleanMem, o.mem), mine: sf(cleanMine, o.mine), ws: sf(cleanWs, o.ws) };
  }
  const serialize = store => JSON.stringify(store, (k, v) => (k === 'u' ? undefined : v));

  const GamesX = {
    KEY, hashSeed, rng, shuffle, manilaDate, loadStore, serialize,
    SDK_LEVELS, SDK_CLUES, sdkSolve, sdkMake, sdkNew, sdkPlace, sdkErase, sdkUndo, sdkHint, sdkWrong, sdkCheck, sdkValidFull, PEERS,
    slideLine, g48Slide, g48Spawn, g48Over, g48New, g48Move, g48Undo,
    MEM_EMOJI, MEM_SIZES, memNew, memFlip, memClose,
    MINE_SIZES, msNew, msFromMines, msCount, msNeighbours, msReveal, msFlag, msChord,
    WS_WORDS, WS_N, WS_COUNT, wsMake, wsNew, wsFind, wsLine, wsSelect
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = GamesX;
  root.GamesX = GamesX;

  // ================= Part 2: UI (browser only) =================
  if (typeof document === 'undefined') return;
  const X = GamesX;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = t => { t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const CARDS = [['sdk', '🔢', 'Sudoku'], ['g48', '🟧', '2048'], ['mem', '🃏', 'Memory match'], ['mine', '💣', 'Minesweeper'], ['ws', '🔎', 'Word search'], ['chess', '♞', 'Chess']];
  const SIZE_NAME = { s: 'Small', m: 'Medium', l: 'Large' };
  const HOW = {
    sdk: 'Fill the grid so every row, column and 3x3 box holds 1 to 9 once. Tap a cell, then a number. Notes mode lets you pencil in candidates. Hints (3 max) fill the selected cell; a puzzle solved with hints does not set a best time.',
    g48: 'Swipe (or use the arrow buttons or keys) to slide all tiles. Equal tiles that touch merge and add up. Make 2048, then keep going for a higher score. You can undo one move.',
    mem: 'Flip two cards at a time and find the matching pair. Fewer moves is better.',
    mine: 'Tap a square to open it. A number says how many of its 8 neighbours hold a mine. Long-press, or turn on Flag mode, to mark a mine. Tap a number whose flags match it to open the rest around it. Your first tap is always safe.',
    ws: 'Drag your finger across the letters in a straight line (any direction) to select a hidden word from the list.', chess: 'Tap one of your pieces, then a dotted square to move it, or drag the piece there. A ring marks a piece you can capture. Play the computer (Easy or Medium) or share the phone with a friend. Sound is off until you switch it on. Your game is saved. For a game against a housemate, use Challenge a housemate.'
  };
  const CSS = `.gm{padding:14px;display:flex;flex-direction:column;gap:12px;color:#15233a;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.gm button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.gm-top{display:flex;align-items:center;gap:8px}.gm-top h2{flex:1;margin:0;font-size:17px;text-align:center}
.gm-btn{border:0;border-radius:12px;padding:0 14px;min-height:44px;background:rgba(21,35,58,.08);font-weight:600;font-size:14px}
.gm-btn.pri{background:#15233a;color:#fff}.gm-btn[aria-pressed=true]{background:#15233a;color:#fff}.gm-btn:disabled{opacity:.4}
.gm-home{display:grid;grid-template-columns:1fr 1fr;gap:10px}.gm-card{border:0;border-radius:18px;padding:14px 12px;background:#fff;box-shadow:0 1px 0 rgba(21,35,58,.08),0 10px 24px -16px rgba(21,35,58,.5);text-align:left;display:flex;flex-direction:column;gap:4px;min-height:112px}
.gm-card.wide{grid-column:1/-1;min-height:96px}.gm-card .e{font-size:30px;line-height:1}.gm-card .e svg{width:34px;height:34px;display:block}.gm-card b{font-size:15px}.gm-card small{font-size:12px;opacity:.7}.gm-pill{align-self:flex-start;background:#c19a4b;color:#15233a;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700}
.gm-bar{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:600}.gm-bar span{font-variant-numeric:tabular-nums}
.gm-how{font-size:12.5px;line-height:1.45;opacity:.85}.gm-how summary{cursor:pointer;font-weight:600;min-height:28px}
.gm-pick{display:grid;grid-template-columns:1fr 1fr;gap:10px}.gm-pick .gm-btn{min-height:56px;font-size:16px}
.gm-sdk{display:grid;grid-template-columns:repeat(9,1fr);width:100%;aspect-ratio:1/1;border:2px solid #15233a;border-radius:6px;overflow:hidden;background:#fff}
.gm-c{border:0;border-right:1px solid rgba(21,35,58,.18);border-bottom:1px solid rgba(21,35,58,.18);background:#fff;padding:0;font-size:20px;font-weight:500;color:#2f6fb0;position:relative;display:flex;align-items:center;justify-content:center;min-width:0}
.gm-c.clue{color:#15233a;font-weight:700}.gm-c.rb{border-right:2px solid #15233a}.gm-c.bb{border-bottom:2px solid #15233a}.gm-c.pe{background:#eef1f7}.gm-c.same{background:#dfe6f3}.gm-c.sel{background:#f3e3b5}.gm-c.bad{color:#b8463d;background:#fbe3e0}
.gm-c .nt{display:grid;grid-template-columns:repeat(3,1fr);width:100%;height:100%;font-size:9px;line-height:1;color:#555e6e;font-weight:600}.gm-c .nt i{font-style:normal;display:flex;align-items:center;justify-content:center}
.gm-pad{display:grid;grid-template-columns:repeat(9,1fr);gap:4px}.gm-pad .gm-btn{padding:0;min-height:50px;font-size:20px}
.gm-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.gm-tools .gm-btn{padding:0 4px;font-size:13px}
.gm-b48{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px;border-radius:14px;background:#b9ad9e;width:100%;aspect-ratio:1/1;touch-action:none;box-sizing:border-box}
.gm-t{border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px;background:rgba(238,228,218,.35);color:#776e65}
.gm-t.l3{font-size:24px}.gm-t.l4{font-size:19px}.gm-t.l5{font-size:15px}
.gm-dpad{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.gm-dpad .gm-btn{font-size:22px}
.gm-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.gm-m{border:0;border-radius:12px;aspect-ratio:1/1;font-size:34px;background:#15233a;color:#fff;display:flex;align-items:center;justify-content:center;padding:0}
.gm-m.up{background:#fff;box-shadow:inset 0 0 0 2px rgba(21,35,58,.15)}.gm-m.ok{background:#e3f1e6;box-shadow:inset 0 0 0 2px #2f8a5b}
.gm-ms{display:grid;width:100%;gap:2px;touch-action:manipulation}.gm-s{border:0;border-radius:5px;aspect-ratio:1/1;padding:0;background:#c9d1df;font-size:17px;font-weight:800;display:flex;align-items:center;justify-content:center;min-width:0}
.gm-s.o{background:#f2f4f8;cursor:default}.gm-s.x{background:#f5c9c3}.gm-s.n1{color:#2f6fb0}.gm-s.n2{color:#2f8a5b}.gm-s.n3{color:#b8463d}.gm-s.n4{color:#6b4f8a}.gm-s.n5,.gm-s.n6,.gm-s.n7,.gm-s.n8{color:#8a6a26}
.gm-ws{display:grid;grid-template-columns:repeat(10,1fr);width:100%;aspect-ratio:1/1;background:#fff;border-radius:12px;box-shadow:inset 0 0 0 1px rgba(21,35,58,.15);touch-action:none;-webkit-user-select:none;user-select:none}
.gm-w{display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;border-radius:50%;margin:1px;min-width:0}.gm-w.pick{background:#f3e3b5}.gm-w.fd{background:#cfe7d6;color:#14532d}
.gm-words{display:flex;flex-wrap:wrap;gap:6px}.gm-words span{padding:5px 10px;border-radius:99px;background:rgba(21,35,58,.07);font-size:13px;font-weight:600}.gm-words span.fd{background:#cfe7d6;text-decoration:line-through;opacity:.8}
.gm-win{background:linear-gradient(140deg,#1f8a3c,#1f63b4);color:#fff;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;font-weight:600}.gm-win .gm-btn{background:rgba(255,255,255,.2);color:#fff}
.gm-note{font-size:12px;opacity:.65;text-align:center}
@media (prefers-reduced-motion:reduce){.gm *{animation:none!important;transition:none!important}}`;

  let inst = null;
  function unmount() {
    if (!inst) return; const G = inst; inst = null;
    fold(G); save(G); clearInterval(G.iv); clearTimeout(G.mt); G.off.forEach(f => f()); if (root.Chess953) root.Chess953.unmount(); const s = document.getElementById('gm-css'); if (s) s.remove(); try { G.host.innerHTML = ''; } catch (e) { /* host already gone */ }
  }
  const reported = new WeakSet();
  // a finished game: tell the app once (it sends the score to the house board when signed in) and remember it for the Challenge button
  function report(G, key, value, obj) { if (obj) { if (reported.has(obj)) return; reported.add(obj); } if (key !== 'ws') G.fin = { view: G.view, key, value }; if (G.opts.onScore) { try { G.opts.onScore(key, value); } catch (e) { /* the board is optional */ } } }
  function save(G) { try { localStorage.setItem(X.KEY, X.serialize(G.store)); } catch (e) { /* storage full or blocked: play on without saving */ } }
  const timedCur = G => { const S = G.store, c = G.view === 'sdk' ? S.sdk.cur : G.view === 'mine' ? S.mine.cur : G.view === 'ws' ? S.ws.cur : null;
    if (!c || G.pick || G.making) return null; if (G.view === 'sdk') return c.done ? null : c; if (G.view === 'mine') return c.st === 'play' && c.mines ? c : null; return c.done ? null : c; };
  function fold(G) { if (!G.last) return; const c = timedCur(G), n = Date.now(); if (c) c.t = Math.min(c.t + Math.max(0, (n - G.last) / 1000), 359999); G.last = 0; }
  function startTimer(G) {
    clearInterval(G.iv); G.iv = 0; G.last = 0;
    if (!timedCur(G) || document.hidden) return;
    G.last = Date.now();
    G.iv = setInterval(() => { const c = timedCur(G); if (!c) return; const n = Date.now(); c.t = Math.min(c.t + (n - G.last) / 1000, 359999); G.last = n; const el = G.host.querySelector('[data-timer]'); if (el) el.textContent = fmt(c.t); G.tick = (G.tick || 0) + 1; if (G.tick % 10 === 0) save(G); }, 1000);
  }
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function mount(host, opts) {
    unmount();
    let raw = null; try { raw = localStorage.getItem(X.KEY); } catch (e) { raw = null; }
    const G = { host, store: X.loadStore(raw), view: 'home', pick: false, sel: -1, notes: false, fmode: false, msg: '', off: [], iv: 0, last: 0, mt: 0, drag: null, track: opts && opts.track, opts: opts || {} };
    inst = G;
    if (!document.getElementById('gm-css')) { const st = document.createElement('style'); st.id = 'gm-css'; st.textContent = CSS; document.head.appendChild(st); }
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); G.off.push(() => t.removeEventListener(ev, fn, o)); };
    on(host, 'click', e => onClick(G, e));
    on(host, 'contextmenu', e => { if (e.target.closest && e.target.closest('[data-i]')) { e.preventDefault(); const b = e.target.closest('[data-a="ms"]'); clearTimeout(G.lp); if (b && !G.lpDone) { G.lpDone = true; fold(G); flagMs(G, +b.dataset.i); } } });
    on(host, 'pointerdown', e => onDown(G, e));
    on(host, 'pointermove', e => onMove(G, e));
    on(host, 'pointerup', e => onUp(G, e));
    on(host, 'pointercancel', () => { G.drag = null; clearTimeout(G.lp); paintSel(G); });
    on(document, 'keydown', e => { if (G.view !== 'g48' || G.pick || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return; const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key]; if (d) { e.preventDefault(); move48(G, d); } });
    on(document, 'visibilitychange', () => { if (document.hidden) { fold(G); save(G); clearInterval(G.iv); G.iv = 0; } else startTimer(G); });
    on(window, 'pagehide', () => { fold(G); save(G); });
    render(G);
  }

  function render(G) {
    clearTimeout(G.lp); fold(G);
    const S = G.store, v = G.view;
    let h = '';
    if (v === 'home') h = homeHtml(S, G);
    else {
      const name = CARDS.find(c => c[0] === v)[2], immediate = v === 'g48' || v === 'ws';
      h = '<div class="gm-top"><button class="gm-btn" data-a="home" aria-label="Back to Games">‹ Games</button><h2>' + name + '</h2>' + (v === 'chess' ? '<span style="min-width:72px"></span>' : '<button class="gm-btn" data-a="new">' + (immediate ? 'New game' : 'New') + '</button>') + '</div>';
      h += G.making ? '<div class="gm-note" role="status">Making puzzle...</div>' : v === 'chess' ? '<div data-chess-host="1"></div>' : G.pick ? pickHtml(G) : v === 'sdk' ? sdkHtml(G) : v === 'g48' ? g48Html(G) : v === 'mem' ? memHtml(G) : v === 'mine' ? mineHtml(G) : wsHtml(G);
      h += '<details class="gm-how"><summary>How to play</summary>' + esc(HOW[v]) + '</details>';
    }
    if (v !== 'chess' && root.Chess953) root.Chess953.unmount();
    if (v !== 'home' && v !== 'chess' && G.fin && G.fin.view === v && G.opts.onChallenge) h += '<button class="gm-btn pri" data-a="chal">Challenge a housemate to beat this</button>';
    G.host.innerHTML = '<div class="gm">' + h + '</div>';
    if (v === 'chess' && root.Chess953) { const ch = G.host.querySelector('[data-chess-host]'); if (ch) root.Chess953.mount(ch, { onChallenge: G.opts.onChallenge && (k => G.opts.onChallenge(k, 0)), track: G.track }); else G.host.textContent = 'Chess could not load. Reload the app.'; }
    if (v === 'sdk' && !G.pick && !G.making && G.sel >= 0) { const el = G.host.querySelector('[data-i="' + G.sel + '"]'); if (el) el.focus({ preventScroll: true }); }
    startTimer(G);
  }

  function homeHtml(S, G) {
    const prog = { sdk: S.sdk.cur && !S.sdk.cur.done, g48: S.g48.cur && !X.g48Over(S.g48.cur.b), mem: S.mem.cur && !S.mem.cur.fin, mine: S.mine.cur && S.mine.cur.st === 'play' && S.mine.cur.mines, ws: S.ws.cur && !S.ws.cur.done, chess: root.Chess953 && root.Chess953.inProgress() };
    const b = S.sdk.best, bm = S.mine.best, mm = S.mem.best;
    const best = {
      sdk: ['easy', 'medium', 'hard'].filter(k => b[k]).map(k => k[0].toUpperCase() + ' ' + fmt(b[k])).join(' · '),
      g48: S.g48.best ? 'Best ' + S.g48.best : '', mem: ['s', 'm', 'l'].filter(k => mm[k]).map(k => k.toUpperCase() + ' ' + mm[k] + ' moves').join(' · '),
      mine: ['s', 'm', 'l'].filter(k => bm[k]).map(k => k.toUpperCase() + ' ' + fmt(bm[k])).join(' · '), ws: S.ws.best ? 'Best ' + fmt(S.ws.best) + ' · ' + S.ws.n + ' solved' : ''
    };
    return '<div class="gm-note">' + (G.opts.onScore ? 'Plays offline. Finished games also add to the house leaderboard.' : 'Plays offline. Scores stay on this phone.') + '</div><div class="gm-home">' + CARDS.map(([k, e, n]) =>
      '<button class="gm-card" data-a="open" data-g="' + k + '" aria-label="' + n + (prog[k] ? ', in progress' : '') + '"><span class="e" aria-hidden="true">' + (k === 'chess' && root.Chess953 && root.Chess953.icon ? root.Chess953.icon() : e) + '</span><b>' + n + '</b>' + (prog[k] ? '<span class="gm-pill">Continue</span>' : '') + '<small>' + ((best[k] ? esc(best[k]) : (k === 'chess' ? 'Computer, a friend, or online' : 'No best yet'))) + '</small></button>').join('') + (G.opts.onBoard ? '<button class="gm-card wide" data-a="board" aria-label="Leaderboard and challenges"><span class="e" aria-hidden="true">🏆</span><b>Leaderboard and challenges</b><small>Steps, game scores and chess wins in the house</small></button>' : '') + '</div>';
  }

  function pickHtml(G) {
    const v = G.view, S = G.store;
    if (v === 'sdk') return '<div class="gm-pick">' + X.SDK_LEVELS.map(l => '<button class="gm-btn" data-a="start" data-v="' + l + '">' + l[0].toUpperCase() + l.slice(1) + (S.sdk.best[l] ? '<br><small>best ' + fmt(S.sdk.best[l]) + '</small>' : '') + '</button>').join('') +
      '<button class="gm-btn pri" data-a="start" data-v="daily" style="grid-column:1/-1">Daily puzzle<br><small>' + X.manilaDate() + ' · same for every housemate' + (S.sdk.daily && S.sdk.daily.d === X.manilaDate() ? ' · your time ' + fmt(S.sdk.daily.t) : '') + '</small></button></div>';
    if (v === 'mem') return '<div class="gm-pick">' + ['s', 'm', 'l'].map(k => '<button class="gm-btn" data-a="start" data-v="' + k + '">' + SIZE_NAME[k] + '<br><small>' + X.MEM_SIZES[k] + ' pairs' + (S.mem.best[k] ? ' · best ' + S.mem.best[k] : '') + '</small></button>').join('') + '</div>';
    return '<div class="gm-pick">' + ['s', 'm', 'l'].map(k => { const [w, h, m] = X.MINE_SIZES[k]; return '<button class="gm-btn" data-a="start" data-v="' + k + '">' + SIZE_NAME[k] + '<br><small>' + w + 'x' + h + ' · ' + m + ' mines' + (S.mine.best[k] ? ' · best ' + fmt(S.mine.best[k]) : '') + '</small></button>'; }).join('') + '</div>';
  }

  // ----- Sudoku -----
  function sdkHtml(G) {
    const c = G.store.sdk.cur, mist = G.store.sdk.mist, sel = G.sel, sd = sel >= 0 ? c.g[sel] : 0;
    let h = '<div class="gm-bar"><span>' + c.lvl[0].toUpperCase() + c.lvl.slice(1) + (c.daily ? ' · daily ' + c.daily : '') + '</span><span>Hints ' + (3 - c.hints) + ' left</span><span data-timer>' + fmt(c.t) + '</span></div>';
    h += '<div class="gm-sdk" data-nogesture="1" role="group" aria-label="Sudoku board">';
    for (let i = 0; i < 81; i++) {
      const r = (i / 9) | 0, cc = i % 9, clue = c.p[i] !== '0', v = c.g[i];
      const cls = 'gm-c' + (clue ? ' clue' : '') + (i === sel ? ' sel' : sel >= 0 && X.PEERS[sel].includes(i) ? ' pe' : sd && v === sd ? ' same' : '') + (mist && v && !clue && v !== +c.s[i] ? ' bad' : '') + (cc % 3 === 2 && cc < 8 ? ' rb' : '') + (r % 3 === 2 && r < 8 ? ' bb' : '');
      let inner = v ? String(v) : c.n[i] ? '<span class="nt">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => '<i>' + (c.n[i] & (1 << (d - 1)) ? d : '') + '</i>').join('') + '</span>' : '';
      h += '<button class="' + cls + '" data-a="cell" data-i="' + i + '" aria-label="Row ' + (r + 1) + ', column ' + (cc + 1) + ', ' + (v ? v + (clue ? ', given' : '') : c.n[i] ? 'notes' : 'empty') + '">' + inner + '</button>';
    }
    h += '</div>';
    if (c.done) {
      const bestNote = G.msg || '';
      h += '<div class="gm-win"><div>Solved in ' + fmt(c.t) + (c.hints ? ' (with hints)' : '') + '.' + bestNote + '</div><div style="display:flex;gap:8px"><button class="gm-btn" data-a="copy">Copy result</button><button class="gm-btn" data-a="new">New puzzle</button></div></div>';
      return h;
    }
    h += '<div class="gm-pad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => '<button class="gm-btn" data-a="num" data-d="' + d + '" aria-label="' + (G.notes ? 'Note ' : 'Number ') + d + '">' + d + '</button>').join('') + '</div>';
    h += '<div class="gm-tools"><button class="gm-btn" data-a="undo"' + (c.u.length ? '' : ' disabled') + '>Undo</button><button class="gm-btn" data-a="erase">Erase</button><button class="gm-btn" data-a="notes" aria-pressed="' + G.notes + '">Notes ' + (G.notes ? 'on' : 'off') + '</button><button class="gm-btn" data-a="hint"' + (c.hints >= 3 ? ' disabled' : '') + '>Hint</button></div>';
    h += '<button class="gm-btn" data-a="mist" aria-pressed="' + mist + '">Show mistakes: ' + (mist ? 'on' : 'off') + '</button>';
    return h;
  }
  function afterSdk(G) {
    const S = G.store.sdk, c = S.cur;
    if (c.done) {
      G.msg = '';
      if (!c.hints) { const t = Math.max(1, Math.round(c.t)); report(G, 'sdk_' + c.lvl, t, c); if (!S.best[c.lvl] || t < S.best[c.lvl]) { S.best[c.lvl] = t; G.msg = ' New best!'; }
        if (c.daily && (!S.daily || S.daily.d !== c.daily || t < S.daily.t)) S.daily = { d: c.daily, t }; }
    }
    save(G); render(G);
  }

  // ----- 2048 -----
  const TILE = { 2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'], 32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'], 128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'], 512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff'] };
  function g48Html(G) {
    const c = G.store.g48.cur, over = X.g48Over(c.b);
    let h = '<div class="gm-bar"><span>Score ' + c.sc + '</span><span>Best ' + G.store.g48.best + '</span></div>';
    h += '<div class="gm-b48" data-nogesture="1" data-board="1" role="img" aria-label="2048 board: ' + esc(c.b.map(v => v || '.').join(' ')) + '">' + c.b.map(v => { const col = TILE[v] || ['#3c3a32', '#fff'], len = String(v).length; return '<div class="gm-t' + (len > 2 ? ' l' + len : '') + '"' + (v ? ' style="background:' + col[0] + ';color:' + col[1] + '"' : '') + '>' + (v || '') + '</div>'; }).join('') + '</div>';
    if (over) h += '<div class="gm-win"><div>No more moves. Score ' + c.sc + '.</div><button class="gm-btn" data-a="new">New game</button></div>';
    else if (c.won) h += '<div class="gm-note">You made 2048. Keep going for a higher score.</div>';
    h += '<div class="gm-dpad">' + [['left', '←', 'Move left'], ['up', '↑', 'Move up'], ['down', '↓', 'Move down'], ['right', '→', 'Move right']].map(([d, a, l]) => '<button class="gm-btn" data-a="mv" data-d="' + d + '" aria-label="' + l + '">' + a + '</button>').join('') + '</div>';
    h += '<button class="gm-btn" data-a="undo"' + (c.pv ? '' : ' disabled') + '>Undo last move</button>';
    return h;
  }
  function move48(G, dir) {
    const S = G.store.g48, c = S.cur; if (!c || X.g48Over(c.b)) return;
    if (X.g48Move(c, dir, Math.random)) { if (c.sc > S.best) S.best = c.sc; if (X.g48Over(c.b)) report(G, 'g48', c.sc, c); save(G); render(G); }
  }

  // ----- Memory -----
  function memHtml(G) {
    const c = G.store.mem.cur, best = G.store.mem.best[c.sz];
    let h = '<div class="gm-bar"><span>Moves ' + c.moves + '</span><span>' + (best ? 'Best ' + best : 'No best yet') + '</span></div><div class="gm-mem">';
    c.deck.forEach((e, i) => { const up = c.open.includes(i) || c.mt[i]; h += '<button class="gm-m' + (c.mt[i] ? ' ok' : up ? ' up' : '') + '" data-a="card" data-i="' + i + '" aria-label="' + (up ? 'Card ' + (i + 1) + ': ' + X.MEM_EMOJI[e] : 'Card ' + (i + 1) + ', face down') + '">' + (up ? X.MEM_EMOJI[e] : '') + '</button>'; });
    h += '</div>';
    if (c.fin) h += '<div class="gm-win"><div>All pairs found in ' + c.moves + ' moves.' + (G.msg || '') + '</div><button class="gm-btn" data-a="new">New game</button></div>';
    return h;
  }
  function flip(G, i) {
    clearTimeout(G.mt); const S = G.store.mem, c = S.cur;
    if (c.open.length === 2) { X.memClose(c); }
    const r = X.memFlip(c, i); if (r === 'none') { render(G); return; }
    if (r === 'match' && c.fin) { G.msg = ''; report(G, 'mem_' + c.sz, c.moves, c); if (!S.best[c.sz] || c.moves < S.best[c.sz]) { S.best[c.sz] = c.moves; G.msg = ' New best!'; } }
    save(G); render(G);
    if (r === 'miss') { G.mt = setTimeout(() => { if (inst === G && S.cur === c && c.open.length === 2) { X.memClose(c); render(G); } }, reduced() ? 900 : 700); }
  }

  // ----- Minesweeper -----
  function mineHtml(G) {
    const c = G.store.mine.cur, best = G.store.mine.best[c.sz], fl = c.flg.reduce((a, b) => a + b, 0);
    let h = '<div class="gm-bar"><span>Mines ' + Math.max(0, c.k - fl) + '</span><span data-timer>' + fmt(c.t) + '</span><span>' + (best ? 'Best ' + fmt(best) : 'No best') + '</span></div>';
    h += '<div class="gm-ms" data-nogesture="1" style="grid-template-columns:repeat(' + c.w + ',1fr)" role="group" aria-label="Minesweeper board">';
    for (let i = 0; i < c.w * c.h; i++) {
      const rev = c.rev[i], mine = c.mines && c.mines[i], n = rev && !mine ? X.msCount(c, i) : 0, lost = c.st === 'lost';
      let cls = 'gm-s', t = '', lab = 'Hidden';
      if (rev) { cls += ' o' + (n ? ' n' + n : ''); t = n ? String(n) : ''; lab = n ? n + ' nearby' : 'Open'; }
      else if (lost && mine && !c.flg[i]) { cls += ' o' + (i === c.hit ? ' x' : ''); t = '💣'; lab = 'Mine'; }
      else if (c.flg[i]) { t = lost && !mine ? '❌' : '🚩'; lab = 'Flag'; }
      h += '<button class="' + cls + '" data-a="ms" data-i="' + i + '" aria-label="' + lab + ', row ' + (((i / c.w) | 0) + 1) + ' column ' + ((i % c.w) + 1) + '">' + t + '</button>';
    }
    h += '</div><button class="gm-btn" data-a="fmode" aria-pressed="' + G.fmode + '">Flag mode: ' + (G.fmode ? 'on' : 'off') + '</button>';
    if (c.st === 'won') h += '<div class="gm-win"><div>Cleared in ' + fmt(c.t) + '.' + (G.msg || '') + '</div><button class="gm-btn" data-a="new">New game</button></div>';
    if (c.st === 'lost') h += '<div class="gm-win"><div>Boom. Try again.</div><button class="gm-btn" data-a="new">New game</button></div>';
    return h;
  }
  function endMs(G) {
    const S = G.store.mine, c = S.cur; if (c.st === 'play') return; G.msg = '';
    if (c.st === 'won') { const t = Math.max(1, Math.round(c.t)); report(G, 'mine_' + c.sz, t, c); if (!S.best[c.sz] || t < S.best[c.sz]) { S.best[c.sz] = t; G.msg = ' New best!'; } }
  }
  function revealMs(G, i) {
    const c = G.store.mine.cur; if (c.rev[i] ? !X.msChord(c, i) : !X.msReveal(c, i, Math.random)) { render(G); return; }
    endMs(G); save(G); render(G);
  }
  function flagMs(G, i) { const c = G.store.mine.cur; if (X.msFlag(c, i)) { save(G); render(G); } }

  // ----- Word search -----
  function wsHtml(G) {
    const c = G.store.ws.cur, fd = new Set(); c.found.forEach(f => f.cells.forEach(i => fd.add(i)));
    let h = '<div class="gm-bar"><span>' + c.found.length + ' / ' + c.words.length + ' found</span><span data-timer>' + fmt(c.t) + '</span><span>' + (G.store.ws.best ? 'Best ' + fmt(G.store.ws.best) : 'No best') + '</span></div>';
    h += '<div class="gm-ws" data-nogesture="1" data-board="1" role="group" aria-label="Word search board">' + c.grid.split('').map((ch, i) => '<div class="gm-w' + (fd.has(i) ? ' fd' : '') + '" data-i="' + i + '">' + ch + '</div>').join('') + '</div>';
    h += '<div class="gm-words" aria-label="Words to find">' + c.words.map(x => '<span' + (c.found.some(f => f.w === x.w) ? ' class="fd" data-found="1"' : '') + '>' + x.w + '</span>').join('') + '</div>';
    if (c.done) h += '<div class="gm-win"><div>All words found in ' + fmt(c.t) + '.' + (G.msg || '') + '</div><div style="display:flex;gap:8px"><button class="gm-btn" data-a="new">New puzzle</button></div></div>';
    else h += '<div style="display:flex;gap:8px"><button class="gm-btn" data-a="wsday" style="flex:1">Today’s puzzle</button><div class="gm-note" style="flex:1;align-self:center">Puzzle ' + esc(c.seed.slice(0, 12)) + '</div></div>';
    return h;
  }
  const cellAt = (G, e) => { const b = G.host.querySelector('.gm-ws'); if (!b) return -1; const r = b.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * 10), y = Math.floor((e.clientY - r.top) / r.height * 10); return x < 0 || y < 0 || x > 9 || y > 9 ? -1 : y * 10 + x; };
  function paintSel(G) { const d = G.drag; G.host.querySelectorAll('.gm-w.pick').forEach(el => el.classList.remove('pick')); if (!d) return; (X.wsLine(d.a, d.b) || [d.a]).forEach(i => { const el = G.host.querySelector('.gm-w[data-i="' + i + '"]'); if (el) el.classList.add('pick'); }); }

  // ----- pointer handling (2048 swipe, word search drag, mine long-press) -----
  function onDown(G, e) {
    if (G.view === 'ws' && !G.pick && e.target.closest && e.target.closest('.gm-ws')) { const i = cellAt(G, e); if (i >= 0) { G.drag = { a: i, b: i }; try { e.target.closest('.gm-ws').setPointerCapture(e.pointerId); } catch (x) { /* capture not supported */ } paintSel(G); e.preventDefault(); } }
    else if (G.view === 'g48' && e.target.closest && e.target.closest('.gm-b48')) G.sw = { x: e.clientX, y: e.clientY };
    else if (G.view === 'mine' && !G.pick) { const b = e.target.closest && e.target.closest('[data-a="ms"]'); G.lpDone = false; if (b) { const i = +b.dataset.i, x0 = e.clientX, y0 = e.clientY; G.lpPos = [x0, y0]; clearTimeout(G.lp); G.lp = setTimeout(() => { G.lpDone = true; fold(G); if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) { /* no haptics */ } flagMs(G, i); }, 450); } }
  }
  function onMove(G, e) {
    if (G.drag) { const i = cellAt(G, e); if (i >= 0 && i !== G.drag.b) { G.drag.b = i; paintSel(G); } }
    if (G.lp && G.lpPos && Math.hypot(e.clientX - G.lpPos[0], e.clientY - G.lpPos[1]) > 10) clearTimeout(G.lp);
  }
  function onUp(G, e) {
    clearTimeout(G.lp);
    if (G.drag) {
      fold(G); const d = G.drag; G.drag = null; const cells = X.wsLine(d.a, d.b), c = G.store.ws.cur;
      if (cells && cells.length > 1) { const r = X.wsSelect(c, cells); if (r === 'done') { const S = G.store.ws, t = Math.max(1, Math.round(c.t)); S.n++; G.msg = ''; report(G, 'ws', t, c); if (!S.best || t < S.best) { S.best = t; G.msg = ' New best!'; } }
        if (r) save(G); }
      render(G); return;
    }
    if (G.sw) { const dx = e.clientX - G.sw.x, dy = e.clientY - G.sw.y; G.sw = null; if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) move48(G, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); }
  }

  function newGame(G, v) {
    const S = G.store, seed = String(Math.floor(Math.random() * 1e9)); G.msg = ''; G.sel = -1; G.notes = false; G.pick = false;
    if (G.view === 'sdk') { // generation can take a moment on a slow phone: show feedback first, then build
      const day = X.manilaDate(), tok = G.making = {}; render(G);
      setTimeout(() => { if (inst !== G || G.making !== tok) return; G.making = null; S.sdk.cur = v === 'daily' ? X.sdkNew('medium', day, day) : X.sdkNew(v, seed, null); save(G); render(G); }, 30);
      return;
    }
    else if (G.view === 'mem') S.mem.cur = X.memNew(v, seed);
    else if (G.view === 'mine') S.mine.cur = X.msNew(v);
    else if (G.view === 'g48') S.g48.cur = X.g48New(Math.random);
    else if (G.view === 'ws') S.ws.cur = X.wsNew(v === 'daily' ? X.manilaDate() : seed);
    save(G); render(G);
  }

  function onClick(G, e) {
    const b = e.target.closest && e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, S = G.store;
    if (a === 'ms' && G.lpDone) { G.lpDone = false; return; } // the long-press already flagged this cell
    fold(G);
    if (a === 'home') { G.view = 'home'; G.pick = false; G.making = null; G.msg = ''; G.fin = null; save(G); return render(G); }
    if (a === 'board') { if (G.opts.onBoard) G.opts.onBoard(); return; }
    if (a === 'chal') { if (G.fin && G.opts.onChallenge) G.opts.onChallenge(G.fin.key, G.fin.value); return; }
    if (a === 'open' && b.dataset.g === 'chess') { G.view = 'chess'; G.pick = false; G.msg = ''; G.fin = null; if (G.track) G.track('chess'); return render(G); }
    if (a === 'open') { G.view = b.dataset.g; G.msg = ''; G.sel = -1; G.fmode = false; G.fin = null; const c = S[G.view].cur; const live = c && !(G.view === 'sdk' ? c.done : G.view === 'g48' ? X.g48Over(c.b) : G.view === 'mem' ? c.fin : G.view === 'mine' ? c.st !== 'play' : c.done);
      G.pick = false; if (!live) { if (G.view === 'g48' || G.view === 'ws') return newGame(G, 'random'); G.pick = true; } if (G.track) G.track(G.view); return render(G); }
    if (a === 'new') { if (G.view === 'g48' || G.view === 'ws') return newGame(G, 'random'); G.pick = true; return render(G); }
    if (a === 'start') return newGame(G, b.dataset.v);
    if (a === 'wsday') return newGame(G, 'daily');
    if (G.view === 'sdk') {
      const c = S.sdk.cur;
      if (a === 'cell') { G.sel = +b.dataset.i; return render(G); }
      if (a === 'mist') { S.sdk.mist = !S.sdk.mist; save(G); return render(G); }
      if (a === 'notes') { G.notes = !G.notes; return render(G); }
      if (a === 'copy') { const txt = '953 Sudoku ' + (c.daily ? 'daily ' + c.daily : c.lvl) + ' · ' + fmt(c.t) + (c.hints ? ' (with ' + c.hints + ' hint' + (c.hints > 1 ? 's' : '') + ')' : ''); try { navigator.clipboard.writeText(txt).then(() => { b.textContent = 'Copied'; }, () => { b.textContent = txt; }); } catch (x) { b.textContent = txt; } return; }
      if (a === 'num') { if (G.sel < 0) return; X.sdkPlace(c, G.sel, +b.dataset.d, G.notes); return afterSdk(G); }
      if (a === 'erase') { if (G.sel >= 0) X.sdkErase(c, G.sel); return afterSdk(G); }
      if (a === 'undo') { X.sdkUndo(c); return afterSdk(G); }
      if (a === 'hint') { if (G.sel >= 0) X.sdkHint(c, G.sel); return afterSdk(G); }
    } else if (G.view === 'g48') {
      if (a === 'mv') return move48(G, b.dataset.d);
      if (a === 'undo') { X.g48Undo(S.g48.cur); save(G); return render(G); }
    } else if (G.view === 'mem') { if (a === 'card') return flip(G, +b.dataset.i); }
    else if (G.view === 'mine') {
      if (a === 'fmode') { G.fmode = !G.fmode; return render(G); }
      if (a === 'ms') { const i = +b.dataset.i; const c = S.mine.cur; if (G.fmode && !c.rev[i]) return flagMs(G, i); return revealMs(G, i); }
    }
  }

  // ===== v17.5 lane B: Leaderboard and challenges screen (mountBoard). The app passes rpc(name, args) -> Promise; nothing here talks to the database itself. =====
  const GAME_LABEL = { chess: 'Chess', g48: '2048', sdk_easy: 'Sudoku (easy)', sdk_medium: 'Sudoku (medium)', sdk_hard: 'Sudoku (hard)', mine_s: 'Minesweeper (small)', mine_m: 'Minesweeper (medium)', mine_l: 'Minesweeper (large)', mem_s: 'Memory match (small)', mem_m: 'Memory match (medium)', mem_l: 'Memory match (large)', ws: 'Word search' };
  const BOARD_GAMES = ['g48', 'sdk_easy', 'sdk_medium', 'sdk_hard', 'mine_s', 'mine_m', 'mine_l', 'mem_s', 'mem_m', 'mem_l', 'ws'];
  const CHESS_TIMES = [[503, '5+3', 300, 3], [1005, '10+5', 600, 5], [1510, '15+10', 900, 10]];
  const scoreText = (g, v) => g === 'g48' ? v + ' points' : /^mem_/.test(g) ? v + ' moves' : fmt(v);
  const clockText = t => Math.floor(t / 100) + '+' + (t % 100);
  const BOARD_CSS = `.gm-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.gm-tabs .gm-btn{padding:0 2px;font-size:13px}
.gm-rows{background:#fff;border-radius:16px;padding:2px 14px;box-shadow:0 1px 0 rgba(21,35,58,.08)}.gm-rows>div{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 0;border-bottom:1px solid rgba(21,35,58,.07);font-size:14px}.gm-rows>div:last-child{border-bottom:0}
.gm-rows .n{width:22px;font-weight:700;opacity:.55;text-align:right}.gm-rows .t{flex:1;min-width:0}.gm-rows .v{font-weight:700;font-variant-numeric:tabular-nums}.gm-rows .me{background:rgba(193,154,75,.16);margin:0 -14px;padding-left:14px;padding-right:14px}
.gm-chal{background:#fff;border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 1px 0 rgba(21,35,58,.08);font-size:14px}.gm-chal .r{display:flex;gap:8px;flex-wrap:wrap}.gm-chal .r>*{flex:1 1 auto}
.gm-chal select,.gm-sel{border:1px solid rgba(21,35,58,.15);border-radius:11px;padding:11px;font-size:15px;background:#fff;color:#15233a;min-height:44px;width:100%;box-sizing:border-box}
a.gm-btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;box-sizing:border-box}`;
  let binst = null;
  function unmountBoard() {
    if (!binst) return; const B = binst; binst = null; B.dead = true;
    B.host.removeEventListener('click', B.onClick); B.host.removeEventListener('change', B.onChange); try { B.host.innerHTML = ''; } catch (e) { /* host already gone */ }
  }
  function mountBoard(host, opts) {
    unmountBoard(); opts = opts || {};
    if (!document.getElementById('gm-css')) { const st = document.createElement('style'); st.id = 'gm-css'; st.textContent = CSS; document.head.appendChild(st); }
    if (!document.getElementById('gm-bcss')) { const st = document.createElement('style'); st.id = 'gm-bcss'; st.textContent = BOARD_CSS; document.head.appendChild(st); }
    const pre = opts.pre && opts.pre.key && opts.pre.key !== 'chess' && opts.pre.value ? opts.pre : null;
    const B = { host, rpc: opts.rpc, flash: opts.flash || (() => {}), tab: opts.tab || 'chal', data: {}, msg: '', busy: false, pre, dead: false, form: { opp: '', game: pre ? pre.key : '503' }, link: null };
    binst = B;
    host.addEventListener('click', B.onClick = e => bClick(B, e));
    host.addEventListener('change', B.onChange = e => { const t = e.target; if (t && t.dataset && t.dataset.f) B.form[t.dataset.f] = t.value; if (t && t.dataset && t.dataset.f === 'bgame') { B.bgame = t.value; bRender(B); } });
    bLoad(B);
  }
  const bErr = e => { const m = String(e && e.message || ''); return m && !/^HTTP \d+|Failed to fetch|NetworkError/i.test(m) ? m : 'Could not reach the server. Check your internet and try again.'; };
  async function bLoad(B) {
    const tab = B.tab; B.busy = true; bRender(B);
    try {
      if (tab === 'steps') { const [rows, on] = await Promise.all([B.rpc('board_steps', {}), B.rpc('my_board_prefs', {})]); B.data.steps = rows || []; B.data.stepsOn = on === true; }
      else if (tab === 'games') B.data.games = (await B.rpc('board_games', {})) || [];
      else if (tab === 'chess') B.data.chess = (await B.rpc('board_chess', {})) || [];
      else { const [mine, roster] = await Promise.all([B.rpc('my_challenges', {}), B.rpc('challenge_roster', {})]); B.data.mine = mine || []; B.data.roster = roster || []; }
    } catch (e) { B.msg = bErr(e); }
    if (B.dead) return; B.busy = false; bRender(B);
  }
  function bRender(B) {
    if (B.dead) return;
    const T = [['chal', 'Challenges'], ['steps', 'Steps'], ['games', 'Games'], ['chess', 'Chess']];
    let h = '<div class="gm"><div class="gm-tabs" role="tablist" aria-label="Leaderboard sections">' + T.map(([k, l]) => '<button class="gm-btn' + (B.tab === k ? ' pri' : '') + '" role="tab" aria-selected="' + (B.tab === k) + '" data-b="tab" data-t="' + k + '">' + l + '</button>').join('') + '</div>';
    h += '<div class="gm-note" role="status" aria-live="polite">' + (B.busy ? 'Loading...' : esc(B.msg)) + '</div>';
    if (B.link) h += '<div class="gm-win"><div>' + esc(B.link.text) + '</div><a class="gm-btn" href="' + esc(B.link.url) + '" target="_blank" rel="noopener">' + esc(B.link.label) + '</a></div>';
    const D = B.data;
    if (B.tab === 'steps' && D.steps) {
      h += '<button class="gm-btn' + (D.stepsOn ? ' pri' : '') + '" data-b="stepsToggle" aria-pressed="' + D.stepsOn + '">Show my steps on the house board: ' + (D.stepsOn ? 'on' : 'off') + '</button>';
      h += '<div class="gm-note">' + (D.stepsOn ? 'Housemates see your name and your steps this week. Turn it off and your steps are deleted from the board.' : 'Off by default. Turn it on and housemates see your name and your steps this week. Nothing else.') + '</div>';
      h += D.steps.length ? '<div class="gm-rows" aria-label="Steps this week">' + D.steps.map((r, i) => '<div' + (r.me ? ' class="me"' : '') + '><span class="n">' + (i + 1) + '</span><span class="t">' + esc(r.name) + (r.me ? ' (you)' : '') + '</span><span class="v">' + Number(r.steps).toLocaleString() + '</span></div>').join('') + '</div>' : '<div class="gm-note">No one has shared steps this week yet.</div>';
    } else if (B.tab === 'games' && D.games) {
      const g = B.bgame || 'g48', rows = D.games.filter(r => r.game === g);
      h += '<select class="gm-sel" data-f="bgame" aria-label="Game">' + BOARD_GAMES.map(k => '<option value="' + k + '"' + (k === g ? ' selected' : '') + '>' + GAME_LABEL[k] + '</option>').join('') + '</select>';
      h += rows.length ? '<div class="gm-rows" aria-label="Best this month">' + rows.map((r, i) => '<div' + (r.me ? ' class="me"' : '') + '><span class="n">' + (i + 1) + '</span><span class="t">' + esc(r.name) + (r.me ? ' (you)' : '') + '</span><span class="v">' + scoreText(g, r.best) + '</span></div>').join('') + '</div><div class="gm-note">Best this month. Finish a game while signed in to appear here.</div>' : '<div class="gm-note">No scores this month for this game yet.</div>';
    } else if (B.tab === 'chess' && D.chess) {
      h += D.chess.length ? '<div class="gm-rows" aria-label="Chess results"><div><span class="n"></span><span class="t"><b>Player</b></span><span class="v">W-D-L</span></div>' + D.chess.map((r, i) => '<div' + (r.me ? ' class="me"' : '') + '><span class="n">' + (i + 1) + '</span><span class="t">' + esc(r.name) + (r.me ? ' (you)' : '') + '</span><span class="v">' + r.wins + '-' + r.draws + '-' + r.losses + '</span></div>').join('') + '</div><div class="gm-note">Counts finished chess challenges between housemates.</div>' : '<div class="gm-note">No finished chess challenges yet. Challenge a housemate!</div>';
    } else if (B.tab === 'chal' && D.mine) h += challengeHtml(B);
    h += '</div>';
    B.host.innerHTML = h;
  }
  function challengeHtml(B) {
    const D = B.data, f = B.form; let h = '';
    const open = D.mine.filter(c => c.status === 'open'), done = D.mine.filter(c => c.status === 'done').slice(0, 10);
    h += '<div class="gm-chal"><b>Challenge a housemate</b>';
    if (!D.roster.length) h += '<div class="gm-note">No housemates with the app to challenge yet.</div>';
    else {
      h += '<select data-f="opp" aria-label="Housemate"><option value="">Choose a housemate</option>' + D.roster.map(r => '<option value="' + r.id + '"' + (String(r.id) === String(f.opp) ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('') + '</select>';
      h += '<select data-f="game" aria-label="Game">' + (B.pre ? '<option value="' + esc(B.pre.key) + '"' + (f.game === B.pre.key ? ' selected' : '') + '>' + esc(GAME_LABEL[B.pre.key] || B.pre.key) + ': beat ' + scoreText(B.pre.key, B.pre.value) + '</option>' : '') +
        CHESS_TIMES.map(t => '<option value="' + t[0] + '"' + (String(t[0]) === String(f.game) ? ' selected' : '') + '>Chess on Lichess, ' + t[1] + '</option>').join('') + '</select>';
      h += '<button class="gm-btn pri" data-b="send"' + (B.busy ? ' disabled' : '') + '>Send challenge</button>';
      h += '<div class="gm-note">Chess games are played on Lichess (a free chess site). You play White. Score challenges finish when your housemate finishes the same game.</div>';
    }
    h += '</div>';
    if (open.length) h += '<div class="gm-chal"><b>Open challenges</b>' + open.map(c => {
      const chess = c.game === 'chess', what = chess ? 'chess (' + clockText(c.target) + ')' : esc(GAME_LABEL[c.game] || c.game);
      return '<div style="border-top:1px solid rgba(21,35,58,.07);padding-top:8px"><div>' + (c.i_sent ? 'You challenged <b>' + esc(c.other_name) + '</b> to ' + what : '<b>' + esc(c.other_name) + '</b> challenged you to ' + what) + (chess ? '' : ': ' + (c.i_sent ? 'your score ' : 'beat ') + scoreText(c.game, c.target)) + '</div><div class="r">' +
        (chess ? '<a class="gm-btn pri" href="' + esc(c.play_url) + '" target="_blank" rel="noopener">' + (c.i_sent ? 'Open my game' : 'Play now') + '</a><button class="gm-btn" data-b="check" data-id="' + c.id + '" data-lid="' + esc(c.lichess_id) + '">Check the result</button>' : '<span class="gm-note" style="flex:2;align-self:center;text-align:left">' + (c.i_sent ? 'Waiting for them to finish the same game.' : 'Your next finished game of this kind settles it.') + '</span>') +
        '<button class="gm-btn" data-b="cancel" data-id="' + c.id + '">' + (c.i_sent ? 'Cancel' : 'Decline') + '</button></div></div>';
    }).join('') + '</div>';
    if (done.length) h += '<div class="gm-chal"><b>Finished</b>' + done.map(c => '<div>' + (c.result === 'won' ? 'You won' : c.result === 'lost' ? 'You lost' : 'Draw') + ' against ' + esc(c.other_name) + ' in ' + esc(GAME_LABEL[c.game] || c.game) + '</div>').join('') + '</div>';
    return h;
  }
  async function bClick(B, e) {
    const b = e.target.closest && e.target.closest('[data-b]'); if (!b || B.dead) return; const a = b.dataset.b;
    if (a === 'tab') { B.tab = b.dataset.t; B.link = null; B.msg = ''; return bLoad(B); }
    if (B.busy) return;
    const run = async fn => { B.busy = true; B.msg = ''; bRender(B); try { await fn(); } catch (x) { B.msg = bErr(x); B.busy = false; if (!B.dead) bRender(B); return; } B.busy = false; if (B.dead) return; await bLoad(B); };
    if (a === 'stepsToggle') return run(async () => { await B.rpc('board_set_steps', { p_on: !B.data.stepsOn }); });
    if (a === 'cancel') return run(async () => { await B.rpc('challenge_cancel', { p_id: +b.dataset.id }); B.link = null; B.flash('Done.'); });
    if (a === 'check') return run(async () => {
      let r; try { r = await fetch('https://lichess.org/game/export/' + encodeURIComponent(b.dataset.lid), { headers: { Accept: 'application/json' } }); } catch (x) { throw new Error('Could not reach Lichess. Check your internet and try again.'); }
      if (r.status === 404) throw new Error('The game has not started yet.');
      if (!r.ok) throw new Error('Lichess did not answer. Try again in a minute.');
      const j = await r.json();
      if (j.status === 'created' || j.status === 'started') throw new Error('The game is not finished yet.');
      const res = await B.rpc('challenge_settle', { p_id: +b.dataset.id, p_status: j.status || null, p_winner: j.winner || null });
      B.link = null; B.msg = res === 'won' ? 'You won! Well played.' : res === 'lost' ? 'You lost this one.' : res === 'draw' ? 'It was a draw.' : res === 'expired' ? 'This challenge ran out of time.' : 'The game was cancelled.'; B.flash(B.msg);
    });
    if (a === 'send') return run(async () => {
      const f = B.form, opp = +f.opp; if (!opp) throw new Error('Choose a housemate first.');
      const chess = CHESS_TIMES.find(t => String(t[0]) === String(f.game));
      if (!chess) { await B.rpc('challenge_create', { p_opponent: opp, p_game: B.pre.key, p_lichess_id: null, p_url_white: null, p_url_black: null, p_target: B.pre.value }); B.flash('Challenge sent.'); B.pre = null; f.game = '503'; return; }
      let r; try { r = await fetch('https://lichess.org/api/challenge/open', { method: 'POST', body: new URLSearchParams({ 'clock.limit': String(chess[2]), 'clock.increment': String(chess[3]), name: '953 C. Aragon', rated: 'false' }) }); } catch (x) { throw new Error('Could not reach Lichess. Check your internet and try again.'); }
      if (!r.ok) throw new Error('Lichess did not answer. Try again in a minute.');
      const j0 = await r.json(), j = j0.challenge || j0;
      await B.rpc('challenge_create', { p_opponent: opp, p_game: 'chess', p_lichess_id: j.id, p_url_white: j.urlWhite, p_url_black: j.urlBlack, p_target: chess[0] });
      B.link = { text: 'Challenge sent. You play White. Open your game now, or later from this list.', url: j.urlWhite, label: 'Open my game on Lichess' }; B.flash('Challenge sent.');
    });
  }

  root.GamesUI = { mount, unmount, mountBoard, unmountBoard };
})(typeof window !== 'undefined' ? window : globalThis);
