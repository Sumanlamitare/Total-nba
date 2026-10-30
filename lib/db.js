// One MongoDB client per warm function instance. Indexes are created once per instance.
//   teams, players       — identities, team colors, headshots
//   games                — every game of every date: status, teams, whether its box score is in and verified
//   days                 — each date: its games, whether all are complete, the data checksum
//   pgames               — one player's box score in one game, with his team's and the opponent's totals
//   seasonfigs           — ESPN's own season figures per player (PER...), refreshed daily for the current season
//   diagrams             — generated diagrams: configuration, results, data checksum, version
//   configs, settings    — saved configurations; the defaults and minimum samples
//   seasons              — each season's game dates
import { MongoClient } from 'mongodb';

let clientPromise = null, ready = null;

export async function db() {
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('MONGODB_URI is not set'), { status: 500 });
  if (!clientPromise) clientPromise = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 }).connect();
  const d = (await clientPromise).db(process.env.LIBRARY_DB || 'library');
  if (!ready) ready = indexes(d).catch(e => { ready = null; throw e; });
  await ready;
  return d;
}

async function indexes(d) {
  await Promise.all([
    d.collection('pgames').createIndex({ date: 1 }),
    d.collection('pgames').createIndex({ season: 1, stype: 1, date: 1 }),
    d.collection('pgames').createIndex({ gid: 1 }),
    d.collection('games').createIndex({ date: 1 }),
    d.collection('diagrams').createIndex({ kind: 1, date: -1 }),
    d.collection('diagrams').createIndex({ key: 1, version: -1 }),
    d.collection('diagrams').createIndex({ season: 1, kind: 1, date: -1 }),
  ]);
}

export async function close() {
  if (clientPromise) await (await clientPromise).close();
  clientPromise = null; ready = null;
}
