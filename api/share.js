// /d/:id (rewritten here): the app's page with the diagram's preview tags, so a shared link shows the diagram itself
// on X, iMessage, WhatsApp... The app then opens the diagram as usual.
import { db } from '../lib/db.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let shell = null;

export default async function share(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const id = String(q.id || '').replace(/[^\w-]/g, '');
  let doc = null;
  try { doc = id ? await (await db()).collection('diagrams').findOne({ _id: id }, { projection: { title: 1, period: 1, config: 1, 'result.total': 1, kind: 1 } }) : null; } catch { /* plain page */ }
  if (!shell) shell = await fetch(`${origin}/index.html`).then(r => r.text()).catch(() => null);
  const title = doc ? `${doc.title} · Overlap` : 'Overlap · NBA statistical Venn diagrams';
  const desc = doc ? `${doc.config.criteria.map(c => c.label).join(' · ')} — ${doc.result.total} players. ${doc.period}.` : 'Automatic NBA statistical Venn diagrams.';
  const image = `${origin}/api/og?id=${encodeURIComponent(id)}`;
  const tags = `<meta property="og:type" content="website"><meta property="og:site_name" content="Overlap"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(`${origin}/d/${id}`)}">`
    + (doc ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">` : '')
    + `<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">`;
  const html = shell ? shell.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`).replace('</head>', `${tags}</head>`)
    : `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${tags}<meta http-equiv="refresh" content="0;url=/"></head><body></body></html>`;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=300');
  res.end(html);
}
