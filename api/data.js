// GET /api/data?q=...
//   home                                   the latest automatic diagrams and today's status
//   dataset&mode=daily&date=YYYYMMDD       a night's statistic rows (for editing diagrams in the browser)
//   dataset&mode=season&season=&stype=&from=&to=
//   seasons                                seasons with data, and their game dates
//   catalog&mode=daily|season              every statistic, with what's available for a scope (see dataset)
import { db } from '../lib/db.js';
import { route, cache, fail } from '../lib/http.js';
import { etDate, addDays, seasonInfo } from '../lib/data.js';
import { rowsFor, getSettings, statsFor, allStats, describe } from '../lib/diagrams.js';
import { UNAVAILABLE } from '../lib/stats/catalog.js';

const isDate = s => /^\d{8}$/.test(String(s || ''));
const round = v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
const slimRow = r => ({ id: r.id, name: r.name, short: r.short, headshot: r.headshot, team: r.team, opp: r.opp, v: Object.fromEntries(Object.entries(r.v).filter(([, x]) => x != null).map(([k, x]) => [k, round(x)])), n: r.n });

export default route({
  GET: async ({ res, query }) => {
    const d = await db();
    const q = String(query.q || 'home');
    if (q === 'home') {
      const today = etDate(), yesterday = addDays(today, -1);
      const [daily, season, days, settings] = await Promise.all([
        d.collection('diagrams').find({ kind: 'daily', auto: true, latest: true }).sort({ date: -1 }).limit(1).next(),
        d.collection('diagrams').find({ kind: 'season', auto: true, latest: true }).sort({ date: -1 }).limit(1).next(),
        d.collection('days').find({ _id: { $in: [today, yesterday] } }).toArray(),
        getSettings(d),
      ]);
      cache(res, 60, 600);
      return { today, days: days.map(x => ({ date: x._id, games: x.games, final: x.final, pending: x.pending, excluded: x.excluded, complete: x.complete, noGames: x.noGames, checkedAt: x.checkedAt })), daily, season, defaults: { daily: settings.daily, season: settings.season } };
    }
    if (q === 'seasons') {
      const years = (await d.collection('pgames').distinct('season')).filter(Boolean).sort((a, b) => b - a);
      const out = [];
      for (const y of years) { const info = await seasonInfo(d, y).catch(() => null); out.push({ year: y, label: info?.label || String(y), start: info?.start, end: info?.end, playoffStart: info?.playoffStart, dates: info?.dates || [] }); }
      cache(res, 3600, 86400);
      return { seasons: out, today: etDate() };
    }
    if (q === 'catalog') {
      const mode = query.mode === 'season' ? 'season' : 'daily';
      cache(res, 86400);
      return { mode, stats: allStats(mode), unavailable: UNAVAILABLE };
    }
    if (q === 'dataset') {
      const mode = query.mode === 'season' ? 'season' : 'daily';
      let cfg;
      if (mode === 'daily') {
        if (!isDate(query.date)) fail(400, 'Dates look like 20251029');
        cfg = { mode, date: String(query.date) };
      } else {
        const season = +query.season;
        if (!season) fail(400, 'Which season?');
        cfg = { mode, season, stype: ['regular', 'playoffs', 'all'].includes(query.stype) ? query.stype : 'regular', from: isDate(query.from) ? query.from : null, to: isDate(query.to) ? query.to : null };
      }
      const [{ rows, meta }, settings] = await Promise.all([rowsFor(d, cfg), getSettings(d)]);
      const available = statsFor(mode, rows).map(s => s.key);
      cache(res, mode === 'daily' && meta.complete ? 1800 : 300, 3600);
      return { config: cfg, ...describe(cfg), meta, minimums: settings.minimums, available, rows: rows.map(slimRow) };
    }
    fail(404, 'Unknown query');
  },
});
