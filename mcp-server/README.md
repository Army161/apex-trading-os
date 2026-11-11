# Old Apex MCP server (Python)

This is the first MCP server, kept for its signal scan until the new one covers it. **Use the new server for everything else:** `packages/mcp`, started with `apex mcp` (stdio) or reached at `/api/mcp` on the dashboard. It reads the ledger, can start a claim check and can pull the halt.

Tools here: `list_strategies`, `scan` (signals and confluence on the last closed candle), `dashboard_status` (needs `APEX_DASHBOARD_URL`). All read-only. There is no tool that can place or cancel orders.

## Why `backtest` and `leaderboard` are gone

They ran a test with any strategy, market and settings you named, and nothing counted the try. Run enough of those and one will look good by luck. Apex's rule is that every try is written down first and counted, and a result is judged with the count in hand. So the two tools were removed, not ported. To test an idea, use `queue_claim_check` on the new server: it writes the rules down, runs the same seven checks as everything else and records the try.

```bash
pip install "mcp>=2" pandas numpy
claude mcp add apex-signals -- python /path/to/apex/mcp-server/apex_mcp.py
```

A signal from `scan` is not a tested result. Idea borrowed from the FinceptTerminal audit (archive/chat/26); written from scratch, no Fincept code (it is AGPL).

## Start small with permissions
Before connecting any MCP server or skill (this one included) to an assistant that can touch your files, run
`python tools/skill_scan.py <folder>` on it and point the assistant at one test folder of sample files first.
Widen access only after you have watched what it does. Exchange and wallet keys never go in the MCP config.
