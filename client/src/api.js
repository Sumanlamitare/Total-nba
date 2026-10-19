// The game data (one request, cached in localStorage until the next ingest) and small local storage helpers.
const GAME_KEY = 'btd.game.v2'; // v2: ratings with playoffs and reputation

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked: fine */ } },
};

async function json(url) {
  let r;
  try { r = await fetch(url, { headers: { accept: 'application/json' } }); }
  catch { throw new Error('The arena is offline — check your connection and try again.'); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || `Request failed (${r.status})`), { status: r.status });
  return body;
}

// Returns cached data at once when there is some (refreshing it quietly), else waits for the network.
export async function loadGame() {
  const cached = store.get(GAME_KEY);
  const fresh = json('/api/game').then(d => { store.set(GAME_KEY, d); return d; });
  if (cached?.eras?.length) { fresh.catch(() => {}); return cached; }
  return fresh;
}

export const headshot = id => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
