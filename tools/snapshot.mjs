// Save the real game data (what /api/game serves) for tests and local development: probe/game.json.
import fs from 'node:fs';
import { db, close } from '../lib/db.js';

fs.mkdirSync('probe', { recursive: true });
const d = await db();
try {
  const [meta, eras] = await Promise.all([d.collection('meta').findOne({ _id: 'game' }), d.collection('eras').find({}).toArray()]);
  const game = { teams: meta.teams, decades: meta.decades, dynasties: meta.dynasties, at: meta.at, eras: eras.map(e => ({ team: e.team, decade: e.decade, players: e.players })) };
  fs.writeFileSync('probe/game.json', JSON.stringify(game));
  console.log('eras', eras.length, 'player-eras', eras.reduce((n, e) => n + e.players.length, 0), 'dynasties', meta.dynasties.map(x => `${x.label}: ${x.five.map(p => `${p.slot} ${p.n} ${p.ovr}`).join(', ')}`).join(' | '));
  console.log('collections', (await d.listCollections().toArray()).map(c => c.name).join(', '));
} finally { await close(); }
