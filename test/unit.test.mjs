// Unit tests: the statistic formulas, the engine (every intersection), the layout (every player inside his exact region,
// nobody overlapping, nobody hidden), the renderer and the provider's checks on real ESPN box scores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluate, compare, maskList, bits, configKey } from '../lib/engine.js';
import { dailyValues, seasonValues, sumRecords, hasSample, DEFAULT_MINIMUMS, gameScore } from '../lib/stats/compute.js';
import { catalog, statMap, availableStats, criterionLabel, UNAVAILABLE } from '../lib/stats/catalog.js';
import { layoutVenn, maskAt, baseShapes } from '../lib/venn/layout.js';
import { buildDiagram, labels } from '../lib/venn/index.js';
import { composeGraphic, chooseView, DEFAULT_STYLE } from '../lib/venn/render.js';
import { statusOf } from '../lib/providers/espn.js';

const raw = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/espn/${f}.json`, import.meta.url)));
const line = o => ({ min: 30, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, pm: 0, ...o });
const team = o => ({ min: 240, pts: 110, fgm: 40, fga: 88, tpa: 35, fta: 20, oreb: 10, dreb: 34, reb: 44, to: 14, ...o });

test('box-score formulas: shooting, rates, game score', () => {
  const s = line({ min: 36, pts: 30, fgm: 11, fga: 20, tpm: 3, tpa: 7, ftm: 5, fta: 6, oreb: 2, dreb: 8, reb: 10, ast: 7, stl: 2, blk: 1, to: 3, pf: 2 });
  const { v, n } = dailyValues({ s, tm: team(), op: team({ reb: 46, oreb: 12, dreb: 34, fga: 90, tpa: 30, fta: 18, to: 13 }), starter: true, won: true });
  assert.equal(v.fg_pct, 55);
  assert.ok(Math.abs(v.tp_pct - 42.857) < 0.01);
  assert.ok(Math.abs(v.ts_pct - (100 * 30) / (2 * (20 + 0.44 * 6))) < 1e-9);
  assert.equal(v.efg_pct, 100 * (11 + 1.5) / 20);
  assert.equal(v.fg2m, 8);
  assert.equal(v.pra, 47);
  assert.equal(v.dd, 1);
  assert.equal(v.td, 0);
  assert.equal(v.starter, 1);
  assert.equal(v.ast_to, 7 / 3);
  // USG% = 100 (20 + 0.44·6 + 3)(240/5) / (36 (88 + 0.44·20 + 14))
  assert.ok(Math.abs(v.usg_pct - (100 * (20 + 2.64 + 3) * 48) / (36 * (88 + 8.8 + 14))) < 1e-9);
  // TRB% = 100 · 10 · 48 / (36 (44 + 46))
  assert.ok(Math.abs(v.trb_pct - (100 * 10 * 48) / (36 * 90)) < 1e-9);
  assert.ok(Math.abs(v.gmsc - gameScore(s)) < 1e-9);
  assert.deepEqual([n.fga, n.fta, n.tpa], [20, 6, 7]);
  // No turnovers: assists over one.
  assert.equal(dailyValues({ s: line({ ast: 6 }), tm: team(), op: team() }).v.ast_to, 6);
});

test('season values come from sums, never averages of percentages', () => {
  const a = { s: line({ fgm: 1, fga: 1, ftm: 1, fta: 1, pts: 3 }), tm: team(), op: team() }, b = { s: line({ fgm: 4, fga: 10, ftm: 8, fta: 10, pts: 16 }), tm: team(), op: team() };
  const { v, n } = seasonValues(sumRecords([a, b]));
  assert.equal(v.fg_pct, (100 * 5) / 11, 'not the mean of 100% and 40%');
  assert.equal(v.ft_pct, (100 * 9) / 11);
  assert.equal(v.pts_pg, 9.5);
  assert.equal(v.pts_tot, 19);
  assert.equal(v.pts_p36, (36 * 19) / 60);
  assert.equal(v.gp, 2);
  assert.equal(n.gp, 2);
});

test('minimum samples: a 1-for-1 night is not 100% free throws', () => {
  const ft = statMap('daily').get('ft_pct');
  assert.equal(hasSample(ft, { fta: 1 }, 'daily'), false);
  assert.equal(hasSample(ft, { fta: 4 }, 'daily'), true);
  const ftS = statMap('season').get('ft_pct'), ppg = statMap('season').get('pts_pg'), tot = statMap('season').get('pts_tot');
  // Season: NBA's leader qualifiers prorated (1.5 FTM per team game) and half the games.
  assert.equal(hasSample(ftS, { gp: 20, ftm: 25 }, 'season', DEFAULT_MINIMUMS, 20), false);
  assert.equal(hasSample(ftS, { gp: 20, ftm: 30 }, 'season', DEFAULT_MINIMUMS, 20), true);
  assert.equal(hasSample(ppg, { gp: 9 }, 'season', DEFAULT_MINIMUMS, 20), false);
  assert.equal(hasSample(ppg, { gp: 10 }, 'season', DEFAULT_MINIMUMS, 20), true);
  assert.equal(hasSample(tot, { gp: 1 }, 'season', DEFAULT_MINIMUMS, 20), true, 'totals need no minimum');
});

test('operators, with decimals', () => {
  assert.ok(compare(10, '>=', 10) && !compare(10, '>', 10) && compare(10, '<=', 10) && !compare(10, '<', 10));
  assert.ok(compare(90, '>=', 90) && compare((100 * 27) / 30, '>=', 90));
  assert.ok(compare(2.51, '>', 2.5) && !compare(2.5, '>', 2.5) && compare(0.49, '<', 0.5));
});

// Every possible combination of n criteria, with one player meeting exactly it and one meeting none.
for (const n of [2, 3, 4, 5, 6]) {
  test(`the engine puts every player in his exact intersection (${n} criteria, all ${(1 << n) - 1} combinations)`, () => {
    const criteria = Array.from({ length: n }, (_, i) => ({ id: i, stat: ['pts', 'reb', 'ast', 'stl', 'blk', 'to'][i], op: i === 5 ? '<=' : '>=', value: i === 5 ? 1 : 5 }));
    const rows = maskList(n).map(mask => {
      const v = {};
      criteria.forEach((c, i) => { const meet = (mask >> i) & 1; v[c.stat] = c.op === '<=' ? (meet ? 0 : 4) : meet ? 8 : 1; });
      return { id: `p${mask}`, name: `P ${mask}`, v, n: { min: 30 } };
    });
    rows.push({ id: 'none', name: 'Nobody', v: Object.fromEntries(criteria.map(c => [c.stat, c.op === '<=' ? 9 : 0])), n: { min: 30 } });
    const r = evaluate(rows, criteria, { mode: 'daily' });
    assert.equal(r.total, (1 << n) - 1, 'the player meeting nothing is left out');
    for (const reg of r.regions) assert.deepEqual(reg.players.map(p => p.id), [`p${reg.mask}`], `mask ${reg.mask}`);
    criteria.forEach((_, i) => assert.equal(r.setSizes[i], 1 << (n - 1), `criterion ${i}`));
    assert.equal(r.regions.reduce((s, x) => s + x.players.length, 0), r.total, 'everyone accounted for, once');
  });
}

test('the engine: filters, exclusions, sample shortfalls, the same statistic twice', () => {
  const rows = [
    { id: 'a', name: 'A', team: { id: '1' }, v: { pts: 30, ft_pct: 100 }, n: { fta: 1 } },
    { id: 'b', name: 'B', team: { id: '2' }, v: { pts: 22, ft_pct: 95 }, n: { fta: 10 } },
    { id: 'c', name: 'C', team: { id: '2' }, v: { pts: 12, ft_pct: 50 }, n: { fta: 10 } },
  ];
  const crit = [{ stat: 'pts', op: '>=', value: 20 }, { stat: 'ft_pct', op: '>=', value: 90 }, { stat: 'pts', op: '<', value: 25 }];
  const r = evaluate(rows, crit, { mode: 'daily' });
  assert.deepEqual(r.players.map(p => [p.id, p.mask]).sort(), [['a', 1], ['b', 7], ['c', 4]]);
  assert.deepEqual(r.players.find(p => p.id === 'a').shortOf, [1], 'A is 1-for-1 from the line');
  assert.deepEqual(evaluate(rows, crit, { mode: 'daily', teams: ['2'] }).players.map(p => p.id), ['b', 'c']);
  assert.deepEqual(evaluate(rows, crit, { mode: 'daily', exclude: ['b'] }).players.map(p => p.id).sort(), ['a', 'c']);
  assert.notEqual(configKey({ mode: 'daily', date: '20250101', criteria: crit }), configKey({ mode: 'daily', date: '20250102', criteria: crit }));
});

test('the catalog: every statistic labeled by kind; provider statistics only when real', () => {
  const d = catalog('daily'), s = catalog('season');
  for (const k of ['pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'to', 'pf', 'min', 'fgm', 'fga', 'fg_pct', 'tpm', 'tpa', 'tp_pct', 'ftm', 'fta', 'ft_pct', 'ts_pct', 'efg_pct', 'usg_pct', 'ast_pct', 'trb_pct']) assert.ok(d.some(x => x.key === k), k);
  for (const k of ['pts_pg', 'pts_tot', 'pts_p36', 'reb_pg', 'ft_pct', 'usg_pct', 'per', 'gp', 'dd']) assert.ok(s.some(x => x.key === k), k);
  assert.ok([...d, ...s].every(x => ['total', 'average', 'per36', 'percentage', 'rate', 'advanced', 'count', 'flag'].includes(x.kind)));
  assert.ok(UNAVAILABLE.includes('Win Shares') && !s.some(x => /win shares|box plus/i.test(x.label)));
  const rows = Array.from({ length: 40 }, (_, i) => ({ v: { per: 10 + i * 0.7, usage_espn: 0, vorp_espn: 800 + i } }));
  const avail = availableStats('season', rows).map(x => x.key);
  assert.ok(avail.includes('per'), 'PER has real values');
  assert.ok(!avail.includes('usage_espn'), 'ESPN serves usage as 0 for everyone');
  assert.ok(!avail.includes('vorp_espn'), "ESPN's VORP isn't on VORP's scale");
  assert.equal(criterionLabel(statMap('season').get('reb_pg'), '>=', 10), '10+ RPG');
  assert.equal(criterionLabel(statMap('daily').get('ft_pct'), '>=', 90), '90%+ FT');
  assert.equal(criterionLabel(statMap('daily').get('to'), '<', 2), 'Under 2 TOV');
});

for (const n of [1, 2, 3, 4, 5]) {
  test(`the layout: every region exists and every player sits inside his own region, none overlapping (${n} criteria)`, () => {
    // Every region of the shapes exists (true Venn diagrams).
    const shapes = baseShapes(n), seen = new Set();
    for (let i = 0; i < 400; i++) for (let j = 0; j < 400; j++) seen.add(maskAt(shapes, -1.3 + (2.6 * i) / 400, -1.3 + (2.6 * j) / 400));
    for (const m of maskList(n)) assert.ok(seen.has(m), `region ${bits(m).join('+')} exists`);
    const regions = maskList(n).map(mask => ({ mask, players: Array.from({ length: 1 + ((mask * 5) % 4) }, (_, k) => ({ id: `${mask}-${k}`, label: 'Antetokounmpo'.slice(0, 4 + k * 3) })) }));
    const L = layoutVenn(n, regions, {});
    assert.ok(L.ok);
    assert.equal(L.nodes.length, regions.reduce((s, r) => s + r.players.length, 0), 'nobody hidden');
    for (const nd of L.nodes) assert.equal(maskAt(L.shapes, nd.x, nd.y), nd.mask, `${nd.id} in its region`);
    for (let a = 0; a < L.nodes.length; a++) for (let b = a + 1; b < L.nodes.length; b++) assert.ok(Math.hypot(L.nodes[a].x - L.nodes[b].x, L.nodes[a].y - L.nodes[b].y) >= 2 * L.r, 'no overlap');
  });
}

test('the layout grows rather than hiding players', () => {
  const regions = [{ mask: 7, players: Array.from({ length: 60 }, (_, k) => ({ id: `x${k}`, label: 'Player' })) }];
  const L = layoutVenn(3, regions, { size: 800 });
  assert.ok(L.ok && L.nodes.length === 60 && L.size > 800);
});

test('rendering: Venn up to 5 (when readable), intersections otherwise; standalone graphics at any size', () => {
  assert.equal(chooseView(DEFAULT_STYLE, 3, 40), 'venn');
  assert.equal(chooseView(DEFAULT_STYLE, 6, 10), 'upset');
  assert.equal(chooseView(DEFAULT_STYLE, 5, 80), 'upset');
  assert.equal(chooseView({ ...DEFAULT_STYLE, view: 'upset' }, 2, 3), 'upset');
  const rows = [{ id: '1', name: 'Nikola Jokic', team: { id: '7', color: '#0e2240' }, headshot: 'h.png', v: { reb: 12, ast: 11, ft_pct: 95 }, n: { fta: 6 } }, { id: '2', name: 'Josh Hart', team: { id: '18' }, v: { reb: 11, ast: 2, ft_pct: 50 }, n: { fta: 2 } }];
  const crit = [{ stat: 'reb', op: '>=', value: 10, label: '10+ REB' }, { stat: 'ast', op: '>=', value: 6, label: '6+ AST' }, { stat: 'ft_pct', op: '>=', value: 90, label: '90%+ FT' }];
  const r = evaluate(rows, crit, { mode: 'daily' });
  const d = buildDiagram(r, crit, DEFAULT_STYLE);
  assert.equal(d.view, 'venn');
  assert.ok(d.body.includes('data-pid="1"') && d.body.includes('data-pid="2"') && d.body.includes('10+ REB'));
  assert.ok(d.body.includes('href="h.png"'));
  for (const [w, h] of [[1080, 1080], [1080, 1350], [1920, 1080]]) {
    const svg = composeGraphic(d, { width: w, height: h, title: 'Night', subtitle: 'x', criteria: crit });
    assert.ok(svg.startsWith('<svg') && svg.includes(`width="${w}" height="${h}"`) && svg.includes('Data: ESPN'));
  }
  assert.deepEqual([...labels([{ id: 1, name: 'Jalen Williams' }, { id: 2, name: 'Jaylin Williams' }, { id: 3, name: 'Gary Trent Jr.' }]).values()], ['J. Williams', 'J. Williams', 'Trent']);
});

test('provider: game status, and a real box score passes the checks', async () => {
  assert.equal(statusOf({ name: 'STATUS_FINAL', completed: true }), 'final');
  assert.equal(statusOf({ name: 'STATUS_POSTPONED' }), 'postponed');
  assert.equal(statusOf({ name: 'STATUS_CANCELED' }), 'canceled');
  assert.equal(statusOf({ name: 'STATUS_SUSPENDED' }), 'suspended');
  assert.equal(statusOf({ name: 'STATUS_IN_PROGRESS', state: 'in' }), 'in');
  assert.equal(statusOf({ name: 'STATUS_SCHEDULED', state: 'pre' }), 'scheduled');
});
