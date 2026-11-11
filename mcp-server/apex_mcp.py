"""Apex MCP server: lets Claude Desktop, Claude Code or any MCP client call the Apex engine as tools.
(Idea from the FinceptTerminal audit, archive/chat/26: plug the terminal into agents through MCP. Written from scratch; no Fincept code.)

Read-only by design: the strategy list, scans, confluence and dashboard status. There is no tool that places, changes or cancels orders,
and none that runs a backtest: see the note below and packages/mcp, the server that replaces this one.

  pip install "mcp>=2" pandas numpy
  python mcp-server/apex_mcp.py            # stdio, for claude_desktop_config.json / `claude mcp add`
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "engine"))

from mcp.server.mcpserver import MCPServer  # noqa: E402

from apex_engine import data  # noqa: E402
from apex_engine.strategies import REGISTRY, get  # noqa: E402
from apex_engine.strategies.confluence import explain  # noqa: E402

server = MCPServer("apex", instructions="Apex trading engine: the strategy list and signals on public exchange candles. A signal is not a tested "
                                       "result; every bot runs paper first. Sources: binance, coinbase, kraken (crypto), alpaca (stocks, needs keys).")
SOURCES = {"binance", "coinbase", "kraken", "alpaca", "massive", "synthetic"}


def _df(source: str, symbol: str, tf: str, bars: int = 1500):
    if source not in SOURCES:
        raise ValueError(f"source must be one of {sorted(SOURCES)}")
    df = data.load(source, symbol, tf, bars)
    return df.iloc[:-1] if source != "synthetic" else df


def _j(x) -> str:
    return json.dumps(x, default=str)


@server.tool(description="List every Apex strategy with its rules, the course it came from, defaults and timeframes.", structured_output=False)
def list_strategies() -> str:
    return _j([{"id": k, "name": c.name, "source": c.source, "direction": c.direction, "timeframes": c.timeframes,
                "description": c.description, "defaults": c.defaults} for k, c in sorted(REGISTRY.items())])


# There is no `backtest` or `leaderboard` tool here any more. Each ran a test with free parameters that nothing counted, and
# an uncounted try is how a lucky result gets mistaken for an edge. To test an idea, use `queue_claim_check` on the new server
# (packages/mcp): it writes the rules down first, runs the same gate as everything else and counts the try.


@server.tool(description="Which strategies signal on the last closed candle, plus the 0-100 confluence score, for up to 10 symbols.",
             structured_output=False)
def scan(symbols: list[str], tf: str = "1d", source: str = "binance") -> str:
    out = []
    for sym in symbols[:10]:
        try:
            df = _df(source, sym, tf, 600)
            sig = [get(s).latest(df) for s in sorted(REGISTRY) if s != "buy_hold"]
            out.append({"symbol": sym, "close": float(df["close"].iloc[-1]), "signals": [s for s in sig if s["side"]], "confluence": explain(df)})
        except Exception as e:  # noqa: BLE001
            out.append({"symbol": sym, "error": str(e)})
    return _j(out)


@server.tool(description="Status of every Apex bot from the dashboard (needs APEX_DASHBOARD_URL): mode, last heartbeat, recent trades and events.",
             structured_output=False)
def dashboard_status() -> str:
    url = os.environ.get("APEX_DASHBOARD_URL")
    if not url:
        return _j({"error": "set APEX_DASHBOARD_URL to your deployed dashboard"})
    with urllib.request.urlopen(urllib.request.Request(f"{url.rstrip('/')}/api/bots", headers={"User-Agent": "apex-mcp"}), timeout=20) as r:
        d = json.loads(r.read().decode())
    return _j({"bots": [{k: b.get(k) for k in ("id", "name", "mode", "lastSeen", "status")} for b in d.get("bots", [])],
               "trades": d.get("trades", [])[:20], "events": d.get("events", [])[:20], "kill_switch": d.get("killed")})


if __name__ == "__main__":
    server.run()
