// Small helpers shared by every API function: method routing, JSON out, errors, cache headers.

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

// route({ GET: fn }); each fn gets ({ req, res, query }) and returns JSON-able data.
export const route = handlers => async (req, res) => {
  try {
    const fn = handlers[req.method];
    if (!fn) fail(405, 'Method not allowed');
    const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const out = await fn({ req, res, query });
    if (!res.getHeader('cache-control')) res.setHeader('cache-control', 'no-store');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out ?? { ok: true }));
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ error: status === 502 ? 'ESPN did not answer. Try again in a moment.' : status >= 500 ? 'Something went wrong on our side' : e.message }));
  }
};

// Shared CDN cache: browsers revalidate, Vercel's edge keeps a copy for `edge` seconds.
export const cache = (res, edge, stale = 86400) => res.setHeader('cache-control', `public, max-age=0, s-maxage=${edge}, stale-while-revalidate=${stale}`);

export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
