"""Pluggable trailing stop for paper bots (archive/chat/81). Our own code, paper only, not a port of the MQL5 EA.

Same modes and guards as web/lib/engine/trail.ts: scalp (trigger/distance), previous-N-candle low/high, fast MA, and the
Ichimoku Tenkan-sen. A new stop is accepted only if it is tighter than the current one, past the entry price, on the right
side of the bid (ask for shorts) and at least `stop_level` away from it. Distances are in ATR(14) multiples.

The EA author warns that constant modifications can get an account banned, so this class also counts every modification
and refuses more than `max_mods_per_min`. The idea is UNPROVEN: the author never tested it, and our backtest found no trail
that beat the fixed target on the pullback candidate (docs/validation-results.md).
"""
from __future__ import annotations
from collections import deque
from dataclasses import dataclass, field


@dataclass
class TrailConfig:
    mode: str = "scalp"          # scalp | candles | ma | tenkan
    trigger: float = 0.5         # scalp: ATR of profit before trailing starts
    distance: float = 0.3        # scalp: ATR behind price
    n: int = 2                   # candles: previous bars
    period: int = 9              # ma / tenkan period
    ma_type: str = "ema"         # ema | sma
    stop_level: float = 0.0      # broker minimum distance, ATR
    beyond_entry: bool = True
    max_mods_per_min: int = 6


@dataclass
class TrailingStop:
    cfg: TrailConfig
    side: int                    # 1 long, -1 short
    entry: float
    stop: float
    mods: int = 0
    refused_rate: int = 0
    _times: deque = field(default_factory=deque)

    @staticmethod
    def atr(bars: list[tuple[float, float, float]], n: int = 14) -> float:
        """bars are (high, low, close), oldest first. Wilder ATR."""
        if len(bars) < n + 1:
            return float("nan")
        trs = [max(h - l, abs(h - bars[i - 1][2]), abs(l - bars[i - 1][2])) for i, (h, l, _) in enumerate(bars) if i > 0]
        a = sum(trs[:n]) / n
        for x in trs[n:]:
            a = (a * (n - 1) + x) / n
        return a

    def candidate(self, bars, bid: float, ask: float) -> float | None:
        c, s, a = self.cfg, self.side, self.atr(bars)
        if a != a:
            return None
        px = bid if s == 1 else ask
        if c.mode == "scalp":
            if (px - self.entry) * s <= c.trigger * a:
                return None
            return px - s * c.distance * a
        if c.mode == "candles":
            w = bars[-c.n:]
            return min(b[1] for b in w) if s == 1 else max(b[0] for b in w)
        if c.mode == "tenkan":
            w = bars[-c.period:]
            return (max(b[0] for b in w) + min(b[1] for b in w)) / 2
        if c.mode == "ma":
            closes = [b[2] for b in bars]
            if c.ma_type == "sma":
                return sum(closes[-c.period:]) / c.period
            k, e = 2 / (c.period + 1), closes[0]
            for x in closes[1:]:
                e = x * k + e * (1 - k)
            return e
        raise ValueError(f"unknown trail mode {c.mode}")

    def update(self, bars, bid: float, ask: float, now_s: float) -> float | None:
        """Call on each bar close. Returns the new stop if it moved, else None. The caller sends the paper modification."""
        cand = self.candidate(bars, bid, ask)
        if cand is None:
            return None
        s, a, px = self.side, self.atr(bars), (bid if self.side == 1 else ask)
        if (cand - self.stop) * s <= 0:
            return None                                  # never loosen
        if self.cfg.beyond_entry and (cand - self.entry) * s <= 0:
            return None                                  # keep it past the entry
        if (px - cand) * s <= self.cfg.stop_level * a:
            return None                                  # broker stop level
        while self._times and now_s - self._times[0] >= 60:
            self._times.popleft()
        if len(self._times) >= self.cfg.max_mods_per_min:
            self.refused_rate += 1
            return None                                  # modification budget: the ban risk the author warns about
        self._times.append(now_s)
        self.stop, self.mods = cand, self.mods + 1
        return cand

    def hit(self, low: float, high: float) -> bool:
        return low <= self.stop if self.side == 1 else high >= self.stop
