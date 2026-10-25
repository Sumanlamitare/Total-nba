// ESPN's free public API (no key): scoreboards, box scores, play-by-play and win probability.

export const WEB = process.env.ESPN_WEB || 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
export const CORE = process.env.ESPN_CORE || 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
export const SITE = process.env.ESPN_SITE || 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

const mem = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Raw GET with retries. 404 resolves to null (ESPN uses it for "no such player / no stats").
export async function fetchJson(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url.replace(/^http:\/\/([a-z.]*espn\.com)/, 'https://$1'), { headers: { 'user-agent': 'Mozilla/5.0 (Performance of the Night)', accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (r.status === 404) return null;
      if (r.status >= 500 && r.status < 600 && i < tries - 1) throw new Error(`ESPN ${r.status}`);
      if (!r.ok) { if (r.status >= 500) return null; throw new Error(`ESPN ${r.status}`); }
      return await r.json();
    } catch (e) {
      if (i >= tries - 1) throw Object.assign(new Error(`ESPN unavailable (${e.message})`), { status: 502 });
      await sleep(400 * 2 ** i);
    }
  }
}

// Cached GET (memory only). ttl in seconds.
export async function get(url, ttl = 3600) {
  const hit = mem.get(url);
  if (hit && hit.exp > Date.now()) return hit.data;
  const data = await fetchJson(url);
  if (mem.size > 300) mem.clear();
  mem.set(url, { exp: Date.now() + ttl * 1000, data });
  return data;
}

export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export const headshotUrl = id => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
