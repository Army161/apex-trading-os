# Batch 8: uploads 13, 14, 15 (same YouTube educator, TradingView-centric)

Read in full: 13-price-action-masterclass.md (139,021 chars), 14-indicators-masterclass.md (67,941 chars), 15-tradingview-ultimate-tutorial.md (104,885 chars). Context: docs/validation-results.md, docs/trading-playbook.md, prior notes in archive/notes/13-15, and a grep of web/lib/engine.

All three are from one creator. Each pitches a TradingView affiliate link many times ("30 days of Premium free, $15 bonus", and in 15: "I will get a small commission"), plus YouTube channel memberships and the creator's other courses. None has a backtest, a sample size or a track record. Every "trade" shown is a hand-picked chart example after the fact, and one (SMCI, Adobe) was still open when recorded.

**File structure note:** upload 13 holds **two transcripts joined together**. Part A, about the first 87k characters, is the Price Action Masterclass. Part B is a separate MACD course by the same speaker, starting at "in this free video course you will learn everything you need to know about the macd indicator". Upload 15 also ends with a separate "rank 21 indicators on a tier list" video. Each part is treated separately below.

---

## 13A. Price Action Masterclass

**What it is:** A one-hour beginner course on reading candles: momentum candles, hammer, shooting star, engulfing and doji patterns, price action at support and resistance, breakouts and false breakouts, volume, and three TradingView indicators. **Category:** strategy (discretionary), with an indicator-filter part.

**Concrete, testable rules**
- **Framing:** market structure (zones, trend, S/R) is "macro" and says where to look. Price action (the current candles) is "micro" and says when to act. Use both.
- **Momentum candle:** the real body is at least 2x the bodies of the previous 3–5 candles. Prefer 3–4x, with small wicks, a strong close and high volume. The streak continues while each next candle is about the same size or larger, and resets on a clearly smaller candle. A new streak needs the 2x rule again.
- **Hammer** (bullish reversal, one candle): needs a prior down move. Small body, lower wick at least 2x the body, upper wick small or none. Enter at the close, stop below the candle low, target 2R.
- **Shooting star** (bearish mirror): needs a prior up move. Upper wick at least 2x the body (3–4x preferred), lower wick small or none. Enter at the close, stop just above the wick, target 2R. Stronger at resistance; ignore it mid-range.
- **Bullish engulfing:** needs a prior downtrend. The red candle has a small body. In stocks, the green candle opens below the red body and closes above it. In crypto, an open equal to the prior close is allowed. A higher close above the red body makes a stronger signal. Enter at the close. The stop goes below the pattern low, or a set distance below support. Target 2R. The bearish engulfing is the mirror.
- **Doji family:** open is about equal to close. Classic doji (equal wicks) is neutral. Long-legged doji: the closer the body sits to the top, the more bullish. Dragonfly is bullish (close to a hammer), gravestone is bearish, and the four-price doji is rare. No trade rule is given.
- **Strong S/R tells:** a sharp reaction with a long wick, a reversal pattern at the zone, a fast move away on strong candles, and high volume on the strong test.
- **Signs a level is about to break:** lower highs pressing into support (or higher lows into resistance), small doji or spinning-top candles clustering at the level, rising volume on weak tests, and a momentum candle closing through the level. Also: "too many tests weaken a level".
- **Breakout checklist:**
  1. A momentum candle of at least 2x, preferably 3x+.
  2. It closes far beyond the level.
  3. Volume above recent bars (the example used more than 2x the prior days).
  4. The level is obvious to everyone, so higher timeframes are better.
  5. Optional: wait for a follow-through momentum candle, or enter on the retest when the broken level flips.
- **False-breakout tells:** a weak breakout candle, only a wick beyond the level, no rise in volume, or an immediate opposite candle. The creator says trading these traps is "one of my favorite strategies", but gives no rules.
- **Volume:** rising price on falling volume means exhaustion. A volume spike at a high or low marks it as important. Forex volume is tick volume and less reliable.
- **TradingView indicator settings:**
  - Built-in "All Candlestick Patterns": only engulfing, hammer and shooting star switched on, with trend detection = SMA 50 to filter out counter-context signals.
  - "Pivot Points High Low" at 20/20 (20 bars left and right). Clusters of pivots mark S/R.
  - Fixed-range volume profile over the last swing. The idea is that price moves freely through low-volume areas, so set the target just before the value area.
- **Markets and timeframes:** "any market, any timeframe". Examples were BTC daily (the 2017 high near 19.7k, the 2020 failed break and the Dec-16-2020 break) and SMCI daily.

**Tools named:** TradingView (free tier, plus Essential and Premium; affiliate link with a $15 bonus). TradingView's built-in All Candlestick Patterns, Pivot Points High Low, Volume and Fixed Range Volume Profile indicators. Plugs for the creator's other courses on volume, S/R, candlesticks, market structure and order flow.

**Profit claims and evidence:** "Generate consistent profits", "read the market's next move", "you know more than 99% of traders". There is no evidence beyond cherry-picked charts. The BTC 2020 breakout is a single famous example chosen after the fact (survivorship and hindsight). Course-selling and affiliate funnel. The speaker says "trading is about probabilities", but quotes none.

**Safety, legal, security:** Nothing material. Affiliate disclosure appears only in upload 15.

**Worth building? Medium.** The rules are mechanical and cheap to test, and most of them already exist.
- `core.ts candles()` already has hammer, star, engulfing and a momentum flag. They feed `confluence` (the closest result: SPY 4h, 49 trades, +15%, monkey 0.85, not passed), `failure_test_2b` (no edge) and `bb_squeeze` (no edge).
- Gaps worth one test pass:
  1. Momentum is defined in `core.ts` as 2x the **previous one** candle, not the previous 3–5. Add a 3–5 bar version, the streak rule, and a 3x option.
  2. The "pattern only when SMA-50 trend context agrees" filter, as TradingView implements it.
  3. A breakout scored on all four checklist items (2–3x body, close distance in ATR, volume above 2x its 20-bar average, a 20/20 pivot cluster as the level).
  4. The "lower highs into support, then break" pre-break pattern (ascending or descending triangle).
- Expect the usual result. `breakout_50_20` and `turtle_55_20` have no edge, and filters cut trades faster than they add quality.

---

## 13B. MACD indicator course (appended inside upload 13)

**What it is:** A course on how MACD works: the 12/26/9 parts, the zero line equal to the EMA12/EMA26 cross, the claim that crossovers fail, regular and hidden divergence, and alternative settings. **Category:** indicator-filter.

**Concrete, testable rules**
- **Definitions:**
  - MACD line = EMA12 − EMA26.
  - The speaker says the signal line is an **SMA 9** of the MACD line. TradingView's default and the standard definition use an EMA 9, and `core.ts macd()` uses an EMA for all three.
  - Histogram = MACD − signal. A zero-line cross happens exactly when EMA12 crosses EMA26.
- **Claim:** "Trading only MACD/signal crossovers is one of the worst mistakes". He shows one BTC daily stretch with about 2 of 7 crosses good. This matches playbook §3: "Plain MACD crossovers lose".
- **Divergence types:**
  - Regular bullish: price makes a lower low, MACD a higher low. It signals a reversal.
  - Regular bearish: price makes a higher high, MACD a lower high.
  - Hidden bullish: price makes a higher low, MACD a lower low. It signals continuation.
  - Hidden bearish: price makes a lower high, MACD a higher high.
  - Lows are used for the bullish types and highs for the bearish ones. Equal lows on price with higher lows on MACD also count.
  - Histogram divergence fires earlier. Divergence on the MACD line fires later but is "more significant". Clearly separated histogram "mountains" are better. A triple divergence is stronger. Divergence on both forms at once is stronger still.
- **Settings:**
  - Linda Raschke **3-10-16**: fast 3, slow 10, signal 16, and both the oscillator and the signal set to **SMA**. It is faster and gives more false signals. (Upload 14 gives the same setting with the oscillator as an EMA. The two sources contradict each other.)
  - "5-35-5": watch the MACD line only, not the histogram.
  - Auto-divergence script "MACD Divergences by DavidTech": the pivot lookback is 5/5, so it confirms up to 5 bars late. Setting it to 1/1 gives too many false signals.
  - Histogram-only view drawn as a line.
- **Worked example (hindsight):** a downtrend channel, then triple equal lows with 5-35-5 MACD higher lows, a hammer and an engulfing, and a momentum candle breaking the channel. Long on the break, stop below the triple lows, target 2R (or 1.5R).
- **Timeframes and markets:** "all timeframes". Examples were BTC daily and GBPUSD 1h.

**Tools named:** TradingView (affiliate link again). The community script "MACD Divergences" by DavidTech. Another, more popular one is mentioned by an unclear name ("toris").

**Profit claims and evidence:** None quantified. One cherry-picked crossover stretch, and the divergence examples were all chosen after the fact. Course funnel.

**Safety, legal, security:** None.

**Worth building? Medium.** MACD divergence plus a reversal candle is already listed as an untested gap in `docs/strategy-gaps.md` (chat/16), and `macd()` exists. This source adds testable variants: histogram vs line divergence, regular vs hidden, the 3-10-16 SMA and 5-35-5 settings, and a pivot-confirmation lag of 5 bars. Build it with an explicit pivot lag so it can't look ahead. `core.ts macd()` would need an SMA option to reproduce Raschke's version. Count every variant as a try in the deflated Sharpe.

---

## 14. Indicators Masterclass

**What it is:** A tour of the creator's favourite TradingView indicators (RSI, MACD 3-10-16, Fibonacci golden zone, ATR, Pivot Points High Low, auto candlestick patterns, auto chart patterns) with a confluence example for each. **Category:** indicator-filter, with discretionary strategy examples.

**Concrete, testable rules**
- **RSI** (Wilder 1978, 14): "Sell above 70, buy below 30 is completely wrong." Use divergence instead. For 15m and shorter timeframes, RSI length 7–10 with bands at **80/20**, and divergences that happen beyond 80/20 are preferred. The built-in "calculate divergences" option gives many false signals.
- **MACD 3-10-16 (Raschke) pullback:**
  - Settings: fast 3, slow 10, signal 16. Source is the close (or OHLC4). He says to **keep the oscillator as an EMA** and set the signal line to an **SMA**. This contradicts 13B.
  - Setup: the MACD line spikes well above its previous several peaks (an impulse), then price pulls back.
  - Entry: a bull-flag breakout, or a failure test below flag support.
  - Stop below the flag low, target 2R. Example: gold 1h.
- **Fibonacci "golden zone":** keep only the 0, 0.382 and 0.618 levels. Draw low to high in an uptrend and high to low in a downtrend. "Most pullbacks end between 0.382 and 0.618". Some use 0.5–0.618 instead. 50% is "not Fibonacci but geometric". The example was the BTC 2021 daily bull run. The trade needs a golden-zone touch, a flipped S/R level and a bullish engulfing.
- **ATR** (Wilder, 14, RMA smoothing):
  - Length 7–10 for intraday (an EMA is fine), 20–50 for swing trades.
  - Match the RSI length.
  - Stop = 2x ATR from the entry, target = 4x ATR (that is, 2R).
  - Example: BTC with an ATR of 3,400 gives a 6,800 stop, which sat just below the golden zone. He suggests extra room past the zone. ATR is also named for sizing, trailing stops and breakout confirmation, but with no rules.
- **Pivot Points High Low at 20/20:** pivot clusters mark S/R, drawn on candle bodies, and consistency matters more than precision. His favourite setup is higher lows into resistance (an ascending triangle). Enter at the close of the breakout candle, stop 2x ATR (example ATR 40, so stop 80), target 2R. A symmetrical triangle breakout is shown too.
- **Auto candlestick patterns:** bullish engulfing, hammer, shooting star, inverted hammer and hanging man, with the SMA-50 trend filter. Trade them only at clustered pivot S/R. Stop 2x ATR, or just below the hammer or support. Target 2R. Example: Adobe daily, still open when recorded. He also notes that at 2R you only need to win 33% of the time ("don't even have to win 40%").
- **Auto chart patterns** (Premium only): limit to double top and bottom or bull and bear flags. The pattern's target is drawn for you. Example: NASDAQ-100 daily double top, plus an RSI bearish divergence on equal highs, plus a bearish engulfing at the neckline break. Short, stop 2x ATR (ATR 425, so 850), target 2R.
- **General:** confluence of 2–3 factors is "often enough to take a trade".

**Tools named:** TradingView built-ins (RSI, MACD, Fib retracement, ATR, Pivot Points High Low, All Candlestick Patterns, and the **Premium-only** auto chart patterns), plus the affiliate link.

**Profit claims and evidence:** "Use indicators to make money", "advanced techniques most traders don't know". Evidence is hand-picked charts only. The Fib claim ("most pullbacks end in the golden zone") is shown on one hindsight-perfect BTC bull run. That is selection bias: the zone spans 24% of the leg and is placed after the swing is known. Course and affiliate funnel.

**Safety, legal, security:** None.

**Worth building? Medium–low.**
- Most of it is covered already:
  - ATR 2x stop with a 2R target is in playbook §2.
  - 2R break-even at 33% is in playbook §1.
  - Engulfing and hammer at S/R feed `confluence` (closest, not passed).
  - Pullback depths of 38–62% match `urban_deal_flow` (no edge; a 50% depth did better, but on under 50 trades), `demand_second_leg` (3 trades) and `dave_prev_range`. That last one is a 50% retrace, the only **candidate**: 6/6 on SPY and IWM 30m/1h.
- The new testable items:
  1. The MACD 3-10-16 impulse-then-pullback entry. It is basically a momentum-filtered version of the `dave_prev_range` and `urban_deal_flow` family, so it's worth one run as a filter on the candidate.
  2. 20/20 pivot clusters as the S/R source.
  3. An ascending-triangle breakout (three or more higher lows into flat resistance).
  4. RSI(7) 80/20 divergence on intraday bars.
- Golden-zone Fib on its own: low. It needs a swing detector that can't see the future. We already test 38/50/62% depths.

---

## 15. TradingView Ultimate Tutorial (2025), plus an "indicator tier list" video at the end

**What it is:** A beginner walkthrough of the TradingView interface: sign-up and plans, symbol search, candle reading, chart types, log scale, themes, drawing tools, long/short position tools, indicators, timeframes and layouts, screeners, Bar Replay, broker connection, paper trading and alerts. It ends with a subjective ranking of 21 indicators. **Category:** tool-repo-product (with business-money: an affiliate funnel).

**Concrete, testable rules**
- Mostly none. The items that are close to rules or useful facts:
  - Pick the highest-volume venue for a crypto symbol (Binance was recommended at the time). Prices are about equal across venues.
  - Heikin Ashi smooths trends but loses information.
  - Use log scale only for long history.
  - The long/short position tool is used to plan stop and target, with a 3:1 example.
  - Multi-timeframe: analyse daily, then go down to 4h for entry.
- **Screener example:** S&P 500 or NASDAQ-100 universe, daily change filters, and a technical filter of **RSI(14, daily) < 30**. It returned three NASDAQ-100 names on the recording day.
- **Alerts:** price greater than a value (for example just above the BTC all-time high near 108.5k), once vs every time, and notification by app, email or sound. RSI alerts: greater than 70, bullish or bearish divergence conditions. The **free plan limits the number of alerts**.
- **Paper trading:** TradingView's built-in simulated broker. He sets leverage to **1:1 for every asset class** and a $1M balance. Shown: a market buy of 1 BTC with TP at 100k and SL at 90k, then a manual close for −$130.
- **Tier list** (his opinion, "for fun, not financial advice"):
  - S tier: Pivot Points High Low, price action, market structure.
  - A tier: ATR, Volume, MACD, MACD 3-10-16, RSI, auto chart patterns, support and resistance.
  - B tier: volume profile, auto candlestick patterns, Fib retracement, Fib extension, "smart money concepts" ("old concepts repackaged").
  - C tier: SMA, HMA, EMA, trend channels.
  - D tier: Fib circles, Fib channels.
- **Plan facts as stated (late 2024):**
  - Plans are Basic (free), Essential, Plus and Premium, with a 30-day trial on the paid ones.
  - Indicators per chart: Essential 5, Premium 25.
  - Multi-chart layouts need Essential or higher; more panes need Premium.
  - Premium only: volume footprint and auto chart patterns.
  - Paid plans have no ads.
  - Bar Replay runs at 10x or 3x updates per second (Shift + Down to play or pause).
  - Claimed broker stats: "2.7M traders, over 250M live orders".

**Tools named:**
- TradingView (Supercharts, screeners, Bar Replay, Pine "personal" scripts mentioned in passing, the Paper Trading simulator, broker integration, alerts).
- Exchanges: Coinbase, Bitstamp, Binance.
- No prices were quoted, only plan tiers.
- Affiliate: a $15 credit on the first subscription, and "I will get a small commission".

**Profit claims and evidence:** The tier list is framed as "best and worst indicators to make money", but it is the speaker's opinion with no testing. He admits he has barely used some of the indicators he ranks (Fib circles). No performance claims. It is an affiliate funnel, with the disclosure stated in this video.

**Safety, legal, security:**
- Connecting a live broker inside TradingView hands it order permissions. Keep the bots paper-only.
- TradingView's ToS limits automated scraping of chart data. Any "TradingView bridge" for history (validation-results names one, pending Remote Control) should use exports or an official integration, not scraping.
- Alert webhooks need a paid plan. If they ever trigger orders, the webhook endpoint needs authentication, because spoofed alerts become a security risk.
- Paper-trading leverage defaults should be checked. He resets them to 1:1, which matches our "leverage is research only" rule.

**Worth building? Low** as a trading strategy. **Medium** as infrastructure:
- (a) Bar Replay and paper trading are a manual way to forward-test the `dave_prev_range` candidate. We already have `bots/paper-exchange`.
- (b) Alerts (price or indicator conditions) are a cheap signal channel for the paper bots, if a paid plan exists.
- (c) The screener idea (a universe filter such as RSI < 30 on S&P 500 names) is a cheap way to get **many symbols**. That is the main data gap in validation-results ("1h bars across many symbols"). We can rebuild it ourselves from the Massive connector.
- An "RSI(14) < 30 daily on S&P 500" screen is close to `rsi2_dip` (no edge) and `rsi_regime` (no edge), and is untested as a cross-sectional rule.

---

## Batch themes
- **One funnel.** All three are the same creator selling a TradingView affiliate link and channel memberships. There are no backtests, no sample sizes and no track records anywhere. Every example is a hand-picked chart, and some were still-open trades.
- **What recurs:** candle trigger + level + volume + 2R target ("confluence of 2–3 factors"). That is our `confluence` strategy, the closest non-pass (SPY 4h, 49 trades, monkey 0.85).
- **Strongest evidence-based items:** the cautions match our data. Crossovers alone lose. RSI 70/30 alone is not a signal. Patterns only work in context. At 2R you need a 33% win rate. Stops and targets should be set before entry. None of these are edges.
- **Consistent parameters across sources:** momentum candle body at least 2x the prior 3–5 bodies (3x for breakouts); pattern stop past the wick; 2x ATR(14) stop with a 2R (4x ATR) target; pivot 20/20; SMA-50 trend context for patterns.
- **Contradictions to note:** the Raschke 3-10-16 oscillator is an SMA in 13B and an EMA in 14. The signal line is called an "SMA 9" in 13B, which is wrong for the default MACD.
- **Most hyped, weakest:** the Fibonacci golden zone (24% of the leg, drawn after the fact, on one BTC bull run). The BTC 2020 all-time-high breakout as "proof" of the breakout checklist. The indicator tier list as a guide to "indicators that make money".
- **Cheap tests worth running:**
  1. A momentum-candle rule over 3–5 bars with streaks (`core.ts` uses the previous one candle only).
  2. The MACD 3-10-16 impulse filter on the `dave_prev_range` candidate.
  3. A four-condition breakout, and an ascending-triangle (higher lows) breakout.
  4. Regular vs hidden MACD/RSI divergence with pivot lag (an existing gap from chat/16).
- **Test discipline:** count every variant toward the deflated Sharpe. Expect filters to cut trades below 50, as before.
- **False breakouts:** called "one of my favorite strategies" but never written down. `failure_test_2b`, `smc_sweep_lite` and `ict_turtle_soup` already cover them, with no edge.
- **Gap, data:** trade counts are the binding constraint. The screener approach (many symbols) and TradingView Bar Replay or exports would help more than any rule here, as long as TradingView's ToS is respected (no scraping).
- **Gap, volume:** volume confirmation is central to these sources, but forex volume is tick volume. Our FX set has no real volume, so volume-gated rules should be tested on SPY, QQQ, IWM and BTC only.
- **Gap, untestable:** "obvious to everyone" levels and volume-profile magnet targets need a definition and data (volume at price) we don't have. Treat them as research only.
