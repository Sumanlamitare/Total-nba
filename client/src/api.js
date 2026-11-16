// Talking to /api, the signed-in user, a tiny router, and time formatting in the viewer's own time zone.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
export async function get(fn, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  const r = await fetch(`/api/${fn}?${q}`, { credentials: 'same-origin' });
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
export function useLoad(fn, deps = [], { every = 0 } = {}) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const n = useRef(0);
  const run = useCallback((quiet = false) => {
    const k = ++n.current;
    if (!quiet) set(s => ({ ...s, loading: true }));
    Promise.resolve().then(fn).then(data => k === n.current && set({ data, error: null, loading: false }), error => k === n.current && set(s => ({ data: s.data, error, loading: false })));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); if (!every) return; const t = setInterval(() => !document.hidden && run(true), every); return () => clearInterval(t); }, [run, every]);
  return { ...state, reload: run, setData: data => set(s => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })) };
}


const routeSubs = new Set();
export function go(to) { if (to === location.pathname + location.search) return; history.pushState(null, '', to); routeSubs.forEach(f => f()); window.scrollTo({ top: 0 }); }
if (typeof window !== 'undefined') window.addEventListener('popstate', () => routeSubs.forEach(f => f()));
export const useRoute = () => useSyncExternalStore(f => { routeSubs.add(f); return () => routeSubs.delete(f); }, () => location.pathname + location.search);

// The viewer's own time zone for kickoff times (the backend keeps UTC).
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const time = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
export function dayName(key) {
  const d = new Date(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 864e5);
  const label = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return diff === 0 ? `Today · ${label}` : diff === 1 ? `Tomorrow · ${label}` : diff === -1 ? `Yesterday · ${label}` : label;
}
export const when = t => new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export function until(t, now = Date.now()) {
  const ms = new Date(t) - now;
  if (ms <= 0) return 'due now';
  const h = Math.floor(ms / 3600e3), m = Math.round((ms % 3600e3) / 60e3);
  return h ? `in ${h} h ${m} min` : `in ${m} min`;
}
export function ago(t) {
  if (!t) return 'never';
  const s = (Date.now() - new Date(t)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
