// Shelving: turns the catalog into bookcases, shelves and books with real dimensions (metres).
// Everything that varies between books is driven by data, except a small height variation for looks:
//   thickness — seasons on record (a long career is a thick book)
//   colour    — decade of the first season (one leather per era)
//   gold bands — MVP awards; gilt stars — Finals MVP awards

export const CASE = { width: 1.9, shelves: 7, shelfGap: 0.42, depth: 0.34, board: 0.035, side: 0.05 };
CASE.height = CASE.shelves * CASE.shelfGap + CASE.board + 0.12;

export const ERAS = [
  { from: 0, to: 1959, name: 'Before 1960', leather: '#2f4630' },
  { from: 1960, to: 1969, name: '1960s', leather: '#6a2620' },
  { from: 1970, to: 1979, name: '1970s', leather: '#7a5426' },
  { from: 1980, to: 1989, name: '1980s', leather: '#22365a' },
  { from: 1990, to: 1999, name: '1990s', leather: '#4b2c46' },
  { from: 2000, to: 2009, name: '2000s', leather: '#1f4a47' },
  { from: 2010, to: 2019, name: '2010s', leather: '#6b3b1c' },
  { from: 2020, to: 9999, name: '2020s', leather: '#33415f' },
];
export const UNKNOWN_ERA = { name: 'Debut not on record', leather: '#4d4237' };

// Seasons are named by the year they end: 1985 -> "1984-85".
export const seasonLabel = y => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
export const span = p => {
  if (!p.y0) return '';
  if (!p.y1) return `${seasonLabel(p.y0)} –`;
  if (p.y0 === p.y1) return seasonLabel(p.y0);
  return `${p.y0 - 1}–${p.a ? 'now' : p.y1m ? `${p.y1}+` : p.y1}`;
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

// Pack players (already sorted by k) into cases. Returns { books, cases, letters }.
export function pack(players) {
  const inner = CASE.width - 0.03;
  const books = []; const cases = [];
  let c = 0, s = 0, x = 0;
  const startCase = () => cases.push({ index: cases.length, first: books.length, last: books.length - 1, shelves: [] });
  startCase();
  players.forEach((p, i) => {
    const size = bookSize(p);
    if (x + size.w > inner) {
      s++; x = 0;
      if (s >= CASE.shelves) { c++; s = 0; startCase(); }
    }
    books.push({ i, c, s, x: -inner / 2 + x + size.w / 2, ...size });
    cases[c].last = books.length - 1;
    x += size.w + 0.0015;
  });
  for (const cs of cases) {
    const a = players[books[cs.first]?.i], b = players[books[cs.last]?.i];
    cs.from = a ? cap(prefix(a, 2)) : ''; cs.to = b ? cap(prefix(b, 2)) : '';
    cs.label = cs.from === cs.to ? cs.from : `${cs.from} – ${cs.to}`;
  }
  // First book of each letter, for the A–Z index.
  const letters = {};
  books.forEach((b, n) => { const L = (players[b.i].k || '?')[0].toUpperCase(); if (/[A-Z]/.test(L) && letters[L] == null) letters[L] = n; });
  return { books, cases, letters };
}

// Index of the book for a player id.
export const bookIndexOf = (layout, players, id) => layout.books.findIndex(b => players[b.i].i === id);
