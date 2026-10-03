import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './db.js';
import { Meta } from './models.js';
import { sync } from './ingest/sync.js';
import routes from './routes.js';

const app = express();
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const STALE_MS = 2 * 3600e3;

// Refresh data in the background when it's older than 2 hours (checked on startup and on page loads)
let syncing = false;
async function refreshIfStale() {
  if (syncing) return;
  const meta = await Meta.findById('meta').lean();
  if (meta?.updated && Date.now() - new Date(meta.updated) < STALE_MS) return;
  syncing = true;
  sync().catch(e => console.error('sync failed', e)).finally(() => { syncing = false; });
}

app.use(express.json());
app.use('/api', (req, res, next) => { if (req.path === '/meta') refreshIfStale().catch(() => {}); next(); }, routes);
app.use(express.static(dist));
app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'server error' }); });

await connect();
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`TotalNBA on http://localhost:${port}`));
refreshIfStale().catch(e => console.error(e));
