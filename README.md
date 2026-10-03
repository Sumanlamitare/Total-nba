# TotalNBA

Personal NBA leaderboard built on the MERN stack: top 5 single-game performances per day, regular-season
totals leaders, and a "performance of the week" picked from your own likes. Real player headshots.

| Layer | What |
| --- | --- |
| **MongoDB** | Games, every player box score line, your likes/dislikes/notes |
| **Express** | `/api` routes (`server/routes.js`) + serves the built React app |
| **React** | Vite app in `client/` |
| **Node** | Sync job (`server/ingest/`) pulls box scores from ESPN's free public API |

Data refreshes automatically: the server syncs in the background when data is over 2 hours old, and the
`Sync stats` GitHub Action syncs every 2 hours so it stays fresh while the free server sleeps. The first sync
backfills from the 2023–24 season (about a minute).

## Run locally

```bash
cp .env.example .env      # set MONGODB_URI (local mongod or Atlas)
npm install
npm run build && npm start   # http://localhost:5000
# or: npm run dev            # Vite dev server with API proxy
```

`npm run ingest -- --from 2023-10-24 --refresh 3` runs a sync by hand.

## Deploy (free)

1. **MongoDB Atlas**: create a free M0 cluster, a database user, allow access from `0.0.0.0/0`, copy the connection string.
2. **Render**: New → Blueprint → this repo (`render.yaml`). Set `MONGODB_URI`, `APP_PASSWORD` (protects likes/notes) and `BBS_API_KEY`.
3. **GitHub** → Settings → Secrets and variables → Actions: add `MONGODB_URI` and `BBS_API_KEY` for the scheduled sync.

## API

- `GET /api/meta`: dates with games, seasons, last update
- `GET /api/day/:date?stat=pts|reb|ast|stl|blk|tpm`: top 5 lines that day
- `GET /api/season/:season?stat=`: regular-season totals leaders (e.g. `2025-26`)
- `GET /api/week/:date`: daily top-5 lines for that Monday–Sunday week
- `GET /api/reactions`, `PUT /api/reactions/:key/vote`, `POST /api/reactions/:key/notes` (need `x-app-password` when `APP_PASSWORD` is set)
