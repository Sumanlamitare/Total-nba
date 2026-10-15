// Shelving: turns the catalog into bookcases, shelves and books with real dimensions (metres).
// Everything that varies between books is driven by data, except a small height variation for looks:
//   thickness — seasons on record (a long career is a thick book)
//   colour    — decade of the first season (one leather per era)
//   gold bands — MVP awards; gilt stars — Finals MVP awards

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
export const NO_TEAM = { id: null, abbr: '—', name: 'Team not on record', short: 'Unrecorded', color: '#4d4237', alt: '#c49a52' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Shelve by franchise: each team gets its own bookcase(s), A to Z by surname inside, the books spread evenly over
// the shelves (a brass bookend closes each shelf). Teams run alphabetically; players with no team on ESPN's
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
