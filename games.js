// Offline games for the Tools tab: Block puzzle, Daily word, Snake (v18.8), Sudoku, 2048, Memory match, Minesweeper, Word search, Chess (chess.js draws the board); Solitaire and Tong-its come from cards.js (window.CardsUI). v17.5: finished games can report a score (opts.onScore) and offer a challenge (opts.onChallenge).
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

  // ---------- Block puzzle (v18.8): 8x8, three pieces at a time, full rows and columns clear ----------
  const BLK_N = 8;
  const blkShape = s => { const c = []; s.split('/').forEach((row, r) => row.split('').forEach((ch, k) => { if (ch === '#') c.push([r, k]); })); return c; };
  const BLK_SHAPES = ['#', '##', '#/#', '###', '#/#/#', '####', '#/#/#/#', '#####', '#/#/#/#/#', '##/##', '###/###', '##/##/##', '###/###/###', '##/#.', '##/.#', '#./##', '.#/##', '#../#../###', '###/#../#..', '###/..#/..#', '..#/..#/###', '##./.##', '.##/##.'].map(blkShape);
  const blkSize = si => { const s = BLK_SHAPES[si]; return { h: Math.max(...s.map(p => p[0])) + 1, w: Math.max(...s.map(p => p[1])) + 1 }; };
  const blkDeal0 = (seed, ref) => { const r = rng('blk|' + seed + '|' + ref); return [0, 1, 2].map(() => Math.floor(r() * BLK_SHAPES.length)); };
  const blkFits = (g, si, r, c) => BLK_SHAPES[si].every(([dr, dc]) => { const rr = r + dr, cc = c + dc; return rr >= 0 && cc >= 0 && rr < BLK_N && cc < BLK_N && !g[rr * BLK_N + cc]; });
  const blkAnyFits = st => st.pcs.some(si => si >= 0 && range(BLK_N * BLK_N).some(i => blkFits(st.g, si, (i / BLK_N) | 0, i % BLK_N)));
  // v18.8.1: with a board (g) the seeded deal is re-rolled (same seed, next try) up to 30 times until at least one piece fits, so a deal never ends the game on its own; an empty board keeps the first roll
  const blkDeal = (seed, ref, g) => { for (let k = 0; k < 30; k++) { const d = blkDeal0(seed, k ? ref + '~' + k : ref); if (!g || d.some(si => range(BLK_N * BLK_N).some(i => blkFits(g, si, (i / BLK_N) | 0, i % BLK_N)))) return d; } return blkDeal0(seed, ref); };
  const blkClearing = (g, si, r, c) => { // board squares a legal drop would clear (full rows and columns), for the fade
    const t = g.slice(); BLK_SHAPES[si].forEach(([dr, dc]) => { t[(r + dr) * BLK_N + c + dc] = 1; });
    const rows = range(BLK_N).filter(y => range(BLK_N).every(x => t[y * BLK_N + x])), cols = range(BLK_N).filter(x => range(BLK_N).every(y => t[y * BLK_N + x]));
    return range(BLK_N * BLK_N).filter(i => rows.includes((i / BLK_N) | 0) || cols.includes(i % BLK_N));
  };
  const blkNew = seed => ({ g: Array(BLK_N * BLK_N).fill(0), pcs: blkDeal(seed, 0), sc: 0, seed: String(seed), ref: 0, over: false });
  function blkPlace(st, pi, r, c) { // null when illegal, else {gained, lines}
    const si = st.pcs[pi]; if (st.over || !isInt(pi, 0, 2) || si < 0 || !blkFits(st.g, si, r, c)) return null;
    for (const [dr, dc] of BLK_SHAPES[si]) st.g[(r + dr) * BLK_N + c + dc] = 1;
    const rows = range(BLK_N).filter(y => range(BLK_N).every(x => st.g[y * BLK_N + x])), cols = range(BLK_N).filter(x => range(BLK_N).every(y => st.g[y * BLK_N + x]));
    rows.forEach(y => range(BLK_N).forEach(x => { st.g[y * BLK_N + x] = 0; })); cols.forEach(x => range(BLK_N).forEach(y => { st.g[y * BLK_N + x] = 0; }));
    const lines = rows.length + cols.length, gained = BLK_SHAPES[si].length + 10 * lines * lines;
    st.sc += gained; st.pcs[pi] = -1;
    if (st.pcs.every(v => v < 0)) { st.ref++; st.pcs = blkDeal(st.seed, st.ref, st.g); }
    st.over = !blkAnyFits(st);
    return { gained, lines };
  }

  // ---------- Daily word (v18.8): 5 letters, 6 tries, one answer per Manila day for the whole house ----------
  // shortcut: the lists below are hand-picked common words (answers) plus extra valid guesses; changing the answer list in any way (adding, removing or reordering) changes the daily word for most days, so edit it only in a release and accept that shift.
    const WD_ANS = [
    'about above actor adapt admit adult after again agent agree ahead alarm album alert',
    'alike alive allow alone along alter among angel anger angle angry ankle apart apple',
    'apply arena argue arise armor aside asset avoid awake award aware basic beach beard',
    'beast begin being below bench bible birth black blade blame blank blast blaze bleed',
    'blend bless blind block blood bloom board boast bonus boost booth bound brain brake',
    'brand brave bread break breed brick bride brief bring broad broke brown brush build',
    'bunch burst buyer cabin cable camel candy canoe carry carve catch cause chain chair',
    'chalk charm chart chase cheap check cheek cheer chess chest chief child chill chose',
    'civil claim class clean clear clerk click cliff climb clock close cloth cloud coach',
    'coast color couch could count court cover crack craft crane crash crazy cream crime',
    'crisp cross crowd crown cruel crush curve cycle daily dairy dance death debut delay',
    'depth diary dirty dodge doubt dough dozen draft drain drama drawn dream dress dried',
    'drift drill drink drive drown dying eager early earth eight elbow elder elect empty',
    'enemy enjoy enter equal error essay event every exact exist extra faint fairy faith',
    'false fancy fault feast fence fever fiber field fifth fifty fight final first flame',
    'flash fleet flesh float flood floor flour fluid focus force forge forth forty forum',
    'found frame fresh front frost fruit fully funny ghost giant given glass globe glory',
    'glove grace grade grain grand grant grape graph grasp grass grave great green greet',
    'grief grill grind gross group grown guard guess guest guide habit happy harsh heart',
    'heavy hello hence honey honor horse hotel house human humor hurry ideal image imply',
    'index inner input irony issue ivory jelly jewel joint judge juice jumbo knife knock',
    'known label labor large laser later laugh layer learn lease least leave legal lemon',
    'level light limit linen liver lobby local logic loose lover lower loyal lucky lunch',
    'magic major maker march match maybe mayor meant medal media merit metal meter might',
    'minor minus mixed model money month moral motor mount mouse mouth movie music naive',
    'nerve never newly night noble noise north novel nurse ocean offer often olive onion',
    'opera orbit order other ought outer owner paint panel paper party pasta patch pause',
    'peace pearl phase phone photo piano piece pilot pitch pizza place plain plane plant',
    'plate plaza point polar porch pound power press price pride prime print prior prize',
    'proof proud prove pulse punch pupil queen query quick quiet quite quote radio raise',
    'range rapid ratio reach react ready realm rebel refer relax reply rider ridge rifle',
    'right rigid rinse river roast robot rocky rough round route royal rural salad sauce',
    'scale scene scope score scout screw sense serve seven shade shake shall shame shape',
    'share sharp sheep sheet shelf shell shift shine shiny shirt shock shoot shore short',
    'shout shrug sight silly since sixth sixty skill skirt sleep slice slide slope small',
    'smart smell smile smoke snack snake solid solve sorry sound south space spare speak',
    'speed spell spend spice spine split spoil spoon sport spray squad stack staff stage',
    'stair stake stamp stand stare start state steak steal steam steel steep stick stiff',
    'still stock stone stood store storm story stove strap straw strip study stuff style',
    'sugar suite sunny super sweet swept swift swing sword table taste teach tenth thank',
    'theme there thick thing think third those three threw throw thumb tiger tight timer',
    'title toast today token tooth topic total touch tough towel tower trace track trade',
    'trail train trash treat trend trial tribe trick troop truck truly trunk trust truth',
    'twice twist ultra uncle under union unite unity until upper upset urban usage usual',
    'valid value video virus visit vital vivid vocal voice voter wagon waist waste watch',
    'water weigh weird whale wheat wheel where which while white whole whose widow width',
    'woman world worry worse worth would wound wrist write wrong yield young youth zebra'
  ].join(' ').split(' ');
  // v18.8.1: valid guesses only (never daily answers); the answer list above stays byte for byte as it was, so no day's word moves (ENABLE word list, public domain; slurs removed)
  const WD_EXTRA = [
    'aahed aalii aargh abaca abaci aback abaft abaka abamp abase abash abate abbas abbes',
    'abbey abbot abeam abele abets abhor abide abler ables abmho abode abohm aboil aboma',
    'aboon abort abris abuse abuts abuzz abyes abysm abyss acari acerb aceta ached aches',
    'achoo acids acidy acing acini ackee acmes acmic acned acnes acock acold acorn acred',
    'acres acrid acted actin acute acyls adage addax added adder addle adeem adept adieu',
    'adios adits adman admen admix adobe adobo adopt adore adorn adown adoze adunc adust',
    'adyta adzes aecia aedes aegis aeons aerie afars affix afire afoot afore afoul afrit',
    'agama agape agars agate agave agaze agene agers agger aggie aggro aghas agile aging',
    'agios agism agist aglee aglet agley aglow agmas agone agons agony agora agria agues',
    'ahold ahull aided aider aides ailed aimed aimer aioli aired airer airns airth airts',
    'aisle aitch aiver ajiva ajuga akees akela akene alack alamo aland alane alang alans',
    'alant alary alate albas alcid alder aldol alecs alefs aleph alfas algae algal algas',
    'algid algin algor algum alias alibi alien alifs align aline alist aliya alkyd alkyl',
    'allay allee alley allod allot alloy allyl almah almas almeh almes almud almug aloes',
    'aloft aloha aloin aloof aloud alpha altar altho altos alula alums alway amahs amain',
    'amass amaze amber ambit amble ambos ambry ameba ameer amend amens ament amias amice',
    'amici amide amido amids amies amiga amigo amine amino amins amirs amiss amity ammos',
    'amnia amnic amoks amole amort amour ample amply ampul amuck amuse amyls ancon anear',
    'anele anent angas angst anile anils anima anime animi anion anise ankhs ankus anlas',
    'annal annas annex annoy annul anoas anode anole anomy ansae antae antas anted antes',
    'antic antis antra antre antsy anvil aorta apace apeak apeek apers apery aphid aphis',
    'apian aping apish apnea apods aport appal appel apres apron apses apsis apter aptly',
    'aquae aquas araks arbor arced arcus ardeb ardor areae areal areas areca areic arete',
    'argal argil argle argol argon argot argus arhat arias arils arles armed armer',
    'armet aroid aroma arose arpen arras array arris arrow arses arsis arson artal artel',
    'artsy arums arval arvos aryls asana ascot ascus asdic ashed ashen ashes asked asker',
    'askew askoi askos aspen asper aspic aspis assai assay asses aster astir asyla ataps',
    'ataxy atilt atlas atman atmas atoll atoms atomy atone atony atopy atria atrip attar',
    'attic audad audio audit auger aught augur aulic aunts aunty aurae aural aurar auras',
    'aurei aures auric auris aurum autos auxin avail avant avast avens avers avert avgas',
    'avian avion aviso avows await awash awful awing awned awoke awols axels axial axile',
    'axils axing axiom axion axite axled axles axman axmen axone axons ayahs ayins azans',
    'azide azido azine azlon azoic azole azons azote azoth azure baaed baals babas babel',
    'babes babka baboo babul babus bacca backs bacon baddy badge badly baffs baffy bagel',
    'baggy bahts bails bairn baith baits baiza baize baked baker bakes balas balds baldy',
    'baled baler bales balks balky balls bally balms balmy balsa banal banco bands bandy',
    'baned banes bangs banjo banks banns banty barbe barbs barde bards bared barer bares',
    'barfs barge baric barks barky barms barmy barns barny baron barre barye basal based',
    'baser bases basil basin basis basks bassi basso bassy baste basts batch bated bates',
    'bathe baths batik baton batts battu batty bauds baulk bawds bawdy bawls bawty bayed',
    'bayou bazar bazoo beads beady beaks beaky beams beamy beano beans bears beats beaus',
    'beaut beaux bebop becap becks bedel bedew bedim beech beefs beefy beeps beers beery',
    'beets befit befog began begat beget begot begum begun beige beigy belay belch',
    'belie belle bells belly belts bemas bemix bends bendy benes benne benni benny bents',
    'beret bergs berme berms berry berth beryl beset besom besot bests betas betel beths',
    'beton betta bevel bevor bewig bezel bezil bhang bhoot bhuts biali bialy bibbs bices',
    'biddy bided bider bides bidet bield biers biffs biffy bifid bight bigly bigot bijou',
    'biked biker bikes bikie bilbo biles bilge bilgy bilks bills billy bimah bimas bimbo',
    'binal bindi binds bines binge bingo binit bints biome biont biota biped bipod birch',
    'birds birks birle birls birrs birse bises bisks bison biter bites bitsy bitts',
    'bitty bizes blabs blahs blain blams bland blare blase blate blats blawn blaws bleak',
    'blear bleat blebs bleep blent blest blets blimp blimy blini blink blips bliss blite',
    'blitz bloat blobs blocs bloke blond bloop blots blown blows blowy blubs blued bluer',
    'blues bluet bluey bluff blume blunt blurb blurs blurt blush blype boars boart boats',
    'bobby bocce bocci boche bocks boded bodes boffo boffs bogan bogey boggy bogie bogle',
    'bogus bohea boils boing boite bolar bolas bolds boles bolls bolos bolts bolus bombe',
    'bombs bonds boned boner bones boney bongo bongs bonks bonne bonny bonze boobs booby',
    'booed boogy books booms boomy boons boors boots booty booze boozy boral boras borax',
    'bored borer bores boric borne boron borts borty bortz bosks bosky bosom boson bossy',
    'bosun botas botch botel bothy botts bough boule bourg bourn bouse bousy bouts bovid',
    'bowed bowel bower bowls bowse boxed boxer boxes boyar boyla boyos bozos brace brach',
    'bract brads braes brags braid brail braky brank brans brant brash brass brats brava',
    'bravi bravo brawl brawn braws braxy brays braza braze bream brede brees brens brent',
    'breve brews briar bribe brier bries brigs brill brims brine brink brins briny brios',
    'brisk brits britt brock broil brome bromo bronc brood brook broom broos brose brosy',
    'broth brows brugh bruin bruit brume brunt brusk brute bubal bubby bucko bucks buddy',
    'budge buffi buffo buffs buffy buggy bugle buhls buhrs built bulbs bulge bulgy bulks',
    'bulky bulla bulls bully bumfs bumph bumps bumpy bunco bunds bundt bungs bunko bunks',
    'bunns bunny bunts bunya buoys buran buras burbs burds buret burgh burgs burin burke',
    'burls burly burns burnt burps burro burrs burry bursa burse busby bused buses bushy',
    'busks busts busty butch buteo butle butte butts butty butut butyl buxom bwana bylaw',
    'byres byrls byssi bytes byway cabal cabby caber cabob cacao cacas cache cacti caddy',
    'cades cadet cadge cadgy cadis cadre caeca cafes caffs caged cager cages cagey cahow',
    'caids cains caird cairn cajon caked cakes cakey calfs calif calix calks calla calls',
    'calms calve calyx camas cameo cames campi campo camps campy canal caned caner canes',
    'canid canna canny canon canso canst canto cants canty caped caper capes caphs capon',
    'capos caput carat carbo carbs cards cared carer cares caret carex cargo carks carle',
    'carls carns carny carob carol carom carpi carps carrs carse carte carts casas cased',
    'cases casks casky caste casts casus cater cates catty cauld caulk cauls caved caver',
    'caves cavie cavil cawed cease cebid cecal cecum cedar ceded ceder cedes cedis ceiba',
    'ceils celeb cella celli cello cells celom celts cense cento cents ceorl cepes cerci',
    'cered ceres ceria ceric ceros cesta cesti cetes chads chafe chaff champ chams chang',
    'chant chaos chape chaps chapt chard chare chark charr chars chary chasm chats chaws',
    'chays cheat cheep chefs chela chemo chert cheth chevy chews chewy chiao chias chick',
    'chico chics chide chiel chile chili chimb chime chimp china chine chino chins chips',
    'chirk chirm chiro chirp chirr chits chive chivy chock choir choke choky cholo chomp',
    'chook chops chord chore chott chows chubs chuck chufa chuff chugs chump chums chunk',
    'churl churn churr chute chyle chyme cibol cider cigar cilia cimex cinch cines cions',
    'circa cires cirri cisco cissy cists cited citer cites civet civic civie civvy clach',
    'clack clade clads clags clamp clams clang clank clans claps clapt claro clary clash',
    'clasp clast clave clavi claws clays cleat cleek clefs cleft clepe clept clews clift',
    'clime cline cling clink clips clipt cloak clods clogs clomb clomp clone clonk clons',
    'cloot clops clots clour clout clove clown cloys cloze clubs cluck clued clues clump',
    'clung clunk coact coala coals coaly coapt coati coats cobbs cobby cobia coble cobra',
    'cocas cocci cocks cocky cocoa cocos codas codec coded coden coder codes codex codon',
    'coeds coffs cogon cohog cohos coifs coign coils coins coirs coked cokes colas colds',
    'coled coles colic colin colly colog colon colts colza comae comal comas combe combo',
    'combs comer comes comet comfy comic comix comma commy compo comps compt comte conch',
    'condo coned cones coney conga conge congo conic conin conks conky conns conte conto',
    'conus cooch cooed cooee cooer cooey coofs cooks cooky cools cooly coomb coops coopt',
    'coots copal coped copen coper copes copra copse coral corby cords cored corer cores',
    'corgi coria corks corky corms corns cornu corny corps corse cosec coses coset cosey',
    'cosie costa costs cotan coted cotes cotta coude cough coupe coups couth coved coven',
    'coves covet covey covin cowed cower cowls cowry coxae coxal coxed coxes coyed coyer',
    'coyly coypu cozen cozes cozey cozie craal crabs crags crake cramp crams crank crape',
    'craps crass crate crave crawl craws craze creak credo creed creek creel creep creme',
    'crepe crept crepy cress crest crews cribs crick cried crier cries crimp cripe croak',
    'croci crock crocs croft crone crony crook croon crops crore croup crows croze cruck',
    'crude cruds cruet crumb crump cruor crura cruse crust crwth crypt cubby cubeb cubed',
    'cuber cubes cubic cubit cuddy cuffs cuifs cuing cuish cukes culch culet culex culls',
    'cully culms culpa culti cults cumin cupel cupid cuppa cuppy curbs curch curds',
    'curdy cured curer cures curet curfs curia curie curio curls curly curns currs curry',
    'curse curst curvy cusec cushy cusks cusps cusso cutch cuter cutes cutey cutie cutin',
    'cutis cutty cutup cyano cyans cycad cycas cyclo cyder cylix cymae cymar cymas cymes',
    'cymol cynic cysts cyton czars daces dacha dadas daddy dados daffs daffy dagga',
    'dahls daisy dales dally daman damar dames damns damps dandy dangs danio darbs dared',
    'darer dares daric darns darts dashi dashy dated dater dates datos datto datum daube',
    'daubs dauby daunt dauts daven davit dawed dawen dawks dawns dawts dazed dazes deads',
    'deair deals dealt deans dears deary deash deave debar debit debts debug debye decaf',
    'decal decay decks decor decos decoy decry dedal deeds deedy deems deeps deers deets',
    'defat defer defis defog degas degum deice deify deign deils deism deist deity deked',
    'dekes dekko deled deles delfs delft delis dells delly delta delve demes demit demob',
    'demon demos demur denes denim dense dents deoxy depot derat deray derby derma derms',
    'derry desex desks deter detox deuce devas devel devil devon dewan dewar dewax dewed',
    'dexes dexie dhaks dhals dhobi dhole dhoti dhows dhuti dials diazo diced dicer dices',
    'dicey dicky dicot dicta dicty didie didos didst diene diets dight digit diked',
    'diker dikes dikey dills dilly dimer dimes dimly dinar dined diner dines dinge',
    'dingo dings dingy dinks dinky dints diode diols dippy dipso direr dirge dirks dirls',
    'dirts disci disco discs dishy disks disme ditas ditch dites ditsy ditto ditty ditzy',
    'divan divas dived diver dives divot divvy diwan dixit dizen dizzy djinn djins doats',
    'dobby dobie dobla dobra docks dodgy dodos doers doest doeth doffs doges dogey doggo',
    'doggy dogie dogma doily doing doits dojos dolce dolci doled doles dolls dolly dolma',
    'dolor dolts domal domed domes domic donas donee donga dongs donna donne donor donsy',
    'donut dooly dooms doomy doors doozy dopas doped doper dopes dopey dorks dorky dorms',
    'dormy dorps dorrs dorsa dorty dosed doser doses dotal doted doter dotes dotty douce',
    'douma doums doura douse doven doves dowdy dowed dowel dower dowie downs downy dowry',
    'dowse doxie doyen doyly dozed dozer dozes drabs draff drags drail drake drams drank',
    'drape drats drave drawl draws drays dread drear dreck dreed drees dregs dreks drest',
    'dribs drier dries drily drips dript droit droll drone drool droop drops dropt dross',
    'drouk drove drubs drugs druid drums drunk drupe druse dryad dryer dryly duads duals',
    'ducal ducat duces duchy ducks ducky ducts duddy duded dudes duels duets duffs duits',
    'duked dukes dulia dulls dully dulse dumas dumbs dumka dumky dummy dumps dumpy dunam',
    'dunce dunch dunes dungs dungy dunks dunts duomi duomo duped duper dupes duple dural',
    'duras dured dures durns duroc duros durra durrs durst durum dusks dusky dusts dusty',
    'dutch duvet dwarf dweeb dwell dwelt dwine dyads dyers dyked dynel dynes eagle eagre',
    'eared earls earns eased easel eases easts eaten eater eaved eaves ebbed ebbet ebons',
    'ebony eched eches echos eclat ecrus edema edged edger edges edict edify edile edits',
    'educe educt eerie egads egers egest eggar egged egger egret eider eidos eikon eject',
    'eking elain eland elans elate elegy elemi elfin elide elint elite eloin elope elude',
    'elute elver elves embar embay embed ember embow emcee emeer emend emery emeus emirs',
    'emits emmer emmet emote emyde emyds enact enate ended ender endow endue enema ennui',
    'enoki enols enorm enows enrol ensky ensue entia entry enure envoi envoy enzym eosin',
    'epact epees ephah ephas ephod ephor epics epoch epode epoxy equid equip erase erect',
    'ergot erica ernes erode erose erred erses eruct erugo erupt ervil escar escot eskar',
    'esker esses ester estop etape ether ethic ethos ethyl etnas etude etuis etwee etyma',
    'euros evade evens evert evict evils evite evoke ewers exalt exams excel execs exert',
    'exile exine exits exons expat expel expos extol exude exult exurb eyers eying eyras',
    'eyres eyrie eyrir fable faced facer faces facet facia facts faddy faded fader fades',
    'fadge fados faena faery fagin fails fairs faked faker fakes fakey fakir falls famed',
    'fames fanes fanga fangs fanny fanon fanos fanum faqir farad farce farci farcy fards',
    'fared farer fares farle farls farms faros farts fasts fatal fated fates fatly fatso',
    'fatty fatwa faugh fauld fauna fauns fauve favas faves favor favus fawns fawny faxed',
    'faxes fayed fazed fazes fears fease feats feaze fecal feces fecks feeds feels feeze',
    'feign feint feist felid fella fells felly felon felts femes femme femur fends fenny',
    'feods feoff feral feres feria ferly fermi ferns ferny ferry fesse fetal fetas fetch',
    'feted fetes fetid fetor fetus feuar feuds feued fewer feyer feyly fezes fiars fiats',
    'fibre fices fiche fichu ficin ficus fidge fidos fiefs fiend fiery fifed fifer fifes',
    'filar filch filed filer files filet fille fillo fills filly films filmy filos filth',
    'filum finch finds fined finer fines finis finks finny finos fiord fique fired firer',
    'fires firms firns firry firth fiscs fishy fists fitch fitly fiver fives fixed fixer',
    'fixes fixit fizzy fjeld fjord flabs flack flags flail flair flake flaky flams flamy',
    'flank flans flaps flare flask flats flaws flawy flaxy flays fleam fleas fleck fleer',
    'flees flews fleys flick flics flied flier flies fling flint flips flirt flite flits',
    'flock flocs floes flogs flong flops flora floss flota flout flown flows flubs flued',
    'flues fluff fluke fluky flume flump flung flunk fluor flush flute fluty fluyt flyby',
    'flyer flyte foals foams foamy focal foehn fogey foggy fogie fohns foils foins foist',
    'folds folia folio folks folky folly fonds fondu fonts foods fools foots footy foram',
    'foray forbs forby fordo fords fores forgo forks forky forme forms forte forts fossa',
    'fosse fouls fount fours fovea fowls foxed foxes foyer frags frail franc frank fraps',
    'frass frats fraud frays freak freed freer frees fremd frena frere frets friar fried',
    'frier fries frigs frill frise frisk frith frits fritt fritz frizz frock froes frogs',
    'frond frons frore frosh froth frown frows froze frugs frump fryer fubsy fucus',
    'fudge fuels fugal fuggy fugio fugle fugue fugus fujis fulls fumed fumer fumes fumet',
    'fundi funds fungi fungo funks funky furan furls furor furry furze furzy fused fusee',
    'fusel fuses fusil fussy fusty futon fuzed fuzee fuzes fuzil fuzzy fyces fykes fytte',
    'gabby gable gaddi gadid gadis gaffe gaffs gaged gager gages gaily gains gaits galah',
    'galas galax galea gales galls gally galop gamas gamay gamba gambe gambs gamed gamer',
    'games gamey gamic gamin gamma gammy gamps gamut ganef ganev gangs ganja ganof gaols',
    'gaped gaper gapes gappy garbs garni garth gases gasps gassy gasts gated gates gator',
    'gauds gaudy gauge gault gaums gaunt gaurs gauss gauze gauzy gavel gavot gawks gawky',
    'gawps gawsy gayal gayer gayly gazar gazed gazer gazes gears gecko gecks geeks geeky',
    'geese geest gelds gelee gelid gelts gemma gemmy gemot genes genet genic genie genii',
    'genip genoa genom genre genro gents genua genus geode geoid gerah germs germy gesso',
    'geste gests getas getup geums ghast ghats ghaut ghazi ghees ghoul ghyll gibed giber',
    'gibes giddy gifts gigas gighe gigot gigue gilds gills gilly gilts gimel gimme',
    'gimpy ginks ginny gipon gipsy girds girls girly girns giron giros girsh girth girts',
    'gismo gists giver gives gizmo glace glade glads glady glair gland glans glare glary',
    'glaze glazy gleam glean gleba glebe glede gleds gleed gleek glees gleet glens gleys',
    'glial glias glide gliff glime glims glint glitz gloam gloat globs glogg gloms gloom',
    'glops gloss glost glout glows gloze glued gluer glues gluey glugs glume gluon gluts',
    'glyph gnarl gnarr gnars gnash gnats gnawn gnaws gnome goads goals goats goban gobos',
    'godet godly goers gofer gogos going golds golem golfs golly gombo gonad gonef goner',
    'gongs gonia gonif gonof gonzo goods goody gooey goofs goofy goons goony goops goopy',
    'goose goosy goral gored gores gorge gorps gorse gorsy gouge gourd gouts gouty gowan',
    'gowds gowks gowns goxes goyim graal grabs grads graft grail grama gramp grams grana',
    'grans grapy grate gravy grays graze grebe greed greek grees grego greys gride grids',
    'griff grift grigs grime grimy grins griot gripe grips gript gripy grist grith grits',
    'groan groat grogs groin groom grope grosz grots grout grove growl grows grubs gruel',
    'grues gruff grume grump grunt guaco guano guans guars guava gucks gudes guffs guids',
    'guild guile guilt guiro guise gulag gular gulch gules gulfs gulfy gulls gully gulps',
    'gulpy gumbo gumma gummy gunks gunky gunny guppy gurge gurry gursh gurus gushy gussy',
    'gusto gusts gusty gutsy gutta gutty guyed guyot gybed gybes gyral gyred gyres gyron',
    'gyros gyrus gyved gyves haafs haars habus hacek hacks hadal haded hades hadji hadst',
    'haems haets hafis hafiz hafts hahas haika haiks haiku hails hairs hairy hajes hajis',
    'hajji hakes hakim haled haler hales halid hallo halls halma halms halos halts halva',
    'halve hamal hames hammy hamza hance hands handy hangs hanks hanky hansa hanse hants',
    'haole hapax haply hards hardy hared harem hares harks harls harms harps harpy harry',
    'harts hasps haste hasty hatch hated hater hates haugh haulm hauls haunt haute haven',
    'haver haves havoc hawed hawks hawse hayed hayer hazan hazed hazel hazer hazes heads',
    'heady heals heaps heard hears heath heats heave hebes hecks heder hedge hedgy heeds',
    'heels heeze hefts hefty heigh heils heirs heist helio helix hells helms helos helot',
    'helps helve hemal hemes hemic hemin hemps hempy henna henry hents herbs herby herds',
    'heres herls herma herms herns heron heros herry hertz hests heths heuch heugh hewed',
    'hewer hexad hexed hexer hexes hexyl hicks hided hider hides highs hight hiked hiker',
    'hikes hilar hillo hills hilly hilts hilum hilus hinds hinge hinny hints hippo hippy',
    'hired hirer hires hissy hists hitch hived hives hoagy hoard hoars hoary hobby hobos',
    'hocks hocus hodad hoers hogan hoggs hoick hoise hoist hoked hokes hokey hokku hokum',
    'holds holed holes holey holks holla hollo holly holms holts homed homer homes homey',
    'honan honda honed honer hones hongs honks hooch hoods hoody hooey hoofs hooka hooks',
    'hooky hooly hoops hoots hooty hoped hoper hopes hoppy horah horal horas horde horns',
    'horny horst horsy hosed hosel hosen hoses hosta hosts hotch hotly hound houri hours',
    'hovel hover howdy howes howff howfs howks howls hoyas hoyle hubby hucks huffs huffy',
    'huger hulas hulks hulky hullo hulls humic humid humph humps humpy humus hunch hunks',
    'hunky hunts hurds hurls hurly hurst hurts husks husky hussy hutch huzza hydra hydro',
    'hyena hying hylas hymen hymns hyoid hyped hyper hypes hypha hypos hyrax hyson iambi',
    'iambs ichor icier icily icing icker icons ictic ictus ideas idiom idiot idled idler',
    'idles idols idyll idyls igloo iglus ihram ikats ikons ileac ileal ileum ileus iliac',
    'iliad ilial ilium iller imago imams imaum imbed imbue imide imido imids imine imino',
    'immix imped impel impis inane inapt inarm inbye incog incur incus indie indol indow',
    'indri indue inept inert infer infix infos infra ingle ingot inion inked inker inkle',
    'inlay inlet inned inset inter intis intro inure inurn invar iodic iodid iodin ionic',
    'iotas irade irate irids iring irked iroko irone irons isbas isled isles islet issei',
    'istle itchy items ither ivied ivies ixias ixora ixtle izars jabot jacal jacks jacky',
    'jaded jades jager jaggs jaggy jagra jails jakes jalap jalop jambe jambs jammy janes',
    'janty japan japed japer japes jarls jatos jauks jaunt jaups javas jawan jawed jazzy',
    'jeans jebel jeeps jeers jefes jehad jehus jells jemmy jenny jerid jerks jerky jerry',
    'jesse jests jetes jeton jetty jibbs jibed jiber jibes jiffs jiffy jihad jills',
    'jilts jimmy jimpy jingo jinks jinni jinns jisms jived jiver jives jivey jnana jocko',
    'jocks joeys johns joins joist joked joker jokes jokey joles jolly jolts jolty jones',
    'joram jorum jotas jotty joual jouks joule joust jowar jowed jowls jowly joyed jubas',
    'jubes judas judos jugal jugum juicy jujus juked jukes julep jumps jumpy junco junks',
    'junky junta junto jupes jupon jural jurat jurel juror justs jutes jutty kabab kabar',
    'kabob kadis kafir kagus kaiak kaifs kails kains kakas kakis kalam kales kalif kalpa',
    'kames kamik kanas kanes kanji kaons kapas kaphs kapok kappa kaput karat karma karns',
    'karoo karst karts kasha katas kauri kaury kavas kayak kayos kazoo kbars kebab kebar',
    'kebob kecks kedge keefs keeks keels keens keeps keets keeve kefir keirs kelep kelim',
    'kelly kelps kelpy kemps kempt kenaf kench kendo kenos kepis kerbs kerfs kerne kerns',
    'kerry ketch ketol kevel kevil kexes keyed khadi khafs khaki khans khaph khats kheda',
    'kheth khets khoum kiang kibbe kibbi kibei kibes kibla kicks kicky kiddo kiddy kiefs',
    'kiers kilim kills kilns kilos kilts kilty kinas kinds kines kings kinin kinks kinky',
    'kinos kiosk kirks kirns kissy kists kited kiter kites kithe kiths kitty kivas kiwis',
    'klong kloof kluge klutz knack knaps knars knaur knave knead kneed kneel knees knell',
    'knelt knish knits knobs knoll knops knosp knots knout knows knurl knurs koala koans',
    'koels kohls koine kolas kolos konks kooks kooky kopek kophs kopje koppa korai korat',
    'korun kotos kotow kraal kraft krait kreep krill krona krone kroon krubi kudos',
    'kudus kudzu kugel kukri kulak kumys kurta kurus kusso kvass kyack kyaks kyars kyats',
    'kylix kyrie kytes kythe laari labia labra laced lacer laces lacey lacks laded laden',
    'lader lades ladle laevo lagan lager lahar laich laics laigh laird lairs laith laity',
    'laked laker lakes lakhs lalls lamas lambs lamby lamed lamer lames lamia lamps lanai',
    'lance lands lanes lanky lapel lapin lapis lapse larch lards lardy laree lares largo',
    'laris larks larky larum larva lased lases lasso lasts latch lated laten latex lathe',
    'lathi laths lathy latke latte lauan lauds laura lavas laved laver laves lawed lawns',
    'lawny laxer laxly layed layup lazar lazed lazes leach leads leady leafs leafy leaks',
    'leaky leans leant leaps leapt lears leary leash leavy leben ledge ledgy leech leeks',
    'leers leery leets lefts lefty leger leges leggy legit lehrs lehua leman lemma lemur',
    'lends lenes lenis lenos lense lento leone leper lepta letch lethe letup leuds levee',
    'lever levin lewis lexes lexis liana liane liang liard liars libel liber libra',
    'libri lichi licht licit licks lidar lidos liege liens liers lieus lieve lifer lifts',
    'ligan liger liked liken liker likes lilac lilts liman limas limba limbi limbo limbs',
    'limby limed limen limes limey limns limos limpa limps linac lindy lined liner lines',
    'liney linga lingo lings lingy linin links linky linns linos lints linty linum lions',
    'lipid lipin lippy liras lirot lisle lisps lists litai litas liter lithe litho litre',
    'lived liven lives livid livre llama llano loach loads loafs loams loamy loans loath',
    'lobar lobed lobes lobos lochs locks locos locum locus loden lodes lodge loess lofts',
    'lofty logan loges loggy logia logoi logos loins lolls lolly loner longe longs looby',
    'looed looey loofa loofs looie looks looms loons loony loops loopy loots loped loper',
    'lopes loppy loral loran lords lores loris lorry losel loser loses lossy lotah lotas',
    'lotic lotos lotte lotto lotus lough louie louis loupe loups lours loury louse lousy',
    'louts lovat loved loves lowed lowes lowly lowse loxed loxes luaus lubes luces lucid',
    'lucks lucre ludes ludic luffa luffs luged luger luges lulls lulus lumen lumps lumpy',
    'lunar lunas lunes lunet lunge lungi lungs lunks lunts lupin lupus lurch lured lurer',
    'lures lurid lurks lusts lusty lusus lutea luted lutes luxes lweis lyard lyart lyase',
    'lycea lycee lying lymph lyres lyric lysed lyses lysin lysis lyssa lytic lytta maars',
    'mabes macaw maced macer maces mache macho machs macks macle macon macro madam madly',
    'madre mafia mafic mages magma magot magus mahoe maids maile maill mails maims mains',
    'mairs maist maize makar makes makos malar males malic malls malms malmy malts malty',
    'mamas mamba mambo mamey mamie mamma mammy manas maned manes mange mango mangy mania',
    'manic manly manna manor manos manse manta manus maple maqui marcs mares marge maria',
    'marks marls marly marry marse marsh marts marvy maser mashy masks mason massa masse',
    'massy masts mated mater mates matey maths matin matte matts matza matzo mauds mauls',
    'maund mauts mauve maven mavie mavin mavis mawed maxes maxim maxis mayan mayas mayed',
    'mayos mayst mazed mazer mazes mbira meads meals mealy means meany meats meaty mecca',
    'medic medii meeds meets meiny melds melee melic mells melon melts memos menad mends',
    'mensa mense menta menus meous meows mercy merde merer meres merge merks merle merls',
    'merry mesas meshy mesic mesne meson messy meted metes meths metis metre metro mewed',
    'mewls mezes mezzo miaou miaow miasm miaul micas miche micra micro middy midge',
    'midis midst miens miffs miffy miggs miked mikes mikra milch miler miles milia milks',
    'milky mille mills milos milpa milts milty mimed mimeo mimer mimes mimic minae minas',
    'mince mincy minds mined miner mines mingy minim minis minke minks minny mints minty',
    'mired mires mirex mirks mirky mirth mirza misdo miser mises misos missy mists misty',
    'miter mites mitis mitre mitts mixer mixes mixup mizen moans moats mocha mocks modal',
    'modem modes modus moggy mogul mohel mohur moils moira moire moist mojos mokes molal',
    'molar molas molds moldy moles molls molly molto molts momes momma mommy momus monad',
    'monas monde mondo mongo monie monks monos monte mooch moods moody mooed moola mools',
    'moons moony moors moory moose moots moped moper mopes mopey morae moras moray morel',
    'mores morns moron morph morro morse morts mosey mosks mosso mossy moste mosts motel',
    'motes motet motey moths mothy motif motte motto motts mouch moues mould moult mound',
    'mourn mousy moved mover moves mowed mower moxas moxie mozos mucid mucin mucks mucky',
    'mucor mucro mucus muddy mudra muffs mufti muggs muggy muhly mujik mulch mulct muled',
    'mules muley mulla mulls mumms mummy mumps mumus munch mungo munis muons mural muras',
    'mured mures murex murid murks murky murra murre murrs murry musca mused muser muses',
    'mushy musks musky mussy musth musts musty mutch muted muter mutes muton mutts muzzy',
    'mynah mynas myoid myoma myope myopy myrrh mysid myths mythy naans nabes nabis nabob',
    'nacho nacre nadas nadir naevi naggy naiad naifs nails naira naked naled named namer',
    'names nanas nance nancy nanny napes nappe nappy narco narcs nards nares naric naris',
    'narks narky nasal nasty natal natch nates natty naval navar navel naves navvy nawab',
    'neaps nears neath neats necks needs needy neems neeps negus neifs neigh neist nelly',
    'nemas neons nerds nerdy nerol nerts nertz nervy nests netop netts netty neuks neume',
    'neums neves nevus newel newer newie newsy newts nexus ngwee nicad nicer niche nicks',
    'nicol nidal nided nides nidus niece nieve nifty nighs nihil nills nimbi nines ninja',
    'ninny ninon ninth nipas nippy nisei nisus niter nites nitid niton nitre nitro nitty',
    'nival nixed nixes nixie nizam nobby nobly nocks nodal noddy nodes nodus noels noggs',
    'nohow noils noily noirs noisy nolos nomad nomas nomen nomes nomoi nomos nonas nonce',
    'nones nonet nonyl nooks nooky noons noose nopal noria noris norms nosed noses nosey',
    'notal notch noted noter notes notum nouns novae novas noway nowts nubby nubia nucha',
    'nuder nudes nudge nudie nudzh nuked nukes nulls numbs numen nurds nurls nutsy nutty',
    'nyala nylon nymph oaken oakum oared oases oasis oasts oaten oater oaths oaves obeah',
    'obeli obese obeys obias obits objet oboes obole oboli obols occur ocher ochre ochry',
    'ocker ocrea octad octal octan octet octyl oculi odder oddly odeon odeum odist odium',
    'odors odour odyle odyls offal offed ofter ogams ogees ogham ogive ogled ogler',
    'ogles ogres ohias ohing ohmic oidia oiled oiler oinks okapi okays okehs okras olden',
    'older oldie oleic olein oleos oleum olios ollas ology omasa omber ombre omega omens',
    'omers omits onery onium onset ontic oohed oomph oorie ootid oozed oozes opahs opals',
    'opens opine oping opium opsin opted optic orach orals orang orate orbed orcas orcin',
    'ordos oread organ orgic oribi oriel orles orlop ormer ornis orpin orris ortho orzos',
    'osier osmic osmol ossia ostia ottar otter ottos ounce ouphe ouphs ourie ousel ousts',
    'outby outdo outed outgo outre ouzel ouzos ovals ovary ovate ovens overs overt ovine',
    'ovoid ovoli ovolo ovule owing owlet owned owsen oxbow oxeye oxide oxids oxime oxims',
    'oxlip oxter oyers ozone pacas paced pacer paces pacha packs pacts paddy padis padle',
    'padre padri paean paeon pagan paged pager pages pagod paiks pails pains pairs paisa',
    'paise palea paled paler pales palet palls pally palms palmy palpi palps palsy pampa',
    'panda pandy paned panes panga pangs panic panne pansy panto pants panty papal papas',
    'papaw pappi pappy paras parch pardi pards pardy pared pareo parer pares pareu parge',
    'pargo paris parka parks parle parol parrs parry parse parts parve parvo paseo pases',
    'pasha passe paste pasts pasty pated paten pater pates paths patin patio patly patsy',
    'patty pavan paved paver paves pavid pavin pavis pawed pawer pawky pawls pawns paxes',
    'payed payee payer payor peach peage peags peaks peaky peals peans pears peart pease',
    'peats peaty peavy pecan pechs pecks pecky pedal pedes pedro peeks peels peens peeps',
    'peers peery peeve peins peise pekan pekes pekin pekoe peles pelfs pelon pelts penal',
    'pence pends penes pengo penis penna penne penni penny peons peony pepla pepos peppy',
    'perch perdu perdy perea peril peris perks perky perms perry perse pesky pesos pesto',
    'pests pesty petal petit petti petto petty pewee pewit phage phial phlox phono',
    'phons phony phots phpht phuts phyla phyle pians pibal pical picas picks picky picot',
    'picul piers pieta piety piggy pigmy piing pikas piked piker pikes pikis pilaf pilar',
    'pilau pilaw pilea piled pilei piles pilis pills pilus pimas pimps pinas pinch pined',
    'pines piney pingo pings pinko pinks pinky pinna pinny pinon pinot pinta pinto pints',
    'pinup pions pious pipal piped piper pipes pipet pipit pique pirns pirog pisco pisos',
    'piste pitas piths pithy piton pivot pixel pixes pixie plack plage plaid plait plank',
    'plans plash plasm plats platy playa plays plead pleas pleat plebe plebs plena plews',
    'plica plied plier plies plink plods plonk plops plots plotz plows ploys pluck plugs',
    'plumb plume plump plums plumy plunk plush plyer poach pocks pocky podgy podia poems',
    'poesy poets pogey poilu poind poise poked poker pokes pokey poled poler poles polio',
    'polis polka polls polos polyp polys pomes pommy pomps ponce ponds pones pongs pooch',
    'poods poohs pools poons poops poori poove popes poppa poppy popsy pored',
    'pores porgy porks porky porno porns porny ports posed poser poses posit posse posts',
    'potsy potto potty pouch pouff poufs poult pours pouts pouty poxed poxes poyou praam',
    'prahu prams prang prank praos prase prate prats praus prawn prays preed preen prees',
    'preps presa prese prest prexy preys pricy pried prier pries prigs prill prima',
    'primi primo primp prims prink prion prise prism priss privy proas probe prods proem',
    'profs progs prole promo proms prone prong props prose proso pross prost prosy prowl',
    'prows proxy prude prune pruta pryer psalm pseud pshaw psoae psoai psoas psych pubes',
    'pubic pubis puces pucka pucks pudgy pudic puffs puffy puggy pujah pujas puked pukes',
    'pukka puled puler pules pulik pulis pulls pulps pulpy pumas pumps punas pungs punka',
    'punks punky punny punto punts punty pupae pupal pupas puppy purda puree purer purge',
    'purin puris purls purrs purse pursy puses pushy puton putti putto putts putty',
    'pygmy pyins pylon pyoid pyran pyres pyric pyxes pyxie pyxis qaids qanat qophs quack',
    'quads quaff quags quail quais quake quaky quale qualm quant quare quark quart quash',
    'quasi quass quate quays quean queer quell quern quest queue queys quids quiff quill',
    'quilt quins quint quips quipu quire quirk quirt quits quods quoin quoit quota quoth',
    'qursh rabat rabbi rabic rabid raced racer races racks racon radar radii radix radon',
    'raffs rafts ragas raged ragee rages raggy ragis raias raids rails rains rainy rajah',
    'rajas rajes raked rakee raker rakes rakis rales rally ralph ramee ramet ramie rammy',
    'ramps ramus rance ranch rands randy ranee rangy ranid ranis ranks rants raphe rared',
    'rarer rares rased raser rases rasps raspy ratal ratan ratch rated ratel rater rates',
    'rathe ratos ratty raved ravel raven raver raves ravin rawer rawin rawly raxed raxes',
    'rayah rayas rayed rayon razed razee razer razes razor readd reads reals reams reaps',
    'rearm rears reata reave rebar rebbe rebec rebid rebop rebus rebut rebuy recap recce',
    'recks recon recta recti recto recur recut redan redds reded redes redia redid redip',
    'redly redon redos redox redry redub redux redye reeds reedy reefs reefy reeks reeky',
    'reels reest reeve refed refel refit refix refly refry regal reges regma regna rehab',
    'rehem reifs reify reign reink reins reive rekey relay relet relic relit reman remap',
    'remet remex remit remix renal rends renew renig renin rente rents reoil repay repeg',
    'repel repin repos repot repps repro reran rerig rerun resaw resay resee reset resew',
    'resid resin resod resow rests retag retax retch retem retia retie retro retry reuse',
    'revel revet revue rewan rewax rewed rewet rewin rewon rexes rheas rheum rhino rhomb',
    'rhumb rhyme rhyta rials riant riata ribby ribes riced ricer rices ricin ricks rides',
    'ridgy riels rifer riffs rifts rigor riled riles riley rille rills rimed rimer rimes',
    'rinds rings rinks rioja riots riped ripen riper ripes risen riser rises rishi risks',
    'risky risus rites ritzy rival rived riven rives rivet riyal roach roads roams roans',
    'roars robed robes robin roble rocks rodeo roger rogue roils roily roles rolfs rolls',
    'roman romeo romps rondo roods roofs rooks rooky rooms roomy roose roost roots rooty',
    'roped roper ropes ropey roque rosed roses roset rosin rotas rotch rotes rotis rotls',
    'rotor rotos rotte rouen roues rouge roups roupy rouse roust routh routs roved roven',
    'rover roves rowan rowdy rowed rowel rowen rower rowth ruana rubes ruble rubus ruche',
    'rucks rudds ruddy ruder ruers ruffe ruffs rugae rugal rugby ruing ruins ruled ruler',
    'rules rumba rumen rummy rumor rumps runes rungs runic runny runts runty rupee ruses',
    'rushy rusks rusts rusty ruths rutin rutty ryked rykes rynds ryots sabed saber sabes',
    'sabin sabir sable sabot sabra sabre sacks sacra sades sadhe sadhu sadis sadly safer',
    'safes sagas sager sages saggy sagos sagum sahib saice saids saiga sails sains saint',
    'saith sajou saker sakes sakis salal salep sales salic sally salmi salol salon salpa',
    'salps salsa salts salty salve salvo samba samek samps sands sandy saned saner',
    'sanes sanga sangh santo sapid sapor sappy saran sards saree sarge sarin saris sarks',
    'sarky sarod saros sasin sassy satay sated satem sates satin satis satyr sauch saucy',
    'saugh sauls sault sauna saury saute saved saver saves savin savor savoy savvy sawed',
    'sawer saxes sayer sayid sayst scabs scads scags scald scall scalp scaly scamp scams',
    'scans scant scape scare scarf scarp scars scart scary scats scatt scaup scaur scena',
    'scend scent schav schmo schul schwa scion scoff scold scone scoop scoot scops scorn',
    'scots scour scowl scows scrag scram scrap scree scrim scrip scrod scrub scrum scuba',
    'scudi scudo scuds scuff sculk scull sculp scums scups scurf scuta scute scuts seals',
    'seams seamy sears seats sebum secco sects sedan seder sedge sedgy sedum seeds seedy',
    'seeks seels seely seems seeps seepy seers segni segno segos segue seifs seine seise',
    'seism seize selah selfs selle sells selva semen semes semis sends sengi senna senor',
    'sensa sente senti sepal sepia sepic sepoy septa septs serac serai seral sered serer',
    'seres serfs serge serif serin serow serry serum servo setae setal seton setts setup',
    'sever sewan sewar sewed sewer sexed sexes sexto sexts shack shads shady shaft shags',
    'shahs shako shaky shale shalt shaly shams shank shard shark sharn shaul shave shawl',
    'shawm shawn shaws shays sheaf sheal shear sheas sheds sheen sheer sheik shend shent',
    'sheol sherd shewn shews shied shiel shier shies shill shily shims shins ships shire',
    'shirk shirr shist shiva shive shivs shlep shoal shoat shoed shoer shoes shogs',
    'shoji shone shook shool shoon shoos shops shorl shorn shote shots shott shove shown',
    'shows showy shoyu shred shrew shris shrub shtik shuck shuln shuls shuns shunt shush',
    'shute shuts shyer shyly sials sibbs sibyl sices sicko sicks sided sides sidle siege',
    'sieur sieve sifts sighs sigil sigma signs siker sikes silds silex silks silky sills',
    'silos silts silty silva simar simas simps sines sinew singe sings sinhs sinks sinus',
    'siped sipes sired siree siren sires sirra sirup sisal sises sissy sitar sited sites',
    'situp situs siver sixes sixmo sixte sizar sized sizer sizes skags skald skate skats',
    'skean skeed skeen skees skeet skegs skein skelm skelp skene skeps skews skids skied',
    'skier skies skiey skiff skimo skimp skims skink skins skint skips skirl skirr skite',
    'skits skive skoal skosh skuas skulk skull skunk skyed skyey slabs slack slain slake',
    'slams slang slank slant slaps slash slate slats slaty slave slaws slays sleds sleek',
    'sleet slept slews slick slier slily slime slims slimy sling slink slipe slips slipt',
    'slits slobs sloes slogs sloid slojd sloop slops slosh sloth slots slows sloyd slubs',
    'slued slues sluff slugs slump slums slung slunk slurb slurp slurs slush slyer slyly',
    'slype smack smalt smarm smash smaze smear smeek smelt smerk smews smirk smite smith',
    'smock smogs smoky smolt smote smuts snafu snags snail snaky snaps snare snark snarl',
    'snash snath snaws sneak sneap sneck sneds sneer snell snibs snick snide sniff snipe',
    'snips snits snobs snogs snood snook snool snoop snoot snore snort snots snout snows',
    'snowy snubs snuck snuff snugs snyes soaks soaps soapy soars soave sober socko socks',
    'socle sodas soddy sodic sodom sofar sofas softa softs softy soggy soils sojas sokes',
    'sokol solan solar soldi soldo soled solei soles solon solos solum solus somas sonar',
    'sonde sones songs sonic sonly sonny sonsy sooey sooks sooth soots sooty sophs sophy',
    'sopor soppy soras sorbs sords sorel sorer sores sorgo sorns sorts sorus soths sotol',
    'sough souks souls soups soupy sours souse sowar sowed sower soyas soyuz sozin spacy',
    'spade spado spaed spaes spahi spail spait spake spale spall spang spank spans spark',
    'spars spasm spate spats spawn spays spean spear speck specs speel speer speil speir',
    'spelt spent sperm spews spica spicy spied spiel spier spies spiff spike spiky',
    'spile spill spilt spins spiny spire spirt spiry spite spits spitz spivs splat splay',
    'spode spoke spoof spook spool spoor spore spots spout sprag sprat spree sprig sprit',
    'sprue sprug spuds spued spues spume spumy spunk spurn spurs spurt sputa squab squat',
    'squeg squib squid stabs stade stags stagy staid staig stain stale stalk stall stane',
    'stang stank staph stark stars stash stats stave stays stead steed steek steer stein',
    'stela stele stems steno steps stere stern stets stews stich stied sties stile stilt',
    'stime stimy sting stink stint stipe stirk stirp stirs stoae stoai stoas stoat stobs',
    'stogy stoic stoke stole stoma stomp stony stook stool stoop stope stops stopt stork',
    'stoss stoup stour stout stowp stows stray strep strew stria strop strow stroy strum',
    'strut stubs stuck studs stull stump stums stung stunk stuns stunt stupa stupe sturt',
    'styed styes styli stymy suave subah subas suber sucks sucre sudds sudor sudsy suede',
    'suers suets suety sughs suing suint suits sulci sulfa sulfo sulks sulky sully sulus',
    'sumac summa sumos sumps sunna sunns sunup supes supra surah sural suras surds surer',
    'surfs surfy surge surgy surly surra sushi sutra sutta swabs swage swags swail swain',
    'swale swami swamp swamy swang swank swans swaps sward sware swarf swarm swart swash',
    'swath swats sways swear sweat swede sweep sweer swell swigs swill swims swine swink',
    'swipe swirl swish swiss swith swive swobs swoon swoop swops swore sworn swots swoun',
    'swung sycee syces sykes sylis sylph sylva synch syncs synod synth syphs syren syrup',
    'sysop tabby taber tabes tabid tabla taboo tabor tabun tabus taces tacet tache tachs',
    'tacit tacks tacky tacos tacts taels taffy tafia tahrs taiga tails tains taint tajes',
    'taken taker takes takin talar talas talcs taler tales talks talky tally talon taluk',
    'talus tamal tamed tamer tames tamis tammy tamps tango tangs tangy tanka tanks tansy',
    'tanto tapas taped taper tapes tapir tapis tardo tardy tared tares targe tarns taroc',
    'tarok taros tarot tarps tarre tarry tarsi tarts tarty tasks tasse tasty tatar tater',
    'tates tatty taunt taupe tauts tawed tawer tawie tawny tawse taxed taxer taxes taxis',
    'taxon taxus tazza tazze teaks teals teams tears teary tease teats techy tecta teddy',
    'teels teems teens teeny teeth teffs tegua teiid teind telae teles telex telia telic',
    'tells telly teloi telos tempi tempo temps tempt tench tends tenet tenia tenon tenor',
    'tense tents tenty tepal tepas tepee tepid tepoy terai terce terga terms terne terns',
    'terra terry terse tesla testa tests testy teths tetra teuch teugh tewed texas texts',
    'thack thane tharm thaws thebe theca theft thegn thein their thens therm these theta',
    'thews thewy thief thigh thill thine thins thiol thirl thole thong thorn thoro thorp',
    'thous thraw thrip throb throe thrum thuds thugs thuja thump thunk thurl thuya thyme',
    'thymi thymy tiara tibia tical ticks tidal tided tides tiers tiffs tigon tikes tikis',
    'tilak tilde tiled tiler tiles tills tilth tilts timed times timid tinct tinea tined',
    'tines tinge tings tinny tints tipis tippy tipsy tired tires tirls tiros titan titer',
    'tithe titis titre titty tizzy toads toady toddy toffs toffy tofts tofus togae togas',
    'togue toile toils toits tokay toked toker tokes tolan tolas toled toles tolls tolus',
    'tolyl toman tombs tomes tommy tonal tondi tondo toned toner tones toney tonga tongs',
    'tonic tonne tonus tools toons toots topaz toped topee toper topes tophe tophi tophs',
    'topis topoi topos toque torah toras torch torcs tores toric torii toros torot torse',
    'torsi torsk torso torte torts torus toted totem toter totes tours touse touts towed',
    'towie towns towny toxic toxin toyed toyer toyon toyos tract tragi traik trait tramp',
    'trams trank tranq trans traps trapt trass trave trawl trays tread treed treen trees',
    'treks tress trets trews treys triac triad trice tried trier tries trigo trigs trike',
    'trill trims trine triol trios tripe trips trite troak trock trode trois troke troll',
    'tromp trona trone trooz trope troth trots trout trove trows troys truce trued truer',
    'trues trugs trull trump truss tryma tryst tsade tsadi tsars tsked tsuba tubae tubal',
    'tubas tubby tubed tuber tubes tucks tufas tuffs tufts tufty tules tulip tulle tumid',
    'tummy tumor tumps tunas tuned tuner tunes tungs tunic tunny tupik tuque turbo',
    'turfs turfy turks turns turps tushy tusks tutee tutor tutti tutty tutus tuxes tuyer',
    'twaes twain twang tweak tweed tween tweet twerp twier twigs twill twine twins',
    'twiny twirl twirp twits twixt twyer tyees tyers tying tykes tyned tynes typal typed',
    'types typey typic typos typps tyred tyres tyros tythe tzars udder uhlan ukase ulama',
    'ulans ulcer ulema ulnad ulnae ulnar ulnas ulpan ulvas umbel umber umbos umbra umiac',
    'umiak umiaq umped unais unapt unarm unary unaus unban unbar unbid unbox uncap uncia',
    'uncos uncoy uncus uncut undee undid undue unfed unfit unfix ungot unhat unhip unify',
    'units unlay unled unlet unlit unman unmet unmew unmix unpeg unpen unpin unrig unrip',
    'unsay unset unsew unsex untie unwed unwit unwon unzip upbow upbye updos updry upend',
    'uplit upped uraei urare urari urase urate urbia ureal ureas uredo ureic urged urger',
    'urges urial urine ursae users usher using usnea usque usurp usury uteri utile utter',
    'uveal uveas uvula vacua vagal vague vagus vails vairs vakil vales valet valor valse',
    'valve vamps vanda vaned vanes vangs vapid vapor varas varia varix varna varus varve',
    'vasal vases vasts vasty vatic vatus vault vaunt veals vealy veena veeps veers veery',
    'vegan vegie veils veins veiny velar velds veldt velum venae venal vends venge venin',
    'venom vents venue verbs verge verse verso verst verts vertu verve vesta vests vetch',
    'vexed vexer vexes vexil vials viand vibes vicar viced vices vichy viers views viewy',
    'vigas vigil vigor viler villa villi vills vimen vinal vinas vinca vined vines vinic',
    'vinos vinyl viola viols viper viral vireo vires virga virid virls virtu visas vised',
    'vises visor vista vitae vitta vivas vixen vizir vizor voces vodka vodun vogie vogue',
    'voids voila voile volar voled voles volta volte volti volts volva vomer vomit voted',
    'votes vouch vowed vowel vower vroom vrouw vrows vuggs vuggy vughs vulgo vulva vying',
    'wacke wacko wacks wacky waddy waded wader wades wadis wafer waffs wafts waged wager',
    'wages wahoo waifs wails wains wairs waits waive waked waken waker wakes waled waler',
    'wales walks walla walls wally waltz wames wamus wands waned wanes waney wanly wants',
    'wards wared wares warks warms warns warps warts warty washy wasps waspy wasts watap',
    'watts waugh wauks wauls waved waver waves wavey wawls waxed waxen waxer waxes weald',
    'weals weans wears weary weave webby weber wecht wedel wedge wedgy weeds weedy weeks',
    'weens weeny weeps weepy weest weets wefts weirs wekas welch welds wells welly welsh',
    'welts wench wends wenny wests wetly whack whamo whams whang whaps wharf whats whaup',
    'wheal wheen wheep whelk whelm whelp whens whets whews wheys whids whiff whigs whims',
    'whine whins whiny whips whipt whirl whirr whirs whish whisk whist whits whity whizz',
    'whomp whoof whoop whops whorl whort whoso whump wicks widdy widen wider wides wield',
    'wifed wifes wifty wigan wiggy wight wilco wilds wiled wiles wills willy wilts wimps',
    'wimpy wince winch winds windy wined wines winey wings wingy winks winos winze wiped',
    'wiper wipes wired wirer wires wirra wised wiser wises wisha wisps wispy wists witan',
    'witch wited wites withe withy witty wived wiver wives wizen wizes woads woald wodge',
    'woful woken wolds wolfs wombs womby women wonks wonky wonts woods woody wooed wooer',
    'woofs wools wooly woops woosh woozy words wordy works worms wormy worst worts woven',
    'wowed wrack wrang wraps wrapt wrath wreak wreck wrens wrest wrick wried wrier wries',
    'wring writs wrote wroth wrung wryer wryly wurst wussy wyled wyles wynds wynns wyted',
    'wytes xebec xenia xenic xenon xeric xerox xerus xylan xylem xylol xylyl xysti xysts',
    'yacht yacks yaffs yager yagis yahoo yaird yamen yamun yangs yanks yapok yapon yards',
    'yarer yarns yauds yauld yaups yawed yawls yawns yawps yeans yearn years yeast yecch',
    'yechs yechy yeggs yelks yells yelps yenta yente yerba yerks yeses yetis yetts yeuks',
    'yeuky yikes yills yince yipes yirds yirrs yirth ylems yobbo yocks yodel yodhs yodle',
    'yogas yogee yoghs yogic yogin yogis yoked yokel yokes yolks yolky yomim yonic yonis',
    'yores yourn yours youse yowed yowes yowie yowls yuans yucas yucca yucch yucks yucky',
    'yugas yulan yules yummy yupon yurta yurts zaire zamia zanza zappy zarfs zaxes zayin',
    'zazen zeals zebec zebus zeins zerks zeros zests zesty zetas zibet zilch zills zincs',
    'zincy zineb zings zingy zinky zippy ziram zitis zizit zlote zloty zoeae zoeal zoeas',
    'zombi zonal zoned zoner zones zonks zooid zooks zooms zoons zooty zoril zoris zowie',
    'zymes',
    'admin bento blogs droid email inbox jello kinda memes ramen buzzy amped abled emoji vlogs wifis botox', // modern words ENABLE lacks
  ].join(' ').split(' ');
  const WD_SET = new Set(WD_ANS.concat(WD_EXTRA));
  const wdAnswer = date => WD_ANS[hashSeed('word|' + date) % WD_ANS.length];
  const wdValid = w => typeof w === 'string' && /^[a-z]{5}$/.test(w) && WD_SET.has(w);
  function wdMark(guess, answer) { // 'g' right spot, 'y' in the word elsewhere, 'x' not there; repeated letters are counted once per copy in the answer
    const out = Array(5).fill('x'), left = {};
    for (let i = 0; i < 5; i++) { if (guess[i] === answer[i]) out[i] = 'g'; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
    for (let i = 0; i < 5; i++) if (out[i] === 'x' && left[guess[i]] > 0) { out[i] = 'y'; left[guess[i]]--; }
    return out;
  }
  const wdNew = date => ({ d: date, rows: [], done: false, won: false });
  const wdPrev = d => new Date(Date.parse(d + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  function wdRecord(S, won, date) { // v18.8.1: a finished daily game updates played, wins and the streak (a win on the day after the last win extends it; a loss ends it)
    S.n++; if (!won) { S.str = 0; return; }
    S.wins++; S.str = S.last === wdPrev(date) ? S.str + 1 : S.last === date ? Math.max(1, S.str) : 1; S.last = date; if (S.str > S.bst) S.bst = S.str;
  }
  const wdStats = (S, today) => ({ played: S.n, wins: S.wins, pct: S.n ? Math.round(100 * S.wins / S.n) : 0, streak: S.last === today || S.last === wdPrev(today) ? S.str : 0, best: S.bst });
  const wdShare = st => { const a = wdAnswer(st.d), g = { g: '\u{1F7E9}', y: '\u{1F7E8}', x: '\u2B1B' }; return '953 Word ' + st.d + ' ' + (st.won ? st.rows.length : 'X') + '/6\n' + st.rows.map(w => wdMark(w, a).map(m => g[m]).join('')).join('\n'); };
  function wdGuess(st, w) { // 'done' | 'short' | 'invalid' | 'ok' | 'won' | 'lost'
    if (st.done) return 'done'; w = String(w || '').toLowerCase();
    if (!/^[a-z]{5}$/.test(w)) return 'short';
    if (!wdValid(w)) return 'invalid';
    st.rows.push(w);
    if (w === wdAnswer(st.d)) { st.done = st.won = true; return 'won'; }
    if (st.rows.length >= 6) { st.done = true; return 'lost'; }
    return 'ok';
  }
  function wdKeys(st) { const rank = { x: 1, y: 2, g: 3 }, k = {}; const a = wdAnswer(st.d); st.rows.forEach(w => wdMark(w, a).forEach((m, i) => { if (!k[w[i]] || rank[m] > rank[k[w[i]]]) k[w[i]] = m; })); return k; }

  // ---------- Snake (v18.8): 16x16, speeds up every 5 food ----------
  const SNK_N = 16, SNK_DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }, SNK_OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  function snkFood(st) {
    const used = new Set(st.body.map(p => p[0] * SNK_N + p[1])), free = range(SNK_N * SNK_N).filter(i => !used.has(i));
    if (!free.length) { st.food = null; return; }
    const i = free[Math.floor(rng('snk|' + st.seed + '|' + st.k)() * free.length)]; st.k++; st.food = [(i / SNK_N) | 0, i % SNK_N];
  }
  function snkNew(seed) { const st = { body: [[8, 4], [8, 3], [8, 2]], dir: 'right', nd: 'right', q: [], food: null, eaten: 0, sc: 0, over: false, seed: String(seed), k: 0 }; snkFood(st); return st; }
  function snkTurn(st, d) { // v18.8.1: up to 2 turns wait in st.q (each judged against the one before it), so two quick swipes between steps both count
    if (!SNK_DIRS[d]) return false; const q = st.q || (st.q = []), last = q.length ? q[q.length - 1] : st.nd;
    if (d === SNK_OPP[last] || (!q.length && d === SNK_OPP[st.dir])) return false; if (d === last) return true;
    if (q.length < 2) { q.push(d); st.nd = q[0]; } return true;
  }
  function snkStep(st) { // {ate, over}
    if (st.over) return { ate: false, over: true };
    if (st.q && st.q.length) st.nd = st.q.shift(); st.dir = st.nd; const [dr, dc] = SNK_DIRS[st.dir], h = st.body[0], nr = h[0] + dr, nc = h[1] + dc;
    if (nr < 0 || nc < 0 || nr >= SNK_N || nc >= SNK_N) { st.over = true; return { ate: false, over: true }; }
    const ate = !!st.food && st.food[0] === nr && st.food[1] === nc;
    if ((ate ? st.body : st.body.slice(0, -1)).some(p => p[0] === nr && p[1] === nc)) { st.over = true; return { ate: false, over: true }; } // the tail cell is free unless we grow
    st.body.unshift([nr, nc]); if (!ate) st.body.pop();
    else { st.eaten++; st.sc = st.body.length - 3; snkFood(st); if (!st.food) st.over = true; }
    return { ate, over: st.over };
  }
  const snkSpeed = eaten => Math.max(70, 170 - 12 * Math.floor(eaten / 5)); // ms per step

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
  const cleanBlock = o => {
    const out = { cur: null, best: o && isInt(o.best, 0, 1e7) ? o.best : 0 }, c = o && o.cur;
    if (c && typeof c.seed === 'string' && c.seed.length <= 40 && isInt(c.ref, 0, 99999) && isInt(c.sc, 0, 1e7) && Array.isArray(c.g) && c.g.length === 64 && c.g.every(v => v === 0 || v === 1) &&
      Array.isArray(c.pcs) && c.pcs.length === 3 && c.pcs.every(v => isInt(v, -1, BLK_SHAPES.length - 1))) {
      const st = { g: c.g.slice(), pcs: c.pcs.slice(), sc: c.sc, seed: c.seed, ref: c.ref, over: false };
      if (st.pcs.every(v => v < 0)) st.pcs = blkDeal(st.seed, st.ref, st.g);
      st.over = !blkAnyFits(st); out.cur = st;
    }
    return out;
  };
  const cleanWord = o => {
    const out = { cur: null, n: o && isInt(o.n, 0, 99999) ? o.n : 0, wins: o && isInt(o.wins, 0, 99999) ? o.wins : 0, str: o && isInt(o.str, 0, 99999) ? o.str : 0, bst: o && isInt(o.bst, 0, 99999) ? o.bst : 0, last: o && typeof o.last === 'string' && /^\d{4}-\d\d-\d\d$/.test(o.last) ? o.last : '' }, c = o && o.cur;
    if (out.wins > out.n) out.wins = out.n; if (out.bst < out.str) out.bst = out.str;
    if (c && typeof c.d === 'string' && /^\d{4}-\d\d-\d\d$/.test(c.d) && Array.isArray(c.rows) && c.rows.length <= 6 && c.rows.every(w => typeof w === 'string' && /^[a-z]{5}$/.test(w))) {
      const a = wdAnswer(c.d), won = c.rows.includes(a);
      const rows = won ? c.rows.slice(0, c.rows.indexOf(a) + 1) : c.rows.slice(); out.cur = { d: c.d, rows, won, done: won || rows.length >= 6 };
    }
    return out;
  };
  const cleanSnake = o => ({ best: o && isInt(o.best, 0, 253) ? o.best : 0 });
  function loadStore(raw) {
    let o = null; try { if (typeof raw === 'string' && raw.length <= 200000) o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const sf = (fn, v) => { try { return fn(v && typeof v === 'object' ? v : null); } catch (e) { return fn(null); } };
    return { v: 1, sdk: sf(cleanSdk, o.sdk), g48: sf(cleanG48, o.g48), mem: sf(cleanMem, o.mem), mine: sf(cleanMine, o.mine), ws: sf(cleanWs, o.ws), block: sf(cleanBlock, o.block), word: sf(cleanWord, o.word), snake: sf(cleanSnake, o.snake) };
  }
  const serialize = store => JSON.stringify(store, (k, v) => (k === 'u' ? undefined : v));

  const GamesX = {
    KEY, hashSeed, rng, shuffle, manilaDate, loadStore, serialize,
    SDK_LEVELS, SDK_CLUES, sdkSolve, sdkMake, sdkNew, sdkPlace, sdkErase, sdkUndo, sdkHint, sdkWrong, sdkCheck, sdkValidFull, PEERS,
    slideLine, g48Slide, g48Spawn, g48Over, g48New, g48Move, g48Undo,
    MEM_EMOJI, MEM_SIZES, memNew, memFlip, memClose,
    MINE_SIZES, msNew, msFromMines, msCount, msNeighbours, msReveal, msFlag, msChord,
    WS_WORDS, WS_N, WS_COUNT, wsMake, wsNew, wsFind, wsLine, wsSelect,
    BLK_N, BLK_SHAPES, blkSize, blkDeal, blkFits, blkAnyFits, blkNew, blkPlace, blkClearing,
    WD_ANS, WD_EXTRA, wdAnswer, wdValid, wdMark, wdNew, wdGuess, wdKeys, wdRecord, wdStats, wdShare, wdPrev,
    SNK_N, snkNew, snkTurn, snkStep, snkSpeed, snkFood
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = GamesX;
  root.GamesX = GamesX;

  // ================= Part 2: UI (browser only) =================
  if (typeof document === 'undefined') return;
  const X = GamesX;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = t => { t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const CARDS = [['sdk', '🔢', 'Sudoku'], ['g48', '🟧', '2048'], ['mem', '🃏', 'Memory match'], ['mine', '💣', 'Minesweeper'], ['ws', '🔎', 'Word search'], ['chess', '♞', 'Chess'],
    ['block', '', 'Block puzzle'], ['word', '', 'Daily word'], ['sol', '', 'Solitaire'], ['tongits', '', 'Tong-its'], ['snake', '', 'Snake']];
  const POPULAR = ['block', 'word', 'sol', 'tongits', 'snake'], ALSO = ['sdk', 'g48', 'mem', 'mine', 'ws'], CARD_GAMES = ['sol', 'tongits'];
  // own little drawings for the five popular tiles (no emoji, no named app's art)
  const ICONS = {
    block: '<svg viewBox="0 0 34 34"><rect x="3" y="3" width="12" height="12" rx="3" fill="#2f6fb0"/><rect x="17" y="3" width="12" height="12" rx="3" fill="#c19a4b"/><rect x="3" y="17" width="12" height="12" rx="3" fill="#2f8a5b"/><rect x="17" y="17" width="12" height="12" rx="3" fill="#b8463d"/></svg>',
    word: '<svg viewBox="0 0 34 34"><rect x="1" y="9" width="10" height="16" rx="3" fill="#2f7d4f"/><rect x="12" y="9" width="10" height="16" rx="3" fill="#f1d58a"/><rect x="23" y="9" width="10" height="16" rx="3" fill="#5b6577"/><text x="6" y="21" font-size="10" font-weight="800" text-anchor="middle" fill="#fff">A</text><text x="17" y="21" font-size="10" font-weight="800" text-anchor="middle" fill="#15233a">B</text><text x="28" y="21" font-size="10" font-weight="800" text-anchor="middle" fill="#fff">C</text></svg>',
    sol: '<svg viewBox="0 0 34 34"><rect x="3" y="6" width="17" height="24" rx="3" fill="#fff" stroke="#15233a" stroke-width="1.5"/><rect x="13" y="4" width="17" height="24" rx="3" fill="#fff" stroke="#15233a" stroke-width="1.5"/><text x="21.5" y="22" font-size="13" text-anchor="middle" fill="#b8463d">&#9829;</text></svg>',
    tongits: '<svg viewBox="0 0 34 34"><rect x="4" y="8" width="14" height="21" rx="3" fill="#fff" stroke="#15233a" stroke-width="1.5" transform="rotate(-14 11 18)"/><rect x="10" y="5" width="14" height="21" rx="3" fill="#fff" stroke="#15233a" stroke-width="1.5"/><rect x="16" y="8" width="14" height="21" rx="3" fill="#fff" stroke="#15233a" stroke-width="1.5" transform="rotate(14 23 18)"/><text x="17" y="20" font-size="11" text-anchor="middle" fill="#15233a">&#9824;</text></svg>',
    snake: '<svg viewBox="0 0 34 34"><path d="M5 27 H17 V17 H9 V8 H27" fill="none" stroke="#2f8a5b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27" cy="8" r="2" fill="#fff"/></svg>'
  };
  const NEW_VIEWS = ['block', 'word', 'snake', 'sol', 'tongits'];
  const SIZE_NAME = { s: 'Small', m: 'Medium', l: 'Large' };
  const HOW = {
    sdk: 'Fill the grid so every row, column and 3x3 box holds 1 to 9 once. Tap a cell, then a number. Notes mode lets you pencil in candidates. Hints (3 max) fill the selected cell; a puzzle solved with hints does not set a best time.',
    g48: 'Swipe (or use the arrow buttons or keys) to slide all tiles. Equal tiles that touch merge and add up. Make 2048, then keep going for a higher score. You can undo one move.',
    mem: 'Flip two cards at a time and find the matching pair. Fewer moves is better.',
    mine: 'Tap a square to open it. A number says how many of its 8 neighbours hold a mine. Long-press, or turn on Flag mode, to mark a mine. Tap a number whose flags match it to open the rest around it. Your first tap is always safe.',
    block: 'Three pieces are offered. Drag a piece onto the board (blue squares show where it fits, red where it does not), or tap a piece and then tap the board. A full row or column clears. The game ends when none of the pieces left fits.',
    word: 'Guess the 5-letter word in 6 tries. Dark green with a tick means the right spot. Light gold with a dot means the letter is in the word but elsewhere. Grey with a cross means it is not in the word. Everyone in the house gets the same word each day (Manila time).',
    snake: 'Steer the snake to the food without touching the wall or yourself. Swipe on the board, use the arrow buttons, or the arrow keys. It speeds up after every 5 food. Pause any time.',
    sol: 'Klondike solitaire.', tongits: 'Tong-its against two computer players.',
    ws: 'Drag your finger across the letters in a straight line (any direction) to select a hidden word from the list.', chess: 'Tap one of your pieces, then a dotted square to move it, or drag the piece there. A ring marks a piece you can capture. Play the computer (Easy or Medium) or share the phone with a friend. Sound is off until you switch it on. Your game is saved. For a game against a housemate, use Challenge a housemate.'
  };
  const CSS = `.gm{padding:14px;display:flex;flex-direction:column;gap:12px;color:#15233a;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.gm :where(button){font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.gm-top{display:flex;align-items:center;gap:8px}.gm-top h2{flex:1;margin:0;font-size:17px;text-align:center}
.gm-btn{border:0;border-radius:12px;padding:0 14px;min-height:44px;background:rgba(21,35,58,.08);font-weight:600;font-size:14px}
.gm-btn.pri{background:#15233a;color:#fff}.gm-btn[aria-pressed=true]{background:#15233a;color:#fff}.gm-btn:disabled{opacity:.4}
.gm-home{display:grid;grid-template-columns:1fr 1fr;gap:10px}.gm-card{border:0;border-radius:18px;padding:14px 12px;background:#fff;box-shadow:0 1px 0 rgba(21,35,58,.08),0 10px 24px -16px rgba(21,35,58,.5);text-align:left;display:flex;flex-direction:column;gap:4px;min-height:112px}
.gm-card.wide{grid-column:1/-1;min-height:96px}.gm-card .e{font-size:30px;line-height:1}.gm-card .e svg{width:34px;height:34px;display:block}.gm-card b{font-size:15px}.gm-card small{font-size:12px;opacity:.7}.gm-pill{align-self:flex-start;background:#c19a4b;color:#15233a;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700}
.gm-bar{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:600}.gm-bar span{font-variant-numeric:tabular-nums}
.gm-how{font-size:12.5px;line-height:1.45;opacity:.85}.gm-how summary{cursor:pointer;font-weight:600;min-height:44px;display:flex;align-items:center;gap:6px}.gm-how summary::before{content:'\\25B8'}.gm-how[open] summary::before{content:'\\25BE'}
.gm-pick{display:grid;grid-template-columns:1fr 1fr;gap:10px}.gm-pick .gm-btn{min-height:56px;font-size:16px}
.gm-sdk{display:grid;grid-template-columns:repeat(9,1fr);width:100%;aspect-ratio:1/1;border:2px solid #15233a;border-radius:6px;overflow:hidden;background:#fff}
.gm-c{border:0;border-right:1px solid rgba(21,35,58,.18);border-bottom:1px solid rgba(21,35,58,.18);background:#fff;padding:0;font-size:20px;font-weight:500;color:#2f6fb0;position:relative;display:flex;align-items:center;justify-content:center;min-width:0}
.gm-c.clue{color:#15233a;font-weight:700}.gm-c.rb{border-right:2px solid #15233a}.gm-c.bb{border-bottom:2px solid #15233a}.gm-c.pe{background:#eef1f7}.gm-c.same{background:#dfe6f3}.gm-c.sel{background:#f3e3b5}.gm-c.bad{color:#b8463d;background:#fbe3e0}
.gm-c .nt{display:grid;grid-template-columns:repeat(3,1fr);width:100%;height:100%;font-size:9px;line-height:1;color:#555e6e;font-weight:600}.gm-c .nt i{font-style:normal;display:flex;align-items:center;justify-content:center}
.gm-pad{display:grid;grid-template-columns:repeat(9,1fr);gap:4px}.gm-pad .gm-btn{padding:0;min-height:50px;font-size:20px}
.gm-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.gm-tools .gm-btn{padding:0 4px;font-size:13px}
.gm-b48{display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,1fr);gap:8px;padding:8px;border-radius:14px;background:#b9ad9e;width:100%;aspect-ratio:1/1;touch-action:none;box-sizing:border-box}
.gm-t{border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px;background:rgba(238,228,218,.35);color:#776e65}
.gm-t.l3{font-size:24px}.gm-t.l4{font-size:19px}.gm-t.l5{font-size:15px}
.gm-dpad{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.gm-dpad .gm-btn{font-size:22px}
.gm-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.gm-m{border:0;border-radius:12px;aspect-ratio:1/1;font-size:34px;background:#15233a;color:#fff;display:flex;align-items:center;justify-content:center;padding:0}
.gm-m.up{background:#fff;box-shadow:inset 0 0 0 2px rgba(21,35,58,.15)}.gm-m.ok{background:#e3f1e6;box-shadow:inset 0 0 0 2px #2f8a5b}
.gm-ms{display:grid;width:100%;gap:2px;touch-action:manipulation}.gm-s{border:0;border-radius:5px;aspect-ratio:1/1;padding:0;background:#c9d1df;font-size:17px;font-weight:800;display:flex;align-items:center;justify-content:center;min-width:0}
.gm-s.o{background:#f2f4f8;cursor:default}.gm-s.x{background:#f5c9c3}.gm-s.n1{color:#2f6fb0}.gm-s.n2{color:#2f8a5b}.gm-s.n3{color:#b8463d}.gm-s.n4{color:#6b4f8a}.gm-s.n5,.gm-s.n6,.gm-s.n7,.gm-s.n8{color:#8a6a26}
.gm-ws{display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr);width:100%;aspect-ratio:1/1;background:#fff;border-radius:12px;box-shadow:inset 0 0 0 1px rgba(21,35,58,.15);touch-action:none;-webkit-user-select:none;user-select:none}
.gm-w{display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;border-radius:50%;margin:2px;min-width:0}.gm-w.pick{background:#f3e3b5}.gm-w.fd{background:#cfe7d6;color:#14532d}
.gm-words{display:flex;flex-wrap:wrap;gap:6px}.gm-words span{padding:5px 10px;border-radius:99px;background:rgba(21,35,58,.07);font-size:13px;font-weight:600}.gm-words span.fd{background:#cfe7d6;text-decoration:line-through;opacity:.8}
.gm-win{background:linear-gradient(140deg,#1f8a3c,#1f63b4);color:#fff;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;font-weight:600}.gm-win .gm-btn{background:rgba(255,255,255,.2);color:#fff}
.gm-note{font-size:12px;opacity:.65;text-align:center}
.gm-sec{font-size:12px;font-weight:800;letter-spacing:.08em;color:#4c5566;margin:6px 2px -4px}
.gm-pop{display:grid;grid-template-columns:1fr 1fr;gap:10px}.gm-pop .gm-card:first-child{grid-column:1/-1}.gm-pop .gm-card .e svg{width:38px;height:38px}
.gm-chessbox{background:#fff;border-radius:18px;padding:12px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 0 rgba(21,35,58,.08),0 10px 24px -16px rgba(21,35,58,.5)}
.gm-chessbox .gm-card{box-shadow:none;background:rgba(21,35,58,.05);min-height:84px;flex-direction:row;align-items:center;gap:12px}.gm-chessbox .gm-card .t{display:flex;flex-direction:column;gap:2px}
.gm-chips{display:flex;flex-wrap:wrap;gap:8px}.gm-chip{border:0;border-radius:99px;padding:0 14px;min-height:44px;background:#15233a;color:#fff;font-weight:600;font-size:14px;display:inline-flex;align-items:center}
a.gm-link{border-radius:99px;padding:0 14px;min-height:44px;font-weight:700;font-size:14px;display:inline-flex;align-items:center;color:#15233a;border:2px solid #15233a;text-decoration:none;box-sizing:border-box}
.gm-bk{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;width:100%;aspect-ratio:1/1;padding:4px;box-sizing:border-box;border-radius:12px;background:#c9d1df;touch-action:none}
.gm-bc{border:0;border-radius:5px;padding:0;background:#f2f4f8;min-width:0}.gm-bc.f{background:#2f6fb0}.gm-bc.ok{background:#9cc3e8}.gm-bc.no{background:#e9b0aa}.gm-bc.clr{animation:gm-clr .35s ease-out}
@keyframes gm-clr{from{background:#2f6fb0}to{background:#f2f4f8}}
.gm-ghost{position:fixed;z-index:9999;pointer-events:none;display:grid;gap:2px;opacity:.85}.gm-ghost b{background:#2f6fb0;border-radius:5px;display:block}.gm-ghost b.o{background:transparent}
.gm-pc.drag{opacity:.3}
.gm-tray{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.gm-pc{border:0;border-radius:14px;background:#fff;min-height:96px;display:flex;align-items:center;justify-content:center;touch-action:none;box-shadow:inset 0 0 0 2px rgba(21,35,58,.12)}
.gm-pc[aria-pressed=true]{box-shadow:inset 0 0 0 3px #c19a4b;background:#fbf3de}.gm-pc:disabled{opacity:.25}.gm-pc i{display:grid;gap:2px}.gm-pc b{width:16px;height:16px;border-radius:4px;background:#2f6fb0;display:block}.gm-pc b.o{background:transparent}
.gm-wd{display:grid;grid-template-rows:repeat(6,1fr);gap:6px}.gm-wr{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.gm-wt{aspect-ratio:1/1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;text-transform:uppercase;background:#fff;box-shadow:inset 0 0 0 2px rgba(21,35,58,.18);position:relative}
.gm-wt.fill{box-shadow:inset 0 0 0 2px #15233a}.gm-wt[data-m=g],.gm-key[data-m=g]{background:#2f7d4f;color:#fff;box-shadow:none}.gm-wt[data-m=y],.gm-key[data-m=y]{background:#f1d58a;color:#15233a;box-shadow:none}.gm-wt[data-m=x],.gm-key[data-m=x]{background:#5b6577;color:#fff;box-shadow:none}
.gm-wt.flip{animation:gm-flip .5s ease-in-out both;animation-delay:calc(var(--k)*.12s)}.gm-wr.shake{animation:gm-shake .35s}
@keyframes gm-flip{0%{transform:rotateX(0)}50%{transform:rotateX(90deg)}100%{transform:rotateX(0)}}
@keyframes gm-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.gm-wt i{position:absolute;top:3px;right:6px;font-size:11px;font-style:normal;font-weight:700}
.gm-kb{display:flex;flex-direction:column;gap:6px}.gm-kr{display:flex;gap:4px;justify-content:center}.gm-key{border:0;border-radius:8px;flex:1 1 0;min-width:0;min-height:48px;padding:0;background:rgba(21,35,58,.1);font-weight:700;font-size:15px;text-transform:uppercase}.gm-key.wide{flex:1.6 1 0;font-size:12px}
.gm-snk{width:100%;aspect-ratio:1/1;display:block;border-radius:12px;background:#15233a;touch-action:none}
.gm-sdp{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:240px;margin:0 auto;width:100%}.gm-sdp .gm-btn{min-height:48px;font-size:22px}
@media (prefers-reduced-motion:reduce){.gm *{animation:none!important;transition:none!important}}`;

  let inst = null, snkKeep = null; // snkKeep: an unfinished Snake game survives leaving the Games screen (kept paused)
  function unmount() {
    if (!inst) return; const G = inst; inst = null;
    snkKeep = G.snk && !G.snk.over && G.snkStarted ? G.snk : null; blkDragEnd(G);
    fold(G); save(G); clearInterval(G.iv); clearInterval(G.sv); clearTimeout(G.mt); stopCards(G); G.off.forEach(f => f()); if (root.Chess953) root.Chess953.unmount(); const s = document.getElementById('gm-css'); if (s) s.remove(); try { G.host.innerHTML = ''; } catch (e) { /* host already gone */ }
  }
  const reported = new WeakSet();
  // a finished game: tell the app once (it sends the score to the house board when signed in) and remember it for the Challenge button
  function report(G, key, value, obj) { if (obj) { if (reported.has(obj)) return; reported.add(obj); } if (key !== 'ws' && !NEW_VIEWS.includes(key)) G.fin = { view: G.view, key, value }; if (G.opts.onScore) { try { G.opts.onScore(key, value); } catch (e) { /* the board is optional */ } } }
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
    on(host, 'pointercancel', () => { G.drag = null; blkDragEnd(G); G.ss = null; G.sw = null; clearTimeout(G.lp); paintSel(G); });
    on(document, 'keydown', e => { if (G.view !== 'g48' || G.pick || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return; const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key]; if (d) { e.preventDefault(); move48(G, d); } });
    on(document, 'keydown', e => onKey(G, e));
    on(document, 'visibilitychange', () => { if (document.hidden) { fold(G); save(G); clearInterval(G.iv); G.iv = 0; if (G.view === 'snake' && G.snkRun) { snkRunning(G, false); render(G); } } else startTimer(G); });
    on(window, 'pagehide', () => { fold(G); save(G); });
    render(G);
  }

  function render(G) {
    clearTimeout(G.lp); fold(G);
    const S = G.store, v = G.view;
    stopCards(G); if (v !== 'snake') snkRunning(G, false);
    let h = '';
    if (v === 'home') h = homeHtml(S, G);
    else {
      const name = CARDS.find(c => c[0] === v)[2], immediate = v === 'g48' || v === 'ws';
      h = '<div class="gm-top"><button class="gm-btn" data-a="home" aria-label="Back to Games">‹ Games</button><h2>' + name + '</h2>' + (v === 'chess' || v === 'word' || CARD_GAMES.includes(v) ? '<span style="min-width:72px"></span>' : '<button class="gm-btn" data-a="new">' + (v === 'g48' ? 'New game' : 'New') + '</button>') + '</div>';
      h += G.making ? '<div class="gm-note" role="status">Making puzzle...</div>' : v === 'chess' ? '<div data-chess-host="1"></div>' : v === 'block' ? blockHtml(G) : v === 'word' ? wordHtml(G) : v === 'snake' ? snakeHtml(G) : CARD_GAMES.includes(v) ? '<div data-cards-host="1"></div>' : G.pick ? pickHtml(G) : v === 'sdk' ? sdkHtml(G) : v === 'g48' ? g48Html(G) : v === 'mem' ? memHtml(G) : v === 'mine' ? mineHtml(G) : wsHtml(G);
      if (!CARD_GAMES.includes(v)) h += '<details class="gm-how"><summary>How to play</summary>' + esc(HOW[v]) + '</details>';
    }
    if (v !== 'chess' && root.Chess953) root.Chess953.unmount();
    if (v !== 'home' && v !== 'chess' && G.fin && G.fin.view === v && G.opts.onChallenge) h += '<button class="gm-btn pri" data-a="chal">Challenge a housemate to beat this</button>';
    G.host.innerHTML = '<div class="gm">' + h + '</div>';
    if (v === 'chess' && root.Chess953) { const ch = G.host.querySelector('[data-chess-host]'); if (ch) root.Chess953.mount(ch, { onChallenge: G.opts.onChallenge && (k => G.opts.onChallenge(k, 0)), track: G.track }); else G.host.textContent = 'Chess could not load. Reload the app.'; }
    if (CARD_GAMES.includes(v)) mountCards(G, v);
    if (v === 'snake') drawSnake(G);
    if (v === 'sdk' && !G.pick && !G.making && G.sel >= 0) { const el = G.host.querySelector('[data-i="' + G.sel + '"]'); if (el) el.focus({ preventScroll: true }); }
    startTimer(G);
  }

  function homeHtml(S, G) {
    const today = X.manilaDate(), wd = S.word.cur, wToday = wd && wd.d === today ? wd : null;
    const prog = { sdk: S.sdk.cur && !S.sdk.cur.done, g48: S.g48.cur && !X.g48Over(S.g48.cur.b), mem: S.mem.cur && !S.mem.cur.fin, mine: S.mine.cur && S.mine.cur.st === 'play' && S.mine.cur.mines, ws: S.ws.cur && !S.ws.cur.done, chess: root.Chess953 && root.Chess953.inProgress(),
      block: S.block.cur && !S.block.cur.over && S.block.cur.sc > 0, word: wToday && !wToday.done && wToday.rows.length > 0 };
    const b = S.sdk.best, bm = S.mine.best, mm = S.mem.best;
    const best = {
      sdk: ['easy', 'medium', 'hard'].filter(k => b[k]).map(k => k[0].toUpperCase() + ' ' + fmt(b[k])).join(' · '),
      g48: S.g48.best ? 'Best ' + S.g48.best : '', mem: ['s', 'm', 'l'].filter(k => mm[k]).map(k => k.toUpperCase() + ' ' + mm[k] + ' moves').join(' · '),
      mine: ['s', 'm', 'l'].filter(k => bm[k]).map(k => k.toUpperCase() + ' ' + fmt(bm[k])).join(' · '), ws: S.ws.best ? 'Best ' + fmt(S.ws.best) + ' · ' + S.ws.n + ' solved' : '',
      block: S.block.best ? 'Best ' + S.block.best : '', snake: S.snake.best ? 'Best ' + S.snake.best : '',
      word: wToday && wToday.done ? (wToday.won ? 'Solved today in ' + wToday.rows.length : 'Missed today') : 'Same word for the house',
      sol: 'Klondike, draw 1 or 3', tongits: 'You and 2 computer players'
    };
    const tile = (k, small) => { const n = CARDS.find(c => c[0] === k)[2];
      return '<button class="gm-card" data-a="open" data-g="' + k + '" aria-label="' + n + (prog[k] ? ', in progress' : '') + '"><span class="e" aria-hidden="true">' + (ICONS[k] || CARDS.find(c => c[0] === k)[1]) + '</span><b>' + n + '</b>' + (prog[k] ? '<span class="gm-pill">Continue</span>' : '') + '<small>' + esc(best[k] || 'No best yet') + '</small></button>'; };
    const chessIcon = root.Chess953 && root.Chess953.icon ? root.Chess953.icon() : '♞';
    const chess = '<div class="gm-chessbox" data-gm="chess"><button class="gm-card" data-a="open" data-g="chess" aria-label="Chess' + (prog.chess ? ', in progress' : '') + '"><span class="e" aria-hidden="true">' + chessIcon + '</span><span class="t"><b>Chess</b>' + (prog.chess ? '<span class="gm-pill">Continue</span>' : '') + '<small>Computer, a friend, or online</small></span></button>' +
      '<div class="gm-chips"><button class="gm-chip" data-a="chip" data-c="cpu">Play the computer</button><button class="gm-chip" data-a="chip" data-c="two">Two players on this phone</button>' + (G.opts.onChallenge ? '<button class="gm-chip" data-a="chip" data-c="chal">Challenge a housemate on Lichess</button>' : '') + '</div>' +
      '<a class="gm-link" href="https://www.chess.com/play" target="_blank" rel="noopener">Open chess.com</a></div>';
    return '<div class="gm-note">' + (G.opts.onScore ? 'Plays offline. Finished games also add to the house leaderboard.' : 'Plays offline. Scores stay on this phone.') + '</div>' +
      '<div class="gm-sec">MOST PLAYED</div><div class="gm-pop" data-gm="popular">' + POPULAR.map(k => tile(k)).join('') + '</div>' +
      '<div class="gm-sec">CHESS</div>' + chess +
      '<div class="gm-sec">ALSO HERE</div><div class="gm-home" data-gm="also">' + ALSO.map(k => tile(k)).join('') + (G.opts.onBoard ? '<button class="gm-card wide" data-a="board" aria-label="Leaderboard and challenges"><span class="e" aria-hidden="true">🏆</span><b>Leaderboard and challenges</b><small>Steps, game scores and chess wins in the house</small></button>' : '') + '</div>';
  }

  // ----- v18.8 entry points: open a new-style game, the chess shortcuts, a fresh round -----
  const rseed = () => String(Math.floor(Math.random() * 1e9));
  function openChess(G) { G.view = 'chess'; G.pick = false; G.msg = ''; G.fin = null; if (G.track) G.track('chess'); render(G); }
  function chip(G, c) {
    if (c === 'chal') { if (G.opts.onChallenge) G.opts.onChallenge('chess', 0); return; }
    const saved = !!(root.Chess953 && root.Chess953.inProgress()); openChess(G);
    const q = sel => G.host.querySelector(sel);
    if (!q('[data-ch="start"]')) { const nb = q('[data-ch="new"]'); if (nb) nb.click(); } // a game is saved: show the picker (its Back to my game button keeps it), never resume it silently
    if (c === 'two' && !saved) { const btn = q('[data-ch="start"][data-mode="two"]'); if (btn) btn.click(); } // nothing to lose: start the mode the chip names
  }
  function openNew(G, v) {
    const S = G.store; G.view = v; G.pick = false; G.msg = ''; G.fin = null; G.bsel = -1; G.bd = null; G.wbuf = ''; G.wfk = null;
    if (v === 'block' && (!S.block.cur || S.block.cur.over)) S.block.cur = X.blkNew(rseed());
    if (v === 'word') { const d = X.manilaDate(); if (!S.word.cur || S.word.cur.d !== d) S.word.cur = X.wdNew(d); }
    if (v === 'snake') { snkRunning(G, false); const k = G.snk && !G.snk.over ? G.snk : snkKeep && !snkKeep.over ? snkKeep : null; G.snk = k || X.snkNew(rseed()); G.snkStarted = !!k; }
    if (G.track) G.track(v); save(G); render(G);
  }
  function newRound(G) {
    G.msg = ''; G.bsel = -1; snkKeep = null; // a New game never brings back a kept one
    if (G.view === 'block') G.store.block.cur = X.blkNew(rseed());
    else { snkRunning(G, false); G.snk = X.snkNew(rseed()); G.snkStarted = false; }
    save(G); render(G);
  }

  // ----- Card games (cards.js builds window.CardsUI; absent offline before its first load) -----
  function mountCards(G, v) {
    const el = G.host.querySelector('[data-cards-host]'); if (!el) return;
    if (!root.CardsUI || typeof root.CardsUI.mount !== 'function') { el.innerHTML = '<div class="gm-note" role="status">Opens after the next online visit</div>'; return; }
    // window.CardsUI.mount(host, key, opts) -> { stop() }.  key: 'sol' | 'tongits'.
    // opts = { onScore(key, value), onExit(), track(key), reduced, day }
    //   onScore: same function games.js uses for its own games; call once per finished game with a positive integer (key 'sol' or 'tongits'); the app sends it to the house board when signed in. Never throws.
    //   onExit: the game's own "Back to Games" button calls it; games.js then shows the hub and calls stop().
    //   track: analytics hook, optional. reduced: true when prefers-reduced-motion is on. day: Manila date 'YYYY-MM-DD' for the shared daily deal.
    try {
      G.cards = root.CardsUI.mount(el, v, {
        onScore: (k, val) => { if (inst === G && G.opts.onScore) { try { G.opts.onScore(k, val); } catch (e) { /* the board is optional */ } } },
        onExit: () => { if (inst !== G) return; G.view = 'home'; G.msg = ''; render(G); },
        track: G.track, reduced: reduced(), day: X.manilaDate()
      });
    } catch (e) { el.innerHTML = '<div class="gm-note" role="status">This game could not start. Reload the app.</div>'; }
  }
  function stopCards(G) { const c = G.cards; G.cards = null; if (c && typeof c.stop === 'function') { try { c.stop(); } catch (e) { /* already gone */ } } }

  // ----- Block puzzle -----
  function blockHtml(G) {
    const S = G.store.block, c = S.cur;
    const clr = G.clr; G.clr = null; let h = '<div class="gm-bar"><span>Score ' + c.sc + '</span><span>Best ' + S.best + '</span></div>';
    h += '<div class="gm-bk" data-nogesture="1" data-board="1" role="group" aria-label="Block puzzle board">';
    for (let i = 0; i < 64; i++) h += '<button class="gm-bc' + (c.g[i] ? ' f' : clr && clr.has(i) ? ' clr' : '') + '" data-a="bcell" data-r="' + ((i / 8) | 0) + '" data-c="' + (i % 8) + '" aria-label="Row ' + (((i / 8) | 0) + 1) + ', column ' + ((i % 8) + 1) + ', ' + (c.g[i] ? 'filled' : 'empty') + '"></button>';
    h += '</div><div class="gm-tray" data-nogesture="1" role="group" aria-label="Pieces">';
    c.pcs.forEach((si, p) => {
      if (si < 0) { h += '<button class="gm-pc" disabled aria-label="Piece ' + (p + 1) + ', placed"></button>'; return; }
      const sz = X.blkSize(si), on = new Set(X.BLK_SHAPES[si].map(q => q[0] * 10 + q[1])); let cells = '';
      for (let r = 0; r < sz.h; r++) for (let k = 0; k < sz.w; k++) cells += '<b class="' + (on.has(r * 10 + k) ? '' : 'o') + '"></b>';
      h += '<button class="gm-pc" data-a="bpc" data-p="' + p + '" aria-pressed="' + (G.bsel === p) + '" aria-label="Piece ' + (p + 1) + ', ' + X.BLK_SHAPES[si].length + ' squares, ' + (G.bsel === p ? 'selected' : 'tap to select') + '"><i style="grid-template-columns:repeat(' + sz.w + ',16px)">' + cells + '</i></button>';
    });
    h += '</div><div class="gm-note" role="status">' + esc(G.msg || (G.bsel >= 0 ? 'Tap a square on the board to place the piece.' : 'Drag a piece onto the board, or tap it first.')) + '</div>';
    if (c.over) h += '<div class="gm-win"><div>No more room. Score ' + c.sc + '.' + (G.bmsg || '') + '</div><button class="gm-btn" data-a="new">New game</button></div>';
    return h;
  }
  const blkAnchor = (si, r, c) => { const z = X.blkSize(si); return [r - ((z.h - 1) >> 1), c - ((z.w - 1) >> 1)]; }; // the tapped square is the middle of the piece
  function placeBlock(G, p, r0, c0) {
    const S = G.store.block, c = S.cur, si = c.pcs[p], clr = si >= 0 && X.blkFits(c.g, si, r0, c0) ? X.blkClearing(c.g, si, r0, c0) : [], res = X.blkPlace(c, p, r0, c0);
    if (!res) { G.msg = 'That piece does not fit there. Drop it on empty squares inside the board.'; G.bsel = -1; return render(G); }
    G.msg = ''; G.bsel = -1; G.bmsg = ''; G.clr = clr.length && !reduced() ? new Set(clr) : null;
    if (c.sc > S.best) { S.best = c.sc; G.bmsg = ' New best!'; }
    if (c.over) report(G, 'block', c.sc, c);
    save(G); render(G);
  }
  function paintBlock(G) {
    G.host.querySelectorAll('.gm-bc.ok,.gm-bc.no').forEach(el => el.classList.remove('ok', 'no'));
    const d = G.bd; if (!d || !d.on || !d.at) return;
    const c = G.store.block.cur, si = c.pcs[d.p], ok = X.blkFits(c.g, si, d.at[0], d.at[1]);
    X.BLK_SHAPES[si].forEach(([dr, dc]) => { const el = G.host.querySelector('.gm-bc[data-r="' + (d.at[0] + dr) + '"][data-c="' + (d.at[1] + dc) + '"]'); if (el) el.classList.add(ok ? 'ok' : 'no'); });
  }
  function blkDragEnd(G) { // drop, cancel or leave: no ghost, no preview, no dimmed piece
    G.bd = null; if (G.gh) { G.gh.remove(); G.gh = null; }
    if (G.host) { G.host.querySelectorAll('.gm-pc.drag').forEach(el => el.classList.remove('drag')); paintBlock(G); }
  }
  function blkGhost(G, e) { // a copy of the piece follows the finger, drawn where a drop would put it (two squares above the finger)
    const d = G.bd, b = G.host.querySelector('.gm-bk'); if (!d || !b) return;
    const si = G.store.block.cur.pcs[d.p], z = X.blkSize(si), s = (b.getBoundingClientRect().width - 8) / 8; let g = G.gh;
    if (!g) {
      const on = new Set(X.BLK_SHAPES[si].map(q => q[0] * 10 + q[1])); g = G.gh = document.createElement('div'); g.className = 'gm-ghost'; g.setAttribute('aria-hidden', 'true');
      g.style.gridTemplateColumns = 'repeat(' + z.w + ',' + (s - 2) + 'px)'; g.style.gridAutoRows = (s - 2) + 'px';
      for (let r = 0; r < z.h; r++) for (let k = 0; k < z.w; k++) g.insertAdjacentHTML('beforeend', '<b' + (on.has(r * 10 + k) ? '' : ' class="o"') + '></b>');
      document.body.appendChild(g);
    }
    g.style.left = (e.clientX - s * (((z.w - 1) >> 1) + .5)) + 'px'; g.style.top = (e.clientY - 2 * s - s * (((z.h - 1) >> 1) + .5)) + 'px';
  }
  function dragCell(G, e) { // board square under the finger, lifted two squares so the piece is not hidden by it
    const b = G.host.querySelector('.gm-bk'); if (!b) return null; const r = b.getBoundingClientRect(), s = (r.width - 8) / 8, si = G.store.block.cur.pcs[G.bd.p];
    return blkAnchor(si, Math.floor((e.clientY - r.top - 4) / s) - 2, Math.floor((e.clientX - r.left - 4) / s));
  }

  // ----- Daily word -----
  const WK_ROWS = ['qwertyuiop', 'asdfghjkl', '>zxcvbnm<'], MARK_TXT = { g: 'right spot', y: 'in the word, wrong spot', x: 'not in the word' }, MARK_GLYPH = { g: '✓', y: '•', x: '×' };
  function wordHtml(G) {
    const c = G.store.word.cur, ans = X.wdAnswer(c.d), keys = X.wdKeys(c), buf = G.wbuf || '', an = G.anim; G.anim = null;
    let h = '<div class="gm-bar"><span>' + c.d + '</span><span>Try ' + Math.min(c.rows.length + (c.done ? 0 : 1), 6) + ' of 6</span></div><div class="gm-wd" data-nogesture="1" role="group" aria-label="Daily word board">';
    for (let r = 0; r < 6; r++) {
      const w = c.rows[r], marks = w ? X.wdMark(w, ans) : null; h += '<div class="gm-wr' + (an && an.kind === 'shake' && an.row === r ? ' shake' : '') + '" data-row="' + r + '">';
      for (let k = 0; k < 5; k++) {
        const ch = w ? w[k] : (r === c.rows.length && !c.done ? buf[k] || '' : '');
        h += '<div class="gm-wt' + (ch && !w ? ' fill' : '') + (marks && an && an.kind === 'flip' && an.row === r ? ' flip' : '') + '"' + (marks ? ' data-m="' + marks[k] + '" style="--k:' + k + '"' : '') + ' aria-label="Row ' + (r + 1) + ', letter ' + (k + 1) + ', ' + (ch ? ch.toUpperCase() + (marks ? ', ' + MARK_TXT[marks[k]] : '') : 'empty') + '">' + ch + (marks ? '<i aria-hidden="true">' + MARK_GLYPH[marks[k]] + '</i>' : '') + '</div>';
      }
      h += '</div>';
    }
    h += '</div><div class="gm-note" role="status">' + esc(G.msg || (c.done ? '' : 'Type or tap a 5-letter word.')) + '</div>';
    if (c.done) { h += '<div class="gm-win"><div>' + (c.won ? 'Solved in ' + c.rows.length + (c.rows.length === 1 ? ' try.' : ' tries.') : 'Not this time. The word was ' + ans.toUpperCase() + '.') + ' A new word arrives tomorrow (Manila time).' + (G.bmsg || '') + '</div>' + wordStatsHtml(G) + '<button class="gm-btn" data-a="wcopy">Copy result</button></div>'; return h; }
    h += '<div class="gm-kb" data-nogesture="1">' + WK_ROWS.map(row => '<div class="gm-kr">' + row.split('').map(k => k === '>' ? '<button class="gm-key wide" data-a="wk" data-k=">" aria-label="Enter">Enter</button>' : k === '<' ? '<button class="gm-key wide" data-a="wk" data-k="<" aria-label="Delete">⌫</button>' :
      '<button class="gm-key" data-a="wk" data-k="' + k + '"' + (keys[k] ? ' data-m="' + keys[k] + '"' : '') + ' aria-label="' + k.toUpperCase() + (keys[k] ? ', ' + MARK_TXT[keys[k]] : '') + '">' + k + '</button>').join('') + '</div>').join('') + '</div>';
    return h;
  }
  function wordStatsHtml(G) {
    const st = X.wdStats(G.store.word, X.manilaDate());
    return '<div class="gm-bar" data-wstats="1" style="gap:8px;flex-wrap:wrap;justify-content:flex-start"><span>Played ' + st.played + '</span><span>Won ' + st.pct + '%</span><span>Streak ' + st.streak + '</span><span>Best streak ' + st.best + '</span></div>';
  }
  function wordKey(G, k) {
    const S = G.store.word, c = S.cur; if (!c || c.done) return; G.msg = ''; G.bmsg = ''; let buf = G.wbuf || '';
    if (k === '<') buf = buf.slice(0, -1);
    else if (k === '>') {
      const r = X.wdGuess(c, buf);
      if (r === 'short') { G.msg = 'Not enough letters'; G.anim = { row: c.rows.length, kind: 'shake' }; }
      else if (r === 'invalid') { G.msg = 'Not in word list'; G.anim = { row: c.rows.length, kind: 'shake' }; }
      else { buf = ''; G.anim = { row: c.rows.length - 1, kind: reduced() ? '' : 'flip' }; if (r === 'won' || r === 'lost') { X.wdRecord(S, r === 'won', c.d); if (r === 'won') report(G, 'word', c.rows.length, c); } save(G); }
    } else if (buf.length < 5) buf += k;
    G.wbuf = buf; render(G);
    if (G.wfk) { const el = G.host.querySelector('[data-a="wk"][data-k="' + G.wfk + '"]'); if (el) el.focus({ preventScroll: true }); }
  }

  // ----- Snake -----
  function snkRunning(G, on) {
    clearInterval(G.sv); G.sv = 0; G.snkRun = !!(on && G.snk && !G.snk.over);
    if (G.snkRun) { G.snkStarted = true; G.sv = setInterval(() => snkTick(G), X.snkSpeed(G.snk.eaten)); }
  }
  function snakeHtml(G) {
    const st = G.snk || (G.snk = X.snkNew(rseed())), S = G.store.snake;
    let h = '<div class="gm-bar"><span>Score <span data-snk-score>' + st.sc + '</span></span><span>Best ' + S.best + '</span></div>';
    h += '<canvas class="gm-snk" data-nogesture="1" data-board="1" width="320" height="320" role="img" aria-label="Snake board, score ' + st.sc + '"></canvas>';
    if (st.over) h += '<div class="gm-win"><div>Game over. Score ' + st.sc + '.' + (G.msg || '') + '</div><button class="gm-btn" data-a="new">New game</button></div>';
    else h += '<button class="gm-btn pri" data-a="snkgo" aria-pressed="' + !!G.snkRun + '">' + (G.snkRun ? 'Pause' : G.snkStarted ? 'Resume' : 'Start') + '</button>';
    if (!st.over) h += '<div class="gm-sdp" data-nogesture="1" role="group" aria-label="Steer">' + [['', ''], ['up', '↑'], ['', ''], ['left', '←'], ['', ''], ['right', '→'], ['', ''], ['down', '↓'], ['', '']].map(([d, a]) => d ? '<button class="gm-btn" data-a="sd" data-d="' + d + '" aria-label="Turn ' + d + '">' + a + '</button>' : '<span></span>').join('') + '</div>';
    return h;
  }
  function drawSnake(G) {
    const cv = G.host.querySelector('canvas.gm-snk'), st = G.snk; if (!cv || !st) return;
    const px = Math.round((cv.clientWidth || 320) * Math.min(3, Math.max(1, root.devicePixelRatio || 1))); if (cv.width !== px) { cv.width = px; cv.height = px; } // sharp on phones with a device pixel ratio above 1
    const x = cv.getContext && cv.getContext('2d'); if (!x) return; const u = cv.width / X.SNK_N, pad = Math.max(1, Math.round(u / 16));
    x.fillStyle = '#15233a'; x.fillRect(0, 0, cv.width, cv.height);
    if (st.food) { x.fillStyle = '#e0584c'; x.beginPath(); x.arc((st.food[1] + .5) * u, (st.food[0] + .5) * u, u * .38, 0, 7); x.fill(); }
    st.body.forEach((p, i) => { x.fillStyle = i ? '#2f8a5b' : '#8fe0ac'; x.beginPath(); if (x.roundRect) x.roundRect(p[1] * u + pad, p[0] * u + pad, u - 2 * pad, u - 2 * pad, u * .25); else x.rect(p[1] * u + pad, p[0] * u + pad, u - 2 * pad, u - 2 * pad); x.fill(); });
    cv.setAttribute('aria-label', 'Snake board, score ' + st.sc);
  }
  function snkTick(G) {
    if (inst !== G || G.view !== 'snake' || !G.snk) return snkRunning(G, false);
    const st = G.snk, prev = st.eaten, r = X.snkStep(st); drawSnake(G);
    const el = G.host.querySelector('[data-snk-score]'); if (el) el.textContent = st.sc;
    if (r.over) { snkRunning(G, false); const S = G.store.snake; G.msg = ''; if (st.sc > S.best) { S.best = st.sc; G.msg = ' New best!'; } if (st.sc > 0) report(G, 'snake', st.sc, st); save(G); render(G); }
    else if (X.snkSpeed(st.eaten) !== X.snkSpeed(prev)) snkRunning(G, true);
  }
  function snkInput(G, d) {
    const st = G.snk; if (!st || st.over || G.view !== 'snake') return;
    const ok = X.snkTurn(st, d) || d === st.dir;
    if (ok && !G.snkRun) { snkRunning(G, true); render(G); }
  }
  function onKey(G, e) {
    if (e.ctrlKey || e.metaKey || e.altKey || G.pick || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
    const onBtn = (e.target || {}).tagName === 'BUTTON';
    if (G.view === 'snake') {
      const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
      if (d) { e.preventDefault(); snkInput(G, d); }
      else if (e.key === ' ' && !onBtn && G.snk && !G.snk.over) { e.preventDefault(); snkRunning(G, !G.snkRun); render(G); }
    } else if (G.view === 'word') {
      if (/^[a-zA-Z]$/.test(e.key)) { G.wfk = null; wordKey(G, e.key.toLowerCase()); }
      else if (e.key === 'Backspace') { e.preventDefault(); G.wfk = null; wordKey(G, '<'); }
      else if (e.key === 'Enter' && !onBtn) { e.preventDefault(); G.wfk = null; wordKey(G, '>'); }
    }
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
    else if (G.view === 'block') { G.noClick = false; const pc = e.target.closest && e.target.closest('[data-a="bpc"]'); if (pc && !pc.disabled) { G.bd = { p: +pc.dataset.p, x: e.clientX, y: e.clientY, on: false, at: null }; try { pc.setPointerCapture(e.pointerId); } catch (x) { /* capture not supported */ } } }
    else if (G.view === 'snake' && e.target.closest && e.target.closest('.gm-snk')) G.ss = { x: e.clientX, y: e.clientY };
    else if (G.view === 'mine' && !G.pick) { const b = e.target.closest && e.target.closest('[data-a="ms"]'); G.lpDone = false; if (b) { const i = +b.dataset.i, x0 = e.clientX, y0 = e.clientY; G.lpPos = [x0, y0]; clearTimeout(G.lp); G.lp = setTimeout(() => { G.lpDone = true; fold(G); if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) { /* no haptics */ } flagMs(G, i); }, 450); } }
  }
  function onMove(G, e) {
    if (G.drag) { const i = cellAt(G, e); if (i >= 0 && i !== G.drag.b) { G.drag.b = i; paintSel(G); } }
    if (G.bd) { if (!G.bd.on && Math.hypot(e.clientX - G.bd.x, e.clientY - G.bd.y) > 8) { G.bd.on = true; G.bsel = G.bd.p; const pe = G.host.querySelector('.gm-pc[data-p="' + G.bd.p + '"]'); if (pe) pe.classList.add('drag'); } if (G.bd.on) { G.bd.at = dragCell(G, e); paintBlock(G); blkGhost(G, e); } }
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
    if (G.bd) { const d = G.bd; blkDragEnd(G); if (d.on) { G.noClick = true; const cur = G.store.block.cur; if (d.at && X.blkFits(cur.g, cur.pcs[d.p], d.at[0], d.at[1])) return placeBlock(G, d.p, d.at[0], d.at[1]); G.bsel = -1; G.msg = d.at && d.at[0] >= -2 && d.at[1] >= -2 && d.at[0] < 8 + 2 && d.at[1] < 8 + 2 ? 'That piece does not fit there. Drop it on empty squares inside the board.' : 'Drop the piece on the board.'; return render(G); } return; }
    if (G.ss) { const dx = e.clientX - G.ss.x, dy = e.clientY - G.ss.y; G.ss = null; if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) snkInput(G, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); return; }
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
    if (a === 'chip') return chip(G, b.dataset.c);
    if (a === 'open' && NEW_VIEWS.includes(b.dataset.g)) return openNew(G, b.dataset.g);
    if (a === 'new' && (G.view === 'block' || G.view === 'snake')) return newRound(G);
    if (G.view === 'block') {
      if (a === 'bpc') { if (G.noClick) { G.noClick = false; return; } G.bsel = G.bsel === +b.dataset.p ? -1 : +b.dataset.p; G.msg = ''; return render(G); }
      if (a === 'bcell') { if (G.bsel < 0) { G.msg = 'Pick a piece first.'; return render(G); } const an = blkAnchor(S.block.cur.pcs[G.bsel], +b.dataset.r, +b.dataset.c); return placeBlock(G, G.bsel, an[0], an[1]); }
    } else if (G.view === 'snake') {
      if (a === 'snkgo') { snkRunning(G, !G.snkRun); return render(G); }
      if (a === 'sd') return snkInput(G, b.dataset.d);
    } else if (G.view === 'word' && a === 'wk') { G.wfk = b.dataset.k; return wordKey(G, b.dataset.k); }
    else if (G.view === 'word' && a === 'wcopy') {
      const txt = X.wdShare(S.word.cur), shown = () => { const pre = document.createElement('pre'); pre.textContent = txt; pre.style.cssText = 'margin:0;font:inherit;white-space:pre-wrap;-webkit-user-select:text;user-select:text'; b.after(pre); b.textContent = 'Select and copy'; };
      try { navigator.clipboard.writeText(txt).then(() => { b.textContent = 'Copied'; }, shown); } catch (x) { shown(); } return;
    }
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
  const GAME_LABEL = { chess: 'Chess', g48: '2048', sdk_easy: 'Sudoku (easy)', sdk_medium: 'Sudoku (medium)', sdk_hard: 'Sudoku (hard)', mine_s: 'Minesweeper (small)', mine_m: 'Minesweeper (medium)', mine_l: 'Minesweeper (large)', mem_s: 'Memory match (small)', mem_m: 'Memory match (medium)', mem_l: 'Memory match (large)', ws: 'Word search', block: 'Block puzzle', word: 'Daily word', snake: 'Snake', sol: 'Solitaire', tongits: 'Tong-its' };
  const BOARD_GAMES = ['g48', 'sdk_easy', 'sdk_medium', 'sdk_hard', 'mine_s', 'mine_m', 'mine_l', 'mem_s', 'mem_m', 'mem_l', 'ws', 'block', 'snake', 'word', 'sol']; // v18.8 (097); Tong-its posts no score
  const CHESS_TIMES = [[503, '5+3', 300, 3], [1005, '10+5', 600, 5], [1510, '15+10', 900, 10]];
  const scoreText = (g, v) => g === 'g48' || g === 'block' || g === 'snake' || g === 'sol' || g === 'tongits' ? v + ' points' : g === 'word' ? v + (v === 1 ? ' try' : ' tries') : /^mem_/.test(g) ? v + ' moves' : fmt(v);
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
