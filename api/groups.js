// GET    /api/groups                         -> my groups
// GET    /api/groups?id=                     -> one group: members, games, stats
// GET    /api/groups?invite=CODE             -> preview before joining
// POST   /api/groups {name, sport, location, about}
// POST   /api/groups?invite=CODE&action=join
// POST   /api/groups?id=&action=leave|invite|role|skill|remove   (role/skill/remove take {userId, ...})
// PATCH  /api/groups?id= {name?, sport?, location?, about?}
// DELETE /api/groups?id=                     -> owner only; deletes its games too
import { db } from '../lib/db.js';
import { route, fail, str } from '../lib/http.js';
import { requireUser, currentUser } from '../lib/auth.js';
import { loadGroup, inviteCode, isAdmin } from '../lib/access.js';
import { SPORTS, cleanGroup, stats, roster, statusOf } from '../lib/turnout.js';
import { gameSummary } from '../lib/views.js';

const MAX_GROUPS = 30, MAX_MEMBERS = 300;

export default route({
  async GET({ req, query }) {
    const d = await db();
    if (query.invite) {
      const g = await d.collection('groups').findOne({ invite: String(query.invite) });
      if (!g) fail(404, 'This invite link is not valid anymore — ask the organizer for a new one');
      const user = await currentUser(req);
      return { group: { id: String(g._id), name: g.name, sport: g.sport, location: g.location || '', about: g.about || '', members: g.members.length, joined: !!(user && g.members.some(m => m.userId === String(user._id))) } };
    }
    const user = await requireUser(req), uid = String(user._id);
    if (!query.id) {
      const groups = await d.collection('groups').find({ 'members.userId': uid }).sort({ createdAt: 1 }).toArray();
      const next = await d.collection('games').find({ groupId: { $in: groups.map(g => g._id) }, status: 'scheduled', startsAt: { $gt: new Date(Date.now() - 3 * 3600e3) } }).sort({ startsAt: 1 }).toArray();
      return {
        groups: groups.map(g => {
          const n = next.find(x => String(x.groupId) === String(g._id));
          return { id: String(g._id), name: g.name, sport: g.sport, location: g.location || '', members: g.members.length, role: g.members.find(m => m.userId === uid).role, next: n ? { id: String(n._id), startsAt: n.startsAt, taken: roster(n).taken, capacity: n.capacity, me: statusOf(n, uid) } : null };
        }),
        sports: SPORTS,
      };
    }
    const { group, me } = await loadGroup(user, query.id);
    const games = await d.collection('games').find({ groupId: group._id }).sort({ startsAt: 1 }).toArray();
    const cutoff = Date.now() - 3 * 3600e3;
    const upcoming = games.filter(g => g.status !== 'played' && +g.startsAt > cutoff);
    const past = games.filter(g => !upcoming.includes(g)).reverse();
    const admin = isAdmin(me);
    const names = Object.fromEntries(group.members.map(m => [m.userId, m.name]));
    return {
      group: { id: String(group._id), name: group.name, sport: group.sport, location: group.location || '', about: group.about || '', invite: admin ? group.invite : null, createdAt: group.createdAt },
      me: { userId: me.userId, role: me.role, admin },
      members: group.members.map(m => ({ userId: m.userId, name: m.name, role: m.role, joinedAt: m.joinedAt, ...(admin ? { skill: m.skill ?? 3 } : {}) })),
      upcoming: upcoming.map(g => gameSummary(g, user)),
      past: past.slice(0, 30).map(g => gameSummary(g, user)),
      stats: stats(games).filter(s => names[s.userId]).map(s => ({ ...s, name: names[s.userId] })),
      sports: SPORTS,
    };
  },

  async POST({ req, query, body }) {
    const user = await requireUser(req), uid = String(user._id), col = (await db()).collection('groups');
    if (query.invite && query.action === 'join') {
      const g = await col.findOne({ invite: String(query.invite) });
      if (!g) fail(404, 'This invite link is not valid anymore — ask the organizer for a new one');
      if (g.members.some(m => m.userId === uid)) return { id: String(g._id) };
      if (g.members.length >= MAX_MEMBERS) fail(409, 'This group is full');
      if ((await col.countDocuments({ 'members.userId': uid })) >= MAX_GROUPS) fail(409, `You can be in up to ${MAX_GROUPS} groups`);
      await col.updateOne({ _id: g._id, 'members.userId': { $ne: uid } }, { $push: { members: { userId: uid, name: user.name, role: 'member', skill: 3, joinedAt: new Date() } } });
      return { id: String(g._id) };
    }
    if (query.id) {
      const { group, me } = await loadGroup(user, query.id, { admin: query.action !== 'leave' });
      const target = body.userId && group.members.find(m => m.userId === String(body.userId));
      if (query.action === 'leave') {
        if (me.role === 'owner') {
          if (group.members.length > 1) fail(409, 'You own this group. Make someone else the owner first, or delete the group.');
          await (await db()).collection('games').deleteMany({ groupId: group._id });
          await col.deleteOne({ _id: group._id });
        } else await col.updateOne({ _id: group._id }, { $pull: { members: { userId: uid } } });
        return { ok: true };
      }
      if (query.action === 'invite') { await col.updateOne({ _id: group._id }, { $set: { invite: inviteCode() } }); return { invite: (await col.findOne({ _id: group._id })).invite }; }
      if (!target) fail(404, 'Member not found');
      if (query.action === 'skill') {
        const skill = Math.round(Number(body.skill));
        if (!(skill >= 1 && skill <= 5)) fail(400, 'Skill is 1 to 5');
        await col.updateOne({ _id: group._id }, { $set: { 'members.$[m].skill': skill } }, { arrayFilters: [{ 'm.userId': target.userId }] });
        return { ok: true };
      }
      if (target.role === 'owner') fail(403, 'The owner can’t be changed here');
      if (query.action === 'role') {
        const role = str(body.role, 10);
        if (!['admin', 'member', 'owner'].includes(role)) fail(400, 'Unknown role');
        if (role === 'owner') {
          if (me.role !== 'owner') fail(403, 'Only the owner can hand over the group');
          await col.updateOne({ _id: group._id }, { $set: { 'members.$[o].role': 'admin', 'members.$[t].role': 'owner' } }, { arrayFilters: [{ 'o.userId': uid }, { 't.userId': target.userId }] });
        } else await col.updateOne({ _id: group._id }, { $set: { 'members.$[m].role': role } }, { arrayFilters: [{ 'm.userId': target.userId }] });
        return { ok: true };
      }
      if (query.action === 'remove') {
        if (target.role === 'admin' && me.role !== 'owner') fail(403, 'Only the owner can remove an organizer');
        await col.updateOne({ _id: group._id }, { $pull: { members: { userId: target.userId } } });
        return { ok: true };
      }
      fail(400, 'Unknown action');
    }
    if ((await col.countDocuments({ 'members.userId': uid })) >= MAX_GROUPS) fail(409, `You can be in up to ${MAX_GROUPS} groups`);
    const g = { ...cleanGroup(body), location: str(body.location, 120), about: typeof body.about === 'string' ? body.about.trim().slice(0, 600) : '', invite: inviteCode(), createdAt: new Date(),
      members: [{ userId: uid, name: user.name, role: 'owner', skill: 3, joinedAt: new Date() }] };
    g._id = (await col.insertOne(g)).insertedId;
    return { id: String(g._id) };
  },

  async PATCH({ req, query, body }) {
    const user = await requireUser(req), { group } = await loadGroup(user, query.id, { admin: true });
    await (await db()).collection('groups').updateOne({ _id: group._id }, { $set: cleanGroup(body, true) });
    return { ok: true };
  },

  async DELETE({ req, query }) {
    const user = await requireUser(req), { group, me } = await loadGroup(user, query.id, { admin: true });
    if (me.role !== 'owner') fail(403, 'Only the owner can delete the group');
    const d = await db();
    await d.collection('games').deleteMany({ groupId: group._id });
    await d.collection('groups').deleteOne({ _id: group._id });
    return { ok: true };
  },
});
