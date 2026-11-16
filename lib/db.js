// One MongoDB client per warm instance; indexes are created once per instance. Database: fp90 (FP90_DB).
//
// Permanent (small):
//   settings      — app settings; the competition list
//   users, sessions — the owner's account (scrypt) and login sessions
//   logos         — team and competition logos, downscaled once and kept (so a saved graphic always renders the same)
//   graphics      — every generated graphic: the data it was drawn from, any edits, its status (kept independently of
//                   match data; removed only by the owner, or after the retention period in Settings)
// Temporary (deleted by cleanup):
//   matches       — one document per ESPN event: schedule, status, score, goals, graphic and cleanup state
// Housekeeping:
//   processed     — event ids already finished and cleaned up (so a sync can't bring them back); expire after 4 days
//   jobs          — locks and job state (sync, poll, cleanup); log — the job log, kept 14 days
import { MongoClient } from 'mongodb';

let clientPromise = null, ready = null, mem = null;

export async function db() {
  if (process.env.FP90_MEMDB) {
    if (!mem) { const { memDb } = await import('./memdb.js'); mem = memDb(process.env.FP90_MEMDB === '1' ? null : process.env.FP90_MEMDB); }
    return mem;
  }
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('MONGODB_URI is not set'), { status: 500 });
  if (!clientPromise) clientPromise = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 }).connect().catch(e => { clientPromise = null; throw e; });
  const d = (await clientPromise).db(process.env.FP90_DB || 'fp90');
  if (!ready) ready = indexes(d).catch(e => { ready = null; throw e; });
  await ready;
  return d;
}

async function indexes(d) {
  const ix = (c, spec, opts = {}) => d.collection(c).createIndex(spec, opts);
  await Promise.all([
    ix('users', { email: 1 }, { unique: true }),
    ix('sessions', { expires: 1 }, { expireAfterSeconds: 0 }),
    ix('matches', { kickoff: 1 }),
    ix('matches', { state: 1, kickoff: 1 }),
    ix('matches', { comp: 1, kickoff: 1 }),
    ix('graphics', { createdAt: -1 }),
    ix('processed', { at: 1 }, { expireAfterSeconds: 4 * 86400 }),
    ix('log', { at: -1 }),
    ix('log', { at: 1 }, { expireAfterSeconds: 14 * 86400 }),
  ]);
}

export async function close() {
  if (clientPromise) await (await clientPromise).close().catch(() => {});
  clientPromise = null; ready = null;
}

export async function log(d, level, message, extra = {}) {
  await d.collection('log').insertOne({ at: new Date(), level, message, ...extra }).catch(() => {});
}
