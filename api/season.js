import { handler, bad } from '../lib/http.js';
import { seasonTotals } from '../lib/store.js';

// GET /api/season?season=2025-26&stat=pts — regular-season totals from stored box scores
export default handler(async ({ season, stat }) => {
  const y = +String(season || '').slice(0, 4);
  if (!y) throw bad('season must look like 2025-26');
  return { ...(await seasonTotals(y, stat)), cache: 300 };
});
