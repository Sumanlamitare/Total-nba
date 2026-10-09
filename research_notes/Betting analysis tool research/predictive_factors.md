# Predictive Factors for NBA and NFL Player Props and Team Results

Research notes, compiled 2026-10-09. Method note: several primary sources could not be fetched directly in this session (fivethirtyeight.com, nfeloapp.com, arxiv.org, and web.archive.org failed DNS or were blocked). Findings for those sources come from search-result excerpts of the pages, not full reads, and are marked "(excerpt)". Treat exact numbers from excerpts as needing verification before they are hard-coded into a model.

## NBA player props: which factors hold up (minutes, usage, pace, opponent defense/DvP, rest, home/away, blowout risk, teammates out, last-5 vs season, head-to-head)?

### Takeaway
The practitioner consensus is that projected minutes are the core driver of NBA counting-stat props, and injuries/rest, role changes, matchups and blowouts are the main things that move minutes. Opponent shooting-percentage defense (especially opponent 3P%) is mostly noise. I found no rigorous public study that ranks these factors by predictive power for props, so most of the evidence here is practitioner opinion plus adjacent team-level research.

### Cited Findings
- RotoGrinders lists four main drivers of rotation and minutes changes: injuries/rest, role changes, matchups, and blowouts. When a starter sits, the rest of the lineup absorbs those minutes. — [RotoGrinders: Accurately Predicting Minutes](https://rotogrinders.com/lessons/accurately-predicting-minutes-1144471); [RotoGrinders: Projected Minutes, the Most Critical Opportunity Stat](https://rotogrinders.com/lessons/projected-minutes-the-most-critical-opportunity-stat-in-nba-dfs-3147006)
- One DFS analyst's baseline minutes formula is 0.75 × season minutes per game + 0.25 × last-5 minutes per game, then adjusted for injuries and expected blowouts. This is an example of shrinking recent form toward the season average, not a validated weight. — [RotoGrinders: Projecting Minutes](https://rotogrinders.com/lessons/projecting-minutes-1149307)
- Injuries to key players raise teammates' usage rates, and injury reports directly determine projected playing time and usage for the remaining players. Lineup news often breaks very close to tipoff. — [RotoWire: Projected Minutes and Lineup Data Explained](https://www.rotowire.com/basketball/article/nba-projected-minutes-explained-fantasy-basketball-97473)
- Opponent 3P% defense is mostly noise. KenPom argues that even end-of-season opponent 3P% is "significantly more noise than skill", and that the true-skill gap between top and bottom teams is only about 1 to 2 percentage points. A defense's real control is over how many threes opponents take (3PA rate), not their make rate. — [KenPom: 3-point defense should not be defined by opponents' 3P%](https://kenpom.com/blog/3point-defense-should-not-be-defined-by-opponents-3p/) (college data; flag that it is NCAA and older)
- An NBA shot-quality analysis found 3-point efficiency allowed is largely luck, while defenses have more control at the rim. Year-to-year correlation for wide-open 3P% showed no meaningful persistence. — [BestBallStats: The Keys to a Successful NBA Defense](https://bestballstats.com/2021/12/27/the-keys-to-a-successful-nba-defense)
- Counterpoint: shot location matters, since corner threes are made at a higher rate than above-the-break threes, so a defense that limits corner threes can have some real effect. — [CelticsBlog 2017](https://www.celticsblog.com/2017/10/4/16369788/luck-scheme-boston-celtics-three-point-defense-brad-stevens-marcus-smart-jaylen-brown)
- Basketball Index says every stat has its own stabilization point ("padding value"). Blocks stabilize much faster than 3P%. Lineup data needs hundreds of minutes before it predicts future results, and their fix is to blend a few hundred minutes of league-average results with the observed data. — [BBall Index: Creating More Predictive Stats](https://www.bball-index.com/creating-more-predictive-stats/); [BBall Index: Making More Reliable Lineup Data](https://www.bball-index.com/making-more-reliable-lineup-data/)
- The NBA rest effect is real but modest at team level. A 1999-2000 study estimated about 2.26 points for back-to-back vs 3+ days of rest, and only that comparison was significant (old). — [Dylan Small, NESSIS 2007](https://www.nessis.org/nessis07/Dylan_Small.pdf)

### Inferences
- Factor hierarchy for v1 (my synthesis; not ranked by any single study): (1) projected minutes, (2) usage/role, including redistribution when teammates are out, (3) pace (possessions per game scales all counting stats), (4) blowout risk from the spread (cuts starters' minutes), (5) rest/back-to-back (small direct effect, larger through reduced minutes and DNP risk), (6) opponent defense, but only the stable parts: opponent pace, opponent 3PA rate and rim-attempt allowance, rebounding rates. Down-weight or ignore opponent 3P% and opponent FG% allowed, and treat raw "defense vs position" (DvP) tables with suspicion, because they are small-sample, position labels are fuzzy, and they mix in shooting-luck noise.
- Rate stats are more stable than counting stats: points per minute and usage stabilize faster than per-game totals, which swing with minutes. Model props as minutes × per-minute rate × a pace adjustment.
- Head-to-head player history against one opponent (often 2 to 4 games a season, with changing rosters) is too small a sample to beat the season rate. Treat it as noise unless there is a structural reason, such as a specific matchup defender. No source found that tests this directly for NBA props.
- Home/away for individual props is likely a small effect, given that team-level home-court advantage has shrunk (see next section).

### Gaps
- No peer-reviewed or rigorous public study found that quantifies the out-of-sample predictive value of DvP, opponent defensive rating, or last-5 form for NBA player props specifically.
- I could not retrieve Basketball Index's actual per-stat stabilization numbers (e.g., how many games until usage, 3P%, or rebound rate stabilize). Cleaning the Glass's methodology pages did not come up.
- No source quantifying usage redistribution, such as how much of an absent star's usage goes to each teammate type, was found. Practitioners compute it from on/off splits, which needs play-by-play or lineup data.

## NBA team bets: net rating, pace, rest/travel, home-court advantage size, last-5 form vs season, head-to-head?

### Takeaway
NBA home-court advantage has fallen a lot. FiveThirtyEight's long-standing value was about 100 Elo points, or about 3.5 points, and 2014-15 home win rates were already around 54%. Rest and travel effects are real but modest, and the market may already price them. Betting on or against streaks (recent form) shows no consistent profitability in the academic literature.

### Cited Findings
- FiveThirtyEight's NBA Elo used a home-court edge of 100 Elo points, about 3.5 NBA points, and noted that high-altitude teams (Denver, Utah) historically had slightly larger edges. (excerpt) — [FiveThirtyEight: How We Calculate NBA Elo Ratings](https://fivethirtyeight.com/features/how-we-calculate-nba-elo-ratings/)
- FiveThirtyEight's 2015-16 CARM-Elo added a linear travel-distance penalty (Boston to LA cost about 16 Elo points, about 2 percentage points of win probability) and a linear altitude bonus (Denver about 47 Elo points). It is unclear whether later RAPTOR-era models kept these. (excerpt) — [FiveThirtyEight: How Our 2015-16 NBA Predictions Work](https://fivethirtyeight.com/features/how-our-2015-16-nba-predictions-work)
- The home win rate fell from 61.2% (2011-12) to 53.7% (2014-15), the lowest in modern NBA history at that time. Long-run figures: 68.5% in 1976-77 and 62.8% in 2002-03. — [ESPN: Home-court advantage decline](https://africa.espn.com/nba/story/_/id/12241619/home-court-advantage-decline)
- AP's 2023-24 season wrap characterized home-court edge as close to nonexistent that season, alongside record 3-point volume. — [AP via KSAT, Apr 2024](https://www.ksat.com/sports/2024/04/14/inside-the-nba-numbers-lots-of-comebacks-no-home-court-edge-3s-went-up-scoring-went-down/)
- Research links the decline partly to the growth of 3-point shooting, which reduces referee/foul influence. — [UW-Milwaukee](https://uwm.edu/news/?p=80398); [Harvard Sports Analysis, 2017](https://harvardsportsanalysis.org/2017/03/nba-home-court-advantage-is-in-decline-are-3s-to-blame/)
- Ashman, Bowman & Lambrinos (2010, Journal of Sports Economics, 19 seasons): home teams on the second night of a back-to-back, facing a visitor with 1 to 2 days' rest, performed poorly against the spread. The effect was larger when the home team had traveled east 1 to 2 time zones between games. This is evidence of a historical market inefficiency, but the data is old. — [IDEAS/RePEc](https://ideas.repec.org/a/sae/jospec/v11y2010i6p602-613.html)
- Rest differences explained only about 9% of home-court advantage in the season studied (old, 1999-2000 data). — [Dylan Small, NESSIS 2007](https://www.nessis.org/nessis07/Dylan_Small.pdf); see also [Wharton NBA rest/HCA paper](https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Nba.pdf)
- A 2024 paper reviewing the rest literature notes that NBA rest research is well established (Esteves 2021, Yang 2021, Charest 2021, Cook 2022, Bowman 2023). It cautions that point spreads may already absorb rest effects and that earlier pro-rest analyses used small samples and selective endpoints. (excerpt) — [arXiv 2408.10867](https://www.arxiv.org/pdf/2408.10867)
- Streaks/recent form: Paul, Weinbach & Humphreys (2011) found NBA teams on streaks attract significantly more bets, but betting against the hot hand does not win more than market efficiency implies. Byrnes & Farinella (2001-2013 data) found the opposite: betting with hot teams was significantly profitable. The literature is split. — [Paul et al. 2011](https://ideas.repec.org/p/ris/albaec/2011_016.html); [Byrnes & Farinella, The Sport Journal](https://thesportjournal.org/article/the-effect-of-momentum-on-the-nba-point-spread-market/)
- Lineup/net-rating data needs hundreds of minutes before it is predictive, so it should be blended with a prior. — [BBall Index](https://www.bball-index.com/making-more-reliable-lineup-data/)

### Inferences
- For v1, team strength should be a season-long, possession-adjusted rating (net rating, or margin of victory adjusted for opponent, à la Massey/SRS) that is regressed toward the mean early in the season and adjusted for who is actually playing. Last-5 form should get only a small weight, mainly as a proxy for roster or health changes.
- Use a home-court value of roughly 2 to 3 points rather than the old 3.5. The exact current value should be estimated from your own recent-season data, because the sources here stop at 2024.
- Team head-to-head records within a season (3 to 4 games) are too small a sample and too confounded by roster and rest to be useful beyond what the ratings already capture.
- Rest, travel and back-to-backs: include them as small point adjustments (on the order of 1 to 2 points for a back-to-back versus rested), but expect closing lines to already price most of this.

### Gaps
- No source found giving an exact home-court point value for 2024-25 or 2025-26.
- Could not verify whether FiveThirtyEight's final RAPTOR-based model retained travel and altitude or added a rest adjustment, because the methodology page was unreachable.
- No direct test found of last-5 vs season net rating as predictors of next-game margin.

## NFL player props: snap share, target share, air yards, routes run, carry share, red-zone usage, opponent EPA allowed, game script, weather, QB changes, injuries?

### Takeaway
Opportunity (target share, air-yards share, carry share, snaps/routes) is the most stable and predictive input. Target share and air-yards share reportedly stabilize in about 3 games, and combining them (WOPR) predicts better than targets alone. Weather matters mainly through wind: little effect below about 10 to 15 mph, a steep drop in passing volume and field-goal accuracy/distance above about 20 mph.

### Cited Findings
- Air yards plus targets predict better than targets alone (Josh Hermsmeyer's research). WOPR (Weighted Opportunity Rating) blends target share and air-yards share, weighted more toward target share, because that mix best predicted fantasy scoring. It must be scaled by team passing volume. — [CBS Sports: How should I use air yards](https://www.cbssports.com/fantasy/football/news/2019-fantasy-football-draft-prep-how-should-i-use-air-yards-in-my-research-process/); [NBC Sports: Why receiver air yards matter](https://nbcsports.com/fantasy/football/news/article-numbers-why-receiver-air-yards-matter)
- Target share and air-yards share stabilize after about 3 games (RotoViz-based analysis), so early-season volume is a usable basis for forecasts. — [CBS Sports: Advanced Stats 101](https://www.cbssports.com/fantasy/football/news/fantasy-football-advanced-stats-101-the-best-new-age-data-to-consider-and-what-to-avoid)
- Since 2017, WRs at 20%+ target share averaged 14.7 fantasy points per game, vs 8.3 for those at 10 to 20%. WRs with 30%+ air-yards share averaged 14.4. — [PlayerProfiler WR advanced stats guide](https://www.playerprofiler.com/article/playerprofilers-guide-to-nfl-advanced-stats-metrics-vol-2-wide-receivers/)
- Targets per route run (TPRR) is a commonly used efficiency-of-opportunity metric. It requires route data, which comes from charting services. — [Ben Gretch: WTPRR takeaways](https://bengretch.substack.com/p/team-by-team-wtprr-takeaways)
- Wind: passing production (volume) falls more than passing efficiency, and the drop from 15-20 mph to 20+ mph is about 1.5 to 2 times larger than earlier steps. At 20+ mph, average field-goal attempt distance falls about 7 yards and conversion about 6%. Coaches attempt shorter kicks in wind, so raw make rates understate the effect. — [Covers: How weather affects betting](https://www.covers.com/nfl/how-weather-affects-betting)
- Wharton analysis of nflfastR play-by-play: rushing EPA exceeds passing EPA in extreme winds (35+ mph). — [Wharton 2022 Football Parks/Weather](https://wsb.wharton.upenn.edu/wp-content/uploads/2022/09/2022_Football_Parks_Weather.pdf)
- Winds below about 10 mph have essentially no measurable scoring effect (practitioner claim). — [DeucesCracked](https://www.deucescracked.com/blog/nfl-weather-betting-wind-totals-handicapping); a Stanford student project also found weather affects passing and FG attempts — [Stanford STATS50](https://web.stanford.edu/class/stats50/projects16/Houghton-BerryParkPierce-paper.pdf)
- Garbage-time plays (decided win probability) are less predictive of future EPA. nfelo down-weights plays by win probability. This matters for props, because garbage-time volume inflates trailing teams' passing stats. (excerpt) — [nfelo: Weighted EPA methodology](https://www.nfeloapp.com/analysis/weighted-epa-methodology-and-performance/)

### Inferences
- v1 structure for NFL props: team projected plays (from pace and the game total) × pass rate (from the spread: favorites run more, trailing teams pass more) × player share (target share, carry share, smoothed over recent weeks plus season) × per-opportunity efficiency (yards per target, yards per carry, strongly regressed to the mean) × weather multipliers (wind ≥15 to 20 mph for passing and kicking).
- Red-zone usage drives touchdown props, but TD counts are very noisy. Use red-zone or inside-10 share, not past TD totals.
- QB changes and injuries reset team pass volume and target distribution. In v1, when the QB or WR1 changes, shrink historical shares more aggressively toward a positional prior.
- Opponent pass/run defense EPA allowed is a reasonable adjustment, but defensive metrics are less stable than offensive ones (see team section), so apply them with heavy regression.

### Gaps
- No published stability numbers found for snap share, routes run, or carry share (in games-to-stabilize terms), beyond the about-3-games claim for target share and air-yards share.
- No rigorous study found on the size of the effect of opponent EPA allowed on individual player props.
- Temperature and precipitation effects were not quantified in the sources found. Only wind had concrete numbers.

## NFL team bets: EPA/play, success rate, home-field advantage size, rest/byes/short weeks, travel/time zones, last-5 form, head-to-head?

### Takeaway
EPA/play (with garbage time down-weighted) is the standard efficiency measure, and offensive and passing efficiency are more predictive than defensive or rushing efficiency. NFL home-field advantage has roughly halved: home win rates of about 52 to 53% since 2019 versus 57 to 60% historically, and the typical market value has dropped from 3 points toward about 1.5. Rest effects are disputed and are likely priced in.

### Cited Findings
- Home teams have won about 52 to 53% since 2019, down from about 57 to 60% historically. Typical home spread value has dropped from 3 to about 1.5 points (secondary source, 2026). — [FantasyNerds, Sep 2026](https://fantasynerds.com/news/story/2026/09/01/nfl-home-field-advantage-shrinks-shifting-betting-strategies-1613008); see also [Covers: NFL home-field advantage 2025](https://www.covers.com/nfl/home-field-advantage)
- In 2024, home teams had the higher PFF team grade in only 53% of regular-season games, mirroring their win rate. — [PFF: NFL home teams are winning less](https://www.pff.com/news/nfl-home-field-advantage-pff-data)
- An academic survey (NFL, NCAA, high school) finds home advantage declining in the NFL and top college football, but not in amateur football. — [arXiv 2401.16392](https://arxiv.com/abs/2401.16392); also [Hawkblogger: The Disappearing NFL Home Field Advantage](https://www.hawkblogger.com/2024/11/the-disappearing-nfl-home-field-advantage.html)
- Offensive performance is more predictive than defensive performance, so nfelo weights offense more heavily (slope of about 1.6 on its EPA tiers chart). (excerpt) — [nfelo EPA Tiers](https://www.nfeloapp.com/nfl-power-ratings/nfl-epa-tiers/)
- Defenses are generally unstable year to year. — [Sports Illustrated](https://www.si.com/nfl/commanders/onsi/news/nfl-epa-power-rankings-2019-week-1-xsacks-top-rb-wr-qb); FiveThirtyEight tested whether year-to-date EPA/play predicted next-game EPA (2006 to 2018); its conclusion was that a strong defense "doesn't mean it's going to stay good". (excerpt) — [FiveThirtyEight: The Patriots defense is good, that doesn't mean it's going to stay good](https://fivethirtyeight.com/features/the-patriots-defense-is-good-that-doesnt-mean-its-going-to-stay-good/)
- Passing offense is more predictive of future success than rushing offense (described as the analytics-community consensus). — [theScore: How one NFL advanced statistic is going mainstream](https://www.thescore.com/nfl/news/2193857)
- Garbage-time EPA is less predictive. Weighting plays by win probability improves prediction. (excerpt) — [nfelo: Weighted EPA](https://www.nfeloapp.com/analysis/weighted-epa-methodology-and-performance/)
- Rest: a 2024 arXiv paper on NFL rest argues that earlier pro-rest findings relied on small samples and selective endpoints, and that point spreads may already absorb rest effects. (excerpt; full paper not read) — [arXiv 2408.10867](https://www.arxiv.org/pdf/2408.10867)
- Streaks: NFL bettors bet significantly more on teams on ATS winning streaks, but betting with or against streaks does not earn profits (Paul, Weinbach & Humphreys 2014). Older work (1983-1992) found fading winning teams profitable, which is likely arbitraged away since. — [IDEAS/RePEc, JSE 2014](https://ideas.repec.org/a/sae/jospec/v15y2014i6p636-649.html); [Bettor belief in the hot hand (NFL)](https://metatoc.com/papers/9649-bettor-belief-in-the-hot-hand-evidence-from-detailed-betting-data-on-the-nfl)

### Inferences
- v1 team model: an opponent-adjusted, garbage-time-filtered EPA/play rating (offense weighted more than defense, passing more than rushing), blended with a preseason prior that fades over about 6 to 8 weeks, plus a QB adjustment (the starting QB is the single biggest roster variable), a home-field value of about 1 to 1.5 points, and small rest and travel tweaks.
- Last-5 form: in a 17-game season it is a third of the sample, but it is still noisy. Use it only through the rating's natural updating, not as a separate factor. Head-to-head (1 to 2 games a year, different rosters) is noise.

### Gaps
- Could not access FiveThirtyEight's NFL Elo methodology page (home-field Elo points, bye/rest adjustment, QB adjustment sizes, travel), nflfastR documentation, or Ben Baldwin's stability analyses directly. These should be read before finalizing weights.
- No precise current home-field value in points (e.g., from 2023 to 2025 results) from a primary source was found. The 1.5-point figure is from a secondary betting-news source.
- Exact year-over-year or split-half correlations for EPA/play and success rate were not retrieved.

## How much does a 5-game window or a single head-to-head game tell you (stability over N games)?

### Takeaway
Very little on its own. Every stat has its own stabilization point. Volume and opportunity stats (minutes, usage, target share) stabilize quickly (a few games). Shooting percentages, especially 3P% and opponent 3P%, need very large samples. The standard technique is to shrink observed values toward a prior (league or season average) with a stat-specific padding.

### Cited Findings
- Stabilization method: add N "padding" units of league-average performance to the observed sample. If a stat stabilizes at 100 units and you have 100 units, use a 50/50 blend. — [Baseball Prospectus](https://legacy.baseballprospectus.com/a/14293); applied to basketball by [BBall Index](https://www.bball-index.com/creating-more-predictive-stats/)
- Blocks stabilize much faster than 3P%. Lineups need hundreds of minutes. — [BBall Index](https://www.bball-index.com/creating-more-predictive-stats/); [BBall Index lineups](https://www.bball-index.com/making-more-reliable-lineup-data/)
- NFL target share and air-yards share stabilize in about 3 games. — [CBS Sports](https://www.cbssports.com/fantasy/football/news/fantasy-football-advanced-stats-101-the-best-new-age-data-to-consider-and-what-to-avoid)
- Even full-season opponent 3P% is mostly noise. — [KenPom](https://kenpom.com/blog/3point-defense-should-not-be-defined-by-opponents-3p/)
- Practitioner minutes formula weights season 75% / last-5 25%. — [RotoGrinders](https://rotogrinders.com/lessons/projecting-minutes-1149307)
- Betting markets show bettors overweight streaks, but there is no consistent profit from following or fading them. — [Paul et al. 2011](https://ideas.repec.org/p/ris/albaec/2011_016.html); [Paul et al. 2014](https://ideas.repec.org/a/sae/jospec/v15y2014i6p636-649.html); [Gambling on Momentum, arXiv 2211.06052](https://arxiv.org/pdf/2211.06052)

### Inferences
- Recommended v1 rule: use an exponentially weighted or blended estimate (e.g., about 70 to 80% season/prior, 20 to 30% last 5) for opportunity stats. Use much heavier regression for efficiency/shooting stats. Never use single-game head-to-head results as a standalone factor.
- Because bettors overweight recent streaks, last-5 and head-to-head factors are more likely to be already over-priced by the market than under-priced.

### Gaps
- No NBA-specific table of games-to-stabilize per stat (usage, points per minute, rebound rate, assist rate) was found. It would need to be computed from game logs with split-half correlations.

## Public, documented models and how they weight factors

### Takeaway
Public models are built on a season-long strength rating (Elo or margin-of-victory, or EPA/play), updated game by game and regressed to the mean, plus small explicit adjustments for home field, travel, altitude, rest and, in the NFL, the QB. None weight head-to-head records or simple last-5 records as separate inputs.

### Cited Findings
- FiveThirtyEight NBA Elo: home edge 100 Elo points (about 3.5 points). The CARM-Elo version added linear travel-distance (Boston to LA about 16 Elo points) and altitude (Denver about 47 Elo points) adjustments. (excerpt) — [How We Calculate NBA Elo](https://fivethirtyeight.com/features/how-we-calculate-nba-elo-ratings/); [How Our 2015-16 NBA Predictions Work](https://fivethirtyeight.com/features/how-our-2015-16-nba-predictions-work)
- nfelo: EPA/play with win-probability weighting to remove garbage time, and offense weighted more heavily than defense. (excerpt) — [nfelo Weighted EPA](https://www.nfeloapp.com/analysis/weighted-epa-methodology-and-performance/); [nfelo EPA Tiers](https://www.nfeloapp.com/nfl-power-ratings/nfl-epa-tiers/)
- nflfastR / rbsdm.com (Ben Baldwin and Sebastian Carl) provides free play-by-play with EPA, win probability, CPOE and similar fields, and dashboards. — [theScore](https://www.thescore.com/nfl/news/2193857)
- KenPom-style ratings: tempo-free (per-possession) offensive and defensive efficiency, adjusted for opponent. KenPom's own research says to judge defense by shot-volume suppression, not opponent make rates. — [KenPom blog](https://kenpom.com/blog/3point-defense-should-not-be-defined-by-opponents-3p/)
- Practitioner prop/DFS models: minutes projection × per-minute production, adjusted for injuries (usage redistribution), blowouts and pace. — [RotoGrinders](https://rotogrinders.com/lessons/projected-minutes-the-most-critical-opportunity-stat-in-nba-dfs-3147006); [RotoWire](https://www.rotowire.com/basketball/article/nba-projected-minutes-explained-fantasy-basketball-97473)
- Opportunity models (WOPR = target share + air-yards share, weighted toward targets). — [CBS Sports](https://www.cbssports.com/fantasy/football/news/2019-fantasy-football-draft-prep-how-should-i-use-air-yards-in-my-research-process/)

### Inferences: data availability (free box score from ESPN vs richer data)
- **Computable from free ESPN box scores / game logs:** minutes, points/rebounds/assists/3PM, FGA/FTA, which gives approximate usage (FGA + 0.44·FTA + TOV share of team) and team possessions/pace (FGA − ORB + TOV + 0.44·FTA); offensive/defensive/net rating; home/away; rest days and back-to-backs (from the schedule); travel distance (from arena coordinates); game spread/total (ESPN shows odds on many games); NFL carries, targets, receptions, yards, TDs, and therefore target share and carry share; final scores for Elo/SRS ratings; injury status (ESPN injury reports).
- **Needs richer data:** EPA/play and success rate (free via nflverse/nflfastR play-by-play, not ESPN box scores); air yards (nflfastR has them); snap share (nflverse snap counts, from PFR); routes run and TPRR (paid charting: PFF, FantasyPoints); red-zone shares (computable from nflfastR play-by-play); NBA on/off and lineup data, shot location / rim and corner 3 frequency, defensive matchup data (NBA.com stats API, Cleaning the Glass, PBP Stats); weather (separate API, e.g., Open-Meteo, at stadium coordinates, flag domes).
- These data-availability points come from my general knowledge of these data products and were not verified from sources in this session.

### Gaps
- Could not read FiveThirtyEight's final RAPTOR methodology or NFL Elo QB-adjustment details. Could not read MIT Sloan or JQAS papers directly. Unabated, Pinnacle and Action Network research pieces on prop modeling did not appear in searches.
