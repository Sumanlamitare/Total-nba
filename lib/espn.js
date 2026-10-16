// ESPN's free public API (no key) — the project's only NBA data source. Raw responses are cached briefly in
// memory; composed results (a whole book, a player's career highs) go in MongoDB's `cache` collection with an
// expiry, so books open quickly and ESPN isn't asked for the same thing twice.
import { db } from './db.js';

export const WEB = process.env.ESPN_WEB || 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
export const CORE = process.env.ESPN_CORE || 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
export const CORE3 = process.env.ESPN_CORE3 || 'https://sports.core.api.espn.com/v3/sports/basketball/nba';
export const SEARCH = process.env.ESPN_SEARCH || 'https://site.web.api.espn.com/apis/search/v2';
export const SITE = process.env.ESPN_SITE || 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

const mem = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Raw GET with retries. 404 resolves to null (ESPN uses it for "no such player / no stats").
export async function fetchJson(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url.replace(/^http:\/\/([a-z.]*espn\.com)/, 'https://$1'), { headers: { 'user-agent': 'Mozilla/5.0 (NBA Player Library)', accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
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

// Cached GET (memory only — raw ESPN payloads are large; composed results are stored with `remember`). ttl in seconds.
export async function get(url, ttl = 3600) {
  const hit = mem.get(url);
  if (hit && hit.exp > Date.now()) return hit.data;
  const data = await fetchJson(url);
  if (mem.size > 300) mem.clear();
  mem.set(url, { exp: Date.now() + ttl * 1000, data });
  return data;
}

// Memoize a computed value in memory and, when MongoDB is configured, in the `cache` collection.
export async function remember(key, ttl, fn) {
  const hit = mem.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  let col = null;
  if (process.env.MONGODB_URI) {
    try {
      col = (await db()).collection('cache');
      const doc = await col.findOne({ _id: key });
      if (doc && +doc.t > Date.now()) { mem.set(key, { exp: +doc.t, data: doc.data }); return doc.data; }
    } catch { col = null; }
  }
  const data = await fn();
  if (data == null) return data;
  const exp = Date.now() + (typeof ttl === 'function' ? ttl(data) : ttl) * 1000;
  mem.set(key, { exp, data });
  if (col) await col.replaceOne({ _id: key }, { _id: key, t: new Date(exp), data }, { upsert: true }).catch(() => {});
  return data;
}

export const forget = key => { mem.delete(key); };

export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const DAY = 86400;
export const athlete = (id, ttl = DAY) => get(`${WEB}/athletes/${id}`, ttl);
export const bio = (id, ttl = DAY) => get(`${WEB}/athletes/${id}/bio`, ttl);
export const careerStats = (id, seasontype = 2, ttl = DAY) => get(`${WEB}/athletes/${id}/stats${seasontype === 3 ? '?seasontype=3' : ''}`, ttl);
export const gamelog = (id, season) => fetchJson(`${WEB}/athletes/${id}/gamelog?season=${season}`);
export const coreAthlete = (id, ttl = 30 * DAY) => get(`${CORE}/athletes/${id}`, ttl);
export const byAthlete = (season, { qualified = false, sort = 'offensive.avgPoints', limit = 1000, seasontype = 2 } = {}) =>
  fetchJson(`${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=${qualified}&page=1&limit=${limit}&sort=${sort}:desc&season=${season}&seasontype=${seasontype}`);
export const activeIndex = () => fetchJson(`${CORE3}/athletes?limit=20000&active=true`);
export const seasonAwards = season => fetchJson(`${CORE}/seasons/${season}/awards?limit=100`);
export const teamsList = () => fetchJson(`${SITE}/teams`);
export const roster = teamId => fetchJson(`${SITE}/teams/${teamId}/roster`);
export const search = q => fetchJson(`${SEARCH}?query=${encodeURIComponent(q)}&limit=10`);
export const headshotUrl = id => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
