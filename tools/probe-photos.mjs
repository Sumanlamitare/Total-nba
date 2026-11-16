// Which pictures ESPN offers for a finished soccer match: player headshots (scoreboard athletes, summary rosters, the
// headshot URL pattern), match photos in the summary's news and video thumbnails. Prints shapes and URL availability.
//   node tools/probe-photos.mjs   (looks at recent finished matches in a few competitions)
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const H = { 'user-agent': 'Mozilla/5.0 (fp90 probe)', accept: 'application/json' };
const get = async u => { const r = await fetch(u, { headers: H }); return r.ok ? r.json() : null; };
const head = async u => { try { const r = await fetch(u, { method: 'GET', headers: H }); const b = await r.arrayBuffer(); return `${r.status} ${r.headers.get('content-type')} ${b.byteLength}B`; } catch (e) { return e.message; } };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const keys = o => (o && typeof o === 'object' ? Object.keys(o).join(',') : String(o));
let n = 0;
for (const code of ['eng.1', 'esp.1', 'uefa.nations', 'ger.1', 'fifa.friendly', 'usa.1']) {
  for (let back = 0; back < 10 && n < 6; back++) {
    const sb = await get(`${SITE}/${code}/scoreboard?dates=${ymd(new Date(Date.now() - back * 864e5))}`);
    const done = (sb?.events || []).filter(e => e.competitions[0].status.type.completed && (e.competitions[0].details || []).some(d => d.scoringPlay));
    if (!done.length) continue;
    const e = done[0], c = e.competitions[0];
    n++;
    console.log(`\n## ${code} ${e.id} ${e.name} (${e.date})`);
    const a = c.details.find(d => d.scoringPlay)?.athletesInvolved?.[0];
    console.log('scoreboard athlete keys:', keys(a), JSON.stringify(a).slice(0, 400));
    console.log('competition keys:', keys(c), '| headlines:', JSON.stringify(c.headlines || null).slice(0, 300));
    if (a?.id) for (const u of [`https://a.espncdn.com/i/headshots/soccer/players/full/${a.id}.png`, `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${a.id}.png&w=350&h=254`]) console.log('headshot', u, await head(u));
    const s = await get(`${SITE}/${code}/summary?event=${e.id}`);
    if (!s) { console.log('summary: none'); continue; }
    console.log('summary keys:', keys(s));
    const vids = s.videos || [];
    console.log(`videos ${vids.length}`, vids[0] ? `keys: ${keys(vids[0])} | thumbnail: ${vids[0].thumbnail} | headline: ${vids[0].headline}` : '');
    if (vids[0]?.thumbnail) console.log('  thumb', await head(vids[0].thumbnail));
    const arts = s.news?.articles || [];
    console.log(`news articles ${arts.length}`, arts[0] ? `keys: ${keys(arts[0])} | headline: ${arts[0].headline} | images: ${JSON.stringify((arts[0].images || []).map(i => ({ url: i.url, w: i.width, h: i.height, caption: (i.caption || '').slice(0, 90), credit: i.credit, type: i.type })))}` : '');
    for (const art of arts.slice(0, 4)) console.log('  article:', art.headline, '|', (art.images || []).length, 'images', '| categories:', (art.categories || []).map(x => x.description || x.type).join(';').slice(0, 160));
    if (arts[0]?.images?.[0]?.url) console.log('  image', await head(arts[0].images[0].url));
    const rost = s.rosters || [];
    const ath = rost[0]?.roster?.[0];
    console.log('roster entry keys:', keys(ath), '| athlete keys:', keys(ath?.athlete), '| headshot:', JSON.stringify(ath?.athlete?.headshot || null));
    const withShot = rost.flatMap(r => r.roster || []).filter(x => x.athlete?.headshot?.href).length, total = rost.flatMap(r => r.roster || []).length;
    console.log(`roster players with headshot: ${withShot}/${total}`);
    console.log('header keys:', keys(s.header), '| gameInfo keys:', keys(s.gameInfo));
    // Anything that looks like a man-of-the-match / player-of-the-match field.
    const txt = JSON.stringify(s);
    for (const k of ['ofTheMatch', 'OfTheMatch', 'manOfTheMatch', 'playerOfTheMatch', 'motm', 'potm', 'star']) if (txt.includes(k)) console.log('found key-ish:', k, txt.slice(txt.indexOf(k) - 120, txt.indexOf(k) + 200));
    if (s.leaders) console.log('leaders:', JSON.stringify(s.leaders).slice(0, 400));
    if (s.boxscore?.players) console.log('boxscore.players present');
  }
}
