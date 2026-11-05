import { mockSources } from '../test/mock-sources.mjs';
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const out = process.argv[2];
const m = await mockSources(); Object.assign(process.env, m.env);
const espn = await import('../lib/providers/espn.js');
const { detectLines, angle } = await import('../lib/detect.js');
const { DEFAULTS } = await import('../lib/settings.js');
const G = await import('../lib/graphics/data.js');
const { TEMPLATES } = await import('../lib/graphics/templates.js');
const { renderProject } = await import('../lib/graphics/server.js');
// Stand-in images (no network here): a silhouette and a logo disc.
const sil = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="760"><ellipse cx="520" cy="300" rx="150" ry="190" fill="#c9a27e"/><path d="M180 760 Q200 520 520 500 Q840 520 860 760Z" fill="#1d428a"/><text x="520" y="680" font-size="120" text-anchor="middle" fill="#fff" font-family="Inter">23</text></svg>`).render().asPng();
const SIL = `data:image/png;base64,${Buffer.from(sil).toString('base64')}`;
const logo = c => `data:image/png;base64,${Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="90" fill="${c}"/></svg>`).render().asPng()).toString('base64')}`;
const c = await espn.game('401909922');
for (const p of c.players) p.headshot = SIL;
for (const t of c.game.teams) t.logo = logo(t.color);
const perfs = detectLines(c, new Map(), {}, DEFAULTS, {});
const perf = perfs.find(p => p.name === 'LeBron James') || perfs[0];
perf.angle = angle(perf);
console.log(perfs.slice(0,4).map(p => [p.name, p.score, p.tags.map(t=>t.label).join(' | ')]));
const base = G.fromPerformance(perf, { brand: { name: 'Around the NBA', handle: '@AroundTheNBA' } });
const ev = { _id: 'x', type: 'record', category: 'Franchise record', stat: 'pts', state: 'broken', value: 52, target: 50, title: 'Most points in a game — Philadelphia 76ers', scopeLabel: '76ers · Regular season · since 1993-94',
  previous: { value: 50, holders: [{ name: 'Joel Embiid', date: '20220127', opp: 'ORL' }] }, player: { id: '1966', name: 'LeBron James', headshot: SIL, team: 'PHI', teamId: '20', color: '#1d428a', alt: '#e01234' },
  game: { id: '1', date: '20261104', status: 'final', clock: 'Final', teams: c.game.teams }, source: { provider: 'ESPN box scores' }, verification: { status: 'verified' } };
const evData = G.fromEvent(ev, { line: perf.line, brand: base.brand });
const datas = {
  'record-broken': evData, 'record-tied': { ...evData, record: { ...evData.record, state: 'tied' } }, 'record-approaching': G.fromEvent({ ...ev, state: 'approaching', value: 46, projection: 51.2, game: { ...ev.game, status: 'in', clock: 'Q4 5:12' } }, { line: perf.line }),
  milestone: G.fromEvent({ ...ev, type: 'milestone', title: '44,000 career points', scopeLabel: 'Regular season, career', value: 44003, target: 44000, state: 'reached', previous: { value: 43990 } }, { line: perf.line }),
  'franchise-milestone': evData, 'team-record': { ...evData, kicker: 'FRANCHISE RECORD' },
  'game-result': G.fromGame({ _id: '1', date: '20261104', status: 'final', teams: c.game.teams, verify: { status: 'verified' } }, perfs.slice(0, 4).map(p => ({ ...p, color: p.team.color }))),
  leaderboard: G.fromLeaderboard({ title: 'Most points tonight', subhead: 'November 4, 2026', rows: perfs.slice(0, 10).map((p, i) => ({ rank: i + 1, name: p.name, team: p.team.abbr, value: p.line.pts, headshot: SIL, color: p.team.color })) }),
  'player-vs-player': G.fromCompare({ a: { name: 'LeBron James', headshot: SIL, team: c.game.teams[1] }, b: { name: 'Cade Cunningham', headshot: SIL, team: c.game.teams[0] }, period: '2026-27 season', rows: [{ label: 'Points', a: 16.2, b: 27.1, better: 'b' }, { label: 'Rebounds', a: 7.0, b: 6.1, better: 'a' }, { label: 'Assists', a: 7.3, b: 9.4, better: 'b' }, { label: 'TS%', a: '54.1%', b: '58.0%', better: 'b' }] }),
  'season-stats': G.fromSeason({ player: { name: 'LeBron James', headshot: SIL }, team: c.game.teams[1], season: 2027, values: { pts: 16.2, reb: 7.0, ast: 7.3, fg_pct: '45.1%', tp_pct: '23.8%', ts_pct: '52.0%' } }),
  'stat-oddity': { ...base, headline: '0 field goals. 18 points.', note: 'Made all 18 of his free throws without a single field goal.' },
  'historical-comparison': { ...base, history: { label: 'Last time', text: 'The last 13-10-8 line by a 41-year-old in the database: none — first in the box-score era.' } },
};
for (const t of TEMPLATES) for (const [fmt, size] of [['l', { w: 1600, h: 900 }], ['p', { w: 1080, h: 1350 }], ['s', { w: 1080, h: 1080 }], ['st', { w: 1080, h: 1920 }]]) {
  if (fmt !== 'l' && !['performance-final', 'record-broken', 'game-result', 'leaderboard', 'player-vs-player'].includes(t.id)) continue;
  const data = datas[t.id] || G.withStats(base, t.stats.length ? t.stats : base.statKeys);
  const r = await renderProject({ template: t.id, size, data, theme: {} });
  fs.writeFileSync(`${out}/${t.id}-${fmt}.png`, r.buffer);
}
console.log('rendered');
await m.close();
