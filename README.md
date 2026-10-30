# Overlap

Automatic NBA statistical Venn diagrams. Every night, once all the games are final, Overlap publishes a diagram of the
players who met the night's criteria (say 10+ rebounds, 6+ assists, 90%+ free throws), each placed in exactly the
intersection of criteria he met. It does the same for the season to date, and lets anyone build their own with any
statistic, any number of criteria and any period, then share it as a finished graphic.

Live: https://total-nba-ja9d.vercel.app

## Using it

- **Today**: the latest automatic diagram (and the season to date), with its date, period, player count, criteria, last
  update and whether every game is final. A banner shows tonight's progress while games are on.
- **Daily**: any night. A night that isn't final yet shows a clearly marked preview from its finished games; **Refresh**
  checks ESPN again right away.
- **Season**: regular season, playoffs or both, for any loaded season. In **Modify → Period** you can set a date range or
  a "through" date to see the season as it stood that day.
- **Modify** (on every diagram): criteria (any statistic from the searchable catalog, `≥ > ≤ <`, decimal thresholds,
  the same statistic twice, reorder, remove), period, team and player filters (only these players, exclude), and the
  look: view (Venn or intersections), each circle's color, background, fill, outline, circle positions and sizes,
  headshot size, names, counts, typeface. Everything redraws instantly; **Undo/Redo** (also ⌘Z / ⇧⌘Z), **Reset**, and
  **Save** a configuration for reuse.
- **Share**: a live preview of the standalone graphic in square 1080×1080, portrait 1080×1350, landscape 1920×1080 or
  custom sizes, with title, subtitle, logo, legend and attribution; then PNG, high-res PNG (3×), SVG, PDF, copy image,
  the phone's share sheet, or a link (`/d/<id>`) whose preview on X and elsewhere is the diagram itself.
- **History**: every automatic diagram and every shared custom one, by type and season. Open, modify, download, share,
  or pick two to compare (or apply one night's criteria to another night).
- **Settings**: the default daily and season criteria and the minimum samples. The first passcode set owns the settings.

## The statistics

**Provider.** Stage-one research (`tools/probe-providers.mjs`) tried NBA.com's stats API (times out from cloud hosts),
NBA.com's CDN (403 from cloud hosts) and ESPN. ESPN serves schedules and live status, complete box scores, league-wide
season tables (regular season and playoffs, many seasons back) and per-player season figures, without a key, so it is
the provider, behind an interface (`lib/providers/espn.js`) another provider can sit beside.

**Where each number comes from** (shown on every statistic in the picker):
- *Box score*: points, rebounds (offensive, defensive), assists, steals, blocks, turnovers, fouls, minutes, made and
  attempted field goals, threes and free throws and their percentages, plus-minus, starts; double- and triple-doubles.
- *Computed* from box scores with Basketball Reference's formulas (they need the team's and opponent's totals, which
  every game carries): true shooting %, effective FG %, usage %, assist %, rebound % (total, offensive, defensive),
  steal %, block %, turnover %, assist-to-turnover ratio, Game Score, per-36 numbers.
- *ESPN season figures* (whole season to date only): PER, ESPN's player rating, assist and turnover ratio, estimated
  possessions, points per possession, shooting and scoring efficiency, steal/block-to-foul and steal-to-turnover ratios.
  These are offered only when the data has real values: ESPN returns usage and rebound rates as 0 for everyone, and a
  "VORP" on a scale that isn't VORP's, so those are never offered.
- *Not available* from any reachable provider, never estimated: Box Plus/Minus (and its offensive/defensive parts),
  Win Shares (and WS/48), offensive, defensive and net rating.

**Season numbers** are sums of the box scores in the database (so date ranges and "through" dates work), with
percentages and rates from the sums, never averages of game percentages. Each statistic is labeled total, per game,
per 36, percentage, rate, count, advanced or yes/no.

**Minimum samples** (Settings): a night's percentage needs enough attempts (default 5 FGA, 3 3PA, 4 FTA); season
averages need half the team's games, and percentages NBA-style made shots per team game (3.65 FGM, 1 3PM, 1.5 FTM —
the league's leader qualifiers, prorated). Players short of a sample count as not meeting that criterion and are noted.

## The engine and the diagrams

- `lib/engine.js` decides who qualifies: for each player, a bit mask of the criteria met; regions are masks. It knows
  nothing about drawing — colors, positions and views never change a result. Unit tests cover every combination for
  2 to 6 criteria.
- `lib/venn/layout.js` draws 1–3 criteria as circles and 4 or 5 as ellipse arrangements found by search so that every
  one of the 15 or 31 combinations has its own region (true Venn diagrams, not misleading ones). Players are packed on a
  hexagonal lattice inside their exact region, headshot and name wholly inside it; a crowded diagram shrinks headshots,
  then grows the canvas — nobody is hidden. Six or more criteria (or a crowded five) use the intersection view: one row
  per combination with its count and players (UpSet-style). You can switch views at any time.
- `lib/venn/render.js` turns a layout into SVG — one renderer for the page, the downloads and the link previews.

## Automation

`.github/workflows/auto.yml` runs `scripts/auto.mjs` every 20 minutes from noon to 6 a.m. Eastern:

1. Today's and yesterday's games (NBA game dates, Eastern Time).
2. A final game's box score is stored only once it passes checks: both teams present with players, each team's player
   points adding up to its score, player minutes adding up to the game. An incomplete response is never taken for a
   final game.
3. When every game of a date is final and verified, the date's default diagrams are made: the night, and the season
   through that night. Postponed, canceled and suspended games don't hold a night up; a night with no games is noted.
4. The same configuration on unchanged data never makes a second diagram. The last three nights are fetched again
   every six hours; a stat correction makes a new version and the old one is kept, marked superseded.
5. ESPN's season figures are refreshed daily. **Refresh** on a night runs steps 1–4 for it at once (at most once a minute).

`.github/workflows/backfill.yml` loads whole seasons (`seasons: 2025,2026,2027`, named by the year they end).

## How it's built

- **Client** (`client/`): React 18, built by Vite. The engine and layout run in the browser, so editing is instant.
  Exports are drawn fresh from the renderer with headshots embedded (ESPN serves them with open CORS) and rasterized in a
  canvas; PDFs are written directly (no library).
- **API** (`api/`, Vercel functions): `data` (home, datasets, seasons, catalog), `diagram` (one, archive, save custom),
  `admin` (settings, saved configurations, refresh), `share` (`/d/:id` with preview tags), `og` (the diagram as a PNG,
  rendered with resvg and Inter).
- **Database**: MongoDB (`lib/db.js`): teams, players, games, days, player-game box scores, ESPN season figures,
  diagrams (configuration, results, data checksum, versions), saved configurations, settings, seasons.
- **Why this stack**: JavaScript ES modules end to end so the same engine and renderer run in the browser, the
  serverless functions and the scheduled jobs, with no build step on the server; SVG for crisp, exportable diagrams with
  a custom geometry engine (D3's force layouts can't guarantee a player stays inside his exact region); MongoDB because
  the deployment already has it (box scores and diagram snapshots are naturally documents) — PostgreSQL would work as
  well behind the same `lib/data.js` functions; GitHub Actions for the scheduled jobs, since Vercel's free cron runs
  once a day.

## Development

```sh
npm install
MONGODB_URI=... npm run dev              # the app and API on http://localhost:5173
MONGODB_URI=... npm run auto             # one automation run (or --date 20250115 [--force])
MONGODB_URI=... npm run backfill -- --season 2026
npm test                                 # unit: formulas, every intersection, layout, rendering
MONGODB_URI=mongodb://localhost:27017 npm run test:e2e   # mock ESPN -> automation and API -> MongoDB
npm run test:ui                          # Chromium: the app on desktop and phone
```

## Licenses

| Resource | Use | License |
|---|---|---|
| React 18, Vite 5 | Interface, build | MIT |
| MongoDB Node driver 6 | Database | Apache-2.0 |
| resvg-js | Server-side PNG rendering | MPL-2.0 |
| Inter (`lib/fonts`) | Text in server-rendered images | SIL Open Font License 1.1 |
| ESPN public API, headshots and logos | Statistics and images | ESPN's property, used through its public endpoints under ESPN's terms. Not affiliated with or endorsed by ESPN or the NBA. |
