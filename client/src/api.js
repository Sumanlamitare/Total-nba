// Talking to the API (with a small in-memory cache), dates, and the URL form of a configuration.
const cache = new Map();

async function json(url, opts) {
  let r;
  try { r = await fetch(url, { headers: { accept: 'application/json', ...(opts?.body ? { 'content-type': 'application/json' } : {}) }, ...opts }); }
  catch { throw new Error('Offline — check your connection and try again.'); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || `Request failed (${r.status})`), { status: r.status });
  return body;
}
const once = (key, url, ttl = 5 * 60e3) => {
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - ttl) return hit.p;
  const p = json(url);
  cache.set(key, { p, at: Date.now() }); p.catch(() => cache.delete(key));
  return p;
};
export const forget = prefix => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); };

export const getHome = () => json('/api/data?q=home');
export const getSeasons = () => once('seasons', '/api/data?q=seasons', 30 * 60e3);
export const getCatalog = mode => once(`cat:${mode}`, `/api/data?q=catalog&mode=${mode}`, 24 * 3600e3);
export function getDataset(cfg) {
  const q = cfg.mode === 'daily' ? `mode=daily&date=${cfg.date}` : `mode=season&season=${cfg.season}&stype=${cfg.stype || 'regular'}${cfg.from ? `&from=${cfg.from}` : ''}${cfg.to ? `&to=${cfg.to}` : ''}`;
  return once(`ds:${q}`, `/api/data?q=dataset&${q}`);
}
export const getDiagram = id => once(`dg:${id}`, `/api/diagram?id=${encodeURIComponent(id)}`);
export const getAutoDiagram = (kind, date) => json(`/api/diagram?kind=${kind}&date=${date}`);
export const getHistory = (params = {}) => json(`/api/diagram?list=1&${new URLSearchParams(params)}`);
export const saveDiagram = (config, style) => json('/api/diagram', { method: 'POST', body: JSON.stringify({ config, style }) });
export const getSettings = () => json('/api/admin?q=settings');
export const saveSettings = body => json('/api/admin?q=settings', { method: 'POST', body: JSON.stringify(body) });
export const getConfigs = () => json('/api/admin?q=configs');
export const saveConfig = body => json('/api/admin?q=configs', { method: 'POST', body: JSON.stringify(body) });
export const refreshDate = date => json('/api/admin?q=refresh', { method: 'POST', body: JSON.stringify({ date }) });

// 20250115 <-> dates and labels (local noon: no time-zone slips).
export const toDate = s => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12);
export const fromDate = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
export const longDay = s => toDate(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const shortDay = s => toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const isoDay = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
export const ago = t => { if (!t) return 'never'; const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

// A configuration and style in a URL (?c=...), so any diagram can be linked without saving it.
export const encodeState = s => btoa(unescape(encodeURIComponent(JSON.stringify(s)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function decodeState(c) {
  try { return JSON.parse(decodeURIComponent(escape(atob(c.replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; }
}
