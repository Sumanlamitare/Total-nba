// Stat label shown in the UI -> field name in the API
export const STATS = { POINTS: 'pts', REBOUNDS: 'reb', ASSISTS: 'ast', STEALS: 'stl', BLOCKS: 'blk', '3PM': 'tpm' };
export const LABEL = Object.fromEntries(Object.entries(STATS).map(([k, v]) => [v, k]));
export const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const fmt = n => String(n).replace(/\B(?=(\d{3})+$)/g, ',');
const pad = n => String(n).padStart(2, '0');
export const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const weekStart = d => addDays(d, -((d.getDay() + 6) % 7));
export const sh = d => MO[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
export const dstr = d => `${MO[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
export const seasonName = s => (s || '').replace('-', '–');
export const slug = a => a.join('_').replace(/[^A-Za-z0-9_]/g, '');
export const headshot = id => (/^\d+$/.test(id || '') ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : '');
export const ago = t => { const m = Math.round((Date.now() - Date.parse(t)) / 6e4); return m < 60 ? m + 'm ago' : m < 2880 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };

export function periodLabel(s, seasons) {
  if (s.season) return seasonName(seasons[s.si]) || '—';
  if (s.week) { const a = weekStart(s.date), b = addDays(a, 6); return sh(a) + ' – ' + sh(b) + ', ' + b.getFullYear(); }
  return dstr(s.date);
}
