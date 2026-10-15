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
