// ESPN's public soccer API (site.api.espn.com), the same source the earlier app used. Verified shapes (tools/probe-espn-
// soccer.mjs, run against the live API):
//   GET /apis/site/v2/sports/soccer/<code>/scoreboard?dates=YYYYMMDD   (one day per request; ranges are refused)
//     leagues[0]: id, name, abbreviation, slug, logos[0].href
//     events[]: id, date ("2026-11-06T20:00Z"), competitions[0]:
//       status: { clock, displayClock, period, type: { name, state: pre|in|post, completed, description, detail } }
//         names seen: STATUS_SCHEDULED, STATUS_FIRST_HALF/SECOND_HALF, STATUS_HALFTIME, STATUS_FULL_TIME,
//         STATUS_FINAL_AET, STATUS_FINAL_PEN, STATUS_CANCELED (+ POSTPONED, ABANDONED, SUSPENDED, DELAYED by name)
//       competitors[]: id, homeAway, score ("3"), shootoutScore (number, shootouts only), winner,
//                      team: { id, displayName, shortDisplayName, abbreviation, logo, color }
//       details[]: type.text, clock.displayValue ("52'", "90'+2'"), team.id (the team credited, own goals included),
//                  scoringPlay, penaltyKick, ownGoal, shootout, athletesInvolved[].displayName
//   GET /apis/site/v2/sports/soccer/<code>/summary?event=<id>   (fallback for goals: keyEvents[] with type.type
//     goal | penalty---scored | own-goal, clock.displayValue, team.id, scoringPlay, shootout, participants[].athlete)
// Only the fields above are read; nothing else from ESPN's responses is kept.
import { getJson } from './fetcher.js';

const SITE = () => process.env.ESPN_SITE || 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const get = (url, ttl = 0) => getJson(url, { ttl, source: 'ESPN' });
const realLogo = u => (u && !/default-team-logo/.test(u) ? u : null);

export async function scoreboard(code, ymd) {
  const j = await get(`${SITE()}/${code}/scoreboard?dates=${ymd}`, 0); // always fresh: live checks depend on it
  if (!j) return { league: null, events: [] };
  const lg = j.leagues?.[0] || {};
  const league = { id: String(lg.id || ''), name: lg.name || null, abbr: lg.abbreviation || null, logo: realLogo(lg.logos?.[0]?.href) };
  return { league, events: (j.events || []).map(e => normalize(e, code, ymd, league)).filter(Boolean) };
}

export async function summaryGoals(code, id) {
  const j = await get(`${SITE()}/${code}/summary?event=${id}`);
  if (!j) return null;
  const comp = j.header?.competitions?.[0];
  const sides = Object.fromEntries((comp?.competitors || []).map(c => [String(c.id ?? c.team?.id), c.homeAway]));
  const goals = (j.keyEvents || []).filter(k => k.scoringPlay && !k.shootout).map(k => {
    const teamId = String(k.team?.id ?? k.team ?? '');
    const kind = k.type?.type || '';
    return goal({ side: sides[teamId] || null, teamId, player: k.participants?.[0]?.athlete?.displayName || null, clock: k.clock, penalty: kind === 'penalty---scored', ownGoal: kind === 'own-goal' });
  });
  return { goals, status: comp?.status?.type?.name || null };
}

// The app's status for an ESPN status.
export function appStatus(t = {}) {
  const name = String(t.name || '').toUpperCase();
  if (/POSTPONED/.test(name)) return 'postponed';
  if (/CANCEL/.test(name)) return 'canceled';
  if (/ABANDON/.test(name)) return 'abandoned';
  if (/SUSPEND/.test(name)) return 'suspended';
  if (/HALFTIME/.test(name)) return 'halftime';
  if (t.state === 'post' && t.completed) return 'ft';
  if (t.state === 'in') return 'live';
  if (t.state === 'post') return 'ended'; // over but not confirmed complete: wait for ESPN
  return 'scheduled';
}
export const FINAL_NOTE = { STATUS_FINAL_AET: 'After extra time', STATUS_FINAL_PEN: null };

// "90'+2'" → "90+2'"; "45'" → "45'".
export const minuteLabel = s => { const m = String(s || '').match(/(\d+)'?\s*(?:\+\s*(\d+))?/); return m ? `${m[1]}${m[2] ? `+${m[2]}` : ''}'` : null; };
const minuteSort = clock => { const m = String(clock?.displayValue || '').match(/(\d+)'?\s*(?:\+\s*(\d+))?/); return m ? +m[1] * 100 + (+m[2] || 0) : +clock?.value || 0; };
const goal = ({ side, teamId, player, clock, penalty, ownGoal }) => ({ side, teamId, player: player || null, minute: minuteLabel(clock?.displayValue), sort: minuteSort(clock), penalty: !!penalty, ownGoal: !!ownGoal });

function team(c) {
  const t = c.team || {};
  return { id: String(t.id || c.id), name: t.displayName || t.name || '', short: t.shortDisplayName || t.displayName || '', abbr: t.abbreviation || '', logo: realLogo(t.logo || t.logos?.[0]?.href), color: t.color || null };
}

export function normalize(e, code, ymd, league) {
  const c = e.competitions?.[0];
  if (!c) return null;
  const st = c.status?.type || e.status?.type || {};
  const home = c.competitors?.find(x => x.homeAway === 'home'), away = c.competitors?.find(x => x.homeAway === 'away');
  if (!home || !away) return null;
  const side = Object.fromEntries([[String(home.team?.id ?? home.id), 'home'], [String(away.team?.id ?? away.id), 'away']]);
  const num = v => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);
  const details = c.details || [];
  const goals = details.filter(x => x.scoringPlay && !x.shootout).map(x => {
    const teamId = String(x.team?.id ?? '');
    return goal({ side: side[teamId] || null, teamId, player: x.athletesInvolved?.[0]?.displayName, clock: x.clock, penalty: x.penaltyKick, ownGoal: x.ownGoal });
  }).sort((a, b) => a.sort - b.sort);
  const so = home.shootoutScore != null || away.shootoutScore != null || st.name === 'STATUS_FINAL_PEN' ? { home: num(home.shootoutScore), away: num(away.shootoutScore) } : null;
  return {
    _id: String(e.id), comp: code, compName: league?.name || null, compLogo: league?.logo || null, espnDate: ymd,
    kickoff: new Date(e.date || c.date), status: appStatus(st), espnStatus: { name: st.name || null, state: st.state || null, completed: !!st.completed, detail: st.shortDetail || st.detail || null, clock: c.status?.displayClock || null },
    home: team(home), away: team(away), score: { home: num(home.score), away: num(away.score) }, shootout: so, goals,
    winner: home.winner ? 'home' : away.winner ? 'away' : null,
  };
}

// Are the goals complete and consistent with the score? Returns the problems found (empty: good to publish).
export function goalProblems(m) {
  const p = [];
  if (m.score?.home == null || m.score?.away == null) p.push('Final score missing');
  const count = { home: 0, away: 0 };
  for (const g of m.goals || []) {
    if (!g.side) p.push(`A goal is credited to an unknown team (${g.teamId || 'none'})`);
    else count[g.side]++;
    if (!g.player) p.push(`A ${g.side || ''} goal has no scorer`.replace('  ', ' '));
    if (!g.minute) p.push(`${g.player || 'A goal'} has no minute`);
  }
  if (m.espnStatus?.name === 'STATUS_FINAL_PEN' && (m.shootout?.home == null || m.shootout?.away == null)) p.push('Penalty shootout result missing');
  for (const s of ['home', 'away']) if (m.score?.[s] != null && count[s] !== m.score[s]) p.push(`${m[s]?.name || s}: ${m.score[s]} goal${m.score[s] === 1 ? '' : 's'} in the score, ${count[s]} with a scorer`);
  return [...new Set(p)];
}
