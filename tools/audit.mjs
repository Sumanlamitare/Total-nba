// Data audit (run in GitHub Actions against the real database): internal consistency checks that must hold
// for correct box scores, season coverage, and a few well-known totals. Writes audit/report.txt.
import fs from 'node:fs';
import { db, close } from '../lib/db.js';
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const out = []; const say = (...a) => { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); out.push(s); };
const d = await db(), L = d.collection('lines'), G = d.collection('games');
try {
  say('lines', await L.estimatedDocumentCount(), 'games', await G.estimatedDocumentCount());

  // 1. points = 2*2PM + 3*3PM + FTM
  const bad = await L.aggregate([{ $match: { $expr: { $ne: ['$pts', { $add: [{ $multiply: [2, '$fg2m'] }, { $multiply: [3, '$tpm'] }, '$ftm'] }] } } },
    { $facet: { n: [{ $count: 'n' }], ex: [{ $limit: 8 }, { $project: { _id: 0, name: 1, date: 1, pts: 1, fg2m: 1, tpm: 1, ftm: 1 } }],
      byYear: [{ $group: { _id: '$season', n: { $sum: 1 } } }, { $sort: { _id: 1 } }] } }]).toArray();
  say('\n[1] lines where PTS != 2*2PM + 3*3PM + FTM:', bad[0].n[0]?.n || 0); say('  by season', bad[0].byYear); for (const e of bad[0].ex) say('  ', e);

  // 2. team points from player lines vs final score
  const mism = await L.aggregate([
    { $group: { _id: { g: '$gameId', t: '$team' }, pts: { $sum: '$pts' }, n: { $sum: 1 } } },
    { $lookup: { from: 'games', localField: '_id.g', foreignField: '_id', as: 'g' } }, { $unwind: '$g' },
    { $project: { pts: 1, n: 1, date: '$g.date', season: '$g.season', team: '$_id.t', score: { $cond: [{ $eq: ['$_id.t', '$g.home'] }, '$g.hs', { $cond: [{ $eq: ['$_id.t', '$g.away'] }, '$g.as', null] }] } } },
    { $match: { $expr: { $ne: ['$pts', '$score'] } } },
    { $facet: { n: [{ $count: 'n' }], ex: [{ $limit: 10 }], byYear: [{ $group: { _id: '$season', n: { $sum: 1 } } }, { $sort: { _id: 1 } }] } },
  ], { allowDiskUse: true }).toArray().catch(e => [{ err: e.message }]);
  say('\n[2] team-games where player points != final score:', mism[0].err || mism[0].n[0]?.n || 0); say('  by season', mism[0].byYear || []); for (const e of mism[0].ex || []) say('  ', e);

  // 3. same player twice on one date (season by season: the free tier can't spill a big $group to disk)
  let dups = 0; const dex = [];
  for (const y of await L.distinct('season')) {
    const r = await L.aggregate([{ $match: { season: y } }, { $group: { _id: { k: '$key', d: '$date' }, n: { $sum: 1 }, name: { $first: '$name' } } }, { $match: { n: { $gt: 1 } } }]).toArray();
    dups += r.length; dex.push(...r.slice(0, 2));
  }
  say('\n[3] player twice on one date:', dups); for (const e of dex.slice(0, 8)) say('  ', e);

  // 4. season coverage
  const cov = await G.aggregate([{ $group: { _id: { s: '$season', t: '$type' }, games: { $sum: 1 }, boxed: { $sum: { $cond: ['$boxed', 1, 0] } } } }, { $sort: { '_id.s': 1, '_id.t': 1 } }]).toArray();
  say('\n[4] games per season/type (games, boxed):'); for (const c of cov) say('  ', c._id.s, c._id.t, c.games, c.boxed);
  const seasons = await d.collection('seasons').find().sort({ _id: 1 }).toArray(); say('  seasons docs', seasons.map(s => `${s._id}:${s.complete ? 'complete' : 'partial'}`).join(' '));

  // 5. known totals (regular season)
  const tot = async (name, season, f) => (await L.aggregate([{ $match: { name, season, type: 'Regular Season' } }, { $group: { _id: null, v: { $sum: `$${f}` }, gp: { $sum: 1 } } }]).toArray())[0];
  for (const [name, s, f, want] of [['Stephen Curry', 2015, 'pts', '2375 in 79'], ['Kobe Bryant', 2005, 'pts', '2832 in 80'], ['Luka Doncic', 2023, 'pts', '2370 in 70'],
    ['Jayson Tatum', 2022, 'pts', '2225 in 74'], ['Domantas Sabonis', 2023, 'reb', '1120 in 82'], ['James Harden', 2018, 'pts', '2818 in 78'], ['Michael Jordan', 1995, 'pts', '2491 in 82']]) {
    say(`\n[5] ${name} ${s}-${String(s + 1).slice(2)} ${f}: ours`, await tot(name, s, f), 'real', want);
  }
  const lb = await L.aggregate([{ $match: { key: '1966' } }, { $group: { _id: '$type', pts: { $sum: '$pts' }, gp: { $sum: 1 } } }]).toArray();
  say('\n[5] LeBron by game type', lb);

  // 6. suspicious single games, compared with a fresh ESPN box score
  const top = await L.find({}, { projection: { _id: 0, name: 1, date: 1, pts: 1, gameId: 1, team: 1, opp: 1, min: 1 } }).sort({ pts: -1 }).limit(6).toArray();
  say('\n[6] highest point games in DB'); for (const t of top) say('  ', t);
  for (const t of top.slice(0, 2)) {
    const r = await fetch(`${BASE}/summary?event=${t.gameId}`).then(x => x.json()).catch(e => ({ err: e.message }));
    const ps = r.boxscore?.players || [];
    for (const team of ps) { const s = team.statistics?.[0]; const i = (s?.labels || []).indexOf('PTS');
      const a = s?.athletes?.find(x => x.athlete?.displayName === t.name); if (a) say('  ESPN now:', t.name, 'labels', s.labels.join(','), 'stats', a.stats.join(','), 'PTS idx', i); }
    say('  ESPN header', r.header?.competitions?.[0]?.competitors?.map(c => `${c.team?.displayName} ${c.score}`).join(' / ') || r.err);
  }
} finally { await close(); fs.mkdirSync('audit', { recursive: true }); fs.writeFileSync('audit/report.txt', out.join('\n') + '\n'); }
