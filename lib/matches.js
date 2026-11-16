// The match engine.
//   sync      — every few hours: today, tomorrow and the day after for every enabled competition (one ESPN scoreboard
//               request per competition per day). New matches are added, kickoff changes picked up. Events already
//               finished and cleaned up (the processed list) are never brought back.
//   poll      — while matches are near kickoff or on: one scoreboard request per competition with such a match, every
//               minute (by default). Nothing else is fetched while a match is on.
//   finalize  — when ESPN confirms full time: goals checked against the score (summary as a fallback when the
//               scoreboard lacks scorers), then the graphic is generated once (the event id is its key). Incomplete
//               goal data is retried for 90 minutes, then the match is flagged for review instead of guessed at.
import { db as openDb, log } from './db.js';
import { scoreboard, summaryGoals, goalProblems } from './espn.js';
import { competitions } from './competitions.js';
import { getSettings } from './settings.js';
import { dayOf, addDays } from './tz.js';
import { graphicData } from './graphics/data.js';
import { renderPng } from './graphics/server.js';

export const LIVE = ['live', 'halftime'];
export const FINAL = ['ft'];
export const DEAD = ['postponed', 'canceled', 'abandoned'];
const REVIEW_AFTER_MIN = 90;

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// A job lock (so the worker, the web app and a second worker never run the same job at once).
export async function withLock(d, name, ms, fn) {
  const now = new Date();
  const got = await d.collection('jobs').findOneAndUpdate({ _id: `lock:${name}`, $or: [{ until: { $lt: now } }, { until: { $exists: false } }] }, { $set: { until: new Date(+now + ms), at: now } }, { returnDocument: 'after' }).catch(() => null)
    || await d.collection('jobs').insertOne({ _id: `lock:${name}`, until: new Date(+now + ms), at: now }).then(() => true).catch(() => null);
  if (!got) return { skipped: true };
  try { return await fn(); } finally { await d.collection('jobs').updateOne({ _id: `lock:${name}` }, { $set: { until: new Date(0) } }); }
}

const fieldsFrom = ev => ({ comp: ev.comp, compName: ev.compName, compLogo: ev.compLogo, espnDate: ev.espnDate, kickoff: ev.kickoff, status: ev.status, espnStatus: ev.espnStatus, home: ev.home, away: ev.away, score: ev.score, shootout: ev.shootout, goals: ev.goals, winner: ev.winner });

// Store what ESPN says about a match we track (or should track). Returns the stored match.
async function upsertEvent(d, ev, now) {
  const prev = await d.collection('matches').findOne({ _id: ev._id });
  if (prev?.graphic?.status === 'generated' || prev?.graphic?.status === 'review') return prev; // done: no more updates
  const set = { ...fieldsFrom(ev), checkedAt: now };
  if (ev.status === 'ft' && !prev?.ftAt) set.ftAt = now;
  if (ev.status !== 'ft' && prev?.ftAt) set.ftAt = null; // ESPN took "final" back
  await d.collection('matches').updateOne({ _id: ev._id }, { $set: set, $setOnInsert: { createdAt: now, graphic: { status: 'none' } } }, { upsert: true });
  return { ...prev, ...set, _id: ev._id, graphic: prev?.graphic || { status: 'none' } };
}

export async function sync(d, { now = new Date(), days = 3, L = () => {} } = {}) {
  const settings = await getSettings(d);
  const comps = await competitions(d, { enabledOnly: true });
  const today = dayOf(now, settings.timezone);
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i));
  const done = new Set((await d.collection('processed').find({}, { projection: { _id: 1 } }).toArray()).map(x => x._id));
  const tasks = comps.flatMap(c => dates.map(day => ({ c, day })));
  let added = 0, seen = 0, errors = 0;
  const finals = [];
  await pool(tasks, 6, async ({ c, day }) => {
    let sb;
    try { sb = await scoreboard(c.code, day); } catch (e) { errors++; await log(d, 'warn', `Schedule ${c.name} ${day}: ${e.message}`); return; }
    for (const ev of sb.events) {
      if (done.has(ev._id)) continue;
      ev.compName = c.name; // the name as configured
      seen++;
      const existed = await d.collection('matches').countDocuments({ _id: ev._id }, { limit: 1 });
      const m = await upsertEvent(d, ev, now);
      if (!existed) added++;
      if (m.status === 'ft' && ['none', 'waiting', 'failed'].includes(m.graphic?.status || 'none')) finals.push(m);
    }
  });
  await d.collection('jobs').updateOne({ _id: 'sync' }, { $set: { at: now, seen, added, errors, dates } }, { upsert: true });
  if (added || errors) await log(d, errors ? 'warn' : 'info', `Schedule refreshed: ${seen} matches across ${comps.length} competitions (${added} new${errors ? `, ${errors} requests failed` : ''})`);
  L(`sync: ${seen} matches, ${added} new, ${errors} errors`);
  for (const m of finals) await finalize(d, m, { now, settings });
  return { seen, added, errors };
}

// Matches to watch now: near kickoff, on, or finished but still waiting for complete goal data.
export async function activeMatches(d, { now = new Date(), settings } = {}) {
  settings ||= await getSettings(d);
  const soon = new Date(+now + settings.polling.preKickoffMin * 60e3);
  return d.collection('matches').find({ $or: [
    { status: { $in: [...LIVE, 'ended', 'suspended'] } },
    { status: 'scheduled', kickoff: { $lte: soon, $gte: new Date(+now - 8 * 3600e3) } },
    { status: 'ft', 'graphic.status': { $in: ['none', 'waiting'] } },
    { status: 'ft', 'graphic.status': 'failed', 'graphic.attempts': { $not: { $gte: 5 } } },
  ] }).toArray();
}

export async function poll(d, { now = new Date(), L = () => {} } = {}) {
  const settings = await getSettings(d);
  const active = await activeMatches(d, { now, settings });
  if (!active.length) return { polled: 0 };
  const groups = new Map();
  for (const m of active) { const k = `${m.comp}|${m.espnDate}`; if (!groups.has(k)) groups.set(k, { comp: m.comp, day: m.espnDate, ids: new Set() }); groups.get(k).ids.add(m._id); }
  const finals = [];
  let changed = 0;
  await pool([...groups.values()], 6, async g => {
    let sb;
    try { sb = await scoreboard(g.comp, g.day); } catch (e) { await log(d, 'warn', `Live check ${g.comp} ${g.day}: ${e.message}`); return; }
    const byId = new Map(sb.events.map(e => [e._id, e]));
    for (const id of g.ids) {
      const ev = byId.get(id);
      const prev = active.find(x => x._id === id);
      if (!ev) continue; // moved to another day: the next sync finds it
      ev.compName = prev.compName;
      if (ev.status !== prev.status || ev.score.home !== prev.score?.home || ev.score.away !== prev.score?.away) changed++;
      const m = await upsertEvent(d, ev, now);
      if (m.status === 'ft' && ['none', 'waiting', 'failed'].includes(m.graphic?.status || 'none')) finals.push(m);
    }
  });
  for (const m of finals) await finalize(d, m, { now, settings });
  await d.collection('jobs').updateOne({ _id: 'poll' }, { $set: { at: now, matches: active.length, requests: groups.size } }, { upsert: true });
  L(`poll: ${active.length} matches, ${groups.size} requests, ${changed} changed, ${finals.length} at full time`);
  return { polled: active.length, requests: groups.size, finals: finals.length };
}

// Full time: check the goals, then make the graphic (once per event id).
export async function finalize(d, m, { now = new Date(), settings } = {}) {
  settings ||= await getSettings(d);
  const existing = await d.collection('graphics').findOne({ _id: m._id }, { projection: { status: 1 } });
  if (existing?.status === 'failed') { // rendering failed earlier: try again (up to 5 times)
    const g = await regenerate(d, m._id, { now });
    if (g?.status === 'failed') await d.collection('matches').updateOne({ _id: m._id }, { $inc: { 'graphic.attempts': 1 } });
    return { status: g?.status };
  }
  if (existing) {
    await d.collection('matches').updateOne({ _id: m._id }, { $set: { 'graphic.status': existing.status === 'review' ? 'review' : 'generated' } });
    return { duplicate: true };
  }
  let match = m;
  let problems = goalProblems(match);
  // The scoreboard sometimes lacks scorers for smaller competitions: try the match summary once per check.
  if (problems.length) {
    const s = await summaryGoals(m.comp, m._id).catch(() => null);
    if (s?.goals?.length) {
      const alt = { ...match, goals: s.goals.sort((a, b) => a.sort - b.sort) };
      const altProblems = goalProblems(alt);
      if (altProblems.length < problems.length) { match = alt; problems = altProblems; await d.collection('matches').updateOne({ _id: m._id }, { $set: { goals: alt.goals, goalsFrom: 'summary' } }); }
    }
  }
  const waited = (now - new Date(m.ftAt || now)) / 60e3;
  if (problems.length && waited < REVIEW_AFTER_MIN) {
    await d.collection('matches').updateOne({ _id: m._id }, { $set: { graphic: { status: 'waiting', problems, since: m.graphic?.since || now, checks: (m.graphic?.checks || 0) + 1 } } });
    return { waiting: problems };
  }
  const data = graphicData(match, settings);
  const status = problems.length ? 'review' : 'ready';
  const theme = themeOf(settings);
  let render = null, error = null;
  try { const r = await renderPng(d, data, theme); render = { ok: true, bytes: r.buffer.length, missingImages: r.missing }; } catch (e) { error = e.message; }
  const doc = {
    _id: m._id, data, edits: null, theme, status: error ? 'failed' : status, problems, render, error,
    match: { comp: m.comp, compName: m.compName, kickoff: m.kickoff, home: m.home?.name, away: m.away?.name, score: m.score, shootout: m.shootout, ftAt: m.ftAt || now },
    createdAt: now, updatedAt: now, version: 1, downloads: 0,
  };
  const { _id, ...fields } = doc;
  const ins = await d.collection('graphics').updateOne({ _id: m._id }, { $setOnInsert: fields }, { upsert: true });
  if (!ins.upsertedCount) return { duplicate: true };
  await d.collection('matches').updateOne({ _id: m._id }, { $set: { graphic: { status: error ? 'failed' : status === 'ready' ? 'generated' : 'review', at: now, problems, attempts: error ? 1 : 0 } } });
  await log(d, error ? 'error' : problems.length ? 'warn' : 'info', `${m.home?.name} ${m.score?.home}–${m.score?.away} ${m.away?.name} (${m.compName}): ${error ? `graphic failed — ${error}` : problems.length ? `flagged for review — ${problems.join('; ')}` : 'graphic generated'}`, { event: m._id });
  return { status: doc.status };
}

export const themeOf = s => ({ accent: s.graphics.accent, handle: s.graphics.handle, showDate: s.graphics.showDate, useTeamColors: s.graphics.useTeamColors });

// Re-make a graphic from the match data still held (or from the graphic's own data once the match is cleaned up).
export async function regenerate(d, id, { now = new Date() } = {}) {
  const settings = await getSettings(d);
  const g = await d.collection('graphics').findOne({ _id: id });
  const m = await d.collection('matches').findOne({ _id: id });
  if (!g && !m) return null;
  const data = m ? graphicData(m, settings) : g.data;
  const problems = m ? goalProblems(m) : g.problems || [];
  const theme = themeOf(settings);
  let render = null, error = null;
  try { const r = await renderPng(d, applyEdits(data, g?.edits), theme); render = { ok: true, bytes: r.buffer.length, missingImages: r.missing }; } catch (e) { error = e.message; }
  await d.collection('graphics').updateOne({ _id: id }, { $set: { data, theme, problems, render, error, status: error ? 'failed' : problems.length && !g?.approved ? 'review' : 'ready', updatedAt: now }, $inc: { version: 1 }, $setOnInsert: { createdAt: now, downloads: 0, match: m ? { comp: m.comp, compName: m.compName, kickoff: m.kickoff, home: m.home?.name, away: m.away?.name, score: m.score, shootout: m.shootout, ftAt: m.ftAt } : null } }, { upsert: true });
  if (m) await d.collection('matches').updateOne({ _id: id }, { $set: { 'graphic.status': error ? 'failed' : problems.length && !g?.approved ? 'review' : 'generated', 'graphic.at': now } });
  return d.collection('graphics').findOne({ _id: id });
}

// Edits are stored separately from the data the graphic was generated from, so "reset" is always possible.
export function applyEdits(data, edits) {
  if (!edits) return data;
  const o = structuredClone(data);
  const set = (path, v) => { const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k] ||= {}; t[ks.at(-1)] = v; };
  for (const [k, v] of Object.entries(edits)) set(k, v);
  return o;
}

export { openDb };
