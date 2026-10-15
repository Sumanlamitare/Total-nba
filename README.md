# Turnout

**Run the game, not the group chat.**

Turnout is a free organizer for pickup games and rec groups — basketball, soccer, volleyball, pickleball,
run clubs and more. A group gets one invite link; players answer each game with one tap.

## What it does
- **Groups** with an invite link (replaceable), owner / organizer / player roles
- **Games** with spots, a "need at least" threshold, location (maps link), cost split and notes
- **RSVPs** — in / maybe / out, plus guests. When a game is full, players queue on a **first-come waitlist**
  and are promoted automatically when someone drops. Dropping out within 24 hours counts as a **late drop**.
- **Fair teams** — organizers privately rate players 1–5; Turnout snake-drafts balanced teams (2–4), reshuffle any time
- **Results** — score per team and no-shows, feeding a group **table**: games played, W–L–D, reliability, no-shows, late drops
- Game **chat**, add-to-calendar (.ics), share links, "post next week's game"
- Accounts with scrypt passwords, signed HttpOnly session cookies, login throttling, rename, password change, account deletion

## Stack
React + Vite (`client/`), Vercel serverless functions (`api/`, shared code in `lib/`), MongoDB.
Game rules live in `lib/turnout.js` as pure functions.

| Env var | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string (required) |
| `TURNOUT_DB` | Database name (default `turnout`) |
| `SESSION_SECRET` | Optional; otherwise generated once and stored in the database |

## Develop
```sh
npm install
MONGODB_URI=mongodb://localhost:27017 npm run dev        # http://localhost:5173
npm test                                                  # rule tests
MONGODB_URI=mongodb://localhost:27017 npm run test:e2e    # multi-user API journey
```
CI runs the rule tests, the API journey and a two-person browser test against MongoDB 7 on every push.
