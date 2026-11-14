// Offline card games for the Games hub: Solitaire (Klondike) and Tong-its (3 players: you and two bots). v18.8 lane G2.
// Part 1 (CardsX) is pure logic, node-testable (tests/cards.test.js). Part 2 (CardsUI) draws into one host element: CardsUI.mount(host, 'sol'|'tongits', opts) -> { stop() }.
// opts (the object games.js hands its own games): { onScore(key, value), onExit(), track(name) }; all optional. Scores: 'sol' = moves of a solved deal (lower is better), 'tongits' posts no score (097).
// State stays on the phone in localStorage '953-cards' (its own key, never the games.js store); nothing here talks to the network.
(function (root) {
  'use strict';

  // ---------- seeded random (same recipe as games.js) ----------
  const hashSeed = s => { s = String(s); let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  const rng = seed => { let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; };
  const manilaDate = now => new Date((now == null ? Date.now() : now) + 8 * 3600e3).toISOString().slice(0, 10);
  const range = n => Array.from({ length: n }, (_, i) => i);

  // ---------- cards: id 0..51, suit = id div 13 (spades, hearts, diamonds, clubs), rank = id mod 13 + 1 (1 = ace, 13 = king) ----------
  const SUITS = ['♠', '♥', '♦', '♣'], SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const RANK_NAME = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'];
  const rankOf = c => c % 13 + 1, suitOf = c => (c / 13) | 0, isRed = c => { const s = suitOf(c); return s === 1 || s === 2; };
  const label = c => RANKS[rankOf(c) - 1] + SUITS[suitOf(c)];
  const spoken = c => RANK_NAME[rankOf(c) - 1] + ' of ' + SUIT_NAME[suitOf(c)];
  const pts = c => Math.min(10, rankOf(c)); // Tong-its: ace 1, 2-10 face value, J Q K 10

  // ================= Klondike =================
  // s = { seed, draw (1|3), tab: 7 x [{c, u}] (u = face up), fnd: 4 piles by suit (ascending), stock (top = last), waste (top = last), moves, hist }
  function solDeal(seed, draw) {
    const d = shuffle(range(52), rng('sol|' + seed)), tab = []; let k = 0;
    for (let i = 0; i < 7; i++) { const col = []; for (let j = 0; j <= i; j++) col.push({ c: d[k++], u: j === i }); tab.push(col); }
    return { seed: String(seed), draw: draw === 3 ? 3 : 1, tab, fnd: [[], [], [], []], stock: d.slice(k), waste: [], moves: 0, hist: [] };
  }
  const solSnap = s => JSON.stringify({ tab: s.tab, fnd: s.fnd, stock: s.stock, waste: s.waste, moves: s.moves });
  const solPush = s => { s.hist.push(solSnap(s)); if (s.hist.length > 50) s.hist.shift(); };
  function solUndo(s) { const h = s.hist.pop(); if (!h) return false; Object.assign(s, JSON.parse(h)); return true; }
  const canTab = (s, c, col) => { const t = s.tab[col]; if (!t.length) return rankOf(c) === 13; const top = t[t.length - 1]; return top.u && rankOf(c) === rankOf(top.c) - 1 && isRed(c) !== isRed(top.c); };
  const canFnd = (s, c) => s.fnd[suitOf(c)].length === rankOf(c) - 1;
  // the cards a source names: {t:'w'} waste top, {t:'t',col,idx} a face-up run, {t:'f',suit} a foundation top; null when nothing legal is there
  function solPick(s, f) {
    if (f.t === 'w') return s.waste.length ? [s.waste[s.waste.length - 1]] : null;
    if (f.t === 'f') { const p = s.fnd[f.suit]; return p && p.length ? [p[p.length - 1]] : null; }
    if (f.t === 't') { const col = s.tab[f.col]; if (!col || !(f.idx >= 0) || f.idx >= col.length) return null; const run = col.slice(f.idx); return run.every(x => x.u) ? run.map(x => x.c) : null; }
    return null;
  }
  function solMove(s, f, to) {
    const cs = solPick(s, f); if (!cs) return false;
    for (let i = 1; i < cs.length; i++) if (!(rankOf(cs[i]) === rankOf(cs[i - 1]) - 1 && isRed(cs[i]) !== isRed(cs[i - 1]))) return false;
    if (to.t === 'f') { if (cs.length !== 1 || !canFnd(s, cs[0])) return false; }
    else if (to.t === 't') { if (!canTab(s, cs[0], to.col) || (f.t === 't' && f.col === to.col)) return false; }
    else return false;
    solPush(s);
    if (f.t === 'w') s.waste.pop(); else if (f.t === 'f') s.fnd[f.suit].pop();
    else { const col = s.tab[f.col]; col.length = f.idx; if (col.length) col[col.length - 1].u = true; }
    if (to.t === 'f') s.fnd[suitOf(cs[0])].push(cs[0]); else s.tab[to.col].push(...cs.map(c => ({ c, u: true })));
    s.moves++; return true;
  }
  function solDrawCard(s) {
    if (s.stock.length) { solPush(s); const n = Math.min(s.draw, s.stock.length); for (let i = 0; i < n; i++) s.waste.push(s.stock.pop()); s.moves++; return true; }
    if (s.waste.length) { solPush(s); s.stock = s.waste.slice().reverse(); s.waste = []; s.moves++; return true; }
    return false;
  }
  const solFndTarget = (s, f) => { const cs = solPick(s, f); return cs && cs.length === 1 && f.t !== 'f' && canFnd(s, cs[0]) ? { t: 'f' } : null; };
  const solWon = s => s.fnd.every(p => p.length === 13);
  // the best legal spot for a tap (null: nothing worth doing, so the tap selects the card instead): foundation first, then a tableau column. Only moves that gain something:
  // from the waste always; a run that empties its column or uncovers a face-down card. A king never hops from the bottom of one column to an empty one.
  function solAutoMove(s, f) {
    const cs = f.t === 'f' ? null : solPick(s, f); if (!cs) return null;
    for (let i = 1; i < cs.length; i++) if (!(rankOf(cs[i]) === rankOf(cs[i - 1]) - 1 && isRed(cs[i]) !== isRed(cs[i - 1]))) return null;
    if (cs.length === 1 && canFnd(s, cs[0])) return { t: 'f' };
    const col = f.t === 't' ? s.tab[f.col] : null, gain = f.t === 'w' || f.idx === 0 || !col[f.idx - 1].u;
    if (!gain) return null;
    let empty = null;
    for (let i = 0; i < 7; i++) {
      if ((f.t === 't' && f.col === i) || !canTab(s, cs[0], i)) continue;
      if (s.tab[i].length) return { t: 't', col: i };
      if (f.t !== 't' || f.idx > 0) empty = empty || { t: 't', col: i };
    }
    return empty;
  }
  const solCanFinish = s => !solWon(s) && !s.stock.length && s.tab.every(c => c.every(x => x.u));
  // every card is face up and the stock is empty: send whatever can go to the top row, until nothing more can; returns the moves made
  function solAutoFinish(s) {
    let n = 0;
    for (let moved = solCanFinish(s); moved;) {
      moved = false;
      for (const f of [{ t: 'w' }].concat(s.tab.map((c, i) => ({ t: 't', col: i, idx: c.length - 1 })))) {
        const cs = f.idx < 0 ? null : solPick(s, f);
        if (cs && canFnd(s, cs[0]) && solMove(s, f, { t: 'f' })) { n++; moved = true; break; }
      }
    }
    return n;
  }

  // ================= Tong-its =================
  // S = { hands: 3 x [card], stock, disc (top = last), melds: [{cards, kind, owner}], turn, phase ('draw'|'play'), dealer, over: null | {winner (-1 = tie), kind ('tongits'|'stock'), pts} }
  const NAMES = ['You', 'Bot A', 'Bot B'];
  const handPts = h => h.reduce((a, c) => a + pts(c), 0);
  function isSet(cs) { return cs.length >= 3 && cs.length <= 4 && cs.every(c => rankOf(c) === rankOf(cs[0])) && new Set(cs.map(suitOf)).size === cs.length; }
  function isRun(cs) { if (cs.length < 3 || !cs.every(c => suitOf(c) === suitOf(cs[0]))) return false; const r = cs.map(rankOf).sort((a, b) => a - b); return r.every((x, i) => i === 0 || x === r[i - 1] + 1); } // ace is low only: Q-K-A is not a run
  const meldKind = cs => isSet(cs) ? 'set' : isRun(cs) ? 'run' : null;
  function canSapaw(m, c) {
    if (m.kind === 'set') return m.cards.length < 4 && rankOf(c) === rankOf(m.cards[0]) && !m.cards.some(x => suitOf(x) === suitOf(c));
    const lo = rankOf(m.cards[0]), hi = rankOf(m.cards[m.cards.length - 1]);
    return suitOf(c) === suitOf(m.cards[0]) && (rankOf(c) === lo - 1 || rankOf(c) === hi + 1);
  }
  function tongDeal(seed, dealer) {
    const d = shuffle(range(52), rng('tong|' + seed)), hands = [[], [], []]; let k = 0;
    for (let p = 0; p < 3; p++) { const n = p === dealer ? 13 : 12; hands[p] = d.slice(k, k + n); k += n; }
    return { seed: String(seed), hands, stock: d.slice(k), disc: [], melds: [], turn: dealer, phase: 'play', dealer, over: null }; // the dealer opens by laying down and/or discarding
  }
  // every meld (3+ cards) inside a hand: sets (whole group, and each 3 of a group of 4) and suited runs
  function tongCandidates(hand) {
    const out = [], g = {};
    hand.forEach(c => { (g[rankOf(c)] = g[rankOf(c)] || []).push(c); });
    Object.keys(g).forEach(r => { const a = g[r]; if (a.length === 3) out.push(a.slice()); if (a.length === 4) { out.push(a.slice()); a.forEach((_, i) => out.push(a.filter((x, j) => j !== i))); } });
    for (let s = 0; s < 4; s++) { const cs = hand.filter(c => suitOf(c) === s).sort((a, b) => a - b); for (let i = 0; i < cs.length; i++) for (let j = i + 2; j < cs.length; j++) { const sl = cs.slice(i, j + 1); if (rankOf(sl[sl.length - 1]) - rankOf(sl[0]) === sl.length - 1) out.push(sl); } }
    return out;
  }
  // the set of disjoint melds that removes the most points from a hand
  function tongBest(hand) {
    const idx = new Map(hand.map((c, i) => [c, i])), ms = tongCandidates(hand).map(m => ({ m, mask: m.reduce((a, c) => a | (1 << idx.get(c)), 0), p: handPts(m) }));
    let best = { p: 0, list: [] };
    (function rec(i, mask, p, list) {
      if (p > best.p || (p === best.p && list.length && list.length < best.list.length)) best = { p, list: list.slice() };
      for (let k = i; k < ms.length; k++) if (!(ms[k].mask & mask)) { list.push(ms[k].m); rec(k + 1, mask | ms[k].mask, p + ms[k].p, list); list.pop(); }
    })(0, 0, 0, []);
    return best;
  }
  // the meld a player could lay at once if they took `card` from the discard pile (null: none, so the card may not be taken)
  function tongTakeOptions(hand, card) { // every meld the card makes with the hand, best points first
    const seen = new Set(), out = [];
    tongCandidates(hand.concat(card)).forEach(m => { const k = m.slice().sort((a, b) => a - b).join(); if (m.includes(card) && !seen.has(k)) { seen.add(k); out.push(m); } });
    return out.sort((a, b) => handPts(b) - handPts(a));
  }
  const tongTakeMeld = (hand, card) => tongTakeOptions(hand, card)[0] || null;
  // a saved hand is only trusted when it still adds up: 3 hands + stock + discards + melds = the 52 cards, once each
  function tongSane(S) {
    if (!S || !Array.isArray(S.hands) || S.hands.length !== 3 || !S.hands.every(Array.isArray) || !Array.isArray(S.stock) || !Array.isArray(S.disc) || !Array.isArray(S.melds)) return false;
    if (![0, 1, 2].includes(S.turn) || ![0, 1, 2].includes(S.dealer) || (S.phase !== 'draw' && S.phase !== 'play') || (S.over != null && (typeof S.over !== 'object' || !Array.isArray(S.over.pts)))) return false;
    if (!S.melds.every(m => m && Array.isArray(m.cards) && [0, 1, 2].includes(m.owner) && meldKind(m.cards))) return false;
    const all = [].concat(...S.hands, S.stock, S.disc, ...S.melds.map(m => m.cards));
    return all.length === 52 && all.every(c => Number.isInteger(c) && c >= 0 && c < 52) && new Set(all).size === 52;
  }
  function tongEnd(S, winner, kind, extra) { S.over = Object.assign({ winner, kind, pts: S.hands.map(handPts) }, extra); return true; }
  const exposed = (S, p) => S.melds.some(m => m.owner === p); // a player with no meld on the table is burned: cannot win on points
  function tongEndStock(S) {
    const p = S.hands.map(handPts), burned = p.map((_, i) => !exposed(S, i)), ok = p.map((_, i) => i).filter(i => !burned[i]);
    if (!ok.length) return tongEnd(S, -1, 'stock', { burned });
    const lo = Math.min(...ok.map(i => p[i])), ws = ok.filter(i => p[i] === lo);
    return tongEnd(S, ws.length === 1 ? ws[0] : -1, 'stock', { burned }); // equal lowest = tie, nobody wins
  }
  // Draw (fight): on your turn before drawing, when you have a meld nobody has added to since your last turn. Bots challenge when they have a meld out and few points left, else fold.
  const DRAW_AT = 15;
  const tongCanDraw = (S, p) => !S.over && S.turn === p && S.phase === 'draw' && S.melds.some(m => m.owner === p && !m.hit);
  const tongDrawBot = (S, q) => exposed(S, q) && handPts(S.hands[q]) <= DRAW_AT; // true = challenge
  function tongCallDraw(S, p) {
    if (!tongCanDraw(S, p)) return null;
    const others = [1, 2].map(k => (p + k) % 3), chal = others.filter(q => tongDrawBot(S, q)), folded = others.filter(q => !chal.includes(q));
    let w = p; // lowest points wins; a tie goes to the caller, a tie between challengers to the one who plays first after the caller
    chal.forEach(q => { if (handPts(S.hands[q]) < handPts(S.hands[w])) w = q; });
    tongEnd(S, w, 'draw', { caller: p, challengers: chal, folded }); return S.over;
  }
  function tongDraw(S, p) {
    if (S.over || S.turn !== p || S.phase !== 'draw') return null;
    if (!S.stock.length) { tongEndStock(S); return null; }
    const c = S.stock.pop(); S.hands[p].push(c); S.phase = 'play'; return c;
  }
  function tongLay(S, p, ids) {
    if (S.over || S.turn !== p || S.phase !== 'play' || new Set(ids).size !== ids.length) return false;
    const h = S.hands[p]; if (!ids.every(c => h.includes(c))) return false;
    const kind = meldKind(ids); if (!kind) return false;
    S.hands[p] = h.filter(c => !ids.includes(c)); S.melds.push({ cards: ids.slice().sort((a, b) => a - b), kind, owner: p });
    if (!S.hands[p].length) tongEnd(S, p, 'tongits');
    return true;
  }
  function tongTake(S, p, pick) { // pick: one of tongTakeOptions (as ids); omitted = the best
    if (S.over || S.turn !== p || S.phase !== 'draw' || !S.disc.length) return null;
    const top = S.disc[S.disc.length - 1], opts = tongTakeOptions(S.hands[p], top), key = a => a.slice().sort((x, y) => x - y).join();
    const m = pick ? opts.find(o => key(o) === key(pick)) : opts[0]; if (!m) return null;
    S.disc.pop(); S.hands[p].push(top); S.phase = 'play'; tongLay(S, p, m); return m;
  }
  function tongSapaw(S, p, mi, c) {
    if (S.over || S.turn !== p || S.phase !== 'play' || !S.hands[p].includes(c)) return false;
    const m = S.melds[mi]; if (!m || !canSapaw(m, c)) return false;
    S.hands[p] = S.hands[p].filter(x => x !== c); m.cards.push(c); m.cards.sort((a, b) => a - b); if (p !== m.owner) m.hit = true; // the owner may not call Draw on a meld someone added to
    if (!S.hands[p].length) tongEnd(S, p, 'tongits');
    return true;
  }
  function tongDiscard(S, p, c) {
    if (S.over || S.turn !== p || S.phase !== 'play' || !S.hands[p].includes(c)) return false;
    S.hands[p] = S.hands[p].filter(x => x !== c); S.disc.push(c); S.melds.forEach(m => { if (m.owner === p) m.hit = false; }); // your turn is over: the melds you hold are clean again
    if (!S.hands[p].length) return tongEnd(S, p, 'tongits');
    S.turn = (p + 1) % 3; S.phase = 'draw';
    if (!S.stock.length) tongEndStock(S); // the next player cannot draw: the hand ends, lowest points wins
    return true;
  }
  // keep value of a card for a bot: pairs and suited neighbours are worth keeping
  function keepValue(hand, c) {
    let v = 0;
    hand.forEach(x => { if (x === c) return; if (rankOf(x) === rankOf(c)) v += 2; else if (suitOf(x) === suitOf(c)) { const d = Math.abs(rankOf(x) - rankOf(c)); if (d === 1) v += 1.5; else if (d === 2) v += 1; } });
    return v;
  }
  // one full bot turn (take or draw, lay melds, sapaw, discard); returns the log lines
  function tongBot(S, p) {
    const log = [], N = NAMES[p], show = cs => cs.map(label).join(' ');
    if (S.over || S.turn !== p) return log;
    if (S.phase === 'draw') {
      const top = S.disc[S.disc.length - 1], m = top != null ? tongTakeMeld(S.hands[p], top) : null;
      if (m) { tongTake(S, p); log.push(N + ' took ' + label(top) + ' and laid ' + show(m)); }
      else { if (tongDraw(S, p) == null) { log.push('The stock is empty'); return log; } log.push(N + ' drew a card'); }
    }
    for (const m of tongBest(S.hands[p]).list) { if (S.over) break; if (tongLay(S, p, m)) log.push(N + ' laid ' + show(m)); }
    for (let moved = true; moved && !S.over;) {
      moved = false;
      for (const c of S.hands[p].slice()) { const mi = S.melds.findIndex(m => canSapaw(m, c)); if (mi >= 0 && tongSapaw(S, p, mi, c)) { log.push(N + ' added ' + label(c) + ' to a meld'); moved = true; break; } }
    }
    if (S.over) { log.push(N + ' has no cards left: Tong-its!'); return log; }
    const h = S.hands[p], pick = h.slice().sort((a, b) => keepValue(h, a) - keepValue(h, b) || pts(b) - pts(a))[0];
    tongDiscard(S, p, pick); log.push(N + ' discarded ' + label(pick));
    return log;
  }

  const CardsX = { rng, shuffle, manilaDate, rankOf, suitOf, isRed, label, pts, handPts, NAMES,
    solDeal, solUndo, canTab, canFnd, solPick, solMove, solDrawCard, solFndTarget, solWon, solAutoMove, solCanFinish, solAutoFinish,
    isSet, isRun, meldKind, canSapaw, tongDeal, tongCandidates, tongBest, tongTakeMeld, tongTakeOptions, tongSane, tongCanDraw, tongCallDraw, DRAW_AT, tongDraw, tongLay, tongTake, tongSapaw, tongDiscard, tongEndStock, tongBot };
  if (typeof module !== 'undefined' && module.exports) module.exports = { CardsX };
  root.CardsX = CardsX;

  // ================= Part 2: UI (browser only) =================
  if (typeof document === 'undefined') return;
  const X = CardsX, KEY = '953-cards';
  const CSS = `.cd{padding:14px;display:flex;flex-direction:column;gap:12px;color:#15233a;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.cd :where(button){font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.cd-top{display:flex;align-items:center;gap:8px}.cd-top h2{flex:1;margin:0;font-size:17px;text-align:center}
.cd-btn{border:0;border-radius:12px;padding:0 14px;min-height:44px;background:rgba(21,35,58,.08);font-weight:600;font-size:14px}
.cd-btn.pri{background:#15233a;color:#fff}.cd-btn[aria-pressed=true]{background:#15233a;color:#fff}.cd-btn:disabled{opacity:.4}
.cd-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.cd-tools .cd-btn{padding:0 4px;font-size:13px}
.cd-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.cd-acts .cd-btn{padding:0 4px;font-size:13px}
.cd-bar{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:600}.cd-bar span{font-variant-numeric:tabular-nums}
.cd-note{font-size:12px;opacity:.65;text-align:center}.cd-msg{font-size:14px;font-weight:600;min-height:20px}
.cd-how{font-size:12.5px;line-height:1.45;opacity:.85}.cd-how summary{cursor:pointer;font-weight:600;min-height:28px}.cd-how p{margin:6px 0 0}
.cd-felt{background:#1f6b4a;border-radius:16px;padding:10px 8px 14px;display:flex;flex-direction:column;gap:10px;color:#fff}
.cd-sol{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;align-items:start}
.cd-col{min-height:170px}
.cd-card{display:block;position:relative;width:100%;aspect-ratio:5/7;border:0;border-radius:6px;background:#fff;box-shadow:0 0 0 1px rgba(21,35,58,.3),0 1px 2px rgba(0,0,0,.3);padding:0;font-weight:700;overflow:hidden;text-align:left;color:#15233a}
.cd button.cd-card{color:#15233a}.cd button.cd-card.red{color:#b3261e}
.cd-card .t{position:absolute;left:3px;top:2px;font-size:13px;line-height:1;white-space:nowrap}.cd-card .m{position:absolute;left:0;right:0;bottom:14%;text-align:center;font-size:22px;line-height:1}
.cd-card.red{color:#b3261e}.cd-card.dn{background:repeating-linear-gradient(45deg,#1f63b4 0 4px,#15233a 4px 8px)}
.cd-card.sel{box-shadow:0 0 0 3px #c19a4b,0 2px 6px rgba(0,0,0,.4)}
.cd-col .cd-card+.cd-card{margin-top:-70%}.cd-col .cd-card.dn+.cd-card{margin-top:-118%}
.cd-fan{grid-column:2/span 2;display:flex}.cd-fan .cd-card{flex:0 0 auto;width:calc(50% - 2px)}.cd-fan .cd-card+.cd-card{margin-left:-30%}
.cd-card.take{box-shadow:0 0 0 3px #7fd0ff,0 2px 6px rgba(0,0,0,.4)}.cd-card .tk{position:absolute;left:0;right:0;bottom:0;background:#1f63b4;color:#fff;font-size:11px;font-weight:700;text-align:center;padding:2px 0}
.cd-pick{display:flex;flex-direction:column;gap:6px}.cd-pick .cd-btn{text-align:left;padding:6px 12px}
.cd-slot{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:5/7;border:2px dashed rgba(255,255,255,.4);border-radius:6px;background:transparent;box-sizing:border-box;padding:0;color:rgba(255,255,255,.7);font-size:20px;position:relative}
.cd-slot small{position:absolute;bottom:2px;font-size:10px;font-weight:700}
.cd-win{background:linear-gradient(140deg,#1f8a3c,#1f63b4);color:#fff;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;font-weight:600}.cd-win .cd-btn{background:rgba(255,255,255,.2);color:#fff}
.cd-hand{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.cd-hand .cd-card.sel{transform:translateY(-6px)}
.cd-opp{display:flex;justify-content:space-between;font-size:14px;font-weight:600}
.cd-pile{display:grid;grid-template-columns:repeat(2,minmax(0,64px));gap:12px;justify-content:center}
.cd-melds{display:flex;flex-direction:column;gap:6px}
.cd-meld{display:flex;align-items:center;gap:4px;min-height:44px;width:100%;border:0;border-radius:10px;background:rgba(255,255,255,.14);color:#fff;padding:4px 8px;text-align:left;font-size:12px}
.cd-meld b{min-width:46px}
.cd-mc{display:inline-flex;align-items:center;justify-content:center;width:32px;height:42px;background:#fff;border-radius:5px;font-weight:700;font-size:13px;color:#15233a}.cd-mc.red{color:#b3261e}
.cd-log{font-size:12px;opacity:.9;margin:0;padding:0;list-style:none;max-height:92px;overflow-y:auto;overscroll-behavior:contain}.cd-log li{padding:1px 0}
@media (prefers-reduced-motion:reduce){.cd *{animation:none!important;transition:none!important}}`;

  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const loadStore = () => { let o = null; try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) { o = null; } o = o && typeof o === 'object' ? o : {}; o.sol = o.sol && typeof o.sol === 'object' ? o.sol : {}; o.tg = o.tg && typeof o.tg === 'object' ? o.tg : {}; return o; };
  const sane = s => s && Array.isArray(s.tab) && s.tab.length === 7 && Array.isArray(s.fnd) && s.fnd.length === 4 && Array.isArray(s.stock) && Array.isArray(s.waste) && Array.isArray(s.hist);
  const save = G => { try { localStorage.setItem(KEY, JSON.stringify(G.store)); } catch (e) { /* storage full or blocked: play on without saving */ } };
  const cardBtn = (c, attrs, cls, inner, aria) => '<button class="cd-card' + (isRed(c) ? ' red' : '') + (cls ? ' ' + cls : '') + '" ' + attrs + ' aria-label="' + spoken(c) + (aria || '') + '"><span class="t">' + label(c) + '</span><span class="m">' + SUITS[suitOf(c)] + '</span>' + (inner || '') + '</button>';
  const faceSpan = c => '<span class="cd-card' + (isRed(c) ? ' red' : '') + '" aria-hidden="true"><span class="t">' + label(c) + '</span><span class="m">' + SUITS[suitOf(c)] + '</span></span>';
  const LOGMAX = 30, esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const back = '<span class="cd-card dn" aria-hidden="true"></span>';

  let inst = null;
  function stop() { if (!inst) return; const G = inst; inst = null; clearTimeout(G.timer); G.off.forEach(f => f()); try { G.host.innerHTML = ''; } catch (e) { /* host already gone */ } const s = document.getElementById('cd-css'); if (s) s.remove(); }

  function mount(host, key, opts) {
    stop();
    const store = loadStore(), G = { host, key, opts: opts || {}, store, off: [], timer: 0, sel: null, pend: null, choose: null, msg: '', hsel: [], sortBy: 'suit', log: [] };
    inst = G;
    if (key === 'sol') { const o = store.sol; G.sol = sane(o.cur) ? o.cur : solDeal('d|' + manilaDate(), o.draw === 3 ? 3 : 1); if (!sane(o.cur)) G.sol.daily = true; }
    else {
      G.dealer = Number.isInteger(store.tg.dealer) ? store.tg.dealer % 3 : 0;
      const cur = store.tg.cur; // a hand saved on this phone comes back only when it still adds up to 52 cards
      if (X.tongSane(cur)) { G.tg = cur; G.log = Array.isArray(store.tg.log) ? store.tg.log.slice(0, LOGMAX).map(String) : []; } else G.tg = tongDeal(Date.now(), G.dealer);
    }
    if (!document.getElementById('cd-css')) { const st = document.createElement('style'); st.id = 'cd-css'; st.textContent = CSS; document.head.appendChild(st); }
    const onc = e => onClick(G, e); host.addEventListener('click', onc); G.off.push(() => host.removeEventListener('click', onc));
    render(G);
    if (key === 'tongits') sched(G);
    return { stop };
  }

  const head = (G, title, extra) => '<div class="cd-top"><button class="cd-btn" data-a="exit" aria-label="Back to Games">‹ Games</button><h2>' + title + '</h2>' + extra + '</div>';
  function render(G) {
    const fn = G.key === 'sol' ? solHtml : tongHtml;
    G.host.innerHTML = '<div class="cd">' + fn(G) + '</div>';
  }

  // ---------- Solitaire ----------
  function solHtml(G) {
    const s = G.sol, sel = G.sel, won = solWon(s), st = G.store.sol;
    let h = head(G, 'Solitaire', '<span style="min-width:72px"></span>');
    h += '<div class="cd-bar"><span>Moves ' + s.moves + '</span><span>' + (s.daily ? 'Daily deal' : 'Deal ' + (s.seed.length > 8 ? 'new' : s.seed)) + ' · draw ' + s.draw + '</span>' + (st.best ? '<span>Best ' + st.best + '</span>' : '') + '</div>';
    h += '<div class="cd-felt"><div class="cd-sol">';
    h += '<button class="cd-slot" data-a="stock" aria-label="' + (s.stock.length ? 'Draw, ' + s.stock.length + ' cards left' : s.waste.length ? 'Turn the waste over again' : 'Stock is empty') + '">' + (s.stock.length ? back + '<small>' + s.stock.length + '</small>' : s.waste.length ? '↻' : '') + '</button>';
    const wtop = s.waste.length ? cardBtn(s.waste[s.waste.length - 1], 'data-a="waste"', sel && sel.t === 'w' ? 'sel' : '') : '';
    if (s.draw === 3 && s.waste.length > 1) h += '<div class="cd-fan">' + s.waste.slice(-3, -1).map(faceSpan).join('') + wtop + '</div>'; // draw 3: the top three show, only the top one plays
    else h += (wtop || '<span class="cd-slot" aria-hidden="true"></span>') + '<span></span>';
    for (let u = 0; u < 4; u++) { const p = s.fnd[u]; h += p.length ? cardBtn(p[p.length - 1], 'data-a="fnd" data-s="' + u + '"', sel && sel.t === 'f' && sel.suit === u ? 'sel' : '') : '<button class="cd-slot" data-a="fnd" data-s="' + u + '" aria-label="Foundation for ' + SUIT_NAME[u] + '">' + SUITS[u] + '</button>'; }
    h += '</div><div class="cd-sol">';
    s.tab.forEach((col, ci) => {
      h += '<div class="cd-col" data-a="col" data-col="' + ci + '">';
      if (!col.length) h += '<button class="cd-slot" data-a="col" data-col="' + ci + '" aria-label="Empty column ' + (ci + 1) + '">K</button>';
      col.forEach((x, i) => { h += x.u ? cardBtn(x.c, 'data-a="tc" data-col="' + ci + '" data-idx="' + i + '"', sel && sel.t === 't' && sel.col === ci && i >= sel.idx ? 'sel' : '') : '<span class="cd-card dn" aria-hidden="true"></span>'; });
      h += '</div>';
    });
    h += '</div></div>';
    if (won) h += '<div class="cd-win" role="status">Solved in ' + s.moves + ' moves!<button class="cd-btn" data-a="new">New deal</button></div>';
    else h += '<div class="cd-msg" role="status">' + (G.msg || (sel ? 'Tap where it should go. Tap it again to let go.' : 'Tap a card and it goes to its best spot. If it stays put, tap where it should go.')) + '</div>';
    h += '<div class="cd-tools"><button class="cd-btn pri" data-a="undo"' + (s.hist.length ? '' : ' disabled') + '>Undo</button><button class="cd-btn" data-a="new">' + (G.pend === 'new' ? 'Tap again' : 'New deal') + '</button><button class="cd-btn" data-a="daily">' + (G.pend === 'daily' ? 'Tap again' : 'Daily deal') + '</button><button class="cd-btn" data-a="draw" aria-pressed="' + (st.draw === 3) + '" aria-label="Draw three cards at a time, applies to the next deal">Draw 3</button></div>';
    h += '<details class="cd-how"><summary>How to play</summary><p>Build the four top piles from ace up to king, one suit each. In the seven columns, stack cards downward and alternate red and black: a red 7 takes a black 6. Only a king can go in an empty column. Tap a card and it jumps to its best spot (the top row first); if it does not move, tap where it should go. Tap the stock to turn over cards; a face-down card flips when it is uncovered. When every card is face up and the stock is empty, the game sends cards up by itself as far as it can. The daily deal is the same for everyone today. Draw 3 turns three cards at a time and starts with your next deal.</p></details>';
    return h;
  }
  const same = (a, b) => a && b && a.t === b.t && a.col === b.col && a.idx === b.idx && a.suit === b.suit;
  function afterSol(G) {
    const s = G.sol, o = G.store.sol; o.cur = s;
    if (solWon(s) && !s.paid) { s.paid = true; o.wins = (o.wins || 0) + 1; if (!o.best || s.moves < o.best) o.best = s.moves; if (G.opts.onScore) { try { G.opts.onScore('sol', s.moves); } catch (e) { /* the board is optional */ } } }
    save(G);
  }
  const solBusy = G => G.sol.moves > 0 && !solWon(G.sol); // a deal in progress: New deal asks first
  function afterMove(G) { X.solAutoFinish(G.sol); afterSol(G); }
  function newSol(G, daily) {
    const o = G.store.sol; G.sol = solDeal(daily ? 'd|' + manilaDate() : String(Date.now()), o.draw === 3 ? 3 : 1); if (daily) G.sol.daily = true; G.sel = null; G.msg = ''; afterSol(G);
  }
  function solTap(G, tgt) {
    const s = G.sol;
    if (solWon(s)) return;
    const selectable = t => t.t === 'w' ? s.waste.length > 0 : t.t === 'f' ? s.fnd[t.suit].length > 0 : !!(s.tab[t.col] && s.tab[t.col][t.idx] && s.tab[t.col][t.idx].u);
    G.msg = '';
    if (G.sel) {
      if (same(G.sel, tgt)) { G.sel = null; return; }
      const dest = tgt.t === 'f' ? { t: 'f' } : tgt.t === 't' || tgt.t === 'col' ? { t: 't', col: tgt.col } : null;
      if (dest && solMove(s, G.sel, dest)) { G.sel = null; afterMove(G); return; }
      if (tgt.t !== 'col' && selectable(tgt)) { G.sel = tgt; return; }
      if (dest) G.msg = 'That card cannot go there.';
      return;
    }
    if (tgt.t !== 'col' && selectable(tgt)) { const d = X.solAutoMove(s, tgt); if (d && solMove(s, tgt, d)) afterMove(G); else G.sel = tgt; }
  }

  // ---------- Tong-its ----------
  function tongHtml(G) {
    const S = G.tg, st = G.store.tg, mine = S.hands[0], my = S.turn === 0 && !S.over, drawPhase = my && S.phase === 'draw';
    const top = S.disc[S.disc.length - 1], canTake = drawPhase && top != null && !!X.tongTakeMeld(mine, top);
    const sorted = mine.slice().sort(G.sortBy === 'rank' ? (a, b) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b) : (a, b) => suitOf(a) - suitOf(b) || rankOf(a) - rankOf(b));
    const picked = G.hsel.filter(c => mine.includes(c)), kind = picked.length >= 3 ? meldKind(picked) : null;
    let h = head(G, 'Tong-its', '<span style="min-width:72px"></span>');
    h += '<div class="cd-bar"><span>Your wins ' + (st.wins || 0) + ' of ' + (st.played || 0) + '</span><span>Dealer: ' + NAMES[S.dealer] + '</span><span>Stock ' + S.stock.length + '</span></div>';
    h += '<div class="cd-felt">';
    for (let p = 1; p < 3; p++) h += '<div class="cd-opp"><span>' + NAMES[p] + (S.dealer === p ? ' (dealer)' : '') + (S.turn === p && !S.over ? ' · playing' : '') + '</span><span>' + S.hands[p].length + ' cards</span></div>';
    h += '<div class="cd-pile"><button class="cd-slot" data-a="draw" aria-label="Draw from the stock, ' + S.stock.length + ' left"' + (drawPhase ? '' : ' disabled') + '>' + (S.stock.length ? back + '<small>' + S.stock.length + '</small>' : '') + '</button>';
    h += top != null ? cardBtn(top, 'data-a="take" aria-disabled="' + !canTake + '"' + (canTake ? '' : ' tabindex="-1"'), canTake ? 'take' : '', canTake ? '<span class="tk">Take</span>' : '', canTake ? ', you can take it' : '') : '<span class="cd-slot" aria-hidden="true"></span>';
    h += '</div><div class="cd-melds" aria-label="Melds on the table">';
    if (!S.melds.length) h += '<div class="cd-opp"><span>No melds on the table yet</span></div>';
    S.melds.forEach((m, i) => { h += '<button class="cd-meld" data-a="sapaw" data-m="' + i + '" aria-label="' + NAMES[m.owner] + ' ' + m.kind + ': ' + m.cards.map(spoken).join(', ') + '. Tap to add your selected card"><b>' + NAMES[m.owner] + '</b>' + m.cards.map(c => '<span class="cd-mc' + (isRed(c) ? ' red' : '') + '">' + label(c) + '</span>').join('') + '</button>'; });
    h += '</div></div>';
    if (S.over) {
      const o = S.over, you = o.winner === 0, burned = (o.burned || []).map((b, i) => b ? NAMES[i] : null).filter(Boolean);
      const head1 = o.kind === 'draw' ? NAMES[o.caller] + ' called Draw: ' + (o.challengers.length ? o.challengers.map(q => NAMES[q]).join(' and ') + ' challenged' : 'both others folded') + '. ' + (you ? 'You win' : NAMES[o.winner] + ' wins') + ' with the fewest points.'
        : o.winner < 0 ? 'A tie on points: no winner this hand.' : (you ? 'You win' : NAMES[o.winner] + ' wins') + (o.kind === 'tongits' ? ' with Tong-its: no cards left!' : ' on points.');
      h += '<div class="cd-win" role="status">' + head1 + '<span>Points left in hand: You ' + o.pts[0] + ', Bot A ' + o.pts[1] + ', Bot B ' + o.pts[2] + '</span>' + (burned.length ? '<span>Burned (no meld on the table, cannot win): ' + burned.join(', ') + '</span>' : '') + '<button class="cd-btn" data-a="again">Deal again</button></div>';
    } else h += '<div class="cd-msg" role="status">' + (G.msg || (S.turn !== 0 ? NAMES[S.turn] + ' is playing...' : drawPhase ? 'Your turn: draw from the stock' + (canTake ? ', or take the blue-ringed discard (it makes a meld).' : '.') : 'Lay down melds, add cards to melds on the table, then discard one card.')) + '</div>';
    if (G.choose) h += '<div class="cd-pick" role="group" aria-label="Which meld to lay">' + G.choose.map((m, i) => '<button class="cd-btn" data-a="takeopt" data-i="' + i + '">Take and lay ' + m.slice().sort((a, b) => a - b).map(label).join(' ') + ' (' + handPts(m) + ' pts)</button>').join('') + '<button class="cd-btn" data-a="takecancel">Cancel</button></div>';
    h += '<ul class="cd-log" aria-live="polite" aria-label="Game log" tabindex="0">' + G.log.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>';
    h += '<div class="cd-hand" aria-label="Your hand">' + sorted.map(c => cardBtn(c, 'data-a="hc" data-c="' + c + '"', picked.includes(c) ? 'sel' : '')).join('') + '</div>';
    if (X.tongCanDraw(S, 0)) h += '<button class="cd-btn pri" data-a="fight" aria-label="Call Draw (fight): end the hand now, lowest points win">' + (G.pend === 'fight' ? 'Tap again: Call Draw' : 'Draw (fight)') + '</button>';
    h += '<div class="cd-acts"><button class="cd-btn pri" data-a="lay"' + (my && S.phase === 'play' && kind ? '' : ' disabled') + '>Lay down</button><button class="cd-btn pri" data-a="disc"' + (my && S.phase === 'play' && picked.length === 1 ? '' : ' disabled') + '>Discard</button><button class="cd-btn" data-a="sort">Sort: ' + G.sortBy + '</button></div>';
    h += '<details class="cd-how"><summary>How to play (rules)</summary><p>Three players, 52 cards. The dealer gets 13 cards, the others 12. Goal: empty your hand with melds. A meld is 3 or 4 cards of one rank, or 3+ cards in a row of one suit (ace is low, so A-2-3 works but Q-K-A does not).</p><p>On your turn: draw from the stock, or take the top discard if it makes a meld with your hand (you lay that meld at once). Then lay down melds (tap cards, then Lay down) and add cards to any meld on the table (select, then tap that meld: this is sapaw). End by discarding one card. The dealer opens with a discard. If the discard fits more than one meld, you pick which to lay.</p><p>Empty your hand and you win with Tong-its. If the stock runs out, the player with the fewest points in hand wins (ace 1, J Q K 10, others face value; equal lowest is a tie). A player with no meld on the table is burned and cannot win on points.</p><p>Draw (fight): at the start of your turn, if you have a meld on the table that nobody has added to since your last turn, you may call Draw. Each bot folds or challenges; the lowest points win and a tie goes to you. This version has no betting.</p></details>';
    return h;
  }
  const logAdd = (G, lines) => { G.log = lines.concat(G.log).slice(0, LOGMAX); }; // newest first
  function saveTg(G) { G.store.tg.cur = G.tg; G.store.tg.log = G.log; save(G); } // after every action and bot turn, so leaving the screen keeps the hand
  function finishTg(G) {
    const S = G.tg, st = G.store.tg; if (!S.over || S.paid) { saveTg(G); return; } S.paid = true;
    st.played = (st.played || 0) + 1; if (S.over.winner === 0) st.wins = (st.wins || 0) + 1; st.dealer = (S.dealer + 1) % 3; G.dealer = st.dealer; saveTg(G);
    // Tong-its posts no board score (097): a running win count does not fit the best-per-day board; wins stay on this phone.
  }
  function sched(G) {
    clearTimeout(G.timer); const S = G.tg;
    if (S.over || S.turn === 0) return;
    G.timer = setTimeout(() => { if (inst !== G) return; logAdd(G, X.tongBot(S, S.turn).reverse()); finishTg(G); render(G); sched(G); }, reduced() ? 250 : 700);
  }
  function tgAct(G, a, el) {
    const S = G.tg; if (S.over) return;
    G.msg = ''; if (a !== 'take' && a !== 'takeopt') G.choose = null; if (a !== 'fight') G.pend = null;
    if (a === 'hc') { const c = +el.dataset.c; G.hsel = G.hsel.includes(c) ? G.hsel.filter(x => x !== c) : G.hsel.concat(c); return; }
    if (a === 'sort') { G.sortBy = G.sortBy === 'suit' ? 'rank' : 'suit'; return; }
    if (S.turn !== 0) return;
    const picked = G.hsel.filter(c => S.hands[0].includes(c));
    if (a === 'draw') { if (S.phase === 'draw' && X.tongDraw(S, 0) != null) logAdd(G, [NAMES[0] + ' drew a card']); }
    else if (a === 'take') {
      if (S.phase === 'draw') {
        const opts = X.tongTakeOptions(S.hands[0], S.disc[S.disc.length - 1]);
        if (!opts.length) G.msg = 'You can only take the discard if it makes a meld with your hand.';
        else if (opts.length > 1) { G.choose = opts; G.msg = 'The discard fits more than one meld. Pick the one to lay.'; }
        else { const t = S.disc[S.disc.length - 1]; if (X.tongTake(S, 0, opts[0])) logAdd(G, [NAMES[0] + ' took ' + label(t) + ' and laid ' + opts[0].map(label).join(' ')]); }
      }
    }
    else if (a === 'takeopt') { const m = G.choose && G.choose[+el.dataset.i], t = S.disc[S.disc.length - 1]; G.choose = null; if (m && X.tongTake(S, 0, m)) logAdd(G, [NAMES[0] + ' took ' + label(t) + ' and laid ' + m.map(label).join(' ')]); }
    else if (a === 'takecancel') G.choose = null;
    else if (a === 'fight') {
      if (!X.tongCanDraw(S, 0)) G.msg = 'You can call Draw at the start of your turn when you have a meld nobody has added to.';
      else if (G.pend !== 'fight') { G.pend = 'fight'; G.msg = 'Draw ends the hand now: the lowest points win and a tie goes to you. Tap Call Draw again to make the call.'; }
      else { G.pend = null; const r = X.tongCallDraw(S, 0); if (r) logAdd(G, [NAMES[0] + ' called Draw: ' + (r.challengers.length ? r.challengers.map(q => NAMES[q]).join(' and ') + ' challenged' : 'both others folded')]); }
    }
    else if (a === 'lay') { if (!X.tongLay(S, 0, picked)) G.msg = 'Those cards are not a meld: 3 or 4 of a kind, or 3+ in a row of one suit.'; else { G.hsel = []; logAdd(G, [NAMES[0] + ' laid ' + picked.map(label).join(' ')]); } }
    else if (a === 'sapaw') {
      if (!picked.length) G.msg = 'Select a card from your hand first.';
      else { const mi = +el.dataset.m; let n = 0; picked.forEach(c => { if (X.tongSapaw(S, 0, mi, c)) n++; }); if (n) { G.hsel = G.hsel.filter(c => S.hands[0].includes(c)); logAdd(G, [NAMES[0] + ' added ' + n + ' card' + (n > 1 ? 's' : '') + ' to a meld']); } else G.msg = 'That card does not fit that meld.'; }
    }
    else if (a === 'disc') { if (picked.length === 1 && X.tongDiscard(S, 0, picked[0])) { G.hsel = []; logAdd(G, [NAMES[0] + ' discarded ' + label(picked[0])]); } }
    finishTg(G);
  }

  function onClick(G, e) {
    const b = e.target.closest && e.target.closest('[data-a]'); if (!b || !G.host.contains(b)) return;
    const a = b.dataset.a;
    if (a === 'exit') { if (G.opts.onExit) G.opts.onExit(); return; }
    if (G.key === 'sol') {
      const s = G.sol;
      if (a !== 'new' && a !== 'daily') G.pend = null;
      if (a === 'stock') { G.sel = null; G.msg = ''; if (solDrawCard(s)) afterMove(G); }
      else if (a === 'waste') solTap(G, { t: 'w' });
      else if (a === 'fnd') solTap(G, { t: 'f', suit: +b.dataset.s });
      else if (a === 'tc') solTap(G, { t: 't', col: +b.dataset.col, idx: +b.dataset.idx });
      else if (a === 'col') solTap(G, { t: 'col', col: +b.dataset.col });
      else if (a === 'undo') { G.sel = null; solUndo(s); afterSol(G); }
      else if (a === 'new' || a === 'daily') {
        if (solBusy(G) && G.pend !== a) { G.pend = a; G.msg = 'Tap again to start a new deal. The one you are playing is lost.'; } else { G.pend = null; newSol(G, a === 'daily'); }
      }
      else if (a === 'draw') { G.store.sol.draw = G.store.sol.draw === 3 ? 1 : 3; G.msg = 'Draw ' + G.store.sol.draw + ' starts with your next deal.'; save(G); }
    } else {
      if (a === 'again') { clearTimeout(G.timer); G.tg = tongDeal(Date.now(), G.dealer); G.hsel = []; G.log = []; G.msg = ''; G.pend = null; G.choose = null; saveTg(G); render(G); sched(G); return; }
      tgAct(G, a, b); render(G); sched(G);
      return;
    }
    render(G);
  }

  root.CardsUI = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
