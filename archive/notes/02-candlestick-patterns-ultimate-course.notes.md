# 02 Candlestick Patterns Ultimate Course - Notes

Source: /home/claude/apex/archive/uploads/02-candlestick-patterns-ultimate-course.md (114,020 chars, read 100%). Speaker is an unnamed YouTube educator. Transcript is auto-captioned (typos such as "Wick", "dogee", "Bars" = bears).

## 1. Summary
A 4-chapter course on reading and trading candlesticks on any market (stocks, forex, crypto) and any timeframe. Chapter 1 covers OHLC, wicks, body strength, wick analysis and the "momentum candle" (real body at least 2x the previous candles). Chapter 2 classifies every pattern on three axes: complexity (simple = 1 candle, complex = 2+), direction (bullish/bearish/neutral) and type (reversal/continuation). Chapter 3 teaches 10 reversal patterns (bullish/bearish engulfing, hammer, shooting star, morning star, evening star, piercing, dark cloud cover, inverted hammer, hanging man). Chapter 4 teaches continuation patterns (rising/falling three methods, bullish/bearish momentum candle, bull/bear flag, bullish/bearish runaway gap). Chapter 5 covers doji and spinning tops as indecision candles / warning signals. For every pattern the speaker uses one consistent trade template: enter at pattern candle close, stop beyond the pattern extreme (or beyond nearby support/resistance) with "wiggle room", target by fixed R:R (usually 2:1, sometimes 3:1) or measured move / next S/R. Context (prior trend, S/R location) is repeatedly said to matter more than the pattern shape.

## 2. Codifiable rules

### 2.1 Candle primitives
- OHLC: open, high, low, close. Green = bullish (close > open), red = bearish. Body = open-close ("real body"); wicks/shadows = high/low beyond body.
- Body strength: longer body = stronger momentum. "as a rule of thumb the longer real body we have the stronger than momentum".
- Wick analysis: a bigger move from low to high within a candle with same OHLC-body is more bullish; a long lower wick at support = "buying pressure coming in at the support level". Long upper wick at resistance "confirms that the resistance is holding".
- Doji/indecision: small body + long wicks = "indecision", neither side in control.
- MOMENTUM CANDLE: "a Candlestick that is at at least two times larger compared to the previous candles". Compare real body to the previous 3 candles minimum (bullish momentum section: "I recommend that you measure at least three candles"; bearish: "even better if ... more than twice the size than maybe the previous four candles or even the previous five candles"). Preferably 3x, 4x or 5x ("then we are talking about a very strong momentum candle").
- Pseudocode: momentum = abs(close-open) >= 2 * max(abs(close-open) of prior N bars), N>=3 (3 to 5); strong = ratio >=3.
- Wiggle-room rule (every pattern): "I also leave some wiggle room" - stop is placed a small buffer beyond the structural level (buffer size never specified numerically; implement as a parameter e.g. 0.1-0.25 ATR or a few ticks).

### 2.2 Classification (use as schema)
- complexity: simple (1 candle) | complex (2+ candles)
- direction: bullish | bearish | neutral
- type: reversal | continuation
- "if you just see a Candlestick pattern appearing randomly on the chart it doesn't actually mean a lot the context or in other words where on the chart the patterns appear is very important".
- Candlestick patterns can be used "on any time frame".

### 2.3 Universal trade template (stated per pattern)
- Entry: "the most common entry point is to enter when the candle closes" (pattern's last candle close). Optional: wait for a confirmation candle (esp. inverted hammer, hanging man).
- Stop: beyond the lowest low (long) / highest high (short) of the pattern, "and if the red candle has a lower Wick we usually set the stop loss below that Wick". If a clear S/R zone is nearby, place the stop beyond the zone (support area for longs, resistance area for shorts). "I prefer to draw areas rather than sort of lines".
- Target: fixed R:R. "A risk reward ratio of 1 to 2 means that we risk $1 for every $2 in profit"; "2 to one" very common; 3:1 also used. Alternative: just before the next opposing S/R ("place The Target just below the resistance"), or measured move for continuation patterns.
- "when we use a risk reward ratio of 1 to 2 this means that we can actually lose more trades than what we win and still make money".
- "respect your stop-loss and exit the trade without any hesitation".

### 2.4 Reversal patterns (exact definitions)
1. Bullish engulfing (complex, bullish reversal). Prior downtrend. Candle1 red, preferably small body (wicks unimportant). Candle2 green: "needs to open below the close of the red one" and "close above the open of the red candle". Crypto/24h markets where open = previous close: just require green candle close above the red candle's open/body ("a Candlestick that closes above the previous red one"). Entry: green candle close. Stop: below lowest point of pattern (incl. red candle's lower wick), below nearby double-bottom/support with wiggle room. Target 1:2 (risk 1 : reward 2). Stronger at support / double bottom.
2. Bearish engulfing (complex, bearish reversal). Prior uptrend. Candle1 green, small body. Candle2 red "opens above the body of the green candle and closes below the body of the green candle" (wicks may exceed). Entry: red candle close. Stop: above highest point of pattern (above resistance if present). Target 2:1 (reward 2x risk). "more significant when it happens at a resistance level but you can still use the pattern on its own".
3. Hammer (simple, bullish reversal). Prior move down ("a clear move here towards the downside"; "if we are in a move towards the upside ... I would actually not consider this a hammer"). Small real body, lower wick "at least twice the size of the real body and preferably ... three times or even four times", upper wick "very small" or none. Body color green or red (green stronger). Entry: candle close (for red body, enter at the low end of the body = the close). Stop: below the pattern low / below support area (draw broad support area; stop below it, with wiggle room). Target: 2:1 R:R, or just below the next resistance area. A very strong prior drop strengthens the signal. Hammer can sit inside a morning star.
4. Shooting star (simple, bearish reversal). Prior uptrend. Small body, upper wick at least 2x body (longer = better), lower wick none/very small. Body color green or red (red slightly more bearish). Entry: candle close (top of body if green). Stop: above the pattern high (above the resistance if the star poked above resistance - "wof up thrust" = Wyckoff upthrust, "very strong reversal signals"). Target 2:1. Needs a clear prior upmove; a shooting-star-like candle in sideways price is unreliable ("this would have been a losing trade").
5. Morning star (complex, 3 candles, bullish reversal). Prior downtrend. C1 strong red; C2 small real body (can have long wicks, can be a hammer), with a GAP between C1 close and C2 body; C3 strong green with a gap between C2 body and C3 body ("a gap between the real bodies"), and C3 closes above the 50% midpoint of C1's body ("when the green candle closes above the 50% Mark the Morning Star pattern is confirmed"). Entry: C3 close. Stop: below lowest point of pattern (+wiggle room) when no clear support. Target 2:1 or just below prior resistance.
6. Evening star (complex, 3 candles, bearish reversal). Prior uptrend. C1 strong green long body; C2 small real body or doji (red slightly more bearish) with gap above C1 body; C3 strong red with gap between C2 body and C3 body and closing below the 50% point of C1 body. Entry: C3 close. Stop: above pattern high + wiggle room. Target: 2:1 or 3:1.
7. Piercing pattern (complex, 2 candles, bullish reversal). Prior downtrend. C1 red (strong or medium, wicks ok). C2 strong green; confirmation: C2 "close above this 50% line" of C1 body. If C2 closes above C1's open it becomes a bullish engulfing instead ("early stage of a bullish engulfing"). Entry: C2 close. Stop: below the lowest point of the pattern (below long lower wick) + wiggle room; consider prior market structure / divergence. Target: R:R 2.
8. Dark cloud cover (complex, 2 candles, bearish reversal). Prior uptrend. C1 strong or medium green continuing the uptrend; C2 strong red closing below the 50% midpoint of C1 body. Entry: C2 close. Stop options: (a) above the pattern's highest point (wide), (b) "above the candle close of the pattern" i.e. above the real body of the big second candle if the wick is huge (tighter). Target: R:R 2:1 applied to whichever stop is chosen (wider stop = further target).
9. Inverted hammer (simple, bullish reversal). Prior downtrend (context essential). Small body, upper wick >= 2x body (example ~4x). Same shape as shooting star; only the prior downtrend differs. Two entries: (a) candle close of the pattern (tight stop, quick 2R target), (b) after a confirmation bullish candle (wider stop/target). "In my opinion waiting for a confirmation candle ... is not a bad idea because this pattern is slightly less bullish compared to ... the hammer". Stop: below the lowest point of the candle(s) before/at the pattern (below prior wick) + wiggle room. Target: 2:1 or just below a gap-fill resistance ("price gaps tends to be filled so the highest point of the Gap here can actually act as resistance").
10. Hanging man (simple, bearish reversal). Prior uptrend. Same shape as hammer: small body, lower wick >= 2x body. Prefer red body ("if we see a green body it's very possible that this move is just a continuation"). Prefer a green candle right before. Entry: pattern close, or wait for confirmation candle that "at least closes lower than the hanging man" (e.g., a gap-down). Stop: above the nearby resistance/high area. Target: 2:1 (more likely win) or 3:1 (less likely, bigger win).

### 2.5 Continuation patterns
11. Rising three methods (complex, 5 candles, bullish continuation). Prior uptrend. C1 strong bullish. C2-C4: three small bearish candles whose REAL BODIES are contained within C1's range (high-low of C1; "preferably at least the real bodies"); wicks may exceed. C5 strong bullish closing above C1's close ("close above the close of the first candle"). Entry: C5 close (no confirmation needed). Stop: below the lowest point of the whole pattern + wiggle room (lowest point may come from C1). Target: fixed 2:1, or 100% measured move (length of impulse before the pattern projected from pattern).
12. Falling three methods (complex, 5 candles, bearish continuation). Mirror: C1 large/medium red; C2-C4 three small candles (can include spinning tops) with bodies inside C1's high-low range; C5 strong red closing below C1's close. Entry: C5 close. Stop: above the highest point of the pattern. Target: 2x risk, or measured move (whole impulse down copied from the pattern high).
13. Bullish momentum candle (simple, bullish continuation, can also reverse). Preferably prior uptrend then consolidation (sideways, slightly up or slightly down). Strong green candle with body >= 2x the bodies of the previous >=3 candles; shorter upper wick preferred. Entry: momentum candle close (confirmation optional; speaker prefers immediate entry). Stop: below recent low / market structure (example: ascending triangle -> below most recent higher low) + wiggle room. Target: 2:1 or measured pattern height (triangle height from breakout).
14. Bearish momentum candle (simple, bearish continuation, can reverse). Preferably prior downtrend, then >=3 small-body candles, then a strong red candle with body >= 2x (ideally 3-4x) the previous 3-5 candles. Entry: momentum candle close. Stop options: above the momentum candle high; above range resistance (wide); or above the previous support that flips to resistance (tighter). Target: 2:1, or measured range height projected from the breakout.
15. Bull flag (complex, bullish continuation). Prior uptrend. C1 green strong or medium. Then multiple small candles (red preferred, mix allowed) drifting down or sideways with small real bodies. Last candle green, at least medium size, closing above the OPEN of the last pullback candle ("close above this point"). Entry: that green candle close. Stop: below the lowest point of the flag + wiggle room. Targets: prior high of the uptrend (take partial or full profits), and/or measured move (impulse low-to-high copied from the flag low); some traders take partial at the first and rest at the measured move.
16. Bear flag (complex, bearish continuation). Prior downtrend (lower highs, lower lows). C1 red strong/medium. Then >=3 small-body candles (red, green or doji) going against the trend. Last candle relatively strong red, medium body at least, closing below the OPEN of the last pullback candle. Entry: that red candle close. Stop: above the highest point of the pattern. Target: nearby prior low only if enough distance; else 100% measured move (swing high to swing low before the pattern, copied from the pattern).
17. Bullish runaway gap (continuation). Prior uptrend. "True gap": no overlap of even the wicks between consecutive candles (gap of bodies only does not count; true gaps are "a more rare signal"). Confirms at the OPEN of the candle after the gap (not at a close). Entry: open after the gap. Stop: below the lowest point of the gap (allows a gap fill retest) . Target: 2:1 or 3:1 R:R.
18. Bearish runaway gap (continuation). Prior downtrend; true gap down; avoid very small gaps ("we definitely prefer to see larger gaps"). Entry: open of candle after the gap. Stop: just above the highest point of the gap + wiggle room. Target 2:1 or 3:1.

### 2.6 Doji and spinning tops (indecision family)
- Doji = open and close at (almost) the same level; "it is okay for a doji candle to have a very very slight real body".
- Types: classic doji (middle, neutral); long-legged doji (long wicks; body higher = more bullish, lower = more bearish); dragonfly doji (open/close at the high; bullish, acts like a hammer after a downtrend, little meaning after an uptrend); gravestone doji (open/close at the low; bearish reversal esp. after an uptrend); four-price doji (open=high=low=close; extremely rare; "something we actually don't want to trade").
- Use as WARNING/EXIT signal, not entry: multiple dojis after a momentum move against your position (e.g. in a short, several dojis incl. a dragonfly) = "proceed with caution", consider selling part of the position; "this is not enough justification for a long position and a reversal trade". Example outcome: price went to a trading range, neither reversal nor continuation.
- Spinning top = like doji but larger body allowed; both upper and lower wick must be larger than the body. If one wick is very short it is really a hammer / shooting star / hanging man depending on context. Meaning: indecision; can be exit signal or reversal depending on context.
- Doji (non-dragonfly/gravestone) at a trend end combined with strong prior trend and support can signal a reversal; "depending on the context of the neutral pattern these patterns can actually also tell us something".

### 2.7 Filters / context rules (all patterns)
- Require a prior move in the opposite direction for reversal patterns (down before bullish, up before bearish) and in the same direction before continuation patterns.
- Patterns are stronger at S/R: bearish at resistance, bullish at support (double bottom, wick-above-resistance upthrust).
- Combine with indicators, market structure and divergence (he references an RSI divergence course).
- Targets can be shortened to just before nearby opposing S/R or an unfilled gap.
- Not all patterns win; losers are expected.

## 3. Strategy specs
```json
{"id":"bullish-engulfing","name":"Bullish Engulfing reversal","market":"stocks|forex|crypto","timeframe":"any (examples daily)","direction":"long","indicators":{"prior_trend":"downtrend into pattern","S_R":"optional support/double bottom"},"entry":"Close of candle2 when candle2 (green) opens below / (crypto: at) red body close and closes above red candle open","stop":"below lowest low of the two candles or below support area, plus wiggle room","target":"2R (reward = 2x risk; speaker states '1 to 2')","filters":["prior downtrend","candle1 small body preferred","stronger at support/double bottom"],"notes":"Crypto allows open == previous close."}
```
```json
{"id":"bearish-engulfing","name":"Bearish Engulfing reversal","market":"stocks|forex|crypto","timeframe":"any","direction":"short","indicators":{"prior_trend":"uptrend"},"entry":"Close of red candle that opens above and closes below the prior small green candle's body","stop":"above highest high of pattern or above resistance + wiggle","target":"2R (2:1)","filters":["prior uptrend","stronger at resistance"],"notes":"Can be used alone or with indicators/structure."}
```
```json
{"id":"hammer","name":"Hammer reversal","market":"any","timeframe":"any","direction":"long","indicators":{"lower_wick_min_multiple_of_body":2,"preferred_multiple":"3-4","upper_wick":"none/very small","body_color":"green preferred, red valid"},"entry":"Candle close","stop":"below pattern low or below support area + wiggle room","target":"2R or just below next resistance","filters":["clear prior downmove","stronger after sharp drop","at support"],"notes":"Same candle is hanging man after an uptrend."}
```
```json
{"id":"shooting-star","name":"Shooting Star reversal","market":"any","timeframe":"any","direction":"short","indicators":{"upper_wick_min_multiple_of_body":2,"lower_wick":"none/very small"},"entry":"Candle close","stop":"above pattern high (above resistance if upthrust)","target":"2R","filters":["clear prior uptrend (not sideways)","stronger at resistance / Wyckoff upthrust"],"notes":"Body color irrelevant; red slightly more bearish."}
```
```json
{"id":"morning-star","name":"Morning Star (3-candle bullish reversal)","market":"any","timeframe":"any","direction":"long","indicators":{"c1":"strong red","c2":"small body, gap down from c1 body","c3":"strong green, gap up from c2 body, close > 50% of c1 body"},"entry":"C3 close","stop":"below lowest low of pattern + wiggle (or below support)","target":"2R or just below prior resistance","filters":["prior downtrend"],"notes":"C2 may be a hammer; gap = between bodies."}
```
```json
{"id":"evening-star","name":"Evening Star (3-candle bearish reversal)","market":"any","timeframe":"any","direction":"short","indicators":{"c1":"strong green long body","c2":"small body or doji, gap up","c3":"strong red, gap down from c2 body, close < 50% of c1 body"},"entry":"C3 close","stop":"above pattern high + wiggle","target":"2R or 3R","filters":["prior uptrend"],"notes":"C2 on its own can be hanging man."}
```
```json
{"id":"piercing-pattern","name":"Piercing Pattern","market":"any","timeframe":"any","direction":"long","indicators":{"c1":"red strong/medium","c2":"strong green closing above 50% midpoint of c1 body"},"entry":"C2 close","stop":"below lowest point of pattern (below long lower wick) + wiggle","target":"2R","filters":["prior downtrend","check structure/divergence"],"notes":"If c2 closes above c1 open it becomes bullish engulfing."}
```
```json
{"id":"dark-cloud-cover","name":"Dark Cloud Cover","market":"any","timeframe":"any","direction":"short","indicators":{"c1":"strong/medium green continuing uptrend","c2":"strong red closing below 50% midpoint of c1 body"},"entry":"C2 close","stop":"above pattern high (wide) OR above c2 real body/close (tight), + wiggle","target":"2R from chosen stop","filters":["prior uptrend"],"notes":"Wide-wick second candle still valid."}
```
```json
{"id":"inverted-hammer","name":"Inverted Hammer","market":"any","timeframe":"any","direction":"long","indicators":{"upper_wick_min_multiple_of_body":2},"entry":"Pattern close (aggressive) or close of next bullish confirmation candle (conservative)","stop":"below lowest point of candles before/at pattern + wiggle","target":"2R or just below gap-fill resistance","filters":["clear prior downtrend"],"notes":"Same shape as shooting star; context decides."}
```
```json
{"id":"hanging-man","name":"Hanging Man","market":"any","timeframe":"any","direction":"short","indicators":{"lower_wick_min_multiple_of_body":2,"body_color":"red preferred"},"entry":"Pattern close, or after a confirmation candle closing below the hanging man","stop":"above resistance/high area + wiggle","target":"2R or 3R","filters":["clear prior uptrend","green candle before preferred"],"notes":"Same shape as hammer; context decides."}
```
```json
{"id":"rising-three-methods","name":"Rising Three Methods","market":"any","timeframe":"any","direction":"long","indicators":{"c1":"strong bullish","c2_c4":"3 small bearish candles, bodies within c1 high-low","c5":"strong bullish close > c1 close"},"entry":"C5 close","stop":"below lowest point of whole pattern + wiggle","target":"2R or 100% measured move of prior impulse","filters":["prior uptrend"],"notes":"No confirmation needed."}
```
```json
{"id":"falling-three-methods","name":"Falling Three Methods","market":"any","timeframe":"any","direction":"short","indicators":{"c1":"large/medium bearish","c2_c4":"3 small candles, bodies within c1 range","c5":"strong bearish close < c1 close"},"entry":"C5 close","stop":"above highest point of pattern + wiggle","target":"2R or measured move equal to impulse, from pattern high","filters":["prior downtrend"],"notes":""}
```
```json
{"id":"bullish-momentum-candle","name":"Bullish Momentum Candle","market":"any","timeframe":"any","direction":"long","indicators":{"body_multiple_vs_prev":"2 (3-5 ideal)","lookback_candles":"3 minimum (3-5)"},"entry":"Momentum candle close","stop":"below recent swing low / structure (e.g. ascending triangle last higher low) + wiggle","target":"2R or measured triangle/range height from breakout","filters":["uptrend then consolidation preferred","near resistance break"],"notes":"Can also be reversal."}
```
```json
{"id":"bearish-momentum-candle","name":"Bearish Momentum Candle","market":"any","timeframe":"any","direction":"short","indicators":{"body_multiple_vs_prev":"2 (3-4 ideal)","lookback_candles":"3-5"},"entry":"Momentum candle close","stop":"above momentum candle high, or above range resistance, or above flipped support","target":"2R or measured range height from breakout","filters":["downtrend preferred; range break ok"],"notes":""}
```
```json
{"id":"bull-flag","name":"Bull Flag","market":"any","timeframe":"any","direction":"long","indicators":{"c1":"green medium/strong","flag":"multiple small-body candles drifting down/sideways","trigger":"green medium+ candle closing above open of last flag candle"},"entry":"Trigger candle close","stop":"below lowest point of flag + wiggle","target":"prior high (partial/full) and/or measured move from flag low","filters":["prior uptrend"],"notes":"Real patterns are imperfect."}
```
```json
{"id":"bear-flag","name":"Bear Flag","market":"any","timeframe":"any","direction":"short","indicators":{"c1":"red medium/strong","flag":">=3 small-body candles against trend","trigger":"medium+ red closing below open of last flag candle"},"entry":"Trigger candle close","stop":"above highest point of pattern","target":"100% measured move of prior swing high->low","filters":["prior downtrend with lower highs/lows"],"notes":"Nearby prior low as target only if distance large enough."}
```
```json
{"id":"bullish-runaway-gap","name":"Bullish Runaway Gap","market":"any","timeframe":"any","direction":"long","indicators":{"gap":"true gap, wicks do not touch"},"entry":"Open of candle after gap","stop":"below lowest point of gap","target":"2R or 3R","filters":["prior uptrend"],"notes":"Confirms at open, not close."}
```
```json
{"id":"bearish-runaway-gap","name":"Bearish Runaway Gap","market":"any","timeframe":"any","direction":"short","indicators":{"gap":"true gap, wicks do not touch, prefer larger gaps"},"entry":"Open of candle after gap","stop":"above highest point of gap + wiggle","target":"2R or 3R","filters":["prior downtrend"],"notes":""}
```
```json
{"id":"doji-spinning-top-warning","name":"Doji / Spinning Top indecision exit warning","market":"any","timeframe":"any","direction":"both","indicators":{"doji":"|close-open| ~ 0","spinning_top":"both wicks > body"},"entry":"Not an entry; dragonfly after downtrend can act like hammer, gravestone after uptrend bearish reversal","stop":"n/a","target":"n/a","filters":["multiple dojis against an open position = reduce/exit or proceed with caution"],"notes":"Four-price doji: avoid trading."}
```

## 4. Risk and psychology rules
- R:R based planning: "plan out your trade set your you know stop loss and set your Target and stick to your plan".
- Accept losers: "not all patterns will be successful some patterns will fail and then it's very important to respect your stop-loss and exit the trade without any hesitation".
- With 1:2 R:R "we can actually lose more trades than what we win and still make money".
- Lower R:R = higher win probability; higher R:R (1:3) = lower win probability, larger wins.
- No explicit risk-% per trade, daily loss limit, drawdown rule, or journaling rule is given in this course.
- Patterns in real markets are imperfect; trader must trade "regardless" of non-textbook shapes (implies need for tolerance parameters).

## 5. Tools, repos, apps, APIs mentioned
- TradingView (charting; choose timeframe). Not described in detail in this course.
- Other courses by the same channel referenced (support & resistance course, RSI indicator course, market structure course, chart pattern course); no URLs given.
- No code, repos, or API commands.

## 6. Claims to treat with caution
- "by watching the full course you will ... gain the edge to profit in both Bull and bar markets" (marketing claim, no evidence).
- Bull flag called "one of the best Candlestick patterns out there ... appears super frequently ... reliable pattern" (unquantified).
- Chart examples are hand-picked ("one of my personal favorite patterns", "perfect example"); no backtest statistics, win rates, or sample sizes are given anywhere.
- "reversal Candlestick patterns are one of the most effective Candlestick types" (unquantified).
