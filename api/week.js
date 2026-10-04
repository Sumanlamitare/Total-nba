import { handler, bad, isDate } from '../lib/http.js';
import { ensureDay, dayTop, STATS } from '../lib/store.js';
import { pool } from '../lib/espn.js';

const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// GET /api/week?date=YYYY-MM-DD — every daily top-5 line in that Monday–Sunday week, pulling missing days
export default handler(async ({ date }) => {
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  const dow = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(date, i - dow));
  let pulled = false;
  await pool(dates, 3, async d => { if ((await ensureDay(d)).pulled) pulled = true; });
  const lines = [];
  for (const d of dates) for (const s of STATS) (await dayTop(d, s)).forEach((l, rank) => lines.push({ ...l, stat: s, rank }));
  return { start: dates[0], end: dates[6], pulled, lines };
});
