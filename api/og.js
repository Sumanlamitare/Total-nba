// GET /api/og?date=YYYYMMDD[&p=playerId][&f=square][&dl=1] -> the share graphic: 1200×630 (link previews, X) or
// 1080×1080 (square). dl=1 sends it as a download.
import { db } from '../lib/db.js';
import { loadNight, isDate } from '../lib/nights.js';
import { ogImage } from '../lib/og.js';

export default async function og(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const date = String(q.date || ''), pid = String(q.p || '');
  try {
    if (!isDate(date)) throw Object.assign(new Error('bad date'), { status: 400 });
    const night = await loadNight(await db(), date);
    const perf = pid ? night.top?.find(p => p.id === pid) : null;
    const square = q.f === 'square';
    const png = await ogImage({ night, perf, date, square });
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    if (q.dl) res.setHeader('content-disposition', `attachment; filename="potn-${date}${perf ? `-${perf.name.toLowerCase().replace(/[^a-z]+/g, '-')}` : ''}${square ? '-square' : ''}.png"`);
    res.setHeader('cache-control', night.final ? 'public, max-age=86400, s-maxage=604800' : 'public, max-age=0, s-maxage=300');
    res.end(png);
  } catch (e) {
    if (!e.status) console.error(e);
    res.statusCode = e.status || 500;
    res.setHeader('cache-control', 'no-store');
    res.end();
  }
}
