// Creates (or resets) the App Review demo account with a realistic group to explore.
// DEMO_EMAIL / DEMO_PASSWORD come from the workflow inputs. Safe to re-run: it replaces the previous demo data.
import crypto from 'node:crypto';
import { db, close } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { inviteCode } from '../lib/access.js';

const email = String(process.env.DEMO_EMAIL || '').toLowerCase(), password = String(process.env.DEMO_PASSWORD || '');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || password.length < 8) { console.error('Set DEMO_EMAIL and a DEMO_PASSWORD of 8+ characters'); process.exit(1); }

const d = await db(), users = d.collection('users'), groups = d.collection('groups'), games = d.collection('games');
const old = await users.find({ demo: true }).toArray();
const oldGroups = await groups.find({ demo: true }).toArray();
await games.deleteMany({ groupId: { $in: oldGroups.map(g => g._id) } });
await groups.deleteMany({ demo: true });
await users.deleteMany({ $or: [{ demo: true }, { email }] });
console.log(`removed ${old.length} old demo users and ${oldGroups.length} groups`);

const now = Date.now(), H = 3600e3, D = 864e5;
const mk = async (name, mail, pw) => ({ _id: (await users.insertOne({ email: mail, name, password: await hashPassword(pw), sv: 0, demo: true, createdAt: new Date(now - 30 * D) })).insertedId, name });
const me = await mk('App Review', email, password);
const names = ['Marcus Bell', 'Ana Ruiz', 'Sam Cole', 'Jo Park', 'Dee Grant', 'Eli Shaw', 'Ben Ito', 'Fay Nolan'];
const others = [];
for (const [i, n] of names.entries()) others.push(await mk(n, `demo-player-${i + 1}@turnout.invalid`, crypto.randomBytes(18).toString('base64url')));
const all = [me, ...others], id = u => String(u._id);

const group = { name: 'Lunchtime Hoops (demo)', sport: 'basketball', location: 'Downtown Rec Center, court 2', about: 'Full court, runs to 11, winners stay on. This is a demo group for App Review.',
  invite: inviteCode(), demo: true, createdAt: new Date(now - 30 * D),
  members: all.map((u, i) => ({ userId: id(u), name: u.name, role: i === 0 ? 'owner' : i === 1 ? 'admin' : 'member', skill: [3, 5, 4, 3, 2, 4, 3, 2, 3][i], joinedAt: new Date(now - (30 - i) * D) })) };
group._id = (await groups.insertOne(group)).insertedId;

const rsvp = (u, want, minsAgo, guests = 0) => ({ userId: id(u), name: u.name, want, guests, at: new Date(now - minsAgo * 60e3) });
const next = new Date(now + 2 * D); next.setUTCHours(17, 0, 0, 0);
await games.insertOne({ groupId: group._id, startsAt: next, duration: 90, capacity: 8, minPlayers: 6, location: group.location, notes: 'Bring a light and a dark shirt.', cost: 24,
  status: 'scheduled', rsvps: [...others.slice(0, 6).map((u, i) => rsvp(u, 'in', 600 - i * 30)), rsvp(others[6], 'in', 100), rsvp(others[7], 'maybe', 90)],
  comments: [{ id: 'c1', userId: id(others[3]), name: others[3].name, text: 'Might be 5 min late, save me a spot 🙏', at: new Date(now - 2 * H) }],
  lateDrops: [], teams: null, final: null, v: 0, createdBy: id(others[0]), createdAt: new Date(now - D) });
const last = new Date(now - 5 * D);
const team1 = [me, others[0], others[2], others[4]].map(id), team2 = [others[1], others[3], others[5], others[6]].map(id);
await games.insertOne({ groupId: group._id, startsAt: last, duration: 90, capacity: 8, minPlayers: 6, location: group.location, notes: '', cost: 0,
  status: 'played', rsvps: [me, ...others.slice(0, 7)].map((u, i) => rsvp(u, 'in', 9000 - i * 10)), comments: [], lateDrops: [],
  teams: [team1.map(x => ({ id: x, name: all.find(u => id(u) === x).name, guest: false })), team2.map(x => ({ id: x, name: all.find(u => id(u) === x).name, guest: false }))],
  final: { players: [...team1, ...team2], noShows: [], teams: [team1, team2], score: [21, 17], at: new Date(last.getTime() + 2 * H), by: id(me) }, v: 0, createdBy: id(me), createdAt: new Date(now - 8 * D) });
console.log(`demo ready: ${email} owns "${group.name}" with ${all.length} members, 1 upcoming and 1 played game`);
await close();
