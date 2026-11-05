// Audit the live feed against the source: every entry's claims re-checked with ESPN's box score and play-by-play.
//   node tools/audit-feed.mjs https://total-nba-ja9d.vercel.app
// Checks: player statistics shown on cards, starter vs bench wording, final scores, comeback outcomes, team runs
// (the score moved by exactly the run), game winners (the shot gave the lead for good), solo runs.
const base = process.argv[2] || 'https://total-nba-ja9d.vercel.app';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const j = async u => { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (AroundTheNBA audit)' } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const games = new Map();
async function game(id) {
  if (!games.has(id)) games.set(id, j(`${SITE}/summary?event=${id}`).then(s => {
    const comp = s.header.competitions[0];
    const lines = new Map();
    for (const side of s.boxscore?.players || []) {
      const st = side.statistics?.[0]; if (!st) continue;
      for (const a of st.athletes || []) {
        if (!a.stats?.length) continue;
        const v = Object.fromEntries(st.keys.map((k, i) => [k, a.stats[i]]));
        lines.set(String(a.athlete.id), { name: a.athlete.displayName, starter: !!a.starter, team: String(side.team.id), pts: +v.points, reb: +v.rebounds, ast: +v.assists, stl: +v.steals, blk: +v.blocks, fg: v['fieldGoalsMade-fieldGoalsAttempted'] });
      }
    }
    return { teams: comp.competitors.map(c => ({ id: String(c.id), abbr: c.team.abbreviation, score: +c.score, winner: !!c.winner, home: c.homeAway === 'home' })), status: comp.status.type, lines, plays: s.plays || [] };
  }));
  return games.get(id);
}

let entries = [], before = null;
for (let page = 0; page < 20; page++) {
  const r = await j(`${base}/api/feed?action=list&all=1&limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`);
  entries.push(...r.items);
  if (r.items.length < 100) break;
  before = r.items.at(-1).sortAt;
}
console.log(`${entries.length} entries (${entries.filter(e => e.published).length} published)`);
const problems = [];
const bad = (e, msg) => problems.push(`[${e.category}] ${e.headline} — ${e.players?.[0]?.name || e.team?.name || ''} (${e.game?.id}): ${msg}`);
for (const e of entries) {
  if (!e.game?.id || !/^\d+$/.test(e.game.id)) continue;
  let g;
  try { g = await game(e.game.id); } catch (x) { bad(e, `could not load the game: ${x.message}`); continue; }
  const final = g.status.completed;
  // Scores on the card.
  if (final && e.status !== 'developing') for (const t of e.game.teams || []) { const s = g.teams.find(x => x.abbr === t.abbr); if (s && t.score != null && s.score !== t.score) bad(e, `${t.abbr} score ${t.score} ≠ ESPN ${s.score}`); }
  const p = e.players?.[0], line = p && g.lines.get(String(p.id));
  if (e.origin === 'box score' && p) {
    if (!line) { bad(e, 'player not in the box score'); continue; }
    if (final && e.status !== 'developing') for (const s of e.stats || []) {
      const want = { PTS: line.pts, REB: line.reb, AST: line.ast, STL: line.stl, BLK: line.blk, FG: line.fg }[s.label];
      if (want != null && String(want) !== String(s.value)) bad(e, `${s.label} ${s.value} ≠ ESPN ${want}`);
    }
    const benchWords = /\b(off the bench|bench spark|sixth-man)\b/i;
    if (line.starter && (benchWords.test(e.headline) || benchWords.test(e.body))) bad(e, 'says bench, but started');
    if (!line.starter && /\bstarter\b/i.test(e.body)) bad(e, 'says starter, but came off the bench');
  }
  if (e.category === 'comeback-done' && final) { const w = g.teams.find(t => t.winner); if (e.team?.id !== w?.id) bad(e, 'comeback completed by a team that lost'); }
  if (e.category === 'game-winner' || e.category === 'defensive-winner') { const w = g.teams.find(t => t.winner); if (!final) bad(e, 'game winner on a game that is not final'); else if (e.team?.id !== w?.id) bad(e, 'game winner credited to the losing team'); }
  if (e.category === 'run' && e.facts?.before && e.facts?.after) {
    const n = s => s.match(/\d+/g).map(Number);
    const [a0, h0] = [n(e.facts.before)[0], n(e.facts.before)[1]], [a1, h1] = [n(e.facts.after)[0], n(e.facts.after)[1]];
    const home = g.teams.find(t => t.home), us = e.team?.id === home?.id;
    const ours = us ? h1 - h0 : a1 - a0, theirs = us ? a1 - a0 : h1 - h0;
    if (ours !== e.facts.a || theirs !== e.facts.b) bad(e, `run says ${e.facts.a}–${e.facts.b}, score moved ${ours}–${theirs}`);
    if (e.facts.flipped && !((us ? h0 - a0 : a0 - h0) < 0 && (us ? h1 - a1 : a1 - h1) > 0)) bad(e, 'says it flipped the lead, it did not');
  }
  if (e.category === 'solo-run' && e.facts?.consecutive && p) {
    // The player's points between the stated clocks must cover the consecutive count.
    const pts = g.plays.filter(x => x.scoringPlay && x.participants?.[0]?.athlete?.id === String(p.id)).reduce((a, x) => a + (x.scoreValue || 0), 0);
    if (pts < e.facts.consecutive) bad(e, `${e.facts.consecutive} consecutive points, but ${pts} in the whole game`);
  }
}
// Speed: how long after the play (ESPN's wall clock) each live story reached the feed.
const lags = entries.filter(e => e.origin === 'play-by-play' && e.occurredAt && e.createdAt && !e.facts?.recap)
  .map(e => (new Date(e.createdAt) - new Date(e.occurredAt)) / 1000).filter(x => x >= 0 && x < 6 * 3600).sort((a, b) => a - b);
if (lags.length) { const q = f => Math.round(lags[Math.min(lags.length - 1, Math.floor(f * lags.length))]); console.log(`Time from the play to the feed (${lags.length} live stories): median ${q(0.5)} s, 90% within ${q(0.9)} s, slowest ${Math.round(lags.at(-1))} s`); }
console.log(problems.length ? `\n${problems.length} problems:\n${problems.join('\n')}` : '\nNo problems found.');
process.exitCode = problems.length ? 1 : 0;
