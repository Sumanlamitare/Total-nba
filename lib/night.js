// Performance of the Night: reading ESPN's game summaries and scoring every player's game.
//
// A performance score adds up everything a fan would weigh, each part shown to the user:
//   production  — Hollinger's Game Score, scaled by the opponent's strength (their record before the game)
//   efficiency  — points scored above what an average shooter makes from the same shots
//   impact      — plus-minus
//   clutch      — win probability added: every play's swing in his team's chance to win, credited to whoever made it
//                 (assists, steals and blocks share in it). Without ESPN's win probability: points in crunch time.
//   result      — a win, on the road, in overtime
//   milestones  — 40/50/60 points, triple-doubles, 20-20s, 5x5s, perfect shooting, 10 threes...
//   breakout    — how far above his own season average he played
//   stage       — play-in and playoff games weigh more, the Finals most
// Everything comes from the box score, the play-by-play and the records ESPN publishes with each game.

export const MIN_MINUTES = 10;
const num = v => { const n = Number(String(v ?? '').replace('+', '')); return Number.isFinite(n) ? n : 0; };
const r1 = v => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// "15-24" -> { w: 15, l: 24 }
export const parseRecord = s => { const m = String(s || '').match(/^(\d+)-(\d+)/); return m ? { w: +m[1], l: +m[2] } : null; };

// A team's strength before this game: its win share with this result taken out, pulled toward .500 by a 5-5 prior so
// early-season records don't swing too far.
export function strength(record, wonThisGame) {
  if (!record) return 0.5;
  const w = Math.max(0, record.w - (wonThisGame ? 1 : 0)), l = Math.max(0, record.l - (wonThisGame ? 0 : 1));
  return (w + 5) / (w + l + 10);
}

// ---- Reading a game ------------------------------------------------------------------------------------------------
const teamOf = t => ({ id: String(t?.id || ''), abbr: t?.abbreviation || '', name: t?.displayName || '', short: t?.shortDisplayName || t?.name || '',
  logo: t?.logo || t?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/nba/500/${String(t?.abbreviation || '').toLowerCase()}.png`, color: t?.color ? `#${t.color}` : null });

// The stage of a game: regular season, play-in, playoffs, conference finals or the Finals.
export function stageOf(seasonType, note = '') {
  const n = String(note).toLowerCase();
  if (seasonType === 5 || /play-?in/.test(n)) return 'playin';
  if (seasonType !== 3) return 'regular';
  if (/nba finals|^finals/.test(n)) return 'finals';
  if (/conf(erence)?\.? finals|east finals|west finals/.test(n)) return 'conf';
  return 'playoffs';
}
export const STAGE = { regular: { mult: 1, label: 'Regular season' }, playin: { mult: 1.05, label: 'Play-in' }, playoffs: { mult: 1.1, label: 'Playoffs' }, conf: { mult: 1.15, label: 'Conference finals' }, finals: { mult: 1.2, label: 'NBA Finals' } };

// The game from a summary: teams, score, result, overtime, stage, records.
export function gameOf(sum) {
  const c = sum?.header?.competitions?.[0];
  if (!c) return null;
  const type = c.status?.type || {};
  const teams = (c.competitors || []).map(x => ({
    ...teamOf(x.team), score: num(x.score), winner: !!x.winner, home: x.homeAway === 'home',
    record: parseRecord((x.record || x.records || []).find(r => r.type === 'total')?.summary),
  }));
  const periods = Math.max(0, ...(c.competitors || []).map(x => x.linescores?.length || 0));
  const note = c.notes?.[0]?.headline || sum?.header?.gameNote || '';
  const seasonType = Number(sum?.header?.season?.type) || 2;
  return {
    id: String(sum.header.id || c.id), date: c.date, completed: !!type.completed, state: type.state || '', detail: type.shortDetail || type.detail || '',
    ot: Math.max(0, periods - 4), teams, note, stage: stageOf(seasonType, note), season: Number(sum.header.season?.year) || null,
  };
}

// Every player who played: his line, keyed by ESPN's stat names.
export function linesOf(sum) {
  const out = [];
  for (const side of sum?.boxscore?.players || []) {
    const st = side.statistics?.[0]; if (!st) continue;
    const names = st.names || st.labels || [];
    for (const a of st.athletes || []) {
      if (a.didNotPlay || !a.stats?.length) continue;
      const v = Object.fromEntries(names.map((n, i) => [n, a.stats[i]]));
      const split = s => String(s || '0-0').split('-').map(num);
      const [fgm, fga] = split(v.FG), [tpm, tpa] = split(v['3PT']), [ftm, fta] = split(v.FT);
      const line = { min: num(v.MIN), pts: num(v.PTS), reb: num(v.REB), ast: num(v.AST), stl: num(v.STL), blk: num(v.BLK), to: num(v.TO),
        oreb: num(v.OREB), dreb: num(v.DREB), pf: num(v.PF), pm: num(v['+/-']), fgm, fga, tpm, tpa, ftm, fta };
      out.push({ id: String(a.athlete.id), name: a.athlete.displayName, pos: a.athlete.position?.abbreviation || '', starter: !!a.starter,
        headshot: a.athlete.headshot?.href || null, team: String(side.team?.id || ''), line });
    }
  }
  return out;
}

export const gameScore = l => l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.oreb + 0.3 * l.dreb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.to;
export const trueShooting = l => (l.fga + 0.44 * l.fta > 0 ? l.pts / (2 * (l.fga + 0.44 * l.fta)) : null);

// Win probability added per player, from the play-by-play and ESPN's home win probability after each play. Each
// play's swing is credited to the players in it, each from his own team's side: the shooter, rebounder or player
// who turned it over takes all of it; on an assisted basket the passer takes 30%; a blocker or stealer earns half of
// what he took from the other side. Fouls, violations and stoppages carry no credit, and no single play counts for more
// than 25%. Returns Map(player id -> WPA on a 0..1 scale), or null when the game has no win probability.
const NO_CREDIT = /foul|goaltend|violation|timeout|substitution|jump ?ball|end (period|game)|delay|review|challenge|kicked|ejection|technical/i;
export function winProbabilityAdded(sum, homeId, teamOfPlayer = new Map()) {
  const wp = new Map((sum?.winprobability || []).map(w => [String(w.playId), w.homeWinPercentage]));
  if (!wp.size || !sum.plays?.length) return null;
  const out = new Map();
  const add = (id, v) => { if (id) out.set(id, (out.get(id) || 0) + v); };
  const side = (id, fallback) => (teamOfPlayer.get(id) || fallback);
  let prev = 0.5;
  for (const p of sum.plays) {
    const now = wp.get(String(p.id));
    if (now == null) continue;
    const delta = clamp(now - prev, -0.25, 0.25); prev = now;
    if (!delta || NO_CREDIT.test(String(p.type?.text || ''))) continue;
    const ids = (p.participants || []).map(x => String(x.athlete?.id || '')).filter(Boolean);
    if (!ids.length) continue;
    const forPlayer = id => (String(side(id, p.team?.id)) === String(homeId) ? delta : -delta);
    const text = String(p.text || '');
    if (ids.length > 1 && side(ids[0]) && side(ids[1]) && side(ids[0]) !== side(ids[1])) {
      // A block or a steal: the defender earns half his side's gain; the player who lost the ball or missed takes his side's loss.
      for (const id of ids.slice(0, 2)) add(id, forPlayer(id) > 0 ? 0.5 * forPlayer(id) : forPlayer(id));
    } else if (p.scoringPlay && ids.length > 1 && /assist/i.test(text)) { add(ids[0], 0.7 * forPlayer(ids[0])); add(ids[1], 0.3 * forPlayer(ids[1])); }
    else add(ids[0], forPlayer(ids[0]));
  }
  return out;
}

// Without win probability: points scored in crunch time (the last five minutes of the fourth quarter or overtime,
// with the game within five points before the basket).
export function clutchPoints(sum, homeId) {
  const out = new Map();
  let home = 0, away = 0;
  for (const p of sum?.plays || []) {
    const per = p.period?.number || 0;
    const [mm, ss] = String(p.clock?.displayValue || '').includes(':') ? p.clock.displayValue.split(':').map(Number) : [0, Number(p.clock?.displayValue || 0)];
    const left = mm * 60 + ss;
    if (p.scoringPlay && per >= 4 && left <= 300 && Math.abs(home - away) <= 5) {
      const id = String(p.participants?.[0]?.athlete?.id || '');
      if (id) out.set(id, (out.get(id) || 0) + (p.scoreValue || 0));
    }
    if (p.homeScore != null) { home = p.homeScore; away = p.awayScore; }
  }
  return out.size ? out : null;
}

// ---- Scoring -------------------------------------------------------------------------------------------------------
export function milestonesOf(l) {
  const out = [];
  const tens = ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => l[k] >= 10).length;
  if (l.pts >= 60) out.push({ k: '60', label: '60-point game', value: 7 });
  else if (l.pts >= 50) out.push({ k: '50', label: '50-point game', value: 5 });
  else if (l.pts >= 40) out.push({ k: '40', label: '40-point game', value: 2 });
  if (tens >= 4) out.push({ k: 'qd', label: 'Quadruple-double', value: 6 });
  else if (tens === 3) out.push({ k: 'td', label: 'Triple-double', value: 3 });
  else if (tens === 2) out.push({ k: 'dd', label: 'Double-double', value: 0.5 });
  if (l.pts >= 20 && l.reb >= 20) out.push({ k: '2020', label: '20-20 game', value: 2 });
  else if (l.reb >= 20) out.push({ k: 'reb', label: `${l.reb} rebounds`, value: 1 });
  if (l.ast >= 15) out.push({ k: 'ast', label: `${l.ast} assists`, value: 1.5 });
  if (['pts', 'reb', 'ast', 'stl', 'blk'].every(k => l[k] >= 5)) out.push({ k: '5x5', label: '5x5', value: 3 });
  if (l.stl + l.blk >= 7) out.push({ k: 'stocks', label: `${l.stl} steals, ${l.blk} blocks`, value: 1.5 });
  if (l.tpm >= 10) out.push({ k: '3s', label: `${l.tpm} threes`, value: 2 });
  if (l.fga >= 8 && l.fgm === l.fga) out.push({ k: 'perfect', label: `Perfect ${l.fgm}-of-${l.fga} shooting`, value: 2 });
  return out;
}

// Score one player's game. ctx: { game, wpa (Map|null), clutch (Map|null), seasonAvg (his average Game Score before
// tonight, or null) }. Returns { score, parts: [{ k, label, value }], tags }.
export function scorePerformance(p, { game, wpa = null, clutch = null, seasonAvg = null }) {
  const l = p.line;
  const mine = game.teams.find(t => t.id === p.team), opp = game.teams.find(t => t.id !== p.team);
  const won = !!mine?.winner;
  const parts = [];
  const gs = gameScore(l);
  const oppStrength = strength(opp?.record, !!opp?.winner);
  const factor = 0.85 + 0.3 * oppStrength; // .500 opponent = 1.0
  parts.push({ k: 'production', label: `Game Score ${r1(gs)}${Math.abs(factor - 1) >= 0.01 ? ` × ${factor.toFixed(2)} for a ${opp?.record ? `${opp.record.w}-${opp.record.l}` : ''} opponent` : ''}`, value: r1(gs * factor) });
  const tsa = l.fga + 0.44 * l.fta;
  if (tsa >= 5) {
    const over = l.pts - 1.14 * tsa; // an average shooter scores about 1.14 points per shooting possession
    parts.push({ k: 'efficiency', label: `${Math.round(100 * trueShooting(l))}% true shooting (${over >= 0 ? '+' : ''}${r1(over)} points above average)`, value: r1(clamp(0.3 * over, -4, 5)) });
  }
  if (l.pm) parts.push({ k: 'impact', label: `${l.pm > 0 ? '+' : ''}${l.pm} plus-minus`, value: r1(clamp(0.12 * l.pm, -4, 4)) });
  if (wpa?.has(p.id)) {
    const v = wpa.get(p.id);
    parts.push({ k: 'clutch', label: `${v >= 0 ? '+' : ''}${Math.round(100 * v)}% win probability added`, value: r1(clamp(16 * v, -6, 8)) });
  } else if (!wpa && clutch?.has(p.id)) {
    parts.push({ k: 'clutch', label: `${clutch.get(p.id)} crunch-time points`, value: r1(clamp(0.6 * clutch.get(p.id), 0, 6)) });
  }
  if (won) {
    let v = 2.5; const why = ['Win'];
    if (!mine.home) { v += 0.5; why.push('on the road'); }
    if (game.ot) { v += 0.5; why.push(game.ot > 1 ? `in ${game.ot}OT` : 'in overtime'); }
    parts.push({ k: 'result', label: why.join(' '), value: v });
  }
  for (const m of milestonesOf(l)) parts.push({ k: `m-${m.k}`, label: m.label, value: m.value });
  if (seasonAvg != null && gs - seasonAvg > 4) parts.push({ k: 'breakout', label: `${r1(gs - seasonAvg)} above his season average`, value: r1(clamp(0.12 * (gs - seasonAvg), 0, 3)) });
  const raw = parts.reduce((s, x) => s + x.value, 0);
  const stage = STAGE[game.stage] || STAGE.regular;
  if (stage.mult !== 1) parts.push({ k: 'stage', label: `${stage.label} × ${stage.mult}`, value: r1(raw * (stage.mult - 1)) });
  const score = r1(raw * stage.mult);
  const tags = milestonesOf(l).map(m => m.label);
  if (wpa?.get(p.id) >= 0.25 || clutch?.get(p.id) >= 8) tags.push('Clutch');
  if (seasonAvg != null && gs - seasonAvg >= 12) tags.push('Breakout');
  return { score, parts, tags, gs: r1(gs) };
}

// Every qualifying performance in one game, scored. seasonAvgs: Map(player id -> average Game Score before tonight).
export function scoreGame(sum, seasonAvgs = new Map()) {
  const game = gameOf(sum);
  if (!game) return { game: null, perfs: [] };
  const home = game.teams.find(t => t.home);
  const lines = linesOf(sum);
  const wpa = winProbabilityAdded(sum, home?.id, new Map(lines.map(p => [p.id, p.team])));
  const clutch = wpa ? null : clutchPoints(sum, home?.id);
  const perfs = lines.filter(p => p.line.min >= MIN_MINUTES).map(p => {
    const s = scorePerformance(p, { game, wpa, clutch, seasonAvg: seasonAvgs.get(p.id) ?? null });
    const mine = game.teams.find(t => t.id === p.team), opp = game.teams.find(t => t.id !== p.team);
    return {
      ...p, ...s, event: game.id, stage: game.stage,
      team: mine ? { id: mine.id, abbr: mine.abbr, name: mine.name, logo: mine.logo, color: mine.color } : { id: p.team },
      opp: opp ? { id: opp.id, abbr: opp.abbr, name: opp.name, logo: opp.logo } : null,
      home: !!mine?.home,
      result: mine && opp ? `${mine.winner ? 'W' : 'L'} ${mine.score}-${opp.score}${game.ot ? (game.ot > 1 ? ` ${game.ot}OT` : ' OT') : ''}` : '',
    };
  });
  return { game, perfs };
}

// The night's ranking: best score first; ties go to the higher Game Score.
export const rank = perfs => [...perfs].sort((a, b) => b.score - a.score || b.gs - a.gs);
