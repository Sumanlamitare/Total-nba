# Around the NBA

A live NBA event feed. It watches every game at once, recognizes the moments worth talking about — comebacks, game
winners (offensive and defensive), records, takeovers, role players nobody saw coming, streaks — verifies them, and
reports them in one continuously updating feed.

Live: https://total-nba-ja9d.vercel.app

## What's in the app

- **Live Feed** (home): event cards arrive on their own (Server-Sent Events). Each card has its category and importance,
  a headline and short story, the player or team, the game situation, the statistics that matter, and expandable
  details: sources with retrieval times, verification checks, how the story developed. Filter by kind, importance,
  game, team, player, or your favorites. Fans can react and comment (free account).
- **Top bar**: live game indicators, search (players, teams, stories, records), alerts for critical moments and your
  favorites, profile.
- **Right rail**: tonight's top performances, live Game Intelligence alerts, trending storylines.
- **Game Intelligence**: live games with their situation (clutch time, one-possession game, final possessions), and
  the night's stories by kind: close games, comeback watch, scoring runs, solo runs, clutch situations, blowouts,
  collapses, historic performances.
- **Records & Milestones**: recent records and milestones, the milestone watch, and a searchable record database.
- **Top Performances**: an editorial ranking (efficiency, defense, clutch, winning, role), not a points leaderboard.
- **Teams, Players, Games**: storylines first — the feed entries, the streak, recent results, the season so far.
- **Graphics Studio** (editors): graphics made automatically for the biggest events, from the event's verified
  data; an editor with drag, resize, snapping guides, undo/redo, templates, four social sizes plus custom, editable
  headline, text and statistics, image replacement and uploads; PNG/JPEG export and the share sheet.
- **Settings**: your favorites and alerts; for the owner, detection thresholds, feed significance and categories,
  spam limits, AI reporting style, graphics, data sources, people, the automation log.

## One game day at a time

The feed is about today's games. An hour before the first tip-off of a new game day, the previous day's data is
deleted (`lib/reset.js`): feed, comments, reactions, games, box scores, performances, events, graphics, caches. What
stays is small: teams, player bios, **career highs** (one row per player), the **record book** (a few MB of top-40
lists), season marks (e.g. the biggest comeback tracked), settings and accounts.

Context that used to come from stored history is fetched live from ESPN and cached for the day (`lib/context.js`): a
player's season so far (game log), team streaks (schedule), career totals for milestones. Career highs are seeded once
from the box-score history and raised after every verified final; players without a row get one from their ESPN game
logs.

**Records, live?** No reachable source serves an NBA record book through an API: ESPN and NBA.com don't publish one,
stats.nba.com doesn't answer servers, Basketball Reference forbids automated use, and Sportradar/SportsDataIO (paid)
provide stats, not record books. So the record book is computed once from every ESPN box score since 1993-94, kept as
compact lists with their scope stated, and updated after each night; the bulky history is then dropped. All-time
records from before 1993-94 can be added by hand with a source (reference records).

## For a publishing agent (X, TikTok)

`GET /api/agent?action=today` lists today's published stories with headline, data-driven text, the AI-written text when
there is one, `confirmed` / `developing`, verification, sources, and image URLs rendered on demand from the story's data
(`images.x` 1600×900, `images.story` 1080×1920 for TikTok/Reels/Stories, plus square and portrait). `unposted=x` and
`level=high` filter it. After posting, `POST /api/agent?action=posted` with `{ id, platform, url }` and the agent key
(Settings → Data & AI) marks it, so nothing is posted twice. `GET /api/agent?action=guide` has the rules.

## How events are found

`scripts/monitor.mjs` runs through each game night (GitHub Actions, `.github/workflows/monitor.yml`) and checks every
game every 20 seconds while any is live. The live stream also runs a check itself when the monitor is quiet.

1. **Play-by-play stories** (`lib/intel.js`) — the whole game is re-read each time, so nothing between checks is missed
   and every story keeps a stable id:
   team runs (8–0, 12–2, 18–4… stricter early in games; overlapping stretches are one story), solo runs (consecutive
   team points by one player, or most of a stretch; the shooter gets the points, assists are counted separately),
   close games (clutch time → two-possession → one-possession → final possessions, escalating within a period),
   comebacks (watch → underway → tied → ahead; **completed** only from the final result, or **fell short**), blowouts,
   collapses (told once, from the comeback side), overtime, clutch scoring; and from a final, verified game only:
   game winners (the basket that gave the lead for good in the last 24 seconds, buzzer-beaters, late free throws that
   sealed it) and **defensive game winners** (a block or steal by the winner with the loser within three in the last
   10 seconds, or the rebound that ended the last chance).
2. **Player lines** (`lib/detect.js`) — thresholds (configurable) are only the start: each line is measured against the
   player's own season so far (z-scores, season highs), career highs, where it ranks in the record book ("the 4th-most
   points in a game in Celtics history since 1993-94"), and clutch play. Role players (starters or off the bench —
   the wording follows the box score), rookies and unexpected contributors get extra weight; stars' off nights too.
3. **Records and milestones** (`lib/records.js`, `lib/events.js`) — record lists computed from every box score in the
   database (league, franchise, rookie, position, international, age, season, consecutive games, team), with their
   scope always stated: they are *box-score-era* records, never presented as all-time NBA records. All-time records
   come only from reference records an editor adds with a source and the owner verifies. Milestones use ESPN's career
   totals. Live: approaching → tied → broken; after the final, re-verified (career highs against the player's ESPN game
   logs) or withdrawn.
4. **Streaks** — team winning/losing streaks extended or snapped, from verified results.
5. **Significance** (`lib/feed.js`) — 0–100 → critical / high / medium / low; only entries above the threshold, in
   enabled categories, are published; at most a few runs per game (the strongest); favorites and playoffs get a bump;
   a story that develops updates its entry and moves back to the top when it escalates.

## Accuracy

- A final box score is used only after the checks pass — both teams present, players' points adding up to each score,
  minutes and quarters adding up — **and** NBA.com's box score agrees on the score and every player's points,
  rebounds and assists. Games NBA.com never confirms are used after 36 hours only if every check passes ("consistent").
- Outcomes (game winners, completed comebacks, records tied or broken) are never published from live data.
- Record claims and record-book rankings need lists built from the full history (5,000+ games); a partial record book
  can't say what a record is, so it doesn't.
- `tools/audit-feed.mjs` (run by the Live smoke test) re-checks every entry on the live site against ESPN: card
  statistics, starter/bench wording, scores, comeback outcomes, run arithmetic, game winners.
- Every entry keeps its source, game id, player id, detection and retrieval times, verification status and checks.
  Cards say whether a story is developing, final, confirmed or a recap (found after the game). AI-written summaries are
  labelled; the data-driven text is always kept beside them.

## Data sources

Researched with `tools/probe-atn.mjs` from GitHub Actions (details in `lib/providers/index.js`):

| Source | Use | Notes |
|---|---|---|
| ESPN public API | Primary: live scores and play-by-play, box scores (from 1993-94), rosters, bios, career stats, game logs | No key; unofficial, no published rate limit or license — fine for this project, not a licensed production feed |
| NBA.com live-data CDN | Verification of finals | No key; unofficial |
| stats.nba.com | — | Doesn't answer cloud servers |
| Basketball Reference | Linked for human checking only | Terms prohibit automated collection |
| Sportradar / SportsDataIO | Not integrated | Licensed, paid; the provider interface is where they would plug in |

## Stack

- **Client**: React 18 + Vite, plain CSS (dark, orange accent; Barlow Condensed and Inter).
- **API**: Vercel functions (`api/`): `feed` (feed, entry, ticker, rail, intel, performances, reactions, comments),
  `stream` (Server-Sent Events), `nba` (search, players, teams, games), `records`, `graphics` (library, render, uploads),
  `admin` (accounts, settings, integrations, log, run now).
- **Monitor**: Node in GitHub Actions (long-running through game nights); history backfill there too.
- **Database**: MongoDB (already provisioned for this deployment; PostgreSQL would fit behind the same modules).
- **Graphics**: one SVG renderer (`lib/graphics/`) for the editor, browser export and server rendering (resvg).
- **AI**: Anthropic API (Claude Opus 5.5) for labelled summaries of high and critical entries, written only from each
  entry's facts. Optional: needs `ANTHROPIC_API_KEY` (Vercel and GitHub Actions secrets) or a key saved in Settings.

Why not the suggested Next.js + Prisma + PostgreSQL: the deployment already runs on Vercel with MongoDB, and the feed's
real-time part is better served by a long-running monitor plus SSE than by request-driven server components; the
modules are plain ES modules shared by the browser, the functions and the monitor.

## Setup

- Vercel: `MONGODB_URI` (set). Optional: `ANTHROPIC_API_KEY`, `ATN_SECRET` (key for encrypting saved credentials).
- GitHub Actions secrets: `MONGODB_URI` (set); optional `ANTHROPIC_API_KEY`.
- After the first history backfill, run it once with `--highs --records` (seeds career highs and the record book;
  the next daily reset then drops the history).
- First account: open `/signin` and use the setup code (only its hash is in the code: `lib/auth.js`). That account is the
  owner; it can invite editors. Fans sign up themselves.
- History: run **History backfill** (Actions) once; then **Live monitor** runs on its own every night.

## Development

```sh
npm install
MONGODB_URI=... npm run dev                     # app + API on http://localhost:5173
ATN_MEMDB=1 MOCK_SOURCES=1 npm run dev          # no database or network: saved ESPN responses, in-memory data
node tools/tick-sample.mjs                      # run the monitor once on saved games and print the feed
npm test                                        # unit: intelligence on real games, feed rules, records, graphics
MONGODB_URI=mongodb://localhost:27017 npm run test:e2e
npm run build && npm run test:ui                # Chromium: feed, live arrival, phones, editor
```

## Licenses

| Resource | Use | License |
|---|---|---|
| React, Vite | Interface, build | MIT |
| MongoDB Node driver | Database | Apache-2.0 |
| resvg-js | Server rendering | MPL-2.0 |
| jpeg-js | JPEG encoding | BSD-3-Clause |
| Anthropic SDK | AI summaries | MIT |
| Barlow Condensed, Inter | Type | SIL Open Font License 1.1 |
| mingo, opentype.js (dev) | In-memory database for development; font metrics | MIT |
| ESPN and NBA.com data, headshots, logos | Statistics and images | Property of their owners, used through public endpoints. Not affiliated with or endorsed by the NBA or ESPN. |
