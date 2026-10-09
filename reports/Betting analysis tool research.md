# Project the distribution, then price the line

A free, personal NBA/NFL betting tool should not copy the commercial "hit-rate dashboard" as its decision engine. It should copy the projection-vs-market design used by the EV-oriented products. For each prop or game it should project a full distribution: minutes or opportunity × a shrunken per-unit rate × pace and context. It should convert that into P(over)/P(cover), compare the result with the de-vigged sportsbook price, and rank by expected value. The user's requested views (team last-5 record, last-5 head-to-head, each player's last-5 games and last game against tonight's opponent) are all cheaply available from ESPN and belong on the screen as context. The evidence says they are mostly noise as predictors, and bettors already overweight them. ESPN's free API covers far more than the community docs suggested. A live probe on 2026-10-09 found that game summaries return `lastFiveGames`, `injuries`, `pickcenter`, `againstTheSpread` and (NFL only) a `predictor`. ESPN's core odds endpoint returned **1,394 NFL and 116 NBA player/team props** with open and current lines from one provider (ID 100), so a v1 can price props without a paid odds feed. The main limits are a single book (DraftKings; no line shopping and no sharp reference), no weather, no NFL snaps/routes/air yards, and no guarantee that ESPN keeps old lines. The tool must therefore snapshot odds itself, and that same habit makes honest evaluation by closing-line value possible. Every picked edge should be treated as unproven until a few hundred bets show positive CLV and a calibration check beats the market's own probabilities. A profit-and-loss verdict needs thousands of bets.

## Commercial tools split into trend dashboards and price engines

The paid market has two families, and the gap between them is the most useful design lesson for this project. **Hit-rate tools** (Props.Cash, Outlier Premium, Linemate, PropsMadness) center the page on a bar chart of the last N games against the line, hit-rate tiles for L5/L10/L20/season/vs-opponent, a defense-vs-position rank, and split filters. Props.Cash's dashboard shows season, L20, L10 and L5 hit rates, a "vs. opponent" rate and a D-vs-Pos column ([Props.Cash newsletter](https://propsdotcash.beehiiv.com/p/propscash-newsletter-new-nba-feature)). Outlier adds "without a key teammate" and "vs bottom-10 defenses" splits ([Outlier App Store](https://apps.apple.com/us/app/outlier-smart-sports-betting/id6443885102)) and colors hit rates **green at ≥65%, yellow 45-65%, red <45%** ([WinDaily](https://windailysports.com/reviews/outlier-bet/)). These products cost about **$20/month**, and reviewers praise them mostly for speed and visuals ([XCLSV](https://xclsvmedia.com/props-cash-vs-outlier-premium-2026-best-19-99-month-ev-tool-sharp-bettors/)).

**Price engines** take a different approach. Action Network's Props Tool compares in-house projections with live odds and shows the edge **as both a percentage and a letter grade** ([Action PRO](https://www.actionnetwork.com/general/action-pro-picks-tools-projections)). BettingPros shows a projection, a **Cover Probability** and **Expected Value**, and rolls them into 1-5 stars ([FantasyPros blog](https://blog.fantasypros.com/8-24-2022-bettingpros-prop-bet-analyzer/)). Dimers and FTN simulate each game **10,000 times** and report model probability minus implied probability. In one Dimers example, an over at +148 (implied 40.3%) carried a 52.3% model probability, a "12.0% edge" ([Dimers](https://www.dimers.com/news/nba-player-props-sunday-01-04-2026-ac-4e84f110-e931-11f0-a295-bf7a8c463419)). A third tier, made up of OddsJam, Unabated and Outlier Pro (**$129.99/month**), skips projections. It de-vigs a sharp or consensus market and flags soft books that disagree ([Building Bankroll](https://buildingbankroll.beehiiv.com/p/sports-betting-newsletter-april-21-through-27-2025); [Breaking AC](https://breakingac.com/news/2026/jan/07/best-positive-ev-bet-finders-free-paid-options/)). Rotowire mixes book lines, projections and hit rates into one −100 to +100 score ([Business Wire](https://www.businesswire.com/news/home/20240611703354/en)). No vendor publishes weights or audited results for its stars, grades or scores.

The criticism of hit-rate tools is concrete. Books move lines to follow form, so a player who "hit 8 of 10" mostly hit against older, lower lines, and 5 games is a "coin-flip sample" ([EdgeBoard](https://www.edgeboard.live/learn/player-prop-hit-rates)). The standard error of a hit rate is **about 15.8 percentage points at 10 games versus 2.2 at 500** ([Wizard of Odds](https://wizardofodds.com/article/expected-value-in-player-prop-betting/)). An 8-of-10 record therefore has a 95% interval of roughly 44-97%, which is consistent with a below-breakeven bet at −110 (breakeven 52.4%). Hit rate also ignores price: "a prop can have a strong hit rate and a small edge" ([Statsbench](https://blog.statsbench.com/prop-bet-cheat-sheet/)). Because these tools surface the hottest hit rates out of thousands of player-prop-window combinations, the top of the list is selected noise by construction. The personal tool should keep the visual strengths of trend dashboards (fast charts, splits, opponent context) and take its ranking logic from the price engines.

## What actually predicts outcomes is opportunity, not streaks

The research is clearest on what does *not* work. Academic studies of NBA and NFL betting markets find that bettors place significantly more money on teams riding streaks, but **betting with or against streaks earns no consistent profit** ([Paul et al. 2011](https://ideas.repec.org/p/ris/albaec/2011_016.html); [Paul et al. 2014, NFL](https://ideas.repec.org/a/sae/jospec/v15y2014i6p636-649.html)). One NBA study disagrees, finding hot teams were profitable in 2001-2013 ([Byrnes & Farinella](https://thesportjournal.org/article/the-effect-of-momentum-on-the-nba-point-spread-market/)). The literature is split, not supportive. Public models from FiveThirtyEight and nfelo are built on a season-long strength rating plus small home, travel and rest adjustments. None of them uses a head-to-head record or a last-5 record as a separate input ([FiveThirtyEight NBA Elo](https://fivethirtyeight.com/features/how-we-calculate-nba-elo-ratings/); [nfelo](https://www.nfeloapp.com/analysis/weighted-epa-methodology-and-performance/)). Because the betting public overweights recent form, last-5 and head-to-head signals are more likely to be over-priced by the market than under-priced.

### NBA props run on minutes

For NBA player props, the practitioner consensus is that **projected minutes are the core driver**. The main things that move minutes are injuries/rest, role changes, matchups and blowouts ([RotoGrinders](https://rotogrinders.com/lessons/projected-minutes-the-most-critical-opportunity-stat-in-nba-dfs-3147006)). The arithmetic is unforgiving. At 0.8 points per minute, moving from 32 to 36 minutes shifts expected points from 25.6 to 28.8 across a 27.5 line ([propellerpicks](https://propellerpicks.com/guides/nba-prop-betting/)). One DFS baseline sets minutes at **0.75 × season MPG + 0.25 × last-5 MPG**, then adjusts for injuries and expected blowouts ([RotoGrinders](https://rotogrinders.com/lessons/projecting-minutes-1149307)). This is a reasonable prior, not a validated weight. When a starter sits, teammates' usage rises, and lineup news often breaks close to tip ([RotoWire](https://www.rotowire.com/basketball/article/nba-projected-minutes-explained-fantasy-basketball-97473)). Vendor guides claim books lag on second- and third-order beneficiaries for 30-90 minutes, but no independent data backs that claim ([nbabettingsystem](https://nbabettingsystem.com/articles/nba-injury-impact-on-betting-lines/)).

Opponent defense matters only in its stable parts. Even full-season opponent 3P% is "significantly more noise than skill", with a true-skill spread of about **1-2 percentage points** between the best and worst teams. A defense really controls *how many* threes opponents take, not how many go in ([KenPom](https://kenpom.com/blog/3point-defense-should-not-be-defined-by-opponents-3p/)). Wide-open 3P% allowed shows no year-to-year persistence ([BestBallStats](https://bestballstats.com/2021/12/27/the-keys-to-a-successful-nba-defense)). Raw defense-vs-position tables mix that luck with fuzzy position labels and small samples. They should be shown, not trusted.

### NFL props run on shares

NFL props follow the same logic with shares in place of minutes. **Target share and air-yards share stabilize in about 3 games** ([CBS Sports](https://www.cbssports.com/fantasy/football/news/fantasy-football-advanced-stats-101-the-best-new-age-data-to-consider-and-what-to-avoid)). Combining them (WOPR) predicts better than targets alone ([CBS Sports](https://www.cbssports.com/fantasy/football/news/2019-fantasy-football-draft-prep-how-should-i-use-air-yards-in-my-research-process/)). Since 2017, WRs at a 20%+ target share averaged 14.7 fantasy points per game versus 8.3 at 10-20% ([PlayerProfiler](https://www.playerprofiler.com/article/playerprofilers-guide-to-nfl-advanced-stats-metrics-vol-2-wide-receivers/)). Weather matters mainly through wind. The drop in passing from 15-20 mph to 20+ mph is **1.5-2× larger than earlier steps**, and at 20+ mph field-goal distance falls about 7 yards and conversion about 6% ([Covers](https://www.covers.com/nfl/how-weather-affects-betting)). Garbage-time volume inflates trailing teams' passing stats and predicts the future less well ([nfelo](https://www.nfeloapp.com/analysis/weighted-epa-methodology-and-performance/)).

### Team strength, home edge and rest

At the team level, offense and passing efficiency are more predictive than defense and rushing. Strong defenses tend not to stay strong ([FiveThirtyEight](https://fivethirtyeight.com/features/the-patriots-defense-is-good-that-doesnt-mean-its-going-to-stay-good/); [nfelo EPA tiers](https://www.nfeloapp.com/nfl-power-ratings/nfl-epa-tiers/)). Home advantage has shrunk in both leagues:

- **NFL:** home teams have won about **52-53% since 2019**, down from 57-60%, and the market value of home field has dropped from about 3 points toward 1.5 ([FantasyNerds](https://fantasynerds.com/news/story/2026/09/01/nfl-home-field-advantage-shrinks-shifting-betting-strategies-1613008)). That source is secondary.
- **NBA:** home win rates fell from 61.2% (2011-12) to 53.7% (2014-15) ([ESPN](https://africa.espn.com/nba/story/_/id/12241619/home-court-advantage-decline)). The edge was near zero in 2023-24 ([AP via KSAT](https://www.ksat.com/sports/2024/04/14/inside-the-nba-numbers-lots-of-comebacks-no-home-court-edge-3s-went-up-scoring-went-down/)). FiveThirtyEight's old 3.5-point value is too high for current use.

Rest is real but small. An old study measured about 2.26 points for a back-to-back versus 3+ days of rest ([Small, NESSIS](https://www.nessis.org/nessis07/Dylan_Small.pdf)). A 2024 review cautions that point spreads likely already absorb rest effects ([arXiv 2408.10867](https://www.arxiv.org/pdf/2408.10867)).

### Small samples carry little weight

The thread connecting all of this is stabilization. Every stat needs its own sample size before observed values outweigh a prior. Blocks stabilize much faster than 3P% ([BBall Index](https://www.bball-index.com/creating-more-predictive-stats/)), and 3P% needs about **240 attempts of league-average padding** ([Medvedovsky](https://kmedved.com/2020/08/06/nba-stabilization-rates-and-the-padding-approach/)). A player's last 5 games hold roughly 150 minutes of data, far below the padding for noisy stats. A player's last game against one opponent is a sample of one. The user's requested views are not useless: a last-5 minutes jump can reveal a real role change. But they enter the model only through the shrunken estimators, never as standalone votes.

## ESPN's free API covers almost everything a v1 needs

The ESPN endpoints are unofficial, keyless and unversioned, but the 2026-10-09 live probe confirms they are richer than community docs claimed. Every route follows a `{sport}/{league}` path pattern (`football/nfl`, `basketball/nba`), so adding NHL or MLB later means changing only the path segment and the sport-specific stat labels ([pseudo-r/Public-ESPN-API](https://github.com/pseudo-r/Public-ESPN-API)). Where the live probe and the community docs disagree, the probe wins. The docs called `propBets` "experimental" and unconfirmed. The probe got **HTTP 200 with 1,394 NFL props and 116 NBA props from provider 100**, while providers 41 and 58 (DraftKings and BetMGM in the community provider list) returned 404. The NFL props carried athlete references, market types such as "Total Passing Yards (incl. overtime)", and **open and current targets** (e.g. 194.5 opening, 185.5 current). The NBA sample carried American/decimal odds with opening prices (e.g. a team total at −110, opened −120). The only odds provider listed on core odds for both leagues was DraftKings.

The table maps each requirement to the source that met it in the live run. Paths are relative to ESPN's site v2 (`site.api.espn.com/apis/site/v2/sports/{sport}/{league}/`), common v3 (`site.web.api.espn.com/apis/common/v3/...`) and core v2 (`sports.core.api.espn.com/v2/...`) hosts ([pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)).

| Need | Live-verified source (2026-10-09) | Notes |
|---|---|---|
| Slate, records, game line | `scoreboard`: competitor `records` (overall/home/road), `odds` (spread, total) | NBA and NFL |
| Team last 5 games | `summary?event=` → `lastFiveGames` (5 entries per team: opponent, result, score) | Direct fit for the user's request |
| Head-to-head, current season | `summary` → `seasonseries` (NBA only); NFL returned none | Last-5 meetings across seasons must be built from `teams/{id}/schedule` history |
| Game odds + movement | `summary` → `pickcenter` (spread, total, home ML); core `competitions/{id}/odds` with `open`/`current` blocks | Only DraftKings; completed NFL game kept its line, completed NBA preseason game's pickcenter was empty, so snapshot every line yourself |
| Player props | core `.../competitions/{id}/odds/100/propBets` | Open + current line; one book; no history guaranteed |
| Injuries | `summary` → `injuries`; league `injuries` (30/32 teams, with status and comments) | Per-team endpoint unreliable per docs; use league-wide |
| Player game logs | common v3 `athletes/{id}/gamelog` (NFL and NBA both 200) | Basis for last-5 stats and last-vs-opponent stats |
| Player splits | common v3 `athletes/{id}/splits`: NFL has Opponent, Location, Weather, Down; NBA has Month, Result, Position, Day, Opponent | Opponent split gives season-level vs-team numbers |
| Box scores | `summary` → `boxscore`: NBA MIN, PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK, OREB, DREB, PF, +/-; NFL passing/rushing/**receiving incl. TGTS**, kicking, defense | NFL team stats include total plays, drives, red-zone made-attempts, possession |
| ATS records | `summary` → `againstTheSpread` present; core `teams/{id}/ats` returned an empty list | Compute ATS and O/U from stored closing lines |
| Model benchmark | `summary` → `predictor` (NFL: e.g. 73.6% vs 26.2%); absent for NBA | Use as a comparison, not an input |
| Depth charts | `teams/{id}/depthcharts` (200 for both); hyphenated `depth-charts` returned `{}` | |
| Weather | absent from scoreboard and `gameInfo` in both leagues | Needs a separate free weather API at stadium coordinates (inference) |

Some gaps need other free sources. ESPN has no NFL snap counts, routes, air yards or EPA. nflverse releases provide snap counts (`offense_snaps`, `offense_pct`) and play-by-play for free ([nflreadr dictionary](https://repo.miserver.it.umich.edu/cran/web/packages/nflreadr/vignettes/dictionary_snap_counts.html)). For the NBA, stats.nba.com is the richer fallback but reportedly hangs from cloud IPs ([nba_api](https://pypi.org/project/nba_api/1.6.0)). The operational risks are real. There is no published rate limit, users have reported 403 blocks since about August 2026, and date-range queries now return HTTP 400 ([akeaswaran gist](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b)). Box scores can be silently broken: hoopR validates games by checking whether rebounds parse as numbers because ESPN's `boxscoreAvailable` flag is "unreliable" ([hoopR source](https://raw.githubusercontent.com/sportsdataverse/hoopR/main/R/espn_nba_data.R)). The tool should cache everything, request one day at a time, throttle requests, and reject games whose player points don't sum to the team score. "Public" means reachable, not licensed, so the tool should stay personal and should not redistribute data ([pseudo-r](https://github.com/pseudo-r/Public-ESPN-API)).

The single-book constraint shapes the math. Market-based EV tools assume a sharp reference such as Pinnacle, and even that is a weak benchmark for NBA props ([BetSmart](https://betsmart.beehiiv.com/p/finding-expected-value-for-profit)). With only DraftKings, the de-vigged DraftKings price is both the line being bet and the market's best guess. Edges against it will be small and must come from the projection, not from line discrepancies between books.

## The math converts a projection into an honest price

### Player rates and projected opportunity

Player projections should be built as **opportunity × rate**, with each rate shrunk toward a prior. The empirical-Bayes "padding" method adds k units of league-average (or the player's prior-season) performance to the observed sample: `r̂ = (x + k·r_prior)/(n + k)`. Here k is the stat's stabilization point, for example about 240 attempts for 3P% ([Medvedovsky](https://kmedved.com/2020/08/06/nba-stabilization-rates-and-the-padding-approach/)). Exponential decay with weights βᵃᵍᵉ inside that sum adds recency. The half-life is H = −log 2 / log β ([Luxenberg & Boyd](https://web.stanford.edu/~boyd/papers/pdf/ewmm.pdf)). No public study has validated a best half-life or last-5/season blend for NBA props, so these must be tuned by walk-forward backtests. Overdispersion in NBA shot counts comes largely from usage and minutes ([Squared Statistics](https://squared2020.com/2017/08/20/basics-in-negative-binomial-regression-predicting-three-point-field-goal-percentages/)), which is another reason to model rate and opportunity separately.

### Choosing a distribution

The projection becomes a probability through a distribution chosen by stat type and checked by holdout log loss:

- **Counts such as rebounds, assists, 3PM and receptions:** negative binomial when overdispersed, which reduces to Poisson as dispersion vanishes ([Binomial Basketball](https://medium.com/@BinomialBasketball/predicting-sensational-stats-pt-3-57df23affb0b)). Conditioning matters. NFL passing TDs looked overdispersed raw, but after conditioning on usage the Pearson dispersion fell to 0.95 and Poisson won on holdout log loss ([NFL_Predictor PR #26](https://github.com/Kevocado/NFL_Predictor/pull/26)).
- **Anytime-TD props:** derive them from the team's touchdown distribution: P = 1 − Σₖ P(N_team = k)(1 − q)ᵏ, where q is the player's share of team TDs. A binomial with n ≈ 11 drives fit team TDs better than a negative binomial ([Fantasy-football PR #34](https://github.com/gabjew90/Fantasy-football/pull/34)).
- **High-count stats (points, PRA, yards):** a normal or right-skewed continuous distribution is the practical default.
- **Pushes:** they exist only on whole-number lines and must be priced explicitly ([EdgeDeskSports PR #408](https://github.com/dsrackler17/EdgeDeskSports/pull/408)).

### Team ratings, spreads and totals

For game bets, FiveThirtyEight-style Elo is a documented baseline. It uses expected score E = 1/(1 + 10^(−ΔR/400)) and K = 20. NBA seasons revert 25% toward 1505 and NFL seasons one third toward 1500. Margin-of-victory multipliers damp autocorrelation: (MOV+3)^0.8/(7.5+0.006·ΔElo) for the NBA, and ln(|PD|+1)·2.2/(0.001·ΔElo+2.2) for the NFL ([Ergo Sum](https://www.ergosum.co/nate-silvers-nba-elo-algorithm/); [538 nfl-elo-game](https://github.com/fivethirtyeight/nfl-elo-game/blob/master/forecast.py)). Elo converts to points at **about 28 Elo per point** ([FiveThirtyEight WNBA](https://fivethirtyeight.com/methodology/how-our-wnba-predictions-work/)).

Spreads become win probabilities through a normal model of the margin. For the NFL, actual margin minus spread is about Normal(0, 13.86) per Stern, and later estimates are 13.2-13.45 ([Ruscio](https://ruscio.pages.tcnj.edu/files/2021/01/NFL-Win-Probability.pdf); [nflanalytic](https://nflanalytic.com/explainer-point-spread-accuracy.html)). The normal curve misprices key numbers, though. A 5-point favorite is modeled at 64.4% but won 59.7% ([arXiv 2212.08116](https://arxiv.org/pdf/2212.08116)), and 15.9% of 2000-2010 games landed on exactly 3 ([Wizard of Odds](https://wizardofodds.com/games/sports-betting/appendix/10/)). The NFL cover model needs an empirical, discrete margin distribution. No sourced NBA margin sigma was found, so it must be estimated from the tool's own stored closing lines.

### Odds math and staking

The odds math is standard:

- **Implied probability:** p = |A|/(|A|+100) for favorites and 100/(A+100) for underdogs.
- **Vig removal:** remove the vig by normalization. Shin's method is more accurate than basic normalization in academic tests, though the advantage shrinks in liquid markets ([Strumbelj 2014](https://www.researchgate.net/publication/264349990_On_determining_probability_forecasts_from_betting_odds)). At −500/+350, the favorite's fair probability ranges from 78.95% (multiplicative) to 80.56% (additive) ([Bet Hero](https://betherosports.com/blog/devigging-methods-explained)).
- **Expected value:** EV per unit = p·d − 1, where d is decimal odds.
- **Staking:** full Kelly f* = (bp − q)/b overbets when p is estimated rather than known. Half Kelly keeps about 75% of the growth with far less volatility, and quarter Kelly suits uncertain models ([arXiv 1701.02814](https://arxiv.org/pdf/1701.02814); [LineCuller](https://www.lineculler.com/articles/kelly-criterion-betting)).

Same-game parlay legs are correlated, so multiplying their probabilities misprices them ([OddsPapi](https://oddspapi.io/blog/?p=2955)). V1 should not build parlays.

### Evaluation

Evaluation is where most personal tools fool themselves. In one NBA study, selecting models by **calibration produced +34.69% average ROI versus −35.17% for accuracy-based selection** (single season, [Walsh & Joshi](https://researchportal.bath.ac.uk/en/publications/machine-learning-for-sports-betting-should-model-selection-be-bas/)). Results-based proof is slow. Reaching a Bayes factor of 100 takes about **3,500 bets** ([Pinnacle/Buchdahl](https://www.pinnacle.com/betting-resources/en/educational/part-two-using-bayes-factor-to-assess-betting-skill/nf52l4mwxxv7785g)), and practitioners ask for at least 700-1,000 bets with a significance test ([Trademate](https://www.tradematesports.com/en/blog/betting-experts-determine-whether-betting-results-luck-skill-part-3/)). Closing-line value has far lower variance and gives an earlier signal ([How Pros Bet](https://howprosbet.com/what-is-closing-line-value/)). That is why the tool must store the line it saw and the line at kickoff or tip.

## Recommended v1 algorithm design

The design below separates three layers. **Evidence-based signals** drive the projection and the ranking. **Market inputs** set the price being judged. **User-requested context** is computed and displayed every game day but never adds to the score directly. Exact weights not quoted from a source are starting values to be tuned by walk-forward backtests, and they are labeled as such.

### Daily pipeline

On each game day the tool runs in five steps. It pulls `scoreboard` for each league and date. For each event it pulls `summary` (lastFiveGames, injuries, pickcenter, seasonseries, againstTheSpread, predictor, boxscore), core `odds` and `odds/100/propBets`, and league `injuries`. It refreshes `gamelog` for every rostered player who has a posted prop or is not ruled Out. It stores every odds payload with a timestamp. It repeats the odds and injury pulls about 60-90 minutes before start and again as close to start as practical; the last pre-start pull serves as the closing line. Data validation runs before modeling: player points must sum to the team score, NBA minutes must sum to roughly 240 (plus overtime), and games with DNP-coach's-decision, ejection or injury exits under about 10 minutes are excluded from rate samples but kept for minutes-volatility estimates.

### Evidence-based signals and how each is computed

| Signal | Computed from (ESPN unless noted) | Computation in v1 | Basis |
|---|---|---|---|
| NBA projected minutes | gamelog MIN; injuries; spread | m₀ = 0.75·season MPG + 0.25·L5 MPG (start); then −x for back-to-back, −y in projected blowouts (\|spread\| ≥ ~10), + redistributed minutes when a same-position rotation player is Out; set to 0 if Out, flag if Questionable/Doubtful | RotoGrinders baseline; injury/blowout drivers |
| NBA per-minute rate (PTS, REB, AST, 3PM, etc.) | gamelog / box score | EW-weighted (half-life to tune, start ~15 games) per-minute rate, padded toward prior-season rate (itself regressed to positional mean) with stat-specific k estimated by split-half reliability; 3PM uses a 3PA-rate × 3P% decomposition with 3P% padded by ~240 attempts | Medvedovsky padding; BBall Index |
| Usage shift with teammates out | box scores (FGA, FTA, TO share of team) | With/without-teammate per-minute rate, shrunk heavily to the overall rate (few games) | RotoWire; usage-redistribution consensus |
| Pace | team box score stats | Poss = FGA − OREB + TO + 0.44·FTA; game pace factor = (pace_A + pace_B)/(2·league pace), using season-to-date EW pace | Standard formulation |
| Opponent adjustment (NBA) | opponent box scores | Only stable components: opponent rebounding rate allowed, 3PA rate allowed, FTA rate allowed; each regressed ≥50% to league mean. **Do not** use opponent 3P% or FG% allowed | KenPom; BestBallStats |
| NFL team plays and pass rate | team stats (total plays, drives); game total and spread | Projected plays from EW plays/game for both teams scaled by game total; pass rate shifted by spread (favorites run more) | Synthesis of game-script evidence |
| NFL player share | box score TGTS, CAR, REC; nflverse snaps optional | EW target share and carry share (stabilize in ~3 games), padded toward positional prior; reset/extra shrink when QB or WR1 changes | CBS/RotoViz stabilization |
| NFL efficiency | box score YDS per target/carry | Heavily regressed yards per target / per carry | Efficiency less stable than volume |
| NFL wind | free weather API at stadium coordinates; dome flag | Passing-volume and FG multipliers only above ~15 mph, steeper above 20 mph | Covers wind data |
| NFL TD props | team scoring, red-zone made-att, player TD share | Team TDs from implied team total via binomial (n ≈ drives); player anytime = 1 − Σ P(N=k)(1−q)ᵏ, q shrunk to role prior; never past TD counts | Fantasy-football PR #34 |
| Team strength | final scores (schedule history) | 538-style Elo: K = 20; NBA revert 25% to 1505, NFL revert ⅓ to 1500; MOV multipliers; spread = ΔElo/28 + HFA; HFA ≈ 2-3 pts NBA, 1-1.5 pts NFL as starting values to re-estimate | 538; home-edge decline studies |
| Rest/travel | schedule dates, venue cities | Small point adjustment for back-to-back (≈1-2 pts NBA) and short weeks; expect the market to price most of it | Small 2007; arXiv 2408.10867 |
| Game totals | team box scores | Points_A = poss × ORtg_A × DRtg_B/(100 × league rating); sum both teams | Standard formulation |

### From projection to probability against the line

Each player-stat projection μ is the projected opportunity times the shrunken rate times the pace and opponent factors. Its variance comes from the player's residuals around his *own past projections*, shrunk toward a stat-level variance-to-mean ratio, plus a minutes-uncertainty term: Var ≈ E[m]·r + r²·Var(m). The dispersion check and holdout log loss decide which distribution each stat gets:

- Points, PRA and yards use a normal distribution, or a gamma for low-volume receivers with mass near zero.
- Rebounds, assists, 3PM, receptions, completions and attempts use a negative binomial with mean μ and variance μ + μ²/r.
- Touchdowns use the team-TD formula.

P(over), P(under) and P(push) are computed at the exact posted line. On whole-number lines, pushes are refunded, so the comparison uses P(over)/(P(over)+P(under)). Spreads use the empirical NFL margin-minus-spread distribution (key numbers 3, 7, 10, 14) and a normal distribution for the NBA with σ estimated from stored closing-line residuals. Starting values are about 13.3 for the NFL and 11-12 for the NBA. Moneylines use the same margin distribution evaluated at zero.

The market probability comes from de-vigging the two-way DraftKings price, multiplicatively by default with Shin computed alongside. The tool then **blends toward the market in log-odds**: logit(p_final) = w·logit(p_model) + (1−w)·logit(p_market). The blend weight w starts low (0.3-0.5) and rises only if the model beats the market's log loss on held-out games. With one book, the honest assumption is that the market is right until the data proves otherwise.

### Ranking and staking

A pick qualifies only if all of the following hold:

- p_final − p_breakeven is **at least 3 percentage points** for props and at least 2 for game lines (starting thresholds).
- The player's injury status is known (not Questionable within 90 minutes of start unless the user accepts the risk).
- Projected minutes or share come from at least 5 valid games this season, or a padded prior is explicitly flagged.
- The line has not moved against the pick since it was captured.

Qualifying picks are ranked by **EV = p_final·d − 1**. A secondary sort uses a confidence tier from projection uncertainty: tight variance and stable role rank above volatile bench or committee players. Suggested stake is **quarter Kelly, capped at 1-2% of bankroll per bet** and a set total per slate. Only one bet per player-game is allowed in v1 so that correlated props don't stack. Parlays and same-game parlays are excluded until joint simulation exists.

### Context shown but not scored (the user's requested views)

These views are computed for every applicable player and team on game days and displayed next to each pick. They carry no weight in the score because the evidence above shows they are small samples, already priced by the market, or both.

| Context view | Source and computation | Why it is context, not signal |
|---|---|---|
| Team record, last 5 games (W-L, scores, ATS and O/U where stored lines exist) | `lastFiveGames` directly; ATS/O-U from the tool's own stored closing lines | Streak betting shows no consistent profit; ratings already absorb form |
| Team record vs opponent, last 5 meetings | NBA: `seasonseries` plus prior seasons' `teams/{id}/schedule`; NFL: schedule history across seasons (5 meetings can span ~3-5 years) | 1-4 games/year with changed rosters; no public model uses it |
| Each player's last 5 games stat lines | `gamelog`, last 5 events, with minutes alongside and the current line overlaid | ~150 minutes of data; role changes flow into the model via the EW minutes/rate, not the raw line |
| Each player's last game vs tonight's opponent | `gamelog` filtered by opponent; season-level `splits` Opponent category | Sample of one; matchup effects enter only through stable opponent factors |
| Hit rates L5/L10/L20/season/vs-opponent | Recomputed from gamelog against **tonight's** line, shown with n, a 95% binomial interval and the −110 breakeven (52.4%) | Standard error ~15.8 pp at 10 games; lines moved over the sample |
| Defense-vs-position rank, opponent 3P% allowed | Box score aggregation by listed position | Mostly shooting-luck noise and fuzzy positions |
| Line movement (open → current), ESPN predictor, injury notes | core odds `open`/`current`, propBets open target, `predictor`, injuries comments | Useful sanity checks; the predictor serves as an outside benchmark for calibration |

### How the model is evaluated and adjusted over time

Every displayed projection is logged with its timestamp, line, price, p_model, p_market, p_final, inputs and stake, whether or not it was bet. The closing snapshot is logged as well. The tool tracks four groups of measures:

1. **Mean CLV** against the de-vigged close and the percentage of picks that beat the close. This is the fast signal, readable after roughly 50-300 bets but not proof.
2. **Log loss and Brier score** of p_model and p_final versus the de-vigged closing probability. Beating the market's log loss is the bar for raising w.
3. **Reliability curves** by decile, by league and by stat type.
4. **P&L with a t-test**, with no conclusions before about 1,000 bets. At −110 and a 3% true edge, about 4,000 bets are needed for t ≈ 2.

Tuning runs walk-forward only, re-tuned monthly in season, on earlier data only. Its targets are the half-lives, padding sizes k, minutes-blend weights, dispersion parameters, σ values, home-court values and w. Features must use only games before the bet date, Elo ratings must update only through the previous game, and entry prices must be the stored bet-time lines.

The thresholds work in both directions. If a stat type shows negative CLV or poor calibration over 300 or more picks, it is demoted to display-only. If p_model consistently beats the market on held-out data, w rises in small steps. Adding a new sport means swapping `{sport}/{league}`, mapping the box-score labels, and choosing the distribution family for each stat. For example, Poisson/negative binomial fits naturally for hockey goals and shots. Elo, de-vigging, Kelly, CLV and calibration carry over unchanged.

## Conclusion

The tool's edge is limited by its single sportsbook. With only one book, there is no outside price to compare against, so any value has to come from projecting minutes, shares and injury effects better than that book does. ESPN's prop feed makes this testable for free. The decisive engineering choice is to log every line and every projection from the first day, because ESPN does not reliably keep old lines and the closing-line record is the only quick way to tell skill from luck. The user's requested context screens are worth building because they are cheap and help explain each pick. The scoring layer should treat them the way the evidence does: as stories the market has already read. Uncertainty remains around current home-court values, NBA margin variance and per-stat stabilization points. These are not known from public sources, and the tool will have to estimate them from its own data.
