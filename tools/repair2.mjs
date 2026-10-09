// Repair step 2: fill games stored without player lines (ESPN's main API had none) from ESPN's web endpoint,
// and replace box scores whose player points don't add up to the final score when the web copy does.
import { db, close } from '../lib/db.js';
import { fetchWebBox, pool, isCupFinal } from '../lib/espn.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
import { saveGame, rebuildPlayers, rebuildRecords } from '../lib/store.js';
const d = await db(), G = d.collection('games'), L = d.collection('lines');
const asGame = g => ({ id: g._id, home: g.home, away: g.away, hs: g.hs, as: g.as, type: g.type, seasonYear: g.season + 1 });
const adds = (g, rows) => rows.filter(r => r.team === g.home).reduce((a, r) => a + r.pts, 0) === g.hs && rows.filter(r => r.team === g.away).reduce((a, r) => a + r.pts, 0) === g.as;
try {
  // 0. the same game stored twice under two ids: keep the copy with more player lines
  const twins = await G.aggregate([{ $group: { _id: { d: '$date', h: '$home', a: '$away' }, ids: { $push: '$_id' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
  let dropped = 0;
  for (const t of twins) {
    const counts = await Promise.all(t.ids.map(async id => [id, await L.countDocuments({ gameId: id })]));
    counts.sort((a, b) => b[1] - a[1]);
    for (const [id] of counts.slice(1)) { await L.deleteMany({ gameId: id }); await G.deleteOne({ _id: id }); dropped++; }
  }
  console.log(`duplicate games: ${twins.length} pairs; removed ${dropped} copies`);

  // 0b. only the Cup championship game stays out of the regular season
  const cup = await G.find({ type: 'Cup Final' }).toArray();
  for (const x of [...new Set(cup.map(g => g.date))]) {
    const sb = await fetch(`${BASE}/scoreboard?dates=${x.replace(/-/g, '')}`).then(r => r.json()).catch(() => ({}));
    for (const e of sb.events || []) {
      const notes = (e.competitions?.[0]?.notes || []).map(n => n.headline || '').join(' ');
      if (!cup.some(g => g._id === String(e.id))) continue;
      const type = isCupFinal(notes) ? 'Cup Final' : 'Regular Season';
      await G.updateOne({ _id: String(e.id) }, { $set: { type } }); await L.updateMany({ gameId: String(e.id) }, { $set: { type } });
      console.log(`  ${x} ${e.shortName} "${notes}" -> ${type}`);
    }
  }

  // 1. games with no player lines
  const empty = await G.find({ boxed: false }).toArray();
  let filled = 0, still = 0, errs = 0;
  await pool(empty, 2, async g => {
    try { const rows = await fetchWebBox(g._id); if (rows.length) { await saveGame(g.date, asGame(g), rows); filled++; } else still++; }
    catch (e) { still++; if (errs++ < 5) console.log('  ', g._id, g.date, e.message); }
    await sleep(150);
  });
  console.log(`empty box scores: ${empty.length}; filled ${filled}; still empty ${still}`);

  // 2. box scores whose player points don't match the final score
  const bad = new Set();
  for (const y of await G.distinct('season')) {
    const r = await L.aggregate([{ $match: { season: y } }, { $group: { _id: { g: '$gameId', t: '$team' }, pts: { $sum: '$pts' } } },
      { $lookup: { from: 'games', localField: '_id.g', foreignField: '_id', as: 'g' } }, { $unwind: '$g' },
      { $match: { $expr: { $ne: ['$pts', { $cond: [{ $eq: ['$_id.t', '$g.home'] }, '$g.hs', '$g.as'] }] } } }]).toArray();
    for (const x of r) bad.add(x._id.g);
  }
  let fixed = 0;
  await pool([...bad], 4, async id => {
    const g = await G.findOne({ _id: id });
    const rows = await fetchWebBox(id).catch(() => []);
    if (g && rows.length && adds(g, rows)) { await L.deleteMany({ gameId: id }); await saveGame(g.date, asGame(g), rows); fixed++; }
  });
  console.log(`box scores not matching the final score: ${bad.size}; replaced with a matching copy: ${fixed}`);
  console.log('players', await rebuildPlayers(), '| notable', await rebuildRecords(true));
} finally { await close(); }
