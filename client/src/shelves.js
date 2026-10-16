// Shelving: turns the catalog into bookcases ("bays"), shelves and books with real dimensions (metres), and lays
// the bays out in a library hall of double-sided shelving rows.
// Everything that varies between books is driven by data, except a small height variation for looks:
//   thickness — seasons on record (a long career is a thick book)
//   colour    — the team's colour; a darker shade for an earlier decade
//   gold bands — MVP awards; stars — Finals MVP awards

export const CASE = { width: 1.0, shelves: 7, shelfGap: 0.42, depth: 0.34, board: 0.035, side: 0.05 };
CASE.height = CASE.shelves * CASE.shelfGap + CASE.board + 0.12;
// Height of the board a shelf's books stand on; shelf 0 is the top shelf (books read top to bottom).
export const shelfY = s => 0.1 + (CASE.shelves - 1 - s) * CASE.shelfGap;

export const ERAS = [
  { from: 0, to: 1959, name: 'Before 1960', leather: '#2f4630' },
  { from: 1960, to: 1969, name: '1960s', leather: '#6a2620' },
  { from: 1970, to: 1979, name: '1970s', leather: '#5f4a2e' },
  { from: 1980, to: 1989, name: '1980s', leather: '#22365a' },
  { from: 1990, to: 1999, name: '1990s', leather: '#4b2c46' },
  { from: 2000, to: 2009, name: '2000s', leather: '#1f4a47' },
  { from: 2010, to: 2019, name: '2010s', leather: '#5b3322' },
  { from: 2020, to: 9999, name: '2020s', leather: '#33415f' },
];
export const UNKNOWN_ERA = { name: 'Debut not on record', leather: '#4d4237' };

// Seasons are named by the year they end: 1985 -> "1984-85".
export const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
export const span = p => {
  if (!p.y0) return '';
  if (!p.y1) return `from ${p.y0 - 1}`;
  if (p.y0 === p.y1) return seasonLabel(p.y0);
  if (p.y1m) return `from ${p.y0 - 1}`;
  return `${p.y0 - 1}–${p.a ? 'now' : p.y1}`;
};

export const eraOf = p => (p.y0 ? ERAS.find(e => p.y0 - 1 >= e.from && p.y0 - 1 <= e.to) : null) || UNKNOWN_ERA;

// Deterministic small noise per player so the shelves look hand-stocked but never reshuffle.
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export const seasonsOf = p => (p.y0 && p.y1 ? Math.max(1, p.y1 - p.y0 + 1) : p.y0 && p.a ? Math.max(1, 2027 - p.y0) : 1);

export function bookSize(p) {
  const r = hash(p.i);
  return {
    w: 0.022 + Math.min(seasonsOf(p), 20) * 0.0017,
    h: 0.27 + r * 0.08,
    d: 0.2 + hash(p.i + 'd') * 0.04,
  };
}

const prefix = (p, n) => (p.k || p.l || p.n || '?').slice(0, n);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const NO_TEAM = { id: null, abbr: '—', name: 'Team not on record', short: 'Unrecorded', color: '#5d6470', alt: '#c9ccd2' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Shelve by franchise: each team gets its own bookcase(s), A to Z by surname inside, the books spread evenly over
// the shelves (a bookend closes each shelf). Teams run alphabetically; players with no team on ESPN's
// record come last. Returns { books, cases, teams } — teams[k] = { ...team, first: case index, count }.
export function pack(players, teamList = []) {
  const inner = CASE.width - 0.06; // leave room for the bookend
  const byId = new Map(teamList.map(t => [t.id, t]));
  const groups = new Map();
  players.forEach((p, i) => {
    const key = p.tm && byId.has(p.tm) ? p.tm : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const order = [...groups.keys()].filter(k => k != null).sort((a, b) => byId.get(a).name.localeCompare(byId.get(b).name));
  if (groups.has(null)) order.push(null);

  const books = [], cases = [], teams = [];
  for (const key of order) {
    const team = key == null ? NO_TEAM : byId.get(key);
    const idx = groups.get(key);
    const sizes = idx.map(i => bookSize(players[i]));
    const total = sizes.reduce((a, s) => a + s.w + 0.0015, 0);
    const nCases = Math.max(1, Math.ceil(total / (inner * CASE.shelves * 0.97)));
    const perShelf = Math.min(inner, total / (nCases * CASE.shelves) + 0.03);
    const t = { ...team, first: cases.length, count: idx.length, cases: nCases };
    teams.push(t);
    let c = -1, s = CASE.shelves, x = 0;
    const newCase = () => {
      c = cases.length; s = 0; x = 0;
      const nth = cases.filter(k => k.team === t).length;
      cases.push({ index: c, team: t, first: books.length, last: books.length - 1, ends: [], label: nCases > 1 ? `${team.short || team.name} ${ROMAN[nth + 1] || nth + 1}` : team.name });
    };
    idx.forEach((i, k) => {
      const size = sizes[k];
      if (c < 0 || x + size.w > (s === CASE.shelves - 1 ? inner : perShelf)) {
        if (c >= 0 && x > 0) cases[c].ends.push({ s, x: -inner / 2 + x });
        if (c < 0 || s + 1 >= CASE.shelves) newCase(); else { s++; x = 0; }
      }
      books.push({ i, c, s, x: -inner / 2 + x + size.w / 2, ...size });
      cases[c].last = books.length - 1;
      x += size.w + 0.0015;
    });
    if (x > 0) cases[c].ends.push({ s, x: -inner / 2 + x });
  }
  for (const cs of cases) {
    const a = players[books[cs.first]?.i], b = players[books[cs.last]?.i];
    cs.from = a ? cap(prefix(a, 2)) : ''; cs.to = b ? cap(prefix(b, 2)) : '';
    cs.range = cs.from === cs.to ? cs.from : `${cs.from} – ${cs.to}`;
  }
  return { books, cases, teams };
}

// Why a book is shelved where it is, in words.
export const shelvedBecause = p => (!p?.tm ? 'ESPN records no team for this player'
  : p.tms === 'seasons' ? 'the team ESPN\'s season lists show most often'
  : p.tms === 'awards' ? 'the team named on the player\'s award records'
  : p.tms === 'last' ? 'the last team ESPN lists for the player'
  : 'the team with the most games on ESPN\'s record');

// Index of the book for a player id.
export const bookIndexOf = (layout, players, id) => layout.books.findIndex(b => players[b.i].i === id);

// ---- Colour ------------------------------------------------------------------------------------------------------

const rgb = hex => { const n = parseInt(String(hex || '#777777').slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const luminance = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
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
export const inkOn = bg => (luminance(bg) > 0.33 ? '#15161a' : '#f6f4ef');

// ---- The hall ----------------------------------------------------------------------------------------------------

export const HALL = { bayW: CASE.width + 2 * CASE.side, perFace: 8, aisle: 2.5, eye: 1.62, front: 6, back: 3.5, ceiling: 5.2 };
HALL.rowT = 2 * CASE.depth + 0.06; // two bookcases back to back
HALL.pitch = HALL.rowT + HALL.aisle;
HALL.rowLen = HALL.perFace * HALL.bayW;

// Lay the bays out in rows. Each row is double-sided; a face holds up to perFace bays and a team never starts on a
// face it can't finish on (unless it needs more than a whole face). Every face reads left to right for someone
// standing in front of it. Returns { bays: [{ x, z, rot, face }], faces: [{ row, side, bays, teams }], rows, W, D }.
export function hallPlan(layout) {
  const faces = [];
  let face = null;
  const open = () => { face = { bays: [], teams: [] }; faces.push(face); };
  for (const t of layout.teams) {
    const need = t.cases;
    if (!face || (face.bays.length + need > HALL.perFace && face.bays.length > 0)) open();
    for (let k = 0; k < need; k++) {
      if (face.bays.length >= HALL.perFace) open();
      face.bays.push(t.first + k);
      if (!face.teams.includes(t)) face.teams.push(t);
    }
  }
  const rows = Math.max(1, Math.ceil(faces.length / 2));
  const bays = [];
  faces.forEach((f, fi) => {
    f.row = Math.floor(fi / 2); f.side = fi % 2 === 0 ? -1 : 1; // -1: faces -x, +1: faces +x
    const xr = (f.row - (rows - 1) / 2) * HALL.pitch;
    f.x = xr + f.side * (CASE.depth / 2 + 0.03);
    f.rot = f.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    f.bays.forEach((b, k) => {
      // A bay's own +x runs toward +z on a -x face and toward -z on a +x face: lay bays out in that direction.
      const slot = f.side < 0 ? HALL.perFace - 1 - k : k;
      bays[b] = { x: f.x, z: -(slot + 0.5) * HALL.bayW, rot: f.rot, face: fi, row: f.row, side: f.side };
    });
  });
  const W = rows * HALL.pitch + HALL.aisle;
  return { bays, faces, rows, W, x0: -W / 2, x1: W / 2, z0: -HALL.rowLen - HALL.back, z1: HALL.front, rowX: r => (r - (rows - 1) / 2) * HALL.pitch };
}
