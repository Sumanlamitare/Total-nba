// The live feed and everything around it: the feed itself (filters, paging), one entry with its comments, the top bar's
// live scores, the right rail (top performances, live alerts, storylines), Game Intelligence, Top Performances;
// fans' reactions and comments.
import { db } from '../lib/db.js';
import { route, actions, fail, int, str, ymdParam, privateCache, cache } from '../lib/http.js';
import { currentUser, requireUser, throttle } from '../lib/auth.js';
import { data } from '../lib/providers/index.js';
import { isLive } from '../lib/providers/espn.js';
import { CATEGORIES, levelOf } from '../lib/feed.js';
import { etDate, addDays, escapeRe } from '../lib/util.js';
import { idOf } from '../lib/content.js';
import { slate } from '../lib/reset.js';

export const REACTIONS = ['fire', 'wow', 'ice', 'clap', 'goat'];
const LEVELS = ['low', 'medium', 'high', 'critical'];

function feedQuery(query, user, slateDate) {
  const q = { published: true };
  // The feed is today's game day only (the daily reset clears earlier days; this keeps it that way in between).
  if (slateDate) q['game.date'] = { $gte: slateDate };
  if (query.all === '1') delete q.published;
  if (query.game) q['game.id'] = str(query.game, 20);
  if (query.team) q.teams = str(query.team, 4);
  if (query.player) q['players.id'] = str(query.player, 20);
  if (query.category) q.category = { $in: String(query.category).split(',').map(c => str(c, 20)).filter(c => CATEGORIES[c]) };
  if (query.level && LEVELS.includes(query.level)) q.level = { $in: LEVELS.slice(LEVELS.indexOf(query.level)) };
  if (ymdParam(query.date)) q['game.date'] = query.date;
  if (query.favorites === '1' && user?.prefs) {
    const or = [];
    if (user.prefs.teams?.length) or.push({ teams: { $in: user.prefs.teams } });
    if (user.prefs.players?.length) or.push({ 'players.id': { $in: user.prefs.players } });
    if (or.length) q.$or = or;
  }
  if (query.status === 'developing') q.status = 'developing';
  if (query.status === 'confirmed') q.status = { $in: ['final', 'confirmed'] };
  return q;
}

export default route({
  GET: actions({
    async list({ req, res, query }) {
      const d = await db();
      const user = query.favorites === '1' ? await currentUser(d, req) : null;
      const q = feedQuery(query, user, await slate(d));
      if (query.before) q.sortAt = { $lt: new Date(String(query.before)) };
      const items = await d.collection('feed').find(q).sort({ sortAt: -1 }).limit(int(query.limit, 30, 1, 100)).toArray();
      const meta = await d.collection('meta').findOne({ _id: 'feedseq' });
      privateCache(res, 3);
      return { items, seq: meta?.n || 0 };
    },
    // Entries changed since a sequence number (the stream's fallback when SSE isn't available).
    async since({ req, query }) {
      const d = await db();
      const items = await d.collection('feed').find({ seq: { $gt: int(query.seq) }, published: true }).sort({ seq: 1 }).limit(50).toArray();
      return { items, seq: items.at(-1)?.seq || int(query.seq) };
    },
    async entry({ req, query }) {
      const d = await db();
      const id = str(query.id, 160);
      const e = await d.collection('feed').findOne({ _id: id });
      if (!e) fail(404, 'No such event');
      const user = await currentUser(d, req);
      const [comments, mine, related, graphic] = await Promise.all([
        d.collection('comments').find({ feedId: id }).sort({ createdAt: 1 }).limit(200).toArray(),
        user ? d.collection('reactions').find({ feedId: id, uid: user._id }).toArray() : [],
        e.game?.id ? d.collection('feed').find({ 'game.id': e.game.id, _id: { $ne: id }, published: true }).sort({ sortAt: -1 }).limit(12).toArray() : [],
        e.graphic ? d.collection('content').findOne({ _id: e.graphic }, { projection: { title: 1, project: 1 } }) : null,
      ]);
      return { entry: e, comments: comments.map(c => ({ ...c, mine: user && c.uid === user._id })), myReactions: mine.map(r => r.emoji), related, graphic };
    },
    // The top bar: today's games, compact.
    async ticker({ res }) {
      const sb = await data.scoreboard(etDate()).catch(() => ({ games: [] }));
      let games = sb.games;
      // Late-night ET: yesterday's games may still be going.
      if (!games.some(g => isLive(g.status))) {
        const y = await data.scoreboard(addDays(etDate(), -1)).catch(() => ({ games: [] }));
        if (y.games.some(g => isLive(g.status))) games = [...y.games.filter(g => isLive(g.status)), ...games];
      }
      cache(res, 10, 30);
      return games.map(g => ({ id: g.id, status: g.status, live: isLive(g.status), detail: g.detail, period: g.period, clock: g.clock, start: g.start, possession: g.possession,
        teams: g.teams.map(t => ({ id: t.id, abbr: t.abbr, score: t.score, logo: t.logo, color: t.color, winner: t.winner })) }));
    },
    // Right rail: tonight's top performances, live alerts, storylines.
    async rail({ res }) {
      const d = await db();
      const today = etDate();
      const [perfDate] = await d.collection('performances').find({}).sort({ date: -1 }).limit(1).toArray();
      const date = perfDate?.date || today;
      const [perfs, live, alerts, recent] = await Promise.all([
        d.collection('performances').find({ date, disappointment: 0 }).sort({ score: -1 }).limit(6).toArray(),
        d.collection('games').find({ status: { $in: ['in', 'halftime', 'delayed'] }, date: { $gte: addDays(today, -1) } }, { projection: { teams: 1, situation: 1, detail: 1 } }).toArray(),
        d.collection('feed').find({ status: 'developing', category: { $in: ['close', 'comeback', 'run', 'solo-run', 'collapse', 'overtime'] }, published: true, updatedAt: { $gt: new Date(Date.now() - 3600e3) } }).sort({ sortAt: -1 }).limit(6).toArray(),
        d.collection('feed').find({ published: true, updatedAt: { $gt: new Date(Date.now() - 36 * 3600e3) } }, { projection: { players: 1, team: 1, significance: 1, headline: 1, category: 1 } }).limit(400).toArray(),
      ]);
      // Storylines: the players and teams behind the most significant entries of the last day and a half.
      const by = new Map();
      for (const e of recent) {
        const subj = e.players?.[0] ? { key: `p:${e.players[0].id}`, name: e.players[0].name, img: e.players[0].headshot, link: `/players/${e.players[0].id}` } : e.team?.id ? { key: `t:${e.team.id}`, name: e.team.name || e.team.abbr, img: e.team.logo, link: `/teams/${e.team.id}` } : null;
        if (!subj) continue;
        const s = by.get(subj.key) || { ...subj, weight: 0, count: 0, headlines: [] };
        s.weight += e.significance; s.count++; if (s.headlines.length < 3) s.headlines.push(e.headline);
        by.set(subj.key, s);
      }
      const storylines = [...by.values()].sort((a, b) => b.weight - a.weight).slice(0, 5);
      privateCache(res, 10);
      return { date, performances: perfs.map(p => ({ id: p._id, pid: p.pid, name: p.name, headshot: p.headshot, team: p.team, opp: p.opp, line: p.statLine, angle: p.angle, tags: p.tags.slice(0, 3).map(t => t.label), state: p.state, potn: p.potn })),
        live: live.filter(g => g.situation?.label).map(g => ({ id: g._id, situation: g.situation, teams: g.teams.map(t => ({ abbr: t.abbr, score: t.score })), detail: g.detail })), alerts, storylines };
    },
    // Game Intelligence: stories organized by kind, live first.
    async intel({ query }) {
      const d = await db();
      const today = etDate();
      const dates = ymdParam(query.date) ? [query.date] : [today, addDays(today, -1)];
      const items = await d.collection('feed').find({ 'game.date': { $in: dates }, origin: { $in: ['play-by-play', 'box score', 'records'] } }).sort({ sortAt: -1 }).limit(400).toArray();
      const live = await d.collection('games').find({ status: { $in: ['in', 'halftime', 'delayed'] }, date: { $in: dates } }, { projection: { teams: 1, situation: 1, detail: 1, lastPlay: 1 } }).toArray();
      const sec = (cats, f = () => true) => items.filter(e => cats.includes(e.category) && f(e));
      return {
        dates, live: live.map(g => ({ id: g._id, situation: g.situation, detail: g.detail, lastPlay: g.lastPlay, teams: g.teams.map(t => ({ id: t.id, abbr: t.abbr, score: t.score, logo: t.logo })) })),
        sections: {
          close: sec(['close', 'overtime']), comeback: sec(['comeback', 'comeback-done']), runs: sec(['run']), solo: sec(['solo-run']),
          clutch: sec(['clutch', 'game-winner', 'defensive-winner']), blowout: sec(['blowout']), collapse: sec(['collapse']),
          historic: sec(['record', 'milestone', 'breakout', 'triple-double', 'scoring', 'potn'], e => e.level === 'critical' || e.level === 'high'),
        },
      };
    },
    // Top Performances: editorial, not a points leaderboard (significance weighs efficiency, defense, clutch, role).
    async performances({ query }) {
      const d = await db();
      const date = ymdParam(query.date) || (await d.collection('performances').find({}).sort({ date: -1 }).limit(1).toArray())[0]?.date;
      const items = date ? await d.collection('performances').find({ date, disappointment: 0 }).sort({ score: -1 }).limit(int(query.limit, 20, 1, 50)).toArray() : [];
      const dates = (await d.collection('performances').distinct('date')).sort().reverse().slice(0, 30);
      const feedIds = new Map((await d.collection('feed').find({ perf: { $in: items.map(p => p._id) } }, { projection: { perf: 1 } }).toArray()).map(f => [f.perf, f._id]));
      return { date, dates, items: items.map(p => ({ ...p, feedId: feedIds.get(p._id) || null })) };
    },
    async categories() { return Object.entries(CATEGORIES).map(([id, c]) => ({ id, ...c })); },
  }),
  POST: actions({
    async react({ req, body }) {
      const d = await db(); const u = await requireUser(d, req);
      const id = str(body.id, 160), emoji = REACTIONS.includes(body.emoji) ? body.emoji : fail(400, 'Unknown reaction');
      if (!(await d.collection('feed').findOne({ _id: id }, { projection: { _id: 1 } }))) fail(404, 'No such event');
      const key = `${id}:${u._id}:${emoji}`;
      const had = await d.collection('reactions').findOne({ _id: key });
      if (had) { await d.collection('reactions').deleteOne({ _id: key }); await d.collection('feed').updateOne({ _id: id }, { $inc: { [`reactions.${emoji}`]: -1 } }); }
      else { await d.collection('reactions').insertOne({ _id: key, feedId: id, uid: u._id, emoji, at: new Date() }); await d.collection('feed').updateOne({ _id: id }, { $inc: { [`reactions.${emoji}`]: 1 } }); }
      const e = await d.collection('feed').findOne({ _id: id }, { projection: { reactions: 1 } });
      return { reactions: e.reactions, on: !had };
    },
    async comment({ req, body }) {
      const d = await db(); const u = await requireUser(d, req);
      const id = str(body.id, 160), text = str(body.text, 500);
      if (text.length < 1) fail(400, 'Write something first');
      if (!(await d.collection('feed').findOne({ _id: id }, { projection: { _id: 1 } }))) fail(404, 'No such event');
      await throttle(d, `comment:${u._id}`);
      const c = { feedId: id, uid: u._id, name: u.name, role: u.role, text, createdAt: new Date() };
      const r = await d.collection('comments').insertOne(c);
      await d.collection('feed').updateOne({ _id: id }, { $inc: { comments: 1 } });
      return { ...c, _id: r.insertedId, mine: true };
    },
    async uncomment({ req, body }) {
      const d = await db(); const u = await requireUser(d, req);
      const c = await d.collection('comments').findOne({ _id: idOf(body.id) });
      if (!c) fail(404, 'No such comment');
      if (c.uid !== u._id && u.role !== 'owner') fail(403, 'Not your comment');
      await d.collection('comments').deleteOne({ _id: c._id });
      await d.collection('feed').updateOne({ _id: c.feedId }, { $inc: { comments: -1 } });
      return { ok: true };
    },
  }),
});
export { levelOf, escapeRe };
