# TotalNBA

Personal NBA leaderboard (MERN): the top 5 single-game performances for any date, regular-season totals
leaders, and a "performance of the week" picked from your own likes.

Data comes from two sources:
- **History:** [swar/nba_api](https://github.com/swar/nba_api) (NBA.com stats), loaded once from your own
  computer with `scripts/history_nba_api.py`. stats.nba.com blocks cloud servers, so this can't run on
  GitHub or Vercel.
- **Current season and live pulls:** the [Big Balls Data API](https://bigballsdata.com/docs/introduction)
  (free plan covers the current season only).

Photos come from NBA.com's headshot CDN for nba_api seasons, and ESPN's (matched by name) otherwise.

| Layer | What |
| --- | --- |
| **MongoDB** | Every game and player box score line ever pulled (the historic store) |
| **Express-style API** | Vercel functions in `api/` (`/api/day`, `/api/week`, `/api/season`, `/api/meta`) |
| **React** | Vite app in `client/` |
| **Node** | `lib/` (Big Balls client, MongoDB store) and `scripts/ingest.mjs` |

## How data flows

- **Pick a date** → `/api/day` answers from MongoDB. If the date isn't stored yet, it pulls that day from
  Big Balls (1 request for the day's games + 1 per finished game), saves it to MongoDB, and returns it.
  Past days are never requested twice.
- **Scheduled pull** → `.github/workflows/ingest.yml` runs every 2 hours: stores recent days, then backfills
  the current season (and last season, until nba_api has stored it) newest first.
- **History** → `scripts/history_nba_api.py` replaces whole seasons with NBA.com data (6 requests a season).
  Seasons it stores are never pulled from Big Balls again.
- **Season totals** are summed in MongoDB from the stored regular-season box scores (the API only publishes
  per-game averages). The app shows how many games they cover until a season is complete.

## Request budget

Free plan: **100 requests/minute, 500/day with GitHub**, daily window resets 00:00 UTC
([rate limits](https://bigballsdata.com/docs/rate-limits)). Every request is counted in MongoDB (`quota`
collection) so live pulls and the scheduled job share one budget: the app stops at 485/day, and the scheduled
backfill stops at 365 so 120 a day are always left for dates you open.

## Setup

1. **MongoDB Atlas** (free M0): create a cluster and database user, allow access from `0.0.0.0/0`, copy the
   `mongodb+srv://...` connection string.
2. **Vercel**: Add New → Project → import this repo. Add environment variables `MONGODB_URI` and
   `BBS_API_KEY`, then deploy.
3. **GitHub** → Settings → Secrets and variables → Actions: add `MONGODB_URI` (`BBS_API_KEY` is already there).
   The first scheduled run imports the games already in `data/` so they cost nothing.

## Load history (on your computer)

```bash
pip install -r scripts/requirements.txt
MONGODB_URI="mongodb+srv://..." python scripts/history_nba_api.py --from 2015-16 --to 2025-26
```

Windows PowerShell: `$env:MONGODB_URI="mongodb+srv://..."` first, then `python scripts/history_nba_api.py ...`.
Each season is about 26,000 player lines (~10 MB in MongoDB); the free Atlas tier holds 512 MB.

## Local dev

```bash
npm install
MONGODB_URI=mongodb://127.0.0.1:27017 BBS_API_KEY=bbs_... npm run dev   # http://localhost:5173
```
