# Beat the Dynasty

Draft a starting five from random franchise + decade spins, then take on one of the NBA's great teams in a best-of-seven. Can your five take down the '96 Bulls?

Live: https://total-nba-ja9d.vercel.app

## How it plays

1. **Draft.** Five spins, five picks, one per position (PG, SG, SF, PF, C). Each spin lands on a franchise and a decade and deals four of that era's players, the regulars likelier than the deep bench. No take-backs.
2. **Rate.** Every player-era (one player, one franchise, one decade, 25+ games) has an overall rating from 60 to 99, computed from his real per-game numbers in that stretch.
3. **Fit.** Team rating = the five's average, plus:
   - +2 for a ball-handler (5+ assists), two shooters (1.2+ threes a game; 82%+ free throws before threes were counted) and a rim protector (1.5+ blocks; 11+ rebounds before blocks were counted);
   - −3 for three centers, or for no point guard (nobody with 4+ assists);
   - +1 for three or more players from the same decade.
4. **Matchups.** Position by position before the series; each one you win adds half a point.
5. **Simulate.** The rating gap sets each game's odds (even = 50%, +5 ≈ 65%, −10 ≈ 22%). The dynasty has home court in Games 1, 2, 5 and 7, and Game 7 is pulled toward a coin flip.
6. **Results.** Every game has a box score, a top scorer and a headline. The end card shows your lineup and the series, ready to share.

**The ladder.** Win a series to unlock the next banner: the '14 Spurs, '04 Pistons, '08 Celtics, '01 Lakers, '13 Heat and '87 Lakers (ordered by their starters' ratings), then the '96 Bulls, then the final boss, the '17 Warriors. Progress is kept in the browser.

**Daily challenge.** One dynasty a day, and the same spins and deals for everyone (the draft runs on a random stream seeded by the date).

## Ratings: real statistics only

All numbers come from ESPN's free public API (season-by-season career statistics, by team). Nothing is hand-tuned:

- **Player-era rating:** Hollinger's Game Score per game over the player's seasons with that franchise in that decade, mapped onto 60–99 (`58 + 1.56 × GmSc`, clamped). An MVP-level 25 a game is about 97; a rotation player's 8 is about 70. Seasons are named by the year they end (1995-96 = 1996, in the 1990s).
- **Positions:** the listed position blended with what the numbers say (assists pull toward the point, rebounds and blocks toward the rim); every player can play his spot and the one beside it.
- **Dynasties:** each champion's real starting five, rated on that season with that team alone.
- **Not in the game:** ESPN has no season statistics at all for some 1980s greats (Larry Bird and Dennis Johnson among them), so they can't be rated; that's why the '86 Celtics aren't on the ladder.

## How it's built

- **Client** (`client/`): React 18 and Motion, built by Vite. `game.js` holds the rules (spins, deals, fit, matchups, odds, the series sim, headlines, the daily seed) as pure functions; the arena sounds are synthesised with Web Audio.
- **API** (`api/game.js`, a Vercel function): everything the game needs in one response, cached at the edge for an hour; the browser keeps a copy.
- **Data** (`lib/ingest.js`, `lib/dynasty.js`): `npm run ingest` scans ESPN's player ids and season lists, fetches every player's season-by-season stats, and builds the eras and the dynasty ladder. It runs weekly (`.github/workflows/ingest.yml`).
- **Database:** MongoDB (`LIBRARY_DB`, default `library`) with `players`, `eras` and `meta`.

## Development

```sh
npm install
npm run dev:fixtures   # the full game on a saved snapshot of the real data (test/fixtures/game.json), no database
MONGODB_URI=... npm run ingest && MONGODB_URI=... npm run dev   # the real thing
npm test               # unit tests: ESPN parsing, ratings, positions, fit, odds, the sim, the daily seed
MONGODB_URI=mongodb://localhost:27017 npm run test:e2e   # mock ESPN -> ingest -> /api/game
npm run test:ui        # Chromium: the ladder, a whole run, the daily seed, a phone
```

The *Build or snapshot the game data* workflow runs the ingest from a branch (`task: ingest`), saves `game.json` from the live database (`task: snapshot`), or looks players up on ESPN (`task: players`).

## Free resources and licenses

| Resource | Use | License |
|---|---|---|
| [React](https://react.dev) 18 | Interface | MIT |
| [Motion](https://github.com/motiondivision/motion) 12 | Animation | MIT |
| [Vite](https://vitejs.dev) 5 | Build | MIT |
| [MongoDB Node driver](https://github.com/mongodb/node-mongodb-native) 6 | Database client | Apache-2.0 |
| [Barlow and Barlow Condensed](https://fonts.google.com/specimen/Barlow) (Jeremy Tribby) | All type | SIL Open Font License 1.1 |
| ESPN public API and headshots | All player data and portraits | ESPN's property, used through its free public endpoints under ESPN's terms of use. Not affiliated with or endorsed by ESPN or the NBA. |

The favicon, the court, the banners and the loading arena are original and drawn in code.
