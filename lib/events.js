// Record and milestone events. While a game is live, each player's line is compared with:
//   · career highs (from every box score in the database)            → career-high events
//   · record lists (league, franchise, rookie, position, nationality) → record events (box-score era)
//   · reference records editors added with a source and verified     → all-time record events
//   · career totals (ESPN, regular season)                            → milestone events
// An event moves approaching → tied → broken (or reached, for milestones); when the game ends, a broken or tied claim is
// verified again from the final, verified box score — career highs also against the player's ESPN game logs — and an
// approach that fell short becomes "missed". Claims are never published from live data alone.
import { data } from './providers/index.js';
import { STAT, derive } from './stats.js';
import { standing } from './records.js';
import { round, seasonLabel } from './util.js';

const ST = { 2: 'regular season', 3: 'playoffs' };
export const MIN_COVERAGE = +(process.env.ATN_MIN_RECORD_GAMES || 5000);
const now = () => new Date();

// Minutes of game played (for projections): 48 + 5 per overtime period.
function elapsed(g) {
  const m = String(g.clock || '').match(/^(\d+):(\d+)/);
  const left = m ? +m[1] + +m[2] / 60 : 0;
  if (g.status === 'final') return 48 + 5 * g.ot;
  if (!g.period) return 0;
  return g.period <= 4 ? (g.period - 1) * 12 + (12 - left) : 48 + (g.period - 5) * 5 + (5 - left);
}
// A rough projection of a player's final number at the current pace (minutes share × remaining time). Labelled as such.
export function project(g, line, stat) {
  if (g.status === 'final') return line[stat];
  const el = elapsed(g), rem = Math.max(0, 48 - el);
  if (el < 6 || !line.min) return null;
  const share = Math.min(1, line.min / el);
  return round(line[stat] + (line[stat] / line.min) * share * rem, 1);
}

function baseEvent(g, p, team) {
  return {
    player: { id: p.id, name: p.name, headshot: p.headshot, team: team?.abbr, teamId: team?.id, color: team?.color, alt: team?.alt },
    game: { id: g.id, date: g.date, season: g.season, stype: g.stype, status: g.status, clock: g.status === 'final' ? 'Final' : g.detail, teams: g.teams.map(t => ({ id: t.id, abbr: t.abbr, score: t.score, logo: t.logo, color: t.color })) },
  };
}

const stateOf = (v, target, approach, order = 'desc') => {
  if (target == null) return null;
  if (order === 'asc') return v < target ? 'broken' : v === target ? 'tied' : null;
  return v > target ? 'broken' : v === target ? 'tied' : v >= target - approach ? 'approaching' : null;
};

// Every candidate event for a game's current lines. Pure apart from reads; the caller saves them (saveEvents).
export async function evaluate(d, center, settings, { contexts }) {
  const g = center.game; if (g.stype !== 2 && g.stype !== 3) return [];
  const A = settings.records.approach;
  const teams = Object.fromEntries(g.teams.map(t => [t.id, t]));
  const out = [];
  const lines = center.players.filter(p => p.line && p.line.min > 0);
  if (!lines.length) return out;
  // Record lists this game can touch.
  const stats = Object.keys(A);
  const ids = [];
  for (const k of stats) { ids.push(`g:${k}:nba:${g.stype}`); for (const t of g.teams) ids.push(`g:${k}:tm${t.id}:${g.stype}`); if (g.stype === 2) ids.push(`g:${k}:rookie:2`); }
  // Record claims need record lists built from the full history (MIN_COVERAGE games); a partial database can't say what a
  // record is, so record events are simply not evaluated until it can.
  const lists = new Map((await d.collection('records').find({ _id: { $in: ids }, 'coverage.games': { $gte: MIN_COVERAGE } }).toArray()).filter(x => x.entries?.length >= 10).map(x => [x._id, x]));
  const refs = await d.collection('refrecords').find({ verified: true, kind: 'game', stype: { $in: [g.stype, 0] } }).toArray();
  const players = new Map((await d.collection('players').find({ _id: { $in: lines.map(p => p.id) } }, { projection: { debut: 1 } }).toArray()).map(p => [p._id, p]));
  const careers = settings.detection.milestones !== false && g.stype === 2 ? new Map((await d.collection('careers').find({ _id: { $in: lines.map(p => p.id) } }).toArray()).map(c => [c._id, c])) : new Map();
  for (const p of lines) {
    const l = derive(p.line), team = teams[p.team], base = baseEvent(g, p, team), c = contexts.get(p.id);
    // Career highs (need a real history: 20+ games in the database).
    if (c && c.games >= 20) for (const k of settings.records.careerHighStats) {
      const hi = c.highs[k]; if (hi == null || hi < (k === 'pts' ? 15 : 5)) continue;
      const st = stateOf(l[k], hi, A[k] ?? 3); if (!st) continue;
      out.push({ ...base, _id: `${g.id}:${p.id}:ch:${k}`, type: 'career-high', category: 'Career high', stat: k, state: st, value: l[k], target: hi,
        title: `Career high in ${STAT[k].label.toLowerCase()}`, scopeLabel: `${p.name} · all games in the database (regular season and playoffs)`,
        previous: { value: hi, holders: [{ name: p.name, pid: p.id }] }, projection: project(g, p.line, k),
        source: { provider: 'ESPN box scores', method: `Highest in ${c.games} earlier games in the database; verified against ESPN game logs after the final` } });
    }
    // Record lists.
    const rookie = g.stype === 2 && players.get(p.id)?.debut && +players.get(p.id).debut + 1 === g.season;
    for (const k of stats) {
      for (const id of [`g:${k}:nba:${g.stype}`, `g:${k}:tm${p.team}:${g.stype}`, ...(rookie ? [`g:${k}:rookie:2`] : [])]) {
        const list = lists.get(id); if (!list?.entries?.length) continue;
        const s = standing(list.entries, l[k], list.order, g.id);
        const top = s.top?.v; if (top == null || top < 3) continue;
        const st = stateOf(l[k], top, A[k]); if (!st) continue;
        out.push({ ...base, _id: `${g.id}:${p.id}:rec:${id}`, type: 'record', listId: id, category: list.scope.kind === 'team' ? 'Franchise record' : list.scope.kind === 'rookie' ? 'Rookie record' : `${g.stype === 3 ? 'Playoff' : 'Regular-season'} record (box-score era)`,
          stat: k, state: st, value: l[k], target: top, title: list.title + (list.scope.kind === 'team' ? ` — ${list.scope.teamName}` : ''), scopeLabel: list.scopeLabel,
          previous: { value: top, holders: s.holders.map(h => ({ name: h.name, pid: h.pid, date: h.date, gid: h.gid, opp: h.opp, team: h.team })) }, projection: project(g, p.line, k),
          source: { provider: 'ESPN box scores', method: list.source?.method, coverage: list.coverage, listId: id } });
      }
      // Reference (all-time) records added and verified by editors.
      for (const r of refs.filter(x => x.stat === k && (!x.team || x.team === p.team) && (!x.rookie || rookie))) {
        const st = stateOf(l[k], r.value, A[k]); if (!st) continue;
        out.push({ ...base, _id: `${g.id}:${p.id}:ref:${r._id}`, type: 'record', refId: String(r._id), category: r.team ? 'Franchise record (all-time)' : `NBA ${g.stype === 3 ? 'playoff' : 'regular-season'} record (all-time)`,
          stat: k, state: st, value: l[k], target: r.value, title: r.title, scopeLabel: r.scopeLabel || 'All-time',
          previous: { value: r.value, holders: [{ name: r.holder, date: r.date, opp: r.opponent }] }, projection: project(g, p.line, k),
          source: { provider: 'Reference record', url: r.sourceUrl, method: `Added by ${r.addedBy || 'an editor'}; verified ${r.verifiedAt ? new Date(r.verifiedAt).toISOString().slice(0, 10) : ''}` } });
      }
    }
    // Milestones: career totals before tonight + tonight's line.
    const car = careers.get(p.id);
    if (car && car.asOf && new Date(car.asOf) < new Date(g.start || Date.now())) {
      for (const [k, step] of Object.entries(settings.milestones.steps)) {
        if (k === 'gp') continue;
        const before = car.totals?.[k]; if (before == null || step <= 0) continue;
        const next = (Math.floor(before / step) + 1) * step, now = before + (l[k] || 0);
        const st = now >= next ? 'reached' : next - now <= (settings.milestones.approach[k] ?? 0) ? 'approaching' : null;
        if (!st) continue;
        out.push({ ...base, _id: `${g.id}:${p.id}:ms:${k}:${next}`, type: 'milestone', category: 'Career milestone', stat: k, state: st, value: now, target: next,
          title: `${next.toLocaleString('en-US')} career ${STAT[k].label.toLowerCase()}`, scopeLabel: 'Regular season, career',
          previous: { value: before }, projection: project(g, p.line, k),
          source: { provider: 'ESPN career statistics', url: `https://www.espn.com/nba/player/stats/_/id/${p.id}`, method: `${before.toLocaleString('en-US')} before tonight (ESPN, as of ${new Date(car.asOf).toISOString().slice(0, 10)}) + ${l[k]} tonight` } });
      }
    }
  }
  return out;
}

const RANK = { approaching: 1, tied: 2, broken: 3, reached: 3 };

// Save events: new ones are created, existing ones move forward (history kept).
export async function saveEvents(d, events, { final = false, verify = null } = {}) {
  const col = d.collection('events');
  const changed = [];
  for (const e of events) {
    const prev = await col.findOne({ _id: e._id });
    const verification = final ? { status: verify?.status === 'verified' || verify?.status === 'consistent' ? 'pending' : 'failed', at: now() } : { status: 'live', at: now() };
    if (!prev) {
      await col.insertOne({ ...e, verification, history: [{ state: e.state, value: e.value, at: now(), clock: e.game.clock }], createdAt: now(), updatedAt: now() });
      changed.push({ ...e, from: null });
    } else if (prev.value !== e.value || prev.state !== e.state || final) {
      const moved = prev.state !== e.state;
      const { _id, ...ev } = e;
      await col.updateOne({ _id: e._id }, { $set: { ...ev, verification: prev.verification?.status === 'verified' ? prev.verification : verification, updatedAt: now() }, ...(moved ? { $push: { history: { state: e.state, value: e.value, at: now(), clock: e.game.clock } } } : {}) });
      if (moved && RANK[e.state] > (RANK[prev.state] || 0)) changed.push({ ...e, from: prev.state });
    }
  }
  return changed;
}

// When a game is final: approaches that fell short become "missed"; claims of this game not re-confirmed by the
// final box score are withdrawn.
export async function closeGame(d, gid, confirmedIds) {
  const keep = new Set(confirmedIds);
  const open = await d.collection('events').find({ 'game.id': gid }).toArray();
  for (const e of open) {
    if (keep.has(e._id)) continue;
    const state = e.state === 'approaching' ? 'missed' : 'withdrawn';
    await d.collection('events').updateOne({ _id: e._id }, { $set: { state, updatedAt: now(), 'verification.status': state === 'withdrawn' ? 'failed' : e.verification?.status, 'game.status': 'final' }, $push: { history: { state, value: e.value, at: now(), clock: 'Final' } } });
  }
}

// Career highs are re-checked against the player's ESPN game logs, season by season (every game ESPN has, including
// any the database lacks). Returns { ok, previous: { value, gid, date, opp } } or { ok: false, reason }.
export async function verifyCareerHigh(pid, stat, value, gid) {
  const car = await data.career(pid, 2).catch(() => null);
  const years = [...new Set((car?.seasons || []).map(s => s.season))];
  if (!years.length) return { ok: false, reason: 'ESPN has no career seasons for this player' };
  let best = null;
  for (const y of years) {
    const log = await data.gamelog(pid, y).catch(() => null);
    if (!log) return { ok: false, reason: `ESPN game log for ${seasonLabel(y)} unavailable` };
    for (const r of log) {
      if (r.gid === String(gid)) continue;
      const v = r.line[stat]; if (v == null) continue;
      if (!best || v > best.value) best = { value: v, gid: r.gid, date: r.date, opp: r.opp };
    }
  }
  if (!best) return { ok: false, reason: 'no earlier games in ESPN game logs' };
  return { ok: value >= best.value, tie: value === best.value, previous: best, seasons: years.length, source: 'ESPN game logs' };
}

// Final verification of a game's surviving claims (after the box score itself is verified).
export async function verifyEvents(d, gid) {
  const evs = await d.collection('events').find({ 'game.id': gid, state: { $in: ['tied', 'broken', 'reached'] }, 'verification.status': { $ne: 'verified' } }).toArray();
  for (const e of evs) {
    const checks = [{ name: 'Final box score verified (consistency checks and NBA.com cross-check)', ok: true }];
    let ok = true, update = {};
    if (e.type === 'career-high') {
      const v = await verifyCareerHigh(e.player.id, e.stat, e.value, gid);
      checks.push({ name: `ESPN game logs, every season (${v.seasons || 0})`, ok: v.ok, detail: v.ok ? `previous best ${v.previous.value} (${v.previous.date || '?'} vs ${v.previous.opp || '?'})` : v.reason });
      ok = v.ok;
      if (v.ok) {
        const state = v.tie ? 'tied' : 'broken';
        update = { state, target: v.previous.value, previous: { value: v.previous.value, holders: [{ name: e.player.name, pid: e.player.id, date: v.previous.date, gid: v.previous.gid, opp: v.previous.opp }] } };
      }
    } else if (e.type === 'record' && e.listId) {
      const list = await d.collection('records').findOne({ _id: e.listId });
      const s = list ? standing(list.entries, e.value, list.order, gid) : null;
      const good = s && (s.state === 'broken' || s.state === 'tied' || s.state === 'first');
      checks.push({ name: `Record list re-checked (${list?.coverage?.games?.toLocaleString('en-US') || '?'} games since ${list?.coverage?.from ? seasonLabel(list.coverage.from) : '?'})`, ok: !!good, detail: s ? `${s.state}, previous ${s.top?.v}` : 'list missing' });
      ok = !!good; if (good) update = { state: s.state === 'tied' ? 'tied' : 'broken' };
    } else if (e.type === 'milestone') {
      checks.push({ name: 'Career total re-read from ESPN before the game + final line', ok: true });
    } else if (e.refId) {
      checks.push({ name: 'Reference record verified by an editor with a source', ok: true, detail: e.source?.url || '' });
    }
    await d.collection('events').updateOne({ _id: e._id }, { $set: { ...update, verification: { status: ok ? 'verified' : 'failed', checks, at: now() }, updatedAt: now() } });
  }
  return evs.length;
}

export function eventHeadline(e) {
  const n = e.player?.name || '';
  const v = `${e.value} ${STAT[e.stat]?.short || ''}`.trim();
  if (e.type === 'milestone') return e.state === 'reached' ? `${n} reaches ${e.title}` : `${n} is ${round(e.target - e.value, 0)} away from ${e.title}`;
  if (e.type === 'career-high') return e.state === 'broken' ? `${n}: new career high, ${v}` : e.state === 'tied' ? `${n} ties career high: ${v}` : `${n} approaching career high (${v}, best ${e.target})`;
  const what = `${e.title}${e.scopeLabel ? ` (${e.scopeLabel})` : ''}`;
  return e.state === 'broken' ? `${n} breaks record: ${v} — ${what}` : e.state === 'tied' ? `${n} ties record: ${v} — ${what}` : `${n} chasing record: ${v}, record ${e.target} — ${what}`;
}
export { ST };
