// Diagnostics: saves Big Balls Data docs and sample API responses into probe-out/ (pushed to the bbs-probe branch).
import fs from 'node:fs';
fs.mkdirSync('probe-out', { recursive: true });
const save = (name, body) => fs.writeFileSync('probe-out/' + name.replace(/[^A-Za-z0-9._=-]+/g, '_').slice(0, 150), body);
const KEY = process.env.BBS_API_KEY;
const BASE = 'https://api.bigballsdata.com';
const text = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

async function page(url, max = 12000) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const t = await r.text();
    const ct = r.headers.get('content-type') || '';
    console.log(`DOC ${url} ${r.status} ${t.length}b`);
    save('doc_' + url.replace(/^https:\/\//, ''), ct.includes('html') ? text(t) : t);
  } catch (e) { console.log(`\n##### DOC ${url} ERROR ${e.message}`); }
}
async function api(path, max = 3000) {
  if (!KEY) return console.log('no BBS_API_KEY');
  for (const h of [{ authorization: 'Bearer ' + KEY }, { 'x-api-key': KEY }]) {
    try {
      const r = await fetch(BASE + path, { headers: { ...h, accept: 'application/json' } });
      const t = await r.text();
      const lim = [...r.headers].filter(([k]) => /limit|remaining|quota|retry/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`API ${path} ${Object.keys(h)[0]} ${r.status} ${lim}`);
      save('api_' + path, `${r.status} ${lim}\n${t}`);
      if (r.status !== 401 && r.status !== 403) return t;
    } catch (e) { console.log(`\n##### API ${path} ERROR ${e.message}`); }
  }
}

const mode = process.argv[2] || 'docs';
if (mode === 'docs') {
  for (const u of ['https://bigballsdata.com/llms.txt', 'https://bigballsdata.com/llms-full.txt', 'https://bigballsdata.com/nba-api',
    'https://bigballsdata.com/docs/introduction', 'https://bigballsdata.com/pricing', 'https://bigballsdata.com/basketball-api',
    'https://bigballsdata.com/how-to-build-a-fantasy-basketball-app', 'https://api.bigballsdata.com/openapi.json', 'https://bigballsdata.com/openapi.json', 'https://bigballsdata.com/docs/rate-limits', 'https://bigballsdata.com/docs/errors'])
    await page(u, u.includes('llms-full') || u.includes('openapi') ? 60000 : 15000);
} else {
  for (const p of (process.env.PATHS || '').split(/\s+/).filter(Boolean)) await api(p);
}
