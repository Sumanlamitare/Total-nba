# TotalNBA

Personal NBA leaderboard (MERN): the top 5 single-game performances for any date, regular-season totals
leaders, and a "performance of the week" picked from your own likes. Data comes from ESPN's free public NBA
API (no key); player photos from ESPN's headshot CDN.

| Layer | What |
| --- | --- |
| **MongoDB** | Every game and player box score line pulled so far (the historic store) |
| **API** | Vercel functions in `api/`: `/api/day`, `/api/week`, `/api/season`, `/api/meta` |
| **React** | Vite app in `client/` |
| **Node** | `lib/espn.js` (ESPN client), `lib/store.js` (MongoDB), `scripts/ingest.mjs` (scheduled job) |

## How data flows

- **Pick a date** → `/api/day` answers from MongoDB. If the date isn't stored yet, it pulls that day from
  ESPN (scoreboard + one box score per finished game), saves it, and returns it. Completed days are never
  pulled twice; today is refreshed at most every 5 minutes.
- **Scheduled job** → `.github/workflows/ingest.yml` runs every 2 hours. Its first run loads every season
  from 2015-16 (`HISTORY_FROM`) to now; later runs only refresh recent days. Dates before 2015-16 still work:
  they're pulled live the first time you open them.
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
