# Commercial Sports-Betting Research Tools: Signals, Screens and Pick Ranking (NBA/NFL focus)

Research note, compiled 2026-10-09. Method caveat: WebFetch and direct HTTP were blocked in this environment (DNS failures, 403 from the proxy) for every product site tried: propsdotcash.beehiiv.com, fantasylife.com, apps.apple.com, actionnetwork.com, unabated.com, betsmart.co and substack.com. Every finding below therefore comes from search-engine result snippets and summaries, not full page reads. Treat exact column names, thresholds and prices as "reported by source X". Most sources are vendor marketing or affiliate reviews that use promo codes, and they are flagged where it matters.

## 1. Which products lead the space and what does each show on a prop or game page?

### Takeaway
The market splits into two families:
- **Hit-rate and trend research tools** (Props.Cash, Outlier Premium, Linemate, PropsMadness) show L5/L10/L20/season hit rates against the line, vs-opponent history, defense vs position (DvP) and situational splits.
- **Projection, odds and EV tools** (BettingPros, Action Network PRO/Action Labs, Dimers, FTN, Rotowire, OddsJam, Unabated, Outlier Pro) compare a model projection or a de-vigged sharp-market price with the book line and output an edge %, an EV % or a grade.

The 2026 affiliate reviews consistently rank Props.Cash best for pure prop research and Outlier best for breadth (props plus game lines plus EV).

### Cited Findings
**Props.Cash**
- The trends dashboard shows season hit rate plus L20, L10 and L5 hit rates for each player and prop, along with a "vs. opponent" hit rate and a last-two-seasons hit rate. Cells are color-coded green or red. — [Props.Cash newsletter, NBA dashboard feature](https://propsdotcash.beehiiv.com/p/propscash-newsletter-new-nba-feature). The post says "2023 hit rate", so it is likely from the 2023-24 season, which is older info.
- A "D vs. Pos" column ranks each team's defense against each position for a given stat (30th = most allowed, 1st = fewest). — [Props.Cash newsletter](https://propsdotcash.beehiiv.com/p/propscash-newsletter-new-nba-feature)
- The vs-opponent view shows prop performance against the night's opponent back to the 2021-22 season. The newsletter argues that for NHL props, "sometimes it can be as simple as looking at history vs. opponent". — [Props.Cash newsletter](https://propsdotcash.beehiiv.com/p/propscash-newsletter-two-ways-recommend-putting-propscash-use)
- BetSmart calls it a deeper research tool that adds advanced filters, deeper statistics, line shopping and projections on top of hit-rate data, and lets users filter data by specific scenarios. — [BetSmart newsletter, Summer 2025](https://betsmart.beehiiv.com/p/player-prop-betting-summer-2025)
- The app listing claims "1,000+ props sorted by value" and odds comparison across sportsbooks. A third-party listing says it is "not strictly a line aggregator". — [parse.gl Props.Cash](https://www.parse.gl/brands/props-cash)
- Reported price is $19.99/month or $199.99/year with a 7-day free trial. Reviewers find its bar charts, color-coded hit rates and last-N filters quicker to read than Outlier's, but it has no game lines (spreads, moneylines, totals), no +EV feed and no arbitrage. — [XCLSV Props.Cash vs Outlier 2026](https://xclsvmedia.com/props-cash-vs-outlier-premium-2026-best-19-99-month-ev-tool-sharp-bettors/); [BetSmart Outlier vs Props.Cash 2026](https://www.betsmart.co/comparison-tool/outlier-vs-props-cash)
- App Store reviewers praise the L5/L10/L20 hit rates, matchup grades and opponent data, and say it helps find unders as well as overs. — [worldsapps review aggregation](https://worldsapps.com/reviews-props-cash-player-props-data)

**Outlier (outlier.bet)**
- Coverage includes NBA, NFL, NHL, NCAAB, NCAAF, MLB, WNBA and soccer (coverage list dated January 2025). Features include Trending Picks, "Sports Book Checkout" (sends picks to a sportsbook app) and Supporting Stats. Prop breakdowns cover performance against lines in terms of minutes, scoring composition and fouls. The props database filters by prop type, player, over/under, odds, alt lines, live status and hit rate. — [Outlier App Store listing](https://apps.apple.com/us/app/-/id6443885102)
- Splits include "without a key teammate" and "against bottom 10 defenses" (via the "Outlier Strategies" filters). Other reported splits are performance vs power-ranked defenses and position-vs-defense, meaning how similar players at the position performed against this defense recently. — [Outlier App Store](https://apps.apple.com/us/app/outlier-smart-sports-betting/id6443885102); [XCLSV Outlier review](https://xclsvmedia.com/outlier-review/); [OddsShark Outlier review 2025](https://www.oddsshark.com/sports-betting-products/outlier)
- Hit-rate colors are reported as Green ≥65%, Yellow 45-65% and Red <45%. Hit rates can be sorted by L5, L10, a specific season or head-to-head. — [WinDaily Outlier review](https://windailysports.com/reviews/outlier-bet/); [Picks & Parlays Outlier review 2026](https://picksandparlays.net/reviews/ai-picks/outlier-bet). The search summary attributes these, but I could not open the pages to confirm which review says which.
- The Pro tier is a "top-down" edge-hunting product (Positive EV, Arbitrage, Boosts & Middles), priced at $129.99/mo as of April 2025. A line-movement tracker shows how odds moved after release. Premium is about $19.99/mo. — [Building Bankroll newsletter, Apr 2025, claims non-affiliate](https://buildingbankroll.beehiiv.com/p/sports-betting-newsletter-april-21-through-27-2025); [similarweb Outlier listing](https://similarweb.com/app/apple/6443885102); [XCLSV](https://xclsvmedia.com/props-cash-vs-outlier-premium-2026-best-19-99-month-ev-tool-sharp-bettors/)
- Outlier's help center has strategy articles, such as one on first-quarter props. — [help.outlier.bet](https://help.outlier.bet/en/articles/12843963-how-to-bet-on-first-quarter-props)

**BettingPros (FantasyPros family)**
- 1-5 star ratings on player props, spreads and totals (premium feature). Ratings are "determined by projections, expected value and advanced modeling". — [BettingPros App Store](https://apps.apple.com/app/id1468109182); [BettingPros 5-star picks article](https://www.bettingpros.com/articles/best-prop-bets-today-5-star-picks-for-friday-10-2/)
- The Prop Bet Analyzer shows a projection, **Cover Probability** and **Expected Value**. The PrizePicks Cheat Sheet adds historical Over %. — [FantasyPros blog: Prop Bet Analyzer](https://blog.fantasypros.com/8-24-2022-bettingpros-prop-bet-analyzer/) (2022, older); [FantasyPros PrizePicks cheat sheet](https://blog.fantasypros.com/prize-picks-cheat-sheet/)
- Articles combine signals, for example "5-star props that also have a 100% hit rate over L5". An L15 hit-rate filter exists. — [BettingPros 5-star article](https://www.bettingpros.com/articles/best-prop-bets-today-5-star-picks-for-friday-7-24/amp/)

**Action Network PRO / Action Labs**
- Sean Koerner's Action Analytics team publishes prop projections for NFL, NBA, MLB, NHL, CFB, CBB and WNBA. Software compares them with live prop odds in real time and shows the edge **as both a percentage and a letter grade**. The Props Tool also line-shops across books. — [Action PRO tools & projections](https://www.actionnetwork.com/general/action-pro-picks-tools-projections); [Action Labs Super Bowl props hub](https://www.actionnetwork.com/nfl/action-labs-super-bowl-insiders-hub-player-props-betting-projections)
- Game-side signals include "Sharp Action" (picks drawing respected bettors), "Big Money" (large wagers) and money% vs ticket% with a DIFF column. "Bet Signals" live in sister product Sports Insights. — [Action Network Sharp Money 101](https://www.actionnetwork.com/education/sports-betting-sharp-money-professional-picks); [Action PRO subscription page](https://www.actionnetwork.com/general/action-pro-betting-subscription-picks-tips)

**Dimers and FTN (simulation models)**
- Dimers runs each game "10,000 times" by Monte Carlo and compares the simulated probability with the book's implied probability to get an "edge". Example from 1/4/2026: Royce O'Neale over 2.5 threes at +148, model probability 52.3%, edge 12.0%. — [Dimers NBA props 1/4/2026](https://www.dimers.com/news/nba-player-props-sunday-01-04-2026-ac-4e84f110-e931-11f0-a295-bf7a8c463419); [Dimers 2022 props article](https://www.dimers.com/nba/news/nba-player-props-bets-for-wednesday-december-14-2022) (older); [Dimers WNBA launch](https://www.ciphersports.io/press/dimers-launches-wnba-sports-betting-product-ahead-of-2024-season)
- FTN reports an "Edge %" (projection vs line) plus EV from a 10,000-simulation model. — [FTN Fantasy](https://ftnfantasy.com/?p=38650)

**Rotowire Picks & Props**
- Combines book lines, DFS pick'em lines, Rotowire projections and hit rate into **one score from -100 to +100** that leans MORE or LESS, with real-time injury and playing-time updates (launched June 2024, older). — [Business Wire press release](https://www.businesswire.com/news/home/20240611703354/en); [Silicon UK copy](https://www.silicon.co.uk/press-release/rotowire-launches-picks-props-app-to-capitalize-on-the-growing-fantasy-pickem-market-and-players-prop-market)

**OddsJam / Unabated / SharpStack (market-based EV screens)**
- OddsJam's EV tool flags line discrepancies against a sharp book such as Pinnacle or a consensus market average. Users can choose the de-vig method (for example liquidity-weighted). — [Rotowire OddsJam review](https://www.rotowire.com/news/best-betting-strategy-for-the-long-term-get-a-7-day-free-trial-for-sharp-money-97444); [Breaking AC: best +EV finders, Jan 2026](https://breakingac.com/news/2026/jan/07/best-positive-ev-bet-finders-free-paid-options/)
- Example from an OddsJam-promoted Rotowire piece: BetMGM Nembhard under 1.5 threes at -115 vs a market fair price of -138, reported as an 8.34% edge. — [Rotowire best EV NBA bet](https://www.rotowire.com/basketball/article/best-ev-nba-bet-today-grab-this-player-prop-before-its-too-late-109113)
- The "Unabated Line" is a proprietary vig-free consensus line from the sharpest books. A competitor says it blends Bookmaker, Circa and 3et plus a Pinnacle-proxy feed ("Sharp Book P"). That claim comes from a competitor and is unverified. — [Dealroom Unabated profile](https://app.dealroom.co/companies/unabated_products); [SportsGameOdds vs Unabated](https://sportsgameodds.com/compare/unabated)
- 4for4's SharpStack includes Plus EV, Arbitrage and Pick'em tools. — [4for4 SharpStack walkthrough](https://www.4for4.com/sharpstack-walkthrough-plus-ev-arbitrage-and-pickem-tools)
- Unabated has an NBA prop product and strategy post ("Fine Tune Your NBA Prop Betting Strategy Using Unabated NBA"), but I could not read its contents. — [Unabated](https://unabated.com/post/fine-tune-your-nba-prop-betting-strategy-using-unabated-nba)

**Others**
- Linemate: "advanced player prop trends", a custom analysis workstation with hit rates and performance charts, and a parlay builder with cross-book odds. — [Linemate listing](https://spark.mwm.ai/en/apps/linemate-find-your-next-bet/1635246793)
- PropsMadness: Trustpilot reviewers praise its filters and matchup data, and one calls it the most elite tool for NBA and WNBA. The company replies to reviews, so treat the praise as promotional. — [Trustpilot PropsMadness](https://uk.trustpilot.com/review/propsmadness.com)
- PFF Player Prop Tool (NFL), launched September 2025, built on route-level data and "Share of Predicted Targets" / "Share of Predicted Air Yards", which PFF says are more stable than actual targets. — [PFF betting](https://www.pff.com/betting?offset=120); [PFF players trending toward more targets](https://www.pff.com/news/week-11-fantasy-football-players-trending-toward-more-targets)
- BallparkPal (MLB) is a simulation site. Its park ratings combine wind, humidity, air density and park layout, and its park-factor model is trained on more than 1M batted balls and 20,000 games since 2016 (powers VSiN's Park Factors). — [Beginner's guide BallparkPal review](https://tennesseev.substack.com/p/beginners-guide-29-ballpark-pal-review); [VSiN park factors](https://vsin.com/projections-park-factors/)

### Inferences
- A typical commercial prop page has five parts:
  - a header with player, prop, line, best odds and book
  - a bar chart of the last N games against the line
  - hit-rate tiles for L5, L10, L20, season, H2H and last season
  - DvP rank for the opponent
  - split filters such as home/away, with/without teammate and vs top/bottom defenses
- Premium tiers add a projection, an edge %, a grade and a +EV/odds screen.
- The game-bet side (Action, Outlier, BettingPros) uses public ticket % vs money %, sharp-action flags, line movement and model projections for spread and total.
- No NBA/NFL equivalent of BallparkPal turned up. Dimers and FTN are the closest simulation-based analogues.

### Gaps
- I could not open and verify exact column lists for Props.Cash, Outlier, PropsMadness, Linemate or LineStar. LineStar and FantasyLabs did not appear in any results.
- No official methodology was found for BettingPros stars, Action grades (scale and thresholds), Outlier "Trending Picks" or Props.Cash "sorted by value".

## 2. Which signals do they display?

### Takeaway
Nearly universal:
- hit rate vs the line over L5/L10/L20/season
- vs-opponent (H2H) hit rate
- DvP rank
- home/away
- with/without-teammate splits
- line shopping

Common in premium tiers: projections, minutes and usage, line movement, sharp vs public money, alt lines and +EV.

NFL-specific opportunity metrics (snap share, route participation, target share, predicted targets) appear mainly in PFF, Fantasy Points and RotoGrinders-type tools. Weather and referee data are rarely documented for prop tools.

### Cited Findings
- **Hit rates L5/L10/L20/season/last 2 seasons/vs opponent; DvP rank** — [Props.Cash newsletter](https://propsdotcash.beehiiv.com/p/propscash-newsletter-new-nba-feature)
- **With/without key teammate, vs bottom-10 defenses, vs power-ranked defenses, position-vs-defense** — [Outlier App Store](https://apps.apple.com/us/app/outlier-smart-sports-betting/id6443885102); [XCLSV Outlier review](https://xclsvmedia.com/outlier-review/)
- **Minutes, scoring composition, fouls in prop breakdowns; alt lines; live status filter** — [Outlier App Store listing](https://apps.apple.com/us/app/-/id6443885102)
- **Line movement tracker** — [similarweb Outlier](https://similarweb.com/app/apple/6443885102)
- **Ticket % vs money %, Sharp Action, Big Money** — [Action Network Sharp Money 101](https://www.actionnetwork.com/education/sports-betting-sharp-money-professional-picks)
- **Injury and playing-time updates folded into the score** — [Rotowire release](https://www.businesswire.com/news/home/20240611703354/en)
- **Minutes is the core prop driver.** Guides say minutes is "the single most predictive stat for most player props". Worked example: at 0.8 points per minute, moving from 32 to 36 minutes takes expected points from 25.6 to 28.8 against a 27.5 line. — [propellerpicks NBA prop guide](https://propellerpicks.com/guides/nba-prop-betting/); [leans.ai NBA prop strategy](https://leans.ai/nba-player-prop-strategy/). Both are vendor guides.
- **Teammate-out usage redistribution.** Vendor guides say books reprice the injured star's props immediately but lag on the second and third "cascade beneficiaries", for a claimed 30-60 or 30-90 minutes. One source instead claims about 80% of the adjustment happens within the first hour. No independent data was found. — [nbabettingsystem injury impact](https://nbabettingsystem.com/articles/nba-injury-impact-on-betting-lines/); [nba-bets.com prop strategy](https://nba-bets.com/articles/nba-player-props-betting/)
- **NFL opportunity metrics:** route rate is the share of team passing routes a player runs. Snap share matters more for RBs, and route share matters more for WRs and TEs. — [RotoGrinders NFL Usage Tool FAQ](https://rotogrinders.com/articles/nfl-usage-tool-faq-3949823); [Fantasy Points Data Suite 2024](https://fantasypoints.com/nfl/articles/2024/fantasy-points-data-suite-new-tools); [TheLines: snap share, air yards & 7 stats for NFL props](https://www.thelines.com/nfl/player-props/snap-share-air-yards-more-7-stats-that-matter-for-nfl-prop-bets-this-week/)
- **Predicted targets and air-yards share (more stable than actuals)** — [PFF](https://www.pff.com/news/week-11-fantasy-football-players-trending-toward-more-targets)
- **Weather:** documented for BallparkPal in MLB (wind, humidity, air density). No result documented weather inputs in NFL prop tools, including PFF. — [BallparkPal review](https://tennesseev.substack.com/p/beginners-guide-29-ballpark-pal-review); [PFF search result, no weather found](https://www.pff.com/betting?offset=120)
- **Sharp book differs by market.** BetSmart argues Pinnacle is sharp on game lines but a weaker benchmark for NBA props, so check which book is sharpest in each market before de-vigging. — [BetSmart: finding EV](https://betsmart.beehiiv.com/p/finding-expected-value-for-profit)

### Inferences
- Pace, usage rate, rest and back-to-backs, travel and referee tendencies are widely discussed in strategy guides. In this search I found no product page explicitly confirming them as displayed columns, but they likely exist as filters or contextual notes.
- Free reproducibility, judged from general knowledge of public data and not verified in this session:
  - **Easy** (from free box scores, schedules and play-by-play: nba_api/stats.nba.com, Basketball-Reference, nflverse/nflfastR): hit rates, H2H, DvP, home/away, rest and B2B, pace, usage, minutes, team last-5 and vs-opponent records, with/without splits
  - **NFL snap share:** nflverse snap counts
  - **Target share:** play-by-play
  - **Weather:** free weather APIs plus stadium roof data
  - **Hard or paid:** route participation (charted, PFF/FTN/Fantasy Points), live multi-book prop odds and line movement (free tiers of The Odds API-type services are limited), sharp-book feeds (Pinnacle, Circa) and ticket/money %

### Gaps
- No confirmed product documentation for referee-tendency or travel-distance columns in NBA/NFL prop tools.
- Exact DvP methodology is unknown: whether it is position-based on listed positions and over what window.

## 3. How do they score, grade or rank picks?

### Takeaway
There are three ranking paradigms:
1. **Trend-based:** hit-rate color bands, "streaks", sorting by L-N hit rate.
2. **Projection vs line:** edge % and grades (Action), stars (BettingPros), cover probability plus EV, simulated probability vs implied probability (Dimers, FTN).
3. **Market-based EV:** de-vigged sharp or consensus fair odds vs a soft book's odds (OddsJam, Unabated, Outlier Pro).

Rotowire blends lines, projections and hit rate into a single score from -100 to +100. No vendor publishes full formulas.

### Cited Findings
- **Hit-rate color bands:** green ≥65%, yellow 45-65%, red <45%. — [WinDaily Outlier review](https://windailysports.com/reviews/outlier-bet/)
- **BettingPros:** 1-5 stars from "projections, expected value and advanced modeling", plus Cover Probability and EV. No published weights. — [BettingPros article](https://www.bettingpros.com/articles/best-prop-bets-today-5-star-picks-for-friday-10-2/); [FantasyPros blog](https://blog.fantasypros.com/8-24-2022-bettingpros-prop-bet-analyzer/)
- **Action:** edge shown as % and as a grade, from projection vs the current line. — [Action PRO](https://www.actionnetwork.com/general/action-pro-picks-tools-projections)
- **Dimers:** edge = model probability vs the book's implied probability. In the O'Neale example at +148, implied ≈ 40.3% and model 52.3%, which gives the "12.0%" edge, so the edge appears to be the percentage-point difference. — [Dimers 2026](https://www.dimers.com/news/nba-player-props-sunday-01-04-2026-ac-4e84f110-e931-11f0-a295-bf7a8c463419). The arithmetic is mine: 100/248 = 40.3%.
- **Rotowire:** -100 to +100 MORE/LESS score from book lines, DFS lines, projections and hit rate. — [Business Wire](https://www.businesswire.com/news/home/20240611703354/en)
- **De-vig methods:**
  - proportional (normalize implied probabilities to 100%)
  - power
  - Shin, described as the most common choice for sharp consensus
  - liquidity-weighted (offered in OddsJam)

  — [OddsPapi no-vig guide](https://oddspapi.io/blog/?p=3089); [SharpAPI no-vig](https://sharpapi.io/learn/what-is-no-vig-odds); [Breaking AC](https://breakingac.com/news/2026/jan/07/best-positive-ev-bet-finders-free-paid-options/)
- **Simple DIY simulation:** a public student project runs 10,000 simulations per prop from a season of NBA game logs and defines edge as true probability minus the probability implied by the odds. — [Beating Vegas NBA Prop Bet Simulator](https://mattg5.quarto.pub/matthew-goodwin/posts/NBA%20Prop%20Bet%20Simulator/NBABetAnalysis.html)
- **Open-source examples** of building a props +EV scanner in Python with odds APIs. These are vendor blog posts. — [SportsGameOdds blog](https://sportsgameodds.com/blog/build-a-player-props-analyzer-with-python-and-the-sports-game-odds-api); [OddsPapi props value scanner](https://oddspapi.io/blog/?p=2929)

### Inferences
- For a personal tool, the defensible ranking is:
  1. Project the stat distribution (minutes × per-minute rate, adjusted for opponent, pace and teammate absences).
  2. Compute P(over).
  3. Compare it with the de-vigged market probability, using the sharpest available book or consensus.
  4. Rank by EV % = p × decimal_odds − 1.
- Hit-rate tiles should be supporting context, not the ranking key.
- A Rotowire-style composite score is easy to build but mixes signals of very different reliability.

### Gaps
- No public weights or calibration and backtest results for any vendor's grades, stars or scores.
- No independent tracking of tool pick performance was found.

## 4. Known criticisms of hit-rate-based tools

### Takeaway
The main critiques are:
- tiny samples (5-10 games are close to noise)
- lines move to follow form, so a hit rate measured against old, lower lines overstates the edge against tonight's line
- hit rate ignores price and payout, so it is not ROI
- regression to the mean
- trends that lack causal context, data-mining, confirmation bias and gambler's or hot-hand fallacies

Most of these critiques come from vendor or education blogs. No peer-reviewed study of prop hit-rate tools was found.

### Cited Findings
- Books move lines to follow form ("a player on a scoring tear does not keep his old line"), so old hit rates against lower lines mislead. 5 games is a "coin-flip sample". — [EdgeBoard: how to read prop hit rates](https://www.edgeboard.live/learn/player-prop-hit-rates)
- "A prop can have a strong hit rate and a small edge" once the market has adjusted. — [Statsbench prop bet cheat sheet](https://blog.statsbench.com/prop-bet-cheat-sheet/)
- Standard error is about 15.8 percentage points at 10 games vs about 2.2 at 500. Regression to the mean is "a mathematical necessity". — [Wizard of Odds: EV in player prop betting](https://wizardofodds.com/article/expected-value-in-player-prop-betting/)
- Hit rate is a "vanity metric" that ignores payout size and ROI. — [techsparkignite "Why the Numbers Matter"](https://techsparkignite.com/?p=2222). Low-authority source.
- Trends based on records and line history have nothing predictive about the actual game. Example: a 19-game sample over 9 years is "miniscule". — [Ben Porter, "Trends are bullshit"](https://benporter.substack.com/p/trends-are-bullshit)
- Confirmation bias (picking trends that favor your side) and gambler's fallacy. — [VSiN: avoid confirmation bias and gambler's fallacy](https://vsin.com/how-to-bet/avoid-confirmation-bias-and-gamblers-fallacy/)
- Hot-hand reasoning: people treat streaks as evidence of a temporarily elevated true rate. — [arXiv 1803.08170](https://arxiv.org/pdf/1803.08170)
- Season-long prop studies use closing lines and assume the best number. Unders hit less often in 2022 than 2021 as the market got "a bit sharper". Macro over/under trends in NFL props "swing wildly" week to week. — [4for4 season-long props](https://www.4for4.com/2023/preseason/key-winning-season-long-player-props) (2023, older); [PFF weekly NFL props, 2020](https://www.pff.com/news/bet-nfl-betting-2020-week-14-monday-night-football-player-props) (2020, older)
- App aggregator summaries report recurring user complaints about "inaccurate betting data and prop predictions" and subscription cost for Outlier. — [Outlier App Store / aggregator summary](https://apps.apple.com/us/app/-/id6443885102). The aggregator's review counts were internally inconsistent.

### Inferences
- Survivorship and selection bias: tools surface the "hottest" hit rates across thousands of player-prop-window combinations. The top of that list is mostly noise by construction (multiple comparisons). No source quantified this. It follows from the sample-size math above.
- Mitigations for a personal tool:
  - show hit rate against the current line, recomputed from the game log, rather than past posted lines
  - show sample size and a confidence interval
  - show the implied probability and breakeven alongside it
  - show the median and margin vs the line
  - pair hit rate with minutes context (games where minutes were comparable)

### Gaps
- No Reddit r/sportsbook threads surfaced in searches, so the forum critique is not captured directly.
- No empirical study measured whether the market already prices displayed hit-rate trends.

## 5. Which features are most valued by bettors in reviews and forums?

### Takeaway
Reviewers and app-store users most often praise:
- fast, visual L5/L10/L20 hit-rate charts
- opponent/H2H and matchup (DvP) data
- with/without-teammate filters
- line shopping across books

More advanced users value +EV and arbitrage screens and line movement. Common complaints are cost (Pro tiers above $100/mo), data inaccuracies, and missing game lines (Props.Cash).

### Cited Findings
- Users praise Props.Cash's L5/L10/L20 hit rates, matchup grades, opponent data and usefulness for unders. — [worldsapps](https://worldsapps.com/reviews-props-cash-player-props-data)
- Reviewers rank Props.Cash highest for prop research visuals. "If 80%+ of your wagers are player props, Props.Cash is the better $20." Outlier is preferred for breadth. Verdicts conflict across affiliate sites. — [XCLSV](https://xclsvmedia.com/props-cash-vs-outlier-premium-2026-best-19-99-month-ev-tool-sharp-bettors/); [BetSmart Outlier vs Props.Cash](https://www.betsmart.co/comparison-tool/outlier-vs-props-cash); [BettorEdge comparison](https://www.bettoredge.com/post/props-cash-vs-other-prop-betting-tools)
- Outlier Pro's EV, arbitrage and boost tools are valued by "edge-hunters", but casual bettors may not need them at $129.99/mo. — [Building Bankroll, Apr 2025](https://buildingbankroll.beehiiv.com/p/sports-betting-newsletter-april-21-through-27-2025)
- PropsMadness reviewers value its filters and matchup data for NBA and WNBA. — [Trustpilot](https://uk.trustpilot.com/review/propsmadness.com)
- A 2026 ranking of player prop tools exists, but I could not read its contents. — [playerprops.ai best player prop tools](https://playerprops.ai/best-player-prop-tools); [BetSmart prop finder tools 2026](https://www.betsmart.co/articles/prop-finder-tools-guide)

### Inferences
- MVP for a personal tool, in priority order, based on what reviewers praise and the critiques in section 4:
  1. Player game-log chart vs the current line, with L5/L10/L20/season/H2H hit rates and sample sizes
  2. DvP and opponent context (pace, defensive rank)
  3. With/without-teammate splits plus minutes trend
  4. Odds from multiple books with implied probability and no-vig fair price
  5. A simple projection with P(over) and EV ranking
  6. Team cards (last-5 record, record vs the opponent, ATS/O-U, rest)
- Items 1-3 and 6 are fully reproducible with free data. Items 4-5 depend on odds access.

### Gaps
- Direct Reddit and YouTube sentiment was not retrieved, and all review sources found are affiliate or promotional.
- No review data was found on LineStar, FantasyLabs or Unabated user sentiment.
