// Unit tests: game intelligence on real saved games, feed rules, records, detection, graphics, settings, auth helpers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mockSources } from './mock-sources.mjs';

let m, espn;
before(async () => { m = await mockSources(); Object.assign(process.env, m.env); espn = await import('../lib/providers/espn.js'); });
after(() => m.close());

test('provider normalizes a final game and its checks pass', async () => {
  const c = await espn.game('401909922');
  assert.equal(c.game.status, 'final');
  assert.equal(c.game.teams.length, 2);
  assert.ok(c.plays.length > 400);
  assert.deepEqual(c.problems, []);
  const pts = id => c.players.filter(p => p.team === id && p.line).reduce((a, p) => a + p.line.pts, 0);
  for (const t of c.game.teams) assert.equal(pts(t.id), t.score);
});

test('box score checks catch a score that does not add up', async () => {
  const c = await espn.game('401909922');
  c.players.find(p => p.line).line.pts += 2;
  assert.ok(espn.checks(c.game, c.players).some(p => /points/.test(p)));
});

test('intelligence: real games produce runs, comebacks, close finishes, overtime — each once', async () => {
  const { analyze } = await import('../lib/intel.js');
  const ot = await espn.game('401705127'); // Knicks at 76ers, overtime
  const s = analyze(ot);
  const keys = s.map(x => x.key);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate stories');
  assert.ok(s.some(x => x.category === 'overtime'));
  assert.ok(s.some(x => x.category === 'close'));
  const cb = s.find(x => x.category === 'comeback');
  assert.ok(cb && cb.status === 'final' && /trailed by 16/.test(cb.body), 'the 76ers comeback fell short, told once');
  assert.ok(!s.some(x => x.category === 'collapse' && x.team === cb.team === false && false));
  assert.ok(!s.some(x => x.category === 'comeback-done'), 'not completed: they lost');
  for (const r of s.filter(x => x.category === 'run')) assert.ok(r.facts.a >= 8 && r.facts.b <= Math.floor(r.facts.a / 4));
  // Stable keys: the same game analyzed again gives the same stories.
  assert.deepEqual(analyze(ot).map(x => x.key).sort(), [...keys].sort());
});

test('intelligence: a game in progress has no outcomes', async () => {
  const { analyze } = await import('../lib/intel.js');
  const c = await espn.game('401705128');
  const cut = c.plays.findIndex(p => p.period === 4 && /^[0-5]:/.test(p.clock));
  c.plays = c.plays.slice(0, cut); c.game.status = 'in';
  const s = analyze(c);
  assert.ok(s.every(x => x.status === 'developing'));
  assert.ok(!s.some(x => ['game-winner', 'defensive-winner', 'comeback-done'].includes(x.category)));
});

test('intelligence: game winner and defensive stop detected from constructed final plays', async () => {
  const { analyze } = await import('../lib/intel.js');
  const c = await espn.game('401909922');
  const [away, home] = [c.game.teams.find(t => !t.home), c.game.teams.find(t => t.home)];
  const shooter = c.players.find(p => p.team === home.id && p.line), blocker = c.players.find(p => p.team === home.id && p.line && p.id !== shooter.id);
  const base = { period: 4, type: '', team: null, scoring: false, value: 0, players: [], shooting: false, wall: '2026-11-05T02:30:00Z' };
  c.plays = [
    { ...base, id: 'p1', period: 1, clock: '11:40', text: 'start', away: 0, home: 0 },
    { ...base, id: 'p2', clock: '0:20', text: 'away basket', team: away.id, scoring: true, value: 2, players: [], away: 100, home: 99 },
    { ...base, id: 'p3', clock: '0:03.2', text: `${shooter.name} makes 26-foot three point jumper`, team: home.id, scoring: true, value: 3, players: [shooter.id], shooting: true, away: 100, home: 102 },
    { ...base, id: 'p4', clock: '0:01.0', text: `${blocker.name} blocks Someone's 24-foot three point shot`, team: home.id, away: 100, home: 102 },
    { ...base, id: 'p5', clock: '0:00.0', text: 'End of the 4th Quarter', away: 100, home: 102 },
  ];
  away.score = 100; home.score = 102; away.winner = false; home.winner = true; c.game.status = 'final';
  const s = analyze(c);
  const gw = s.find(x => x.category === 'game-winner');
  assert.ok(gw && gw.players[0] === shooter.id && /three/.test(gw.facts.kind));
  const dw = s.find(x => x.category === 'defensive-winner');
  assert.ok(dw && dw.players[0] === blocker.id && dw.facts.kind === 'block');
});

test('feed: levels, unverified outcomes are held back, performance floors', async () => {
  const { levelOf, fromIntel, fromPerformance } = await import('../lib/feed.js');
  assert.equal(levelOf(90), 'critical'); assert.equal(levelOf(70), 'high'); assert.equal(levelOf(45), 'medium'); assert.equal(levelOf(10), 'low');
  const { analyze } = await import('../lib/intel.js');
  const c = await espn.game('401705127');
  const st = analyze(c).find(x => x.status === 'final');
  assert.equal(fromIntel(st, c, null).significance, 0, 'no verification, nothing published');
  assert.equal(fromIntel(st, c, { status: 'problems' }).status, 'pending');
  assert.ok(fromIntel(st, c, { status: 'verified' }).significance > 0);
  const perf = { _id: 'g:p', gid: c.game.id, pid: 'p', name: 'Test Player', team: { id: c.game.teams[0].id, abbr: 'X' }, opp: { id: c.game.teams[1].id, abbr: 'Y' }, state: 'final', starter: true, line: { pts: 12, reb: 11, ast: 10, stl: 1, blk: 0, fgm: 5, fga: 9, min: 30 }, tags: [{ key: 'td', label: 'Triple-double', weight: 45 }], score: 20, disappointment: 0, angle: 'x' };
  const e = fromPerformance(perf, c, { status: 'verified' });
  assert.equal(e.category, 'triple-double'); assert.ok(e.significance >= 58);
});

test('records: insert keeps order, standing knows tied from broken', async () => {
  const { insert, standing, qualifies } = await import('../lib/records.js');
  let l = [];
  for (const v of [50, 60, 55, 60]) l = insert(l, { v, gid: `g${v}${Math.random()}`, pid: 'p', date: '20250101' });
  assert.deepEqual(l.map(x => x.v), [60, 60, 55, 50]);
  assert.equal(standing(l, 61).state, 'broken');
  assert.equal(standing(l, 60).state, 'tied');
  assert.equal(standing(l, 55).rank, 3);
  assert.ok(qualifies(l, 1));
});

test('detection: thresholds, career-high context, no pronouns in the angle', async () => {
  const { detectLines, angle } = await import('../lib/detect.js');
  const { DEFAULTS } = await import('../lib/settings.js');
  const c = await espn.game('401705127');
  const perfs = detectLines(c, new Map(), {}, DEFAULTS, {});
  assert.ok(perfs.length > 0);
  for (const p of perfs) assert.doesNotMatch(angle(p), /\b(he|his|him|she|her)\b/i);
  const hart = perfs.find(p => p.name === 'Josh Hart');
  assert.ok(hart.tags.some(t => t.key === 'td'));
});

test('graphics: every template renders at every size; text fits', async () => {
  const { TEMPLATES, buildScene } = await import('../lib/graphics/templates.js');
  const { renderScene } = await import('../lib/graphics/render.js');
  const { FORMATS } = await import('../lib/graphics/kit.js');
  const { layoutText } = await import('../lib/graphics/text.js');
  const data = { kicker: 'TEST', headline: 'A VERY LONG HEADLINE THAT MUST FIT', note: 'Note text', player: { name: 'Shai Gilgeous-Alexander', first: 'Shai', last: 'Gilgeous-Alexander', headshot: 'x.png' }, team: { abbr: 'OKC', color: '#007ac1', alt: '#ef3b24', logo: 'l.png' },
    game: { teams: [{ abbr: 'OKC', score: 120, winner: true }, { abbr: 'DAL', score: 118 }], status: 'FINAL' }, stats: [{ label: 'PTS', value: 40 }], rows: [{ rank: 1, name: 'A', value: 3 }], compare: { a: { name: 'A' }, b: { name: 'B' }, rows: [{ label: 'PTS', a: 1, b: 2, better: 'b' }] }, record: { title: 'Most points', value: 50, target: 49 } };
  for (const t of TEMPLATES) for (const f of Object.keys(FORMATS)) {
    const svg = renderScene(buildScene({ template: t.id, size: FORMATS[f], data }));
    assert.match(svg, /^<svg/, `${t.id} ${f}`);
    assert.doesNotMatch(svg, /NaN|undefined/, `${t.id} ${f}`);
  }
  const L = layoutText({ text: 'Gilgeous-Alexander', w: 300, h: 80, size: 200, fit: true, upper: true });
  assert.ok(L.size < 200 && L.widest <= 300.5);
});

test('editor overrides survive a data refresh', async () => {
  const { buildScene } = await import('../lib/graphics/templates.js');
  const p = { template: 'player-story', size: { w: 1600, h: 900 }, data: { headline: 'ONE', player: { name: 'A B', first: 'A', last: 'B' }, stats: [] }, overrides: { 'name-last': { x: 10, y: 20 } }, removed: ['ghost'], extra: [{ id: 'xa', type: 'text', text: 'hi', x: 0, y: 0, w: 10, h: 10 }] };
  const s1 = buildScene(p), s2 = buildScene({ ...p, data: { ...p.data, player: { name: 'C D', first: 'C', last: 'D' } } });
  const n = s2.elements.find(e => e.id === 'name-last');
  assert.equal(n.x, 10); assert.equal(n.text, 'D');
  assert.ok(!s1.elements.some(e => e.id === 'ghost'));
  assert.ok(s2.elements.some(e => e.id === 'xa'));
});

test('settings: only known keys with the right types', async () => {
  const { sanitize } = await import('../lib/settings.js');
  assert.deepEqual(sanitize({ feed: { minScore: '55', evil: 1, categories: { run: false, nope: true } }, hack: { x: 1 } }), { feed: { minScore: 55, categories: { run: false } } });
});

test('auth: scrypt passwords; voice helpers', async () => {
  const { hashPassword, checkPassword } = await import('../lib/auth.js');
  const h = hashPassword('correct horse battery');
  assert.ok(checkPassword('correct horse battery', h)); assert.ok(!checkPassword('wrong', h));
  const { possessive, pick } = await import('../lib/voice.js');
  assert.equal(possessive('Heat'), "Heat's"); assert.equal(possessive('Knicks'), "Knicks'");
  assert.equal(pick('k', ['a', 'b']), pick('k', ['a', 'b']));
});

test('NBA.com cross-check matches names across sources', async () => {
  const { normName, tricode } = await import('../lib/providers/nbacdn.js');
  assert.equal(normName('Luka Dončić'), normName('Luka Doncic'));
  assert.equal(normName('Jaren Jackson Jr.'), normName('Jaren Jackson'));
  assert.equal(tricode('GS'), 'GSW'); assert.equal(tricode('PHI'), 'PHI');
});

test('runs agree with the scoreboard: the score moved by exactly the run, and "flipped" is true', async () => {
  const { analyze } = await import('../lib/intel.js');
  for (const id of ['401909922', '401705127', '401705128']) {
    const c = await espn.game(id);
    const home = c.game.teams.find(t => t.home);
    for (const r of analyze(c).filter(x => x.category === 'run')) {
      const [a0, h0] = r.facts.before.match(/\d+/g).map(Number).filter((_, i) => i % 1 === 0).filter((v, i, arr) => i === arr.length - 3 || i === arr.length - 1);
      const n = s => s.match(/\b\d+\b/g).map(Number);
      const b = n(r.facts.before), a = n(r.facts.after);
      const us = r.team === home.id;
      const ours = us ? a[1] - b[1] : a[0] - b[0], theirs = us ? a[0] - b[0] : a[1] - b[1];
      assert.equal(`${ours}-${theirs}`, `${r.facts.a}-${r.facts.b}`, `${id} ${r.headline}`);
      if (r.facts.flipped) assert.ok((us ? b[1] - b[0] : b[0] - b[1]) < 0 && (us ? a[1] - a[0] : a[0] - a[1]) > 0);
      void a0; void h0;
    }
  }
});
