// Passwords (scrypt), signed session cookies, login throttling.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ObjectId } from 'mongodb';
import { db } from './db.js';
import { cookies, setCookie, fail } from './http.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'nj_session', DAYS = 30;
const b64u = b => Buffer.from(b).toString('base64url');

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${b64u(salt)}$${b64u(key)}`;
}
export async function verifyPassword(pw, stored) {
  const [, salt, key] = String(stored).split('$');
  if (!salt || !key) return false;
  const want = Buffer.from(key, 'base64url');
  const got = await scrypt(pw, Buffer.from(salt, 'base64url'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}

// Session secret: SESSION_SECRET if set, otherwise a random one generated once and kept in the database.
let secret = null;
async function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (secret) return secret;
  const meta = (await db()).collection('meta');
  await meta.updateOne({ _id: 'session' }, { $setOnInsert: { secret: crypto.randomBytes(32).toString('hex') } }, { upsert: true });
  secret = (await meta.findOne({ _id: 'session' })).secret;
  return secret;
}

// cookie value: userId.expiry.sessionVersion.signature — bumping the user's sessionVersion logs out every device
const sign = async payload => crypto.createHmac('sha256', await getSecret()).update(payload).digest('base64url');
export async function startSession(res, user) {
  const exp = Date.now() + DAYS * 864e5, payload = `${user._id}.${exp}.${user.sv || 0}`;
  setCookie(res, COOKIE, `${payload}.${await sign(payload)}`, { maxAge: DAYS * 86400 });
}
export const endSession = res => setCookie(res, COOKIE, '', { maxAge: 0 });

export async function currentUser(req) {
  const raw = cookies(req)[COOKIE];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [id, exp, sv, sig] = parts, want = await sign(`${id}.${exp}.${sv}`);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  if (+exp < Date.now() || !ObjectId.isValid(id)) return null;
  const user = await (await db()).collection('users').findOne({ _id: new ObjectId(id) });
  if (!user || String(user.sv || 0) !== sv) return null;
  return user;
}
export async function requireUser(req) {
  return (await currentUser(req)) || fail(401, 'Please log in');
}

// at most 10 failed logins per email per 15 minutes
export async function throttle(email) {
  const t = (await db()).collection('throttle');
  const n = await t.countDocuments({ email, at: { $gt: new Date(Date.now() - 900e3) } });
  if (n >= 10) fail(429, 'Too many attempts. Try again in 15 minutes.');
  return () => t.insertOne({ email, at: new Date() });
}

export const publicUser = u => ({ id: String(u._id), email: u.email, name: u.name || '', plan: u.plan || 'free', slug: u.slug || '', pageTitle: u.pageTitle || '', createdAt: u.createdAt });
