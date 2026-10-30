// From box scores to statistic values. A player-game record (as stored, see lib/store.js) holds the player's line (s),
// his team's totals in that game (tm) and the opponent's (op). A daily row is one record; a season row sums a player's
// records over a period. Percentages and rates are computed from sums (never by averaging game percentages).
//
// Rates use Basketball Reference's definitions, with team minutes as the sum of the team's player minutes:
//   USG% = 100 (FGA + 0.44 FTA + TOV)(TmMIN/5) / (MIN (TmFGA + 0.44 TmFTA + TmTOV))
//   AST% = 100 AST / ((MIN / (TmMIN/5)) TmFGM − FGM)
//   TRB% = 100 TRB (TmMIN/5) / (MIN (TmTRB + OppTRB))      (ORB%, DRB% likewise with ORB/DRB)
//   STL% = 100 STL (TmMIN/5) / (MIN OppPoss),  OppPoss = OppFGA + 0.44 OppFTA − OppORB + OppTOV
//   BLK% = 100 BLK (TmMIN/5) / (MIN (OppFGA − Opp3PA))
//   TOV% = 100 TOV / (FGA + 0.44 FTA + TOV);  AST/TO with no turnovers counts as assists over one
//   Game Score = PTS + 0.4 FGM − 0.7 FGA − 0.4 (FTA − FTM) + 0.7 ORB + 0.3 DRB + STL + 0.7 AST + 0.7 BLK − 0.4 PF − TOV

export const LINE = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'to', 'pf', 'pm'];
export const TEAM = ['min', 'pts', 'fgm', 'fga', 'tpa', 'fta', 'oreb', 'dreb', 'reb', 'to'];

const div = (a, b) => (b > 0 ? a / b : null);
const pct = (a, b) => (b > 0 ? (100 * a) / b : null);
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
const addInto = (acc, o, keys) => { for (const k of keys) acc[k] += +o?.[k] || 0; return acc; };

export const gameScore = s => s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.to;
const tens = s => ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => s[k] >= 10).length;

// Combinations and percentages from a line (one game or sums).
function shooting(s) {
  return {
    fg2m: s.fgm - s.tpm, fg2a: s.fga - s.tpa, stocks: s.stl + s.blk, pra: s.pts + s.reb + s.ast, pr: s.pts + s.reb, pa: s.pts + s.ast, ra: s.reb + s.ast,
    fg_pct: pct(s.fgm, s.fga), tp_pct: pct(s.tpm, s.tpa), ft_pct: pct(s.ftm, s.fta), fg2_pct: pct(s.fgm - s.tpm, s.fga - s.tpa),
    ts_pct: s.fga + 0.44 * s.fta > 0 ? (100 * s.pts) / (2 * (s.fga + 0.44 * s.fta)) : null, efg_pct: pct(s.fgm + 0.5 * s.tpm, s.fga),
  };
}
function rates(s, tm, op) {
  const on = tm.min > 0 && s.min > 0 ? s.min / (tm.min / 5) : 0; // his share of the team's floor time, in "players"
  const oppPoss = op.fga + 0.44 * op.fta - op.oreb + op.to;
  return {
    usg_pct: on ? div(100 * (s.fga + 0.44 * s.fta + s.to), on * (tm.fga + 0.44 * tm.fta + tm.to)) : null,
    ast_pct: on && on * tm.fgm - s.fgm > 0 ? (100 * s.ast) / (on * tm.fgm - s.fgm) : null,
    trb_pct: on ? div(100 * s.reb, on * (tm.reb + op.reb)) : null,
    orb_pct: on ? div(100 * s.oreb, on * (tm.oreb + op.dreb)) : null,
    drb_pct: on ? div(100 * s.dreb, on * (tm.dreb + op.oreb)) : null,
    stl_pct: on ? div(100 * s.stl, on * oppPoss) : null,
    blk_pct: on ? div(100 * s.blk, on * (op.fga - op.tpa)) : null,
    tov_pct: pct(s.to, s.fga + 0.44 * s.fta + s.to),
    ast_to: s.to > 0 ? s.ast / s.to : s.ast > 0 ? s.ast : null, // no turnovers: assists over one
  };
}

// The sample a percentage or rate rests on (for minimum-sample rules).
const sampleOf = (s, gp = 1) => ({ gp, min: s.min, fga: s.fga, fgm: s.fgm, tpa: s.tpa, tpm: s.tpm, fta: s.fta, ftm: s.ftm, fg2a: s.fga - s.tpa, fg2m: s.fgm - s.tpm, tsa: s.fga + 0.44 * s.fta, plays: s.fga + 0.44 * s.fta + s.to });

// One game -> { v: values, n: sample }.
export function dailyValues(rec) {
  const s = addInto(zero(LINE), rec.s, LINE), tm = addInto(zero(TEAM), rec.tm, TEAM), op = addInto(zero(TEAM), rec.op, TEAM);
  const v = { ...Object.fromEntries(LINE.map(k => [k, s[k]])), ...shooting(s), ...rates(s, tm, op), gmsc: gameScore(s),
    dd: tens(s) >= 2 ? 1 : 0, td: tens(s) >= 3 ? 1 : 0, starter: rec.starter ? 1 : 0, won: rec.won ? 1 : 0 };
  return { v, n: sampleOf(s, 1) };
}

// Sums of a player's games over a period: { s, tm, op, gp, gs, dd, td, wins, gmsc } (what the database aggregates).
export function sumRecords(recs) {
  const out = { s: zero(LINE), tm: zero(TEAM), op: zero(TEAM), gp: recs.length, gs: 0, dd: 0, td: 0, wins: 0, gmsc: 0 };
  for (const r of recs) {
    addInto(out.s, r.s, LINE); addInto(out.tm, r.tm, TEAM); addInto(out.op, r.op, TEAM);
    const line = addInto(zero(LINE), r.s, LINE), t = tens(line);
    out.gs += r.starter ? 1 : 0; out.wins += r.won ? 1 : 0; out.dd += t >= 2 ? 1 : 0; out.td += t >= 3 ? 1 : 0; out.gmsc += gameScore(line);
  }
  return out;
}
// Per-game flags stored with each record so the database can sum them.
export const gameFlags = s => { const line = addInto(zero(LINE), s, LINE), t = tens(line); return { dd: t >= 2 ? 1 : 0, td: t >= 3 ? 1 : 0, gmsc: Math.round(gameScore(line) * 10) / 10 }; };

// A player's period -> { v, n }. sums: from sumRecords or the database. provider: ESPN season figures keyed by our
// statistic keys (only for the whole season to date).
export function seasonValues(sums, provider = null) {
  const s = addInto(zero(LINE), sums.s, LINE), tm = addInto(zero(TEAM), sums.tm, TEAM), op = addInto(zero(TEAM), sums.op, TEAM), gp = sums.gp || 0;
  const sh = shooting(s);
  const tot = { ...Object.fromEntries(LINE.map(k => [k, s[k]])), fg2m: sh.fg2m, fg2a: sh.fg2a, stocks: sh.stocks, pra: sh.pra, pr: sh.pr, pa: sh.pa, ra: sh.ra };
  const v = {};
  for (const [k, x] of Object.entries(tot)) {
    v[`${k}_tot`] = x;
    v[`${k}_pg`] = gp ? x / gp : null;
    if (k !== 'min' && k !== 'pm') v[`${k}_p36`] = s.min > 0 ? (36 * x) / s.min : null;
  }
  Object.assign(v, { fg_pct: sh.fg_pct, tp_pct: sh.tp_pct, ft_pct: sh.ft_pct, fg2_pct: sh.fg2_pct, ts_pct: sh.ts_pct, efg_pct: sh.efg_pct }, rates(s, tm, op),
    { gmsc: gp ? sums.gmsc / gp : null, gp, gs: sums.gs || 0, dd: sums.dd || 0, td: sums.td || 0, wins: sums.wins || 0 });
  if (provider) Object.assign(v, provider);
  return { v, n: sampleOf(s, gp) };
}

// Default minimum samples for percentages and rates (editable in Settings). Daily: one game. Season: per team game,
// NBA's own leader qualifiers prorated (300 FGM, 82 3PM, 125 FTM over 82 games), and a share of the games.
export const DEFAULT_MINIMUMS = {
  daily: { fga: 5, tpa: 3, fta: 4, fg2a: 4, tsa: 6, minutes: 12, plays: 5 },
  season: { gamesPct: 50, fgmPerGame: 3.65, tpmPerGame: 1, ftmPerGame: 1.5, mpg: 15 },
};

// Does a row have the sample a statistic needs? maxGames: the most games anyone played in the period (team games so far).
export function hasSample(stat, n, mode, mins = DEFAULT_MINIMUMS, maxGames = 1) {
  const rule = stat?.sample || 'none';
  if (rule === 'none' || !n) return true;
  if (mode === 'daily') {
    const m = mins.daily;
    return { fg: n.fga >= m.fga, tp: n.tpa >= m.tpa, ft: n.fta >= m.fta, fg2: n.fg2a >= m.fg2a, tsa: n.tsa >= m.tsa, minutes: n.min >= m.minutes, plays: n.plays >= m.plays, games: true }[rule] ?? true;
  }
  const m = mins.season;
  const games = n.gp >= Math.max(1, Math.ceil((m.gamesPct / 100) * maxGames));
  if (rule === 'games') return games;
  if (rule === 'minutes') return games && n.gp > 0 && n.min / n.gp >= m.mpg;
  if (rule === 'plays') return games;
  const need = { fg: n.fgm >= m.fgmPerGame * maxGames, tp: n.tpm >= m.tpmPerGame * maxGames, ft: n.ftm >= m.ftmPerGame * maxGames, fg2: n.fg2m >= m.fgmPerGame * maxGames * 0.6, tsa: n.fgm >= m.fgmPerGame * maxGames }[rule];
  return games && (need ?? true);
}
