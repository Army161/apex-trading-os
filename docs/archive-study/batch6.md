# Batch 6: uploads/03 to uploads/07 (Mind Math Money course series)

All five are YouTube course transcripts by the same Sweden-based creator ("Mind Math Money"). I read every file in full. They share one teaching method: market structure first, then a price-action trigger at a key level, plus a confirmation, plus fixed-fractional risk with a 2R target. Every chart example is one the speaker picked by hand ("I choose examples that are very, you know, clear"). **No source gives a backtest, a trade count, a win rate measured on data, or a live record.** Every course sells the same things: a TradingView affiliate link (30-day Premium trial plus a "$15 bonus"), a Bybit affiliate link, paid YouTube channel memberships (gold or diamond tier) for his indicators and calculators, and merchandise (a desk mat and a mug, promo code "MMMMM10", 10% off).

Status tags below come only from `docs/validation-results.md` and `docs/trading-playbook.md`.

---

## uploads/03: Complete Trading Course 2026 (6+ hours)

**What it is:** a compilation of four of his courses: fundamentals, price action, market structure and order flow. **Category:** strategy (mostly education), with indicator-filter and risk sections.

### Concrete, testable rules
**Fundamentals and risk**
- Every trade needs an entry, a stop, a target and a position size. Without all four "you are actually gambling".
- Beginners risk 0.5% to 1% a trade. Size = account × risk% ÷ |entry − stop|. Calculator example: $10,000, 1%, entry 100, stop 90 gives 10 units; a stop at 80 gives 5 units.
- EV example: 45% wins of $200 against 55% losses of $100 gives +$35 a trade. Break-even win rate at 2R is 33.3%. A 30% win rate at 2R loses money.
- Order types: market, limit (a better price) and stop (a worse price, or entry on confirmation). A buy-stop above resistance is the breakout entry.

**Beginner strategy (ascending triangle breakout, gold daily)**
- Look for a clear uptrend, then a sideways phase where the lows rise into a flat resistance zone.
- Enter at the close of the breakout candle. Stop below the most recent low before the breakout. Target 2R.

**Momentum candle (used throughout)**
- The real body is at least 2× the bodies of the previous 3 to 5 candles. He prefers 3× or 4×.
- The streak continues while the next candles are about the same size or larger. It resets on a much smaller candle.
- Strong momentum candles have a big body, small wicks and a strong close.

**Candlestick triggers.** For each, enter at the candle close and target a fixed 2R.
- **Hammer:** comes after a decline. Lower wick at least 2× the body. Little or no upper wick. Stop below the low.
- **Shooting star:** comes after a rise. Upper wick at least 2× the body, preferably 3× to 4×. Little or no lower wick. Stop above the high.
- **Bullish engulfing:** comes after a decline. A small red candle, then a green candle that opens below the red body and closes above it. In crypto, an open equal to the prior close is allowed. Stop below the pattern low, or a set distance below support.
- **Bearish engulfing:** the mirror of the bullish one.
- **Doji types:** open roughly equals close. Dragonfly is bullish, gravestone is bearish, long-legged leans toward whichever end the body sits at. Information only, not a trigger.
- **Context rule:** a pattern counts only at a key zone. "Trading a candlestick in the middle of nowhere will lose you money."
- **TradingView "All Candlestick Patterns" settings:** keep hammer, shooting star and engulfing; turn dojis off; set "Detect trend based on" to SMA 50.

**Support and resistance with price action**
- Draw zones, not lines, and use only the obvious levels.
- A level is strong when it shows sharp reactions with long wicks, reversal candles, and a quick move away on strong candles.
- Warning signs that a level will break:
  - lower highs pressing into support, or higher lows pressing into resistance;
  - small or doji candles clustering at the level;
  - rising volume on weak tests;
  - "too many tests" on one level.
- **Pivot Points High/Low indicator:** set to 20/20 (20 bars each side). Clusters of pivots mark the key S/R zones.

**Breakout rules**
- A momentum candle (2× minimum, 3× or more preferred) that closes far beyond an obvious level, on high volume.
- Optionally, wait for a follow-through momentum candle, or for a retest of the broken level with bullish price action.
- **Example:** BTC on 2020-12-16 closed above the 2017 high near $19.7k. It was a momentum candle with more than 2× the prior volume.
- **False-breakout signs:**
  - a weak breakout candle;
  - only a wick beyond the level;
  - no rise in volume;
  - an immediate opposite candle.

**Market structure**
- An uptrend needs both higher highs and higher lows (the reverse for a downtrend). Anything else is a range or a messy "transition" market, which he says to skip.
- Impulse moves have big candles of one colour. Pullbacks are mixed, small and wicky.
- **Break of structure (BOS):** price breaks the prior swing in the trend's direction.
- **Change of character (CHoCH):** price breaks the low of the move that made the last BOS (the reverse for downtrends). A CHoCH is an early warning. A trend change is confirmed only by a BOS after the CHoCH. "MSS" usually means the same as CHoCH.
- **Strong and weak levels:** a strong low is the origin of a move that broke structure; it tends to hold and suits stops and entries. A weak high is one that failed to cause a CHoCH; it tends to get taken out.
- **Fibonacci:** most pullbacks end in the 0.382 to 0.618 "golden zone". Strong trends turn at 0.236 to 0.382. The measured move says the next impulse is about as long as the last one.

**Entry Model A: trend pullback**
- **Aggressive:** buy at the support line of the pullback channel when a hammer or momentum candle appears. Stop below the hammer.
- **Conservative:** buy the momentum breakout of the pullback's down-channel, on volume. Stop below the pullback low.
- **Target:** a measured move (the impulse length added from the pullback low) or a fixed R. The example used 1.5R on a 1h bull flag inside a daily uptrend.

**Entry Model B: failure test (2B / spring / upthrust)**
- Price pokes past the level and then closes back inside.
- Enter at the close. Stop just past the extreme of the failing candle. Target 2R.
- It can be traded with the trend or against it.

**Multi-timeframe**
- Use the higher timeframe for bias, then a lower one for the entry. Two timeframes are enough; three are optional.
- Avoid choppy regimes. His example: GOOGL 1m chop against a clean daily trend.

**Order flow**
- **Value area:** the price range holding about 70% of volume. **Point of control (POC):** the price with the most volume.
- **Footprint imbalance:** one side has at least 3× the volume of the other, compared diagonally. A buy level is compared with the sell level one tick below.
- **Absorption** (imbalances against the close) signals a reversal. **Initiation** (imbalances with the close) signals continuation.
- A cluster of footprint POCs marks support. His BTC daily example: enter on the first strong reaction, stop below the low, 2R.
- **CVD:** he uses the community indicator "Cumulative Delta Volume" by LonesomeTheBlue, set to line mode. Regular divergence signals a reversal. Hidden divergence signals continuation.
- **Volume profile:** use the fixed-range profile over the last impulse. High-volume nodes act as magnets or acceptance. Low-volume nodes are fast-travel zones. One suggested target is just below the next value area.
- He also covers DOM depth, spoofing, iceberg orders, layering, OTC and dark pools, as warnings that the order book can mislead.

### Tools, repos, products and services named
- **TradingView:** affiliate link (30-day Premium plus "$15 bonus"). Paper trading, replay mode, long/short position tools, layouts with up to 16 splits, built-in VWAP, "All Candlestick Patterns", "All Chart Patterns", Pivot Points High/Low, fixed-range and visible-range volume profile, volume footprint (he is unsure whether it is free; probably Premium), Rolling VWAP.
- **Brokers and exchanges:** Bybit (affiliate, "up to $30,000" in bonuses, though he says most get about $100), OKX, Binance, Avanza (Sweden).
- **His paid products:** the Mind Math Money members' toolkit (position sizer, EV calculator, risk of ruin, drawdown recovery, journal; gold tier and up), merchandise, a desk-mat cheat sheet and a mug.
- **Book:** "Trading in the Zone" by Mark Douglas.
- **Indicator:** the LonesomeTheBlue CVD community script. No license is mentioned.
- No code repos are named.

### Profit claims and evidence
- **"Understand markets better than 99% of traders"** if you finish. This is marketing.
- **Example trades:** gold triangle, hammers, engulfing, SMCI dragonfly (live and unresolved at the time), BTC 2020 breakout, BTC footprint POC bounce. All are hand-picked and shown in hindsight. **Evidence: none (screenshots only).** There is strong selection bias.
- **"90% of traders fail":** a common statistic with no source given.
- **Course-selling and affiliate conflict:** heavy and repeated, more than 15 plugs.

### Safety, legal and security concerns
- Bybit affiliate and deposit-bonus marketing. Bybit is not available to US residents.
- He suggests asking a chatbot to pick a broker.
- No custody or key issues are raised. The order-flow section rightly warns that the order book can be spoofed.

### Worth building?
| Item | Rating | Reasoning and coverage |
|---|---|---|
| Momentum candle (body ≥ 2× the last 3) | **Medium** | A cheap feature that is already inside `confluence` (`momBull`). Worth testing alone as a breakout trigger on SPY/QQQ/IWM 30m and 1h, which fills the empty "breakout / intraday" cell in `strategy-gaps.md`. |
| BOS/CHoCH engine and strong/weak levels | **Medium** | Partly covered: `dave_prev_range` uses break of structure plus a 50% retrace, and is the only 6/6 candidate. A reusable, well-tested swing/BOS/CHoCH labeller would help many rules. |
| Model B failure test | **Low** | Already covered by `failure_test_2b`, `wyckoff_spring` and `liq_reversal`: no edge (best 3/6). |
| Model A pullback into the golden zone | **Low to medium** | Overlaps `dave_prev_range` (50% depth, candidate) and `demand_second_leg` (30–79%). The only new piece is a 0.382–0.618 window. Not worth a separate rule. |
| Ascending-triangle breakout | **Low** | No rule exists. Chart-pattern detection is listed as a gap. Hard to define objectively, with no evidence. |
| Candle patterns at S/R with 2R | **Low** | Already the `confluence` trigger component. Closest: 49 trades and 85% monkey score on SPY 4h. Do not add more patterns. |
| Footprint, CVD, absorption | **No for now** | Needs tick or footprint data we lack (the order-flow gap in `strategy-gaps.md`). |
| Fixed-range volume profile and POC targets | **Low** | Can be approximated from 30m bars, but there is no evidence. Possible later as a target or filter feature. |

---

## uploads/04: Futures Trading Course

**What it is:** an introduction to futures mechanics plus one simple breakout example on ES 1h. **Category:** strategy, with infrastructure and market-mechanics content.

### Concrete, testable rules
**Contract facts he states**
| Contract | Dollars per point |
|---|---|
| ES | $50 |
| MES | $5 |
| NQ | $20 (he says MNQ is the micro, a tenth of the size) |
| GC | $100 |
| CL | $1,000 |
- **Worked example:** 1 MES × 76 points ≈ $380 for about a 1% move. He says "67" then "$76", and also says "NASDAQ" when he means S&P, so the transcript is inconsistent.

**Margin and leverage**
- Day-trading margin for one micro is about $50 to $100. Overnight margin can be $2,000 or more. Falling below margin means automatic liquidation, so keep a buffer.
- One MES controls about $38,000 of exposure. Leverage = exposure ÷ account, so a $2,000 account is at 19×.
- The fix is to risk a fixed 1% (2% to 3% at most).

**Contract roll and sessions**
- Index futures expire in March, June, September and December. Roll to the next contract. Chart the continuous contract (ES1!, CL1!) and trade the front month.
- The regular session has much more volume and volatility than the overnight (ETH) session. Use the ETH chart setting to see the overnight bars.

**Market structure:** the same HH/HL, BOS and CHoCH rules as uploads/03.

**Indicators**
- MACD at default settings, as a momentum gauge.
- VWAP.
- TradingView "All Chart Patterns", which gives a target but no stop. He puts the stop below the pattern low.

**Strategy (ES1! 1h)**
- A BOS that also breaks the all-time-high resistance zone, which had five or more touches on 4h.
- A momentum candle (his indicator, default body ≥ 2× the previous 3; it can be set to 5× the previous 5).
- High volume at the regular-session open.
- **Entry:** at the breakout. **Stop:** just below the recent low. **Target:** 2R.
- He admits real markets are "more messy" and mostly ranges.

### Tools, repos, products and services named
- TradingView (affiliate), with built-in broker integration.
- Brokers: Interactive Brokers, NinjaTrader, Bybit (affiliate, crypto perpetual futures from about $10).
- His paid "Momentum Candles" and "Volume Strength Candles" indicators (channel members, diamond tier and up).
- Exchange: CME. Local index futures: Nifty (India), OMX (Sweden).
- He suggests asking ChatGPT or Claude for tickers and broker choice.

### Profit claims and evidence
- **"For every single point this chart moves, you make $50":** a fact about the contract, not a profit claim.
- **The ES all-time-high breakout:** one hand-picked example. **Evidence: none.** He admits it is unusually clean.

### Safety, legal and security concerns
- Leverage and liquidation risk are explained properly: he warns that a $2,000 account on MES is at 19×.
- Bybit perpetuals are pitched to beginners, which is high risk and restricted for US residents.
- No key or custody issues are raised.

### Worth building?
| Item | Rating | Reasoning and coverage |
|---|---|---|
| Futures contract-spec table and margin/leverage check | **Medium** | Pure infrastructure: dollars per point, micro contract choice, effective leverage = exposure ÷ equity, and a margin-buffer alarm. Useful only if a futures paper bot is ever built. It adds a hard check that leverage stays at 1×, in line with the chat/90 rule that leverage is research only. |
| Regular-session vs overnight volume and volatility split | **Low to medium** | A cheap session feature, since the SPY 30m data includes extended hours. A session filter was tested in chat/86 (skipping the midday lull did not help). Futures roll effects are listed as a gap needing futures data. |
| ATH-break + BOS + momentum candle + volume, 2R | **Low** | Overlaps `breakout_50_20` and `turtle_55_20` (no edge) and the momentum-candle idea from uploads/03. Rare by definition, so too few trades. |

---

## uploads/05: VWAP Indicator Course

**What it is:** VWAP from first principles, with bands, anchored and rolling VWAP, settings, and one combined reversal strategy on AMD 5m. **Category:** indicator-filter, plus a strategy.

### Concrete, testable rules
**Formula**
- VWAP = Σ(typical price × volume) ÷ Σ(volume), reset each session.
- He says the typical price is (O+H+L+C)/4, but then says TradingView's default source is HLC/3. The transcript contradicts itself. His strategy chapter switches the source to OHLC4.
- Crypto resets every 24h.

**Bands**
- Standard-deviation bands at 1, 2 and 3. He says about 68%, 95% and over 99% of price stays inside them. That assumes normal returns; real intraday data has fat tails, so treat these as rough.
- Band 1 catches ordinary pullbacks. Bands 2 and 3 mark extremes for reversals.

**Bias**
- Price above VWAP means buyers are in control, so lean long. Below means lean short.
- A cross of VWAP signals a shift in control. "Trade on the side of VWAP where price is."

**Warnings**
- VWAP is context, not a trigger.
- A flat, sideways VWAP gives the weakest and most false signals.

**Method A: mean reversion**
- Use only when VWAP is flat.
- Fade a touch of band 1 or 2 back toward VWAP.
- Require a reversal candle, such as a shooting star at the upper band.

**Method B: trend continuation**
- Use only when VWAP clearly slopes.
- Buy pullbacks to VWAP or to band 1 in the slope's direction.
- Require a hammer or bullish engulfing at VWAP.

**Anchors**
| Chart | Anchor |
|---|---|
| 5m | Session |
| 1h | Week |
| 4h | Month |
| Longer | Quarter or earnings |
- Anchored VWAP can start at any swing high or low, news candle or earnings date.
- Rolling VWAP never resets. Leave its period on auto, and set band multipliers 1/2/3 by hand.

**Final strategy (AMD 5m short)**
- Draw horizontal resistance from a higher timeframe, here the old all-time high on the daily chart.
- Price must touch upper band 2 at that resistance and form a failure test (poke above, close back below) with a shooting star.
- **Entry:** at the close of the failure-test candle. **Stop:** just above the high. **Target:** 2R.
- **Long example:** a near-touch of lower band 2 plus a morning-star pattern.

### Tools, repos, products and services named
- TradingView built-in VWAP (affiliate link again).
- The TradingView editor's-pick "Rolling VWAP" indicator.
- Anchored VWAP drawing tool.
- His "MindMath Money store" notebook, trading-psychology course and candlestick course.
- No license or cost is stated beyond the TradingView trial.

### Profit claims and evidence
- **"Use VWAP like a pro… make more money":** generic.
- **"Institutions like Goldman Sachs and Bridgewater use VWAP as a benchmark":** broadly true as an execution benchmark. That is not evidence that retail VWAP touches have an edge.
- **Examples:** AMD 5m, hand-picked ("examples that are very, you know, clear"). **Evidence: none.**

### Safety, legal and security concerns
None beyond the affiliate marketing.

### Worth building?
| Item | Rating | Reasoning and coverage |
|---|---|---|
| Session VWAP plus 1/2/3σ bands as engine primitives | **High** | Cheap and objective, and it fits data we already have (SPY/QQQ/IWM 30m with volume). It is listed in `strategy-gaps.md` as the first thing to look at. Not built or tested yet. |
| Method B: trend pullback to VWAP or band 1 with a reversal candle | **Medium to high** | The clearest untested intraday rule in this batch. Pullback rules are where our only candidate (`dave_prev_range`, 6/6 on SPY and IWM 30m/1h) came from. Test it with and without the candle filter, using the same six checks and the monkey test. |
| Method A: flat-VWAP band-2 fade | **Medium** | Fills the empty "mean_reversion / intraday" area. It is similar to `garch_vol_premium` (too few trades) and `ema50_bands` (no edge). Worth one run, and it must count tries. |
| Final band-2 + higher-timeframe level + failure test + star | **Low** | Four filters stacked means very few trades. The playbook lesson is that filters cut trade count faster than they lift quality. |
| Anchored and rolling VWAP | **Low to medium** | Useful as a feature (distance from the VWAP anchored at a swing). No standalone rule. |

---

## uploads/06: Risk Management Course

**What it is:** risk theory and practice: survival first, the four "legends", R and expectancy, stop and target types, sizing models, Kelly, averaging down and Martingale, and antifragility. **Category:** risk-psychology.

### Concrete, testable rules
**Definitions and the history he cites**
- Uncertainty is not knowing the next outcome. Risk is the part you can measure and choose, namely the loss if you are wrong.
- He cites Bernoulli (1738, expected utility; he describes it as loss aversion, which is really Kahneman and Tversky's idea), Markowitz (diversification, umbrella vs sunscreen), Kelly (1956) and Taleb (antifragility, 2012).

**Loss asymmetry**
- The gain needed to recover from a loss L is L ÷ (1 − L): −10% needs +11%, −50% needs +100%, −90% needs +900%.
- **His BTC example:** about −77% from the 2021 top to the 2022 low needs about +350% to recover. The formula gives +335%, so this is roughly right.

**Expectancy**
- Expectancy = W × avg win − (1 − W) × avg loss.
- Break-even win rate = 1 ÷ (1 + R). At 3R that is 25%.
- **Calculator examples:**
  - 66% at 1:1 gives +$32 a trade, or +$640 over 20 trades.
  - 66% at 2:1 gives about +$98 a trade, or about $23.5k a year at 20 trades a month.
  - These win rates are assumed inputs, not measured results.

**Three risks in every trade**
- **Capital risk:** the dollars lost at the stop.
- **Positional risk:** the chance the stop is hit. A tighter stop raises it.
- **Target risk:** the chance of exiting below the trade's full potential.
- "You cannot eliminate risk, only transform it." Moving the stop to break-even removes capital risk but raises positional risk.

**Stops**
- **Technical:** just beyond the invalidation point (swing, level or zone).
- **Volatility:** 1.5–2× ATR. His BTC daily example: ATR about $4,200, 2× ≈ $8,000.
- **Combined:** the technical level plus 0.25–0.5× ATR of wiggle room. It allows a double-bottom retest.
- Always use a hard stop, never a mental one. Avoid money stops and time stops.

**Targets**
- A fixed R multiple, 2R by default (1.5R and 3R are also mentioned).
- A technical target placed just before the next opposing S/R, supply zone or liquidity.
- A dynamic target such as a trendline, channel, Bollinger Band (for example, exit on a close above the upper band) or pitchfork.
- Skip a setup if an opposing level sits close to the entry.

**Sizing models**
- **Fixed fractional:** 1%, so $100 on a $10k account. Some traders use 2% to 4%.
- **Fixed dollar:** recalculated weekly.
- **Volatility-based:** a wider ATR stop means fewer units. $10k, 1%, entry 100 and stop 95 gives 20 units; stop 90 gives 10 units.
- **Fixed ratio (Ryan Jones):** step size up after profit milestones. Not advised for beginners.

**Kelly**
- He states it as f = (W − L) ÷ R. That is wrong for R ≠ 1. The usual form is f = W − (1 − W) ÷ R, and the two match only at R = 1.
- **His example:** 60% at 1:1 gives f = 20%.
- Use Kelly only with 100+ backtested trades, and then half (10%) or quarter (5%) Kelly. If unsure, use 1% to 2%.
- Larry Williams made about $10k → $1.1M in the 1987 Robbins Cup using Kelly, and later said it was luck and not sustainable.

**Averaging down**
- Allowed only with a pre-planned maximum size and predefined levels.
- Linear averaging: 100 and 90 average to 95. Non-linear: 1@100 plus 2@90 averages to 93.33.
- **Martingale** (double after each loss) works only with infinite capital, so never use it.

**Compounding**
- "Never interrupt compounding unnecessarily" (Charlie Munger).
- He says withdrawing profits to live off trading is "the most expensive habit a trader can build".

**Antifragile volatility strategies**
- Mentioned only, with Black-Scholes cited. No rules given.

### Tools, repos, products and services named
- TradingView (affiliate), its long/short position tool, price-range tool, ATR and Bollinger Bands.
- His members' trading toolkit (EV calculator, position sizer; gold tier).
- Book: "Poor Charlie's Almanack".
- No repos.

### Profit claims and evidence
- **The EV calculator figures** (for example $23.5k a year): hypothetical, from assumed win rates. **Evidence: none.**
- **The Larry Williams anecdote:** a real contest, and he correctly notes it was luck. It is an illustration of survivorship, not a method.

### Safety, legal and security concerns
- This is broadly sound risk guidance.
- The Kelly formula is misstated for R ≠ 1. Anyone coding it from this transcript would get the wrong value. With his inputs at 2:1 (60% wins), his form gives 10% while true Kelly gives 40%. The error happens to be conservative here, but it is still wrong.
- "Never withdraw profits" is lifestyle advice, not risk advice. It slightly conflicts with taking risk off the table.

### Worth building?
| Item | Rating | Reasoning and coverage |
|---|---|---|
| Core sizing, loss-asymmetry, break-even, hard-stop and no-Martingale rules | **High (already done)** | These are playbook §1 and §2 almost word for word, cited as uploads/06, and enforced in the risk code as "habit". Nothing new to build. |
| Kelly calculator with the correct formula and a quarter-Kelly cap, gated on 100+ trades | **Medium** | The playbook already holds the policy. A tested `kelly(W, R)` helper with the right formula, used only for reporting, would stop the transcript's mistake from creeping in. |
| Combined stop (technical + 0.25–0.5 ATR) as an exit option | **Medium** | Cheap to add as an engine stop mode. Test it on `dave_prev_range`, which currently uses its own stop. Trailing-stop variants (chat/81) all did worse, but this is a stop *placement* change, which is a different question. |
| Technical target ("next opposing level") and "skip when a level is too close" | **Low to medium** | Already a playbook habit (§2), and fixed targets beat trails in our tests. Worth one A/B run against the fixed 2R target. |
| Antifragile volatility trading | **No** | No rules given. Options work exists separately (`options.ts`). |

---

## uploads/07: Trading Strategies, Build Your Own

**What it is:** a framework for writing a strategy as four pillars (level, trigger, confirmation, risk), shown with a failure test plus RSI divergence on GOOGL 4h. **Category:** strategy (and a method for building strategies).

### Concrete, testable rules
**The framework**
- A strategy is a fixed, written set of rules that answers where, when (entry and exit) and how much. "If you cannot write it down… it's not a full trading strategy."
- **Pillar 1, level:** an S/R zone (drawn as a rectangle), supply/demand, order blocks, liquidity, chart patterns, trendlines or moving averages. All-time highs count extra.
- **Pillar 2, trigger:** specific and repeatable, such as candlestick patterns, breakouts or failure tests.
- **Pillar 3, confirmation:** a second signal that agrees with the trigger, such as RSI or MACD divergence, volume, a higher timeframe, or order flow. He gives an illustrative lift of "55% to 62% win rate", which is invented and not measured.
- **Pillar 4, risk:** 1–2% per trade, a stop and a target on every trade, and size taken from the stop.

**Breakout validity**
- A close clearly beyond the level, high volume, a momentum candle (body ≥ 2× the previous 3), and the move holds.
- A false breakout is a poke past the level that snaps back inside. His favourite forms are a hammer below support and a shooting star above resistance.

**RSI**
- RSI(14) with the smoothing MA turned off.
- 70/30 are not standalone signals.
- **Bullish divergence:** price makes a lower low while RSI makes a higher low. Compare lows only.
- **Bearish divergence:** price makes a higher high while RSI makes a lower high. Compare highs only.
- Hidden divergence is mentioned but not used.

**Complete strategy (GOOGL 4h short)**
- **Level:** a double top at the all-time-high zone.
- **Trigger:** a failure test, where a green candle pokes above the zone and closes back inside.
- **Confirmation:** bearish RSI divergence (price makes equal then higher highs, RSI makes lower highs).
- **Entry:** at the close of the failure candle. **Stop:** just above that candle's high, with some wiggle room. **Target:** 2R.
- At 2R, "even if we have a 50% win rate, we will still make money".

**Process rules**
- Backtest, then forward-test or paper trade.
- Journal setup, result and emotion.
- Require a positive expected value.
- Change one variable at a time.
- Breakout-retest is an alternative trigger.

### Tools, repos, products and services named
- TradingView (affiliate), its replay mode, RSI and paper trading.
- His paid members' toolkit at mindmathmoney.com/mindmath-members (position sizer, EV, drawdown recovery, emotion-tagged journal; gold tier).
- His paid momentum-candle indicator (diamond tier).
- No repos.

### Profit claims and evidence
- **"Locked in some very nice profit" on GOOGL:** one hand-picked example.
- **The "55% to 62%" lift:** made up for illustration.
- **Evidence: none.**

### Safety, legal and security concerns
- The "smart money manipulates and hunts stops" story is asserted, not shown.
- Otherwise nothing beyond the affiliate and membership upsell.

### Worth building?
| Item | Rating | Reasoning and coverage |
|---|---|---|
| The four-pillar strategy schema (level, trigger, confirm, risk as separate, swappable parts) | **Medium to high** | Not a trading edge, but a clean way to write every rule so each pillar can be switched on and off. That is exactly the "test each filter on and off" and "one variable at a time" lessons in the playbook. Check whether `spec.ts` already does this; if so it is covered. |
| Failure test + RSI divergence + 2R | **Low to medium** | The failure test alone is `failure_test_2b`: no edge (530 trades, best 3/6). RSI-divergence confirmation is untested. "MACD divergence with a reversal candle" is already listed as a gap. One run of the divergence filter on and off over the existing 2B rule is cheap. Expect it to cut trade count. |
| Breakout-retest trigger | **Low** | Overlaps the breakout rules (no edge). |

---

## Batch themes

- **One creator, one method, five courses.** Mark a key level, wait for a candle trigger (failure test, hammer, shooting star, engulfing or momentum candle), add a confirmation (volume, RSI divergence or VWAP band), enter at the close, put the stop past the extreme, target 2R and risk 1%. Our library already holds most of this: `failure_test_2b`, `wyckoff_spring` and `confluence`. Tested, it showed no edge.
- **The strongest content is the risk maths in uploads/06:** loss asymmetry, break-even = 1 ÷ (1 + R), expectancy, fixed-fractional and ATR-based sizing, fractional Kelly and no Martingale. It is already the playbook's §1–§2 and enforced in code.
- **The Kelly formula in uploads/06 is wrong for R ≠ 1.** Any helper must use f = W − (1 − W) ÷ R.
- **There is zero backtest or live evidence in all five sources.** Every example was picked in hindsight, the "55 to 62%" lift is invented, and the EV dollar figures come from assumed win rates.
- **Every course is wrapped in affiliate and membership sales:** TradingView, Bybit, paid indicators, a members' toolkit and merchandise. His "Momentum Candles" and "Volume Strength Candles" indicators are paywalled, and we would rebuild them, not buy them.
- **The best new, testable lead is VWAP (uploads/05).** Session VWAP with 1–3σ bands, a trend-pullback rule (sloping VWAP, buy at VWAP or band 1 with a candle) and a flat-VWAP band-2 fade. It fits the SPY/QQQ/IWM 30m data we already have, and `strategy-gaps.md` lists it first.
- **The momentum candle (body ≥ 2× the previous 3 bodies)** shows up in four of the five courses. It is already a `confluence` feature. Test it alone as an intraday breakout trigger, which fills the empty "breakout / intraday" cell.
- **The BOS/CHoCH and strong/weak-level definitions (uploads/03)** are precise enough to code once as a shared labeller. Our only 6/6 candidate (`dave_prev_range`) is built on BOS.
- **The most hyped weak item is order flow (footprint imbalances, absorption and initiation, CVD divergence, DOM).** It is presented as a "secret weapon" with one BTC daily anecdote, and we can't test it without tick or footprint data.
- **Futures mechanics (uploads/04) are infrastructure.** If futures are ever paper-traded we would need a contract-spec table ($/point, micro contracts), an effective-leverage check (exposure ÷ equity, with a $2k account on MES at 19×), roll dates and margin buffers.
- **Gaps that need data or research:**
  - futures continuous-contract history with RTH and ETH sessions;
  - tick or footprint data for order flow;
  - a definition of chart patterns (triangles, flags) solid enough to backtest;
  - a test of whether RSI divergence adds anything on top of `failure_test_2b`.
- **Process advice that matches our validation stance:** write rules down, change one variable at a time, paper trade before going live, journal every trade, and require positive EV. It argues for building the four-pillar spec so each pillar can be ablated, not for adding new setups.
