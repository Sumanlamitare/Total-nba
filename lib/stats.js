// Every statistic the app works with: the box-score line (from the provider) and statistics derived from it.
// Detection, records, the explorer, comparisons and the graphics editor all read this one catalog.
import { pct, round } from './util.js';

// The stored line, in this order (pgames keep these as fields).
export const LINE = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm'];

// key, label, short label, kind (count | pct | ratio | flag | derived), group, whether higher is better.
export const STATS = [
  ['pts', 'Points', 'PTS', 'count', 'Scoring'],
  ['reb', 'Rebounds', 'REB', 'count', 'Rebounding'],
  ['ast', 'Assists', 'AST', 'count', 'Playmaking'],
  ['stl', 'Steals', 'STL', 'count', 'Defense'],
  ['blk', 'Blocks', 'BLK', 'count', 'Defense'],
  ['tpm', 'Three-pointers made', '3PM', 'count', 'Shooting'],
  ['tpa', 'Three-point attempts', '3PA', 'count', 'Shooting'],
  ['fgm', 'Field goals made', 'FGM', 'count', 'Shooting'],
  ['fga', 'Field goal attempts', 'FGA', 'count', 'Shooting'],
  ['ftm', 'Free throws made', 'FTM', 'count', 'Shooting'],
  ['fta', 'Free throw attempts', 'FTA', 'count', 'Shooting'],
  ['orb', 'Offensive rebounds', 'OREB', 'count', 'Rebounding'],
  ['drb', 'Defensive rebounds', 'DREB', 'count', 'Rebounding'],
  ['tov', 'Turnovers', 'TOV', 'count', 'Playmaking', false],
  ['pf', 'Personal fouls', 'PF', 'count', 'Other', false],
  ['min', 'Minutes', 'MIN', 'count', 'Other'],
  ['pm', 'Plus/minus', '+/-', 'count', 'Other'],
  ['fg_pct', 'Field goal %', 'FG%', 'pct', 'Shooting'],
  ['tp_pct', 'Three-point %', '3P%', 'pct', 'Shooting'],
  ['ft_pct', 'Free throw %', 'FT%', 'pct', 'Shooting'],
  ['ts_pct', 'True shooting %', 'TS%', 'pct', 'Shooting'],
  ['efg_pct', 'Effective FG %', 'eFG%', 'pct', 'Shooting'],
  ['stocks', 'Steals + blocks', 'STL+BLK', 'derived', 'Defense'],
  ['pra', 'Points + rebounds + assists', 'PRA', 'derived', 'Scoring'],
  ['gmsc', 'Game Score', 'GmSc', 'derived', 'Overall'],
  ['ast_to', 'Assist-to-turnover ratio', 'AST/TO', 'ratio', 'Playmaking'],
].map(([key, label, short, kind, group, higher = true]) => ({ key, label, short, kind, group, higher }));
export const STAT = Object.fromEntries(STATS.map(s => [s.key, s]));

// Minimum attempts for a percentage to mean anything in one game.
export const PCT_MIN = { fg_pct: ['fga', 8], tp_pct: ['tpa', 5], ft_pct: ['fta', 6], ts_pct: ['fga', 10], efg_pct: ['fga', 10] };

// Derived values for one line (percentages null without attempts).
export function derive(l) {
  const tsa = l.fga + 0.44 * l.fta;
  return {
    ...l,
    fg_pct: pct(l.fgm, l.fga), tp_pct: pct(l.tpm, l.tpa), ft_pct: pct(l.ftm, l.fta),
    ts_pct: tsa > 0 ? (100 * l.pts) / (2 * tsa) : null,
    efg_pct: l.fga > 0 ? (100 * (l.fgm + 0.5 * l.tpm)) / l.fga : null,
    stocks: l.stl + l.blk, pra: l.pts + l.reb + l.ast,
    gmsc: gameScore(l),
    ast_to: l.tov > 0 ? l.ast / l.tov : l.ast > 0 ? l.ast : null,
  };
}

// John Hollinger's Game Score.
export const gameScore = l => l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.orb + 0.3 * l.drb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;

// How many of points, rebounds, assists, steals, blocks reach 10 (double-, triple-, quadruple-double).
export const tens = l => ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => l[k] >= 10);

export function fmt(key, v, { sign = true } = {}) {
  if (v == null || Number.isNaN(v)) return '—';
  const s = STAT[key];
  if (s?.kind === 'pct') return `${round(v, 1)}%`;
  if (s?.kind === 'ratio' || key === 'gmsc') return String(round(v, 1));
  if (key === 'pm' && sign) return v > 0 ? `+${v}` : String(v);
  return String(round(v, 1));
}

// "11-21 FG, 4-9 3PT, 6-6 FT"
export const splits = l => `${l.fgm}-${l.fga} FG · ${l.tpm}-${l.tpa} 3PT · ${l.ftm}-${l.fta} FT`;
export const statLine = l => [`${l.pts} PTS`, `${l.reb} REB`, `${l.ast} AST`, l.stl >= 3 && `${l.stl} STL`, l.blk >= 3 && `${l.blk} BLK`].filter(Boolean).join(', ');

// Team statistics as ESPN names them → our keys and labels (whatever the provider has; nothing assumed).
export const TEAM_STATS = {
  'fieldGoalsMade-fieldGoalsAttempted': ['fg', 'Field goals'], fieldGoalPct: ['fg_pct', 'FG%'],
  'threePointFieldGoalsMade-threePointFieldGoalsAttempted': ['tp', 'Three-pointers'], threePointFieldGoalPct: ['tp_pct', '3P%'],
  'freeThrowsMade-freeThrowsAttempted': ['ft', 'Free throws'], freeThrowPct: ['ft_pct', 'FT%'],
  totalRebounds: ['reb', 'Rebounds'], offensiveRebounds: ['orb', 'Offensive rebounds'], defensiveRebounds: ['drb', 'Defensive rebounds'],
  assists: ['ast', 'Assists'], steals: ['stl', 'Steals'], blocks: ['blk', 'Blocks'], turnovers: ['tov', 'Turnovers'],
  teamTurnovers: ['team_tov', 'Team turnovers'], totalTurnovers: ['total_tov', 'Total turnovers'], technicalFouls: ['tech', 'Technical fouls'],
  flagrantFouls: ['flagrant', 'Flagrant fouls'], turnoverPoints: ['pts_off_to', 'Points off turnovers'], fastBreakPoints: ['fast_break', 'Fast-break points'],
  pointsInPaint: ['paint', 'Points in the paint'], fouls: ['pf', 'Fouls'], largestLead: ['largest_lead', 'Largest lead'], leadChanges: ['lead_changes', 'Lead changes'],
  leadPercentage: ['led_pct', 'Percent of game led'],
};
