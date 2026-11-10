"""Vectorised indicators. Every function takes pandas Series/DataFrames and never looks ahead:
value at bar i only uses bars <= i."""
from __future__ import annotations

import numpy as np
import pandas as pd


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def rma(s: pd.Series, n: int) -> pd.Series:
    """Wilder smoothing (TradingView ta.rma)."""
    return s.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()


def true_range(df: pd.DataFrame) -> pd.Series:
    pc = df["close"].shift(1)
    return pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    return rma(true_range(df), n)


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    up = rma(d.clip(lower=0), n)
    dn = rma(-d.clip(upper=0), n)
    rs = up / dn.replace(0, np.nan)
    out = 100 - 100 / (1 + rs)
    return out.where(dn != 0, 100.0)


def macd(s: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9, kind: str = "ema") -> pd.DataFrame:
    """kind='sma' gives the 3-10-16 SMA variant recommended in the MACD course (chat 16)."""
    f = sma if kind == "sma" else ema
    line = f(s, fast) - f(s, slow)
    sig = f(line, signal)
    return pd.DataFrame({"macd": line, "signal": sig, "hist": line - sig})


def bollinger(s: pd.Series, n: int = 20, k: float = 2.0) -> pd.DataFrame:
    mid = sma(s, n)
    sd = s.rolling(n, min_periods=n).std(ddof=0)
    up, lo = mid + k * sd, mid - k * sd
    return pd.DataFrame({"mid": mid, "upper": up, "lower": lo, "width": (up - lo) / mid})


def keltner(df: pd.DataFrame, n: int = 20, mult: float = 2.0, atr_n: int = 10) -> pd.DataFrame:
    mid = ema(df["close"], n)
    a = atr(df, atr_n)
    return pd.DataFrame({"mid": mid, "upper": mid + mult * a, "lower": mid - mult * a})


def donchian(df: pd.DataFrame, n: int) -> pd.DataFrame:
    """Channel of the PREVIOUS n bars (excludes the current bar) so a close above `upper` is a true breakout."""
    return pd.DataFrame({
        "upper": df["high"].rolling(n, min_periods=n).max().shift(1),
        "lower": df["low"].rolling(n, min_periods=n).min().shift(1),
    })


def _period_key(index: pd.DatetimeIndex, anchor: str):
    idx = index.tz_convert(None) if index.tz is not None else index
    return idx.to_period(anchor)


def vwap(df: pd.DataFrame, anchor: str | None = "D") -> pd.Series:
    """Session VWAP reset every `anchor` period (D, W, M). anchor=None -> cumulative (anchored at first bar)."""
    tp = (df["high"] + df["low"] + df["close"]) / 3
    pv = tp * df["volume"]
    if anchor is None:
        return pv.cumsum() / df["volume"].cumsum()
    key = _period_key(df.index, anchor)
    return pv.groupby(key).cumsum() / df["volume"].groupby(key).cumsum()


def vwap_bands(df: pd.DataFrame, anchor: str | None = "D", mults=(1.0, 2.0)) -> pd.DataFrame:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    v = vwap(df, anchor)
    key = _period_key(df.index, anchor) if anchor else pd.Series(0, index=df.index)
    w = df["volume"]
    var = ((tp - v) ** 2 * w).groupby(key).cumsum() / w.groupby(key).cumsum()
    sd = np.sqrt(var)
    out = {"vwap": v}
    for m in mults:
        out[f"up{m:g}"] = v + m * sd
        out[f"lo{m:g}"] = v - m * sd
    return pd.DataFrame(out)


def obv(df: pd.DataFrame) -> pd.Series:
    return (np.sign(df["close"].diff()).fillna(0) * df["volume"]).cumsum()


def volume_delta_proxy(df: pd.DataFrame) -> pd.Series:
    """Bar-level buy/sell pressure proxy for order-flow concepts when tick data is unavailable:
    ((close-low)-(high-close))/(high-low) * volume."""
    rng = (df["high"] - df["low"]).replace(0, np.nan)
    return (((df["close"] - df["low"]) - (df["high"] - df["close"])) / rng * df["volume"]).fillna(0)


def adx(df: pd.DataFrame, n: int = 14) -> pd.Series:
    up = df["high"].diff()
    dn = -df["low"].diff()
    plus = np.where((up > dn) & (up > 0), up, 0.0)
    minus = np.where((dn > up) & (dn > 0), dn, 0.0)
    tr = rma(true_range(df), n)
    pdi = 100 * rma(pd.Series(plus, index=df.index), n) / tr
    mdi = 100 * rma(pd.Series(minus, index=df.index), n) / tr
    dx = 100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, np.nan)
    return rma(dx, n)


def stoch_rsi(s: pd.Series, n: int = 14, k: int = 3, d: int = 3) -> pd.DataFrame:
    r = rsi(s, n)
    lo, hi = r.rolling(n).min(), r.rolling(n).max()
    st = 100 * (r - lo) / (hi - lo).replace(0, np.nan)
    kk = sma(st, k)
    return pd.DataFrame({"k": kk, "d": sma(kk, d)})


def resample_ohlcv(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    return df.resample(rule).agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()


def align_htf(htf_series: pd.Series, ltf_index: pd.DatetimeIndex) -> pd.Series:
    """Map a higher-timeframe series onto lower-timeframe bars using only COMPLETED HTF bars (shift 1)."""
    return htf_series.shift(1).reindex(ltf_index, method="ffill")


def supertrend(df: pd.DataFrame, n: int = 10, mult: float = 3.0) -> pd.DataFrame:
    """TradingView ta.supertrend: ATR bands around hl2 that only ratchet in the trend's favour.
    Returns columns line and dir (+1 uptrend, price above the line; -1 downtrend)."""
    a = atr(df, n).to_numpy()
    hl2 = ((df["high"] + df["low"]) / 2).to_numpy()
    c = df["close"].to_numpy()
    m = len(df)
    up, dn, line, d = np.full(m, np.nan), np.full(m, np.nan), np.full(m, np.nan), np.zeros(m)
    for i in range(m):
        if np.isnan(a[i]):
            continue
        bu, bd = hl2[i] - mult * a[i], hl2[i] + mult * a[i]
        pu, pd_ = (up[i - 1], dn[i - 1]) if i else (np.nan, np.nan)
        up[i] = bu if np.isnan(pu) or c[i - 1] < pu else max(bu, pu)
        dn[i] = bd if np.isnan(pd_) or c[i - 1] > pd_ else min(bd, pd_)
        prev = d[i - 1] if i else 0
        if prev == 0:
            d[i] = 1 if c[i] > dn[i] else -1
        elif prev == -1:
            d[i] = 1 if c[i] > dn[i] else -1
        else:
            d[i] = -1 if c[i] < up[i] else 1
        line[i] = up[i] if d[i] == 1 else dn[i]
    return pd.DataFrame({"line": line, "dir": d}, index=df.index)
