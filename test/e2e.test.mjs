// End to end against a real MongoDB (CI runs a mongo service): the API through the dev server,
// alerts caught by a local webhook receiver. Needs MONGODB_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';

const PORT = 5391, HOOK = 5392, BASE = `http://localhost:${PORT}`;
const DB = `nightjar_e2e_${Date.now()}`;
let server, hook, mongo, hits = [];

const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await wait(50); } return fn(); }

function client() {
  let cookie = '';
  return async (method, path, body, headers = {}) => {
    const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* text */ }
    return { status: r.status, json, text, type: r.headers.get('content-type') || '' };
  };
}

before(async () => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be set for e2e tests');
  hook = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c).on('end', () => { hits.push(JSON.parse(b)); res.end('ok'); }); }).listen(HOOK);
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, NO_VITE: '1', PORT: String(PORT), NIGHTJAR_DB: DB, NIGHTJAR_ALLOW_HTTP: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => server.stdout.on('data', d => String(d).includes('dev on') && r()));
  mongo = await new MongoClient(process.env.MONGODB_URI).connect();
});
after(async () => { server?.kill(); hook?.close(); await mongo?.db(DB).dropDatabase(); await mongo?.close(); });

test('the whole journey', async () => {
  const a = client(), b = client();
  const checks = () => mongo.db(DB).collection('checks');

  assert.equal((await a('GET', '/api/auth')).json.user, null);
  assert.equal((await a('POST', '/api/auth', { action: 'signup', email: 'bad', password: 'longenough' })).status, 400);
  assert.equal((await a('POST', '/api/auth', { action: 'signup', email: 'a@example.com', password: 'short' })).status, 400);
  const su = await a('POST', '/api/auth', { action: 'signup', email: 'A@Example.com', password: 'longenough', name: 'Ada' });
  assert.equal(su.status, 200); assert.equal(su.json.user.email, 'a@example.com');
  assert.equal((await a('GET', '/api/auth')).json.user.name, 'Ada');
  assert.equal((await b('POST', '/api/auth', { action: 'signup', email: 'a@example.com', password: 'longenough' })).status, 409);
  assert.equal((await b('POST', '/api/auth', { action: 'login', email: 'a@example.com', password: 'wrongpass' })).status, 401);
  await b('POST', '/api/auth', { action: 'signup', email: 'b@example.com', password: 'longenough' });

  // writes must be JSON (CSRF guard)
  assert.equal((await a('POST', '/api/checks', 'name=x', { 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await client()('GET', '/api/checks')).status, 401);

  const created = await a('POST', '/api/checks', { name: 'Nightly backup', period: 3600, grace: 600, tags: 'db' });
  assert.equal(created.status, 200);
  const c = created.json.check;
  assert.equal(c.state, 'new'); assert.ok(c.key.length >= 20);
  assert.equal((await b('GET', `/api/checks?id=${c.id}`)).status, 404, 'other users cannot see it');

  // alerts go to a webhook
  assert.equal((await a('POST', '/api/channels', { kind: 'webhook', target: 'http://example.com/x' })).status, 400);
  assert.equal((await a('POST', '/api/channels', { kind: 'slack', target: 'https://example.com/x' })).status, 400);
  assert.equal((await a('POST', '/api/channels', { kind: 'webhook', name: 'test hook', target: `http://127.0.0.1:${HOOK}/hook` })).status, 200);
  const t = await a('POST', `/api/checks?id=${c.id}&action=test`, {});
  assert.equal(t.json.results[0].ok, true); assert.equal(hits.at(-1).event, 'test');

  // first ping: up, no alert
  const n0 = hits.length;
  const p1 = await a('GET', `/p/${c.key}`);
  assert.equal(p1.status, 200); assert.equal(p1.text, 'OK\n');
  assert.equal((await a('GET', `/api/checks?id=${c.id}`)).json.check.state, 'up');
  assert.equal(hits.length, n0);
  assert.equal((await a('GET', '/p/doesnotexist12345')).status, 404);

  // missed deadline -> sweep marks it down and alerts once
  await checks().updateOne({}, { $set: { due: new Date(Date.now() - 1000) } });
  const list = await a('GET', '/api/checks');
  assert.equal(list.json.checks[0].state, 'down');
  await until(() => hits.some(h => h.event === 'down'));
  assert.equal(hits.filter(h => h.event === 'down').length, 1);
  await a('GET', '/api/checks');
  assert.equal(hits.filter(h => h.event === 'down').length, 1, 'no duplicate alert');

  // ping again -> back up, alert
  await a('POST', `/p/${c.key}`, 'backup ok: 12GB');
  await until(() => hits.some(h => h.event === 'up'));
  let d = await a('GET', `/api/checks?id=${c.id}`);
  assert.equal(d.json.check.state, 'up'); assert.equal(d.json.pings[0].body, 'backup ok: 12GB');
  assert.ok(d.json.check.uptime30 < 1);

  // start + success measures duration; /fail and exit codes report failure
  await a('GET', `/p/${c.key}/start`);
  assert.equal((await a('GET', `/api/checks?id=${c.id}`)).json.check.state, 'running');
  await wait(120);
  await a('GET', `/p/${c.key}/0`);
  d = await a('GET', `/api/checks?id=${c.id}`);
  assert.ok(d.json.check.lastDuration >= 100);
  await a('GET', `/p/${c.key}/1`);
  assert.equal((await a('GET', `/api/checks?id=${c.id}`)).json.check.state, 'down');
  await until(() => hits.filter(h => h.event === 'down').length === 2);

  // pause: not swept while paused, a ping resumes it
  await a('GET', `/p/${c.key}`);
  await a('POST', `/api/checks?id=${c.id}&action=pause`, {});
  await checks().updateOne({}, { $set: { due: new Date(Date.now() - 1000) } });
  assert.equal((await a('GET', '/api/checks')).json.checks[0].state, 'paused');
  await a('GET', `/p/${c.key}`);
  assert.equal((await a('GET', '/api/checks')).json.checks[0].state, 'up');

  // edit
  const e = await a('PATCH', `/api/checks?id=${c.id}`, { name: 'DB backup', period: 86400, public: true });
  assert.equal(e.json.check.name, 'DB backup'); assert.equal(e.json.check.period, 86400);

  // public status page and badge; no secrets leak
  assert.equal((await a('PATCH', '/api/account', { slug: 'api' })).status, 400);
  assert.equal((await a('PATCH', '/api/account', { slug: 'ada-labs', pageTitle: 'Ada Labs' })).status, 200);
  assert.equal((await b('PATCH', '/api/account', { slug: 'ada-labs' })).status, 409);
  const page = await client()('GET', '/api/public?slug=ada-labs');
  assert.equal(page.json.title, 'Ada Labs'); assert.equal(page.json.checks.length, 1); assert.equal(page.json.checks[0].bars.length, 30);
  assert.ok(!page.text.includes(c.key), 'ping key must not leak');
  const badge = await client()('GET', `/b/${c.badge}.svg`);
  assert.match(badge.type, /svg/); assert.match(badge.text, /DB backup/); assert.match(badge.text, />up</);

  // plan limit
  for (let i = 0; i < 19; i++) await a('POST', '/api/checks', { name: 'job ' + i, period: 3600, grace: 600 });
  assert.equal((await a('POST', '/api/checks', { name: 'one too many', period: 3600, grace: 600 })).status, 402);

  // password change signs out other sessions
  const a2 = client();
  await a2('POST', '/api/auth', { action: 'login', email: 'a@example.com', password: 'longenough' });
  assert.equal((await a('POST', '/api/auth', { action: 'password', current: 'longenough', password: 'evenlonger1' })).status, 200);
  assert.equal((await a2('GET', '/api/auth')).json.user, null);
  assert.equal((await a('GET', '/api/auth')).json.user.email, 'a@example.com');

  // delete account removes everything
  assert.equal((await a('DELETE', '/api/account', { password: 'nope' })).status, 400);
  assert.equal((await a('DELETE', '/api/account', { password: 'evenlonger1' })).status, 200);
  assert.equal(await checks().countDocuments({ name: 'DB backup' }), 0);
  assert.equal((await a('GET', '/api/auth')).json.user, null);
  assert.equal((await client()('GET', '/api/public?slug=ada-labs')).status, 404);
});
