// Prints sample Big Balls Data responses so the data format can be mapped. Needs BBS_API_KEY.
const KEY = process.env.BBS_API_KEY;
if (!KEY) { console.log('BBS_API_KEY not set, skipping'); process.exit(0); }
const BASE = 'https://api.bigballsdata.com';
async function show(path) {
  for (const h of [{ 'x-api-key': KEY }, { authorization: 'Bearer ' + KEY }]) {
    try {
      const r = await fetch(BASE + path, { headers: { ...h, accept: 'application/json' } });
      const t = await r.text();
      console.log(`\n=== ${path} [${Object.keys(h)[0]}] ${r.status}\n${t.slice(0, 2500)}`);
      if (r.ok) return JSON.parse(t);
    } catch (e) { console.log(`\n=== ${path} ERROR ${e.message}`); }
  }
}
const g = await show('/v1/nba/games?date=2026-03-01');
const list = g?.data?.games || g?.data || g?.games || [];
const id = Array.isArray(list) && (list[0]?.id || list[0]?.game_id);
if (id) {
  for (const p of [`/v1/nba/games/${id}`, `/v1/nba/games/${id}/boxscore`, `/v1/nba/games/${id}/box`, `/v1/nba/boxscore/${id}`]) await show(p);
}
for (const p of ['/v1/nba', '/v1/nba/players?limit=2', '/v1/nba/leaders?season=2025-26', '/v1/nba/stats/leaders', '/v1/coverage?sport=basketball', '/v1/matches?sport=basketball&date=2026-03-01&limit=2']) await show(p);
