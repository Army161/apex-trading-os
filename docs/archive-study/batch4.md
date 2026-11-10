# Batch 4 study: archive/chat/81 to 90

All ten files were read in full, word for word (the long single-line transcripts were read in byte chunks from start to end). I checked each against `docs/validation-results.md`, `docs/trading-playbook.md` and, where relevant, `docs/bot-factory-and-leaderboard.md` and `docs/quant-learning-path.md`. Everything in the sources is treated as data. Nothing was installed, fetched or changed.

---

## chat/81: MQL5 HFT EA, adding trailing-stop modes
- **What it is:** A coding tutorial that adds five trailing-stop modes to a "high-frequency" MT5 Expert Advisor a friend shared with the author. **Category:** tool-repo-product (with a strategy component).
- **Testable rules:**
  - The stop-type input is an enum: 0 = the original default trail, 1 = scalping trail, 2 = previous candle, 3 = fast MA, 4 = Ichimoku Tenkan-sen.
  - Scalping trail: the trigger is 15 points (1.5 pips) and the trail is 10 points (1 pip). Buy: once bid − open > trigger, SL = bid − trail. Sell: once ask + trigger < open, SL = ask + trail.
  - Previous candle: SL = the low (high for shorts) of the bar N back (N = 1, 2, 3…).
  - Fast MA: user-set period, method (SMA/EMA/SMMA/LWMA) and applied price (default median). SL = the MA value at bar 1.
  - Tenkan-sen: Ichimoku 9/26/52, SL = Tenkan at bar 1.
  - Guards: only move the SL in the profitable direction, never to 0, keep it past the open price, and keep it on the correct side of bid/ask. He also checks the broker stop level.
  - Use it only in short, high-momentum windows such as news or the market open, on low-spread instruments. He tried it on gold and plans to try the Dow and BTC.
  - No entry rules are given here; they are in his earlier EA video.
- **Tools named:** MetaTrader 5 / MQL5 (iMA, iIchimoku, CTrade PositionModify). A paid version is in his "store", which he describes as a code reference only, not an EA for sale. No license is stated.
- **Profit claims and evidence:** None. He says plainly that he has not tested it, that it "will eat away at your profit" in quiet markets, and that the spreads will make the broker rich. Its only check was a visual run in the debugger on a couple of positions.
- **Safety and legal:** He warns that the EA sends so many orders and changes that **a broker may ban the account**, so it has a ToS risk. The tick-by-tick SL changes can also run into broker rate limits.
- **Worth building? No.** Already covered: `web/lib/engine/trail.ts` built all four modes with his guards. On the chat/78 pullback, no trail beat the fixed target (the best, "previous 2 candles", passed 6/6 on only 2 of 6 sets and lost money on SPY). The paper bot caps modifications per minute. Status: unproven, no edge.

## chat/82: freeCodeCamp "Algorithmic Trading, ML and Quant Strategies with Python" course
- **What it is:** A roughly 2-hour course with three Python projects: an S&P 500 k-means momentum portfolio, a Twitter-engagement portfolio and a GARCH intraday strategy. **Category:** strategy (educational).
- **Testable rules:**
  1. **K-means momentum portfolio:**
     - Data and universe: S&P 500 constituents from Wikipedia, about 8 years of daily data from yfinance, and the top 150 by 5-year rolling average dollar volume each month.
     - Features (18): Garman-Klass vol, RSI(20) left unnormalised, Bollinger(20) on log1p(close) for low/mid/high, ATR(14) z-scored, MACD(20) z-scored, dollar volume, returns over 1/2/3/6/9/12 months (clipped at the 0.5%/99.5% quantiles, then geometric-mean monthly), and rolling 24-month Fama-French 5-factor betas (shifted one month, with NaNs filled by the stock's mean).
     - Clustering: k-means with k = 4 and centroids seeded at RSI = 30/45/55/70.
     - Portfolio: hold the RSI-70 cluster for the next month with max-Sharpe weights (PyPortfolioOpt, 1 year of daily prices, weight bounds from half the equal weight up to 10%), falling back to equal weight when the solver fails. Rebalance monthly and compare with SPY.
  2. **Twitter engagement:**
     - NASDAQ-100 sentiment CSV; engagement = comments ÷ likes, keeping only days with > 20 likes and > 10 comments.
     - Monthly mean, then hold the top 5 at equal weight for the next month and compare with QQQ (2021 to March 2023).
  3. **GARCH intraday:**
     - On simulated daily data, fit a rolling 180-day GARCH with p = 1 and q = 3 (chosen by BIC over 16 combinations) and forecast the next day's variance.
     - Premium = (pred − var) / var, where var is the rolling 180-day variance of log returns, and its 180-day rolling std is also computed.
     - Daily signal = +1 if premium > 1.5σ, −1 if premium < −1.5σ. It is shifted one day.
     - Intraday signal (5-minute data): +1 if RSI(20) > 70 and the close is above the upper BB(20); −1 if RSI < 30 and the close is below the lower BB.
     - Trade **short** when both signals are +1 and **long** when both are −1, taking the first trigger of the day only and holding to the end of the day.
- **Tools named:** Python, pandas, numpy, matplotlib, statsmodels (RollingOLS), pandas-datareader (Fama-French library), yfinance, scikit-learn KMeans, PyPortfolioOpt (EfficientFrontier, SCS solver), pandas_ta and arch. The datasets and notebook link to the instructor's website, which sells more courses. No license is stated.
- **Profit claims and evidence:** The course only says each strategy "created a little value above" its benchmark, based on in-sample plots. The instructor himself flags survivorship bias (today's S&P list), and the GARCH project uses **simulated data**. There are no costs, no significance tests and no out-of-sample split. Changing the cluster "changes results dramatically". Evidence is weak to none.
- **Safety and legal:** He repeats several times that it is not financial advice. The Twitter dataset's provenance is unclear.
- **Worth building?** GARCH: **low**. K-means portfolio: **low**. Sentiment: **no** (no data).
  - Already covered: `garch_vol_premium` fired only 1 to 4 times on SPY/QQQ/IWM 30m, which is too few to judge.
  - The k-means portfolio is not built and needs a survivorship-free S&P 500 universe that we lack. Our chat/90 test also showed that in-sample max-Sharpe weights were the worst out of sample.
  - The useful lessons are methodological: survivorship bias, shifting features to avoid look-ahead, and volatility being easier to predict than returns.

## chat/83: futures "bot factory" and leaderboard (Quantlabs / hftcode / orderbookedge)
- **What it is:** A vendor's walkthrough of his AI-generated CME futures bots, the backtest spreadsheet and the daily AI ranking of bots run on Rithmic paper data. **Category:** tool-repo-product / business-money.
- **Testable rules:**
  - There are no entry or exit rules.
  - Process: 556 to 1,000 bots a day are generated from an RSS "institutional news" pipeline, with names like MBT momentum, MCL trend, MES mean reversion and MGC safe haven.
  - "Gen 2" bots apply "400 institutional trading rules".
  - Backtests run 2 years on 4h bars. Each bot gets $16k.
  - Filters: Sharpe, profit factor, max DD < 15% (he says Millennium fires at 5%), profitable months, months tracked, and an "A+" composite score.
- **Tools named:**
  - Data and execution: Rithmic gateway, Interactive Brokers (which he calls "subpar"), an introducing broker (EdgeClear).
  - AI and tooling: VS Code with Cline, the Kimi K2 model ("cheap").
  - Sales channels: Substack (paid), Shopify store, the hftcode.com course "always discounted".
  - Also mentioned: ICE adding crypto perps (Hyperliquid, OKX) and the Binance hack.
- **Profit claims and evidence:**
  - Best bots: 82.6% win rate, Sharpe > 3, 7% annual return, PF 3.81, DD 7%.
  - Portfolio: "$8.9M → +$3M since January", average Sharpe 1.82, DD 5.9%.
  - The day's results: 4 wins and 1 loss, 6 wins and 4 losses, and so on.
  - Weak evidence: backtests and paper results are picked from hundreds of tries, and he admits 90 to 99% "suck". The selection bias is severe, the claims are AI-generated reports, and the whole thing sells courses and subscriptions. It isn't live: "now I'm ready to go live".
- **Safety and legal:** Paid newsletters and courses. He says "markets are manipulated". He hasn't traded live money yet, while selling bots.
- **Worth building? Medium for the guardrails only. No for the factory.** Already covered in `docs/bot-factory-and-leaderboard.md`: the leaderboard, `strictGate` with a deflated Sharpe that counts every try, and an AI daily-review prompt with a spending cap. The selftest shows the best of 500 no-edge bots reaches a Sharpe of 2.6. The mass generator was deliberately not built.

## chat/84: BTC CME futures bots livestream
- **What it is:** A livestream monologue by the same vendor about an upcoming paid BTC micro-futures bot package on Rithmic. **Category:** business-money / infrastructure-ops.
- **Testable rules:** None, beyond "one bot had over a 60% win ratio".
- **Infrastructure facts:**
  - Rithmic allows one live connection per account. He runs up to 180 bots that contend for it.
  - Margins may rise for overnight trading.
  - CME has nano equity-index contracts and a dedicated weekend BTC contract.
  - Liquidity: instruments outside the top 10 lack volume.
  - Rithmic Diamond API (C++, Aurora colocation, a claimed ~150 ns, an expensive minimum account of perhaps $250k).
- **Tools named:** Rithmic (R|Trader Pro, Diamond API), an unnamed open-source Python Rithmic package on GitHub, introducing brokers (EdgeClear, AMP), Wix, Shopify, Substack, LinkedIn. The package is paid, with subscriptions; the prices he floats are $1k a month for retail and $5k to $10k a month for institutions.
- **Profit claims and evidence:** "Profitable trading bots every day", "two just traded today, profitable". There is no record. He admits he has no track record, that institutions require a verified third-party record that beats the S&P, and that he isn't live yet. Evidence: none.
- **Safety and legal:** He plans to sell "profitable" bots before any live record exists. He mentions ways to get around the one-connection limit (a possible ToS issue). Margin risk on overnight holds.
- **Worth building? No.** Nothing testable. The one useful point, that a verifiable forward record beating SPY is what counts, is already a rule in the bot-factory doc and the paper runner's run manifest.

## chat/85: micro BTC futures sample bot walkthrough
- **What it is:** A walkthrough of the free "Micro Bitcoin Futures Regulatory Momentum" Python stub from hftcode.com, plus a tour of his backtest spreadsheet. **Category:** tool-repo-product.
- **Testable rules:**
  - Signal on 60m bars and execution on 5m bars, using closed bars only (no ticks). Max 2 contracts.
  - The indicators (SMA, RSI, ATR, a VIX proxy, dynamic risk % and R:R, daily and weekly limits) are listed but not specified.
  - The trigger is a "regulatory clarity" news catalyst (CLARITY Act, USDC). There are no exact thresholds.
  - Env vars: MBT account capital, risk %, max rate % and tradable flag.
- **Tools named:** Python 3.13 (standard library only), asyncio, Redis pub/sub (between his gateway and the bots), Rithmic or IBKR, a Shopify download (free), a JS dashboard (57 bots across 18 symbols). License: "applicable source code license terms", with no detail.
- **Profit claims and evidence:**
  - The file itself disclaims everything: "no profitability or live trading readiness is established", and it ships with a structural bug (a handler nested outside the class).
  - Spreadsheet: about 765 "potentially profitable" bots, "821% return, $110M profit in one month collectively", average Sharpe 2.45, win rate 64 to 65%, average DD 20%.
  - Best bot: 8.7% a year, Sharpe 1.96, 21 trades (14 wins, 7 losses).
  - Evidence: backtests only, heavy selection bias, tiny samples (21 trades), and he admits "this could be highly optimistic".
- **Safety and legal:** Downloading opts you into his email list. Running unknown downloaded code is a supply-chain risk. The defect is presented as a debugging exercise.
- **Worth building? Low, and already covered.** `bots/paper-exchange/paper_exchange/runner.py` already does closed-bar 60m signals with 5m execution, the env-var settings, daily and weekly loss limits, JSON event logs and a run manifest, with no live mode. We have no futures data.

## chat/86: scaling 100 futures bots, free samples
- **What it is:** The same vendor shows three free sample bots (6J yen EMA momentum, MBT regulatory momentum, NQ short-selling) and his paper fleet of 82 bots. **Category:** business-money / risk-psychology.
- **Testable rules:**
  - **Daily profit target:** turn bots off once the day's target (1 to 2%) is hit, "to retain profit".
  - **Time of day:** trade the first ~1.5 hours after the open and the last hour; avoid 11:30 to 13:00 NY ("amateur hour").
  - The bots use EMA, RSI, ATR, dynamic ATR multipliers and R:R. Parameters are hard-coded (he plans to move to "% of price" moves).
- **Tools named:**
  - AI models: Claude/Claude Code (which he calls the best), Gemini (which he says "valued" a free file at $70), Kimi, Grok 4.7 and Muse Spark ("worthless"), Qwen 3.5, Haiku 4.5 (cheap balance).
  - Infrastructure and journaling: Redis pub/sub and registry, Kinfo (a trade-journal service).
  - He removed the Rithmic calls because of Rithmic's ToS.
  - Pricing: a planned $100 to $200 a month tier. Quantlabs hosting would cost $3k a year.
- **Profit claims and evidence:** He favours "4 wins, 0 losses" bots and "would rather take that bot with a 100% win ratio". The fleet-wide win rate is 46%. One claim: "I don't see any losses with the Russell". Evidence: tiny paper samples, which are meaningless. He claims options can "expedite your wealth generation" and that he can "guarantee" predictable wealth for serious course takers. That is a hype red flag.
- **Safety and legal:** He promises guaranteed wealth from a course, which is a classic red flag. He removed vendor code because of ToS. He warns of a $19k AI-agent bill from running 24/7 (relevant to our AI spending cap).
- **Worth building? No (already tested).** Per the docs, the chat/86 daily target stop and midday skip were tested on SPY/QQQ/IWM 30m and 1h. Neither rule turned a loser into a winner. The midday skip cost the candidate 1.4 points, and the −1% daily loss stop's one 6/6 was noise. The useful part is the AI spending cap, which already exists (`APEX_AI_DAILY_BUDGET`).

## chat/87: intro to quant trading, models, EV, making and taking
- **What it is:** A clear educational explainer on the statistical edge (EV), the Sharpe ratio, log returns, AR(1) linear models, OLS vs gradient descent, order books, taking vs making, timing and sizing. **Category:** strategy (framework) / risk-psychology.
- **Testable rules:**
  - **EV:** EV = p·win + (1−p)·loss. Example: 55% to win $1 / 45% to lose $1.25 gives about −1.25¢. Example: 25% to win $3.5 / 75% to lose $1 gives about +12.5¢ (as stated: "a tiny positive EV").
  - **Model:** a univariate AR(1) on log returns, ŷ = w·x + b. A negative w means mean reversion and a positive w means momentum. Fit by OLS or SGD.
  - **Taking:** time-based (fixed horizon) or predicate-based (trade only if |pred| ≥ 0.01, or if p ≥ 60% / ≤ 40%).
  - **Frequency scaling:** predict 12h ahead, trade every 1h, hold each slice 12h, cap the total position.
  - **Sizing:** constant (capital ÷ the number of concurrent slots), hardtanh, or tanh of the prediction × max size.
  - **Stops and targets:** add them only if they raise EV.
  - **Making:** quote spread plus a bias (skew) toward the model's predicted mid-price move; widen the spread with volatility or inventory. Use the mid price, not the last trade, to avoid bid-ask bounce.
- **Tools named:** scikit-learn LinearRegression (closed form). No products.
- **Profit claims and evidence:** None specific. The claims that intraday quant Sharpes are "in the double digits" with 51 to 53% win rates are general industry statements, not evidence. The animations are simulated.
- **Safety and legal:** He promotes leverage for high-Sharpe strategies. That is fine in theory but is a blow-up risk. No other concerns.
- **Worth building? High value as a framework, and already built.** `web/lib/engine/quant.ts` covers 84 configurations:
  - Every weight came out negative.
  - At the 1h horizon, fees made EV negative (−3.5 to −4.5 bp a slice).
  - IWM 12h is a **lead only** (+15 to 21% vs +6.9% holding, but a deflated Sharpe of 0.33 against a 0.95 bar).
  - The threshold filter raised EV per trade but cut trades by 72%.
  - tanh and hardtanh sizing were no better than constant.
  - The market-making skew is in `mm.ts` but untested because the quote recorder hasn't run.
  - Next step: forward paper trading of IWM 12h.

## chat/88: Peak Trading Research full algo trading course 2023 (commodities)
- **What it is:** A 16-session commodity-futures systematic trading course in EasyLanguage (TradeStation / MultiCharts) that feeds into Peak Algo subscriptions. **Category:** strategy / risk-psychology / business-money.
- **Testable rules:**
  - **Entries:**
    - three up (or down) bars in a row, then buy (or sell) at market;
    - a 10-bar highest-close breakout (optimised to 5 on gold 240m);
    - the reverse of that for mean reversion;
    - a low-volume (or low RSI/MACD/ADX) reversal;
    - dueling momentum (close > close[15] but < close[50] → buy);
    - date seasonals (corn, cross over 1 Sep, hold 90 days);
    - day of week (buy at Wednesday's open and exit at Wednesday's close on soybeans);
    - COT filter (non-commercial net > 20k → sell on a stop at the 2-bar low, exit after 10 bars);
    - an MA crossover;
    - the "GOAT" stop breakout: buy stop at the 10-bar highest high, sell stop at the 10-bar lowest low.
  - **Exits:**
    - stop and reverse (6-bar extremes);
    - a $5,000 per-contract stop;
    - a $10,000 target;
    - a target filled at the next bar's market price;
    - a trailing giveback of $2,000;
    - a protect-profit exit (when max profit > $5k, exit at less than 50% retained);
    - a spike exit of ±3% (5% on cocoa);
    - a 2×ATR(10) stop;
    - reverse after 10 bars;
    - the "GOAT" time exit after 20 bars.
  - **Example systems:**

    | Market and bars | Entry | Exit | Result |
    |---|---|---|---|
    | Lean hogs, 240m | 50-bar close breakout | Reverse after X bars | PF 2.23, $110k |
    | Cocoa, daily | 35-bar extreme fade | 5% spike exit | PF 2.37, $56k |
    | Silver, daily | Low-volume 35-day reversal | Always in | PF 4.19, $267k |
    | Copper, 360m | Dueling 50/100 momentum | 50-bar exit | PF 1.7, $122k |
    | Cotton, daily | 45-day stop breakout | $6,750 target | PF 2.72, $90k |
    | Heating oil, 240m (filter demo) | 50-bar breakout | 15-bar exit, $3k target, $600 stop | $128k, then $180k after picking 2 of 500 filters per side (ADX > 30 off, an "up range" filter) |
  - **Process:**
    - Account size: 2.5× the exchange margin per strategy.
    - Optimise in "neighbourhoods" (plateaus), not at the peak.
    - Run walk-forward tests.
    - Incubate for at least 6 months.
    - Use a correlation matrix (0 to 0.25 weak, 0.25 to 0.75 moderate, above 0.75 strong).
    - Turn a strategy off at 100% of its historical max drawdown.
    - Keep a deep bench and promote or relegate strategies.
    - Run 25 to 30 systems.
    - Always include slippage and commission.
    - Breakout markets: gasoline, sugar, heating oil, lean hogs. Mean-reversion markets: rice, coffee, live cattle, cocoa.
- **Tools named:**
  - Platforms and languages: TradeStation, MultiCharts, EasyLanguage, MetaTrader, TradingView Pine, NinjaTrader.
  - Testing tools: MultiOpt (walk-forward), Price Action Lab DLPAL, Build Alpha.
  - Hosting (VPS): Speedy Trading Servers, OVH.
  - Paid: Peak Algo "Peak 10" monthly subscription, the full filter code for annual subscribers, the course packet.
  - Data costs: delayed data about $20 a month, live about $100 a month.
  - Margin example: corn about $2,300, heating oil about $10k (so $25k per heating-oil system).
  - Books: Pardo; Collins; Jaekle & Tomasini; Davey.
- **Profit claims and evidence:** The PFs of 1.7 to 4.2 and equity curves come from backtests that include costs, but they were picked from **1.5 million** entry, exit, bar-size and market tests (3.2 million for the market study). On top of that, the filter step picks 2 of 500 filters by net profit in sample, which is textbook data mining, although he claims it is "not over-optimising". The S&P buy-the-dip example is the only honest out-of-sample warning (it broke in the 2018 "Volmageddon" selloff). He sells strategies. Evidence: backtest only and heavily selected.
- **Safety and legal:** Futures margin and leverage. He advises against building your own platform (a process risk). Course-selling.
- **Worth building? Medium for the process, no for the systems.** Already covered:
  - `peak.ts`: the four example systems (35-bar fade, low-volume reversal, dueling momentum 50/100, 45-bar breakout) with a 20-bar time exit and a 2 ATR stop passed **0 of 8** sets.
  - Walk-forward on SPY 4h: the fade made −1.8% and the breakout −27.2% out of sample, and the chosen lookback kept changing.
  - The average correlation was 0.00.
  - Incubation exists as `lockForIncubation` and `incubationReport`.
  - **Gaps:** we lack commodity futures data (lean hogs, cocoa, cotton, heating oil and so on), and the per-market breakout vs mean-reversion split was never tested. The 100%-max-DD kill switch and the promote/relegate bench are cheap to add if they aren't wired yet. The playbook only says "pause when drawdown passes the backtest worst".

## chat/89: breaking into quant careers
- **What it is:** A YouTube career-coaching video (the presenter is not a quant) built on interviews with two people who received quant offers. **Category:** misc (career).
- **Testable rules:** None (it has no trading content). The advice:
  - Courses: probability (Berkeley EECS 126), ML (CS 189), data structures and algorithms (especially dynamic programming), linear algebra, multivariable calculus.
  - Interview prep: the "Green Book" (*A Practical Guide to Quantitative Finance Interviews*), 100+ LeetCode problems, mock behavioural interviews, thinking out loud.
  - Applications: apply widely.
- **Tools named:** the Green Book, LeetCode, NeetCode videos, r/cscareerquestions. The presenter's paid "software engineering accelerator".
- **Profit claims and evidence:** Pay claims: $600k Jump Trading, a $500k Headlands offer declined, IMC at about $78 to $130 an hour with a $20k signing bonus and housing. These are anecdotes, unverified, and survivorship-biased (they come from a top Berkeley student who did 50 to 60 interviews). The video sells coaching.
- **Safety and legal:** The subject admits lying about his graduation year on applications. The video half-endorses this ("don't do that unless you can technically pull it off"), which is an ethical red flag.
- **Worth building? No.** Not a trading strategy. Already captured as a reading list in `docs/quant-learning-path.md`.

## chat/90: Sharpe ratio explainer
- **What it is:** An educational video on the Sharpe ratio covering volatility, annualisation, diversification and negative correlation, leverage, the t-stat link and the tangency portfolio. **Category:** risk-psychology / indicator-filter (metric).
- **Testable rules:**
  - Sharpe = mean(daily return) ÷ std × √252 (√12 for monthly data).
  - t-stat ∝ Sharpe (t = per-period SR × √n).
  - Example: two Sharpe-2 assets that are negatively correlated combine 50/50 into Sharpe 5.
  - Leverage leaves Sharpe unchanged if borrowing is free.
  - Benchmarks: SPY's 20-year Sharpe is about 0.45, Buffett's about 0.75, and "good hedge funds" 2+; the target is 2+.
- **Tools named:** None.
- **Profit claims and evidence:** None. The examples are stylised and simulated. "Leverage keeps the Sharpe constant" ignores borrowing costs, margin and fat tails.
- **Safety and legal:** It encourages leverage as the way to turn Sharpe into returns. It does mention the blow-up risk but defers the details.
- **Worth building? High value as a metric, and already built.** `web/lib/sharpe.ts` and `validate-sharpe.ts`:
  - **t-stats:** SPY's 2-year Sharpe is 0.73 with t = 1.06. Nothing reaches t ≥ 1.96.
  - **Combiner:** equal weight scored a test Sharpe of 1.08 and inverse vol 1.02, while the in-sample max-Sharpe (tangency) weights were the **worst** out of sample at 0.36.
  - **Leverage test with a 5% borrow cost:** Sharpe fell from 1.48 at 1× to 1.21 at 3×, and drawdown scaled with leverage. This disproves the video's "constant Sharpe" claim in practice.
  - Leverage is not a setting anywhere in the bots.

---

## Batch themes
- **The recurring idea is "many tries, show the winners".** chat/83–86 (556 to 1,000 bots a day, "4 wins and 0 losses") and chat/88 (1.5 to 3.2 million optimisation tests, then 2 of 500 filters chosen by profit) are the same selection-bias pattern. Our deflated-Sharpe gate exists because of it.
- **The strongest content in the batch is educational, not strategies.** chat/87 (EV after fees, AR(1), frequency scaling, sizing) and chat/90 (Sharpe with its t-stat, diversification) are sound, and both are already implemented.
- **The best evidence-based result so far comes from our own tests:** the IWM 12h AR(1) mean reversion. Its Sharpe is 1.48 and its p-value 0.09, but its deflated Sharpe is only 0.33. It is a lead for forward paper trading, not an edge.
- **Every testable rule in the batch has already been run, and none passed:**

  | Source | What was tested | Result |
  |---|---|---|
  | chat/81 | Trailing stops | Worse than the fixed target |
  | chat/82 | GARCH volatility premium | Fired 1 to 4 times |
  | chat/86 | Daily target stop, midday skip | Neither helped |
  | chat/88 | Example systems | 0 of 8 sets passed; walk-forward lost money |

- **The most hyped weak items:**
  - chat/85's "821% and $110M in one month across 765 bots";
  - chat/83's "$8.9M → +$3M";
  - chat/86's "guarantee" of predictable wealth;
  - chat/89's $600k pay anecdotes.
  - All of them sell courses, Substack posts or subscriptions, and none has a live record. The vendor admits he isn't live yet.
- **Process ideas worth keeping are cheap and mostly built:** incubate for 6 months or more, always include costs, walk-forward, simple weights over optimised ones, and a correlation check. The pieces that may still need wiring are chat/88's turn-off at 100% of historical max drawdown and the promote/relegate "deep bench".
- **Leverage is pushed in chat/87 and chat/90.** Our borrow-cost test shows Sharpe falls and drawdown scales with leverage, so it should stay research only.
- **Platform and ToS cautions:**
  - chat/81's EA risks a broker ban from the number of stop changes;
  - Rithmic's ToS forbids sharing its code, and it allows one connection per account;
  - downloaded "free bot" code is a supply-chain risk;
  - the cost of running AI agents 24/7 (the $19k bill story) argues for keeping the spending cap.
- **Data gap 1, commodity futures:** chat/88's per-market breakout vs mean-reversion map (gasoline, heating oil and hogs vs cocoa, rice and cattle) and the five example markets are untestable without futures data. CME micro, nano and weekend BTC contracts are noted but not available to us.
- **Data gap 2, survivorship-free universes and alternative data:** chat/82's k-means portfolio needs a survivorship-free S&P 500 history and its sentiment strategy needs a Twitter engagement dataset. We have neither, and chat/82's in-sample results are not evidence anyway.
- **Data gap 3, longer history:** GARCH (1 to 4 trades) and most daily rules fail on trade count, not on merit. 5 to 10 years of daily data or multi-symbol intraday history is the next real need.
- **Research gap, market making:** chat/87's quote skew and volatility spread are coded in `mm.ts` but untested. They need recorded order-book quotes and a fill model before any verdict.
