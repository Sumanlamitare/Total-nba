// Performance of the Night: reading ESPN's game summaries and scoring every player who appeared, from 0 to 100.
//
//   POTN score = 0.20 Result + 0.30 Offense + 0.20 Defense + 0.15 Possession + 0.15 Clutch − stat padding − fouls
//
// Each category is first a value in points (what the player added, by the formulas below). It is then standardized
// against a reference population of NBA performances: robust z = (value − median) / (1.4826 × MAD), capped at ±7 and
// mapped to 0..100 (50 is a typical rotation player's game; every 7 is one robust standard deviation). The medians and
// MADs come from real games (lib/calibration.js, made by tools/calibrate.mjs).
//
//   Result      win or loss, scaled by his part in it (a win by his production share, a loss by his minutes, and a close
//               loss costs half); opponent's record, road, overtime, playoffs; plus-minus; win probability he added
//               outside crunch time
//   Offense     points, plus or minus half the points above or below an average shooter on the same shots; assists;
//               scaled by the opponent's strength
//   Defense     steals, blocks, defensive rebounds, and the opponent's scoring rate with him on the floor against
//               without him (from the play-by-play's substitutions)
//   Possession  offensive rebounds; turnovers against those expected from how much he had the ball, each one costing
//               more when the opponent scored off it, and more in a close game late than in a decided one
//   Clutch      the NBA's definition: the last 5 minutes of the 4th quarter or overtime with the score within 5. Win
//               probability he added there (or, without it, his crunch-time scoring); the game-winner. Measured against
//               players who were part of crunch time (4+ plays); a game without any leaves it at a neutral 50
//   Padding     up to −12, only for box scores that look impressive (20 points, a double-double...), except garbage
//               time, which applies to every starter: stats from the last 2 minutes with a 15-point lead
//   Fouls       up to −7: technicals (more when the free throw went in, and in a close game), costly personal fouls
//               and foul trouble, fouling out (by how much was left and how close it was), flagrants and ejections
//
// Each event is charged once. A turnover costs in Possession only: its win-probability swing and the points scored off
// it are not charged again in Clutch or Result. A technical's free throw is charged with the technical (the play-by-play
// credits nothing for fouls). Steals and blocks count in Defense, not in win probability. Plus-minus carries a small
// weight because it overlaps with everything else. Nothing is invented: what ESPN doesn't give is listed as missing.

import CALIBRATION from './calibration.js';

export const MODEL = 'potn-2';
export const MIN_MINUTES = 10; // the reference population: rotation players
export const WEIGHTS = { result: 0.2, offense: 0.3, defense: 0.2, possession: 0.15, clutch: 0.15 };
export const CATEGORIES = Object.keys(WEIGHTS);
export const CAPS = { padding: 12, volume: 4, garbage: 3, usage: 2, turnovers: 3, fouls: 7, technical: 3, personal: 2, foulOut: 4, flagrant: 5 };
export const LEAGUE_PPS = 1.14;                    // points per shooting possession (true shooting 57%)
export const CLUTCH = { seconds: 300, margin: 5 }; // the NBA's clutch time
export const DECIDED = { margin: 15, seconds: 120 }; // garbage time
// Things ESPN's game data doesn't have, for every game.
export const NEVER_AVAILABLE = ['potential assists', 'fouls and charges drawn', 'shot contests and opponent shooting when guarded', 'official offensive and defensive ratings'];

const num = v => { const n = Number(String(v ?? '').replace('+', '')); return Number.isFinite(n) ? n : 0; };
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sgn = v => (v > 0 ? `+${r1(v)}` : `${r1(v)}`);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

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
        ejected: !!a.ejected, headshot: a.athlete.headshot?.href || null, team: String(side.team?.id || ''), line });
    }
  }
  return out;
}

export const gameScore = l => l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.oreb + 0.3 * l.dreb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.to;
export const trueShooting = l => (l.fga + 0.44 * l.fta > 0 ? l.pts / (2 * (l.fga + 0.44 * l.fta)) : null);
export const effectiveFg = l => (l.fga > 0 ? (l.fgm + 0.5 * l.tpm) / l.fga : null);
// Share of his team's plays he used while on the floor (Basketball-Reference's formula, from the box score).
export function usageRate(l, team) {
  const used = l.fga + 0.44 * l.fta + l.to, teamUsed = team.fga + 0.44 * team.fta + team.to;
  return l.min > 0 && teamUsed > 0 ? (used * (team.min / 5)) / (l.min * teamUsed) : null;
}

// ---- The clock, the score and how much a moment matters ------------------------------------------------------------
// The clock as "m:ss" (under a minute ESPN gives tenths, which are dropped).
export const clockText = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const secondsLeft = clock => { const t = String(clock?.displayValue ?? ''); if (t.includes(':')) { const [m, s] = t.split(':').map(Number); return m * 60 + s; } return Number(t) || 0; };
export const periodLength = period => (period > 4 ? 300 : 720);
// Seconds left in the game (regulation, or the overtime being played).
export const gameSecondsLeft = (period, left) => (period >= 4 ? left : left + (4 - period) * 720);
export const decided = (period, left, margin) => period >= 4 && left < DECIDED.seconds && margin >= DECIDED.margin;
export const isClutch = (period, left, margin) => period >= 4 && left <= CLUTCH.seconds && margin <= CLUTCH.margin;
// How much a point is worth at a moment, by the score and the time left: 2 in clutch time, 1.5 in a close fourth
// quarter, 1 otherwise, 0.5 once decided.
export function leverage(period, left, margin) {
  if (decided(period, left, margin) || margin >= 25) return 0.5;
  if (isClutch(period, left, margin)) return 2;
  if (period >= 4 && margin <= 10) return 1.5;
  return 1;
}

// ---- Reading the play-by-play --------------------------------------------------------------------------------------
const TURNOVER = /turnover|traveling|travelling|double dribble|3-second|three second|backcourt|palming|discontinue/i;
const isTurnover = type => TURNOVER.test(type) && !(/foul/i.test(type) && !/turnover/i.test(type)) && !/defensive (3|three)/i.test(type);
const isFreeThrow = type => /free throw/i.test(type);
const isTechnicalFt = (type, text) => isFreeThrow(type) && /technical/i.test(`${type} ${text}`);
const isRebound = type => /rebound/i.test(type);
const SKIP = /substitution|timeout|jump ?ball|end (period|game)|review|challenge|delay|kicked/i;

// What kind of foul a play is, or null.
export function foulKind(type, text = '') {
  const s = `${type} ${text}`;
  if (isFreeThrow(type) || /turnover/i.test(type)) return null;
  if (/defensive (3|three).?sec/i.test(s)) return 'def3';
  if (/flagrant/i.test(s)) return /type 2|flagrant 2|flagrant-2|flagrant foul type 2/i.test(s) ? 'flagrant2' : 'flagrant1';
  if (/technical/i.test(type) || /technical foul/i.test(text)) return 'technical';
  if (/offensive (foul|charge)|charge/i.test(type)) return 'offensive';
  if (/foul/i.test(type)) return /take|away from play|clear path|intentional/i.test(type) ? 'take' : /shooting/i.test(type) ? 'shooting' : 'personal';
  return null;
}
// Fouls that count toward the six.
const PERSONAL = new Set(['personal', 'shooting', 'take', 'offensive', 'flagrant1', 'flagrant2']);

const blankStats = () => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, to: 0 });
const blankPlayer = () => ({ tos: [], fouls: [], ejection: null, fouledOut: null, wpa: 0, wpaClutch: 0, clutch: blankStats(), clutchPlays: 0, garbage: null,
  gameWinner: null, on: { secs: 0, oppPts: 0, oppPoss: 0 } });

// Who started each period, for lineups: the game's starters for the first; afterwards, everyone whose first appearance
// in the period isn't coming in as a substitute, topped up from the end of the last period. Returns
// Map(period -> Map(team -> Set(player ids))).
export function periodStarters(plays, starters, teamOfPlayer) {
  const byPeriod = new Map();
  for (const p of plays) { const n = p.period?.number || 0; if (!byPeriod.has(n)) byPeriod.set(n, []); byPeriod.get(n).push(p); }
  const out = new Map();
  let last = null;
  for (const n of [...byPeriod.keys()].sort((a, b) => a - b)) {
    const ps = byPeriod.get(n);
    const seen = new Set(), first = new Map(); // team -> [ids], in order
    const mark = (id, starts) => { if (!id || seen.has(id)) return; seen.add(id); const t = teamOfPlayer.get(id); if (!t) return; if (starts) { if (!first.has(t)) first.set(t, []); first.get(t).push(id); } };
    for (const p of ps) {
      const ids = (p.participants || []).map(x => String(x.athlete?.id || '')).filter(Boolean);
      if (/substitution/i.test(p.type?.text || '')) { mark(ids[1], true); mark(ids[0], false); }
      else for (const id of ids) mark(id, true);
    }
    const lineup = new Map();
    const teams = new Set([...teamOfPlayer.values()]);
    for (const t of teams) {
      let set;
      if (n === 1 && starters.get(t)?.size === 5) set = new Set(starters.get(t));
      else {
        set = new Set((first.get(t) || []).slice(0, 5));
        for (const id of last?.get(t) || []) if (set.size < 5 && !seen.has(id)) set.add(id);
      }
      lineup.set(t, set);
    }
    out.set(n, lineup);
    last = lineup;
  }
  return out;
}

// One pass through the play-by-play: every player's turnovers (and the points scored off them), fouls (and the free
// throws they gave), fouling out, ejections, win probability added (in and out of clutch time), crunch-time stats,
// garbage-time stats, the game-winner, and the opponent's scoring with him on the floor. Returns { players: Map(id ->
// record), lineups: Map(team -> reliable?), hasWp }.
export function readPlays(sum, game, lines) {
  const plays = sum?.plays || [];
  const teamOfPlayer = new Map(lines.map(p => [p.id, p.team]));
  const home = game.teams.find(t => t.home)?.id, away = game.teams.find(t => !t.home)?.id;
  const other = t => (String(t) === String(home) ? away : home);
  const players = new Map(lines.map(p => [p.id, blankPlayer()]));
  const P = id => players.get(id);
  const wp = new Map((sum?.winprobability || []).map(w => [String(w.playId), w.homeWinPercentage]));
  const hasWp = wp.size > 0;
  const starters = new Map();
  for (const p of lines) if (p.starter) { if (!starters.has(p.team)) starters.set(p.team, new Set()); starters.get(p.team).add(p.id); }
  const starts = periodStarters(plays, starters, teamOfPlayer);
  const onCourt = new Map();
  const teamOpp = new Map([[home, { pts: 0, poss: 0 }], [away, { pts: 0, poss: 0 }]]); // what each team's opponent scored, over the game
  const foulCount = new Map();
  let hs = 0, as = 0, period = 0, prevLeft = 0, prevWp = 0.5;
  const leadChanges = [];

  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const per = p.period?.number || 0, left = secondsLeft(p.clock);
    if (per !== period) { period = per; prevLeft = periodLength(per); for (const [t, set] of starts.get(per) || []) onCourt.set(t, new Set(set)); }
    // Time on the floor since the last play.
    const dt = Math.max(0, prevLeft - left); prevLeft = left;
    if (dt) for (const set of onCourt.values()) for (const id of set) if (P(id)) P(id).on.secs += dt;
    const type = String(p.type?.text || ''), text = String(p.text || '');
    const ids = (p.participants || []).map(x => String(x.athlete?.id || '')).filter(Boolean);
    const team = String(p.team?.id || teamOfPlayer.get(ids[0]) || '');
    const before = { home: hs, away: as };
    const marginFor = t => (String(t) === String(home) ? before.home - before.away : before.away - before.home);
    const absMargin = Math.abs(before.home - before.away);
    const clutch = isClutch(per, left, absMargin), garbage = decided(per, left, absMargin), lev = leverage(per, left, absMargin);

    // Substitutions
    if (/substitution/i.test(type) && ids.length >= 2) {
      const t = teamOfPlayer.get(ids[0]) || team;
      const set = onCourt.get(t) || new Set(); set.delete(ids[1]); set.add(ids[0]); onCourt.set(t, set);
    }

    // The opponent's scoring and possessions with each player on the floor
    if (team && teamOpp.has(other(team))) {
      const poss = isTurnover(type) ? 1 : (p.shootingPlay && !isFreeThrow(type)) ? 1 : isFreeThrow(type) ? 0.44 : (isRebound(type) && /offensive/i.test(type)) ? -1 : 0;
      const pts = p.scoringPlay ? (p.scoreValue || 0) : 0;
      if (poss || pts) {
        const def = other(team);
        const t = teamOpp.get(def); t.pts += pts; t.poss += poss;
        for (const id of onCourt.get(def) || []) if (P(id)) { P(id).on.oppPts += pts; P(id).on.oppPoss += poss; }
      }
    }

    // Turnovers, and what the opponent scored before his team had the ball again
    if (isTurnover(type) && ids[0] && P(ids[0])) {
      const t = teamOfPlayer.get(ids[0]) || team;
      let pts = 0;
      for (let j = i + 1; j < plays.length; j++) {
        const q = plays[j];
        if (/end (period|game)/i.test(q.type?.text || '') || (q.period?.number && q.period.number !== per)) break;
        const qt = String(q.team?.id || '');
        if (q.scoringPlay && qt && qt !== t) { pts += q.scoreValue || 0; continue; }
        if (qt === t && !/foul|timeout|substitution/i.test(q.type?.text || '')) break;
      }
      const stolen = ids[1] && teamOfPlayer.get(ids[1]) && teamOfPlayer.get(ids[1]) !== t;
      P(ids[0]).tos.push({ period: per, left, margin: marginFor(t), pts, lev, live: !!stolen });
      if (clutch) P(ids[0]).clutch.to++;
    }

    // Fouls, and the free throws they gave (the opponent's free throws at the same moment)
    const kind = foulKind(type, text);
    if (kind && ids[0] && P(ids[0])) {
      const t = teamOfPlayer.get(ids[0]) || team;
      let ftPts = 0, ftAtt = 0;
      if (kind !== 'offensive') {
        for (let j = i + 1; j < plays.length; j++) {
          const q = plays[j], qt = String(q.type?.text || '');
          if (q.period?.number !== per || q.clock?.displayValue !== p.clock?.displayValue) break;
          if (!isFreeThrow(qt) || String(q.team?.id || '') === t) continue;
          if (isTechnicalFt(qt, q.text) !== (kind === 'technical' || kind === 'def3')) continue;
          ftAtt++; if (q.scoringPlay) ftPts += q.scoreValue || 1;
        }
      }
      const f = { kind, period: per, left, margin: marginFor(t), lev, ftPts, ftAtt };
      P(ids[0]).fouls.push(f);
      if (PERSONAL.has(kind)) {
        const n = (foulCount.get(ids[0]) || 0) + 1; foulCount.set(ids[0], n);
        if (n === 6 && !P(ids[0]).fouledOut) P(ids[0]).fouledOut = { period: per, left, margin: marginFor(t) };
      }
    }
    if (/eject/i.test(`${type} ${text}`) && ids[0] && P(ids[0]) && !P(ids[0]).ejection) P(ids[0]).ejection = { period: per, left, margin: marginFor(teamOfPlayer.get(ids[0])) };

    // Win probability added: shots (and the pass that set up a make) and rebounds. Fouls, turnovers, steals and blocks
    // carry none here, as they are charged or credited in their own categories.
    const now = wp.get(String(p.id));
    if (now != null) {
      const delta = clamp(now - prevWp, -0.25, 0.25); prevWp = now;
      const credit = (id, share) => {
        if (!P(id)) return;
        const v = share * (String(teamOfPlayer.get(id)) === String(home) ? delta : -delta);
        if (clutch) P(id).wpaClutch += v; else P(id).wpa += v;
      };
      if (delta && !SKIP.test(type) && !kind && !isTurnover(type) && ids[0]) {
        if (p.shootingPlay || isFreeThrow(type)) {
          if (p.scoringPlay && ids[1] && /assist/i.test(text) && teamOfPlayer.get(ids[1]) === teamOfPlayer.get(ids[0])) { credit(ids[0], 0.7); credit(ids[1], 0.3); } else credit(ids[0], 1);
        } else if (isRebound(type)) credit(ids[0], 1);
      }
    }

    // Crunch-time and garbage-time box scores
    const tally = (s, id) => {
      if (p.scoringPlay && id === ids[0]) { s.pts += p.scoreValue || 0; if (isFreeThrow(type)) { s.ftm++; } else { s.fgm++; if (p.scoreValue === 3) s.tpm++; } }
      if (p.shootingPlay && id === ids[0]) { if (isFreeThrow(type)) s.fta++; else s.fga++; }
      if (p.scoringPlay && id === ids[1] && /assist/i.test(text)) s.ast++;
      if (isRebound(type) && id === ids[0]) { s.reb++; if (/offensive/i.test(type)) s.oreb++; }
      if (id === ids[1] && teamOfPlayer.get(id) !== teamOfPlayer.get(ids[0])) { if (/steal/i.test(text)) s.stl++; if (/block/i.test(text)) s.blk++; }
    };
    if (clutch) for (const id of ids) if (P(id)) { tally(P(id).clutch, id); P(id).clutchPlays++; }
    if (garbage) for (const id of ids) if (P(id)) { P(id).garbage ||= blankStats(); tally(P(id).garbage, id); }

    if (p.homeScore != null) {
      const lead0 = Math.sign(hs - as); hs = p.homeScore; as = p.awayScore; const lead1 = Math.sign(hs - as);
      if (p.scoringPlay && lead1 && lead1 !== lead0) leadChanges.push({ id: ids[0], team: lead1 > 0 ? home : away, period: per, left });
    }
  }

  // The game-winner: the basket that put the winners ahead for good, in the last minute of the 4th or overtime.
  const winner = game.teams.find(t => t.winner)?.id;
  const last = leadChanges[leadChanges.length - 1];
  if (last && last.team === winner && last.period >= 4 && last.left <= 60 && P(last.id)) P(last.id).gameWinner = { period: last.period, left: last.left };

  // Lineups are trusted for a team when every player's tracked time is within three minutes of his box-score minutes.
  const reliable = new Map();
  for (const t of [home, away]) reliable.set(t, plays.length > 0 && lines.filter(p => p.team === t).every(p => Math.abs(P(p.id).on.secs / 60 - p.line.min) <= 3));
  return { players, lineups: reliable, teamOpp, hasWp, hasPlays: plays.length > 0 };
}

// What garbage-time stats were worth, and the line without them.
export const garbageValue = g => g.pts + 0.4 * g.fgm + 0.7 * g.oreb + 0.3 * (g.reb - g.oreb) + 0.7 * g.ast + g.stl + 0.7 * g.blk;
const minus = (l, g) => ({ ...l, pts: l.pts - g.pts, reb: l.reb - g.reb, oreb: l.oreb - g.oreb, dreb: l.dreb - (g.reb - g.oreb), ast: l.ast - g.ast, stl: l.stl - g.stl,
  blk: l.blk - g.blk, tpm: l.tpm - g.tpm, fgm: l.fgm - g.fgm, fga: l.fga - g.fga, ftm: l.ftm - g.ftm, fta: l.fta - g.fta });

// ---- Milestones (labels only; they add nothing to the score) -------------------------------------------------------
export function milestonesOf(l) {
  const out = [];
  const tens = ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => l[k] >= 10).length;
  if (l.pts >= 60) out.push({ k: '60', label: '60-point game' });
  else if (l.pts >= 50) out.push({ k: '50', label: '50-point game' });
  else if (l.pts >= 40) out.push({ k: '40', label: '40-point game' });
  if (tens >= 4) out.push({ k: 'qd', label: 'Quadruple-double' });
  else if (tens === 3) out.push({ k: 'td', label: 'Triple-double' });
  else if (tens === 2) out.push({ k: 'dd', label: 'Double-double' });
  if (l.pts >= 20 && l.reb >= 20) out.push({ k: '2020', label: '20-20 game' });
  else if (l.reb >= 20) out.push({ k: 'reb', label: `${l.reb} rebounds` });
  if (l.ast >= 15) out.push({ k: 'ast', label: `${l.ast} assists` });
  if (['pts', 'reb', 'ast', 'stl', 'blk'].every(k => l[k] >= 5)) out.push({ k: '5x5', label: '5x5' });
  if (l.stl + l.blk >= 7) out.push({ k: 'stocks', label: `${l.stl} steals, ${l.blk} blocks` });
  if (l.tpm >= 10) out.push({ k: '3s', label: `${l.tpm} threes` });
  if (l.fga >= 8 && l.fgm === l.fga) out.push({ k: 'perfect', label: `Perfect ${l.fgm}-of-${l.fga} shooting` });
  return out;
}
const looksImpressive = l => l.pts >= 20 || ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => l[k] >= 10).length >= 2 || l.reb >= 15 || l.ast >= 12;

// ---- Categories ----------------------------------------------------------------------------------------------------
const item = (label, value) => ({ label, value: r1(value) });

// Offense, Defense and Possession: what the box score and play-by-play say he added, in points.
export function offense(l, oppStrength = 0.5) {
  const items = [];
  const tsa = l.fga + 0.44 * l.fta;
  items.push(item(`${plural(l.pts, 'point')} (${l.fgm}-${l.fga} FG, ${l.tpm}-${l.tpa} 3PT, ${l.ftm}-${l.fta} FT)`, l.pts));
  if (tsa > 0) {
    const over = l.pts - LEAGUE_PPS * tsa;
    items.push(item(`${Math.round(100 * trueShooting(l))}% true shooting: ${sgn(over)} points against an average shooter's ${r1(LEAGUE_PPS * tsa)} from the same shots`, 0.5 * over));
  }
  if (l.ast) items.push(item(plural(l.ast, 'assist'), l.ast));
  const sum = items.reduce((s, x) => s + x.value, 0);
  const f = 0.9 + 0.2 * oppStrength;
  if (Math.abs(f - 1) >= 0.01) items.push(item(`× ${f.toFixed(2)} for the opponent's strength`, sum * (f - 1)));
  return { raw: items.reduce((s, x) => s + x.value, 0), items };
}

export function defense(l, onOff = null) {
  const items = [];
  if (l.stl) items.push(item(plural(l.stl, 'steal'), 1.3 * l.stl));
  if (l.blk) items.push(item(plural(l.blk, 'block'), 0.8 * l.blk));
  if (l.dreb) items.push(item(plural(l.dreb, 'defensive rebound'), 0.3 * l.dreb));
  if (onOff) items.push(item(onOff.label, onOff.value));
  return { raw: items.reduce((s, x) => s + x.value, 0), items };
}

// tos: [{ pts, lev }] from the play-by-play, or null (box score only: each turnover costs an average 1.1).
export function possession(l, tos = null) {
  const items = [];
  if (l.oreb) items.push(item(plural(l.oreb, 'offensive rebound'), 0.8 * l.oreb));
  const touches = l.fga + 0.44 * l.fta + l.ast + l.to;
  const expected = 0.1 * touches;
  const cost = tos ? tos.reduce((s, t) => s + (0.6 + 0.5 * t.pts) * t.lev, 0) : 1.1 * l.to;
  const off = tos ? tos.reduce((s, t) => s + t.pts, 0) : null;
  if (touches > 0 || l.to) {
    const what = l.to ? `${plural(l.to, 'turnover')}${off != null ? ` (${off} opponent point${off === 1 ? '' : 's'} off them)` : ''}` : 'No turnovers';
    items.push(item(`${what}; ${r1(expected)} expected from ${Math.round(touches)} touches`, 1.1 * expected - cost));
  }
  return { raw: items.reduce((s, x) => s + x.value, 0), items, cost: r2(cost), pointsOff: off };
}

// Result: x = { won, margin, ot, road, stage, oppRecord, oppStrength, minFrac, share, pm, wpa }
export function result(x) {
  const items = [];
  const stage = STAGE[x.stage] || STAGE.regular;
  if (x.won) {
    const contrib = 0.4 * x.minFrac + 0.6 * clamp(x.share / 0.25, 0, 1.6);
    const f = (0.8 + 0.4 * x.oppStrength) * (x.road ? 1.1 : 1) * (x.ot ? 1.05 : 1) * stage.mult;
    const bits = [`Won by ${x.margin}`, x.road && 'on the road', x.ot && (x.ot > 1 ? `in ${x.ot}OT` : 'in overtime'), x.oppRecord && `against a ${x.oppRecord.w}-${x.oppRecord.l} team`, stage.mult !== 1 && `(${stage.label})`].filter(Boolean);
    items.push(item(`${bits.join(' ')}; ${Math.round(100 * x.share)}% of his team's production in ${Math.round(100 * x.minFrac)}% of the minutes`, 6.5 * contrib * f));
  } else {
    const closeness = x.ot ? 1 : clamp((20 - x.margin) / 15, 0, 1);
    items.push(item(`Lost by ${x.margin}${x.ot ? ' in overtime' : ''}${closeness >= 1 ? ' (close: half the cost)' : ''}`, -4 * x.minFrac * (1 - 0.5 * closeness)));
  }
  if (x.pm) items.push(item(`${x.pm > 0 ? '+' : ''}${x.pm} plus-minus`, clamp(0.12 * x.pm, -3, 3)));
  if (x.wpa != null && Math.abs(x.wpa) >= 0.005) items.push(item(`${sgn(100 * x.wpa)}% win probability added before crunch time`, clamp(8 * x.wpa, -3, 3)));
  return { raw: items.reduce((s, x) => s + x.value, 0), items };
}

// Clutch: x = { won, wpa (clutch WPA or null), stats (crunch-time box), plays, gameWinner }
export function clutch(x) {
  const items = [];
  const s = x.stats;
  const line = s && (s.pts || s.fga || s.fta || s.ast) ? ` (${s.pts} pts, ${s.fgm}-${s.fga} FG${s.fta ? `, ${s.ftm}-${s.fta} FT` : ''}${s.ast ? `, ${s.ast} ast` : ''})` : '';
  if (!x.plays && !x.gameWinner) items.push(item('No crunch-time plays', 0));
  else if (x.wpa != null) {
    const v = x.wpa < 0 && !x.won ? 0.5 * x.wpa : x.wpa; // in a loss a late miss costs half: his team's chances ending at zero isn't all on him
    items.push(item(`${sgn(100 * x.wpa)}% win probability added in crunch time${line}`, clamp(20 * v, -6, 8)));
  } else if (s) {
    const v = s.pts + 0.8 * s.ast - 0.6 * (s.fga - s.fgm) - 0.3 * (s.fta - s.ftm);
    items.push(item(`Crunch time${line || ': no shots'}`, clamp(0.6 * v, -4, 6)));
  }
  if (x.gameWinner) items.push(item(`The game-winner, ${clockText(x.gameWinner.left)} left${x.gameWinner.period > 4 ? ' in overtime' : ''}`, 2));
  return { raw: items.reduce((s, x) => s + x.value, 0), items, played: !!(x.plays || x.gameWinner), plays: x.plays || 0 };
}

// The 0..100 scale: a robust z-score against the reference population, capped at ±7 (so only historic nights reach
// 100, and a 70-point game still stands above a 45-point one).
export const PER_SD = 7;
export function standardize(raw, ref) {
  const z = clamp((raw - ref.median) / Math.max(ref.scale, 1e-6), -50 / PER_SD, 50 / PER_SD);
  return clamp(50 + PER_SD * z, 0, 100);
}
// The reference for a list of values: median and robust spread (1.4826 × MAD, or the mean absolute deviation when most
// values are the same and the MAD is zero, e.g. crunch time, which most players never see).
export function reference(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return { median: 0, scale: 1 };
  const med = q => { const i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  const median = med(0.5);
  const dev = v.map(x => Math.abs(x - median)).sort((a, b) => a - b);
  const mad = dev[Math.floor((dev.length - 1) / 2)];
  const mean = dev.reduce((s, x) => s + x, 0) / dev.length;
  return { median: r2(median), scale: r2(Math.max(mad > 0 ? 1.4826 * mad : 1.2533 * mean, 0.05)), n: v.length };
}

// ---- Deductions ----------------------------------------------------------------------------------------------------
// Stat padding: x = { line, usage, garbage (stats or null), starter, garbageCost (base points they were worth) }
export function padding(x) {
  const l = x.line, items = [];
  if (x.garbage && x.starter && x.garbageCost > 0.05) {
    const g = x.garbage;
    const bits = [g.pts && `${g.pts} pts`, g.reb && `${g.reb} reb`, g.ast && `${g.ast} ast`, g.stl && `${g.stl} stl`, g.blk && `${g.blk} blk`].filter(Boolean).join(', ');
    items.push({ k: 'garbage', label: `${bits || 'Stats'} in garbage time (the last 2 minutes with a 15-point lead)`, value: -r1(Math.min(CAPS.garbage, x.garbageCost)) });
  }
  if (looksImpressive(l)) {
    const tsa = l.fga + 0.44 * l.fta, short = LEAGUE_PPS * tsa - l.pts;
    if (tsa >= 15 && short > 3) items.push({ k: 'volume', label: `Volume over efficiency: ${r1(short)} points short of an average shooter on ${Math.round(tsa)} shots`, value: -r1(clamp(0.3 * (short - 3), 0, CAPS.volume)) });
    const ts = trueShooting(l);
    if (x.usage >= 0.3 && ts != null && ts < 0.53 && l.ast <= 4) items.push({ k: 'usage', label: `${Math.round(100 * x.usage)}% usage, ${Math.round(100 * ts)}% true shooting, ${plural(l.ast, 'assist')}`, value: -r1(clamp(20 * (x.usage - 0.28), 0, CAPS.usage)) });
    if (l.to >= 5 && l.to >= 0.35 * (l.pts / 2 + l.ast)) items.push({ k: 'turnovers', label: `${l.to} turnovers against ${l.pts} points and ${plural(l.ast, 'assist')}`, value: -r1(clamp(0.4 * (l.to - 4), 0, CAPS.turnovers)) });
  }
  const kept = items.filter(i => i.value < 0);
  const total = Math.max(-CAPS.padding, kept.reduce((s, i) => s + i.value, 0));
  return { value: r1(total), items: kept };
}

// Fouls: x = { fouls: [...from readPlays], fouledOut, ejected (box), ejection, share, avgMin, min, won, teamTrailing }
export function fouls(x) {
  const items = [];
  const mm = clockText;
  const when = f => `${f.period > 4 ? `OT${f.period > 5 ? f.period - 4 : ''}` : `Q${f.period}`} ${mm(f.left)}`;
  const importance = clamp((x.share || 0) / 0.25, 0.3, 1);
  // Technicals: the misconduct, and the free throw if it went in, by how close the game was.
  let tech = 0; const techBits = [];
  for (const f of x.fouls.filter(f => f.kind === 'technical' || f.kind === 'def3')) {
    const v = (f.kind === 'def3' ? 0.25 : 0.75) + 0.5 * f.ftPts * f.lev;
    tech += v;
    techBits.push(`${f.kind === 'def3' ? 'defensive 3 seconds' : 'technical'} (${when(f)}, ${f.margin > 0 ? `up ${f.margin}` : f.margin < 0 ? `down ${-f.margin}` : 'tied'}): ${f.ftAtt ? (f.ftPts ? 'the free throw went in' : 'the free throw missed') : 'no free throw recorded'}`);
  }
  if (tech) items.push({ k: 'technical', label: techBits.join('; '), value: -r1(Math.min(CAPS.technical, tech)) });
  // Personal fouls: the free throws they gave (by leverage), and fouls beyond the second. Normal physical defense
  // costs nothing (under half a point is let go); fouling on purpose late while trailing is strategy.
  let pers = 0, ftGiven = 0, n = 0;
  for (const f of x.fouls.filter(f => f.kind === 'personal' || f.kind === 'shooting' || f.kind === 'take')) {
    const strategic = f.kind === 'take' || (f.period >= 4 && f.left <= 120 && f.margin < 0);
    if (strategic) continue;
    n++; ftGiven += f.ftPts; pers += 0.08 * f.ftPts * f.lev + (n > 2 ? 0.05 : 0);
  }
  const early = (() => { const c = q => x.fouls.filter(f => PERSONAL.has(f.kind) && f.period <= q).length; return c(1) >= 2 || c(2) >= 3 || c(3) >= 5; })();
  const lost = early && x.avgMin != null ? Math.max(0, x.avgMin - x.min) : 0;
  if (pers >= 0.5) items.push({ k: 'personal', label: `${plural(n, 'personal foul')}, ${ftGiven} free-throw point${ftGiven === 1 ? '' : 's'} given`, value: -r1(pers) });
  if (lost >= 4) items.push({ k: 'trouble', label: `Early foul trouble: ${Math.round(lost)} minutes under his season average`, value: -r1(Math.min(1.5, 0.1 * lost)) });
  // Fouling out, by how close the game was, how much was left and how much he mattered.
  if (x.fouledOut) {
    const f = x.fouledOut, m = Math.abs(f.margin);
    const close = m <= 5 ? 1 : m <= 10 ? 0.6 : m <= 15 ? 0.3 : 0.1;
    const rem = gameSecondsLeft(f.period, f.left);
    items.push({ k: 'foulout', label: `Fouled out (${when(f)}, ${f.margin > 0 ? `up ${f.margin}` : f.margin < 0 ? `down ${-f.margin}` : 'tied'})`, value: -r1(CAPS.foulOut * close * (0.3 + 0.7 * Math.min(1, rem / 360)) * importance) });
  }
  // Flagrants and ejections.
  let flag = 0; const flagBits = [];
  for (const f of x.fouls.filter(f => f.kind === 'flagrant1' || f.kind === 'flagrant2')) {
    flag += (f.kind === 'flagrant2' ? 2 : 1) + 0.12 * f.ftPts * f.lev;
    flagBits.push(`flagrant ${f.kind === 'flagrant2' ? '2' : '1'} (${when(f)}, ${f.ftPts} free-throw point${f.ftPts === 1 ? '' : 's'} given)`);
  }
  if (x.ejected) {
    const e = x.ejection;
    const rem = e ? gameSecondsLeft(e.period, e.left) : 0;
    flag += 6 * (rem / 2880) * importance + (e ? 0 : 1);
    flagBits.push(e ? `ejected with ${mm(rem)} of the game left` : 'ejected');
  }
  if (flag) items.push({ k: 'flagrant', label: flagBits.join('; '), value: -r1(Math.min(CAPS.flagrant, flag)) });
  // Personal fouls and foul trouble share one cap.
  const persTotal = items.filter(i => i.k === 'personal' || i.k === 'trouble').reduce((s, i) => s + i.value, 0);
  if (persTotal < -CAPS.personal) { const scale = -CAPS.personal / persTotal; for (const i of items) if (i.k === 'personal' || i.k === 'trouble') i.value = r1(i.value * scale); }
  const total = Math.max(-CAPS.fouls, items.reduce((s, i) => s + i.value, 0));
  return { value: r1(total), items };
}

// ---- Scoring a game ------------------------------------------------------------------------------------------------
const teamLine = ps => ps.reduce((t, p) => ({ min: t.min + p.line.min, fga: t.fga + p.line.fga, fta: t.fta + p.line.fta, to: t.to + p.line.to }), { min: 0, fga: 0, fta: 0, to: 0 });

// Score every player who appeared in one game. history: Map(player id -> { avgMin }) from his season before tonight.
// calibration: { [category]: { median, scale } }.
export function scoreGame(sum, history = new Map(), calibration = CALIBRATION.categories) {
  const game = gameOf(sum);
  if (!game) return { game: null, perfs: [] };
  const lines = linesOf(sum);
  const pbp = readPlays(sum, game, lines);
  const teams = new Map(game.teams.map(t => [t.id, t]));
  const totals = new Map(game.teams.map(t => [t.id, teamLine(lines.filter(p => p.team === t.id))]));
  const gameMinutes = 48 + 5 * game.ot;

  const rows = lines.map(p => {
    const l = p.line, me = teams.get(p.team), opp = game.teams.find(t => t.id !== p.team);
    const rec = pbp.players.get(p.id);
    const oppStrength = strength(opp?.record, !!opp?.winner);
    // On/off defense: the opponent's points per possession with him on the floor against without him, from reliable
    // lineups only, shrunk hard (one game is a small sample).
    let onOff = null;
    if (pbp.lineups.get(p.team) && rec.on.oppPoss >= 10) {
      const t = pbp.teamOpp.get(p.team), offPoss = t.poss - rec.on.oppPoss;
      if (offPoss >= 10) {
        const onRate = rec.on.oppPts / rec.on.oppPoss, offRate = (t.pts - rec.on.oppPts) / offPoss;
        onOff = { label: `Opponent ${r2(onRate).toFixed(2)} points per possession with him on the floor, ${r2(offRate).toFixed(2)} without`, value: clamp(0.1 * (offRate - onRate) * rec.on.oppPoss, -2, 2) };
      }
    }
    const tos = pbp.hasPlays ? rec.tos : null;
    const usage = usageRate(l, totals.get(p.team));
    const garbage = p.starter && rec.garbage && garbageValue(rec.garbage) > 0 ? rec.garbage : null;
    const clean = garbage ? minus(l, garbage) : null;
    return { p, l, me, opp, rec, oppStrength, onOff, tos, usage, garbage, clean,
      off: offense(l, oppStrength), def: defense(l, onOff), pos: possession(l, tos),
      offC: clean && offense(clean, oppStrength), defC: clean && defense(clean, onOff), posC: clean && possession(clean, tos) };
  });

  // His share of his team's production (offense and defense, positive parts), for how much of a win is his.
  const teamProd = new Map();
  for (const r of rows) teamProd.set(r.p.team, (teamProd.get(r.p.team) || 0) + Math.max(0, r.off.raw + r.def.raw));

  const perfs = rows.map(r => {
    const { p, l, me, opp, rec } = r;
    const share = Math.max(0, r.off.raw + r.def.raw) / Math.max(1, teamProd.get(p.team));
    const won = !!me?.winner, margin = Math.abs((me?.score || 0) - (opp?.score || 0));
    const res = result({ won, margin, ot: game.ot, road: !me?.home, stage: game.stage, oppRecord: opp?.record, oppStrength: r.oppStrength,
      minFrac: Math.min(1, l.min / gameMinutes), share, pm: l.pm, wpa: pbp.hasWp ? rec.wpa : null });
    const clu = pbp.hasPlays ? clutch({ won, wpa: pbp.hasWp ? rec.wpaClutch : null, stats: rec.clutch, plays: rec.clutchPlays, gameWinner: rec.gameWinner }) : null;
    const cats = { result: res, offense: r.off, defense: r.def, possession: r.pos, clutch: clu };
    const missing = [];
    if (!pbp.hasPlays) missing.push('play-by-play (turnover and foul consequences, crunch time, garbage time, lineups)');
    else {
      if (!pbp.hasWp) missing.push('win probability (crunch time is judged by its box score)');
      if (!pbp.lineups.get(p.team)) missing.push('reliable lineups (no on/off defense)');
    }
    // Weighted base; a category without data gives its weight to the others.
    const weights = Object.fromEntries(CATEGORIES.filter(k => cats[k]).map(k => [k, WEIGHTS[k]]));
    const wsum = Object.values(weights).reduce((s, w) => s + w, 0);
    // Crunch time is measured against players who had some; without any it is neutral.
    const scoreOf = (c, k) => (k === 'clutch' && !c.played ? 50 : standardize(c.raw, calibration[k]));
    const base = (cs) => Object.entries(weights).reduce((s, [k, w]) => s + (w / wsum) * scoreOf(cs[k], k), 0);
    const full = base(cats);
    const garbageCost = r.clean ? full - base({ ...cats, offense: r.offC, defense: r.defC, possession: r.posC }) : 0;
    const pad = padding({ line: l, usage: r.usage, garbage: r.garbage, starter: p.starter, garbageCost });
    const fl = pbp.hasPlays || p.ejected ? fouls({ fouls: rec.fouls, fouledOut: rec.fouledOut || (l.pf >= 6 && !pbp.hasPlays ? { period: 4, left: 0, margin: 99 } : null), ejected: p.ejected || !!rec.ejection,
      ejection: rec.ejection, share, avgMin: history.get(p.id)?.avgMin ?? null, min: l.min }) : { value: 0, items: [] };
    const score = r1(clamp(full + pad.value + fl.value, 0, 100));

    const kept = milestonesOf(r.clean || l), lostMilestones = milestonesOf(l).filter(m => !kept.some(k => k.k === m.k));
    if (lostMilestones.length && pad.items[0]?.k === 'garbage') pad.items[0].label += `; the ${lostMilestones.map(m => m.label.toLowerCase()).join(' and ')} came in garbage time`;
    const categories = Object.fromEntries(CATEGORIES.map(k => [k, cats[k] ? { score: r1(scoreOf(cats[k], k)), raw: r1(cats[k].raw), weight: r2(weights[k] / wsum), items: cats[k].items, ...(k === 'clutch' ? { played: cats[k].played, plays: cats[k].plays } : {}) } : null]));
    const tags = kept.map(m => m.label);
    if (pad.value <= -3) tags.push('Padded');
    if (categories.clutch?.score >= 85) tags.push('Clutch');
    if (rec.gameWinner) tags.push('Game-winner');
    if (rec.fouledOut || (l.pf >= 6)) tags.push('Fouled out');
    if (p.ejected || rec.ejection) tags.push('Ejected');
    const techs = rec.fouls.filter(f => f.kind === 'technical').length, flagrants = rec.fouls.filter(f => /flagrant/.test(f.kind)).length;
    return {
      id: p.id, name: p.name, pos: p.pos, headshot: p.headshot, starter: p.starter, event: game.id, stage: game.stage,
      team: me ? { id: me.id, abbr: me.abbr, name: me.name, logo: me.logo, color: me.color } : { id: p.team },
      opp: opp ? { id: opp.id, abbr: opp.abbr, name: opp.name, logo: opp.logo } : null,
      home: !!me?.home,
      result: me && opp ? `${me.winner ? 'W' : 'L'} ${me.score}-${opp.score}${game.ot ? (game.ot > 1 ? ` ${game.ot}OT` : ' OT') : ''}` : '',
      line: { ...l, tech: techs, flagrant: flagrants, ts: trueShooting(l) == null ? null : r2(trueShooting(l)), efg: effectiveFg(l) == null ? null : r2(effectiveFg(l)), usage: r.usage == null ? null : r2(r.usage),
        astTo: l.to ? r1(l.ast / l.to) : null, pointsOff: r.pos.pointsOff },
      score, base: r1(full), categories, padding: pad, fouls: fl, tags, gs: r1(gameScore(l)), eligible: l.min >= MIN_MINUTES,
      confidence: { level: !pbp.hasPlays ? 'low' : missing.length ? 'medium' : 'high', missing },
    };
  });
  return { game, perfs };
}

// The night's ranking: best score first; ties go to the higher base score, then Game Score.
export const rank = perfs => [...perfs].sort((a, b) => b.score - a.score || b.base - a.base || b.gs - a.gs);

// ---- Explaining the night ------------------------------------------------------------------------------------------
const CAT_NAME = { result: 'team result', offense: 'offense', defense: 'defense', possession: 'possession', clutch: 'crunch time' };
const strongest = c => (c.items || []).filter(i => i.value > 0).sort((a, b) => b.value - a.value)[0]?.label;
const weakest = c => (c.items || []).filter(i => i.value < 0 && !i.label.startsWith('×')).sort((a, b) => a.value - b.value)[0]?.label;

// Why No. 1 won, and where the next ones lost ground. ranked: the night's performances, best first.
export function explainNight(ranked) {
  const [w, ...rest] = ranked;
  if (!w) return null;
  const why = [];
  const catRank = k => 1 + ranked.filter(p => (p.categories[k]?.score ?? -1) > (w.categories[k]?.score ?? -1)).length;
  for (const k of CATEGORIES.filter(k => w.categories[k]).sort((a, b) => w.categories[b].score - w.categories[a].score)) {
    const c = w.categories[k];
    if (c.score < 60 && why.length >= 2) break;
    why.push(`${CAT_NAME[k][0].toUpperCase()}${CAT_NAME[k].slice(1)} ${Math.round(c.score)}/100 (#${catRank(k)} tonight)${strongest(c) ? `: ${strongest(c)}` : ''}`);
    if (why.length >= 3) break;
  }
  const ded = [...w.padding.items, ...w.fouls.items];
  if (ded.length) why.push(`Deductions: ${ded.map(d => `${d.label} (${d.value})`).join('; ')}`);
  else why.push('No deductions: no stat padding, no costly fouls');
  const competitors = rest.slice(0, 2).map(p => {
    const gaps = CATEGORIES.filter(k => w.categories[k] && p.categories[k])
      .map(k => ({ k, d: r1(w.categories[k].weight * w.categories[k].score - p.categories[k].weight * p.categories[k].score) }))
      .sort((a, b) => b.d - a.d);
    const behind = gaps.filter(g => g.d >= 0.5).slice(0, 2).map(g => `${CAT_NAME[g.k]} (−${g.d}${weakest(p.categories[g.k]) ? `: ${weakest(p.categories[g.k])}` : ''})`);
    const ahead = gaps.filter(g => g.d <= -0.5).map(g => `${CAT_NAME[g.k]} (+${-g.d})`);
    const dd = r1(p.padding.value + p.fouls.value - w.padding.value - w.fouls.value);
    const lines = [];
    if (behind.length) lines.push(`Lost ground on ${behind.join(' and ')}`);
    if (dd <= -0.5) lines.push(`deductions cost him ${-dd} more (${[...p.padding.items, ...p.fouls.items].map(d => d.label).join('; ')})`);
    if (ahead.length) lines.push(`was ahead on ${ahead.join(', ')}`);
    return { id: p.id, name: p.name, score: p.score, gap: r1(w.score - p.score), text: lines.join('; ') || 'Close on every count' };
  });
  return { id: w.id, name: w.name, why, competitors };
}
