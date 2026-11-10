# Batch 0 study: archive/chat/01 to 14

Every file was read to the end. Files 03 and 05 to 14 are each one long transcript line, so I read them in byte chunks until EOF. File 12 matches file 11 byte for byte after the first 200 bytes; only the header comment differs (message id and timestamp). It is a true duplicate.

Context checked: `docs/validation-results.md` and `docs/trading-playbook.md`. Status labels below ("no edge", "closest", "candidate", "untested") come only from those docs.

Files 03 and 05 to 14 are all from one educator, Mind Math Money. Every video pushes a TradingView affiliate link ("30 days Premium free + $15 bonus"), paid YouTube channel memberships (study guides, a members-only "trading toolkit"), and merch: mouse mats, mugs, journals, and an "MMMMM10" promo code. Treat them as free course content that funnels viewers to paid products. None of them shows a live track record.

---

## chat/01: MakerDAO auction-keeper guide (QuickNode)
- **What / category:** a QuickNode guide to running MakerDAO's `auction-keeper` bot. It bids in "flip" collateral auctions (ETH-A). **Infrastructure-ops / tool-repo.**
- **Rules / parameters:**
  - Flip auctions only, ilk `ETH-A`, `--from-block 14764534`, `--vat-dai-target 1000`, `--rpc-timeout 30`.
  - The bidding model reads auction JSON on stdin and replies `{"price": oracle × (1 − 0.15)}`. The oracle is the CoinGecko ETH/USD spot price. The model skips auctions where `guy` is our own address.
  - Optional dynamic gas via the ethgasstation API key.
  - Other auction types are described but not used: flop (bid DAI, receive MKR) and flap (bid MKR, receive DAI surplus).
- **Tools named:**
  - `github.com/makerdao/auction-keeper`, with Python 3 and a virtualenv.
  - The `ethereumjs-wallet` npm package, used to make a keystore.
  - A banteg gist with a sample bidding model.
  - The QuickNode "Build plan" as RPC, which is paid (no price given). The guide says Infura is incompatible.
  - CoinGecko API, defiexplore.com/liquidations.
  - No license is stated.
- **Profit claims / evidence:** "$4m+ of ETH that was bought for near-zero DAI on Black Thursday" (March 2020). That was a one-off failure during network congestion, not a repeatable edge. No P&L, no backtest. **Evidence: none.**
- **Concerns:**
  - **Key handling is poor.** You type a "random 64-character hex" private key into a JS file by hand, then store the keystore and a plaintext `passfile` beside the code.
  - The wallet must be funded with ETH and DAI and is used live from the first run.
  - **The guide has bugs.** It says "15% premium" but the code applies a 15% discount. The model is saved as `bidder.py` but run as `./our-model.py`. The keystore is saved as `eth-keystore.json` but passed as `keystore.json`. The shebang is `#!/usr/bin/env` with no interpreter.
  - **It is very likely obsolete.** This is from my own knowledge and not checked in this task, since no fetching was allowed. Maker replaced flip auctions with Liquidations 2.0 "clip" Dutch auctions in 2021 and later rebranded to Sky. The keeper repo is likely archived. Keeper and liquidation work is also an MEV-competitive field where retail bots rarely win.
- **Worth building: no.** It is an outdated protocol path with no edge evidence, and it needs a live hot wallet, which breaks Apex's no-order and no-key rules. The docs do not cover it.

## chat/02: Polymarket copy-trading bot guide (QuickNode)
- **What / category:** a TypeScript bot that watches one target wallet on Polymarket and mirrors its BUY trades through the CLOB API. **Tool-repo / strategy (copy trading).**
- **Rules / parameters (from the `.env`):**
  - `POSITION_MULTIPLIER=0.1`: copy 10% of the target's size.
  - `MAX_TRADE_SIZE=100`, `MIN_TRADE_SIZE=1` (USDC). The guide suggests 5 or less for a demo.
  - `SLIPPAGE_TOLERANCE=0.02`, `ORDER_TYPE=FOK`.
  - `MAX_SESSION_NOTIONAL` and `MAX_PER_MARKET_NOTIONAL`. Both default to 0, which means off.
  - `POLL_INTERVAL=2000` ms against `data-api.polymarket.com/activity` (type=TRADE, limit 100, newest first), with optional WebSocket market and user channels.
  - Gas floors of 30 / 60 gwei on Polygon.
  - BUY only: target SELLs are skipped, so copied positions are never exited by the bot.
  - Retry policy: retry on network errors, timeouts, rate limits and 502/503/504. Do not retry on 401, 403/Cloudflare, insufficient balance or allowance, invalid input, or duplicates.
- **Tools named:**
  - `github.com/quiknode-labs/qn-guide-examples/tree/main/defi/polymarket-copy-bot`. No license is stated.
  - Polymarket CLOB SDK, which needs ethers v5.
  - QuickNode Polygon endpoint (free tier offered).
  - USDC.e and POL on Polygon.
- **Profit claims / evidence:** none. The guide says the code is unaudited and calls itself a demo.
- **Concerns:**
  - The raw `PRIVATE_KEY` sits in `.env` as an EOA key. API credentials are derived from it, and the first run sends token approval transactions.
  - `POLYMARKET_GEO_TOKEN` points at regional restrictions. Polymarket's global exchange has historically blocked US persons, so ToS and legal status depend on jurisdiction. That is Jeremy's call.
  - **Design flaws for real money:**
    - The risk caps are off by default.
    - It never mirrors exits.
    - It enters after the target at worse prices, given 2 s polling and FOK with 2% slippage.
    - It has no model of whether the target is skilled or lucky.
- **Worth building: medium, as paper and research only.** The useful, testable part is choosing wallets. Use the public Data API activity history to backtest whether top-ranked wallets keep their edge out of sample after a realistic entry delay and slippage. That is a selection-bias problem the monkey test and deflated Sharpe suit well. The docs do not cover it. Live mirroring would need order tools, which `web/lib/policy.ts` forbids.

## chat/03: "Turtle breakout 55/20" AI trading bot course (Claude + TradingView)
- **What / category:** a course where Claude, through the TradingView MCP, writes a Pine Script strategy, backtests it in TradingView, and wires alerts. **Strategy + tool workflow.**
- **Rules / parameters:**
  - BTC, daily, long only.
  - Entry when the daily close is above the highest high of the previous 55 days.
  - Stop at 2 × ATR(20) below the signal day's close, set once and never moved.
  - Exit when the daily close is below the lowest low of the previous 20 days.
  - Size is 1% of the account ÷ stop distance. No pyramiding.
  - Checklist: verify three trades by hand (entry against the 55-bar high, the stop line stays flat, the exit against the 20-bar low), add commission and slippage, compare to buy and hold, try other timeframes.
  - Oversight: semi-automated only, with alerts to app and email. Claude never gets broker logins, API keys or the order button. Pause when drawdown exceeds the backtest's worst. Renew alerts before they expire, about every 2 months on standard plans.
- **Tools named:**
  - TradingView desktop. A paid plan with technical alerts is needed, at least "Essential". There is an affiliate trial.
  - Claude desktop (free tier works, paid recommended; it mentions Fable 5.1 and Opus 5.5 "extra").
  - TradingView MCP, about 7k GitHub stars per the video.
  - The members-only PDF study guide.
- **Profit claims / evidence:**
  - TradingView backtest: +729% (about $72k), 45% win rate, profit factor 7.6, max drawdown 3.29%.
  - The presenter flags that the drawdown counts closed trades only.
  - Gains came from a few big trades.
  - He admits BTC buy and hold "obliterated" the strategy.
  - No trade count, date range or cost settings are shown. It is one market picked after the fact, in sample, with screenshots only.
- **Concerns:** low. Its safety guidance (no keys or order access for the AI, semi-automated) matches Apex's rules.
- **Worth building: low.** It is **already covered** as `turtle_55_20` and tested as **no edge**: 120 trades over 7 sets, 3 of 7 made money, best 4/6 checks (GLD 1d). The oversight rules are already in playbook §1 and AGENTS.md.

## chat/04: How to connect Claude to TradingView (TradingView MCP article)
- **What / category:** a written guide plus a copy-paste install prompt for the community `tradesdontlie/tradingview-mcp` bridge. **Tool-repo / infrastructure.**
- **Rules:** none for trading.
- **Install facts:**
  - Node.js LTS, `npm install` (it tells users not to run `npm audit fix`).
  - Launch TradingView with `--remote-debugging-port=9222`. On Windows Store installs the path comes from `Get-AppxPackage`.
  - Add `"tradingview": {"command":"node","args":["<path>/src/server.js"]}` to `claude_desktop_config.json`.
  - Verify with `tv_health_check`, expecting `cdp_connected: true` and `api_available: true`.
  - Features: read symbol, timeframe and OHLCV (for example "last 50 candles", "180 daily candles"), read indicator values, switch charts, draw levels, help with backtests. It cannot place trades.
- **Tools named:**
  - `github.com/tradesdontlie/tradingview-mcp`. Free and open source per the article; no license is named.
  - TradingView desktop, any paid plan. The browser version does not work.
  - Claude desktop app.
  - Affiliate disclosure at the end.
- **Profit claims:** none.
- **Concerns:**
  - **Security.** It opens a Chrome DevTools Protocol port (9222) on the TradingView app. Any local process that can reach that port can drive the signed-in TradingView session. The bridge uses TradingView's internal interface, so it is unofficial and can break on updates.
  - **ToS.** Automated scraping of TradingView data may conflict with TradingView's terms and data-vendor licenses. Check before pulling bulk history.
  - **Hygiene.** It tells users to ignore npm vulnerability warnings, and Apex's rule is to check the license first.
- **Worth building: medium**, as a **data source only**, not an edge. `validation-results.md` already names "the TradingView bridge once Jeremy approves Remote Control" as a path to longer intraday history. Longer history is the main blocker, since the 50-trade bar fails everywhere. Read-only use fits Apex policy, but it needs Jeremy's device, Remote Control approval and a license and ToS check. It must not be cloned or installed from the archive.

## chat/05: AI trading with TradingView course (SMA-50 example)
- **What / category:** a course on Claude + TradingView workflows: market structure, S/R levels, adding indicators, multi-timeframe reads, building and backtesting a rule, position sizing. **Tool workflow + strategy example.**
- **Rules / parameters:**
  - "SMA 50 cross": BTC daily. Go long when the close crosses above SMA(50), go flat when it closes below. Long or flat, decided on candle closes.
  - Backtest on a $10,000 account, about 100 trades requested, run with and without commission.
  - MACD set to Linda Raschke's "3-10-16" (fast 3, slow 10, signal 16).
  - Multi-timeframe read across daily, 1h and 5m.
  - Sizing example: entry 63,926, risk 2% of $10k = $200. Size = $200 ÷ (entry − stop), which gave 0.0767 BTC, about $4.9k notional.
  - Prompting tips: one task per prompt, name the concept, ask the AI to ask clarifying questions, always verify its levels.
- **Tools named:** TradingView desktop (paid), Claude desktop ("Fable 5" recommended; says lower models were noticeably worse), TradingView MCP, members-only toolkit, merch store.
- **Profit claims / evidence:**
  - From May 2015: net profit "$6 million" without fees and "$4.8 million" with fees. He misspeaks and says "without" twice.
  - About 70% losing trades, max drawdown about 50%.
  - Buy and hold about +26,000% with an 83% drawdown. The strategy was "about 1.8×" buy and hold.
  - It is one in-sample run on a market picked after the fact, screenshot only, with no slippage detail. It also has survivorship and hindsight bias, because BTC was chosen as the best-performing asset of the decade.
  - The narration has misreads. One chart was read as "up 72% for the day", which shows AI or narration error risk.
- **Concerns:** low. It repeats "you are responsible" and "verify the AI". The money claims are big headline numbers with no out-of-sample test.
- **Worth building: low.** It is **already covered** as `sma50_trend` and tested as **no edge**: 441 trades, 5/7 sets made money, best monkey 0.73 (BTC 1d, 23 trades), most checks 4/6. The one idea worth a test is **drawdown avoidance as a risk overlay**. Apply "flat below SMA 50" to buy and hold and compare max drawdown and Sharpe with its t-stat. That needs 10+ years of daily BTC and SPY, which the current data does not have.

## chat/06: Market structure course
- **What / category:** a market-structure course covering impulse and pullback, fractals, Fibonacci, measured moves, trend states, BOS/CHoCH, internal vs external structure, strong vs weak levels, and two entry models. **Strategy + structure definitions.**
- **Rules / parameters:**
  - **Impulse candle tests:**
    - The momentum candle body is at least 2× the previous bodies.
    - Mostly one colour.
    - Closes near the extreme.
  - **Pullback tests:**
    - Small bodies.
    - Mixed colours.
    - Many large wicks relative to bodies.
    - "Simple" pullbacks have one counter-move; "complex" ones have two or more.
  - **Fibonacci:** draw from the impulse low to its high. Pullbacks usually end between 0.382 and 0.618.
  - **Measured move (MMO):** the next impulse is about the same length as the prior one, projected from the pullback low.
  - **Trend:** uptrend is HH+HL, downtrend is LH+LL, anything else is sideways.
  - **BOS:** a new high in an uptrend or new low in a downtrend.
  - **CHoCH:** failure to hold the last HL or LH. Only a **candle close** past the level counts, not a wick.
  - **Internal vs external:** internal BOS/CHoCH are lower-timeframe breaks. An internal CHoCH warns early of a higher-timeframe pullback.
  - **Strong vs weak:** a strong level is the origin of a move that broke structure; a weak level's move failed to.
  - **Entry 1, failure test (2B / Wyckoff spring or upthrust):**
    - Price wicks below the key low that would cause a CHoCH, then closes back above.
    - Enter on that candle's close, stop below the wick plus some room.
    - Target just under the prior high, or fixed 2R, or the measured move.
    - Shown on EURUSD 15m.
  - **Entry 2, pullback:**
    - Needs a strong prior impulse.
    - Either buy at pullback support, optionally on a failure-test hammer, or buy the momentum-candle breakout of the pullback high.
    - The support entry uses a wide stop below the pullback low; the breakout entry can use a tighter stop.
    - Target 2R or the measured move. Shown on AUDUSD 15m.
- **Tools named:** TradingView (affiliate). Books: Adam Grimes, *The Art and Science of Technical Analysis*. Tony Plummer's "price pulse". Victor Sperandeo (2B).
- **Profit claims:** none numeric. The examples are picked after the fact.
- **Concerns:** none beyond affiliate selling.
- **Worth building: low.**
  - The failure test is **covered** as `failure_test_2b`: **no edge** (530 trades, 1/7 sets made money).
  - Fib-depth pullbacks are covered by `urban_deal_flow` (38% discount): **no edge**, and `demand_second_leg` (30–79%): **closest but only 3 trades**.
  - The nearest working idea is chat/78 `dave_prev_range` (50% retrace into the breaking leg, target the high). It is a **candidate** at 6/6 on SPY and IWM 30m/1h.
  - The new testable pieces are the **measured-move target** and the **"close, not wick" CHoCH rule** as exits and filters on `dave_prev_range`. Those are cheap variant tests, but each one counts against multiple-testing.

## chat/07: Trading psychology course
- **What / category:** behavioural finance for traders: loss aversion, recency and confirmation bias, fear, greed, FOMO, revenge trading, process vs outcome, Stoicism. **Risk-psychology.**
- **Rules / parameters:**
  - Set entry, stop and target before entering, then do nothing until one is hit.
  - Mid-trade, ask "has my technical thesis changed, or is this just feeling?"
  - If you can't state the trade's plan in 1–2 sentences, don't be in it.
  - **15-minute rule, 1 hour for beginners:** step away after any loss.
  - **Permission question:** "Would I take this if I had not just lost the last one?"
  - Never risk more than lets you sleep. No single trade should ruin your day.
  - Routine: before the market, plan and set alerts; during, execute; after, journal every trade with an **emotion tag** (calm, confident, FOMO, anxious, tired, revenge) and the setup.
  - Judge yourself on process, not outcome. Review only on a large sample.
  - Worked examples:
    - A 60% win rate at 1:1 has positive EV.
    - Losses feel about 2× as strong as gains (Kahneman and Tversky).
    - Intel after 2000 took about 20 years to recover.
    - Silver fell about 50% from 121 to 64 in a day after a parabolic run.
    - 5× leverage plus a −20% earnings gap wipes out the account.
- **Tools named:** the members-only "Mind Math Money trading toolkit" (EV calculator and an emotion-tagged journal), the physical journal, *Thinking, Fast and Slow*, Thaler on mental accounting, Epictetus and Marcus Aurelius.
- **Profit claims:** none. It cites "about 90% of traders lose money" and admits he doesn't know the source.
- **Concerns:** the main tools sit behind a paywall. The ideas are standard and freely available.
- **Worth building: medium, as habits only.** Most of it is **already covered** in playbook §1 ("Set entry, stop and target before you enter. Cool down after a loss. Pause a bot when its drawdown passes its backtest worst", cited as chat/07). What's missing and cheap:
  1. An **emotion and setup tag** on journal entries, with a per-tag P&L report.
  2. A **hard cooldown lockout** after a loss in the dashboard: 15 min by default, configurable.
  3. A **"same trade if not after a loss?"** prompt on manual trades.

  None of these are backtestable. They are habit tooling.

## chat/08: Chart patterns course
- **What / category:** classic chart patterns with direction and type labels, plus entries, stops and targets. **Strategy (pattern catalogue).**
- **Rules / parameters** (default target is 2R or the measured move):
  - **Double bottom:**
    - Two lows at roughly the same level after a downtrend.
    - Entry A: candle close above the middle-high line, stop below the lower low.
    - Entry B, his preference: the second low wicks below the first, enter at close, stop below that wick, quick 2R.
    - Entry C: the retest pullback after the break.
  - **Double top:** mirror of the double bottom. He prefers selling the pullback after the neckline break, stop above the pullback high.
  - **Bull flag:**
    - A sharp impulse (strong candles), then a tight small-candle pullback.
    - Enter on a strong-candle close above the flag, stop below the flag low.
    - Or a failure-test hammer at the flag support.
    - Target 2R or the measured move from the flag low.
    - A stronger pole means a better flag.
  - **Bear flag:** mirror of the bull flag. Optionally wait for one confirmation candle when the breakdown close is near support.
  - **Head and shoulders:**
    - Neckline through the two troughs. It is stronger when the second trough is lower.
    - Enter on the neckline break, stop above the right shoulder, target 2R or head-to-neckline projected.
    - Or enter on a neckline retest with a strong rejection, using a tighter stop above the rejection wick.
  - **Inverse head and shoulders:** mirror. He prefers the retest entry with a strong momentum candle and a stop below the retest low and the pre-break low. He warns against a breakout candle that closes weak.
  - **Falling wedge** (bullish; can be continuation or reversal): the upper line is steeper. Enter on a momentum close through the upper line, stop below the wedge low. Or take a hammer that dips below the lower line, stop below the hammer.
  - **Rising wedge:** mirror. Stop above the pattern high or the outlying wick. Target the wedge height.
  - **Symmetrical triangle and broadening range:** "red" patterns to **avoid**. They usually turn into ranges.
  - **Cup and handle:**
    - A U-shape after an uptrend, often containing an inverse head and shoulders, then a handle pullback.
    - Enter on the break of the rim, stop below the handle low, or on a retest with a strong reaction.
  - **Reverse cup and handle:** the handle may be a rising wedge.
  - **Ascending and descending triangles:** "one of the best". Flat highs with higher lows, or the mirror. Enter on a strong-body breakout close, stop below the last higher low, or on the pullback or retest after the break.
  - Rule of thumb: continuation patterns are smaller than reversal patterns.
- **Tools named:** TradingView (affiliate).
- **Profit claims:** none numeric. All examples are picked after the fact. He admits live trading is "much harder" than looking back.
- **Concerns:** no evidence; patterns are subjective.
- **Worth building: low to medium.**
  - **Not covered**: there are no flag, triangle, H&S or double-bottom strategy ids in the registry.
  - The **bull flag, ascending triangle and double-bottom failure entry** can be coded objectively:
    - pole = N bars with a body ≥ 2× the median;
    - flag = range contraction with lower ATR;
    - break = close above the flag high;
    - stop = flag low;
    - target = 2R.
  - The archive's related tests (`bb_squeeze`, `breakout_50_20`, `failure_test_2b`) were all **no edge**, so expect the same. Run them only as a batch, intraday across many symbols, with multiple-testing correction.

## chat/09: Smart Money Concepts course
- **What / category:** SMC course covering trend states, BOS/CHoCH, internal vs external structure, strong vs weak levels, supply and demand zones, fair value gaps and liquidity grabs. **Strategy.**
- **Rules / parameters:**
  - Structure definitions are the same as chat/06.
  - **Demand or supply zone:** find a momentum candle with a body at least 2× the previous ~3 bodies (he prefers 3–5×). The zone is the full high-to-low range of the candle **before** it.
  - **High-quality zones** form only at **strong** lows or highs (the origin of a BOS or CHoCH) and must come after the BOS is confirmed.
  - **Zone trade:** wait for price to return to the zone, then a confirming candle (hammer, engulfing or momentum).
    - Enter at that candle's close.
    - Stop below the pattern low or below the zone.
    - Target just below the prior high, or just above the BOS.
  - **FVG:** around a momentum candle, the gap between candle 1's high and candle 3's low (bullish), or the mirror. Prefer FVGs inside a structure-breaking move.
    - Enter on a confirming candle (for example a hammer) when price retests the gap.
    - Stop below the pattern or the FVG.
    - Target near the BOS, or 2R.
  - **Liquidity grab:** a wick through an obvious high or low that closes back inside.
    - Enter at the close, stop beyond the wick, target 2R.
    - A real CHoCH needs a candle close beyond the level.
- **Tools named:** TradingView. Ray Dalio and Bridgewater are named as examples of "smart money".
- **Profit claims:** none numeric; examples are picked after the fact. The "smart money hunts stops" story is an untestable narrative.
- **Concerns:** none beyond the paid upsell.
- **Worth building: low.** It is **already covered and failing**:
  - `smc_sweep_lite`: no edge, and −9.7% average on intraday sets in the chat/86 test.
  - The `liq_*` family: no edge.
  - The `ict_*` family: `ict_unicorn` (FVG-based) 0/7 sets profitable; `ict_silver_bullet` 0 trades.
  - `demand_second_leg`: 3 trades.
  - The **zone definition** (the candle before a ≥2× body, and only at a strong low after a BOS) is precise enough to add as one variant to the supply-and-demand family. The prior is weak.

## chat/10: Elliott Wave course
- **What / category:** Elliott Wave theory covering 5-3 waves, motive and corrective waves, diagonals, five "unbreakable" rules, extension, truncation, alternation, equality, Fibonacci ratios, and one trade example. **Strategy (discretionary framework).**
- **Rules / parameters:**
  - **Hard rules:**
    1. Wave 2 never retraces past the start of wave 1.
    2. Wave 3 is never the shortest of waves 1, 3 and 5.
    3. Wave 3 must go past the end of wave 1.
    4. Wave 4 never enters wave 1's price range (diagonals excepted).
    5. A motive wave has five sub-waves.
  - **Corrections:** zigzag (5-3-5; B doesn't go beyond A's start), flat (3-3-5), triangle (A-B-C-D-E).
  - **Fibonacci:**
    - Wave 2 retraces 0.5–0.618 of wave 1; wave 4 about 0.382 of wave 3.
    - Wave 3 is about 1.618 × wave 1 (trend-based extension from W1 low → W1 high → W2 low).
    - Wave 5 is about equal to wave 1, or 0.618 × (W1→W3).
    - Time extensions of 1.618, 2.618 and 4.618 are optional.
  - **Personality:** wave 5 often shows RSI or MACD divergence; an ending diagonal at wave 5 signals exhaustion.
  - **Trade example** (GOOGL daily, picked after the fact):
    - At a completed 5-wave count with bearish RSI divergence, a wedge and a dark-cloud-cover candle, go short.
    - Stop above the high, 3R target.
    - Also "trade the wave-2 bull flag breakout".
- **Tools named:** TradingView (affiliate), RSI and MACD. Elliott's 1938 and 1946 books.
- **Profit claims:** none numeric. **He gives the downsides himself:**
  - It is subjective, and two analysts get two valid counts.
  - Counting in real time is far harder than in hindsight.
  - There is **no peer-reviewed backing**.
  - Use it as a road map, not a holy grail.
- **Concerns:** untestable as taught.
- **Worth building: no.** It is not covered, but the subjectivity makes a fair backtest close to impossible. The parts that can be coded are already covered or failing elsewhere: wave-2 retrace depth is like the pullback rules, and wave-5 divergence is covered in playbook §3 ("divergence plus a reversal candle", untested). A zigzag-based automatic counter would mostly be curve-fitting.

## chat/11: Top-down analysis course
- **What / category:** multi-timeframe "top-down" method using three timeframes, with confluence from S/R, divergence, patterns, candles and volume. **Strategy / filter.**
- **Rules / parameters:**
  - **Timeframe ratio:** 4:1 to 8:1 between adjacent frames. His set is daily, 4h and 30m (6:1 and 8:1); 1h can replace 30m (4:1). For day trading: 1h, 15m and 3m.
  - **Daily:**
    - Trend and channel, key S/R.
    - Look for **bullish divergence** between price lower lows and RSI(14) higher lows, plus MACD histogram higher lows. Both indicators agreeing is stronger.
  - **4h:**
    - Wait for a break of the nearest resistance, then a **retest of the broken resistance as support**.
    - He notes an ascending triangle into it, but discounts it because it came after a downtrend.
  - **30m:**
    - Trigger on a bullish engulfing at the retested level, or a bullish pennant breakout.
    - Stop below the low before the breakout, plus some room.
    - Target 2R.
  - **Volume:** the highest-volume breakout bar in a long while adds confidence. The engulfing bar had only slightly higher volume, so it was weaker.
  - Example: BTC, picked after the fact. He admits it went briefly underwater before hitting 2R.
- **Tools named:** TradingView (multiple chart layouts need a paid plan; affiliate), RSI, MACD, Volume. It mentions volume profile and order flow without detail.
- **Profit claims:** none numeric; one example picked after the fact.
- **Concerns:** none.
- **Worth building: low.**
  - **Partly covered**: the higher-timeframe filter is used in `urban_sr_memory` (no edge).
  - The chat/78 test found that "top-down alignment (4× and 16× timeframes agree) cut trades by about 85% and made results worse".
  - The `confluence` score (closest: SPY 4h, 49 trades, monkey 0.85) is the nearest relative.
  - The specific stack (daily RSI and MACD-histogram divergence, then a 4h S/R flip retest, then a 30m engulfing) is untested. It would fire rarely and needs 30m history across many symbols.

## chat/12: Top-down analysis course (duplicate)
- Byte-identical to chat/11 after the header. There is nothing new; see chat/11. **Worth building: same as chat/11 (low).** Keep it out of any counts so it doesn't double-weight the idea.

## chat/13: Swing trading course
- **What / category:** a complete swing system: daily bars, bull-flag pullbacks, MACD 3-10-16 histogram, volume, three candle triggers, about 30 min a day. **Strategy.**
- **Rules / parameters:**
  - **Market and timeframe:** start with stocks, daily (4h or 1h to refine). Uptrends and longs only for beginners. Hold for days to weeks.
  - **Indicators:**
    - MACD fast 3, slow 10, signal 16, source **OHLC4**, oscillator and signal MA type **SMA**. Use the histogram only; 12-26-9 "also works".
    - Plain volume.
  - **Step 1, impulse:** the MACD histogram peak is larger than the previous histogram peak **and** volume rises during the move.
  - **Step 2, pullback:**
    - Candles clearly smaller than the impulse's, mixed colours.
    - Volume lower than the impulse and falling.
    - Fib 0.382–0.618 is optional.
  - **Step 3a, entry at support:**
    - A support zone with 2–3 touches inside the pullback.
    - Price dips below and closes back above, ideally a hammer or bullish engulfing. Optionally wait for a confirmation candle.
    - Stop just below the dip low. Target fixed 2R, or partial at the prior high and the rest at 2R.
  - **Step 3b, entry at breakout:**
    - A momentum candle with a volume spike that closes above the impulse high.
    - Stop below the prior impulse high (expecting a retest) plus room, or below a structural low.
    - Target 2R.
  - **Skip when:**
    - the MACD histogram diverges (a smaller peak on a higher price high);
    - impulse volume is weak;
    - pullback volume is high;
    - the market is choppy or sideways;
    - stops are very wide.
  - **Candle definitions:**
    - Hammer: lower wick ≥ 2× body (prefers 3–4×), tiny or no upper wick, at support.
    - Shooting star: mirror of the hammer, at resistance.
    - Bullish engulfing: opens below the prior red candle's low and closes above its high. In crypto, opening at the prior close is allowed.
  - Paper trade first, then start small.
- **Tools named:** TradingView (affiliate). Physical products: desk mat and mug, with promo code "MMMMM10" for 10% off. Channel memberships.
- **Profit claims:** "a complete trading strategy you can use in 30 minutes a day to make money". **Evidence: none.** One Coinbase (COIN) daily example was picked after the fact, and he shows a failed follow-up himself.
- **Concerns:** a course and merch upsell, and a headline promise with no data behind it.
- **Worth building: medium.** It is the most fully specified rule set in this batch, and every input (OHLC4 MACD histogram, volume trend, candle shapes) can be coded. It is **not covered**. There is no MACD-histogram or volume-confirmed flag strategy; playbook §3 lists "divergence plus a reversal candle" as untested.
  - Daily bars on a few symbols will fail the 50-trade bar, as every daily test has.
  - It needs a **cross-section of many stocks**, pooled, or 1h/4h bars.
  - The impulse→pullback→hammer-at-support structure is close to the `dave_prev_range` candidate. Test it as a variant: add a volume-contraction filter and a MACD-impulse filter on top of `dave_prev_range`.
  - Count every variant tried.

## chat/14: Candlestick "bible" course (three candle types)
- **What / category:** candle reading reduced to three families (momentum, rejection or "reaction", indecision), plus volume and one failure-test trade. **Indicator-filter / strategy.**
- **Rules / parameters:**
  - **Momentum candle:** real body ≥ 2× **each of the previous three** bodies (he prefers 3–5×), small or no wicks. A marubozu has no upper wick. A bigger body with smaller wicks is stronger.
  - **Engulfing:** the body opens beyond the prior body and closes beyond its other end; wicks are ignored. In crypto, opening at the prior close is allowed.
  - **Reaction / pin bar:** a long wick on one side shows rejection, and body colour hardly matters. Hammer: long lower wick with a tiny or no upper wick. Shooting star: the mirror.
  - **Indecision:** doji, spinning top, high-wave. Not tradable alone; use them as warnings.
  - **Volume:** the same candle on higher volume is a more reliable signal.
  - **Trade (PLTR daily):**
    - Draw a support zone from 3+ prior wick touches.
    - A high-volume hammer wicks below the zone and closes back inside.
    - Enter at the close, stop below the hammer low, target 2R.
  - Book shown: an unnamed "candlestick bible" with 70+ patterns. Homma (Munehisa) and the 1755 *Fountain of Gold* are cited.
- **Tools named:** TradingView (affiliate), the mug, channel memberships; it plugs an order-flow video.
- **Profit claims:** none numeric; one example picked after the fact.
- **Concerns:** none beyond the upsell.
- **Worth building: low as a strategy, medium as a shared library.**
  - The failure test at a support zone is **covered** as `failure_test_2b` / `wyckoff_spring` / `liq_reversal`. All are **no edge**, though `liq_reversal` made money on 5 of 7 sets.
  - The value is one precise, reusable **candle classifier**: momentum = body ≥ 2× max of the prior 3 bodies; hammer = lower wick ≥ 2× body with upper wick ≤ ~0.25× body; engulfing = body-to-body. chat/06, 08, 09, 13 and 14 all use the same definitions, so one implementation serves them all, plus a relative-volume flag (volume ÷ 20-bar median).

---

## Batch themes
- **One author makes up most of the batch.** Files 03 and 05 to 14 are all Mind Math Money. They share one vocabulary: momentum candle ≥ 2× prior bodies, failure test, 2R target, measured move, HH/HL structure. They also share one funnel (TradingView affiliate, memberships, merch). Count them as **one source**, not eleven independent confirmations. Note that 12 duplicates 11.
- **Every profit claim is a single TradingView backtest picked after the fact, or no number at all.** Turtle on BTC: +729%, PF 7.6, closed-trade drawdown only. SMA 50 on BTC since 2015: "$4.8M", "1.8× buy-and-hold". There are no trade counts, no out-of-sample test and no live record. Both are already tested here as **no edge**.
- **The strongest evidence in this batch is the presenter's own caveats:** buy and hold beat the turtle system, backtests are not promises, Elliott has no peer-reviewed support, and counting in hindsight is easy. These match our validation findings.
- **The ideas that keep coming back are already tested and failing:** the failure test / liquidity grab (`failure_test_2b`, `smc_sweep_lite`, `liq_*`, `ict_*`), higher-timeframe alignment (it worsened results in chat/78), and breakouts (`turtle_55_20`, `breakout_50_20`).
- **The best lead to extend is the pullback-then-trigger structure** (chat/06, 08, 13), which is closest to the **chat/78 `dave_prev_range` candidate**. Test these as variants on it: a measured-move target, a "close not wick" CHoCH rule, a volume-contraction filter and a MACD 3-10-16 OHLC4 histogram impulse filter. Count every variant against the deflated Sharpe.
- **The rule set most worth coding new is chat/13 swing**, but only on pooled cross-sectional stock data or intraday bars. Daily data on 7 symbols can't reach 50 trades.
- **There are no profit numbers for the two non-video bots:** Polymarket copy trading (chat/02) and the Maker keeper (chat/01). The keeper is very likely obsolete (flip auctions were replaced; from my own knowledge, not verified here) and needs a live hot wallet, so skip it. The copy bot is worth a **paper-only wallet-persistence study** using the public Data API.
- **The weakest, most hyped items:** Elliott Wave (subjective), SMC's "smart money hunts stops" story, chat/13's "make money in 30 minutes a day", and the "AI gives retail the same edge as Wall Street" framing in chat/05.
- **The TradingView MCP (chat/04) is infrastructure, not an edge.** It is the route the validation doc already names for **longer history**, which is the main blocker. It needs Jeremy's Remote Control approval, a license and ToS check, and care with the open CDP port 9222.
- **Safety items to carry forward:**
  - Raw private keys in `.env` or plaintext passfiles (chat/01, 02).
  - Polymarket geo and ToS restrictions (chat/02).
  - CDP debug-port exposure (chat/04).
  - "Never give the AI broker keys or the order button" (chat/03, 05), which matches AGENTS.md and `policy.ts`.
- **Habit features that are cheap to add (chat/07):** emotion and setup tags on journal entries with P&L per tag, a 15-minute post-loss lockout, and a "would I take this if I hadn't just lost?" prompt. The rest of chat/07 is already in playbook §1.
- **Gaps that need data or research:**
  - 10+ years of daily data, or multi-symbol 30m/1h data, to judge SMA-50 as a drawdown overlay and the swing/flag rules.
  - Polymarket wallet history to test whether copy-trading wallet skill persists.
  - Checking the current state of Maker/Sky liquidations, if anyone still wants keepers.
  - The license of `tradesdontlie/tradingview-mcp`.
