"""Apex confluence checklist (archive/chat/17 + candle, RSI, MACD, Wyckoff courses) for Freqtrade, 4h.
Imports the shared scoring from the Apex engine so backtests and live signals use ONE implementation.
Install the engine into the freqtrade env first:  pip install -e ../../engine"""
from pandas import DataFrame
from freqtrade.strategy import IStrategy, IntParameter

from apex_engine.strategies.confluence import score_frame


class ApexConfluence(IStrategy):
    INTERFACE_VERSION = 3
    timeframe = "4h"
    can_short = False
    minimal_roi = {"0": 0.12, "720": 0.06, "2880": 0.02}
    stoploss = -0.06
    trailing_stop = True
    trailing_stop_positive = 0.02
    trailing_stop_positive_offset = 0.04
    process_only_new_candles = True
    startup_candle_count = 260
    threshold = IntParameter(45, 80, default=60, space="buy")

    def populate_indicators(self, df: DataFrame, metadata: dict) -> DataFrame:
        s = score_frame(df.set_index("date"))
        df["L_score"] = s["L_score"].values
        df["S_score"] = s["S_score"].values
        df["L_trigger"] = s["L_trigger"].values
        return df

    def populate_entry_trend(self, df: DataFrame, metadata: dict) -> DataFrame:
        df.loc[(df["L_score"] >= self.threshold.value) & (df["L_trigger"] > 0) & (df["L_score"] > df["S_score"]),
               ["enter_long", "enter_tag"]] = (1, "confluence")
        return df

    def populate_exit_trend(self, df: DataFrame, metadata: dict) -> DataFrame:
        df.loc[df["S_score"] >= self.threshold.value, ["exit_long", "exit_tag"]] = (1, "bearish_confluence")
        return df
