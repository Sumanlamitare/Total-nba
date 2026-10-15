# Releasing Turnout to the App Store

The app is built and uploaded by GitHub Actions on Expo's servers, so you don't need a Mac.
Everything below is a one-time setup except steps 6–8, which you repeat for each release.

## What you need (once)

| | Cost | Where |
|---|---|---|
| Apple Developer Program membership | $99 / year | developer.apple.com/programs |
| Expo account (builds the app) | free tier is enough | expo.dev/signup |
| A real support email address | — | used on the Support, Privacy and Terms pages |

Apple can take 24–48 hours to approve a new Developer Program membership.

## 1. Fix the two placeholders in the code

1. **Support email** — `client/src/pages/Legal.jsx`, change `CONTACT` to your real inbox. Push to `main`
   (the website redeploys). Apple checks that the Support URL works.
2. **Bundle ID** (optional) — `mobile/app.json` uses `com.turnoutapp.pickup`. Change it if you'd like your own
   (e.g. `com.yourname.turnout`). It can never change after the first upload.

## 2. Create the app in App Store Connect

appstoreconnect.apple.com → **Apps → + → New App**
- Platform: iOS · Name: **Turnout** (if taken, try "Turnout: Pickup Games")
- Primary language: English (U.S.) · Bundle ID: register `com.turnoutapp.pickup` (or yours) under
  developer.apple.com → Certificates, IDs & Profiles → Identifiers, then pick it here · SKU: `turnout-ios`
- Open the new app → **App Information** and copy the **Apple ID** number (e.g. `6738291044`).
  Put it in `mobile/eas.json` as `ascAppId` and push.

## 3. Create an App Store Connect API key

appstoreconnect.apple.com → **Users and Access → Integrations → App Store Connect API → +**
- Name: `GitHub builds`, Access: **App Manager** → Generate → **Download** the `.p8` file (only possible once)
- Note the **Key ID** and the **Issuer ID** shown at the top of the page.
- Your **Team ID** is at developer.apple.com → Membership details.

## 4. Create an Expo access token

expo.dev → Account settings → **Access tokens → Create token**.

## 5. Add the secrets to GitHub

github.com/Sumanlamitare/Total-nba → Settings → Secrets and variables → **Actions → New repository secret**

| Secret | Value |
|---|---|
| `EXPO_TOKEN` | the Expo token |
| `ASC_API_KEY_P8` | the full text of the `.p8` file (open it in a text editor, copy everything) |
| `ASC_KEY_ID` | the key's ID |
| `ASC_ISSUER_ID` | the Issuer ID |
| `APPLE_TEAM_ID` | your Team ID |

(`MONGODB_URI` is already there.) If you enrolled as a company rather than an individual, change
`EXPO_APPLE_TEAM_TYPE` in `.github/workflows/app-store.yml` to `COMPANY_OR_ORGANIZATION`.

## 6. Build and upload

GitHub → **Actions → "iOS — build & submit to App Store Connect" → Run workflow**.
The build takes ~15–25 minutes on Expo's servers; with "submit" checked it then uploads to App Store Connect,
where Apple processes it for another 10–30 minutes. It then appears under **TestFlight**.

> If the first build stops asking for credentials, run `npx eas-cli build -p ios` once from any computer in the
> `mobile/` folder and sign in with your Apple ID when asked — EAS stores the certificate and profile, and every
> later GitHub build is non-interactive.

**Test on your iPhone first:** TestFlight → Internal Testing → add yourself → install the TestFlight app on your
phone and open Turnout. Check log in, joining by invite link, answering a game, and that a notification arrives
when someone posts a game.

## 7. Create the App Review demo account

GitHub → **Actions → "App Review demo account" → Run workflow**, choose a password.
It creates a login that owns a sample group with members, an upcoming game (with a waitlist and chat) and a played
game with results. Re-run before each submission; it resets the demo data.

## 8. Fill in the listing and submit

App Store Connect → your app → the **1.0 Prepare for Submission** page.

**Promotional text** (170 chars)
> One link for your crew, one tap to say you're in. Waitlists, fair teams and who actually showed up — handled.

**Description**
> Turnout is the free organizer for pickup games and rec groups — basketball, soccer, volleyball, pickleball,
> ultimate, run clubs and more.
>
> • One link for your group — players join with a tap
> • Post a game with the time, place and number of spots
> • Everyone answers In, Maybe or Out, and can bring guests
> • Full? New players join a waitlist and get a notification the moment a spot opens
> • Make balanced teams in a second, based on skill ratings only organizers see
> • Record the score and who didn't show; the group table tracks games, wins and reliability
> • Split court or field costs per head
> • A chat for every game
>
> Free, no ads.

**Keywords** (100 chars): `pickup,basketball,soccer,rsvp,team,organizer,league,volleyball,pickleball,sports,group,waitlist`

**Support URL**: `https://total-nba-ja9d.vercel.app/support` · **Privacy Policy URL**: `https://total-nba-ja9d.vercel.app/privacy`
**Category**: Sports (secondary: Social Networking) · **Price**: Free · **Age rating**: answer "None" to everything
except *Unrestricted web access: No* and *User-generated content: Yes* (expect a 12+ rating).

**Screenshots** (6.9" display, 1320 × 2868): the files in `mobile/store/` are ready to upload. Replace them with
real ones from your phone whenever you like (side button + volume up).

**App Review Information**: the demo email and password from step 7, and these notes:
> Turnout organizes pickup sports games. The demo account owns "Lunchtime Hoops (demo)". Open it to see an upcoming
> game: tap "I'm in" to answer, long-press a chat message (or tap ⋯) to report it or block the sender. As the owner
> you can make teams from the ⋯ menu on the game. Account → Delete account removes the account. Push notifications
> are sent when a game is posted, when a waitlisted player gets a spot, and when a game is canceled.

**App Privacy** (Data collection → Yes):
| Data type | Linked to user | Tracking | Purpose |
|---|---|---|---|
| Contact info → Name | Yes | No | App functionality |
| Contact info → Email address | Yes | No | App functionality |
| User content → Other user content (chat messages) | Yes | No | App functionality |
| Identifiers → Device ID (push token) | Yes | No | App functionality |

Then **Add for Review → Submit**. First reviews usually take 1–3 days.

## Releasing an update

Bump `version` in `mobile/app.json` (e.g. `1.0.1`), push, and run the build workflow again. Build numbers increase
automatically. Backend changes deploy with the website and need no app release.

## Moderation duty

Apple requires acting on reports within 24 hours. Reports are stored in the database's `reports` collection
(message text, author, reporter, time). Remove a message by deleting it as a group organizer, or remove an account
by deleting the user.
