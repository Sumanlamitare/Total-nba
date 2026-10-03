import { handler, bad, isDate } from '../lib/http.js';
import { ensureDay, dayTop } from '../lib/store.js';

// GET /api/day?date=YYYY-MM-DD&stat=pts — pulls the date from ESPN first if it isn't stored yet
export default handler(async ({ date, stat }) => {
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  const pull = await ensureDay(date);
  return { date, pulled: pull.pulled, lines: await dayTop(date, stat) };
});
