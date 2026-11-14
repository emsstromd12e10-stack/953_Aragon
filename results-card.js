// v17 lane F: the Results card (lotto + NBA + Dota 2). Pure functions; the app calls V17F.build() in its feed builder and V17F.demo() in demo mode.
// Browser: window.V17F; Node tests: require('./results-card.js'). Rows are read from the `results` table (071) and the lotto rows (044), never from news.
(function (g) {
  const H = 36e5, DAY = 864e5, SLOT_H = { '2PM': 14, '5PM': 17, '9PM': 21 }, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CAP = { lotto: 3, nba: 10, dota2: 10 }, VIS = 3, NBA_MAX_AGE = 3.5 * H, DOTA_MAX_AGE = 3 * DAY;   // cron runs every 3 h: one missed run and the NBA part is hidden (owner ruling: hidden whenever the fetch fails or is stale)
  const ms = v => { const t = typeof v === 'number' ? v : Date.parse(v); return isFinite(t) ? t : null; };
  const ago = (at, now) => { // "5 min ago", "3 h ago", then the date; unknown time stays empty, never "0 min ago"
    if (at == null) return ''; const d = now - at; if (d < 0) return '';
    if (d < H) return Math.max(1, Math.round(d / 6e4)) + ' min ago';
    if (d < 2 * DAY) return Math.round(d / H) + ' h ago';
    const x = new Date(at + 8 * H); return MON[x.getUTCMonth()] + ' ' + x.getUTCDate();
  };
  const drawAt = r => { const h = SLOT_H[r.draw_time || '9PM'], t = /^\d{4}-\d{2}-\d{2}$/.test(r.draw_date || '') && h ? Date.parse(r.draw_date + 'T' + h + ':00:00+08:00') : NaN; return isFinite(t) ? t : null; };
  // the NBA (or any sport) part is stale when the newest successful fetch is older than the limit, or unknown
  const stale = (rows, now, max) => { let n = null; rows.forEach(r => { const t = ms(r.fetched_at); if (t != null && (n == null || t > n)) n = t; }); return n == null || now - n > (max || NBA_MAX_AGE); };

  // the latest attempt for a source failed: results_status row has a last_error newer than its last_ok (or an error and no success)
  const failed = (status, key) => { const x = Array.isArray(status) && status.find(r => r && r.source === key), e = x && ms(x.last_error), k = x && ms(x.last_ok); return e != null && (k == null || e > k); };

  // o: {now, demo, toolRow(lottoRow) -> {name, slot, sub, balls, aria}, games: [[key, name]...] (order = jackpot games first), nbaMaxAge, status: results_status rows [{source, last_ok, last_error}]}
  function build(lottoRows, results, o) {
    o = o || {}; const now = o.now == null ? Date.now() : o.now, order = (o.games || []).map(x => x[0]);
    const ord = k => { const i = order.indexOf(k); return i < 0 ? 99 : i; };
    const out = [];
    if (Array.isArray(lottoRows) && o.toolRow) {
      const ok = lottoRows.filter(r => r && o.toolRow && r.numbers && order.includes(r.game) && drawAt(r) != null);
      const day = ok.reduce((m, r) => r.draw_date > m ? r.draw_date : m, '');   // only the latest draw day
      ok.filter(r => r.draw_date === day).sort((a, b) => ord(a.game) - ord(b.game) || (SLOT_H[b.draw_time] || 0) - (SLOT_H[a.draw_time] || 0)).slice(0, CAP.lotto).forEach(r => {
        const t = o.toolRow(r), at = drawAt(r);
        out.push({ id: 'lotto:' + r.draw_date + ':' + r.game + ':' + (r.draw_time || '9PM'), sport: 'lotto', line: t.name + (t.slot ? ' · ' + t.slot : ''), sub: t.sub || '', balls: t.balls || [], hasBalls: true,
          at, when: ago(at, now), src: 'PCSO lotto (unofficial)', url: null, hasUrl: false, noUrl: true, logoHost: 'pcso.gov.ph', aria: t.aria });
      });
    }
    const all = Array.isArray(results) ? results.filter(r => r && r.status === 'final' && r.home && r.away && r.home_score != null && r.away_score != null && ms(r.starts_at) != null) : [];
    const hideNba = stale(Array.isArray(results) ? results.filter(r => r && r.sport === 'nba') : [], now, o.nbaMaxAge) || failed(o.status, 'nba');
    // Dota 2 is hidden when its latest fetch failed or the newest Dota row is more than 3 days old (X2, 23 Oct 2026)
    const dotaRows = all.filter(r => r.sport === 'dota2'), newestDota = dotaRows.reduce((m, r) => Math.max(m, ms(r.starts_at)), -Infinity), hideDota = failed(o.status, 'dota2') || (dotaRows.length > 0 && now - newestDota > DOTA_MAX_AGE);
    [['nba', hideNba], ['dota2', hideDota]].forEach(([sport, hide]) => {
      if (hide) return;
      all.filter(r => r.sport === sport).sort((a, b) => ms(b.starts_at) - ms(a.starts_at)).slice(0, CAP[sport]).forEach(r => {
        const at = ms(r.starts_at), nba = sport === 'nba', url = typeof r.url === 'string' && /^https:\/\//.test(r.url) ? r.url : null;
        const line = nba ? r.home + ' ' + r.home_score + ', ' + r.away + ' ' + r.away_score : r.home + ' beat ' + r.away;   // Dota rows hold the winner first; the score is kills
        out.push({ id: r.id, sport, line, sub: nba ? 'NBA' : (r.league ? r.league + ' · ' : '') + 'kills ' + r.home_score + '–' + r.away_score, balls: [], hasBalls: false, at, when: ago(at, now),
          src: nba ? 'ESPN (unofficial)' : 'OpenDota', url, hasUrl: !!url, noUrl: !url, logoHost: nba ? 'espn.com' : 'opendota.com', aria: line });
      });
    });
    // sections (X6): Lotto / Sports / E-games, each latest first, VIS rows unless opened; an empty section is hidden, no section at all gives no card
    const open = o.open || {}, srcs = [['lotto', 'Lotto', ['lotto'], 'lotto from lottopcso.com. Check pcso.gov.ph. For information only. 18+.'], ['sports', 'Sports', ['nba'], 'NBA from ESPN. For information only.'], ['egames', 'E-games', ['dota2'], 'Dota 2 from OpenDota. For information only.']];
    const sections = srcs.map(([key, title, sp, f]) => {
      const all = out.filter(r => sp.includes(r.sport)).sort((a, b) => b.at - a.at);
      if (!all.length) return null;
      const more = key !== 'lotto' && all.length > VIS, isOpen = !!open[key];   // Lotto's "See all" opens the Lotto tool, not an in-place list
      return { key, title, rows: more && !isOpen ? all.slice(0, VIS) : all, total: all.length, hasMore: more, open: isOpen, aria: isOpen ? 'true' : 'false', moreLabel: isOpen ? 'Show less' : 'See all ' + all.length, hasTool: key === 'lotto' && !!o.tool,
        foot: o.demo ? '' : 'Unofficial source: ' + f, hasFoot: !o.demo };
    }).filter(Boolean);
    if (!sections.length) return null;
    const rows = sections.reduce((m, x) => m.concat(x.rows), []);
    return { id: 'v17f-results', v17f: true, sections, rows, foot: o.demo ? [{ t: 'SAMPLE results for the demo, not real draws or games.' }] : [], latest: Math.max.apply(null, rows.map(r => r.at)) };
  }

  // demo mode: clearly marked sample rows, fetched "now", so the whole card can be seen without a database
  function demo(now) {
    const iso = d => new Date(now - d).toISOString(), t = iso(0);
    const r = (id, sport, league, home, away, hs, as, ago_, url) => ({ id, sport, league, home, away, home_score: hs, away_score: as, status: 'final', starts_at: iso(ago_), url, source: sport === 'nba' ? 'ESPN' : 'OpenDota', fetched_at: t });
    return [r('nba:demo1', 'nba', 'NBA', 'Sample Home', 'Sample Away', 110, 102, 4 * H, 'https://www.espn.com/nba/scoreboard'), r('dota2:demo1', 'dota2', 'Sample Cup', 'Sample Team A', 'Sample Team B', 41, 23, 2 * H, 'https://www.opendota.com/')];
  }

  const V17F = { build, demo, ago, stale, drawAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = V17F; else g.V17F = V17F;
})(typeof window !== 'undefined' ? window : globalThis);
