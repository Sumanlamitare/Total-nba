// Name search over the catalog, in the browser (all players are already loaded).
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '');

// Every word typed must start a word of the name. Longer careers first when the match is equally good.
export function localSearch(players, q, limit = 30) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const p of players) {
    const name = ` ${norm(p.n)}`;
    if (!words.every(w => name.includes(` ${w}`))) continue;
    const exact = norm(p.n) === words.join(' ') ? 2 : norm(p.l).startsWith(words[words.length - 1]) ? 1 : 0;
    out.push({ p, score: exact * 1e6 + (p.g || 0) + Object.values(p.h || {}).reduce((a, b) => a + b, 0) * 200 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.p);
}
