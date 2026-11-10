# 15 - TradingView Ultimate Tutorial (2025) - Notes

Source: /home/claude/apex/archive/uploads/15-tradingview-ultimate-tutorial.md (fully read, ~104.9k chars). Mostly a platform walkthrough (UI, tools, screener, replay, paper trading, alerts) plus an indicator tier list. Very few mechanical trading rules; this file is mainly useful for product feature ideas (what TradingView offers that Apex should replicate).

## 1. Summary
A beginner-to-intermediate walkthrough of TradingView (recorded Dec 2024): sign-up and plan comparison (Basic free, Essential, Plus, Premium), opening charts with Supercharts, symbol search / ticker symbols / choosing high-volume exchanges (e.g. BTC on Binance or Coinbase), reading candles, chart types (candles, bars, line, Heikin Ashi, volume footprint), navigation (scroll zoom, price-axis drag, auto and logarithmic scale), themes. Core drawing tools: trend line (copy/paste for parallel channel), horizontal line, rectangle zones for support/resistance, Fibonacci retracement (golden zone 0.382-0.618), Long/Short Position tool (3:1 R:R example). Indicators: MACD (divergence), Volume, RSI (divergence); timeframes and multi-timeframe layouts; stock and crypto screeners with RSI/EMA filters; Bar Replay for practice and manual backtesting; broker connection and Paper Trading (account setup, leverage 1:1, market order with take profit and stop loss); alerts (price, indicator, frequency, notification channels). It ends with a subjective S-to-D tier list of 21 concepts/indicators.

## 2. Codifiable rules
(Platform/analysis facts that map to product features or simple rules.)
- Candle semantics: green = close > open, red = close < open; shows open, high, low, close; timeframe set by user (1D, 1h, 15m, 5m...). Bars chart carries identical OHLC info; line chart has only one data point per period; Heikin Ashi "makes the price smoother ... filters out noise ... but ... we will also lose some information."
- Trend line: uptrend = connect lows with "as many touches as possible"; channel = copy/paste the line (Ctrl+C, Ctrl+V) to make an exact parallel. "if we get a strong break below this upward sloping line that could actually be a first signal that the trend might reverse to ... a downtrend or ... a sideways market." "just because a trend stops doesn't mean that it will reverse in the opposite direction."
- Uptrend definition: "consecutive higher lows ... but we also need to print higher highs".
- Support/resistance as rectangles not lines: "support and resistance levels will never pretty much be perfect lines ... more ... zones".
- Fibonacci retracement: in an uptrend anchor at the low and drag to the high ("Anchor the Fibonacci at the low in an uptrend and then you drag it up to the high"). Levels listed: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1. "most pullbacks will actually end somewhere in this area ... between the 0.382 and the 0.618." Tier-list remark: "the market tends to pull back around 60 to 40%".
- Long/Short Position tool: plan target and stop; example "3 to one risk to reward"; stop "just below the lows of the pullback"; entry example = Fibonacci zone + bullish engulfing.
- Volume rule: "the more volume we have the more important the move will become"; breakout of repeatedly-tested resistance on a high-volume day preceded BTC run to $100,000 (hindsight example).
- Momentum divergence: price HH while MACD (or RSI) LH = bearish divergence; speaker likes to require both MACD and RSI to agree: "when we see divergence on both the RSI and the MACD at the same time I consider that a stronger divergence signal". Also "histogram divergence" on MACD preferred. MACD default (12,26,9) "normal settings" and 3-10-16 variant (3,10,16 Linda Raschke) "especially good to find impulsive moves ... trading pullbacks is a great trading strategy".
- RSI levels: 70 overbought, 30 oversold (speaker once misspoke and corrected); RSI range 0-100. Screener example: RSI(14) below 30 on daily = oversold filter (e.g. "only three companies in this index have 30 or lower").
- Screener design: filters by market (USA, India, Germany...), index (S&P 500, NASDAQ 100), daily % change, market cap, P/E, EPS, technicals (RSI, Bollinger Bands, EMAs, candlestick patterns); sortable asc/desc; crypto screener: rank top 50, EMA filters. Filter timeframe is daily by default.
- Bar Replay: select a bar to jump back; play via button or Shift+Down; replay speed (10x = 10 updates/s; 3x = 3 updates/s); pause; exit replay. Uses: practice, "test how strategies have performed in the past ... back testing".
- Paper trading: starting balance default $100,000, can be reset to e.g. $1,000,000; leverage set to 1:1 for stocks, futures, crypto, forex for beginners; order ticket has units or %risk, Market/Limit/Stop order, Take Profit and Stop Loss in price; positions, orders, history tabs. Example: buy 1 BTC at market, TP 100,000, SL 90,000 with price around 93,000 (risk about 3,300, reward about 6,700).
- Alerts: condition on price or indicator, operators (greater than, crossing, up X%), value, trigger "once" vs "every time", name, notifications (app, website, email, sound). Example alert: BTC above 18,500 style ATH-plus-buffer level (speaker misspoke the figure; the idea is to alert slightly above ATH to avoid trivial pierces). Indicator alerts: RSI > 70 "overbought RSI"; RSI bullish/bearish divergence alerts available. Free plan limits number of alerts.
- Timeframe choice: "it just depends on your trading style" (daily for people with jobs; 5m/15m for day trading). Multi-timeframe: analyze daily then zoom to 4h for entries, stop, target; split layouts require paid plans.
- Plan limits stated: Essential = 5 indicators per chart; Premium = up to 25; paid plans no ads; Premium-only: volume footprint, auto chart patterns.

## 3. Strategy specs
No complete mechanical strategy is taught in this file. One example setup, recorded for completeness:
```json
{"id":"fib-golden-zone-engulfing-3r","name":"Fib golden-zone pullback with bullish engulfing (TradingView demo)","market":"BTC (Coinbase/Binance) daily example","timeframe":"daily","direction":"long","indicators":{"fib_retracement":{"levels":[0,0.236,0.382,0.5,0.618,0.786,1],"golden_zone":"0.382-0.618"}},"entry":"Uptrend (HH/HL); retrace into 0.382-0.618; enter on bullish engulfing candle.","stop":"Just below the lows of the pullback.","target":"3R (3:1 risk to reward drawn with Long Position tool).","filters":["Uptrend confirmed","Fib drawn low-to-high","Preferably combined with S/R and volume"],"notes":"Demonstration only; speaker stresses combining tools and says 'this is not based on any analysis' for the paper-trade example."}
```
```json
{"id":"resistance-break-volume","name":"Resistance break on volume spike","market":"BTC daily example","timeframe":"daily","direction":"long","indicators":{"volume":"standard Volume bars","zones":"rectangle S/R zone with multiple touches"},"entry":"Break above a resistance zone that was rejected multiple times, on a day of very high volume.","stop":"Not specified.","target":"Not specified.","filters":["Multiple prior rejections at the zone","Volume spike on the breakout candle"],"notes":"Two bullish factors at once; hindsight example."}
```

## 4. Risk and psychology rules
- Paper trade with 1:1 leverage first; "practice placing trades without the risk of actually trading."
- Use alerts so you do not need to sit in front of the screen all day (reduces overtrading/screen time).
- "this video is just my opinion it's made for fun not financial advice" (tier list disclaimer).
- Percent-risk field exists in the TradingView order ticket (units vs %risk) but no recommended % in this video (see file 11: 0.5-1%).

## 5. Tools, repos, apps, APIs mentioned
- TradingView (tradingview.com): Supercharts, symbol search, screeners (Stocks, Crypto), Bar Replay, Trading Panel / Paper Trading broker simulator, Alerts (create alert, log tab), Layout setup (multi-chart), Pine "Personal" script tab (own scripts), Community indicators, "Explore brokers" (claims 2.7 million traders, 250 million live orders). Affiliate link: $15 reward on first paid subscription plus 30-day trial.
- Plans: Basic (free), Essential, Plus, Premium.
- Exchanges named: Binance (largest crypto exchange per speaker), Coinbase, Bitstamp; Nasdaq (TSLA), tickers: TSLA, AMZN, BTC.
- Chart types/hotkeys: Alt+F (Fib, from file 12), Shift+Down (replay play/pause), Ctrl+C / Ctrl+V to clone drawings.
- Other speaker videos referenced: MACD, RSI, volume, limit and stop orders courses.
- No code or commands.
- Implication for product: replicate Replay (step through bars, speed control), paper trading ticket with TP/SL and 1:1 leverage, alerts with once/every-time frequency, and a technical-filter screener (RSI<30, EMAs).

## 6. Claims to treat with caution (tier list = personal opinion, not data)
Speaker's tier list (his words: "just my opinion ... not financial advice"; "tier list I'm making here on the spot"):
- S tier: Pivot Points High/Low ("my first S tier indicator"), Price Action, Market Structure.
- A tier: ATR, Volume, MACD (normal and 3-10-16), RSI, Auto Chart Patterns, Support and Resistance ("a tier").
- B tier: Volume Profile, Fibonacci retracement, Fibonacci extension (slightly above retracement), Auto Candlestick Patterns, Smart Money Concepts ("middle ... B tier").
- C tier: Trend Channels, SMA, HMA, EMA ("I'm not the biggest fan of moving averages in general").
- D tier: Fibonacci Circles, Fibonacci Channels.
- Notes: Fib extension useful for targets beyond all-time highs; "Smart money concepts ... mostly just old concepts repackaged." Intro promises a "winner" and "biggest loser" but the transcript ends before announcing them (no final crown in transcript).
Other cautions: BTC "exploded to $100,000" after a high-volume breakout (hindsight); "TradingView premium ... amazing indicator ... auto chart patterns" (affiliate-influenced); "more than 2.7 million traders ... 250 million executed live orders" (platform marketing stat quoted from TradingView page); paper-trade example lost about $130 fake dollars, random trade not based on analysis.
