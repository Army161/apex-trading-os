"""Core + sleeves system from the 'build a trading bot with Claude' masterclass (archive/uploads/01, notes in
archive/notes/01-...notes.md). Daily bars, decide at the close, fill at the next open, 0.05% cost each way."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Strategy, register
from .. import indicators as ind


@register
class RSI2Dip(Strategy):
    id = "rsi2_dip"
    name = "RSI(2) Dip Buy above 200-day (sleeve)"
    source = "archive/uploads/01-build-trading-bot-with-claude-masterclass.md"
    direction = "long"
    timeframes = ["1d"]
    description = ("Buy at the next open after RSI(2) closes under 10 while price is above its 200-day average. Sell on a close "
                   "back above the 5-day average or after 10 days, whichever comes first. 8% stop held at the broker. Fits "
                   "'snaps back' assets (SPY, DIA, XLY, GLD).")
    defaults = {"rsi_th": 10, "exit_ma": 5, "max_bars": 10, "stop_pct": 0.08, "trend_n": 200}
    grid = {"rsi_th": [5, 10, 15], "exit_ma": [3, 5, 10]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        out["long_entry"] = (ind.rsi(c, 2) < self.rsi_th) & (c > ind.sma(c, self.trend_n))
        out["long_exit"] = c > ind.sma(c, self.exit_ma)
        out["stop"] = c * (1 - self.stop_pct)
        return out


@register
class Breakout50(Strategy):
    id = "breakout_50_20"
    name = "50-day High Breakout above 200-day (sleeve)"
    source = "archive/uploads/01-build-trading-bot-with-claude-masterclass.md"
    direction = "long"
    timeframes = ["1d"]
    description = ("Buy at the next open after a new 50-day high while above the 200-day line. Sell when price falls to a 20-day "
                   "low or closes below the 200-day line. Fits 'keeps going' assets (QQQ, XLK, XLF).")
    defaults = {"entry_n": 50, "exit_n": 20, "trend_n": 200, "stop_pct": 0.10}
    grid = {"entry_n": [20, 50, 100]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        t = ind.sma(c, self.trend_n)
        out["long_entry"] = (c >= df["high"].rolling(self.entry_n).max()) & (c > t)
        out["long_exit"] = (c <= df["low"].rolling(self.exit_n).min()) | (c < t)
        out["stop"] = c * (1 - self.stop_pct)
        return out


def core_rotation(engine: pd.DataFrame, safe: pd.DataFrame, n: int = 200, cost: float = 0.0005, capital: float = 100_000.0,
                  kind: str = "sma") -> dict:
    """Core: hold the engine (QQQ) while it closes above its n-day line, otherwise hold the safe asset (GLD).
    Signal at the close, switch at the next open. Returns equity curve + metrics vs holding the engine."""
    idx = engine.index.intersection(safe.index)
    e, s = engine.loc[idx], safe.loc[idx]
    line = ind.sma(e["close"], n) if kind == "sma" else ind.ema(e["close"], n)
    hold_engine = (e["close"] > line).shift(1).fillna(False)  # decided yesterday, applied today open->close
    r_e = e["close"] / e["open"] - 1
    r_s = s["close"] / s["open"] - 1
    gap_e = e["open"] / e["close"].shift(1) - 1
    gap_s = s["open"] / s["close"].shift(1) - 1
    prev = hold_engine.shift(1).fillna(hold_engine.iloc[0])
    # overnight gap belongs to yesterday's holding, intraday to today's
    r = np.where(prev, gap_e, gap_s).astype(float) + np.where(hold_engine, r_e, r_s).astype(float)
    switches = (hold_engine != prev).astype(float)
    r = pd.Series(np.nan_to_num(r) - switches * 2 * cost, index=idx)
    eq = capital * (1 + r).cumprod()
    dd = eq / eq.cummax() - 1
    yrs = max((idx[-1] - idx[0]).days / 365.25, 1e-9)
    bh = e["close"].iloc[-1] / e["close"].iloc[0] - 1
    tot = eq.iloc[-1] / capital - 1
    return {"equity": eq, "metrics": {"total_return": round(float(tot), 4), "cagr": round(float((1 + tot) ** (1 / yrs) - 1), 4),
            "max_drawdown": round(float(dd.min()), 4), "switches": int(switches.sum()), "engine_buy_hold": round(float(bh), 4),
            "return_per_drawdown": round(float(tot / abs(dd.min())) if dd.min() < 0 else 0.0, 2)}}
