// History and setup: teams, box scores by season (newest first, stopping before the database gets too big), player
// bios, the record lists, career totals, and a replay of recent nights into the feed (real stories from their final
// play-by-play, marked as recaps).
//   MONGODB_URI=... node scripts/backfill.mjs --seasons 2027,2026,...  [--records] [--bios] [--careers] [--replay 20261101-20261105] [--max-mb 380]
import { db, close } from '../lib/db.js';
import { syncTeams, backfillSeason, backfillBios } from '../lib/history.js';
import { rebuild } from '../lib/records.js';
import { refreshCareers, tick } from '../lib/automation.js';
import { addDays } from '../lib/util.js';

const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const flag = k => process.argv.includes(`--${k}`);
const maxMb = +(arg('max-mb') || 380);
const d = await db();
const size = async () => { const s = await d.stats(); return (s.dataSize + (s.indexSize || 0)) / 1e6; };
try {
  console.log(`teams: ${await syncTeams(d)}`);
  for (const y of (arg('seasons') || '').split(',').filter(Boolean).map(Number)) {
    const mb = await size();
    if (mb > maxMb) { console.log(`stopping before ${y}: database at ${mb.toFixed(0)} MB (limit ${maxMb})`); break; }
    await backfillSeason(d, y);
    console.log(`  database: ${(await size()).toFixed(0)} MB`);
  }
  if (flag('bios')) await backfillBios(d);
  if (flag('records')) await rebuild(d);
  if (flag('careers')) await refreshCareers(d, { L: async (l, m) => console.log(m) });
  const r = arg('replay');
  if (r) {
    const [from, to] = r.split('-');
    for (let date = from; date <= (to || from); date = addDays(date, 1)) console.log(date, await tick(d, { dates: [date], force: true, log: () => {} }));
  }
  console.log(`database: ${(await size()).toFixed(0)} MB`);
} finally { await close(); }
