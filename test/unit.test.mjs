import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roster, answer, statusOf, balance, teamPool, stats, cleanGame, cleanGroup } from '../lib/turnout.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';

const t0 = new Date('2026-10-20T18:00:00Z');
const at = m => new Date(+t0 - 3 * 864e5 + m * 60e3);
const game = (capacity, rsvps, extra = {}) => ({ capacity, minPlayers: 0, startsAt: t0, rsvps, ...extra });
const r = (id, want, m, guests = 0) => ({ userId: id, name: id.toUpperCase(), want, guests, at: at(m) });

test('first come, first served up to capacity; the rest wait in order', () => {
  const g = game(3, [r('c', 'in', 3), r('a', 'in', 1), r('b', 'in', 2), r('d', 'in', 4), r('e', 'maybe', 0), r('f', 'out', 0)]);
  const x = roster(g);
  assert.deepEqual(x.confirmed.map(p => p.userId), ['a', 'b', 'c']);
  assert.deepEqual(x.waitlist.map(p => p.userId), ['d']);
  assert.equal(x.maybe.length, 1); assert.equal(x.out.length, 1); assert.equal(x.open, 0);
});

test('guests take spots, and a party that does not fit blocks the line', () => {
  const g = game(4, [r('a', 'in', 1, 2), r('b', 'in', 2, 1), r('c', 'in', 3)]);
  const x = roster(g);
  assert.deepEqual(x.confirmed.map(p => p.userId), ['a']);
  assert.deepEqual(x.waitlist.map(p => p.userId), ['b', 'c'], 'c waits behind b even though c alone would fit');
  assert.equal(x.taken, 3);
});

test('someone dropping promotes the first on the waitlist', () => {
  let g = game(2, [r('a', 'in', 1), r('b', 'in', 2), r('c', 'in', 3)]);
  assert.equal(statusOf(g, 'c'), 'waitlist');
  g = { ...g, rsvps: answer(g, { id: 'a', name: 'A' }, 'out', 0, at(100)).rsvps };
  assert.equal(statusOf(g, 'c'), 'in');
  assert.equal(statusOf(g, 'a'), 'out');
});

test('keeping or losing your place', () => {
  const g = game(2, [r('a', 'in', 1, 1), r('b', 'in', 2)]);
  const fewer = answer(g, { id: 'a', name: 'A' }, 'in', 0, at(50)).rsvps;
  assert.equal(+fewer.find(x => x.userId === 'a').at, +at(1), 'dropping a guest keeps your place');
  const more = answer({ ...g, rsvps: fewer }, { id: 'a', name: 'A' }, 'in', 1, at(60)).rsvps;
  assert.equal(+more.find(x => x.userId === 'a').at, +at(60), 'adding a guest sends you to the back');
  const again = answer(g, { id: 'b', name: 'B' }, 'out', 0, at(70));
  const back = answer({ ...g, rsvps: again.rsvps }, { id: 'b', name: 'B' }, 'in', 0, at(80)).rsvps;
  assert.equal(+back.find(x => x.userId === 'b').at, +at(80), 'leaving and rejoining sends you to the back');
});

test('dropping out within 24 hours of a confirmed spot is a late drop', () => {
  const g = game(10, [r('a', 'in', 1), r('w', 'in', 2)], { capacity: 1 });
  assert.equal(answer(g, { id: 'a', name: 'A' }, 'out', 0, new Date(+t0 - 2 * 3600e3)).lateDrop, true);
  assert.equal(answer(g, { id: 'a', name: 'A' }, 'out', 0, new Date(+t0 - 48 * 3600e3)).lateDrop, false);
  assert.equal(answer(g, { id: 'w', name: 'W' }, 'out', 0, new Date(+t0 - 3600e3)).lateDrop, false, 'leaving the waitlist is fine');
  assert.throws(() => answer(g, { id: 'a', name: 'A' }, 'yes'), /in, maybe or out/);
  assert.throws(() => answer(g, { id: 'a', name: 'A' }, 'in', 9), /Guests/);
});

test('teams are even in size and close in skill', () => {
  const skills = [5, 5, 4, 4, 3, 3, 3, 2, 2, 1];
  const players = skills.map((s, i) => ({ id: 'p' + i, name: 'P' + i, skill: s }));
  for (let k = 0; k < 20; k++) {
    const [a, b] = balance(players, 2);
    assert.equal(a.length, 5); assert.equal(b.length, 5);
    const sa = a.reduce((s, p) => s + p.skill, 0), sb = b.reduce((s, p) => s + p.skill, 0);
    assert.ok(Math.abs(sa - sb) <= 1, `gap ${sa} vs ${sb}`);
    assert.equal(new Set([...a, ...b].map(p => p.id)).size, 10);
  }
  const three = balance(players.slice(0, 9), 3);
  assert.deepEqual(three.map(t => t.length), [3, 3, 3]);
});

test('team pool includes guests', () => {
  const g = game(10, [r('a', 'in', 1, 2), r('b', 'in', 2)]);
  const pool = teamPool(g, { a: 5 });
  assert.deepEqual(pool.map(p => p.id), ['a', 'a+1', 'a+2', 'b']);
  assert.equal(pool[0].skill, 5); assert.equal(pool[3].skill, 3); assert.equal(pool[1].guest, true);
});

test('stats: attendance, no-shows, late drops, wins', () => {
  const games = [
    { status: 'played', final: { players: ['a', 'b', 'c', 'd'], noShows: ['d'], teams: [['a', 'b'], ['c', 'd']], score: [21, 15] } },
    { status: 'played', final: { players: ['a', 'c'], noShows: [], teams: [['a'], ['c']], score: [10, 10] } },
    { status: 'played', final: { players: ['a'], noShows: [] } },
    { status: 'scheduled', lateDrops: [{ userId: 'b', at: t0 }] },
    { status: 'canceled', final: { players: ['z'] } },
  ];
  const s = Object.fromEntries(stats(games).map(x => [x.userId, x]));
  assert.deepEqual([s.a.played, s.a.wins, s.a.draws, s.a.losses, s.a.reliability], [3, 1, 1, 0, 1]);
  assert.deepEqual([s.c.played, s.c.wins, s.c.draws, s.c.losses], [2, 0, 1, 1]);
  assert.deepEqual([s.d.played, s.d.noShows, s.d.losses, s.d.reliability], [0, 1, 0, 0]);
  assert.deepEqual([s.b.played, s.b.lateDrops, s.b.reliability], [1, 1, 0.5]);
  assert.equal(s.z, undefined);
});

test('validation', () => {
  assert.throws(() => cleanGroup({ name: '', sport: 'basketball' }), /name/);
  assert.throws(() => cleanGroup({ name: 'x', sport: 'curling' }), /sport/);
  assert.deepEqual(cleanGroup({ name: '  Tuesday   hoops ', sport: 'basketball' }), { name: 'Tuesday hoops', sport: 'basketball' });
  const g = cleanGame({ startsAt: new Date(Date.now() + 864e5).toISOString(), capacity: 10, minPlayers: 8, cost: '40' });
  assert.equal(g.capacity, 10); assert.equal(g.duration, 90); assert.equal(g.cost, 40);
  assert.throws(() => cleanGame({ startsAt: 'nope' }), /date/);
  assert.throws(() => cleanGame({ startsAt: new Date(Date.now() - 864e5) }), /passed/);
  assert.throws(() => cleanGame({ startsAt: new Date(Date.now() + 864e5), capacity: 6, minPlayers: 8 }), /more than the spots/);
});

test('passwords', async () => {
  const h = await hashPassword('swish swish');
  assert.ok(await verifyPassword('swish swish', h)); assert.ok(!(await verifyPassword('brick', h)));
});
