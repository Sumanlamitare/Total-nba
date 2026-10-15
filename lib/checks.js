// Checks (monitors): the ping state machine, the "missed ping" sweep, uptime, and what the API returns.
import crypto from 'node:crypto';
import { db } from './db.js';
import { alert } from './alerts.js';
import { PLANS } from './plans.js';

export const newKey = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');
const HISTORY = PLANS.free.history;

// What the user sees. Stored status is only new / up / down; late and running are derived from time.
export function state(c, now = Date.now()) {
  if (c.paused) return 'paused';
  if (c.status === 'new') return c.lastStart ? 'running' : 'new';
  if (c.status === 'down') return 'down';
  const last = +new Date(c.lastPing || 0);
  if (c.lastStart && +new Date(c.lastStart) > last) return 'running';
  return now > last + c.period * 1000 ? 'late' : 'up';
}

// Share of the last `days` days the check was not down, from its up/down history
export function uptime(c, days = 30, now = Date.now()) {
  const from = Math.max(now - days * 864e5, +new Date(c.createdAt));
  if (now <= from) return null;
  const flips = (c.flips || []).filter(f => +new Date(f.at) > from && +new Date(f.at) <= now).sort((a, b) => new Date(a.at) - new Date(b.at));
  const before = (c.flips || []).filter(f => +new Date(f.at) <= from).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
  let down = before?.to === 'down', t = from, downMs = 0;
  for (const f of flips) { if (down) downMs += +new Date(f.at) - t; t = +new Date(f.at); down = f.to === 'down'; }
  if (down) downMs += now - t;
  return Math.max(0, Math.min(1, 1 - downMs / (now - from)));
}

// Daily bars for the status page: 'up' | 'down' | 'none' per day, oldest first
export function dailyBars(c, days = 30, now = Date.now()) {
  const bars = [], created = +new Date(c.createdAt), dayMs = 864e5;
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const a = +start - i * dayMs, b = Math.min(a + dayMs, now);
    if (b <= created) { bars.push({ day: new Date(a).toISOString().slice(0, 10), s: 'none' }); continue; }
    const u = uptime({ ...c, createdAt: new Date(Math.max(a, created)) }, (b - Math.max(a, created)) / dayMs, b);
    bars.push({ day: new Date(a).toISOString().slice(0, 10), s: u == null ? 'none' : u > 0.999 ? 'up' : 'down', u });
  }
  return bars;
}

export function serialize(c, { owner = true } = {}) {
  const s = state(c);
  const out = {
    id: String(c._id), name: c.name, desc: c.desc || '', tags: c.tags || [], state: s,
    period: c.period, grace: c.grace, lastPing: c.lastPing || null, lastDuration: c.lastDuration ?? null,
    nextDue: c.lastPing && !c.paused && c.status === 'up' ? new Date(+new Date(c.lastPing) + c.period * 1000) : null,
    uptime30: uptime(c), public: !!c.public, createdAt: c.createdAt,
  };
  if (owner) Object.assign(out, {
    key: c.key, badge: c.badge, paused: !!c.paused, nPings: c.nPings || 0,
    spark: (c.pings || []).slice(-30).map(p => ({ at: p.at, kind: p.kind, dur: p.dur ?? null })),
  });
  return out;
}

const KINDS = { '': 'success', success: 'success', start: 'start', fail: 'fail', log: 'log' };
// "/p/<key>/<suffix>": suffix may be start | fail | log | an exit code (0 = success, anything else = fail)
export function parseKind(suffix = '') {
  if (/^\d{1,3}$/.test(suffix)) return +suffix === 0 ? 'success' : 'fail';
  return KINDS[suffix] || null;
}

// Record one ping. Returns the check (before the update) or null for an unknown key.
export async function recordPing(key, kind, meta = {}) {
  const col = (await db()).collection('checks');
  const now = new Date();
  const c = await col.findOne({ key }, { projection: { pings: 0 } });
  if (!c) return null;
  const ping = { at: now, kind, ua: (meta.ua || '').slice(0, 120), body: (meta.body || '').slice(0, 1000) || undefined, src: meta.src || undefined };
  const set = { lastPingAny: now }, upd = { $set: set, $inc: { nPings: 1 } };
  if (c.paused) set.paused = false; // a ping resumes a paused check
  if (kind === 'start') set.lastStart = now;
  if (kind === 'success' || kind === 'fail') {
    const started = c.lastStart && (!c.lastPing || +c.lastStart > +c.lastPing) ? now - c.lastStart : null;
    if (started != null && started < 7 * 864e5) ping.dur = started;
    Object.assign(set, { lastPing: now, lastKind: kind, lastDuration: ping.dur ?? null });
    if (kind === 'success') Object.assign(set, { status: 'up', due: new Date(+now + (c.period + c.grace) * 1000) });
    else Object.assign(set, { status: 'down', due: null });
  }
  upd.$push = { pings: { $each: [ping], $slice: -HISTORY } };
  // flip atomically so two simultaneous pings can't both send the same alert
  const flipTo = kind === 'success' && c.status === 'down' ? 'up' : kind === 'fail' && c.status !== 'down' ? 'down' : null;
  let before = c;
  if (flipTo) {
    upd.$push.flips = { $each: [{ at: now, to: flipTo }], $slice: -200 };
    before = await col.findOneAndUpdate({ _id: c._id, status: c.status }, upd, { returnDocument: 'before', projection: { pings: 0 } });
    if (!before) { await col.updateOne({ _id: c._id }, { $set: set, $inc: { nPings: 1 }, $push: { pings: upd.$push.pings } }); return c; }
    if (flipTo === 'down' || c.status === 'down') await alert({ ...c, ...set }, flipTo);
  } else await col.updateOne({ _id: c._id }, upd);
  return before;
}

// Mark every overdue "up" check as down and alert, exactly once each. `filter` narrows it (e.g. one user).
export async function sweep(filter = {}, max = 500) {
  const col = (await db()).collection('checks');
  const flipped = [];
  for (let i = 0; i < max; i++) {
    const now = new Date();
    const c = await col.findOneAndUpdate(
      { ...filter, status: 'up', paused: { $ne: true }, due: { $lt: now } },
      { $set: { status: 'down', due: null }, $push: { flips: { $each: [{ at: now, to: 'down' }], $slice: -200 } } },
      { returnDocument: 'after', projection: { pings: 0 } });
    if (!c) break;
    flipped.push(c);
  }
  await Promise.all(flipped.map(c => alert(c, 'down')));
  return flipped.length;
}

// validation for create / update
export const PERIOD_MIN = 60, PERIOD_MAX = 365 * 86400, GRACE_MIN = 60, GRACE_MAX = 30 * 86400;
export function cleanCheck(b, partial = false) {
  const out = {}, err = m => { throw Object.assign(new Error(m), { status: 400 }); };
  if (!partial || b.name !== undefined) {
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    if (!name) err('Give the check a name');
    out.name = name;
  }
  if (b.desc !== undefined) out.desc = String(b.desc || '').trim().slice(0, 500);
  if (b.tags !== undefined) out.tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(/[,\s]+/)).map(t => String(t).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)).filter(Boolean).slice(0, 8);
  for (const [f, lo, hi, label] of [['period', PERIOD_MIN, PERIOD_MAX, 'Schedule'], ['grace', GRACE_MIN, GRACE_MAX, 'Grace time']]) {
    if (partial && b[f] === undefined) continue;
    const v = Math.round(Number(b[f] ?? (f === 'period' ? 86400 : 3600)));
    if (!Number.isFinite(v) || v < lo || v > hi) err(`${label} must be between ${lo / 60} minutes and ${hi / 86400} days`);
    out[f] = v;
  }
  if (b.public !== undefined) out.public = !!b.public;
  return out;
}
