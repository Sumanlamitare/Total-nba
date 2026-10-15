// PATCH  /api/account {name?, slug?, pageTitle?}   — profile and public status page
// DELETE /api/account {password}                   — delete the account and everything in it
import { db } from '../lib/db.js';
import { route, fail, str } from '../lib/http.js';
import { requireUser, verifyPassword, endSession, publicUser } from '../lib/auth.js';

const RESERVED = new Set(['app', 'api', 'login', 'signup', 'docs', 'pricing', 'admin', 'status', 'nightjar', 'www', 'help', 'support']);

export default route({
  async PATCH({ req, body }) {
    const user = await requireUser(req), set = {}, unset = {};
    if (body.name !== undefined) set.name = str(body.name, 80);
    if (body.pageTitle !== undefined) set.pageTitle = str(body.pageTitle, 80);
    if (body.slug !== undefined) {
      const slug = str(body.slug, 40).toLowerCase();
      if (!slug) unset.slug = '';
      else if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) fail(400, 'Use 3–40 lowercase letters, numbers or dashes');
      else if (RESERVED.has(slug)) fail(400, 'That address is taken');
      else set.slug = slug;
    }
    const users = (await db()).collection('users');
    try { await users.updateOne({ _id: user._id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }); }
    catch (e) { if (e.code === 11000) fail(409, 'That address is taken'); throw e; }
    return { user: publicUser(await users.findOne({ _id: user._id })) };
  },
  async DELETE({ req, res, body }) {
    const user = await requireUser(req);
    if (!(await verifyPassword(String(body.password || ''), user.password))) fail(400, 'Password is not right');
    const d = await db();
    await Promise.all([d.collection('checks').deleteMany({ userId: user._id }), d.collection('channels').deleteMany({ userId: user._id })]);
    await d.collection('users').deleteOne({ _id: user._id });
    endSession(res);
    return { ok: true };
  },
});
