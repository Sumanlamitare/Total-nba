// Performance detection. Fixed thresholds (configurable in Settings) are only the start: each line is also measured
// against the player's own season (z-scores), career and season highs, the league's season highs, how rare the
// combination is across every box score in the database, and — from play-by-play — what he did in clutch time.
import { derive, tens, statLine, splits, STAT } from './stats.js';
import { round, ordinal } from './util.js';

const CORE = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'fgm', 'ftm', 'tov', 'min'];

// Each player's history before this game: career highs (overall and by season type), season-to-date sums and squares.
export async function contexts(d, pids, { gid, season }) {
  if (!pids.length) return new Map();
  const maxes = {}, seasonAgg = {};
  for (const k of CORE) {
    maxes[`hi_${k}`] = { $max: `$${k}` };
    maxes[`hi2_${k}`] = { $max: { $cond: [{ $eq: ['$st', 2] }, `$${k}`, null] } };
    maxes[`hi3_${k}`] = { $max: { $cond: [{ $eq: ['$st', 3] }, `$${k}`, null] } };
    maxes[`shi_${k}`] = { $max: { $cond: [{ $and: [{ $eq: ['$s', season] }, { $eq: ['$st', 2] }] }, `$${k}`, null] } };
    seasonAgg[`sum_${k}`] = { $sum: { $cond: [{ $and: [{ $eq: ['$s', season] }, { $eq: ['$st', 2] }] }, `$${k}`, 0] } };
    seasonAgg[`sq_${k}`] = { $sum: { $cond: [{ $and: [{ $eq: ['$s', season] }, { $eq: ['$st', 2] }] }, { $multiply: [`$${k}`, `$${k}`] }, 0] } };
  }
  const rows = await d.collection('pgames').aggregate([
    { $match: { p: { $in: pids }, g: { $ne: gid } } },
    { $group: { _id: '$p', games: { $sum: 1 }, first: { $min: '$d' }, sgp: { $sum: { $cond: [{ $and: [{ $eq: ['$s', season] }, { $eq: ['$st', 2] }] }, 1, 0] } }, ...maxes, ...seasonAgg } },
  ]).toArray();
  const out = new Map();
  for (const r of rows) {
    const c = { games: r.games, first: r.first, gp: r.sgp, highs: {}, highs2: {}, highs3: {}, seasonHighs: {}, avg: {}, sd: {} };
    for (const k of CORE) {
      c.highs[k] = r[`hi_${k}`]; c.highs2[k] = r[`hi2_${k}`]; c.highs3[k] = r[`hi3_${k}`]; c.seasonHighs[k] = r[`shi_${k}`];
      if (r.sgp) { const m = r[`sum_${k}`] / r.sgp; c.avg[k] = m; c.sd[k] = Math.sqrt(Math.max(0, r[`sq_${k}`] / r.sgp - m * m)); }
    }
    out.set(r._id, c);
  }
  return out;
}

// League season highs before this game (regular season), for the stats that matter on a graphic.
export async function leagueSeasonHighs(d, season, gid) {
  const group = Object.fromEntries(['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'].map(k => [k, { $max: `$${k}` }]));
  const [r] = await d.collection('pgames').aggregate([{ $match: { s: season, st: 2, g: { $ne: gid } } }, { $group: { _id: null, ...group } }]).toArray();
  return r || {};
}

const secs = c => { const m = String(c || '').match(/^(\d+):(\d+(?:\.\d+)?)$/); return m ? +m[1] * 60 + +m[2] : Number.isFinite(+c) ? +c : null; };

// Clutch scoring and the game-winner, from play-by-play. Clutch: the last five minutes of the fourth quarter or any
// overtime with the margin within five before the play.
export function clutchFromPlays(center, { seconds = 300, margin = 5 } = {}) {
  const g = center.game, plays = center.plays || [];
  const homeId = g.teams.find(t => t.home)?.id;
  const out = new Map();
  let away = 0, home = 0;
  for (const p of plays) {
    const t = secs(p.clock);
    if (p.scoring && p.value > 0 && p.period >= 4 && t != null && t <= seconds && Math.abs(away - home) <= margin && p.players[0]) {
      const c = out.get(p.players[0]) || { pts: 0, plays: [] };
      c.pts += p.value; c.plays.push(`${p.clock} Q${p.period}: ${p.text}`);
      out.set(p.players[0], c);
    }
    if (p.scoring) { away = p.away; home = p.home; }
  }
  // Game-winner: the score that gave the winner the lead for good, with under 30 seconds left in the final period.
  let winner = null;
  if (g.status === 'final' && plays.length) {
    const win = g.teams.find(t => t.winner);
    const lastPeriod = Math.max(...plays.map(p => p.period));
    let lead = null;
    for (const p of plays) {
      if (!p.scoring) continue;
      const diff = p.home - p.away;
      const leader = diff > 0 ? homeId : diff < 0 ? g.teams.find(t => !t.home)?.id : null;
      if (leader === win?.id && lead !== win?.id) winner = p;
      lead = leader;
    }
    const t = winner ? secs(winner.clock) : null;
    if (!winner || winner.period !== lastPeriod || t == null || t > 30) winner = null;
  }
  return { clutch: out, winner: winner ? { pid: winner.players[0], text: winner.text, clock: winner.clock, period: winner.period } : null };
}

// How rare a line is across every game in the database, and who did it last ("first since").
export async function rarity(d, l, { date, gid, stype }) {
  const cond = {};
  if (l.pts >= 30) cond.pts = { $gte: Math.floor(l.pts / 5) * 5 };
  if (l.reb >= 10) cond.reb = { $gte: l.reb >= 15 ? Math.floor(l.reb / 5) * 5 : 10 };
  if (l.ast >= 10) cond.ast = { $gte: l.ast >= 15 ? Math.floor(l.ast / 5) * 5 : 10 };
  if (l.stl >= 5) cond.stl = { $gte: l.stl };
  if (l.blk >= 5) cond.blk = { $gte: l.blk };
  if (l.tpm >= 8) cond.tpm = { $gte: l.tpm };
  if (Object.keys(cond).length < 2 && !(cond.pts && l.pts >= 50) && !cond.tpm) return null;
  const q = { ...cond, st: stype === 3 ? 3 : 2, g: { $ne: gid } };
  const [count, last] = await Promise.all([
    d.collection('pgames').countDocuments(q),
    d.collection('pgames').find({ ...q, d: { $lt: +date } }).sort({ d: -1 }).limit(1).toArray(),
  ]);
  const desc = Object.entries(cond).map(([k, v]) => `${v.$gte}+ ${STAT[k].short}`).join(', ');
  return { condition: desc, count, last: last[0] ? { pid: last[0].p, date: String(last[0].d), gid: last[0].g } : null };
}

const T = (key, label, weight, detail) => ({ key, label, weight, ...(detail ? { detail } : {}) });

// Detect the notable performances in one game (live or final). ctx: contexts(), seasonHighs: leagueSeasonHighs().
export function detectLines(center, ctx, seasonHighs, settings, { clutch, winner } = {}) {
  const S = settings.detection;
  const g = center.game, final = g.status === 'final';
  const teams = Object.fromEntries(g.teams.map(t => [t.id, t]));
  const out = [];
  for (const p of center.players) {
    if (!p.line || p.line.min <= 0) continue;
    const l = derive(p.line), c = ctx.get(p.id) || null;
    const tags = [];
    // Scoring tiers.
    const tier = [...S.points].sort((a, b) => b - a).find(x => l.pts >= x);
    if (tier) tags.push(T(`pts${tier}`, `${tier}+ points`, tier >= 60 ? 100 : tier >= 50 ? 85 : tier >= 40 ? 65 : tier >= 30 ? 38 : 12));
    const t = tens(l);
    if (t.length >= 4) tags.push(T('qd', 'Quadruple-double', 120));
    else if (t.length === 3) tags.push(T('td', 'Triple-double', 45));
    else if (t.length === 2) tags.push(T('dd', 'Double-double', 8));
    // Highs (only with a history to compare against).
    if (c && c.games >= 10) {
      for (const k of settings.records.careerHighStats) {
        const hi = c.highs[k];
        if (hi == null || l[k] <= 0 || l[k] < Math.max(hi, k === 'pts' ? 15 : 5)) continue;
        const w = (k === 'pts' ? 35 : 20) * (l[k] > hi ? 1 : 0.6);
        tags.push(T(`ch_${k}`, `${l[k] > hi ? 'Career high' : 'Ties career high'}: ${l[k]} ${STAT[k].short}`, w, { stat: k, previous: hi, tie: l[k] === hi }));
      }
      for (const k of ['pts', 'reb', 'ast', 'tpm']) {
        const hi = c.seasonHighs[k];
        if (c.gp >= 3 && hi != null && l[k] > hi && !tags.some(x => x.key === `ch_${k}`) && l[k] >= (k === 'pts' ? 20 : 8)) tags.push(T(`sh_${k}`, `Season high: ${l[k]} ${STAT[k].short}`, 8, { stat: k, previous: hi }));
      }
    }
    for (const k of ['pts', 'reb', 'ast', 'tpm', 'stl', 'blk']) {
      const hi = seasonHighs?.[k];
      if (hi != null && l[k] > hi && l[k] >= (k === 'pts' ? 30 : 5) && g.stype === 2) tags.push(T(`lsh_${k}`, `League season high: ${l[k]} ${STAT[k].short}`, 22, { stat: k, previous: hi }));
    }
    // Efficiency and inefficiency.
    if (l.pts >= S.efficient.minPts && l.ts_pct >= S.efficient.ts) tags.push(T('efficient', `Efficient: ${round(l.ts_pct, 1)}% true shooting`, 15));
    if (l.fga >= S.poorShooting.fga && l.fg_pct <= S.poorShooting.fgPct) tags.push(T('poor', `Poor shooting: ${l.fgm}-${l.fga} FG`, -15));
    if (l.tpa >= S.threeBrick.tpa && l.tpm === 0) tags.push(T('brick3', `0-for-${l.tpa} from three`, -10));
    if (l.tov >= S.turnovers) tags.push(T('tov', `${l.tov} turnovers`, -10));
    // Defense.
    if (l.stocks >= S.defense.stocks || l.blk >= S.defense.blk || l.stl >= S.defense.stl) tags.push(T('defense', `Defense: ${l.stl} STL, ${l.blk} BLK`, 18 + 3 * (l.stocks - S.defense.stocks)));
    // Clutch.
    const cl = clutch?.get(p.id);
    if (cl && cl.pts >= S.clutch.pts) tags.push(T('clutch', `${cl.pts} clutch points`, 25, { plays: cl.plays.slice(-4) }));
    if (winner?.pid === p.id) tags.push(T('winner', 'Game-winning basket', 40, { text: winner.text, clock: winner.clock }));
    // Against the player's own season: outliers in either direction.
    if (c && c.gp >= 5) {
      for (const k of ['pts', 'reb', 'ast', 'tpm', 'stl', 'blk']) {
        const m = c.avg[k], sd = Math.max(c.sd[k], k === 'pts' ? 4 : 1.5);
        const z = (l[k] - m) / sd;
        if (z >= S.outlierZ && l[k] >= (k === 'pts' ? 20 : 6)) tags.push(T(`z_${k}`, `${l[k]} ${STAT[k].short} (season average ${round(m, 1)})`, Math.min(30, 8 * (z - 1)), { avg: round(m, 1), z: round(z, 1) }));
      }
      if (c.avg.pts <= S.rolePlayer.avgMax && l.pts >= S.rolePlayer.minPts) tags.push(T('role', `Role player: ${l.pts} points (averages ${round(c.avg.pts, 1)})`, 15));
      // Disappointments: stars well below their scoring, or shooting / turnover nights.
      if (c.avg.pts >= S.disappointment.minAvg && final && l.min >= 20) {
        const bad = [];
        if (l.pts <= S.disappointment.ratio * c.avg.pts) bad.push(`${l.pts} points (averages ${round(c.avg.pts, 1)})`);
        if (l.fga >= 12 && l.fg_pct <= 30) bad.push(`${l.fgm}-${l.fga} shooting`);
        if (l.tov >= S.turnovers) bad.push(`${l.tov} turnovers`);
        if (bad.length) tags.push(T('disappointment', `Off night: ${bad.join(', ')}`, 0, { avg: round(c.avg.pts, 1), reasons: bad }));
      }
    }
    if (!tags.length) continue;
    const disappointing = tags.some(x => x.key === 'disappointment');
    const positive = tags.filter(x => x.weight > 0).reduce((a, x) => a + x.weight, 0);
    const score = Math.round(positive + Math.max(0, l.gmsc - 15) * 1.2 + tags.filter(x => x.weight < 0).reduce((a, x) => a + x.weight, 0) * 0.5);
    const disScore = disappointing ? Math.round(30 + (c ? (c.avg.pts - l.pts) * 2 : 0) + (l.tov >= S.turnovers ? 10 : 0) + (l.fga >= 12 && l.fg_pct <= 30 ? 10 : 0)) : 0;
    const team = teams[p.team], opp = g.teams.find(x => x.id !== p.team);
    out.push({
      _id: `${g.id}:${p.id}`, gid: g.id, pid: p.id, name: p.name, short: p.short, pos: p.pos, headshot: p.headshot, team: { id: team.id, abbr: team.abbr, name: team.name, color: team.color, alt: team.alt, logo: team.logo, score: team.score, winner: team.winner },
      opp: { id: opp?.id, abbr: opp?.abbr, name: opp?.name, logo: opp?.logo, score: opp?.score, color: opp?.color }, home: team.home,
      date: g.date, season: g.season, stype: g.stype, state: final ? 'final' : 'live', clock: final ? 'Final' : g.detail,
      line: p.line, derived: { ts_pct: round(l.ts_pct, 1), efg_pct: round(l.efg_pct, 1), fg_pct: round(l.fg_pct, 1), tp_pct: round(l.tp_pct, 1), ft_pct: round(l.ft_pct, 1), gmsc: round(l.gmsc, 1) },
      statLine: statLine(l), splits: splits(l), starter: p.starter,
      tags: tags.sort((a, b) => b.weight - a.weight), score: Math.max(0, score), disappointment: disappointing ? disScore : 0,
      context: c ? { gp: c.gp, avg: Object.fromEntries(Object.entries(c.avg).map(([k, v]) => [k, round(v, 1)])), highs: c.highs, games: c.games } : null,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// Editorial angle: one sentence from the strongest facts (all from the data; nothing invented).
export function angle(perf, rare) {
  const n = perf.name, l = perf.line, tags = perf.tags;
  const has = k => tags.find(t => t.key === k || t.key.startsWith(k));
  const res = perf.team.winner ? `in a ${perf.team.score}-${perf.opp.score} win over the ${perf.opp.name}` : `in a ${perf.team.score}-${perf.opp.score} loss to the ${perf.opp.name}`;
  const live = perf.state === 'live';
  const where = live ? `against the ${perf.opp.name} (${perf.clock})` : res;
  if (has('winner')) return `${n} delivered the game-winner and finished with ${perf.statLine} ${where}.`;
  const ch = tags.find(t => t.key.startsWith('ch_'));
  if (ch) return `${n} ${ch.detail.tie ? 'matched' : 'set'} a career high with ${l[ch.detail.stat]} ${STAT[ch.detail.stat].label.toLowerCase()} ${where}${ch.detail.tie ? '' : ` (previous best: ${ch.detail.previous})`}.`;
  if (rare?.count != null && rare.count <= 25 && !live) return `${n}'s ${perf.statLine} line (${rare.condition}) has happened ${rare.count === 0 ? 'for the first time' : `only ${rare.count} other time${rare.count === 1 ? '' : 's'}`} in the box-score era (since 1993-94).`;
  if (has('qd') || has('td')) return `${n} posted a triple-double — ${perf.statLine} — ${where}.`;
  if (has('lsh_')) { const t = has('lsh_'); return `${n}'s ${l[t.detail.stat]} ${STAT[t.detail.stat].label.toLowerCase()} are the most by anyone this season (previous high: ${t.detail.previous}).`; }
  if (has('disappointment')) { const t = has('disappointment'); return `A night to forget for ${n}: ${t.detail.reasons.join(', ')} ${where}.`; }
  if (has('clutch')) return `${n} took over late: ${has('clutch').label.toLowerCase()} on the way to ${l.pts} points ${where}.`;
  if (has('efficient')) return `${n} scored ${l.pts} on ${perf.splits.split(' · ')[0]} shooting (${perf.derived.ts_pct}% true shooting) ${where}.`;
  if (has('role')) return `Off the radar: ${n} scored ${l.pts} ${where}, well above a season average of ${perf.context?.avg?.pts}.`;
  if (has('defense')) return `${n} wrecked the game defensively with ${l.stl} steals and ${l.blk} blocks ${where}.`;
  return `${n}: ${perf.statLine} ${where}.`;
}

export const headlineFor = perf => {
  const top = perf.tags.find(t => t.weight > 0) || perf.tags[0];
  return top ? top.label : perf.statLine;
};
export { ordinal };
