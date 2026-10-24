// v17 lane C: feed card visuals. Pure helpers (meta line, background, image check, card fields) plus the card CSS. No network, no storage.
// Browser: window.V17C (the CSS is injected once); Node tests: require('./feed-cards.js').
(function (g) {
  const V = {};

  // ---------- meta line: "gCaptain · 2 min read · 3 h ago" ----------
  // Unknown parts are left out (never "1 min read" for a story we know nothing about, never "0 h ago"). Reading time = words / 200, at least 1.
  V.readMin = words => { const n = Number(words); return words == null || words === '' || !isFinite(n) || n <= 0 ? null : Math.max(1, Math.round(n / 200)); };
  V.ago = (published, now) => {
    if (!published) return '';
    const t = Date.parse(published), n = now == null ? Date.now() : Number(now);
    if (!isFinite(t) || !isFinite(n) || t - n > 5 * 6e4) return ''; // unparseable or from the future: say nothing
    const m = Math.floor(Math.max(0, n - t) / 6e4);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.floor(m / 60) + ' h ago';
    if (m < 10080) return Math.floor(m / 1440) + ' d ago';
    try { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }); } catch (e) { return ''; }
  };
  V.meta = ({ source, published, words, now } = {}) => {
    const rm = V.readMin(words);
    return [source ? String(source).trim() : '', rm ? rm + ' min read' : '', V.ago(published, now)].filter(Boolean).join(' · ');
  };

  // ---------- six backgrounds for text-only cards ----------
  // Light pastels with dark text: the app's dark mode inverts the page (html[data-theme=dark]), which turns these into dark surfaces with light text
  // at the same contrast. fg is the headline, sub the summary and meta text; both are checked against bg (WCAG AA 4.5) in the unit test.
  V.BG = [
    { n: 1, bg: '#e4edf7', bg2: '#eef3fa' }, { n: 2, bg: '#f3ead9', bg2: '#f8f2e6' }, { n: 3, bg: '#e1f0e7', bg2: '#ecf5ef' },
    { n: 4, bg: '#f3e3ea', bg2: '#f8edf1' }, { n: 5, bg: '#e8e6f6', bg2: '#f1f0fa' }, { n: 6, bg: '#f8e6d8', bg2: '#fbf0e7' },
  ].map(b => ({ ...b, cls: 'v17c-bg-' + b.n, fg: '#15233a', sub: '#3a4352', meta: '#4c5566' }));
  V.hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  V.style = (kind, id) => V.BG[V.hash(String(kind) + '|' + String(id)) % V.BG.length]; // the full pair (colours + class)
  V.bg = (kind, id) => V.style(kind, id).cls; // contract: the class string 'v17c-bg-N'

  // ---------- image: https only, one link, never a tracking pixel ----------
  V.img = ({ src, alt } = {}) => {
    if (typeof src !== 'string') return null;
    const u = src.trim();
    if (!/^https:\/\/[^\s"'<>()\\]+$/i.test(u) || u.length > 500) return null; // http:, data:, javascript: and anything with a space or quote
    if (/(^|[\/_.-])(1x1|pixel|spacer|blank|placeholder)([\/_.-]|$)/i.test(u.replace(/^https:\/\/[^\/]+/i, ''))) return null;
    return { src: u, alt: alt ? String(alt) : '', ratio: '16/9' };
  };

  // WCAG contrast of two #rrggbb colours (used by the unit test)
  V.contrast = (a, b) => {
    const L = c => { const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(x => x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4)); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  };

  // empty news tab (U-08): "No Money stories today"; a label that already ends in "news" reads "No Seafarer news today"
  V.emptyText = label => { const l = String(label || 'news').trim(); return /news$/i.test(l) ? 'No ' + l + ' today' : 'No ' + l + ' stories today'; };

  // ---------- the card fields the Feed template reads (one call per post, spread into the mapped card) ----------
  // c = { news, tab, topic (TOPIC_OF), kind ({tag,bg,fg}), open (aria prefix), now }. Non-news posts get only the neutral defaults; the old card is unchanged.
  const onErr = e => { try { if (e && e.target) e.target.style.visibility = 'hidden'; } catch (x) {} }; // the 16:9 box and its fixed colour stay
  V.card = (p, c = {}) => {
    const base = { v17cCls: '', v17cAv: '', v17cNoAuthor: false, v17cBg: '', v17cMeta: '', v17cOn: false, v17cTag: null, v17cImg: null, v17cTitle: '', v17cBody: '', v17cAria: '', v17cErr: onErr };
    if (!c.news) return base;
    const img = V.img({ src: p.image, alt: p.title ? 'Photo: ' + p.title : 'Story photo' }), bg = V.style(p.kind, p.id);
    const showTag = c.kind && c.topic && c.tab !== c.topic(p.kind) && ['news', 'health'].includes(p.kind); // same tag rule as before, minus the tab the member is already in
    const meta = V.meta({ source: p.source, published: p.pubAt, words: p.words, now: c.now }) + (p.pubAt || !p.time ? '' : ' · ' + p.time); // demo stories carry only a label like "Oct 8"
    return {
      ...base, meta: meta || String(p.source || ''), title: '', body: '', isNews: false, v15aReal: false, v17cPinOnly: true, showTags: false, // old title, body, tag row, source button and Like/Comment bar are replaced
      cardBg: 'var(--v17c-bg,rgba(255,255,255,.7))', v17cCls: 'v17c-card' + (img ? '' : ' ' + bg.cls), v17cAv: 'v17c-av', v17cNoAuthor: true, v17cBg: img ? '' : bg.cls, v17cMeta: 'v17c-meta',
      v17cOn: true, v17cTag: showTag ? { t: c.kind.tag, bg: c.kind.bg, fg: c.kind.fg } : null, v17cImg: img, v17cTitle: p.title || '', v17cBody: p.body || '',
      v17cAria: (c.open || 'Read the full report') + ': ' + (p.title || p.source || ''),
    };
  };

  // ---------- CSS (injected once; sizes are fixed so nothing moves when an image arrives) ----------
  V.css = '.v17c-card{padding:12px!important;gap:8px!important;contain-intrinsic-size:auto 150px!important}'
    + '.v17c-av{width:28px!important;height:28px!important;border-width:0!important;padding:0!important}.v17c-av>span{font-size:10px!important}'
    + '.v17c-meta{font-size:12.5px!important;font-weight:600;color:#4c5566!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.v17c-t,.v17c-d{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}'
    + '.v17c-t{-webkit-line-clamp:2;font-size:15px;font-weight:600;line-height:1.3;color:#15233a;text-wrap:pretty}'
    + '.v17c-d{-webkit-line-clamp:2;font-size:13px;line-height:1.4;color:#3a4352}'
    + '.v17c-ph{flex:none;position:relative;display:block;width:128px;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#d9dde5}'
    + '.v17c-ph img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block}'
    + V.BG.map(b => '.' + b.cls + '{--v17c-bg:linear-gradient(150deg,' + b.bg + ',' + b.bg2 + ')}').join('');
  if (typeof document !== 'undefined' && document.head && !document.getElementById('v17c-css')) {
    const st = document.createElement('style'); st.id = 'v17c-css'; st.textContent = V.css; document.head.appendChild(st);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = V; else g.V17C = V;
})(typeof window !== 'undefined' ? window : this);
