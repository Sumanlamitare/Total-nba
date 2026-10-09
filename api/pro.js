import { handler, bad } from '../lib/http.js';
import { db } from '../lib/db.js';

// POST /api/pro  { email }  — Pro waitlist (until Stripe checkout is connected)
export default handler(async (q, req) => {
  if (req.method !== 'POST') throw bad('POST an email');
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$/.test(email)) throw bad('Enter a valid email address');
  await (await db()).collection('waitlist').updateOne({ _id: email }, { $setOnInsert: { at: new Date(), from: String(body.from || '').slice(0, 40) } }, { upsert: true });
  return { ok: true };
});
