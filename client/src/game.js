// Beat the Dynasty: the rules. Pure functions only (no DOM), so the unit tests can run them.
//   draft  — five spins of a franchise and a decade; each deals four of that era's players, pick one for an open spot
//   rate   — team rating = average overall + fit adjustments + matchup wins
//   series — best of seven; the rating gap sets each game's odds, the dynasty has home court in 1, 2, 5 and 7
export const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const SLOT_NAMES = { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Center' };
export const DYNASTY_HOME = [true, true, false, false, true, false, true];
export const MATCHUP_BOOST = 0.5;

// ---- Random numbers -----------------------------------------------------------------------------------------------
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// mulberry32: small, fast and the same in every browser, so a daily seed gives everyone the same spins.
export function rng(seed) {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, list) => list[Math.floor(r() * list.length)];
// Roughly normal noise (sum of uniforms), mean 0, sd 1.
export const gauss = r => (r() + r() + r() + r() + r() + r() - 3) * Math.SQRT2;

export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);

// ---- Draft --------------------------------------------------------------------------------------------------------
export const decadeLabel = d => `'${String(d % 100).padStart(2, '0')}s`;
export const openSlots = lineup => SLOTS.filter(s => !lineup[s]);
export const fits = (player, lineup) => player.slots.filter(s => !lineup[s]);
const taken = lineup => new Set(Object.values(lineup).filter(Boolean).map(x => x.i));
// The players of an era that can still be drafted: an open position they play, and not already on the team.
export const eligible = (era, lineup) => { const t = taken(lineup); return era.players.filter(p => !t.has(p.i) && fits(p, lineup).length); };

// Spin: a franchise-decade with at least one draftable player. `r` is the draft's random stream, so the same seed and
// the same picks give the same spins.
export function spin(eras, lineup, r) {
  const ok = eras.filter(e => eligible(e, lineup).length);
  return ok.length ? pick(r, ok) : null;
}

// The hand a spin deals: four players from the era who fit an open spot, drawn at random with its regulars (more
// minutes a game) and its best players likelier than the deep bench. Best first.
export const HAND = 4;
export function deal(era, lineup, r, n = HAND) {
  const pool = eligible(era, lineup);
  const out = [];
  while (out.length < n && pool.length) {
    const w = pool.map(p => (p.mpg || 10) ** 2 * (p.ovr - 55) ** 2);
    let x = r() * w.reduce((s, v) => s + v, 0), k = 0;
    while (k < pool.length - 1 && (x -= w[k]) > 0) k++;
    out.push(pool.splice(k, 1)[0]);
  }
  return out.sort((a, b) => b.ovr - a.ovr);
}

// ---- Rating -------------------------------------------------------------------------------------------------------
export const isHandler = p => (p.apg ?? 0) >= 5;
export const isShooter = p => (p.tpm != null && p.tpm > 0 ? p.tpm >= 1.2 : (p.ftp ?? 0) >= 82);
export const isProtector = p => (p.bpg != null && p.bpg > 0 ? p.bpg >= 1.5 : (p.rpg ?? 0) >= 11);
export const isCenter = p => /^C/.test(p.p || '') || (p.slots?.length === 1 && p.slots[0] === 'C');

// Fit adjustments for five players: [{ label, value }].
export function fitOf(five) {
  const out = [];
  const handler = five.some(isHandler), shooters = five.filter(isShooter).length, protector = five.some(isProtector);
  if (handler && shooters >= 2 && protector) out.push({ label: 'Ball-handler, shooters and a rim protector', value: 2 });
  const centers = five.filter(isCenter).length;
  const noPG = !five.some(p => (p.apg ?? 0) >= 4);
  if (centers >= 3) out.push({ label: `${centers} centers on the floor`, value: -3 });
  else if (noPG) out.push({ label: 'Nobody to run the offense', value: -3 });
  const decades = new Map();
  for (const p of five) if (p.decade != null) decades.set(p.decade, (decades.get(p.decade) || 0) + 1);
  const [dec, n] = [...decades].sort((a, b) => b[1] - a[1])[0] || [];
  if (n >= 3) out.push({ label: `Same-era chemistry (${n} from the ${decadeLabel(dec)})`, value: 1 });
  return out;
}
// Pedigree: what a lineup has won and how well it knows itself. Rings in the lineup (titles won in that stretch, or by
// that season for a dynasty), and players who were teammates: a real championship five played together all year.
export const RING_BONUS = 0.5, TOGETHER_BONUS = 2, TEAMMATES_BONUS = 1;
export function pedigreeOf(five, { together = false } = {}) {
  const out = [];
  const rings = five.filter(p => p.h?.ring).length;
  if (rings) out.push({ label: `${rings} champion${rings > 1 ? 's' : ''} in the lineup`, value: rings * RING_BONUS });
  if (together) out.push({ label: 'Played together: a real championship five', value: TOGETHER_BONUS });
  else {
    const byEra = new Map();
    for (const p of five) { const k = `${p.team}-${p.decade}`; byEra.set(k, [...(byEra.get(k) || []), p]); }
    const mates = [...byEra.values()].filter(g => g.length > 1);
    if (mates.length) out.push({ label: `Teammates: ${mates.map(g => g.map(p => surname(p.n)).join(' & ')).join(', ')}`, value: Math.min(2, mates.reduce((n, g) => n + g.length - 1, 0)) * TEAMMATES_BONUS });
  }
  return out;
}

const avg = list => list.reduce((s, x) => s + x, 0) / list.length;
const round1 = v => Math.round(v * 10) / 10;

// lineups are { PG: player, ... }. Returns both sides' breakdowns and the matchups.
// `theirs` is a dynasty's lineup: its five played together.
export function rateSeries(mine, theirs) {
  const matchups = SLOTS.map(s => {
    const a = mine[s], b = theirs[s];
    return { slot: s, mine: a, theirs: b, winner: a.ovr > b.ovr ? 'mine' : b.ovr > a.ovr ? 'theirs' : null };
  });
  const side = (lineup, key) => {
    const five = SLOTS.map(s => lineup[s]);
    const base = avg(five.map(p => p.ovr));
    const fit = [...fitOf(five), ...pedigreeOf(five, { together: key === 'theirs' })];
    const won = matchups.filter(m => m.winner === key).length;
    const total = base + fit.reduce((s, f) => s + f.value, 0) + won * MATCHUP_BOOST;
    return { base: round1(base), fit, won, boost: won * MATCHUP_BOOST, rating: round1(total) };
  };
  return { mine: side(mine, 'mine'), theirs: side(theirs, 'theirs'), matchups };
}

// ---- Simulation ---------------------------------------------------------------------------------------------------
// Even = 50%, +5 = ~65%, -10 = ~22%.
export const winProb = gap => 1 / (1 + Math.exp(-gap / 8));
export function gameProb(gap, game) {
  let p = winProb(gap) + (DYNASTY_HOME[game] ? -0.03 : 0.03);
  if (game === 6) p = 0.5 + (p - 0.5) * 0.7; // Game 7: anything can happen
  return Math.max(0.02, Math.min(0.98, p));
}

// The chance of winning the series: every way the seven games can go.
export function seriesOdds(gap) {
  const memo = new Map();
  const go = (w, l) => {
    if (w === 4) return 1; if (l === 4) return 0;
    const k = `${w}-${l}`; if (memo.has(k)) return memo.get(k);
    const p = gameProb(gap, w + l);
    const v = p * go(w + 1, l) + (1 - p) * go(w, l + 1);
    memo.set(k, v); return v;
  };
  return go(0, 0);
}

// One team's box score for a game in which it scored `total`: starters around their averages, the bench the rest.
function box(five, total, r) {
  const rows = five.map(p => {
    const base = Math.max(2, p.ppg ?? 8);
    return { i: p.i, n: p.n, slot: p.slot, pts: Math.max(0, Math.round(base * (1 + 0.28 * gauss(r)))),
      reb: Math.max(0, Math.round((p.rpg ?? 3) * (1 + 0.3 * gauss(r)))), ast: Math.max(0, Math.round((p.apg ?? 2) * (1 + 0.35 * gauss(r)))) };
  });
  let starters = rows.reduce((s, x) => s + x.pts, 0);
  const minBench = Math.round(total * 0.12);
  if (starters > total - minBench) {
    const k = (total - minBench) / starters;
    for (const x of rows) x.pts = Math.round(x.pts * k);
    starters = rows.reduce((s, x) => s + x.pts, 0);
  }
  return { rows, bench: total - starters, total };
}

// Simulate the whole series up front (the screen reveals it a game at a time). `names` = { mine, theirs }.
export function simulate({ mine, theirs, gap, names, seed }) {
  const r = rng(seed);
  const games = [];
  let w = 0, l = 0;
  for (let g = 0; w < 4 && l < 4; g++) {
    const p = gameProb(gap, g);
    const won = r() < p;
    const close = g === 6 ? 0.55 : 0.35;
    const margin = r() < close ? 1 + Math.floor(r() * 5) : 4 + Math.floor(Math.abs(gauss(r)) * 8);
    const ot = margin <= 3 && r() < 0.18;
    const win = Math.round(100 + gauss(r) * 9 + (ot ? 8 : 0));
    const lose = win - margin;
    const mineBox = box(SLOTS.map(s => ({ ...mine[s], slot: s })), won ? win : lose, r);
    const theirBox = box(SLOTS.map(s => ({ ...theirs[s], slot: s })), won ? lose : win, r);
    if (won) w++; else l++;
    const game = { n: g + 1, home: DYNASTY_HOME[g] ? 'theirs' : 'mine', p, won, ot, mine: mineBox, theirs: theirBox, w, l };
    game.headline = headline(game, names, r);
    games.push(game);
  }
  return { games, won: w === 4, w, l };
}

export const topScorer = b => b.rows.reduce((a, x) => (x.pts > a.pts ? x : a), b.rows[0]);
// The name a headline uses: the surname, skipping suffixes (Wendell Carter Jr. -> Carter).
export const surname = n => { const w = String(n).split(' '); while (w.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w[w.length - 1])) w.pop(); return w[w.length - 1]; };

export function headline(g, names, r = Math.random) {
  const winner = g.won ? 'mine' : 'theirs', loser = g.won ? 'theirs' : 'mine';
  // A dynasty is "the Bulls" mid-sentence and "The Bulls" at the start; your team is just its name.
  const lead = k => (k === 'theirs' ? `The ${names.theirs}` : names.mine);
  const mid = k => (k === 'theirs' ? `the ${names.theirs}` : names.mine);
  const W = lead(winner), w = mid(winner), L = mid(loser);
  const star = topScorer(g[winner]);
  const s = surname(star.n);
  const margin = g[winner].total - g[loser].total;
  const ww = g.won ? g.w : g.l, ll = g.won ? g.l : g.w;
  const score = `${g[winner].total}-${g[loser].total}`;
  if (ww === 4 && ll === 0) return pick(r, [`Brooms out: ${W} sweep ${L}`, `${s} finishes the sweep for ${w}`]);
  if (ww === 4 && g.n === 7) return pick(r, [`${s} wins Game 7 for ${w}`, `Game 7 goes to ${w}, ${score}`]);
  if (ww === 4) return pick(r, [`${W} close out ${L} in ${g.n}`, `${s} scores ${star.pts} as ${w} take the series in ${g.n}`]);
  if (g.ot) return pick(r, [`${W} survive in overtime behind ${s}`, `Extra time: ${s} lifts ${w} past ${L}`]);
  if (star.pts >= 40) return pick(r, [`${s} drops ${star.pts} on ${L}`, `${star.pts} for ${s} as ${w} ${ww === ll ? 'even the series' : `win Game ${g.n}`}`]);
  if (ww === ll) return pick(r, [`${W} even the series at ${ww}-${ll}`, `${s}'s ${star.pts} squares it at ${ww}-${ll}`]);
  if (ww === 3 && ll <= 2) return pick(r, [`${W} are one win away`, `${s} pushes ${L} to the brink`]);
  if (margin >= 18) return pick(r, [`${W} rout ${L} by ${margin}`, `Blowout: ${w} roll, ${score}`]);
  if (margin <= 3) return pick(r, [`${W} edge ${L} by ${margin}`, `${s} seals a ${margin}-point thriller`]);
  if (ll > ww) return pick(r, [`${W} cut the deficit to ${ll}-${ww}`, `${s} keeps ${w} alive`]);
  return pick(r, [`${s} scores ${star.pts} as ${w} lead ${ww}-${ll}`, `${W} take a ${ww}-${ll} lead`]);
}

// ---- Daily mode ---------------------------------------------------------------------------------------------------
// The same opponent and the same spin stream for everyone on a given (UTC) day.
export function daily(dynasties, day = todayKey()) {
  const r = rng(`daily:${day}`);
  return { day, seed: `daily:${day}`, dynasty: pick(r, dynasties) };
}

// ---- Sharing ------------------------------------------------------------------------------------------------------
export function shareText({ lineup, eraOf, dynasty, series, rating, daily: day }) {
  const head = `🏀 Beat the Dynasty${day ? ` · Daily ${day}` : ''}`;
  const result = `${series.won ? 'BEAT' : 'Lost to'} the ${dynasty.label} ${series.won ? `${series.w}-${series.l}` : `${series.w}-${series.l}`}`;
  const dots = series.games.map(g => (g.won ? '🟧' : '⬛')).join('');
  const rows = SLOTS.map(s => `${s} ${lineup[s].n} (${eraOf(lineup[s])}) ${lineup[s].ovr}`);
  return [head, `${result} ${dots}`, `Team ${rating}`, ...rows].join('\n');
}
