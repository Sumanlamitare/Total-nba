// GET    /api/games                                  -> my upcoming games across groups
// GET    /api/games?id=                              -> one game with roster, teams, result, comments
// POST   /api/games {groupId, startsAt, duration, capacity, minPlayers, location, notes, cost}   (organizers)
// POST   /api/games?id=&action=rsvp {want, guests}
// POST   /api/games?id=&action=comment {text} | uncomment {commentId}
// POST   /api/games?id=&action=teams {n} | clearteams | result {score?, noShows} | cancel | reopen   (organizers)
// PATCH  /api/games?id= {...}                        (organizers)
// DELETE /api/games?id=                              (organizers)
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { route, fail } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { loadGroup, loadGame, isAdmin, oid } from '../lib/access.js';
import { cleanGame, answer, balance, teamPool, roster } from '../lib/turnout.js';
import { gameSummary, gameDetail } from '../lib/views.js';

const MAX_UPCOMING = 60;

// read-modify-write with a version number, so two people tapping "In" at once can't overwrite each other
async function mutate(id, fn, tries = 6) {
  const col = (await db()).collection('games');
  for (let i = 0; i < tries; i++) {
    const g = await col.findOne({ _id: id });
    if (!g) fail(404, 'Game not found');
    const change = await fn(g);
    if (!change) return g;
    const r = await col.findOneAndUpdate({ _id: id, v: g.v || 0 }, { ...change, $set: { ...(change.$set || {}), v: (g.v || 0) + 1 } }, { returnDocument: 'after' });
    if (r) return r;
  }
  fail(409, 'Lots of people are answering right now — try again');
}

export default route({
  async GET({ req, query }) {
    const user = await requireUser(req), d = await db(), uid = String(user._id);
    if (query.id) {
      const { game, group, me } = await loadGame(user, query.id);
      return { game: gameDetail(game, group, me, user) };
    }
    const groups = await d.collection('groups').find({ 'members.userId': uid }, { projection: { name: 1, sport: 1 } }).toArray();
    const games = await d.collection('games').find({ groupId: { $in: groups.map(g => g._id) }, status: { $ne: 'played' }, startsAt: { $gt: new Date(Date.now() - 3 * 3600e3) } }).sort({ startsAt: 1 }).limit(50).toArray();
    const byId = Object.fromEntries(groups.map(g => [String(g._id), g]));
    return { games: games.map(g => ({ ...gameSummary(g, user), groupName: byId[String(g.groupId)].name, sport: byId[String(g.groupId)].sport })) };
  },

  async POST({ req, query, body }) {
    const user = await requireUser(req), uid = String(user._id), col = (await db()).collection('games');
    if (!query.id) {
      const { group } = await loadGroup(user, body.groupId, { admin: true });
      const upcoming = await col.countDocuments({ groupId: group._id, status: 'scheduled', startsAt: { $gt: new Date() } });
      if (upcoming >= MAX_UPCOMING) fail(409, `A group can have up to ${MAX_UPCOMING} upcoming games`);
      const c = cleanGame(body);
      const g = { groupId: group._id, ...c, location: c.location || group.location || '', notes: c.notes ?? '', cost: c.cost ?? 0,
        status: 'scheduled', rsvps: [], comments: [], lateDrops: [], teams: null, final: null, v: 0, createdBy: uid, createdAt: new Date() };
      if (body.imIn) g.rsvps = answer(g, { id: uid, name: user.name }, 'in').rsvps; // the organizer usually plays too
      g._id = (await col.insertOne(g)).insertedId;
      return { id: String(g._id) };
    }

    const { game, group, me } = await loadGame(user, query.id);
    const admin = isAdmin(me), a = query.action;
    const organizer = () => admin || fail(403, 'Only the group’s organizers can do that');
    let after;

    if (a === 'rsvp') {
      if (game.status === 'canceled') fail(409, 'This game was canceled');
      if (game.status === 'played') fail(409, 'This game has already been played');
      after = await mutate(game._id, g => {
        const { rsvps, lateDrop } = answer(g, { id: uid, name: user.name }, String(body.want), body.guests);
        return { $set: { rsvps }, ...(lateDrop ? { $push: { lateDrops: { userId: uid, at: new Date() } } } : {}) };
      });
    } else if (a === 'comment') {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
      if (!text) fail(400, 'Write something first');
      await col.updateOne({ _id: game._id }, { $push: { comments: { $each: [{ id: crypto.randomBytes(6).toString('hex'), userId: uid, name: user.name, text, at: new Date() }], $slice: -200 } } });
    } else if (a === 'uncomment') {
      const c = (game.comments || []).find(x => x.id === body.commentId);
      if (!c) fail(404, 'Comment not found');
      if (c.userId !== uid && !admin) fail(403, 'You can only delete your own comments');
      await col.updateOne({ _id: game._id }, { $pull: { comments: { id: c.id } } });
    } else if (a === 'teams' && organizer()) {
      const skills = Object.fromEntries(group.members.map(m => [m.userId, m.skill ?? 3]));
      after = await mutate(game._id, g => {
        const pool = teamPool(g, skills);
        if (pool.length < 2) fail(400, 'Need at least two players to make teams');
        const n = Math.max(2, Math.min(4, Number(body.n) || 2));
        if (pool.length < n) fail(400, `Need at least ${n} players for ${n} teams`);
        return { $set: { teams: balance(pool, n).map(t => t.map(p => ({ id: p.id, name: p.name, guest: !!p.guest }))) } };
      });
    } else if (a === 'clearteams' && organizer()) {
      await col.updateOne({ _id: game._id }, { $set: { teams: null } });
    } else if (a === 'result' && organizer()) {
      if (game.status === 'canceled') fail(409, 'This game was canceled');
      if (Date.now() < +new Date(game.startsAt)) fail(409, 'You can record the result once the game has started');
      const players = roster(game).confirmed.map(r => r.userId);
      const noShows = (Array.isArray(body.noShows) ? body.noShows : []).map(String).filter(id => players.includes(id));
      let score = null;
      if (Array.isArray(body.score) && body.score.some(s => s !== '' && s != null)) {
        if (!game.teams || body.score.length !== game.teams.length) fail(400, 'Make teams first, then enter a score for each');
        score = body.score.map(s => { const n = Math.round(Number(s)); if (!(n >= 0 && n <= 999)) fail(400, 'Scores must be 0–999'); return n; });
      }
      const teams = game.teams ? game.teams.map(t => t.map(p => p.id)) : null;
      await col.updateOne({ _id: game._id }, { $set: { status: 'played', final: { players, noShows, teams, score, at: new Date(), by: uid } } });
    } else if (a === 'cancel' && organizer()) {
      await col.updateOne({ _id: game._id }, { $set: { status: 'canceled' } });
    } else if (a === 'reopen' && organizer()) {
      await col.updateOne({ _id: game._id }, { $set: { status: 'scheduled', final: null } });
    } else fail(400, 'Unknown action');

    after ||= await col.findOne({ _id: game._id });
    return { game: gameDetail(after, group, me, user) };
  },

  async PATCH({ req, query, body }) {
    const user = await requireUser(req);
    const { game, group, me } = await loadGame(user, query.id, { admin: true });
    const set = cleanGame(body, true);
    const cap = set.capacity ?? game.capacity, min = set.minPlayers ?? game.minPlayers ?? 0;
    if (min > cap) fail(400, 'Players needed can’t be more than the spots');
    const after = await mutate(game._id, () => ({ $set: set }));
    return { game: gameDetail(after, group, me, user) };
  },

  async DELETE({ req, query }) {
    const user = await requireUser(req);
    const { game } = await loadGame(user, query.id, { admin: true });
    await (await db()).collection('games').deleteOne({ _id: oid(String(game._id), 'Game') });
    return { ok: true };
  },
});
