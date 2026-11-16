// The competitions the app watches: ESPN league codes (the path segment in site.api.espn.com/.../soccer/<code>/...).
// Men's competitions only. This list is the default; the live list is stored in the database (Settings →
// Competitions), where any of them can be switched off, renamed, or new ones added.
export const DEFAULT_COMPETITIONS = [
  // Favourites
  ['caf.nations', 'Africa Cup of Nations', 'favourites'],
  ['ger.1', 'Bundesliga', 'favourites'],
  ['eng.charity', 'Community Shield', 'favourites'],
  ['concacaf.nations.league', 'CONCACAF Nations League', 'favourites'],
  ['conmebol.america', 'Copa América', 'favourites'],
  ['esp.copa_del_rey', 'Copa del Rey', 'favourites'],
  ['ita.coppa_italia', 'Coppa Italia', 'favourites'],
  ['fra.coupe_de_france', 'Coupe de France', 'favourites'],
  ['eng.league_cup', 'EFL Cup', 'favourites'],
  ['uefa.euro', 'EURO', 'favourites'],
  ['uefa.euroq', 'EURO Qualification', 'favourites'],
  ['eng.fa', 'FA Cup', 'favourites'],
  ['fifa.cwc', 'FIFA Club World Cup', 'favourites'],
  ['fifa.world', 'FIFA World Cup', 'favourites'],
  ['esp.1', 'LaLiga', 'favourites'],
  ['fra.1', 'Ligue 1', 'favourites'],
  ['usa.1', 'MLS', 'favourites'],
  ['fifa.olympics', 'Olympic Games', 'favourites'],
  ['eng.1', 'Premier League', 'favourites'],
  ['ksa.1', 'Saudi Pro League', 'favourites'],
  ['sco.1', 'Scottish Premiership', 'favourites'],
  ['ita.1', 'Serie A', 'favourites'],
  ['uefa.champions', 'UEFA Champions League', 'favourites'],
  ['uefa.europa.conf', 'UEFA Conference League', 'favourites'],
  ['uefa.europa', 'UEFA Europa League', 'favourites'],
  ['uefa.nations', 'UEFA Nations League', 'favourites'],
  ['uefa.super_cup', 'UEFA Super Cup', 'favourites'],
  ['fifa.worldq.caf', 'World Cup Qual. CAF', 'favourites'],
  ['fifa.worldq.uefa', 'World Cup Qual. UEFA', 'favourites'],
  // International
  ['fifa.worldq.concacaf', 'World Cup Qual. CONCACAF', 'international'],
  ['fifa.worldq.conmebol', 'World Cup Qual. CONMEBOL', 'international'],
  ['fifa.worldq.afc', 'World Cup Qual. AFC', 'international'],
  ['fifa.worldq.ofc', 'World Cup Qual. OFC', 'international'],
  ['fifa.friendly', 'International Friendly Games', 'international'],
  ['caf.nations_qual', 'Africa Cup of Nations Qual.', 'international'],
  // Other major leagues
  ['ned.1', 'Eredivisie', 'leagues'],
  ['por.1', 'Primeira Liga', 'leagues'],
  ['tur.1', 'Süper Lig', 'leagues'],
  ['conmebol.libertadores', 'Copa Libertadores', 'leagues'],
].map(([code, name, group], order) => ({ code, name, group, order, enabled: true }));

export const GROUPS = { favourites: 'Favourites', international: 'International', leagues: 'Other major leagues', custom: 'Added' };
// Women's competitions are never watched, whatever is added (ESPN marks them with ".w." or "women" in the code).
export const isWomens = code => /(^|\.)w(\.|$)|women|nwsl|wsl|\.w\d/i.test(String(code));

export async function competitions(d, { enabledOnly = false } = {}) {
  const doc = await d.collection('settings').findOne({ _id: 'competitions' });
  const list = (doc?.list || DEFAULT_COMPETITIONS).filter(c => !isWomens(c.code));
  return enabledOnly ? list.filter(c => c.enabled) : list;
}

export async function saveCompetitions(d, list) {
  const clean = [];
  const seen = new Set();
  for (const [i, c] of (Array.isArray(list) ? list : []).entries()) {
    const code = String(c?.code || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{2,60}$/.test(code) || seen.has(code) || isWomens(code)) continue;
    seen.add(code);
    clean.push({ code, name: String(c.name || code).trim().slice(0, 60), group: GROUPS[c.group] ? c.group : 'custom', order: i, enabled: c.enabled !== false });
  }
  if (!clean.length) throw Object.assign(new Error('Keep at least one competition'), { status: 400 });
  await d.collection('settings').updateOne({ _id: 'competitions' }, { $set: { list: clean, updatedAt: new Date() } }, { upsert: true });
  return clean;
}
