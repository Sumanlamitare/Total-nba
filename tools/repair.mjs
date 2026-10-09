// One-off data repair (GitHub Actions, real database). Safe to re-run.
import { db, close } from '../lib/db.js';
import { isExhibition, pool } from '../lib/espn.js';
import { ensureDay, rebuildPlayers, rebuildRecords } from '../lib/store.js';
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const d = await db(), G = d.collection('games'), L = d.collection('lines'), D = d.collection('days');
const iso = t => new Date(t).toISOString().slice(0, 10);
const range = (a, b) => { const o = []; for (let t = Date.parse(a); t <= Date.parse(b); t += 864e5) o.push(iso(t)); return o; };
try {
  // 1. exhibitions (All-Star, Rising Stars, celebrity) and 0-0 placeholders
  const games = await G.find({}, { projection: { home: 1, away: 1, hs: 1, as: 1, boxed: 1 } }).toArray();
  const drop = games.filter(g => isExhibition(g.home, g.away) || (!g.hs && !g.as)).map(g => g._id);
  const dl = await L.deleteMany({ gameId: { $in: drop } }); await G.deleteMany({ _id: { $in: drop } });
  console.log(`removed ${drop.length} exhibition/placeholder games and ${dl.deletedCount} player lines`);

  // 2. the bubble: Aug–Nov 2020 belongs to 2019-20
  const bub = { date: { $gte: '2020-08-01', $lte: '2020-11-30' } };
  console.log('bubble re-seasoned:', (await G.updateMany(bub, { $set: { season: 2019 } })).modifiedCount, 'games',
    (await L.updateMany(bub, { $set: { season: 2019 } })).modifiedCount, 'lines');

  // 3. days the old Oct–Jun window never pulled: bubble restart + playoffs, July 2021 Finals
  const missing = [...range('2020-07-01', '2020-10-15'), ...range('2021-07-01', '2021-07-25')];
  await D.deleteMany({ _id: { $in: missing } });
  let n = 0;
  await pool(missing, 3, async x => { try { await ensureDay(x); n++; } catch (e) { console.log('  ', x, e.message); } });
  console.log(`pulled ${n} missing days;`, await G.countDocuments({ date: { $in: missing }, boxed: true }), 'games with box scores');

  // 4. NBA Cup championship games don't count in regular-season stats
  for (const y of [2023, 2024, 2025]) for (const x of range(`${y}-12-01`, `${y}-12-22`)) {
    const sb = await fetch(`${BASE}/scoreboard?dates=${x.replace(/-/g, '')}`).then(r => r.json()).catch(() => ({}));
    for (const e of sb.events || []) {
      const notes = (e.competitions?.[0]?.notes || []).map(n => n.headline || '').join(' ');
      if (/cup/i.test(notes) && /(final|championship)/i.test(notes)) {
        await G.updateOne({ _id: String(e.id) }, { $set: { type: 'Cup Final' } });
        const r = await L.updateMany({ gameId: String(e.id) }, { $set: { type: 'Cup Final' } });
        console.log(`Cup final ${x} ${e.shortName}: ${r.modifiedCount} lines moved out of the regular season`);
      }
    }
  }

  // 5. search index + records from the cleaned data
  console.log('players', await rebuildPlayers(), '| notable', await rebuildRecords(true));
} finally { await close(); }
