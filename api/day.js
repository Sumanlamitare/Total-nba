import { handler, bad, isDate, tryPull } from '../lib/http.js';
import { ensureDay, dayTop } from '../lib/store.js';

// GET /api/day?date=YYYY-MM-DD&stat=pts — pulls the date from Big Balls if it isn't stored yet
export default handler(async ({ date, stat }) => {
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  const pull = await tryPull(() => ensureDay(date, { paced: false }));
  return { date, ...pull, lines: await dayTop(date, stat) };
});
