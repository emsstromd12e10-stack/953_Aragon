// Health videos (v17 lane I, decision A-010). Browser: window.V17I; node tests: require('./videos.js').
// YouTube: lists come from the house news table (kind 'video'); a tap plays the YouTube IFrame embed, online only. Nothing from YouTube is
// ever cached or downloaded (developer policy III.E.1). The saved playlist keeps id + title + thumb + channel on this phone and is refreshed or
// removed within 30 days (III.E.4.c). The only offline videos are Wikimedia Commons files under CC0 / CC BY, with the credit stored and shown.
// v17.5 lane D: the Feed's "Featured video" card (host 'feat') is not a feed post: it is picked here (Sunday Mass, else a weekday pick) and its opens
// are logged as the topic's feed kind (news, health, sports, mind, recipe, ph), never as kind 'video'. Saved ids stay on this phone (953-v175d-pick, 953-v175d-seen).
(function (g) {
  const V = {};
  const DAY = 864e5, KEEP = 30 * DAY, PL = '953-playlist', CACHE = '953-videos', MAXPL = 50, MAXFILE = 40e6, CAPB = 150e6, CAPN = 10;
  const TOPICS = [['exercise', 'Exercise'], ['diet', 'Diet'], ['mental', 'Mind'], ['recipe', 'Recipes'], ['health', 'General']];
  const SRC = { 'Home Workout With Me': 'exercise', 'PINOY FITNESS TV': 'exercise', 'Yoga With Adriene': 'exercise', 'NutritionFacts.org': 'diet', Headspace: 'mental', 'Psychology Hub': 'mental', 'Mindfulness Meditation': 'mental', 'Panlasang Pinoy': 'recipe', 'YUMMY Ph': 'recipe',
    'Quiapo Church': 'mass', gCaptain: 'maritime', "What's Going on With Shipping?": 'maritime', 'Marine Insight': 'maritime', 'PBA Official': 'sport', NBA: 'sport' }; // v17.5 lane D: the last six feed the Feed's featured video only
  const KW = [['diet', /\b(diet|nutrition|nutrient|fiber|protein|vitamin|calorie|eating|food|sugar|salt|cholesterol)\b/i], ['exercise', /\b(exercise|workout|fitness|stretch|walking|yoga|strength|cardio|muscle)\b/i], ['mental', /\b(stress|anxiety|sleep|mental|mind|depress|meditat|mindful|therapy|burnout)\b/i]];
  const feedTopic = t => t === 'recipe' ? 'recipe' : t === 'mental' ? 'mind' : t === 'maritime' ? 'news' : t === 'sport' ? 'sports' : t === 'mass' ? 'ph' : 'health'; // the Customize-feed topic a section belongs to (hide lists use these names; lane B topic 'mind')
  const FEATURED_ONLY = ['recipe', 'mass', 'maritime', 'sport']; // 'any' (the Health strips) never shows these
  const YT = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)$/i;
  const LICENSE = /^(CC0|CC BY( \d\.\d)?)$/i; // CC BY-SA, NC and ND are not accepted
  // Commons files that work offline (licence read from each file page, 23 Oct 2026). bytes = size on Commons; cacheOpen re-checks with a HEAD.
  const FP = 'https://upload.wikimedia.org/wikipedia/commons/', CP = 'https://commons.wikimedia.org/wiki/File:';
  const fs = (path, name, title) => ({ url: FP + path + name, title, credit: 'FitnessScape, CC BY 3.0, via Wikimedia Commons', license: 'CC BY 3.0', page: CP + name });
  V.OFFLINE = [
    { ...fs('5/5c/', 'Squat_-_exercise_demonstration_video.webm', 'Squat'), bytes: 564942 },
    { ...fs('b/bf/', 'Leg_raises_-_exercise_demonstration_video.webm', 'Leg raises'), bytes: 292068 },
    { ...fs('5/5e/', 'Hanging_crunches_-_exercise_demonstration_video.webm', 'Hanging crunches'), bytes: 360581 },
    { ...fs('1/15/', 'Pull-ups_-_exercise_demonstration_video.webm', 'Pull-ups'), bytes: 358754 },
    { ...fs('b/b2/', 'Bent-over_row_-_exercise_demonstration_video.webm', 'Bent-over row'), bytes: 376097 },
    { ...fs('6/69/', 'Shoulder_press_-_exercise_demonstration_video.webm', 'Shoulder press'), bytes: 463728 },
    { ...fs('6/62/', 'Deadlift_-_exercise_demonstration_video.webm', 'Deadlift'), bytes: 446868 },
    { ...fs('d/df/', 'Bench_press_-_exercise_demonstration_video.webm', 'Bench press'), bytes: 389315 },
    { url: FP + '0/0f/20200303_-_SFGovTV_-_SFDPH_WASH_HANDS_FILIPINO.webm', title: 'Washing your hands (Filipino)', credit: 'San Francisco Government Television, CC BY 3.0, via Wikimedia Commons', license: 'CC BY 3.0', page: CP + '20200303_-_SFGovTV_-_SFDPH_WASH_HANDS_FILIPINO.webm', bytes: 6212634 },
  ];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const validId = id => typeof id === 'string' && /^[\w-]{11}$/.test(id);
  const idOf = url => { const m = /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})(?:[&#]|$)/.exec(url || '') || /^https:\/\/youtu\.be\/([\w-]{11})(?:[?#]|$)/.exec(url || ''); return m ? m[1] : null; };
  const thumb = id => 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'; // always https, never http: or data:
  const ts = r => { const t = Date.parse(r && (r.published || r.fetched_at)); return isFinite(t) ? t : 0; };
  const online = () => !(g.navigator && g.navigator.onLine === false);
  const ls = {
    get: k => { try { return JSON.parse(g.localStorage.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { g.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  V.feedTopic = feedTopic; V.idOf = idOf; V.thumb = thumb; V.TOPICS = TOPICS;

  V.topicOf = r => { if (SRC[r.source]) return SRC[r.source]; const t = String(r.title || ''); for (const [k, re] of KW) if (re.test(t)) return k; return 'health'; };

  // pure: newest first, max 6, one entry per video; topic 'any' = every topic except recipes; hidden topics and muted sources never appear
  V.list = (news, o = {}) => {
    const kind = o.kind || 'video', hide = o.hide || [], muted = o.muted || [], seen = new Set();
    return (news || []).filter(r => r && r.kind === kind && idOf(r.url)).sort((a, b) => ts(b) - ts(a)).map(r => ({ id: idOf(r.url), title: String(r.title || ''), channel: r.source || '', thumb: thumb(idOf(r.url)), url: 'https://www.youtube.com/watch?v=' + idOf(r.url), published: r.published || null, topic: V.topicOf(r) }))
      .filter(v => !seen.has(v.id) && seen.add(v.id))
      .filter(v => (!o.topic || o.topic === 'any' ? !FEATURED_ONLY.includes(v.topic) : v.topic === o.topic) && !hide.includes(feedTopic(v.topic)) && !muted.includes(v.channel))
      .slice(0, o.max || 6);
  };

  // ---- v17.5 lane D (A-039): the Feed's featured video. Pure picks; the screen is the 'feat' host below. ----
  const MASS_AGE = 36 * 36e5, PICK_ORDER = ['maritime', 'health', 'recipe', 'sport', 'mind'], EXPLORE = 0.2;
  const PICK_OF = { exercise: 'health', diet: 'health', health: 'health', mental: 'mind', recipe: 'recipe', maritime: 'maritime', sport: 'sport' };
  const FEED_KIND = { maritime: 'news', health: 'health', recipe: 'recipe', sport: 'sports', mind: 'mind', mass: 'ph' }; // feed_log kinds already allowed (075); a video is never logged as kind 'video'
  const PICK_LABEL = { maritime: 'Shipping news', health: 'Health and fitness', recipe: 'Recipes', sport: 'Sports', mind: 'Calm and mind', mass: 'Sunday Mass' };
  V.FEED_KIND = FEED_KIND; V.PICK_LABEL = PICK_LABEL;
  V.manilaDay = ms => new Date(ms + 8 * 36e5).toISOString().slice(0, 10); // Asia/Manila has no daylight saving: UTC+8 all year
  V.manilaDow = ms => new Date(ms + 8 * 36e5).getUTCDay(); // 0 = Sunday
  V.seeded = str => { let h = 1779033703 ^ String(str).length; for (const c of String(str)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; } let a = h >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }; // mulberry32
  // the daily candidates grouped by pick topic (maritime, health, recipe, sport, mind), newest first; hidden topics and muted channels never appear; Mass never (it is the Sunday card only)
  V.pool = (rows, o = {}) => {
    const by = {};
    Object.keys(PICK_OF).forEach(t => V.list(rows, { topic: t, hide: o.hide, muted: o.muted, max: 999 }).forEach(v => { (by[PICK_OF[t]] = by[PICK_OF[t]] || []).push(v); }));
    Object.keys(by).forEach(k => by[k].sort((a, b) => ts(b) - ts(a)));
    return by;
  };
  // The channels that post many times a day (or whose rows only the featured card reads) are loaded one by one, newest few each; everything else is ONE query that
  // excludes them. A shared newest-250 window let NBA alone push the weekly Health channels out of the rows (v17.5 fix round 1). base = the news URL up to 'order=...'.
  V.HIGH_VOLUME = Object.keys(SRC).filter(k => ['mass', 'maritime', 'sport'].includes(SRC[k]));
  V.queries = base => [{ part: 'base', url: base + '&source=not.in.' + encodeURIComponent('(' + V.HIGH_VOLUME.map(x => '"' + x + '"').join(',') + ')') + '&limit=120' }]
    .concat(V.HIGH_VOLUME.map(x => ({ part: 'src', url: base + '&source=eq.' + encodeURIComponent(x) + '&limit=' + (SRC[x] === 'mass' ? 24 : 8) })));
  // Sunday (Manila): the newest Quiapo Church video with "Mass" in its title, published in the last 36 h. Same answer for everyone.
  V.massPick = (rows, o = {}) => {
    const now = o.now == null ? Date.now() : o.now;
    return V.list(rows, { topic: 'mass', hide: o.hide, muted: o.muted, max: 999 }).find(v => /\bmass(es)?\b/i.test(v.title) && ts(v) > 0 && now - ts(v) >= 0 && now - ts(v) <= MASS_AGE) || null;
  };
  // Weekday pick: a topic by weight (o.weights from feed-rank signals, default 1 each), 20% of days a different topic from the favourite, then the newest video there the member has not opened.
  // Two draws from o.rand() every time, so a seeded generator gives the same answer all day.
  V.dailyPick = (rows, o = {}) => {
    const rand = o.rand || Math.random, w = o.weights || {}, seen = new Set(o.seen || []), by = V.pool(rows, o), topics = PICK_ORDER.filter(t => by[t] && by[t].length);
    if (!topics.length) return null;
    const wt = t => typeof w[t] === 'number' && isFinite(w[t]) && w[t] > 0 ? w[t] : 1, r1 = rand(), r2 = rand();
    const top = topics.reduce((a, t) => wt(t) > wt(a) ? t : a, topics[0]);
    let topic = top, how = 'pick';
    if (r1 < EXPLORE && topics.length > 1) { const others = topics.filter(t => t !== top); topic = others[Math.min(others.length - 1, Math.floor(r2 * others.length))]; how = 'explore'; }
    else { let x = r2 * topics.reduce((a, t) => a + wt(t), 0); topic = topics.find(t => (x -= wt(t)) < 0) || top; }
    const list = by[topic];
    return { video: list.find(v => !seen.has(v.id)) || list[0], topic, how };
  };
  // featured(rows, {now, meId, weights, seen, hide, muted, stored:{day,id}, rand}) -> {video, topic, how:'sunday'|'kept'|'pick'|'explore', day, label} | null
  // v17.6 lane F: the card's sub line; "you open <topic> most" only when the member's feed-rank weight for the topic is above neutral (a signal), never for a random explore pick
  const featSub = (t, w, how) => { const x = w && w[t]; return PICK_LABEL[t] + (how !== 'explore' && typeof x === 'number' && isFinite(x) && x > 1 ? ' · you open ' + PICK_LABEL[t].toLowerCase() + ' most' : ''); };
  V.featured = (rows, o = {}) => {
    const now = o.now == null ? Date.now() : o.now, day = V.manilaDay(now);
    if (V.manilaDow(now) === 0) { const m = V.massPick(rows, { now, hide: o.hide, muted: o.muted }); if (m) return { video: m, topic: 'mass', how: 'sunday', day, label: 'Sunday Mass from Quiapo Church', sub: 'Sunday Mass' }; }
    const by = V.pool(rows, o), st = o.stored;
    if (st && st.day === day) for (const t of Object.keys(by)) { const v = by[t].find(x => x.id === st.id); if (v) return { video: v, topic: t, how: 'kept', day, label: 'Picked for you · ' + PICK_LABEL[t], sub: featSub(t, o.weights) }; } // one video per member per day
    const p = V.dailyPick(rows, { ...o, rand: o.rand || V.seeded(String(o.meId) + '|' + day) });
    return p ? { ...p, day, label: 'Picked for you · ' + PICK_LABEL[p.topic], sub: featSub(p.topic, o.weights, p.how) } : null;
  };

  // saved playlist: { v:1, items:[{id,title,thumb,channel,at}] }, newest first, max 50
  V.saved = () => { const o = ls.get(PL); return o && o.v === 1 && Array.isArray(o.items) ? o.items.filter(x => x && validId(x.id) && isFinite(x.at)) : []; };
  const put = items => ls.set(PL, { v: 1, items });
  V.save = (it, now) => {
    if (!it || !validId(it.id)) return V.saved();
    const items = [{ id: it.id, title: String(it.title || '').slice(0, 200), thumb: thumb(it.id), channel: String(it.channel || '').slice(0, 80), at: now == null ? Date.now() : now }, ...V.saved().filter(x => x.id !== it.id)].slice(0, MAXPL);
    put(items); return items;
  };
  V.unsave = id => { const items = V.saved().filter(x => x.id !== id); put(items); return items; };
  // 30-day rule: an entry still in the current video rows is refreshed (title, thumb, date); an older one that is not there is deleted
  V.prune = (now, rows) => {
    const cur = new Map((rows || []).filter(r => r && r.kind === 'video' && idOf(r.url)).map(r => [idOf(r.url), r]));
    const out = V.saved().map(x => { const r = cur.get(x.id); return r ? { id: x.id, title: String(r.title || x.title), thumb: thumb(x.id), channel: r.source || x.channel, at: now } : x; })
      .filter(x => now - x.at < KEEP);
    put(out); return out;
  };

  // IFrame player (YouTube branding and its logo link stay untouched). Offline or bad id: an "Online only" tile instead.
  V.embed = (id, o = {}) => {
    const d = o.document || g.document, on = o.online != null ? o.online : online(), w = d.createElement('div');
    w.setAttribute('data-v17i-player', String(id));
    if (!on || !validId(id)) { w.setAttribute('data-v17i-online-only', '1'); w.style.cssText = 'aspect-ratio:16/9;border-radius:14px;background:#15233a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;text-align:center;padding:12px'; w.textContent = 'Online only. Videos from YouTube play when you have a signal.'; return w; }
    const origin = g.location && /^https?:$/.test(g.location.protocol) ? '&origin=' + encodeURIComponent(g.location.origin) : '';
    const f = d.createElement('iframe');
    f.src = 'https://www.youtube.com/embed/' + id + '?enablejsapi=1&playsinline=1&rel=0' + origin;
    f.width = '480'; f.height = '270'; f.title = 'Video player'; f.allowFullscreen = true;
    f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.style.cssText = 'width:100%;height:auto;min-width:200px;min-height:200px;aspect-ratio:16/9;border:0;border-radius:14px;background:#000;display:block';
    w.appendChild(f); return w;
  };

  // Offline files: Commons CC0 / CC BY only. At most 40 MB per file, 150 MB and 10 files in all, oldest evicted.
  const dec = s => { try { return decodeURIComponent(s || ''); } catch (e) { return ''; } };
  V.cacheList = async (env = {}) => {
    const cs = env.caches || g.caches; if (!cs) return [];
    try {
      const c = await cs.open(CACHE), out = [];
      for (const rq of await c.keys()) { const r = await c.match(rq); if (r) out.push({ url: rq.url, title: dec(r.headers.get('x-953-title')), credit: dec(r.headers.get('x-953-credit')), license: dec(r.headers.get('x-953-license')), page: dec(r.headers.get('x-953-page')), bytes: Number(r.headers.get('content-length')) || 0, at: Number(r.headers.get('x-953-at')) || 0 }); }
      return out.sort((a, b) => a.at - b.at);
    } catch (e) { return []; }
  };
  V.cacheRemove = async (url, env = {}) => { const cs = env.caches || g.caches; if (!cs) return false; try { return await (await cs.open(CACHE)).delete(url); } catch (e) { return false; } };
  V.cacheOpen = async (file, env = {}) => {
    const f = env.fetch || g.fetch, cs = env.caches || g.caches, bad = why => ({ ok: false, why });
    if (!file || typeof file.url !== 'string') return bad('no url');
    let u; try { u = new URL(file.url); } catch (e) { return bad('bad url'); }
    if (YT.test(u.hostname)) return bad('YouTube videos are never stored');
    if (u.protocol !== 'https:' || u.hostname !== 'upload.wikimedia.org') return bad('only Wikimedia Commons files');
    if (!LICENSE.test(String(file.license || ''))) return bad('only CC0 or CC BY');
    if (!file.credit) return bad('no credit line');
    if (!cs || !f) return bad('no storage');
    const key = u.origin + u.pathname;
    try {
      const head = await f(key, { method: 'HEAD' }), hl = head.ok ? Number(head.headers.get('content-length')) : NaN, len = hl > 0 ? hl : Number(file.bytes); // unknown stays unknown: no size, no download
      if (!(len > 0)) return bad('size unknown');
      if (len > MAXFILE) return bad('over 40 MB');
      const res = await f(key); if (!res.ok) return bad('download failed');
      const blob = await res.blob(); if (blob.size > MAXFILE) return bad('over 40 MB');
      const c = await cs.open(CACHE);
      await c.put(key, new Response(blob, { status: 200, headers: { 'content-type': res.headers.get('content-type') || 'video/webm', 'content-length': String(blob.size), 'x-953-title': encodeURIComponent(file.title || ''), 'x-953-credit': encodeURIComponent(file.credit), 'x-953-license': encodeURIComponent(file.license), 'x-953-page': encodeURIComponent(file.page || ''), 'x-953-at': String(env.now == null ? Date.now() : env.now) } }));
      let all = await V.cacheList(env), total = all.reduce((a, x) => a + x.bytes, 0);
      while (all.length > 1 && (all.length > CAPN || total > CAPB)) { const old = all.shift(); total -= old.bytes; await c.delete(old.url); }
      return { ok: true, bytes: blob.size, url: key };
    } catch (e) { return bad('offline'); }
  };

  // ---- screens: plain DOM drawn into a host div the app gives us (like games.js). One host per place. ----
  const hosts = new Map(); // el -> { where, topic, play, cached }
  let rows = [], prefs = { hide: [], muted: [] };
  const btn = 'border:0;border-radius:10px;min-height:44px;padding:0 12px;font-size:13px;font-weight:650;cursor:pointer;';
  const card = (v, st, strip) => {
    const saved = V.saved().some(x => x.id === v.id);
    return '<div style="' + (strip ? 'flex:0 0 44%;' : '') + 'display:flex;flex-direction:column;gap:6px;min-width:0">' +
      '<button data-v17i-play="' + esc(v.id) + '" aria-label="Play ' + esc(v.title) + '" style="border:0;padding:0;background:#15233a;border-radius:12px;overflow:hidden;position:relative;aspect-ratio:16/9;cursor:pointer;display:block;width:100%">' +
      '<img src="' + esc(v.thumb) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" style="width:100%;height:100%;object-fit:cover;display:block"><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;text-shadow:0 1px 6px rgba(0,0,0,.6)">&#9654;</span></button>' +
      '<div style="font-size:12.5px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(v.title) + '</div>' +
      '<div style="font-size:11.5px;color:#6c6c72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(v.channel) + '</div>' +
      (strip ? '' : '<button data-v17i-save="' + esc(v.id) + '" aria-pressed="' + saved + '" style="' + btn + 'align-self:flex-start;background:' + (saved ? '#15233a' : 'rgba(118,118,128,.14)') + ';color:' + (saved ? '#fff' : '#15233a') + '">' + (saved ? 'Saved' : 'Save') + '</button>') + '</div>';
  };
  const find = id => ['any', 'recipe', 'maritime', 'sport', 'mass'].flatMap(t => V.list(rows, { topic: t, hide: [], max: 999 })).find(v => v.id === id) || V.saved().find(v => v.id === id);
  const playerBox = (el, st) => {
    const slot = el.querySelector('[data-v17i-slot]'); if (!slot) return;
    slot.textContent = ''; if (!st.play) return;
    const d = g.document, v = find(st.play) || { id: st.play, title: 'Video', channel: '' };
    slot.appendChild(V.embed(v.id));
    const bar = d.createElement('div'); bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px;font-size:12.5px';
    bar.innerHTML = '<span style="flex:1;min-width:0;font-weight:600">' + esc(v.title) + '</span><a href="https://www.youtube.com/watch?v=' + esc(v.id) + '" target="_blank" rel="noopener" style="color:#1f63b4;min-height:44px;display:flex;align-items:center">Watch on YouTube</a><button data-v17i-close style="' + btn + 'background:rgba(118,118,128,.14);color:#15233a">Close</button>';
    slot.appendChild(bar);
  };
  // v17.5 lane D: today's featured video for this member. The weekday pick is remembered per Manila day (953-v175d-pick); opened ids (953-v175d-seen, newest 60) steer the next day.
  const PICK_KEY = '953-v175d-pick', SEEN_KEY = '953-v175d-seen';
  const weightsNow = () => { const F = g.FR, out = {}; if (F && F.weight) Object.keys(PICK_LABEL).forEach(t => { if (t !== 'mass') out[t] = F.weight(FEED_KIND[t]); }); return out; }; // topic multipliers from the member's feed-rank signals (phone only)
  const featNow = st => {
    const stored = ls.get(PICK_KEY), seen = ls.get(SEEN_KEY), me = typeof st.me === 'function' ? st.me() : st.me;
    const f = V.featured(rows, { now: Date.now(), meId: me, weights: weightsNow(), seen: Array.isArray(seen) ? seen : [], hide: prefs.hide, muted: prefs.muted, stored });
    if (f && f.how !== 'sunday' && f.how !== 'kept') ls.set(PICK_KEY, { day: f.day, id: f.video.id });
    return f;
  };
  // v17.5: the Feed adds the featured host only when there is a video to show (an empty hidden host still nudged the cards below it by a fraction of a pixel)
  V.hasFeatured = () => !!V.featured(rows, { now: Date.now(), weights: weightsNow(), seen: (s => Array.isArray(s) ? s : [])(ls.get(SEEN_KEY)), hide: prefs.hide, muted: prefs.muted, stored: ls.get(PICK_KEY) });
  const featOpen = (st, id) => {
    const f = featNow(st); if (!f || f.video.id !== id) return;
    const seen = (ls.get(SEEN_KEY) || []).filter(x => x !== id); seen.push(id); ls.set(SEEN_KEY, seen.slice(-60));
    if (st.signal) try { st.signal('open', { id, kind: FEED_KIND[f.topic], source: f.video.channel }); } catch (e) {}
  };
  const render = (el) => {
    const st = hosts.get(el); if (!st) return;
    const o = { hide: prefs.hide, muted: prefs.muted };
    let h = '';
    if (st.where === 'sec') {
      const tabs = TOPICS.filter(([k]) => !prefs.hide.includes(feedTopic(k))).concat([['saved', 'Saved (' + V.saved().length + ')']]);
      if (!tabs.some(([k]) => k === st.topic)) st.topic = tabs[0][0];
      h += '<div style="display:flex;flex-wrap:wrap;gap:6px" role="group" aria-label="Video topics">' + tabs.map(([k, l]) => '<button data-v17i-topic="' + k + '" aria-pressed="' + (st.topic === k) + '" style="' + btn + 'background:' + (st.topic === k ? '#15233a' : 'rgba(118,118,128,.14)') + ';color:' + (st.topic === k ? '#fff' : '#15233a') + '">' + l + '</button>').join('') + '</div>';
      h += '<div data-v17i-slot></div>';
      const items = st.topic === 'saved' ? V.saved().map(x => ({ ...x, url: 'https://www.youtube.com/watch?v=' + x.id })) : V.list(rows, { ...o, topic: st.topic });
      h += items.length ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + items.map(v => card(v, st, false)).join('') + '</div>'
        : '<div style="font-size:13px;color:#6c6c72;padding:6px 2px">' + (st.topic === 'saved' ? 'Nothing saved yet. Tap Save under a video.' : rows.length ? 'No videos here right now.' : 'Videos load when you are online.') + '</div>';
      h += '<div style="font-size:11.5px;color:#6c6c72;line-height:1.4">Videos play from YouTube when you are online. Your saved list (titles and ids) stays on this phone and is refreshed or removed within 30 days.</div>';
      if (!prefs.hide.includes('health')) {
        h += '<div style="font-size:13px;font-weight:700;padding-top:4px">Exercise demos that work offline</div><div data-v17i-off style="display:flex;flex-direction:column;gap:8px">' +
          V.OFFLINE.map(f => { const have = st.cached && st.cached.find(c => c.url === f.url.split('?')[0]);
            return '<div style="display:flex;flex-direction:column;gap:4px;border-top:1px solid rgba(21,35,58,.08);padding-top:8px"><div style="display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0;font-size:13px;font-weight:600">' + esc(f.title) + '</span>' +
              (have ? '<button data-v17i-oplay="' + esc(f.url) + '" style="' + btn + 'background:#15233a;color:#fff">Play</button><button data-v17i-orm="' + esc(f.url) + '" style="' + btn + 'background:rgba(118,118,128,.14);color:#15233a">Remove</button>'
                : '<button data-v17i-osave="' + esc(f.url) + '" style="' + btn + 'background:rgba(118,118,128,.14);color:#15233a">Save offline (' + (f.bytes / 1e6).toFixed(1) + ' MB)</button>') +
              '</div><div style="font-size:11px;color:#6c6c72">' + esc(f.credit) + ' · <a href="' + esc(f.page) + '" target="_blank" rel="noopener" style="color:#1f63b4">file page</a></div></div>'; }).join('') + '</div><div data-v17i-ovid></div>';
      }
    } else if (st.where === 'feat') {
      const f = featNow(st);
      if (!f) { el.style.display = 'none'; el.textContent = ''; return; }
      el.style.display = 'flex';
      const v = f.video;
      h += '<h2 style="margin:0;font-size:16px;font-weight:600;line-height:1.3">' + esc(f.how === 'sunday' ? f.label : 'Video for you') + '</h2><div style="font-size:14px;color:#4c5566;line-height:1.3">' + esc(f.sub || '') + '</div><div data-v17i-slot></div>' +
        (st.play === v.id ? '' : '<button data-v17i-play="' + esc(v.id) + '" aria-label="Play ' + esc(v.title) + '" style="border:0;padding:0;background:#15233a;border-radius:16px;overflow:hidden;position:relative;aspect-ratio:16/9;cursor:pointer;display:block;width:100%"><img src="' + esc(v.thumb) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" style="width:100%;height:100%;object-fit:cover;display:block"><span style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(21,35,58,0) 35%,rgba(21,35,58,.88) 100%)"></span><span style="position:absolute;left:14px;right:84px;bottom:12px;color:#fff;font-size:14px;font-weight:600;line-height:1.3;text-align:left;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(v.title) + '</span><span style="position:absolute;right:14px;bottom:12px;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="#15233a"></path></svg></span></button>' +
          '<div style="font-size:12px;color:#4c5566">' + esc(v.channel) + '</div>');
    } else {
      const items = V.list(rows, { ...o, topic: st.topic, max: 3 });
      if (!items.length) { el.style.display = 'none'; el.textContent = ''; return; }
      el.style.display = '';
      h += '<div style="font-size:13px;font-weight:700">' + esc(st.title) + '</div><div data-v17i-slot></div><div style="display:flex;gap:10px;overflow-x:auto;scrollbar-width:none">' + items.map(v => card(v, st, true)).join('') + '</div>';
    }
    el.innerHTML = h; playerBox(el, st);
  };
  const refreshCached = async el => { const st = hosts.get(el); if (st && st.where === 'sec') { st.cached = await V.cacheList(); if (hosts.has(el)) render(el); } };
  const click = ev => {
    const el = ev.currentTarget, st = hosts.get(el), t = ev.target.closest && ev.target.closest('button'); if (!st || !t) return;
    const d = t.dataset;
    if (d.v17iTopic != null) { st.topic = d.v17iTopic; st.play = null; render(el); }
    else if (d.v17iPlay != null) { if (st.where === 'feat') featOpen(st, d.v17iPlay); st.play = d.v17iPlay; render(el); const s = el.querySelector('[data-v17i-slot]'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); }
    else if (t.hasAttribute('data-v17i-close')) { st.play = null; render(el); }
    else if (d.v17iSave != null) { const v = find(d.v17iSave); if (V.saved().some(x => x.id === d.v17iSave)) V.unsave(d.v17iSave); else if (v) V.save(v); renderAll(); }
    else if (d.v17iOsave != null) { const f = V.OFFLINE.find(x => x.url === d.v17iOsave); t.disabled = true; t.textContent = 'Saving…'; V.cacheOpen(f).then(r => { if (!r.ok && st.flash) st.flash(r.why === 'offline' ? 'Could not save. Check your signal.' : 'Could not save this video.'); return refreshCached(el); }); }
    else if (d.v17iOrm != null) V.cacheRemove(d.v17iOrm.split('?')[0]).then(() => refreshCached(el));
    else if (d.v17iOplay != null) { const f = V.OFFLINE.find(x => x.url === d.v17iOplay), box = el.querySelector('[data-v17i-ovid]'); if (f && box) { box.innerHTML = '<video controls playsinline autoplay src="' + esc(f.url.split('?')[0]) + '" style="width:100%;aspect-ratio:16/9;border-radius:14px;background:#000"></video><div style="font-size:11px;color:#6c6c72;margin-top:4px">' + esc(f.credit) + '</div>'; } }
  };
  const renderAll = () => hosts.forEach((_, el) => render(el));
  // where: 'sec' (Health Videos section) or 'strip' (3 thumbs); opts.topic for strips, opts.title, opts.flash(msg)
  V.mount = (el, o = {}) => {
    if (!el) return; V.unmount(el);
    hosts.set(el, { where: o.where === 'strip' || o.where === 'feat' ? o.where : 'sec', topic: o.topic || (o.where === 'strip' ? 'any' : 'exercise'), title: o.title || 'Health videos', flash: o.flash, play: null, cached: null, me: o.me, signal: o.signal });
    el.addEventListener('click', click);
    if (o.where !== 'strip' && o.where !== 'feat') V.prune(Date.now(), rows); // every Health open
    render(el); refreshCached(el);
  };
  V.unmount = el => { if (el && hosts.delete(el)) el.removeEventListener('click', click); };
  V.setRows = r => { rows = Array.isArray(r) ? r : []; V.prune(Date.now(), rows); renderAll(); };
  V.setPrefs = (hide, muted) => { const h = Array.isArray(hide) ? hide : [], m = Array.isArray(muted) ? muted : []; if (JSON.stringify([h, m]) === JSON.stringify([prefs.hide, prefs.muted])) return; prefs = { hide: h, muted: m }; Promise.resolve().then(renderAll); };
  // Customize > Sources: one entry per video channel with the feed topic its videos belong to (a channel can be muted there like a news source)
  V.channels = (list) => { const out = {}, seen = new Set(); (list || rows || []).forEach(r => { if (!r || r.kind !== 'video' || !r.source || !idOf(r.url) || seen.has(idOf(r.url))) return; seen.add(idOf(r.url)); const o = out[r.source] || (out[r.source] = { name: r.source, topic: feedTopic(V.topicOf(r)), n: 0 }); o.n++; }); return Object.values(out); };
  V.hasVideos =(hide, muted, topic) => V.list(rows, { topic: topic || 'any', hide, muted, max: 1 }).length > 0;

  if (typeof module !== 'undefined' && module.exports) module.exports = V; else g.V17I = V;
})(typeof window !== 'undefined' ? window : globalThis);
