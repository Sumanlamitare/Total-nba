// End to end against MongoDB (CI runs a Mongo container): saved ESPN responses and a matching NBA.com box score →
// the monitor → verified games, feed entries (no duplicates on re-runs), the API (feed, entry, rail, intel, pages),
// accounts, reactions and comments, graphics (create, save, render PNG/JPEG), and the live stream.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { mockSources } from './mock-sources.mjs';

const GID = '401909922'; // 76ers at Pistons, final
let m, d, lib = {};

// Call an API function with a fake request/response.
async function call(name, { method = 'GET', query = {}, body, cookie } = {}) {
  const { default: fn } = await import(`../api/${name}.js`);
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { method, url: `/api/${name}`, query, headers: { host: 'test', ...(cookie ? { cookie } : {}) } });
  const out = { status: 200, headers: {}, chunks: [] };
  const res = {
    statusCode: 200, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, getHeader(k) { return out.headers[k.toLowerCase()]; },
    write(c) { out.chunks.push(Buffer.from(c)); return true; }, end(c) { if (c) out.chunks.push(Buffer.from(c)); this.writableEnded = true; out.status = this.statusCode; },
  };
  await fn(req, res);
  const raw = Buffer.concat(out.chunks);
  let json = null; try { json = JSON.parse(raw.toString()); } catch { /* binary */ }
  const set = out.headers['set-cookie'];
  return { status: out.status, json, raw, headers: out.headers, cookie: set ? String(set).split(';')[0] : null };
}

before(async () => {
  m = await mockSources();
  Object.assign(process.env, m.env, { ATN_DB: `atn_e2e_${process.pid}`, ATN_SETUP_HASH: crypto.createHash('sha256').update('atn-setup:testcode').digest('hex'), ATN_INSECURE_COOKIE: '1', ATN_STREAM_SECONDS: '4', ATN_STREAM_POLL_MS: '300' });
  // NBA.com agrees with ESPN on the 76ers–Pistons game (built from the same box score).
  const espn = await import('../lib/providers/espn.js');
  const c = await espn.game(GID);
  m.tweak.nba = (path) => {
    if (path.includes('todaysScoreboard')) return { scoreboard: { games: [{ gameId: '0022600173', gameStatus: 3, gameTimeUTC: c.game.start, awayTeam: { teamTricode: 'PHI' }, homeTeam: { teamTricode: 'DET' } }] } };
    if (path.includes('boxscore_0022600173')) {
      const side = t => ({ teamTricode: t.abbr, score: t.score, players: c.players.filter(p => p.team === t.id && p.line).map(p => ({ name: p.name, played: '1', statistics: { points: p.line.pts, reboundsTotal: p.line.reb, assists: p.line.ast } })) });
      return { game: { gameStatus: 3, awayTeam: side(c.game.teams.find(t => !t.home)), homeTeam: side(c.game.teams.find(t => t.home)) } };
    }
    return null;
  };
  const { db } = await import('../lib/db.js');
  d = await db();
  lib.tick = (await import('../lib/automation.js')).tick;
});
after(async () => { try { await d.dropDatabase(); } catch { /* */ } await (await import('../lib/db.js')).close(); await m.close(); });

test('the monitor verifies a final against NBA.com and turns it into feed entries', async () => {
  const s = await lib.tick(d, { dates: ['20261104'], log: () => {} });
  assert.equal(s.errors, 0);
  const g = await d.collection('games').findOne({ _id: GID });
  assert.equal(g.verify.status, 'verified');
  assert.ok(g.verify.checks.every(c => c.ok !== false));
  assert.ok(await d.collection('pgames').countDocuments({ g: GID }) >= 16);
  const feed = await d.collection('feed').find({ 'game.id': GID }).toArray();
  assert.ok(feed.length >= 3);
  assert.ok(feed.every(e => e.verification && e.sources?.length && e.game?.id === GID));
  assert.ok(feed.some(e => e.published && e.status === 'final'));
  assert.ok(feed.find(e => e.category === 'comeback')?.body.includes('trailed by 17'));
});

test('running again creates no duplicates; a game waiting for NBA.com publishes no outcomes', async () => {
  const before = await d.collection('feed').countDocuments();
  const seq = (await d.collection('meta').findOne({ _id: 'feedseq' })).n;
  await lib.tick(d, { dates: ['20261104'], force: true, log: () => {} });
  assert.equal(await d.collection('feed').countDocuments(), before);
  const resent = await d.collection('feed').find({ seq: { $gt: seq } }, { projection: { category: 1, headline: 1, history: 1 } }).toArray();
  assert.deepEqual(resent.map(e => `${e._id} ${e.headline} ${JSON.stringify(e.history?.slice(-2))}`), [], 'nothing changed, nothing re-sent');
  await lib.tick(d, { dates: ['20250115'], log: () => {} }); // NBA.com has no box score for these
  const g = await d.collection('games').findOne({ _id: '401705127' });
  assert.equal(g.verify.status, 'pending');
  assert.equal(await d.collection('feed').countDocuments({ 'game.id': '401705127', published: true }), 0);
});

test('feed API: list, entry, rail, intel, ticker, pages', async () => {
  const list = await call('feed', { query: { action: 'list' } });
  assert.equal(list.status, 200);
  assert.ok(list.json.items.length > 0 && list.json.items.every(e => e.published));
  const e = list.json.items[0];
  const one = await call('feed', { query: { action: 'entry', id: e._id } });
  assert.equal(one.json.entry._id, e._id);
  assert.ok((await call('feed', { query: { action: 'rail' } })).json.performances.length > 0);
  assert.ok('sections' in (await call('feed', { query: { action: 'intel', date: '20261104' } })).json);
  assert.ok(Array.isArray((await call('feed', { query: { action: 'ticker' } })).json));
  const game = await call('nba', { query: { action: 'game', id: GID } });
  assert.equal(game.json.game.id, GID);
  assert.ok(game.json.feed.length > 0);
  const pid = e.players?.[0]?.id || (await d.collection('pgames').findOne({ g: GID })).p;
  assert.equal((await call('nba', { query: { action: 'player', id: pid } })).status, 200);
  assert.equal((await call('nba', { query: { action: 'team', id: '20' } })).status, 200);
  assert.ok((await call('nba', { query: { action: 'search', term: 'embiid' } })).json.players.length >= 1);
  assert.equal((await call('records', { query: { action: 'overview' } })).status, 200);
});

test('accounts: setup code, fan sign-up, reactions and comments, roles', async () => {
  assert.equal((await call('admin', { method: 'POST', query: { action: 'setup' }, body: { code: 'wrong', email: 'o@x.co', name: 'Owner', password: 'long-enough-1' } })).status, 403);
  const owner = await call('admin', { method: 'POST', query: { action: 'setup' }, body: { code: 'testcode', email: 'o@x.co', name: 'Owner', password: 'long-enough-1' } });
  assert.equal(owner.json.user.role, 'owner');
  const fan = await call('admin', { method: 'POST', query: { action: 'signup' }, body: { email: 'fan@x.co', name: 'Fan', password: 'long-enough-2' } });
  assert.equal(fan.json.user.role, 'fan');
  const e = (await call('feed', { query: { action: 'list' } })).json.items[0];
  const r = await call('feed', { method: 'POST', query: { action: 'react' }, body: { id: e._id, emoji: 'fire' }, cookie: fan.cookie });
  assert.equal(r.json.reactions.fire, 1);
  const c = await call('feed', { method: 'POST', query: { action: 'comment' }, body: { id: e._id, text: 'What a stretch' }, cookie: fan.cookie });
  assert.equal(c.json.text, 'What a stretch');
  assert.equal((await call('feed', { query: { action: 'entry', id: e._id }, cookie: fan.cookie })).json.comments.length, 1);
  assert.equal((await call('feed', { method: 'POST', query: { action: 'react' }, body: { id: e._id, emoji: 'fire' } })).status, 401, 'signed out');
  assert.equal((await call('graphics', { query: { action: 'list' }, cookie: fan.cookie })).status, 403, 'fans cannot edit graphics');
  assert.equal((await call('admin', { method: 'POST', query: { action: 'settings' }, body: { settings: { feed: { minScore: 60 } } }, cookie: fan.cookie })).status, 403);
  const s = await call('admin', { method: 'POST', query: { action: 'settings' }, body: { settings: { feed: { minScore: 55 } } }, cookie: owner.cookie });
  assert.equal(s.json.settings.feed.minScore, 55);
  lib.owner = owner.cookie;
});

test('graphics: create from an event, edit, render PNG and JPEG', async () => {
  const e = (await call('feed', { query: { action: 'list' } })).json.items[0];
  const g = await call('graphics', { method: 'POST', query: { action: 'create' }, body: { feedId: e._id }, cookie: lib.owner });
  const id = g.json.id;
  const doc = (await call('graphics', { query: { action: 'get', id }, cookie: lib.owner })).json;
  assert.equal(doc.feedId, e._id);
  const project = { ...doc.project, overrides: { headline: { text: 'EDITED' } }, format: 'ig_portrait' };
  assert.equal((await call('graphics', { method: 'POST', query: { action: 'save' }, body: { id, project, title: 'Edited' }, cookie: lib.owner })).status, 200);
  const png = await call('graphics', { query: { action: 'render', id } });
  assert.equal(png.headers['content-type'], 'image/png');
  assert.equal(png.raw.subarray(1, 4).toString(), 'PNG');
  const jpg = await call('graphics', { query: { action: 'render', id, f: 'jpeg' } });
  assert.equal(jpg.raw[0], 0xff); assert.equal(jpg.raw[1], 0xd8);
});

test('the live stream pushes a new entry', async () => {
  const p = call('stream', { query: {} });
  await new Promise(r => setTimeout(r, 800));
  const { upsert } = await import('../lib/feed.js');
  const { getSettings } = await import('../lib/settings.js');
  await upsert(d, { _id: 'test:stream', category: 'close', significance: 80, status: 'developing', headline: 'ONE-POSSESSION GAME', body: 'Test', teams: [], players: [], game: { id: 'x' }, occurredAt: new Date(), sources: [], verification: { status: 'developing' } }, await getSettings(d));
  const r = await p;
  const text = r.raw.toString();
  assert.match(text, /event: hello/);
  assert.match(text, /event: entry\ndata:/);
  assert.match(text, /ONE-POSSESSION GAME/);
});

test('agent API: today\'s stories with images; marking a post needs the key', async () => {
  const t = await call('agent', { query: { action: 'today' }, });
  assert.ok(t.json.entries.length > 0);
  const e = t.json.entries[0];
  assert.match(e.images.story, /format=ig_story/);
  assert.ok('confirmed' in e && 'developing' in e && e.sources);
  assert.equal((await call('agent', { method: 'POST', query: { action: 'posted' }, body: { id: e.id, platform: 'x', url: 'https://x.com/a/1' } })).status, 401);
  const k = await call('admin', { method: 'POST', query: { action: 'agentkey' }, cookie: lib.owner });
  const { default: fn } = await import('../api/agent.js');
  const ok = await (async () => { // with the key
    const req = Readable.from([Buffer.from(JSON.stringify({ id: e.id, platform: 'x', url: 'https://x.com/a/1' }))]);
    Object.assign(req, { method: 'POST', url: '/api/agent', query: { action: 'posted' }, headers: { host: 'test', authorization: `Bearer ${k.json.key}` } });
    let status = 0; const res = { statusCode: 200, setHeader() {}, getHeader() {}, end() { status = this.statusCode; this.writableEnded = true; }, write() {} };
    await fn(req, res); return status;
  })();
  assert.equal(ok, 200);
  const after = await call('agent', { query: { action: 'today', unposted: 'x' } });
  assert.ok(!after.json.entries.some(x => x.id === e.id), 'posted entries drop out of unposted');
});

test('feed graphics render on demand in every size', async () => {
  const e = (await call('feed', { query: { action: 'list' } })).json.items[0];
  for (const format of ['x_landscape', 'ig_story']) {
    const r = await call('graphics', { query: { action: 'feed', id: e._id, format, f: 'jpeg' } });
    assert.equal(r.headers['content-type'], 'image/jpeg', format);
  }
});

test('streaks come from the team schedule', async () => {
  const { streakStories } = await import('../lib/feed.js');
  const { getSettings } = await import('../lib/settings.js');
  const g = await d.collection('games').findOne({ _id: GID });
  const s = await streakStories(d, g, await getSettings(d));
  for (const x of s) assert.match(x.headline, /STRAIGHT|SNAPPED|SKID/);
});

test('the daily reset clears the day an hour before the first game, keeps the record book and accounts', async () => {
  const { maybeReset } = await import('../lib/reset.js');
  await d.collection('records').updateOne({ _id: 'keep' }, { $set: { title: 'x' } }, { upsert: true });
  await d.collection('meta').deleteOne({ _id: 'slate' });
  // Today's mock scoreboard (Nov 4, 2026) has games; "now" an hour before the first is due.
  const sb = await (await import('../lib/providers/espn.js')).scoreboard('20261104');
  const first = sb.games.map(x => new Date(x.start)).sort((a, b) => a - b)[0];
  const early = await maybeReset(d, { now: new Date(+first - 2 * 3600e3) });
  assert.equal(early.reset, false);
  const r = await maybeReset(d, { now: new Date(+first - 50 * 60e3) });
  assert.equal(r.reset, true);
  assert.equal(await d.collection('feed').countDocuments(), 0);
  assert.equal(await d.collection('pgames').countDocuments(), 0);
  assert.ok(await d.collection('records').findOne({ _id: 'keep' }));
  assert.ok(await d.collection('users').countDocuments() >= 2);
  assert.equal((await maybeReset(d, { now: new Date(+first - 40 * 60e3) })).reset, false, 'once per day');
});
