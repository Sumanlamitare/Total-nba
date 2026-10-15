import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, uptime, parseKind, cleanCheck, dailyBars } from '../lib/checks.js';
import { human } from '../lib/time.js';
import { checkUrl } from '../lib/net.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { message } from '../lib/alerts.js';

const H = 3600e3, now = Date.parse('2026-10-15T12:00:00Z');
const base = { period: 3600, grace: 600, status: 'up', paused: false, createdAt: new Date(now - 40 * 864e5) };

test('state follows the clock', () => {
  assert.equal(state({ ...base, lastPing: new Date(now - 0.5 * H) }, now), 'up');
  assert.equal(state({ ...base, lastPing: new Date(now - 1.05 * H) }, now), 'late');
  assert.equal(state({ ...base, status: 'down', lastPing: new Date(now - 5 * H) }, now), 'down');
  assert.equal(state({ ...base, paused: true }, now), 'paused');
  assert.equal(state({ ...base, status: 'new' }, now), 'new');
  assert.equal(state({ ...base, lastPing: new Date(now - 2 * H), lastStart: new Date(now - H) }, now), 'running');
});

test('uptime counts down time from flips', () => {
  assert.equal(uptime({ ...base, flips: [] }, 30, now), 1);
  const flips = [{ at: new Date(now - 3 * 864e5), to: 'down' }, { at: new Date(now - 1.5 * 864e5), to: 'up' }];
  assert.ok(Math.abs(uptime({ ...base, flips }, 30, now) - (1 - 1.5 / 30)) < 1e-9);
  const stillDown = [{ at: new Date(now - 3 * 864e5), to: 'down' }];
  assert.ok(Math.abs(uptime({ ...base, flips: stillDown }, 30, now) - (1 - 3 / 30)) < 1e-9);
  // created 10 days ago: the window is 10 days, not 30
  assert.ok(Math.abs(uptime({ ...base, createdAt: new Date(now - 10 * 864e5), flips: stillDown }, 30, now) - 0.7) < 1e-9);
});

test('daily bars mark days with downtime', () => {
  const flips = [{ at: new Date(now - 2 * 864e5), to: 'down' }, { at: new Date(now - 2 * 864e5 + H), to: 'up' }];
  const bars = dailyBars({ ...base, flips }, 30, now);
  assert.equal(bars.length, 30);
  assert.equal(bars.filter(b => b.s === 'down').length, 1);
  assert.equal(bars.at(-1).s, 'up');
});

test('ping suffixes', () => {
  assert.equal(parseKind(''), 'success');
  assert.equal(parseKind('start'), 'start');
  assert.equal(parseKind('fail'), 'fail');
  assert.equal(parseKind('0'), 'success');
  assert.equal(parseKind('2'), 'fail');
  assert.equal(parseKind('nope'), null);
});

test('check validation', () => {
  assert.deepEqual(cleanCheck({ name: ' Backup ', period: 86400, grace: 3600, tags: 'DB, nightly x!' }), { name: 'Backup', period: 86400, grace: 3600, tags: ['db', 'nightly', 'x'] });
  assert.throws(() => cleanCheck({ name: '' }), /name/);
  assert.throws(() => cleanCheck({ name: 'a', period: 10 }), /Schedule/);
  assert.deepEqual(cleanCheck({ grace: 120 }, true), { grace: 120 });
});

test('human durations', () => {
  assert.equal(human(90061), '1 day 1 hour');
  assert.equal(human(300), '5 minutes');
  assert.equal(human(0), '0 seconds');
});

test('alert URLs must be public https', () => {
  assert.equal(checkUrl('https://hooks.slack.com/services/x'), null);
  assert.match(checkUrl('http://example.com'), /https/);
  assert.match(checkUrl('https://localhost/x'), /reachable/);
  assert.match(checkUrl('https://192.168.1.5/x'), /reachable/);
  assert.match(checkUrl('https://169.254.169.254/latest'), /reachable/);
  assert.match(checkUrl('not a url'), /full URL/);
});

test('passwords hash and verify', async () => {
  const h = await hashPassword('correct horse');
  assert.ok(await verifyPassword('correct horse', h));
  assert.ok(!(await verifyPassword('wrong', h)));
});

test('alert message wording', () => {
  const c = { _id: 'abc', name: 'Nightly backup', period: 86400, lastPing: new Date(Date.now() - 26 * H) };
  const m = message(c, 'down', 'https://x.app');
  assert.match(m.text, /Nightly backup is DOWN/);
  assert.match(m.text, /expected every 1 day/);
  assert.match(m.text, /https:\/\/x.app\/app\/checks\/abc/);
  assert.match(message({ ...c, lastKind: 'fail' }, 'down').text, /reported a failure/);
});
