"""Replay a recorder file through the book, the risk gate and a strategy callback, with fills only from real prints.
Run: python3 -m paper_exchange.sim recordings/BTC-USD-2026-11-10.jsonl"""
from __future__ import annotations

import json
import sys
import time

from .book import OrderBook
from .events import EventStream
from .metrics import Latency
from .orders import OrderLog, PaperOrder
from .risk import RiskGate


class PaperExchange:
    def __init__(self, symbol: str, gate: RiskGate | None = None, log: OrderLog | None = None):
        self.book, self.stream, self.gate = OrderBook(symbol), EventStream(), gate or RiskGate()
        self.log, self.lat = log or OrderLog(), Latency()
        self.open: list[PaperOrder] = []
        self.position = 0.0
        self.cash = 0.0

    def submit(self, side: int, qty: float, price: float) -> PaperOrder:
        o = PaperOrder(side, qty, price)
        ok, why = self.gate.check(side, qty, price, self.book.mid(), self.position + sum(x.side * (x.qty - x.filled) for x in self.open))
        if not ok:
            self.log.record(o, "rejected", why)
            self.stream.publish("reject", {"id": o.id, "rule": why})
        else:
            self.open.append(o)
            self.log.record(o, "rested")
        return o

    def cancel_all(self) -> None:
        for o in self.open:
            self.log.record(o, "cancelled")
        self.open.clear()

    def on_row(self, row: dict, strategy=None) -> None:
        t0 = time.perf_counter_ns()
        if row.get("kind") == "quote":
            self.book.apply_quote(row["bid"], row["ask"], row["t"])
            self.stream.publish("quote", row)
        elif row.get("kind") == "print":
            self.stream.publish("print", row)
            left = row["qty"]
            for o in list(self.open):
                hit = (o.side == 1 and row["side"] == "sell" and row["price"] <= o.price) or (o.side == -1 and row["side"] == "buy" and row["price"] >= o.price)
                if not hit or left <= 0:
                    continue
                q = min(o.qty - o.filled, left)
                left -= q
                o.filled += q
                self.position += o.side * q
                self.cash -= o.side * q * o.price
                done = o.filled >= o.qty - 1e-12
                self.log.record(o, "filled" if done else "partial", fill_qty=q, fill_px=o.price)
                if done:
                    self.open.remove(o)
        if strategy:
            strategy(self, row)
        self.lat.add(time.perf_counter_ns() - t0)

    def health(self) -> dict:
        m = self.book.mid()
        return {"latency": self.lat.summary(), "dropped_events": self.stream.dropped, "open_orders": len(self.open),
                "position": self.position, "equity": self.cash + self.position * (m or 0), "paused": self.gate.paused, "killed": self.gate.killed}


def main(path: str) -> None:
    ex = PaperExchange("replay")
    with open(path) as f:
        for line in f:
            ex.on_row(json.loads(line))
    print(json.dumps(ex.health(), indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
