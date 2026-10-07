import { handler, bad } from '../lib/http.js';
import { playerCard } from '../lib/store.js';

// GET /api/player?key=PLAYER_KEY — career page: seasons, career highs, last 10 games, best games
export default handler(async ({ key }) => {
  if (!key || key.length > 80) throw bad('key required');
  const p = await playerCard(String(key));
  if (!p) throw Object.assign(new Error('player not found'), { status: 404 });
  return { ...p, cache: 600 };
});
