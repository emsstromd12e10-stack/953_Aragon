// Feed personalisation (v16.1, decision A-009): ranks news by what this member opens and reads. Pure functions, no DOM needed for rank().
// Browser: window.FR; Node tests: require('./feed-rank.js'). Scores live on the phone only (localStorage 953-feedsig); only the events in
// docs/v16.1/feed-personalisation.md section 4 go to the house, through the feed_log RPC. Design and hand-computed fixture: same doc.
(function (g) {
  const FR = {};
  const DAY = 864e5, HALF = 14 * DAY, KSHRINK = 8, SIG = '953-feedsig', QUE = '953-feedq', NEWS_KINDS = ['news', 'health', 'food', 'business', 'money', 'ph', 'tech', 'fun', 'careers'];
  const TOPIC_LABEL = { news: 'Seafarer news', health: 'Health & fitness', money: 'Money', food: 'Food', fun: 'Fun', ph: 'Philippines', tech: 'Tech' };
  const topicOf = k => k === 'careers' ? 'news' : k === 'business' ? 'money' : k; // same grouping as the app's TOPIC_OF (hide lists use these names)
  const FEED_TOPIC = ['news', 'health', 'money', 'food', 'recipe', 'sports', 'mind', 'fun', 'ph', 'tech']; // Customize topics that are feed kinds; 'results' and 'typhoon' hide a card, not a ranking topic (no signal, no server event)
  const num = x => typeof x === 'number' && isFinite(x) ? x : null; // unknown stays null, never 0 (a missing signal is not a negative one)
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const mult = x => clamp(1 + 0.5 * Math.tanh(x), 0.5, 1.5);
  const decay = (a, at, now) => a * Math.pow(0.5, Math.max(0, now - (num(at) == null ? now : at)) / HALF);
  const eff = (a, n) => a * n / (n + KSHRINK);
  const ts = p => { const v = p && (p.published || p.pub || p.fetched_at); const t = typeof v === 'number' ? v : Date.parse(v); return isFinite(t) ? t : null; };
  const blank = () => ({ v: 1, arm: null, me: null, t: {}, s: {}, seen: {}, pop: null });
  const ls = { // every storage touch is wrapped: private windows and node have none
    get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  const loadSig = () => { const s = ls.get(SIG); return s && s.v === 1 && s.t && typeof s.t === 'object' && s.s && typeof s.s === 'object' ? { ...blank(), ...s, seen: s.seen || {} } : blank(); };
  let sig = loadSig(), q = [], cfg = { on: false, demo: true, me: null, off: 0, fetch: null }, cur = null, lastView = 0, flushT = null, busy = false, installed = false;
  let last = { study: false, byId: {}, pos: {}, why: {}, tab: null }, frozen = null, locked = false, hiddenAt = 0; // frozen/locked: the For you order kept stable once the member starts reading (see rank, o.stable) // memo of the latest rank() so why(), seen() and the observers can look an item up; the returned order never depends on it

  // ---- the score ---------------------------------------------------------------------------------------------------------------
  const read = (m, key, now) => { const o = m && key != null ? m[key] : null; return o && num(o.a) != null && num(o.n) != null ? eff(decay(o.a, o.at, now), o.n) : 0; };
  const normPop = (pop, now) => { // accepts feed_popularity rows or an id -> {opens, members} map; groups under 5 members never count
    let m = {};
    if (Array.isArray(pop)) pop.forEach(r => { if (r && r.id != null) m[r.id] = r; });
    else if (pop && pop.rows) { if (num(pop.at) != null && now - pop.at > 3 * DAY) return {}; m = pop.rows; } // cached copy: stale after 3 days
    else if (pop && typeof pop === 'object') m = pop;
    return m;
  };
  function parts(p, o) { // affinity, quality, freshness for one item
    const now = o.now, tm = mult(read(o.sig.t, topicOf(p.kind), now)), sm = mult(p.source ? read(o.sig.s, p.source, now) : 0);
    const r = o.pop[p.id], opens = r && num(+r.opens), mem = r && num(+r.members);
    const quality = r && mem >= 5 && opens != null ? Math.min(2, 1 + 0.25 * Math.log2(1 + opens)) : 1;
    const t = ts(p), age = t == null ? 2 : Math.max(0, (now - t) / DAY); // shortcut: no date counts as 2 days old, when the news table gains a guaranteed date drop this
    return { tm, sm, aff: tm * sm, quality, fresh: Math.pow(0.5, age / 2), t };
  }
  function whyOf(p, x, explore) {
    if (explore) return 'Something different';
    if (x.aff > 1) {
      const lab = TOPIC_LABEL[topicOf(p.kind)] || 'this topic';
      return 'For you · you often read ' + (x.tm >= x.sm ? lab + (x.sm > 1 && p.source ? ' from ' + p.source : '') : 'stories from ' + p.source);
    }
    return x.quality > 1 ? 'Popular in the house this week' : 'Newest';
  }
  // rank(news, {now, sort, prefs:{hide,muted}, pop, sig, arm, limit, tab, stable}) -> {items (the slots), all (everything, in order), pos, why, score}
  FR.rank = function (news, o) {
    o = o || {};
    const now = num(o.now) != null ? o.now : Date.now(), sort = o.sort || 'foryou', limit = o.limit || 12, pf = o.prefs || {}, hide = pf.hide || [], muted = pf.muted || [];
    const arm = o.arm !== undefined ? o.arm : FR.arm(); // arm 'b' = today's Mixed order (the alternate-day comparison); null/'a' = ranked
    const list = (news || []).filter(p => p && p.id != null && !hide.includes(topicOf(p.kind)) && !muted.includes(p.source));
    const ctx = { now, sig: o.sig || sig, pop: normPop(o.pop !== undefined ? o.pop : sig.pop, now) };
    const fresh = (a, b) => (ts(b) || 0) - (ts(a) || 0);
    let items, all; const why = {}, score = {};
    if (sort === 'foryou' && arm !== 'b') {
      const xs = list.map((p, i) => ({ p, i, x: parts(p, ctx) }));
      xs.forEach(e => { e.s = e.x.fresh * e.x.aff * e.x.quality; score[e.p.id] = e.s; });
      const rest = xs.slice().sort((a, b) => b.s - a.s || fresh(a.p, b.p) || a.i - b.i), placed = [];
      for (let slot = 1; slot <= limit && rest.length; slot++) {
        const win = placed.slice(-10), ok = e => !e.p.source || win.filter(w => w.p.source === e.p.source).length < 2; // at most 2 per source in any 10
        const pool = rest.filter(ok), explore = slot % 5 === 0;
        const pick = explore ? pool.slice().sort((a, b) => fresh(a.p, b.p) || a.i - b.i)[0] : pool[0]; // exploration: freshest unplaced, score ignored
        if (!pick) break;
        pick.explore = explore; rest.splice(rest.indexOf(pick), 1); placed.push(pick);
      }
      all = placed.concat(rest).map(e => e.p); let shown = placed.length; // shown: how many slots the cap and exploration rules filled
      const expl = {}; xs.forEach(e => { if (e.explore) expl[e.p.id] = 1; });
      if (o.stable && locked && frozen) { // keep the order the member already sees; scores keep moving in storage for the next open
        const fpos = {}; all.forEach((p, i) => { fpos[p.id] = i; });
        const byIdx = {}; all.forEach(p => { byIdx[p.id] = p; });
        const kept = frozen.ids.filter(id => byIdx[id]), known = new Set(kept);
        all.filter(p => !known.has(p.id)).forEach(p => { // a new story slots in by its rank, never above the cards already on screen
          const idx = Math.max(kept.filter(id => fpos[id] < fpos[p.id]).length, Math.min(limit, kept.length)); kept.splice(idx, 0, p.id);
        });
        all = kept.map(id => byIdx[id]); shown = Math.min(frozen.n, all.length);
        Object.keys(frozen.expl).forEach(id => { if (byIdx[id]) expl[id] = 1; });
      }
      items = all.slice(0, shown);
      if (o.stable) frozen = { ids: all.map(p => p.id), expl, n: shown };
      xs.forEach(e => { why[e.p.id] = whyOf(e.p, e.x, !!expl[e.p.id]); });
    } else if (sort === 'newest') {
      all = list.slice().sort(fresh); items = all.slice(0, limit);
    } else { // mixed (also arm b): input order, 2 per kind, like the app's own Mixed
      const per = {}; items = list.filter(p => (per[p.kind] = (per[p.kind] || 0) + 1) <= 2); all = items.concat(list.filter(p => !items.includes(p)));
    }
    all.forEach(p => { if (!why[p.id]) why[p.id] = 'Newest'; });
    const pos = {}; all.forEach((p, i) => { pos[p.id] = i; });
    const byId = {}; list.forEach(p => { byId[p.id] = p; });
    last = { study: sort === 'foryou', byId, pos, why, tab: o.tab !== undefined ? o.tab : null }; // study: this member is on For you today, so events carry the arm
    return { items, all, pos, why, score };
  };
  FR.reflow = function () { frozen = null; locked = false; }; // explicit actions (hide, mute, reset, pull-to-refresh, a new open or resume) take a fresh ranking next render
  FR.why = id => last.why[id] || 'Newest';

  // ---- signals (phone scores + the event queue) ----------------------------------------------------------------------------------
  function bump(m, key, w, now, counts) {
    if (!key) return;
    const o = m[key] || { a: 0, n: 0, at: now };
    m[key] = { a: decay(o.a, o.at, now) + w, n: o.n + (counts ? 1 : 0), at: now };
  }
  function trim(m, cap) { const ks = Object.keys(m); if (ks.length > cap) ks.sort((a, b) => m[a].at - m[b].at).slice(0, ks.length - cap).forEach(k => delete m[k]); }
  function save() {
    trim(sig.t, 200); trim(sig.s, 200);
    const ks = Object.keys(sig.seen); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach(k => delete sig.seen[k]);
    ls.set(SIG, sig);
  }
  function enqueue(ev) {
    if (!cfg.on || cfg.demo) return; // nothing is queued or sent in the demo or before boot
    q.push(ev); if (q.length > 200) q = q.slice(-200);
    ls.set(QUE, q);
    if (!flushT) { flushT = setTimeout(() => { flushT = null; FR.flush(); }, 45e3); if (flushT.unref) flushT.unref(); } // same 45 s cadence as flushUsage
  }
  const curArm = () => last.study ? FR.arm() : null; // only members on For you are in the alternate-day study
  const WEIGHT = { open: 1, out: 2, like: 3, share: 4, hide: -4, mute: -4 };
  FR.signal = function (k, post, o) {
    o = o || {}; post = post || {};
    const now = Date.now(), pct = o.pct === 80 ? 80 : o.pct === 30 ? 30 : null;
    const w = k === 'dwell' ? (pct === 80 ? 3 : pct === 30 ? 2 : null) : WEIGHT[k];
    if (w == null) return;
    if (k !== 'hide' && k !== 'mute') locked = true; // the member is reading: from now on the order stays put until an explicit action or the next open
    if (k !== 'mute') bump(sig.t, topicOf(post.kind), w, now, true); // one key per topic, the same one rank() reads
    if (k !== 'hide') bump(sig.s, post.source, w, now, true);
    if (post.id != null) sig.seen[post.id] = 1;
    save();
    const ev = { k, t: now };
    if (k === 'hide') ev.kind = post.kind; else if (k === 'mute') ev.src = post.source;
    else { ev.id = String(post.id); ev.kind = post.kind; if (post.source) ev.src = post.source; if (k === 'open' && num(o.pos) != null) ev.pos = clamp(Math.round(o.pos), 1, 50); if (k === 'dwell') ev.pct = pct; }
    const arm = curArm(); if (arm) ev.arm = arm;
    enqueue(ev);
  };
  FR.seen = function (post, pos) { // on screen (50 % for 1 s) and never opened: a small, uncounted push down. Phone only, never sent.
    if (!post || post.id == null || sig.seen[post.id]) return;
    locked = true;
    const now = Date.now(); sig.seen[post.id] = 1; bump(sig.t, topicOf(post.kind), -0.25, now, false); bump(sig.s, post.source, -0.25, now, false); save();
  };
  const expectedMs = p => Math.max(10, (String((p && p.title) || '') + ' ' + String((p && p.body) || '')).split(/\s+/).filter(Boolean).length / 200 * 60) * 1000;
  FR.sheetOpen = function (post, pos) {
    FR.sheetClose();
    if (!post) return;
    cur = { post, t0: Date.now() };
    FR.signal('open', post, { pos: num(pos) != null ? pos + 1 : null }); // pos arrives 0-based (the map index); the event is 1-based
  };
  FR.sheetClose = function () {
    if (!cur) return;
    const c = cur; cur = null;
    const pct = Math.min(Date.now() - c.t0, 10 * 60e3) / expectedMs(c.post) * 100; // a phone left open is not reading: 10 minutes at most
    if (pct >= 30) FR.signal('dwell', c.post, { pct: pct >= 80 ? 80 : 30 });
  };
  // setFp hook: topics newly hidden and sources newly muted become -4 signals. Idempotent inside 3 s in case React replays the updater.
  const recent = {};
  FR.prefs = function (fp, old) {
    if (!fp) return; old = old || {};
    const now = Date.now(), fire = (k, tok, post) => { if (recent[tok] && now - recent[tok] < 3000) return; recent[tok] = now; FR.signal(k, post); };
    (fp.hide || []).filter(t => !(old.hide || []).includes(t) && FEED_TOPIC.includes(t)).forEach(t => fire('hide', 'h:' + t, { kind: t }));
    (fp.muted || []).filter(s => !(old.muted || []).includes(s)).forEach(s => fire('mute', 'm:' + s, { source: s }));
    if (JSON.stringify([fp.hide, fp.muted, fp.sort]) !== JSON.stringify([old.hide, old.muted, old.sort])) FR.reflow();
  };
  FR.reset = function () {
    sig = { ...blank(), me: sig.me, arm: sig.arm, pop: sig.pop }; // house popularity is public data and stays; the member's own scores go
    ls.del(SIG); FR.reflow();
    enqueue({ k: 'reset', t: Date.now() });
  };

  // ---- the alternate-day arm ---------------------------------------------------------------------------------------------------
  const phtDay = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
  FR.arm = function () {
    if (cfg.me == null) return null;
    let n = Number(cfg.me); if (!isFinite(n)) { n = 0; String(cfg.me).split('').forEach(c => { n = (n * 31 + c.charCodeAt(0)) % 1e6; }); }
    const d = Math.floor(Date.parse(phtDay(Date.now() + cfg.off)) / DAY); // cfg.off lets tests (and a wrong clock) pin the day given at boot
    return (n + d) % 2 === 0 ? 'a' : 'b';
  };

  // ---- server side: log queue + house popularity -------------------------------------------------------------------------------
  FR.flush = async function () {
    if (flushT) { clearTimeout(flushT); flushT = null; }
    if (!cfg.on || cfg.demo || !cfg.fetch || busy || !q.length) return;
    busy = true;
    try {
      for (let i = 0; i < 5 && q.length; i++) {
        const batch = q.slice(0, 60);
        await cfg.fetch('rpc/feed_log', { p: batch });
        q = q.slice(batch.length); ls.set(QUE, q); // only after the house accepted them
      }
    } catch (e) { /* offline or signed out: the queue stays and goes with the next flush */ }
    busy = false;
  };
  function watch() { // one IntersectionObserver on [data-fr] (50 % for 1 s = seen) and a MutationObserver that finds new cards after each render
    if (installed || typeof document === 'undefined' || typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    installed = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt > 5 * 60e3) { hiddenAt = 0; FR.reflow(); } }); // a resume after 5 minutes away ranks afresh
    const timers = new Map(), known = new WeakSet();
    const io = new IntersectionObserver(es => es.forEach(e => {
      const id = e.target.getAttribute('data-fr'); if (!id) return;
      if (e.isIntersecting && cfg.on && !cfg.demo && last.study && last.tab === 'all' && Date.now() - lastView > 10 * 60e3) { // feed.view: the first news card of the All tab, at most every 10 minutes
        const cards = [...document.querySelectorAll('[data-fr]:not([data-fr=""])')].filter(c => c.offsetParent !== null);
        if (cards[0] === e.target) { lastView = Date.now(); enqueue({ k: 'view', n: cards.length, arm: curArm() || undefined, t: lastView }); }
      }
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        if (!timers.has(e.target)) timers.set(e.target, setTimeout(() => { timers.delete(e.target); const p = last.byId[id]; if (p && document.visibilityState === 'visible') FR.seen(p, last.pos[id]); }, 1000));
      } else if (timers.has(e.target)) { clearTimeout(timers.get(e.target)); timers.delete(e.target); }
    }), { threshold: [0, 0.5] });
    const scan = () => document.querySelectorAll('[data-fr]').forEach(el => { if (el.getAttribute('data-fr') && !known.has(el)) { known.add(el); io.observe(el); } });
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 250); }).observe(document.body, { childList: true, subtree: true });
    scan();
  }
  FR.boot = function (o) {
    o = o || {};
    const me = o.meId == null ? null : String(o.meId), now = Date.now(), dayMs = Date.parse(o.dayKey);
    cfg = { on: true, demo: !!o.demo, me: o.meId == null ? null : o.meId, fetch: typeof o.fetch === 'function' ? o.fetch : null, off: isFinite(dayMs) ? dayMs - Date.parse(phtDay(now)) : 0 };
    const qq = ls.get(QUE);
    sig = loadSig(); FR.reflow();
    q = Array.isArray(qq) ? qq.slice(-200) : [];
    if (sig.me != null && me != null && sig.me !== me) { sig = blank(); q = []; ls.del(QUE); } // another member signed in on this phone: no scores or queued events carry over
    sig.me = me; sig.arm = FR.arm(); save();
    if (cfg.demo || !cfg.fetch) q = []; // the demo never sends anything
    watch();
    const pop = !cfg.demo && cfg.fetch ? cfg.fetch('rpc/feed_popularity', { p_days: 14 }).then(rows => {
      if (!Array.isArray(rows)) return;
      const m = {}; rows.filter(r => r && r.id != null && +r.members >= 5).sort((a, b) => b.opens - a.opens).slice(0, 400).forEach(r => { m[r.id] = { opens: +r.opens, members: +r.members }; });
      sig.pop = { rows: m, at: Date.now() }; save();
    }).catch(() => {}) : Promise.resolve(); // a failing popularity call leaves the cached copy (or nothing) in place
    FR.flush();
    return pop; // resolves when the popularity answer (or its failure) is in: the app re-renders the Feed then
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FR; else g.FR = FR;
})(typeof window !== 'undefined' ? window : this);
