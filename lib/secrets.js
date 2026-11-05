// Credentials (AI key, social platform tokens) entered in Settings are stored encrypted (AES-256-GCM). The key comes from
// ATN_SECRET, or failing that is derived from MONGODB_URI — both live only in server environments (Vercel, GitHub
// Actions), never in the browser. Environment variables always win over stored values.
import crypto from 'node:crypto';

const key = () => crypto.createHash('sha256').update(`atn-secrets:${process.env.ATN_SECRET || process.env.MONGODB_URI || 'local-dev'}`).digest();

export function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}
export function open(sealed) {
  try {
    const [iv, tag, data] = String(sealed).split('.').map(s => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return null; }
}

// Known credentials and the environment variable that can supply each.
export const CREDENTIALS = {
  anthropic: { label: 'Anthropic API key', env: 'ANTHROPIC_API_KEY', fields: ['apiKey'] },
};

// { field: value } for a credential, environment first, then the encrypted copy in the database. null if incomplete.
export async function credential(d, id) {
  const def = CREDENTIALS[id]; if (!def) return null;
  const out = {};
  const envMap = typeof def.env === 'string' ? { [def.fields[0]]: def.env } : def.env;
  for (const f of def.fields) if (process.env[envMap[f]]) out[f] = process.env[envMap[f]];
  if (def.fields.every(f => out[f])) return { ...out, from: 'environment' };
  const doc = await d.collection('secrets').findOne({ _id: id });
  if (doc?.sealed) { const v = JSON.parse(open(doc.sealed) || '{}'); if (def.fields.every(f => v[f])) return { ...v, from: 'settings' }; }
  return null;
}

export async function saveCredential(d, id, values, user) {
  const def = CREDENTIALS[id]; if (!def) throw Object.assign(new Error('Unknown credential'), { status: 400 });
  if (values === null) { await d.collection('secrets').deleteOne({ _id: id }); return; }
  const v = Object.fromEntries(def.fields.map(f => [f, String(values?.[f] || '').trim()]));
  if (!def.fields.every(f => v[f])) throw Object.assign(new Error(`${def.label} needs: ${def.fields.join(', ')}`), { status: 400 });
  await d.collection('secrets').updateOne({ _id: id }, { $set: { sealed: seal(JSON.stringify(v)), updatedAt: new Date(), updatedBy: user?.email || null } }, { upsert: true });
}

// Which credentials are configured (never the values).
export async function credentialStatus(d) {
  const out = {};
  for (const id of Object.keys(CREDENTIALS)) { const c = await credential(d, id); out[id] = c ? { configured: true, from: c.from } : { configured: false }; }
  return out;
}
