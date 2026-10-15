# The Player Library

Every NBA player ESPN has on record gets a book, shelved alphabetically in a 3D reading room. Walk the shelves, pull a book, and read its chapters: the player, career, records, honors, teams, the full statistical record and what it all adds up to.

Live: https://total-nba-ja9d.vercel.app

## Using it

- **Walk the room.** Drag (or use `[` `]`, or the brass arrows) to move between bookcases. Scroll or pinch to step closer. The A–Z strip jumps to a letter.
- **Find a player.** Use the card catalogue (`/`). Enter takes you to the book's shelf, and Shift+Enter opens it. If the shelves don't hold a player, the catalogue asks ESPN's search and shelves any NBA player it finds.
- **Open a book.** Click a book; on touch, tap once to select it and again to open. The book slides off the shelf, the cover opens onto marbled endpapers, and the endpaper and half-title leaves turn over to the title page. Any click or key skips the animation; closing plays it in reverse and puts the book back.
- **Read.** The book is paginated into real pages: a two-page spread on wide screens, one page on phones. Pages turn as leaves hinged at the spine. Drag a page, swipe, click the dog-eared corner, or use ← →. The contents page lists real page numbers and turns to any chapter. Esc goes back to the shelf you came from. Every book has its own link (`/book/{espn id}/{name}`), and the browser's Back button closes it.
- **Without 3D.** The *Shelf list* shows the same shelves as plain buttons, fully keyboard-operable. Browsers without WebGL get it automatically. *Reading the spines* explains the spines and has a switch that turns animation off (the system reduced-motion setting is honored too).

## What a spine tells you

| | |
|---|---|
| Thickness | Length of the career as far as ESPN's records show it |
| Gold bands | One per MVP award |
| Gilt stars | One per Finals MVP award |
| Leather | Decade of the first season |
| Height | Decoration only |

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
4. the current-player index;
5. for careers that started before 1997, each player's own career stats, giving exact seasons, games and teams.

The result is about 5,240 players. Anyone else ESPN knows is added the first time someone searches for them.

**Honesty rules in the code**

- **Recording eras.** ESPN reports `0` for stats the league didn't record yet (steals and blocks before 1973-74, threes before 1979-80, turnovers before 1977-78, starts before 1981-82), and for rebounds it lacks. Those zeros are shown as blanks (`lib/book.js`, `scrub`).
- **Career lines.** A career figure is blanked when some seasons lack that stat, unless ESPN's own career line covers more than the season rows (for example Wilt Chamberlain). The reader says which case applies.
- **Traded seasons.** Each team's line is shown, followed by the season total, and the season is counted once.
- **Single-game highs and counts** (40-point games, triple-doubles) come only from seasons ESPN keeps game logs for. The reader names those seasons, says which are missing, and says how many games were logged.
- **League leaders** come only from ESPN's qualified leaders. Those exist from 1986-87 on, and the book says so.
- **What's left out.** ESPN's award lists include neither All-Star selections nor championships, so the books don't claim them. There are no rankings or opinions.

## How it's built

- **Client** (`client/`): React 18 + Vite and plain three.js.
  - Each bookcase is one `InstancedMesh`, about 400 books in one draw call, and all the woodwork in the room is one more.
  - Spine text is painted into a canvas atlas per bookcase, only for the cases near the camera, one per frame. Atlases are freed when the camera leaves. A small shader maps each book's spine face to its rectangle in the atlas.
  - The scene renders only when something moves.
  - The reader measures each block of a book's content and packs the blocks into fixed-size pages. A turning page is a 3D-transformed leaf whose two faces are the outgoing and incoming pages, with shading and a cast shadow driven by the turn angle.
  - three.js loads as a separate chunk, so the shelf list and reader don't wait for it.
  - All textures (wood, parquet, leather, brass plaques, covers) are drawn in code. No image assets.
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
npm run test:ui        # Chromium: room, search, opening, chapters, deep links, Back, no-WebGL, phone
```

`tools/snapshot.mjs` refreshes `test/fixtures` from the live database; it runs through the *Probe ESPN* workflow with `task: snapshot`.

## Free resources and licenses

| Resource | Use | License |
|---|---|---|
| [three.js](https://threejs.org) 0.169 | 3D rendering | MIT |
| [React](https://react.dev) 18 | Interface | MIT |
| [Vite](https://vitejs.dev) 5 | Build | MIT |
| [MongoDB Node driver](https://github.com/mongodb/node-mongodb-native) 6 | Database client | Apache-2.0 |
| [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) (Georg Duffner, Octavio Pardo) | Body text | SIL Open Font License 1.1 |
| [IM Fell English SC](https://fonts.google.com/specimen/IM+Fell+English+SC) (Igino Marini) | Titles, spines, plaques | SIL Open Font License 1.1 |
| ESPN public API and headshots | All player data and portraits | ESPN's property, used through its free public endpoints under ESPN's terms of use. Not affiliated with or endorsed by ESPN or the NBA. |

Every texture, the favicon and all other artwork are original and drawn in code.
