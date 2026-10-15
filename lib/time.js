// "1 day 2 hours", "5 minutes" — the two largest units only
export function human(sec) {
  sec = Math.max(0, Math.round(sec));
  const units = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  const out = [];
  for (const [n, s] of units) {
    const k = Math.floor(sec / s);
    if (k) { out.push(`${k} ${n}${k > 1 ? 's' : ''}`); sec -= k * s; }
    if (out.length === 2) break;
  }
  return out.join(' ') || '0 seconds';
}
