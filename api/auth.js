// GET    /api/auth                                    -> { user } (null when logged out)
// POST   /api/auth {action:'signup'|'login'|'logout'|'password', ...}
// PATCH  /api/auth {name}                             -> rename (also updates your name in groups and games)
// DELETE /api/auth {password}                         -> delete the account
import { db } from '../lib/db.js';
import { route, fail, str } from '../lib/http.js';
import { hashPassword, verifyPassword, startSession, endSession, currentUser, requireUser, throttle, publicUser } from '../lib/auth.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default route({
  async GET({ req }) {
    const u = await currentUser(req);
    return { user: u ? publicUser(u) : null };
  },
  async POST({ req, res, body }) {
    const users = (await db()).collection('users');
    const email = str(body.email, 254).toLowerCase(), password = typeof body.password === 'string' ? body.password : '';
    if (body.action === 'signup') {
      const name = str(body.name, 40);
      if (!name) fail(400, 'Tell us your name — it’s what your group sees');
      if (!EMAIL.test(email)) fail(400, 'Enter a valid email address');
      if (password.length < 8) fail(400, 'Use at least 8 characters for your password');
      if (password.length > 200) fail(400, 'That password is too long');
      const user = { email, name, password: await hashPassword(password), sv: 0, createdAt: new Date() };
      try { user._id = (await users.insertOne(user)).insertedId; }
      catch (e) { if (e.code === 11000) fail(409, 'An account with that email already exists. Log in instead.'); throw e; }
      await startSession(res, user);
      return { user: publicUser(user) };
    }
    if (body.action === 'login') {
      const failed = await throttle(email);
      const user = email && (await users.findOne({ email }));
      if (!user || !(await verifyPassword(password, user.password))) { await failed(); fail(401, 'Wrong email or password'); }
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
  async PATCH({ req, body }) {
    const user = await requireUser(req), d = await db();
    const name = str(body.name, 40);
    if (!name) fail(400, 'Your name can’t be empty');
    const id = String(user._id);
    await d.collection('users').updateOne({ _id: user._id }, { $set: { name } });
    await d.collection('groups').updateMany({ 'members.userId': id }, { $set: { 'members.$[m].name': name } }, { arrayFilters: [{ 'm.userId': id }] });
    await d.collection('games').updateMany({ 'rsvps.userId': id }, { $set: { 'rsvps.$[r].name': name } }, { arrayFilters: [{ 'r.userId': id }] });
    return { user: publicUser({ ...user, name }) };
  },
  async DELETE({ req, res, body }) {
    const user = await requireUser(req), d = await db(), id = String(user._id);
    if (!(await verifyPassword(String(body.password || ''), user.password))) fail(400, 'Password is not right');
    const owned = await d.collection('groups').find({ members: { $elemMatch: { userId: id, role: 'owner' } } }).toArray();
    if (owned.some(g => g.members.length > 1)) fail(409, 'You own a group with other members. Hand it to someone else or delete it first.');
    await d.collection('games').deleteMany({ groupId: { $in: owned.map(g => g._id) } });
    await d.collection('groups').deleteMany({ _id: { $in: owned.map(g => g._id) } });
    await d.collection('groups').updateMany({ 'members.userId': id }, { $pull: { members: { userId: id } } });
    await d.collection('games').updateMany({ 'rsvps.userId': id }, { $pull: { rsvps: { userId: id } } });
    await d.collection('users').deleteOne({ _id: user._id });
    endSession(res);
    return { ok: true };
  },
});
