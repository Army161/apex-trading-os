"""Candlestick classifier, swing structure, S/R zones, fair value gaps, liquidity sweeps.
Rules come from the candlestick, price action, market structure, SMC and Wyckoff courses in archive/."""
from __future__ import annotations

import numpy as np
import pandas as pd


def body(df):
    return (df["close"] - df["open"]).abs()


def candles(df: pd.DataFrame, momentum_mult: float = 2.0, wick_ratio: float = 2.0) -> pd.DataFrame:
    """Classifies each bar.
    momentum: body >= 2x the average body of the prior 3 bars (candlestick course, chat 14)
    bull/bear_engulf: body engulfs the previous opposite-colour body
    hammer/shooting (pin bars): rejection wick >= 2x body, small opposite wick
    indecision: doji/spinning top, warning only."""
    o, h, l, c = df["open"], df["high"], df["low"], df["close"]
    b = body(df)
    rng = (h - l).replace(0, np.nan)
    upper = h - np.maximum(o, c)
    lower = np.minimum(o, c) - l
    prev_b = b.shift(1).rolling(3).mean()
    bull, bear = c > o, c < o
    out = pd.DataFrame(index=df.index)
    out["momentum_bull"] = bull & (b >= momentum_mult * prev_b)
    out["momentum_bear"] = bear & (b >= momentum_mult * prev_b)
    out["bull_engulf"] = bull & bear.shift(1, fill_value=False) & (c >= o.shift(1)) & (o <= c.shift(1)) & (b > b.shift(1))
    out["bear_engulf"] = bear & bull.shift(1, fill_value=False) & (c <= o.shift(1)) & (o >= c.shift(1)) & (b > b.shift(1))
    out["hammer"] = (lower >= wick_ratio * b) & (upper <= b.clip(lower=rng * 0.1)) & (lower / rng >= 0.55)
    out["shooting_star"] = (upper >= wick_ratio * b) & (lower <= b.clip(lower=rng * 0.1)) & (upper / rng >= 0.55)
    out["indecision"] = (b / rng <= 0.25) & ~out["hammer"] & ~out["shooting_star"]
    out["inside_bar"] = (h <= h.shift(1)) & (l >= l.shift(1))
    out["bull_reversal"] = out["hammer"] | out["bull_engulf"]
    out["bear_reversal"] = out["shooting_star"] | out["bear_engulf"]
    return out.fillna(False)


def swings(df: pd.DataFrame, left: int = 3, right: int = 3) -> pd.DataFrame:
    """Fractal swing highs/lows. A swing at bar i is only CONFIRMED at bar i+right, so the returned
    `sh_price`/`sl_price` columns are placed on the confirmation bar to avoid lookahead."""
    h, l = df["high"], df["low"]
    w = left + right + 1
    is_sh = h == h.rolling(w, center=True).max()
    is_sl = l == l.rolling(w, center=True).min()
    out = pd.DataFrame(index=df.index)
    out["sh_price"] = h.where(is_sh).shift(right)
    out["sl_price"] = l.where(is_sl).shift(right)
    out["last_sh"] = out["sh_price"].ffill()
    out["last_sl"] = out["sl_price"].ffill()
    out["prev_sh"] = out["sh_price"].dropna().shift(1).reindex(df.index).ffill()
    out["prev_sl"] = out["sl_price"].dropna().shift(1).reindex(df.index).ffill()
    return out


def structure(df: pd.DataFrame, left: int = 3, right: int = 3) -> pd.DataFrame:
    """Market structure: uptrend = higher high + higher low, downtrend = lower high + lower low.
    BOS = close through the last swing in trend direction, CHoCH = close through the last swing against it."""
    s = swings(df, left, right)
    up = (s["last_sh"] > s["prev_sh"]) & (s["last_sl"] > s["prev_sl"])
    dn = (s["last_sh"] < s["prev_sh"]) & (s["last_sl"] < s["prev_sl"])
    trend = pd.Series(np.where(up, 1, np.where(dn, -1, 0)), index=df.index)
    c = df["close"]
    brk_up = (c > s["last_sh"]) & (c.shift(1) <= s["last_sh"].shift(1))
    brk_dn = (c < s["last_sl"]) & (c.shift(1) >= s["last_sl"].shift(1))
    s["trend"] = trend
    s["bos_up"] = brk_up & (trend.shift(1) >= 0)
    s["bos_dn"] = brk_dn & (trend.shift(1) <= 0)
    s["choch_up"] = brk_up & (trend.shift(1) < 0)
    s["choch_dn"] = brk_dn & (trend.shift(1) > 0)
    return s


def sr_zones(df: pd.DataFrame, i: int, lookback: int = 200, tol_atr: float = 0.5, atr_s: pd.Series | None = None,
             left: int = 3, right: int = 3, min_touches: int = 2) -> list[tuple[float, int]]:
    """Support/resistance zones as of bar i: clusters of confirmed swing prices within tol*ATR. Returns
    [(price, touches)] sorted by touches desc."""
    lo = max(0, i - lookback)
    sub = df.iloc[lo:i + 1]
    s = swings(sub, left, right)
    pts = pd.concat([s["sh_price"].dropna(), s["sl_price"].dropna()]).values
    if len(pts) == 0:
        return []
    tol = (atr_s.iloc[i] if atr_s is not None and not np.isnan(atr_s.iloc[i]) else sub["close"].iloc[-1] * 0.01) * tol_atr
    pts = np.sort(pts)
    zones, cur = [], [pts[0]]
    for p in pts[1:]:
        if p - cur[-1] <= tol:
            cur.append(p)
        else:
            zones.append(cur)
            cur = [p]
    zones.append(cur)
    out = [(float(np.mean(z)), len(z)) for z in zones if len(z) >= min_touches]
    return sorted(out, key=lambda x: -x[1])


def fvg(df: pd.DataFrame) -> pd.DataFrame:
    """Fair value gaps (3-candle imbalance), flagged on the third candle."""
    out = pd.DataFrame(index=df.index)
    out["bull_fvg"] = df["low"] > df["high"].shift(2)
    out["bull_fvg_top"] = df["low"].where(out["bull_fvg"])
    out["bull_fvg_bot"] = df["high"].shift(2).where(out["bull_fvg"])
    out["bear_fvg"] = df["high"] < df["low"].shift(2)
    out["bear_fvg_top"] = df["low"].shift(2).where(out["bear_fvg"])
    out["bear_fvg_bot"] = df["high"].where(out["bear_fvg"])
    return out


def liquidity_sweep(df: pd.DataFrame, lookback: int = 20) -> pd.DataFrame:
    """Liquidity grab / failure test (2B): wick through the prior N-bar extreme, close back inside."""
    prior_low = df["low"].rolling(lookback).min().shift(1)
    prior_high = df["high"].rolling(lookback).max().shift(1)
    out = pd.DataFrame(index=df.index)
    out["sweep_low"] = (df["low"] < prior_low) & (df["close"] > prior_low)
    out["sweep_high"] = (df["high"] > prior_high) & (df["close"] < prior_high)
    out["prior_low"], out["prior_high"] = prior_low, prior_high
    return out


def divergence(price: pd.Series, osc: pd.Series, swings_df: pd.DataFrame, max_gap: int = 60) -> pd.DataFrame:
    """Regular and hidden divergences between price swings and an oscillator (RSI/MACD courses).
    Evaluated on swing confirmation bars."""
    out = pd.DataFrame(False, index=price.index, columns=["bull_reg", "bear_reg", "bull_hid", "bear_hid"])
    idx = price.index
    pos = {t: k for k, t in enumerate(idx)}
    right = 0
    # oscillator value at the actual swing bar: locate by matching price within the window
    for kind, col, cmp_reg, cmp_hid in (("low", "sl_price", "bull_reg", "bull_hid"), ("high", "sh_price", "bear_reg", "bear_hid")):
        pts = swings_df[col].dropna()
        prev_t, prev_p, prev_o = None, None, None
        for t, p in pts.items():
            k = pos[t]
            window = slice(max(0, k - 10), k + 1)
            seg = price.iloc[window]
            j = (seg - p).abs().values.argmin() + window.start
            o = osc.iloc[j]
            if prev_t is not None and k - pos[prev_t] <= max_gap and not np.isnan(o) and not np.isnan(prev_o):
                if kind == "low":
                    if p < prev_p and o > prev_o:
                        out.at[t, cmp_reg] = True
                    if p > prev_p and o < prev_o:
                        out.at[t, cmp_hid] = True
                else:
                    if p > prev_p and o < prev_o:
                        out.at[t, cmp_reg] = True
                    if p < prev_p and o > prev_o:
                        out.at[t, cmp_hid] = True
            prev_t, prev_p, prev_o = t, p, o
    return out
