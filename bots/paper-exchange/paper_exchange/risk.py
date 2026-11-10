"""Pre-trade risk gate (chat/79). Every paper order passes these checks before it can rest or fill. Refusals name the rule,
like web/lib/policy.ts. The kill switch uses the same pause / resume / kill commands the other bots get from the dashboard."""
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass


@dataclass
class RiskLimits:
    max_qty: float = 1.0               # per order
    max_notional: float = 1_000.0      # per order, quote currency
    max_position: float = 2.0          # absolute, units
    max_orders_per_min: int = 30       # misfire guard: a loop that spams orders trips this
    max_rejects_in_row: int = 5        # a strategy that keeps sending bad orders is paused
    price_band: float = 0.02           # limit price must be within 2% of the mid


class RiskGate:
    def __init__(self, limits: RiskLimits | None = None, clock=time.monotonic):
        self.l = limits or RiskLimits()
        self.clock = clock
        self.recent: deque[float] = deque()
        self.rejects_in_row = 0
        self.paused = False
        self.killed = False

    def command(self, cmd: str) -> None:
        if cmd == "pause":
            self.paused = True
        elif cmd == "resume" and not self.killed:
            self.paused = False
        elif cmd == "kill":
            self.killed = self.paused = True      # kill can't be resumed; restart the process on purpose

    def check(self, side: int, qty: float, price: float, mid: float | None, position: float) -> tuple[bool, str]:
        now = self.clock()
        while self.recent and now - self.recent[0] > 60:
            self.recent.popleft()
        rule = None
        if self.killed:
            rule = "kill-switch"
        elif self.paused:
            rule = "paused"
        elif qty <= 0 or qty > self.l.max_qty:
            rule = "max-qty"
        elif qty * price > self.l.max_notional:
            rule = "max-notional"
        elif abs(position + side * qty) > self.l.max_position:
            rule = "max-position"
        elif len(self.recent) >= self.l.max_orders_per_min:
            rule = "order-rate"
        elif mid is None:
            rule = "no-market"
        elif abs(price / mid - 1) > self.l.price_band:
            rule = "price-band"
        if rule:
            self.rejects_in_row += 1
            if self.rejects_in_row >= self.l.max_rejects_in_row and rule not in ("kill-switch", "paused"):
                self.paused = True
                rule += " (strategy paused after repeated rejects)"
            return False, rule
        self.rejects_in_row = 0
        self.recent.append(now)
        return True, "ok"
