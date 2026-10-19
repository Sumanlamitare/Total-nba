// Beat the Dynasty: player-era ratings and the dynasty ladder, all computed from ESPN's real season statistics.
//
// A "player-era" is everything a player did for one franchise in one decade (seasons are named by the year they end,
// so 1995-96 = 1996 belongs to the 1990s). Its overall rating comes from Hollinger's Game Score per game over that
// stretch, mapped onto 60-99. A dynasty's starting five is the five players with the most minutes for that team that
// season, rated on that season alone.

export const DECADES = [1980, 1990, 2000, 2010, 2020];
export const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const MIN_ERA_GAMES = 25;

// The ladder, weakest first. Seasons by the year they end.
export const LADDER = [
  { key: 'det04', abbr: 'DET', season: 2004, label: "'04 Pistons" },
  { key: 'sa14', abbr: 'SA', season: 2014, label: "'14 Spurs" },
  { key: 'bos86', abbr: 'BOS', season: 1986, label: "'86 Celtics" },
  { key: 'lal87', abbr: 'LAL', season: 1987, label: "'87 Lakers" },
  { key: 'lal01', abbr: 'LAL', season: 2001, label: "'01 Lakers" },
  { key: 'mia13', abbr: 'MIA', season: 2013, label: "'13 Heat" },
  { key: 'chi96', abbr: 'CHI', season: 1996, label: "'96 Bulls" },
  { key: 'gs17', abbr: 'GS', season: 2017, label: "'17 Warriors", boss: true },
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

// Which slots a player can fill: his listed position, or (when ESPN lists none) what his numbers say.
export function slotsFor(pos, line) {
  const p = String(pos || '').toUpperCase();
  const map = { PG: ['PG'], SG: ['SG'], G: ['PG', 'SG'], SF: ['SF'], PF: ['PF'], F: ['SF', 'PF'], C: ['C'], 'G-F': ['SG', 'SF'], 'F-G': ['SG', 'SF'], 'F-C': ['PF', 'C'], 'C-F': ['PF', 'C'] };
  if (map[p]) return map[p];
  if (line.apg >= 5) return ['PG', 'SG'];
  if (line.bpg >= 1.5 || line.rpg >= 9) return ['PF', 'C'];
  if (line.rpg >= 6) return ['SF', 'PF'];
  return ['SG', 'SF'];
}

const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
// The compact card the client gets for one player-era (or one dynasty season).
export function card(p, t, extra = {}) {
  const per = k => (t[k] == null || !t.gp ? null : t[k] / t.gp);
  const line = { ppg: per('pts'), rpg: per('reb'), apg: per('ast'), spg: per('stl'), bpg: per('blk'), tpm: per('tpm'),
    mpg: t.gp ? t.min / t.gp : null,
    ftp: t.fta ? (100 * t.ftm) / t.fta : null,
    ts: t.pts != null && t.fga != null && t.fta != null && t.fga + t.fta > 0 ? (100 * t.pts) / (2 * (t.fga + 0.44 * t.fta)) : null };
  return { i: p._id, n: p.n, p: p.p || '', slots: slotsFor(p.p, line), gp: t.gp, ovr: ratingOf(gameScore(t)),
    ppg: r1(line.ppg), rpg: r1(line.rpg), apg: r1(line.apg), spg: r1(line.spg), bpg: r1(line.bpg), tpm: r1(line.tpm), mpg: r1(line.mpg), ftp: r1(line.ftp), ts: r1(line.ts), ...extra };
}

// rowsByPlayer: Map(player id -> parseStats rows), each row with teamId. franchise(teamId) -> current franchise id.
export function buildEras(players, rowsByPlayer, franchiseIds) {
  const groups = new Map(); // `${team}-${decade}` -> Map(player id -> [totals])
  for (const [pid, rows] of rowsByPlayer) {
    for (const r of rows || []) {
      if (r.combined || !r.season || !r.teamId || !franchiseIds.has(String(r.teamId))) continue;
      const dec = decadeOf(r.season); if (!DECADES.includes(dec)) continue;
      const key = `${r.teamId}-${dec}`;
      if (!groups.has(key)) groups.set(key, new Map());
      const g = groups.get(key);
      if (!g.has(pid)) g.set(pid, { seasons: new Set(), list: [] });
      g.get(pid).list.push(totals(r)); g.get(pid).seasons.add(r.season);
    }
  }
  const eras = [];
  for (const [key, g] of groups) {
    const [team, decade] = key.split('-');
    const list = [];
    for (const [pid, { list: ts, seasons }] of g) {
      const t = sum(ts); const p = players.get(pid);
      if (!p || t.gp < MIN_ERA_GAMES) continue;
      const ys = [...seasons].sort();
      list.push(card(p, t, { from: ys[0], to: ys[ys.length - 1] }));
    }
    list.sort((a, b) => b.ovr - a.ovr || b.gp - a.gp);
    if (list.length) eras.push({ _id: key, team, decade: +decade, players: list });
  }
  return eras;
}

// A dynasty's starting five: the five most-used players that season (20+ games), placed into slots.
export function buildDynasty(entry, teamId, players, rowsByPlayer) {
  const cands = [];
  for (const [pid, rows] of rowsByPlayer) {
    const mine = (rows || []).filter(r => !r.combined && r.season === entry.season && String(r.teamId) === String(teamId));
    if (!mine.length) continue;
    const t = sum(mine.map(totals)); const p = players.get(pid);
    if (p && t.gp >= 20) cands.push(card(p, t));
  }
  cands.sort((a, b) => b.mpg * b.gp - a.mpg * a.gp);
  const five = assignSlots(cands.slice(0, 5));
  return five ? { ...entry, team: String(teamId), five } : null;
}

// Put five players into PG..C, each where he fits if possible (best fits first), else anywhere open.
export function assignSlots(five) {
  if (five.length < 5) return null;
  const out = {}; const left = [...five].sort((a, b) => a.slots.length - b.slots.length);
  for (const pl of left) { const s = pl.slots.find(x => !out[x]); if (s) out[s] = pl; }
  for (const pl of left) if (!Object.values(out).includes(pl)) out[SLOTS.find(x => !out[x])] = pl;
  return SLOTS.map(s => ({ slot: s, ...out[s] }));
}
