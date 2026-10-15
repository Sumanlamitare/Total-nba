// Save real ESPN-derived data for tests and local development: the catalog as the API serves it, and
// composed books + career highs for a spread of players (modern, traded, legends with partial or no stats).
import fs from 'node:fs';
import { db, close } from '../lib/db.js';
import { publicRecord } from '../lib/catalog.js';
import { loadBook, loadHighs } from '../lib/book.js';

const IDS = ['1966', '1035', '3975', '5104157', '3992', '4142', '4152', '2335', '33', '1449', '3202', '6583'];
fs.mkdirSync('probe/books', { recursive: true });
const d = await db();
try {
  const players = await d.collection('players').find({}).sort({ k: 1, _id: 1 }).toArray();
  const meta = await d.collection('meta').findOne({ _id: 'catalog' });
  fs.writeFileSync('probe/catalog.json', JSON.stringify({ players: players.map(publicRecord), meta: { players: meta.players, from: meta.from, to: meta.to, at: meta.at } }));
  console.log('catalog', players.length);
  const names = ['abdul-jabbar', 'magic johnson', 'tim duncan', 'dirk nowitzki'];
  for (const q of names) {
    const p = await d.collection('players').findOne({ n: new RegExp(q.replace(/ /g, '.*'), 'i') });
    if (p && !IDS.includes(p._id)) IDS.push(p._id);
  }
  for (const id of IDS) {
    const book = await loadBook(d, id).catch(e => ({ error: e.message }));
    if (!book) { console.log(id, 'no book'); continue; }
    fs.writeFileSync(`probe/books/${id}.json`, JSON.stringify(book));
    const seasons = [...(book.regular?.rows || []), ...(book.playoffs?.rows || [])].map(r => r.season);
    const highs = book.regular ? await loadHighs(id, seasons).catch(e => ({ error: e.message })) : null;
    if (highs) fs.writeFileSync(`probe/books/${id}.highs.json`, JSON.stringify(highs));
    console.log(id, book.name, book.regular?.seasons ?? 'no stats', highs?.covered?.length ?? '-');
  }
} finally { await close(); }
