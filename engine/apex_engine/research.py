"""Walk-forward optimisation, per-asset strategy discovery and leaderboard export.

Walk-forward: optimise each strategy's grid on an in-sample window, then trade the NEXT out-of-sample window
with the chosen params, roll forward, and stitch only the OOS results together. Reported numbers are OOS only,
which is what the 'build a bot with Claude' masterclass (upload 01) means by testing properly."""
from __future__ import annotations

import itertools
import json
import math

import numpy as np
import pandas as pd

from . import backtest as bt
from .strategies import REGISTRY, get


def grid_iter(grid: dict):
    if not grid:
        yield {}
        return
    keys = list(grid)
    for vals in itertools.product(*(grid[k] for k in keys)):
        yield dict(zip(keys, vals))


def objective(m: dict) -> float:
    """Return / drawdown with a penalty for too few trades, so a lucky single trade never wins."""
    if m["trades"] < 5:
        return -1e9
    dd = abs(m["max_drawdown"]) or 1e-3
    return m["total_return"] / dd * min(1.0, m["trades"] / 20)


def walk_forward(df: pd.DataFrame, sid: str, folds: int = 4, is_frac: float = 0.6, **kw) -> dict:
    cls = REGISTRY[sid]
    n = len(df)
    is_len = max(200, int(n * (1 - is_frac))) if folds > 1 else int(n * is_frac)  # first IS window, then rolls
    oos_len = max((n - is_len) // folds, 50)
    oos_trades, oos_rets, chosen = [], [], []
    start = 0
    while start + is_len + 20 < n:
        is_df = df.iloc[start:start + is_len]
        oos_df = df.iloc[max(0, start + is_len - 250):start + is_len + oos_len]  # warm-up bars for indicators
        best, best_p = -math.inf, cls.defaults
        for p in grid_iter(cls.grid):
            try:
                m = bt.run(is_df, cls(**p), **kw).metrics
            except Exception:
                continue
            o = objective(m)
            if o > best:
                best, best_p = o, p
        res = bt.run(oos_df, cls(**best_p), **kw)
        cut = df.index[start + is_len]
        oos_trades += [t for t in res.trades if pd.Timestamp(t.entry_time) >= cut]
        eq = res.equity[res.equity.index >= cut]
        if len(eq) > 1:
            oos_rets.append(eq.pct_change().fillna(0))
        chosen.append({"from": cut.isoformat(), "params": best_p})
        start += oos_len
    if not oos_rets:
        return {"strategy": sid, "error": "not enough data"}
    r = pd.concat(oos_rets)
    r = r[~r.index.duplicated()]
    capital = kw.get("capital", 10_000.0)
    eq = capital * (1 + r).cumprod()
    m = bt.metrics(eq, oos_trades, df.loc[eq.index[0]:], capital)
    return {"strategy": sid, "oos_metrics": m, "chosen_params": chosen, "monte_carlo": bt.monte_carlo(oos_trades, capital, kw.get("risk_pct", 0.01))}


def leaderboard(df: pd.DataFrame, symbol: str, tf: str, strategies: list[str] | None = None, walk: bool = True, **kw) -> dict:
    """Runs every strategy on one asset. Picks the best by OOS objective, never by in-sample return."""
    rows, full = [], {}
    for sid in strategies or sorted(REGISTRY):
        strat = get(sid)
        try:
            res = bt.run(df, strat, symbol=symbol, timeframe=tf, **kw)
        except Exception as e:  # noqa: BLE001
            rows.append({"strategy": sid, "error": str(e)})
            continue
        row = {"strategy": sid, "name": strat.name, "source": strat.source, **res.metrics,
               "monte_carlo": bt.monte_carlo(res.trades, kw.get("capital", 10_000.0), kw.get("risk_pct", 0.01))}
        if walk and sid != "buy_hold" and REGISTRY[sid].grid:
            wf = walk_forward(df, sid, **kw)
            row["oos"] = wf.get("oos_metrics")
            row["oos_params"] = wf.get("chosen_params")
        rows.append(row)
        full[sid] = res.to_json()
    ranked = sorted([r for r in rows if "error" not in r and r["strategy"] != "buy_hold"],
                    key=lambda r: objective(r.get("oos") or r), reverse=True)
    return {"symbol": symbol, "timeframe": tf, "generated": pd.Timestamp.utcnow().isoformat(), "rows": rows,
            "best": ranked[0]["strategy"] if ranked else None, "results": full}


def dumps(obj) -> str:
    def default(o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return None if math.isnan(o) or math.isinf(o) else float(o)
        if isinstance(o, (pd.Timestamp,)):
            return o.isoformat()
        return str(o)
    txt = json.dumps(obj, default=default)
    return txt.replace("Infinity", "null").replace("NaN", "null")
