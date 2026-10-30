// Getting games into the database and statistics out of it.
//   ingestDate  — a date's games: status, and every final game's box score once it passes the provider's checks
//   dailyRows   — one date's player lines as statistic rows
//   seasonRows  — a period's sums per player (summed in the database) as statistic rows
import crypto from 'node:crypto';
import * as espn from './providers/espn.js';
import { LINE, TEAM, dailyValues, seasonValues, gameFlags } from './stats/compute.js';

export const provider = espn;
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const EXCLUDED = new Set(['postponed', 'canceled', 'suspended']);
export const etDate = (t = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t).replace(/-/g, '');
export const addDays = (date, n) => { const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8) + n)); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
const sum = (ps, keys) => Object.fromEntries(keys.map(k => [k, ps.reduce((n, p) => n + (+p.s[k] || 0), 0)]));

// A date's games and box scores. recheck: fetch final games' box scores again (stat corrections). Returns the day:
// { _id: date, games, final, excluded, pending, complete, noGames, checksum, problems }.
export async function ingestDate(d, date, { force = false, recheck = false, log = () => {} } = {}) {
  const sb = await provider.scoreboard(date);
  const known = new Map((await d.collection('games').find({ date }).toArray()).map(g => [g._id, g]));
  const problems = [];
  for (const g of sb.games) {
    const prev = known.get(g.id);
    const doc = { date, season: sb.season, stype: g.stype, status: g.status, detail: g.detail, note: g.note, start: g.start, teams: g.teams, provider: provider.name };
    let verified = prev?.verified && prev.status === 'final' && g.status === 'final';
    let checksum = prev?.checksum || null;
    if (g.status === 'final' && (!verified || force || recheck)) {
      const box = await provider.boxscore(g.id).catch(e => ({ problems: [e.message], players: [] }));
      if (box.problems.length) {
        problems.push(`${g.id}: ${box.problems.join('; ')}`);
        verified = false;
      } else {
        const sums = Object.fromEntries(box.teams.map(t => [t.id, sum(box.players.filter(p => p.team === t.id), TEAM)]));
        const rows = box.players.map(p => {
          const team = box.teams.find(t => t.id === p.team), opp = box.teams.find(t => t.id !== p.team);
          return { _id: `${g.id}:${p.id}`, gid: g.id, date, season: sb.season, stype: g.stype, pid: p.id, tid: p.team, opp: opp?.id, starter: p.starter, won: !!team?.winner,
            s: Object.fromEntries(LINE.map(k => [k, p.s[k]])), tm: sums[p.team], op: sums[opp?.id], ...gameFlags(p.s) };
        });
        const sumNow = hash(JSON.stringify(rows.map(r => [r.pid, r.s, r.starter]).sort()));
        if (sumNow !== checksum || force) {
          await d.collection('pgames').deleteMany({ gid: g.id });
          if (rows.length) await d.collection('pgames').insertMany(rows);
          if (checksum && sumNow !== checksum) log(`${date} ${g.id}: box score corrected`);
          checksum = sumNow;
        }
        const now = new Date();
        await Promise.all([
          ...box.players.map(p => d.collection('players').updateOne({ _id: p.id }, { $set: { name: p.name, short: p.short, pos: p.pos, headshot: p.headshot, team: p.team, seen: date } }, { upsert: true })),
          ...box.teams.map(t => d.collection('teams').updateOne({ _id: t.id }, { $set: { abbr: t.abbr, name: t.name, color: t.color, logo: t.logo } }, { upsert: true })),
        ]);
        verified = true;
        doc.fetchedAt = now;
      }
    }
    await d.collection('games').updateOne({ _id: g.id }, { $set: { ...doc, verified: !!verified, checksum } }, { upsert: true });
    known.set(g.id, { ...doc, _id: g.id, verified, checksum });
  }
  // Games that disappeared from the date (rescheduled) no longer count toward it.
  const ids = new Set(sb.games.map(g => g.id));
  for (const id of known.keys()) if (!ids.has(id)) { await d.collection('games').deleteOne({ _id: id }); await d.collection('pgames').deleteMany({ gid: id }); known.delete(id); }
  const games = [...known.values()];
  const final = games.filter(g => g.status === 'final' && g.verified).length;
  const excluded = games.filter(g => EXCLUDED.has(g.status)).map(g => ({ id: g._id || g.id, status: g.status }));
  const pending = games.length - final - excluded.length;
  const day = {
    _id: date, season: sb.season, games: games.length, final, excluded, pending, noGames: games.length === 0,
    complete: games.length > 0 && pending === 0 && final > 0,
    checksum: hash(games.filter(g => g.verified).map(g => g.checksum).sort().join(',')), problems, checkedAt: new Date(),
  };
  const prev = await d.collection('days').findOne({ _id: date });
  if (day.complete && !prev?.completedAt) day.completedAt = new Date();
  await d.collection('days').updateOne({ _id: date }, { $set: day }, { upsert: true });
  return { ...prev, ...day };
}

async function people(d, pids, tids) {
  const [players, teams] = await Promise.all([
    d.collection('players').find({ _id: { $in: pids } }).toArray(),
    d.collection('teams').find(tids ? { _id: { $in: tids } } : {}).toArray(),
  ]);
  return { players: new Map(players.map(p => [p._id, p])), teams: new Map(teams.map(t => [t._id, t])) };
}
const teamRef = t => (t ? { id: t._id, abbr: t.abbr, name: t.name, color: t.color, logo: t.logo } : null);
const row = (pid, tid, pl, tm) => ({ id: pid, name: pl?.name || pid, short: pl?.short, pos: pl?.pos, headshot: pl?.headshot || `https://a.espncdn.com/i/headshots/nba/players/full/${pid}.png`, team: teamRef(tm.get(tid)) || { id: tid } });

// One date's statistic rows (players who played).
export async function dailyRows(d, date) {
  const recs = await d.collection('pgames').find({ date }).toArray();
  const { players, teams } = await people(d, [...new Set(recs.map(r => r.pid))]);
  return recs.map(r => {
    const { v, n } = dailyValues(r);
    return { ...row(r.pid, r.tid, players.get(r.pid), teams), game: r.gid, opp: teamRef(teams.get(r.opp)), v, n };
  });
}

// A period's statistic rows. scope: { season, stype: 'regular' | 'playoffs' | 'all', from, to }. ESPN's own season
// figures join only when the period is the whole season to date (no from/to).
export async function seasonRows(d, { season, stype = 'regular', from = null, to = null }) {
  const match = { season: +season };
  match.stype = stype === 'playoffs' ? { $in: [3, 5] } : stype === 'all' ? { $in: [2, 3, 5] } : 2;
  if (from || to) match.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const group = { _id: '$pid', gp: { $sum: 1 }, gs: { $sum: { $cond: ['$starter', 1, 0] } }, wins: { $sum: { $cond: ['$won', 1, 0] } }, dd: { $sum: '$dd' }, td: { $sum: '$td' }, gmsc: { $sum: '$gmsc' }, tid: { $last: '$tid' }, last: { $max: '$date' } };
  for (const k of LINE) group[`s_${k}`] = { $sum: `$s.${k}` };
  for (const k of TEAM) { group[`tm_${k}`] = { $sum: `$tm.${k}` }; group[`op_${k}`] = { $sum: `$op.${k}` }; }
  const sums = await d.collection('pgames').aggregate([{ $match: match }, { $sort: { date: 1 } }, { $group: group }], { allowDiskUse: true }).toArray();
  const whole = !from && !to && stype !== 'all';
  const figs = whole ? new Map((await d.collection('seasonfigs').find({ season: +season, stype: stype === 'playoffs' ? 3 : 2 }).toArray()).map(f => [f.pid, f.v])) : new Map();
  const { players, teams } = await people(d, sums.map(s => s._id));
  return sums.map(g => {
    const pick = (p, keys) => Object.fromEntries(keys.map(k => [k, g[`${p}_${k}`]]));
    const { v, n } = seasonValues({ s: pick('s', LINE), tm: pick('tm', TEAM), op: pick('op', TEAM), gp: g.gp, gs: g.gs, wins: g.wins, dd: g.dd, td: g.td, gmsc: g.gmsc }, figs.get(g._id) || null);
    return { ...row(g._id, g.tid, players.get(g._id), teams), last: g.last, v, n };
  });
}

// ESPN's season figures for everyone who has played this season (once a day for the current season).
export async function refreshSeasonFigures(d, season, stype = 2, { log = () => {} } = {}) {
  const pids = await d.collection('pgames').distinct('pid', { season: +season, stype });
  const got = await provider.seasonFiguresMany(season, stype, pids);
  const ops = got.filter(([, v]) => v).map(([pid, v]) => ({ replaceOne: { filter: { _id: `${season}:${stype}:${pid}` }, replacement: { _id: `${season}:${stype}:${pid}`, season: +season, stype, pid, v, at: new Date() }, upsert: true } }));
  if (ops.length) await d.collection('seasonfigs').bulkWrite(ops, { ordered: false });
  await d.collection('meta').updateOne({ _id: `figs:${season}:${stype}` }, { $set: { at: new Date(), players: ops.length } }, { upsert: true });
  log(`season figures ${season}/${stype}: ${ops.length} of ${pids.length} players`);
  return ops.length;
}

// Seasons offered, with their dates (cached in the database for a day).
export async function seasonInfo(d, year) {
  const have = await d.collection('seasons').findOne({ _id: year });
  if (have?.dates?.length && have.at > Date.now() - 86400000) return have;
  const info = { ...(await provider.seasonInfo(year)), at: Date.now() };
  if (info.dates.length) await d.collection('seasons').replaceOne({ _id: year }, { _id: year, ...info }, { upsert: true });
  return info;
}
