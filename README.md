# Nightjar

**Know the moment a scheduled job doesn't run.**

Nightjar is cron-job and heartbeat monitoring. Each job calls a unique URL when it finishes; if the call
doesn't arrive on schedule (plus a grace time), or the job reports a failure, Nightjar alerts you in
Slack, Discord, by phone push (ntfy) or by webhook — and again when it recovers.

## Features
- Checks with a schedule and grace time; states: waiting, up, running, late, down, paused
- Ping URL `/p/<key>` with `/start`, `/fail`, `/log` and exit-code suffixes; POST bodies kept with the ping
- Run-time measurement (start → finish), last 100 pings, up/down history, 30-day uptime
- Alerts: Slack, Discord, ntfy push, generic JSON webhook; test sends; delivery status
- Public status page (`/s/<name>`) and SVG status badges (`/b/<id>.svg`)
- Accounts with scrypt passwords, signed HttpOnly session cookies, login throttling, password change
  (signs out other devices) and full account deletion
- Plans with limits (Free during beta; billing not connected yet)

## Stack
React + Vite frontend (`client/`), Vercel serverless functions (`api/`, shared code in `lib/`), MongoDB.

| Env var | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string (required) |
| `NIGHTJAR_DB` | Database name (default `nightjar`) |
| `SESSION_SECRET` | Optional; otherwise a random secret is generated once and stored in the database |

Missed deadlines are detected three ways: on dashboard visits, opportunistically on incoming pings, and by
the `Sweep` GitHub Actions workflow every five minutes (uses the `MONGODB_URI` repository secret).

## Develop
```sh
npm install
MONGODB_URI=mongodb://localhost:27017 npm run dev   # http://localhost:5173
npm test                                             # unit tests
MONGODB_URI=mongodb://localhost:27017 npm run test:e2e   # full API journey against a real MongoDB
```
CI runs both test suites against MongoDB 7 and builds the app on every push.
