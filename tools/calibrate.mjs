// Calibrate and backtest the score on real games (runs in GitHub Actions: Probe ESPN, task "calibrate").
//   node tools/calibrate.mjs [seasons=2024,2025]
// The season's game nights alternate between two sets: the even nights calibrate (each category's median and spread
// for rotation players), the odd nights test what was calibrated: are the category scores centred on 50, what do the
// nights' No. 1s look like, and do famous nights come out on top. Writes probe/calibration.json, probe/backtest.json
// and a few game summaries with rare events (ejections, fouling out, missed technical free throws) for the tests.
import fs from 'node:fs';
import * as espn from '../lib/espn.js';
import { seasonInfo } from '../lib/nights.js';
import { scoreGame, rank, reference, CATEGORIES, MIN_MINUTES, explainNight } from '../lib/night.js';

const years = (process.argv[2] || '2024,2025').split(',').map(Number);
const FAMOUS = [
  ['20240126', 'Luka Doncic', '73 points'], ['20240122', 'Joel Embiid', '70 points'], ['20230226', 'Damian Lillard', '71 points'],
  ['20250307', 'Nikola Jokic', '31-21-22'], ['20241113', 'Victor Wembanyama', '50 points'], ['20240131', 'Karl-Anthony Towns', '62 points'],
];
fs.mkdirSync('probe/espn', { recursive: true });
const t0 = Date.now();
const log = s => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`);

const nightGames = async date => {
  const sb = await espn.fetchJson(`${espn.SITE}/scoreboard?dates=${date}&limit=100`).catch(() => null);
  const evs = (sb?.events || []).filter(e => Number(e.season?.type) === 2 && e.status?.type?.completed);
  return (await espn.pool(evs, 8, e => espn.fetchJson(`${espn.SITE}/summary?event=${e.id}`).catch(() => null))).filter(Boolean);
};
const saved = new Set();
const keep = (why, sum) => { if (saved.has(why)) return; saved.add(why); fs.writeFileSync(`probe/espn/summary_${sum.header.id}.json`, JSON.stringify(sum)); log(`saved ${sum.header.id} (${why})`); };

// 1. Calibrate
const calib = [], test = [];
for (const y of years) {
  const info = await seasonInfo(y);
  const reg = info.dates.filter(d => d <= (info.dates.find(x => x >= `${y}0415`) || '99999999'));
  reg.forEach((d, i) => (i % 2 ? test : calib).push(d));
}
const raws = Object.fromEntries(CATEGORIES.map(k => [k, []]));
let games = 0;
for (const [i, date] of calib.entries()) {
  if (i % 2) continue; // every other calibration night is plenty
  for (const sum of await nightGames(date)) {
    games++;
    const { perfs } = scoreGame(sum);
    for (const p of perfs.filter(p => p.line.min >= MIN_MINUTES)) for (const k of CATEGORIES) if (p.categories[k]) raws[k].push(p.categories[k].raw);
    if (perfs.some(p => p.tags.includes('Ejected'))) keep('ejection', sum);
    if (perfs.some(p => p.tags.includes('Fouled out'))) keep('foul out', sum);
    if (perfs.some(p => p.fouls.items.some(f => f.k === 'technical' && /missed/.test(f.label)))) keep('missed technical free throw', sum);
    if (perfs.some(p => p.padding.items.some(f => f.k === 'garbage'))) keep('garbage time', sum);
  }
  if (i % 20 === 0) log(`calibrating: ${date}, ${games} games`);
}
const categories = Object.fromEntries(CATEGORIES.map(k => [k, reference(raws[k])]));
const calibration = { note: `From ${games} regular-season games of ${years.map(y => `${y - 1}-${String(y % 100).padStart(2, '0')}`).join(' and ')} (every other even-numbered night), players with ${MIN_MINUTES}+ minutes`, made: new Date().toISOString().slice(0, 10), games, categories };
fs.writeFileSync('probe/calibration.json', JSON.stringify(calibration, null, 2));
log(`calibration ${JSON.stringify(categories)}`);

// 2. Test on the other nights, with the new calibration
const cal = categories;
const tops = [], scores = Object.fromEntries(CATEGORIES.map(k => [k, []])), deductions = [];
for (const [i, date] of test.entries()) {
  if (i % 3) continue;
  const all = rank((await nightGames(date)).flatMap(s => scoreGame(s, new Map(), cal).perfs));
  if (!all.length) continue;
  for (const p of all.filter(p => p.line.min >= MIN_MINUTES)) for (const k of CATEGORIES) if (p.categories[k]) scores[k].push(p.categories[k].score);
  const top = all[0], scorer = [...all].sort((a, b) => b.line.pts - a.line.pts)[0];
  tops.push({ date, name: top.name, score: top.score, won: top.result.startsWith('W'), topScorer: scorer.id === top.id, pts: top.line.pts, line: `${top.line.pts}-${top.line.reb}-${top.line.ast}`,
    second: all[1]?.score, deducted: top.padding.value + top.fouls.value });
  for (const p of all.slice(0, 10)) for (const d of [...p.padding.items, ...p.fouls.items]) deductions.push({ date, name: p.name, value: d.value, label: d.label });
}
const med = a => reference(a).median;
const pct = (a, f) => Math.round(100 * a.filter(f).length / Math.max(1, a.length));
const q = (a, p) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(p * (v.length - 1))]; };
const nums = tops.map(t => t.score);
console.log('\n== Held-out nights:', tops.length);
console.log('category score medians (should be near 50):', JSON.stringify(Object.fromEntries(CATEGORIES.map(k => [k, med(scores[k])]))));
console.log(`No. 1: won ${pct(tops, t => t.won)}%, was the night's top scorer ${pct(tops, t => t.topScorer)}%, had a deduction ${pct(tops, t => t.deducted < 0)}%`);
console.log(`No. 1 score: 10th pct ${q(nums, 0.1)}, median ${q(nums, 0.5)}, 90th pct ${q(nums, 0.9)}; margin over No. 2: median ${q(tops.map(t => t.score - t.second), 0.5)?.toFixed(1)}`);
console.log(`No. 1 points: median ${q(tops.map(t => t.pts), 0.5)}, fewest ${Math.min(...tops.map(t => t.pts))}`);
for (const t of tops.filter(t => !t.won || !t.topScorer).slice(0, 12)) console.log('  ', t.date, t.name, t.score, t.line, t.won ? 'W' : 'L', t.topScorer ? '' : '(not the top scorer)');
console.log('\n== Biggest deductions in the top tens');
for (const d of deductions.sort((a, b) => a.value - b.value).slice(0, 15)) console.log('  ', d.date, d.name, d.value, d.label);

// 3. Famous nights
console.log('\n== Famous nights');
const famous = [];
for (const [date, who, what] of FAMOUS) {
  const all = rank((await nightGames(date)).flatMap(s => scoreGame(s, new Map(), cal).perfs));
  const at = all.findIndex(p => p.name.normalize('NFD').replace(/[̀-ͯ]/g, '') === who);
  console.log(`${date} ${who} (${what}): ${at < 0 ? 'not found' : `#${at + 1} of ${all.length}`}`);
  for (const p of all.slice(0, 3)) console.log(`   ${p.name} ${p.score} [${CATEGORIES.map(k => `${k[0]}${Math.round(p.categories[k]?.score ?? -1)}`).join(' ')}] ${p.line.pts}-${p.line.reb}-${p.line.ast} ${p.result} ded ${p.padding.value + p.fouls.value}`);
  const ex = explainNight(all);
  if (ex) { console.log('   why:', ex.why.join(' | ')); for (const c of ex.competitors) console.log(`   vs ${c.name} (−${c.gap}): ${c.text}`); }
  famous.push({ date, who, rank: at + 1 });
}
fs.writeFileSync('probe/backtest.json', JSON.stringify({ calibration, tops, famous }, null, 1));
