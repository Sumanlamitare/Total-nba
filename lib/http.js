import { OutOfQuota } from './bbs.js';

// Wraps a handler: JSON out, short CDN cache for finished data, readable errors
export const handler = fn => async (req, res) => {
  try {
    const out = await fn(req.query || {}, req);
    res.setHeader('cache-control', out?.cache ? `public, s-maxage=${out.cache}` : 'no-store');
    delete out?.cache;
    res.status(200).json(out);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
};
export const bad = msg => Object.assign(new Error(msg), { status: 400 });
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// Run a live pull, but still answer from MongoDB when the daily quota is used up
export async function tryPull(fn) {
  try { return { ...(await fn()), quotaReached: false }; }
  catch (e) { if (e instanceof OutOfQuota) return { pulled: 0, quotaReached: true }; throw e; }
}
