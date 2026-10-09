// Stat label shown in the UI -> field name in the API
export const STATS = { POINTS: 'pts', REBOUNDS: 'reb', ASSISTS: 'ast', STEALS: 'stl', BLOCKS: 'blk', '3PM': 'tpm',
  '2PM': 'fg2m', FTM: 'ftm', TURNOVERS: 'tov', FOULS: 'pf', FANTASY: 'fan' };
// Longer names for the graphic and the stat picker
export const LONG = { POINTS: 'Points', REBOUNDS: 'Rebounds', ASSISTS: 'Assists', STEALS: 'Steals', BLOCKS: 'Blocks',
  '3PM': '3-Pointers Made', '2PM': '2-Pointers Made', FTM: 'Free Throws Made', TURNOVERS: 'Turnovers', FOULS: 'Personal Fouls',
  FANTASY: 'Fantasy Points' };
export const SHORT = { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM', fg2m: '2PM', ftm: 'FTM', tov: 'TOV', pf: 'PF', fan: 'FPTS', min: 'MIN', gp: 'GP' };
export const LABEL = Object.fromEntries(Object.entries(STATS).map(([k, v]) => [v, k]));
export const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// fantasy points carry one decimal; everything else is a whole number
export const decimalsFor = f => (f === 'fan' ? 1 : 0);
export const fmt = (n, decimals = 0) => Number(n || 0).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const fmtStat = (v, f) => fmt(v, f === 'fan' && !Number.isInteger(v) ? 1 : 0);
const pad = n => String(n).padStart(2, '0');
export const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const weekStart = d => addDays(d, -((d.getDay() + 6) % 7));
export const sh = d => MO[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
export const dstr = d => `${MO[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
export const shortDate = s => { const d = parse(s); return `${MO[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`; };
export const seasonName = s => (s || '').replace('-', '–');
export const slug = a => a.join('_').replace(/[^A-Za-z0-9_]/g, '');
export const photo = id => (/^\d+$/.test(id || '') ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : '');
export const initials = n => (n || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('');

export function periodLabel(s, seasons, short) {
  if (s.season) return seasonName(seasons[s.si]) || '—';
  if (s.week) { const a = weekStart(s.date), b = addDays(a, 6); return sh(a) + ' – ' + sh(b) + (short ? '' : ', ' + b.getFullYear()); }
  return short ? sh(s.date) + ', ' + s.date.getFullYear() : dstr(s.date);
}

// ---- trading-card flavour ------------------------------------------------------------
export const RARITY = ['common', 'rare', 'epic', 'legendary'];
// a single game's rarity comes from its fantasy score; a week/season card's from its rank
export const rarityOfGame = fan => (fan >= 55 ? 'legendary' : fan >= 42 ? 'epic' : fan >= 30 ? 'rare' : 'common');
export const rarityOfRank = i => (i === 0 ? 'legendary' : i < 3 ? 'epic' : i < 10 ? 'rare' : 'common');

// Auto-awarded badges for one game line
export function badges(l) {
  const out = [];
  const tens = ['pts', 'reb', 'ast', 'stl', 'blk'].filter(f => (l[f] || 0) >= 10).length;
  if (tens >= 5) out.push('QUINTUPLE-DOUBLE'); else if (tens === 4) out.push('QUADRUPLE-DOUBLE');
  else if (tens === 3) out.push('TRIPLE-DOUBLE'); else if (tens === 2) out.push('DOUBLE-DOUBLE');
  if (l.pts >= 60) out.push('60 BURGER'); else if (l.pts >= 50) out.push('50 BOMB'); else if (l.pts >= 40) out.push('40 PIECE');
  if (l.tpm >= 6) out.push('SNIPER');
  if (l.reb >= 18) out.push('GLASS CLEANER');
  if (l.ast >= 13) out.push('FLOOR GENERAL');
  if (l.blk >= 5) out.push('BLOCK PARTY');
  if (l.stl >= 5) out.push('PICKPOCKET');
  if (l.ftm >= 14) out.push('LIVING AT THE LINE');
  if (l.tov === 0 && l.min >= 34) out.push('ZERO TURNOVERS');
  if (l.min >= 48) out.push('IRON MAN');
  if (l.pf >= 6) out.push('FOULED OUT');
  return out;
}
// Badges for a week/season total card
export function totalBadges(r, i, statKey) {
  const out = [];
  if (i === 0) out.push(`#1 IN ${SHORT[statKey] || 'STAT'}`);
  if (r.gp >= 82) out.push('IRON MAN');
  if (r.gp && r.min / r.gp >= 37) out.push('WORKHORSE');
  return out;
}

// Small headshot from ESPN's image resizer (the full PNG is 1040px wide; dozens of those exhaust a phone)
export const face = (id, w = 160) => (/^\d+$/.test(id || '')
  ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=${w}&h=${Math.round(w * 0.727)}&scale=crop` : '');
