"""Paper trading loop for engine strategies. Polls candles, acts on the last CLOSED bar, simulates fills
at the next price, applies the RiskGuard, and reports everything to the Apex dashboard.
Live order routing is intentionally not wired here: graduate a strategy by running it through Freqtrade
(crypto) or the Day Trader executor (Alpaca) where exchange keys stay in env vars on your machine."""
from __future__ import annotations

import json
import os
import time

from . import data
from .risk import RiskGuard, RiskConfig
from .reporter import Reporter
from .strategies import get


class PaperTrader:
    def __init__(self, strategy: str, source: str, symbol: str, tf: str, equity: float = 10_000.0,
                 state_dir: str = ".apex", backtest_max_dd: float = -0.25, bot_id: str | None = None):
        os.makedirs(state_dir, exist_ok=True)
        self.strat = get(strategy)
        self.source, self.symbol, self.tf = source, symbol, tf
        self.bot_id = bot_id or f"engine-{strategy}-{symbol}-{tf}".lower()
        self.guard = RiskGuard(RiskConfig(backtest_max_dd=backtest_max_dd), os.path.join(state_dir, f"{self.bot_id}.risk.json"), equity)
        self.pos_path = os.path.join(state_dir, f"{self.bot_id}.pos.json")
        self.pos = json.load(open(self.pos_path)) if os.path.exists(self.pos_path) else None
        self.rep = Reporter(self.bot_id, kind="engine", name=f"{self.strat.name} {symbol} {tf}", mode="paper")

    def _save(self):
        json.dump(self.pos, open(self.pos_path, "w"))

    def step(self):
        df = data.load(self.source, self.symbol, self.tf, 600)
        df = df.iloc[:-1]  # drop the forming candle
        last = df.iloc[-1]
        sig = self.strat.latest(df)
        if self.pos:
            p = self.pos
            hit_stop = (last["low"] <= p["stop"]) if p["side"] == 1 else (last["high"] >= p["stop"])
            hit_tgt = p["target"] and ((last["high"] >= p["target"]) if p["side"] == 1 else (last["low"] <= p["target"]))
            ex = sig["exit_long"] if p["side"] == 1 else sig["exit_short"]
            if hit_stop or hit_tgt or ex:
                px = p["stop"] if hit_stop else (p["target"] if hit_tgt else float(last["close"]))
                pnl = (px - p["entry"]) * p["qty"] * p["side"]
                self.guard.on_close(pnl)
                self.rep.trade({**p, "exit": px, "pnl": pnl, "reason": "stop" if hit_stop else ("target" if hit_tgt else "signal"), "status": "closed"})
                self.pos = None
                self._save()
        elif sig["side"] != 0:
            ok, why = self.guard.check(sig["close"], sig["stop"], sig["target"] or (sig["close"] + 2 * (sig["close"] - sig["stop"]) * sig["side"]))
            if ok:
                qty = self.guard.size(sig["close"], sig["stop"])
                self.pos = {"side": sig["side"], "entry": sig["close"], "stop": sig["stop"], "target": sig["target"], "qty": qty,
                            "symbol": self.symbol, "strategy": self.strat.id, "time": sig["time"]}
                self.guard.on_open()
                self._save()
                self.rep.trade({**self.pos, "status": "open"})
            else:
                self.rep.event("blocked", f"{self.strat.id} {self.symbol}: {why}")
        self.rep.heartbeat({"equity": self.guard.state.equity, "paused": self.guard.state.paused,
                            "pause_reason": self.guard.state.pause_reason, "position": self.pos, "last_signal": sig})

    def loop(self, every_sec: int | None = None):
        every = every_sec or max(60, data.TF_SECONDS[self.tf] // 4)
        while True:
            try:
                self.step()
            except Exception as e:  # noqa: BLE001
                self.rep.event("error", str(e))
            time.sleep(every)
