# ESPN Unofficial Public API: NBA and NFL Endpoint Reference for a Betting Analysis Tool

> Method note: ESPN hosts (site.api.espn.com, sports.core.api.espn.com) and the-odds-api.com could not be reached from this research sandbox (the proxy returned 403, and DNS lookups through WebFetch failed). Nothing here was probed live by this researcher. Findings come from community docs (pseudo-r/Public-ESPN-API, which includes its own live audit dated 2026-09-30), the akeaswaran gist and its comments, and the source code of the sportsdataverse wrappers (hoopR, sportsdataverse-py). Items under "Inferences" that rely on prior knowledge are marked **[unverified]**, and the app should check them against a live response.

## 1. Core endpoints (scoreboard, summary, teams, schedule, standings, rosters, depth charts, injuries, athletes, team stats, core API)

### Takeaway
There are four ESPN hosts, and each uses the same `{sport}/{league}` path pattern: `football/nfl` and `basketball/nba` on site/common, `football/leagues/nfl` and `basketball/leagues/nba` on core. That shared pattern means another sport can be added by changing only the path segment. Use Site v2 for scoreboard, summary, teams, roster and schedule. Use `/apis/v2/` (not `/apis/site/v2/`) for standings. Use league-wide injuries rather than per-team injuries. Use common/v3 on site.web.api for athlete gamelog, splits and overview. Use core v2 for odds, probabilities, plays and depth charts.

### Cited Findings
**Site v2** (`https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/...`). Every route below is documented for both NFL and NBA unless noted — [pseudo-r/Public-ESPN-API](https://github.com/pseudo-r/Public-ESPN-API)
- `scoreboard`: params are `dates=YYYYMMDD`, `week` (1-18, NFL), `seasontype` (1=pre, 2=regular, 3=post, 4=off), `season`, and `limit` (e.g. 100 or 1000). `groups` is documented only for college sports — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)
- The NFL weekly form `scoreboard?seasontype=1&dates=2026&week=3` works. `dates=YYYY` and `dates=YYYYMM` work (e.g. NBA `dates=202610`, plus `limit=300` to get every event). Date ranges such as `dates=20260918-20260920` now return HTTP 400 "Failed to get events endpoint" — [akeaswaran gist + comments](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b); also noted in [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API) ("Request one day at a time and deduplicate by event id")
- hoopR pulls NBA schedules with `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=1000&dates=%s` — [hoopR source](https://raw.githubusercontent.com/sportsdataverse/hoopR/main/R/espn_nba_data.R)
- `summary?event={id}` returns the full game summary plus box score — [pseudo-r football.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/football.md)
- Other routes: `teams`, `teams/{id}`, `teams/{id}/roster`, `teams/{id}/schedule`, and league `injuries` — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API). hoopR also uses `teams/{id}?enable=roster` and `teams?limit=1000` — [hoopR source](https://raw.githubusercontent.com/sportsdataverse/hoopR/main/R/espn_nba_data.R)
- Depth charts: NFL uses `teams/{id}/depthcharts`. The NBA doc spells it `teams/{id}/depth-charts`, hyphenated, which may be a typo, so test both — [football.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/football.md), [basketball.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/basketball.md). The core equivalent is `seasons/{season}/teams/{team}/depthcharts` — [core-endpoints.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/core-endpoints.md)
- Injuries: NFL `teams/{id}/injuries` "returned HTTP 200 with `{}`" in the 2026-09-30 audit, which advises: "Prefer the league-wide injuries endpoint and filter its team groups" — [audit](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/audit-2026-09-30.md), [response_schemas.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/response_schemas.md)
- League injuries shape: `timestamp`, `status`, `season`, `injuries[].team{id,displayName,abbreviation}`, `injuries[].injuries[]{id, athlete, type.name, status, date}`. Per-athlete entries can also carry `details`, `location`, `side`, and `fantasy{status, injuryType}` — [response_schemas.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/response_schemas.md)
- Standings: use `https://site.api.espn.com/apis/v2/sports/{football/nfl|basketball/nba}/standings`, because `/apis/site/v2/` "returns a stub" — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API). hoopR uses `https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?region=us&lang=en&contentorigin=espn&type=0&level=1&sort=winpercent:desc,wins:desc,gamesbehind:asc` — [hoopR source](https://raw.githubusercontent.com/sportsdataverse/hoopR/main/R/espn_nba_data.R)
- Site v3 scoreboard and the Site v2 NFL calendar return 404. Site v2 athlete detail and gamelog return 404 for NFL — [audit](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/audit-2026-09-30.md)
- Team schedule "returned data" in the audit — [audit](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/audit-2026-09-30.md)

**Common v3 athletes** (`https://site.web.api.espn.com/apis/common/v3/sports/{sport}/{league}/athletes/{id}/{bio|overview|stats|gamelog|splits}`)
- The audit says "Common v3 overview, stats, gamelog, splits, bio returned data" for NFL. The docs mark these as working for NBA — [audit](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/audit-2026-09-30.md), [basketball.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/basketball.md)
- Gamelog shape: `filters`, `labels`, `names`, `displayNames`, `events[]{id, date, opponent, gameResult, stats}`. The stats arrays line up with labels after DATE/OPP/RESULT — [response_schemas.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/response_schemas.md)
- Leaders: `/apis/common/v3/sports/{sport}/{league}/statistics/byathlete?category=&sort=`. Search: `https://site.web.api.espn.com/apis/search/v2?query=&limit=` — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)

**Core v2** (`https://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/...`)
- `events` (`dates=`, `limit=`), `events/{id}`, `.../competitions/{id}/odds`, `/probabilities`, `/predictor`, `/plays`, `/situation`, `/powerindex`, `.../competitors/{id}/linescores`, `seasons/{y}/futures`, `seasons/{y}/types/{t}/teams/{id}/ats`, `.../odds-records`, `athletes/{id}/statistics`, `athletes/{id}/statisticslog`, `standings`, `teams` — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)
- NFL QBR: `.../seasons/{year}/types/{type}/groups/{group}/qbr/{split}` (split 0=totals, 1=home, 2=away), or weekly `.../types/2/weeks/{week}/qbr/0` — [football.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/football.md)
- Core v3: `https://sports.core.api.espn.com/v3/sports/{sport}/{league}/athletes...`. It "works without `/leagues/`; with it returns 404" — [audit](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/audit-2026-09-30.md)
- hoopR gets NBA team and player season stats from `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/...` and game rosters from `.../events/` — [hoopR source](https://raw.githubusercontent.com/sportsdataverse/hoopR/main/R/espn_nba_data.R). sportsdataverse-py gets NFL game rosters from `.../events/{id}/competitions/{id}/competitors/{teamId}/roster` and follows each athlete's `$ref`. Some teams 404 and some older games lack the statistics `$ref` — [sportsdataverse-py nfl_game_rosters.py](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-py/main/sportsdataverse/nfl/nfl_game_rosters.py)
- Core responses are `$ref`-linked envelopes (`count`, `items`, paginated with `page`/`limit`). Score, status and statistics may be `$ref`s that need follow-up requests. Event and competition IDs can differ. Some `$ref`s point to `.pvt` hosts, so replace them with `.com` — [response_schemas.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/response_schemas.md), [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)
- Core WADL routes are "not individually live-verified" — [core-endpoints.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/core-endpoints.md)

**CDN** (`https://cdn.espn.com/core/{nfl|nba}/{scoreboard|game|boxscore|playbyplay}?xhr=1&gameId={id}`)
- Returns a `gamepackageJSON` with drives, plays, win probability, scoring and odds. `xhr=1` is required — [basketball.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/basketball.md), [football.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/football.md)

**Scoreboard shape**
- Event: `id, uid, date, name, shortName, season, week, status, competitions`. Competition: `id, attendance, venue, broadcasts, competitors`. Status: `clock, displayClock, period, type{id,name,state,completed,description,detail,shortDetail}`. Competitor: `id, homeAway, team, score, winner, records, leaders` — [response_schemas.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/response_schemas.md)

### Inferences
- The site, common and core paths are generic across sports: only `{sport}/{league}` changes (e.g. `hockey/nhl`, `baseball/mlb`). The gist lists identical scoreboard/teams/news routes for NFL, NBA, MLB, NHL, WNBA and NCAA ([gist](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b)). Box-score labels and stat categories, however, are sport-specific.
- The best path for "team schedule and past results" is `teams/{id}/schedule?season=YYYY&seasontype=2`. **[unverified]** The `season` and `seasontype` params are my recollection and were not cited.

### Gaps
- No live NBA status table: the audit says NBA was probed but gives no per-endpoint results.
- No source confirmed an NBA depth-chart response. NBA depth charts are thin on ESPN to begin with.
- I found no doc for a site-level "team stats" endpoint (`teams/{id}/statistics`). Core `seasons/{y}/types/{t}/teams/{id}/statistics` is used by hoopR.

## 2. Odds: pickcenter, odds, core odds, propBets, historical

### Takeaway
Game lines (spread, total, moneyline, with an `open` block) are available both in summary `pickcenter`/`odds` and on core `competitions/{id}/odds`. The core API also advertises `odds/{provider}/propBets` and `odds/{id}/history/{betType}/movement`. Those routes are listed in ESPN's WADL but not live-verified or documented, so treat player props and line history from ESPN as experimental. Wrappers fall back between pickcenter and core odds because pickcenter is often empty.

### Cited Findings
- Core odds item fields: `provider{id,name,priority}`, `details` (e.g. "BOS -5.5"), `overUnder`, `spread`, `overOdds`, `underOdds`, `awayTeamOdds`, `homeTeamOdds`, `open`. Team odds carry `favorite`, `underdog`, `moneyLine`, `spreadOdds`. `open` has `over.value`, `under.value`, `spread.home.line` — [response_schemas.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/response_schemas.md)
- Provider IDs: DraftKings 41, FanDuel 37, Caesars 38, BetMGM 58, ESPN BET 68, Bet365 2000. The core odds endpoint takes `provider.priority`, `page`, `limit` — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API), [basketball.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/basketball.md)
- Advertised but undocumented core odds routes: `.../odds/{id}`, `/head-to-heads`, `/predictors`, `/propBets`, `/odds/{oddId}/history/{betType}`, `/history/{betType}/movement`, `competitors/{c}/odds/{oddsId}/similarities`, `teams/{team}/ats`, `futures` — [core-endpoints.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/core-endpoints.md)
- The main pseudo-r README does not document `propBets` for any sport — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)
- hoopR `espn_nba_betting` reads summary keys `pickcenter`, `againstTheSpread`, `predictor`. The pickcenter columns include `provider_id`, `away_team_odds_team_id`, `home_team_odds_team_id` (after `clean_names`). `againstTheSpread` contains `team` and `records`. `predictor` contains `homeTeam.id`, `awayTeam.gameProjection`, `awayTeam.teamChanceLoss`. If pickcenter is empty, hoopR calls `.espn_basketball_pickcenter_fallback()` — [hoopR source](https://raw.githubusercontent.com/sportsdataverse/hoopR/main/R/espn_nba_data.R); [hoopR betting docs](https://search.r-project.org/CRAN/refmans/hoopR/html/espn_nba_betting.html)
- sportsdataverse-py (NFL) reads pickcenter `spread`, `overUnder`, `homeTeamOdds.favorite`, sorted by `provider.id`. If pickcenter has 0-1 entries it falls back to core odds, preferring the "ESPN BET" provider. If both are missing it uses hardcoded defaults (spread 2.5, total 55.0 or 55.5) — [sportsdataverse-py nfl_pbp.py](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-py/main/sportsdataverse/nfl/nfl_pbp.py)
- Summary keys handled for NFL: `boxscore, format, gameInfo, drives, leaders, broadcasts, predictor, pickcenter, againstTheSpread, odds, winprobability, header, scoringPlays, videos, standings` (plus `news`, `shop`) — [nfl_pbp.py](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-py/main/sportsdataverse/nfl/nfl_pbp.py)
- Team ATS and odds records: `seasons/{y}/types/{t}/teams/{id}/ats` and `/odds-records` — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)

### Inferences
- The wrappers' fallback logic and hardcoded defaults show that ESPN odds are incomplete for some games, both historical ones and some current ones. A betting tool should store odds snapshots itself rather than expect ESPN to keep them.
- **[unverified]** In my recollection, the summary `pickcenter` usually has one entry per provider, with `details`, `spread`, `overUnder`, `homeTeamOdds/awayTeamOdds.moneyLine`, and sometimes `open`/`current`/`close` sub-objects for newer games. For older seasons (pre-~2019) it is often empty or has only one provider. Check this against a live response.
- **[unverified]** `propBets` on core NFL/NBA events is reported in community threads to return player prop lines (athlete `$ref`, type, `current.target`, `odds`) for ESPN BET/DraftKings near game time. I found no citable confirmation of this.

### Gaps
- No source documents the field structure of `propBets` or the `history/movement` routes, or which seasons they cover.
- I found no citable statement on how far back ESPN historical odds go for NBA/NFL.

## 3. NFL specifics

### Takeaway
Use `scoreboard?seasontype=2&week=N&dates=YYYY` for weekly slates, `summary?event=` for box scores, and core `/plays` or CDN `playbyplay` for play-by-play. ESPN box scores do not include snap counts, and the sources I found don't confirm targets or weather fields. Use nflverse for snaps, targets and advanced stats.

### Cited Findings
- Weekly scoreboard examples: `scoreboard?week={n}&seasontype=2` and `scoreboard?seasontype=1&dates=2026&week=3` — [football.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/football.md), [gist comments](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b)
- Play-by-play: `https://cdn.espn.com/core/nfl/playbyplay?xhr=1&gameId={id}` and core `.../competitions/{id}/plays`. Plays have `id, sequenceNumber, text, clock.displayValue, period.number, team.id, scoreValue, scoringPlay` — [football.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/football.md), [response_schemas.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/response_schemas.md)
- The summary includes `drives`, `scoringPlays` and `winprobability` — [nfl_pbp.py](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-py/main/sportsdataverse/nfl/nfl_pbp.py)
- Weather and roof: sportsdataverse-py has no weather handling. It derives roof only from `gameInfo.venue.indoor` and notes "ESPN's summary names the venue but carries no roof" — [nfl_pbp.py](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-py/main/sportsdataverse/nfl/nfl_pbp.py)
- NFL boxscore stat labels are not documented in pseudo-r — [football.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/football.md)

### Inferences
- **[unverified, from prior knowledge]** NFL `boxscore.players[].statistics[]` categories are `passing` (C/ATT, YDS, AVG, TD, INT, SACKS, QBR, RTG), `rushing` (CAR, YDS, AVG, TD, LONG), `receiving` (REC, YDS, AVG, TD, LONG, TGTS), `fumbles`, `defensive`, `interceptions`, `kickReturns`, `puntReturns`, `kicking`, `punting`. Targets (TGTS) appear in receiving for recent seasons. Snap counts are absent. `gameInfo.weather` (temperature, conditionId, gust/precipitation) appears for some outdoor games but is inconsistent and often missing, especially for older games.

### Gaps
- No citable source confirms NFL box score labels, targets, or `gameInfo.weather` fields.

## 4. NBA specifics

### Takeaway
NBA summary box scores give per-player rows labelled MIN, FG, 3PT, FT, OREB, DREB, REB, AST, STL, BLK, TO, PF, +/-, PTS. Made-attempted values are strings like "7-15", and MIN is a string of whole minutes. DNP players are flagged with `didNotPlay` and a `reason`. Play-by-play is in summary `plays` and at CDN `playbyplay`.

### Cited Findings
- Boxscore player group: `team`, `statistics[].names`, `statistics[].athletes[]{athlete, didNotPlay, stats}`. NBA names: "MIN","FG","3PT","FT","OREB","DREB","REB","AST","STL","BLK","TO","PF","+/-","PTS" — [response_schemas.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/response_schemas.md)
- hoopR takes column names from `keys`, splits the "-" made-attempted fields, and converts minutes with `as.numeric`. Players are split on `didNotPlay`, and DNP rows keep `reason`. A code comment says "Payload presence replaces ESPN's unreliable header `boxscoreAvailable`", and validity is checked by testing whether athletes' rebounds parse as numeric — [hoopR source](https://raw.githubusercontent.com/sportsdataverse/hoopR/main/R/espn_nba_data.R)
- hoopR player box output includes `minutes` (numeric), `starter`, `ejected`, `did_not_play`, `reason`, `active` — [hoopR docs](https://search.r-project.org/CRAN/refmans/hoopR/html/espn_nba_player_box.html)
- Play-by-play: `https://cdn.espn.com/core/nba/playbyplay?xhr=1&gameId={id}` — [basketball.md](https://raw.githubusercontent.com/pseudo-r/Public-ESPN-API/main/docs/sports/basketball.md)

### Inferences
- The hoopR comment about the unreliable `boxscoreAvailable` flag, together with its numeric-rebounds validity check, fits the user's finding that some 2012-2018 NBA games have all-zero or empty player lines. Validate each game (e.g. sum of player PTS = team score, and sum of minutes ≈ 240 or more for OT) before using it in models.

### Gaps
- I did not confirm whether MIN is ever "MM:SS" rather than whole minutes.

## 5. Rate limits, reliability, terms, community usage

### Takeaway
There is no key and no published rate limit. Since about August 2026 (per gist comments), some users get 403 "You don't have permission to access" responses, which suggests throttling or bot protection. Cache aggressively and throttle requests. Undocumented changes happen (date ranges now return 400, v3 returns 404). ESPN's terms of use apply, and "public" means only that the endpoints are reachable, not that use is licensed.

### Cited Findings
- "No official limits are published. Excessive requests may be blocked." The APIs are "not officially supported and may change without notice." "Public" describes endpoint reachability, not permission to collect, reuse, or redistribute data — [pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)
- Reported 403s since about Aug 5. Workarounds reported: waiting 2-3 minutes between requests, changing the User-Agent, or using the `site.web.api.espn.com` host. These are anecdotal — [gist comments](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b)
- Users have reported incorrect data (e.g. team locations and arena info), and the only fix route is slow ESPN support — [gist comments](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b)
- sportsdataverse-py appends a millisecond cache-buster to summary requests — [nfl_pbp.py](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-py/main/sportsdataverse/nfl/nfl_pbp.py)
- During a live NFL game the header's final score is null — [nfl_pbp.py](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-py/main/sportsdataverse/nfl/nfl_pbp.py)
- ESPN hosts were unreachable from this research sandbox's network. Cloud and egress restrictions may also affect the app's hosting (observed by this researcher).

### Inferences
- Main community references: pseudo-r/Public-ESPN-API (the most complete, with a dated live audit), the akeaswaran gist, and the sportsdataverse wrappers (hoopR, wehoop, cfbfastR, sportsdataverse-py), whose source code is the best guide to real-world quirks.

### Gaps
- I found no quantified rate limit, such as requests per minute.

## 6. Free fallbacks for gaps

### Takeaway
- NFL: nflverse GitHub releases (Parquet/CSV) cover play-by-play, snap counts (via PFR), NextGen Stats, FTN charting and participation for free.
- NBA: stats.nba.com is the fallback, but it often hangs from cloud IPs. cdn.nba.com live endpoints are reported as unprotected.
- Odds: The Odds API free Starter plan has 500 credits/month, which suits current lines but not historical props.

### Cited Findings
- nflreadr (R) and the nflverse-data releases provide snap counts with `pfr_player_id`, `offense_snaps`, `offense_pct`, `defense_snaps`, `st_pct` — [nflreadr snap count dictionary](https://repo.miserver.it.umich.edu/cran/web/packages/nflreadr/vignettes/dictionary_snap_counts.html), [nflreadr CRAN](https://archive.linux.duke.edu/cran/web/packages/nflreadr/index.html)
- Release URL pattern: `snap_counts/snap_counts_{season}.parquet`. Assets include ftn_charting, espn_data, players and pbp_participation, and NGS data is split by stat category — [third-party script using nflverse releases](https://huggingface.co/spaces/jsolow/YFDashboard/blob/73860b5500daacf9043595fce772bc8951c572fd/src/queries/nflverse/github_data.py)
- stats.nba.com: datacenter IPs (AWS, GCP, Azure) are reported to hang or be dropped, Akamai TLS fingerprinting is reported, and browser-like headers are needed. nba_api supports proxy, headers and timeout settings. cdn.nba.com live endpoints are reportedly unprotected — [nba npm README](https://www.github.com/bttmly/nba), [HN comments](https://news.ycombinator.com/threads?id=gek0z), [nba_api PyPI](https://pypi.org/project/nba_api/1.6.0)
- The Odds API's free Starter plan gives 500 credits/month with no card required. Historical cost = 10 × markets × regions. Player props need per-event calls. Sources conflict on whether historical data is available on the free tier; one says it goes back to June 6, 2020. These are competitor/review sources — [oddspapi blog](https://oddspapi.io/blog/?p=2967), [sportsgameodds compare](https://sportsgameodds.com/compare/the-odds-api), [sportsapis.dev review](https://sportsapis.dev/apis/the-odds-api)

### Inferences
- **[unverified]** Other free options I know of: nflverse `schedules`/`games.csv` (Lee Sharpe's), which includes closing spread_line, total_line and moneylines back to about 1999 and is a strong free source of historical NFL closing lines; nflverse `load_nextgen_stats()`; Basketball-Reference/Pro-Football-Reference (scraping limits and terms apply); Kaggle NBA odds datasets; and sportsbookreviewsonline historical odds archives (availability has changed over time).

### Gaps
- I could not reach the-odds-api.com docs directly to confirm free-tier historical/props entitlements. The cited claims come from competitor sites.
- I found no reliable free source of historical NBA player-prop lines.
