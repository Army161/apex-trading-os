"""Apex MCP server: lets Claude Desktop, Claude Code or any MCP client call the Apex engine as tools.
(Idea from the FinceptTerminal audit, archive/chat/26: plug the terminal into agents through MCP. Written from scratch; no Fincept code.)

Read-only by design: backtests, scans, confluence and dashboard status. There is no tool that places, changes or cancels orders.

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

from apex_engine import data, backtest as bt, research  # noqa: E402
from apex_engine.strategies import REGISTRY, get  # noqa: E402
from apex_engine.strategies.confluence import explain  # noqa: E402

server = MCPServer("apex", instructions="Apex trading engine. Backtests and signals on public exchange candles. Results are history, not "
                                       "promises; every bot runs paper first. Sources: binance, coinbase, kraken (crypto), alpaca (stocks, needs keys).")
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


@server.tool(description="Backtest one strategy on live candles. Fills at next open, fees and slippage included, stop checked before target. "
                         "Returns metrics, Monte Carlo range and the last 20 trades.", structured_output=False)
def backtest(strategy: str, symbol: str = "BTCUSDT", tf: str = "1d", source: str = "binance", risk_pct: float = 0.01) -> str:
    if strategy not in REGISTRY:
        return _j({"error": f"unknown strategy; choose from {sorted(REGISTRY)}"})
    df = _df(source, symbol, tf)
    r = bt.run(df, get(strategy), symbol=symbol, timeframe=tf, risk_pct=min(max(risk_pct, 0.001), 0.05))
    return _j({"symbol": symbol, "tf": tf, "bars": len(df), "metrics": r.metrics, "monte_carlo": bt.monte_carlo(r.trades, risk_pct=risk_pct),
               "last_trades": [t.__dict__ for t in r.trades[-20:]]})


@server.tool(description="Run every strategy on one market and rank them by out-of-sample (walk-forward) results, never by in-sample return.",
             structured_output=False)
def leaderboard(symbol: str = "BTCUSDT", tf: str = "1d", source: str = "binance", walk_forward: bool = True) -> str:
    lb = research.leaderboard(_df(source, symbol, tf), symbol, tf, walk=walk_forward)
    keep = ("strategy", "name", "total_return", "max_drawdown", "trades", "win_rate", "profit_factor", "buy_hold_return", "oos", "error")
    return _j({"best": lb["best"], "rows": [{k: r.get(k) for k in keep if k in r} for r in lb["rows"]]})


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
