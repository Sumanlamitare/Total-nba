// Scheduled job (GitHub Actions): keeps MongoDB filled from ESPN's free NBA API.
// First run loads every season from HISTORY_FROM (default 2015-16) to now, newest first;
// after that each run only touches days that aren't complete yet (today and recent days).
import { db, close } from '../lib/db.js';
import { backfill, ensureDay, etToday, seasonOf } from '../lib/store.js';

const from = +(process.env.HISTORY_FROM || '2015').slice(0, 4);
const iso = t => new Date(t).toISOString().slice(0, 10);

// One-time cleanup: earlier versions stored Big Balls data with different game ids
async function dropOldSources() {
  const d = await db();
  if (await d.collection('imports').findOne({ _id: 'espn-v1' })) return;
  for (const c of ['games', 'lines']) await d.collection(c).deleteMany({ source: { $ne: 'espn' } });
  for (const c of ['days', 'schedules', 'seasons', 'quota']) await d.collection(c).deleteMany({});
  await d.collection('imports').insertOne({ _id: 'espn-v1', at: new Date() });
  console.log('cleared data from earlier sources');
}

// One-time: v2 adds 2PM, FTM, turnovers and fouls. Forgetting which days/seasons are complete makes the
// backfill pull them again; games stored before v2 are re-boxed and their lines rewritten with the new fields.
async function upgradeSchema() {
  const d = await db();
  if (await d.collection('imports').findOne({ _id: 'schema-v2' })) return;
  await d.collection('days').deleteMany({});
  await d.collection('seasons').deleteMany({});
  await d.collection('imports').insertOne({ _id: 'schema-v2', at: new Date() });
  console.log('schema v2: re-pulling stored seasons for the new stats');
}

try {
  await dropOldSources();
  await upgradeSchema();
  const today = etToday();
  for (let i = 3; i >= 0; i--) { const date = iso(Date.parse(today) - i * 864e5); await ensureDay(date); } // recent days first
  const now = seasonOf(today);
  await backfill(Array.from({ length: now - from + 1 }, (_, i) => now - i));
  console.log('done');
} catch (e) {
  console.error(e); process.exitCode = 1;
} finally {
  await close();
}
