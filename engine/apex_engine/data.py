"""Market data adapters. All public endpoints, no keys needed for candles.
Sources: binance, coinbase, kraken (crypto), alpaca (stocks, needs paper keys), massive/polygon (key), csv.
`synthetic()` makes deterministic regime-switching data for tests only. It is never shown as a real result."""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

import numpy as np
import pandas as pd

UA = {"User-Agent": "apex-engine/0.1"}
TF_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800}


def _get(url: str, params: dict | None = None, headers: dict | None = None, timeout: int = 20):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _frame(rows, cols=("time", "open", "high", "low", "close", "volume"), unit="ms") -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=cols)
    df["time"] = pd.to_datetime(df["time"], unit=unit, utc=True)
    df = df.set_index("time").astype(float).sort_index()
    return df[~df.index.duplicated()]


def binance(symbol: str = "BTCUSDT", tf: str = "1d", bars: int = 1500) -> pd.DataFrame:
    out, end = [], None
    base = os.environ.get("BINANCE_BASE", "https://api.binance.com")  # use https://api.binance.us for US users
    while len(out) < bars:
        p = {"symbol": symbol, "interval": tf, "limit": min(1000, bars - len(out))}
        if end:
            p["endTime"] = end
        rows = _get(f"{base}/api/v3/klines", p)
        if not rows:
            break
        out = rows + out
        end = rows[0][0] - 1
        if len(rows) < p["limit"]:
            break
    return _frame([r[:6] for r in out])


def coinbase(product: str = "BTC-USD", tf: str = "1d", bars: int = 1500) -> pd.DataFrame:
    g = TF_SECONDS[tf]
    if g not in (60, 300, 900, 3600, 21600, 86400):
        raise ValueError("coinbase granularity must be 1m,5m,15m,1h,6h,1d")
    out, end = [], int(time.time())
    while len(out) < bars:
        start = end - 300 * g
        rows = _get(f"https://api.exchange.coinbase.com/products/{product}/candles",
                    {"granularity": g, "start": pd.Timestamp(start, unit="s").isoformat(), "end": pd.Timestamp(end, unit="s").isoformat()})
        if not rows:
            break
        out += rows
        end = start
    df = _frame([[r[0], r[3], r[2], r[1], r[4], r[5]] for r in out], unit="s")
    return df.iloc[-bars:]


def kraken(pair: str = "XBTUSD", tf: str = "1d") -> pd.DataFrame:
    j = _get("https://api.kraken.com/0/public/OHLC", {"pair": pair, "interval": TF_SECONDS[tf] // 60})
    key = [k for k in j["result"] if k != "last"][0]
    return _frame([[r[0], r[1], r[2], r[3], r[4], r[6]] for r in j["result"][key]], unit="s")


def alpaca_stocks(symbol: str = "SPY", tf: str = "1d", bars: int = 1000) -> pd.DataFrame:
    tfmap = {"1m": "1Min", "5m": "5Min", "15m": "15Min", "1h": "1Hour", "1d": "1Day"}
    h = {"APCA-API-KEY-ID": os.environ["ALPACA_API_KEY"], "APCA-API-SECRET-KEY": os.environ["ALPACA_SECRET_KEY"]}
    start = (pd.Timestamp.utcnow() - pd.Timedelta(seconds=TF_SECONDS[tf] * bars * 1.6)).isoformat()
    j = _get(f"https://data.alpaca.markets/v2/stocks/{symbol}/bars", {"timeframe": tfmap[tf], "start": start, "limit": 10000, "feed": "iex"}, h)
    return pd.DataFrame([[b["t"], b["o"], b["h"], b["l"], b["c"], b["v"]] for b in j.get("bars", [])],
                        columns=["time", "open", "high", "low", "close", "volume"]).assign(time=lambda d: pd.to_datetime(d["time"], utc=True)).set_index("time").astype(float)


def massive(ticker: str = "X:BTCUSD", tf: str = "1d", start: str = "2020-01-01", end: str | None = None) -> pd.DataFrame:
    """Massive (formerly Polygon.io) aggregates. Needs MASSIVE_API_KEY."""
    mult, span = {"1m": (1, "minute"), "5m": (5, "minute"), "15m": (15, "minute"), "1h": (1, "hour"), "4h": (4, "hour"), "1d": (1, "day")}[tf]
    end = end or pd.Timestamp.utcnow().strftime("%Y-%m-%d")
    j = _get(f"https://api.massive.com/v2/aggs/ticker/{ticker}/range/{mult}/{span}/{start}/{end}",
             {"adjusted": "true", "sort": "asc", "limit": 50000, "apiKey": os.environ["MASSIVE_API_KEY"]})
    return _frame([[r["t"], r["o"], r["h"], r["l"], r["c"], r["v"]] for r in j.get("results", [])])


def csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = [c.lower().strip() for c in df.columns]
    tcol = next(c for c in df.columns if c in ("time", "date", "datetime", "timestamp", "open_time"))
    t = df[tcol]
    df["time"] = pd.to_datetime(t, unit="ms" if np.issubdtype(t.dtype, np.number) and t.max() > 1e11 else ("s" if np.issubdtype(t.dtype, np.number) else None), utc=True)
    if "volume" not in df:
        df["volume"] = 0.0
    return df.set_index("time")[["open", "high", "low", "close", "volume"]].astype(float).sort_index()


def load(source: str, symbol: str, tf: str = "1d", bars: int = 1500) -> pd.DataFrame:
    if source == "binance":
        return binance(symbol, tf, bars)
    if source == "coinbase":
        return coinbase(symbol, tf, bars)
    if source == "kraken":
        return kraken(symbol, tf)
    if source == "alpaca":
        return alpaca_stocks(symbol, tf, bars)
    if source == "massive":
        return massive(symbol, tf)
    if source == "csv":
        return csv(symbol)
    if source == "synthetic":
        return synthetic(bars, tf=tf)
    raise ValueError(f"unknown source {source}")


def synthetic(n: int = 1500, tf: str = "1d", seed: int = 42, start: str = "2020-01-01") -> pd.DataFrame:
    """Regime-switching random walk (trend up / range / trend down) with realistic wicks and volume. TEST DATA ONLY."""
    rng = np.random.default_rng(seed)
    regimes = rng.choice([0.0012, 0.0, -0.0010], size=n // 60 + 1, p=[0.4, 0.35, 0.25]).repeat(60)[:n]
    vol = 0.025 * (1 + 0.5 * np.abs(np.sin(np.arange(n) / 90)))
    r = regimes + vol * rng.standard_t(4, n) / 1.4
    close = 20000 * np.exp(np.cumsum(r))
    open_ = np.concatenate([[close[0]], close[:-1]]) * (1 + rng.normal(0, 0.002, n))
    hi = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.012, n)))
    lo = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.012, n)))
    v = 1000 * (1 + np.abs(r) / 0.02) * rng.lognormal(0, 0.3, n)
    idx = pd.date_range(start, periods=n, freq=pd.Timedelta(seconds=TF_SECONDS[tf]), tz="UTC")
    return pd.DataFrame({"open": open_, "high": hi, "low": lo, "close": close, "volume": v}, index=idx)
