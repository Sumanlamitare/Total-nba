import { handler, bad, isDate } from '../lib/http.js';
import { onThisDay } from '../lib/store.js';

// GET /api/onthisday?date=YYYY-MM-DD&stat=pts — best lines on the same calendar day in other seasons
export default handler(async ({ date, stat }) => {
  if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
  return { date, lines: await onThisDay(date, stat, 3), cache: 3600 };
});
