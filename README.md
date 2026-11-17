# Football Past 90 — full-time graphic generator

Automatic, Instagram-ready full-time graphics (1080 × 1350 PNG) for **@footballpast90**, for every match across 39 men's
competitions. It finds the matches, watches them, notices full time, reads the final score and the scorers, makes the
graphic, keeps the graphic, and deletes the match data afterwards. It is deliberately not a statistics database.

## What it does

- **Matches** — today, tomorrow and the day after across the competitions, by day (in your own time zone) and
  competition: teams and crests, kickoff, status (Scheduled · Live · Halftime · Full Time · Graphic generated · Needs
  review · Postponed…), the score, and a link to the graphic.
- **Full time → graphic** — when ESPN confirms a match is over (full time, after extra time, or after penalties), the
  goals are checked against the score: every goal needs its team, scorer and minute. Stoppage time (45+2'), penalties
  (P), own goals (OG, listed under the team they counted for), several goals by one player, 0–0 ("No goals scored"),
  extra time and shootouts (shown separately under the score) are all handled. The graphic is made once per ESPN event
  id; nothing is ever invented — if ESPN's goal data is incomplete the app waits up to 90 minutes for it, then flags the
  graphic **Needs review** instead of publishing a guess.
- **A photo** — a photo can top the graphic: upload your own on the graphic's page (downscaled in the browser), or
  switch on Settings → "Use ESPN's match highlights still" to use the frame from ESPN's highlights video for the match
  (ESPN posts it an hour or more after full time, so the app re-checks every 15 minutes for 3 hours; many matches never
  get one). Mind the rights: broadcast stills and agency photos usually need permission.
- **Graphics** — every graphic made in the current period: preview, **Download PNG**, **Regenerate**, **Edit** (team
  names, score, shootout, scorers, the line under the score, date) with a live preview, **Approve**, keep or delete. The
  graphic keeps its own copy of the data it was drawn from, so it stays available after the match data is deleted.
  Graphics are removed after 30 days (Settings) unless you keep them.
- **Completed – Pending Deletion** — finished matches with their graphic made, the countdown to the next automatic
  cleanup, and **DELETE COMPLETED MATCH DATA** (with a confirmation that shows how many matches and goal events go).
- **Settings** — the competitions (switch off, rename, add by ESPN code; women's codes are refused), time zone, cleanup
  timing, the graphic's accent colour and handle, how often ESPN is checked, and the activity log.

## Temporary data and cleanup

| Kept | Temporary (deleted by cleanup) |
| --- | --- |
| settings, competition list | `matches`: event id, competition, teams, kickoff, status, score, goals, graphic and cleanup state |
| `graphics` (each with its own data and edits) | |
| `logos` (crests downscaled to 320 px, so a graphic always renders the same) | |

- **Manual**: deletes only matches ESPN confirmed as full time whose graphic exists. Upcoming and live matches,
  graphics, competition and app settings are never touched. Selection is by status and event id, not by time.
- **Automatic**: 60 minutes before the earliest kickoff of the next calendar day (app time zone, DST-safe); a fallback
  time (06:00) when that day has no matches. Recalculated on every check, so schedule changes move it. Runs once per
  day; it is idempotent (after a manual cleanup it only deletes what's newly eligible); a failure is logged and retried.
  It also removes postponed / cancelled / abandoned matches 12 hours after their kickoff.
- Deleted event ids are remembered for 4 days (MongoDB TTL index) so a schedule refresh can't bring them back.

## How ESPN is used (verified against the live API)

`site.api.espn.com/apis/site/v2/sports/soccer/<code>/scoreboard?dates=YYYYMMDD` gives everything: status, score,
shootout score and each goal (team, scorer, minute, penalty / own goal / shootout flags). ESPN refuses date ranges for
soccer and has no working cross-league scoreboard, so:

- **Schedule refresh** every 3 hours: one request per competition per day for today, tomorrow and the day after
  (39 × 3 = 117 small requests).
- **Live checks** every 60 seconds, only for competitions with a match about to start, on, or just finished — one request
  per competition, however many of its matches are on. A match stops being checked once its graphic exists.
- The match summary (`/summary?event=`) is fetched only when the scoreboard lacks scorers at full time.
- Only the fields the graphic needs are stored; ESPN's responses are never kept.

`tools/probe-espn-soccer.mjs` (run by the **Ops** workflow) prints the real response shapes for all 39 codes.

## Running it

- **Web app** — Vercel (React + `api/` functions), MongoDB Atlas (`MONGODB_URI`, database `fp90`).
- **Worker** — GitHub Actions (`.github/workflows/worker.yml`), started every 30 minutes; it stays on while something is
  due within 35 minutes and exits otherwise. The web app steps in when the worker hasn't been seen for 3 minutes.
- **No sign-in** — it's a personal tool: the site opens straight to the matches (anyone with the address can use it).

```
npm test            # unit: ESPN parsing, goal checks, scorer lines, DST, graphic layout bounds
npm run test:e2e    # mock ESPN + in-memory DB: sync, full time, review flags, manual + automatic cleanup, API
npm run build && npm run test:ui    # Chromium: dashboard, editor, PNG download, delete flow, phones
FP90_MEMDB=1 MOCK_ESPN=1 npm run dev  # the whole app on a mock ESPN, no network or database needed
```

Fonts: Barlow Condensed and Inter (SIL Open Font License, `lib/fonts/LICENSE.txt`).
