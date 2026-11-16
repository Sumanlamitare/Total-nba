// The app's state, read from its database: what's stored, the jobs, the next cleanup, today's matches and graphics.
//   MONGODB_URI=... node tools/status.mjs
import { db, close } from '../lib/db.js';
import { plan } from '../lib/cleanup.js';
import { renderPng } from '../lib/graphics/server.js';
import { applyEdits } from '../lib/matches.js';
const d = await db();
try {
  const c = async n => d.collection(n).estimatedDocumentCount();
  console.log('stored:', { matches: await c('matches'), graphics: await c('graphics'), logos: await c('logos'), processed: await c('processed'), log: await c('log') });
  const st = await d.command({ dbStats: 1 }).catch(() => null);
  if (st) console.log(`database fp90: ${(st.dataSize / 1024).toFixed(0)} KB data, ${(st.storageSize / 1024).toFixed(0)} KB storage`);
  for (const j of await d.collection('jobs').find({ _id: { $in: ['worker', 'sync', 'poll', 'cleanup'] } }).toArray()) console.log('job', JSON.stringify(j));
  console.log('cleanup plan:', JSON.stringify(await plan(d)));
  const by = {};
  for (const m of await d.collection('matches').find({}).toArray()) by[`${m.status}/${m.graphic?.status}`] = (by[`${m.status}/${m.graphic?.status}`] || 0) + 1;
  console.log('matches by status/graphic:', by);
  for (const g of await d.collection('graphics').find({}).sort({ createdAt: -1 }).limit(15).toArray()) console.log('graphic', g._id, g.status, `${g.data.home.name} ${g.data.score.home}-${g.data.score.away} ${g.data.away.name}`, `(${g.data.competition.name})`, JSON.stringify(g.data.scorers), g.data.shootout ? `pens ${g.data.shootout.home}-${g.data.shootout.away}` : '', g.problems?.length ? `PROBLEMS: ${g.problems.join('; ')}` : '', g.render?.missingImages?.length ? `missing images: ${g.render.missingImages.length}` : '');
  for (const l of await d.collection('log').find({}).sort({ at: -1 }).limit(25).toArray()) console.log('log', l.at.toISOString(), l.level, l.message);
  // --png: print the newest graphic(s) as base64 PNG (to look at a real one without opening the site).
  if (process.argv.includes('--png')) for (const g of await d.collection('graphics').find({ status: 'ready' }).sort({ createdAt: -1 }).limit(2).toArray()) {
    const r = await renderPng(d, applyEdits(g.data, g.edits), g.theme);
    console.log(`PNG ${g._id} ${r.width}x${r.height} missing=${r.missing.length} ${r.buffer.toString('base64')}`);
  }
} finally { await close(); }
