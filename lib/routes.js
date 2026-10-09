// Page addresses, shared by the React app and the server-rendered page shell (api/page.js).
//   /games/2026-03-01[/rebounds]   /week/2026-03-02[/assists]   /season/2025-26[/threes]
//   /player/lebron-james-1966       /records[/rebounds]          /pro  /privacy  /saved
export const STAT_SLUG = { POINTS: 'points', REBOUNDS: 'rebounds', ASSISTS: 'assists', STEALS: 'steals', BLOCKS: 'blocks',
  '3PM': 'threes', '2PM': 'twos', FTM: 'free-throws', TURNOVERS: 'turnovers', FOULS: 'fouls', FANTASY: 'fantasy' };
export const SLUG_STAT = Object.fromEntries(Object.entries(STAT_SLUG).map(([k, v]) => [v, k]));
export const FIELD = { POINTS: 'pts', REBOUNDS: 'reb', ASSISTS: 'ast', STEALS: 'stl', BLOCKS: 'blk', '3PM': 'tpm', '2PM': 'fg2m',
  FTM: 'ftm', TURNOVERS: 'tov', FOULS: 'pf', FANTASY: 'fan' };
export const STAT_NAME = { POINTS: 'Points', REBOUNDS: 'Rebounds', ASSISTS: 'Assists', STEALS: 'Steals', BLOCKS: 'Blocks',
  '3PM': '3-Pointers', '2PM': '2-Pointers', FTM: 'Free Throws', TURNOVERS: 'Turnovers', FOULS: 'Fouls', FANTASY: 'Fantasy Points' };

export const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const playerPath = (name, key) => (/^\d+$/.test(key || '') ? `/player/${slugify(name)}-${key}` : `/player/${encodeURIComponent(key)}`);
export const keyFromSlug = slug => { const m = String(slug).match(/-(\d+)$/); return m ? m[1] : /^\d+$/.test(slug) ? slug : decodeURIComponent(slug); };

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isSeason = s => /^\d{4}-\d{2}$/.test(s || '');

// path -> { mode, date?, season?, stat, player?, page? }  (null when the path is not a known page)
export function parsePath(path) {
  const [a, b, c] = String(path || '/').split('?')[0].split('/').filter(Boolean);
  const stat = s => SLUG_STAT[s] || 'POINTS';
  if (!a) return { mode: 'day', stat: 'POINTS' };
  if (a === 'games' && isDate(b)) return { mode: 'day', date: b, stat: stat(c) };
  if (a === 'week' && isDate(b)) return { mode: 'week', date: b, stat: stat(c) };
  if (a === 'season' && isSeason(b)) return { mode: 'season', season: b, stat: stat(c) };
  if (a === 'records') return { mode: 'records', stat: stat(b) };
  if (a === 'player' && b) return { mode: 'player', player: keyFromSlug(b) };
  if (['pro', 'privacy', 'saved'].includes(a)) return { mode: a, stat: 'POINTS' };
  return null;
}

// { mode, date, season, stat } -> path
export function pathFor({ mode, date, season, stat }) {
  const s = stat && stat !== 'POINTS' ? '/' + STAT_SLUG[stat] : '';
  if (mode === 'day') return date ? `/games/${date}${s}` : '/';
  if (mode === 'week') return `/week/${date}${s}`;
  if (mode === 'season') return `/season/${season}${s}`;
  if (mode === 'records') return `/records${s}`;
  return '/' + mode;
}
