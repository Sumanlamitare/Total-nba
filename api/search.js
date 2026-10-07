import { handler } from '../lib/http.js';
import { searchPlayers } from '../lib/store.js';

// GET /api/search?q=lebron — players whose name matches every word typed
export default handler(async ({ q }) => ({ results: await searchPlayers(String(q || '').slice(0, 60)), cache: 3600 }));
