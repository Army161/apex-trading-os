# Batch 7 study: uploads/08, 09, 10, 11, 12

All five files were read in full, word for word. Each is a single very long line, so I folded copies into the scratchpad to read them in chunks. Context read first: `docs/validation-results.md`, `docs/trading-playbook.md`, `docs/strategy-gaps.md` and the strategy definitions in `web/lib/engine/strategies.ts`. Every file is a free YouTube course by the same educator, the "Mind Math Money" channel (mindmathmoney.com). They share one style: concepts are drawn on slides, then shown on hand-picked TradingView charts (Bitcoin, Google, NVIDIA, gold).

## Structural findings (checked by byte comparison)
- **uploads/09 is identical to uploads/07.** Only the first-line HTML comment differs (the upload file id). The bodies match byte for byte after that. Nothing in 09 is new.
- **uploads/08 is two transcripts joined together.** (A) is the Liquidity course, characters 0 to 84,780. (B) is the whole of uploads/07/09 ("Trading Strategies: build your own"), characters 84,780 to the end. It is byte-identical to the 09 body and starts mid-sentence ("...watch it when you are In this free video course..."). The earlier note `archive/notes/08-liquidity-course.notes.md` already flags this. So uploads/07, 08(B) and 09 are one source counted three times. Count it once in any tally.

---

## uploads/08 (A): Liquidity course
**What it is:** A beginner-to-intermediate course on order types, the order book, buy-side and sell-side liquidity, sweep/grab/run patterns, FVGs, volume profile and liquidity heat maps. **Category:** strategy and indicator-filter (mostly conceptual).

**Testable rules (exact parameters where given):**
- **Liquidity location.** Buy-side liquidity (BSL) is buy stops just above swing highs. Sell-side liquidity (SSL) is sell stops just below swing lows. The most "obvious" levels hold the most: all-time highs, multi-touch highs, the lows of big crash days.
- **Equal highs and lows.** Several swing points at the same price make a "deeper pool", and the reaction when price gets there is more violent. Beginners are told to trade only these obvious levels.
- **Liquidity sweep (reversal).** Price slowly breaks a swing high or low, traps breakout traders, then reverses sharply. It can take several candles.
- **Liquidity grab (reversal).** A fast wick pokes through the level and price closes back inside on the same candle, often followed by a strong "confirmation candle" the other way.
- **Liquidity run (continuation).** The level breaks and price keeps going. The signs:
  - a "momentum candle" whose real body is **at least 2× the previous candle's body**;
  - a close far beyond the level;
  - a small wick past the level;
  - high breakout volume.

  If price closes back inside afterwards, treat it as a slow sweep instead.
- **Internal vs external liquidity.** Internal (minor swings, FVGs inside the range) "tends to get taken first". External (major highs and lows) is the main target.
- **Inducement.** In an uptrend, a counter-trend dip sweeps an internal low while the major higher-low structure holds, then the trend continues.
- **High vs low resistance liquidity.**
  - Low resistance: liquidity behind a *failure swing* (a lower high or higher low that failed to make a new extreme). Said to be weaker.
  - High resistance: liquidity behind a clean higher high followed by a lower low, or the reverse. Said to be stronger.
  - Rule: once high-resistance liquidity is taken, price tends to travel toward the low-resistance liquidity. The speaker credits Livermore's failure swings and says SMC/ICT relabel old ideas.
- **Trend-line liquidity.** Stops cluster beyond clean trend lines, and the cleaner the line, the likelier a sweep. Wider point: any tool with predictable behaviour (chart patterns, Bollinger Bands, moving averages) creates predictable stop clusters. Said to be harder to trade than horizontal levels.
- **FVG.** A 3-candle pattern where candle 1's high and candle 3's low do not overlap (bullish; the reverse for bearish). Price "often" returns to test it. Only trade it with a price-action signal (for example a bullish engulfing) plus structure. The speaker says FVGs are "overhyped" and appear "all the time".
- **Liquidity void and gap.** A true price gap is a stronger void. It is common at stock opens and after weekends, and rare in 24/7 crypto. Gaps are often filled.
- **Volume profile.** HVNs are "historical liquidity". Price moves faster through LVNs. The POC sits where price spent the most time.
- **Liquidity heat map** (resting limit orders over time):
  - a bright zone where price stalls means absorption is winning;
  - price breaking through a bright zone means aggression is winning;
  - a "wall" is one persistent level;
  - a "cloud" is stacked walls and is a stronger defence;
  - a "withdrawal" is a wall that disappears without being traded, which opens a fast path;
  - a "flip" is a broken wall that later acts as the opposite S/R.

  The speaker's own flip example "didn't play out super well".
- **No timeframe, stop, target or sizing is given for any liquidity pattern.** The course defers to his separate risk management course. "Concepts work on any timeframe."
- **Market filter:** avoid low-liquidity markets (ugly, wickless, gappy 5m candles; small-cap altcoins).

**Tools, products and services named:**
- TradingView: affiliate link, 30-day free Premium trial plus a $15 bonus. Volume footprint "is a premium feature". Built-in fixed-range volume profile. Paper trading.
- Bybit: affiliate link; "up to $30,000" in bonuses, "around 80% will get $100"; live order book and DOM demo.
- Channel membership tiers: the full presentation, his own TradingView indicators and tools.
- His other courses (SMC, risk management, order flow, chart patterns, Bollinger).
- The heat-map vendor is not named.

**Profit claims and evidence:** No numbers. Every example is hand-picked and drawn in hindsight: the BTC all-time-high grab (14 July 2025), the BTC February crash low and the NVIDIA gap fill. There is no backtest, no sample and no live record. The causal story ("smart money" deliberately hunts stops) is untestable on OHLC data.

**Safety, legal or security:**
- The Bybit bonus scales with volume traded, which pushes toward overtrading. Bybit is restricted in the US and some other places, and holds your funds (custody risk).
- The heat-map section describes spoofing, which is market manipulation, so there must never be any code that does it. Detection is fine to research.
- Affiliate incentives throughout.

**Worth building? Medium for the liquidity-run filter; low for the rest.**
- **Already covered, no edge:**
  - sweeps and grabs: `smc_sweep_lite`, `liq_trend_sweep`, `liq_reversal`, `liq_fx_levels` and `ict_turtle_soup` all failed;
  - FVG: `ict_unicorn` lost on 0 of 7 sets;
  - equal highs and lows: used in `liq_reversal`/`liq_fx_levels`, no edge.
- **Not yet tested, and cheap to test on SPY/QQQ/IWM 30m/1h:**
  - the "liquidity run" breakout filter (body ≥ 2× the prior candle, strong close beyond the level, small wick, above-average volume) as a breakout/intraday rule, which is an empty cell in the gap map;
  - high- vs low-resistance liquidity targeting.
- **Needs data we don't have:** the heat map needs historical L2 order-book snapshots.

## uploads/08 (B) = uploads/07 = uploads/09: Trading Strategies, build your own
**What it is:** A framework course, "four pillars" (Level, Trigger, Confirmation, Risk management), with one worked strategy: a failure test plus RSI divergence. **Category:** strategy and risk-psychology.

**Testable rules:**
- **Level.** A clearly visible S/R zone, drawn as a rectangle rather than a line. All-time highs and multi-touch levels are the strongest. Other levels allowed: supply/demand, order blocks, liquidity levels, trend lines, chart patterns, moving averages.
- **Real breakout.** A close clearly beyond the level, high volume, and a momentum candle **at least 2× the size of the previous 3 candles**. (The 08A wording is 2× the previous candle's body.)
- **False breakout / failure test (trigger).** Price breaks the level briefly, then closes back inside. The favourite shapes are a hammer at support and a shooting star at resistance.
- **Confirmation.** A regular RSI divergence, RSI(14) at default settings with the RSI-based MA turned off.
  - Bearish: price makes a higher high and RSI makes a lower high (compare highs only).
  - Bullish: price makes a lower low and RSI makes a higher low (compare lows only).
  - The speaker says never to use 70/30 as sell/buy signals. MACD or volume may stand in.
- **Worked trade** (Google 4h, short at an all-time-high double top):
  - enter at the close of the failure candle;
  - put the stop just above that candle's high "with some wiggle room";
  - set the target at **2R** (break-even win rate 33%; he says it "makes money even at 50%").
- **Risk.**
  - Risk **1–2% per trade**, sized from the stop distance, with the same small risk each trade.
  - Never risk everything, even with a 70% win-rate system.
  - −50% needs +100% to recover.
- **Process.** Backtest, then forward-test or paper trade, then journal, including emotions. Change one variable at a time. A strategy needs positive expected value.
- **Other triggers named:** engulfing, hammer, shooting star, breakout-retest. Markets: "any". Timeframes: the example uses 4h and daily.

**Tools named:** TradingView (affiliate plus paper trading and replay mode); the channel membership "trading toolkit" (position-size calculator, expected value, drawdown recovery, a journal with emotion tags); his members-only momentum-candle indicator (Diamond tier).

**Profit claims and evidence:**
- **None measured.** "55% → 62% win rate with confirmation" is offered as a hypothetical. "60–70% win rate" is a hypothetical.
- The one worked trade is a hindsight replay on a single chart.
- The video sells courses and memberships.

**Safety:** Nothing beyond affiliate incentives. The risk advice matches the playbook's habit rules.

**Worth building? Medium for one specific test; the rest is already covered.**
- **Covered, no edge:**
  - the failure test alone: `failure_test_2b` lost on 6 of 7 sets, best monkey score 0.82 on USO 1d with 31 trades;
  - the confluence idea: `confluence` is "closest" (SPY 4h, 49 trades, +15%, monkey 0.85).
- **Not yet tested:** the exact combination taught here. That is a failure test *at a multi-touch or all-time-high zone* *plus* a regular RSI(14) divergence across the last two swing extremes, with a 2R target. `failure_test_2b` uses any last swing and no divergence. Run it on the intraday sets (SPY/QQQ/IWM 30m/1h) to reach 50 trades, and run it with and without the divergence filter. The playbook lesson to expect: filters cut trades faster than they lift quality. The risk rules are already enforced as habits.

---

## uploads/09: duplicate
**What it is:** A byte-identical copy of uploads/07 (and of uploads/08 part B). **Category:** duplicate. Everything above under "08 (B)" applies. **No differences except the upload-id comment.** **Worth building: no.** Exclude it from evidence counts so the same claims aren't counted three times.

---

## uploads/10: Order Flow course
**What it is:** An order-flow primer: auction, balance vs imbalance, value area and POC, order book and DOM, manipulation (spoofing, icebergs, layering), footprint charts, absorption vs initiation, CVD divergences and volume profile. **Category:** indicator-filter.

**Testable rules:**
- **Balance vs imbalance.** Sideways price with volume building up is balance, which is fair value accepted. Trends are imbalance, which is where the money is.
- **Value area.** About 70% of volume (about 1 standard deviation). The POC is the price with the most volume.
- **Footprint imbalance.**
  - Buy imbalance: buy (market) volume at a price is **≥ 3×** the sell volume at the price one tick *below*.
  - Sell imbalance: compare diagonally the other way.
  - "Stacked imbalances": several in a row.
  - Delta = buy minus sell market volume, per level and per candle.
- **Absorption (reversal or weakness).** Price closes against the imbalances.
  - Bullish absorption: sell imbalances, yet the candle closes up. It looks hammer-like.
  - Bearish absorption: buy imbalances, yet the candle closes down.
- **Initiation (continuation or strength).** Price closes beyond and in the direction of the imbalances. For bullish initiation the close must be *above* the buy imbalances.
- **POC-cluster S/R.** Several per-candle POCs at the same price make a support or resistance zone. In the example, enter long on the first strong reaction there, with the stop just below the low and an unstated R:R ("very nice profit").
- **Combination.** Support from the POC cluster, then bullish absorption, then a bullish initiation candle. This is a stronger long.
- **CVD (cumulative volume delta) divergences.**
  - Regular bearish: price makes a higher high and CVD a lower high ("buying exhaustion").
  - Regular bullish: price makes a lower low and CVD a higher low ("selling exhaustion").
  - Hidden bearish (continuation): price makes a lower high and CVD a higher high.
  - Hidden bullish (continuation): price makes a higher low and CVD a lower low.
- **Volume profile.** HVNs are acceptance zones that act as magnets (not strict S/R). LVNs are rejection zones where price moves fast. The POC of an impulse leg is a later bounce level.
- **General rule:** when price and delta agree, the move is stronger; when they diverge, it is weaker.
- **Markets.** Crypto and stocks are best; forex footprint data is "more unclear". Example: BTC daily. No timeframe, stop or target rules beyond the example.

**Tools named:**
- TradingView: affiliate; the volume footprint chart type, which may need Premium; built-in and fixed-range volume profile.
- Community indicator "Cumulative Delta Volume" by LonesomeTheBlue (about 8.8k users, set to line mode). **The license is not stated.** TradingView community scripts carry their own licenses (often MPL-2.0), so check before porting any code.
- Channel membership: presentation images and the "rest of the presentation" with extra tools.
- Mentions OTC trades and dark pools as invisible volume, and arbitrage traders and hedgers as non-directional flow.

**Profit claims and evidence:** None quantified. Single hand-picked BTC daily examples (a POC cluster bounce, CVD divergences that "beautifully" worked). No sample size and no backtest.

**Safety, legal or security:**
- Spoofing and layering are described as manipulation tactics. They are illegal (CFTC/SEC), so do not implement them.
- The live order book is "misleading" (spoofs, icebergs, dark pools), which the speaker admits himself.
- Footprint data on TradingView is behind a paywall. Scraping it would breach TradingView's ToS.

**Worth building? Medium, as a research data project; no trading rule yet.**
- Logged as a gap in `docs/strategy-gaps.md` ("needs tick or footprint data we do not have"). Never tested.
- The rules are mechanical enough to code: the 3× diagonal imbalance, absorption vs initiation, regular CVD divergence and the POC cluster.
- The data can be had cheaply for crypto. Public exchange trade prints with aggressor side (for example a trades or aggTrades feed) give footprints and CVD without API keys.
- **Bar-based CVD proxies** (close-location volume) are *not* the same thing and should be labelled as approximations.
- Worth it only if paired with forward recording, and judged by the same six checks.
- Overlaps with the market-making recorder that "hasn't run yet".

---

## uploads/11: Trading for Beginners
**What it is:** A beginner course: trading as decision-making (buy, sell or do nothing), the plan (entry, stop, target, size), candles, trends and ranges, S/R zones, order types, risk, expected value, psychology and one simple strategy. **Category:** risk-psychology (plus one strategy).

**Testable rules:**
- **Trend definition.** Uptrend = higher highs AND higher lows (both required); downtrend is the reverse. Everything else is sideways (ranges, triangles, messy). Identify the state first, because strategies are state-specific.
- **S/R.** Draw zones. Only the obvious multi-touch levels count ("if the level is not obvious, ignore it"). Breaks of major multi-year levels start big moves; the example is the gold range from August 2020 to February 2024.
- **Beginner strategy.**
  - Trade with the trend only.
  - Buy pullbacks into key levels, or breakouts of continuation chart patterns.
  - Worked example: an **ascending triangle after an up-move** (flat resistance zone, rising lows). Enter at the close of the breakout candle, stop below the most recent low before the breakout, target **2R**. Gold daily. "This took quite a while" but hit target.
- **Risk.**
  - Always use a stop. Every trade needs entry, stop, target and size, or it is "gambling".
  - Risk **0.5–1% per trade** for beginners.
  - Size = risk ÷ stop distance (worked: $10,000 account, 1%, entry 100, stop 90 → 10 units; stop 80 → 5 units).
  - Include commission and slippage.
- **Expected value.**
  - Worked example: a 45% win rate, +$200 wins and −$100 losses gives +$35 a trade. Break-even is 33.3%; 35% is still positive; 30% is negative.
  - "One trade means nothing; results average over many trades."
- **Process.** Backtest, then a demo/paper account, then journal. Don't rush into real money. "Most of you will lose money" at the start. Focus on learning, not earning.
- **Market choice.** Start with large-cap stocks or BTC, because they are less volatile.

**Tools named:**
- TradingView: affiliate, paper trading, replay, long/short position tools, broker panel.
- Bybit: affiliate, same bonus claims as 08.
- Avanza (Swedish broker, the speaker's own).
- Suggests ChatGPT, Gemini or Claude for broker research.
- Members-only risk calculator (position sizer, EV, risk of ruin).
- Merch store (mousepad and mug cheat sheets, shop.mindmathmoney.com, 10% promo code).
- Book: Mark Douglas, *Trading in the Zone* ("far from perfect" but good on mindset).

**Profit claims and evidence:**
- None. One hindsight gold example.
- The speaker is candid that most beginners lose.
- Heavy affiliate and merch selling.

**Safety, legal or security:**
- Bybit's bonus-for-volume pushes overtrading, and jurisdiction limits apply.
- Connecting a broker to TradingView means handing over credentials or keys. The Apex rule stands: keys only in env vars set by the owner, and agents have no order tools.

**Worth building? Low for the risk content, which is already covered; low-medium for the ascending triangle.**
- The risk and EV rules are already playbook §1 habits and are enforced in the risk code.
- The ascending-triangle breakout with a 2R target is **untested**. It falls under the "Chart patterns: flags, double tops, H&S… measured-move targets" gap and the empty breakout/intraday and breakout/swing cells. It is cheap to try on SPY/QQQ/IWM 30m/1h/4h. Expect few clean triangles per set, and a detection rule (a flat top within an ATR tolerance plus ≥3 rising lows) that shifts the result.

---

## uploads/12: Market Structure masterclass
**What it is:** A 14-module market-structure course: macro structure vs price action, swings and fractals, impulse and pullback, market states, multi-timeframe analysis, Fibonacci and measured moves, BOS/CHoCH/MSS, strong and weak levels, two entry models, trend lines and channels, smooth vs choppy regimes, a volume and order-flow overview, market participants and a 10-step workflow. **Category:** strategy.

**Testable rules:**
- **Uptrend.** Two consecutive higher highs and higher lows (both required). Equal lows under rising highs is *not* an uptrend.
- **Impulse vs pullback.**
  - Impulses have big same-colour candles and momentum, ideally on rising volume.
  - Pullbacks have mixed small candles, more wicks and dojis, falling volume. Heavy volume or sharpness in a pullback is a warning.
  - Simple pullbacks (one leg) are preferred to complex ones for beginners.
- **BOS (break of structure).** A break of the prior swing high in an uptrend means continuation.
- **CHoCH (change of character).** The first break of the last higher low, which is an early warning only. A full trend change needs a BOS in the new direction after the CHoCH. The speaker says MSS is usually used as a synonym for CHoCH and recommends ignoring the term.
- **Strong vs weak levels.**
  - A strong low or high is the origin of the move that caused a BOS. It tends to hold, so it is a good stop or entry level.
  - A weak low or high is a level whose move failed to cause a BOS or CHoCH. It tends to get taken out, which suits continuation and breakout targets.
- **Fibonacci.**
  - Pullbacks "mostly" end in the **0.382–0.618 golden zone**; in strong trends, **0.236–0.382**.
  - Draw from swing low to swing high in an uptrend.
  - Never use Fibonacci alone.
- **Measured move.** The next impulse is often about equal to the previous impulse. Measure it from the pullback low and use it as the target.
- **Entry model A (pullback).** In an uptrend after a BOS, outline the pullback with a channel.
  - Aggressive: buy at the pullback channel support on a hammer or momentum candle, with the stop below the hammer.
  - Conservative: buy the breakout of the pullback channel on a strong momentum candle with high volume, with the stop below the pullback low (or a tighter recent low).
  - Target: a measured move, or a fixed 1.5R, 2R or 3R.
  - The multi-timeframe example uses daily for bias and 1h for the bull-flag break entry at 1.5R.
- **Entry model B (failure test, 2B / Wyckoff spring or upthrust).**
  - Price breaks a level briefly and recloses inside; enter at that close.
  - The stop goes past the wick of the failure, which he calls the least subjective stop.
  - Fixed R target, for example 2R.
  - Use it with the trend at pullback support, or counter-trend when a BOS attempt fails at resistance.
- **Trend lines and channels.**
  - A rising line joins higher lows; a falling line joins lower highs. A break of the line means the trend's rhythm is changing, NOT that the trend has reversed. Only a CHoCH counts as that.
  - A parallel channel top is the expected reach of the next BOS leg. A push beyond it means the trend is getting stronger.
  - "Never trade purely on trend lines."
- **Regime.** Trade only smooth markets (long clear impulses, clean pullbacks). In choppy markets (overlapping swings, frequent fake BOS/CHoCH, common on 1m) the best response is to *wait*, not just cut size. Messy transition states: don't trade.
- **Multi-timeframe.** Two timeframes are enough: the higher one for state and bias, the lower one for the entry. Three-layer alignment "dramatically" raises the odds (no data given).
- **10-step workflow:**
  1. Identify the state.
  2. Mark the major swings.
  3. Mark BOS and CHoCH.
  4. Mark strong and weak levels.
  5. Judge pullback quality.
  6. Choose model A or B.
  7. Refine the entry on a lower timeframe.
  8. Add volume (optional).
  9. Place the stop.
  10. Set the target (measured move or fixed R).

**Tools named:** TradingView (affiliate, multi-chart layouts that may need a paid plan, the Fib retracement tool, long/short position tools, built-in Volume, fixed-range volume profile, volume footprint chart type); his other courses (price action, order flow); channel membership (Gold/Diamond, presentation).

**Profit claims and evidence:**
- None quantified. All examples are on one Google daily/1h chart.
- The speaker says he used one chart *to answer cherry-picking complaints*. That reduces the selection problem but doesn't remove it: it is still one hand-chosen chart in a strong uptrend, read in hindsight.
- No backtest or live record.

**Safety:** None beyond affiliates. The "avoid blaming manipulation" section is sound psychology.

**Worth building? High for testing two untested pieces on top of the existing candidate; otherwise already covered.**
- **Model A is the same family as our only candidate.** `dave_prev_range` (BOS, then a 50% retrace, then a fixed target at the high) passes 6/6 on SPY 30m/1h and IWM 30m/1h, fails on 4h and daily, and is ~90% shorts.
- **Model B is `failure_test_2b`:** no edge.
- **Fibonacci depth zones** overlap `demand_second_leg` (30–79%) and the dave depth variants.
- **Untested and cheap to add as variants of `dave_prev_range`:**
  - (a) the **measured-move target** instead of "back to the high";
  - (b) the **strong/weak-level stop and target** (stop below the strong low; target a weak high);
  - (c) the **conservative pullback-channel breakout entry** with the 2× momentum candle and a volume filter;
  - (d) the **CHoCH-then-BOS** confirmation for counter-trend use.

  Each variant adds to the try count (now 21+ on chat/78), so charge it in the deflated Sharpe and judge only on forward paper data.
- The trend-line break was not tested and the speaker himself rejects it as a signal.
- The choppy-regime filter fits `psar_adx`-style chop filters, which have no edge so far.

---

## Batch themes
- **Duplication:** uploads/07, 08(B) and 09 are one transcript counted three times. All five files come from one educator, so treat them as one source, not five independent confirmations.
- **No evidence anywhere:** zero backtests, sample sizes or live records. Every example is a hindsight chart, and every video drives TradingView/Bybit affiliate links, memberships or merch. Bybit's volume-scaled bonus encourages overtrading.
- **The recurring core idea:** stops cluster beyond obvious levels, so false breakouts reverse and real breakouts run. Our tests of the reversal side (failure_test_2b, smc_sweep_lite, liq_*, ict_*, wyckoff_spring) all show **no edge**.
- **The strongest lead:** uploads/12 Model A (BOS then pullback, fixed-R or measured-move target) is the same family as `dave_prev_range`, our only 6/6 candidate (intraday SPY/IWM, mostly shorts). Add measured-move targets and strong/weak-level stops as counted variants, and judge them only on forward paper data.
- **Cheap untested tests on data we already have (SPY/QQQ/IWM 30m/1h):**
  - (1) a failure test at a multi-touch or all-time-high zone plus regular RSI(14) divergence, 2R (the 07/09 strategy; our 2B has no divergence);
  - (2) the "liquidity run" breakout filter: body ≥ 2× the prior candle (or ≥ 2× the prior 3), strong close, small wick, high volume. This fills the empty breakout/intraday cell;
  - (3) ascending-triangle breakout, 2R (uploads/11).
- **Most hyped, weakest items:** FVGs (the speaker calls them overhyped; `ict_unicorn` lost on 0/7 sets); "smart money hunts your stops", which is an untestable story; three-timeframe alignment "dramatically" raising the odds, when our top-down filter made results worse; liquidity heat-map "flips" (his own example failed).
- **Already enforced as habits:** 0.5–2% risk sized from the stop, always a hard stop, 2R default, EV over win rate, journaling and paper trading first. Nothing new is needed.
- **Order-flow gap:** footprint imbalances (3× diagonal), absorption/initiation, CVD divergence and the POC cluster are mechanical but need trade-by-trade aggressor data. Free public crypto trade feeds could supply it, after checking each exchange's ToS. It needs a forward recorder, not a backtest on OHLC. Label any bar-based CVD proxy as an approximation.
- **Heat-map gap:** needs historical L2 snapshots, which we don't have. Spoofing and layering may only ever be *detected*; never implement them, because they are illegal.
- **Licensing:** the LonesomeTheBlue CVD script and the educator's own TradingView indicators have no license stated. Check before porting any code; prefer reimplementing from the written rule.
- **Data gaps that block a verdict:** daily rules still need 5–10 years of history; the order-flow rules need tick data. The validation docs list both as the main blockers.
