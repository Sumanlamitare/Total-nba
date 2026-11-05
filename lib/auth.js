// Accounts and sessions. The first account (the owner) can only be created with the setup code (its SHA-256 is below,
// or ATN_SETUP_HASH); after that the owner invites editors and viewers. Passwords: scrypt. Sessions: a random token in an
// HttpOnly, Secure, SameSite=Lax cookie; only its hash is stored. Fans can sign up on their own (to react, comment and
// keep favorites); editors are invited by the owner.
import crypto from 'node:crypto';
import { fail } from './http.js';

const SETUP_HASH = () => process.env.ATN_SETUP_HASH || '64bc3e26594d82cb88d6a16385cecb702c7a3fce2c1a5f16a409bffa225a4d15';
const COOKIE = 'atn_session';
const DAYS = 30;
export const ROLES = ['owner', 'editor', 'fan'];

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(crypto.scryptSync(String(pw), salt, 64).toString('hex')), b = Buffer.from(h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanEmail = e => String(e || '').trim().toLowerCase().slice(0, 200);
const validPassword = p => typeof p === 'string' && p.length >= 10 && p.length <= 200;

function cookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function setCookie(res, value, maxAge) {
  const secure = process.env.NODE_ENV === 'development' || process.env.ATN_INSECURE_COOKIE ? '' : '; Secure';
  res.setHeader('set-cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

async function startSession(d, res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  await d.collection('sessions').insertOne({ _id: sha(token), uid: user._id, expires: new Date(Date.now() + DAYS * 86400e3), at: new Date() });
  setCookie(res, token, DAYS * 86400);
}

export async function currentUser(d, req) {
  const t = cookies(req)[COOKIE];
  if (!t) return null;
  const s = await d.collection('sessions').findOne({ _id: sha(t) });
  if (!s || new Date(s.expires) < new Date()) return null;
  const u = await d.collection('users').findOne({ _id: s.uid }, { projection: { password: 0 } });
  return u && !u.disabled ? u : null;
}

// role: the least role required (fan < editor < owner).
export async function requireUser(d, req, role = 'fan') {
  const u = await currentUser(d, req);
  if (!u) fail(401, 'Sign in first');
  if (ROLES.indexOf(u.role) > ROLES.indexOf(role)) fail(403, `This needs the ${role} role`);
  return u;
}

export async function throttle(d, key) {
  const m = await d.collection('meta').findOneAndUpdate({ _id: `login:${key}` }, { $inc: { n: 1 }, $setOnInsert: { since: new Date() } }, { upsert: true, returnDocument: 'after' });
  if (m && new Date() - new Date(m.since) > 15 * 60e3) { await d.collection('meta').updateOne({ _id: `login:${key}` }, { $set: { n: 1, since: new Date() } }); return; }
  if (m && m.n > 10) fail(429, 'Too many attempts; try again in 15 minutes');
}

export async function setupNeeded(d) { return !(await d.collection('users').countDocuments({}, { limit: 1 })); }

export async function setup(d, res, { code, email, name, password }) {
  if (!(await setupNeeded(d))) fail(409, 'Already set up; sign in');
  await throttle(d, 'setup');
  if (sha(`atn-setup:${String(code || '').trim()}`) !== SETUP_HASH()) fail(403, 'Wrong setup code');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail(email))) fail(400, 'Enter an email address');
  if (!validPassword(password)) fail(400, 'Use a password of at least 10 characters');
  const user = { _id: crypto.randomUUID(), email: cleanEmail(email), name: String(name || '').slice(0, 80) || cleanEmail(email).split('@')[0], role: 'owner', password: hashPassword(password), createdAt: new Date() };
  await d.collection('users').insertOne(user);
  await startSession(d, res, user);
  const { password: _, ...out } = user;
  return out;
}

export async function login(d, res, { email, password }) {
  const e = cleanEmail(email);
  await throttle(d, sha(e).slice(0, 16));
  const u = await d.collection('users').findOne({ email: e });
  if (!u || u.disabled || !checkPassword(password, u.password)) fail(401, 'Wrong email or password');
  await startSession(d, res, u);
  await d.collection('users').updateOne({ _id: u._id }, { $set: { lastLogin: new Date() } });
  const { password: _, ...out } = u;
  return out;
}

export async function logout(d, req, res) {
  const t = cookies(req)[COOKIE];
  if (t) await d.collection('sessions').deleteOne({ _id: sha(t) });
  setCookie(res, '', 0);
}

export async function signup(d, res, { email, name, password }) {
  const e = cleanEmail(email);
  await throttle(d, `signup:${sha(e).slice(0, 12)}`);
  if (await setupNeeded(d)) fail(409, 'The site is not set up yet');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) fail(400, 'Enter an email address');
  if (!validPassword(password)) fail(400, 'Use a password of at least 10 characters');
  const display = String(name || '').trim().slice(0, 40);
  if (display.length < 2) fail(400, 'Choose a display name');
  if (await d.collection('users').findOne({ email: e })) fail(409, 'That email already has an account');
  const user = { _id: crypto.randomUUID(), email: e, name: display, role: 'fan', password: hashPassword(password), createdAt: new Date(), prefs: {} };
  await d.collection('users').insertOne(user);
  await startSession(d, res, user);
  const { password: _, ...out } = user;
  return out;
}

// The owner adds people; the temporary password is shown once.
export async function invite(d, { email, name, role }) {
  const e = cleanEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) fail(400, 'Enter an email address');
  if (!ROLES.includes(role) || role === 'owner') fail(400, 'Role must be editor or fan');
  if (await d.collection('users').findOne({ email: e })) fail(409, 'That email already has an account');
  const temp = crypto.randomBytes(9).toString('base64url');
  await d.collection('users').insertOne({ _id: crypto.randomUUID(), email: e, name: String(name || '').slice(0, 80) || e.split('@')[0], role, password: hashPassword(temp), mustChange: true, createdAt: new Date() });
  return { email: e, temporaryPassword: temp };
}

export async function changePassword(d, user, { current, next }) {
  const u = await d.collection('users').findOne({ _id: user._id });
  if (!checkPassword(current, u.password)) fail(403, 'Current password is wrong');
  if (!validPassword(next)) fail(400, 'Use a password of at least 10 characters');
  await d.collection('users').updateOne({ _id: u._id }, { $set: { password: hashPassword(next), mustChange: false } });
  await d.collection('sessions').deleteMany({ uid: u._id });
}
