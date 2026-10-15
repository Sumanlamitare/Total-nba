// One MongoDB client per warm function instance. Indexes are created once per instance.
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
    d.collection('players').createIndex({ l: 1, n: 1 }),
    d.collection('players').createIndex({ k: 1 }),
    d.collection('leaders').createIndex({ id: 1 }),
    d.collection('awards').createIndex({ id: 1 }),
    d.collection('cache').createIndex({ t: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export async function close() {
  if (clientPromise) await (await clientPromise).close();
  clientPromise = null; ready = null;
}
