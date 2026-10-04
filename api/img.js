// GET /api/img?id=ESPN_PLAYER_ID — player headshot served from this site, so the graphic's canvas
// can include it and still be exported as a PNG (cross-origin images would block the export).
export default async function img(req, res) {
  const id = String(req.query?.id || '');
  if (!/^\d{1,12}$/.test(id)) { res.statusCode = 400; return res.end('bad id'); }
  try {
    const r = await fetch(`${process.env.ESPN_IMG_BASE || 'https://a.espncdn.com/i/headshots/nba/players/full'}/${id}.png`);
    if (!r.ok) { res.statusCode = 404; return res.end('no image'); }
    res.setHeader('content-type', r.headers.get('content-type') || 'image/png');
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=2592000');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.statusCode = 502; res.end('image fetch failed');
  }
}
