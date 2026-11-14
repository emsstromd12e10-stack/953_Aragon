// v18 lane T: Transparency (projects, timeline, extra costs, suggestions). Browser: window.V18T; Node unit tests: require('./transparency.js').
// vals(app, s, show) builds the view model `v18t` for the House > Transparency block; the app's v18t* methods delegate to the loaders and actions below.
// Money rows are only ever shown from the server (rpc/tp_*). A failed fetch shows a retry state, never demo rows (v17.7 lesson); demo data exists only in ?demo.
(function (g) {
  'use strict';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const SUBS = ['projects', 'costs', 'suggest'], SUBL = { projects: 'Projects', costs: 'Extra costs', suggest: 'Suggestions' };
  const ST = {
    planned: { label: 'Planned', bg: 'rgba(47,111,176,.14)', fg: '#2c5c9a', nbg: 'rgba(255,255,255,.14)', nfg: '#bcd4f2' },
    ongoing: { label: 'Ongoing', bg: 'rgba(193,154,75,.22)', fg: '#7a5512', nbg: 'rgba(255,255,255,.14)', nfg: '#e9cf98' },
    done: { label: 'Done', bg: 'rgba(31,138,60,.14)', fg: '#1f7a45', nbg: 'rgba(255,255,255,.14)', nfg: '#9fe0b4' },
  };
  const UNDO_MS = 6100, MAXF = 6, REAL_TOO_BIG = 1e9;

  // ---- pure helpers -------------------------------------------------------------------------------------------------------------
  const num = v => (v == null || v === '' || typeof v === 'boolean' || !isFinite(Number(v))) ? null : Number(v);   // unknown stays null, never 0 (ML-05)
  const grp = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function peso(n) {
    n = num(n); if (n == null) return '—';
    const r = Math.round(Math.abs(n) * 100), w = Math.floor(r / 100), c = r % 100;
    return (n < 0 ? '-' : '') + '₱' + grp(String(w)) + (c ? '.' + String(c).padStart(2, '0') : '');
  }
  // a calendar day in Manila as YYYY-MM-DD; a plain date string passes through, a timestamp is read in Manila time (never the runner's clock, ML-38)
  function ymd(d) {
    if (d == null || d === '') return null;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const t = typeof d === 'number' ? d : d instanceof Date ? +d : Date.parse(d);
    return isFinite(t) ? new Date(t + 8 * 36e5).toISOString().slice(0, 10) : null;
  }
  function fyLabel(d) {   // April to March, Manila; same label as fund_label() in 088, e.g. 2026–27
    const k = ymd(d); if (!k) return '';
    const y = +k.slice(0, 4), m = +k.slice(5, 7), s = m >= 4 ? y : y - 1;
    return s + '–' + String((s + 1) % 100).padStart(2, '0');
  }
  const dmy = d => { const k = ymd(d); return k ? +k.slice(8, 10) + ' ' + MON[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) : ''; };
  const monthKey = d => { const k = ymd(d); return k ? k.slice(0, 7) : ''; };
  const monthLabel = k => /^\d{4}-\d{2}$/.test(k) ? MONF[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) : '';
  const pct = (spent, budget) => (num(budget) > 0 ? Math.min(100, Math.round((num(spent) || 0) / num(budget) * 100)) : null);
  const sumCost = rows => rows.reduce((a, e) => a + (num(e.cost) || 0), 0);
  const errMsg = (app, e) => { const m = String((e && e.message) || e || ''); return /year_counted/.test(m) ? 'That fiscal year is already counted, so its money can no longer change here.' : /not_allowed/.test(m) ? 'Only admins can change this.' : /bad_files|bad_poster/.test(m) ? 'That file name or link was not accepted. Try another picture.' : app.errText(e); };

  // rows of one month group, newest first: [{key,label,rows}]
  function groupByMonth(rows) {
    const out = [], idx = {};
    rows.slice().sort((a, b) => (ymd(b.date) || '').localeCompare(ymd(a.date) || '') || (b.id - a.id)).forEach(r => {
      const k = monthKey(r.date) || 'none';
      if (!(k in idx)) { idx[k] = out.length; out.push({ key: k, label: monthLabel(k) || 'No date', rows: [] }); }
      out[idx[k]].rows.push(r);
    });
    return out;
  }

  // totals as tp_board() computes them, from plain rows. projects: [{id,status,budget,...}], ents: [{project,date,cost}], now: ms
  function recalc(projects, ents, now) {
    const today = ymd(now), fy = fyLabel(today), mk = monthKey(today), inFy = e => fyLabel(e.date) === fy;
    const ps = projects.map(p => { const es = ents.filter(e => e.project === p.id); return { ...p, spent: sumCost(es), entries: es.length }; });
    const extras = ents.filter(e => e.project == null), exFy = extras.filter(inFy);
    return {
      fy, projects: ps,
      costs: { fy_total: sumCost(exFy), month_total: sumCost(exFy.filter(e => monthKey(e.date) === mk)), count: extras.length },
      totals: {
        planned: ps.reduce((a, p) => a + (p.status === 'done' ? p.spent : (num(p.budget) || 0)), 0),
        spent_projects: sumCost(ents.filter(e => e.project != null && inFy(e))), extra: sumCost(exFy),
      },
    };
  }

  const SEED = [
    ['Re-painting of the ground floor (as requested by Madame)', 'A fresh new look to brighten our home.'],
    ['Repair and upgrade of the toilet and bath', 'Improved comfort, cleanliness and functionality.'],
    ['Kitchen tiles, sink cabinet door and shelving', 'A cleaner, more organised, more efficient kitchen.'],
    ['Washing machine (top or front load)', 'Making laundry day easier, faster and more convenient.'],
    ['Upgrade of the dining table', 'A better dining experience for meals and bonding.'],
    ['Storage room upgrade', 'Storage rack and standard-size boxes for all members.'],
    ['Bedroom upgrade for all double-deck beds', 'Fully use all available beds.'],
    ['Shoe rack / shoe storage', 'Keep our home tidy, organised and pleasant.'],
    ['Main door digital lock', 'More security, no more lost keys.'],
    ['Laundry and general service area upgrade', 'Cleaner, more functional, more efficient.'],
  ];
  // demo data: the 10 seed projects, all Planned, no budgets, no money; two clearly fake entries so the timeline and Extra costs can be seen in ?demo
  function demo(now) {
    now = now == null ? Date.now() : now; const today = ymd(now);
    const projects = SEED.map((x, i) => ({ id: i + 1, title: x[0], summary: x[1], poster: 'assets/projects/p' + String(i + 1).padStart(2, '0') + '.jpg', budget: null, status: 'planned', sort: i + 1, done_at: null, likes: 0, liked: false, comments: 0 }));
    const ents = [
      { id: 1, project: 3, date: today, title: 'Example update: sample note, not a real record', details: 'This row only exists in the demo.', cost: null, photos: [], receipts: [], by: 'Demo', likes: 0, liked: false, comments: 0 },
      { id: 2, project: null, date: today, title: 'Example cost: sample item, not a real cost', details: '', cost: 1200, photos: [], receipts: [], by: 'Demo', likes: 0, liked: false, comments: 0 },
    ];
    return { projects, ents, board: recalc(projects, ents, now) };
  }

  // ---- demo backend: the same rpc names as 089, on local rows (so everything works offline in ?demo) --------------------------------
  function demoRpc(app, name, a) {
    const st = app.state, admin = st.role !== 'member' && !st.asMember, me = app.byId && app.byId(app.meId()), who = me ? (me.first || me.name || 'Admin') : 'Admin';
    const dm = app._v18tDm || (app._v18tDm = Object.assign(demo(), { nextE: 100, nextP: 100, nextC: 1, likes: {}, cms: {} }));
    const need = () => { if (!admin) throw new Error('not_allowed'); };
    const view = () => {
      const b = recalc(dm.projects, dm.ents, Date.now());
      b.projects = b.projects.map(p => ({ ...p, likes: dm.likes['project:' + p.id] ? 1 : 0, liked: !!dm.likes['project:' + p.id], comments: (dm.cms['project:' + p.id] || []).length })).sort((x, y) => x.sort - y.sort || x.id - y.id);
      return b;
    };
    const R = x => Promise.resolve(JSON.parse(JSON.stringify(x === undefined ? null : x)));
    const ent = e => ({ id: e.id, project_id: e.project, entry_date: e.date, title: e.title, details: e.details, cost: e.cost, photos: e.photos, receipts: e.receipts, by_name: e.by, likes: dm.likes['entry:' + e.id] ? 1 : 0, liked: !!dm.likes['entry:' + e.id], comments: (dm.cms['entry:' + e.id] || []).length });
    try {
      switch (name) {
        case 'tp_board': return R(view());
        case 'tp_entries': return R(dm.ents.filter(e => (a.p_project == null ? e.project == null : e.project === a.p_project)).sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.id - x.id).map(ent));
        case 'tp_like': { const k = a.p_kind + ':' + a.p_target; dm.likes[k] = !dm.likes[k]; return R(!!dm.likes[k]); }
        case 'tp_comments': return R(dm.cms[a.p_kind + ':' + a.p_target] || []);
        case 'tp_comment_add': { const k = a.p_kind + ':' + a.p_target; (dm.cms[k] = dm.cms[k] || []).push({ id: dm.nextC++, author_id: app.meId(), author_name: who, body: a.p_body, hidden: false, created_at: new Date().toISOString() }); return R(dm.nextC); }
        case 'tp_project_save': {
          need(); const o = { title: a.p_title, summary: a.p_summary || '', poster: a.p_poster || null, budget: num(a.p_budget), sort: num(a.p_sort) || 0 };
          if (a.p_id == null) { const id = dm.nextP++; dm.projects.push({ id, status: 'planned', done_at: null, ...o }); return R(id); }
          Object.assign(dm.projects.find(p => p.id === a.p_id) || {}, o); return R(a.p_id);
        }
        case 'tp_project_status': { need(); const p = dm.projects.find(x => x.id === a.p_id); if (p) { p.status = a.p_status; p.done_at = a.p_status === 'done' ? new Date().toISOString() : null; } return R(null); }
        case 'tp_project_delete': need(); dm.projects = dm.projects.filter(p => p.id !== a.p_id); dm.ents = dm.ents.filter(e => e.project !== a.p_id); return R(null);
        case 'tp_entry_save': {
          need(); const o = { project: a.p_project == null ? null : a.p_project, date: a.p_date, title: a.p_title, details: a.p_details || '', cost: num(a.p_cost) > 0 ? num(a.p_cost) : null, photos: a.p_photos || [], receipts: a.p_receipts || [], by: who, likes: 0, liked: false, comments: 0 };
          if (a.p_id == null) { const id = dm.nextE++; dm.ents.push({ id, ...o }); return R(id); }
          Object.assign(dm.ents.find(e => e.id === a.p_id) || {}, o); return R(a.p_id);
        }
        case 'tp_entry_delete': need(); dm.ents = dm.ents.filter(e => e.id !== a.p_id); return R(null);
      }
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('unknown rpc ' + name));
  }

  // ---- data layer ---------------------------------------------------------------------------------------------------------------
  const isDemo = app => !!(app.v18tDemo && app.v18tDemo());
  const rpc = (app, name, args) => isDemo(app) ? demoRpc(app, name, args || {}) : app.sbFetch('rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
  const rows = (r, name) => Array.isArray(r) ? r.map(x => (x && typeof x === 'object' && x[name] && typeof x[name] === 'object' && Object.keys(x).length === 1) ? x[name] : x) : [];   // setof jsonb may come wrapped
  const set = (app, patch) => app.setState(st => ({ v18t: { ...(st.v18t || {}), ...(typeof patch === 'function' ? patch(st.v18t || {}) : patch) } }));
  const T = app => app.state.v18t || {};
  const normProject = p => ({ id: p.id, title: String(p.title || ''), summary: String(p.summary || ''), poster: p.poster || null, budget: num(p.budget), status: ST[p.status] ? p.status : 'planned', sort: num(p.sort) || 0, done_at: p.done_at || null, spent: num(p.spent), entries: num(p.entries) || 0, likes: num(p.likes), liked: !!p.liked, comments: num(p.comments) });
  const normEnt = r => ({ id: r.id, project: r.project_id == null ? null : r.project_id, date: r.entry_date || null, title: String(r.title || ''), details: String(r.details || ''), cost: num(r.cost), photos: Array.isArray(r.photos) ? r.photos : [], receipts: Array.isArray(r.receipts) ? r.receipts : [], by: r.by_name || '', likes: num(r.likes) || 0, liked: !!r.liked, comments: num(r.comments) || 0 });
  const keyOf = project => project == null ? 'x' : 'p' + project;

  async function load(app, quiet) {
    if (app._v18tBusy) { app._v18tAgain = true; return; } app._v18tBusy = true; const had = !!T(app).board;
    if (!had) set(app, { loading: true, err: null });
    try {
      let r = await rpc(app, 'tp_board'); if (r && !r.projects && r.tp_board) r = r.tp_board;
      if (!r || !Array.isArray(r.projects)) throw new Error('The server sent a reply the app could not read.');
      set(app, { board: { ...r, projects: r.projects.map(normProject), costs: r.costs || {}, totals: r.totals || {} }, loading: false, err: null, at: Date.now(), me: app.meId() });
    } catch (e) { set(app, { loading: false, err: app.errText(e) }); if (had && !quiet) app.flash('Couldn’t refresh Projects: ' + app.errText(e)); }
    finally { app._v18tBusy = false; if (app._v18tAgain) { app._v18tAgain = false; return load(app, quiet); } }
  }
  async function loadEnts(app, project) {
    const k = keyOf(project); set(app, t => ({ ents: { ...(t.ents || {}), [k]: { rows: (t.ents && t.ents[k] && t.ents[k].rows) || null, loading: true, err: null } } }));
    try { const r = rows(await rpc(app, 'tp_entries', { p_project: project == null ? null : project }), 'tp_entries').map(normEnt); set(app, t => ({ ents: { ...t.ents, [k]: { rows: r, loading: false, err: null } } })); }
    catch (e) { set(app, t => ({ ents: { ...t.ents, [k]: { rows: (t.ents[k] && t.ents[k].rows) || null, loading: false, err: app.errText(e) } } })); }
  }
  async function loadComments(app, kind, id) {
    const k = kind + ':' + id;
    try { const r = rows(await rpc(app, 'tp_comments', { p_kind: kind, p_target: id }), 'tp_comments'); set(app, t => ({ cm: { ...(t.cm || {}), [k]: r } })); }
    catch (e) { set(app, t => ({ cm: { ...(t.cm || {}), [k]: t.cm && t.cm[k] ? t.cm[k] : [] }, cmErr: app.errText(e) })); }
  }
  const refresh = (app, project) => Promise.all([load(app, true), loadEnts(app, project)]);

  // ---- actions ------------------------------------------------------------------------------------------------------------------
  const patchEnt = (t, k, id, fn) => ({ ents: { ...(t.ents || {}), [k]: { ...(t.ents && t.ents[k]), rows: ((t.ents && t.ents[k] && t.ents[k].rows) || []).map(e => e.id === id ? { ...e, ...fn(e) } : e) } } });
  const patchProj = (t, id, fn) => ({ board: t.board ? { ...t.board, projects: t.board.projects.map(p => p.id === id ? { ...p, ...fn(p) } : p) } : t.board });
  async function like(app, kind, id, project) {
    const k = keyOf(project), cur = kind === 'project' ? (T(app).board.projects.find(p => p.id === id) || {}) : (((T(app).ents[k] || {}).rows || []).find(e => e.id === id) || {});
    const flip = l => ({ liked: !l.liked, likes: Math.max(0, (l.likes || 0) + (l.liked ? -1 : 1)) });
    set(app, t => kind === 'project' ? patchProj(t, id, flip) : patchEnt(t, k, id, flip));
    try { await rpc(app, 'tp_like', { p_kind: kind, p_target: id }); }
    catch (e) { set(app, t => kind === 'project' ? patchProj(t, id, () => ({ liked: cur.liked, likes: cur.likes })) : patchEnt(t, k, id, () => ({ liked: cur.liked, likes: cur.likes }))); app.flash('Not saved: ' + errMsg(app, e)); }
  }
  async function commentAdd(app, kind, id, project) {
    const t = T(app), body = String(t.draft || '').trim(); if (!body || t.cBusy) return; const k = kind + ':' + id;
    if (body.length > 1000) return app.flash('Keep it under 1000 characters.');
    set(app, { cBusy: true });
    try {
      await rpc(app, 'tp_comment_add', { p_kind: kind, p_target: id, p_body: body });
      set(app, { draft: '', cBusy: false }); await loadComments(app, kind, id);
      const bump = l => ({ comments: (l.comments || 0) + 1 }); set(app, t2 => kind === 'project' ? patchProj(t2, id, bump) : patchEnt(t2, keyOf(project), id, bump));
    } catch (e) { set(app, { cBusy: false }); app.flash('Comment not sent: ' + errMsg(app, e)); }
  }
  function msgAdmins(app, subject) {
    const ids = (app.v18tAdmins ? app.v18tAdmins() : []).slice(0, 11);
    app.setState(st => ({ sheet: null, v18t: { ...(st.v18t || {}), drawer: null, form: null, sugOpen: false } }));
    return app.startThread(ids, String(subject || 'House').slice(0, 60));
  }
  const open = (app, kind, id, project) => app.setState(st => ({ sheet: 'v18t', v18t: { ...(st.v18t || {}), drawer: { kind, id, project: project == null ? null : project }, form: null, sugOpen: false, draft: '', cmErr: null } }));
  const close = app => { const wasSug = !!(app.state.v18t && app.state.v18t.sugOpen); app.setState(st => ({ sheet: null, v18t: { ...(st.v18t || {}), drawer: null, form: null, sugOpen: false } })); if (wasSug) focusLater('[data-v181h="fab"]'); };
  // v181h: the suggestion form lives in a sheet behind the floating 'Suggest or report' button (and the House Activity card)
  const openSug = app => { app.setState(st => ({ sheet: 'v18t', v18t: { ...(st.v18t || {}), drawer: null, form: null, sugOpen: true } })); focusLater('[data-v18t="sug-text"]'); }; // v18.1: the sheet is a dialog, so focus goes into it and back to the button on close
  const setSub = (app, sub) => { if (SUBS.includes(sub)) app.setState({ v18tSub: sub }); };

  // the delete runs only after 6 s without Undo; until then the row is hidden, never gone, and the budget card is adjusted (adjust())
  // timers belong to the member who started them: a member change or sign-out cancels them (cancelPending), so one phone never runs A's delete as B
  const pend = app => app._v18tP || (app._v18tP = { owner: null, m: {} });
  function cancelPending(app) {
    const P = app._v18tP; if (!P || !Object.keys(P.m).length) return false;
    Object.keys(P.m).forEach(k => clearTimeout(P.m[k])); P.m = {};
    setTimeout(() => { set(app, { gone: {}, live: '' }); app.setState({ toast: null, undo: null }); }, 0);
    return true;
  }
  const guard = app => { const P = app._v18tP; if (P && Object.keys(P.m).length && P.owner !== app.meId()) cancelPending(app); };
  const focusLater = (sel, fallback) => setTimeout(() => { const d = typeof document !== 'undefined' && document, el = d && (d.querySelector(sel) || d.querySelector(fallback)); if (el && el.focus) el.focus(); }, 60);
  // a screen reader announces a polite region only when its text changes: clear first, then set, so two identical messages in a row are both read
  function say(app, msg) { const P = pend(app), n = P.say = (P.say || 0) + 1; set(app, { live: '' }); setTimeout(() => { if (P.say === n) set(app, { live: msg }); }, 40); }
  function deferred(app, goneKey, msg, run, live, focus) {
    const P = pend(app); P.owner = app.meId();
    const unhide = () => set(app, t => { const g2 = { ...(t.gone || {}) }; delete g2[goneKey]; return { gone: g2 }; });
    set(app, t => ({ gone: { ...(t.gone || {}), [goneKey]: true } })); say(app, live);
    if (focus) focusLater(focus[0], focus[1]);
    P.m[goneKey] = setTimeout(async () => { delete P.m[goneKey]; try { await run(); set(app, { live: '' }); } catch (e) { unhide(); set(app, { live: '' }); app.flash('Not deleted: ' + errMsg(app, e)); } }, UNDO_MS);
    app.flash(msg, () => { clearTimeout(P.m[goneKey]); delete P.m[goneKey]; unhide(); say(app, 'Delete undone.'); app.setState({ toast: null, undo: null }); }, 'Undo');
  }
  const LIVE = what => what + ' deleted. Undo available for ' + Math.round(UNDO_MS / 1000) + ' seconds.';
  // the neighbour a deleted row hands focus to: the next row, else the one before it
  const after = (list, id) => { const i = list.findIndex(x => x.id === id), n = list[i + 1] || list[i - 1]; return n ? n.id : null; };
  function delProject(app, p) {
    close(app);
    const t = T(app), list = t.board ? t.board.projects.filter(x => !(t.gone && t.gone['p' + x.id])).sort((a, b) => a.sort - b.sort || a.id - b.id) : [], nid = after(list, p.id);
    deferred(app, 'p' + p.id, 'Project deleted', async () => { await rpc(app, 'tp_project_delete', { p_id: p.id }); await refresh(app, null); set(app, t2 => { const g2 = { ...(t2.gone || {}) }; delete g2['p' + p.id]; return { gone: g2 }; }); },
      LIVE('Project'), [nid == null ? '[data-v18t="list-heading"]' : '[data-v18t-card="' + nid + '"] [data-v18t="open"]', '[data-v18t="list-heading"]']);
  }
  function delEntry(app, e, project) {
    const t = T(app), k = keyOf(project), byDate = (a, b) => (ymd(b.date) || '').localeCompare(ymd(a.date) || '') || b.id - a.id;
    const list = ((t.ents && t.ents[k] && t.ents[k].rows) || []).filter(x => !(t.gone && t.gone['e' + x.id])).sort(byDate), nid = after(list, e.id), head = project == null ? '[data-v18t="costs-heading"]' : '[data-v18t="tl-heading"]';
    deferred(app, 'e' + e.id, 'Update deleted', async () => { await rpc(app, 'tp_entry_delete', { p_id: e.id }); await refresh(app, project); set(app, t2 => { const g2 = { ...(t2.gone || {}) }; delete g2['e' + e.id]; return { gone: g2 }; }); },
      LIVE(project == null ? 'Cost' : 'Update'), [nid == null ? head : project == null ? '[data-v18t-cost="' + nid + '"]' : '[data-v18t-entry="' + nid + '"] [data-v18t="entry-edit"]', head]);
  }
  async function setStatus(app, p, status) {
    try { await rpc(app, 'tp_project_status', { p_id: p.id, p_status: status }); app.flash(status === 'done' ? 'Marked complete.' : 'Reopened.'); await load(app, true); }
    catch (e) { app.flash('Not saved: ' + errMsg(app, e)); }
  }

  // forms (admin sheets)
  const today = () => ymd(Date.now());
  const openProjectForm = (app, p) => app.setState(st => ({ sheet: 'v18t', v18t: { ...(st.v18t || {}), sugOpen: false, form: { type: 'project', id: p ? p.id : null, title: p ? p.title : '', summary: p ? p.summary : '', budget: p && p.budget != null ? String(p.budget) : '', sort: p ? String(p.sort) : '', poster: p ? p.poster : null, file: null, err: null, busy: '' } } }));
  const openEntryForm = (app, project, e) => app.setState(st => ({ sheet: 'v18t', v18t: { ...(st.v18t || {}), sugOpen: false, form: { type: 'entry', id: e ? e.id : null, project: project == null ? null : project, date: e ? ymd(e.date) : today(), title: e ? e.title : '', details: e ? e.details : '', cost: e && e.cost != null ? String(e.cost) : '', photos: e ? e.photos.slice() : [], receipts: e ? e.receipts.slice() : [], newPhotos: [], newReceipts: [], err: null, busy: '' } } }));
  const form = (app, patch) => set(app, t => ({ form: t.form ? { ...t.form, ...patch } : t.form }));
  const closeForm = app => app.setState(st => { const t = st.v18t || {}; return { sheet: t.drawer ? 'v18t' : null, v18t: { ...t, form: null } }; });
  const hex = () => { const a = new Uint8Array(16); (g.crypto || {}).getRandomValues ? g.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); }); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
  // 089 accepts only [A-Za-z0-9._-]{1,80} with no '..': accents are dropped, other characters become '-', repeats collapse, a short extension survives truncation
  function cleanName(name, max) {
    max = max || 80;
    let s = String(name == null ? '' : name); try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (x) {}
    s = s.replace(/[^A-Za-z0-9._-]/g, '-').replace(/\.{2,}/g, '.').replace(/-{2,}/g, '-');
    const m = /\.[A-Za-z0-9]{1,8}$/.exec(s), ext = m ? m[0] : '', base = (ext ? s.slice(0, -ext.length) : s).replace(/^[-.]+/, '') || 'file';
    return (base.slice(0, Math.max(1, max - ext.length)).replace(/[.-]+$/, '') || 'file') + ext; // a cut can leave a trailing '.', and '.'+ext would make '..'
  }
  const safeName = f => cleanName((f && f.name) || 'photo.jpg');
  async function put(app, bucket, file) {   // unguessable path under projects/ (like stories, 053); returns the stored value
    const f = await app.shrink(file), path = 'projects/' + (bucket === 'receipts' ? hex() + '-' + cleanName(f.name, 47) : hex() + '-' + cleanName(f.name)), url = await app.v18tPut(bucket, path, f);
    return bucket === 'receipts' ? path : url;
  }
  function pickFiles(app, which, e) {
    const files = Array.from((e.target && e.target.files) || []); try { e.target.value = ''; } catch (x) {}
    const [kept, fresh] = which === 'p' ? ['photos', 'newPhotos'] : ['receipts', 'newReceipts'];
    set(app, t => { const f = t.form; if (!f) return {}; const room = Math.max(0, MAXF - f[kept].length - f[fresh].length), imgs = files.filter(x => /^image\//.test(x.type));
      return { form: { ...f, [fresh]: [...f[fresh], ...imgs.slice(0, room)], err: imgs.length < files.length ? 'Pictures only.' : imgs.length > room ? 'Up to ' + MAXF + ' of each.' : null } }; });
  }
  async function saveProject(app) {
    const f = T(app).form; if (!f || f.busy) return; const title = f.title.trim(), summary = f.summary.trim(), budget = String(f.budget).trim() === '' ? null : num(String(f.budget).replace(/,/g, '')), sort = String(f.sort).trim() === '' ? 0 : num(f.sort);
    if (!title || title.length > 120) return form(app, { err: 'Give the project a title (up to 120 characters).' });
    if (summary.length > 2000) return form(app, { err: 'Keep the summary under 2000 characters.' });
    if (budget != null && (budget < 0 || budget > REAL_TOO_BIG)) return form(app, { err: 'Budget must be a peso amount, 0 or more. Leave it empty if not set.' });
    if (sort == null || !Number.isInteger(sort)) return form(app, { err: 'Order must be a whole number.' });
    form(app, { busy: f.file ? 'Uploading picture…' : 'Saving…', err: null });
    try {
      let poster = f.poster; if (f.file) poster = isDemo(app) ? URL.createObjectURL(f.file) : await put(app, 'uploads', f.file);
      await rpc(app, 'tp_project_save', { p_id: f.id, p_title: title, p_summary: summary, p_poster: poster, p_budget: budget, p_sort: sort });
      closeForm(app); app.flash(f.id == null ? 'Project added.' : 'Project saved.'); await load(app, true);
    } catch (e) { form(app, { busy: '', err: 'Couldn’t save: ' + errMsg(app, e) }); }
  }
  async function saveEntry(app) {
    const f = T(app).form; if (!f || f.busy) return; const title = f.title.trim(), details = f.details.trim(), c = String(f.cost).trim() === '' ? null : num(String(f.cost).replace(/,/g, ''));
    if (!title || title.length > 160) return form(app, { err: 'Give the update a title (up to 160 characters).' });
    if (details.length > 4000) return form(app, { err: 'Keep the details under 4000 characters.' });
    if (!ymd(f.date)) return form(app, { err: 'Pick the date.' });
    if (String(f.cost).trim() !== '' && (c == null || c < 0 || c > REAL_TOO_BIG)) return form(app, { err: 'Cost must be a peso amount, 0 or more.' });
    form(app, { busy: 'Saving…', err: null });
    try {
      const photos = f.photos.slice(), receipts = f.receipts.slice(); let n = 0; const total = f.newPhotos.length + f.newReceipts.length;
      for (const x of f.newPhotos) { form(app, { busy: 'Uploading ' + (++n) + ' of ' + total + '…' }); photos.push(isDemo(app) ? URL.createObjectURL(x) : await put(app, 'uploads', x)); }
      for (const x of f.newReceipts) { form(app, { busy: 'Uploading ' + (++n) + ' of ' + total + '…' }); receipts.push(isDemo(app) ? 'projects/demo-' + cleanName(x.name, 70) : await put(app, 'receipts', x)); }
      await rpc(app, 'tp_entry_save', { p_id: f.id, p_project: f.project, p_date: f.date, p_title: title, p_details: details, p_cost: c > 0 ? c : null, p_photos: photos, p_receipts: receipts });
      closeForm(app); app.flash(f.id == null ? 'Update added.' : 'Update saved.'); await refresh(app, f.project);
    } catch (e) { form(app, { busy: '', err: 'Couldn’t save: ' + errMsg(app, e) }); }
  }

  // suggestions: a Crowd post with category House (a poll when "Ask the house" is ticked, else a question); no new table
  const sg = (app, patch) => set(app, t => ({ sug: { ...blankSug(), ...(t.sug || {}), ...patch } }));
  const blankSug = () => ({ text: '', poll: false, opts: ['', ''], img: null, imgName: '', up: false, err: null, busy: false });
  async function pickSugPhoto(app, e) {
    const file = e.target && e.target.files && e.target.files[0]; try { e.target.value = ''; } catch (x) {} if (!file) return;
    if (!/^image\//.test(file.type)) return sg(app, { err: 'Pictures only.' });
    sg(app, { up: true, err: null, imgName: file.name });
    try { const f = await app.shrink(file), u = isDemo(app) ? URL.createObjectURL(f) : await app.upload(f); if (!u) throw new Error('Photo upload failed'); sg(app, { up: false, img: u }); }
    catch (x) { sg(app, { up: false, img: null, imgName: '', err: 'Photo upload failed. You can send without it.' }); }
  }
  async function sendSuggestion(app) {
    const f = { ...blankSug(), ...(T(app).sug || {}) }; if (f.busy) return; const text = f.text.trim(), opts = f.opts.map(o => o.trim()).filter(Boolean).slice(0, 4);
    if (!text) return sg(app, { err: 'Type your suggestion or problem first.' });
    if (f.up) return sg(app, { err: 'The photo is still uploading. Try again in a moment.' });
    if (f.poll && opts.length < 2) return sg(app, { err: 'A poll needs at least 2 choices.' });
    const title = text.split('\n')[0].slice(0, 160), row = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: f.poll ? 'poll' : 'question', title, body: text.length > title.length ? text.slice(0, 4000) : null, url: null, img: f.img || null, category: 'House', dept: 'General', poll: f.poll ? opts : null, author_id: app.meId() };
    sg(app, { busy: true, err: null });
    try {
      let saved = null; if (!isDemo(app) && app._sess) { const r = await app.sbFetch('crowd_posts', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }); saved = r && r[0]; }
      const p = app.crowdFrom(saved ? { ...saved, score: 0, my_vote: 0, comments: 0 } : { ...row, created_at: new Date().toISOString() });
      app.setState(st => ({ crowd: [p, ...st.crowd], v18tSub: 'suggest', sheet: st.sheet === 'v18t' ? null : st.sheet, v18t: { ...(st.v18t || {}), sug: blankSug(), sugOpen: false } })); focusLater('[data-v181h="fab"]');
      app.flash('Sent. Housemates can see it in Suggestions, Crowd and the Feed.');
    } catch (e) { const m = String((e && e.message) || ''); sg(app, { busy: false, err: /Daily limit/i.test(m) ? 'You reached today’s limit of 20 posts. Try again tomorrow.' : 'Couldn’t send: ' + app.errText(e) }); }
  }

  // numbers roll when they change (~30 lines instead of a vendored library: NumberFlow needs a build step); off in low data and reduced motion
  function roll(el, n, on) {
    if (!el) return; const prev = el._v18n; el._v18n = n;
    if (!on || prev == null || n == null || prev === n || !el.firstChild || typeof requestAnimationFrame !== 'function') return;
    const node = el.firstChild, t0 = (g.performance || Date).now(); if (el._v18r) cancelAnimationFrame(el._v18r);
    const step = t => { const k = Math.min(1, Math.max(0, ((t || (g.performance || Date).now()) - t0) / 700)), e = 1 - Math.pow(1 - k, 3); node.nodeValue = k >= 1 ? peso(n) : peso(prev + (n - prev) * e); if (k < 1) el._v18r = requestAnimationFrame(step); };
    el._v18r = requestAnimationFrame(step);
  }

  // what the screen still needs fetched; vals() schedules these once (the loaders set their own busy/error state, so a failure never loops)
  function need(app, s, t, on) {
    const q = [];
    if (!on) return q;
    if (t.me != null && t.me !== app.meId()) return [['me', () => { cancelPending(app); set(app, { board: null, ents: null, cm: null, drawer: null, form: null, gone: {}, err: null, loading: false, sug: null, me: null, live: '' }); }]];   // one shared phone never carries one person's rows or likes to another (ML-46)
    const sub = SUBS.includes(s.v18tSub) ? s.v18tSub : 'projects';
    if (!t.board && !t.loading && !t.err) q.push(['board', () => load(app)]);
    else if (t.board && t.at && Date.now() - t.at > 5 * 60e3) q.push(['stale', () => load(app, true)]);
    if (sub === 'projects' && t.board && !s.lowData) t.board.projects.slice(0, 12).forEach(p => { if (!(t.ents && t.ents[keyOf(p.id)])) q.push(['e' + keyOf(p.id), () => loadEnts(app, p.id)]); });   // v181h: the card's latest-update line; skipped in low data
    if (sub === 'costs' && t.board && !(t.ents && t.ents.x)) q.push(['x', () => loadEnts(app, null)]);
    if (sub === 'suggest' && !s.crowdLoaded) q.push(['crowd', () => app.loadCrowd(true)]);
    const d = t.drawer;
    if (d && s.sheet === 'v18t') {
      const k = d.kind === 'project' ? keyOf(d.id) : keyOf(d.project);
      if (d.kind === 'project' && !(t.ents && t.ents[k])) q.push(['e' + k, () => loadEnts(app, d.id)]);
      if (!(t.cm && t.cm[d.kind + ':' + d.id])) q.push(['c' + d.kind + d.id, () => loadComments(app, d.kind, d.id)]);
      if (d.kind === 'entry' && !(t.ents && t.ents[k])) q.push(['e' + k, () => loadEnts(app, d.project)]);
    }
    return q;
  }
  function schedule(app, q) {
    const run = app._v18tQ || (app._v18tQ = {});
    q.forEach(([k, fn]) => { if (run[k]) return; run[k] = 1; setTimeout(() => { Promise.resolve().then(fn).catch(() => {}).then(() => { run[k] = 0; }); }, 0); });
  }

  // ---- view model ---------------------------------------------------------------------------------------------------------------
  const tag = (status, navy) => { const x = ST[status] || ST.planned; return { label: x.label, bg: navy ? x.nbg : x.bg, fg: navy ? x.nfg : x.fg }; };
  // the board as the list shows it during an Undo window: pending deletes are subtracted client-side (project budget and spent, entry cost) until the delete runs or is undone
  function adjust(board, ents, gone, now) {
    if (!board || !gone || !Object.keys(gone).length) return board;
    const tot = board.totals || {}, co = board.costs || {}, mk = monthKey(now == null ? Date.now() : now), all = [], seen = {};
    Object.keys(ents || {}).forEach(k => (((ents[k] || {}).rows) || []).forEach(e => { if (!seen[e.id]) { seen[e.id] = 1; all.push(e); } }));
    const byId = id => board.projects.find(p => p.id === id);
    let dPlan = 0, dSpent = 0, dExtra = 0, dMonth = 0, dCount = 0, dUnb = 0; const lose = {};
    // spent_projects counts this fiscal year only, but a project's spent is all-time: subtract the in-year entries when they are loaded
    // shortcut: with the entries not loaded the all-time spent is subtracted (the clamp at 0 keeps it sane), so the card can under-read until the delete runs; load the entries first to make it exact
    const inFySpent = p => { const r = ents && ents['p' + p.id] && ents['p' + p.id].rows; return r ? r.reduce((a, e) => a + (fyLabel(e.date) === board.fy ? num(e.cost) || 0 : 0), 0) : (p.spent || 0); };
    board.projects.forEach(p => { if (gone['p' + p.id]) { dPlan += p.status === 'done' ? (p.spent || 0) : (p.budget || 0); dSpent += inFySpent(p); if (p.status !== 'done' && p.budget == null) dUnb++; } });
    all.forEach(e => {
      if (!gone['e' + e.id]) return; const c = num(e.cost) || 0, inFy = fyLabel(e.date) === board.fy;
      if (e.project == null) { dCount++; if (c > 0 && inFy) { dExtra += c; if (monthKey(e.date) === mk) dMonth += c; } return; }
      const pr = byId(e.project); if (!pr || gone['p' + pr.id] || !(c > 0)) return;
      lose[pr.id] = (lose[pr.id] || 0) + c; if (inFy) dSpent += c; if (pr.status === 'done') dPlan += c;
    });
    const sub = (v, d) => num(v) == null ? null : Math.max(0, num(v) - d);
    return { ...board,
      projects: board.projects.filter(p => !gone['p' + p.id]).map(p => lose[p.id] ? { ...p, spent: sub(p.spent, lose[p.id]) } : p),
      totals: { ...tot, planned: sub(tot.planned, dPlan), spent_projects: sub(tot.spent_projects, dSpent), extra: sub(tot.extra, dExtra), ...(num(tot.unbudgeted) == null ? {} : { unbudgeted: sub(tot.unbudgeted, dUnb) }) },
      costs: { ...co, fy_total: sub(co.fy_total, dExtra), month_total: sub(co.month_total, dMonth), count: sub(co.count, dCount) } };
  }
  function boardView(board, gone) {
    const ps = board.projects.filter(p => !(gone && gone['p' + p.id])), tot = board.totals || {}, planned = num(tot.planned), spent = num(tot.spent_projects), extra = num(tot.extra), unb = num(tot.unbudgeted);
    const anyBudget = ps.some(p => p.budget != null || p.status === 'done'), used = planned > 0 && spent != null && extra != null ? Math.min(100, Math.round((spent + extra) / planned * 100)) : null;
    const c = { done: 0, ongoing: 0, planned: 0 }; ps.forEach(p => { c[p.status]++; });
    const head = used != null ? used + '% of plan used' : planned === 0 ? (unb > 0 ? 'Budgets not set yet · ' + unb + (unb === 1 ? ' project' : ' projects') : 'No budgets set yet') : '— of plan used';   // missing field = unknown, not zero
    return {
      planned, spent, extra, anyBudget, used, meter: used == null ? 0 : used,
      usedLine: head + ' · ' + c.done + ' done · ' + c.ongoing + ' ongoing · ' + c.planned + ' planned',
      meterAria: head, fy: board.fy || '',
      list: ps.slice().sort((a, b) => a.sort - b.sort || a.id - b.id),
    };
  }
  function projectLine(p) {
    if (p.budget == null) return p.spent > 0 ? peso(p.spent) + ' spent · budget not set' : 'Budget not set';
    if (p.spent == null) return 'Budget ' + peso(p.budget) + ' · spent —';
    return p.spent > 0 ? peso(p.spent) + ' of ' + peso(p.budget) : 'Budget ' + peso(p.budget);
  }
  // the newest timeline entry of a project, once its entries are loaded (they load with the drawer, so the line may be empty until then)
  const latestLine = (es, gone) => { const r = es && es.rows && es.rows.filter(e => !(gone && gone['e' + e.id])).sort((a, b) => (ymd(b.date) || '').localeCompare(ymd(a.date) || '') || b.id - a.id)[0]; return r ? 'Latest: ' + r.title + ' · ' + dmy(r.date) : ''; };
  const cn = n => n == null ? '—' : n;   // unknown is a dash, never 0 (ML-05)
  const countTxt = (likes, comments) => '♥ ' + cn(likes) + '  ·  💬 ' + cn(comments);

  function vals(app, s, show) {
    guard(app);
    const t = s.v18t || {}, sub = SUBS.includes(s.v18tSub) ? s.v18tSub : 'projects';
    const house = show ? !!show.house : (s.tab === 'house' && s.auth === 'in'), on = house && s.houseSec === 'transparency';
    const sheetOn = !!(on && s.sheet === 'v18t' && (t.drawer || t.form || t.sugOpen));
    if (!on && !sheetOn) return { on: false, sheetOn: false };
    const admin = s.role !== 'member' && !s.asMember, low = !!(s.lowData || g.LOWDATA === true);
    const reduce = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches), anim = !low && !reduce;
    schedule(app, need(app, s, t, on));
    const me = app.meId(), staleMe = t.me != null && t.me !== me, gone = t.gone || {}, board = staleMe ? null : adjust(t.board, t.ents, gone), loaded = t.loaded || {};
    const retry = () => { set(app, { err: null }); load(app); };
    const errTxt = 'Couldn’t load. Try again';
    const bv = board ? boardView(board, gone) : null;
    const nfRef = n => el => roll(el, n, anim);
    const ents = k => t.ents && t.ents[k];
    const poster = (p, big) => {   // low data: a tinted placeholder until the member taps it
      const src = p.poster || '', held = low && !loaded[p.id] && !!src;
      return { src, showImg: !!src && !held, showPh: held, noPic: !src, aspect: big ? 'auto' : '4 / 3', onLoadPic: () => set(app, tt => ({ loaded: { ...(tt.loaded || {}), [p.id]: true } })), onZoom: () => app.setState({ viewer: src, vz: 1, vx: 0, vy: 0 }) };
    };
    const entView = (e, project, canEdit) => ({
      id: e.id, dateLine: dmy(e.date) + (e.by ? ' · ' + e.by : ''), title: e.title, details: e.details, hasDetails: !!e.details, cost: peso(e.cost), hasCost: e.cost != null && e.cost > 0,
      photos: e.photos.map((u, i) => ({ url: u, aria: 'Open photo ' + (i + 1), onOpen: () => app.setState({ viewer: u, vz: 1, vx: 0, vy: 0 }) })), hasPhotos: e.photos.length > 0,
      receipts: e.receipts.map((r, i) => { const u = app.rimg ? app.rimg('receipts/' + r) : null; return { url: u, has: !!u, none: !u, aria: 'Open receipt ' + (i + 1), onOpen: () => { const u2 = app.rimg('receipts/' + r); if (u2) app.setState({ viewer: u2, vz: 1, vx: 0, vy: 0 }); else app.flash('Loading the receipt… tap again in a moment.'); } }; }), hasReceipts: e.receipts.length > 0,
      canEdit, onEdit: () => openEntryForm(app, project, e), onDelete: () => delEntry(app, e, project),
    });

    const out = {
      on, sheetOn, sugSheet: !!(sheetOn && t.sugOpen && !t.drawer && !t.form), sub, isAdmin: admin, lowData: low,
      liveMain: sheetOn ? '' : t.live || '', liveSheet: sheetOn ? t.live || '' : '',
      showLoad: !!(on && !board && !t.err && (sub !== 'suggest')), showErr: !!(on && !board && t.err && sub !== 'suggest'), errText: errTxt, retry,
      isProjects: sub === 'projects' && !!board, isCosts: sub === 'costs' && !!board, isSuggest: sub === 'suggest',
      subs: SUBS.map(k => ({ key: k, label: SUBL[k], on: sub === k ? 'true' : 'false', tab: sub === k ? '0' : '-1', bg: sub === k ? '#3b4658' : 'rgba(255,255,255,.7)', fg: sub === k ? '#fff' : '#15233a', onTap: () => setSub(app, k) })),
      onSubKey: e => {
        const i = SUBS.indexOf(sub), j = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1; if (j < 0) return;
        e.preventDefault(); setSub(app, SUBS[j]); setTimeout(() => { const b = document.querySelector('[data-v18t-sub="' + SUBS[j] + '"]'); if (b) b.focus(); }, 30);
      },
    };

    // suggest card
    const f = { ...blankSug(), ...(t.sug || {}) };
    out.sug = {
      text: f.text, onText: e => sg(app, { text: e.target.value }), poll: f.poll, pollOn: f.poll ? 'true' : 'false', onPoll: () => sg(app, { poll: !f.poll }),
      opts: f.opts.map((o, i) => ({ v: o, aria: 'Choice ' + (i + 1), ph: 'Choice ' + (i + 1), onChange: e => sg(app, { opts: f.opts.map((x, j) => j === i ? e.target.value : x) }) })), canAddOpt: f.opts.length < 4, onAddOpt: () => sg(app, { opts: [...f.opts, ''] }),
      onPhoto: e => pickSugPhoto(app, e), photoLine: f.up ? 'Uploading ' + f.imgName + '…' : f.img ? f.imgName || 'Photo added' : '', hasPhoto: f.up || !!f.img, onClearPhoto: () => sg(app, { img: null, imgName: '' }),
      err: f.err || '', hasErr: !!f.err, open: () => openSug(app), close: () => close(app), send: () => sendSuggestion(app), sendLabel: f.busy ? 'Sending…' : 'Send', msg: () => msgAdmins(app, 'House suggestion'),
    };

    if (board && on) {
      // projects
      out.b = {
        planned: bv.planned == null ? '—' : bv.anyBudget ? peso(bv.planned) : 'Not set', spent: peso(bv.spent), extra: peso(bv.extra), rPlanned: nfRef(bv.anyBudget ? bv.planned : null), rSpent: nfRef(bv.spent), rExtra: nfRef(bv.extra),
        meter: bv.meter + '%', meterAria: bv.meterAria, usedLine: bv.usedLine, fy: bv.fy, title: 'Budget ' + (bv.fy || ''),
      };
      out.cards = bv.list.map((p, i) => {
        const pc = poster(p, false), tg = tag(p.status, true);
        const pp = pct(p.spent, p.budget), lu = latestLine(t.ents && t.ents[keyOf(p.id)], gone);
        return { id: p.id, n: i + 1, title: p.title, line: projectLine(p), hasMeter: pp != null, meter: (pp || 0) + '%', meterAria: (pp || 0) + '% of the budget spent', hasSummary: !!p.summary, summary: p.summary || '', hasLatest: !!lu, latest: lu || '', tagLabel: tg.label, tagBg: '#15233a', tagFg: tg.fg, counts: countTxt(p.likes, p.comments), aria: 'Open ' + (i + 1) + '. ' + p.title, ...pc,
          posterAria: pc.showPh ? 'Load the picture for ' + p.title : 'Open ' + p.title, posterHide: pc.showPh ? 'false' : 'true', posterTab: pc.showPh ? '0' : '-1',
          onOpen: () => open(app, 'project', p.id), onPoster: () => (pc.showPh ? pc.onLoadPic() : open(app, 'project', p.id)) };
      });
      out.noCards = out.cards.length === 0; out.canAddProject = admin; out.addProject = () => openProjectForm(app, null);
      // extra costs
      const co = board.costs || {}, ex = ents('x'), exRows = ex && ex.rows ? ex.rows.filter(e => !gone['e' + e.id]) : null;
      out.x = { fy: bv.fy, fyTotal: peso(co.fy_total), month: peso(co.month_total), rFy: nfRef(num(co.fy_total)), rMonth: nfRef(num(co.month_total)), title: 'Extra costs ' + (bv.fy || '') };
      out.xLoading = !!(ex && ex.loading && !exRows); out.xErr = !!(ex && ex.err && !exRows); out.xRetry = () => loadEnts(app, null);
      out.xNone = !!(exRows && exRows.length === 0); out.canAddCost = admin; out.addCost = () => openEntryForm(app, null, null);
      out.xGroups = exRows ? groupByMonth(exRows).map(gp => ({ key: gp.key, label: gp.label, rows: gp.rows.map(e => ({ id: e.id, title: e.title, aria: 'Open ' + e.title, amount: peso(e.cost), hasAmount: e.cost != null,
        sub: dmy(e.date) + (e.receipts.length ? ' · receipt' : '') + ' · ♥ ' + e.likes + ' · 💬 ' + e.comments, onOpen: () => open(app, 'entry', e.id, null) })) })) : [];
    }

    // suggestions
    if (on && sub === 'suggest') {
      const list = (s.crowd || []).filter(p => p.category === 'House' && !p.hidden).slice().sort((a, b) => String(b.created).localeCompare(String(a.created)));
      out.sgLoading = !s.crowdLoaded && !isDemo(app); out.sgNone = s.crowdLoaded && !list.length || (isDemo(app) && !list.length);
      out.sgRows = list.map(p => {
        const au = app.byId && p.authorId != null ? app.byId(p.authorId) : null, who = au ? (au.first || au.name) : 'A housemate', tl = p.tally || {}, isPoll = Array.isArray(p.poll) && p.poll.length >= 2;
        const total = isPoll ? p.poll.reduce((a, _, i) => a + (num(tl[i]) || 0), 0) : 0;
        return { id: p.id, title: p.title, isPoll, notPoll: !isPoll, sub: who + ' · ' + dmy(p.created) + (isPoll ? '' : ' · ▲ ' + (p.score || 0)) + ' · 💬 ' + (p.comments || 0), aria: 'Open ' + p.title, total: total + (total === 1 ? ' vote' : ' votes'),
          opts: isPoll ? p.poll.map((o, i) => { const n = num(tl[i]) || 0, mine = p.myOpt === i; return { label: o, n, w: (total ? Math.round(n / total * 100) : 0) + '%', aria: o + ', ' + n + (n === 1 ? ' vote' : ' votes') + (mine ? ', your choice' : ''), border: mine ? '#c19a4b' : 'rgba(21,35,58,.14)', onVote: () => app.crowdPoll(p, i) }; }) : [],
          onOpen: () => { app.push('crowdpost:' + p.id); app.loadComments(p.id); } };
      });
    }

    // drawer
    const d = t.drawer;
    if (sheetOn && d) {
      const cmKey = d.kind + ':' + d.id, cmRows = (t.cm && t.cm[cmKey]) || null;
      out.d = { close: () => close(app), grabDown: e => { app.shDown(e); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} }, grabUp: e => app.shUp(e), draft: t.draft || '', onDraft: e => set(app, { draft: e.target.value }), send: () => commentAdd(app, d.kind, d.id, d.project), cBusy: !!t.cBusy, cLabel: t.cBusy ? 'Sending…' : 'Send' };
      out.d.comments = (cmRows || []).filter(c => !c.hidden || admin).map(c => { const au = c.author_id != null && app.byId ? app.byId(c.author_id) : null; return { id: c.id, who: c.author_name || c.by_name || c.name || (au && (au.first || au.name)) || 'A housemate', body: String(c.body || ''), when: dmy(c.created_at) }; });
      out.d.cLoading = !cmRows && !t.cmErr; out.d.cErr = !cmRows && !!t.cmErr; out.d.noComments = !!cmRows && out.d.comments.length === 0;
      let item, project, es;
      if (d.kind === 'project') {
        const p = board && board.projects.find(x => x.id === d.id); item = p; project = d.id; es = ents(keyOf(d.id));
        if (p) {
          const pc = poster(p, true), tg = tag(p.status, false), pp = pct(p.spent, p.budget);
          Object.assign(out.d, { isProject: true, isEntry: false, aria: 'Project timeline: ' + p.title, title: p.title, summary: p.summary, hasSummary: !!p.summary, tagLabel: tg.label, tagBg: tg.bg, tagFg: tg.fg, ...pc,
            spent: peso(p.spent), budget: p.budget != null ? peso(p.budget) : 'Not set', hasMeter: pp != null, meter: (pp || 0) + '%', meterAria: (pp || 0) + '% of the budget spent',
            liked: p.liked ? 'true' : 'false', likeLabel: '♥ ' + (p.liked ? 'Liked' : 'Like') + (p.likes ? ' · ' + p.likes : ''), onLike: () => like(app, 'project', p.id, null), onMsg: () => msgAdmins(app, 'Project: ' + p.title),
            isDone: p.status === 'done', doneLabel: p.status === 'done' ? '↺ Reopen' : '✓ Mark complete', onDone: () => setStatus(app, p, p.status === 'done' ? 'planned' : 'done'),
            onEdit: () => openProjectForm(app, p), onAddUpdate: () => openEntryForm(app, p.id, null), onDelete: () => delProject(app, p) });
        }
      } else {
        project = null; es = ents('x'); const e = es && es.rows && es.rows.find(x => x.id === d.id); item = e;
        if (e) Object.assign(out.d, { isProject: false, isEntry: true, aria: 'Extra cost: ' + e.title, ...entView(e, null, admin), liked: e.liked ? 'true' : 'false', likeLabel: '♥ ' + (e.liked ? 'Liked' : 'Like') + (e.likes ? ' · ' + e.likes : ''), onLike: () => like(app, 'entry', e.id, null), onMsg: () => msgAdmins(app, 'Extra cost: ' + e.title),
          onEditEntry: () => openEntryForm(app, null, e), onDeleteEntry: () => { close(app); delEntry(app, e, null); } });
      }
      out.d.found = !!item; out.d.missing = !item && !!board && !(es && es.loading);
      if (d.kind === 'project') {
        const rows2 = es && es.rows ? es.rows.filter(e => !gone['e' + e.id]) : null;
        out.d.tlLoading = !!(es && es.loading && !rows2) || !es; out.d.tlErr = !!(es && es.err && !rows2); out.d.tlRetry = () => loadEnts(app, d.id);
        out.d.tlNone = !!(rows2 && rows2.length === 0);
        out.d.timeline = rows2 ? rows2.slice().sort((a, b) => (ymd(b.date) || '').localeCompare(ymd(a.date) || '') || b.id - a.id).map(e => entView(e, d.id, admin)) : [];
      }
      out.d.isAdmin = admin;
    }

    // admin forms
    const fm = t.form;
    out.hasForm = !!(sheetOn && fm);
    if (sheetOn && fm) {
      const base = { cancel: () => closeForm(app), err: fm.err || '', hasErr: !!fm.err, busy: !!fm.busy, saveLabel: fm.busy || 'Save' };
      if (fm.type === 'project') {
        out.f = { ...base, isProject: true, isEntry: false, heading: fm.id == null ? 'Add project' : 'Edit project', title: fm.title, onTitle: e => form(app, { title: e.target.value }), summary: fm.summary, onSummary: e => form(app, { summary: e.target.value }),
          budget: fm.budget, onBudget: e => form(app, { budget: e.target.value }), sort: fm.sort, onSort: e => form(app, { sort: e.target.value }),
          posterLine: fm.file ? fm.file.name : fm.poster ? 'Keeping the current picture' : 'No picture', onPoster: e => { const x = e.target.files && e.target.files[0]; try { e.target.value = ''; } catch (z) {} if (x && /^image\//.test(x.type)) form(app, { file: x, err: null }); else if (x) form(app, { err: 'Pictures only.' }); },
          save: () => saveProject(app) };
      } else {
        const c = String(fm.cost).trim() === '' ? null : num(String(fm.cost).replace(/,/g, '')), fy = fyLabel(fm.date);
        const mk = (arr, which, kind) => arr.map((x, i) => ({ name: typeof x === 'string' ? kind + ' ' + (i + 1) + ' (saved)' : x.name, aria: 'Remove ' + kind.toLowerCase() + ' ' + (i + 1), onRemove: () => form(app, { [which]: arr.filter((_, j) => j !== i) }) }));
        const nP = fm.photos.length + fm.newPhotos.length, nR = fm.receipts.length + fm.newReceipts.length;
        out.f = { ...base, isProject: false, isEntry: true, heading: fm.id == null ? (fm.project == null ? 'Add extra cost' : 'Add update') : 'Edit update', date: fm.date, onDate: e => form(app, { date: e.target.value }), title: fm.title, onTitle: e => form(app, { title: e.target.value }),
          details: fm.details, onDetails: e => form(app, { details: e.target.value }), cost: fm.cost, onCost: e => form(app, { cost: e.target.value }), also: c > 0 ? 'Also records ' + peso(c) + ' in Money out for ' + fy : '', hasAlso: c > 0,
          photoRows: [...mk(fm.photos, 'photos', 'Photo'), ...mk(fm.newPhotos, 'newPhotos', 'Photo')], canAddPhoto: nP < MAXF, onPhotos: e => pickFiles(app, 'p', e), photoCount: nP + ' of ' + MAXF,
          receiptRows: [...mk(fm.receipts, 'receipts', 'Receipt'), ...mk(fm.newReceipts, 'newReceipts', 'Receipt')], canAddReceipt: nR < MAXF, onReceipts: e => pickFiles(app, 'r', e), receiptCount: nR + ' of ' + MAXF, save: () => saveEntry(app) };
      }
    }
    return out;
  }

  const api = { openSug, openEntryForm, closeSug: close, cleanName, vals, adjust, cancelPending, demo, demoRpc, peso, fyLabel, ymd, dmy, monthKey, monthLabel, recalc, groupByMonth, boardView, projectLine, pct, num, roll, need, load, loadEnts, loadComments, like, commentAdd, msgAdmins, open, close, setSub,
    delProject, delEntry, setStatus, saveProject, saveEntry, sendSuggestion, pickSugPhoto, UNDO_MS };
  g.V18T = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
