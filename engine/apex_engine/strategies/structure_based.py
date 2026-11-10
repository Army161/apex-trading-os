from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Strategy, register
from .. import indicators as ind
from ..patterns import candles, swings, structure, liquidity_sweep, fvg


@register
class FailureTest2B(Strategy):
    id = "failure_test_2b"
    name = "Failure Test (2B) at Swing Extreme"
    source = "archive/chat/06-market-structure-course.md, archive/uploads/12-market-structure-masterclass.md"
    direction = "both"
    timeframes = ["1d", "4h", "1h"]
    description = ("Price trades beyond the last confirmed swing low (or high) and closes back inside it: the breakout failed "
                   "and trapped traders fuel the reversal. Enter at the close, stop just beyond the failed extreme, target 2R.")
    defaults = {"left": 3, "right": 3, "rr": 2.0}
    grid = {"left": [2, 3, 5], "rr": [1.5, 2.0, 3.0]}

    def signals(self, df):
        out = self.frame(df)
        sw = swings(df, self.left, self.right)
        c, l, h = df["close"], df["low"], df["high"]
        lsl, lsh = sw["last_sl"].shift(1), sw["last_sh"].shift(1)
        out["long_entry"] = (l < lsl) & (c > lsl)
        out["short_entry"] = (h > lsh) & (c < lsh)
        out["stop"] = np.where(out["long_entry"], l * 0.998, h * 1.002)
        stop = pd.Series(out["stop"], index=df.index)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - stop), c - self.rr * (stop - c))
        return out


@register
class StructurePullback(Strategy):
    id = "structure_pullback"
    name = "Trend Pullback to Broken Structure"
    source = "archive/chat/06-market-structure-course.md, archive/uploads/13-price-action-masterclass.md"
    direction = "both"
    timeframes = ["1d", "4h"]
    description = ("In a confirmed uptrend (higher highs and higher lows), after a break of structure, wait for price to pull "
                   "back to the broken swing high (old resistance = new support) and enter on a bullish reversal candle. Stop "
                   "below the higher low, target 2R. Mirror in downtrends.")
    defaults = {"left": 3, "right": 3, "tol_atr": 0.5, "rr": 2.0}
    grid = {"tol_atr": [0.3, 0.5, 1.0], "rr": [1.5, 2.0, 3.0]}

    def signals(self, df):
        out = self.frame(df)
        st = structure(df, self.left, self.right)
        cd = candles(df)
        a = ind.atr(df, 14)
        c = df["close"]
        broken_hi = st["prev_sh"].where(st["trend"] == 1)
        broken_lo = st["prev_sl"].where(st["trend"] == -1)
        near_hi = (df["low"] - broken_hi).abs() <= self.tol_atr * a
        near_lo = (df["high"] - broken_lo).abs() <= self.tol_atr * a
        out["long_entry"] = (st["trend"] == 1) & near_hi & cd["bull_reversal"] & (c > broken_hi)
        out["short_entry"] = (st["trend"] == -1) & near_lo & cd["bear_reversal"] & (c < broken_lo)
        out["stop"] = np.where(out["long_entry"], np.minimum(st["last_sl"], df["low"]) * 0.998, np.maximum(st["last_sh"], df["high"]) * 1.002)
        stop = pd.Series(out["stop"], index=df.index)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - stop), c - self.rr * (stop - c))
        out["long_exit"] = st["choch_dn"]
        out["short_exit"] = st["choch_up"]
        return out


@register
class SMCLiquiditySweep(Strategy):
    id = "smc_liquidity_sweep"
    name = "Smart Money Liquidity Grab + FVG"
    source = "archive/chat/09-smart-money-concepts-course.md, archive/uploads/08-liquidity-course.md"
    direction = "both"
    timeframes = ["4h", "1h", "15m"]
    description = ("Liquidity rests below equal lows / prior lows. When a wick sweeps it and the candle closes back above "
                   "(wick-and-reject), with higher-timeframe bias up (close > 200 EMA) and a bullish FVG or CHoCH within 5 "
                   "bars, go long. Stop beyond the wick, target 2R. Mirror for shorts.")
    defaults = {"lookback": 20, "bias_n": 200, "rr": 2.0}
    grid = {"lookback": [10, 20, 40], "rr": [2.0, 3.0]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        ls = liquidity_sweep(df, self.lookback)
        g = fvg(df)
        st = structure(df, 2, 2)
        bias = ind.ema(c, self.bias_n)
        conf_up = (g["bull_fvg"] | st["choch_up"] | st["bos_up"]).rolling(5).max().astype(bool)
        conf_dn = (g["bear_fvg"] | st["choch_dn"] | st["bos_dn"]).rolling(5).max().astype(bool)
        swept_lo = ls["sweep_low"].rolling(5).max().astype(bool)
        swept_hi = ls["sweep_high"].rolling(5).max().astype(bool)
        wick_lo = df["low"].rolling(5).min()
        wick_hi = df["high"].rolling(5).max()
        out["long_entry"] = swept_lo & conf_up & (c > bias) & (c > df["open"])
        out["short_entry"] = swept_hi & conf_dn & (c < bias) & (c < df["open"])
        out["stop"] = np.where(out["long_entry"], wick_lo * 0.998, wick_hi * 1.002)
        stop = pd.Series(out["stop"], index=df.index)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - stop), c - self.rr * (stop - c))
        return out


@register
class WyckoffSpring(Strategy):
    id = "wyckoff_spring"
    name = "Wyckoff Spring / Upthrust"
    source = "archive/chat/19-wyckoff-method-course.md"
    direction = "both"
    timeframes = ["1d", "4h"]
    description = ("Detect a trading range (N-bar range narrow relative to ATR after a prior trend). Spring: a false breakdown "
                   "below range support that closes back inside, ideally a bullish engulfing on high volume. Stop just below "
                   "the spring low, target the range top or 2R (whichever is nearer). Upthrust is the mirrored short.")
    defaults = {"range_n": 40, "max_range_atr": 8.0, "rr": 2.0, "vol_mult": 1.2}
    grid = {"range_n": [30, 40, 60], "max_range_atr": [6.0, 8.0, 10.0]}

    def signals(self, df):
        out = self.frame(df)
        c, h, l = df["close"], df["high"], df["low"]
        a = ind.atr(df, 14)
        top = h.rolling(self.range_n).max().shift(1)
        bot = l.rolling(self.range_n).min().shift(1)
        is_range = (top - bot) <= self.max_range_atr * a
        cd = candles(df)
        vol = df["volume"] >= self.vol_mult * ind.sma(df["volume"], 20)
        spring = is_range & (l < bot) & (c > bot) & (cd["bull_engulf"] | cd["hammer"] | (c > df["open"])) & vol
        upthrust = is_range & (h > top) & (c < top) & (cd["bear_engulf"] | cd["shooting_star"] | (c < df["open"])) & vol
        out["long_entry"] = spring
        out["short_entry"] = upthrust
        out["stop"] = np.where(spring, l * 0.998, h * 1.002)
        stop = pd.Series(out["stop"], index=df.index)
        rr_l = c + self.rr * (c - stop)
        rr_s = c - self.rr * (stop - c)
        out["target"] = np.where(spring, np.minimum(rr_l, top), np.maximum(rr_s, bot))
        return out


@register
class DoubleBottomBreakout(Strategy):
    id = "double_bottom"
    name = "Double Bottom / Top Neckline Breakout"
    source = "archive/chat/08-chart-patterns-course.md"
    direction = "both"
    timeframes = ["1d", "4h"]
    description = ("Two confirmed swing lows within 0.5 ATR of each other with a swing high (neckline) between them. Enter on a "
                   "close above the neckline. Stop below the lower of the two bottoms, target the measured move (neckline "
                   "minus bottom, projected up). Double top is the mirror.")
    defaults = {"tol_atr": 0.5, "left": 3, "right": 3}
    grid = {"tol_atr": [0.3, 0.5, 1.0]}

    def signals(self, df):
        out = self.frame(df)
        sw = swings(df, self.left, self.right)
        a = ind.atr(df, 14)
        c = df["close"]
        b1, b2, neck = sw["prev_sl"], sw["last_sl"], sw["last_sh"]
        dbl = ((b1 - b2).abs() <= self.tol_atr * a) & (neck > np.maximum(b1, b2))
        t1, t2, nl = sw["prev_sh"], sw["last_sh"], sw["last_sl"]
        dtop = ((t1 - t2).abs() <= self.tol_atr * a) & (nl < np.minimum(t1, t2))
        brk_up = (c > neck) & (c.shift(1) <= neck.shift(1))
        brk_dn = (c < nl) & (c.shift(1) >= nl.shift(1))
        out["long_entry"] = dbl & brk_up
        out["short_entry"] = dtop & brk_dn
        lowb, hight = np.minimum(b1, b2), np.maximum(t1, t2)
        out["stop"] = np.where(out["long_entry"], lowb * 0.998, hight * 1.002)
        out["target"] = np.where(out["long_entry"], neck + (neck - lowb), nl - (hight - nl))
        return out


@register
class BullFlag(Strategy):
    id = "bull_flag"
    name = "Bull / Bear Flag Breakout"
    source = "archive/chat/08-chart-patterns-course.md, archive/uploads/13-price-action-masterclass.md"
    direction = "both"
    timeframes = ["1d", "4h", "1h"]
    description = ("Flagpole: a move of at least 3 ATR within 5-10 bars. Flag: a tight 3-12 bar consolidation that retraces "
                   "under 50% of the pole. Enter on a close above the flag high with a momentum candle. Stop below the flag "
                   "low, target 2R (or measured pole height, whichever is smaller).")
    defaults = {"pole_atr": 3.0, "pole_n": 8, "flag_n": 6, "rr": 2.0}
    grid = {"pole_atr": [2.5, 3.0, 4.0], "flag_n": [4, 6, 10]}

    def signals(self, df):
        out = self.frame(df)
        c, h, l = df["close"], df["high"], df["low"]
        a = ind.atr(df, 14)
        fh = h.rolling(self.flag_n).max().shift(1)
        fl = l.rolling(self.flag_n).min().shift(1)
        pole_start = c.shift(self.flag_n + self.pole_n)
        pole_end = c.shift(self.flag_n)
        pole = pole_end - pole_start
        cd = candles(df)
        tight = (fh - fl) <= 0.5 * pole.abs()
        bull = (pole >= self.pole_atr * a) & tight & (fl > pole_end - 0.5 * pole) & (c > fh) & (cd["momentum_bull"] | (c > df["open"]))
        bear = (pole <= -self.pole_atr * a) & tight & (fh < pole_end - 0.5 * pole) & (c < fl) & (cd["momentum_bear"] | (c < df["open"]))
        out["long_entry"] = bull
        out["short_entry"] = bear
        out["stop"] = np.where(bull, fl * 0.998, fh * 1.002)
        stop = pd.Series(out["stop"], index=df.index)
        out["target"] = np.where(bull, np.minimum(c + self.rr * (c - stop), c + pole.abs()),
                                 np.maximum(c - self.rr * (stop - c), c - pole.abs()))
        return out


@register
class PinBarKeyLevel(Strategy):
    id = "pin_bar_level"
    name = "Pin Bar / Engulfing at Key Level"
    source = "archive/chat/14-candlestick-bible-course.md, archive/uploads/02-candlestick-patterns-ultimate-course.md"
    direction = "both"
    timeframes = ["1d", "4h", "1h"]
    description = ("Reaction candles only matter at key levels. A hammer/bullish engulfing whose wick tests a prior swing low "
                   "or the 50-bar low zone, on above-average volume, is a failure test: enter at the close, stop below the "
                   "wick, target 2R. Indecision candles are treated as warnings, never entries.")
    defaults = {"level_n": 50, "tol_atr": 0.5, "rr": 2.0}
    grid = {"level_n": [20, 50, 100], "rr": [1.5, 2.0, 3.0]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        a = ind.atr(df, 14)
        cd = candles(df)
        sw = swings(df, 3, 3)
        sup = sw["last_sl"].shift(1)
        res = sw["last_sh"].shift(1)
        at_sup = (df["low"] - sup).abs() <= self.tol_atr * a
        at_res = (df["high"] - res).abs() <= self.tol_atr * a
        vol = df["volume"] > ind.sma(df["volume"], 20)
        out["long_entry"] = at_sup & cd["bull_reversal"] & vol
        out["short_entry"] = at_res & cd["bear_reversal"] & vol
        out["stop"] = np.where(out["long_entry"], df["low"] * 0.998, df["high"] * 1.002)
        stop = pd.Series(out["stop"], index=df.index)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - stop), c - self.rr * (stop - c))
        return out


@register
class TopDownMTF(Strategy):
    id = "top_down_mtf"
    name = "Top-Down Multi-Timeframe Engulfing"
    source = "archive/chat/11-top-down-analysis-course.md"
    direction = "both"
    timeframes = ["1h", "30m"]
    description = ("Daily trend (close vs 50 EMA) and 4H structure must agree. On the execution timeframe, enter on an "
                   "engulfing candle with a volume spike (>1.5x average) in the direction of both higher timeframes. Stop "
                   "beyond the engulfing candle, target 2R.")
    defaults = {"vol_mult": 1.5, "rr": 2.0}
    grid = {"vol_mult": [1.2, 1.5, 2.0], "rr": [1.5, 2.0]}

    def signals(self, df):
        out = self.frame(df)
        c = df["close"]
        d = ind.resample_ohlcv(df, "1D")
        h4 = ind.resample_ohlcv(df, "4h")
        d_up = ind.align_htf(d["close"] > ind.ema(d["close"], 50), df.index).fillna(False).astype(bool)
        d_dn = ind.align_htf(d["close"] < ind.ema(d["close"], 50), df.index).fillna(False).astype(bool)
        h4_up = ind.align_htf(h4["close"] > ind.ema(h4["close"], 20), df.index).fillna(False).astype(bool)
        h4_dn = ind.align_htf(h4["close"] < ind.ema(h4["close"], 20), df.index).fillna(False).astype(bool)
        cd = candles(df)
        spike = df["volume"] > self.vol_mult * ind.sma(df["volume"], 20)
        out["long_entry"] = d_up & h4_up & cd["bull_engulf"] & spike
        out["short_entry"] = d_dn & h4_dn & cd["bear_engulf"] & spike
        out["stop"] = np.where(out["long_entry"], df["low"] * 0.999, df["high"] * 1.001)
        stop = pd.Series(out["stop"], index=df.index)
        out["target"] = np.where(out["long_entry"], c + self.rr * (c - stop), c - self.rr * (stop - c))
        return out
