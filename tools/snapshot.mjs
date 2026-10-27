// Save real API responses from the database for tests and local development (MOCK_API=probe/api): the seasons, a
// season's leaderboard, and a few nights.  MONGODB_URI=... node tools/snapshot.mjs 2025 20250115,20250616
import fs from 'node:fs';
import { db, close } from '../lib/db.js';
import { seasons, leaderboard, loadNight, ensureSeason } from '../lib/nights.js';

const [season = '2025', dates = ''] = process.argv.slice(2);
fs.mkdirSync('probe/api', { recursive: true });
const out = (f, v) => fs.writeFileSync(`probe/api/${f}`, JSON.stringify(v));
try {
  const d = await db();
  const list = await seasons(d);
  out('seasons.json', { current: list[0]?.year || null, seasons: list });
  for (const stage of ['all', 'regular', 'playoffs']) out(`leaderboard_${season}_${stage}.json`, { stage, ...(await leaderboard(d, +season, { stage })) });
  const info = await ensureSeason(d, +season);
  for (const date of dates.split(',').filter(Boolean)) {
    const n = await loadNight(d, date, { write: false });
    out(`night_${date}.json`, { date, season: n.season, final: n.final, live: n.live, games: n.games, top: n.top, players: n.players, potn: n.potn, model: n.model, unavailable: n.unavailable, scoredAt: n.at, dates: info.dates });
  }
  console.log('seasons', list.map(s => `${s.label}: ${s.nights} nights`).join(', '));
  // Examples of deductions: the biggest stat-padding and foul deductions among the season's top tens.
  for (const kind of ['padding', 'fouls']) {
    const rows = await d.collection('nights').aggregate([
      { $match: { season: +season } }, { $unwind: { path: '$top', includeArrayIndex: 'rank' } }, { $unwind: `$top.${kind}.items` },
      { $sort: { [`top.${kind}.items.value`]: 1 } }, { $limit: 8 },
      { $project: { _id: 1, rank: 1, name: '$top.name', result: '$top.result', score: '$top.score', item: `$top.${kind}.items` } },
    ]).toArray();
    for (const x of rows) console.log(kind, x._id, `#${x.rank + 1}`, x.name, x.result, x.score, x.item.value, x.item.label);
  }
} finally { await close(); }
