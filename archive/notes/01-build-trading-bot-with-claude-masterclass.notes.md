# Notes: Build Trading Bot with Claude Masterclass (speaker: "Brendan", AI Pathways)

Source: /home/claude/apex/archive/uploads/01-build-trading-bot-with-claude-masterclass.md (208,218 chars, read in full).
IMPORTANT LIMITATION: the transcript is narration only. The ~16 prompts (0, 1, 2, 3, 4, 4B, 4C, 5, 5B, 6, 7, 8, 8B, 9, 10, 11, 12, 13, plus an unnumbered ".env creation" prompt) are shown on screen / sold in his school community and are NOT spoken verbatim. Only paraphrased prompt contents are captured below. Do not claim verbatim prompts exist in this source. Framework name: "ALPHA" = A Architecture, L Logic, P Proof, H Harness, A Adapt.

## 1. Summary
The course teaches a non-coder to build a full trading SYSTEM (not a single-rule bot) using the Claude desktop app (or ChatGPT Codex desktop) working in a local folder ("claude lab"). The system studies how each asset moves (asset study), classifies market regime (200-day trend and volatility), builds a "core + sleeves" portfolio (core = QQQ/gold 200-day-line rotation; sleeves = short-term dip-buy and breakout rules per ETF), proves each piece with a funnel of gates on a train window (2022-2024) and a one-shot locked test (2025 onward), validates the backtester itself with planted-edge / pure-noise / look-ahead checks, then deploys a Python bot on Alpaca paper trading that runs nightly after 7pm New York time, queues market-on-open orders, places broker-held stops the next morning, sends Telegram alerts, and is reviewed weekly/monthly/quarterly by scheduled Claude skills. An optional AI layer reads FOMC statements and can only nudge the core (hold gold N days), never the sleeves; it is tested with dates/names hidden. Adapt phase covers paper-vs-backtest reconciliation, kill lines, sleeve rotation from a "bench", and a change-control loop. Bonus sections cover 10 common backtest mistakes, small-account constraints, and broker comparisons (Alpaca, IBKR, Schwab, crypto exchanges). Daily bars on free Yahoo data and ETFs are chosen for beginners.

## 2. Codifiable rules
(Quotes are the speaker's words from the transcript; numbers as stated.)

### Timeframe / data / costs / windows
- Bar size: daily. "we have it set to daily just because the data is free."
- Data: Yahoo Finance via the free Python library yfinance; adjusted data (splits/dividends). "every prompt inside this course uses adjusted data."
- Universe (prompt 0 "my settings"): "23 ETFs plus Bitcoin" (study tickers: "24 study tickers"); trade universe "22 tickers that you can trade here. So everything except cash and Bitcoin." Settings blocks: bar size, market tickers, "engine candidates" (big stock funds, e.g. "spy, QQQ, IWM, and DIA"), "safe candidates" (cash, three bond funds short/mid/long, gold), starting money.
- Starting account: "$100,000".
- Costs: "05% on every buy and sell" i.e. 0.05% each way, "around .1% for full trade in and out". Double-cost stress test also run. Crypto: use real exchange fee (Alpaca lowest crypto tier "0.25% for an order that fills right away", ~5x stock cost). Crypto year = 365 bars not 252.
- Windows: "2022 through 2024. This is considered the training window"; "everything from 2025 onwards to present day is the locked test"; locked test run once only. "Everything gets tuned and picked from 2022 to 2024 and then everything from 2025 onwards only gets tested one time."
- Signal timing: decide at the close, fill at next open. "a signal at today's close buys at tomorrow's open."
- Intraday data limits (Yahoo): "1 minute bars for about the last month, 5 minute bars for about the last 2 months", 2-90 min about 60 days, hourly about 2 years. Paid data: Alpaca (free with account), Massive, Databento ("$29 a month all the way to $199 a month or more"), FirstRate Data (one-off purchase), crypto 1-min candles free from Coinbase/Binance.

### Asset study (prompt 1)
- Five questions: keeps going after a new high? snaps back after a quick drop? moves with stocks? what it does when stocks fall? how big are its ups/downs (volatility)?
- Snap-back test: "every quick drop that happens while the price is above its 200 day line", look at next 5 days vs the asset's normal 5-day average return.
- Momentum test: "every new high above the 200 day line, which means the highs close in like the last 50 days", look at next 20 days vs normal 20-day average.
- Label cutoffs: momentum label needs "at least six new highs to look at"; snaps-back label needs "at least 12 quick drops".
- Extra measures: trend gap (performance on uptrend days minus downtrend days), calm-vs-volatile (average daily move size on calm vs volatile days). Output: labels per ticker plus a plain-English line, a dashboard, a correlation heat map.
- Result: about 12 of the assets "keep going" (QQQ, tech sector); SPY, IWM, DIA "snap back".
- Strategy-to-label grid: keeps going -> breakout (buy new highs); snaps back -> dip buy; holds up when stocks fall -> safe asset for core. "you wouldn't want to employ a breakout strategy" on a snap-back asset.

### Regime
- Trend regime: price above 200-day average (SMA, "average closing price over the last 200 trading days") = uptrend; below = downtrend.
- Volatility regime: calm vs volatile. Sizing: "on more calm days, we would typically size in at full, but on more volatile days... half." Example numbers: SPY calm day moves ~0.6%, volatile ~1% (speaker's garbled numbers: "around 6% when it's calm and around 1%" -- units unclear), QQQ calm 0.8% vs wild 1.43%. Intent: constant risk, size down when volatility doubles.
- VIX "high" = today's VIX above its past-year median ("middle value over the past year"). Breadth = share of stocks above own 200-day line (example 65%; "over 50% means that most stocks are still in an uptrend").
- Market filter found in prior GPT "Astra" study: "VIX is high while breath is still over 50%. Then the core strategy would hold gold for the next five trading days whatever the trend says." Touches core only. Source: "over 1,600 filters" tested (data-mining warning). VIX from FRED (free account), breadth from Yahoo stocks.

### Seven-part rule template (every strategy must fill all 7)
market, setup (signal), filter, entry, exit, stop, size. Example: setup "RSI 2 under 10", filter "above the 200 day", entry "next day's open", exit "a close back above the 5-day average or 10 days in the trade, whichever comes first", stop "8% below the entry", size "10% of the account". "If you can't fill in all seven of these rows, it's not ready to test yet."
- RSI(2): 0-100 score of up vs down moves over last 2 days.

### Seven minimum checks (any strategy)
1 cost included; 2 next-open fills; 3 recent data (2022+); 4 locked test (2025+) never seen; 5 return vs drawdown (return per drawdown = return / max drawdown); 6 enough trades; 7 neighbors (nearby parameter values also profitable, e.g. 150/250 if 200 works; for EMA/crossover variants 100, 150, 250-day lines, exponential average, 50-day crossing 200-day).

### Backtester self-test (prompt 2)
- Planted edge: fake prices where each flag gives extra +1% next day; engine passes if average trade after costs is in "around 0.6 to 1.2%". Result reported: about "0.8% per trade after 0.1% of cost".
- Pure noise: same flags, no bump; should be about zero minus cost.
- Look-ahead guard: pick 30 random days, truncate data at each, recompute the signal; if signal changes, stop with error. Also run on the real trend switch with SPY prices.
- Pass ranges written before running. Signals live in one shared signals file used by both backtest and live bot.

### Core strategy (prompt 3) - five steps
1. Pick engine: from engine candidates, the one with biggest trend gap (QQQ).
2. Pick safe asset: best performer on engine's downtrend days among safe candidates, and correlation to engine below 0.5; if none beat cash, cash. Result: gold ("about 8% a year on those days, cash only made about 2%", all bond funds lost money).
3. Switch: engine above 200-day -> hold engine; below -> hold safe asset. "this rule only switches a few times a year".
4. Neighbors: 100, 150, 250-day lines, EMA, 50/200 cross all must make money after cost.
5. Locked test once, plus double-cost check. Saves core in rules file if all pass.
- Reported: locked test "24.8% a year with a max draw down of 11.2%"; QQQ fell below 200-day in spring 2025, core went to gold for a couple of months.

### Sleeves (prompt 4)
- Dip buy: buy at next open after RSI(2) under 10 while price above 200-day line; sell when price closes back above 5-day average or after 10 days, whichever first; 8% stop held at broker.
- Breakout: buy at next open after new 50-day high while above 200-day line; sell when price falls to a 20-day low or closes below 200-day line.
- Pairing: label from prompt 1 -> only fitting ideas tested, across the 22 tradable tickers.
- Gates: fit asset; training profitable after costs; minimum trades "15 for a dip by and six for a breakout"; "profit factor has to be at least 1.3"; neighbors profitable (dip: RSI under 5 and under 15, sell above 3-day or 10-day average instead of 5; breakout: 20-day or 100-day high instead of 50); locked test once.
- Funnel result: "44 ideas went in. 25 fit... 20 made money after costs. 18 had enough trades. 14 profit factor above 1.3. 11 had profitable neighbors. 7 passed the lock test."
- Survivors: QQQ dip buy, QQQ breakout, XLK dip buy, XLK breakout, XLF breakout, XLY dip buy, GLD (gold) dip buy.
- 4B: Claude generates 10 new sleeve ideas as exact rules, neighbors by moving each number one step up/down, same gates; passers go to "the bench" never straight into the account.
- 4C (optional): screener sleeve, holds up to 10 stocks (could be 20), same gates, must also improve the account; point-in-time index membership required to avoid survivorship bias.

### Screener example (from earlier Astra video)
Above own 200-day line; positive over last 60 days (text says "it has to be over the last 60 days", metric unclear); closed 8% under its 20-day average; buy next open, small amount each, sell 10 trading days later; rescreen each night; some nights none pass.

### Account construction (prompt 5)
- Core invested "100% into the core invested at all times" with sleeves layered on top using margin (core 70% was the example in the architecture diagram; configurable 80/20, 30/50 etc.).
- Greedy sleeve selection: start with core alone, add the sleeve that most improves return per drawdown, repeat; max 3 sleeves; one sleeve per ticker; skip sleeves highly correlated with already picked ones.
- Sleeve slot size 20% of account; halved to 10% on volatile days ("10% instead of 20%").
- Borrowing: max about 60% borrowed ("only gets up to the full 60% when all three sleeves are on along with the core"); account max leverage 160% implied. Margin interest assumed 6.5% (Alpaca) vs IBKR Pro about 5.4% on first $100k.
- Final lock-test claims: see section 6.

### Quarterly repick routine (prompt 6)
- At each quarter end: pick window = last 2 years, check window = most recent 1 year. Same gates on pick window with lower minimum trades ("10 for a dip by and four for a breakout"), must make money on recent year, rank by return per drawdown on recent year, take up to 3 (one per ticker, skip correlated). Empty slots stay empty (no borrowing for them). Hold 3 months. New lineup takes over next open; dropped sleeve sells at that open; new sleeve starts empty and waits for its own buy signal.
- Look-ahead proof: run as of mid-data date twice (full data vs cut-off data) and lineups must match. Ran at 11 quarter ends from early 2024.
- Fair comparison only from 2025 (earlier sleeves had seen 2024).

### Extra optional checks
Walk-forward; Monte Carlo (shuffle trade order thousands of times); double cost; test same strategy on another ticker (dip buy on SPY should also work on DIA).

### Execution timing / broker facts (prompt 8)
- Market closes 4:00pm New York; bot runs "a little after 7:00 p.m."; computes signals; queues market-on-open (MOO) orders; fill at 9:30am open.
- Alpaca "rejects orders if they come in between 9:28 in the morning and 7 at night New York time" -> bot only sends after 7pm; real run only between 7:00pm and midnight New York time.
- Whole shares only at the open: round down, leave remainder in cash.
- Deterministic order IDs (date + ticker + side + sleeve) so reruns skip duplicates.
- While a stop order is open Alpaca won't allow another order selling those shares: cancel the sleeve stop before selling.
- Morning check (a little after open): place stops with broker 8% or 10% below actual fill price (stops only possible once shares are owned); verify every open trade has a stop and restore if missing.
- Evening run = 11 fixed steps. Named: lock file; trading-day check; step 3 reconcile (Alpaca positions vs bot state; stop and alert if mismatch, except a stop that filled today); step 4 fresh prices to separate live data file (research data never changes); regime; signals; step 7 saved Fed call if AI layer on; weights -> shares; step 9 risk check; orders queued; log.
- Stops if any ticker's last price isn't from today. On first run, if account holds positions the bot didn't place, it stops (use empty paper account).
- Modes: dry run (does everything but send orders/change files; can emulate any past day); real run only if account is paper.
- Tests: bot signals match backtest on each of the last 60 trading days; running orders twice sends nothing the second time; a Fed call counts only for days it covers. "All 17 of our tests passed."
- First queued order shown: Monday 2026-10-26 open, QQQ buy, about 141 shares.

### Risk limits (prompt 8B and house rules)
- Daily loss: account down more than 3% vs prior day -> no new sleeve trades that night (self-clears next day); exits and core still run; alert.
- Bad stop day: account down more than 5% in a single day -> bot creates a `pause` file in project folder itself, messages you; nothing new opens until user resumes.
- Pause file: no new sleeve trades, no new borrowing; core still follows rule; open trades keep exits/stops.
- Borrowing stop: track account high-water mark; if drawdown exceeds worst drawdown seen in backtest -> stop borrowing, new sleeve trades funded from the core instead; resume borrowing once back within half of that.
- Order size cap: no order much bigger than its target; total targets cannot exceed core 100% plus slots of sleeves currently in a trade.
- Plain English controls: "pause the bot", "sell everything", "resume the bot".
- Stops held at broker (survive computer off/crash). Lock file prevents concurrent runs. All limits can only reduce activity, never change a rule.

### Scheduler (prompt 9)
- Plain Python bot; OS scheduler (macOS launchd; Windows Task Scheduler) runs a tick script every 30 minutes; script uses New York time: evening run once after 7pm on trading day; morning check once a little after the open. Claude app scheduled tasks only for jobs that need Claude (Fed check, reviews). Computer must be awake (instructions to prevent sleep given without changing settings).
- Telegram messages: any failure immediately; summary after each evening run (engine above line?, core holding tomorrow, AI call, each sleeve, orders queued); summary after morning check (fills, stops placed); missed-run alert if evening run not done by about 11:30pm.
- Folder layout mentioned: src/ (bot, morning check, tick), data/ (research price files and bot's live copy), logs/, state.json, .env.

### AI layer (prompts 7 and 10)
- Input: FOMC statement plus the prior statement plus current core holding. Output: one call, e.g. hold gold for 5, 10 or 20 days, or "hold" (no change). Applies from next open (statement at 2pm so earliest action next morning).
- Each call from a fresh Claude instance; dates and names hidden by code; calls sealed/saved before any scoring. Replay is "not a clean test" (wording leaks era). Compare: core alone vs core + dated calls vs core + hidden-date calls; enable only if hidden-date version beats core alone on a pre-registered rule.
- Prompt 7 not run on camera ("a separate call to claude for every single statement twice... a few days").
- Prompt 10: skill "fed check": at 5pm on release day fetch newest statement from Fed website; one call per statement; if statement older than 5 trading days, no call ("never makes a late call and pretends it was on time"); saved as immutable file with statement date, save timestamp, action, days, one-line reason, model, URL; layer is OFF by default so calls are logged only; practice mode saves to separate folder; Telegram message begins "practice". Never touches rules or places orders.
- Automation ladder: alerts only -> approve each order -> fully automatic.

### Adapt phase
- Paper vs backtest reconciliation (prompt 11): replay backtest over the same days with same Fed calls; line up trades; classify each gap into six groups: fills, timing, data, rounding, limits, rules. "all 33 tests pass".
- Kill line (prompt 12): per sleeve = 2x its worst tested drawdown (example: 10% worst -> remove at 20%). Core alarm: account falls more than 1.5x core's worst tested drawdown (example about 43% = 1.5 x ~28%) -> alert and stop new sleeve trades; core keeps running; only the human changes the core. When a sleeve crosses its line: switched off in rules file, sold at next open, change log entry, alert.
- Three removal reasons: kill line; not repicked in quarterly routine; live trade frequency less than half or more than twice testing frequency after at least 3 months live.
- Monthly statuses: keep; watch (past half of kill line, or fewer than 5 live trades); review (frequency anomaly); out (crossed kill line).
- Rotation: bench = sleeves that passed all gates but not in account. Swap checks: new ticker not already used; correlation with core and each live sleeve is 0.6 or lower ("6 or lower"); account return per drawdown at least as good with it as without. Change log with date, what, why, test. Effective next evening run.
- Weekly Saturday Claude review skill (prompt 13): weekly report every Saturday; first Saturday of month sleeve status check; first Saturday after quarter end run repick routine and propose changes (dry-run rotate, wait for human yes). If bot live fewer than 10 trading days that month, short report. First three lines of every report to Telegram. Claude may fix code (commit to git with message, rerun tests) but never changes rules.
- Human weekly check about 10 minutes: read report, phone alerts, distance of each sleeve to kill line, "later list".
- "No rule changes because of recent results" (house rule). Rule change = new idea through gates, paper test for a few weeks, then switch on; old version keeps trading until replaced.

### Small accounts
- Whole shares: $2,000 account -> 20% slot = $400, can't buy a $500 ETF; $20,000 -> same slot buys 8 shares. Borrowing needs at least $2,000 in Alpaca. Pattern day trader $25,000 rule: speaker says FINRA removed it "on June 4th of 2026" with brokers needing to switch (verify independently).
- Daily-trading sleeve pays about 25% of profits in costs.

## 3. Strategy specs
```json
{"id":"core-qqq-gold-200d-rotation","name":"Core: QQQ / Gold 200-day trend rotation","market":"ETFs (QQQ engine, GLD safe asset; engine/safe chosen by asset study from settings)","timeframe":"1D","direction":"long","indicators":{"trend_ma":"SMA 200 close","neighbors_to_test":"SMA 100, 150, 250; EMA 200; SMA50 cross SMA200","safe_asset_corr_max":0.5},"entry":"At close, if engine close > 200-day SMA, target = hold engine (QQQ); order fills at next open","stop":"No price stop on core; rotation itself is the exit. Core kill alarm: account drawdown > 1.5x core worst tested drawdown (about 43%) -> alert, halt new sleeve trades","target":"None; hold until regime flips","filters":["optional market filter: VIX above its trailing-1yr median AND breadth > 50% -> hold gold for next 5 trading days regardless of trend (core only)","optional AI layer: FOMC call may force gold for 5/10/20 days (core only, default OFF)"],"notes":"Switches only a few times a year. Reported locked test (2025+) CAGR 24.8%, max DD 11.2%. Costs 0.05% each way; double-cost check required."}
```
```json
{"id":"sleeve-etf-rsi2-dip-buy","name":"Sleeve: RSI(2) dip buy above 200-day","market":"ETFs labeled 'snaps back' (passers: QQQ, XLK, XLY, GLD)","timeframe":"1D","direction":"long","indicators":{"rsi_period":2,"rsi_entry_below":10,"rsi_neighbors":[5,15],"trend_ma":"SMA 200","exit_ma":"SMA 5","exit_ma_neighbors":[3,10],"max_hold_days":10},"entry":"Signal at close when RSI(2) < 10 and close > SMA200; buy at next open","stop":"8% below actual fill price, placed as broker stop the morning after fill","target":"Exit when close > 5-day SMA, or after 10 days in trade, whichever first","filters":["asset label from asset study must fit (snaps back)","min trades 15 on training (10 in quarterly repick)","profit factor >= 1.3","neighbors profitable","locked test once","VIX/vol regime: slot 20% of account, 10% on volatile days"],"notes":"Slot 20% of account (example rule template used 10%). Sleeve kill line = 2x worst tested drawdown."}
```
```json
{"id":"sleeve-etf-50d-breakout","name":"Sleeve: 50-day high breakout above 200-day","market":"ETFs labeled 'keeps going' (passers: QQQ, XLK, XLF)","timeframe":"1D","direction":"long","indicators":{"breakout_lookback":50,"breakout_neighbors":[20,100],"trend_ma":"SMA 200","exit_low_lookback":20},"entry":"Signal at close on new 50-day high while close > SMA200; buy next open","stop":"Exit if price falls to a 20-day low or closes below 200-day line (stop distance for broker stop: 8% to 10% below fill per bot morning check)","target":"No fixed target; trail via 20-day low","filters":["asset label must fit (keeps going)","min trades 6 on training (4 in quarterly repick)","profit factor >= 1.3","neighbors profitable","locked test once"],"notes":"Slot 20% of account, halved on volatile days."}
```
```json
{"id":"sleeve-stock-screener-pullback","name":"Sleeve: S&P 500 pullback-in-uptrend screener (optional, prompt 4C)","market":"US single stocks (S&P 500, point-in-time membership required)","timeframe":"1D","direction":"long","indicators":{"trend_ma":"close > own SMA200","momentum":"positive over last 60 days (metric as spoken, ambiguous)","pullback":"close 8% below 20-day average"},"entry":"Nightly screen; buy small equal amount of each passer at next open","stop":"Not specified for screener","target":"Sell 10 trading days later","filters":["holds up to 10 (up to 20) stocks","must improve account return per drawdown","survivorship-bias-free universe"],"notes":"Described from a prior video; given as an example, parameters partly ambiguous."}
```
```json
{"id":"overlay-vix-breadth-gold-hold","name":"Core market filter: VIX high + breadth>50% -> hold gold 5 days","market":"Core only","timeframe":"1D","direction":"long","indicators":{"vix_high":"VIX > trailing 1-year median","breadth":"% of stocks above own 200-day SMA > 50%","hold_days":5},"entry":"When condition true at close, core holds gold for next 5 trading days","stop":"n/a","target":"Return to normal rule after 5 days","filters":["only touches core","must improve return/drawdown on training AND single locked test"],"notes":"Selected from 1,600+ filters in a prior study; treat as heavily data-mined."}
```
```json
{"id":"overlay-ai-fomc-core-nudge","name":"AI layer: FOMC statement reading, core nudge (optional, default off)","market":"Core only","timeframe":"event driven (about 8 FOMC per year)","direction":"both (switches core between engine and gold)","indicators":{"model":"fresh Claude instance per call, dates/names hidden","horizon_days":[5,10,20]},"entry":"Call produced at 5pm after 2pm statement; applied from next open for N days","stop":"Calls expire after N days; stale (>5 trading days) statements get no call","target":"n/a","filters":["only enable if hidden-date replay beats core alone on pre-set rule","calls saved immutably before open"],"notes":"Not cleanly backtestable; speaker says trust less than a normal test."}
```

## 4. Risk and psychology rules
- Daily loss -3%: no new sleeve trades that night. Daily loss -5%: auto-create pause file and alert; human must resume.
- Borrowing cut-off when drawdown exceeds worst backtest drawdown; resume within half.
- Max 3 sleeves, one per ticker; sleeve slot 20% (10% on volatile days); leverage up to about 60% borrowed.
- Order cap; total target cap; broker-held stops; lock file; duplicate order IDs.
- Kill line per sleeve 2x worst tested drawdown; core alarm 1.5x worst tested core drawdown. "one bad week is nowhere here"; never remove a sleeve for a bad week or month.
- No rule changes because of recent results. Core changes and paper->live decisions are human-only.
- Paper first until paper and backtest line up, then real money "small", then full size. Live account locked in course.
- Don't quit after a bad week; compare drawdown to backtest range; losing weeks expected.
- Never paste API keys into Claude; put them by hand in `.env`; house rules forbid opening/printing/logging `.env`.
- Weekly manual 10-minute review; log everything including failed ideas (counts of ideas per gate).
- Do not automate: rule changes, core changes, paper-to-live switch, news-judgment strategies (keep as alerts).
- Two bots must never trade the same account; one folder + one paper account per system.
- Small accounts: check whole-share feasibility; PDT status (verify with broker).

## 5. Tools, repos, apps, APIs mentioned
- Claude desktop app (Mac/Windows; paid plan Pro or above) or ChatGPT Codex desktop app. Not claude.ai in browser (cannot read/run local files). Workflow: set Local, choose folder ("claude lab"), "trust workspace", permission mode bypass (or auto). Models per speaker: strongest ("Fable 5.1") only for planning/safety reviews; "Opus 5.5" for building; "Sonnet 5.5" for quick jobs; ChatGPT side "Astra" in Codex.
- Files: `claude.md` (house rules + "my settings" block), `agents.md` (copy for Codex), `.env.example`, `.env` (ALPACA key, secret, paper=true, Telegram bot token, chat ID), folders for data, code (src), results, reports, rules file, logs, AI saved calls, dashboards, tests, configs; `state.json`; `pause` file; signals file (shared by backtest and bot); gates file (prompt 4); change log; bench; labels file; "fingerprint" line (a reproducibility checksum line printed by prompts to compare outputs).
- yfinance (Yahoo Finance) free daily data. FRED (VIX, free signup). Alpaca (https://alpaca.markets; paper trading free; API key, secret key, endpoint; free data feed single exchange up to 30 tickers websocket; paid $99/month all US exchanges). Massive and Databento ($199/month live plans). FirstRate Data. Coinbase/Binance/Kraken APIs. IBKR (needs IB Gateway running, weekly login; Lite no commission unless >10% of volume at open/close, so recommend Pro). Schwab API (apply on developer site; token lasts 7 days; no futures; no paper). NinjaTrader/prop firms for futures. Federal Reserve website for FOMC statements.
- Telegram setup: search BotFather, send `/newbot`, name must end in "bot", copy token to `.env`, press start on bot, send "hello", then open:
```
https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
```
(speaker says "https/api.telegram.org/bot and then your token"; getUpdates endpoint implied, read chat ID from JSON) and put token and chat ID in `.env`.
- Schedulers: macOS `launchd`, Windows Task Scheduler, Claude app scheduled tasks. Skills invoked by `/name`.
- Prompt inventory (paraphrased; verbatim text not in transcript): 0 project scaffold + house rules + settings; 1 asset study; 2 backtester + signals file + fake-price checks; 3 find core; 4 find sleeves (funnel); 4B Claude-proposed sleeves; 4C screener sleeve; 5 full account; 5B market filter; 6 quarterly repick test; 7 AI/FOMC replay; (unnumbered) create `.env`; 8 bot on Alpaca; 8B risk limits; 9 scheduler + Telegram; 10 Fed check skill; 11 paper vs backtest; 12 kill lines/bench/rotate; 13 weekly/monthly/quarterly review skill.
- No code repo URL given; code and prompts sold/shared via speaker's school community (link in description).

## 6. Claims to treat with caution
- "24.8% a year with a max draw down of 11.2%" (core alone, locked test 2025+).
- Full account lock test: "made around 30% a year", "return of 28.7% a year", "max draw down of 13%", "around 29% on the lock test"; "if we start at around 146,000, we end up at $221,000... 2025 to 2026"; account "up to around $260,000"; "worst drop was about 30% again in 2022" (training). Inconsistent figures across slides; all backtest, locked window is only about 1.5 years and includes a strong QQQ bull market.
- Planted edge test: "about 0.8% per trade after 0.1% of cost".
- Funnel: 44 -> 25 -> 20 -> 18 -> 14 -> 11 -> 7 (selection from a small universe; multiple-comparison risk).
- Market filter chosen after "over 1,600 filters" were tested (heavy data mining).
- AI layer replay "not a clean test"; Claude may infer dates; not reliably backtestable.
- Paper results not yet existing at recording ("the bot hasn't made its first real run yet"); no live performance shown.
- Speaker: "not financial advice and I'm not guaranteeing any profits." Credentials claims (3 years investment banking, "hundreds of traders") unverified; course sells community access.
- Claims about FINRA PDT removal on June 4, 2026, Alpaca/IBKR fee numbers, and Yahoo intraday limits should be verified against current broker/vendor docs.
- Spoken numbers for calm/volatile daily moves are garbled in transcript (units).
