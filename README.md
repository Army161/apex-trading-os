# Apex Trading OS

One repo for every bot, strategy and tool built from Jeremy's 46 transcripts and uploads.
**Everything starts in paper/test mode.** No strategy here is guaranteed to make money; backtests are shown as they are.

| Folder | What it is |
|---|---|
| `archive/` | Every source saved word for word (`chat/01-31`, `uploads/01-15`), an `INDEX.md`, and rule notes per source |
| `engine/` | Python backtest engine: 22 strategies (incl. Supertrend), confluence score, walk-forward, Monte Carlo, risk guard, paper trader, CLI. `pytest` runs 50 tests including planted-edge, noise and look-ahead checks |
| `web/` | Next.js dashboard: command center, kill switch, **Strategies** (AI builder: plain English to tested rules, edit, deploy/pause/stop to paper, per-strategy chart and P&L), Strategy Lab, signals, psychology journal, AI council, **Assistants** (morning brief, Friday Deal Seeker, investor lenses, FRED macro panel, Risk Mitigator chat), Apex AI chat with voice in/out, Telegram bot (/positions /orders /pnl and free-text chat with Apex AI from your phone), a second opinion from a different model before any strategy is flagged live, AI spend tracking with a daily budget, shared candle cache, system map, source library |
| `bots/freqtrade/` | Freqtrade config (dry run) with ApexTurtle and ApexConfluence strategies |
| `bots/polymarket-copy/` | Polymarket copy bot with paper fills against the real order book and a wallet scorer |
| `bots/solana-copy/` | Solana memecoin copy bot (pump/bonk) from the Trade Wiz video: wallet scorer, anti-PVP, filters, 80%-at-2x ladder, trailing stop; paper fills on real Jupiter quotes |
| `bots/maker-clip-keeper/` | Modern Maker/Sky Liquidations 2.0 (Dog/Clipper) keeper, watch-only by default |
| `bots/alpaca/` | Nightly core QQQ/GLD rotation + RSI2 dip + 50/20 breakout system, and the 11-skill day trader desk (paper forced) |
| `bots/research-council/` | Two Claude research desks that post proposals for approval and never execute: the debate desk (`council.py`) and the analyst team (`analyst_team.py`: web discovery, 5 parallel analysts, weighted 0-100 score, deep-value/quality/growth/inversion/macro lenses compared side by side, 3-target plan with code-enforced sizing and R:R, risk matrix, Markdown report, quick and compare modes) |
| `mcp-server/` | Apex MCP server: Claude Desktop or Claude Code can call the engine (list strategies, backtest, walk-forward leaderboard, scan, dashboard status). Read-only, no order tools |
| `tools/skill_scan.py` | Safety scan for any skill, plugin or MCP server before you install it: hidden instructions, secret/wallet access, data sent out, curl-into-shell, destructive or obfuscated code. Score 0-100 |
| `bots/tradingview-bridge/` | Pine v6 scripts and TradingView MCP setup for Claude desktop |

## Quick start
```bash
cd engine && pip install -e . && pytest -q
python -m apex_engine list
python -m apex_engine backtest turtle_55_20 --source binance --symbol BTCUSDT --tf 1d
python -m apex_engine walkforward confluence --source binance --symbol BTCUSDT
cd ../web && npm install && npm run dev
```
All environment variables are in `.env.example`. Going live needs `APEX_ALLOW_LIVE=yes` plus the bot's own live flag.
