# Model Math for a v1 NBA/NFL Betting Tool (Player Props + Spread/Total/Moneyline)

> Method note: direct page fetches (fivethirtyeight.com, pinnacle.com, football-data.co.uk, kmedved.com, GitHub raw) were blocked by this environment's egress proxy. Findings below come from search-engine extracts of those pages plus secondary sources. Where a number came only from a secondary/third-party source it is flagged. Formulas marked "(standard math)" in Inferences are textbook identities I derived, not quoted from a source.

## Q1. Player projections: recency weighting, rate x minutes, regression / shrinkage

### Takeaway
No public NBA study gives a validated "best" recency half-life or last-5/last-10/season blend; the sound, sourced approach is (a) project per-minute/per-possession rates, (b) shrink each rate toward a league/positional prior with a "padding" (empirical-Bayes) sample whose size depends on the stat's stabilization rate, and (c) tune any exponential-decay half-life yourself by rolling-origin backtests. Tiny windows (5 games, 1-3 head-to-head games) deserve very little weight.

### Cited Findings
- Padding approach = empirical-Bayes shrinkage: at any point, pad a player's observed performance with a fixed sample of league-average performance; the padded figure is the projection of true talent. For 3P% the padding is ~240 attempts of league-average shooting, i.e. projected 3P% = (makes + 240 x lgAvg) / (attempts + 240). Example: a player at mid-season with ~237 attempts gets ~half weight on his own data and ~half on the prior. — [Medvedovsky, NBA Stabilization Rates and the Padding Approach](https://kmedved.com/2020/08/06/nba-stabilization-rates-and-the-padding-approach/)
- Padding numbers are "actually the same thing as stabilization rates" (the sample size at which the observed stat and the prior get equal weight, i.e. reliability = 0.5); "there's nothing magical about the stabilization point, or about 50%" — padding keeps operating with declining influence. — [Medvedovsky](https://kmedved.com/2020/08/06/nba-stabilization-rates-and-the-padding-approach/)
- Methods for estimating stabilization: Kuder-Richardson 21 split-half reliability (Carleton, Blackport), or the point where in-season stats reach R^2 > 0.5 with end-of-season stats (Narsu). — [Medvedovsky](https://kmedved.com/2020/08/06/nba-stabilization-rates-and-the-padding-approach/)
- An empirical-Bayes treatment of NBA shooting using data from 1996-97 onward, pointing to Medvedovsky's work for comparison; notes results are sensitive to the threshold chosen. — [To The Mean, Empirical Bayes-ketball](https://www.tothemean.com/2020/09/06/empirical-bayes.html)
- Bayesian (beta-binomial) prediction of season 3P% from early-season stats is a documented worked example. — [yamahisa, Predict season 3P% by early stats and Bayesian inference](https://yamahisa.medium.com/predict-season-3p-by-early-time-stats-and-bayesian-inference-f493c420562d)
- Exponential weighting: forgetting factor beta relates to half-life H by H = -log 2 / log beta (beta^H = 1/2); shorter half-life reacts faster, longer uses more history. — [Luxenberg & Boyd, Exponentially Weighted Moving Models (Stanford)](https://web.stanford.edu/~boyd/papers/pdf/ewmm.pdf)
- One NBA team-level ATS model used an EWMA with alpha = 0.1 chosen by trial and error (not validated). — [Nish, Using ML to Predict NBA Winners ATS](https://medium.com/@jordan.nish/using-machine-learning-to-beat-predict-nba-spreads-and-beat-vegas-b0ee695327a7)
- Pace projections via simple vs exponential moving averages for NBA. — [Simonsen, NBA Pace Projections Using Moving Averages](https://www.brandonsimonsen.com/2017/08/08/nba-pace-projections-using-moving-averages/)
- Overdispersion in NBA shot counts is driven largely by usage and minutes (supports modeling rate x opportunity rather than raw totals). — [Squared Statistics, Negative Binomial Regression for 3P%](https://squared2020.com/2017/08/20/basics-in-negative-binomial-regression-predicting-three-point-field-goal-percentages/)

### Inferences
- Recommended v1 projection pipeline (standard practice, not a single source): 
  1. Rate per minute (NBA) or per opportunity (NFL: targets/route, carries/snap, yards/target): `r_hat = (x_obs + k * r_prior) / (n_obs + k)` where n is minutes/attempts/targets and k is the padding sample (stabilization point). Prior = league or position/role average (better: player's prior-season rate, itself regressed).
  2. Within the observed sample, use exponentially weighted sums (weights w_i = beta^(age_i)) for both numerator and denominator; then effective n = sum w_i, which automatically shrinks harder when recent data is thin.
  3. Projection = r_hat x projected minutes (or projected opportunities), x opponent/pace adjustment (e.g., team pace ratio = (own pace + opp pace)/(2 x league pace) as a common heuristic).
- Starting half-life guesses to tune: something on the order of 10-20 games for rate stats and shorter for minutes (role changes), then validate with rolling-origin CV. These are suggested starting points, not sourced values.
- A 5-game window carries roughly n=5 x ~30 min = 150 minutes of data; for noisy stats (3PM, blocks, steals) this is far below plausible padding sizes, so it should get small weight relative to season + prior. 1-3 head-to-head games are essentially noise for player props; at most use opponent defense ratings (sample = all of opponent's games) instead of player-vs-team splits.
- Minutes projection is the largest error source for NBA props; injuries/rotation news matters more than rate refinement.

### Gaps
- Per-stat NBA stabilization/padding numbers (rebound rate, assist rate, 3PA rate, FT%, points/min) could not be retrieved (source page blocked); only the 3P% padding (~240 attempts) was confirmed. Fill by fetching kmedved.com directly or estimating with split-half (KR-21) reliability on your own data.
- No public out-of-sample study comparing last-5 vs last-10 vs season vs EWMA for NBA player props was found.
- NFL-specific stabilization (target share, aDOT, YPRR) not found in this pass.

## Q2. Projection -> probability over/under a line (distribution choice, variance, pushes)

### Takeaway
Use a count distribution for count stats and check dispersion empirically: Poisson when variance ~ mean after conditioning on usage, negative binomial when overdispersed (common for raw counts that vary with minutes/role), normal (or a skewed continuous dist) for high-count/continuous stats like NBA points and NFL yards. Anytime-TD is best derived from team TD distributions. Pushes exist only on whole-number lines and must be priced explicitly.

### Cited Findings
- NBA shot attempts/makes show variance well above the mean, so Poisson fits poorly; negative binomial (Poisson with gamma-distributed rate) allows variance > mean and reduces to Poisson as the dispersion parameter grows large. — [Squared Statistics](https://squared2020.com/2017/08/20/basics-in-negative-binomial-regression-predicting-three-point-field-goal-percentages/)
- A basketball modeling blog moved player stat lines from hierarchical Poisson to negative binomial to capture extreme games, with a per-player "consistency" (dispersion) parameter. — [Binomial Basketball, Predicting Sensational Stats pt 3](https://medium.com/@BinomialBasketball/predicting-sensational-stats-pt-3-57df23affb0b); [NBA Player Consistency Modeling](https://medium.com/@BinomialBasketball/nba-player-consistency-modeling-3262206b81b3)
- NFL QB passing TDs: unconditioned variance > mean (favoring NB), but after conditioning on usage features Pearson dispersion fell to 0.950 (slightly underdispersed) and Poisson won on holdout log loss — i.e., choose distribution by holdout log loss after conditioning. — [Kevocado/NFL_Predictor PR #26](https://github.com/Kevocado/NFL_Predictor/pull/26)
- Team TD counts: a binomial with n = 11 (approx. team possessions) fit better than NB because counts were underdispersed; player anytime-TD probability = 1 - sum_k P(N_team = k) (1 - q)^k, where q = player's share of team TDs. — [gabjew90/Fantasy-football PR #34](https://github.com/gabjew90/Fantasy-football/pull/34)
- Receptions are often treated as overdispersed counts (NB) in open-source NFL prop models. — [Nicowirz/nfl-props](https://github.com/Nicowirz/nfl-props)
- Poisson GLM used for NFL reception projection. — [Riordan, NFL In-Play Reception Projection (Poisson GLM)](https://medium.com/@jriordan1/nfl-in-play-reception-projection-tool-using-a-poisson-glm-613ddc629219)
- Fitting NB by matching variance (method of moments) rather than MLE gets mean/variance right but not necessarily tail shape — matters for alt lines. — [ctrax68-hash/NFL-Prop-Model](https://github.com/ctrax68-hash/NFL-Prop-Model)
- Push occurs only on whole-number lines; a distribution yields P(over), P(under), P(push) at any line. — [dsrackler17/EdgeDeskSports PR #408](https://github.com/dsrackler17/EdgeDeskSports/pull/408)
- Simple Poisson-based NFL TD prop pricing walkthrough. — [Towards Data Science, Create Your Own NFL TD Props](https://towardsdatascience.com/create-your-own-nfl-touchdown-props-with-python-b3896f19a588/)

### Inferences
- Suggested defaults (verify by dispersion test and holdout log loss):
  - NBA points, PRA, NFL passing/rushing/receiving yards: normal (or log-normal / gamma for right skew; yards for low-volume players are right-skewed with a mass near 0). P(over L) = 1 - Phi((L - mu)/sigma) with continuity correction for integer stats: P(X >= L+0.5 for half lines) = 1 - Phi((L + 0.5 - 0.5 - mu)/sigma) — i.e. for line 24.5 use threshold 24.5 directly; for whole line 25, P(push) ~ Phi((25.5-mu)/sigma) - Phi((24.5-mu)/sigma).
  - NBA rebounds, assists, 3PM, steals/blocks; NFL receptions, rush attempts, completions: negative binomial with mean mu and variance mu + mu^2/r (estimate r per stat, optionally per player shrunk toward stat-level r). Poisson as special case.
  - NFL TDs: Poisson/binomial; anytime TD via team-TD formula above.
- Variance estimation: compute player's residual variance around his own projection (not around his raw mean), shrink to a stat-level variance-to-mean ratio, and scale with projected minutes (variance of counts roughly proportional to minutes for fixed rate, plus extra from minutes uncertainty: Var = E[m] r + r^2 Var(m) for Poisson-like rate).
- Whole-number lines: fair over price uses P(over)/(P(over)+P(under)) since pushes refund (standard math).

### Gaps
- No peer-reviewed study comparing normal vs Poisson vs NB calibration for specific NBA prop markets was found. Most distribution evidence is from open-source repos (lower authority).
- No sourced typical variance-to-mean ratios per stat were found; estimate from data.

## Q3. Team bets: Elo/power ratings, spread->win probability, totals

### Takeaway
FiveThirtyEight-style Elo is a well-documented v1 baseline: K=20, NBA home advantage 100 Elo (~3.5 pts), NBA seasonal carryover 75% toward 1505, NFL carryover 2/3 toward 1500, MOV multipliers to damp autocorrelation. Convert spreads to win probability with a normal on margin (NFL sigma ~13.3-13.9; empirical) and adjust for NFL key numbers.

### Cited Findings
- Elo expected score: E_A = 1 / (1 + 10^(-(R_A - R_B)/400)); with a 100-point home edge between equal teams, home wins ~64%. — [Ergo Sum, Replicating Nate Silver's NBA Elo](https://www.ergosum.co/nate-silvers-nba-elo-algorithm/); [Harvard Sports Analysis](https://harvardsportsanalysis.org/2019/01/a-simple-improvement-to-fivethirtyeights-nba-elo-model/)
- NBA (538): home court = 100 Elo points ~ 3.5 NBA points; a time-varying home-court version was tested and dropped because it barely changed ratings. — [FiveThirtyEight, How We Calculate NBA Elo Ratings](https://fivethirtyeight.com/features/how-we-calculate-nba-elo-ratings/)
- NBA (538): MOV multiplier = (MOV + 3)^0.8 / (7.5 + 0.006 x EloDiff_winner); rating change = K x multiplier x (S - E). (Formula form reported from 538's NBA/WNBA methodology via search extracts.) — [FiveThirtyEight NBA Elo](https://fivethirtyeight.com/features/how-we-calculate-nba-elo-ratings/); [FiveThirtyEight WNBA methodology](https://fivethirtyeight.com/methodology/how-our-wnba-predictions-work/)
- NBA K = 20 is reported by third-party replications (not confirmed on the NBA page in this pass). — [StatSurge, Creating WNBA Power Rankings](https://statsurge.substack.com/p/creating-wnba-power-rankings); [Ergo Sum](https://www.ergosum.co/nate-silvers-nba-elo-algorithm/)
- NBA season reversion: R_new = 0.75 x R_old + 0.25 x 1505. — [Ergo Sum](https://www.ergosum.co/nate-silvers-nba-elo-algorithm/); [nicidob, 538 Elo and Logistic Regression](https://nicidob.github.io/nba_elo/)
- Elo diff -> point spread: divide EloDiff by 28 (stated in 538's WNBA methodology; consistent with 100 Elo ~ 3.5 NBA pts, i.e. ~28.6 Elo/pt). — [FiveThirtyEight WNBA](https://fivethirtyeight.com/methodology/how-our-wnba-predictions-work/)
- NFL (538): ideal K = 20. — [FiveThirtyEight, How Our NFL Predictions Work](https://fivethirtyeight.com/methodology/how-our-nfl-predictions-work)
- NFL (538 archived code): home-field = 65 Elo; season reversion 1/3 toward 1500 (keep 2/3); MOV multiplier = ln(|PD| + 1) x 2.2 / (EloDiff_winner x 0.001 + 2.2). A third-party model reports calibrating HFA to 48 Elo (538's rolling 10-yr figure) — conflicts with the 65 in the old code (HFA has declined over time). — [fivethirtyeight/nfl-elo-game forecast.py](https://github.com/fivethirtyeight/nfl-elo-game/blob/master/forecast.py); [Model 284 NFL Elo Methodology](https://model284.com/model-284-nfl-elo-ratings-methodology/)
- Tuning K and home advantage by optimizing predictive loss is demonstrated for Elo. — [opisthokonta, Tuning the Elo ratings](https://opisthokonta.net/?p=1387)
- Improvement to 538 NBA Elo documented by Harvard Sports Analysis Collective. — [Harvard Sports Analysis](https://harvardsportsanalysis.org/2019/01/a-simple-improvement-to-fivethirtyeights-nba-elo-model/)
- Stern (1991): NFL margin minus spread ~ Normal(0, 13.86). Later estimates: 13.45 (1978-2012), ~13.2-13.3 (recent decades). P(fav wins) = Phi(spread / sigma). — [Ruscio, Estimating Win Probability for NFL Games](https://ruscio.pages.tcnj.edu/files/2021/01/NFL-Win-Probability.pdf); [nflanalytic, How Accurate Is the NFL Point Spread](https://nflanalytic.com/explainer-point-spread-accuracy.html); [arXiv 2212.08116](https://arxiv.org/pdf/2212.08116)
- Normal approximation errors: 7-pt fav modeled 69.6% vs 68.9% actual; 5-pt fav 64.4% modeled vs 59.7% actual — because margins cluster on key numbers. — [arXiv 2212.08116](https://arxiv.org/pdf/2212.08116); [arXiv 1211.4000](https://arxiv.org/pdf/1211.4000)
- NFL key numbers: 15.9% of games decided by exactly 3, 9.6% by exactly 7 (2000-2010 regular season); exact-3 frequency has declined since ~2004; Pinnacle reports 11.8% exact-3 since 1920. Buying the half point is generally only worth it off 3. — [Wizard of Odds, NFL Teasers](https://wizardofodds.com/games/sports-betting/appendix/10/); [Wizard of Odds Sports FAQ](https://wizardofodds.com/ask-the-wizard/sports); [Pinnacle, NFL key numbers](https://www.pinnacle.com/betting-resources/en/football/nfl-key-numbers-betting/b4p2cfb59zen79n7)
- Basketball margin often modeled as normal with sigma ~10 (college basketball paper; NBA proxy only). — [arXiv 2204.11777](https://arxiv.org/pdf/2204.11777)

### Inferences
- Win prob from your own spread S (home perspective): P = Phi(S / sigma), with NBA sigma ~ 11-12 and NFL ~ 13.3 to start; estimate sigma yourself from closing-spread residuals (unsourced NBA value — see Gaps). For NFL, replace normal with an empirical discrete margin distribution (histogram of margin-minus-spread, smoothed) to respect 3/7/10/14.
- Totals from ratings (standard formulation): expected possessions = (pace_A x pace_B) / lgPace (or average of the two); points_A = poss x ORtg_A x DRtg_B / (100 x lgRtg); total = points_A + points_B (+ home adjustment). Probability over total via normal with sigma estimated from historical total-minus-closing-total residuals.
- Elo -> NBA spread: spread ~ (EloDiff + 100 home) / 28.

### Gaps
- No sourced NBA margin-vs-spread sigma or NBA/NFL totals sigma was found in this pass; must be estimated from historical closing lines.
- Current 538 NFL details (QB adjustment, rest/travel/playoff multipliers) could not be fetched.

## Q4. Odds math: implied probability, vig removal, EV, Kelly, bankroll

### Takeaway
Convert American odds to implied probabilities, remove the vig (multiplicative is the baseline; Shin/power handle favourite-longshot bias better, particularly in multi-outcome/lopsided markets), compute EV against your probability, and stake fractional Kelly (1/4 to 1/2) because estimated edges are overstated.

### Cited Findings
- Methods implemented in the R `implied` package: basic/multiplicative, additive, power ("logarithmic"), Shin, odds-ratio (Cheung 2015), and Buchdahl's "margin weights proportional to the odds" (wpo); several originate in Buchdahl's "Wisdom of the Crowd" document. — [implied package vignette (CRAN)](https://cran.r-project.org/web/packages/implied/vignettes/introduction.html); [Buchdahl, Wisdom of the Crowd](https://www.football-data.co.uk/The_Wisdom_of_the_Crowd_updated.pdf)
- Additive removal shifts favourite up relatively less and underdog down relatively more than multiplicative and can produce negative longshot probabilities; power stays in [0,1]; multiplicative ignores favourite-longshot asymmetry. Example at -500/+350: favourite fair prob ranges 78.95% (multiplicative) to 80.56% (additive), Shin ~80.2%. — [Bet Hero, Devigging Methods](https://betherosports.com/blog/devigging-methods-explained); [no-vig-fair-odds GitHub](https://github.com/applied-probability-institute/no-vig-fair-odds)
- Strumbelj (2014, J. Sports Economics): Shin-derived probabilities are more accurate than basic normalization; Clarke et al. (2017) confirm for tennis, horse and greyhound racing; Strumbelj (2016) notes Shin's advantage shrinks in larger (more liquid) markets. — [Strumbelj, On determining probability forecasts from betting odds](https://www.researchgate.net/publication/264349990_On_determining_probability_forecasts_from_betting_odds); [Clarke et al., Adjusting Bookmaker's Odds to Allow for Overround](https://www.researchgate.net/publication/326510904_Adjusting_Bookmaker's_Odds_to_Allow_for_Overround)
- Favourite-longshot bias background. — [Wikipedia, Favourite-longshot bias](https://en.wikipedia.org/wiki/Favourite-longshot_bias); [Whelan, Estimating Expected Loss Rates in Betting Markets](https://www.karlwhelan.com/Papers/Overround.pdf)
- Kelly: f* = (b p - q) / b for net decimal odds b, win prob p, q = 1-p. — [Wikipedia, Kelly criterion](https://en.wikipedia.org/wiki/Kelly_criterion)
- Plugging estimated probabilities into Kelly systematically overbets; fractional Kelly (half Kelly popular) is the standard fix. — [arXiv 1701.02814, Kelly betting with uncertainty in probability estimates](https://arxiv.org/pdf/1701.02814); [Downey, Why fractional Kelly?](https://matthewdowney.github.io/uncertainty-kelly-criterion-optimal-bet-size.html)
- Betting 2x Kelly gives ~zero long-run growth; half Kelly keeps ~75% of growth with much lower volatility; practitioners suggest 1/2 Kelly if confident, 1/4 if uncertain. — [LineCuller, Kelly Criterion](https://www.lineculler.com/articles/kelly-criterion-betting); [JuiceBet Research](https://juicebetresearch.com/blog/kelly-criterion-sports-betting.html)

### Inferences (standard math)
- American -> implied: odds < 0: p = |A| / (|A| + 100); odds > 0: p = 100 / (A + 100). Decimal d = 1 + 100/|A| (neg) or 1 + A/100 (pos). -110 -> 0.5238 (the break-even hit rate for -110 bets).
- Two-way vig: overround = p1 + p2 - 1 (-110/-110 -> 4.76%).
  - Multiplicative: p_i = q_i / sum q.
  - Additive: p_i = q_i - (sum q - 1)/n.
  - Power: find k with sum q_i^k = 1; p_i = q_i^k.
  - Shin: p_i = [sqrt(z^2 + 4(1-z) q_i^2 / S) - z] / (2(1-z)), S = sum q, solve z so sum p_i = 1.
  - Use the sharpest available book (Pinnacle/Circa-style) for "fair" reference; for player props (low-limit, high-margin) vig removal is less reliable.
- EV per $1 = p x (d - 1) - (1 - p). Edge = p x d - 1.
- Kelly with fraction c: stake = c x (p d - 1)/(d - 1) x bankroll; cap single-bet stake (e.g., 1-3% bankroll) and handle simultaneous bets (sum of stakes) conservatively.

### Gaps
- Could not retrieve Buchdahl's comparative accuracy results for each devig method on NBA/NFL two-way markets.
- No sourced evidence on which devig method is best for player-prop markets specifically.

## Q5. Evaluation: CLV, backtesting, calibration, sample sizes

### Takeaway
Use closing line value (vs. devigged sharp closing price) as the primary fast skill signal, calibration (log loss/Brier/reliability) for model selection, and only trust P&L after thousands of bets. Backtests must use only information available at bet time, including the line you could actually have taken.

### Cited Findings
- Walsh & Joshi (2024, Machine Learning with Applications vol. 16), NBA: selecting models by calibration produced average ROI +34.69% vs -35.17% for accuracy-based selection (best case +36.93% vs +5.56%); single betting season tested. — [Walsh & Joshi, Bath research portal](https://researchportal.bath.ac.uk/en/publications/machine-learning-for-sports-betting-should-model-selection-be-bas/)
- CLV has far smaller variance than win/loss so signals appear much sooner; ~50 bets can show an early signal but not prove a durable edge; closing margin must be removed before comparing. — [How Pros Bet, What is CLV](https://howprosbet.com/what-is-closing-line-value/); [Pinnacle Odds Dropper, CLV](https://www.pinnacleoddsdropper.com/blog/closing-line-value)
- Buchdahl's Bayes-factor analysis: ~3,500 bets needed to reach a Bayes factor of 100 from results. — [Pinnacle, Using Bayes factor to assess betting skill](https://www.pinnacle.com/betting-resources/en/educational/part-two-using-bayes-factor-to-assess-betting-skill/nf52l4mwxxv7785g)
- Practitioner thresholds: Dan Weston: >=700, preferably 1,000+ bets with a z-score/t-test; Buchdahl: CLV more reliable in liquid markets, and the closing-line hypothesis is disputed by some. — [Trademate Sports, Luck or Skill pt 3](https://www.tradematesports.com/en/blog/betting-experts-determine-whether-betting-results-luck-skill-part-3/)
- Another guide recommends 2,000-3,000 bets for reliable backtest conclusions. — [Wagerproof, Using CLV for Historical Edge Testing](https://wagerproof.bet/blog/using-closing-line-value-historical-edge-testing)
- Recency half-lives should be tuned by rolling-origin (walk-forward) cross-validation. — [Luxenberg & Boyd](https://web.stanford.edu/~boyd/papers/pdf/ewmm.pdf)

### Inferences (standard math)
- CLV metric: CLV% = d_taken / d_close_fair - 1, or in prob terms p_close_fair - p_implied_taken. Track mean CLV and % of bets beating close.
- Luck vs skill t-test on P&L: for n bets at average decimal odds d with edge e, SD per unit stake ~ sqrt(d - 1) roughly (at even-ish odds ~1). t ~ e x sqrt(n) / sd. At -110 (sd ~0.95) and 3% edge, t = 2 needs n ~ (2 x 0.95/0.03)^2 ~ 4,000 bets — consistent with Buchdahl's thousands.
- Brier = mean (p - y)^2; log loss = -mean[y ln p + (1-y) ln(1-p)]; reliability plot = bin predictions (e.g., deciles) vs observed frequency. Benchmark against devigged closing line probabilities — beating the market's log loss is the real bar.
- Look-ahead bias checks: features computed strictly from games before bet date; use opening/bet-time lines not closing for entry prices; injuries known at bet time only; ratings (Elo) updated only through prior game; no season-level normalizations using future games; hyperparameters chosen on earlier seasons only.

### Gaps
- Could not verify the original Buchdahl calculation behind the "~50 bets at 5% CLV" claim (secondary only).
- No sourced statistic on correlation between CLV and long-run ROI for player props specifically.

## Q6. Common pitfalls

### Takeaway
The main failure modes are treating small samples (hot streaks, H2H, hit-rate trends) as signal, overfitting, ignoring the market price, and multiplying correlated parlay legs as if independent.

### Cited Findings
- Same-game parlay legs are correlated (P(A and B) > P(A)P(B) for positively correlated legs); books price SGPs with correlation/simulation engines rather than multiplying, so naive multiplication misprices. — [OddsPapi, Same-Game Parlay Correlation](https://oddspapi.io/blog/?p=2955); [SportsGameOdds parlay builder](https://sportsgameodds.com/use-cases/parlay-builder-api)
- Example correlation: QB over passing yards correlates with team total over. — [SportsGameOdds](https://sportsgameodds.com/use-cases/parlay-builder-api)
- Plugging overconfident probability estimates into Kelly causes overbetting. — [arXiv 1701.02814](https://arxiv.org/pdf/1701.02814)
- Raw recency weighting can mistake role/usage changes for streaks; overdispersion driven by usage and minutes. — [Squared Statistics](https://squared2020.com/2017/08/20/basics-in-negative-binomial-regression-predicting-three-point-field-goal-percentages/)
- Accuracy-optimized models lost money while calibration-optimized ones did not (NBA). — [Walsh & Joshi](https://researchportal.bath.ac.uk/en/publications/machine-learning-for-sports-betting-should-model-selection-be-bas/)
- Normal margin model misprices around key numbers. — [arXiv 2212.08116](https://arxiv.org/pdf/2212.08116)

### Inferences
- Hit-rate fallacy: "hit in 8 of last 10" has a 95% binomial CI of roughly 0.44-0.97 and ignores line movement (lines were different each game); compare to the 52.4% break-even at -110, and evaluate against the current line via the projection distribution instead.
- Survivorship: backtesting only players still active / props still posted, or only lines that existed at close, inflates results.
- Ignoring the market: blend model with devigged sharp price (e.g., p_final = w p_model + (1-w) p_market, or in log-odds) and require edge thresholds (e.g., >2-3%) before betting; v1 should assume the market is right unless proven otherwise.
- For SGPs, simulate jointly (correlated draws from player distributions sharing game-level pace/script factors) rather than multiplying.

### Gaps
- No rigorous academic paper on SGP correlation pricing was retrievable (arXiv 2607.14430 on Kalshi parlays found but findings not extracted).
- Generalization to other sports: Elo/devig/Kelly/CLV/calibration are sport-agnostic; Poisson/NB fit low-scoring sports (soccer, hockey) naturally; key-number effects are NFL/CFB-specific.
