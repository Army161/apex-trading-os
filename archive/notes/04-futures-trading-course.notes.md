# 04 Futures Trading Course - notes
Source: /home/claude/apex/archive/uploads/04-futures-trading-course.md (MindMath-style free YouTube course; read in full, 0-70715 chars)

## 1. Summary
Beginner-to-intermediate course on futures. Explains what a futures contract is (agreement to buy/sell at a set price on a future date, traded on regulated exchanges like CME), why traders use them (about 23h/day trading, built-in leverage, easy long/short, no overnight gaps vs stocks), and the key tickers (ES, MES, NQ, GC, CL, BTC). The central concept is "dollars per point" (point value) which differs per contract. Covers margin (day-trade vs overnight), brokers/Trading View connection, contract expiry and rollover, continuous contracts (ES1, CL1), regular trading hours (RTH) vs electronic/overnight session (ETH) differences in volatility and volume. Analysis framework: market structure (trend = HH/HL or LH/LL, support/resistance as zones, BOS, CHoCH) plus price action (momentum candles, candlestick patterns, volume). Indicators: volume, volume-strength candles, MACD, VWAP, auto chart-pattern indicator. Risk section: exposure, real leverage = exposure / account, risk about 1% per trade. Ends with a simple stacked-confluence breakout strategy (BOS + key level + momentum candle + volume), stop below the breakout low, 2:1 R:R.

## 2. Codifiable rules
- Point values (quoted): "ES futures... move with $50 for every point"; MES "$5 per point"; "for NASDAQ the point value is 20" (NQ); "gold... $100 per point" (GC); "oil actually trades $1,000 per point" (CL). Micro = "one-tenth of the size". Rule: "Always know the dollars per point." In Trading View: symbol info -> "point value".
- P&L = points moved x point value. Example: "buy one MES... goes up with 67 points... $5 per point... $380" (speaker's arithmetic wording is loose; 67 x 5 = 335, 76 x 5 = 380; treat as example only).
- Margin: "when you are day trading one microcontract, you might need around $50 to $100"; overnight "maybe, you know, $2,000 or even more". "If your account falls below the margin level, the broker will automatically close the trade." Keep a buffer between account balance and margin floor.
- Exposure: "one micro contract of the S&P 500 or 1 MES is basically the index level times $5" (about $38,000 at the index level in the video). Real leverage = "the exposure divided by your account" ("$2,000 account and... exposure of $38,000... 19x leverage, and that is super super risky").
- Position risk: "risk a small fixed amount. A conservative amount here is 1%, it can be larger, 2%, 3%, but for beginners, I usually recommend 1%."
- Continuous contract: analyse the continuous contract (ES1, CL1; "exclamation mark") "and then you of course trade the current contract". "pretty much all volume is in the CL1 contract" - use the front/volume-leading contract (1 not 2).
- Expiry: index futures expire "March, June, September, December"; rollover = close expiring contract and open the next. Index futures settle in cash.
- Sessions: futures trade "pretty much 23 hours a day", closed about 1 hour/day. In Trading View choose "electronic trading hours" (ETH) to see overnight; "regular trading hours" shows RTH only. RTH: more volatility, more volume, faster moves. Overnight: "much much less volume", slower, tight ranges. First and last candles of RTH tend to have highest volume. US stock hours referenced as 9:30-16:00 New York.
- Trend definition: uptrend = higher highs and higher lows ("if we break any of these rules we are no longer in an uptrend"); downtrend = lower highs and lower lows.
- Support/resistance: "price areas or price zones", not perfect lines; draw as rectangles.
- BOS (break of structure): in an uptrend, price pushes above the last high -> trend continuation signal. CHoCH (change of character): "price fails to maintain the low of the move that broke structure" i.e. price breaks below the low of the leg that caused the BOS -> potential reversal / exit warning for longs.
- Momentum candle: "at least twice the size compared to the previous three candles" (real-body comparison; indicator default). Extreme variant in demo: 5x the previous 5 candles. Big bodies, small wicks = conviction; small bodies + long wicks = hesitation (hammer at support = reversal signal).
- Volume: same-size candle with more volume is more significant; "a move on high volume is meaningful. The same move on low volume is much more suspect." Standard Trading View volume indicator is fine for futures (volume is complete since one exchange).
- Indicators recommended: "at least one momentum indicator" - MACD (standard "Moving Average Convergence Divergence", settings not specified, default implied); VWAP (volume-weighted average price over the session); auto chart pattern indicator (falling wedge shown; gives target on break, no stop; speaker puts stop "just below the low of the pattern"). Note: the all-chart-patterns indicator needs TradingView Premium.
- Setup stacking: "we want to stack multiple things at the same time".
- Be patient; wait for the right setups; real markets are messier than the textbook example (ranges are harder to trade).

## 3. Strategy specs
```json
{
  "id": "futures-bos-keylevel-momentum-volume-breakout",
  "name": "Stacked-confluence breakout (BOS + key level + momentum candle + volume)",
  "market": "Index futures (demo: ES1 / S&P 500 E-mini; micro MES for sizing); concept stated as applicable to any futures",
  "timeframe": "1h (also checked 4h for level touches)",
  "direction": "long",
  "indicators": {
    "momentum_candle": {"body_multiple": 2, "lookback_candles": 3},
    "volume": "standard volume indicator",
    "market_structure": "swing highs/lows for BOS/CHoCH"
  },
  "entry": "At the breakout of the resistance/key level when a BOS prints with a momentum candle and high volume (speaker: 'the absolute most common way to enter... is at the breakout').",
  "stop": "Just below the low of the breakout move/candle (swing low) before the breakout.",
  "target": "Fixed 2:1 risk-to-reward ('using a simple 2:1 risk-to-reward').",
  "filters": [
    "Uptrend in market structure (HH/HL) with BOS",
    "BOS coincides with a key level (e.g. prior all-time-high resistance zone with multiple touches)",
    "Breakout candle is a momentum candle (body >= 2x each of previous 3 candles)",
    "High volume (e.g. near the start of the regular session)",
    "Avoid when price is in a messy trading range"
  ],
  "notes": "Speaker admits the demo is a cherry-picked clean example ('real markets... more messier'). Short side is implied by symmetry (BOS down + momentum + volume) but not demonstrated. Risk about 1% of account per trade."
}
```
```json
{
  "id": "choch-exit-warning",
  "name": "Change of Character reversal / exit warning",
  "market": "Any futures",
  "timeframe": "1h",
  "direction": "both",
  "indicators": {"market_structure": "BOS/CHoCH detection"},
  "entry": "Optional: trade opposite direction after CHoCH (speaker says many traders do this); not a fully specified setup.",
  "stop": "Not specified.",
  "target": "Not specified.",
  "filters": [],
  "notes": "Mainly described as a warning sign to exit longs. Incomplete spec; use as a filter/exit signal only."
}
```
```json
{
  "id": "falling-wedge-auto-pattern-breakout",
  "name": "Chart-pattern breakout using TradingView auto pattern target",
  "market": "Futures (demo ES)",
  "timeframe": "not specified",
  "direction": "both (falling wedge shown = long)",
  "indicators": {"tradingview_all_chart_patterns": "auto-detects pattern and breakout, gives price target"},
  "entry": "On pattern break as flagged by the indicator.",
  "stop": "Just below the low of the pattern (speaker's judgement; indicator gives none).",
  "target": "Indicator-provided price target.",
  "filters": [],
  "notes": "Mentioned briefly; low specificity."
}
```

## 4. Risk and psychology rules
- Risk "1%" per trade for beginners (2-3% possible).
- Compute real leverage = exposure / account; avoid very high leverage (19x called "super super risky").
- Maintain a buffer above the margin floor to avoid forced liquidation; hold overnight margin much larger than day margin.
- Use micro contracts (MES etc.) for small accounts.
- Speaker says risk management is non-negotiable and refers to his separate full course (see 06 notes).
- Patience: wait for stacked setups; do not force trades in ranges.

## 5. Tools, repos, apps, APIs mentioned
- TradingView (charting platform; paper trading; broker integration via "Trade" button; Premium needed for auto chart-pattern indicator; speaker has affiliate link - 30 days Premium, $15 bonus).
- Brokers: Interactive Brokers, NinjaTrader, Bybit (crypto futures; affiliate). Broker availability varies by country; local index futures (Nifty for India, OMX for Sweden).
- Exchange: CME. Tickers: ES, MES, NQ, GC, CL, BTC (CME crypto futures). Continuous contracts ES1!, CL1!.
- Speaker's own TradingView indicators (paid channel membership): "Momentum Candles", "Volume Strength Candles".
- TradingView built-ins: Volume, MACD, VWAP, All Chart Patterns, All Candlestick Patterns. Symbol info -> point value. Chart settings -> Session: Regular vs Extended/Electronic trading hours.
- Suggests asking ChatGPT/Claude for ticker symbols and broker recommendations.
- No commands or APIs given.

## 6. Claims to treat with caution
- "for every single point this chart moves, you make $50" (ES; before leverage/risk, not profit claim).
- "for 1% move in NASDAQ, you can make $380" (illustrative micro-contract arithmetic, loose).
- Breakout demo: "we saw a massive massive move to the upside" - single hand-picked chart; no win rate or backtest given.
- "AI... is super super good at answering simple questions" (use caution recommending a broker via chatbot).
- No statistical backtest numbers anywhere in this course.
