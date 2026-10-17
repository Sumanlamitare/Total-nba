// Derived views of a book's ESPN data. Every number here is ESPN's or a sum/ratio of ESPN's numbers.
import { seasonLabel } from './shelves.js';

// One row per season: the combined row where a player was traded mid-season, otherwise the team row.
export function perSeason(stats) {
  if (!stats) return [];
  const m = new Map();
  for (const r of stats.rows) if (!m.has(r.season) || r.combined) m.set(r.season, r);
  return [...m.values()].sort((a, b) => a.season - b.season);
}

export const teamsInSeason = (stats, season) => stats.rows.filter(r => r.season === season && !r.combined).map(r => r.team).filter(Boolean);

// Per-team sums from team rows (never from combined rows).
export function byTeam(stats) {
  if (!stats) return [];
  const m = new Map();
  for (const r of stats.rows) {
    if (r.combined || !r.team) continue;
    const t = m.get(r.team) || { team: r.team, name: r.teamName, games: 0, points: 0, rebounds: 0, assists: 0, seasons: new Set(), first: r.season, last: r.season };
    t.games += r.avg?.gamesPlayed || 0;
    t.points += r.tot?.points || 0;
    t.rebounds += r.tot?.totalRebounds || 0;
    t.assists += r.tot?.assists || 0;
    t.seasons.add(r.season);
    t.first = Math.min(t.first, r.season); t.last = Math.max(t.last, r.season);
    m.set(r.team, t);
  }
  return [...m.values()].map(t => ({ ...t, seasons: t.seasons.size })).sort((a, b) => a.first - b.first);
}

// Best per-game season for a stat, among seasons with at least `min` games.
export function best(stats, key, min = 20) {
  let top = null;
  for (const r of perSeason(stats)) {
    const v = r.avg?.[key], gp = r.avg?.gamesPlayed || 0;
    if (v == null || gp < min) continue;
    if (!top || v > top.value) top = { value: v, season: r.season, label: r.label, games: gp, team: r.team || teamsInSeason(stats, r.season).join('/') };
  }
  return top;
}

export const LEADER_PHRASE = { pts: 'points', reb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks' };

export const firstSeasonOfCareer = book => (book.debut ? book.debut + 1 : null);

// Is ESPN's season record shorter than the career? (e.g. Wilt Chamberlain: 1959 debut, record from 1968-69)
export function coverageGap(book) {
  const start = firstSeasonOfCareer(book);
  const first = book.regular?.first;
  if (!start || !first || first <= start) return null;
  return { from: start, recordFrom: first, missing: first - start, label: seasonLabel(start), recordLabel: seasonLabel(first) };
}

// ---- Derived measures (all arithmetic on the record; nothing estimated) -------------------------------------------

// True shooting: points per two shooting possessions, PTS / (2 × (FGA + 0.44 × FTA)), from totals.
export function trueShooting(tot) {
  const p = tot?.points, fga = tot?.fieldGoalsAttempted, fta = tot?.freeThrowsAttempted;
  if (p == null || fga == null || fta == null) return null;
  const d = 2 * (fga + 0.44 * fta);
  return d > 0 ? (100 * p) / d : null;
}

// Age during a season, counted on 1 February of the season's second year (the league's own convention).
export function ageInSeason(born, season) {
  const m = String(born || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const by = +m[1], bm = +m[2], bd = +m[3];
  return season - by - (bm > 2 || (bm === 2 && bd > 1) ? 1 : 0);
}

// The highest-scoring stretch of up to five consecutive seasons on record (points per game over the stretch).
export function prime(stats, size = 5) {
  const rows = perSeason(stats).filter(r => r.avg?.gamesPlayed && r.tot?.points != null);
  if (rows.length < size + 1) return null;
  let top = null;
  for (let i = 0; i + size <= rows.length; i++) {
    const w = rows.slice(i, i + size);
    if (w[size - 1].season - w[0].season !== size - 1) continue; // consecutive seasons only
    const gp = w.reduce((a, r) => a + r.avg.gamesPlayed, 0);
    const sum = k => (w.every(r => r.tot?.[k] != null) ? w.reduce((a, r) => a + r.tot[k], 0) : null);
    const pts = sum('points');
    if (!top || pts / gp > top.ppg) {
      const reb = sum('totalRebounds'), ast = sum('assists');
      top = { from: w[0], to: w[size - 1], seasons: size, gp, ppg: pts / gp, rpg: reb == null ? null : reb / gp, apg: ast == null ? null : ast / gp,
        ts: trueShooting({ points: pts, fieldGoalsAttempted: sum('fieldGoalsAttempted'), freeThrowsAttempted: sum('freeThrowsAttempted') }) };
    }
  }
  return top;
}

// Season clubs, from per-season averages (seasons of 20+ games). 50-40-90 also needs the league's minimums for
// the shooting titles: 300 field goals, 82 threes and 125 free throws made.
export const CLUBS = [
  { key: 'p25', label: '25-point seasons', test: a => a.avgPoints >= 25 },
  { key: 'p20r10', label: '20-and-10 seasons', note: 'points and rebounds per game', test: a => a.avgPoints >= 20 && a.avgRebounds >= 10 },
  { key: 'p20a5r5', label: '20-5-5 seasons', note: 'points, rebounds and assists per game', test: a => a.avgPoints >= 20 && a.avgRebounds >= 5 && a.avgAssists >= 5 },
  { key: 'p10a10', label: '10-and-10 assist seasons', note: 'points and assists per game', test: a => a.avgPoints >= 10 && a.avgAssists >= 10 },
  { key: 's504090', label: '50-40-90 seasons', note: 'shooting, with the league minimums', test: (a, t) => a.fieldGoalPct >= 50 && a.threePointFieldGoalPct >= 40 && a.freeThrowPct >= 90 && (t?.fieldGoalsMade ?? 0) >= 300 && (t?.threePointFieldGoalsMade ?? 0) >= 82 && (t?.freeThrowsMade ?? 0) >= 125 },
];
export function clubs(stats) {
  const rows = perSeason(stats).filter(r => (r.avg?.gamesPlayed || 0) >= 20);
  return CLUBS.map(c => ({ ...c, seasons: rows.filter(r => { try { return c.test(r.avg, r.tot); } catch { return false; } }).map(r => r.season) })).filter(c => c.seasons.length);
}

// Round-number milestones and the season each was passed in.
const MILESTONES = [
  ['points', 'points', [10000, 20000, 30000, 40000]], ['totalRebounds', 'rebounds', [5000, 10000, 15000, 20000]],
  ['assists', 'assists', [5000, 10000, 15000]], ['steals', 'steals', [1000, 2000]], ['blocks', 'blocks', [1000, 2000, 3000]],
  ['threePointFieldGoalsMade', 'three-pointers', [1000, 2000, 3000, 4000]],
];
export function milestones(stats) {
  const out = [];
  for (const [k, word, marks] of MILESTONES) {
    let run = 0;
    for (const r of perSeason(stats)) {
      const v = r.tot?.[k]; if (v == null) { run = null; break; }
      const before = run; run += v;
      for (const m of marks) if (before < m && run >= m) out.push({ key: `${k}-${m}`, value: m, word, season: r.season, label: r.label });
    }
  }
  return out.sort((a, b) => a.season - b.season || b.value - a.value);
}

// Regular season against the playoffs, per game (and true shooting), when there are 10+ playoff games.
export function playoffShift(book) {
  const r = book.regular?.career, p = book.playoffs?.career;
  if (!r?.avg || !p?.avg || (p.avg.gamesPlayed || 0) < 10) return null;
  const rows = [['Points', r.avg.avgPoints, p.avg.avgPoints], ['Rebounds', r.avg.avgRebounds, p.avg.avgRebounds], ['Assists', r.avg.avgAssists, p.avg.avgAssists],
    ['Minutes', r.avg.avgMinutes, p.avg.avgMinutes], ['True shooting %', trueShooting(r.tot), trueShooting(p.tot)]]
    .filter(([, a, b]) => a != null && b != null).map(([label, reg, post]) => ({ label, reg, post, diff: post - reg }));
  return rows.length ? { games: p.avg.gamesPlayed, runs: book.playoffs.seasons, rows } : null;
}
