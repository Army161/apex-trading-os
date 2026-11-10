# Apex MCP server

Lets any MCP client (Claude Desktop, Claude Code, Cursor) use the Apex engine as tools. Idea borrowed from the FinceptTerminal audit (archive/chat/26); written from scratch, no Fincept code (it is AGPL).

Tools: `list_strategies`, `backtest`, `leaderboard` (walk-forward, ranks on out-of-sample results), `scan` (signals + confluence on the last closed candle), `dashboard_status` (needs `APEX_DASHBOARD_URL`). All read-only. There is no tool that can place or cancel orders.

```bash
pip install "mcp>=2" pandas numpy
claude mcp add apex -- python /path/to/apex/mcp-server/apex_mcp.py
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "apex": { "command": "python", "args": ["/path/to/apex/mcp-server/apex_mcp.py"], "env": { "APEX_DASHBOARD_URL": "https://your-dashboard.vercel.app" } } } }
```

Then ask things like "backtest supertrend on ETHUSDT 4h" or "which strategies signal on BTC, ETH and SOL today?". Results are history, not a promise.

## Start small with permissions
Before connecting any MCP server or skill (this one included) to an assistant that can touch your files, run
`python tools/skill_scan.py <folder>` on it and point the assistant at one test folder of sample files first.
Widen access only after you have watched what it does. Exchange and wallet keys never go in the MCP config.
