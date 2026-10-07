import { handler, bad } from '../lib/http.js';
import { seasonAll, seasonInfo } from '../lib/store.js';

// GET /api/season?season=2025-26&stat=pts — every player's regular-season totals, highest to lowest
export default handler(async ({ season, stat }) => {
  const y = +String(season || '').slice(0, 4);
  if (!y) throw bad('season must look like 2025-26');
  const [info, rows] = await Promise.all([seasonInfo(y), seasonAll(y, stat)]);
  return { ...info, rows, cache: 300 };
});
