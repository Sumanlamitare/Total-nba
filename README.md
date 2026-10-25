# Performance of the Night

The five best individual performances of every NBA night, scored by an algorithm that weighs everything a fan would, and a season leaderboard of who collects them.

Live: https://total-nba-ja9d.vercel.app

## Using it

- **Tonight** opens on the newest night with finished games. Step through game nights with the arrows, pick any date on the calendar, or switch seasons. While games are on, the ranking updates every minute and is marked live until the last game ends.
- Each of the top five shows the line, the result and a score; tap one to see every part of its score. The next five are one tap away.
- **Leaderboard** (`/leaderboard/2025` for 2024-25): players ranked by top-five finishes that season, then No. 1 nights, then points (5 for first down to 1 for fifth). Filter to the regular season or the playoffs, and open a player to see each of his nights.

Seasons are named by the year they end (2025 = 2024-25). Seasons 2021-22 to now are scored; the current one fills in every morning.

## The loading page

A coach's chalkboard: while the night loads, a play is diagrammed in chalk (the half court, the X's and O's, a screen, a dribble, a backdoor cut, the pass) and the ball drops in. Tally marks count to five. When the app is ready an eraser wipes the board. It's all SVG strokes drawn in sequence, roughened by a turbulence filter so the chalk wobbles and skips (`client/index.html`).

## The score

Every player with 10+ minutes in a regular-season, play-in or playoff game is scored. Each part is shown to the user:

| Part | What it measures |
|---|---|
| Production | Hollinger's Game Score (points, shooting, rebounds, assists, steals, blocks, turnovers, fouls), × 0.85–1.15 for the opponent's strength (its record before the game, pulled toward .500 early in the season) |
| Efficiency | Points scored above what an average shooter makes from the same shots (1.14 points per shooting possession), × 0.3 |
| Impact | Plus-minus × 0.12 (at most ±4) |
| Clutch | Win probability added: the swing in his team's chance to win on every play he made, from ESPN's win probability (an assist takes 30% of a basket's swing; a block or steal half of what it took away; fouls and violations count for nothing). × 16, from −6 to +8. In a loss only a positive number counts, so a player isn't marked down because his team's chances ended at zero. Games without win probability use crunch-time points (last 5 minutes, within 5) |
| Giveaways | −0.4 for every point the opponent scored off his turnovers (at most −6), traced in the play-by-play: after a turnover, the other team's points until his team has the ball again. This comes on top of the −1 per turnover in Game Score, so a dead-ball turnover the defense doesn't score on costs less than a pick-six |
| Stat padding | Starters only (garbage time is a bench player's real playing time): stats piled up after the game was decided come off: points, made shots, rebounds, assists, steals and blocks are taken back out at their Game Score value, and a milestone only counts if he reached it before garbage time. Garbage time is the last 2 minutes of the fourth quarter (or overtime) with a lead of 15+, read from the score before each play. Nothing earlier counts, however lopsided: comebacks happen |
| Result | +2.5 for a win, +0.5 on the road, +0.5 in overtime. A loss costs nothing: a great game in a loss keeps all its other parts, and a close loss (5 points or fewer, or overtime) earns +1 |
| Milestones | 40/50/60 points, triple- and quadruple-doubles, 20-20s, 5x5s, 15 assists, 7 steals + blocks, 10 threes, perfect shooting on 8+ shots |
| Breakout | How far above his own season average Game Score he played (after 5 games), up to +3 |
| Stage | × 1.05 play-in, × 1.1 playoffs, × 1.15 conference finals, × 1.2 NBA Finals |

The night's ranking is the score, best first (ties go to the higher Game Score). The code is `lib/night.js`.

## How it's built

- **Client** (`client/`): React 18 and Motion, built by Vite.
- **API** (`api/`, Vercel functions): `/api/night?date=YYYYMMDD|latest`, `/api/seasons`, `/api/leaderboard?season=YYYY&stage=all|regular|playoffs`. A night is scored from ESPN on first request and stored once every game is final (postponed games don't hold it up); stored nights are cached at the edge for a day.
- **Data** (`lib/nights.js`): MongoDB (`LIBRARY_DB`, default `library`) with `nights` (each night's games and top ten), `perfs` (every scored Game Score, for season averages) and `meta` (each season's game dates).
- **Workflows**: *Score the nights* runs every morning for the current season, and backfills seasons on demand (`seasons: 2024,2025`). *Probe ESPN* saves ESPN responses for a date, or API snapshots from the database, to the `probe` branch.

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
