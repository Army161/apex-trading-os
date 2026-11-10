"""Engine tests, including the backtester self-test from upload 01 (planted edge, pure noise, look-ahead guard)."""
import numpy as np
import pandas as pd
import pytest

from apex_engine import data, backtest as bt, indicators as ind
from apex_engine.strategies import REGISTRY, get
from apex_engine.strategies.base import Strategy
from apex_engine.strategies.confluence import explain
from apex_engine.risk import RiskGuard, RiskConfig
from apex_engine.research import walk_forward

DF = data.synthetic(1200)


class Flags(Strategy):
    id = "flags"
    defaults = {"max_bars": 1}

    def __init__(self, flags, **p):
        super().__init__(**p)
        self.flags = flags

    def signals(self, df):
        out = self.frame(df)
        out["long_entry"] = self.flags
        out["stop"] = df["close"] * 0.5
        return out


def planted(edge: float, seed=1, n=3000):
    rng = np.random.default_rng(seed)
    r = rng.normal(0, 0.01, n)
    flags = rng.random(n) < 0.05
    # the bar after a flag (entry bar, open->close) gets the planted edge
    nxt = np.roll(flags, 1)
    nxt[0] = False
    close, open_ = np.empty(n), np.empty(n)
    p = 100.0
    for i in range(n):
        open_[i] = p
        p = p * (1 + r[i] + (edge if nxt[i] else 0))
        close[i] = p
    idx = pd.date_range("2015-01-01", periods=n, freq="D", tz="UTC")
    df = pd.DataFrame({"open": open_, "high": np.maximum(open_, close) * 1.001, "low": np.minimum(open_, close) * 0.999,
                       "close": close, "volume": 1.0}, index=idx)
    return df, pd.Series(flags, index=idx)


def avg_trade_pct(res):
    return np.mean([(t.exit / t.entry - 1) for t in res.trades])


def test_planted_edge_is_recovered():
    df, f = planted(0.01)
    res = bt.run(df, Flags(f), fee=0.0005, slippage=0, risk_pct=1.0)
    # each trade: enter next open, exit the open after (one bar) -> captures the +1% bar minus 0.1% cost
    assert 0.006 <= avg_trade_pct(res) + 0.001 - 0.001 <= 0.012


def test_pure_noise_has_no_edge():
    df, f = planted(0.0)
    res = bt.run(df, Flags(f), fee=0.0005, slippage=0, risk_pct=1.0)
    assert abs(avg_trade_pct(res)) < 0.002
    assert res.metrics["total_return"] < 0.05


@pytest.mark.parametrize("sid", sorted(REGISTRY))
def test_no_lookahead(sid):
    """Truncate the data at random points: the signal on the last bar must equal the full-data signal there."""
    strat = get(sid)
    full = strat.signals(DF)
    rng = np.random.default_rng(3)
    for cut in rng.integers(400, len(DF) - 5, 12):
        part = strat.signals(DF.iloc[:cut + 1])
        a, b = full.iloc[cut], part.iloc[-1]
        for col in ("long_entry", "short_entry", "long_exit", "short_exit"):
            assert bool(a[col]) == bool(b[col]), f"{sid} {col} changed at {DF.index[cut]} when future data was removed"


@pytest.mark.parametrize("sid", sorted(REGISTRY))
def test_every_strategy_runs_and_cites_source(sid):
    res = bt.run(DF, get(sid))
    assert REGISTRY[sid].source
    assert np.isfinite(res.equity).all()
    for t in res.trades:
        assert t.qty > 0 and t.exit == t.exit


def test_stop_beats_target_when_both_hit():
    idx = pd.date_range("2020-01-01", periods=5, freq="D", tz="UTC")
    df = pd.DataFrame({"open": [100, 100, 100, 100, 100], "high": [101, 101, 120, 101, 101], "low": [99, 99, 80, 99, 99],
                       "close": [100] * 5, "volume": 1.0}, index=idx)

    class One(Strategy):
        id = "one"

        def signals(self, d):
            o = self.frame(d)
            o.iloc[0, o.columns.get_loc("long_entry")] = True
            o["stop"], o["target"] = 95.0, 110.0
            return o
    res = bt.run(df, One(), fee=0, slippage=0)
    assert res.trades[0].reason == "stop" and res.trades[0].exit == 95.0


def test_rsi_matches_known_values():
    s = pd.Series(np.arange(1, 40, dtype=float))
    assert ind.rsi(s, 14).iloc[-1] == 100.0


def test_risk_guard_cooldown_and_dd_pause():
    g = RiskGuard(RiskConfig(backtest_max_dd=-0.10), equity=10_000)
    ok, _ = g.check(100, 95, 110, now=1_000_000)
    assert ok
    g.on_close(-200, now=1_000_000)
    ok, why = g.check(100, 95, 110, now=1_000_000 + 60)
    assert not ok and "cooldown" in why
    ok, why = g.check(100, 95, 101, now=1_000_000 + 10_000)
    assert not ok and "reward:risk" in why
    ok, why = g.check(100, None, 110, now=1_000_000 + 10_000)
    assert not ok and "plan incomplete" in why
    g.on_close(-900, now=1_000_000 + 20_000)
    assert g.state.paused


def test_walk_forward_and_confluence_explain():
    wf = walk_forward(DF, "turtle_55_20", folds=3)
    assert "oos_metrics" in wf
    e = explain(DF)
    assert 0 <= e["score"] <= 100 and set(e["components"]) == {"structure", "location", "trigger", "momentum", "context"}
