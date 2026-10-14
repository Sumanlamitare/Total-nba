// One-off: delete this project's MongoDB data (the old 'totalnba' statbook and the new app's 'edge' DB).
// Lists every database before and after; any other database is reported, never touched.
import { MongoClient } from 'mongodb';
import fs from 'fs';

const DROP = ['totalnba', process.env.BET_DB || 'edge'];
const out = [], log = s => { console.log(s); out.push(s); };
const mb = b => (b / 1048576).toFixed(1) + ' MB';
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const list = async label => {
    const { databases } = await client.db().admin().listDatabases();
    log(`${label}: ` + (databases.map(d => `${d.name} (${mb(d.sizeOnDisk)})`).join(', ') || 'none'));
    return databases.map(d => d.name);
  };
  const before = await list('before');
  for (const name of DROP) {
    if (!before.includes(name)) { log(`${name}: not present`); continue; }
    const cols = await client.db(name).listCollections().toArray();
    for (const c of cols) log(`  ${name}.${c.name}: ${await client.db(name).collection(c.name).estimatedDocumentCount()} docs`);
    log(`${name}: dropped = ${await client.db(name).dropDatabase()}`);
  }
  const after = await list('after');
  const others = after.filter(n => !['admin', 'local', 'config', ...DROP].includes(n));
  if (others.length) log(`left untouched (not this project's): ${others.join(', ')}`);
} catch (e) { log('ERROR ' + e.message); process.exitCode = 1; }
finally { await client.close(); fs.mkdirSync('try', { recursive: true }); fs.writeFileSync('try/wipe.txt', out.join('\n') + '\n'); }
