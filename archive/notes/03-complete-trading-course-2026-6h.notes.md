# Notes: Complete Trading Course 2026 (6h) - source: 03-complete-trading-course-2026-6h.md

Speaker: Swedish YouTuber (brand "Mind Math Money", shop.mindmathmoney.com). Pure education course, discretionary/visual trading on TradingView. Transcript ~304k chars, fully read. No code, bots or APIs; there is no bot architecture here.

## 1. Summary
Three-part beginner-to-advanced course. Part 1 (fundamentals): trading as decision-making under uncertainty (buy / sell / do nothing), the entry-stop-target-size trade framework, tools (TradingView, broker, paper trading, journal), candlestick anatomy, trends vs ranges, support/resistance zones, order types (market/limit/stop), long vs short, position sizing at 0.5-1% risk, expected value, psychology, and one simple beginner strategy (trade pullbacks / chart-pattern breakouts in trend direction, 2R target). Part 2 (pillar 1, price action): candle body/wick reading, momentum-candle rule, candlestick patterns (hammer, shooting star, bullish/bearish engulfing, doji family), price action at support/resistance, breakout and false-breakout checklists, volume confirmation, and indicators (All Candlestick Patterns with SMA50 trend filter, Pivot Points High Low 20/20, Fixed Range Volume Profile). Part 2b (pillar 2, market structure): swing points, impulse+pullback, market states (uptrend / downtrend / range / messy transition), multi-timeframe analysis, Fibonacci retracement and measured moves, BOS / CHoCH, strong vs weak highs/lows, two entry models (pullback entry, failure test / 2B), trend lines/channels, smooth vs choppy regimes. Part 3 (order flow): auction theory, balanced vs imbalanced markets, value area (70%) and POC, order types and order book / DOM, manipulation (spoofing, iceberg, layering, OTC, dark pools), footprint charts (delta, POC, VA, 3x diagonal imbalances, absorption vs initiation), cumulative volume delta divergences, volume profile (HVN/LVN). Strongest message: wait for clear conditions, define risk before entry, always use a stop, combine price action + market structure + (optionally) order flow, never rush into real money.

## 2. Codifiable rules

### Trade framework / structure
- Every trade needs four items: "an entry price... a stop-loss... a target level... a position size". "If any of these steps are missing then it's not a trade. Then you are actually gambling."
- Three steps: find market setup -> plan (entry, stop, target) -> execute and review. "Entry, stop, target."
- Third option besides buy/sell: do nothing; "most of the time as a trader, you actually do nothing."
- Beginner strategy: "trade in the trend direction"; "trade pullbacks and especially you can wait for pullbacks into key levels... or trade pullbacks that are clear chart patterns"; "define your risk before your entry".
- Avoid choppy/messy markets: "when you have a very messy market, try to avoid it completely. Don't trade it." "Different market states requires different trading strategies."
- Analyse trend first: "you should start by analyzing the trend... This basically filters out the bad trades."

### Position sizing / risk
- "beginners can begin here with as small as 0.5 to 1%" risk per trade.
- Position size = (account x risk%) / stop distance. Example: account 10,000, risk 1% = $100, entry 100, stop 90 -> "position size is 10 units"; stop at 80 -> 5 units. Calculator settings include commissions and slippage.
- "the wider we have our stop loss... the less the position size can actually be."
- "it's more important that you survive than that you profit."

### Expected value
- Example: "60% chance to win $100 and ... 40% chance to lose $100" profitable over many trades; "55% risk of losing $100 but 45% chance of winning $200" is still a good strategy.
- Example calc: win avg 200, lose avg 100: break-even win rate 33.3%; at 45% win rate EV after 100 trades "$3,500"; at 30% negative (-$1,000 after 100 trades); at 35% still positive. Rule: "if you have a negative expected value this is a trading strategy that you should never use". (EV per trade = W*avgWin - (1-W)*avgLoss; breakeven W = L/(W_amt+L).) Speaker said at zero commission the EV in the 40% case was "$35 per trade" (200*0.4... figure as stated in transcript; with 45% win rate and 2R it computes to $35 per trade at risk 100).
- Trade size on judgments across multiple trades: "one trade does not matter. Even five trades does not matter."

### Orders
- Market order: fills now at current price. Buy limit below price, sell limit above price ("limit is better, stop is worse"). Buy stop above price (entry on breakout). Sell stop = stop-loss below price for longs. For shorts: stop-loss above entry, buy-limit target below entry.
- TradingView bracket example (gold): buy limit 4,500, stop 4,400, target 4,700.
- "always need to set a stop-loss."

### Practice rules
- "back test your setup on chart and trade it on a demo account"; use TradingView paper trading; journal; "do not rush in with real money".

### Trend / market-structure definitions
- Uptrend: both higher highs AND higher lows ("we need to have both"). Downtrend: lower highs AND lower lows. Anything else is sideways/range (includes triangles) or messy transition.
- "when we have two higher highs and two higher lows, we can consider an uptrend to have been started."
- Impulse + pullback: impulse = strong fast move with larger/more same-colour candles; pullback = smaller mixed bodies, more wicks, doji. Simple pullback (one clean counter-move) vs complex pullback. "Impulse plus pullback equals the basic heartbeat of every trend." Beginners start with simple pullbacks.
- BOS (break of structure): price breaks previous swing point in trend direction = trend continuing. CHoCH (change of character): "first meaningful break against the established trend" (break of last low in an uptrend) = early warning; "In order to actually confirm a complete trend change, we need a break of structure after the change of character." Speaker says ignore "market structure shift" (= CHoCH).
- Strong level: level (start of move) that caused a successful BOS; "strong low tends to hold... good place for stop losses... also a good place for entries". Weak level: failed to break structure / cause CHoCH; "more likely to get taken out".
- Trend line: connect higher lows (uptrend) / lower highs (downtrend); break of trend line is only a warning, "I strongly recommend against" trading purely on trend lines; trend channel = parallel copy of slope at the top, top of channel is roughly where reversal is expected.
- Smooth vs choppy: trade smooth (long impulses, clean pullbacks, clear BOS/CHoCH); avoid choppy (overlapping swings, fake signals); lower timeframes (1-min) tend to be choppier. "Simply waiting is often the ... best option."

### Support / resistance
- Treat as zones, drawn with rectangle tool, not lines. "if the level is not obvious, ignore the level." Do not draw too many levels. Can trade reaction or breakout.
- Strong S/R signs: sharp reaction with long wick, reversal candles (engulfing, hammer etc.), price moves away quickly with strong candles; quick reaction = strength; slow hovering = weakness.
- Break warning signs: lower highs pressing into support / higher lows into resistance; small candles (dojis, spinning tops) clustering; rising volume on weak tests; momentum candles breaking with conviction. "too many tests on a support can actually weaken a support level".
- Zone built from clusters of pivot points (Pivot Points High Low), or clusters of footprint POCs.

### Momentum candle
- Body (real body) "at least twice the size compared to the previous candle", compare to previous "three to five candles"; prefer 3x or 4x ("three times as large or even four times"); small wicks, strong close, high volume.
- Streak continues while following candles are about same size or larger; resets when a clearly smaller candle appears; a new momentum candle needs the 2x-vs-prior-3-to-5 rule again.

### Candlestick patterns (all require context at key zones; 2R targets typical)
- Hammer (bullish reversal, one candle): prior downmove; small body; lower wick "at least twice the size... of the body"; no or very small upper wick. Entry at candle close; stop below low of pattern; target fixed R:R "2:1".
- Shooting star (bearish reversal): prior upmove; small body, long upper wick >= 2x body (prefer 3-4x); no/small lower wick. Entry candle close; stop just above upper wick; target 2R. Stronger at resistance; weak mid-range.
- Bullish engulfing: prior downtrend; red candle (preferably small body); green candle opens below and closes above red real body (stocks); crypto: ok if green opens at same level as red close but must close above red open. Entry green candle close; stop below pattern low (or a distance below support); target 2R. Stronger at support (e.g. double bottom).
- Bearish engulfing: mirror; red opens above and closes below green real body. Stop above the pattern high (or above resistance); target 2R (could use 3:1).
- Doji: open ~ close. Classic (neutral), long-legged (body near top = more bullish), dragonfly (open/close at high, bullish, like hammer w/o body), gravestone (open/close at low, bearish), four-price doji (rare). Indecision.
- Dojis/spinning tops at a support/resistance = lack of conviction, bearish for the level.

### Breakout checklist (speaker's favourite)
- Strong momentum candle through level (>= 2x previous candles, prefer 3x+), "close clearly beyond it... far above", high volume ("more than twice the volume of all the previous days" in the example), level obvious to everyone (higher timeframes: daily/1h), optional follow-through confirmation candle, optional retest of broken level (resistance flips to support; look for bullish price action at retest).
- Standard breakout entry: at candle close of the breakout candle.
- False breakout signs: weak non-momentum candle; only a wick beyond level; no volume increase; immediate opposite candles. False breakouts can themselves be traded ("some of my favorite trading strategies").
- Example: Bitcoin 2017 high ~19,700 broke 16 Dec 2020 with momentum candle, >2x volume, close far above; Dec 2017 wick-only attempt on lowest volume = fake.

### Volume
- Volume confirms: high volume = strong supported move; low volume = weak. Rising price with falling volume = bearish divergence / exhaustion; volume spikes at highs/lows make them more important. Forex uses tick volume.

### Indicator settings (exact)
- TradingView "All Candlestick Patterns" (search "* All Candlestick Patterns"): enable Hammer, Shooting Star, Engulfing; uncheck dojis; "Detect trend based on: SMA 50" (reduces false signals; "No Detection" gives noisy signals).
- TradingView built-in "Pivot Points High Low": Pivot High 20 / Pivot Low 20 (default 10/10); "uses 20 candles to the left and 20 candles to the right"; clusters of pivots = key S/R.
- Fixed Range Volume Profile: anchor to most recent swing move (pivot to low). Example: ~70% of volume traded in the range; where little volume on horizontal level, price moves freely; set target below the value area.
- Volume (built-in) for breakouts; Volume Footprint (candle type -> "Volume footprint", settings type "Buy and sell"); CVD: community indicator by "LonesomeTheBlue"-style author named by speaker as "Lonesome the Wolf" ("Cumulative Delta Volume", ~8.8k likes), inputs: use Line instead of candles, thicker line; Volume Profile family: Visible Range, Fixed Range.
- Fibonacci retracement tool (alt+F): draw swing low to swing high in uptrend; levels 0.236, 0.382, 0.5, 0.618; "golden zone" 0.382-0.618 where most pullbacks end; strong trends end in 0.236-0.382; do not use Fib alone.
- Measured move: "the next impulse often equals the size of the previous one" -> target = copy impulse length from pullback low. Fixed R:R: stop distance x R = target (1:1, 2:1, 3:1; 1.5 used in a flag example).

### Multi-timeframe
- Higher timeframe (daily/4h; day traders 1h/30m) = context and bias; next down = structure/levels, BOS/swings/zones; lowest = precise entry. Beginners: two timeframes enough. Example: daily uptrend, 1h pullback as bull flag, enter on close of strong green candle breaking above descending trend line, stop below low of the pattern, target fixed 1.5R.

### Entry models
- Model A pullback entry: impulse + BOS, define pullback channel. Aggressive entry at pullback support on bullish signal (hammer or momentum candle), stop just below hammer. Conservative entry on breakout of pullback structure with momentum candle + high volume, stop below pullback low, target measured move or fixed R:R.
- Model B failure test (2B / Wyckoff spring / upthrust): price briefly breaks level and re-closes inside range; entry at candle close; stop beyond the extreme (wick) of the failure; target fixed R:R 2:1. Works with trend (hammer under pullback support) and counter-trend (failed BOS then short).
- Ascending triangle example (gold, daily): resistance zone + rising lows after uptrend; trade only on breakout; enter breakout close; stop below most recent low before breakout; target 2R.

### Order-flow rules
- Value area ~70% of volume (one standard deviation); POC = highest-volume price.
- Footprint: left sell market orders (red), right buy market orders (green); delta = buy - sell; total delta per candle; imbalance = one side >= 3x the other, compared diagonally (buy at price compared to sell one level below... speaker: "the buy side will always be one step above the cell side"); stacked imbalances = multiple in a row.
- Absorption (price moves opposite to imbalance = reversal/weakness) vs initiation (price moves with imbalance and closes beyond it = continuation/strength). Bullish absorption: selling imbalances but candle closes higher (looks like hammer). Bearish absorption: buying imbalances but closes lower. Bullish initiation: buying imbalances, close above. Bearish initiation: selling imbalances, close below. Use at S/R.
- Footprint S/R strategy: look for clusters of POC across several candles, draw support rectangle; enter on first strong reaction; stop just below the low; use R:R target; confirm with initiation candle.
- CVD: cumulative sum of delta. Divergences: bearish = price higher highs / CVD lower highs (buying exhaustion); bullish = price lower lows / CVD higher lows (selling exhaustion); hidden bearish = price lower highs / CVD higher highs (continuation down); hidden bullish = price higher lows / CVD lower lows (continuation up). "When price and delta agree, the move is stronger. When they diverge, it's weaker."
- Volume profile: HVN (acceptance, magnets, slow movement), LVN (rejection, fast movement). Use POC as S/R (e.g. Bitcoin: profile POC matched footprint support and bounce).
- Order book/DOM: bid = buy limits, ask = sell limits; deep vs shallow market; price rises when aggressive buyers clear sell orders. Manipulation: spoofing, iceberg, layering, OTC, dark pools => live order book can mislead; footprint is the "solution".
- "Combine order flow with market structure and price action."

## 3. Strategy specs

```json
{"id":"ascending-triangle-breakout","name":"Ascending triangle / resistance breakout after uptrend","market":"stocks, crypto, forex, gold (examples: gold daily)","timeframe":"daily (any)","direction":"long","indicators":{},"entry":"Enter at candle close of the breakout above the flat resistance zone; do not trade the pattern until breakout","stop":"Below the most recent swing low before the breakout","target":"Fixed 2R (target = 2x stop distance)","filters":["pattern follows an upmove","resistance zone is obvious with multiple touches","higher lows into resistance"],"notes":"Beginner strategy slide: trade with trend, pullbacks into key levels or clear chart patterns; risk 0.5-1% per trade."}
```

```json
{"id":"hammer-reversal","name":"Hammer reversal at support","market":"any","timeframe":"any (daily/1h shown)","direction":"long","indicators":{"all_candlestick_patterns":{"patterns":["Hammer"],"trend_detection":"SMA 50"}},"entry":"Candle close of the hammer","stop":"Below the low of the pattern (wick low)","target":"Fixed 2R (2:1)","filters":["prior move down","small body, lower wick >= 2x body, no/small upper wick","located at support / key zone","preferably high volume"],"notes":"Context matters more than the pattern."}
```

```json
{"id":"shooting-star-reversal","name":"Shooting star reversal at resistance","market":"any","timeframe":"any","direction":"short","indicators":{"all_candlestick_patterns":{"patterns":["Shooting Star"],"trend_detection":"SMA 50"}},"entry":"Candle close of the shooting star","stop":"Just above the upper wick","target":"Fixed 2R","filters":["prior upmove","upper wick >= 2x body (prefer 3-4x)","at key resistance; ignore mid-range"],"notes":""}
```

```json
{"id":"bullish-engulfing-at-support","name":"Bullish engulfing at support","market":"any","timeframe":"any","direction":"long","indicators":{"all_candlestick_patterns":{"patterns":["Engulfing"],"trend_detection":"SMA 50"}},"entry":"Close of the green engulfing candle","stop":"Below the lowest point of the pattern, or a distance below the support zone","target":"Fixed 2R","filters":["downtrend before pattern","green opens below and closes above red real body (crypto: open may equal prior close)","at key support (e.g. double bottom)"],"notes":"Higher close above red candle = stronger."}
```

```json
{"id":"bearish-engulfing-at-resistance","name":"Bearish engulfing at resistance","market":"any","timeframe":"any","direction":"short","indicators":{"all_candlestick_patterns":{"patterns":["Engulfing"],"trend_detection":"SMA 50"},"pivot_points_high_low":{"high":20,"low":20}},"entry":"Close of the red engulfing candle","stop":"Just above the high of the engulfing pattern (or above resistance)","target":"2R (3R also shown)","filters":["upmove before pattern","red opens above and closes below green real body","at pivot-cluster resistance"],"notes":"SMCI example."}
```

```json
{"id":"momentum-breakout","name":"Momentum-candle breakout of obvious level","market":"any (BTC daily example)","timeframe":"daily / 1h preferred","direction":"both","indicators":{"volume":"built-in","momentum_candle":"body >= 2x (prefer 3x) previous 3-5 candles"},"entry":"At candle close of breakout momentum candle (or on retest of broken level with bullish price action; optional follow-through candle)","stop":"Not specified for breakout; below the breakout candle / back inside the broken zone","target":"Fixed R:R or measured move","filters":["close far beyond level","volume > ~2x previous bars","level obvious to everyone","reject: wick-only break, no volume, weak candle, immediate opposite candle"],"notes":"Stop for breakouts not given explicitly."}
```

```json
{"id":"pullback-entry-trend","name":"Trend pullback entry (Model A)","market":"any","timeframe":"HTF trend, LTF entry","direction":"both (shown long)","indicators":{"fib_retracement":{"golden_zone":[0.382,0.618],"strong_trend_zone":[0.236,0.382]},"volume":"built-in"},"entry":"Aggressive: at pullback support on bullish signal (hammer/momentum candle), entry at candle close. Conservative: on breakout of pullback structure with momentum candle and high volume","stop":"Aggressive: just below hammer. Conservative: below the pullback low","target":"Measured move (impulse length from pullback low) or fixed R:R (1, 2, 3, 1.5)","filters":["established trend (HH+HL, BOS present)","smooth not choppy market","pullback into golden zone / key level"],"notes":"Speaker says BOS/CHoCH keep the trend read objective."}
```

```json
{"id":"failure-test-2b","name":"Failure test / 2B / spring / upthrust (Model B)","market":"any","timeframe":"any","direction":"both","indicators":{},"entry":"Candle close when price re-closes back inside the range after briefly breaking the level (e.g. hammer below pullback support)","stop":"Beyond the extreme (wick) of the failure candle","target":"Fixed 2:1 R:R","filters":["with trend at pullback support, or counter-trend after failed break of structure","check market context"],"notes":"Traps breakout traders and triggers their stops."}
```

```json
{"id":"mtf-bull-flag-breakout","name":"Multi-timeframe uptrend with LTF bull-flag breakout","market":"any (Google example)","timeframe":"daily bias, 1h entry","direction":"long","indicators":{},"entry":"Close of strong green candle breaking above descending trend line of the flag on lower timeframe","stop":"Below the low of the flag pattern","target":"Fixed R:R 1.5","filters":["daily uptrend (impulse/pullback, HH/HL)"],"notes":"Alternative: trade touches of the lower flag bound."}
```

```json
{"id":"footprint-poc-cluster-support","name":"Footprint POC cluster support bounce","market":"crypto/stocks (BTC daily example)","timeframe":"daily","direction":"long","indicators":{"volume_footprint":{"type":"buy and sell"},"cvd":"line style"},"entry":"First strong reaction (bullish candle / initiation) from the support zone drawn over clustered POCs","stop":"Just below the low of the reaction","target":"Fixed R:R","filters":["multiple POC black bars clustered","bullish initiation (buy imbalances, close above)","CVD bullish divergence optional","not enough alone: combine with other signals"],"notes":"Speaker: 'one bullish sign' is not enough."}
```

```json
{"id":"cvd-divergence-reversal","name":"CVD divergence reversal","market":"BTC etc.","timeframe":"daily","direction":"both","indicators":{"cumulative_delta_volume":{"style":"line"}},"entry":"After divergence between price swing and CVD swing (bearish: price HH / CVD LH; bullish: price LL / CVD HL); entry specifics not given","stop":"Not specified","target":"Not specified","filters":["combine with market structure and price action"],"notes":"Hidden divergences = continuation. Entry/stop/target not quantified in the transcript."}
```

```json
{"id":"absorption-initiation-confirmation","name":"Absorption then initiation at S/R (footprint)","market":"crypto/stocks","timeframe":"any","direction":"both","indicators":{"imbalance_ratio":3,"comparison":"diagonal"},"entry":"After bullish (or bearish) absorption at a support (resistance) zone, enter on following initiation candle close","stop":"Not specified (beyond zone)","target":"Not specified","filters":["absorption = price closes against imbalance; initiation = with imbalance","at S/R/demand zone"],"notes":"Conceptual; used to add confluence."}
```

## 4. Risk and psychology rules
- "always setting a stop-loss is so so important."
- Risk 0.5-1% per trade (beginners); position size derived from stop distance.
- "losses are just part of the business"; "one trade means nothing and the process means everything"; "consistency is much more important than intensity".
- "a good trade follows the plan and a bad trade breaks the rules"; rules "protect you from yourself"; fear (removing stop-loss), FOMO (jumping in at top), greed (increasing risk after wins).
- Review each trade: did you follow plan? Journal: why entered, outcome, size of win/loss, psychology, plan adherence ("physical book" or digital).
- Backtest + demo (TradingView paper trading) before real money; real-money emotions are far stronger.
- Do not force trades in choppy markets; waiting is a position.
- Recommended book: Trading in the Zone (Mark Douglas).
- No daily loss limit or drawdown cap, cooldown, or risk-of-ruin numbers are stated (a "risk of ruin" calculator is mentioned but not shown).
- Beginner instrument advice: start with large-cap stocks or BTC (lower volatility).

## 5. Tools, repos, apps, APIs mentioned
- TradingView (charting; paper trading; trading panel connects brokers; Replay mode for backtesting; Long/Short Position tool; Fib retracement alt+F; rectangle for zones; layout setup for multi-chart; volume footprint candles; indicators above). Speaker has an affiliate link (premium 30-day trial, $15 bonus): URL not stated in transcript ("description and pin comment").
- Bybit (crypto exchange, affiliate bonus up to $30,000 claim); OKX, Binance (connectable to TradingView); Avanza (Swedish broker, speaker "Avansa"); forex brokers unspecified. Suggests asking an LLM (ChatGPT/Gemini/Claude) to pick a broker.
- mindmathmoney.com members area: trading risk calculator (position sizer, expected value, risk of ruin); shop.mindmathmoney.com (promo code "mmmmm10" per transcript "mmmmm 10", 10% off); YouTube channel membership gold+ for presentations.
- Indicators: "All Candlestick Patterns" (community), Pivot Points High Low (TradingView), Volume, Fixed Range / Visible Range Volume Profile, Volume Footprint (candle type), Cumulative Delta Volume (community, "Lonesome the Wolf"), built-in Cumulative Volume Delta.
- Other courses referenced (YouTube): price action, market structure, chart patterns, support/resistance, candlestick patterns (2h), volume analysis, order flow, MACD, trading psychology, TradingView tutorial, shorting, arbitrage.
- No commands/code/repos.

## 6. Claims to treat with caution
- "90% of traders also fail and lose their money" / "90% of people... won't make it past the 20 minute mark" (unsourced).
- "you will understand markets better than 99% of traders" / "you now know more than 99% of traders when it comes to orderflow trading" (marketing).
- "price action is the most important thing to learn" and "These two concepts are so much more important than learning about indicators" (opinion).
- Bybit: "up to a total of $30,000... most people will get like $100 for free" (affiliate).
- Examples shown are hand-picked in hindsight (gold breakout, BTC Dec-2020 breakout "beginning of one of the most legendary bull markets", SMCI bearish engulfing, BTC footprint bounce); no systematic backtest stats given. Speaker: "I'm not saying that I'm correct", "we can never be certain", "Trading is not about certainties. It's all about probabilities."
- Expected-value calculator numbers are illustrative: "$33.80" with costs / "$35 per trade" without; "$3,500 after 100 trades"; break-even win rate "33.3%" for 2:1 payoff. Not strategy results.
- Fib golden zone / measured move: speaker says "guidelines... not perfect rules". "Value area = 70% from one standard deviation" is a simplification.
- Claim that spoofing etc. makes order book misleading and footprint is "the solution" is not evidenced.
