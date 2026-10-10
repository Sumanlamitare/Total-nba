import { MongoClient } from 'mongodb';

// One client per process; serverless functions reuse it across warm invocations.
let client;
export async function db() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  client ||= new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 });
  await client.connect();
  const d = client.db(process.env.BET_DB || 'edge');
  if (!db.indexed) {
    db.indexed = true;
    await Promise.all([
      d.collection('snapshots').createIndex({ sport: 1, id: 1, at: -1 }),
      d.collection('cache').createIndex({ t: 1 }, { expireAfterSeconds: 8 * 86400 }),
    ]).catch(() => {});
  }
  return d;
}
export const close = () => client?.close();
