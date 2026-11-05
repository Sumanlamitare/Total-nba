// Talking to the API: JSON helpers, the live stream (Server-Sent Events, with a polling fallback), the signed-in user,
// a tiny router, and formatting.
import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';

export class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

export async function get(fn, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`/api/${fn}${q ? `?${q}` : ''}`, { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error || `Request failed (${r.status})`);
  return j;
}
export async function post(fn, action, body = {}) {
  const r = await fetch(`/api/${fn}?action=${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error || `Request failed (${r.status})`);
  return j;
}

// Load something; reload when deps change. { data, error, loading, reload, setData }.
export function useLoad(fn, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const n = ++seq.current;
    set(s => ({ ...s, loading: true, error: null }));
    Promise.resolve().then(fn).then(data => { if (n === seq.current) set({ data, error: null, loading: false }); }, error => { if (n === seq.current) set({ data: null, error, loading: false }); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(run, [run]);
  return { ...state, reload: run, setData: data => set(s => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })) };
}

// ── The live stream: one connection shared by the whole app ──────────────────────────────────────────────────────
const listeners = new Set();
let es = null, status = 'connecting', lastSeq = 0, pollTimer = null;
const statusSubs = new Set();
const setStatus = s => { status = s; statusSubs.forEach(f => f()); };
function emit(entry) { if (entry.seq > lastSeq) lastSeq = entry.seq; listeners.forEach(f => f(entry)); }
function connect() {
  if (es || typeof EventSource === 'undefined') return poll();
  es = new EventSource(`/api/stream${lastSeq ? `?seq=${lastSeq}` : ''}`);
  // A host that buffers the stream never delivers "hello" in time: fall back to polling.
  const guard = setTimeout(() => { if (status !== 'live' && es) { es.close(); es = null; poll(); } }, 9000);
  es.addEventListener('hello', () => clearTimeout(guard), { once: true });
  es.addEventListener('hello', e => { const j = JSON.parse(e.data); if (!lastSeq) lastSeq = j.seq; setStatus('live'); });
  es.addEventListener('entry', e => emit(JSON.parse(e.data)));
  es.addEventListener('bye', () => setStatus('live'));
  es.onerror = () => { setStatus('reconnecting'); if (es && es.readyState === 2) { es = null; setTimeout(connect, 3000); } };
}
// Fallback (no EventSource, or a proxy that buffers streams): ask for changes every 8 s.
function poll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => { try { const j = await get('feed', { action: 'since', seq: lastSeq }); j.items.forEach(emit); lastSeq = j.seq || lastSeq; setStatus('live'); } catch { setStatus('reconnecting'); } }, 8000);
}
export function useStream(onEntry) {
  const ref = useRef(onEntry); ref.current = onEntry;
  useEffect(() => { const f = e => ref.current(e); listeners.add(f); connect(); return () => listeners.delete(f); }, []);
}
export const useStreamStatus = () => useSyncExternalStore(f => { statusSubs.add(f); return () => statusSubs.delete(f); }, () => status);
export const seedSeq = n => { if (n > lastSeq) lastSeq = n; };

// ── The signed-in user ─────────────────────────────────────────────────────────────────────────────────────────────
let me = { user: null, setupNeeded: false, loaded: false };
const meSubs = new Set();
export async function loadMe() { try { me = { ...(await get('admin', { action: 'me' })), loaded: true }; } catch { me = { user: null, loaded: true }; } meSubs.forEach(f => f()); return me; }
export const setMe = user => { me = { ...me, user }; meSubs.forEach(f => f()); };
export const useMe = () => useSyncExternalStore(f => { meSubs.add(f); return () => meSubs.delete(f); }, () => me);
export const can = (user, role) => !!user && ['owner', 'editor', 'fan'].indexOf(user.role) <= ['owner', 'editor', 'fan'].indexOf(role);

// ── Router ────────────────────────────────────────────────────────────────────────────────────────────────────────
const routeSubs = new Set();
export function go(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  routeSubs.forEach(f => f());
  if (!replace) window.scrollTo({ top: 0 });
}
if (typeof window !== 'undefined') window.addEventListener('popstate', () => routeSubs.forEach(f => f()));
export const useRoute = () => useSyncExternalStore(f => { routeSubs.add(f); return () => routeSubs.delete(f); }, () => location.pathname + location.search);
export const query = () => Object.fromEntries(new URLSearchParams(location.search));
export function setQuery(patch) {
  const q = { ...query(), ...patch };
  for (const k of Object.keys(q)) if (q[k] == null || q[k] === '') delete q[k];
  const s = new URLSearchParams(q).toString();
  go(`${location.pathname}${s ? `?${s}` : ''}`, { replace: true });
}

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────────────────────
export function ago(t) {
  if (!t) return '';
  const s = (Date.now() - new Date(t)) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export const clockTime = t => (t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
export const ymdLabel = ymd => (ymd ? new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
export const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()).replace(/-/g, '');
