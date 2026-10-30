// The statistic catalog: every statistic a diagram can use, where it comes from and what kind it is. Box-score
// statistics come from ESPN's game box scores; "computed" ones are standard formulas over those box scores (Basketball
// Reference's definitions); "provider" ones are ESPN's own season figures, available only for a whole season to date
// and only when ESPN actually serves values for them (checked against the data, see availableStats).
//
// Keys: daily statistics use the bare key (pts); season statistics add the form: pts_pg (per game), pts_tot (total),
// pts_p36 (per 36 minutes). Percentages are 0–100.

// Counting statistics from the box score (and simple combinations).
export const BASE = [
  { k: 'pts', label: 'Points', abbr: 'PTS', group: 'Traditional' },
  { k: 'reb', label: 'Rebounds', abbr: 'REB', group: 'Traditional' },
  { k: 'oreb', label: 'Offensive Rebounds', abbr: 'OREB', group: 'Traditional' },
  { k: 'dreb', label: 'Defensive Rebounds', abbr: 'DREB', group: 'Traditional' },
  { k: 'ast', label: 'Assists', abbr: 'AST', group: 'Traditional' },
  { k: 'stl', label: 'Steals', abbr: 'STL', group: 'Traditional' },
  { k: 'blk', label: 'Blocks', abbr: 'BLK', group: 'Traditional' },
  { k: 'to', label: 'Turnovers', abbr: 'TOV', group: 'Traditional' },
  { k: 'pf', label: 'Personal Fouls', abbr: 'PF', group: 'Traditional' },
  { k: 'min', label: 'Minutes Played', abbr: 'MIN', group: 'Traditional' },
  { k: 'fgm', label: 'Field Goals Made', abbr: 'FGM', group: 'Traditional' },
  { k: 'fga', label: 'Field Goals Attempted', abbr: 'FGA', group: 'Traditional' },
  { k: 'tpm', label: 'Three-Pointers Made', abbr: '3PM', group: 'Traditional' },
  { k: 'tpa', label: 'Three-Pointers Attempted', abbr: '3PA', group: 'Traditional' },
  { k: 'ftm', label: 'Free Throws Made', abbr: 'FTM', group: 'Traditional' },
  { k: 'fta', label: 'Free Throws Attempted', abbr: 'FTA', group: 'Traditional' },
  { k: 'fg2m', label: 'Two-Pointers Made', abbr: '2PM', group: 'Additional' },
  { k: 'fg2a', label: 'Two-Pointers Attempted', abbr: '2PA', group: 'Additional' },
  { k: 'pm', label: 'Plus-Minus', abbr: '+/-', group: 'Additional' },
  { k: 'stocks', label: 'Steals + Blocks', abbr: 'STL+BLK', group: 'Additional' },
  { k: 'pra', label: 'Points + Rebounds + Assists', abbr: 'PRA', group: 'Additional' },
  { k: 'pr', label: 'Points + Rebounds', abbr: 'P+R', group: 'Additional' },
  { k: 'pa', label: 'Points + Assists', abbr: 'P+A', group: 'Additional' },
  { k: 'ra', label: 'Rebounds + Assists', abbr: 'R+A', group: 'Additional' },
];
// Percentages from made and attempted (sample: the attempts they need to count).
export const PCTS = [
  { k: 'fg_pct', label: 'Field Goal Percentage', abbr: 'FG%', group: 'Traditional', sample: 'fg' },
  { k: 'tp_pct', label: 'Three-Point Percentage', abbr: '3P%', group: 'Traditional', sample: 'tp' },
  { k: 'ft_pct', label: 'Free Throw Percentage', abbr: 'FT%', group: 'Traditional', sample: 'ft' },
  { k: 'fg2_pct', label: 'Two-Point Percentage', abbr: '2P%', group: 'Additional', sample: 'fg2' },
  { k: 'ts_pct', label: 'True Shooting Percentage', abbr: 'TS%', group: 'Advanced', sample: 'tsa' },
  { k: 'efg_pct', label: 'Effective Field Goal Percentage', abbr: 'eFG%', group: 'Advanced', sample: 'fg' },
];
// Rates computed from the box scores of the player, his team and the opponent.
export const RATES = [
  { k: 'usg_pct', label: 'Usage Rate', abbr: 'USG%', kind: 'rate', sample: 'minutes', note: 'Share of team plays used while on the floor' },
  { k: 'ast_pct', label: 'Assist Percentage', abbr: 'AST%', kind: 'rate', sample: 'minutes', note: 'Share of teammate baskets he assisted while on the floor' },
  { k: 'trb_pct', label: 'Rebound Percentage', abbr: 'TRB%', kind: 'rate', sample: 'minutes', note: 'Share of available rebounds he grabbed while on the floor' },
  { k: 'orb_pct', label: 'Offensive Rebound Percentage', abbr: 'ORB%', kind: 'rate', sample: 'minutes' },
  { k: 'drb_pct', label: 'Defensive Rebound Percentage', abbr: 'DRB%', kind: 'rate', sample: 'minutes' },
  { k: 'stl_pct', label: 'Steal Percentage', abbr: 'STL%', kind: 'rate', sample: 'minutes', note: 'Share of opponent possessions ending in his steal while on the floor' },
  { k: 'blk_pct', label: 'Block Percentage', abbr: 'BLK%', kind: 'rate', sample: 'minutes', note: 'Share of opponent two-point attempts he blocked while on the floor' },
  { k: 'tov_pct', label: 'Turnover Percentage', abbr: 'TOV%', kind: 'rate', sample: 'plays', note: 'Turnovers per 100 plays he used' },
  { k: 'ast_to', label: 'Assist-to-Turnover Ratio', abbr: 'AST/TO', kind: 'rate', sample: 'none' },
  { k: 'gmsc', label: 'Game Score', abbr: 'GmSc', kind: 'advanced', sample: 'none', note: "Hollinger's single-number box-score rating (per game in season mode)" },
];
// ESPN's own season figures (whole season to date only). Each is offered only if ESPN serves real values for it.
export const PROVIDER = [
  { k: 'per', src: 'PER', label: 'Player Efficiency Rating', abbr: 'PER' },
  { k: 'espn_rating', src: 'NBARating', label: 'ESPN Player Rating', abbr: 'RTG' },
  { k: 'ast_ratio', src: 'assistRatio', label: 'Assist Ratio', abbr: 'AST RATIO', note: 'Assists per 100 possessions he used (ESPN)' },
  { k: 'to_ratio', src: 'turnoverRatio', label: 'Turnover Ratio', abbr: 'TO RATIO', note: 'Turnovers per 100 possessions he used (ESPN)' },
  { k: 'est_poss', src: 'estimatedPossessions', label: 'Estimated Possessions', abbr: 'POSS' },
  { k: 'pts_per_poss', src: 'pointsPerEstimatedPossessions', label: 'Points per Estimated Possession', abbr: 'PPP' },
  { k: 'shoot_eff', src: 'shootingEfficiency', label: 'Shooting Efficiency', abbr: 'SH EFF' },
  { k: 'score_eff', src: 'scoringEfficiency', label: 'Scoring Efficiency', abbr: 'SC EFF' },
  { k: 'stl_foul', src: 'stealFoulRatio', label: 'Steal-to-Foul Ratio', abbr: 'STL/PF' },
  { k: 'blk_foul', src: 'blockFoulRatio', label: 'Block-to-Foul Ratio', abbr: 'BLK/PF' },
  { k: 'stl_to', src: 'stealTurnoverRatio', label: 'Steal-to-Turnover Ratio', abbr: 'STL/TO' },
  { k: 'usage_espn', src: 'usageRate', label: 'Usage Rate (ESPN)', abbr: 'USG (ESPN)' },
  { k: 'reb_rate_espn', src: 'reboundRate', label: 'Rebound Rate (ESPN)', abbr: 'REB RATE' },
  { k: 'vorp_espn', src: 'VORP', label: 'Value Over Replacement Player (ESPN)', abbr: 'VORP', suspect: true },
];
// Statistics people ask for that no reachable provider serves (shown as unavailable, never offered).
export const UNAVAILABLE = ['Box Plus/Minus', 'Offensive Box Plus/Minus', 'Defensive Box Plus/Minus', 'Win Shares', 'Offensive Win Shares', 'Defensive Win Shares', 'Win Shares Per 48 Minutes', 'Offensive Rating', 'Defensive Rating', 'Net Rating'];

const KIND_LABEL = { total: 'Total', average: 'Per game', per36: 'Per 36', percentage: 'Percentage', rate: 'Rate', advanced: 'Advanced', count: 'Count', flag: 'Yes/no' };
export const kindLabel = k => KIND_LABEL[k] || k;

// The full list for a mode. Each: { key, label, abbr, group, kind, source, sample, decimals, suffix, mode }.
export function catalog(mode) {
  const out = [];
  const add = s => out.push({ decimals: 0, suffix: '', sample: 'none', ...s, mode });
  if (mode === 'daily') {
    for (const b of BASE) add({ key: b.k, label: b.label, abbr: b.abbr, group: b.group, kind: 'total', source: 'box', decimals: b.k === 'min' ? 0 : 0 });
    for (const p of PCTS) add({ key: p.k, label: p.label, abbr: p.abbr, group: p.group, kind: 'percentage', source: p.group === 'Advanced' ? 'computed' : 'box', sample: p.sample, decimals: 1, suffix: '%' });
    for (const r of RATES) add({ key: r.k, label: r.label, abbr: r.abbr, group: 'Advanced', kind: r.kind, source: 'computed', sample: r.sample === 'minutes' ? 'minutes' : r.sample, decimals: 1, suffix: r.k.endsWith('_pct') ? '%' : '', note: r.note });
    add({ key: 'dd', label: 'Double-Double', abbr: 'DD', group: 'Additional', kind: 'flag', source: 'box' });
    add({ key: 'td', label: 'Triple-Double', abbr: 'TD', group: 'Additional', kind: 'flag', source: 'box' });
    add({ key: 'starter', label: 'Started the Game', abbr: 'GS', group: 'Additional', kind: 'flag', source: 'box' });
    add({ key: 'won', label: 'Won the Game', abbr: 'W', group: 'Additional', kind: 'flag', source: 'box' });
  } else {
    for (const b of BASE) {
      add({ key: `${b.k}_pg`, base: b.k, label: `${b.label} Per Game`, abbr: b.k === 'min' ? 'MPG' : `${b.abbr}/G`, group: b.group, kind: 'average', source: 'box', sample: 'games', decimals: 1 });
      add({ key: `${b.k}_tot`, base: b.k, label: `${b.label} (Total)`, abbr: b.abbr, group: b.group, kind: 'total', source: 'box', decimals: 0 });
      if (b.k !== 'min' && b.k !== 'pm') add({ key: `${b.k}_p36`, base: b.k, label: `${b.label} Per 36 Minutes`, abbr: `${b.abbr}/36`, group: b.group, kind: 'per36', source: 'computed', sample: 'games', decimals: 1 });
    }
    for (const p of PCTS) add({ key: p.k, label: p.label, abbr: p.abbr, group: p.group, kind: 'percentage', source: p.group === 'Advanced' ? 'computed' : 'box', sample: p.sample, decimals: 1, suffix: '%' });
    for (const r of RATES) add({ key: r.k, label: r.label, abbr: r.abbr, group: 'Advanced', kind: r.kind, source: 'computed', sample: r.sample === 'none' ? 'games' : r.sample, decimals: 1, suffix: r.k.endsWith('_pct') ? '%' : '', note: r.note });
    add({ key: 'gp', label: 'Games Played', abbr: 'GP', group: 'Traditional', kind: 'count', source: 'box' });
    add({ key: 'gs', label: 'Games Started', abbr: 'GS', group: 'Additional', kind: 'count', source: 'box' });
    add({ key: 'dd', label: 'Double-Doubles', abbr: 'DD', group: 'Additional', kind: 'count', source: 'box' });
    add({ key: 'td', label: 'Triple-Doubles', abbr: 'TD', group: 'Additional', kind: 'count', source: 'box' });
    add({ key: 'wins', label: 'Wins', abbr: 'W', group: 'Additional', kind: 'count', source: 'box' });
    for (const p of PROVIDER) add({ key: p.k, src: p.src, label: p.label, abbr: p.abbr, group: 'Advanced', kind: 'advanced', source: 'provider', sample: 'games', decimals: 1, note: p.note, wholeSeasonOnly: true });
  }
  return out;
}

export const statMap = mode => new Map(catalog(mode).map(s => [s.key, s]));

// Which provider statistics are real in this data: some value present for enough players, and not all the same (ESPN
// serves usage and rebound rates as 0 for everyone). Box-score and computed statistics are always available. Suspect
// fields (values on a scale that isn't the statistic's) are never offered.
export function availableStats(mode, rows) {
  return catalog(mode).filter(s => {
    if (s.source !== 'provider') return true;
    const p = PROVIDER.find(x => x.k === s.key);
    if (p?.suspect) return false;
    const vals = rows.map(r => r.v?.[s.key]).filter(v => typeof v === 'number' && Number.isFinite(v));
    return vals.length >= Math.min(20, rows.length / 2) && new Set(vals.map(v => Math.round(v * 100))).size > 3 && vals.some(v => v !== 0);
  });
}

// "10+ RPG", "90%+ FT", "Under 2 TOV/G"
export function criterionLabel(stat, op, value) {
  if (!stat) return '';
  if (stat.kind === 'flag') return (op === '>=' || op === '>') && value >= 1 ? stat.label : `No ${stat.label.toLowerCase()}`;
  const v = `${+(+value).toFixed(3)}${stat.suffix || ''}`; // the threshold as entered (4.5 stays 4.5)
  const short = statShort(stat);
  if (op === '>=') return `${v}+ ${short}`;
  if (op === '>') return `Over ${v} ${short}`;
  if (op === '<=') return `${v} or fewer ${short}`;
  return `Under ${v} ${short}`;
}
// RPG for rebounds per game, FT for free-throw percentage...
export function statShort(stat) {
  if (stat.kind === 'average') return { pts: 'PPG', reb: 'RPG', ast: 'APG', stl: 'SPG', blk: 'BPG', to: 'TOPG', min: 'MPG' }[stat.base] || stat.abbr;
  if (stat.kind === 'percentage') return stat.abbr.replace('%', '');
  return stat.abbr;
}
export const formatValue = (stat, v) => (v == null || !Number.isFinite(v) ? '–' : stat?.kind === 'flag' ? (v ? 'Yes' : 'No') : `${(+v).toFixed(stat?.decimals ?? 1)}${stat?.suffix || ''}`);
