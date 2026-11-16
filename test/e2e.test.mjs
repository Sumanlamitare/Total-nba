// End to end on a mock ESPN (real response shapes) and an in-memory database: sync, live checks, full time → one
// graphic, review flags, manual and automatic cleanup (the brief's examples), graphics surviving deletion, the API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { mockEspn, event } from './mock-espn.mjs';

let m, d, lib = {};
const H = 3600e3;
const T = { a: ['1', 'Alpha FC', 'Alpha', 'ALP', 'ff0000'], b: ['2', 'Beta United', 'Beta', 'BET', '0000ff'], c: ['3', 'Gamma Town', 'Gamma', 'GAM', '00aa00'], d: ['4', 'Delta City', 'Delta', 'DEL', 'aaaa00'] };

async function call(name, { method = 'GET', query = {}, body, cookie } = {}) {
  const { default: fn } = await import(`../api/${name}.js`);
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { method, url: `/api/${name}?${new URLSearchParams(query)}`, query, headers: { host: 'x', ...(cookie ? { cookie } : {}) } });
  const out = { status: 200, headers: {}, chunks: [] };
  const res = { statusCode: 200, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, getHeader(k) { return out.headers[k.toLowerCase()]; }, end(b) { out.chunks.push(Buffer.from(b || '')); this.writableEnded = true; }, writableEnded: false };
  await fn(req, res);
  const raw = Buffer.concat(out.chunks);
  const set = out.headers['set-cookie'];
  return { status: res.statusCode, headers: out.headers, raw, json: /json/.test(out.headers['content-type'] || '') ? JSON.parse(raw.toString() || 'null') : null, cookie: set ? String(set).split(';')[0] : cookie };
}

before(async () => {
  // The brief's example day: four matches finish 2–5 PM, two are still to come at 7 and 9 PM (America/New_York).
  const day = Date.UTC(2026, 10, 16, 5); // 16 Nov 2026, 00:00 in New York
  lib.day = day;
  const at = h => day + h * H;
  const events = [
    ['eng.1', event({ id: '501', at: at(12), home: T.a, away: T.b, status: 'ft', score: [1, 0], goals: [{ side: 'home', player: 'Ann Able', min: "33'" }] })],
    ['eng.1', event({ id: '502', at: at(13), home: T.c, away: T.d, status: 'ft', score: [2, 2], goals: [{ side: 'home', player: 'Cy Cee', min: "10'" }, { side: 'away', player: 'Di Dee', min: "45+1'", kind: 'pen' }, { side: 'away', player: 'Cy Cee', min: "60'", kind: 'og' }, { side: 'home', player: 'Cy Cee', min: "90+5'" }] })],
    ['esp.1', event({ id: '503', at: at(14), home: T.b, away: T.a, status: 'ft', score: [0, 0] })],
    ['fra.coupe_de_france', event({ id: '504', at: at(15), home: T.d, away: T.c, status: 'pen', score: [1, 1], shootout: [4, 2], goals: [{ side: 'home', player: 'Di Dee', min: "5'" }, { side: 'away', player: 'Cy Cee', min: "88'" }, { side: 'home', player: 'Di Dee', min: "120'", kind: 'so' }] })],
    ['eng.1', event({ id: '505', at: at(19), home: T.a, away: T.c })],
    ['ita.1', event({ id: '506', at: at(21), home: T.b, away: T.d })],
    // Tuesday's first match is at 7 AM: the automatic cleanup is due at 6 AM.
    ['ger.1', event({ id: '507', at: at(24 + 7), home: T.c, away: T.a })],
    ['ger.1', event({ id: '508', at: at(24 + 12), home: T.d, away: T.b })],
    ['eng.w.1', event({ id: '590', at: at(16), home: T.a, away: T.b, status: 'ft', score: [1, 0] })],
  ];
  m = await mockEspn({ events });
  Object.assign(process.env, m.env, { FP90_MEMDB: '1', FP90_SETUP_HASH: crypto.createHash('sha256').update('fp90-setup:code').digest('hex'), FP90_INSECURE_COOKIE: '1' });
  ({ db: lib.db } = await import('../lib/db.js'));
  d = await lib.db();
  Object.assign(lib, await import('../lib/jobs.js'), await import('../lib/cleanup.js'), await import('../lib/matches.js'));
});
after(async () => { await m.close(); });

test('sync: every enabled competition, one request per competition per day, women\'s never', async () => {
  const now = new Date(lib.day + 18 * H); // Monday 6 PM
  const before = m.hits.length;
  await lib.sync(d, { now });
  const reqs = m.hits.slice(before).filter(h => h.includes('/scoreboard'));
  assert.equal(reqs.length, 39 * 3, '39 competitions × today, tomorrow, the day after');
  assert.ok(reqs.every(h => /dates=\d{8}$/.test(h)), 'single days only (ESPN refuses ranges)');
  assert.ok(!reqs.some(h => h.includes('eng.w.1')));
  const ids = (await d.collection('matches').find({}).toArray()).map(x => x._id).sort();
  assert.deepEqual(ids, ['501', '502', '503', '504', '505', '506', '507', '508']);
});

test('full time: one graphic per match with the right scorers; repeating never duplicates', async () => {
  const now = new Date(lib.day + 18 * H);
  for (let i = 0; i < 3; i++) await lib.step(d, { now: new Date(+now + i * 61e3) });
  const g = await d.collection('graphics').find({}).sort({ _id: 1 }).toArray();
  assert.deepEqual(g.map(x => x._id), ['501', '502', '503', '504']);
  assert.ok(g.every(x => x.status === 'ready' && x.render?.ok), g.map(x => `${x._id}:${x.status}:${x.error}`).join(' '));
  const g2 = g.find(x => x._id === '502').data;
  assert.deepEqual(g2.scorers, { home: ["Cy Cee 10', 90+5'"], away: ["Di Dee 45+1' (P)", "Cy Cee 60' (OG)"] });
  const g4 = g.find(x => x._id === '504').data;
  assert.deepEqual(g4.shootout, { home: 4, away: 2 });
  assert.deepEqual(g4.scorers, { home: ["Di Dee 5'"], away: ["Cy Cee 88'"] }, 'shootout kicks are not goals');
  assert.deepEqual(g.find(x => x._id === '503').data.scorers, { home: [], away: [] });
  // Once its graphic exists, a match is no longer checked.
  const active = (await lib.activeMatches(d, { now })).map(x => x._id);
  assert.ok(!active.some(id => ['501', '502', '503', '504'].includes(id)));
});

test('live → full time is picked up by the live check, polling only the competitions that are on', async () => {
  const kick = new Date(lib.day + 19 * H);
  m.update('505', e => { e.competitions[0].status.type = { name: 'STATUS_SECOND_HALF', state: 'in', completed: false }; e.competitions[0].competitors[0].score = '1'; e.competitions[0].details = [{ type: { text: 'Goal' }, clock: { displayValue: "50'" }, team: { id: '1' }, scoringPlay: true, penaltyKick: false, ownGoal: false, shootout: false, athletesInvolved: [{ displayName: 'Ann Able' }] }]; });
  const before = m.hits.length;
  await lib.poll(d, { now: new Date(+kick + 50 * 60e3) });
  const reqs = m.hits.slice(before);
  assert.deepEqual(reqs.filter(h => h.includes('scoreboard')).map(h => h.split('?')[0]), ['/soccer/eng.1/scoreboard'], 'one request, for the one competition with a match on');
  assert.equal((await d.collection('matches').findOne({ _id: '505' })).status, 'live');
  m.update('505', e => { e.competitions[0].status.type = { name: 'STATUS_FULL_TIME', state: 'post', completed: true }; });
  await lib.poll(d, { now: new Date(+kick + 115 * 60e3) });
  const g = await d.collection('graphics').findOne({ _id: '505' });
  assert.equal(g?.status, 'ready');
  assert.deepEqual(g.data.scorers.home, ["Ann Able 50'"]);
});

test('incomplete goal data waits, then is flagged for review instead of guessed', async () => {
  const kick = new Date(lib.day + 21 * H);
  m.update('506', e => { e.competitions[0].status.type = { name: 'STATUS_FULL_TIME', state: 'post', completed: true }; e.competitions[0].competitors[1].score = '1'; e.competitions[0].details = []; e.summaryKeyEvents = []; });
  await lib.poll(d, { now: new Date(+kick + 110 * 60e3) });
  let x = await d.collection('matches').findOne({ _id: '506' });
  assert.equal(x.graphic.status, 'waiting');
  assert.equal(await d.collection('graphics').countDocuments({ _id: '506' }), 0, 'no graphic while waiting');
  await lib.poll(d, { now: new Date(+kick + 110 * 60e3 + 95 * 60e3) });
  x = await d.collection('matches').findOne({ _id: '506' });
  const g = await d.collection('graphics').findOne({ _id: '506' });
  assert.equal(x.graphic.status, 'review');
  assert.equal(g.status, 'review');
  assert.ok(g.problems.some(p => /1 goal in the score, 0 with a scorer/.test(p)), g.problems.join(' | '));
});

test('manual delete (the brief\'s example): finished matches go, upcoming ones stay, graphics stay, and a sync can\'t bring them back', async () => {
  // Rewind 505/506 to "upcoming" for the 6 PM scenario: they are E and F.
  for (const id of ['505', '506']) { await d.collection('matches').updateOne({ _id: id }, { $set: { status: 'scheduled', graphic: { status: 'none' }, ftAt: null } }); await d.collection('graphics').deleteOne({ _id: id }); }
  m.update('505', e => { e.competitions[0].status.type = { name: 'STATUS_SCHEDULED', state: 'pre', completed: false }; });
  m.update('506', e => { e.competitions[0].status.type = { name: 'STATUS_SCHEDULED', state: 'pre', completed: false }; });
  const p = await lib.preview(d);
  assert.equal(p.matches, 4);
  assert.equal(p.goalEvents, 1 + 4 + 0 + 2);
  const r = await lib.runCleanup(d, { now: new Date(lib.day + 18 * H), reason: 'manual' });
  assert.equal(r.deleted, 4);
  const left = (await d.collection('matches').find({}).toArray()).map(x => x._id).sort();
  assert.deepEqual(left, ['505', '506', '507', '508']);
  assert.equal(await d.collection('graphics').countDocuments({ _id: { $in: ['501', '502', '503', '504'] } }), 4, 'graphics kept');
  await lib.sync(d, { now: new Date(lib.day + 18 * H) });
  assert.equal(await d.collection('matches').countDocuments({ _id: { $in: ['501', '502', '503', '504'] } }), 0, 'deleted matches stay deleted');
  const again = await lib.runCleanup(d, { now: new Date(lib.day + 18 * H), reason: 'manual' });
  assert.equal(again.deleted, 0, 'idempotent');
});

test('automatic cleanup: 60 minutes before the next day\'s first kickoff, once, never live or upcoming matches', async () => {
  const tue6 = new Date(lib.day + 30 * H); // Tuesday 6:00 AM New York
  const plan = await lib.plan(d, { now: new Date(lib.day + 20 * H) });
  assert.equal(plan.day, '20261117');
  assert.equal(new Date(plan.dueAt).toISOString(), tue6.toISOString());
  assert.equal(plan.basis, 'first-kickoff');
  // E finishes at 9 PM; F is still live at 6 AM (a late, long match) — F must be kept.
  m.update('505', e => { e.competitions[0].status.type = { name: 'STATUS_FULL_TIME', state: 'post', completed: true }; });
  m.update('506', e => { e.competitions[0].status.type = { name: 'STATUS_SECOND_HALF', state: 'in', completed: false }; e.competitions[0].competitors[1].score = '0'; e.competitions[0].details = []; });
  await lib.poll(d, { now: new Date(lib.day + 21.1 * H) });
  assert.equal((await d.collection('matches').findOne({ _id: '505' })).graphic.status, 'generated');
  let r = await lib.autoCleanup(d, { now: new Date(+tue6 - 60e3) });
  assert.equal(r.due, false, 'not before 6 AM');
  r = await lib.autoCleanup(d, { now: tue6 });
  assert.equal(r.ran, true);
  assert.equal(r.deleted, 1, 'E (finished Monday) deleted');
  const left = (await d.collection('matches').find({}).toArray()).map(x => x._id).sort();
  assert.deepEqual(left, ['506', '507', '508'], 'live F and Tuesday\'s matches kept');
  r = await lib.autoCleanup(d, { now: new Date(+tue6 + 5 * 60e3) });
  assert.equal(r.due, false, 'runs once per day');
  const next = await lib.plan(d, { now: new Date(+tue6 + 60e3) });
  assert.equal(next.day, '20261118');
  assert.equal(next.basis, 'fallback', 'no Wednesday matches known: fallback time');
  assert.equal(new Date(next.dueAt).toISOString(), new Date(lib.day + 54 * H).toISOString(), 'Wednesday 06:00 New York');
});

test('API: sign-in required; delete needs confirmation; graphics still download after their match data is gone', async () => {
  assert.equal((await call('matches', { query: { action: 'dashboard' } })).status, 401);
  const owner = await call('admin', { method: 'POST', query: { action: 'setup' }, body: { code: 'code', name: 'Owner', email: 'o@x.co', password: 'long-enough-pw' } });
  assert.equal(owner.status, 200);
  const c = owner.cookie;
  const dash = await call('matches', { query: { action: 'dashboard' }, cookie: c });
  assert.equal(dash.status, 200);
  assert.ok(dash.json.matches.length >= 3 && dash.json.cleanup.dueAt);
  assert.equal((await call('matches', { method: 'POST', query: { action: 'deleteCompleted' }, body: {}, cookie: c })).status, 400, 'needs confirm');
  const png = await call('graphics', { query: { action: 'png', id: '502', download: '1' }, cookie: c });
  assert.equal(png.status, 200);
  assert.equal(png.headers['content-type'], 'image/png');
  assert.equal(png.raw.readUInt32BE(16), 1080); assert.equal(png.raw.readUInt32BE(20), 1350);
  assert.match(png.headers['content-disposition'], /attachment/);
  // Edit a flagged graphic, approve it, regenerate from its own data (the match is gone), reset.
  const save = await call('graphics', { method: 'POST', query: { action: 'save' }, body: { id: '502', edits: { 'scorers.home': ["Cy Cee 10', 90+5'", ''], 'home.name': 'Gamma' } }, cookie: c });
  assert.equal(save.json.data.home.name, 'Gamma');
  const regen = await call('graphics', { method: 'POST', query: { action: 'regenerate' }, body: { id: '502' }, cookie: c });
  assert.equal(regen.json.data.home.name, 'Gamma', 'edits survive a regenerate');
  const reset = await call('graphics', { method: 'POST', query: { action: 'save' }, body: { id: '502', reset: true }, cookie: c });
  assert.equal(reset.json.data.home.name, 'Gamma Town');
  const list = await call('graphics', { query: { action: 'list' }, cookie: c });
  assert.ok(list.json.items.length >= 5);
});
