// Search and the pages behind it: players, teams, games (the game context behind feed entries). Story-first: each page
// leads with the player's or team's feed entries; numbers are context, not dashboards.
import { db } from '../lib/db.js';
import { route, actions, fail, int, str, idParam, privateCache } from '../lib/http.js';
import { data } from '../lib/providers/index.js';
import { isLive } from '../lib/providers/espn.js';
import { LINE } from '../lib/stats.js';
import { etDate, seasonOf, escapeRe, round } from '../lib/util.js';

const avgOf = rows => {
  if (!rows.length) return null;
  const s = k => rows.reduce((a, r) => a + r[k], 0);
  const fga = s('fga'), fta = s('fta');
  return { gp: rows.length, pts: round(s('pts') / rows.length, 1), reb: round(s('reb') / rows.length, 1), ast: round(s('ast') / rows.length, 1), stl: round(s('stl') / rows.length, 1), blk: round(s('blk') / rows.length, 1),
    min: round(s('min') / rows.length, 1), fg_pct: fga ? round((100 * s('fgm')) / fga, 1) : null, tp_pct: s('tpa') ? round((100 * s('tpm')) / s('tpa'), 1) : null, ts_pct: fga + fta ? round((100 * s('pts')) / (2 * (fga + 0.44 * fta)), 1) : null, starts: rows.filter(r => r.gs).length };
};

export default route({
  GET: actions({
    async search({ res, query }) {
      const d = await db();
      const term = str(query.term, 60);
      if (term.length < 2) return { players: [], teams: [], events: [], records: [] };
      const re = new RegExp(term.split(/\s+/).map(escapeRe).join('.*'), 'i');
      const [players, teams, events, records] = await Promise.all([
        d.collection('players').find({ name: re }, { projection: { name: 1, team: 1, pos: 1, headshot: 1, lastGame: 1 } }).sort({ lastGame: -1 }).limit(8).toArray(),
        d.collection('teams').find({ $or: [{ name: re }, { abbr: re }, { location: re }] }).limit(5).toArray(),
        d.collection('feed').find({ published: true, $or: [{ headline: re }, { 'players.name': re }, { 'team.name': re }] }, { projection: { headline: 1, body: 1, category: 1, game: 1, players: 1, level: 1 } }).sort({ sortAt: -1 }).limit(6).toArray(),
        d.collection('records').find({ $or: [{ title: re }, { scopeLabel: re }, { 'entries.name': re }] }, { projection: { title: 1, scopeLabel: 1, entries: { $slice: 1 } } }).limit(5).toArray(),
      ]);
      const extra = players.length < 3 ? (await data.search(term).catch(() => [])).filter(x => !players.some(p => p._id === x.id)).slice(0, 4) : [];
      const tm = new Map((await d.collection('teams').find({}).toArray()).map(t => [t._id, t]));
      privateCache(res, 30);
      return { players: [...players.map(p => ({ id: p._id, name: p.name, team: tm.get(p.team)?.abbr, pos: p.pos, headshot: p.headshot })), ...extra],
        teams: teams.map(t => ({ id: t._id, name: t.name, abbr: t.abbr, logo: t.logo, color: t.color })), events, records };
    },
    async teams({ res }) {
      const d = await db();
      let teams = await d.collection('teams').find({}).sort({ name: 1 }).toArray();
      if (teams.length < 30) { const fresh = await data.teams(); for (const t of fresh) await d.collection('teams').updateOne({ _id: t.id }, { $set: t }, { upsert: true }); teams = fresh.map(t => ({ _id: t.id, ...t })); }
      cache(res);
      return teams.map(t => ({ id: t._id, name: t.name, abbr: t.abbr, short: t.short, logo: t.logo, color: t.color }));
      function cache(r) { r.setHeader('cache-control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'); }
    },
    async player({ query }) {
      const d = await db();
      const id = idParam(query.id);
      const [p, bio] = await Promise.all([d.collection('players').findOne({ _id: id }), data.athlete(id).catch(() => null)]);
      if (!p && !bio) fail(404, 'No such player');
      const season = seasonOf(etDate());
      const [games, career, feed, perfs, highs, tm] = await Promise.all([
        d.collection('pgames').find({ p: id, s: season }).sort({ d: -1 }).toArray(),
        data.career(id, 2).catch(() => null),
        d.collection('feed').find({ 'players.id': id, published: true }).sort({ sortAt: -1 }).limit(20).toArray(),
        d.collection('performances').find({ pid: id }).sort({ date: -1 }).limit(8).toArray(),
        d.collection('pgames').aggregate([{ $match: { p: id } }, { $group: { _id: null, n: { $sum: 1 }, ...Object.fromEntries(['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'].map(k => [k, { $max: `$${k}` }])) } }]).toArray(),
        d.collection('teams').find({}).toArray().then(x => new Map(x.map(t => [t._id, t]))),
      ]);
      const reg = games.filter(r => r.st === 2);
      const team = tm.get(bio?.team || p?.team);
      return {
        player: { id, name: bio?.name || p?.name, headshot: bio?.headshot || p?.headshot, pos: bio?.posName || p?.pos, jersey: bio?.jersey, age: bio?.dob ? Math.floor((Date.now() - new Date(bio.dob)) / (365.2425 * 86400e3)) : null,
          height: bio?.height, weight: bio?.weight, country: bio?.country, birthPlace: bio?.birthPlace, college: bio?.college, draft: bio?.draft, debut: bio?.debut, experience: bio?.experience, status: bio?.status,
          team: team ? { id: team._id, name: team.name, abbr: team.abbr, logo: team.logo, color: team.color } : null },
        season: { year: season, averages: avgOf(reg), last5: avgOf(reg.slice(0, 5)) },
        recent: games.slice(0, 8).map(r => ({ gid: r.g, date: String(r.d), opp: tm.get(r.o)?.abbr, won: r.w, line: Object.fromEntries(LINE.map(k => [k, r[k]])) })),
        career: career ? { totals: career.career, seasons: career.seasons.length, source: career.url } : null,
        highs: highs[0] ? { games: highs[0].n, pts: highs[0].pts, reb: highs[0].reb, ast: highs[0].ast, stl: highs[0].stl, blk: highs[0].blk, tpm: highs[0].tpm } : null,
        feed, performances: perfs.map(x => ({ id: x._id, date: x.date, line: x.statLine, opp: x.opp?.abbr, tags: x.tags.slice(0, 3).map(t => t.label) })),
      };
    },
    async team({ query }) {
      const d = await db();
      const id = idParam(query.id);
      const season = seasonOf(etDate());
      const [info, feed, games, perfs] = await Promise.all([
        data.teamInfo(id).catch(() => null),
        d.collection('feed').find({ teams: id, published: true }).sort({ sortAt: -1 }).limit(60).toArray(),
        d.collection('games').find({ 'teams.id': id, season, status: 'final', 'verify.status': { $in: ['verified', 'consistent'] } }, { projection: { date: 1, teams: 1, stype: 1, ot: 1 } }).sort({ date: -1 }).limit(15).toArray(),
        d.collection('performances').find({ 'team.id': id, disappointment: 0 }).sort({ date: -1, score: -1 }).limit(8).toArray(),
      ]);
      if (!info) fail(404, 'No such team');
      const results = games.map(g => ({ id: g._id, date: g.date, ot: g.ot, won: g.teams.find(t => t.id === id)?.winner, opp: g.teams.find(t => t.id !== id), us: g.teams.find(t => t.id === id) }));
      let n = 0; while (n < results.length && results[n].won === results[0]?.won) n++;
      return { team: info, streak: results.length ? { type: results[0].won ? 'W' : 'L', n } : null, results, performances: perfs.map(p => ({ id: p._id, pid: p.pid, name: p.name, headshot: p.headshot, date: p.date, line: p.statLine, opp: p.opp?.abbr, tags: p.tags.slice(0, 2).map(t => t.label) })),
        feed: feed.filter(e => e.team?.id === id || e.players?.some(pl => pl.team === info.abbr)).slice(0, 30) };
    },
    // The context behind a feed entry: score, quarters, the game's situation, its stories in order, the key players.
    async game({ res, query }) {
      const d = await db();
      const id = idParam(query.id);
      const c = await data.game(id);
      if (!c) fail(404, 'No such game');
      const [stored, feed] = await Promise.all([
        d.collection('games').findOne({ _id: id }, { projection: { verify: 1, situation: 1 } }),
        d.collection('feed').find({ 'game.id': id }).sort({ occurredAt: 1, seq: 1 }).toArray(),
      ]);
      const key = c.players.filter(p => p.line).sort((a, b) => (b.line.pts + b.line.reb + b.line.ast) - (a.line.pts + a.line.reb + a.line.ast));
      privateCache(res, isLive(c.game.status) ? 8 : 60);
      return { game: c.game, verify: stored?.verify || null, situation: stored?.situation || null, feed, fetchedAt: c.fetchedAt, url: c.url,
        players: c.game.teams.map(t => ({ team: t.abbr, list: key.filter(p => p.team === t.id).slice(0, 8).map(p => ({ id: p.id, name: p.name, headshot: p.headshot, starter: p.starter, line: p.line })) })),
        lastPlays: c.plays.slice(-8).reverse().map(p => ({ clock: p.clock, period: p.period, text: p.text, score: `${p.away}-${p.home}` })) };
    },
  }),
});
