import { handler, bad, isDate } from '../lib/http.js';
import { ensureDay, weekAll } from '../lib/store.js';
import { pool } from '../lib/espn.js';
import { weekDates } from '../lib/dates.js';

// GET /api/week?date=YYYY-MM-DD&stat=pts — every player's totals for that Monday–Sunday week, highest to lowest
export default handler(async ({ date, stat }) => {
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  const dates = weekDates(date);
  let pulled = false;
  await pool(dates, 3, async d => { if ((await ensureDay(d)).pulled) pulled = true; });
  return { start: dates[0], end: dates[6], pulled, rows: await weekAll(dates, stat) };
});
