import { handler, bad } from '../lib/http.js';
import { analyzeGame } from '../lib/analyze.js';
import { LEAGUES } from '../lib/espn.js';
import { logSnapshot } from '../lib/record.js';

// GET /api/game?sport=nfl&id=EVENT_ID — the full analysis; every view is logged (at most every 20 minutes per game)
export default handler(async ({ sport = 'nfl', id }) => {
  if (!LEAGUES[sport]) throw bad('sport must be nba or nfl');
  if (!/^\d+$/.test(id || '')) throw bad('id required');
  const a = await analyzeGame(sport, id);
  await logSnapshot(a).catch(() => {});
  return { ...a, cache: 300 };
});
