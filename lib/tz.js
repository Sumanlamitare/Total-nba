// Time zones without a library: calendar days and wall-clock times in an IANA zone, DST-safe (offsets are read from
// Intl for the instant in question, never assumed).
const fmtCache = new Map();
function parts(t, tz) {
  if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const o = Object.fromEntries(fmtCache.get(tz).formatToParts(new Date(t)).map(p => [p.type, p.value]));
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
}
export const validZone = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
// YYYYMMDD of an instant in a zone.
export const dayOf = (t, tz) => { const p = parts(t, tz); return `${p.y}${String(p.m).padStart(2, '0')}${String(p.d).padStart(2, '0')}`; };
export const addDays = (ymd, n) => { const t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + n); return new Date(t).toISOString().slice(0, 10).replace(/-/g, ''); };
// The offset (ms) of a zone at an instant: local wall time minus UTC.
const offsetAt = (t, tz) => { const p = parts(t, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(+new Date(t) / 1000) * 1000; };
// The instant a wall-clock time happens in a zone (for a time skipped by a DST jump: the moment after the jump).
export function zonedTime(ymd, hh = 0, mm = 0, tz) {
  const guess = Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8), hh, mm);
  let t = guess - offsetAt(guess, tz);
  t = guess - offsetAt(t, tz);
  return new Date(t);
}
export const startOfDay = (ymd, tz) => zonedTime(ymd, 0, 0, tz);
