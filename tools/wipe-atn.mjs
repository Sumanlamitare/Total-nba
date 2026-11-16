// One-off: drop the old NBA app's database ("atn") and nothing else. Prints the cluster's databases before and after.
import { MongoClient } from 'mongodb';
const name = process.argv[2];
if (name !== 'atn') { console.error('Refusing: pass the database name "atn" to confirm.'); process.exit(1); }
const c = await new MongoClient(process.env.MONGODB_URI).connect();
const list = async () => (await c.db().admin().listDatabases()).databases.map(d => `${d.name} ${(d.sizeOnDisk / 1048576).toFixed(1)} MB`).join(', ');
console.log('before:', await list());
console.log('dropped atn:', await c.db('atn').dropDatabase());
console.log('after:', await list());
await c.close();
