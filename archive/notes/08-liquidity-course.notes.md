# Notes: 08-liquidity-course
NOTE: this file actually contains TWO transcripts concatenated: (A) a full Liquidity course (chars 0 to ~91k) and (B) a "Trading Strategies" course (four pillars: level, trigger, confirmation, risk management; failure test + RSI divergence; chars ~91k to end). Both are covered below. Platform: TradingView; examples Bitcoin, Google (4h), NVIDIA, gold heat map.

## 1. Summary
(A) Liquidity = "how easy it is to buy or sell something quickly without moving the price". The course builds from the three order types (market, limit, stop) and the order book (bid/ask, spread, depth; "price moves when market orders overwhelm limit orders") to buy-side liquidity (BSL: buy stops above swing highs, from short stop-losses and breakout buyers) and sell-side liquidity (SSL: sell stops below swing lows). Smart money (banks/hedge funds) is said to hunt these clusters to get counterparties. Three patterns: liquidity sweep (slower break then sharp reversal), liquidity grab (fast wick through level then reaction) and liquidity run (real breakout continuing). Further concepts: external vs internal liquidity and inducement, high vs low resistance liquidity (failure swing vs clean break; "path of least resistance"), equal highs/lows and trend-line liquidity, fair value gaps (3-candle) and liquidity voids/gaps, volume profile / footprint / VWAP as "history of liquidity", and the liquidity heat map (walls, clouds, withdrawals, flips; absorption vs aggression). (B) A framework for building a strategy: Level + Trigger + Confirmation + Risk management; worked example is a failure test (false breakout) at an all-time-high resistance, confirmed by bearish RSI divergence, entered at candle close, stop above the high, 2R target; plus testing/refinement advice (backtest, forward test, paper trade, journal, one change at a time, positive expected value).

## 2. Codifiable rules
### Part A: Liquidity
Order types
- Market: trade now at current price. Limit: better price (buy limit BELOW price, sell limit ABOVE). Stop: worse price (buy stop above, sell stop below), invisible until triggered, then becomes market order. "your stop-loss in a long trade is a sell stop... your take profit is a sell limit"; flipped for shorts.
- Order book: bid = buy limits, ask = sell limits; spread = lowest ask - highest bid (example 2850-2842 = 8). Deep book = high liquidity; thin book = volatile. "the price moves when market orders overwhelm limit orders... price stalls when limit orders overwhelm market orders."
Low-liquidity detection (filter): candles that are just lines (no trades), candles without wicks, gaps on a 5m chart, "ugly candles" => avoid ("try to avoid low liquidity markets"). Example: high liquidity BTC vs small coin on 5m.
Liquidity pools
- BSL: "cluster of buy stop orders that are usually above swing highs". SSL: "cluster of sell stop orders below a swing low".
- Prefer the most significant/obvious levels (all-time highs, multi-touch highs/lows, big crash lows). "stops... are relatively predictable". Age: longer since level formed, more stops accumulate (stated loosely).
- Equal highs/lows (2-3+ touches at same price) = deeper pool; reaction on sweep "more strong and more violent". Beginners: trade obvious horizontal levels first.
- Trend-line liquidity: stops pile below rising / above falling trendlines; "the cleaner the trend line, the more likely it is to get swept before the continuation"; harder to trade, beginners focus on horizontal.
- "any tool that produces a predictable behavior creates more predictable liquidity" (chart patterns, Bollinger Bands, MAs).
- External liquidity = most obvious major highs/lows outside the range; internal = minor swing points, pullback highs/lows, FVGs inside the range. "internal liquidity... tends to get taken first before the external."
- Inducement: deliberate counter-trend move that sweeps internal liquidity, then trend continues (external higher lows intact).
- Low-resistance liquidity: forms after a failure swing (fails to make new high/low; lower swing high or higher swing low); weaker. High-resistance: forms after a clean break (higher high then lower low, or lower low then higher high); stronger. "once high resistance liquidity is taken the price tends to travel toward the low resistance liquidity."
Patterns
- Sweep: price "relatively slowly breaks a swing high or swing low... traps breakout traders and then reverses sharply" (often multi-candle; e.g. two candles wick above and close below, followed by a strong red confirmation candle).
- Grab: "fast and strong wick that pokes through a level and then immediately reacts" (one candle). Sweep vs grab difference is speed; speaker says not a big difference.
- Run: price takes the level and keeps going (true breakout). Signs: candle closes far beyond level, "momentum candle... real body of the momentum candles to be at least twice the size of the previous candle" (later in part B: "at least twice the size of the previous three candles"), small wick, high volume, first ever close above multi-touch resistance. Invalidated if next candle closes back below the level (becomes slow sweep).
- Sweep/grab = reversal trade; run = breakout/continuation trade.
Draw S/R as zones with the rectangle tool ("in real markets... zones").
Fair value gap (FVG): three-candle pattern where "the high of candle one and the low of candle three don't overlap" (bullish FVG: high of candle 1 < low of candle 3; bearish: low of candle 1 > high of candle 3). Theory: price returns to test the gap; trade it with a price-action signal (e.g. bullish engulfing) and market structure confluence. Speaker thinks FVGs are "overhyped". Liquidity void = umbrella for fast low-resistance areas (FVG, normal gap, LVN). Normal gap: no trading between candles (stocks after weekend/overnight; rare in 24/7 crypto); "filling the gap" example NVDA.
Order flow tools as "history of liquidity": volume profile (HVN = historical liquidity pools; LVN = easier movement), POC; Fixed Range Volume Profile in TradingView (Indicators -> volume profile -> click two points); Volume footprint via Candles -> Volume footprint (likely Premium); VWAP "day center of mass", anchored VWAP.
Liquidity heat map (e.g. Bookmap-style, gold example): brighter/yellow = more resting limit orders, dark = few. Rules: "when the price hits a bright zone and stalls... absorption is winning"; "price zooms through a bright zone and breaks it... aggression is winning"; consumed wall + price continues = strong signal. Patterns: wall (single persistent bright line), cloud (stacked walls; "thicker the cloud, the stronger the absorption zone"), withdrawal (wall disappears without being traded -> path of least resistance opens), flip (broken wall later reacts from other side). Heat map filters spoofing because only persistent orders show.

### Part B: Strategy framework
- Strategy = "a fixed set of rules for entering and exiting a trade"; answers where, when (enter/exit), how much. "if you have a trading strategy that you cannot write down... with simple rules then it's not a full trading strategy yet."
- Four pillars: Level, Trigger, Confirmation, Risk management.
- Level: price area (zone) to watch: S/R, supply/demand, order blocks, liquidity levels, trend lines, MAs, chart patterns. "the market has memory." Mark levels before trading; do nothing until price reaches a level.
- Breakout: clean candle CLOSE beyond level; stronger with high volume, close far beyond level, momentum candle (body >= 2x previous 3 candles). Many clean breakouts fail and trap chasers. False breakout favorites: hammer closing back above support; shooting star closing back below resistance.
- Trigger: specific, repeatable event: candlestick pattern (engulfing, hammer, shooting star), breakout, failure test, breakout-retest (retest of broken resistance as support + candle pattern).
- Failure test: "price breaks a level briefly and then closes back inside the range". Bullish = false break below support then close back above; bearish = false break above resistance then close back below. Rationale: stops of breakout buyers (below) fuel snapback; shorts' stops above fuel initial push.
- Confirmation: second signal (RSI divergence, MACD divergence, volume, higher timeframe, order flow). Example claim: win rate 55% -> 62%.
- RSI: 0-100 momentum; "default setting is to use 14 periods"; above 70 "overbought", below 30 "oversold" BUT "never how you should use RSI": do not treat as automatic sell/buy. Setting used: uncheck "RSI based moving average" in Style tab; standard "Relative Strength Index".
- RSI divergence: bullish = price lower low + RSI higher low (look only at lows); bearish = price higher high + RSI lower high (look only at highs). Indicates losing momentum / potential reversal.
- Confluence = two or more signals same direction.
- Complete trade (short, bearish failure test): "enter at the candle close of the candle that briefly broke above resistance and then closed below"; "set the stop loss just above the highest point of the green candle... leave some space for some wiggle room"; target "around a 2:1 risk-to-reward ratio".
- Risk: "risk a small fixed percent of your account per trade... in the beginning... around 1 to 2%"; size position from stop distance; stop-loss and target on every trade; 50% loss needs 100% gain to recover.
- Testing: backtest (TradingView or other tools), forward test, paper trade, journal each trade (setup, result, emotion), need "positive expected value", change "one thing or one rule or one pillar at a time".

## 3. Strategy specs
```json
{"id":"failure-test-rsi-divergence","name":"Failure test (false breakout) with RSI divergence at key level","market":"stocks/crypto/forex (Google 4h example)","timeframe":"4h shown; any","direction":"both (short example shown)","indicators":{"rsi":{"length":14,"source":"close","rsi_ma":false,"overbought_oversold_signals":false},"horizontal_level":"ATH / multi-touch S/R zone drawn as rectangle","volume":"optional"},"entry":"Price pushes beyond marked level then candle closes back inside (below resistance for short / above support for long); RSI shows bearish (HH price, LH RSI) or bullish (LL price, HL RSI) divergence; enter at the close of that candle","stop":"just above the high of the failure-test candle (short) / just below low (long), 'some wiggle room'","target":"2R (2:1 risk-reward)","filters":["level must be clear, visible, multi-touch (ATH best)","RSI divergence confirmation (only highs for bearish, only lows for bullish)","volume and market structure/price action improve it","risk 1-2% of account per trade"],"notes":"Speaker: 'even at 50% win rate we make money with 2R'. Example Google ATH just above 400 on 4h."}
```
```json
{"id":"liquidity-grab-reversal","name":"Liquidity grab / sweep reversal","market":"crypto/stocks","timeframe":"5m to daily","direction":"both","indicators":{"swing_levels":"obvious swing highs/lows, equal highs/lows, ATH","volume":"optional"},"entry":"Price wicks beyond an obvious swing high (BSL) or low (SSL) and closes back inside (grab = 1 candle; sweep = few candles); enter on confirmation candle (e.g. strong opposite candle) / candle close back inside","stop":"beyond the extreme of the wick","target":"not specified (opposite side of range / next liquidity)","filters":["level obvious and multi-touch","avoid low-liquidity charts","price action and market structure confluence","if breakout candle is momentum (body>=2x prior candle(s)), closes far beyond, small wick, high volume => treat as run, not grab"],"notes":"Stop/target placement not explicitly given for grabs; consistent with failure test spec. BTC ATH 14 Jul 2025 used as grab example."}
```
```json
{"id":"liquidity-run-breakout","name":"Liquidity run / momentum breakout","market":"crypto/stocks","timeframe":"daily example","direction":"both","indicators":{"volume":true,"momentum_candle":"body >= 2x prior candle (or prior 3 candles)"},"entry":"Candle closes strongly beyond multi-touch resistance/support with high volume, small wick, momentum body; enter breakout/continuation","stop":"not specified (back inside the level)","target":"not specified","filters":["first close beyond a long-standing level","no immediate close back inside"],"notes":"Run vs sweep distinguished retroactively by next candle behaviour."}
```
```json
{"id":"fvg-retest","name":"Fair value gap retest","market":"crypto/stocks","timeframe":"any","direction":"both","indicators":{"fvg":"bullish: high[c1] < low[c3]; bearish: low[c1] > high[c3]"},"entry":"Price returns to the gap zone and shows price-action signal (e.g. bullish engulfing)","stop":"not specified","target":"not specified","filters":["align with market structure","price action signal required","speaker says FVGs are overhyped and appear constantly"],"notes":"Normal gaps are stronger but rare in 24/7 markets."}
```
```json
{"id":"breakout-retest","name":"Breakout retest (listed alternative trigger)","market":"any","timeframe":"any","direction":"both","indicators":{},"entry":"After a break of a key level, enter when price retests the broken level (old resistance as support) with a candlestick pattern","stop":"not specified","target":"not specified","filters":["volume"],"notes":"Only briefly described as swap-in trigger."}
```
```json
{"id":"heatmap-absorption-aggression","name":"Liquidity heat map wall absorption vs break","market":"crypto/futures/gold with heat-map data","timeframe":"intraday","direction":"both","indicators":{"heatmap":"resting limit order history (e.g. Bookmap-style)"},"entry":"Conceptual: price stalls at bright wall and bounces = absorption (fade); price eats the wall and continues = aggression (follow); wall withdrawal = expect fast run through","stop":"not specified","target":"not specified","filters":[],"notes":"Concept only; requires L2/heat-map data not derivable from OHLCV."}
```

## 4. Risk and psychology rules
- "risk a small fixed percent of your account per trade... around 1 to 2%".
- Position size computed from stop-loss distance; same small risk per trade for beginners.
- Every trade needs stop and target. Protect downside: "more important to protect your downside than maximizing your upside"; 50% loss requires +100%.
- Strategy gives rules against "fear, greed, FOMO... revenge".
- Journal every trade (date, instrument, P/L, setup, emotion, note); review dashboard. Backtest, forward test, paper trade. Change one variable at a time. Need positive expected value.
- No daily loss limits or cooldown rules given. Beginners: avoid low-liquidity markets; start with obvious horizontal levels.
- Speaker rules of thumb: don't treat RSI >70/<30 as automatic signals.

## 5. Tools, repos, apps, APIs mentioned
- TradingView (affiliate: 30 days Premium + $15 bonus); paper trading (Trade panel -> Paper Trading; set market/limit/stop with take-profit and stop-loss; confirm); Replay mode; rectangle tool; Short position tool; Fixed Range Volume Profile; Volume footprint chart type (Premium); relative strength index (Technicals); community RSI variants.
- Bybit (crypto exchange, affiliate link; live order book / depth of market viewer; claims "up to $30,000 in free bonuses... around 80% will get $100").
- Liquidity heat map tool (not named; gold chart example; Bookmap-like).
- mindmathmoney.com members area: Trading toolkit (position size calculator, expected value, drawdown recovery, trading journal) - paid channel membership (gold tier); diamond tier: momentum candle indicator.
- Other courses referenced: smart money concepts, risk management (>1h), price action, market structure, candlestick patterns (2h), chart patterns, order flow, RSI, MACD, volume, Bollinger Bands, paper trading.
- No code or commands.

## 6. Claims to treat with caution
- "With a very good trading strategy you might have a win rate with you know 60%. Or maybe even 70%."
- "maybe your trading strategy goes from 55 to 62% win rate" with confirmation (hypothetical illustration).
- "even if we have a let's say 50% win rate, we will still make money over time with this strategy" (2R; ignores fees/slippage).
- Smart-money stop hunting is asserted as fact without evidence; the speaker concedes "maybe it was just a coincidence" about withdrawal example and "Who knows, right?" about sweeps; hindsight examples (BTC ATH 14 Jul 2025, Google ATH ~400, BTC crash ~14% in a day in February, $60,000 level).
- "I would say that the grab is more quick, the sweep is a little bit more long... not super clear" - definitions are fuzzy.
- Bybit "$30,000 bonus" promotional claim; affiliate/membership promotion throughout.
- Livermore failure-swing comparison and "ICT relabeling old concepts" are opinion.
- "Gold chart" heat map observations are anecdotal.
