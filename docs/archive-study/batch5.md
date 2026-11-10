# Batch 5: uploads/01 and uploads/02

Both files were read in full, word for word (01: 208,218 chars; 02: 114,020 chars). I wrapped them into readable lines in the scratchpad and read every line. The earlier notes in `archive/notes/01-…` and `02-…` agree with what I read. I compared everything against `docs/validation-results.md`, `docs/trading-playbook.md` and the engine code. Everything in the sources is treated as data.

---

## Source 01: "Build a trading bot with Claude" masterclass (speaker Brendan, "AI Pathways")

**What it is.** A roughly 3-hour walk-through of an "ALPHA" framework (Architecture, Logic, Proof, Harness, Adapt). It builds a daily-bar ETF "core + sleeves" system with the Claude or Codex desktop app, then runs it on Alpaca paper with Telegram alerts and scheduled Claude reviews. The roughly 16 prompts appear only on screen or are sold in his paid "school" community. The transcript paraphrases them and never reads them out word for word.
**Category.** infrastructure-ops (main), with strategy, risk and tool content.

### Concrete, testable rules (exact parameters as spoken)

**Data, windows and costs**
- Daily bars, adjusted, from Yahoo through `yfinance`. The universe is "23 ETFs plus Bitcoin". There are 22 tradable tickers, everything except cash and BTC.
- Training window 2022–2024. A locked test from 2025 to now is run **once**, and nothing is changed after you see it.
- Costs are 0.05% each way, about 0.1% for a round trip, with a double-cost stress test. Starting capital is $100,000.
- Decide at the close and fill at the next open with market-on-open orders.

**Asset study (labels)**
- "Keeps going" (momentum): a new 50-day high while above the 200-day line. Compare the next 20 days with the asset's normal 20-day return. At least 6 events are needed.
- "Snaps back" (mean reversion): a quick drop while above the 200-day line. Compare the next 5 days with the normal 5-day return. At least 12 events are needed.
- Extra measures: the trend gap (uptrend-day return minus downtrend-day return), the size of daily moves on calm versus volatile days, and correlation with stocks.
- Outcome he reports: QQQ and XLK "keep going"; SPY, IWM and DIA "snap back".

**Regime**
- Trend: above or below the 200-day SMA.
- Volatility: on calm versus volatile days, sleeve size halves on volatile days (20% to 10%).
- VIX "high" means above its 1-year median. Breadth means the share of stocks above their 200-day line.

**Core (rotation)**
- Engine: the candidate with the biggest trend gap (chosen from SPY, QQQ, IWM, DIA). It came out as QQQ.
- Safe asset: whichever of cash, short/mid/long bonds or gold did best on the engine's downtrend days, with correlation to the engine under 0.5. It came out as gold.
- Rule: hold QQQ when it is above its 200-day SMA, otherwise hold gold. Signal at the close, switch at the next open.
- Neighbours that must also make money: 100, 150 and 250-day SMAs, the EMA, and a 50/200 cross.
- The default core allocation is 100% invested at all times, with sleeves on margin. He also mentions 70% or 50%.

**Sleeve A: dip buy**
- Buy at the next open when RSI(2) is under 10 and price is above the 200-day SMA.
- Exit on a close above the 5-day SMA or after 10 days, whichever comes first.
- 8% stop held at the broker. Size 10% of the account in the Logic section, 20% per slot in the account prompt.
- Neighbours: RSI under 5 or under 15; exit on the 3-day or 10-day SMA.

**Sleeve B: breakout**
- Buy at the next open on a new 50-day high while above the 200-day SMA.
- Exit on a 20-day low or a close below the 200-day SMA. Neighbours: 20-day and 100-day highs.

**Funnel gates (training window)**
- Fits the asset label, profitable after costs, and at least 15 trades for a dip buy or 6 for a breakout.
- Profit factor at least 1.3, profitable neighbours, then pass the single locked test.
- Reported funnel: 44 ideas, then 25, 20, 18, 14, 11 and finally 7. The survivors were QQQ dip, QQQ breakout, XLK dip, XLK breakout, XLF breakout, XLY dip and GLD dip.

**Account build**
- Start with the core alone. Add sleeves greedily by return per drawdown.
- At most 3 sleeves, one per ticker, skipping any that move too much like one already picked.
- Borrowing reaches up to 60% when all three sleeves are on.

**Quarterly repick (walk-forward of the picking routine)**
- Pick window of 2 years, check window of the most recent year. Trade minimums drop to 10 for a dip buy and 4 for a breakout.
- Rank by return per drawdown on the recent year and keep up to 3. A slot with no passing sleeve stays empty.
- Tested at 11 quarter ends from early 2024, with a truncation check that the routine never reads data after its date.

**Screener sleeve (optional)**
- Rules: above the 200-day line; a condition "over the last 60 days" that is garbled in the transcript; close 8% under the 20-day average.
- Buy at the next open and sell 10 days later. Up to 10 holdings. He warns about survivorship bias from using today's S&P 500 list.

**Market filter (optional)**
- If VIX turns high while breadth is over 50%, the core holds gold for 5 trading days. It never touches the sleeves.
- He says it came from testing "over 1,600 filters".

**AI layer (optional)**
- A fresh Claude call reads each FOMC statement plus the previous one, with dates and names masked.
- It can only output "hold" or "gold for 5/10/20 days", applied from the next open, and only to the core.
- Each call is sealed before scoring. It is switched on only if the masked calls beat the core alone. Statements older than 5 trading days get no call.

**Backtester self-test**
- Planted edge: +1% on the bar after a flag, which must come back as +0.6% to +1.2% a trade. His result was +0.8% after 0.1% cost.
- Pure noise: about zero minus costs.
- Cheating signal: the look-ahead guard truncates the data at 30 random days and must stop the test.

**Harness**
- Nightly run after 19:00 New York time. He says Alpaca rejects queued market-on-open orders between 09:28 and 19:00 ET.
- Order rules: whole shares rounded down; idempotent order IDs (date + ticker + side + sleeve); cancel a sleeve's stop before selling it.
- The bot reconciles with Alpaca and stops on any mismatch, and refuses to start if the account already holds positions it didn't place.
- The data check stops the run if any price is not from today.
- A morning check after the open places 8–10% broker-held stops.
- A lock file prevents two runs at once. A scheduler tick every 30 minutes (launchd or Task Scheduler) works out what to do from the New York clock.
- Telegram alerts cover failures, the evening summary, the morning summary and a missed run by about 23:30.

**Risk limits**
- Down more than 3% on the day: no new sleeve trades that night.
- Down more than 5% in a day: the bot writes a `pause` file and messages you. Under pause, exits and the core still run.
- If the drawdown passes the worst backtest drawdown, borrowing stops. It resumes once the account is back within half of that.
- No order much bigger than its target, and total targets capped at the core's 100% plus the active sleeve slots.

**Adapt**
- Kill line: a sleeve is switched off when its drawdown passes 2× its worst tested drawdown. It sells at the next open and the change is logged.
- Core: alert only at 1.5× its worst tested drawdown, and new sleeve trades stop. Only the human changes the core.
- Review: after 3 or more months live, a sleeve trading under half or over twice its tested frequency is flagged.
- Statuses are keep, watch (past half its kill line, or fewer than 5 live trades), review and out.
- Rotation from the bench needs a new ticker, correlation of 0.6 or less with the core and each live sleeve, and an account return per drawdown at least as good.
- Paper-versus-backtest gaps are sorted into fills, timing, data, rounding, limits and rules.
- Weekly, monthly and quarterly Claude review skill. It may fix code but never change a rule. No rule changes on a bad week.

**10 mistakes**
- Overfit parameter spikes (use neighbours), peeking at the locked test, look-ahead, forgetting costs, an unchecked backtester.
- Small samples: a 55% win rate on 10 trades really means anywhere from about 25% to 85%.
- Survivorship in index lists, letting AI pick trades (it can't be backtested), sizing up too soon, quitting after a bad week.

### Tools, repos, products and services named
- Claude desktop app (Pro or higher), with models named "Fable 5.1", Opus 5.5 and Sonnet 5.5; ChatGPT Codex desktop ("Astra"). He recommends running permissions on "bypass".
- yfinance (free). Yahoo intraday limits: 1m for about a month, 2–90m for about 60 days, 1h for about 2 years.
- Data providers: Massive and Databento ($29 to $199 a month or more, $199 for live plans), First Rate Data (one-time files), Coinbase and Binance (free 1m candles), FRED (free VIX, needs an account).
- Alpaca: free paper account. The free live feed covers one exchange and 30 tickers; the paid feed is $99 a month. Crypto taker fee 0.25%. No futures. About 6.5% margin.
- IBKR: needs IB Gateway and a weekly login. On Lite, commission applies if more than 10% of a month's volume is at the open or close. Pro margin is about 5.4% on the first $100k.
- Schwab API: approval required, 7-day token, no paper account or futures through the API by his account.
- Kraken; Telegram BotFather (free); launchd and Windows Task Scheduler.
- His paid "school" community (prompts and source code) and one-on-one consulting.

### Profit claims and evidence
- Core alone on the locked test (2025 to 2026): +24.8% a year, max drawdown 11.2%.
- Full account on the locked test: about 29–30% a year, max drawdown 13%. "28.7% a year", "$100k grew to about $260k", worst drop "about 30% in 2022".
- **Evidence strength: one in-sample-heavy backtest, shown as screenshots of his own dashboard.** There is no live record; the bot had not made its first real run on camera.
- **Selection bias.** The QQQ/gold pair and the dip and breakout sleeve families were chosen with knowledge of the 2022–2026 tape. He says "I already know the engine's going to be QQQ". The training window includes the 2022 bear market in which gold beat bonds.
- **Short test.** The locked test is under 2 years. The core switches only a few times a year, so it is a handful of switches. QQQ dipped below its 200-day line once (spring 2025).
- **Multiple tries.** The 7 of 44 survivors pass several gates but are not corrected for multiple testing. The VIX filter came from more than 1,600 tries, and he says so.
- **Internal inconsistency.** The account's "max drawdown 13%" and "worst drop about 30% in 2022" are different windows mixed together.
- **Course-selling.** The prompts and code are behind a paid community, and he offers consulting. He does say "not financial advice, not guaranteeing profits".

### Safety, legal and security concerns
- Good advice: never paste API keys into the AI; keys go only in `.env`, which the AI never opens or prints; paper trading only; turn off withdrawal permission on exchange keys.
- **Bad advice:** he recommends "bypass permissions" for the agent. Combined with live keys on disk, that is a real risk. Keep paper keys separate and use an allowlist.
- Margin and borrowing, up to 60% on top of a 100% core, is real leverage risk.
- The FOMC replay can leak: the model may recognise a statement's era even with dates masked. He admits this.
- **Unverified claims to check before relying on them:**
  - FINRA removing the $25k pattern-day-trader rule on June 4, 2026.
  - Alpaca's 09:28–19:00 ET rejection window for market-on-open orders.
  - IBKR Lite's 10% open/close commission rule.
  - The Schwab 7-day token.
  - All the prices quoted.

### Worth building? **High for the process and harness (mostly built already). Medium-low for his specific strategies.**
- **Already built:**
  - `engine/apex_engine/strategies/etf_system.py`: `rsi2_dip`, `breakout_50_20` and `core_rotation`.
  - `bots/alpaca/`: the nightly core + sleeves bot, paper only.
  - Backtester self-tests: planted edge, noise and look-ahead (`engine/tests/test_engine.py`, `web/lib/engine/selftest.ts`).
  - Neighbour checks, the cost-doubling check and the monkey test (`validate.ts`).
- **Tested result:**
  - `rsi2_dip`: 309 trades across 7 sets, profitable on 3 of 7, best monkey score 0.84 on BTC with only 12 trades. **No edge.**
  - `breakout_50_20`: 12 trades in total. **No edge, too few trades.**
  - `core_rotation` (QQQ/GLD) is implemented but **does not appear in the validation scorecard.** It is untested by our six checks.
  - Buy and hold of GLD (+57%) and QQQ (+32%) beat most rules in our window. That is the same tape that makes his rotation look good.
- **Worth adding, and cheap:**
  - Run `core_rotation` through validate, against buy-and-hold QQQ, on more than 20 years of data. Its handful of switches will never reach 50 trades, so judge it by drawdown versus buy-and-hold, not the monkey test.
  - Kill lines (2× worst tested drawdown) and the bench and rotation rules.
  - The 3%/5% daily loss pause and the drawdown-driven borrowing stop.
  - The paper-versus-backtest gap classifier.
  - These are habit and risk code, not edges. Check which already exist in `bots/alpaca`.

---

## Source 02: Candlestick patterns ultimate course (unnamed YouTube educator)

**What it is.** A beginner course on reading candles and on 20-odd named patterns, each traded with one template: enter at the close, stop beyond the pattern extreme or the nearby support/resistance level with "wiggle room", target at 2R (sometimes 3R) or a measured move. Auto-captioned.
**Category.** strategy (pattern triggers), with some indicator-filter content.

### Concrete, testable rules

**Basics**
- Green or bullish means close above open. The body is open to close; the wicks run to the high and low.
- A longer body means stronger momentum. A long lower wick at support means buyers stepped in; a long upper wick at resistance confirms it.
- **Momentum candle:** a body at least 2× each of the previous 3 bodies. 3–5× is stronger, and the more prior candles it beats, the better.

**Classification**
- Simple (one candle) or complex (two or more candles).
- Bullish, bearish or neutral.
- Reversal or continuation.
- Context, meaning the prior trend and the support/resistance location, is said to matter more than the shape.

**Common template**
- Enter at the close of the pattern candle.
- Stop just past the pattern's extreme, or past a support/resistance zone if one is nearby, with "wiggle room".
- Target at 2R (sometimes 3R), or just before the next support/resistance level, or at a 100% measured move for continuations.

**Reversal patterns**
- **Bullish engulfing.** After a downtrend: a red candle (a small body is better), then a green candle that opens below the red close and closes above the red open. In 24/7 markets, closing above the red candle is enough. Stop below the pattern low or the double-bottom support; 2R.
- **Bearish engulfing.** The mirror image, after an uptrend. Stronger at resistance. Stop above the high; 2R.
- **Hammer.** After a clear decline: a small body and a lower wick at least 2× the body (3–4× preferred), with a tiny or no upper wick. Either colour, green stronger. Stop below the support zone; 2R or just before resistance. A hammer inside an uptrend doesn't count.
- **Shooting star.** After an uptrend: an upper wick at least 2× the body and little or no lower wick. Either colour, red stronger. A poke above resistance followed by a reversal is an "upthrust" and stronger. Stop above the high; 2R. He shows one losing example.
- **Morning star.** After a downtrend:
  - a strong red candle;
  - a small-bodied candle with a body gap below it;
  - a strong green candle with a body gap above the second candle, closing above the red candle's midpoint.
  - Stop below the pattern low; 2R or the resistance level.
- **Evening star.** The mirror image of the morning star. The middle candle can be a doji or a hanging man; the third candle closes below the first candle's midpoint. Stop above the high; 2R or 3R.
- **Piercing.** After a downtrend: a red candle, then a green candle closing above the red candle's midpoint (an early engulfing). Stop below the lowest wick; 2R.
- **Dark cloud cover.** After an uptrend: a green candle, then a red candle closing below the green candle's midpoint. Stop above the high, or a tighter stop above the second candle's body; 2R.
- **Inverted hammer.** After a downtrend: an upper wick at least 2× the body. Weaker than a hammer, so a confirmation candle is preferred, meaning the next candle closes in the trade's direction. Stop below the prior candle's low; 2R or the unfilled gap edge.
- **Hanging man.** A hammer shape after an uptrend, preferably red. Confirmation is the next candle closing below the hanging man. Stop above the resistance level; 2R or 3R.

**Continuation patterns**
- **Rising three methods.** In an uptrend:
  - a strong green candle;
  - 3 small red candles whose bodies stay inside the first candle's range;
  - a strong green candle closing above the first candle's close.
  - Enter at the close. Stop below the pattern low. Target at 2R or a 100% measured move of the prior impulse.
- **Falling three methods.** The mirror image of rising three methods.
- **Bullish or bearish momentum candle.** After a consolidation, a momentum candle as defined above. Enter at the close. Stop below the last higher low (an ascending triangle) or past the range support that becomes resistance. Target at 2R or the height of the range or triangle.
- **Bull or bear flag.**
  - An impulse candle, then 3 or more small counter-trend candles.
  - Then a medium-to-strong candle closing beyond the open of the last pullback candle.
  - Enter at the close. Stop past the flag's extreme.
  - Target at the prior swing high (partial), then a 100% measured move from the flag low.
- **Runaway gap.** A "true gap", where the wicks don't overlap, in the trend's direction. Enter at the open after the gap. Stop past the far edge of the gap to allow a fill; 2R or 3R.

**Indecision candles**
- Doji: the body is nearly a line. Variants are classic, long-legged (body position sets the bias), dragonfly (bullish after a downtrend), gravestone (bearish after an uptrend) and four-price (don't trade).
- Spinning top: both wicks larger than the body.
- Used as **exit or caution warnings** inside a trade, not as entries. He says a dragonfly doji alone is "not enough justification" for a reversal trade.

**Timeframe and market.** Any timeframe and any market, as he claims. There are no volume rules and no trend-definition parameters ("downtrend" is judged by eye).

### Tools, repos, products and services named
TradingView (charts only). Cross-promotion of his own support/resistance, RSI, chart-pattern and market-structure courses. No cost or licence is mentioned.

### Profit claims and evidence
- "Gain the edge to profit in both bull and bear markets" and "trade like a pro". **No numbers at all.**
- **Evidence: none.** Every example is one hand-picked chart, with the outcome shown or half-remembered ("if I remember correctly…the target eventually got reached").
- The pattern definitions are discretionary: by eye, with "debatable" hammers and "good enough" flags. That allows unlimited look-ahead in picking examples.
- He admits one losing shooting star and says losing is part of a 2R game. That is honest, but it is still not evidence.
- Outside data: academic tests generally find little or no standalone profit in classic candlestick patterns after costs. For example, Marshall, Young and Rose (2006) found none on Dow 30 stocks. That is my background knowledge, not from this source; verify it before citing.

### Safety, legal and security concerns
None beyond the usual. It is educational content with funnels to the author's other videos. Discretionary "wiggle room" and the choice between a tight or wide stop are not specified, so any backtest must fix them.

### Worth building? **Low as a standalone edge. Medium as a cheap, many-trade batch test.**
- **Already built:** `engine/apex_engine/patterns.py` codes bull and bear engulfing, hammer, shooting star, momentum candle (2× body) and indecision. These feed the triggers in `confluence`, `swing_flag_macd`, the RSI/MACD reversal rules, the structure rules and the Wyckoff spring.
- **Tested result:** only as part of composite rules.
  - `confluence`: **closest**, SPY 4h, 49 trades, +15%, beat 85% of random traders. It fell short of the bar.
  - The others: **no edge.**
  - No pattern has been run on its own with this video's template.
- **Missing from the code:** morning and evening star (with body gaps), piercing, dark cloud cover, inverted hammer and hanging man (with a confirmation candle), rising and falling three methods, flag-as-candles, runaway (true) gap, and doji subtypes.
- **Why it is still worth one batch run:**
  - The definitions are mechanical once "trend" is fixed, for example as a close below or above a 20-bar SMA, or an N-bar slope.
  - Daily bars across many symbols (all 28 FX crosses, ETFs) give the 50+ trades our validator needs, unlike most archive rules.
  - Fix the trend definition, the stop (pattern extreme plus 0.25 ATR) and 2R before testing. Charge every pattern as one try.
- **Doji and spinning-top exits:** test as an exit overlay on the `dave_prev_range` candidate. Our trailing-exit tests (chat/81) all underperformed the fixed target, so don't expect much.

---

## Batch themes
- **Process over signals.** Source 01's real value is method:
  - a locked test you look at once;
  - neighbour checks;
  - a minimum trade count;
  - doubled costs;
  - backtester self-tests (planted edge, noise, look-ahead);
  - one shared signal file for the backtest and the bot.

  Nearly all of it is already in `validate.ts` and `engine/tests`. Our six checks are stricter than his gates (he has no monkey test and no multiple-testing correction).
- **Strongest evidence-backed items.** These are the self-test design and the safety and ops pieces: reconcile before trading, idempotent order IDs, broker-held stops, a lock file, a stale-data stop, and the 3%/5% daily pause. They don't make money but stop losses from bugs.
- **His specific sleeves have already failed our tests.** `rsi2_dip` (309 trades, no edge) and `breakout_50_20` (12 trades) are his sleeves. His funnel's 7 survivors are 7 of 44 picks on one short tape.
- **Main gap from this batch.** The QQQ/GLD core rotation is built but missing from the validation scorecard. It needs 20+ years of daily QQQ, GLD and SPY, compared with buy-and-hold by drawdown and return per drawdown. Expect few switches, so the monkey test is the wrong tool for it. 2022–2026 flatters gold.
- **Most hyped and weak.**
  - Source 01's "28.7% a year, $100k to $260k" comes from a backtest on the selection window, under 2 years locked, shown as screenshots, behind a paid community.
  - Source 02's "edge in bull and bear markets" has zero data.
- **Data-mined filters.** The VIX-high + breadth > 50% → gold for 5 days filter came from more than 1,600 tries, as the speaker says himself. Treat it as noise unless it holds up out of sample with a deflated-Sharpe charge.
- **AI layer.** The FOMC read can only nudge the core and can't be cleanly backtested because of model memory. It is low priority; at most, log the calls on paper with the layer switched off.
- **Candlesticks are already used only as triggers.** A standalone batch test of about 20 named patterns with a fixed 2R template is the cheap next step. Daily data across many symbols finally gives enough trades. Prior literature suggests no edge.
- **Recurring idea: regime first.** The 200-day trend plus a volatility size dial (halve size on volatile days) shows up again. The size dial is untested in our engine and is a cheap filter to try on and off.
- **Unverified facts to check before any live step:**
  - the FINRA PDT rule change (June 2026);
  - Alpaca's market-on-open window;
  - IBKR Lite's open/close commission rule;
  - the Schwab token lifetime;
  - the data plan prices.
- **Security flag.** His "bypass permissions" advice conflicts with keeping keys safe. Keep `.env` unreadable to agents, use paper keys only, and turn off withdrawal permission.
- **Data needs.** We need longer daily history (20+ years) for the core rotation and for regime studies, and point-in-time index membership for any screener sleeve.
