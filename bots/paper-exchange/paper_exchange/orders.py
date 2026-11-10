"""Paper orders and their state log (chat/79): new -> rested -> partial -> filled, or rejected / cancelled. Every change is a
row, so the audit trail shows exactly what happened to each order. Fills come only from replayed market prints."""
from __future__ import annotations

import itertools
import json
import time
from dataclasses import dataclass, field

_ids = itertools.count(1)


@dataclass
class PaperOrder:
    side: int            # +1 buy, -1 sell
    qty: float
    price: float
    id: int = field(default_factory=lambda: next(_ids))
    filled: float = 0.0
    state: str = "new"


class OrderLog:
    def __init__(self, path: str | None = None):
        self.rows: list[dict] = []
        self.path = path

    def record(self, o: PaperOrder, state: str, why: str = "", fill_qty: float = 0.0, fill_px: float = 0.0) -> None:
        o.state = state
        row = {"ts_ns": time.time_ns(), "id": o.id, "side": o.side, "qty": o.qty, "price": o.price, "filled": o.filled,
               "state": state, "why": why, "fill_qty": fill_qty, "fill_px": fill_px, "mode": "paper"}
        self.rows.append(row)
        if self.path:
            with open(self.path, "a") as f:
                f.write(json.dumps(row) + "\n")
