// Save ESPN's scoreboard and the first two game summaries for a date into probe/ (test fixtures). Diagnostic only.
//   node tools/probe-night.mjs 20250115
import fs from 'node:fs';
import * as espn from '../lib/espn.js';

const date = process.argv[2] || '20250115';
fs.mkdirSync('probe', { recursive: true });
const sb = await espn.fetchJson(`${espn.SITE}/scoreboard?dates=${date}&limit=100`);
fs.writeFileSync(`probe/scoreboard_${date}.json`, JSON.stringify(sb));
console.log('scoreboard keys', Object.keys(sb), 'events', sb.events?.length, 'calendar', JSON.stringify(sb.leagues?.[0]?.calendar)?.slice(0, 300), 'season', JSON.stringify(sb.leagues?.[0]?.season));
const ev = sb.events?.[0];
console.log('event', JSON.stringify({ id: ev?.id, date: ev?.date, season: ev?.season, status: ev?.status?.type, comp: ev?.competitions?.[0]?.competitors?.map(c => ({ id: c.id, team: c.team?.abbreviation, score: c.score, winner: c.winner, home: c.homeAway, records: c.records })) }).slice(0, 1500));
for (const e of (sb.events || []).slice(0, 2)) {
  const sum = await espn.fetchJson(`${espn.SITE}/summary?event=${e.id}`);
  fs.writeFileSync(`probe/summary_${e.id}.json`, JSON.stringify(sum));
  const b = sum.boxscore?.players?.[0];
  console.log('summary keys', Object.keys(sum), 'box team', b?.team?.abbreviation, 'labels', JSON.stringify(b?.statistics?.[0]?.labels), 'names', JSON.stringify(b?.statistics?.[0]?.names), 'first', JSON.stringify(b?.statistics?.[0]?.athletes?.[0]).slice(0, 600));
}
// A season's calendar and a playoff date.
const cal = await espn.fetchJson(`${espn.SITE}/scoreboard?dates=20250601`);
console.log('playoff', JSON.stringify(cal.events?.map(e => ({ id: e.id, season: e.season, type: e.competitions?.[0]?.type, notes: e.competitions?.[0]?.notes, series: e.competitions?.[0]?.series }))).slice(0, 1200));
console.log('calendar 2025 len', cal.leagues?.[0]?.calendar?.length, JSON.stringify(cal.leagues?.[0]?.calendarStartDate), JSON.stringify(cal.leagues?.[0]?.calendarEndDate), JSON.stringify(cal.leagues?.[0]?.calendar?.slice(-3)));
const now = await espn.fetchJson(`${espn.SITE}/scoreboard`);
console.log('today', JSON.stringify(now.day), now.events?.length, JSON.stringify(now.leagues?.[0]?.season));
