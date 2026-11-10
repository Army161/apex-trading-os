"""Latency and health numbers (chat/79, chat/80). The talk's point: look at the whole distribution, especially the tail,
not the average. Reported as p50 / p99 / max in microseconds, ready for the dashboard health panel."""
from __future__ import annotations


class Latency:
    def __init__(self):
        self.samples_ns: list[int] = []

    def add(self, ns: int) -> None:
        self.samples_ns.append(ns)

    def summary(self) -> dict:
        s = sorted(self.samples_ns)
        if not s:
            return {"n": 0}
        q = lambda p: s[min(len(s) - 1, int(p * len(s)))] / 1000
        return {"n": len(s), "p50_us": q(0.5), "p99_us": q(0.99), "max_us": s[-1] / 1000}
