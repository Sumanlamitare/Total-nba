// End to end against a real MongoDB (CI runs one): the API through the dev server, several users at once.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { MongoClient, ObjectId } from 'mongodb';

const PORT = 5491, BASE = `http://localhost:${PORT}`, DB = `turnout_e2e_${Date.now()}`;
let server, mongo;

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, json: await r.json().catch(() => null) };
  };
}
async function person(name) {
  const c = client();
  const r = await c('POST', '/api/auth', { action: 'signup', name, email: `${name.toLowerCase()}@example.com`, password: 'hoops-forever' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  c.id = r.json.user.id; c.name = name;
  return c;
}

before(async () => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be set');
  server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, NO_VITE: '1', PORT: String(PORT), TURNOUT_DB: DB }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => server.stdout.on('data', d => String(d).includes('dev on') && r()));
  mongo = await new MongoClient(process.env.MONGODB_URI).connect();
});
after(async () => { server?.kill(); await mongo?.db(DB).dropDatabase(); await mongo?.close(); });

test('a group runs a full week of pickup', async () => {
  const games = () => mongo.db(DB).collection('games');
  const anon = client();
  assert.equal((await anon('POST', '/api/auth', { action: 'signup', name: '', email: 'x@example.com', password: 'longenough' })).status, 400);

  const olivia = await person('Olivia'), marcus = await person('Marcus'), sam = await person('Sam'), jo = await person('Jo'), stranger = await person('Stranger');

  // group + invite
  const g = await olivia('POST', '/api/groups', { name: 'Tuesday Night Hoops', sport: 'basketball', location: 'Rucker Park' });
  assert.equal(g.status, 200);
  const gid = g.json.id;
  let grp = await olivia('GET', `/api/groups?id=${gid}`);
  const code = grp.json.group.invite;
  assert.ok(code);
  assert.equal((await stranger('GET', `/api/groups?id=${gid}`)).status, 404, 'non-members cannot see the group');
  const preview = await anon('GET', `/api/groups?invite=${code}`);
  assert.equal(preview.json.group.name, 'Tuesday Night Hoops'); assert.equal(preview.json.group.members, 1);
  for (const p of [marcus, sam, jo]) assert.equal((await p('POST', `/api/groups?invite=${code}&action=join`, {})).status, 200);
  assert.equal((await marcus('POST', `/api/groups?invite=${code}&action=join`, {})).status, 200, 'joining twice is harmless');
  grp = await olivia('GET', `/api/groups?id=${gid}`);
  assert.equal(grp.json.members.length, 4);
  assert.equal((await marcus('GET', `/api/groups?id=${gid}`)).json.group.invite, null, 'members do not see the invite code');

  // games: organizers only
  const when = new Date(Date.now() + 3 * 864e5).toISOString();
  assert.equal((await marcus('POST', '/api/games', { groupId: gid, startsAt: when, capacity: 3 })).status, 403);
  const gm = await olivia('POST', '/api/games', { groupId: gid, startsAt: when, capacity: 3, minPlayers: 2, cost: 30, imIn: true });
  assert.equal(gm.status, 200);
  const id = gm.json.id;
  let x = await olivia('GET', `/api/games?id=${id}`);
  assert.equal(x.json.game.location, 'Rucker Park', 'defaults to the group location');
  assert.equal(x.json.game.me, 'in');

  // RSVPs, waitlist and promotion
  await marcus('POST', `/api/games?id=${id}&action=rsvp`, { want: 'in' });
  x = await sam('POST', `/api/games?id=${id}&action=rsvp`, { want: 'in' });
  assert.equal(x.json.game.taken, 3); assert.equal(x.json.game.need, 0);
  x = await jo('POST', `/api/games?id=${id}&action=rsvp`, { want: 'in' });
  assert.equal(x.json.game.me, 'waitlist');
  assert.equal(x.json.game.costEach, 10);
  assert.equal((await stranger('POST', `/api/games?id=${id}&action=rsvp`, { want: 'in' })).status, 404);
  assert.equal((await jo('POST', `/api/games?id=${id}&action=rsvp`, { want: 'yes' })).status, 400);

  // a late drop (within 24 hours) promotes the waitlist and is remembered
  await games().updateOne({ _id: new ObjectId(id) }, { $set: { startsAt: new Date(Date.now() + 2 * 3600e3) } });
  x = await marcus('POST', `/api/games?id=${id}&action=rsvp`, { want: 'out' });
  assert.equal(x.json.game.me, 'out');
  assert.equal((await jo('GET', `/api/games?id=${id}`)).json.game.me, 'in', 'Jo was promoted');
  assert.equal((await games().findOne({ _id: new ObjectId(id) })).lateDrops.length, 1);

  // many people answering at the same moment: nobody is lost
  const crowd = await Promise.all(['Ana', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay'].map(person));
  await Promise.all(crowd.map(p => p('POST', `/api/groups?invite=${code}&action=join`, {})));
  const answers = await Promise.all(crowd.map(p => p('POST', `/api/games?id=${id}&action=rsvp`, { want: 'in' })));
  assert.ok(answers.every(a => a.status === 200), answers.map(a => a.status).join());
  x = await olivia('GET', `/api/games?id=${id}`);
  assert.equal(x.json.game.roster.in.length, 3); assert.equal(x.json.game.roster.waitlist.length, 6);
  assert.equal(x.json.game.roster.out.length, 1);

  // skills and teams
  assert.equal((await marcus('POST', `/api/groups?id=${gid}&action=skill`, { userId: sam.id, skill: 5 })).status, 403);
  assert.equal((await olivia('POST', `/api/groups?id=${gid}&action=skill`, { userId: sam.id, skill: 5 })).status, 200);
  await olivia('PATCH', `/api/games?id=${id}`, { capacity: 4 });
  x = await olivia('POST', `/api/games?id=${id}&action=teams`, { n: 2 });
  assert.equal(x.status, 200);
  assert.deepEqual(x.json.game.teams.map(t => t.length), [2, 2]);
  assert.equal(x.json.game.teams.flat().length, 4);
  assert.equal((await marcus('POST', `/api/games?id=${id}&action=teams`, { n: 2 })).status, 403);

  // the result can only be entered once the game has started
  assert.equal((await olivia('POST', `/api/games?id=${id}&action=result`, { noShows: [] })).status, 409);
  await games().updateOne({ _id: new ObjectId(id) }, { $set: { startsAt: new Date(Date.now() - 3600e3) } });
  const teams = (await olivia('GET', `/api/games?id=${id}`)).json.game.teams;
  const winners = teams[0].map(p => p.id);
  const noShow = teams[1][0].id;
  x = await olivia('POST', `/api/games?id=${id}&action=result`, { score: [21, 17], noShows: [noShow] });
  assert.equal(x.status, 200); assert.equal(x.json.game.status, 'played');
  assert.equal((await jo('POST', `/api/games?id=${id}&action=rsvp`, { want: 'out' })).status, 409, 'played games are closed');

  grp = await olivia('GET', `/api/groups?id=${gid}`);
  const st = Object.fromEntries(grp.json.stats.map(s => [s.userId, s]));
  for (const w of winners) assert.equal(st[w].wins, 1);
  assert.equal(st[noShow].noShows, 1); assert.equal(st[noShow].losses, 0);
  assert.equal(st[marcus.id].lateDrops, 1); assert.equal(st[marcus.id].reliability, 0);
  assert.equal(grp.json.past.length, 1); assert.equal(grp.json.upcoming.length, 0);

  // comments
  x = await sam('POST', `/api/games?id=${id}&action=comment`, { text: 'Good run 🔥' });
  const cid = x.json.game.comments[0].id;
  assert.equal((await jo('POST', `/api/games?id=${id}&action=uncomment`, { commentId: cid })).status, 403);
  assert.equal((await sam('POST', `/api/games?id=${id}&action=uncomment`, { commentId: cid })).json.game.comments.length, 0);

  // home lists
  await olivia('POST', '/api/games', { groupId: gid, startsAt: new Date(Date.now() + 864e5).toISOString(), capacity: 10 });
  const home = await jo('GET', '/api/games');
  assert.equal(home.json.games.length, 1); assert.equal(home.json.games[0].groupName, 'Tuesday Night Hoops');
  assert.equal((await jo('GET', '/api/groups')).json.groups[0].next.capacity, 10);

  // roles, renames, leaving
  assert.equal((await olivia('POST', `/api/groups?id=${gid}&action=role`, { userId: marcus.id, role: 'admin' })).status, 200);
  assert.equal((await marcus('POST', '/api/games', { groupId: gid, startsAt: when, capacity: 8 })).status, 200);
  assert.equal((await marcus('POST', `/api/groups?id=${gid}&action=remove`, { userId: olivia.id })).status, 403);
  await jo('PATCH', '/api/auth', { name: 'Joanna' });
  grp = await olivia('GET', `/api/groups?id=${gid}`);
  assert.ok(grp.json.members.some(m => m.name === 'Joanna'));
  assert.equal((await olivia('POST', `/api/groups?id=${gid}&action=leave`, {})).status, 409, 'owner must hand over first');
  assert.equal((await sam('POST', `/api/groups?id=${gid}&action=leave`, {})).status, 200);
  assert.equal((await sam('GET', `/api/groups?id=${gid}`)).status, 404);

  // account deletion is blocked while you own a group with members; the owner can hand it over
  assert.equal((await olivia('DELETE', '/api/auth', { password: 'hoops-forever' })).status, 409);
  assert.equal((await olivia('POST', `/api/groups?id=${gid}&action=role`, { userId: marcus.id, role: 'owner' })).status, 200);
  assert.equal((await olivia('DELETE', '/api/auth', { password: 'hoops-forever' })).status, 200);
  grp = await marcus('GET', `/api/groups?id=${gid}`);
  assert.equal(grp.json.me.role, 'owner');
  assert.ok(!grp.json.members.some(m => m.userId === olivia.id));

  // new invite link invalidates the old one; deleting the group removes its games
  const fresh = await marcus('POST', `/api/groups?id=${gid}&action=invite`, {});
  assert.notEqual(fresh.json.invite, code);
  assert.equal((await stranger('POST', `/api/groups?invite=${code}&action=join`, {})).status, 404);
  assert.equal((await marcus('DELETE', `/api/groups?id=${gid}`)).status, 200);
  assert.equal(await games().countDocuments({ groupId: new ObjectId(gid) }), 0);
});
