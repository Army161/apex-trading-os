"""Turtle Breakout 55/20 (archive/chat/03) as a Freqtrade strategy.
Entry: close > prior 55-day high. Stop: 2x ATR(20) below the signal close (fixed, via custom_stoploss).
Exit: close < prior 20-day low. Long only, spot."""
from datetime import datetime

import talib.abstract as ta
from pandas import DataFrame
from freqtrade.strategy import IStrategy, IntParameter, DecimalParameter
from freqtrade.persistence import Trade


class ApexTurtle(IStrategy):
    INTERFACE_VERSION = 3
    timeframe = "1d"
    can_short = False
    minimal_roi = {"0": 100}          # exits come from the 20-day low rule, not ROI
    stoploss = -0.30                  # hard backstop; real stop is the ATR stop below
    use_custom_stoploss = True
    process_only_new_candles = True
    startup_candle_count = 80

    entry_n = IntParameter(20, 80, default=55, space="buy")
    exit_n = IntParameter(10, 30, default=20, space="sell")
    atr_mult = DecimalParameter(1.5, 3.5, default=2.0, decimals=1, space="sell")

    def populate_indicators(self, df: DataFrame, metadata: dict) -> DataFrame:
        df["atr20"] = ta.ATR(df, timeperiod=20)
        for n in range(10, 81, 5):
            df[f"hh{n}"] = df["high"].rolling(n).max().shift(1)
            df[f"ll{n}"] = df["low"].rolling(n).min().shift(1)
        df["hh55"] = df["high"].rolling(55).max().shift(1)
        df["ll20"] = df["low"].rolling(20).min().shift(1)
        return df

    def _col(self, df, prefix, n):
        c = f"{prefix}{n}"
        if c not in df:
            df[c] = (df["high"].rolling(n).max() if prefix == "hh" else df["low"].rolling(n).min()).shift(1)
        return df[c]

    def populate_entry_trend(self, df: DataFrame, metadata: dict) -> DataFrame:
        df.loc[(df["close"] > self._col(df, "hh", self.entry_n.value)) & (df["volume"] > 0), ["enter_long", "enter_tag"]] = (1, "turtle55")
        return df

    def populate_exit_trend(self, df: DataFrame, metadata: dict) -> DataFrame:
        df.loc[df["close"] < self._col(df, "ll", self.exit_n.value), ["exit_long", "exit_tag"]] = (1, "turtle20low")
        return df

    def custom_stoploss(self, pair: str, trade: Trade, current_time: datetime, current_rate: float,
                        current_profit: float, after_fill: bool, **kwargs) -> float | None:
        df, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        entry_rows = df.loc[df["date"] <= trade.open_date_utc]
        if entry_rows.empty:
            return None
        sig = entry_rows.iloc[-1]
        stop_price = sig["close"] - float(self.atr_mult.value) * sig["atr20"]
        return max(min((stop_price / current_rate) - 1, -0.001), -0.99)
