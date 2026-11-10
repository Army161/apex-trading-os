# 11 - Trading for Beginners (Mind Math Money) - Notes

Source: /home/claude/apex/archive/uploads/11-trading-for-beginners.md (fully read, ~79.7k chars). Beginner full course using TradingView, gold (XAUUSD) daily as the demo chart. Content is conceptual; very few exact indicator numbers.

## 1. Summary
A free beginner course that frames trading as "a decision making skill" (buy, sell, or do nothing) and "managing risk and not predicting the future". Every trade follows three steps: find a market setup, plan the trade (entry, stop, target), then execute and review (trade management, psychology, journaling). It teaches candlestick anatomy (open/high/low/close, bullish/bearish), timeframes as a "magnifying glass", and market structure: uptrend = higher highs AND higher lows, downtrend = lower highs AND lower lows, everything else = sideways (ranges, triangles). Support and resistance are drawn as zones (rectangles), only the obvious ones; breakouts of key zones are tradeable. Order types (market, limit, stop / stop-loss) are explained with TradingView paper-trading demos. Risk management (fixed % risk per trade, position sizing from stop distance), expected value (win rate x payoff) and psychology (fear, FOMO, discipline) are covered. It ends with one simple strategy: trade with the trend, buy pullbacks / chart-pattern breakouts (ascending triangle example), stop below most recent low, 2R target, and practise via backtest + demo before real money.

## 2. Codifiable rules
Quote-backed rules:
- Trade definition: "every trade must include these four points": entry price, stop-loss, target, position size. "if any of these steps are missing then it's not a trade. Then you are actually gambling." "you always need to set a stop-loss."
- Three-step framework: find a market setup -> plan (entry, stop, target) -> execute + review.
- Third option is to do nothing: "you need to be able to wait and wait and wait until your setup and your trading strategy actually appears".
- Uptrend: "we need to have both higher highs and higher lows to have an uptrend." Example of non-uptrend: highs rising but lows "all on the same level".
- Downtrend: "we need to have both lower highs and lower lows".
- Sideways: "all the market conditions that are not an uptrend or a downtrend we count as a sideways market." Includes ranges between support/resistance, symmetrical triangles (lower highs + higher lows), irregular chop.
- Trend filter: "you should start by analyzing the trend ... This basically filters out the bad trades." Some strategies only work in uptrends, some only in sideways.
- Trend loses status when it stops printing HH/HL (or LH/LL), but breaking one swing does NOT automatically mean opposite trend; it becomes sideways first.
- Trends are "built on impulsive moves and pullbacks".
- Support/resistance as zones: "I really like to look at support and resistance more as areas or zones rather than lines." Draw with rectangle tool capturing all touches.
- Obvious-only filter: "if the level is not obvious, ignore the level." "most levels, especially for beginners, should be ignored."
- Resistance can break: "we can both trade the reaction to the support and resistance but we can also trade the break of support and resistance."
- Breakout of multi-touch resistance (examples: 4+ touches; multi-year range Aug 2020 - Feb 2024 on gold) preceded big rallies.
- Order types: market (current price), limit (better price: buy limit below price, sell limit above price), stop (worse price/confirmation: buy stop above price, sell stop / stop-loss below price).
- Ascending triangle: "you don't want to trade this pattern until we see a breakout." Pattern stronger "if it appears after a move to the upside."
- Entry: "the most common way to enter is to enter at the candle close of the breakout."
- Stop: "below the most recent low before the breakout" (ascending triangle).
- Target: "risk-to-reward ratio of two, meaning that the target is ... twice the size as the stop-loss".
- Position sizing: "a good strategy for beginners is to risk a certain percent per trade ... beginners can begin here with as small as 0.5 to 1%." "the wider we have our stop loss, the less the position size can actually be."
- Position-size worked example: account 10,000, risk 1% = $100, entry 100, stop 90 -> 10 units; stop 80 -> 5 units. Formula implied: units = (account * risk%) / |entry - stop|. Calculator supports commission and slippage settings.
- Expected value: EV per trade = winRate*avgWin - (1-winRate)*avgLoss. Breakeven win rate = 1/(1+R). Examples: 45% win, win $200 / lose $100 -> EV +$35/trade (=$3,500 per 100 trades) before costs; 30% win -> negative (-$1,000 per 100 trades); breakeven 33.3% at 2R. "If you have a negative expected value this is a trading strategy that you should never use".
- Asset choice for beginners: bigger stocks / large cryptos (BTC) because "larger ... tend to move not as wild" (lower volatility).
- Practice: "back test your setup on chart and trade it on a demo account" before real money. "do not rush in with real money".
- Learn price action and market structure before indicators.

## 3. Strategy specs
```json
{"id":"trend-pullback-key-level-beginner","name":"Beginner trend-following pullback to key level","market":"stocks / large crypto (BTC) / gold; any","timeframe":"daily demonstrated (any)","direction":"long","indicators":{"none":"pure price action: swing highs/lows, S/R zones"},"entry":"After identifying a clear uptrend (HH+HL), wait for a pullback into an obvious support zone / key level or a clear chart pattern; enter at confirmation (candle close).","stop":"Below the pullback low / support zone (defined before entry).","target":"Logical target; default 2R (target distance = 2x stop distance).","filters":["Trade only in direction of the trend","Only obvious S/R levels","Define entry, stop, target and size before entering"],"notes":"Speaker says beginners should 'trade in the trend direction... trade pullbacks'. Mirror for shorts in downtrend is implied but not demonstrated."}
```
```json
{"id":"ascending-triangle-breakout","name":"Ascending triangle breakout (gold daily example)","market":"gold XAUUSD (any)","timeframe":"daily","direction":"long","indicators":{"none":"horizontal resistance zone + rising lows (higher lows)"},"entry":"Enter at the candle close of the breakout above the resistance zone (do not trade pattern before breakout).","stop":"Below the most recent low before the breakout.","target":"2R (target twice the stop distance).","filters":["Prior move to the upside before the triangle","Resistance zone with multiple touches","Rising lows into resistance"],"notes":"Demonstrated with TradingView replay mode and long position tool. Speaker refers to separate price-action course for breakout quality rules."}
```
```json
{"id":"sr-zone-breakout","name":"Key support/resistance zone breakout","market":"any (gold example)","timeframe":"daily","direction":"both","indicators":{"zones":"rectangle drawn over all touches; most obvious levels only"},"entry":"Enter on break of an obvious multi-touch zone (e.g. buy stop above resistance, or candle-close confirmation).","stop":"Not specified numerically (on the other side of the zone, by implication).","target":"Not specified; trend continuation.","filters":["Level must be obvious/multi-touch","Trade size by fixed % risk"],"notes":"Described qualitatively: breakout above 2020-2024 gold range started a large move. Short covering fuels the break."}
```

## 4. Risk and psychology rules
- Always set a stop-loss; "risk small". Beginner risk "0.5 to 1%" per trade.
- Position size derived from stop distance (wider stop -> smaller size).
- "in the beginning it's actually more important that you survive than that you profit."
- Losses are "a business expense"; "one trade means nothing and the process means everything"; consistency over intensity.
- Do not remove your stop-loss because of fear; fear and FOMO (jumping in at the top of a pump) and greed (increasing risk after win streaks) are the named failure modes. "a good trade follows the plan and a bad trade breaks the rules."
- Journal every trade: why entered, how it went, win/loss amount, psychology, did you follow the plan. Review after every trade regardless of result.
- Practice first: backtest + paper trade; "focus on learning not on earning"; expect to lose more than you win initially.
- Recommended book: Trading in the Zone (Mark Douglas).
- No explicit max-drawdown, daily-loss or cooldown numbers given.

## 5. Tools, repos, apps, APIs mentioned
- TradingView (charting; paper trading; Replay mode; Long Position / Short Position tools under "forecasting and measurement tools"; rectangle under "geometric shapes"; Trading Panel to connect brokers: OKX, Binance, Bybit, some forex/stock brokers). Speaker's affiliate link claims 30-day Premium trial and $15 bonus on upgrade.
- Bybit (crypto exchange; affiliate bonuses "up to a total of $30,000", "most people will get like $100").
- Avanza (Swedish broker, example only). Suggests asking an LLM (ChatGPT, Gemini, Claude) which broker fits your country.
- mindmathmoney.com members area: Trading Risk Calculator with Position Sizer, Expected Value, Risk of Ruin tabs (paid channel membership). shop.mindmathmoney.com merch (promo code mmmmm10 - not relevant to product).
- Related courses referenced (price action, market structure, chart patterns, TradingView tutorial, trading psychology).
- No commands or code.

## 6. Claims to treat with caution
- "let's say we only have you know 60% chance of being right then we will you know make money" (illustrative only; speaker adds "it's actually a little bit more complicated").
- Worked EV figures are hypothetical: "$35 per trade", "after 100 trades ... $3,500", "minus $1,000" at 30% win rate; "break even win rate 33.3%".
- Gold breakout rallies shown are hindsight chart examples, not backtested statistics.
- "Most of you guys will definitely lose money" (speaker's own warning).
- Bybit "$30,000" bonus is an affiliate marketing claim.
