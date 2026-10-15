// GET  /api/auth                       -> { user } (null when logged out)
// POST /api/auth {action:'signup'|'login'|'logout'|'password', ...}
import { db } from '../lib/db.js';
import { route, fail, str } from '../lib/http.js';
import { hashPassword, verifyPassword, startSession, endSession, currentUser, requireUser, throttle, publicUser } from '../lib/auth.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const origin = req => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https')}://${host}` : '';
};

export default route({
  async GET({ req }) {
    const u = await currentUser(req);
    return { user: u ? publicUser(u) : null };
  },
  async POST({ req, res, body }) {
    const users = (await db()).collection('users');
    const email = str(body.email, 254).toLowerCase(), password = typeof body.password === 'string' ? body.password : '';

    if (body.action === 'signup') {
      if (!EMAIL.test(email)) fail(400, 'Enter a valid email address');
      if (password.length < 8) fail(400, 'Use at least 8 characters for your password');
      if (password.length > 200) fail(400, 'That password is too long');
      const user = { email, name: str(body.name, 80), password: await hashPassword(password), plan: 'free', sv: 0, createdAt: new Date(), origin: origin(req) };
      try { user._id = (await users.insertOne(user)).insertedId; }
      catch (e) { if (e.code === 11000) fail(409, 'An account with that email already exists. Log in instead.'); throw e; }
      await startSession(res, user);
      return { user: publicUser(user) };
    }

    if (body.action === 'login') {
      const failed = await throttle(email);
      const user = email && (await users.findOne({ email }));
      if (!user || !(await verifyPassword(password, user.password))) { await failed(); fail(401, 'Wrong email or password'); }
      const o = origin(req);
      if (o && o !== user.origin) await users.updateOne({ _id: user._id }, { $set: { origin: o } });
      await startSession(res, user);
      return { user: publicUser(user) };
    }

    if (body.action === 'logout') { endSession(res); return { ok: true }; }

    if (body.action === 'password') {
      const user = await requireUser(req);
      if (!(await verifyPassword(String(body.current || ''), user.password))) fail(400, 'Your current password is not right');
      if (password.length < 8) fail(400, 'Use at least 8 characters for your new password');
      const sv = (user.sv || 0) + 1; // signs out every other device
      await users.updateOne({ _id: user._id }, { $set: { password: await hashPassword(password), sv } });
      await startSession(res, { ...user, sv });
      return { ok: true };
    }
    fail(400, 'Unknown action');
  },
});
