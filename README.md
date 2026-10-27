# Performance of the Night

The five best individual performances of every NBA night, scored from 0 to 100 by an algorithm that weighs winning, offense, defense, possessions, crunch time, stat padding and fouls, and a season leaderboard of who collects them.

Live: https://total-nba-ja9d.vercel.app

## Using it

- **Tonight** opens on the newest night with finished games. Step through game nights with the arrows, pick any date on the calendar, or switch seasons. While games are on, the ranking updates every minute and is marked live until the last game ends.
- Each of the top five shows the line, the result and a score out of 100; tap one to see its five categories, deductions and data confidence. No. 1 also says why he won and how close the next two came. The next five are one tap away.
- **Leaderboard** (`/leaderboard/2025` for 2024-25): players ranked by top-five finishes that season, then No. 1 nights, then points (5 for first down to 1 for fifth). Filter to the regular season or the playoffs, and open a player to see each of his nights.

Seasons are named by the year they end (2025 = 2024-25). Seasons 2021-22 to now are scored; the current one fills in every morning.

## The loading page

A coach's chalkboard: while the night loads, a play is diagrammed in chalk (the half court, the X's and O's, a screen, a dribble, a backdoor cut, the pass) and the ball drops in. Tally marks count to five. When the app is ready an eraser wipes the board. It's all SVG strokes drawn in sequence, roughened by a turbulence filter so the chalk wobbles and skips (`client/index.html`).

## The score

Every player who appeared in a regular-season, play-in or playoff game is scored from 0 to 100 and ranked; nobody is left out for being a role player. The code is `lib/night.js`.

```
POTN = 0.20 Result + 0.30 Offense + 0.20 Defense + 0.15 Possession + 0.15 Crunch time − stat padding − fouls   (0..100)
```

Each category is a value in points added (below). It is standardized against real NBA games: a robust z-score, (value − median) / (1.4826 × MAD), from 11,800 rotation-player games of 2023-24 and 2024-25 (`lib/calibration.json`). That z-score maps to 0..100: 50 is a typical rotation player's night, each 7 is one standard deviation, and it's capped at ±7 SD so only historic nights reach 100.

| Category | Weight | What goes in |
|---|---|---|
| Team result | 20% | A win: 6.5 × his part in it (40% his share of the minutes, 60% his share of the team's production), × the opponent's strength (its record before the game, pulled toward .500), × 1.1 on the road, × 1.05 in overtime, × 1.05–1.2 in the play-in and playoffs. A loss: −4 × his share of the minutes, half that when it was close (5 points or fewer, or overtime). Winning matters; a loss never disqualifies. Plus-minus × 0.12 (±3). Win probability he added before crunch time × 8 (±3) |
| Offense | 30% | Points, plus or minus half the points above or below an average shooter on the same shots (1.14 per true-shooting attempt), and assists; × 0.9–1.1 for the opponent's strength. Volume and efficiency together: 30 points on 18 shots beats 30 on 30, which still beats 10 on 6 |
| Defense | 20% | Steals × 1.3, blocks × 0.8, defensive rebounds × 0.3, and on/off defense: the opponent's points per possession with him on the floor against without him, from lineups rebuilt from the play-by-play's substitutions (shrunk hard, ±2: one game is a small sample; used only when the rebuilt minutes match the box score) |
| Possession | 15% | Offensive rebounds × 0.8, and turnovers against those expected from how much he had the ball (10% of his shots, free-throw trips, assists and turnovers). Each turnover costs (0.6 + 0.5 × the points the opponent scored off it before his team had the ball back) × leverage |
| Crunch time | 15% | The NBA's clutch time: the last 5 minutes of the 4th quarter or overtime, within 5 points. Win probability he added there × 20 (from ESPN; without it, his crunch-time shooting), +2 for the game-winner (the basket that put his team ahead for good in the last minute). In a loss a negative number counts half. Measured against players who were really part of crunch time; a game without any leaves this at a neutral 50 |

**Leverage** (how much a moment matters, from the score before the play and the time left): 2 in clutch time, 1.5 in a 4th quarter within 10, 1 otherwise, 0.5 once decided.

**Stat padding** (up to −12):
- Garbage time, starters only (a bench player's garbage time is his real playing time), up to −3: what his stats from the last 2 minutes of the 4th quarter or overtime with a 15-point lead were worth. A milestone reached only in garbage time doesn't count. Nothing earlier counts as garbage time, however lopsided: comebacks happen.
- Only for box scores that look impressive (20 points, a double-double, 15 rebounds or 12 assists), since a quiet night's flaws are already in its categories: volume over efficiency (15+ shots and more than 3 points short of an average shooter), up to −4; usage of 30%+ with true shooting under 53% and 4 assists or fewer, up to −2; 5+ turnovers out of proportion to his points and assists, up to −3.

**Fouls** (up to −7 combined):
- Technicals, up to −3: 0.75 for the misconduct (0.25 for defensive three seconds) + 0.5 × the technical free-throw points that went in × leverage. A missed free throw is never counted as a point.
- Personal fouls, up to −2 with foul trouble: 0.08 × the free-throw points they gave × leverage, and 0.05 for each foul past the second; anything under half a point (normal physical defense) is let go. Fouling on purpose late while trailing is strategy and costs nothing. Early foul trouble (2 in the 1st quarter, 3 by half, 5 after three) that left him 4+ minutes under his season average costs 0.1 a minute.
- Fouling out, up to −4: by how close the game was, how much time was left and how much he mattered. Late in a decided game it costs almost nothing.
- Flagrants and ejections, up to −5: 1 for a flagrant 1, 2 for a flagrant 2, plus their free throws; an ejection by the share of the game he missed and how much he mattered.

**Each event is charged once.** A turnover is charged in Possession only: its win-probability swing isn't charged again in Crunch time or Result, and the points scored off it are part of its cost there. A technical's free throw is charged with the technical. Fouls, turnovers, steals and blocks carry no win probability (they're counted in their own categories); win probability goes to shooters, passers on made baskets and rebounders. Plus-minus has a small weight because it overlaps with everything.

**Missing data is never invented.** Without play-by-play, a player's turnovers cost an average 1.1 each, crunch time's weight goes to the other categories, and his data confidence is *low*; without win probability or reliable lineups it's *medium*. ESPN's game data has no potential assists, fouls or charges drawn, shot contests or official offensive and defensive ratings, so none are used.

**Explained.** Each card shows its five category scores and what went into each, every deduction with its reason (for a technical: the clock, the score and whether the free throw went in), the arithmetic, the full line (minutes, shooting splits, true shooting, eFG%, usage, assist-to-turnover, fouls, technicals, plus-minus, opponent points off his turnovers) and the data confidence. No. 1 adds why he won and where the next two lost ground, and his rank among everyone who appeared.

**Corrections.** Each morning's run scores the last three nights again, so ESPN's stat corrections are picked up.

### Calibration and backtest

`tools/calibrate.mjs` (the *Probe ESPN* workflow, task `calibrate`) calibrates on every other even-numbered night of 2023-24 and 2024-25 and tests on odd-numbered nights it never saw. Latest run:

BACKTEST

## How it's built

- **Client** (`client/`): React 18 and Motion, built by Vite.
- **API** (`api/`, Vercel functions): `/api/night?date=YYYYMMDD|latest`, `/api/seasons`, `/api/leaderboard?season=YYYY&stage=all|regular|playoffs`. A night is scored from ESPN on first request and stored once every game is final (postponed games don't hold it up); stored nights are cached at the edge for a day.
- **Data** (`lib/nights.js`): MongoDB (`LIBRARY_DB`, default `library`) with `nights` (each night's games, top ten, the No. 1's explanation, the model version, ESPN sources and when it was scored), `perfs` (every scored performance, for season averages) and `meta` (each season's game dates).
- **Workflows**: *Score the nights* runs every morning for the current season, and backfills seasons on demand (`seasons: 2024,2025`). *Probe ESPN* saves ESPN responses for a date, API snapshots from the database, or a calibration and backtest, to the `probe` branch.

## Development

```sh
npm install
npm run dev:fixtures   # the interface on saved real API responses (test/fixtures/api), no database or network
MONGODB_URI=... npm run dev   # the real thing (nights are scored from ESPN on demand)
MONGODB_URI=... npm run ingest -- --season 2025   # score a whole season
npm test               # unit tests: reading ESPN's box scores, play-by-play and win probability; every part of the score
MONGODB_URI=mongodb://localhost:27017 npm run test:e2e   # mock ESPN -> API -> MongoDB
npm run test:ui        # Chromium: a night, switching dates and seasons, the leaderboard, a phone
```

## Free resources and licenses

| Resource | Use | License |
|---|---|---|
| [React](https://react.dev) 18 | Interface | MIT |
| [Motion](https://github.com/motiondivision/motion) 12 | Animation | MIT |
| [Vite](https://vitejs.dev) 5 | Build | MIT |
| [MongoDB Node driver](https://github.com/mongodb/node-mongodb-native) 6 | Database client | Apache-2.0 |
| [Barlow and Barlow Condensed](https://fonts.google.com/specimen/Barlow) (Jeremy Tribby) | Interface type | SIL Open Font License 1.1 |
| [Permanent Marker](https://fonts.google.com/specimen/Permanent+Marker) (Font Diner) | The chalkboard title on the loading page | Apache License 2.0 |
| [Caveat](https://fonts.google.com/specimen/Caveat) (Impallari Type) | Chalk handwriting on the loading page | SIL Open Font License 1.1 |
| ESPN public API, headshots and logos | Box scores, play-by-play, win probability, records, portraits | ESPN's property, used through its free public endpoints under ESPN's terms of use. Not affiliated with or endorsed by ESPN or the NBA. |
