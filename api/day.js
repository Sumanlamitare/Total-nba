import { handler, bad, isDate } from '../lib/http.js';
import { ensureDay, dayTop, dayAll } from '../lib/store.js';

// GET /api/day?date=YYYY-MM-DD&stat=pts[&n=all] — pulls the date from ESPN first if it isn't stored yet.
// n=all returns every player who played, highest to lowest; otherwise the top n (max 10).
export default handler(async ({ date, stat, n }) => {
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  const pull = await ensureDay(date);
  return { date, pulled: pull.pulled, lines: n === 'all' ? await dayAll(date, stat) : await dayTop(date, stat, n) };
});
