// The monitor. One tick reads every game of today and yesterday (Eastern Time):
//   live games  → the current box score and play-by-play → game stories (runs, solo runs, close games, comebacks,
//                 blowouts, collapses, overtime, clutch), notable player lines, record / milestone approaches → feed
//                 entries marked "developing";
//   new finals  → box score verified (consistency checks + NBA.com) → stored; the same analysis on the final
//                 play-by-play, now with outcomes (game winners, completed or failed comebacks); record lists
//                 updated, record events verified (career highs against ESPN game logs); team streaks → feed entries
//                 marked final / confirmed;
//   the night   → when every game is final and verified: Performance of the Night;
//   upkeep      → AI-written summaries for the biggest entries (when a key is configured), graphics for entries that
//                 deserve one, player bios, career totals once a day.
// The long-running monitor (scripts/monitor.mjs, GitHub Actions) calls tick every 20 seconds through the game night;
// the live stream (api/stream.js) also runs it when the monitor is quiet. Everything is written to the automation log.
import { data } from './providers/index.js';
import { isLive } from './providers/espn.js';
import { etDate, addDays, pool, seasonOf } from './util.js';
import { getSettings } from './settings.js';
import { storeGame, pgameDocs, USABLE } from './ingest.js';
import { contexts, leagueSeasonHighs, clutchFromPlays, detectLines, rarity, angle } from './detect.js';
import { applyGame } from './records.js';
import { evaluate, saveEvents, closeGame, verifyEvents, MIN_COVERAGE } from './events.js';
import { analyze, situation } from './intel.js';
import { upsert, fromIntel, fromPerformance, fromRecordEvent, streakStories, potnStory } from './feed.js';
import { graphicForFeed, wantsGraphic } from './content.js';
import { feedSummary } from './ai.js';
import { log as dblog } from './notify.js';

const RECHECK_HOURS = 6;

export async function tick(d, { now = new Date(), log = console.log, force = false, dates = null, light = false } = {}) {
  const settings = await getSettings(d);
  const L = async (level, message, extra) => { log(`[${level}] ${message}`); await dblog(d, level, message, extra); };
  const today = etDate(now);
  const days = dates || [addDays(today, -1), today];
  const sum = { live: 0, finals: 0, entries: 0, escalated: 0, graphics: 0, errors: 0, scheduled: 0, nextStart: null, unverified: 0 };
  const touched = [];
  for (const date of days) {
    let sb;
    try { sb = await data.scoreboard(date); } catch (e) { sum.errors++; await L('error', `Scoreboard ${date}: ${e.message}`); continue; }
    for (const g of sb.games) if (g.status === 'scheduled' && g.start) { sum.scheduled++; if (!sum.nextStart || new Date(g.start) < new Date(sum.nextStart)) sum.nextStart = g.start; }
    await pool(sb.games, 4, async g => {
      try {
        const prev = await d.collection('games').findOne({ _id: g.id }, { projection: { status: 1, verify: 1, seenLive: 1, 'source.fetchedAt': 1 } });
        if (isLive(g.status)) { sum.live++; await liveGame(d, g, settings, { touched, sum }); return; }
        if (g.status === 'final') {
          const usable = prev?.verify && USABLE.has(prev.verify.status);
          const stale = prev?.source?.fetchedAt && now - new Date(prev.source.fetchedAt) > RECHECK_HOURS * 3600e3 && date >= addDays(today, -3);
          if (!usable || (stale && !light) || force) { sum.finals++; await finalGame(d, g, settings, { L, touched, sum, now, recap: !prev?.seenLive, force }); }
          if (!usable) { const after = await d.collection('games').findOne({ _id: g.id }, { projection: { verify: 1 } }); if (!USABLE.has(after?.verify?.status)) sum.unverified++; }
          return;
        }
        await d.collection('games').updateOne({ _id: g.id }, { $set: { date: g.date, season: g.season, stype: g.stype, status: g.status, detail: g.detail, start: g.start ? new Date(g.start) : null, teams: g.teams } }, { upsert: true });
      } catch (e) { sum.errors++; await L('error', `Game ${g.id} (${g.teams.map(t => t.abbr).join('-')}): ${e.message}`); }
    });
    await performanceOfTheNight(d, date, sb, settings, { L, touched }).catch(e => L('error', `POTN ${date}: ${e.message}`));
  }
  sum.entries = touched.filter(t => t.created).length;
  sum.escalated = touched.filter(t => t.escalated).length;
  if (!light) {
    sum.graphics = await graphics(d, touched, settings, L);
    await aiWriting(d, settings, L).catch(e => L('warn', `AI writing: ${e.message}`));
    await upkeep(d, settings, { now, L }).catch(e => L('error', `Upkeep: ${e.message}`));
  }
  await d.collection('meta').updateOne({ _id: 'tick' }, { $set: { at: now, summary: sum } }, { upsert: true });
  if (sum.finals || sum.entries || sum.errors) await L('info', `Tick: ${sum.live} live, ${sum.finals} finals, ${sum.entries} new feed entries, ${sum.escalated} escalated, ${sum.graphics} graphics, ${sum.errors} errors`, { summary: sum });
  return sum;
}

async function detect(d, c, settings, { final }) {
  const pids = c.players.filter(p => p.line).map(p => p.id);
  const [ctx, highs, rookies] = await Promise.all([
    contexts(d, pids, { gid: c.game.id, season: c.game.season }), leagueSeasonHighs(d, c.game.season, c.game.id),
    d.collection('players').find({ _id: { $in: pids }, debut: c.game.season - 1 }, { projection: { _id: 1 } }).toArray(),
  ]);
  const rk = new Set(rookies.map(r => r._id));
  // Rarity ("first time since…") needs the full box-score history in the database.
  const cov = (await d.collection('meta').findOne({ _id: 'records' }))?.coverage;
  const history = (cov?.games || 0) >= MIN_COVERAGE;
  const clutch = clutchFromPlays(c, settings.detection.clutch);
  const perfs = detectLines(c, ctx, highs, settings, clutch);
  for (const p of perfs) {
    p.rookie = rk.has(p.pid);
    if (final && history && p.score >= settings.detection.minScore) {
      p.rarity = await rarity(d, p.line, { date: c.game.date, gid: c.game.id, stype: c.game.stype }).catch(() => null);
    }
    p.angle = angle(p, p.rarity);
  }
  return { perfs, ctx };
}

async function savePerfs(d, perfs, settings) {
  for (const p of perfs) {
    if (p.score < settings.detection.minScore && !p.disappointment) continue;
    const prev = await d.collection('performances').findOne({ _id: p._id }, { projection: { potn: 1 } });
    const { _id, ...doc } = p;
    await d.collection('performances').updateOne({ _id }, { $set: { ...doc, potn: prev?.potn || false, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  }
}

// Comeback context, from comebacks this app tracked this season (verifiable in the feed). Never "historic": that would
// need an all-time reference.
async function comebackContext(d, story, season) {
  if (!['comeback', 'comeback-done'].includes(story?.category) || !story.facts?.deficit) return story;
  const done = await d.collection('feed').find({ category: 'comeback-done', 'game.season': season, _id: { $ne: story._id }, status: 'final' }, { projection: { 'facts.deficit': 1, team: 1, 'game.date': 1 } }).toArray();
  const best = done.reduce((m, e) => (e.facts?.deficit > (m?.facts?.deficit || 0) ? e : m), null);
  let note = null;
  if (story.category === 'comeback-done') {
    if (!best || story.facts.deficit > best.facts.deficit) note = `The biggest comeback of the season so far (of ${done.length + 1} tracked).`;
    else if (story.facts.deficit === best.facts.deficit) note = `Ties the biggest comeback of the season so far (${best.team?.name || best.team?.abbr}).`;
  } else if (story.facts.deficit >= 20 && (!best || story.facts.deficit > best.facts.deficit)) {
    note = best ? `No team has come back from more than ${best.facts.deficit} this season (${best.team?.name || best.team?.abbr}).` : 'It would be the first 20-point comeback tracked this season.';
  }
  return note ? { ...story, body: `${story.body} ${note}`, facts: { ...story.facts, seasonContext: note }, significance: story.significance + (story.category === 'comeback-done' ? 6 : 4) } : story;
}

async function put(d, story, settings, touched) {
  if (!story) return;
  story = await comebackContext(d, story, story.game?.season);
  const r = await upsert(d, story, settings);
  touched.push({ id: story._id, created: r.created, escalated: r.escalated, entry: r.entry });
}

async function liveGame(d, g, settings, { touched, sum }) {
  const c = await data.game(g.id, { ttl: 5 });
  if (!c) return;
  await storeGame(d, c);
  await d.collection('games').updateOne({ _id: g.id }, { $set: { seenLive: true, situation: situation(c), lastPlay: c.plays.at(-1)?.text || null } });
  if (!settings.detection.live) return;
  for (const s of analyze(c, settings.intel)) await put(d, fromIntel(s, c, null), settings, touched);
  const { perfs, ctx } = await detect(d, c, settings, { final: false });
  await savePerfs(d, perfs, settings);
  for (const p of perfs.filter(x => x.score >= settings.detection.minScore + 25)) await put(d, fromPerformance(p, c, null), settings, touched);
  if (settings.detection.records || settings.detection.milestones) {
    const evs = await evaluate(d, c, settings, { contexts: ctx });
    await saveEvents(d, evs, { final: false });
    for (const e of evs.filter(x => x.state === 'approaching' && x.type !== 'career-high')) await put(d, fromRecordEvent(await d.collection('events').findOne({ _id: e._id })), settings, touched);
  }
}

async function finalGame(d, g, settings, { L, touched, sum, now, recap, force }) {
  const c = await data.game(g.id, { ttl: 0 });
  if (!c) return;
  const res = await storeGame(d, c, { now, force });
  const label = c.game.teams.map(t => `${t.abbr} ${t.score}`).join(' – ');
  if (!res.stored) {
    if (res.verify) await L(res.verify.status === 'unverified' ? 'warn' : 'info', `${label}: ${res.verify.status}${res.verify.problems.length ? ` — ${res.verify.problems.join('; ')}` : res.verify.cross?.detail ? ` — ${res.verify.cross.detail}` : ''}`, { gid: g.id });
    return; // outcomes wait for a verified box score
  }
  if (!res.fresh) return;
  await L('info', `${label}: final, ${res.verify.status}${res.corrected ? ' (stat correction)' : ''}`, { gid: g.id });
  // Game stories from the final play-by-play, outcomes included.
  for (const s of analyze(c, settings.intel)) { const st = fromIntel(s, c, res.verify); if (recap) st.facts = { ...st.facts, recap: true }; await put(d, st, settings, touched); }
  // Player lines, records, streaks: they happened when the game ended (a recap keeps the game's own time).
  const endedAt = endTime(c, now);
  const at = st => st && { ...st, occurredAt: endedAt };
  const { perfs, ctx } = await detect(d, c, settings, { final: true });
  await savePerfs(d, perfs, settings);
  for (const p of perfs) if (p.score >= settings.detection.minScore || p.disappointment >= 40) await put(d, at(fromPerformance(p, c, res.verify)), settings, touched);
  // Records: events against the lists as they stood, then the lists updated, then verification.
  const gameDoc = await d.collection('games').findOne({ _id: g.id });
  const evs = settings.detection.records || settings.detection.milestones ? await evaluate(d, c, settings, { contexts: ctx }) : [];
  await applyGame(d, gameDoc, pgameDocs(c)).catch(e => L('error', `Record lists for ${label}: ${e.message}`));
  await saveEvents(d, evs, { final: true, verify: res.verify });
  await closeGame(d, g.id, evs.map(e => e._id));
  await verifyEvents(d, g.id);
  for (const e of await d.collection('events').find({ 'game.id': g.id, type: { $ne: 'career-high' } }).toArray()) await put(d, at(fromRecordEvent(e)), settings, touched);
  // Career highs the game logs confirmed upgrade the player's entry.
  for (const e of await d.collection('events').find({ 'game.id': g.id, type: 'career-high', 'verification.status': 'verified' }).toArray()) {
    await d.collection('feed').updateOne({ _id: `${g.id}:perf:${e.player.id}` }, { $addToSet: { 'facts.verifiedHighs': `${e.state === 'tied' ? 'Tied' : 'New'} career high: ${e.value} ${e.stat.toUpperCase()} (previous ${e.target}; ESPN game logs)` } });
  }
  // Team streaks.
  for (const s of await streakStories(d, gameDoc, settings)) await put(d, at(s), settings, touched);
}

// When a game ended: its last play's wall-clock time (or now, if the feed has none).
function endTime(c, now) {
  const w = [...(c.plays || [])].reverse().find(p => p.wall)?.wall;
  const t = w ? new Date(w) : null;
  return t && t <= now ? t : now;
}

async function performanceOfTheNight(d, date, sb, settings, { L, touched }) {
  if (!sb.games.length || sb.games.some(g => !['final', 'postponed', 'canceled', 'suspended'].includes(g.status))) return;
  if (await d.collection('meta').findOne({ _id: `potn:${date}` })) return;
  const finals = sb.games.filter(g => g.status === 'final').map(g => g.id);
  const ok = await d.collection('games').countDocuments({ _id: { $in: finals }, 'verify.status': { $in: [...USABLE] } });
  if (ok < finals.length) return;
  const best = (await d.collection('performances').find({ date, state: 'final', disappointment: 0 }).sort({ score: -1 }).limit(1).toArray())[0];
  await d.collection('meta').updateOne({ _id: `potn:${date}` }, { $set: { at: new Date(), pid: best?._id || null } }, { upsert: true });
  if (!best) return;
  await d.collection('performances').updateOne({ _id: best._id }, { $set: { potn: true } });
  const game = await d.collection('games').findOne({ _id: best.gid });
  const lastEnd = await d.collection('feed').find({ 'game.date': date, origin: 'play-by-play' }).sort({ occurredAt: -1 }).limit(1).toArray();
  await put(d, { ...potnStory(best, game ? { ...game, id: game._id } : null), occurredAt: lastEnd[0]?.occurredAt || new Date() }, settings, touched);
  await L('info', `Performance of the Night ${date}: ${best.name} (${best.statLine})`);
}

async function graphics(d, touched, settings, L) {
  let n = 0;
  for (const t of touched) {
    if (!t.created && !t.escalated) continue;
    const e = await d.collection('feed').findOne({ _id: t.id });
    if (!e || !wantsGraphic(e, settings)) continue;
    const r = await graphicForFeed(d, e, settings).catch(err => { L('warn', `Graphic for ${e.headline}: ${err.message}`); return null; });
    if (r?.created) { n++; await L('info', `Graphic: ${e.headline} — ${e.players?.[0]?.name || e.team?.name || ''}`); }
  }
  return n;
}

// AI-written summaries for the most significant entries (the rule-based text stays; the AI text is labelled).
async function aiWriting(d, settings, L) {
  if (!settings.ai?.writing) return;
  const todo = await d.collection('feed').find({ published: true, level: { $in: ['critical', 'high'] }, aiBody: null, status: { $ne: 'pending' } }).sort({ seq: -1 }).limit(settings.ai.maxPerTick || 4).toArray();
  for (const e of todo) {
    const r = await feedSummary(d, e, settings.ai.style).catch(err => ({ error: err.message }));
    if (r?.needsKey) return;
    if (r?.text) await d.collection('feed').updateOne({ _id: e._id }, { $set: { aiBody: r.text, ai: { model: r.model, at: new Date() } } });
    else if (r?.error) await L('warn', `AI summary for ${e.headline}: ${r.error}`);
  }
}

async function upkeep(d, settings, { now, L }) {
  const missing = await d.collection('players').find({ bioAt: { $exists: false } }, { projection: { _id: 1 } }).limit(30).toArray();
  await pool(missing, 6, async p => {
    const a = await data.athlete(p._id).catch(() => null);
    await d.collection('players').updateOne({ _id: p._id }, { $set: { bioAt: new Date(), ...(a ? { dob: a.dob, country: a.country, birthPlace: a.birthPlace, debut: a.debut, ...(a.pos ? { pos: a.pos } : {}), height: a.height, weight: a.weight, college: a.college, draft: a.draft, active: a.active, first: a.first, last: a.last } : {}) } });
  });
  const m = await d.collection('meta').findOne({ _id: 'careers' });
  const hourET = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(now);
  if (settings.detection.milestones && (!m || (now - new Date(m.at) > 20 * 3600e3 && hourET >= 5 && hourET < 15))) await refreshCareers(d, { L, now });
}

export async function refreshCareers(d, { L = async () => {}, now = new Date() } = {}) {
  const season = seasonOf(etDate(now));
  const active = await d.collection('pgames').distinct('p', { s: season });
  let n = 0;
  await pool(active, 8, async pid => {
    const c = await data.career(pid, 2).catch(() => null);
    if (c?.career?.pts == null) return;
    await d.collection('careers').updateOne({ _id: pid }, { $set: { totals: c.career, asOf: new Date(), source: c.url } }, { upsert: true });
    n++;
  });
  await d.collection('meta').updateOne({ _id: 'careers' }, { $set: { at: new Date(), players: n } }, { upsert: true });
  await L('info', `Career totals refreshed for ${n} players (milestones)`);
  return n;
}
