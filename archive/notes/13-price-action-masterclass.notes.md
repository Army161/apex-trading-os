# 13 Price Action Masterclass - Notes

Source: /home/claude/apex/archive/uploads/13-price-action-masterclass.md (139,021 chars, read 100%). IMPORTANT: the file contains TWO transcripts concatenated. Chars 0 to ~87,000 = the Price Action Masterclass. From roughly char 87,000 ("in this free video course you will learn everything you need to know about the macd indicator") to the end is a separate MACD indicator trading course (same speaker). Both are summarised below; the MACD part is labelled "Part B".

## 1. Summary
Part A teaches price action as "micro" (what price is doing right now, character of movement) versus market structure as "macro" (what price has done: trends, zones, S/R). Structure tells where to look; price action gives timing. It covers OHLC and candle anatomy (body = who is in control, wicks = reaction), a rule-based momentum candle (body >= 2x the previous 3-5 candles; streak continues while candles are about same size or larger), core candlestick patterns (hammer, shooting star, bullish/bearish engulfing, doji family), combining price action with support/resistance zones (reaction quality at touches, weak vs strong tests), breakout trading (momentum candle, close clearly beyond level, high volume, obvious level, follow-through, retest) and false breakouts (wick-only, weak candle, no volume, immediate opposite candle), volume interpretation, and TradingView indicators (All Candlestick Patterns with SMA 50 trend filter, Pivot Points High Low 20/20, Fixed Range Volume Profile). Part B teaches the MACD (12/26 EMA, SMA 9 signal, histogram), why plain crossovers are a mistake, regular and hidden divergence (histogram vs line), the zero line equals EMA12 vs EMA26 cross, alternate settings (Linda Raschke 3-10-16 SMA, 5-35-5, histogram-as-line) and a combined example (divergence + candlestick patterns + trend channel break, 2:1 target).

## 2. Codifiable rules

### Part A: Price action
- Definitions: "price action is all about what the price is doing right now. While ... market structure is what the price has done in the past." "The market structure gives us good context. Uh but the price action gives us timing."
- Principles apply to all timeframes ("daily charts, 1 hour charts or five minute charts") and all markets.
- Body: "a big or tall body means stronger control". Wicks: "wicks are all about reaction". A long wick at a resistance with small body = sellers defended; a long body closing beyond a level = breakout.
- MOMENTUM CANDLE: "I define a momentum candle as ... the body should be at least twice the size compared to the previous candle. And preferably I want the real body to be maybe three times as large or even four times as large as the previous maybe three candles." Lookback: "I recommend to look at maybe three to five candles. So, you want twice as large as the previous three to five candles." Compare REAL BODY size only. Look for "a big body, small wicks, and a strong close". Real momentum should come with high volume.
- Momentum STREAK: "the streak here continues as long as we are seeing candles that are either about the same size or even larger." The streak resets when a candle is "clearly ... much smaller"; a new momentum candle then needs the 2x rule vs previous 3-5 candles again. (Pseudocode: streak continues if body >= ~0.8-1.0x previous momentum candle body; "about the same size" is not quantified.)
- Hammer: prior move down (example 1-2 red candles; best after a crash). One candle, small body, lower wick "at least twice the size and preferably even more" than the body, upper wick very small or none (small OK). Entry: pattern candle close. Stop: below the low of the pattern. Target: fixed R:R, "2:1 target" (distance stop-entry doubled).
- Shooting star: prior move up. Small real body, upper wick at least 2x body, preferably 3x-4x ("the longer the wick, the better"); lower wick none or small. Entry: candle close. Stop: "just above the upper wick". Target: fixed R:R of 2. Context: much stronger at resistance; weak/irrelevant in the middle of a range.
- Bullish engulfing: prior downtrend; C1 red, preferably small body (no strict size rule); C2 green opens below the red real body and closes above it (stocks). Crypto (no overnight gap): "it is okay if the green candle opens at the same level as the red candle" as long as it closes above the red candle's open. "the higher the green candle closes above the red candle, the stronger the pattern appears". Entry: green candle close. Stop: just below the lowest point of the pattern, or a certain distance below a support level. Target: fixed R:R 2 (double the stop-entry distance). Stronger when it forms at a key support (e.g. double bottom): "two bullish signals at the same time can sometimes be enough to take our trade".
- Bearish engulfing: prior uptrend; C1 relatively small green; C2 red opens above and closes below the green real body (wicks irrelevant). Stronger at key resistance. In crypto C2 may open at C1's close. Trade example (SMCI daily): entry at candle close, stop "just above the high of the bearish engulfing" (alternatively above the resistance), target 2:1 (3:1 also mentioned).
- Doji: open and close "at pretty much the same level"; small slight body OK. Classic doji (wicks about equal) = neutral/hesitation. Long-legged doji = longer wicks; "the closer the body is to the top ... the more bullish the dogee will become", lower body = more bearish. Dragonfly doji = open and close at the high, "very bullish", similar to a hammer (hammer has a small body and closes higher). Gravestone doji = open/close at the low, bearish (mirror). Four-price doji = open=close, no wicks, very rare; indecision.
- Support/resistance as ZONES, not lines. Support = "area on the chart where the price tends to bounce up"; resistance bounces down.
- Reading price action at S/R: sharp reaction with long wick = zone defended; reversal candlestick patterns at the zone (hammer at support, shooting star at resistance) confirm; price "moves away quickly with strong candles" after the touch = strength; "slow hovering around the level" = weakness. Previous touches' price-action quality predicts level strength ("history doesn't repeat, but it definitely rhymes").
- "too many tests on a support can actually weaken a support level because each touch can make the breakthrough more likely"; lower highs pressing into support or higher lows pressing into resistance = weakening level (likely break). Small candles clustering (doji/spinning tops) at the level = weak. Rising volume on weak tests = bearish for that level; rising volume on strong tests (hammer/momentum) = good sign. Momentum candles breaking through with conviction = level broken.
- Support strength checklist (speaker's notes): (1) sharp reaction, preferably long wick; (2) clear reversal candles (engulfing, dark cloud, piercing, momentum); (3) price moves away quickly with strong candles; (4) quick reaction = strength.
- BREAKOUT checklist (long side at resistance; mirror for short): (1) "a strong momentum candle breaking beyond a level" at least 2x (preferably 3x+) previous candles; (2) candle close "clearly beyond it ... far above the resistance" (not close to the level); (3) "lots of volume" - example: "more than twice the volume of all the previous ... days"; (4) the level should be obvious to everyone (larger timeframes like daily or 1H "can often be more ... profitable or at least easier to trade"); (5) follow-through candle: "some traders wait for one more momentum candle before they actually enter"; (6) optional retest: "wait for a pullback" to the broken level (resistance flips to support) and enter on bullish price action there.
- FALSE breakout signs: weak non-momentum breakout candle; only a wick beyond the level with no close beyond ("clear sign of reversal", looks like a shooting star); no increase in volume; "immediate opposite candles form" = trap. "false breakouts can actually be one of the best opportunities to trade" (trade the reversal; no specific entry rule given).
- Volume: high volume confirms and makes patterns more significant; low volume = weak participation, be skeptical. Rising price with falling volume = divergence = bearish trend exhaustion. Volume spikes at highs/lows make them important. Stocks: shares traded; crypto: coins traded; forex: tick volume (less reliable). Absolute volume matters ("10 vs 10,000" illustration).
- Indicator settings (TradingView):
  - "All candlestick patterns" (community indicator, search "*" then "all candlestick patterns"): enable Engulfing, Hammer, Shooting Star; uncheck dojis; "Detect trend based on" = SMA 50 ("helps to reduce some noise"; 'no detection' gives many more noisy signals). Buy signals shown blue, sell signals red dots.
  - "Pivot Points High Low" (TradingView built-in): Pivot High = 20 left / 20 right, Pivot Low = 20/20 ("it uses 20 candles to the left and 20 candles to the right"; default is 10/10). Clusters of pivots = key S/R. Use fewer, more significant pivots.
  - "Fixed Range Volume Profile": drag the two anchors across the latest swing (pivot to most recent low). Example: ~70% of volume traded within the range; low-volume areas allow price to move freely; value area can act as a magnet; set target below/before the value area (resistance).
  - Volume: standard Volume indicator.
- Combination trade example (SMCI daily): bearish engulfing at pivot-defined resistance -> short; entry candle close, stop above engulfing high (or above resistance), 2:1 target; a live dragonfly/hammer mix at support -> long at candle close with stop below the wick low, target below volume-profile value area.

### Part B: MACD course
- MACD parts: MACD line = EMA(12) - EMA(26) (standard); signal line = SMA(9) of MACD line (as described by speaker; TradingView default is EMA type); histogram = MACD - signal. Oscillator type EMA. Zero line: MACD line above zero when EMA12 above EMA26; crossing zero = EMA12/EMA26 crossover.
- Momentum candle definition repeated: real body >= 2x previous candles; momentum candles move MACD most.
- MISTAKE: trading raw MACD/signal crossovers or "every time we see a valley this is a sell signal and every time we see a mountain this is a buy signal" - "most of the signals was false signals ... it can accumulate large losses over time".
- Divergence types (regular = reversal; hidden = continuation):
  - Regular bullish: price lower lows, MACD higher lows (look only at lows).
  - Regular bearish: price higher highs, MACD lower highs (highs only).
  - Hidden bullish: price higher lows, MACD lower lows -> continuation up.
  - Hidden bearish: price lower highs, MACD higher highs -> continuation down.
  - Another type mentioned: equal lows on price with higher lows on indicator = bullish divergence signal.
  - Convergence = price and MACD make lows/highs in the same direction.
  - Histogram divergence gives faster signals; MACD line divergence "can generate more significant signals"; can use both together. Prefer clearly separated histogram "mountains".
  - Always "combine divergences with other tools such as support and resistance, price action and market structure".
- Alternative MACD settings:
  - Linda Raschke (also used by Adam Grimes): fast length 3, slow length 10, oscillator type SMA, signal line type SMA, signal smoothing 16. Reacts faster, "can also many times give more false signals" - needs confirmation. Works on any timeframe (example GBPUSD 1H).
  - 5-35-5 MACD: fast 5, slow 35, signal smoothing 5; use the MACD line only (hide histogram and optionally signal line) because histogram oscillates too much.
  - Histogram-as-line: hide MACD and signal lines, set histogram color black and plot style to line.
  - Auto divergence indicator: "MACD Divergences by David Tech" (also one by "toris", most popular). Computes MACD-line divergence; confirms up to ~5 candles later; settings: Min look back range (can set to 1) and pivot lookback right/left (default 5/5; setting to 1/1 produces many false signals). Speaker prefers manual detection.
- Combined MACD trade example (downtrend channel, 5-35-5 MACD): three lows at same level + higher lows on MACD (bullish divergence) + hammer + bullish engulfing + strong momentum candle breaking the trend channel -> long at the momentum candle break; stop below the three equal lows; target 2:1 (1.5:1 mentioned as an earlier exit alternative).

## 3. Strategy specs
```json
{"id":"momentum-candle-detector","name":"Momentum candle (2x body of previous 3-5 candles)","market":"stocks|forex|crypto","timeframe":"any","direction":"both","indicators":{"body_multiple":2,"preferred_multiple":"3-4","lookback":"3-5 candles","streak_rule":"continues while body about same size or larger; resets when much smaller","volume":"high volume confirms"},"entry":"Used as a filter/trigger component, not stand-alone","stop":"n/a","target":"n/a","filters":["big body, small wicks, strong close"],"notes":"Reusable primitive for breakouts and S/R break detection."}
```
```json
{"id":"pa-hammer","name":"Hammer (price-action course)","market":"any","timeframe":"any","direction":"long","indicators":{"lower_wick_min_multiple_of_body":2,"upper_wick":"none/small","prior":"1-2+ red candles / down move"},"entry":"Pattern candle close","stop":"below pattern low","target":"2R (stop-entry distance doubled)","filters":["prior downmove","best at support","volume confirmation"],"notes":""}
```
```json
{"id":"pa-shooting-star","name":"Shooting Star (price-action course)","market":"any","timeframe":"any","direction":"short","indicators":{"upper_wick_min_multiple_of_body":2,"preferred":"3-4x","lower_wick":"none/small"},"entry":"Candle close","stop":"just above upper wick","target":"2R","filters":["prior move up","at resistance"],"notes":""}
```
```json
{"id":"pa-bullish-engulfing","name":"Bullish Engulfing at support","market":"any","timeframe":"any","direction":"long","indicators":{},"entry":"Green candle close (opens below / crypto at red open, closes above red real body)","stop":"below pattern low or a distance below support","target":"2R","filters":["downtrend","key support / double bottom stronger","higher close above red = stronger"],"notes":""}
```
```json
{"id":"pa-bearish-engulfing","name":"Bearish Engulfing at resistance","market":"any","timeframe":"daily example","direction":"short","indicators":{"pivots":"Pivot High/Low 20/20 for resistance","trend_filter":"SMA 50 in All Candlestick Patterns indicator"},"entry":"Candle close","stop":"just above engulfing high (or above resistance)","target":"2R (3R alternative)","filters":["uptrend","resistance cluster"],"notes":"SMCI daily example."}
```
```json
{"id":"momentum-breakout","name":"Momentum candle breakout with volume","market":"any","timeframe":"daily/1H preferred (obvious levels)","direction":"both","indicators":{"momentum":"body >= 2x (pref 3x) prior 3-5 candles","volume":">2x volume of previous days/bars (example)","close":"clearly far beyond level"},"entry":"Close of breakout candle, or after a follow-through momentum candle, or on retest of broken level with bullish price action","stop":"not specified for breakouts (implement: back inside the broken zone / beyond retest low)","target":"not specified","filters":["obvious level","high volume","strong close away from level"],"notes":"BTC Dec 16 2020 break of 2017 ATH (~19,700) used as ideal example."}
```
```json
{"id":"false-breakout-fade","name":"False breakout trap","market":"any","timeframe":"any","direction":"both (against the break)","indicators":{"signs":["wick-only beyond level","weak non-momentum candle","no volume increase","immediate opposite candle"]},"entry":"Not specified (speaker says these are among his favorite setups but gives no mechanical entry)","stop":"not specified","target":"not specified","filters":[],"notes":"BTC Dec 2017 wick above 19,700 with one of the smallest volume bars preceded the 2018 downtrend."}
```
```json
{"id":"sr-price-action-confirmation","name":"S/R zone reaction confirmation","market":"any","timeframe":"any","direction":"both","indicators":{"zones":"areas not lines; pivots 20/20 clusters","reaction":"long wick + reversal pattern + fast move away + volume"},"entry":"On confirming reversal candle at the zone close","stop":"beyond zone","target":"2R or before next opposing zone / volume-profile value area","filters":["reject if dojis/spinning tops cluster","reject if lower highs into support / higher lows into resistance","too many touches weakens level"],"notes":""}
```
```json
{"id":"macd-divergence-reversal","name":"MACD regular divergence reversal","market":"stocks|forex|crypto","timeframe":"any (GBPUSD 1H, BTC daily shown)","direction":"both","indicators":{"macd":"12,26,9 standard or 3,10,16 SMA (Raschke) or 5,35,5 line","type":"histogram (faster) or line (more significant)"},"entry":"After divergence plus confirmation (price action/candle pattern/S-R); no fixed trigger","stop":"beyond the divergence swing extreme","target":"2R (1.5R earlier option)","filters":["bullish: price LL vs MACD HL","bearish: price HH vs MACD LH","combine with S/R, price action, structure"],"notes":"Speaker says never trade raw crossovers."}
```
```json
{"id":"macd-hidden-divergence-continuation","name":"MACD hidden divergence continuation","market":"any","timeframe":"any","direction":"both (with trend)","indicators":{"bullish":"price HL, MACD LL","bearish":"price LH, MACD HH"},"entry":"Not mechanical; combine with trend and price action","stop":"beyond swing","target":"2R","filters":["existing trend"],"notes":""}
```
```json
{"id":"macd-divergence-trendbreak-combo","name":"Divergence + candle pattern + trend channel break","market":"any","timeframe":"any","direction":"long (example)","indicators":{"macd":"5,35,5 MACD line only","structure":"trend channel lines (downtrend)"},"entry":"Strong momentum candle breaking the trend channel after bullish divergence + hammer + bullish engulfing","stop":"below the equal lows (three lows at same level)","target":"2R (or 1.5R)","filters":["divergence","bullish candlestick patterns","channel break"],"notes":"Chart example only."}
```

## 4. Risk and psychology rules
- "Trading is not about certainties. It's all about probabilities."
- Practice concepts right away; avoid distractions ("lock in") for the full course; (education advice, not trading rule).
- Breakouts are "violent moves" so "very important that you have a good trading psychology before you start trading them".
- Standard R:R of 2:1 (3:1 as alternative); 1.5:1 as earlier exit option. No % risk per trade, max drawdown, daily loss, cooldown or journaling rules are given.

## 5. Tools, repos, apps, APIs mentioned
- TradingView (platform for all analysis; free tier covers most; speaker has a referral link: 30-day Premium trial and "$15 bonus", link only in video description/pinned comment - not in transcript).
- TradingView indicators: "All candlestick patterns" (community), "Pivot Points High Low" (TradingView built-in; settings 20/20), "Fixed Range Volume Profile", "Volume", "Moving Average Exponential" (12 and 26 used for zero-line demo), "Moving Average Convergence Divergence" (MACD), "MACD Divergences" by David Tech, and one by "toris".
- Chart examples: Bitcoin (daily), SMCI (daily), GBPUSD (1H).
- Related courses by speaker mentioned by topic: volume analysis, support and resistance, candlestick patterns (2-hour course), market structure, order flow, moving averages (1 hour), RSI (1 hour).
- No code or commands.

## 6. Claims to treat with caution
- "giving you the ability to read the market's next move and generate consistent profits" (marketing).
- "after watching this course you probably know more than I would guess more than 99% of traders about price action" (unsubstantiated).
- BTC Dec 16 2020 breakout described as "the beginning of one of the most legendary bull markets of all time" (hindsight, single hand-picked example; "you will of course not find these kind of perfect examples" every time).
- Volume-profile claim: "around 70% of the volume got traded during that part" (read off one chart).
- No backtests, win rates or expectancy numbers are given for any setup; all examples are cherry-picked charts.
- MACD alt settings: speaker himself notes the Raschke 3-10-16 settings give "faster signals" but "many more false signals".
