// Talking to the API, with a small in-memory cache (final nights never change).
const cache = new Map();

async function json(url) {
  let r;
  try { r = await fetch(url, { headers: { accept: 'application/json' } }); }
  catch { throw new Error('Offline — check your connection and try again.'); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || `Request failed (${r.status})`), { status: r.status });
  return body;
}
const once = (key, url, keep = b => true) => {
  if (!cache.has(key)) {
    const p = json(url).then(b => { if (!keep(b)) cache.delete(key); return b; });
    cache.set(key, p); p.catch(() => cache.delete(key));
  }
  return cache.get(key);
};

export const loadNight = date => once(`n:${date}`, `/api/night?date=${encodeURIComponent(date)}`, b => b.final);
export const loadSeasons = () => once('seasons', '/api/seasons');
export const loadLeaderboard = (season, stage = 'all') => once(`lb:${season}:${stage}`, `/api/leaderboard?season=${season}&stage=${stage}`);

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine */ } },
};

// 20250115 -> Date at local noon (no time-zone slips); labels.
export const toDate = s => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12);
export const fromDate = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
export const longDay = s => toDate(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const shortDay = s => toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const isoDay = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
