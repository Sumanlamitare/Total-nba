// Server-rendered page shell for search engines and link previews. Every page address (/games/…, /season/…,
// /player/…, /records/…) gets its own title, description, canonical URL, social image, structured data and a
// plain top-10 table inside #root; React then takes over the page. Also serves /sitemap.xml and /ads.txt.
import { db } from '../lib/db.js';
import { dayLines, dayGames, seasonAll, weekAll, playerCard, records, meta as storeMeta } from '../lib/store.js';
import { weekDates } from '../lib/dates.js';
import { parsePath, playerPath, STAT_SLUG, FIELD, STAT_NAME } from '../lib/routes.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const long = d => { const [y, m, x] = d.split('-').map(Number); return `${MO[m - 1]} ${x}, ${y}`; };
const fmt = n => (Math.round((n || 0) * 10) / 10).toLocaleString('en-US');
const face = id => (/^\d+$/.test(id || '') ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=600&h=436&scale=crop` : '');
let shell = null;

async function page(origin, path) {
  const r = parsePath(path);
  if (!r) return { status: 404, title: 'Page not found · TotalNBA', desc: 'This page does not exist.', body: '<h1>Page not found</h1>' };
  const f = FIELD[r.stat] || 'pts', sn = STAT_NAME[r.stat] || 'Points';
  const table = (rows, val, sub) => '<ol>' + rows.map(x => `<li><a href="${playerPath(x.name, x.key)}">${esc(x.name)}</a> — ${fmt(val(x))} ${esc(sn)}${sub ? ' · ' + esc(sub(x)) : ''}</li>`).join('') + '</ol>';
  if (r.mode === 'day' && r.date) {
    const [lines, games] = await Promise.all([dayLines(r.date, f), dayGames(r.date)]);
    const top = lines.slice(0, 10), t = top[0];
    return {
      title: `${sn} leaders — NBA games on ${long(r.date)} · TotalNBA`,
      desc: t ? `${t.name} led all players with ${fmt(t[f])} ${sn.toLowerCase()} on ${long(r.date)}. Every player from all ${games.length} NBA games, ranked by ${sn.toLowerCase()}.` : `NBA box scores for ${long(r.date)}.`,
      image: face(t?.espnId),
      body: `<h1>NBA ${esc(sn)} leaders, ${long(r.date)}</h1><p>${games.map(g => `${esc(g.away)} ${g.as}, ${esc(g.home)} ${g.hs}`).join(' · ')}</p>` + table(top, x => x[f], x => `${x.team} vs ${x.opp}`),
    };
  }
  if (r.mode === 'week' && r.date) {
    const dates = weekDates(r.date), rows = (await weekAll(dates, f)).slice(0, 10);
    return {
      title: `NBA ${sn} leaders, week of ${long(dates[0])} · TotalNBA`,
      desc: rows[0] ? `${rows[0].name} led the NBA with ${fmt(rows[0][f])} total ${sn.toLowerCase()} for the week of ${long(dates[0])}.` : 'Weekly NBA totals.',
      image: face(rows[0]?.espnId), body: `<h1>NBA ${esc(sn)} leaders, week of ${long(dates[0])}</h1>` + table(rows, x => x[f], x => `${x.gp} games`),
    };
  }
  if (r.mode === 'season') {
    const rows = (await seasonAll(+r.season.slice(0, 4), f)).slice(0, 25);
    const label = r.season.replace('-', '–');
    return {
      title: `${label} NBA ${sn} leaders — regular-season totals · TotalNBA`,
      desc: rows[0] ? `${rows[0].name} leads the ${label} NBA regular season with ${fmt(rows[0][f])} total ${sn.toLowerCase()}. Full ranking of every player, totals not averages.` : `${label} NBA season totals.`,
      image: face(rows[0]?.espnId), body: `<h1>${label} NBA ${esc(sn)} leaders</h1>` + table(rows, x => x[f], x => `${x.team} · ${x.gp} games`),
    };
  }
  if (r.mode === 'records') {
    const rows = (await records(f)).slice(0, 25);
    return {
      title: `Most ${sn.toLowerCase()} in an NBA game since 1993 · TotalNBA`,
      desc: rows[0] ? `The NBA regular-season single-game ${sn.toLowerCase()} record since 1993–94: ${rows[0].name}, ${fmt(rows[0][f])} vs ${rows[0].opp} on ${long(rows[0].date)}. Top 25 games ranked.` : 'All-time NBA single-game records.',
      image: face(rows[0]?.espnId),
      body: `<h1>Most ${esc(sn.toLowerCase())} in a game since 1993</h1><ol>` + rows.map(x => `<li><a href="${playerPath(x.name, x.key)}">${esc(x.name)}</a> — ${fmt(x[f])} vs ${esc(x.opp)}, <a href="/games/${x.date}">${long(x.date)}</a></li>`).join('') + '</ol>',
    };
  }
  if (r.mode === 'player') {
    const p = await playerCard(r.player);
    if (!p) return { status: 404, title: 'Player not found · TotalNBA', desc: '', body: '<h1>Player not found</h1>' };
    const yrs = `${p.seasons[0]?.season || ''}–${p.seasons.at(-1)?.season || ''}`;
    const hi = p.highs.pts;
    return {
      title: `${p.name} stats — career totals, game logs & career highs · TotalNBA`,
      desc: `${p.name} (${p.team}): ${fmt(p.career.pts)} points, ${fmt(p.career.reb)} rebounds and ${fmt(p.career.ast)} assists in ${p.career.gp} games (${yrs}). Career high ${hi ? hi.pts + ' points vs ' + hi.opp : ''}.`,
      image: face(p.espnId), canonical: playerPath(p.name, p.key),
      ld: { '@context': 'https://schema.org', '@type': 'Person', name: p.name, affiliation: { '@type': 'SportsTeam', name: p.team }, image: face(p.espnId) },
      body: `<h1>${esc(p.name)} career stats</h1><p>${esc(p.team)} · ${p.career.gp} games · ${fmt(p.career.pts)} PTS · ${fmt(p.career.reb)} REB · ${fmt(p.career.ast)} AST</p><ol>`
        + p.seasons.map(s => `<li><a href="/season/${s.season}">${s.season}</a>: ${fmt(s.pts)} PTS, ${fmt(s.reb)} REB, ${fmt(s.ast)} AST in ${s.gp} games (${esc(s.team)})</li>`).join('') + '</ol>',
    };
  }
  const fixed = {
    pro: ['TotalNBA Pro — splits, exports, no ads', 'Player splits (last 5/10/20, home/away, vs every opponent), CSV exports, clean graphics and no ads.'],
    privacy: ['Privacy policy · TotalNBA', 'How TotalNBA uses cookies, local storage and advertising.'],
    saved: ['Saved cards · TotalNBA', 'Performances you saved on TotalNBA.'],
  }[r.mode];
  if (fixed) return { title: fixed[0], desc: fixed[1], body: `<h1>${esc(fixed[0])}</h1><p>${esc(fixed[1])}</p>` };
  return { title: 'TotalNBA — every NBA player, every night, since 1993', desc: 'Every NBA player who played tonight ranked by any stat, weekly and season totals, all-time records and career pages since 1993–94.', body: '' };
}

async function sitemap(origin) {
  const d = await db();
  const m = await storeMeta();
  const urls = ['/', '/records', '/pro'];
  for (const s of Object.values(STAT_SLUG)) urls.push(`/records/${s}`);
  for (const s of m.seasons.slice(0, 33)) { urls.push(`/season/${s}`); for (const st of ['rebounds', 'assists', 'threes', 'blocks', 'steals']) urls.push(`/season/${s}/${st}`); }
  for (const x of m.dates.slice(-1500)) urls.push(`/games/${x}`);
  const players = await d.collection('players').find({ key: /^\d+$/ }, { projection: { key: 1, name: 1 } }).sort({ gp: -1 }).limit(40000).toArray();
  for (const p of players) urls.push(playerPath(p.name, p.key));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.slice(0, 50000).map(u => `<url><loc>${esc(origin + u)}</loc></url>`).join('\n') + '\n</urlset>\n';
}

export default async function handler(req, res) {
  const q = req.query || {}, origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  try {
    if (q.t === 'sitemap') {
      res.setHeader('content-type', 'application/xml'); res.setHeader('cache-control', 'public, s-maxage=86400');
      return res.status(200).send(await sitemap(origin));
    }
    if (q.t === 'ads') {
      res.setHeader('content-type', 'text/plain'); res.setHeader('cache-control', 'public, s-maxage=86400');
      const pub = (process.env.ADSENSE_PUB || process.env.VITE_ADSENSE_CLIENT || '').replace(/^ca-/, '');
      return res.status(200).send(pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '# ads.txt: set ADSENSE_PUB in Vercel\n');
    }
    const path = '/' + [q.t, q.a, q.b].filter(Boolean).join('/');
    shell ||= await fetch(origin + '/index.html').then(r => r.text());
    const p = await page(origin, path).catch(e => ({ title: 'TotalNBA', desc: '', body: '', err: e.message }));
    const canonical = origin + (p.canonical || path);
    const head = `<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="TotalNBA">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.desc)}"><meta property="og:url" content="${esc(canonical)}">
${p.image ? `<meta property="og:image" content="${esc(p.image)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
${p.ld ? `<script type="application/ld+json">${JSON.stringify(p.ld).replace(/</g, '\\u003c')}</script>` : ''}`;
    const html = shell.replace(/<meta name="description"[^>]*>/, '').replace(/<title>[^<]*<\/title>/, head)
      .replace('<div id="root"></div>', `<div id="root"><main class="ssr">${p.body}<p><a href="/">TotalNBA</a> · every NBA player, every night, since 1993</p></main></div>`);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(p.status || 200).send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send('TotalNBA is having trouble right now.');
  }
}
