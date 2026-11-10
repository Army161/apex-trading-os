# 07 Trading Strategies: Build Your Own - notes
Source: /home/claude/apex/archive/uploads/07-trading-strategies-build-your-own.md (read in full, 0-70852 chars)

## 1. Summary
Course teaching the "four pillars" framework for building any trading strategy: (1) Level (area of interest: S/R zones, supply/demand, order blocks, liquidity, trend lines, chart patterns, moving averages), (2) Trigger (specific repeatable event: candlestick pattern, breakout, failure test/false breakout, breakout-retest), (3) Confirmation (second agreeing signal: RSI divergence, MACD, volume, other timeframe, order flow), (4) Risk management (position sizing 1-2%, stop, target). Defines a strategy as written rules answering where, when, how much. Teaches breakouts vs false breakouts, the failure test (stop-hunt trap logic with smart money narrative), RSI basics (default 14, 0-100, 70/30 not to be used as buy/sell) and bullish/bearish RSI divergence, confluence, then walks a full worked example on Google (GOOGL) 4h: all-time-high resistance zone + bearish failure test + bearish RSI divergence, short at the close, stop above the wick high, 2:1 target. Ends with advice on backtesting, forward testing, paper trading, journaling and changing one variable at a time.

## 2. Codifiable rules
- Strategy definition: "a fixed set of rules for entering and exiting a trade"; must answer where, when (enter and exit) and how much. "If you have a trading strategy that you cannot write down... with simple rules then it's not a full trading strategy yet."
- Pillars: Level -> Trigger -> Confirmation -> Risk management. All four needed.
- Levels: draw as zones (rectangles), "not perfect lines"; include the most important touches; "the market has memory"; all-time highs are extra important ("so many traders are paying attention"); two prints at nearly the same level at an ATH = level to pay attention to. Do nothing until price reaches a key level.
- Breakout definition: "the price clearly closes beyond a support or resistance level" (candle close, not wick). Stronger if: more volume; closes far beyond the level; momentum candle ("at least twice the size of the previous three candles"). "A real breakout holds and continues." "Many cleanlooking breakouts will actually fail and trap the traders who chase them."
- False breakout / failure test: "the price breaks a level briefly and then closes back inside the range or inside the level." Bullish failure test = false breakout below support then close back above; bearish = false breakout above resistance then close back below. Favoured form: pierce level and close back inside with a reversal candle (hammer at support / shooting star at resistance).
- Trigger must be "very specific" and "repeatable".
- Confirmation example: "without the confirmation... 55% win rate... with the confirmation... 55 to 62%" (illustrative numbers). Common confirmations: RSI divergence, MACD / MACD divergence, volume, other timeframes, order flow. "Two clues pointing in the same direction is stronger."
- RSI: "relative strength index"; scale 0-100; "default setting is to use 14 periods"; above 70 "overbought", below 30 "oversold" - but "a very common mistake... see RSI between 70 and 100 as a sell signal... never how you should use RSI". Settings in demo: standard RSI, uncheck the RSI-based moving average; no other changes.
- Bullish RSI divergence: price prints a lower low while RSI prints a higher low (compare lows only). Bearish RSI divergence: price prints a higher high (or equal/slightly higher highs) while RSI prints a lower high (compare highs only). Meaning: "current move is losing momentum"; potential reversal.
- Confluence: two or more signals aligned. Demo had three: level + failure test + bearish RSI divergence.
- Entry (failure test short): "enter at the candle close of the candle that you know briefly broke above resistance and then closed below."
- Stop: "just above the highest point of the... green candle... leave some space for some wiggle room."
- Target: "around a 2:1 risk-to-reward ratio... even if we have a let's say 50% win rate, we will still make money over time."
- Position size: "risk a small fixed percent of your account per trade... in the beginning around 1 to 2%"; "use your stop-loss to calculate the size"; "risk the same small amount for every single trade". Every trade needs a stop and a target.
- Drawdown math: 50% loss needs 100% gain ($1,000 -> $500 -> $1,000).
- Alternative triggers: engulfing (favourite), hammer, shooting star, breakout-retest (break level, then retest old resistance as support, ideally with candle pattern), liquidity sweep/grab, bear flag break (bear flag = impulsive down, pullback up, break of lower support -> continuation short; shown on BTC daily in replay).
- Testing: backtest (TradingView or other), forward test, paper trade ("fake money... inside Trading View"), journal every trade (setup, result, emotions), require "positive expected value", "refine one thing or one rule or one pillar at a time".
- Timeframes seen: GOOGL 4h (main), BTC daily (levels and bear flag). Works "for stocks, crypto, forex or any other financial market".

## 3. Strategy specs
```json
{
  "id": "failure-test-rsi-divergence",
  "name": "Failure test (false breakout) with RSI divergence confirmation",
  "market": "Any liquid market (demo: GOOGL stock, 4h; stated valid for stocks, crypto, forex)",
  "timeframe": "4h (demo); not restricted",
  "direction": "both",
  "indicators": {
    "RSI": {"length": 14, "source": "close (default)", "rsi_ma": "off", "overbought_oversold": "70/30 NOT used as signals"},
    "levels": "S/R zones as rectangles, esp. all-time high / multi-touch zones",
    "volume": "optional extra confirmation (recommended)"
  },
  "entry": "Short (bearish): price wicks/closes above a marked resistance zone then the candle closes back below it; enter at that candle's close, with bearish RSI divergence present (higher/equal price high vs lower RSI high). Long (bullish): price pierces support, candle closes back above; bullish RSI divergence (lower price low vs higher RSI low); enter at candle close.",
  "stop": "Short: just above the highest point of the breakout candle (small buffer). Long: just below the lowest point of the false-breakout candle.",
  "target": "2:1 risk-to-reward (fixed).",
  "filters": [
    "Level must be clearly visible/important (ATH, multiple touches)",
    "Trigger = brief break then close back inside the zone",
    "RSI divergence compares only highs (bearish) or only lows (bullish)",
    "Risk 1-2% of account per trade, size = risk$ / stop distance"
  ],
  "notes": "Speaker says it can be improved with market structure and price action; no backtest or win-rate evidence given; also says a 50% win rate is profitable at 2:1."
}
```
```json
{
  "id": "breakout-momentum-volume",
  "name": "Real breakout continuation (close beyond level, momentum candle, high volume)",
  "market": "Any",
  "timeframe": "any",
  "direction": "both",
  "indicators": {"momentum_candle": {"body_multiple": 2, "lookback_candles": 3}, "volume": "high relative volume"},
  "entry": "On a candle close clearly beyond the level (breakout candle).",
  "stop": "Not specified in this course (inside/back across the level is the logical invalidation; the failure-test stop logic mirrors it).",
  "target": "Not specified (2:1 default framework).",
  "filters": ["Candle closes far beyond level", "Volume high", "Momentum candle"],
  "notes": "Presented as the 'real breakout' counterpart to the failure test; warning that many breakouts fail."
}
```
```json
{
  "id": "breakout-retest-candle",
  "name": "Breakout retest with candlestick trigger",
  "market": "Any",
  "timeframe": "any",
  "direction": "both",
  "indicators": {},
  "entry": "After a level breaks, enter when price retests the old resistance as support (or vice versa) and prints a candlestick pattern.",
  "stop": "Not specified.",
  "target": "Not specified.",
  "filters": ["Candlestick pattern at the retest"],
  "notes": "Listed only as an alternative trigger; low specificity."
}
```
```json
{
  "id": "bear-flag-breakdown",
  "name": "Bear flag breakdown short",
  "market": "Any (demo: BTC daily)",
  "timeframe": "1D (demo)",
  "direction": "short",
  "indicators": {},
  "entry": "After an impulsive down move and an upward-sloping pullback, enter when price breaks below the flag's lower support.",
  "stop": "Not specified.",
  "target": "Not specified.",
  "filters": [],
  "notes": "Shown in TradingView replay as an example trigger; low specificity."
}
```
```json
{
  "id": "bullish-bearish-rsi-divergence-confirmation",
  "name": "RSI divergence confirmation filter",
  "market": "Any",
  "timeframe": "any",
  "direction": "both",
  "indicators": {"RSI": {"length": 14}},
  "entry": "Filter, not an entry by itself.",
  "stop": "n/a",
  "target": "n/a",
  "filters": ["Bullish: price lower low + RSI higher low", "Bearish: price higher high + RSI lower high"],
  "notes": "Algorithm needs pivot detection parameters (not given; choose and document them)."
}
```

## 4. Risk and psychology rules
- Risk 1-2% of account per trade; same small amount every trade; size from the stop distance.
- Every trade has a predefined stop and target; protect downside over maximising upside.
- Rules exist to defeat "fear, greed, FOMO... revenge"; follow rules regardless of feeling.
- Journal every trade: date, instrument, P&L, setup name, emotion ("how you feel"), notes; review dashboard to see how emotions affect results.
- Change one rule/pillar at a time when refining; keep a positive expected value.
- Backtest -> forward test -> paper trade before risking real money.
- No explicit max drawdown, daily loss limit or cooldown numbers.

## 5. Tools, repos, apps, APIs mentioned
- TradingView (charts, replay mode, rectangle tool, short/long position tool, RSI built-in under "Technicals", community scripts e.g. RSI with candles, automatic RSI divergence; paper trading; affiliate 30-day Premium + $15 bonus).
- MindMath trading toolkit (paid channel membership, gold tier+, mindmathmoney.com members area): position size calculator, expected value, drawdown recovery tool, trading journal with emotion field.
- Speaker's paid TradingView indicator: Momentum Candles (Diamond tier+).
- Referenced separate courses by the speaker: candlestick patterns, chart patterns, market structure, price action, volume, RSI, MACD, order flow, risk management, paper trading.
- No commands/APIs.

## 6. Claims to treat with caution
- "a very good trading strategy you might have a win rate with 60%. Or maybe even 70%" (generic, unsourced).
- "55% win rate... goes from 55 to 62%" with confirmation - explicitly an illustrative example.
- "even if we have a let's say 50% win rate, we will still make money over time with this strategy" (true only with true 2:1 and no costs; no backtest shown).
- Failure test demo on GOOGL: "textbook example"; "locked in some very nice profit" - one cherry-picked chart, no statistics.
- Smart-money / stop-hunt explanation ("traders with lots of money... manipulate markets") is narrative, not evidence.
- Bitcoin chart commentary (bounce at $60,000, "February this year" crash) is dated and unforecast.
