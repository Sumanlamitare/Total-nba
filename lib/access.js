// Loading groups and games with permission checks.
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { db } from './db.js';
import { fail } from './http.js';

export const oid = (id, what) => (ObjectId.isValid(String(id || '')) && String(id).length === 24 ? new ObjectId(String(id)) : fail(404, `${what} not found`));
export const inviteCode = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
export const memberOf = (group, user) => group.members.find(m => m.userId === String(user._id));
export const isAdmin = m => m && (m.role === 'owner' || m.role === 'admin');

export async function loadGroup(user, id, { admin = false } = {}) {
  const g = await (await db()).collection('groups').findOne({ _id: oid(id, 'Group') });
  const me = g && memberOf(g, user);
  if (!g || !me) fail(404, 'Group not found — ask for an invite link');
  if (admin && !isAdmin(me)) fail(403, 'Only the group’s organizers can do that');
  return { group: g, me };
}

export async function loadGame(user, id, opts = {}) {
  const game = await (await db()).collection('games').findOne({ _id: oid(id, 'Game') });
  if (!game) fail(404, 'Game not found');
  const { group, me } = await loadGroup(user, game.groupId, opts);
  return { game, group, me };
}
