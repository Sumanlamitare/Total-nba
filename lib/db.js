import { MongoClient } from 'mongodb';

// One client per process; serverless functions reuse it across warm invocations.
let client;
export async function db() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  client ||= new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 });
  await client.connect();
  const d = client.db(process.env.MONGODB_DB || 'totalnba');
  if (!db.indexed) {
    db.indexed = true;
    await Promise.all([
      d.collection('lines').createIndex({ gameId: 1, key: 1 }, { unique: true }),
      d.collection('lines').createIndex({ date: 1 }),
      d.collection('lines').createIndex({ season: 1, type: 1 }),
      d.collection('games').createIndex({ date: 1 }),
      d.collection('games').createIndex({ season: 1 }),
    ]);
  }
  return d;
}
export const close = () => client?.close();
