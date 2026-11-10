from __future__ import annotations

import numpy as np

from .base import Strategy, register
from .. import indicators as ind


@register
class Turtle5520(Strategy):
    id = "turtle_55_20"
    name = "Turtle Breakout 55/20"
    source = "archive/chat/03-turtle-breakout-ai-trading-bot-tradingview.md"
    direction = "long"
    timeframes = ["1d"]
    description = ("Enter long when the daily close breaks above the prior 55-day high. Fixed stop 2x ATR(20) below the "
                   "signal close. Exit when the close falls below the prior 20-day low. Risk 1% per trade. Long only.")
    defaults = {"entry_n": 55, "exit_n": 20, "atr_n": 20, "atr_mult": 2.0}
    grid = {"entry_n": [20, 40, 55, 70], "exit_n": [10, 20, 30], "atr_mult": [1.5, 2.0, 3.0]}

    def signals(self, df):
        out = self.frame(df)
        up = ind.donchian(df, self.entry_n)["upper"]
        lo = ind.donchian(df, self.exit_n)["lower"]
        a = ind.atr(df, self.atr_n)
        c = df["close"]
        out["long_entry"] = c > up
        out["stop"] = c - self.atr_mult * a
        out["long_exit"] = c < lo
        return out


@register
class SMA50Trend(Strategy):
    id = "sma50_trend"
    name = "SMA 50 Trend (long/flat)"
    source = "archive/chat/05-ai-trading-tradingview-sma50-course.md"
    direction = "long"
    timeframes = ["1d"]
    description = ("Long when the daily close crosses above the 50 SMA, flat when it closes back below. Compared against "
                   "buy-and-hold; 2% risk sizing on a 2x ATR protective stop.")
    defaults = {"n": 50, "atr_mult": 3.0}
    grid = {"n": [20, 50, 100, 200], "atr_mult": [2.0, 3.0, 4.0]}

    def signals(self, df):
        out = self.frame(df)
        m = ind.sma(df["close"], self.n)
        c = df["close"]
        out["long_entry"] = (c > m) & (c.shift(1) <= m.shift(1))
        out["long_exit"] = c < m
        out["stop"] = c - self.atr_mult * ind.atr(df, 14)
        return out


@register
class SwingBullFlagMACD(Strategy):
    id = "swing_flag_macd"
    name = "Swing Bull-Flag Pullback + MACD 3-10-16"
    source = "archive/chat/13-swing-trading-course.md"
    direction = "long"
    timeframes = ["1d", "4h"]
    description = ("Daily uptrend (close > 50 SMA, 50 SMA rising). Wait for a 3-10 bar pullback into the 20 EMA, then enter on "
                   "a bullish reversal candle (hammer/engulfing) or a break of the pullback high while MACD(3,10,16 SMA) "
                   "histogram turns up with above-average volume. Stop below pullback low, target 2R. Long only.")
    defaults = {"trend_n": 50, "pb_n": 20, "rr": 2.0, "vol_mult": 1.0}
    grid = {"trend_n": [50, 100], "pb_n": [10, 20], "rr": [1.5, 2.0, 3.0]}

    def signals(self, df):
        from ..patterns import candles
        out = self.frame(df)
        c = df["close"]
        trend = ind.sma(c, self.trend_n)
        e = ind.ema(c, self.pb_n)
        m = ind.macd(c, 3, 10, 16, kind="sma")
        cd = candles(df)
        uptrend = (c > trend) & (trend > trend.shift(5))
        touched = (df["low"] <= e * 1.005).rolling(5).max().astype(bool)
        pb_low = df["low"].rolling(7).min()
        pb_high = df["high"].rolling(5).max().shift(1)
        trigger = cd["bull_reversal"] | (c > pb_high)
        mom = (m["hist"] > m["hist"].shift(1)) & (m["hist"].shift(1) <= m["hist"].shift(2))
        vol = df["volume"] >= self.vol_mult * ind.sma(df["volume"], 20)
        out["long_entry"] = uptrend & touched & trigger & mom & vol
        out["stop"] = pb_low * 0.998
        out["target"] = c + self.rr * (c - out["stop"])
        out["long_exit"] = c < trend
        return out


@register
class BuyHold(Strategy):
    id = "buy_hold"
    name = "Buy and Hold (benchmark)"
    source = "benchmark"
    direction = "long"
    description = "Buys on the first bar and holds. Used as the honest benchmark every strategy is compared with."
    defaults = {}
    full_size = True

    def signals(self, df):
        out = self.frame(df)
        out.iloc[0, out.columns.get_loc("long_entry")] = True
        out["stop"] = df["close"] * 0.0001
        return out
