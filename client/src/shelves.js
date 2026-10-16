// Shelving: which shelf every book stands on, and how each spine looks.
//   Active players stand on their current team's shelf (the latest team ESPN has them on).
//   Retired players share one shelf. Inside a shelf, books run A to Z by surname.
// Everything about a spine is driven by data, except a little height variation for looks:
//   width  — seasons on record (a long career is a thick book)
//   colour — the player's latest team; a darker shade for an earlier first season
//   gold bands — MVP awards; stars — Finals MVP awards

// Seasons are named by the year they end: 1985 -> "1984-85".
export const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
export const span = p => {
  if (!p.y0) return '';
  if (!p.y1) return `from ${p.y0 - 1}`;
  if (p.y0 === p.y1) return seasonLabel(p.y0);
  if (p.y1m) return `from ${p.y0 - 1}`;
  return `${p.y0 - 1}–${p.a ? 'now' : p.y1}`;
};

// Deterministic small noise per player so the shelves look hand-stocked but never reshuffle.
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export const seasonsOf = p => (p.y0 && p.y1 ? Math.max(1, p.y1 - p.y0 + 1) : p.y0 && p.a ? Math.max(1, 2027 - p.y0) : 1);

export const RETIRED = 'retired';
export const ALL = 'all';

// Every book's place. Returns { active: [player index] (every active player, A to Z), teams: [{ ...team, books }],
// retired: [player index], placeOf: Map(player id -> { shelf: team id | 'all' | 'retired', at, allAt }) }.
// An active player ESPN lists on no team stands only on the "All teams" shelf.
export function shelve(players, teamList = []) {
  const byId = new Map(teamList.map(t => [t.id, { ...t, books: [] }]));
  const active = [], retired = [];
  const order = players.map((p, i) => i).sort((a, b) => (players[a].k < players[b].k ? -1 : players[a].k > players[b].k ? 1 : 0));
  for (const i of order) {
    const p = players[i];
    if (!p.a) { retired.push(i); continue; }
    active.push(i);
    byId.get(p.tm)?.books.push(i);
  }
  const teams = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const placeOf = new Map();
  active.forEach((i, at) => placeOf.set(players[i].i, { shelf: ALL, at, allAt: at }));
  for (const t of teams) t.books.forEach((i, at) => { placeOf.get(players[i].i).shelf = t.id; placeOf.get(players[i].i).at = at; });
  retired.forEach((i, at) => placeOf.set(players[i].i, { shelf: RETIRED, at }));
  return { active, teams, retired, placeOf, teamById: new Map(teamList.map(t => [t.id, t])) };
}

// Why a book is where it is, in words.
export const shelvedBecause = (p, team) => {
  const name = team?.name;
  if (!p?.a) return name ? `with the retired players; ${name} was his last team on ESPN's record` : 'with the retired players';
  if (!name) return 'with the active players (ESPN lists him on no team)';
  return p.tms === 'seasons' || p.tms === 'last' || p.tms === 'awards' ? `with the ${name}, the latest team ESPN lists for him` : `with the ${name}, his current team`;
};

// ---- Colour ------------------------------------------------------------------------------------------------------

const rgb = hex => { const n = parseInt(String(hex || '#777777').slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const luminance = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };

// A team's usable cloth colour: very dark or very light brand colours fall back to the other one, or slate.
export function teamCloth(team) {
  const c = team?.color, alt = team?.alt;
  const ok = x => x && luminance(x) > 0.012 && luminance(x) < 0.6;
  return ok(c) ? c : ok(alt) ? alt : '#3a3f47';
}

// Spine colour for a player: the team colour, a shade darker for each decade further back.
export function spineColor(p, team) {
  const base = teamCloth(team);
  const y = p.y0 ? p.y0 - 1 : null;
  const t = y == null ? 0.35 : Math.max(0, Math.min(0.5, (2020 - y) / 140));
  const j = (hash(p.i + 'c') - 0.5) * 0.08;
  return mix(base, '#0b0c10', Math.max(0, t + j));
}
// Dark or light lettering, whichever stands out more.
export const inkOn = bg => (contrast('#15161a', bg) > contrast('#f6f4ef', bg) ? '#15161a' : '#f6f4ef');

// ---- Spines ------------------------------------------------------------------------------------------------------

export const FONTS = [
  { family: '"Barlow Condensed", "Arial Narrow", sans-serif', weight: 700, ls: '.02em', upper: true, max: 17 },
  { family: 'Oswald, "Arial Narrow", sans-serif', weight: 500, ls: '.05em', upper: true, max: 15 },
  { family: '"Playfair Display", Georgia, serif', weight: 700, ls: '.005em', upper: false, max: 15 },
];
const DECOS = ['plain', 'double', 'stripe', 'label', 'emblem'];

// How one book looks on the shelf (sizes in px at scale 1).
export function spineOf(p, team) {
  const r = hash(p.i), r2 = hash(p.i + 's');
  const base = spineColor(p, team);
  const alt = team?.alt && contrast(team.alt, base) > 2.2 ? team.alt : null;
  // Mostly the team colour; now and then the second colour or a lighter cloth, so a team shelf isn't one block.
  let bg = base;
  if (r2 > 0.78 && alt && luminance(alt) < 0.62) bg = mix(alt, '#0b0c10', 0.08);
  else if (r2 > 0.64) bg = mix(base, '#efe8da', 0.2);
  const fg = alt && contrast(alt, bg) > 3 ? alt : inkOn(bg);
  const mvp = Math.min(p.h?.mvp || 0, 4), fmvp = Math.min(p.h?.fmvp || 0, 4);
  return {
    w: Math.round(30 + Math.min(seasonsOf(p), 20) * 1.3),
    h: Math.round(236 + r * 56),
    bg, fg,
    font: FONTS[Math.floor(hash(p.i + 'f') * FONTS.length)],
    deco: mvp ? 'bands' : DECOS[Math.floor(r2 * 997) % DECOS.length],
    mvp, fmvp,
  };
}

// Spine titles are fitted with canvas measurements (fast enough for thousands of books).
let ctx2d = null;
export function fitTitle(name, sp) {
  ctx2d ||= document.createElement('canvas').getContext('2d');
  const f = sp.font, text = f.upper ? name.toUpperCase() : name;
  ctx2d.font = `${f.weight} 100px ${f.family}`;
  const len = ctx2d.measureText(text).width / 100 + (f.upper ? text.length * 0.05 : 0);
  const ends = sp.deco === 'bands' ? 32 : sp.deco === 'emblem' ? 34 : sp.deco === 'double' ? 30 : 24;
  const room = sp.h - 2 * ends - 10, col = sp.w - 8;
  const one = Math.min(f.max, room / len, col / 1.15);
  if (one >= 11 || col < 26) return { fs: Math.max(9, one), lines: 1 };
  const two = Math.min(f.max, (2 * room) / len * 0.9, col / 2.3);
  return two > one ? { fs: Math.max(9, two), lines: 2 } : { fs: Math.max(9, one), lines: 1 };
}

export const letterOf = p => ((p.l || p.n || '#').normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase() || '#');
