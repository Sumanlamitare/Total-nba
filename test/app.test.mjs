// The mobile app's side of the API: bearer tokens, push notifications (to a fake Expo push service), report & block.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';

const PORT = 5591, PUSH = 5592, BASE = `http://localhost:${PORT}`, DB = `turnout_app_${Date.now()}`;
let server, pushSrv, mongo, pushes = [], dead = new Set();
const wait = ms => new Promise(r => setTimeout(r, ms));

function app(token = null) {
  const c = async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') };
  };
  c.token = token;
  return c;
}
async function person(name, tz) {
  const c = app();
  const r = await c('POST', '/api/auth', { action: 'signup', app: true, name, email: `${name.toLowerCase()}@example.com`, password: 'game-time-1' });
  assert.equal(r.status, 200); assert.ok(r.json.token); assert.equal(r.cookie, null, 'the app gets a token, not a cookie');
  c.token = r.json.token; c.id = r.json.user.id;
  c.push = `ExponentPushToken[${name.toLowerCase()}0123456789]`;
  assert.equal((await c('POST', '/api/auth', { action: 'device', token: c.push, tz })).status, 200);
  return c;
}
const to = c => pushes.filter(p => p.to === c.push);

before(async () => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be set');
  pushSrv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d).on('end', () => {
      const msgs = JSON.parse(b); pushes.push(...msgs);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: msgs.map(m => (dead.has(m.to) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'x' })) }));
    });
  }).listen(PUSH);
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, NO_VITE: '1', PORT: String(PORT), TURNOUT_DB: DB, PUSH_URL: `http://127.0.0.1:${PUSH}/push` }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => server.stdout.on('data', d => String(d).includes('dev on') && r()));
  mongo = await new MongoClient(process.env.MONGODB_URI).connect();
});
after(async () => { server?.kill(); pushSrv?.close(); await mongo?.db(DB).dropDatabase(); await mongo?.close(); });

test('tokens, notifications, report and block', async () => {
  const devices = () => mongo.db(DB).collection('devices');
  assert.equal((await app('nope.1.0.bad')('GET', '/api/groups')).status, 401);

  const olivia = await person('Olivia', 'America/New_York'), marcus = await person('Marcus', 'Europe/London');
  assert.equal((await olivia('POST', '/api/auth', { action: 'device', token: 'not-a-token' })).status, 400);
  assert.equal((await olivia('GET', '/api/auth')).json.user.name, 'Olivia');

  const gid = (await olivia('POST', '/api/groups', { name: 'Lunch Hoops', sport: 'basketball' })).json.id;
  const code = (await olivia('GET', `/api/groups?id=${gid}`)).json.group.invite;
  await marcus('POST', `/api/groups?invite=${code}&action=join`, {});

  // a new game notifies everyone else in the group, in their own time zone
  const start = new Date(Date.UTC(2031, 5, 3, 17, 0)); // 1:00 PM in New York, 6:00 PM in London
  const id = (await olivia('POST', '/api/games', { groupId: gid, startsAt: start.toISOString(), capacity: 1, imIn: true, location: 'Gym 2' })).json.id;
  assert.equal(to(olivia).length, 0, 'the organizer is not notified about their own game');
  assert.equal(to(marcus).length, 1);
  assert.equal(to(marcus)[0].title, 'Lunch Hoops');
  assert.match(to(marcus)[0].body, /New game Tue, Jun 3, 6:00 PM at Gym 2 — are you in\?/);
  assert.equal(to(marcus)[0].data.url, `/game/${id}`);

  // waitlist promotion is pushed to the promoted player only
  assert.equal((await marcus('POST', `/api/games?id=${id}&action=rsvp`, { want: 'in' })).json.game.me, 'waitlist');
  await olivia('POST', `/api/games?id=${id}&action=rsvp`, { want: 'out' });
  assert.equal(to(marcus).length, 2);
  assert.equal(to(marcus)[1].title, 'You\'re in! 🎉');
  assert.equal(to(olivia).length, 0);

  // raising the spots also promotes
  await olivia('POST', `/api/games?id=${id}&action=rsvp`, { want: 'in' });
  assert.equal((await olivia('GET', `/api/games?id=${id}`)).json.game.me, 'waitlist');
  await olivia('PATCH', `/api/games?id=${id}`, { capacity: 2 });
  assert.equal(to(olivia).length, 0, 'not notified about a change you made yourself');

  // report and block
  const c = (await olivia('POST', `/api/games?id=${id}&action=comment`, { text: 'something rude' })).json.game.comments[0];
  assert.equal((await marcus('POST', `/api/games?id=${id}&action=report`, { commentId: c.id, reason: 'abusive' })).status, 200);
  assert.equal(await mongo.db(DB).collection('reports').countDocuments({ commentId: c.id, reporterId: marcus.id }), 1);
  const blocked = await marcus('POST', '/api/auth', { action: 'block', userId: olivia.id });
  assert.deepEqual(blocked.json.user.blocked, [olivia.id]);
  assert.equal((await marcus('GET', `/api/games?id=${id}`)).json.game.comments.length, 0, 'blocked people\'s messages are hidden');
  assert.equal((await olivia('GET', `/api/games?id=${id}`)).json.game.comments.length, 1);
  await marcus('POST', '/api/auth', { action: 'unblock', userId: olivia.id });
  assert.equal((await marcus('GET', `/api/games?id=${id}`)).json.game.comments.length, 1);

  // canceling notifies the players (not the organizer); dead phone registrations are cleaned up
  dead.add(marcus.push);
  await olivia('POST', `/api/games?id=${id}&action=cancel`, {});
  await wait(100);
  assert.match(to(marcus).at(-1).title, /game canceled/);
  assert.equal(await devices().countDocuments({ token: marcus.push }), 0);

  // a password change hands the app a new token and ends the old one
  const old = olivia.token;
  const pw = await olivia('POST', '/api/auth', { action: 'password', app: true, current: 'game-time-1', password: 'new-game-time-2' });
  assert.ok(pw.json.token && pw.json.token !== old);
  assert.equal((await app(old)('GET', '/api/auth')).json.user, null);
  olivia.token = pw.json.token;
  assert.equal((await olivia('GET', '/api/auth')).json.user.name, 'Olivia');

  // logging out removes the phone
  await olivia('POST', '/api/auth', { action: 'logout', device: olivia.push });
  assert.equal(await devices().countDocuments({ token: olivia.push }), 0);
});

test('the App Review demo account can be created, re-created and used', async () => {
  const { execFileSync } = await import('node:child_process');
  const env = { ...process.env, TURNOUT_DB: DB, DEMO_EMAIL: 'review@example.com', DEMO_PASSWORD: 'review-pass-1' };
  execFileSync(process.execPath, ['scripts/seed-demo.mjs'], { env });
  execFileSync(process.execPath, ['scripts/seed-demo.mjs'], { env }); // re-running replaces it
  const c = app();
  const r = await c('POST', '/api/auth', { action: 'login', app: true, email: 'review@example.com', password: 'review-pass-1' });
  assert.equal(r.status, 200); c.token = r.json.token;
  const groups = (await c('GET', '/api/groups')).json.groups;
  assert.equal(groups.length, 1); assert.equal(groups[0].role, 'owner'); assert.equal(groups[0].members, 9);
  const g = (await c('GET', `/api/groups?id=${groups[0].id}`)).json;
  assert.equal(g.upcoming.length, 1); assert.equal(g.past.length, 1); assert.ok(g.stats.length >= 8);
  assert.equal(await mongo.db(DB).collection('groups').countDocuments({ demo: true }), 1);
});
