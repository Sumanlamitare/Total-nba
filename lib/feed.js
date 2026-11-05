// The live feed. Every story — from play-by-play (lib/intel.js), player lines (lib/detect.js), record and milestone
// events (lib/events.js), team streaks, Performance of the Night — becomes one feed entry with a stable id. A story that
// develops updates its entry (and moves it back to the top when it escalates) instead of creating another. Each entry
// carries its sources, retrieval time, verification status, and whether its words are the house rules or AI-written.
//
// Significance (0–100) → level: critical ≥ 85, high ≥ 65, medium ≥ 40, low. Only entries at or above the configured
// threshold, in enabled categories, are published to the feed; the rest stay visible in Game Intelligence.
import { pick } from './voice.js';
import { titleOf } from './titles.js';
import { STAT } from './stats.js';
import { round } from './util.js';

export const CATEGORIES = {
  record: { label: 'Record', color: 'orange' }, milestone: { label: 'Milestone', color: 'gold' }, 'game-winner': { label: 'Game winner', color: 'red' },
  'defensive-winner': { label: 'Defensive game winner', color: 'blue' }, comeback: { label: 'Comeback watch', color: 'purple' }, 'comeback-done': { label: 'Comeback', color: 'purple' },
  close: { label: 'Close game', color: 'red' }, overtime: { label: 'Overtime', color: 'red' }, run: { label: 'Scoring run', color: 'orange' }, 'solo-run': { label: 'Solo run', color: 'orange' },
  'role-player': { label: 'Role player', color: 'green' }, breakout: { label: 'Breakout', color: 'green' }, rookie: { label: 'Rookie', color: 'green' }, 'triple-double': { label: 'Triple-double', color: 'gold' },
  scoring: { label: 'Scoring', color: 'orange' }, defense: { label: 'Defense', color: 'blue' }, clutch: { label: 'Clutch', color: 'red' }, streak: { label: 'Streak', color: 'blue' },
  blowout: { label: 'Blowout', color: 'gray' }, collapse: { label: 'Collapse', color: 'purple' }, disappointment: { label: 'Rough night', color: 'gray' }, potn: { label: 'Performance of the Night', color: 'gold' },
};
export const levelOf = s => (s >= 85 ? 'critical' : s >= 65 ? 'high' : s >= 40 ? 'medium' : 'low');
export const FEED_DEFAULTS = { minScore: 50, perGameRunCap: 3, aiWriting: true, categories: Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, true])), boostFavorites: 10 };

async function nextSeq(d) {
  const m = await d.collection('meta').findOneAndUpdate({ _id: 'feedseq' }, { $inc: { n: 1 } }, { upsert: true, returnDocument: 'after' });
  return m?.n ?? Date.now();
}

const teamObj = t => (t ? { id: t.id, abbr: t.abbr, name: t.name, short: t.short, logo: t.logo, color: t.color, alt: t.alt } : null);
export function gameCtx(g, { live } = {}) {
  const away = g.teams.find(t => !t.home) || g.teams[0], home = g.teams.find(t => t.home) || g.teams[1];
  const status = g.status === 'final' ? `Final${g.ot ? `/${g.ot > 1 ? g.ot : ''}OT` : ''}` : g.detail || g.status;
  return { id: g.id, date: g.date, season: g.season, stype: g.stype, status: g.status, live: live ?? g.status !== 'final', label: status,
    teams: [away, home].map(t => ({ id: t.id, abbr: t.abbr, name: t.name, short: t.short, logo: t.logo, color: t.color, score: t.score, winner: !!t.winner, record: t.record })) };
}

// Save one story. Returns { entry, created, escalated }.
export async function upsert(d, story, settings) {
  const F = { ...FEED_DEFAULTS, ...(settings.feed || {}) };
  const col = d.collection('feed');
  const prev = await col.findOne({ _id: story._id });
  const now = new Date();
  let sig = Math.max(0, Math.min(100, Math.round(story.significance)));
  // Favorites (settings watchlists) get a bump.
  const fav = settings.watch || {};
  if ((fav.teams || []).some(t => story.teams?.includes(t)) || (fav.players || []).some(p => story.players?.some(x => x.id === p))) sig = Math.min(100, sig + F.boostFavorites);
  if (story.game?.stype === 3) sig = Math.min(100, sig + 6); // playoffs
  let published = sig >= F.minScore && F.categories[story.category] !== false;
  // Scope: the whole NBA, or only the watched teams / players.
  if (F.scope === 'teams' && !(fav.teams || []).some(t => story.teams?.includes(t))) published = false;
  if (F.scope === 'players' && !(fav.players || []).some(p => story.players?.some(x => x.id === p))) published = false;
  // Spam control: a game gets at most perGameRunCap published scoring/solo runs — the most significant ones.
  if (published && ['run', 'solo-run'].includes(story.category) && !prev?.published) {
    const others = await col.find({ 'game.id': story.game?.id, category: { $in: ['run', 'solo-run'] }, published: true, _id: { $ne: story._id } }, { projection: { significance: 1 } }).toArray();
    if (others.length >= F.perGameRunCap) {
      const weakest = others.sort((a, b) => a.significance - b.significance)[0];
      if (sig <= weakest.significance) published = false;
      else await col.updateOne({ _id: weakest._id }, { $set: { published: false, seq: await nextSeq(d) } });
    }
  }
  const doc = { ...story, title: story.title || titleOf(story), significance: sig, level: levelOf(sig), published: prev?.published && !published && prev.unpublishedByCap ? false : published || !!prev?.published, updatedAt: now };
  if (!prev) {
    const seq = await nextSeq(d);
    // sortAt orders the feed: when the moment happened (a recap's play time), or when the story last escalated.
    await col.insertOne({ ...doc, seq, rank: seq, sortAt: new Date(Math.min(+now, +(story.occurredAt ? new Date(story.occurredAt) : now))), createdAt: now, history: [{ at: now, headline: doc.headline, level: doc.level, status: doc.status }], reactions: {}, comments: 0 });
    return { entry: { ...doc, seq }, created: true };
  }
  const changed = prev.headline !== doc.headline || prev.title !== doc.title || prev.body !== doc.body || prev.status !== doc.status || prev.verification?.status !== doc.verification?.status;
  const escalated = sig >= (prev.significance || 0) + 8 || (levelOf(sig) !== prev.level && sig > prev.significance) || (doc.status === 'final' && prev.status !== 'final' && sig >= 65);
  // An entry first saved with the processing time gets its real moment back (recaps).
  const at = story.occurredAt ? new Date(story.occurredAt) : null;
  if (at && !prev.escalatedAt && prev.sortAt && at < new Date(prev.sortAt)) await col.updateOne({ _id: prev._id }, { $set: { sortAt: at, occurredAt: at } });
  if (!changed && !escalated) return { entry: prev, created: false };
  const { _id, ...rest } = doc;
  const set = { ...rest, aiBody: changed ? null : prev.aiBody, ai: changed ? null : prev.ai };
  if (prev.headline !== doc.headline || prev.status !== doc.status) set.history = [...(prev.history || []), { at: now, headline: doc.headline, level: doc.level, status: doc.status }].slice(-12);
  if (changed || escalated) set.seq = await nextSeq(d);
  if (escalated) { set.escalatedAt = now; set.rank = set.seq; set.sortAt = now; }
  await col.updateOne({ _id: prev._id }, { $set: set });
  return { entry: { ...prev, ...set }, created: false, escalated };
}

const sourcesOf = (c, verify) => [
  { name: 'ESPN play-by-play and box score', url: c.url, at: c.fetchedAt },
  ...(verify?.cross?.url ? [{ name: 'NBA.com box score (cross-check)', url: verify.cross.url, at: verify.cross.at, status: verify.cross.status }] : []),
];
const verification = (g, verify) => (g.status !== 'final' ? { status: 'developing', note: 'Live data — not final' } : verify ? { status: verify.status, checks: verify.checks, at: verify.at } : { status: 'pending' });

// Play-by-play stories → feed entries.
export function fromIntel(s, c, verify) {
  const g = c.game;
  const players = (s.players || []).map(pid => c.players.find(p => p.id === pid)).filter(Boolean).map(p => ({ id: p.id, name: p.name, headshot: p.headshot, team: g.teams.find(t => t.id === p.team)?.abbr }));
  const team = s.team ? teamObj(g.teams.find(t => t.id === s.team)) : null;
  // Outcomes need a verified final box score; until then they stay unpublished.
  const confirmed = s.status === 'final' ? (verify && ['verified', 'consistent'].includes(verify.status)) : true;
  return {
    _id: s.key, category: s.category, significance: confirmed ? s.significance : 0, status: s.status === 'final' ? (confirmed ? 'final' : 'pending') : 'developing',
    headline: s.headline, body: s.body, facts: s.facts, stats: s.stats || [], players, team, teams: g.teams.map(t => t.id),
    game: { ...gameCtx(g), moment: s.scoreLine, period: s.period, clock: s.clock }, occurredAt: s.occurredAt || new Date(),
    sources: sourcesOf(c, verify), verification: verification(g, s.status === 'final' ? verify : null), origin: 'play-by-play',
  };
}

// A notable player line → one entry per player per game (it escalates as the line grows).
export function fromPerformance(p, c, verify) {
  const g = c.game, has = k => p.tags.some(t => t.key === k || t.key.startsWith(k));
  const live = p.state === 'live';
  const ch = p.tags.find(t => t.key.startsWith('ch_'));
  let category = 'scoring', headline;
  if (has('qd')) { category = 'triple-double'; headline = 'QUADRUPLE-DOUBLE'; }
  else if (has('hist') && p.tags.find(t => t.key === 'hist').weight >= 25) { category = 'breakout'; headline = 'HISTORIC NIGHT'; }
  else if (ch && ch.detail.stat === 'pts') { category = 'breakout'; headline = ch.detail.tie ? 'TIES CAREER HIGH' : 'CAREER NIGHT'; }
  else if (has('td')) { category = 'triple-double'; headline = 'TRIPLE-DOUBLE'; }
  else if (has('pts60')) headline = '60-POINT GAME';
  else if (has('pts50')) headline = '50-POINT GAME';
  else if (has('pts40')) headline = pick(p._id, ['40-PIECE', 'FORTY']);
  else if (has('role') || (has('z_') && !p.starter)) { category = 'role-player'; headline = p.starter ? pick(p._id, ['STEPPED UP', 'ROLE PLAYER, BIG NIGHT']) : pick(p._id, ['OFF THE BENCH', 'BENCH SPARK', 'SIXTH-MAN SURGE']); }
  else if (p.rookie && (has('dd') || p.line.pts >= 20)) { category = 'rookie'; headline = has('dd') ? 'ROOKIE DOUBLE-DOUBLE' : 'ROOKIE TAKEOVER'; }
  else if (ch) { category = 'breakout'; headline = `CAREER HIGH: ${STAT[ch.detail.stat].short}`; }
  else if (has('defense')) { category = 'defense'; headline = pick(p._id, ['LOCKDOWN', 'DEFENSIVE CLINIC']); }
  else if (has('clutch')) { category = 'clutch'; headline = 'CLOSER'; }
  else if (has('z_')) { category = 'breakout'; headline = 'BIG NIGHT'; }
  else if (has('efficient')) headline = pick(p._id, ['SURGICAL', 'EFFICIENT']);
  else if (has('disappointment')) { category = 'disappointment'; headline = 'ROUGH NIGHT'; }
  else headline = 'BIG NIGHT';
  if (live && headline === 'TRIPLE-DOUBLE') headline = 'TRIPLE-DOUBLE ALERT';
  const disappointing = category === 'disappointment';
  let sig = disappointing ? Math.min(70, 20 + p.disappointment * 0.6) : Math.min(100, 22 + p.score * 0.45);
  if (category === 'role-player' || category === 'rookie') sig += 10;
  // Floors: some lines are always a story.
  const floor = has('qd') ? 92 : has('pts60') ? 95 : has('pts50') ? 86 : ch && ch.detail.stat === 'pts' && !ch.detail.tie ? 70 : has('td') ? 58 : has('pts40') ? 62 : 0;
  if (!disappointing) sig = Math.max(sig, floor);
  if (live) sig -= 5; // the final line will say it better; live entries are for genuinely big moments
  const team = teamObj(g.teams.find(t => t.id === p.team.id));
  const confirmed = !live && verify && ['verified', 'consistent'].includes(verify.status);
  return {
    _id: `${p.gid}:perf:${p.pid}`, category, significance: !live && !confirmed ? 0 : sig, status: live ? 'developing' : confirmed ? 'final' : 'pending',
    headline, body: p.angle, players: [{ id: p.pid, name: p.name, headshot: p.headshot, team: p.team.abbr, pos: p.pos }], team, teams: g.teams.map(t => t.id),
    stats: perfStats(p), facts: { line: p.statLine, splits: p.splits, tags: p.tags.map(t => t.label), context: p.context ? { avg: p.context.avg, gp: p.context.gp } : null, history: p.history || null, starter: p.starter, min: p.line.min },
    game: { ...gameCtx(g), moment: p.clock }, occurredAt: new Date(), sources: sourcesOf(c, verify), verification: verification(g, verify), origin: 'box score', perf: p._id,
  };
}
function perfStats(p) {
  const l = p.line, out = [{ label: 'PTS', value: l.pts }, { label: 'REB', value: l.reb }, { label: 'AST', value: l.ast }];
  if (l.stl + l.blk >= 4) out.push({ label: l.blk >= l.stl ? 'BLK' : 'STL', value: Math.max(l.blk, l.stl) });
  out.push({ label: 'FG', value: `${l.fgm}-${l.fga}` });
  if (p.derived?.ts_pct != null && l.fga >= 8) out.push({ label: 'TS%', value: `${p.derived.ts_pct}` });
  return out;
}

// Record and milestone events (lib/events.js) → entries. Career highs are told by the player's performance entry.
export function fromRecordEvent(e) {
  if (e.type === 'career-high') return null;
  const live = e.game.status !== 'final';
  const verified = e.verification?.status === 'verified';
  const S = STAT[e.stat]?.label.toLowerCase() || e.stat;
  const holders = (e.previous?.holders || []).filter(h => h.name).map(h => `${h.name}${h.date ? ` (${h.date.slice(0, 4)})` : ''}`);
  let headline, body, sig;
  if (e.type === 'milestone') {
    headline = e.state === 'reached' ? `${e.target.toLocaleString('en-US')} CAREER ${(STAT[e.stat]?.short || '').replace('REB', 'REBOUNDS').replace('AST', 'ASSISTS').replace('PTS', 'POINTS')}` : 'MILESTONE WATCH';
    body = e.state === 'reached' ? `${e.player.name} reached ${e.title}.` : `${e.player.name} is ${(e.target - e.value).toLocaleString('en-US')} ${S} from ${e.title}${live ? ' tonight' : ''}.`;
    sig = e.state === 'reached' ? (e.target % (e.target >= 10000 ? 5000 : 1000) === 0 ? 82 : 72) : 45;
  } else {
    const nba = /box-score era/.test(e.category) || /all-time/i.test(e.category);
    headline = e.state === 'broken' ? (nba ? 'RECORD BROKEN' : 'FRANCHISE RECORD') : e.state === 'tied' ? (nba ? 'RECORD TIED' : 'TIES FRANCHISE RECORD') : 'CHASING HISTORY';
    body = e.state === 'approaching'
      ? `${e.player.name} has ${e.value} ${S}${live ? ' so far' : ''}; the mark is ${e.target}${holders.length ? ` (${holders.slice(0, 2).join(', ')})` : ''}. ${e.title}, ${e.scopeLabel}.`
      : `${e.player.name} ${e.state === 'broken' ? 'set' : 'matched'} the mark with ${e.value} ${S}: ${e.title} (${e.scopeLabel}). ${e.state === 'broken' ? 'Previous' : 'Shared with'}: ${e.previous?.value}${holders.length ? ` — ${holders.slice(0, 3).join(', ')}` : ''}.`;
    sig = e.state === 'broken' ? (nba ? 96 : 86) : e.state === 'tied' ? (nba ? 88 : 78) : nba ? 66 : 55;
  }
  // Tied/broken/reached are published only when verified after the final; approaching is a developing story.
  const confirmed = e.state === 'approaching' || verified;
  return {
    _id: `rec:${e._id}`, category: e.type === 'milestone' ? 'milestone' : 'record', significance: confirmed ? sig : 0,
    status: e.state === 'approaching' ? (live ? 'developing' : 'final') : verified ? 'confirmed' : 'pending', headline, body,
    players: [{ id: e.player.id, name: e.player.name, headshot: e.player.headshot, team: e.player.team }], team: { id: e.player.teamId, abbr: e.player.team, color: e.player.color }, teams: e.game.teams.map(t => t.id),
    stats: [{ label: STAT[e.stat]?.short || e.stat, value: e.value.toLocaleString('en-US') }, { label: e.type === 'milestone' ? 'Milestone' : e.state === 'approaching' ? 'Record' : 'Previous', value: (e.type === 'milestone' ? e.target : e.previous?.value ?? e.target)?.toLocaleString('en-US') }],
    facts: { title: e.title, scope: e.scopeLabel, category: e.category, previous: e.previous, state: e.state, projection: e.projection ?? null, eventId: e._id },
    game: { id: e.game.id, date: e.game.date, status: e.game.status, live, label: e.game.clock, teams: e.game.teams, stype: e.game.stype }, occurredAt: e.updatedAt || new Date(),
    sources: [{ name: e.source?.provider, url: e.source?.url || null, method: e.source?.method, at: e.updatedAt }], verification: e.verification || { status: 'developing' }, origin: 'records',
  };
}

// Team winning and losing streaks after a verified final, from the team's ESPN schedule (this season's results).
export async function streakStories(d, game, settings) {
  const { teamResults } = await import('./context.js');
  const S = { win: 4, loss: 5, endedFrom: 5, ...(settings.feed?.streaks || {}) };
  const out = [];
  if (game.stype !== 2) return out;
  for (const t of game.teams) {
    let res = await teamResults(d, t.id, game.season).catch(() => null);
    if (!res) continue;
    // ESPN's schedule may not list tonight's result yet.
    if (res[0]?.gid !== game._id) res = [{ gid: game._id, date: game.date, won: !!t.winner }, ...res.filter(r => r.gid !== game._id)];
    const r = res.map(x => (x.won ? 'W' : 'L'));
    let n = 0; while (n < r.length && r[n] === r[0]) n++;
    let prev = 0; while (n + prev < r.length && r[n + prev] === r[n]) prev++;
    const won = r[0] === 'W';
    const opp = game.teams.find(x => x.id !== t.id);
    const start = res[n - 1];
    const src = [{ name: 'ESPN team schedule (results this season)', url: `https://www.espn.com/nba/team/schedule/_/name/${String(t.abbr).toLowerCase()}`, at: new Date() }];
    if (won ? n >= S.win : n >= S.loss) {
      out.push({ _id: `${t.id}:streak:${r[0]}:${start.gid}`, category: 'streak', significance: won ? 30 + 5 * n : 28 + 3 * n, status: 'final',
        headline: won ? `${n} STRAIGHT` : `${n} STRAIGHT LOSSES`, body: `The ${t.name} ${won ? 'have won' : 'have lost'} ${n} in a row${won ? ` after beating the ${opp.name} ${t.score}–${opp.score}` : ` after falling to the ${opp.name} ${opp.score}–${t.score}`}. The streak began ${fmt(start.date)}.`,
        team: teamObj(t), teams: game.teams.map(x => x.id), players: [], stats: [{ label: won ? 'Wins' : 'Losses', value: n }, { label: 'Since', value: fmt(start.date) }], facts: { n, type: r[0], start: start.date },
        game: gameCtx({ ...game, id: game._id }, { live: false }), occurredAt: new Date(), sources: src, verification: { status: 'verified', note: `${res.length} results this season checked` }, origin: 'results' });
    }
    if (n === 1 && prev >= S.endedFrom) {
      out.push({ _id: `${game._id}:streak-end:${t.id}`, category: 'streak', significance: 38 + 3 * prev, status: 'final',
        headline: won ? 'SKID OVER' : 'STREAK SNAPPED', body: `The ${t.name} ${won ? `ended a ${prev}-game losing streak` : `had a ${prev}-game winning streak snapped`} ${won ? `by beating the ${opp.name} ${t.score}–${opp.score}` : `by the ${opp.name}, ${opp.score}–${t.score}`}.`,
        team: teamObj(t), teams: game.teams.map(x => x.id), players: [], stats: [{ label: won ? 'Ended skid' : 'Ended streak', value: prev }], facts: { prev, type: r[n] },
        game: gameCtx({ ...game, id: game._id }, { live: false }), occurredAt: new Date(), sources: src, verification: { status: 'verified' }, origin: 'results' });
    }
  }
  return out;
}
const fmt = ymd => new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function potnStory(p, g) {
  return { _id: `potn:${p.date}`, category: 'potn', significance: 86, status: 'final', headline: 'PERFORMANCE OF THE NIGHT', body: `${p.name}: ${p.statLine}. ${p.angle || ''}`.trim(),
    players: [{ id: p.pid, name: p.name, headshot: p.headshot, team: p.team.abbr }], team: { id: p.team.id, abbr: p.team.abbr, name: p.team.name, logo: p.team.logo, color: p.team.color }, teams: [p.team.id, p.opp.id],
    stats: perfStats(p), facts: { line: p.statLine, tags: p.tags.map(t => t.label), score: p.score }, game: g ? gameCtx(g, { live: false }) : { id: p.gid, date: p.date },
    occurredAt: new Date(), sources: [{ name: 'Verified box scores, every game of the night', at: new Date() }], verification: { status: 'verified' }, origin: 'editorial', perf: p._id };
}
export { round };
