// Scheduled job (GitHub Actions): keeps MongoDB filled from the Big Balls Data API within the daily quota.
//   1. one-time import of games already pulled into data/ (so they're never requested again)
//   2. recent days, so new games are stored without anyone opening them
//   3. historic backfill, newest first, leaving LIVE_RESERVE requests a day for live date pulls
import fs from 'node:fs';
import path from 'node:path';
import { db, close } from '../lib/db.js';
import { OutOfQuota, usedToday, DAILY_CAP } from '../lib/bbs.js';
import { ensureDay, backfill, saveGame, seasonOf } from '../lib/store.js';

const SEASONS = [2025, 2024, 2023];
const DATA = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const iso = d => d.toISOString().slice(0, 10);

async function importRepoData() {
  const d = await db();
  if (await d.collection('imports').findOne({ _id: 'repo-data' }) || !fs.existsSync(path.join(DATA, 'days'))) return;
  let games = 0;
  for (const f of fs.readdirSync(path.join(DATA, 'schedule')).filter(f => f.endsWith('.json'))) {
    const y = +f.slice(0, 4);
    const sched = JSON.parse(fs.readFileSync(path.join(DATA, 'schedule', f)));
    await d.collection('games').bulkWrite(sched.map(g => ({ updateOne: { filter: { _id: g.id },
      update: { $setOnInsert: { date: g.date, season: y, type: g.type, home: g.home, away: g.away, hs: g.hs, as: g.as, boxed: false } }, upsert: true } })), { ordered: false });
    await d.collection('schedules').updateOne({ _id: y }, { $set: { games: sched.length, regular: sched.filter(g => g.type === 'Regular Season').length, at: new Date() } }, { upsert: true });
  }
  for (const f of fs.readdirSync(path.join(DATA, 'days')).filter(f => f.endsWith('.json'))) {
    const day = JSON.parse(fs.readFileSync(path.join(DATA, 'days', f)));
    for (const g of day.games.filter(g => g.boxed)) {
      const rows = day.p.filter(r => r[11] === g.id).map(r => ({ playerId: r[0], name: r[1], team: r[2], opp: r[3],
        pts: r[4], reb: r[5], ast: r[6], stl: r[7], blk: r[8], tpm: r[9], min: r[10] }));
      const { boxed, ...game } = g;
      await saveGame(day.date, game, rows);
      games++;
    }
  }
  await d.collection('imports').insertOne({ _id: 'repo-data', games, at: new Date() });
  console.log(`imported ${games} games from data/`);
}

try {
  await importRepoData();
  const today = new Date(Date.now() - 5 * 3600e3);
  for (let i = 2; i >= 0; i--) {
    const date = iso(new Date(today - i * 864e5)), m = +date.slice(5, 7);
    if (m >= 7 && m <= 9) continue; // off-season
    const r = await ensureDay(date);
    if (r.pulled) console.log(`recent ${date}: ${r.pulled} requests`);
  }
  await backfill(SEASONS);
} catch (e) {
  if (e instanceof OutOfQuota) console.log(`stopping: ${e.message}`); else { console.error(e); process.exitCode = 1; }
} finally {
  console.log(`requests used today (UTC): ${await usedToday()}/${DAILY_CAP}`);
  await close();
}
