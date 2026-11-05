// Small helpers shared by every API function: routing by method and action, JSON in and out, errors, cache headers.

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

// The JSON body (Vercel parses it; the dev server doesn't). Limited to 6 MB (uploads are data URIs).
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { fail(400, 'Bad JSON'); } }
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 6e6) fail(413, 'Too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Bad JSON'); }
}

// route({ GET: fn, POST: fn }); each fn gets ({ req, res, query, body }) and returns JSON-able data. A function may
// set res.raw = true after writing the response itself (images).
export const route = handlers => async (req, res) => {
  try {
    const fn = handlers[req.method];
    if (!fn) fail(405, 'Method not allowed');
    const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    // Writes must come from this site (cookies are SameSite=Lax; this also stops cross-site form posts).
    if (req.method !== 'GET' && req.headers.origin && req.headers.host && new URL(req.headers.origin).host !== req.headers.host) fail(403, 'Cross-site request');
    const b = req.method === 'GET' ? {} : await body(req);
    const out = await fn({ req, res, query, body: b });
    if (res.raw || res.writableEnded) return;
    if (!res.getHeader('cache-control')) res.setHeader('cache-control', 'no-store');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out ?? { ok: true }));
  } catch (e) {
    const status = e.status || 500;
    const ours = status >= 500 && status !== 502 && status !== 503;
    if (ours) console.error(e);
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ error: ours ? 'Something went wrong on our side' : e.message }));
  }
};

// Dispatch on ?action= (or ?q=) within a method.
export const actions = map => async ctx => {
  const a = ctx.query.action || ctx.query.q || ctx.body?.action;
  const fn = map[a];
  if (!fn) fail(404, `Unknown action ${a || ''}`.trim());
  return fn(ctx);
};

// Shared CDN cache: browsers revalidate, Vercel's edge keeps a copy for `edge` seconds.
export const cache = (res, edge, stale = 86400) => res.setHeader('cache-control', `public, max-age=0, s-maxage=${edge}, stale-while-revalidate=${stale}`);
export const privateCache = (res, sec) => res.setHeader('cache-control', `private, max-age=${sec}`);

export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const int = (v, d = 0, min = -Infinity, max = Infinity) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
export const ymdParam = v => (/^\d{8}$/.test(String(v || '')) ? String(v) : null);
export const idParam = v => (/^[A-Za-z0-9:_.-]{1,80}$/.test(String(v || '')) ? String(v) : fail(400, 'Bad id'));
