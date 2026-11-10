# Notes: 10-order-flow-course (Order flow trading: footprint, CVD, volume profile; TradingView, Bitcoin examples)

## 1. Summary
The course teaches order flow: looking "inside a candlestick" to see the buyer/seller battle rather than just the result. It builds from auction theory (fair value, balanced vs imbalanced markets, value area ~70% of volume, point of control = price with most volume) through order types (market takes liquidity, limit adds liquidity, stop triggers at worse price), the order book / depth of market, and manipulation (spoofing, iceberg orders, layering, OTC, dark pools, hedgers/arbitrageurs with no directional intent) to argue that live order books mislead. Three tools are then covered: (1) Volume footprint (buy/sell market-order volume per price inside each candle, delta, POC, value area, diagonal 3x imbalances, stacked imbalances), including a simple POC-cluster support strategy and absorption vs initiation reading; (2) Cumulative Volume Delta (CVD) divergences (regular and hidden) with price; (3) Volume profile (POC, value area, HVN = acceptance/magnet, LVN = rejection/fast movement). Summary rule: "when price and delta agree, the move is stronger. When they diverge, it's weaker." The speaker insists order flow should be combined with market structure and price action. Entries/stops/targets are only described loosely.

## 2. Codifiable rules
Definitions
- Delta = buy volume - sell volume (market orders). Positive delta = buyers in control. Per price level: left (red) = sell market orders, right (green) = buy market orders. Candle total delta = sum of per-level delta (example: "1.4,000 bullish delta" [1.4k]).
- POC: "the exact price level where the most volume got traded" (in a candle footprint = black bar; in profile = tallest bar).
- Value area (VA): "range where about 70% of the trading took place" (VAH/VAL bounds); "one standard deviation".
- Footprint imbalance: "one side trades three times or more than the other side" (ratio >= 3). Compare diagonally: buy imbalance = ask(buy) volume at price P vs bid(sell) volume at the price one tick BELOW (buy side is "one step above the sell side"); examples: 304 vs 87 (>3x) is imbalance; 104 vs 88 is not. Sell imbalance compares sell volume at P to buy volume one level above/diagonal opposite (examples: 87 vs 0, 543 vs 157). Zero counts (45 vs 0 and 45 vs 14 are imbalances). Stacked imbalances = multiple consecutive imbalances.
- Absorption: "price moves in the opposite direction of the imbalance... sign of a potential reversal" ("absorption means reversal or weakness").
  - Bullish absorption: selling imbalances in the candle, but price closes higher (often hammer-like, red/lower-wick candle).
  - Bearish absorption: buying imbalances but candle closes lower.
- Initiation: "price moves in the same direction or with the imbalance... continuation and strength".
  - Bullish initiation: buying imbalances and candle closes above the imbalances (green candle).
  - Bearish initiation: selling imbalances and candle closes below them.
- Best use: absorption/initiation combined with support/resistance or demand zones: e.g. downtrend into support -> bullish absorption -> bullish initiation candle = entry confluence.
- CVD divergences (price vs CVD):
  - Bearish (buying exhaustion): price higher highs, CVD lower highs -> reversal down.
  - Bullish (selling exhaustion): price lower lows, CVD higher lows -> reversal up.
  - Hidden bearish: price lower highs, CVD higher highs -> bearish continuation.
  - Hidden bullish: price higher lows, CVD lower lows -> bullish continuation.
  - Agreement: "when price and delta agree, the move is stronger. When they diverge, it's weaker."
- Volume profile: HVN = tall bars = "areas of acceptance", "can often act as magnets... not strict support and resistance". LVN = short bars = "areas of rejection", price "tend to move through these... very quickly" (use for breakout trades / fast-move zones). Price moves slower through POC/value area.
- Order books: deep market = many resting orders, stable; shallow = fewer orders, large players move easily. "price rises when aggressive buyers clear the sell orders."
- Order-type rule: for a long, limit (target) above entry, stop below; for a short, limit below, stop above. "the limit is better, the stop is worse."

TradingView setup
- Footprint: Chart type "Candles" dropdown -> "Volume footprint" (may need Premium). Settings: type = "Buy and sell" (not "Delta"). Footprint shown on daily Bitcoin too.
- CVD: Indicators -> search "CVD"; speaker prefers community "Cumulative Delta Volume" by LonesomeTheBlueWolf (approx 8.8k boosts at recording) over built-in "Cumulative Volume Delta"; settings -> display style "Line" (instead of candles), thicker line.
- Volume profile: Indicators -> "Volume Profile"; Visible Range Volume Profile (changes with zoom), Fixed Range Volume Profile (click two points to set range). POC shown as red line.
- Markets: crypto and stocks best; forex footprint data "a little bit more unclear".

## 3. Strategy specs
```json
{"id":"footprint-poc-cluster-support","name":"Footprint POC cluster support bounce","market":"crypto/stocks (BTC daily example)","timeframe":"daily footprint for zone; lower TF for entry","direction":"long (mirror short at resistance)","indicators":{"volume_footprint":{"type":"buy_and_sell","show":["poc","value_area","delta"]}},"entry":"Find a cluster of several candles whose POCs lie at similar price; draw support rectangle; enter long 'at the first strong reaction from the support level'","stop":"just below the low of the reaction (below support area)","target":"fixed risk-to-reward (speaker shows RR box, no number stated)","filters":["add confluence: bullish absorption or bullish initiation candle at the zone","combine with market structure and price action"],"notes":"Speaker admits one bullish sign is not enough. POC cluster = 'magnets in the future'."}
```
```json
{"id":"absorption-initiation-at-zone","name":"Absorption then initiation at S/R","market":"crypto/stocks","timeframe":"any footprint timeframe","direction":"both","indicators":{"volume_footprint":{"imbalance_ratio":3,"compare":"diagonal"}},"entry":"At support/demand: candle shows bullish absorption (selling imbalances but closes up), then bullish initiation candle (buy imbalances, closes above them) -> long. Mirror at resistance with bearish absorption then bearish initiation.","stop":"beyond zone / absorption candle extreme (not stated precisely)","target":"not stated","filters":["must occur at identified S/R, POC cluster or HVN level","price action/market structure alignment"],"notes":"Imbalance ratio 3x diagonal."}
```
```json
{"id":"cvd-divergence-reversal","name":"CVD vs price divergence","market":"crypto (BTC), stocks","timeframe":"any (BTC examples shown on swing/higher TF)","direction":"both","indicators":{"cvd":{"style":"line","source":"Cumulative Delta Volume (LonesomeTheBlueWolf)"}},"entry":"Bearish: price HH while CVD LH -> short bias. Bullish: price LL while CVD HL -> long bias. Hidden divergences = trend continuation.","stop":"not stated","target":"not stated","filters":["use with S/R, structure, footprint confirmation","no divergence at a low = less bullish evidence"],"notes":"Speaker shows two BTC examples where reversal followed; no entry mechanics given."}
```
```json
{"id":"volume-profile-lvn-hvn","name":"Volume profile HVN magnet / LVN fast-move","market":"crypto/stocks","timeframe":"fixed-range on impulse moves","direction":"both","indicators":{"volume_profile":{"mode":"fixed_range or visible_range","value_area_pct":70}},"entry":"Treat POC/HVN as likely support/resistance/magnets (bounces); expect rapid price travel through LVN gaps (breakout/target extension).","stop":"not stated","target":"next HVN/POC (implied)","filters":["HVN not strict S/R"],"notes":"BTC example: profile POC matched footprint-derived support; three bounces."}
```

## 4. Risk and psychology rules
- None numeric. Notes: practise the concepts; combine order flow with structure and price action; one confluence not enough; do not read every book order as directional (hedgers, arbitrage, OTC, dark pools, spoofing, icebergs, layering make live DOM misleading).
- Speaker mentions risk-reward box but no % risk, loss limits, or cooldowns.

## 5. Tools, repos, apps, APIs mentioned
- TradingView (Premium needed for footprint possibly; speaker's affiliate: 30 days free + $15 bonus). Footprint chart type, Fixed Range Volume Profile, Visible Range Volume Profile, "Cumulative Delta Volume" community script by LonesomeTheBlueWolf, built-in Cumulative Volume Delta, rectangle tool, long position tool.
- YouTube channel membership (gold/diamond) for slides/images; speaker's courses: market structure, price action, MACD, shorting, arbitrage. No code/commands/APIs.
- Implementation note for a platform: footprint/CVD require tick or aggressor-side trade data (e.g. crypto exchange trade feeds); not derivable from OHLCV alone.

## 6. Claims to treat with caution
- "you now know more than 99% of traders when it comes to orderflow trading."
- "order flow... you can use it to find out what actually happened inside a candlestick and as a result take better trading decisions... make more money" (no stats).
- Bitcoin examples (bounce after "massive crash", "three bounces right here on the volume profile") are hand-picked hindsight; no win rates or backtests given.
- 70% value area attributed to one standard deviation (approximation, TPO/volume profile convention).
- Speaker is unsure whether footprint is free on TradingView.
