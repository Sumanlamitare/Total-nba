// What the API returns for games
import { roster, statusOf } from './turnout.js';

const person = r => ({ userId: r.userId, name: r.name, guests: r.guests || 0 });

export function gameSummary(g, user) {
  const r = roster(g), uid = String(user._id);
  return {
    id: String(g._id), groupId: String(g.groupId), startsAt: g.startsAt, duration: g.duration, location: g.location || '',
    status: g.status, capacity: g.capacity, minPlayers: g.minPlayers || 0, taken: r.taken, waitlist: r.waitlist.length, need: r.need,
    me: statusOf(g, uid), score: g.final?.score || null,
  };
}

export function gameDetail(g, group, me, user) {
  const r = roster(g), uid = String(user._id);
  const mine = (g.rsvps || []).find(x => x.userId === uid);
  const admin = me.role === 'owner' || me.role === 'admin';
  return {
    ...gameSummary(g, user),
    notes: g.notes || '', cost: g.cost || 0, costEach: g.cost && r.taken ? Math.ceil((g.cost / r.taken) * 100) / 100 : null,
    myGuests: mine?.guests || 0, admin,
    group: { id: String(group._id), name: group.name, sport: group.sport, location: group.location || '' },
    roster: { in: r.confirmed.map(person), waitlist: r.waitlist.map(person), maybe: r.maybe.map(person), out: r.out.map(person) },
    teams: g.teams || null, final: g.final || null,
    comments: (g.comments || []).filter(c => !(user.blocked || []).includes(c.userId)).map(c => ({ id: c.id, userId: c.userId, name: c.name, text: c.text, at: c.at, mine: c.userId === uid })),
    started: Date.now() >= +new Date(g.startsAt),
  };
}
