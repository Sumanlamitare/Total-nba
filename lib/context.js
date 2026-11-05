// Context for detection, fetched live instead of kept as history:
//   season so far — the player's ESPN game log for this season (averages, spread, season highs), cached for the day;
//   career highs  — a small persistent table (one row per player), seeded once from the box-score history and from
//                   ESPN game logs for anyone missing, and raised after every verified final;
//   team streaks  — the team's ESPN schedule (results this season), cached for the day.
// The daily cache (ctx) is wiped with the rest of the day's data.
import { data } from './providers/index.js';
import { getJson } from './fetcher.js';
import { pool } from './util.js';

const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'fgm', 'ftm', 'tov', 'min'];
const SITE = () => process.env.ESPN_SITE || 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// Season so far (regular season, before this game).
export async function seasonContext(d, pid, { season, gid }) {
  const key = `p:${pid}:${season}`;
  let c = await d.collection('ctx').findOne({ _id: key });
  if (!c || Date.now() - new Date(c.at) > 6 * 3600e3) {
    const log = await data.gamelog(pid, season).catch(() => null);
    c = { _id: key, at: new Date(), games: (log || []).filter(r => r.stype === 2).map(r => ({ gid: r.gid, date: r.date, ...r.line, tpm: r.line.tpm })) };
    await d.collection('ctx').updateOne({ _id: key }, { $set: c }, { upsert: true }).catch(() => {});
  }
  const games = c.games.filter(g => g.gid !== String(gid));
  const out = { gp: games.length, avg: {}, sd: {}, seasonHighs: {} };
  for (const k of STATS) {
    const vals = games.map(g => g[k]).filter(v => v != null);
    if (!vals.length) continue;
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    out.avg[k] = m; out.sd[k] = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length); out.seasonHighs[k] = Math.max(...vals);
  }
  return out;
}

// Career highs (all games, regular season and playoffs): { highs: { pts: { v, date, gid } ... }, games }.
export async function careerHighs(d, pid) {
  const h = await d.collection('highs').findOne({ _id: pid });
  if (h) return h;
  // Not seen before: from the player's ESPN game logs, every season.
  const car = await data.career(pid, 2).catch(() => null);
  const years = [...new Set((car?.seasons || []).map(s => s.season))];
  const highs = {}; let games = 0;
  for (const y of years) {
    const log = await data.gamelog(pid, y).catch(() => null);
    for (const r of log || []) {
      games++;
      for (const k of STATS.slice(0, 6)) { const v = r.line[k]; if (v != null && (!highs[k] || v > highs[k].v)) highs[k] = { v, date: r.date, gid: r.gid }; }
    }
  }
  const doc = { _id: pid, highs, games, source: 'ESPN game logs', at: new Date() };
  if (games) await d.collection('highs').updateOne({ _id: pid }, { $set: doc }, { upsert: true });
  return doc;
}

// After a verified final: raise any career high the game beat (ties keep the earlier game). The previous high is kept
// with the new one, so the same game processed again is still compared with what stood before it.
export async function raiseHighs(d, rows, gid, date) {
  for (const r of rows) {
    const h = await d.collection('highs').findOne({ _id: r.p }, { projection: { highs: 1, lastGid: 1 } });
    if (!h) continue;
    const set = {};
    for (const k of STATS.slice(0, 6)) {
      const cur = h.highs?.[k];
      if (cur?.gid === String(gid)) continue; // already raised by this game
      if (r[k] > (cur?.v ?? -1)) set[`highs.${k}`] = { v: r[k], date: String(date), gid: String(gid), prev: cur ? { v: cur.v, date: cur.date, gid: cur.gid } : null };
    }
    const first = h.lastGid !== String(gid);
    if (Object.keys(set).length || first) await d.collection('highs').updateOne({ _id: r.p }, { $set: { ...set, lastGid: String(gid) }, ...(first ? { $inc: { games: 1 } } : {}) });
  }
}

// A high as it stood before a given game.
const before = (v, gid) => (v?.gid === String(gid) ? v.prev || null : v);

// The detection context for every player in a game (same shape detect.js expects).
export async function contexts(d, pids, { gid, season }) {
  const out = new Map();
  await pool(pids, 6, async pid => {
    const [s, h] = await Promise.all([seasonContext(d, pid, { season, gid }).catch(() => null), careerHighs(d, pid).catch(() => null)]);
    const prior = Object.fromEntries(Object.entries(h?.highs || {}).map(([k, v]) => [k, before(v, gid)]));
    const highs = Object.fromEntries(Object.entries(prior).map(([k, v]) => [k, v?.v ?? null]));
    const games = (h?.games || 0) - (h?.lastGid === String(gid) ? 1 : 0);
    out.set(pid, { games, gp: s?.gp || 0, avg: s?.avg || {}, sd: s?.sd || {}, seasonHighs: s?.seasonHighs || {}, highs, highGames: prior });
  });
  return out;
}

// A team's results this season (regular season), newest first: [{ gid, date, won, opp, score }].
export async function teamResults(d, tid, season) {
  const key = `t:${tid}:${season}`;
  let c = await d.collection('ctx').findOne({ _id: key });
  if (!c || Date.now() - new Date(c.at) > 20 * 60e3) {
    const j = await getJson(`${SITE()}/teams/${tid}/schedule?season=${season}&seasontype=2`, { ttl: 300, source: 'ESPN' }).catch(() => null);
    const games = [];
    for (const e of j?.events || []) {
      const comp = e.competitions?.[0]; const st = comp?.status?.type || e.status?.type || {};
      if (!st.completed) continue;
      const us = comp.competitors?.find(x => String(x.team?.id || x.id) === String(tid)), them = comp.competitors?.find(x => String(x.team?.id || x.id) !== String(tid));
      if (!us || !them) continue;
      const sc = x => Number(x.score?.value ?? x.score?.displayValue ?? x.score);
      games.push({ gid: String(e.id), date: String(e.date || '').slice(0, 10).replace(/-/g, ''), won: !!us.winner, opp: them.team?.abbreviation, score: `${sc(us)}-${sc(them)}` });
    }
    games.sort((a, b) => b.date.localeCompare(a.date));
    c = { _id: key, at: new Date(), games };
    await d.collection('ctx').updateOne({ _id: key }, { $set: c }, { upsert: true }).catch(() => {});
  }
  return c.games;
}
