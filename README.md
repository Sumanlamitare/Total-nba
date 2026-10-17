# The Player Library

Every NBA player ESPN has on record gets a book. Active players stand on their current team's shelf; every retired player stands on one long shelf. Pick a team, find a book, take it down and read its chapters: the player, career, records, honors, teams, the full statistical record and what it all adds up to.

Live: https://total-nba-ja9d.vercel.app

## Using it

- **One shelf at a time.** *Active players* starts on *All teams*: every active player on one shelf. The dropdown narrows it to one team's shelf. *Retired players* is a single shelf for everyone who has retired. The long shelves have letters to jump along them. Books run A to Z by surname, and the pointer above the shelf (and the giant letter behind it) shows where you are.
  - Scroll the shelf sideways (trackpad, mouse wheel, the arrow buttons, or a swipe on a phone).
  - With the keyboard, Tab to the shelf and use ← → (Home, End, Page Up/Down).
  - *Shelf back* changes the colour of the wall behind the shelf.
- **Find a player.** Search (`/`) looks across every shelf. Enter takes you to the player's shelf and brings the book under the pointer; Shift+Enter (or *Open*) takes it straight down. Players the catalogue doesn't hold are found through ESPN's search and shelved.
- **Take a book down.** Click a book. It tips out by the top of its spine, comes off the shelf and turns to face you, cover first: the player's photo, name, team and years. Closing puts it back in its gap on the shelf.
- **The book.** Ten chapters: *By the numbers* (the career at a glance), *The player*, *Career* (by season or by age), *Prime* (the signature season, the best five-season stretch, season clubs such as 25-point, 20-and-10 and 50-40-90 seasons), *Records* (league titles, best seasons, single-game highs, 30- and 40-point games, 20-and-10 games, triple-doubles), *Playoffs* (playoff numbers set against the regular season), *Honors*, *Teams*, *Statistical record* (with true shooting) and *Legacy* (career totals, round-number milestones and the season each was passed, where the player stands in games played among everyone in the library). Every figure is the record's own number or plain arithmetic on it, and each derived measure says how it is worked out.
- **Read.** Tap or swipe the cover to open it. The book has real pages: a two-page spread on wide screens, one page on phones. Drag a page by its corner and it folds over under your finger, showing its back; let go past the middle (or flick) and it turns. Tap the right side to turn forward, the left side to go back, or use ← →.
  - The pills under the book jump to any chapter; the contents page lists real page numbers.
  - Turning a page makes a soft paper sound (drawn in the browser, no audio files); the speaker button turns it off.
  - Esc takes you back to the shelf.
  - Every book has its own link (`/book/{espn id}/{name}`), and the browser's Back button closes it.
- The system's reduced-motion setting is honoured: books open and pages turn without animation.

## What a spine tells you

| | |
|---|---|
| Thickness | Length of the career as far as ESPN's records show it |
| Gold bands | One per MVP award (up to four) |
| Stars | One per Finals MVP award |
| Colour | The player's latest team; a darker shade for an earlier first season |
| Height, lettering style | Decoration only |

**Which shelf.** A player ESPN lists as active stands with his latest team: the team whose current roster lists him, or failing that the team he finished his latest season with (a traded player goes with the team he was traded to). Active players ESPN lists on no team (unsigned or between teams) appear under *All teams* only. Everyone else is retired and stands on the retired shelf; the cover still names his last team. Franchises are ESPN's 30, and a franchise keeps its id through moves, so the Seattle SuperSonics count as Oklahoma City.

## Data: ESPN's free public API, nothing invented

No API key, no paid service. Endpoints used:

| Purpose | Endpoint |
|---|---|
| Season stat lists (who played, teams, games), 1984-85 → now | `site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete` |
| Qualified league leaders per season | the same, `isqualified=true`, sorted by stat |
| Award winners, every season since 1946-47 | `sports.core.api.espn.com/v2/.../seasons/{y}/awards` |
| Player records (and the id scan that finds pre-2010 players) | `sports.core.api.espn.com/v2/.../athletes/{id}` |
| Current players | `sports.core.api.espn.com/v3/.../athletes?active=true` |
| A book: bio, career stats (regular season and playoffs), honors, teams | `site.web.api.espn.com/.../athletes/{id}`, `/stats`, `/stats?seasontype=3`, `/bio` |
| Single-game highs | `.../athletes/{id}/gamelog?season={y}` |
| Search for unshelved players | `site.web.api.espn.com/apis/search/v2` |
| Portraits | `a.espncdn.com/i/headshots/nba/players/full/{id}.png` (not every player has one) |

**How the catalog is built** (`scripts/ingest.mjs`, weekly in GitHub Actions, about 2 minutes). ESPN has no single "every player ever" list, so the catalog combines several sources:

1. the season stat lists from 1984-85 on;
2. award winners from every season;
3. a scan of ESPN's player ids 1–8000, where players who debuted before about 2010 live;
4. every player's own career stats, giving exact seasons, games and the team of the latest season;
5. the current-player index and the 30 current team rosters (who is active, and where).

The result is about 5,240 players. Anyone else ESPN knows is added the first time someone searches for them.

**Honesty rules in the code**

- **Recording eras.** ESPN reports `0` for stats the league didn't record yet (steals and blocks before 1973-74, threes before 1979-80, turnovers before 1977-78, starts before 1981-82), and for rebounds it lacks. Those zeros are shown as blanks (`lib/book.js`, `scrub`).
- **Career lines.** A career figure is blanked when some seasons lack that stat, unless ESPN's own career line covers more than the season rows (for example Wilt Chamberlain). The reader says which case applies.
- **Traded seasons.** Each team's line is shown, followed by the season total, and the season is counted once.
- **Single-game highs and counts** (40-point games, triple-doubles) come only from seasons ESPN keeps game logs for. The reader names those seasons, says which are missing, and says how many games were logged.
- **League leaders** come only from ESPN's qualified leaders. Those exist from 1986-87 on, and the book says so.
- **What's left out.** ESPN's award lists include neither All-Star selections nor championships, so the books don't claim them. There are no rankings or opinions.

## How it's built

- **Client** (`client/`): React 18 + Vite, with [Motion](https://motion.dev) for springs and transitions (the sliding tab and chapter markers, numbers that count up as a page comes into view, the closed book floating and leaning towards the pointer).
  - The shelf is plain HTML and CSS: each spine is a button whose size, colours, decoration and lettering come from the player's record (`client/src/shelves.js`). Only the books near the view are in the page, so the retired shelf (about 4,500 books) scrolls as smoothly as a team's.
  - Taking a book down is CSS 3D (`client/src/pull.js`): the book is built as a box at the reader's cover size, scaled down over its spine, then tipped, pulled and turned until its cover lands exactly on the reader's.
  - The reader measures each block of a book's content and packs the blocks into fixed-size pages. A turning page folds along the perpendicular bisector of its corner and your finger (`client/src/fold.js`): the flat part is clipped, the lifted part is reflected across the fold to show the next page's back, and SVG gradients shade the curl and cast a shadow on the page underneath. The cover is stiff and swings without curling.
  - No image assets: everything is drawn in CSS and SVG; the only images are ESPN's portraits on the covers.
- **API** (`api/`, Vercel functions):
  - `catalog` is every book, cached at the edge for an hour.
  - `book?id=` is a composed book and `book?id=&part=highs` the career highs.
  - `search?q=` searches the catalog, with ESPN as a fallback.
  - Composed books are cached in MongoDB with an expiry: 6 hours for active players, 7 days for retired ones. Raw ESPN responses are only cached in memory.
- **Database:** MongoDB (`LIBRARY_DB`, default `library`), with the collections `players`, `leaders`, `awards`, `meta` and `cache`.

## Development

```sh
npm install
npm run dev:fixtures   # the full interface on saved real data (test/fixtures), no database or network
MONGODB_URI=... npm run ingest && MONGODB_URI=... npm run dev   # the real thing
npm test               # unit tests (real, trimmed ESPN responses)
MONGODB_URI=mongodb://localhost:27017 npm run test:e2e   # mock ESPN -> ingest -> API
npm run test:ui        # Chromium: shelves, search, taking a book down, chapters, deep links, Back, keyboard, phone
```

`tools/snapshot.mjs` refreshes `test/fixtures` from the live database; it runs through the *Probe ESPN* workflow with `task: snapshot`.

## Free resources and licenses

| Resource | Use | License |
|---|---|---|
| [React](https://react.dev) 18 | Interface | MIT |
| [Motion](https://github.com/motiondivision/motion) 12 | Animation | MIT |
| [Vite](https://vitejs.dev) 5 | Build | MIT |
| [MongoDB Node driver](https://github.com/mongodb/node-mongodb-native) 6 | Database client | Apache-2.0 |
| [Barlow and Barlow Condensed](https://fonts.google.com/specimen/Barlow) (Jeremy Tribby) | Interface, spines, covers | SIL Open Font License 1.1 |
| [Newsreader](https://fonts.google.com/specimen/Newsreader) (Production Type) | Headings, the shelf pointer | SIL Open Font License 1.1 |
| [Oswald](https://fonts.google.com/specimen/Oswald) (Vernon Adams) and [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) (Claus Eggers Sørensen) | Spine lettering | SIL Open Font License 1.1 |
| [Literata](https://fonts.google.com/specimen/Literata) (TypeTogether) | Book text | SIL Open Font License 1.1 |
| ESPN public API and headshots | All player data and portraits | ESPN's property, used through its free public endpoints under ESPN's terms of use. Not affiliated with or endorsed by ESPN or the NBA. |

The favicon and all other artwork are original and drawn in code. The held, floating book with page sounds and chapter pills takes its cue from [krishna-s-teachings](https://github.com/adyaman-singh/krishna-s-teachings) (an interactive 3D book); no code or assets are copied from it.
