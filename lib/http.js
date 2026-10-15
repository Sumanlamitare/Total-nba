// Small helpers shared by every API function: method routing, JSON in/out, cookies, errors.

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, secure = process.env.NODE_ENV !== 'development' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  const prev = res.getHeader('set-cookie');
  res.setHeader('set-cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}

export async function readBody(req, limit = 100_000) {
  let pre;
  try { pre = req.body; } catch { fail(400, 'Invalid body'); } // Vercel parses lazily and throws on bad JSON
  if (pre !== undefined) {
    if (typeof pre === 'string') return pre;
    if (Buffer.isBuffer(pre)) return pre.toString('utf8');
    return pre; // already parsed by the platform
  }
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) fail(413, 'Body too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

async function jsonBody(req) {
  const b = await readBody(req);
  if (b && typeof b === 'object') return b;
  if (!b) return {};
  try { return JSON.parse(b); } catch { fail(400, 'Invalid JSON'); }
}

// route({ GET: fn, POST: fn, ... }); each fn gets ({ req, res, query, body }) and returns JSON-able data.
// Writes must be JSON: browsers can't send that cross-site without a preflight, which blocks CSRF.
export const route = handlers => async (req, res) => {
  try {
    const fn = handlers[req.method];
    if (!fn) fail(405, 'Method not allowed');
    let body = {};
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const json = /application\/json/i.test(req.headers['content-type'] || '');
      // a cross-site page can't send DELETE (or JSON) without a CORS preflight, so a body-less DELETE is safe
      if (!json && !(req.method === 'DELETE' && !req.headers['content-type'])) fail(415, 'Send JSON');
      body = json ? await jsonBody(req) : {};
    }
    const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const out = await fn({ req, res, query, body });
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
    res.end(JSON.stringify({ error: status >= 500 ? 'Something went wrong on our side' : e.message }));
  }
};

export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
