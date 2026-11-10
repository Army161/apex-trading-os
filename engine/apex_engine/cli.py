"""apex CLI.

  apex list                                   # every strategy and the course it came from
  apex backtest turtle_55_20 --source binance --symbol BTCUSDT --tf 1d
  apex walkforward confluence --source binance --symbol ETHUSDT --tf 4h
  apex discover --source binance --symbol SOLUSDT --tf 1d --out ../web/public/data/SOLUSDT-1d.json
  apex scan --source binance --symbols BTCUSDT,ETHUSDT,SOLUSDT --tf 1d   # today's signals + confluence
  apex paper turtle_55_20 --source binance --symbol BTCUSDT --tf 1d       # paper loop, reports to dashboard
"""
from __future__ import annotations

import argparse
import json
import sys

from . import data, backtest as bt
from .research import walk_forward, leaderboard, dumps
from .strategies import all_strategies, get, REGISTRY
from .strategies.confluence import explain


def _df(a):
    return data.load(a.source, a.symbol, a.tf, a.bars)


def main(argv=None):
    p = argparse.ArgumentParser("apex")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    for name in ("backtest", "walkforward", "paper"):
        s = sub.add_parser(name)
        s.add_argument("strategy")
        s.add_argument("--source", default="binance")
        s.add_argument("--symbol", default="BTCUSDT")
        s.add_argument("--tf", default="1d")
        s.add_argument("--bars", type=int, default=1500)
        s.add_argument("--risk", type=float, default=0.01)
        s.add_argument("--params", default="{}")
    d = sub.add_parser("discover")
    d.add_argument("--source", default="binance")
    d.add_argument("--symbol", default="BTCUSDT")
    d.add_argument("--tf", default="1d")
    d.add_argument("--bars", type=int, default=1500)
    d.add_argument("--no-walk", action="store_true")
    d.add_argument("--out")
    sc = sub.add_parser("scan")
    sc.add_argument("--source", default="binance")
    sc.add_argument("--symbols", default="BTCUSDT,ETHUSDT,SOLUSDT")
    sc.add_argument("--tf", default="1d")
    a = p.parse_args(argv)

    if a.cmd == "list":
        for s in all_strategies():
            print(f"{s['id']:<22} {s['direction']:<5} {','.join(s['timeframes']):<12} {s['source']}")
        return 0
    if a.cmd == "backtest":
        res = bt.run(_df(a), get(a.strategy, **json.loads(a.params)), symbol=a.symbol, timeframe=a.tf, risk_pct=a.risk)
        print(json.dumps({**res.metrics, "monte_carlo": bt.monte_carlo(res.trades, risk_pct=a.risk)}, indent=1))
        return 0
    if a.cmd == "walkforward":
        print(dumps(walk_forward(_df(a), a.strategy, risk_pct=a.risk)))
        return 0
    if a.cmd == "discover":
        lb = leaderboard(_df(a), a.symbol, a.tf, walk=not a.no_walk)
        txt = dumps(lb)
        if a.out:
            open(a.out, "w").write(txt)
        for r in sorted(lb["rows"], key=lambda r: -(r.get("total_return") or -9)):
            if "error" in r:
                continue
            o = r.get("oos") or {}
            print(f"{r['strategy']:<22} ret {r['total_return']:>8.1%}  dd {r['max_drawdown']:>7.1%}  trades {r['trades']:>4}  "
                  f"win {r['win_rate']:>5.1%}  OOS ret {o.get('total_return', float('nan')):>8.1%}")
        print("best (by out-of-sample):", lb["best"])
        return 0
    if a.cmd == "scan":
        out = []
        for sym in a.symbols.split(","):
            df = data.load(a.source, sym, a.tf, 600).iloc[:-1]
            sigs = [get(sid).latest(df) for sid in sorted(REGISTRY) if sid != "buy_hold"]
            out.append({"symbol": sym, "confluence": explain(df), "signals": [s for s in sigs if s["side"] != 0]})
        print(dumps(out))
        return 0
    if a.cmd == "paper":
        from .paper import PaperTrader
        PaperTrader(a.strategy, a.source, a.symbol, a.tf).loop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
