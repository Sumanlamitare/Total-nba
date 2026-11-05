// HTTP for data providers: retries with backoff, a per-host concurrency cap, an in-memory cache with a TTL per call,
// and a record of each host's last success or failure (shown on the Data sources page).
import { sleep } from './util.js';

const cache = new Map();
const inflight = new Map();
const hosts = new Map(); // host -> { active, queue: [], ok, fail, lastOk, lastError }
const MAX_PER_HOST = 16;

function hostState(h) {
  if (!hosts.has(h)) hosts.set(h, { active: 0, queue: [], ok: 0, fail: 0, lastOk: null, lastError: null });
  return hosts.get(h);
}
async function slot(h) {
  const s = hostState(h);
  if (s.active >= MAX_PER_HOST) await new Promise(r => s.queue.push(r));
  s.active++;
  return () => { s.active--; s.queue.shift()?.(); };
}

export class SourceError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// GET JSON. 404 → null (providers use it for "no such thing"). ttl seconds of in-memory caching (0: none).
export async function getJson(url, { ttl = 0, headers = {}, tries = 3, timeout = 15000, source = 'data source' } = {}) {
  const hit = ttl && cache.get(url);
  if (hit && hit.exp > Date.now()) return hit.data;
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    const h = new URL(url).host, s = hostState(h);
    const release = await slot(h);
    try {
      for (let i = 0; ; i++) {
        try {
          const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; AroundTheNBAStudio/1.0)', accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout) });
          if (r.status === 404) { s.ok++; s.lastOk = new Date(); return null; }
          if (r.status === 429 || r.status >= 500) throw new SourceError(`${source} answered ${r.status}`);
          if (!r.ok) { const e = new SourceError(`${source} answered ${r.status}`); e.final = true; throw e; }
          const data = await r.json();
          s.ok++; s.lastOk = new Date();
          if (ttl) { if (cache.size > 500) cache.clear(); cache.set(url, { exp: Date.now() + ttl * 1000, data }); }
          return data;
        } catch (e) {
          if (e.final || i >= tries - 1) { s.fail++; s.lastError = { at: new Date(), message: e.message }; throw e instanceof SourceError ? e : new SourceError(`${source} unavailable (${e.message})`); }
          await sleep(300 * 2 ** i + Math.random() * 200);
        }
      }
    } finally { release(); }
  })();
  inflight.set(url, p);
  try { return await p; } finally { inflight.delete(url); }
}

export const hostStatus = () => Object.fromEntries([...hosts].map(([h, s]) => [h, { ok: s.ok, fail: s.fail, lastOk: s.lastOk, lastError: s.lastError }]));
export const clearCache = () => cache.clear();
