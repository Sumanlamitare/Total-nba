// Fetching with caching: the catalog is kept in localStorage (it changes weekly), books in memory.
const CATALOG_KEY = 'library.catalog.v1';
const books = new Map();

async function json(url, { signal } = {}) {
  let r;
  try { r = await fetch(url, { signal, headers: { accept: 'application/json' } }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('The library is offline — check your connection and try again.'); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || `Request failed (${r.status})`), { status: r.status });
  return body;
}

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked: fine */ } },
};
export { store };

// Returns cached data at once (if any) and calls onFresh when the network copy arrives.
export async function loadCatalog(onFresh) {
  const cached = store.get(CATALOG_KEY);
  const fresh = json('/api/catalog').then(d => { store.set(CATALOG_KEY, { at: Date.now(), d }); return d; });
  if (cached?.d?.players?.length) {
    fresh.then(d => { if (d.players.length !== cached.d.players.length || d.meta?.at !== cached.d.meta?.at) onFresh?.(d); }).catch(() => {});
    return cached.d;
  }
  return fresh;
}

export function loadBook(id) {
  if (!books.has(id)) {
    const p = json(`/api/book?id=${encodeURIComponent(id)}`);
    books.set(id, p);
    p.catch(() => books.delete(id));
    if (books.size > 40) books.delete(books.keys().next().value);
  }
  return books.get(id);
}

const highs = new Map();
export function loadHighs(id) {
  if (!highs.has(id)) { const p = json(`/api/book?id=${encodeURIComponent(id)}&part=highs`); highs.set(id, p); p.catch(() => highs.delete(id)); }
  return highs.get(id);
}

export const searchPlayers = (q, signal) => json(`/api/search?q=${encodeURIComponent(q)}`, { signal });

export const headshot = id => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
