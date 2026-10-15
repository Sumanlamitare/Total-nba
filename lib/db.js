// One MongoDB client per warm function instance. Indexes are created once per instance.
import { MongoClient } from 'mongodb';

let clientPromise = null, ready = null;

export async function db() {
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('MONGODB_URI is not set'), { status: 500 });
  if (!clientPromise) clientPromise = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 }).connect();
  const d = (await clientPromise).db(process.env.NIGHTJAR_DB || 'nightjar');
  if (!ready) ready = indexes(d).catch(e => { ready = null; throw e; });
  await ready;
  return d;
}

async function indexes(d) {
  await Promise.all([
    d.collection('users').createIndex({ email: 1 }, { unique: true }),
    d.collection('users').createIndex({ slug: 1 }, { unique: true, sparse: true }),
    d.collection('checks').createIndex({ key: 1 }, { unique: true }),
    d.collection('checks').createIndex({ badge: 1 }, { unique: true }),
    d.collection('checks').createIndex({ userId: 1, createdAt: 1 }),
    d.collection('checks').createIndex({ status: 1, paused: 1, due: 1 }),
    d.collection('channels').createIndex({ userId: 1 }),
    d.collection('throttle').createIndex({ at: 1 }, { expireAfterSeconds: 900 }),
  ]);
}

export async function close() {
  if (clientPromise) await (await clientPromise).close();
  clientPromise = null; ready = null;
}
