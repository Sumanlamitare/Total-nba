# TotalNBA

Personal NBA leaderboard: top 5 single-game performances per day, season totals leaders, and a
"performance of the week" picked from your own likes.

- **Data:** ESPN's free public NBA endpoints (no API key). A GitHub Action (`.github/workflows/update.yml`)
  runs `scripts/update.mjs` every 2 hours, saves box scores to `data/`, and redeploys to GitHub Pages.
  The first run backfills from the 2023–24 season, so it takes a while.
- **Site:** `index.html`, a static page that reads the JSON in `data/`. Likes and notes are stored in your browser.
- **Player photos:** ESPN headshot CDN.

Run the updater locally: `node scripts/update.mjs` (`--from YYYY-MM-DD` to backfill, `--refresh N` to refetch the last N days).
Preview: `python3 -m http.server` and open http://localhost:8000.
