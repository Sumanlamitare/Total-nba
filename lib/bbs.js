// Big Balls Data API client. Free plan (https://bigballsdata.com/docs/rate-limits): 100 requests/minute,
// 500/day with GitHub, daily window resets 00:00 UTC. Every request is counted in MongoDB so the
// scheduled backfill and live date pulls share one budget.
import { db } from './db.js';

const BASE = process.env.BBS_API_BASE || 'https://api.bigballsdata.com';
export const DAILY_CAP = +(process.env.BBS_DAILY_CAP || 485);        // total across live + backfill
export const LIVE_RESERVE = +(process.env.BBS_LIVE_RESERVE || 120);   // backfill leaves this much for live pulls
const MIN_GAP_MS = +(process.env.BBS_MIN_GAP_MS ?? 650);              // stay under 100/minute

export class OutOfQuota extends Error {}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const utcDay = () => new Date().toISOString().slice(0, 10);

export async function usedToday() {
  return (await (await db()).collection('quota').findOne({ _id: utcDay() }))?.used || 0;
}

// Reserve one request in the shared daily budget; `cap` lets the backfill stop early
async function take(cap) {
  const q = (await db()).collection('quota');
  const r = await q.findOneAndUpdate({ _id: utcDay(), used: { $lt: cap } }, { $inc: { used: 1 } }, { returnDocument: 'after' })
    .catch(() => null);
  if (r) return;
  // first request of the day creates the counter
  const created = await q.updateOne({ _id: utcDay() }, { $setOnInsert: { used: 1 } }, { upsert: true });
  if (!created.upsertedCount) throw new OutOfQuota(`daily cap ${cap} reached`);
}

let last = 0;
export async function api(path, { cap = DAILY_CAP, paced = true } = {}) {
  const key = process.env.BBS_API_KEY;
  if (!key) throw new Error('BBS_API_KEY is not set');
  await take(cap);
  for (let attempt = 0; ; attempt++) {
    if (paced) { const wait = last + MIN_GAP_MS - Date.now(); if (wait > 0) await sleep(wait); last = Date.now(); }
    const r = await fetch(BASE + path, { headers: { authorization: 'Bearer ' + key, accept: 'application/json' } });
    if (r.status === 429) {
      const retry = +(r.headers.get('retry-after') || 60);
      if (r.headers.get('x-ratelimit-4xx-cooldown') || retry > 30 || attempt >= 1) throw new OutOfQuota(`429, retry after ${retry}s`);
      await sleep(retry * 1000);
      continue;
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${path}: ${body?.error?.message || ''}`);
    return body;
  }
}

export const NICK = n => (/Trail Blazers$/.test(n) ? 'Trail Blazers' : (n || '').split(' ').pop());
const toInt = x => parseInt(String(x ?? '').split('-')[0], 10) || 0;
export const TYPES = new Set(['Regular Season', 'Playoffs', 'PlayIn', 'Play-In', 'Play In']);

// /v1/live-stats box score -> player lines
export function parseBox(data) {
  const teams = data?.teams || [];
  const names = teams.map(t => NICK(t.team_name));
  const rows = [];
  teams.forEach((t, ti) => {
    for (const g of t.stat_groups || []) {
      const k = g.keys || [];
      const col = name => k.findIndex(x => x === name || x.startsWith(name + '-'));
      const c = { min: col('minutes'), pts: col('points'), reb: col('rebounds'), ast: col('assists'), stl: col('steals'), blk: col('blocks'), tpm: col('threePointFieldGoalsMade') };
      for (const pl of g.players || []) {
        if (!pl.stats?.length) continue;
        const v = f => (c[f] < 0 ? 0 : toInt(pl.stats[c[f]]));
        const row = { playerId: pl.player_id || null, name: pl.name, team: names[ti], opp: names[1 - ti] || '',
          pts: v('pts'), reb: v('reb'), ast: v('ast'), stl: v('stl'), blk: v('blk'), tpm: v('tpm'), min: v('min') };
        if (row.min || row.pts || row.reb) rows.push(row);
      }
    }
  });
  return rows;
}
