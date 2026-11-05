// The data-provider layer. The app talks to `data` (the primary provider) and `verifier` (the independent second
// source); swapping a provider means implementing the same functions (see lib/providers/espn.js) and registering it here.
//
// Research (tools/probe-atn.mjs, run from GitHub Actions, November 2026):
//   ESPN public API        — no key. Scoreboards with live clock and possession, game summaries with full box scores,
//                            team statistics and play-by-play, standings, teams, rosters, player bios (birth date and place,
//                            draft, debut), career statistics, game logs, news, headshots and logos. Box scores reach back
//                            to 1993-94; play-by-play to the mid-2000s. Unofficial and undocumented: no published rate
//                            limit or license; responses cached by ESPN ~8 s. Used as the primary source.
//   NBA.com live-data CDN  — no key. Today's scoreboard, live box scores and play-by-play, the season schedule. Used to
//                            cross-check final scores and players' points, rebounds and assists before verification.
//   stats.nba.com          — times out from cloud hosts (blocked); not usable from a server.
//   Basketball Reference   — reachable, but its terms prohibit automated collection for use in other products; linked
//                            for human verification only, never scraped.
//   SportsDataIO, Sportradar — licensed, paid APIs with keys and rate limits (trial keys available). Not integrated; the
//                            interface above is where one would plug in (SPORTSDATAIO_KEY / SPORTRADAR_KEY).
//   balldontlie            — requires an API key (401 without one).
import * as espn from './espn.js';
import * as nbacdn from './nbacdn.js';
import { hostStatus } from '../fetcher.js';

export const data = espn;
export const verifier = nbacdn;

export const SOURCES = [
  { id: 'espn', name: 'ESPN', role: 'Primary: live scores, box scores, play-by-play, standings, rosters, bios, career statistics, game logs, news, images', key: false,
    hosts: ['site.api.espn.com', 'site.web.api.espn.com', 'sports.core.api.espn.com'], coverage: 'Box scores from 1993-94; play-by-play from the mid-2000s', limits: 'Unofficial; no published rate limit. The app caches 8–10 s for live data and polls every 15–30 s.' },
  { id: 'nbacdn', name: 'NBA.com live data', role: 'Verification: final scores and player points, rebounds, assists', key: false,
    hosts: ['cdn.nba.com'], coverage: 'Current season', limits: 'Unofficial CDN; cached 20 s by the app.' },
  { id: 'statsnba', name: 'stats.nba.com', role: 'Not used', key: false, hosts: ['stats.nba.com'], coverage: '—', limits: 'Does not answer requests from cloud servers.', unavailable: true },
  { id: 'bbref', name: 'Basketball Reference', role: 'Linked for human verification only', key: false, hosts: ['www.basketball-reference.com'], coverage: 'All-time', limits: 'Terms prohibit automated collection for other products.', unavailable: true },
  { id: 'sportsdataio', name: 'SportsDataIO', role: 'Not integrated (paid key required)', key: true, env: 'SPORTSDATAIO_KEY', hosts: [], coverage: 'Varies by plan', limits: 'Paid plans; rate limits per plan.', unavailable: true },
  { id: 'sportradar', name: 'Sportradar', role: 'Not integrated (paid key required)', key: true, env: 'SPORTRADAR_KEY', hosts: [], coverage: 'Official league data partner', limits: 'Paid plans; trial keys limited to 1 request/second.', unavailable: true },
];

export const sourceStatus = () => {
  const h = hostStatus();
  return SOURCES.map(s => ({ ...s, hosts: s.hosts.map(x => ({ host: x, ...(h[x] || {}) })) }));
};
