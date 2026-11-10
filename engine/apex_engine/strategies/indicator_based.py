from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Strategy, register
from .. import indicators as ind
from ..patterns import candles, swings, divergence, liquidity_sweep


@register
class RSIRegime(Strategy):
    id = "rsi_regime"
    name = "RSI Regime (trend continuation / range reversion)"
    source = "archive/chat/15-rsi-indicator-course.md"
    direction = "both"
    timeframes = ["1d", "4h"]
    description = ("Classify regime with ADX. Trend regime: buy pullbacks where RSI dips toward 40-50 and turns back above 50 "
                   "(never sell just because RSI > 70). Range regime: mean-revert at 70/30 (80/20 on daily with RSI 21) only "
                   "with a reversal candle. Stop beyond the signal candle, target 2R.")
    defaults = {"rsi_n": 14, "adx_n": 14, "adx_trend": 25, "ob": 70, "os": 30, "rr": 2.0}
    grid = {"rsi_n": [9, 14, 21], "adx_trend": [20, 25], "rr": [1.5, 2.0]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        r = ind.rsi(c, self.rsi_n)
        ax = ind.adx(df, self.adx_n)
        cd = candles(df)
        ema50 = ind.ema(c, 50)
        trend = ax >= self.adx_trend
        cont_long = trend & (c > ema50) & (r > 50) & (r.shift(1) <= 50) & (r.rolling(5).min() >= 38)
        cont_short = trend & (c < ema50) & (r < 50) & (r.shift(1) >= 50) & (r.rolling(5).max() <= 62)
        rev_long = ~trend & (r.shift(1) < self.os) & cd["bull_reversal"]
        rev_short = ~trend & (r.shift(1) > self.ob) & cd["bear_reversal"]
        out["long_entry"] = cont_long | rev_long
        out["short_entry"] = cont_short | rev_short
        lo, hi = df["low"].rolling(3).min(), df["high"].rolling(3).max()
        out["stop"] = np.where(out["long_entry"], lo * 0.998, hi * 1.002)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - lo), c - self.rr * (hi - c))
        out["long_exit"] = trend & (r < 40)
        out["short_exit"] = trend & (r > 60)
        return out


@register
class MACDDivergence(Strategy):
    id = "macd_divergence"
    name = "MACD Divergence + Reversal Candle"
    source = "archive/chat/16-macd-indicator-course.md"
    direction = "both"
    timeframes = ["4h", "1d"]
    description = ("Plain MACD crossovers lose in the course's tests, so this only trades regular divergence between price swings "
                   "and the MACD histogram (3-10-16 SMA), confirmed by a hammer/engulfing or momentum candle within 3 bars. "
                   "Stop below the swing low, target 2R.")
    defaults = {"fast": 3, "slow": 10, "sig": 16, "rr": 2.0, "confirm_bars": 3}
    grid = {"rr": [1.5, 2.0], "confirm_bars": [2, 3, 5]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        m = ind.macd(c, self.fast, self.slow, self.sig, kind="sma")
        sw = swings(df, 3, 3)
        dv = divergence(c, m["hist"], sw)
        cd = candles(df)
        bull_recent = dv["bull_reg"].rolling(self.confirm_bars + 1).max().astype(bool)
        bear_recent = dv["bear_reg"].rolling(self.confirm_bars + 1).max().astype(bool)
        out["long_entry"] = bull_recent & (cd["bull_reversal"] | cd["momentum_bull"])
        out["short_entry"] = bear_recent & (cd["bear_reversal"] | cd["momentum_bear"])
        lo = sw["last_sl"].combine(df["low"].rolling(5).min(), min)
        hi = sw["last_sh"].combine(df["high"].rolling(5).max(), max)
        out["stop"] = np.where(out["long_entry"], lo * 0.998, hi * 1.002)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - lo), c - self.rr * (hi - c))
        return out


@register
class BollingerSqueeze(Strategy):
    id = "bb_squeeze"
    name = "Bollinger Squeeze Breakout"
    source = "archive/chat/18-bollinger-bands-course.md"
    direction = "both"
    timeframes = ["1d", "4h"]
    description = ("Bands at their tightest in N bars (squeeze), then a strong close well beyond the band with above-average "
                   "volume confirms the expansion. Swing settings 50/2.5 on daily, 10/1.5 intraday. Stop at the middle band, "
                   "target 2R.")
    defaults = {"n": 20, "k": 2.0, "squeeze_lookback": 120, "squeeze_pct": 0.15, "rr": 2.0}
    grid = {"n": [20, 50], "k": [2.0, 2.5], "squeeze_pct": [0.1, 0.2]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        b = ind.bollinger(c, self.n, self.k)
        q = b["width"].rolling(self.squeeze_lookback, min_periods=30).quantile(self.squeeze_pct)
        squeezed = (b["width"] <= q).rolling(10).max().astype(bool)
        vol = df["volume"] > ind.sma(df["volume"], 20)
        strong_up = (c > b["upper"]) & ((c - df["open"]) > 0.5 * (df["high"] - df["low"]))
        strong_dn = (c < b["lower"]) & ((df["open"] - c) > 0.5 * (df["high"] - df["low"]))
        out["long_entry"] = squeezed.shift(1, fill_value=False) & strong_up & vol
        out["short_entry"] = squeezed.shift(1, fill_value=False) & strong_dn & vol
        out["stop"] = b["mid"]
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - b["mid"]), c - self.rr * (b["mid"] - c))
        return out


@register
class BollingerFreeBar(Strategy):
    id = "bb_free_bar"
    name = "Bollinger Free-Bar Failure Test"
    source = "archive/chat/18-bollinger-bands-course.md"
    direction = "both"
    timeframes = ["1d", "4h", "1h"]
    description = ("A 'free bar' (whole candle outside the band) hints at exhaustion, but bands are not support/resistance, so "
                   "the trade needs a failure test: price must sweep the prior extreme and close back inside with a reversal "
                   "candle. Stop beyond the free bar, target 2R.")
    defaults = {"n": 20, "k": 2.0, "within": 3, "rr": 2.0}
    grid = {"k": [2.0, 2.5], "within": [2, 3, 5], "rr": [1.5, 2.0]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        b = ind.bollinger(c, self.n, self.k)
        free_lo = df["high"] < b["lower"]
        free_hi = df["low"] > b["upper"]
        cd = candles(df)
        ls = liquidity_sweep(df, 10)
        recent_lo = free_lo.rolling(self.within).max().astype(bool)
        recent_hi = free_hi.rolling(self.within).max().astype(bool)
        out["long_entry"] = recent_lo & cd["bull_reversal"] & (c > b["lower"]) & ls["sweep_low"].rolling(2).max().astype(bool)
        out["short_entry"] = recent_hi & cd["bear_reversal"] & (c < b["upper"]) & ls["sweep_high"].rolling(2).max().astype(bool)
        lo, hi = df["low"].rolling(self.within + 1).min(), df["high"].rolling(self.within + 1).max()
        out["stop"] = np.where(out["long_entry"], lo * 0.998, hi * 1.002)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - lo), c - self.rr * (hi - c))
        return out


@register
class VWAPReclaim(Strategy):
    id = "vwap_reclaim"
    name = "VWAP Trend Reclaim / Band Reversion"
    source = "archive/uploads/05-vwap-indicator-course.md"
    direction = "both"
    timeframes = ["15m", "1h", "4h"]
    description = ("Intraday: with the session VWAP sloping up, buy the first close back above VWAP after a pullback below it "
                   "(institutional fair value). Mirror for shorts. When VWAP is flat, fade closes back inside the 2-sigma "
                   "band. Stop beyond the pullback extreme, target 2R or the opposite band.")
    defaults = {"anchor": "D", "slope_n": 5, "rr": 2.0}
    grid = {"anchor": ["D", "W"], "rr": [1.5, 2.0]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        vb = ind.vwap_bands(df, self.anchor)
        v = vb["vwap"]
        slope = v - v.shift(self.slope_n)
        flat = slope.abs() < 0.1 * ind.atr(df, 14)
        reclaim_up = (c > v) & (c.shift(1) < v.shift(1)) & (slope > 0) & ~flat
        reclaim_dn = (c < v) & (c.shift(1) > v.shift(1)) & (slope < 0) & ~flat
        fade_up = flat & (c.shift(1) < vb["lo2"].shift(1)) & (c > vb["lo2"])
        fade_dn = flat & (c.shift(1) > vb["up2"].shift(1)) & (c < vb["up2"])
        out["long_entry"] = reclaim_up | fade_up
        out["short_entry"] = reclaim_dn | fade_dn
        lo, hi = df["low"].rolling(4).min(), df["high"].rolling(4).max()
        out["stop"] = np.where(out["long_entry"], lo * 0.999, hi * 1.001)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - lo), c - self.rr * (hi - c))
        return out


@register
class OrderFlowDeltaDivergence(Strategy):
    id = "delta_divergence"
    name = "Order-Flow Delta Absorption (bar proxy)"
    source = "archive/uploads/10-order-flow-course.md, archive/uploads/08-liquidity-course.md"
    direction = "both"
    timeframes = ["5m", "15m", "1h"]
    description = ("True order flow needs footprint/tick data. This proxy uses bar-level buy/sell pressure: price makes a new "
                   "N-bar low while cumulative delta makes a higher low (sellers absorbed) and the bar sweeps liquidity and "
                   "closes back inside. Mirror for shorts. Stop beyond the sweep, target 2R. Swap in real delta when a "
                   "footprint feed is connected.")
    defaults = {"lookback": 20, "rr": 2.0}
    grid = {"lookback": [10, 20, 40], "rr": [1.5, 2.0]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        cvd = ind.volume_delta_proxy(df).rolling(self.lookback).sum()
        ls = liquidity_sweep(df, self.lookback)
        cvd_prev_low = cvd.rolling(self.lookback).min().shift(1)
        cvd_prev_high = cvd.rolling(self.lookback).max().shift(1)
        out["long_entry"] = ls["sweep_low"] & (cvd > cvd_prev_low)
        out["short_entry"] = ls["sweep_high"] & (cvd < cvd_prev_high)
        out["stop"] = np.where(out["long_entry"], df["low"] * 0.999, df["high"] * 1.001)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - df["low"]), c - self.rr * (df["high"] - c))
        return out


@register
class SupertrendFlip(Strategy):
    id = "supertrend"
    name = "Supertrend Flip"
    source = "archive/chat/24-delta-exchange-ai-algo-terminal.md"
    direction = "both"
    timeframes = ["15m", "1h", "4h"]
    description = ("The Delta terminal demo strategy: go long when a candle closes above the Supertrend line (trend flips up), "
                   "short when it closes below. The video buys ATM calls/puts; here it trades the underlying. "
                   "Fixed % stop and % target (demo default 10% / 30% of premium, here 2% / 6% of price), exit on the opposite flip.")
    defaults = {"atr_len": 10, "mult": 3.0, "stop_pct": 0.02, "target_pct": 0.06}
    grid = {"atr_len": [10, 20], "mult": [2.0, 3.0], "target_pct": [0.04, 0.06]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        st = ind.supertrend(df, self.atr_len, self.mult)
        d, pd_ = st["dir"], st["dir"].shift(1)
        out["long_entry"] = (d == 1) & (pd_ == -1)
        out["short_entry"] = (d == -1) & (pd_ == 1)
        out["stop"] = np.where(out["long_entry"], c * (1 - self.stop_pct), c * (1 + self.stop_pct))
        out["target"] = np.where(out["long_entry"], c * (1 + self.target_pct), c * (1 - self.target_pct))
        out["long_exit"] = d == -1
        out["short_exit"] = d == 1
        return out
