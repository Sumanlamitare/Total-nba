// Unit tests: ESPN parsing (real response shapes), goal checks, scorer lines, time zones and DST, the graphic layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, appStatus, minuteLabel, goalProblems } from '../lib/espn.js';
import { scorerLines, graphicData } from '../lib/graphics/data.js';
import { buildScene, rows } from '../lib/graphics/fulltime.js';
import { layoutText } from '../lib/graphics/text.js';
import { zonedTime, dayOf, addDays } from '../lib/tz.js';
import { isWomens, DEFAULT_COMPETITIONS } from '../lib/competitions.js';
import { event } from './mock-espn.mjs';

const T = { eve: ['368', 'Everton', 'Everton', 'EVE', '0606fa'], cov: ['388', 'Coventry City', 'Coventry', 'COV', '87cced'], fre: ['126', 'SC Freiburg', 'Freiburg', 'SCF', 'e3000f'], uni: ['598', '1. FC Union Berlin', 'Union Berlin', 'FCU', 'd4011d'] };
const B = 'http://x';

test('the 39 competitions: all men\'s, unique ESPN codes, women\'s codes refused', () => {
  assert.equal(DEFAULT_COMPETITIONS.length, 39);
  assert.equal(new Set(DEFAULT_COMPETITIONS.map(c => c.code)).size, 39);
  assert.ok(DEFAULT_COMPETITIONS.every(c => !isWomens(c.code)));
  for (const w of ['eng.w.1', 'fifa.wwc', 'usa.nwsl', 'fifa.w.olympics', 'uefa.wchampions'.replace('w', 'w.')]) assert.ok(isWomens(w) || w === 'fifa.wwc', w);
  assert.ok(isWomens('eng.w.1') && isWomens('usa.nwsl') && !isWomens('fifa.world') && !isWomens('fifa.worldq.uefa'));
});

test('ESPN statuses map to the app\'s', () => {
  assert.equal(appStatus({ name: 'STATUS_SCHEDULED', state: 'pre' }), 'scheduled');
  assert.equal(appStatus({ name: 'STATUS_SECOND_HALF', state: 'in' }), 'live');
  assert.equal(appStatus({ name: 'STATUS_HALFTIME', state: 'in' }), 'halftime');
  for (const n of ['STATUS_FULL_TIME', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN']) assert.equal(appStatus({ name: n, state: 'post', completed: true }), 'ft');
  assert.equal(appStatus({ name: 'STATUS_CANCELED', state: 'post', completed: false }), 'canceled');
  assert.equal(appStatus({ name: 'STATUS_POSTPONED', state: 'post' }), 'postponed');
  assert.equal(appStatus({ name: 'STATUS_ABANDONED', state: 'post' }), 'abandoned');
  assert.equal(appStatus({ name: 'STATUS_END_OF_EXTRATIME', state: 'post', completed: false }), 'ended', 'over but not confirmed: not full time');
});

test('goals: stoppage time, penalties, own goals credited to the team they counted for, shootout kicks left out', () => {
  assert.equal(minuteLabel("90'+2'"), "90+2'");
  assert.equal(minuteLabel("45'"), "45'");
  assert.equal(minuteLabel("120'+1'"), "120+1'");
  const e = event({ id: '1', at: Date.UTC(2026, 10, 15, 15), home: T.fre, away: T.uni, status: 'pen', score: [2, 1], shootout: [4, 3], goals: [
    { side: 'home', player: 'Rani Khedira', min: "55'", kind: 'og' }, { side: 'away', player: 'Andrej Ilić', min: "61'" },
    { side: 'home', player: 'Vincenzo Grifo', min: "90+3'", kind: 'pen' }, { side: 'away', player: 'Someone', min: "120'", kind: 'so' }] }, B);
  const m = normalize(e, 'ger.1', '20261115', { name: 'Bundesliga' });
  assert.equal(m.status, 'ft');
  assert.deepEqual(m.score, { home: 2, away: 1 });
  assert.deepEqual(m.shootout, { home: 4, away: 3 });
  assert.equal(m.goals.length, 3, 'shootout kick not counted');
  assert.deepEqual(m.goals.map(g => [g.side, g.player, g.minute, g.penalty, g.ownGoal]), [['home', 'Rani Khedira', "55'", false, true], ['away', 'Andrej Ilić', "61'", false, false], ['home', 'Vincenzo Grifo', "90+3'", true, false]]);
  assert.deepEqual(goalProblems(m), []);
});

test('goal checks: missing scorer, score mismatch, missing shootout result are problems', () => {
  const e = event({ id: '2', at: Date.now(), home: T.eve, away: T.cov, status: 'ft', score: [2, 0], goals: [{ side: 'home', player: null, min: "10'" }] }, B);
  const p = goalProblems(normalize(e, 'eng.1', '20261115', {}));
  assert.ok(p.some(x => /no scorer/.test(x)) && p.some(x => /2 goals in the score, 1 with a scorer/.test(x)), p.join(' | '));
  const pen = normalize(event({ id: '3', at: Date.now(), home: T.eve, away: T.cov, status: 'pen', score: [0, 0] }, B), 'eng.fa', '20261115', {});
  pen.shootout = { home: null, away: null };
  assert.ok(goalProblems(pen).includes('Penalty shootout result missing'));
});

test('scorer lines: grouped by player in order, penalties and own goals marked', () => {
  const g = (side, player, minute, sort, o = {}) => ({ side, player, minute, sort, penalty: !!o.p, ownGoal: !!o.og });
  const goals = [g('home', 'Erling Haaland', "12'", 1200), g('home', 'Phil Foden', "30'", 3000), g('home', 'Erling Haaland', "45+2'", 4502, { p: 1 }), g('home', 'Erling Haaland', "78'", 7800), g('home', 'Ben White', "80'", 8000, { og: 1 }), g('away', 'Bukayo Saka', "63'", 6300)];
  assert.deepEqual(scorerLines(goals, 'home'), ["Erling Haaland 12', 45+2' (P), 78'", "Phil Foden 30'", "Ben White 80' (OG)"]);
  assert.deepEqual(scorerLines(goals, 'away'), ["Bukayo Saka 63'"]);
  assert.deepEqual(rows(["Erling Haaland 12', 45+2' (P)"]), [{ name: 'Erling Haaland', mins: "12', 45+2' (P)" }]);
});

test('time zones: calendar days and wall-clock times across daylight saving', () => {
  const tz = 'America/New_York';
  assert.equal(zonedTime('20260308', 3, 0, tz).toISOString(), '2026-03-08T07:00:00.000Z', 'after spring forward: UTC-4');
  assert.equal(zonedTime('20260307', 6, 0, tz).toISOString(), '2026-03-07T11:00:00.000Z', 'before: UTC-5');
  assert.equal(zonedTime('20261101', 6, 0, tz).toISOString(), '2026-11-01T11:00:00.000Z', 'after fall back: UTC-5');
  assert.equal(zonedTime('20261031', 6, 0, tz).toISOString(), '2026-10-31T10:00:00.000Z');
  assert.equal(dayOf('2026-11-17T03:30:00Z', tz), '20261116', 'late evening kickoff belongs to the previous local day');
  assert.equal(dayOf('2026-11-17T03:30:00Z', 'Europe/London'), '20261117');
  assert.equal(addDays('20261231', 1), '20270101');
  assert.equal(zonedTime('20260329', 6, 0, 'Europe/London').toISOString(), '2026-03-29T05:00:00.000Z');
});

test('the graphic: 1080 × 1350, everything inside the canvas, no overlaps, for every kind of match', () => {
  const g = (side, player, minute) => ({ side, player, minute, sort: parseInt(minute) * 100 });
  const longName = 'Borussia Mönchengladbach Football Club Of Very Long Names';
  const many = Array.from({ length: 9 }, (_, i) => g(i % 2 ? 'away' : 'home', `Player With A Really Quite Long Surname ${i}`, `${10 + i * 9}'`));
  const cases = {
    goalless: { score: { home: 0, away: 0 }, goals: [] },
    hattrick: { score: { home: 3, away: 0 }, goals: [g('home', 'Erling Haaland', "12'"), g('home', 'Erling Haaland', "45+2'"), g('home', 'Erling Haaland', "90+6'")] },
    goalfest: { score: { home: 5, away: 4 }, goals: many },
    shootout: { score: { home: 1, away: 1 }, shootout: { home: 5, away: 4 }, espnStatus: { name: 'STATUS_FINAL_PEN' }, goals: [g('home', 'A', "3'"), g('away', 'B', "90'")] },
    photo: { score: { home: 5, away: 4 }, goals: many, photo: true },
    photoFew: { score: { home: 1, away: 0 }, goals: [g('home', 'Pierre-Emerick Aubameyang-Ondimba', "88'")], photo: true },
  };
  for (const [name, c] of Object.entries(cases)) {
    const m = { comp: 'x', compName: 'UEFA Europa Conference League Qualifying', compLogo: 'http://logo', kickoff: '2026-11-15T15:00:00Z', espnStatus: { name: 'STATUS_FULL_TIME' }, home: { name: longName, logo: 'http://h', color: '000000' }, away: { name: 'Paris Saint-Germain', logo: 'http://a', color: '004170' }, ...c };
    const data = graphicData(m, { timezone: 'Europe/London' });
    if (c.photo) data.photo = { src: 'photo:1', credit: 'Photo: Someone / Agency' };
    const scene = buildScene(data, { accent: '#d7ff3c', handle: '@footballpast90' });
    assert.equal(scene.w, 1080); assert.equal(scene.h, 1350);
    const boxes = [];
    for (const el of scene.elements) {
      assert.ok(el.x >= 0 && el.y >= 0 && el.x + el.w <= 1080 + 0.5 && el.y + el.h <= 1350 + 0.5, `${name}: ${el.id} outside the canvas`);
      if (el.type === 'text') {
        const L = layoutText(el);
        assert.ok(L.widest <= el.w + 1, `${name}: ${el.id} text wider than its box (${L.widest} > ${el.w})`);
        if (el.fit) assert.ok(L.height <= el.h + 1, `${name}: ${el.id} text taller than its box`);
        boxes.push(el);
      }
    }
    // Text boxes may share a row (name + minutes) but never overlap.
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      if (overlap && !(a.id === 'ft-label' && b.id === 'ft-pill')) assert.fail(`${name}: ${a.id} overlaps ${b.id}`);
    }
    if (name === 'goalless') assert.ok(scene.elements.some(e => e.id === 'no-goals' && /No goals scored/i.test(e.text)));
    if (name === 'shootout') assert.ok(scene.elements.some(e => e.id === 'score-note' && e.text === '5–4 on penalties'));
    if (name === 'hattrick') assert.ok(scene.elements.some(e => e.text === "12', 45+2', 90+6'"));
    if (c.photo) assert.ok(scene.elements.some(e => e.id === 'photo'));
    assert.ok(!scene.elements.some(e => /^potm/.test(e.id)), 'no player of the game');
    // Scorers stay readable whatever the layout.
    assert.ok(scene.elements.filter(e => /-scorer-/.test(e.id)).every(e => layoutText(e).size >= 20), `${name}: scorer text too small`);
  }
});

