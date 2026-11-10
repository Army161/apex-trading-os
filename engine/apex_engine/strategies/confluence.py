"""Confluence scoring: the technical-analysis course checklist (chat 17) turned into a score.

  1. Structure / trend      (market structure HH/HL, price vs 50/200 EMA)          up to 25
  2. Location               (at a support/resistance zone or swept liquidity)      up to 20
  3. Trigger candle         (engulfing, pin bar, momentum candle)                 up to 20
  4. Momentum / volume      (RSI regime, MACD/RSI divergence, volume spike)       up to 20
  5. Context filters        (Wyckoff phase, Elliott-style impulse filter, BB)     up to 15
Risk sizing is applied by the backtester / risk guard, never by the score.
Elliott Wave is only used as a filter (chat 10 is explicit that counts are subjective): we require the
last completed swing leg in trend direction to be longer than the correction (impulse > correction).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Strategy, register
from .. import indicators as ind
from ..patterns import candles, structure, liquidity_sweep, divergence


def wyckoff_phase(df: pd.DataFrame, n: int = 50) -> pd.Series:
    """Rough phase classifier: markup / markdown when price trends out of its n-bar range with rising/falling EMA,
    accumulation / distribution when ranging after a down / up move."""
    c = df["close"]
    e = ind.ema(c, n)
    slope = (e - e.shift(10)) / ind.atr(df, 14)
    prior = c.shift(n) - c.shift(2 * n)
    phase = np.where(slope > 1, "markup", np.where(slope < -1, "markdown",
                     np.where(prior < 0, "accumulation", "distribution")))
    return pd.Series(phase, index=df.index)


def score_frame(df: pd.DataFrame) -> pd.DataFrame:
    c = df["close"]
    a = ind.atr(df, 14)
    st = structure(df, 3, 3)
    e50, e200 = ind.ema(c, 50), ind.ema(c, 200)
    cd = candles(df)
    ls = liquidity_sweep(df, 20)
    r = ind.rsi(c, 14)
    m = ind.macd(c, 3, 10, 16, kind="sma")
    dv = divergence(c, m["hist"], st)
    vol_spike = df["volume"] > 1.5 * ind.sma(df["volume"], 20)
    phase = wyckoff_phase(df)
    leg_up = st["last_sh"] - st["prev_sl"]
    corr_dn = st["last_sh"] - st["last_sl"]
    leg_dn = st["prev_sh"] - st["last_sl"]
    corr_up = st["last_sh"] - st["last_sl"]

    out = pd.DataFrame(index=df.index)
    # long side
    out["L_structure"] = 15 * (st["trend"] == 1) + 5 * (c > e50) + 5 * (e50 > e200)
    near_sup = (df["low"] - st["last_sl"].shift(1)).abs() <= 0.5 * a
    out["L_location"] = 12 * near_sup + 8 * ls["sweep_low"]
    out["L_trigger"] = 10 * cd["bull_engulf"] + 10 * cd["hammer"] + 6 * cd["momentum_bull"]
    out["L_momentum"] = 6 * ((r > 50) & (r < 75)) + 8 * dv["bull_reg"].rolling(5).max().fillna(0) + 6 * vol_spike
    out["L_context"] = 8 * phase.isin(["accumulation", "markup"]) + 7 * (leg_up > corr_dn)
    # short side
    out["S_structure"] = 15 * (st["trend"] == -1) + 5 * (c < e50) + 5 * (e50 < e200)
    near_res = (df["high"] - st["last_sh"].shift(1)).abs() <= 0.5 * a
    out["S_location"] = 12 * near_res + 8 * ls["sweep_high"]
    out["S_trigger"] = 10 * cd["bear_engulf"] + 10 * cd["shooting_star"] + 6 * cd["momentum_bear"]
    out["S_momentum"] = 6 * ((r < 50) & (r > 25)) + 8 * dv["bear_reg"].rolling(5).max().fillna(0) + 6 * vol_spike
    out["S_context"] = 8 * phase.isin(["distribution", "markdown"]) + 7 * (leg_dn > corr_up)
    for side, cap in (("L", (25, 20, 20, 20, 15)), ("S", (25, 20, 20, 20, 15))):
        cols = [f"{side}_structure", f"{side}_location", f"{side}_trigger", f"{side}_momentum", f"{side}_context"]
        for col, cp in zip(cols, cap):
            out[col] = out[col].astype(float).clip(upper=cp)
        out[f"{side}_score"] = out[cols].sum(axis=1)
    out["phase"] = phase
    return out


def explain(df: pd.DataFrame) -> dict:
    """Breakdown for the latest bar, used by the dashboard signal card and the AI chat."""
    s = score_frame(df).iloc[-1]
    side = "long" if s["L_score"] >= s["S_score"] else "short"
    p = "L" if side == "long" else "S"
    return {"bias": side, "score": float(s[f"{p}_score"]), "phase": s["phase"],
            "components": {k: float(s[f"{p}_{k}"]) for k in ("structure", "location", "trigger", "momentum", "context")}}


@register
class Confluence(Strategy):
    id = "confluence"
    name = "Confluence Score (TA checklist)"
    source = "archive/chat/17-technical-analysis-course.md + 06, 10, 14, 15, 16, 19"
    direction = "both"
    timeframes = ["1d", "4h", "1h"]
    description = ("Trades only when the 5-step checklist (structure, location, trigger candle, momentum/volume, context incl. "
                   "Wyckoff phase and an Elliott impulse filter) scores at least the threshold out of 100 AND a trigger candle "
                   "is present. Stop beyond the trigger candle's extreme or 1.5 ATR, target 2R.")
    defaults = {"threshold": 60, "rr": 2.0}
    grid = {"threshold": [50, 60, 70], "rr": [1.5, 2.0, 3.0]}

    def signals(self, df):
        out = self.frame(df)
        s = score_frame(df)
        c = df["close"]
        a = ind.atr(df, 14)
        out["long_entry"] = (s["L_score"] >= self.threshold) & (s["L_trigger"] > 0) & (s["L_score"] > s["S_score"])
        out["short_entry"] = (s["S_score"] >= self.threshold) & (s["S_trigger"] > 0) & (s["S_score"] > s["L_score"])
        lstop = np.minimum(df["low"].rolling(2).min(), c - 1.5 * a)
        sstop = np.maximum(df["high"].rolling(2).max(), c + 1.5 * a)
        out["stop"] = np.where(out["long_entry"], lstop, sstop)
        stop = pd.Series(out["stop"], index=df.index)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - stop), c - self.rr * (stop - c))
        out["score_long"] = s["L_score"]
        out["score_short"] = s["S_score"]
        return out
