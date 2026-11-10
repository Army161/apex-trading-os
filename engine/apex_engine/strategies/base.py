from __future__ import annotations

import numpy as np
import pandas as pd

REGISTRY: dict[str, type["Strategy"]] = {}


def register(cls):
    REGISTRY[cls.id] = cls
    return cls


def get(sid: str, **params) -> "Strategy":
    if sid not in REGISTRY:
        raise KeyError(f"unknown strategy {sid!r}; known: {', '.join(sorted(REGISTRY))}")
    return REGISTRY[sid](**params)


def all_strategies() -> list[dict]:
    return [{"id": k, "name": v.name, "source": v.source, "direction": v.direction, "timeframes": v.timeframes,
             "description": v.description, "defaults": v.defaults, "grid": v.grid} for k, v in sorted(REGISTRY.items())]


class Strategy:
    id = "base"
    name = "Base"
    source = ""          # archive file(s) the rules came from
    direction = "long"   # long | short | both
    timeframes = ["1d"]
    description = ""
    defaults: dict = {}
    grid: dict = {}      # parameter grid for walk-forward optimisation

    def __init__(self, **params):
        self.params = {**self.defaults, **params}

    def __getattr__(self, k):
        p = self.__dict__.get("params", {})
        if k in p:
            return p[k]
        raise AttributeError(k)

    @staticmethod
    def frame(df: pd.DataFrame) -> pd.DataFrame:
        out = pd.DataFrame(index=df.index)
        for col in ("long_entry", "short_entry", "long_exit", "short_exit"):
            out[col] = False
        out["stop"] = np.nan
        out["target"] = np.nan
        out["trail"] = np.nan
        return out

    def signals(self, df: pd.DataFrame) -> pd.DataFrame:  # pragma: no cover
        raise NotImplementedError

    def latest(self, df: pd.DataFrame) -> dict:
        """Signal on the last CLOSED bar, for live scanning / paper trading."""
        s = self.signals(df).iloc[-1]
        side = 1 if s["long_entry"] else (-1 if s["short_entry"] else 0)
        return {"strategy": self.id, "time": df.index[-1].isoformat(), "side": side, "close": float(df["close"].iloc[-1]),
                "stop": None if np.isnan(s["stop"]) else float(s["stop"]),
                "target": None if np.isnan(s["target"]) else float(s["target"]),
                "exit_long": bool(s["long_exit"]), "exit_short": bool(s["short_exit"])}


def rr_target(entry: pd.Series, stop: pd.Series, r: float, side: int = 1) -> pd.Series:
    return entry + side * r * (entry - stop).abs()
