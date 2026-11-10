"""Risk guard shared by every Apex bot. Codifies the risk-management (upload 06) and trading-psychology
(chat 07) courses:
  * fixed fractional risk per trade (default 1%, hard cap 2%) and size = risk / stop distance
  * every trade must have a predefined entry, stop and target before it is placed
  * cooldown after a loss (no revenge trading), longer after consecutive losses
  * daily loss limit and max open positions
  * auto-pause when live drawdown exceeds the strategy's worst backtest drawdown (the edge may be gone)
State is plain JSON so the dashboard and every bot can read it.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, asdict, field


@dataclass
class RiskConfig:
    risk_pct: float = 0.01
    max_risk_pct: float = 0.02
    min_rr: float = 1.5
    cooldown_after_loss_min: int = 60
    cooldown_after_streak_min: int = 24 * 60
    streak_len: int = 3
    daily_loss_limit_pct: float = 0.03
    max_open_positions: int = 3
    backtest_max_dd: float = -0.25      # filled from the strategy's backtest
    dd_pause_buffer: float = 1.0        # pause when live DD <= backtest DD * buffer


@dataclass
class RiskState:
    equity_peak: float = 0.0
    equity: float = 0.0
    day: str = ""
    day_start_equity: float = 0.0
    losses_in_row: int = 0
    cooldown_until: float = 0.0
    open_positions: int = 0
    paused: bool = False
    pause_reason: str = ""
    log: list = field(default_factory=list)


class RiskGuard:
    def __init__(self, cfg: RiskConfig | None = None, path: str | None = None, equity: float = 10_000.0):
        self.cfg = cfg or RiskConfig()
        self.path = path
        self.state = RiskState(equity_peak=equity, equity=equity, day_start_equity=equity)
        if path and os.path.exists(path):
            self.state = RiskState(**json.load(open(path)))

    def save(self):
        if self.path:
            json.dump(asdict(self.state), open(self.path, "w"), indent=1)

    def _note(self, msg):
        self.state.log = (self.state.log + [[time.time(), msg]])[-100:]

    def size(self, entry: float, stop: float, equity: float | None = None, risk_pct: float | None = None) -> float:
        eq = equity if equity is not None else self.state.equity
        rp = min(risk_pct or self.cfg.risk_pct, self.cfg.max_risk_pct)
        d = abs(entry - stop)
        return 0.0 if d <= 0 else eq * rp / d

    def check(self, entry: float | None, stop: float | None, target: float | None, now: float | None = None) -> tuple[bool, str]:
        now = now or time.time()
        s, c = self.state, self.cfg
        self._roll_day(now)
        if s.paused:
            return False, f"paused: {s.pause_reason}"
        if entry is None or stop is None or target is None:
            return False, "trade plan incomplete: entry, stop and target are all required before entering"
        rr = abs(target - entry) / max(abs(entry - stop), 1e-12)
        if rr < c.min_rr:
            return False, f"reward:risk {rr:.2f} below minimum {c.min_rr}"
        if now < s.cooldown_until:
            return False, f"cooldown after loss, {int((s.cooldown_until - now) / 60)} min left"
        if s.open_positions >= c.max_open_positions:
            return False, "max open positions reached"
        if s.day_start_equity and (s.equity / s.day_start_equity - 1) <= -c.daily_loss_limit_pct:
            return False, "daily loss limit hit, trading stops until tomorrow"
        return True, "ok"

    def on_open(self):
        self.state.open_positions += 1
        self.save()

    def on_close(self, pnl: float, now: float | None = None):
        now = now or time.time()
        s, c = self.state, self.cfg
        s.open_positions = max(0, s.open_positions - 1)
        s.equity += pnl
        s.equity_peak = max(s.equity_peak, s.equity)
        if pnl < 0:
            s.losses_in_row += 1
            mins = c.cooldown_after_streak_min if s.losses_in_row >= c.streak_len else c.cooldown_after_loss_min
            s.cooldown_until = now + mins * 60
            self._note(f"loss {pnl:.2f}; cooldown {mins} min")
        else:
            s.losses_in_row = 0
        dd = s.equity / s.equity_peak - 1 if s.equity_peak else 0
        if dd <= c.backtest_max_dd * c.dd_pause_buffer:
            s.paused, s.pause_reason = True, f"live drawdown {dd:.1%} exceeded backtest worst {c.backtest_max_dd:.1%}"
            self._note(s.pause_reason)
        self.save()

    def resume(self):
        self.state.paused, self.state.pause_reason = False, ""
        self._note("resumed manually")
        self.save()

    def _roll_day(self, now):
        d = time.strftime("%Y-%m-%d", time.gmtime(now))
        if d != self.state.day:
            self.state.day, self.state.day_start_equity = d, self.state.equity
