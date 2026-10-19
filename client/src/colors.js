// Team colours: usable cloth from a team's brand colours, and lettering that reads on it.
const rgb = hex => { const n = parseInt(String(hex || '#777777').slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const luminance = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };

// Very dark or very light brand colours fall back to the other one, or slate.
export function teamCloth(team) {
  const c = team?.color, alt = team?.alt;
  const ok = x => x && luminance(x) > 0.012 && luminance(x) < 0.6;
  return ok(c) ? c : ok(alt) ? alt : '#3a3f47';
}
// The accent for a team on the dark arena: its brightest usable colour.
export function teamGlow(team) {
  const list = [team?.color, team?.alt].filter(Boolean).filter(c => luminance(c) > 0.04 && luminance(c) < 0.85);
  return list.sort((a, b) => luminance(b) - luminance(a))[0] || '#ffb347';
}
export const inkOn = bg => (contrast('#f6f4ef', bg) >= 3.2 || contrast('#f6f4ef', bg) >= contrast('#15161a', bg) ? '#f6f4ef' : '#15161a');
