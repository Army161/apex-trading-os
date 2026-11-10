# Batch 1 study: archive/chat/15 to chat/36

Read in full: all 22 files, word for word, in chunks to the end of each. Context checked against `docs/validation-results.md` and `docs/trading-playbook.md` (both dated 2026-11-10). Everything below treats the transcripts as data. Nothing was installed, fetched or cloned.

Rating key: high / medium / low / no = worth building in Apex.

---

## chat/15: RSI indicator course
- **What / category:** a YouTube "ultimate RSI course" by a TradingView-affiliate educator, using silver (daily and 1h) as the running example. Category: indicator-filter.
- **Concrete rules:**
  - Momentum candle: real body more than 2x the size of each of the previous 3 candles (3-4x preferred).
  - RSI(14) default; 70/30 overbought/oversold; most time is spent between 30 and 70.
  - Regime first: uptrend = higher highs + higher lows; downtrend = lower highs + lower lows; else range.
  - In trends, use RSI with a continuation bias: longs want RSI > 50 (pullbacks may dip to 40; below 40 = worry about reversal); shorts want RSI < 50 (at least < 60). RSI > 70 in an uptrend is strength, not a sell.
  - In a range, fade overbought/oversold as mean reversion, but only with a reversal candle (e.g. bearish engulfing after a wick above resistance) and not after a strong momentum-candle breakout. Entry at candle close, stop just past the high/low of the move, target the far side of the range or 1R.
  - "Regime shift": in an uptrend RSI should make higher lows; RSI breaking its prior low = warning (weakening or consolidation). Mirror for downtrends.
  - Divergence: regular bullish (price LL, RSI HL), regular bearish (price HH, RSI LH), hidden bullish (price HL, RSI LL, continuation), hidden bearish (price LH, RSI HH). Bullish uses lows, bearish uses highs.
  - Settings: 7-9 length for 1h and below (day trading); 21 for daily/swing; 80/20 bands to catch only extremes; optional SMA + Bollinger band on the RSI as a "normal range" envelope; TradingView's built-in "calculate divergence" toggle.
  - Worked example (silver 1h, RSI 7): bearish divergence + evening star + prior shooting-star resistance = 3 confluent signals; short at close, stop above pattern high, 1R target.
  - Risk: RSI is a condition, not an entry; fixed risk per trade; backtest and paper trade first.
- **Tools named:** TradingView (affiliate link: 30-day premium trial, $15 bonus), channel memberships (slides for members), the author's other courses (market structure, candlesticks).
- **Profit claims / evidence:** hand-picked chart examples on one silver chart ("could have made tons of money", "nice profit" on a 1R trade). No backtest, no sample size. Hindsight-selected; affiliate and course upsell.
- **Safety / legal:** none beyond affiliate disclosure.
- **Worth building? Medium (as a filter only).** The regime/RSI-50 bias and 2x momentum-candle rule are cheap filters. Already covered: `rsi_regime` (no edge, best 4/6 on QQQ 1d) and `rsi2_dip` (no edge); playbook section 3 already records "RSI over 70 alone is never a sell". Not yet tested: divergence + reversal-candle entry, the RSI-higher-low "regime shift" exit, and 7-length RSI on 1h. Worth one test as a filter on the `dave_prev_range` candidate, counting the extra tries.

## chat/16: MACD indicator course
- **What / category:** same educator's "free MACD course", examples on BTC daily and GBPUSD 1h. Category: indicator-filter.
- **Concrete rules:**
  - MACD line = EMA12 - EMA26; signal = 9-period average of the MACD line (he says SMA 9; TradingView's default is EMA); histogram = MACD - signal. MACD above zero exactly when EMA12 > EMA26.
  - Momentum candle: real body at least 2x the previous candles' bodies (same as chat/15).
  - Stated mistake: trading plain MACD/signal crossovers; on his BTC daily example most crosses were false signals. (Anecdote, not a test.)
  - Divergence on histogram (faster) or MACD line (more significant): regular bullish/bearish = reversal, hidden bullish/bearish = continuation; prefer clearly separated histogram "mountains"; triple divergence; equal price lows with higher MACD lows also counts.
  - Settings: Linda Raschke 3-10-16 (fast 3, slow 10, SMA oscillator, SMA signal, signal 16), faster but more false signals; 5-35-5 (use the line, not the histogram); histogram-only as a line; TradingView community "MACD Divergences" script (pivot lookback 5/5; lowering to 1 gives many false signals; signals confirm up to 5 bars late).
  - Worked example: downtrend channel, triple equal lows with higher 5-35-5 MACD lows, hammer + bullish engulfing, momentum candle breaking the channel = long; stop below the triple lows; target 2R (or 1.5R).
- **Tools named:** TradingView (same affiliate offer), community scripts by "David Tech" and another author, Linda Raschke and Adam Grimes named as users of 3-10-16.
- **Profit claims / evidence:** none quantified. One hand-picked trade example; "crossovers accumulate large losses" asserted from one chart. Course/affiliate upsell.
- **Safety / legal:** none.
- **Worth building? Low-medium.** Divergence + reversal-candle + structure break is a mechanisable entry, and 3-10-16 is a known public setting. Playbook section 3 already lists "plain MACD crossovers lose; use divergence plus a reversal candle" as **untested**. A cheap test would settle it; a pivot-based divergence detector would serve chat/15 and chat/16 both. Expect the usual problem: too few trades on daily bars.

## chat/17: Technical analysis master class
- **What / category:** same educator's beginner-to-advanced TA overview (candles, market structure, price action, indicators, chart patterns, risk). Examples on NVDA daily and silver daily. Category: strategy (confluence framework) plus risk-psychology.
- **Concrete rules:**
  - Structure: uptrend HH+HL, downtrend LH+LL, else range. Break of structure (BOS) = close past the last swing high (uptrend) or low (downtrend) = continuation. Change of character (CHoCH) = break of the last low (or high) that caused a BOS = first reversal clue; a reversal is confirmed only after two LH + LL (or HH + HL).
  - Candles: hammer = small body, lower wick at least 2x body, after a decline (best at support); shooting star = mirror at resistance; doji/spinning top = indecision; bullish/bearish engulfing = second body fully engulfs the first body after a move the other way (in gapless markets an open at the prior close is fine).
  - S/R drawn as zones, not lines.
  - Confluence entry: support + bullish candle (hammer) + RSI bullish divergence = long at close, stop below hammer low, 3R target. Engulfing at support: entry at close, stop below candle low or zone, 1.5R. Bull flag: impulse, small down-channel, breakout on a strong candle and high volume; entry at close, stop below the flag low, 1.5R.
  - Risk: risk 1-2% a trade; size = account risk / stop distance; aim for 2-3R; break-even win rate at 3R is 25% before fees; cut losers, let winners run; follow the plan.
  - Five-step process: trend/structure, S/R zones, price action, indicators/volume confirmation, risk management.
- **Tools named:** TradingView (affiliate trial + $15 bonus); his other YouTube courses.
- **Profit claims / evidence:** "a 70% win rate at 1:1 is a trade you always take" (hypothetical); hand-picked chart examples. No backtest. Course upsell.
- **Safety / legal:** none.
- **Worth building? Medium, and largely already built.** This is the source of the `confluence` strategy (structure, level, candle, momentum, context >= 60), which is the **closest** non-candidate result (SPY 4h, 49 trades, +15.1%, beat 85% of random traders, 4/6 checks). Risk rules are already enforced (playbook section 1). Remaining work: give `confluence` more data (more symbols or longer 4h history) to clear 50 trades, and count the try. The bull-flag + volume breakout is not separately tested.

## chat/18: Bollinger Bands course
- **What / category:** same educator's Bollinger Bands course; examples on EURUSD 15m and gold (XAUUSD) daily. Category: indicator-filter (with two setups).
- **Concrete rules:**
  - BB = SMA(20) middle, +/- 2 standard deviations. Wide bands = high volatility; contraction = low volatility.
  - Mistake: treating the bands (or the middle band) as support/resistance. In trends price "walks the band", so buying each lower-band touch in a downtrend compounds losses.
  - "Free bar" setup: a candle entirely outside the bands, wicks included = unusual volatility, an early reversal hint. Only trade it with confluence. Worked example (EURUSD 15m, BB 10/1.5): free bar + failure test (quick dip below support, sharp reversal) + dragonfly doji; enter at the close of the signal candle, stop below the free bar's low, 2R target.
  - Squeeze/breakout: bands contract, then a decisive close outside the band "with additional distance"; validate with a broken S/R level, a chart pattern (ascending triangle) and volume. Free bars right after a range breakout can mean trend strength, not reversal; bullish free bars after a range break = continuation.
  - Settings: 10 / 1.5 SD for day trading and scalping; 50 / 2.5 SD for swing (1h to daily) and longer; Keltner channels (EMA 20 +/- ATR multiple) are smoother alternatives, used for pullback continuation.
- **Tools named:** TradingView (Black Friday affiliate: 70% off, a month free, $15 bonus), channel memberships.
- **Profit claims / evidence:** two hand-picked examples ("locked in some nice profit"). No sample size. Affiliate and membership pitch.
- **Safety / legal:** none.
- **Worth building? Low-medium.** Squeeze is already built: `bb_squeeze` = **no edge** (171 trades across 7 sets, 1 of 7 profitable, best monkey 0.94 on GLD 1d with 5 trades). The "bands are not S/R" point is already in playbook section 3. The free-bar reversal (full candle outside 10/1.5 bands + failure test + reversal candle) is **untested** and overlaps `failure_test_2b` (no edge). It could be added as a single variant on intraday data, where it fires often enough to judge.

## chat/19: Wyckoff method course
- **What / category:** same educator's Wyckoff course (three laws, market cycle, accumulation/distribution events, volume, spring/upthrust trades). Category: strategy.
- **Concrete rules:**
  - Three laws: supply and demand; cause and effect ("the longer the base, the higher the space"); effort (volume) vs result (price). Price up + volume up = bullish; price down + volume down = bullish (weak selling); price up + volume down = bearish; price down + volume up = bearish.
  - Cycle: accumulation (range after a downtrend) -> markup -> distribution (range after an uptrend) -> markdown; re-accumulation and redistribution ranges inside trends.
  - Accumulation events: PS (first support, volume rises), SC (panic low near range bottom), AR (automatic rally), ST (retest of SC), spring (brief false break below support, sharp reversal). Distribution: PSY, BC, AR, ST, UT (false break above resistance).
  - Volume: breakouts need a volume rise; high volume at support = absorption (bullish), at resistance = distribution (bearish); volume climaxes mark turning points; low volume on pullbacks is healthy.
  - Spring trade: enter long on the candle close back "far above" support after the false break (best with a bullish engulfing); stop just below the spring low (tight, no exceptions); target just below the range high or 2R. Upthrust trade: the mirror, stop just above the UT high, target the range low.
  - Warnings: principles weaken on low timeframes and low-volume markets; wait for confirmation; don't expect textbook patterns; avoid overtrading.
- **Tools named:** none beyond TradingView implicitly; author's volume and footprint courses.
- **Profit claims / evidence:** none quantified. Diagrams and one example. Claims springs are "high probability" without data.
- **Safety / legal:** none.
- **Worth building? Low (already built, no edge).** `wyckoff_spring` = **no edge** (180 trades across 7 sets, 2 of 7 profitable, best monkey 0.73 on USO 1d with 4 trades, best 4/6 checks on EURUSD 1d). `failure_test_2b` and the sweep/`liq_*` family test the same false-break idea and also have no edge. One variant not yet tried: require a volume spike on the SC and below-average volume on the spring (effort vs result). Only worth it on intraday ETF data with real volume, and it counts as another try.

## chat/20: "Top 8 AI trading GitHub repos" ranking
- **What / category:** a creator's tier list of open-source AI trading repos, with a free "Skool" community setup prompt as the call to action. Category: tool-repo-product.
- **Concrete rules:** none (no trading rules). One prompt example: "find the best performing momentum strategy across NVDA, META, AAPL, MSFT, AMZN over the last 2 years, backtest with realistic fees, paper trade on Alpaca $100k" (Vibe Trading).
- **Tools / repos named (stars as quoted, licenses not stated):**
  - LLM Trading Lab (ChatGPT given ~$100 real money for 6 months on microcaps; "+24% after one month"), tier C.
  - Freqtrade (crypto bot since 2017, ~56k stars, 349 contributors, dry-run mode, backtesting, hyperopt/ML optimisation, Telegram control, CEX and DEX), tier B.
  - Daily Stock Analysis (~67k stars, Chinese-first; daily LLM report per ticker with buy/watch/sell, 0-100 score, levels, risk alerts, Telegram delivery; needs an LLM API key), tier A.
  - Day Trader skill (11 Claude skills: scanner, news, "time machine" replay, risk, broker/order executor, price alerts; one week old, untested by him), tier B. See chat/22.
  - AI Hedge Fund (~64k stars; LLM "Buffett/Munger/Burry/Cathie Wood" personas; Alpaca execution; Financial Datasets API), tier B, "elements of gimmick".
  - Vibe Trading (HKU lab, ~36.8k stars; plain-English research, backtest, Alpaca paper trading, multi-agent teams, memory), tier A.
  - Anthropic financial-services agents toolkit (~40.8k stars; meeting prep, market research, earnings review, valuation agents; paid data like FMP or Quiver for good data), tier A, does not trade.
  - TradingAgents (~117k stars; 12-agent "investment firm": analysts -> bull/bear researchers -> trader -> risk team -> manager; Alpaca execution), tier S.
  - Others: Alpaca (paper and live), Telegram, a "Grok bot" that scans GitHub daily.
- **Profit claims / evidence:** LLM Trading Lab's "+24% after one month" is one month of one ~$100 account (no significance; he himself says nothing suggests long-run profit). No performance shown for any other repo; rankings are by stars, features and ease of setup. Creator funnel (free Skool asset library).
- **Safety / legal:** pasting a third-party "install everything" prompt into an agent is a supply-chain risk; several repos can place live orders via Alpaca or exchange keys. Licenses not checked in the video (AGENTS.md requires a license check; no AGPL/GPL copying).
- **Worth building? Low as products; medium as reference designs.** Apex already has paper bots, an Alpaca paper bot (`bots/alpaca/`), the six-check validator and a hard no-order-tools policy for agents. Useful ideas to borrow without code: Freqtrade's dry-run/backtest/hyperopt split (but count tries), a daily per-watchlist LLM digest (analysis only, no signals promoted without validation), and the bull/bear debate structure as an analysis aid. None of these repos shows an edge; "LLM picks stocks" has no evidence here.

## chat/21: Herder terminal multiplexer (NetworkChuck)
- **What / category:** a sponsored (HPE Networking) walkthrough of Herder, a tmux-like, mouse-first terminal built for AI agents. Category: infrastructure-ops.
- **Concrete rules:** none (no trading content).
- **Tools named:** Herder (install from herder.dev via a curl/PowerShell one-liner; persistent background server; panes/tabs/workspaces; agent status filters done/blocked/working/idle; toast and sound notifications; "remote herder" over SSH; an agent skill/CLI/API that lets agents open panes, start other agents (Codex, Gemini, Grok, Antigravity, Hermes, Claude) and message each other; git worktree support; sessions resume after a reboot). Also Whisper Flow (dictation), tmux. License and cost not stated.
- **Profit claims / evidence:** none.
- **Safety / legal:** curl-pipe install from a new domain; an agent-controllable terminal that can spawn other agents and reach other machines over SSH widens the blast radius (an agent could start sessions on any SSH-reachable host). Sponsored segment.
- **Worth building? No.** Pure developer ergonomics. Apex runs as remote cloud sessions and already coordinates agents through the project; a multiplexer adds no trading value and adds agent-to-agent control paths that would need the same policy guards as `web/lib/policy.ts`. At most, the "notify when an agent is blocked or done" idea is already covered by the platform.

## chat/22: "Day Trader" Claude skill pack
- **What / category:** a YouTuber's walkthrough of a free GitHub pack of 11 Claude skills for US day trading (author named as Jake Schincariol, "almost 6,000 likes"). Category: tool-repo-product (with one concrete strategy).
- **Concrete rules:**
  - Four "desks": (1) scanner (opening-range breakout, flags, oversold bounces across Nasdaq Trader's ticker list), news monitor, earnings analyser (SEC EDGAR), "Pelosi tracker" (House Clerk disclosures); (2) entry timer, exit planner; (3) "time machine" replay, budget manager, risk manager; (4) price alert, order executor.
  - Worked opening-range breakout (ORB) on TSLA, 19 Oct (5m bars): opening range of the first "50 minutes" (as transcribed; likely 30 or 60) ~$354-362; trigger = 5m close ~0.5% above the range top (364.18); stop = middle of the range (358, $5.86 risk); target = 1R (370); hard exit 15:55 NY; no overnight hold through earnings.
  - Sizing: $8,000 account, $50 risk cap -> 50 / 5.86 = 8 shares (~$2,900).
  - Risk manager checks: max loss, daily loss limit, trades per day, reward:risk, entry window, position size, cash. Order goes out only as one bracket order after the user types "yes" and then approves a second Claude Code permission card; Alpaca paper by default.
  - Presenter's own advice: R:R 3:1 to 4:1; start on paper.
- **Tools named:** the Day Trader skill (free, open source, Python standard library only); data from Yahoo Finance (unofficial, can lag), Nasdaq Trader, SEC EDGAR (needs a name and email as User-Agent), House Clerk; Alpaca paper; Interactive Brokers mentioned; Finviz; "Bloomberg costs $30,000" comparison. License not stated.
- **Profit claims / evidence:** the strongest evidence in the batch, and it is negative. The skill's own "time machine" (10,000 replays from 59 sessions of 5m bars): 29% hit target first, 25% stopped, 45% still open at the close. Real history over those 59 sessions: the setup fired 33 times, 13 targets, 15 stops, 5 neither. The presenter calls it "a coin flip". At a 1R target that is negative expectancy before fees. Sample is tiny (33 trades, one ticker). "Pelosi made ~50% last year" is hearsay, and disclosures lag up to 45 days. Hype title ("Claude just killed traders") versus a sober disclaimer ("most day traders lose money").
- **Safety / legal:** he suggests pasting a broker token into chat so Claude writes it into config files: this breaks the Apex rule (keys only in env vars Jeremy sets). Broker connector must be set to "needs approval", never "always allow". Free data lags; stops can fill well past price in fast markets. SEC requires a User-Agent with contact details (Apex uses the `SEC_USER_AGENT` env var).
- **Worth building? Medium, and already built.** `bots/alpaca/daytrader/desk.py` rebuilds this pack on the Apex engine (ORB long/short with a VWAP-aware stop, paper only); `bots/alpaca/daytrader/insider.py` covers the insider idea. But **ORB does not appear in `docs/validation-results.md`**, so it has not been run through the six checks. Next step: run ORB on SPY/QQQ/IWM 30m (the shortest bars we have; the source uses 5m) with the 15:55 exit and both 1R and 2R targets. The source's own 33-trade record says expect no edge.

## chat/23: TradeWiz Solana copy-trading settings
- **What / category:** an affiliate creator's settings guide for the TradeWiz copy-trading bot/web app (Solana and BNB memecoins on pump.fun and bonk). Category: strategy (copy trading) via a tool-repo-product.
- **Concrete rules:**
  - Wallet selection: longer average hold time; fewer buy transactions than sell transactions (conviction plays that scale out); check P&L curve, calendar, win rate. Warning: many "smart money" wallets use copiers as exit liquidity.
  - Sizing: fixed (e.g. 1 SOL a buy) or buy ratio (e.g. 50% of the target's size). Copy sells on.
  - Launchpads: pump and bonk only.
  - Execution: 35% buy and sell slippage; priority fee 0.001 SOL and tip 0.001 SOL minimum; optional paid "anti-MEV".
  - Filters: min market cap 10k (or 50k/100k), token age min/max, no duplicate buys, anti-PVP (stop copying a wallet that buys and sells rapidly).
  - Exits: sell 50% at 2x, or 80% at 2x with a 20% moon bag, or 100% at 2x; trailing stop that moves to +20% after a 100% gain.
  - "Only copy dev create": snipe chosen devs' launches; claim "get in at 5-6k mcap, easy 2-3x".
- **Tools named:** TradeWiz (Telegram login then web app; affiliate link; claims ~1.1 s average execution, "fastest"), Solana, BNB chain, pump.fun, bonk, X (daily memecoin P&Ls).
- **Profit claims / evidence:** "a lot of you started making consistent profits"; "easy 2-3x" on dev snipes. No numbers, no track record, no screenshots shown in the transcript. Affiliate marketing. Survivorship (only winners report back).
- **Safety / legal:** custodial or semi-custodial bot wallet (key held by a third-party app; Telegram login). Memecoins: rugs, honeypots, mint/freeze authority, insider bundles. 35% slippage invites sandwiching. Dev sniping is where most rugs happen.
- **Worth building? Low, and already built.** `bots/solana-copy` implements every video rule in paper mode against real Jupiter quotes, with hard caps the video lacks (50% stop, position and daily-loss limits, kill switch) and deliberately skips dev sniping and paid anti-MEV. It has no validation result in `docs/validation-results.md`; the honest next step is a weeks-long paper log per wallet scored on P&L after fees and slippage. Do not move it toward live money on this evidence.

## chat/24: Delta Exchange AI algo terminal
- **What / category:** an Indian creator's demo of a self-built algo terminal for Delta Exchange (crypto options) with an LLM strategy builder he calls "DIA". Category: tool-repo-product (plus one sample strategy).
- **Concrete rules:**
  - Built-in option strategies: short strangle, straddle, iron fly, iron condor, with editable entry and exit times.
  - Sample prompt: buy the ATM BTCUSD weekly call when a 15m candle closes above Supertrend, buy the ATM put when it closes below; stop 10%, target 30% (of premium). Supertrend default ATR 10, multiplier 3; edited to ATR 20, x2, stop 15%, target 45%.
  - Workflow: describe in English -> LLM writes rules -> save -> deploy to paper -> then live; pause / stop / total exit controls; per-strategy P&L curve, realised/unrealised, fees, fill count, win rate.
- **Tools named:** Delta Exchange (API key), Zerodha, Upstox, FYERS ("FIA" assistant), ChatGPT ("sign in with ChatGPT", model names as shown), Claude API, Telegram bot (token, slash commands for positions/orders/P&L), WhatsApp. Build guide PDF given for an Instagram follow/DM.
- **Profit claims / evidence:** none. No results shown for any strategy.
- **Safety / legal:** exchange API keys and LLM keys stored in the app's settings page; one-toggle paper-to-live switch; LLM-generated strategies deployed without validation; short straddles/strangles carry unlimited or large tail risk; Telegram bot tokens. Lead-magnet funnel.
- **Worth building? Medium, and already built.** Apex's Strategies tab and `web/lib/builder.ts` (plain English -> validated Spec, with a purpose check) came from this video, and `supertrend` (Supertrend 10/3 flip, chat/24) is registered: **no edge** (245 trades across 7 sets, 1 of 7 profitable, best 3/6 on BTC 1d). The useful difference Apex adds is the six-check gate between "AI wrote a rule" and "deploy". The option-selling templates are untested and need options data we don't have; no live toggle should be added.

## chat/25: AI trading analyst team in Claude Code
- **What / category:** a creator ("Zubar", AI-agency community owner) shows a free zip of 16 Claude Code skills / 5 parallel agents that produce a stock research PDF. Category: tool-repo-product (research only).
- **Concrete rules:** none mechanical. Pipeline: discovery (web search for price, market cap, news) -> 5 parallel agents (technical, fundamental, sentiment, risk, thesis synthesis) -> weighted score out of 100 plus entry zone, stop, three targets, position size, scaling plan, R:R, risk matrix (probability x impact x mitigation), catalyst timeline. Commands include `/trade-analyze`, `/trade-quick` (60-second snapshot), technicals, fundamentals, sentiment, head-to-head compare, options. Examples: NVDA 78/100 "strong conviction", TSLA 43/100 "caution", RIVN "hold, wait for a break above $15.72 or a pullback to $13".
- **Tools named:** Claude Code (paid subscription), VS Code, the author's free Skool community (zip download) and paid community (private GitHub repo, "build and sell" course, AI agency, GEO agency). License not stated.
- **Profit claims / evidence:** none. Scores are LLM output from web search; no backtest of whether the score predicts returns. The video says itself it is a research tool, not advice. Funnel to a paid community.
- **Safety / legal:** web-search data can be stale or wrong (LLM-assembled metrics like "net margin 55%" are unverified); a confident 0-100 score invites over-trust.
- **Worth building? Low (already built).** `bots/research-council/analyst_team.py` was built from this video (technical/fundamental/sentiment/risk/thesis lenses, plus optional persona lenses). The missing piece is evidence: log each score with a timestamp and check later whether high scores beat low scores (an information-coefficient test) before anyone trades on them.

## chat/26: FinceptTerminal repo audit
- **What / category:** a sober code audit of FinceptTerminal ("free Bloomberg"), with the video's links. Category: tool-repo-product.
- **Concrete rules:** none.
- **Tools named:** FinceptTerminal (~21k stars, ~3k forks, active; native C++/Qt desktop app with embedded Python; ~800 MB repo; cmake build; **AGPL-3.0 dual-licensed with a commercial option**). 100+ data connectors that are all free public feeds (Yahoo Finance, Polygon, Kraken, FRED, IMF, World Bank, DBnomics, AkShare, government APIs); no proprietary feeds, no Level 2, no dealer chat. 16 broker integrations (IBKR, Alpaca, Tradier, Saxo + 12 Indian: Zerodha, Angel One, Upstox, Groww...). A real `src/mcp` layer (~140 KB C++: client, provider, marketplace, bridge, tool retriever, schema validator). 37 LLM persona agents (Buffett, Graham, Lynch, Munger, Klarman, Marks) across OpenAI, Anthropic, Gemini, Groq, DeepSeek, MiniMax, OpenRouter, Ollama. 54 screens incl. maritime tracking, satellite data, geopolitics, a Polymarket screen, a node editor. Bloomberg ~$27-30k a seat a year.
- **Profit claims / evidence:** none; the auditor rejects the "Bloomberg killer" marketing (free UI is not a data moat).
- **Safety / legal:** AGPL-3.0: forking into a paid SaaS forces open-sourcing or buying a licence. Maintenance risk (v4 in 21 months). Live order routing to 16 brokers.
- **Worth building? Medium for the idea, no for the code.** Already acted on: `mcp-server/` (Apex engine exposed as MCP tools, written from scratch, no Fincept code) and the persona lenses in `bots/research-council`. AGENTS.md already bans copying AGPL code. No further build needed; the persona agents are research aids, not signals.

## chat/27: AI trading assistant bots (Grok bots)
- **What / category:** a trading-community host ("Ricky, Tech Solutions", "LPP team") shows three chat bots built in a $25/month Grok-based bot builder. The second half of the file repeats the chat/26 Fincept transcript word for word. Category: tool-repo-product / risk-psychology.
- **Concrete rules:**
  - "Bitcoin Watcher": each morning before the open, a simple brief on what moves BTC (gaps, earnings pre/after market, economic releases, market-moving posts). Synced to Discord for his community.
  - "Deal Seeker": every Friday, scan for good public companies oversold on higher timeframes; list 25, summarise the top 5 for manual review.
  - "Risk Mitigator": enforce a 3:1 reward:risk "golden ratio" (3% potential reward to 1% potential loss); be contrarian and conservative on shorts; always present the downside. Sample advice it gave on QQQ near all-time highs: wait for a hold above the high on strong volume, or a pullback to the 20-day MA without breaking structure; ask "would you be fine if it dropped 20% tomorrow?".
- **Tools named:** a Grok-based bot product ($25/month, affiliate link "first link in the description"), Discord, his paid community.
- **Profit claims / evidence:** none. "Less than a dollar a day" cost framing; affiliate.
- **Safety / legal:** hints it "can trade for me" (not shown). Sharing bot output to a paid Discord could be unlicensed advice depending on jurisdiction.
- **Worth building? Low (already built).** The Assistants tab (`web/components/Assistants.tsx`) already has the morning brief, Friday Deal Seeker and Risk Mitigator chat from this video. The 3:1 check is a habit already covered by playbook section 2 (2R default). "Oversold on higher timeframes" is unproven as a screen (`rsi2_dip`, `rsi_regime`: no edge).

## chat/28: "Reverse Engineer Anything" + Jarvis
- **What / category:** the chat/25 creator wires a GitHub repo, "Reverse Engineer Anything" (REA), into his personal assistant "Jarvis" (Anthropic API) to tear down a website (igloo.inc: Three.js, GSAP ScrollTrigger, post-processing) and the macOS Notes app, then rebuild a Notes clone in ~15 minutes. Category: infrastructure-ops / misc.
- **Concrete rules:** none for trading. REA flow: agent opens the target in a clean browser (or app), REA watches via Chrome DevTools-style inspection (requests, loaded code, assets), writes an evidence-backed teardown (stack, how effects work, rebuild notes) to long-term memory; the builder (Claude Code) then uses it as a blueprint.
- **Tools named:** REA repo (license not stated), Jarvis (his own assistant; "Opus 5.5" brain, switchable; has a phone number and can text), Claude Code, "GPT-6 Astra" (as named), Chrome DevTools, Three.js, GSAP, Svelte, Draco/Basis transcoders, AppKit. Free Skool prompt pack; finished Jarvis in a paid community.
- **Profit claims / evidence:** none.
- **Safety / legal:** cloning another product's look and features can breach copyright, trade dress or terms of service; AGENTS.md already says "never clone another product's look". An assistant with phone/SMS and file access is a broad permission surface.
- **Worth building? No.** Not trading-related, and cloning products conflicts with Apex rules. The only reusable idea (save an evidence-backed teardown to memory before building) is already how Apex studies sources.

## chat/29: Open Jarvis local assistant
- **What / category:** a how-to for installing the open-source "Open Jarvis" assistant via Claude Code, with free NVIDIA-hosted models, optional Ollama (local) or Claude API, local speech, and a Slack bridge to reach it from a phone. Category: infrastructure-ops.
- **Concrete rules:** none for trading. Practical rules worth keeping: treat API keys like passwords (never in chat or screenshots); start file access with one test folder; read integration scopes (e.g. read-only email, not send); a claude.ai subscription does not cover API usage; set a billing alert; the PC must stay on for the Slack bridge.
- **Tools named:** Open Jarvis (GitHub, free; license not stated), Claude Code, build.nvidia.com free API keys (models as named: Nemotron 3 Super, GLM 5.3 Flash, Nemotron 3.5 Lightning, GPT-OSS 20B), Ollama, Anthropic Console (from $5 credits, pay per use), local speech-to-text/text-to-speech, Slack app manifest with Socket Mode (`xoxb-` bot token, `xapp-` app token with `connections:write`). Free WhatsApp community for prompts.
- **Profit claims / evidence:** none.
- **Safety / legal:** a local agent with file read/write and optional command execution, reachable from Slack, is a remote-control channel into a PC; Slack tokens grant that access; free-tier hosted models see your prompts.
- **Worth building? Low (ideas already taken).** Apex already took voice in/out (`web/components/voice.tsx`) and AI spend tracking (`web/lib/usage.ts`, from the billing-alert advice) from this video, and `web/lib/gateway.ts` already keeps the model swappable. A Slack/phone bridge would only be worth it read-only (alerts and briefs out), never as an inbound command path to bots.

## chat/30: FinceptTerminal walkthrough
- **What / category:** a promotional walkthrough of the same FinceptTerminal (found via a TikTok "10 GitHub repos that shouldn't be free" carousel). Category: tool-repo-product.
- **Concrete rules:** none.
- **Tools named:** FinceptTerminal v4.5.1 (13 Oct release; ~33k stars, ~4.7k forks; C++20 + Qt 6 with embedded Python 3.11; ~340k lines of C++, 400+ Python scripts, 54 screens). Features: DCF, portfolio optimisation, VaR, Sharpe, derivatives pricing, fixed income, an 18-module QuantLib suite; 37 agents (Buffett/Graham/Lynch/Munger personas); BYO keys for OpenAI, Anthropic, Gemini, Groq, DeepSeek, OpenRouter, or Ollama; 100+ connectors (FRED, IMF, World Bank, Polygon, Kraken, Yahoo); paper trading engine; 16 brokers; node editor; MCP tools; "AI quant lab" (factor discovery, backtesting, RL); maritime and geopolitics screens; keys in encrypted local storage; paid enterprise edition.
- **Licence conflict:** this video says "GPL 3.0"; chat/26 (reading the LICENSE file) says **AGPL-3.0 dual-licensed**. Either way it is copyleft; Apex treats it as AGPL and copies nothing.
- **Profit claims / evidence:** none ("not financial advice"). Star count is the only evidence offered.
- **Safety / legal:** copyleft licence; installer binaries from a fast-moving repo; live broker routing.
- **Worth building? Low (ideas already taken).** Same verdict as chat/26. The persona lenses (`bots/research-council`, `--personas`) and the MCP server already came from these two videos. A DCF/fundamentals screen could be written from scratch later if Apex ever does long-horizon investing; it is not a trading edge.

## chat/31: "Seven GitHub repos for AI"
- **What / category:** a creator ("Jack") lists seven AI tools, with a course upsell. Category: tool-repo-product / infrastructure-ops.
- **Concrete rules:** none for trading. One process rule: for big decisions (about 10% of work), have one model draft a plan and a second model look for weak spots ("Claudex loop").
- **Tools named (licenses not stated):** God's Eye View (globe of live flights incl. military, ships, satellites, earthquakes, public cameras; voice "take me to the Pentagon", cockpit mode, local radio); NVIDIA SkillSpector (~17k stars; scans agent skills for hidden instructions, unsafe access and data leaks, gives a risk score); Floot (one-click publish of chat-built apps with auth, forms, DB; free tier; affiliate link); SlopMonster (his own anti-AI-slop rewriter scoring vocabulary, constructions, punctuation, cadence, rule-of-three, plus sales-copy principles from Krug, Priestley, Hormozi); Claudex loop (Claude + Codex cross-review); DeepSeek harness (DeepSeek's own agent harness with files, terminal, browser; cheap "V4.1" model); Archify (plain English to architecture diagrams, free); Glaido (speech-to-text, promo code). Paid "mastering ChatGPT Astra" course.
- **Profit claims / evidence:** none.
- **Safety / legal:** God's Eye View aggregates surveillance-style data (military flights, cameras), so ToS and privacy concerns. SkillSpector is the one security-positive item: skills and prompt packs from these videos are an injection risk. Some links are truncated or affiliate shorteners.
- **Worth building? Low, one idea already taken.** `web/lib/review.ts` already implements the "one model drafts, another looks for weak spots" second opinion from this video. Worth adopting as process (not a build): scan any third-party skill or prompt pack before it touches the repo, SkillSpector-style. The rest is unrelated to trading.

## chat/32: "Seven repos to supercharge Claude"
- **What / category:** the chat/20 creator ("AI Edge") lists seven repos/MCPs with a Skool one-shot install prompt. Category: tool-repo-product / business-money.
- **Concrete rules:** none for trading. Process ideas: chain skills so each step reads the one before (office hours -> CEO plan review -> engineering manager -> QA -> review); get a second-model code review; write SOPs, diagram them, then automate pieces.
- **Tools named (stars as quoted, licenses not stated):** last30days (social research across Reddit, X, YouTube, Hacker News, Polymarket and web, "scored by upvotes, likes and real money"; 140 contributors); Microsoft Playwright MCP (browser automation through accessibility snapshots, headless, stays logged in); Claude Ads (~9.3k stars; 11 agents audit Meta/YouTube/etc. ads, health score, ranked fixes, budget plans); Archify (~64.4k stars as quoted, diagrams to HTML; chat/31 says free); Gary Tan's gstack (~133k stars; 23 opinionated role skills incl. `/office-hours`, `/plan-ceo-review`, `/codex` second opinion, `/careful` guardrails, iOS QA); Agency Agents (~152k stars, 124 contributors, ~279 role agents across engineering, design, paid media, sales, finance...); Buzz (Jack Dorsey; Slack-like workspace for humans and agents with a CLI bridge). Also Higgsfield MCP, Whisper Flow, Vercel, Notion.
- **Profit claims / evidence:** none; popularity (stars) only. "Hedge fund using pro quant strategies in your pocket" is an unsupported aside.
- **Safety / legal:** one-shot installers of hundreds of third-party skills = prompt-injection and supply-chain risk (see SkillSpector in chat/31). Playwright MCP that "stays logged in" holds live sessions. Scraping YouTube/X/Reddit may breach ToS.
- **Worth building? Low (one idea already taken).** `web/lib/review.ts` already runs the owner -> engineer -> QA review chain from this video. last30days-style social sentiment could feed research, but it has no tested link to returns; it would need the same score-then-check-later logging as chat/25. Ads and agency tooling are business-money ideas outside trading (see `docs/business-models.md`).

## chat/33: "Fable 5.2" prompt ideas
- **What / category:** a startup-podcast host's list of 11 prompts for a new Claude model ("Fable 5.2"), pitched as ways to make money. Category: business-money.
- **Concrete rules (prompts, not trading rules):** (1) audit the whole business, keep a running log, return the 10 changes most likely to make money with evidence; (2) do a freelance job end to end, say which parts need a human, quote a fixed price; (3) one sub-agent per niche across 100 niches (top complaints, what they pay, reachability); (4) rebuild a client's 12-year-old spreadsheet as a web app plus a staff guide; (5) deal checker for buying a small business: mark each P&L number verified / unverified / suspicious and list 15 questions; (6) "grill me": 20 one-at-a-time questions turned into a skill file; (7) operate an old app with no API (export invoices, reconcile against the bank statement, ask before sending); (8) red-team a quarterly plan as an investor who wants to pass; (9) short-form video editor; (10) 60-second animated explainers with 5 hook variants; (11) one episode into every format (PDF, tweets, newsletter, mini tool) and flag unverified claims; (12) design a single-purpose hardware device (BOM with prices, circuit, firmware, printable enclosure, cost for 100 units).
- **Tools named:** Claude ("Fable 5.2", Max plan), Upwork (example job: equity research report, $450 fixed), Shopify, Blender, DaVinci; Anthropic blog figure quoted as "real freelance score 21% -> 41%" (unverified here).
- **Profit claims / evidence:** none measured. "Faceless explainer channels for $1-5 a video" and "sell results as a productized service" are opinions. Like-gated prompt giveaway.
- **Safety / legal:** delivering client work produced by an AI without disclosure may breach platform terms (Upwork) or client contracts; financial/legal outputs need human checks (he says so).
- **Worth building? Low for trading; medium as business ideas.** Already taken: `web/lib/review.ts` runs the review on Fable 5.2 because "it runs rarely and matters most". For Apex, the useful prompts are (8) red-team a strategy before promotion (fits the six-check gate) and (5)'s verified / unverified / suspicious labelling, which matches how this study tags claims. Freelance and content plays belong in `docs/business-models.md`, not the trading engine.

## chat/34: Five things pros do with Claude
- **What / category:** a clear engineering-practice video on directing AI agents. Category: infrastructure-ops.
- **Concrete rules (process, not trading):** (1) define the outcome: have the agent interview you, restate the goal and wait for approval; (2) write a proportionate spec (goals, requirements, constraints, non-goals, open decisions) with the human deciding scope (Karpathy cited); (3) turn the spec into tests before building, and the agent runs them before saying "done"; (4) break big work into checkpoints, each with a piece of work, a test and a stop for review; (5) Git: commit working versions, restore when something breaks, push to GitHub (commit before push).
- **Tools named:** Claude Code, Cowork, Codex, Git, GitHub.
- **Profit claims / evidence:** none (none made).
- **Safety / legal:** none; the method reduces risk.
- **Worth building? Medium as process; already largely in place.** Apex's AGENTS.md checks (`tsc`, `npm test`, `drift_check.py`), `docs/how-to-direct-apex-agents.md` (design doc and fresh-eyes review) and `docs/specs/` already cover outcome, spec, tests and checkpoints. The trading-specific version is the one that matters: write the strategy spec and its six checks before coding the rule, and lock it (incubation) before looking at results.

## chat/35: Honcho evolving second brain
- **What / category:** a creator explains agent memory and sets up Honcho (open-source memory service) locally with Claude hooks. Category: infrastructure-ops.
- **Concrete rules (memory design, not trading):** four memory problems: single-session recall, knowledge updates (newer facts replace older ones), multi-session linking, temporal reasoning (when was it said, is it still true). Obsidian links are not memory (no reasoning, stale and contradictory notes both persist). Honcho: one shared brain for all tools; "peer cards" per person/agent ("diachronic identity"); nightly "dreaming" that reasons over raw chats into conclusions (can use a cheap model such as Haiku on a schedule); capture via **hooks** (session start, each message, after tool use, before compaction, session end), because a hook always fires while an agent-called memory tool often gets forgotten.
- **Tools named:** Honcho (GitHub, open source; self-host free or a cloud version; Neuromancer fine-tuned model optional), Claude desktop app, Claude Code, Codex, OpenCode, Hermes agent, Obsidian. **License not stated in the video; AGENTS.md records Honcho as AGPL/GPL, so no code copying.**
- **Profit claims / evidence:** none.
- **Safety / legal:** he calls it "dangerous": one store holding everything from every tool is a high-value target; self-host for privacy. Capturing other people's messages into peer cards raises consent and privacy issues.
- **Worth building? Low (already built).** `web/app/api/memory/route.ts` (facts with history, remember/retire/forget) and `web/app/api/cron/dream/route.ts` (nightly dream into dated facts) came from this video, written from scratch. For trading, the one useful rule is temporal: a journal or strategy note must carry its date and be retired when a later test supersedes it, so agents never cite a stale "edge".

## chat/36: "Delete 90% of your skills"
- **What / category:** a creator ("David Andre", maker of the Cloudroom agent IDE) argues against hoarding copied agent skills; sponsored by CodeRabbit. Category: infrastructure-ops.
- **Concrete rules (process):** skill descriptions load into every message, so hundreds of skills waste tokens and confuse agents; broad descriptions over-trigger and load whole bodies. Keep as few skills as possible; prefer specialised project skills over global ones. Copy skills only from credible sources (e.g. Cloudflare's security-audit skill) and preferably run them once in an isolated sandbox rather than install them forever; random skills can carry prompt injection, especially against weaker local models. Run a usage audit across past sessions and delete the least used. His five: cross-model review (Claude builds, GPT reviews medium/large changes, not every small push); a single web/scrape API skill; "state" (where are we, % done, short); "stop overthinking" (only serious issues block; otherwise proceed); "show me designs" (inline UI renders). Skills = SOPs; a team's best person writes them into shared repos. Agent loops: ~90% ask for approval, ~10% (the obvious, safe ones) run on their own.
- **Tools named:** his public skills repo (~4k stars, free), Cloudroom (his free open-source ADE with cloud agents and loops), CodeRabbit (sponsor; 14-day free trial), Cloudflare security-audit skill, "Deep API" (web search/scrape/email/research), Codex, Claude Code, Hermes, Pi, Cursor, OpenCode, Kimi. A $200 Codex plan mentioned. Mocks a third-party "Karpathy skills" repo as not actually Karpathy's.
- **Profit claims / evidence:** none; "a cross-model review catches 95% of bugs" is an unmeasured claim. Self-promotion of Cloudroom throughout.
- **Safety / legal:** the strongest security points in the batch: prompt injection in copied skills; keep `.agents/skills` clean; isolate one-off third-party audits.
- **Worth building? Low (already built).** `web/lib/review.ts` already applies "stop overthinking" (a block without a high-severity issue becomes a concern) and the cross-model review. Worth carrying into Apex policy: no third-party skill or prompt pack is installed without a scan, and "high-severity only blocks" must never apply to the trading gate (the six checks stay hard).

---

## Batch themes
- **Indicator courses (15-19) give filters, not edges.** All come from one TradingView-affiliate educator, use hand-picked charts, and quote no sample sizes. Their testable parts are already built and failed: `rsi_regime`, `rsi2_dip`, `bb_squeeze`, `wyckoff_spring` and `failure_test_2b` show **no edge**. `confluence` (from chat/17) is the closest: 49 trades, beat 85% of random traders.
- **Divergence + reversal candle** (chat/15 and chat/16) is the one indicator idea still untested. One pivot-based detector would cover RSI and MACD both. Expect too few trades on daily bars; test it on 30m/1h.
- **The strongest evidence in the batch is negative.** The chat/22 skill's own replay of its ORB setup: 33 trades, 13 targets, 15 stops, 5 neither, at a 1R target. That is a coin flip or worse before fees. ORB is coded in `bots/alpaca/daytrader/desk.py` but has **not** been through the six checks. Run it.
- **Most of the batch is tool marketing**: star counts, Skool or Discord funnels, affiliate links (TradeWiz, Grok bots, Floot, Glaido), sponsored segments (HPE, CodeRabbit). Not one repo shows a verified track record. LLM Trading Lab's "+24% in one month" is one month of about $100.
- **Most-hyped weak items:** "AI hedge fund in your pocket" (chat/20, 32), TradeWiz "consistent profits" and "easy 2-3x" dev snipes (chat/23), "Pelosi made ~50%" (chat/22), LLM conviction scores like NVDA 78/100 (chat/25). None was tested against returns.
- **Already built from this batch:** the day-trader desk, the Solana copy bot (paper, hard caps), the research council with personas, the MCP server, the strategy builder, the Assistants tab, voice, usage tracking, the review chain, and memory plus dream. The gap is validation, not features.
- **Recurring safety theme:** keys pasted into chat or app settings (chat/22, 24, 29), one-toggle paper-to-live switches (chat/24), custodial memecoin bots (chat/23), and prompt injection through copied skills and one-shot install prompts (chat/31, 32, 36). Apex rules already block these; keep a skill scan before any install.
- **Licence:** Fincept is copyleft (chat/26 says AGPL-3.0 dual licence; chat/30 says GPL-3.0). Honcho is recorded in AGENTS.md as AGPL/GPL. Copy ideas only, never code.
- **Process ideas worth keeping:** spec, then tests, then checkpoints, then git (chat/34); cross-model review (chat/31, 36); red-team a plan as a skeptical investor (chat/33); temporal memory that retires stale facts (chat/35). Applied to trading: lock the strategy spec and its checks before seeing results.
- **Data gaps to research:** 5m/15m intraday bars for ORB and chat/15's RSI-7 day trading; real volume for the Wyckoff effort-vs-result variant; options chains for chat/24's straddle and strangle templates; a forward log of LLM research scores to measure their information coefficient; weeks of paper fills per copied Solana wallet.
- **Recommended next actions, in order:** (1) run ORB through `validate.ts` on SPY/QQQ/IWM 30m; (2) add one divergence + reversal-candle variant; (3) start a timestamped score log for `analyst_team.py`. Count every try in the deflated-Sharpe tally.
