// One MongoDB client per warm function instance; indexes are created once per instance.
//   users, sessions          — accounts (scrypt password hashes) and login sessions
//   settings, secrets        — automation settings, thresholds, watchlists; encrypted platform credentials
//   teams, players           — identities, colors, logos, bios (birth date, country, position, debut)
//   games                    — every game: status, scores, quarters, team statistics, verification, source times
//   pgames                   — one player's line in one game (the whole ESPN box-score era, for records and context)
//   careers                  — ESPN's career totals for active players (milestones)
//   records                  — record lists by category and scope (top 25 with game links)
//   performances, events     — detected performances; record and milestone events (approaching → tied → broken)
//   feed, comments, reactions — the live feed (one entry per story), fans' comments and reactions
//   content, templates, uploads — graphics (editable projects); saved designs; uploaded images
//   log                      — the automation log
//   meta                     — job markers, rate limits
import { MongoClient } from 'mongodb';

let clientPromise = null, ready = null, mem = null;

export async function db() {
  if (process.env.ATN_MEMDB) {
    if (!mem) { const { memDb } = await import('./memdb.js'); mem = memDb(process.env.ATN_MEMDB === '1' ? null : process.env.ATN_MEMDB); }
    return mem;
  }
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('MONGODB_URI is not set'), { status: 500 });
  if (!clientPromise) clientPromise = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 }).connect().catch(e => { clientPromise = null; throw e; });
  const d = (await clientPromise).db(process.env.ATN_DB || 'atn');
  if (!ready) ready = indexes(d).catch(e => { ready = null; throw e; });
  await ready;
  return d;
}

async function indexes(d) {
  const ix = (c, spec, opts = {}) => d.collection(c).createIndex(spec, opts);
  await Promise.all([
    ix('users', { email: 1 }, { unique: true }),
    ix('sessions', { expires: 1 }, { expireAfterSeconds: 0 }),
    ix('games', { date: -1 }),
    ix('games', { season: 1, stype: 1, date: 1 }),
    ix('games', { 'teams.id': 1, date: -1 }),
    ix('pgames', { g: 1 }),
    ix('pgames', { p: 1, d: -1 }),
    ix('pgames', { d: -1 }),
    ix('pgames', { pts: -1 }),
    ix('players', { name: 'text' }),
    ix('players', { active: 1, team: 1 }),
    ix('performances', { date: -1, score: -1 }),
    ix('performances', { pid: 1, date: -1 }),
    ix('events', { updatedAt: -1 }),
    ix('events', { state: 1, updatedAt: -1 }),
    ix('feed', { sortAt: -1 }),
    ix('feed', { seq: -1 }),
    ix('feed', { 'game.id': 1 }),
    ix('feed', { 'game.date': -1, significance: -1 }),
    ix('feed', { 'players.id': 1, sortAt: -1 }),
    ix('feed', { teams: 1, sortAt: -1 }),
    ix('comments', { feedId: 1, createdAt: 1 }),
    ix('content', { createdAt: -1 }),
    ix('content', { feedId: 1 }),
    ix('log', { at: -1 }),
    ix('log', { at: 1 }, { expireAfterSeconds: 60 * 86400 }),
  ]);
}

export async function close() {
  if (clientPromise) await (await clientPromise).close().catch(() => {});
  clientPromise = null; ready = null;
}
