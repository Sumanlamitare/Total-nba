// Small shared helpers: Eastern Time dates (NBA game dates), numbers, concurrency.

const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

// YYYYMMDD of an instant in Eastern Time (the NBA's game date).
export const etDate = (t = new Date()) => ET.format(new Date(t)).replace(/-/g, '');
export const addDays = (ymd, n) => {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + n));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};
export const ymdToIso = ymd => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
export const isYmd = s => /^\d{8}$/.test(String(s || ''));

// The NBA season a date belongs to, named by the year it ends (2026-27 → 2027).
export const seasonOf = ymd => (+ymd.slice(4, 6) >= 8 ? +ymd.slice(0, 4) + 1 : +ymd.slice(0, 4));
export const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;

// Age in years (decimal) on a date, from an ISO birth date.
export function ageOn(dob, ymd) {
  if (!dob) return null;
  const b = new Date(dob), d = new Date(`${ymdToIso(ymd)}T12:00:00Z`);
  return (d - b) / (365.2425 * 86400e3);
}

export const num = v => { const n = Number(String(v ?? '').replace(/^\+/, '')); return Number.isFinite(n) ? n : 0; };
export const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
export const pct = (m, a) => (a > 0 ? (100 * m) / a : null);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
export const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
