// Beat the Dynasty: player-era ratings and the dynasty ladder, all computed from ESPN's real season statistics.
//
// A "player-era" is everything a player did for one franchise in one decade (seasons are named by the year they end,
// so 1995-96 = 1996 belongs to the 1990s). Its overall rating comes from Hollinger's Game Score per game over that
// stretch, with playoff games counting double, mapped onto 60-99, plus a reputation bonus for the awards and rings he
// won there. A dynasty's starting five is the real championship five, each rated on that season and its title run, with
// the reputation he had built by then.

export const DECADES = [1980, 1990, 2000, 2010, 2020];
export const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const MIN_ERA_GAMES = 25;

// The ladder. Seasons by the year they end. The ingest orders the first six by their starters' ratings; the '96 Bulls
// and the '17 Warriors always close it. `five` is the championship starting five, PG to C (the
// lineup is history; every rating still comes from that player's stats for that team that season). ESPN has no season
// statistics for some 1980s greats (Larry Bird, Dennis Johnson), so the '86 Celtics can't be rated and aren't here.
export const LADDER = [
  { key: 'det04', abbr: 'DET', season: 2004, label: "'04 Pistons", five: ['Chauncey Billups', 'Richard Hamilton', 'Tayshaun Prince', 'Rasheed Wallace', 'Ben Wallace'] },
  { key: 'sa14', abbr: 'SA', season: 2014, label: "'14 Spurs", five: ['Tony Parker', 'Danny Green', 'Kawhi Leonard', 'Tim Duncan', 'Tiago Splitter'] },
  { key: 'bos08', abbr: 'BOS', season: 2008, label: "'08 Celtics", five: ['Rajon Rondo', 'Ray Allen', 'Paul Pierce', 'Kevin Garnett', 'Kendrick Perkins'] },
  { key: 'lal87', abbr: 'LAL', season: 1987, label: "'87 Lakers", five: ['Magic Johnson', 'Byron Scott', 'James Worthy', 'A.C. Green', 'Kareem Abdul-Jabbar'] },
  { key: 'lal01', abbr: 'LAL', season: 2001, label: "'01 Lakers", five: ['Ron Harper', 'Kobe Bryant', 'Rick Fox', 'Horace Grant', "Shaquille O'Neal"] },
  { key: 'mia13', abbr: 'MIA', season: 2013, label: "'13 Heat", five: ['Mario Chalmers', 'Dwyane Wade', 'LeBron James', 'Udonis Haslem', 'Chris Bosh'] },
  { key: 'chi96', abbr: 'CHI', season: 1996, label: "'96 Bulls", five: ['Ron Harper', 'Michael Jordan', 'Scottie Pippen', 'Dennis Rodman', 'Luc Longley'] },
  { key: 'gs17', abbr: 'GS', season: 2017, label: "'17 Warriors", boss: true, five: ['Stephen Curry', 'Klay Thompson', 'Kevin Durant', 'Draymond Green', 'Zaza Pachulia'] },
];

export const decadeOf = season => Math.floor((season - 1) / 10) * 10;

// Totals for one stat row (a team stint in one season). Totals come from ESPN's totals table, or averages × games.
const FIELDS = { pts: ['points', 'avgPoints'], reb: ['totalRebounds', 'avgRebounds'], ast: ['assists', 'avgAssists'], stl: ['steals', 'avgSteals'], blk: ['blocks', 'avgBlocks'],
  tov: ['turnovers', 'avgTurnovers'], pf: ['fouls', 'avgFouls'], fgm: ['fieldGoalsMade', 'avgFieldGoalsMade'], fga: ['fieldGoalsAttempted', 'avgFieldGoalsAttempted'],
  ftm: ['freeThrowsMade', 'avgFreeThrowsMade'], fta: ['freeThrowsAttempted', 'avgFreeThrowsAttempted'], tpm: ['threePointFieldGoalsMade', 'avgThreePointFieldGoalsMade'],
  tpa: ['threePointFieldGoalsAttempted', 'avgThreePointFieldGoalsAttempted'], oreb: ['offensiveRebounds', 'avgOffensiveRebounds'], dreb: ['defensiveRebounds', 'avgDefensiveRebounds'] };
export function totals(row) {
  const gp = row.avg?.gamesPlayed || 0;
  const out = { gp, min: (row.avg?.avgMinutes ?? 0) * gp };
  for (const [k, [t, a]] of Object.entries(FIELDS)) {
    const v = row.tot?.[t] ?? (row.avg?.[a] != null ? row.avg[a] * gp : null);
    out[k] = v;
  }
  return out;
}

export function sum(list) {
  const out = { gp: 0, min: 0 };
  for (const k of Object.keys(FIELDS)) out[k] = 0;
  const seen = Object.fromEntries(Object.keys(FIELDS).map(k => [k, false]));
  for (const t of list) {
    out.gp += t.gp; out.min += t.min;
    for (const k of Object.keys(FIELDS)) if (t[k] != null) { out[k] += t[k]; seen[k] = true; }
  }
  for (const k of Object.keys(FIELDS)) if (!seen[k]) out[k] = null;
  return out;
}

// Game Score per game (Hollinger). Without the offensive/defensive split, rebounds count 0.4 each.
export function gameScore(t) {
  if (!t.gp) return 0;
  const z = v => v ?? 0;
  const reb = t.oreb != null && t.dreb != null ? 0.7 * t.oreb + 0.3 * t.dreb : 0.4 * z(t.reb);
  const g = z(t.pts) + 0.4 * z(t.fgm) - 0.7 * z(t.fga) - 0.4 * (z(t.fta) - z(t.ftm)) + reb + z(t.stl) + 0.7 * z(t.ast) + 0.7 * z(t.blk) - 0.4 * z(t.pf) - z(t.tov);
  return g / t.gp;
}

// 60-99. Game Score 25 a game (an MVP season) is about 97; 8 (a rotation player) about 70.
export const ratingOf = gmsc => Math.max(60, Math.min(99, Math.round(58 + gmsc * 1.56)));

// Where a player plays, as a number from 1 (point guard) to 5 (center). ESPN's listed position is often vague or
// missing for older players (Magic Johnson is listed "F", Kareem Abdul-Jabbar has none), so it is blended with what
// the numbers say: assists pull a player toward the ball, rebounds and blocks toward the rim.
const LISTED = { PG: 1, G: 1.5, SG: 2, 'G-F': 2.5, 'F-G': 2.5, SF: 3, F: 3.5, PF: 4, 'F-C': 4.5, 'C-F': 4.5, C: 5 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function positionOf(pos, line) {
  const byStats = clamp(3 + ((line.rpg ?? 5) - 5) * 0.35 + (line.bpg ?? 0) * 0.5 - ((line.apg ?? 3) - 3) * 0.4, 1, 5);
  const listed = LISTED[String(pos || '').toUpperCase()];
  const x = listed == null ? byStats : 0.6 * listed + 0.4 * byStats;
  return (line.apg ?? 0) >= 8 ? Math.min(x, 1.5) : x; // an elite passer runs the point
}
// The two positions nearest that number: every player can play his own spot and the one beside it.
export const SLOTS_BY_POS = x => SLOTS.map((s, k) => [s, Math.abs(x - (k + 1))]).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([s]) => s)
  .sort((a, b) => SLOTS.indexOf(a) - SLOTS.indexOf(b));
export const slotsFor = (pos, line) => SLOTS_BY_POS(positionOf(pos, line));

const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

// ---- Reputation ----------------------------------------------------------------------------------------------------
// ESPN's season awards (by ESPN's award names), and what each is worth. A ring is a title won with the team (a
// player who appeared in that title run). Reputation saturates: the first honors matter most.
export const AWARD_KEYS = {
  'MVP': 'mvp', 'Finals MVP': 'fmvp', 'All-NBA 1st Team': 'nba1', 'All-NBA 2nd Team': 'nba2', 'All-NBA 3rd Team': 'nba3',
  'Defensive Player of the Year': 'dpoy', 'All-Defensive 1st Team': 'def1', 'All-Defensive 2nd Team': 'def2',
  'Sixth Man of the Year': 'smoy', 'Rookie of the Year': 'roy', 'Most Improved Player': 'mip',
  'NBA Eastern Conference Finals MVP': 'cfmvp', 'NBA Western Conference Finals MVP': 'cfmvp',
};
export const REP = { mvp: 5, fmvp: 4, nba1: 3, nba2: 2, nba3: 1.25, dpoy: 2.5, def1: 1, def2: 0.5, smoy: 0.75, roy: 0.5, mip: 0.5, cfmvp: 1, ring: 1.5 };
export const REP_MAX = 7;
export const repOf = honors => Object.entries(honors || {}).reduce((s, [k, n]) => s + (REP[k] || 0) * n, 0);
export const repBonus = rep => Math.min(REP_MAX, 2.2 * Math.log1p(rep));

// awards: [{ season, key, id, team }]; post: Map(player id -> playoff rows). Returns Map(player id -> [{ season, key,
// team }]) with rings added: the Finals MVP's team is the champion, and everyone in its playoff rotation gets a ring.
export function honorIndex(awards, post) {
  const out = new Map();
  const add = (id, h) => { if (!out.has(id)) out.set(id, []); out.get(id).push(h); };
  const champion = new Map(awards.filter(a => a.key === 'fmvp' && a.team).map(a => [a.season, String(a.team)]));
  for (const a of awards) if (a.key && a.key !== 'ring') add(String(a.id), { season: a.season, key: a.key, team: a.team ? String(a.team) : null });
  for (const [pid, rows] of post || []) {
    for (const r of rows || []) {
      if (!r.combined && champion.get(r.season) === String(r.teamId) && (r.avg?.gamesPlayed || 0) >= 1) add(pid, { season: r.season, key: 'ring', team: String(r.teamId) });
    }
  }
  return out;
}
export const countHonors = list => list.reduce((m, h) => { m[h.key] = (m[h.key] || 0) + 1; return m; }, {});

// The compact card the client gets for one player-era (or one dynasty season). `t` is the regular season, `post` the
// playoffs over the same stretch, `honors` the counts that make his reputation.
export function card(p, t, { post = null, honors = {}, ...extra } = {}) {
  const per = k => (t[k] == null || !t.gp ? null : t[k] / t.gp);
  const line = { ppg: per('pts'), rpg: per('reb'), apg: per('ast'), spg: per('stl'), bpg: per('blk'), tpm: per('tpm'),
    mpg: t.gp ? t.min / t.gp : null,
    ftp: t.fta ? (100 * t.ftm) / t.fta : null,
    ts: t.pts != null && t.fga != null && t.fta != null && t.fga + t.fta > 0 ? (100 * t.pts) / (2 * (t.fga + 0.44 * t.fta)) : null };
  const x = positionOf(p.p, line);
  const gR = gameScore(t);
  const pgp = post?.gp || 0;
  const gP = pgp ? gameScore(post) : null;
  const perf = (gR * t.gp + (gP ?? 0) * 2 * pgp) / (t.gp + 2 * pgp); // a playoff game counts double
  const rep = repOf(honors);
  const ovr = Math.max(60, Math.min(99, Math.round(58 + perf * 1.56 + repBonus(rep))));
  const h = Object.keys(honors).length ? honors : undefined;
  return { i: p._id, n: p.n, p: p.p || '', x: r1(x), slots: SLOTS_BY_POS(x), gp: t.gp, ovr,
    reg: ratingOf(gR), po: pgp >= 5 ? ratingOf(gP) : null, pgp, rep: r1(repBonus(rep)), h,
    ppg: r1(line.ppg), rpg: r1(line.rpg), apg: r1(line.apg), spg: r1(line.spg), bpg: r1(line.bpg), tpm: r1(line.tpm), mpg: r1(line.mpg), ftp: r1(line.ftp), ts: r1(line.ts), ...extra };
}

// rowsByPlayer / postByPlayer: Map(player id -> parseStats rows), each row with teamId. honors: from honorIndex.
export function buildEras(players, rowsByPlayer, franchiseIds, { postByPlayer = new Map(), honors = new Map() } = {}) {
  const groups = new Map(); // `${team}-${decade}` -> Map(player id -> { seasons, list, post })
  const place = (pid, r, kind) => {
    if (r.combined || !r.season || !r.teamId || !franchiseIds.has(String(r.teamId))) return;
    const dec = decadeOf(r.season); if (!DECADES.includes(dec)) return;
    const key = `${r.teamId}-${dec}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const g = groups.get(key);
    if (!g.has(pid)) g.set(pid, { seasons: new Set(), list: [], post: [] });
    if (kind === 'post') g.get(pid).post.push(totals(r));
    else { g.get(pid).list.push(totals(r)); g.get(pid).seasons.add(r.season); }
  };
  for (const [pid, rows] of rowsByPlayer) for (const r of rows || []) place(pid, r, 'reg');
  for (const [pid, rows] of postByPlayer) for (const r of rows || []) place(pid, r, 'post');
  const eras = [];
  for (const [key, g] of groups) {
    const [team, decade] = key.split('-');
    const list = [];
    for (const [pid, { list: ts, seasons, post }] of g) {
      if (!ts.length) continue;
      const t = sum(ts); const p = players.get(pid);
      if (!p || t.gp < MIN_ERA_GAMES) continue;
      const ys = [...seasons].sort();
      const mine = (honors.get(pid) || []).filter(h => h.team === team && decadeOf(h.season) === +decade);
      list.push(card(p, t, { post: post.length ? sum(post) : null, honors: countHonors(mine), from: ys[0], to: ys[ys.length - 1] }));
    }
    list.sort((a, b) => b.ovr - a.ovr || b.gp - a.gp);
    if (list.length) eras.push({ _id: key, team, decade: +decade, players: list });
  }
  return eras;
}

const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const seasonFor = (rows, entry, teamId) => (rows || []).filter(r => !r.combined && r.season === entry.season && String(r.teamId) === String(teamId));

// A dynasty's starting five, each rated on that season and its playoffs with that team. A name ESPN doesn't have (or who didn't play
// for the team that season) is replaced by the most-used remaining player; `missing` lists them for the ingest log.
// Each starter carries the reputation he had built by the end of that season, with any team (his legacy so far).
export function buildDynasty(entry, teamId, players, rowsByPlayer, { postByPlayer = new Map(), honors = new Map() } = {}) {
  const cands = [];
  for (const [pid, rows] of rowsByPlayer) {
    const mine = seasonFor(rows, entry, teamId);
    if (!mine.length) continue;
    const t = sum(mine.map(totals)); const p = players.get(pid);
    const post = seasonFor(postByPlayer.get(pid), entry, teamId);
    const legacy = (honors.get(pid) || []).filter(h => h.season <= entry.season);
    if (p && t.gp) cands.push(card(p, t, { post: post.length ? sum(post.map(totals)) : null, honors: countHonors(legacy) }));
  }
  cands.sort((a, b) => b.mpg * b.gp - a.mpg * a.gp);
  const named = (entry.five || []).map(name => cands.find(c => norm(c.n) === norm(name)) || null);
  const missing = (entry.five || []).filter((name, k) => !named[k]);
  const rest = cands.filter(c => c.gp >= 20 && !named.includes(c));
  const five = named.some(Boolean) ? named.map(c => c || rest.shift()) : assignSlots(cands.filter(c => c.gp >= 20).slice(0, 5));
  if (!five || five.length < 5 || five.some(x => !x)) return null;
  const { five: _names, ...rest2 } = entry;
  return { ...rest2, team: String(teamId), five: five.some(x => x.slot) ? five : five.map((c, k) => ({ slot: SLOTS[k], ...c })), missing };
}

// Put five players into PG..C with the least total distance from where each plays (all 120 orders are tried).
export function assignSlots(five) {
  if (five.length < 5) return null;
  let best = null, cost = Infinity;
  const perm = (left, order) => {
    if (!left.length) {
      const c = order.reduce((s, pl, k) => s + Math.abs((pl.x ?? 3) - (k + 1)), 0);
      if (c < cost) { cost = c; best = order; }
      return;
    }
    left.forEach((pl, k) => perm([...left.slice(0, k), ...left.slice(k + 1)], [...order, pl]));
  };
  perm(five.slice(0, 5), []);
  return best.map((pl, k) => ({ slot: SLOTS[k], ...pl }));
}

// The first six rungs, weakest first; the last two stay where they are.
export function orderLadder(dynasties) {
  const avg = d => d.five.reduce((s, p) => s + p.ovr, 0) / 5;
  const fixed = [...dynasties.filter(d => d.key === 'chi96'), ...dynasties.filter(d => d.boss)];
  return [...dynasties.filter(d => !fixed.includes(d)).sort((a, b) => avg(a) - avg(b)), ...fixed];
}
