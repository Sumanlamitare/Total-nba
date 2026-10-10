// ESPN's free public API, one client for every sport ({sport}/{league} is the only difference).
// Responses are cached in memory and, when MongoDB is configured, in a `cache` collection so a game page
// doesn't re-download every player's game log on each visit.
import { db } from './db.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const CORE = 'https://sports.core.api.espn.com/v2/sports';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports';
export const LEAGUES = { nba: ['basketball', 'nba'], nfl: ['football', 'nfl'] };
const mem = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function raw(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`ESPN ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(500 * 2 ** i);
    }
  }
}

// GET with a time-to-live in seconds
export async function get(url, ttl = 600) {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.at < ttl * 1000) return hit.data;
  let col = null;
  if (process.env.MONGODB_URI && ttl >= 1800) {
    try {
      col = (await db()).collection('cache');
      const doc = await col.findOne({ _id: url });
      if (doc && Date.now() - doc.at < ttl * 1000) { mem.set(url, { at: doc.at, data: doc.data }); return doc.data; }
    } catch { col = null; }
  }
  const data = await raw(url);
  mem.set(url, { at: Date.now(), data });
  if (col && data) col.replaceOne({ _id: url }, { _id: url, at: Date.now(), t: new Date(), data }, { upsert: true }).catch(() => {});
  return data;
}

export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k).catch(() => null); }
  }));
  return out;
}

const path = sport => LEAGUES[sport].join('/');
const corePath = sport => `${LEAGUES[sport][0]}/leagues/${LEAGUES[sport][1]}`;
export const scoreboard = (sport, ymd) => get(`${SITE}/${path(sport)}/scoreboard?dates=${ymd}&limit=100`, 300);
export const summary = (sport, id) => get(`${SITE}/${path(sport)}/summary?event=${id}`, 300);
export const injuries = sport => get(`${SITE}/${path(sport)}/injuries`, 900);
export const schedule = (sport, teamId, season, past) => get(`${SITE}/${path(sport)}/teams/${teamId}/schedule?season=${season}`, past ? 86400 * 7 : 3 * 3600);
export const gamelog = (sport, athleteId, season, past) => get(`${WEB}/${path(sport)}/athletes/${athleteId}/gamelog${season ? `?season=${season}` : ''}`, past ? 86400 * 7 : 3 * 3600);
export const athlete = (sport, id) => get(`${WEB}/${path(sport)}/athletes/${id}`, 86400 * 3);

// Every prop the sportsbook ESPN lists (provider 100) has posted for an event, all pages
export async function propBets(sport, id) {
  const base = `${CORE}/${corePath(sport)}/events/${id}/competitions/${id}/odds/100/propBets?limit=1000`;
  const first = await get(base, 600);
  const items = [...(first?.items || [])];
  for (let p = 2; p <= (first?.pageCount || 1); p++) items.push(...((await get(`${base}&page=${p}`, 600))?.items || []));
  return items;
}
