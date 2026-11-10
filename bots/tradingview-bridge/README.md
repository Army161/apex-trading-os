# TradingView bridge

Sources: archive/chat/03 (Turtle 55/20 bot), 04 (connect Claude to TradingView), 05 (SMA50 + AI analysis workflows),
15 upload (TradingView tutorial).

## 1. Pine strategies (works on any TradingView plan)
Open Pine Editor, paste a file from `pine/`, click *Add to chart*, then read the Strategy Tester. Each script fires JSON
`alert_message`s, so a TradingView alert with webhook URL `https://<your-apex>.vercel.app/api/ingest/tradingview?token=<APEX_INGEST_TOKEN>`
streams signals into the dashboard (webhooks need a paid TradingView plan; email/app alerts work on all plans).

| File | What |
|---|---|
| `apex_turtle_55_20.pine` | Turtle breakout, 1% risk sizing, ATR stop |
| `apex_sma50_trend.pine` | SMA50 long/flat vs buy-and-hold |
| `apex_rsi2_dip.pine` | RSI(2) dip sleeve from the Claude bot masterclass |
| `apex_confluence.pine` | Confluence score indicator with alerts |

## 2. Claude <-> TradingView Desktop (read and chart control only, no order execution)
Needs TradingView **Desktop** and Node.js 18+ on your computer.
1. Download https://github.com/tradesdontlie/tradingview-mcp (Code, Download ZIP), extract, and use the folder that directly
   contains `package.json` (the ZIP often nests `tradingview-mcp-main` twice).
2. In that folder: `npm install`
3. Quit TradingView, relaunch it with remote debugging:
   - macOS: `open -a "TradingView" --args --remote-debugging-port=9222`
   - Windows: `"%LOCALAPPDATA%\Programs\TradingView\TradingView.exe" --remote-debugging-port=9222`
4. Claude Desktop, Settings, Developer, Edit Config: MERGE `claude_desktop_config.snippet.json` into the existing file
   (never overwrite what is there), with the real path. Restart Claude Desktop.
5. Ask Claude to run `tv_health_check`. Then: "Read my BTCUSD daily chart and score it with the Apex confluence checklist".

`setup.sh` automates steps 1 to 3 on macOS/Linux.
