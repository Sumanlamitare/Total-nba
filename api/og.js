// GET /api/og?id=ID[&f=wide|square|portrait|landscape] -> the diagram as a PNG (link previews; also a direct download).
import { db } from '../lib/db.js';
import { diagramPng } from '../lib/graphic.js';

export default async function og(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    const d = await db();
    const doc = q.id ? await d.collection('diagrams').findOne({ _id: String(q.id) }) : await d.collection('diagrams').find({ kind: 'daily', auto: true, latest: true }).sort({ date: -1 }).limit(1).next();
    if (!doc) { res.statusCode = 404; return res.end(); }
    const png = await diagramPng(doc, String(q.f || 'wide'));
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', doc.latest === false || doc.kind === 'custom' ? 'public, max-age=86400, s-maxage=604800, immutable' : 'public, max-age=300, s-maxage=3600');
    if (q.dl) res.setHeader('content-disposition', `attachment; filename="overlap-${doc.date || doc._id}.png"`);
    res.end(png);
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.setHeader('cache-control', 'no-store'); res.end();
  }
}
