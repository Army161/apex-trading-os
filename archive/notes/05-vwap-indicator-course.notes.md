# Notes: 05-vwap-indicator-course (VWAP full course, TradingView, AMD 5m examples)

## 1. Summary
The course teaches the Volume Weighted Average Price (VWAP) from first principles to a complete strategy, using TradingView and mostly AMD on the 5-minute chart. VWAP is "the day average price... based on where the most trading happened", a moving average where volume decides which prices matter. It is used by institutions as a benchmark (buy below VWAP = better than average, sell above = better than average), which is why price reacts to it as dynamic support/resistance. Price above VWAP = buyers in control (long bias); below = sellers in control (short bias). The biggest mistake is treating VWAP as a standalone trigger: it is "context and not the trigger"; entries need price action (candlestick patterns, failure tests) and market structure. Standard deviation bands (1, 2, 3) mark normal pullbacks vs extremes (approx 68% / 95% / 99%+ of price inside). Two core methods: mean reversion (flat VWAP, fade bands) and trend continuation (buy pullbacks to VWAP/band 1 in a sloping VWAP). Anchored VWAP and rolling VWAP extend use to swing trading. The finale combines band-2 touch + horizontal resistance + failure test + shooting star for a short with a 2R target.

## 2. Codifiable rules
Formula / calc
- Typical price = (O+H+L+C)/4 per the speaker's formula ("you take the open, high, low, and close and divide it by four"); TradingView default source is HLC3 ("H + L + C divided by three").
- VWAP = sum(typical_price * volume) / sum(volume). "the VWAP is the average price that most traders paid."
- Resets each session: "It resets on every new day". Stocks: session open. Crypto: "a new VWAP every 24 hours" (speaker says 20/24).
- Bands: standard deviation multipliers 1, 2, 3. "around 68%" within band 1, "around 95%" within band 2, "more than 99%" within band 3.

Settings (TradingView built-in "Volume Weighted Average Price", under Technicals)
- Anchor period: default Session (day). Options mentioned: Session, Week, Month, Quarter, Earnings. "for swing traders... anchor on a monthly basis". Suggested mapping: 5m chart -> session; 1h -> weekly; 4h -> monthly; quarterly for very long.
- Source: default HLC3; options Close; or OHLC4 ("I'm going to do this" in strategy chapter).
- Bands calculation mode: Standard Deviation; Bands multiplier: enable 1 (default), 2, 3 (strategy uses multiplier 2).
- Rolling VWAP (TradingView editor's-pick "Rolling VWAP"): no reset; bands not shown by default - set multipliers 1/2/3 manually. Recommended: leave the manual "time period" checkbox unchecked so it "selects the rolling period automatically based on the time frame" (approx equivalent to session VWAP). Source can be Close or OHLC4.
- Timeframes: "most commonly used on day trading time frames, maybe the 5 minute to 15 minute time frame and even the 1 minute".
- Also add Volume indicator alongside VWAP.

Bias rules
- "when the price is above the VWAP, it simply means that the buyers are in control" -> long bias. Below -> "sellers are in control" -> short bias.
- "trade on the side of the VWAP where the price is on."
- VWAP cross "can signal a shift in control".
- VWAP slope: price above line pushes it up, below pushes it down; higher volume = faster move.
- Filter: "a flat sideways VWAP... gives the weakest signals"; "In shopping [choppy/sideways] markets... many false signals". Trend method only when "VWAP is clearly sloping up or down".

Strategy A mean reversion: "works best when the market is sideways and the VWAP is flat. When the VWAP is flat and the price extends maybe up to the first band or even the second band" and shows a price action signal (e.g. "bearish shooting star candlestick pattern appearing right here on the upper band") -> trade back to the VWAP. Target = VWAP.
Strategy B trend with bands: VWAP clearly sloping; "buy pullbacks to VWAP or ... the first band"; confirm with hammer dipping just below VWAP or bullish engulfing. Same logic inverted for downtrend (sell rallies to VWAP in downtrend).
Band use: "first band catches normal pullbacks while the outer bands catch extremes"; band 2 and 3 "mainly used for reversal trades". Touch of band 2 alone is not an entry: "touching the second band is a signal that we should look out for a potential reversal. But that is not our entry signal." Near-touch is "not enough to take the trade". Band 3 is rarely exceeded (seen a few times on AMD intraday).
Long reversal example: price near lower band 2 + morning star pattern.

Final strategy (confluence short)
1. Pre-mark key horizontal levels on higher TF (e.g. all-time high on daily).
2. VWAP with band multiplier 2, OHLC4 source, std-dev.
3. Price tags upper band 2 AND horizontal resistance AND VWAP context.
4. Failure test: price pushes above resistance then closes back below.
5. Candlestick confirmation: bearish shooting star.
6. Entry: "enter at the candle close of the failure test pattern."
7. Stop: "just above the extreme of the pattern... a tiny bit above the high of that candle."
8. Target: "risk-to-reward ratio of two" (2R).

## 3. Strategy specs
```json
{"id":"vwap-mean-reversion-bands","name":"VWAP mean reversion at outer bands","market":"stocks/crypto/forex (examples AMD)","timeframe":"1m-15m (5m shown)","direction":"both","indicators":{"vwap":{"anchor":"session","source":"hlc3 or ohlc4","bands_mult":[1,2,3],"band_calc":"standard_deviation"},"volume":true},"entry":"When VWAP is flat and price extends to band 1 or band 2, enter on a reversal price-action signal (shooting star / hammer / engulfing / morning star) in the direction of VWAP","stop":"Beyond the extreme of the signal candle (tiny bit above/below)","target":"VWAP (mean); or fixed 2R","filters":["VWAP slope flat / sideways market","price-action confirmation required, band touch alone insufficient","optional confluence with horizontal S/R"],"notes":"Speaker gives no numeric slope threshold for 'flat'; implementer must define (e.g. VWAP slope over N bars within epsilon)."}
```
```json
{"id":"vwap-trend-pullback","name":"VWAP trend continuation pullback","market":"stocks/crypto/forex","timeframe":"5m-15m (1m ok)","direction":"both","indicators":{"vwap":{"anchor":"session","bands_mult":[1],"source":"hlc3"}},"entry":"VWAP clearly sloping up: buy pullback to VWAP (or band 1) on bullish price action (hammer dipping just below VWAP, bullish engulfing). Mirror for sloping down.","stop":"Beyond signal candle extreme / just beyond VWAP (not specified exactly)","target":"not specified; suggest 2R default per speaker's simple example","filters":["only when VWAP clearly slopes","trade only on the side price is on (above=long, below=short)"],"notes":"Stop/target not stated explicitly for this method."}
```
```json
{"id":"vwap-band2-failure-test-short","name":"Band-2 + resistance failure test short (strategy chapter)","market":"stocks (AMD example), generalizable","timeframe":"5m with daily key levels","direction":"short (mirror for long)","indicators":{"vwap":{"anchor":"session","source":"ohlc4","bands_mult":[2],"band_calc":"standard_deviation"},"horizontal_levels":"prior all-time high / key resistance from daily"},"entry":"Candle closes back below resistance after pushing above it (failure test) while touching upper band 2 and VWAP context, with bearish shooting star; enter at that candle close","stop":"just above the high of the failure-test pattern","target":"2R","filters":["confluence of band 2 + horizontal level + price action","scan multiple charts, only best setups, do not force trades"],"notes":"Speaker says stop 'is not negotiable' placement-wise. Long version is the mirror (lower band 2 + support + failure test + hammer)."}
```
```json
{"id":"anchored-vwap-bias","name":"Anchored VWAP bias from key event","market":"stocks/crypto","timeframe":"any (swing)","direction":"both","indicators":{"anchored_vwap":"from major swing high/low, earnings candle, or news candle"},"entry":"Price holding above AVWAP anchored at swing low = buyers in control; below = sellers in control; use pullbacks to AVWAP with price action","stop":"not specified","target":"not specified","filters":["anchor choice: swing high/low, earnings date, big news candle"],"notes":"TradingView: Anchored VWAP tool under 'forecasting and measurement tools', or VWAP indicator anchor period = Earnings."}
```

## 4. Risk and psychology rules
- Use R:R of 2 as a "super simple example"; real risk handling deferred to speaker's risk management course (no % given).
- "You don't want to force yourself into trades"; scan multiple charts/setups and focus on the best.
- Teaching examples are cherry-picked: "real markets... can be much harder".
- Recommends physical trading journal/notebook (no journaling rules).
- No daily loss limits, risk % or cooldowns stated.

## 5. Tools, repos, apps, APIs mentioned
- TradingView (charting; free 30-day Premium + $15 bonus via speaker's affiliate link). Built-in "Volume Weighted Average Price" (Technicals), "Volume", "Rolling VWAP" (editor's pick), "Anchored VWAP" drawing tool, Short position tool (forecasting and measurement tools). TradingView shows earnings markers ("E") and allows anchor on Earnings.
- MindMath Money store (notebook/journal). Speaker's other courses: price action, market structure, candlestick patterns (~2h), support & resistance, risk management, trading psychology. No code/APIs/commands.

## 6. Claims to treat with caution
- "VWAP is one of the most powerful trading indicators used by smart money and institutional traders."
- "you probably have a better understanding of the VWAP indicator than you know at least 99% of traders."
- Institutional claims (Goldman Sachs, Bridgewater use VWAP as benchmark) are asserted without evidence.
- Band coverage "68% / 95% / 99%" is the normal-distribution assumption; speaker admits on AMD "more of the time price traded within this band"; price does exceed band 3 occasionally.
- Examples shown are "very clear and super educational" cherry-picked; no backtest or win-rate numbers given.
- Slight inaccuracies in transcript: "50 SMA = 100 ... average of last 100 candles was 50" is a misstatement; VWAP "pushed" by price location is loosely explained.
