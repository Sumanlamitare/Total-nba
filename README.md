# TotalNBA

A personal NBA statbook that plays like a trading-card collection. Every performance is a card:

- **DAY** — every player who played that date, ranked by the stat you pick, with a scoreboard strip to
  filter by game and an **On This Day** chip (best line on the same date in another season).
- **WEEK / SEASON** — every player ranked by totals (no averages) for the week or regular season.
- **Rarity** — single games are Common / Rare / Epic / Legendary by fantasy score (≥30 / 42 / 55 FPTS);
  week and season cards by rank. Holographic glare follows your pointer; legendary cards get an animated foil.
- **Badges** — TRIPLE-DOUBLE, 40 PIECE, 50 BOMB, SNIPER, GLASS CLEANER, BLOCK PARTY, ZERO TURNOVERS and more.
- **BOOK** — tap COLLECT to keep a card (stored in your browser), with notes.
- **Player pages** — tap a name: career total and high, season-by-season bars, last 10 games, greatest hits.
  Every bar and game jumps to that date or season. Press `/` to search any player since 1993-94.
- **Stats** — points, rebounds, assists, steals, blocks, 3PM, 2PM, FTM, turnovers, fouls and FANTASY
  (DraftKings scoring).
- **Create Graphic** — a 1080×1350 Top 10 PNG of exactly the view on screen (`client/src/graphic.js`).

Data comes from ESPN's free public NBA API (no key); player photos from ESPN's headshot CDN.

| Layer | What |
| --- | --- |
| **MongoDB** | Every game and player box score line pulled so far (the historic store) |
| **API** | Vercel functions in `api/`: `/api/day`, `/api/week`, `/api/season`, `/api/top` (graphic), `/api/img` (photos), `/api/meta`, `/api/player`, `/api/search`, `/api/onthisday` |
| **React** | Vite app in `client/` |
| **Node** | `lib/espn.js` (ESPN client), `lib/store.js` (MongoDB), `scripts/ingest.mjs` (scheduled job) |

## How data flows

- **Pick a date** → `/api/day` answers from MongoDB. If the date isn't stored yet, it pulls that day from
  ESPN (scoreboard + one box score per finished game), saves it, and returns it. Completed days are never
  pulled twice; today is refreshed at most every 5 minutes.
- **Scheduled job** → `.github/workflows/ingest.yml` runs every 2 hours. It loads every season from 1993-94
  (`HISTORY_FROM`) to now, newest first, and stops before the free Atlas tier's 512 MB limit (`SIZE_CAP_MB`,
  default 460). Later runs only refresh recent days. Any date that isn't stored is pulled live when opened.
- **Season totals** are summed in MongoDB from the stored regular-season box scores.

ESPN's site API is free and unofficial: it has no key and no published rate limit, so the job keeps a
modest pace (3 days at a time, 4 box scores per day in parallel).

## Setup

1. **MongoDB Atlas** (free M0): allow access from `0.0.0.0/0`, copy the `mongodb+srv://...` string.
2. **GitHub** → Settings → Secrets and variables → Actions: add `MONGODB_URI`.
3. **Vercel**: Add New → Project → import this repo, add the `MONGODB_URI` environment variable, deploy.

## Local dev

```bash
npm install
MONGODB_URI=mongodb://127.0.0.1:27017 npm run dev   # http://localhost:5173
```
