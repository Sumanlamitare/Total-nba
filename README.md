# TotalNBA

Personal NBA leaderboard built with React: the top 5 single-game performances each day, season leaders
(per game, regular season), and a "performance of the week" picked from your own likes. Real data from the
[Big Balls Data API](https://bigballsdata.com/docs/introduction); player photos from ESPN's headshot CDN.

## How it works (no database)

- `scripts/fetch-bbs.mjs` runs in GitHub Actions every 3 hours with the `BBS_API_KEY` secret, saves JSON
  into `data/` and commits it. The key never reaches the browser.
- `.github/workflows/deploy.yml` then builds the React app (`client/`, Vite) and publishes it with `data/`
  to GitHub Pages.
- Likes, dislikes and notes are saved in your browser.

## Request budget

The free plan allows **100 requests/minute and 250/day (500 with GitHub)**, with the daily window resetting at
00:00 UTC ([rate limits](https://bigballsdata.com/docs/rate-limits)). The fetcher counts its own requests per
UTC day, stops at 450, and spaces calls ~0.7s apart.

| Data | Endpoint | Cost |
| --- | --- | --- |
| Season leaders, 2019-20 onward | `/v1/nba/leaders` | 6 per season (once; current season daily) |
| Recent days | `/v1/matches?league=nba&date=` + `/v1/live-stats/basketball/{id}/players` | 1 per day + 1 per game |
| History (2023-24 to 2025-26) | `/v1/nba/games?season=` + box score per game | ~1,300 per season |

Daily history therefore fills in over roughly a week of quota, newest games first. Season leaders load on the
first run.

## Local preview

```bash
npm install
BBS_API_KEY=bbs_... npm run fetch   # optional: pull data locally
npm run preview                      # builds, copies data/, serves the site
```
