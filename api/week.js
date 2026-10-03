import { handler, bad, isDate, tryPull } from '../lib/http.js';
import { ensureDay, dayTop } from '../lib/store.js';

const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'];
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// GET /api/week?date=YYYY-MM-DD — every daily top-5 line in that Monday–Sunday week, pulling missing days
export default handler(async ({ date }) => {
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  const dow = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(date, i - dow));
  let pulled = 0, quotaReached = false, notInPlan;
  for (const d of dates) {
    if (quotaReached || notInPlan) break;
    const p = await tryPull(() => ensureDay(d, { paced: false }));
    pulled += p.pulled || 0; quotaReached = p.quotaReached; notInPlan = p.notInPlan;
  }
  const lines = [];
  for (const d of dates) for (const s of STATS) (await dayTop(d, s)).forEach((l, rank) => lines.push({ ...l, stat: s, rank }));
  return { start: dates[0], end: dates[6], pulled, quotaReached, notInPlan, lines };
});
