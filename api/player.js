import { handler, bad } from '../lib/http.js';
import { playerCard, playerSplits } from '../lib/store.js';

// GET /api/player?key=PLAYER_KEY — career page: seasons, career highs, last 10 games, best games
// GET /api/player?key=PLAYER_KEY&splits=1 — Pro splits for the latest season
export default handler(async ({ key, splits }) => {
  if (!key || key.length > 80) throw bad('key required');
  if (splits) return { ...(await playerSplits(String(key))), cache: 600 };
  const p = await playerCard(String(key));
  if (!p) throw Object.assign(new Error('player not found'), { status: 404 });
  return { ...p, cache: 600 };
});
