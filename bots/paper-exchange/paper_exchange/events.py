"""Event stream with high-precision timestamps (chat/79). One producer, bounded buffer: when full, the oldest event is dropped
and counted, so a slow consumer can't grow memory without limit and the drop is visible instead of silent."""
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class Event:
    kind: str                 # "quote", "print", "order", "fill", "reject", "risk"
    data: dict
    seq: int = 0
    wall_ns: int = field(default_factory=time.time_ns)          # when it happened, for the log
    mono_ns: int = field(default_factory=time.perf_counter_ns)  # for measuring latency; never goes backwards


class EventStream:
    def __init__(self, capacity: int = 100_000):
        self.buf: deque[Event] = deque(maxlen=capacity)
        self.seq = 0
        self.dropped = 0

    def publish(self, kind: str, data: dict) -> Event:
        if len(self.buf) == self.buf.maxlen:
            self.dropped += 1
        self.seq += 1
        e = Event(kind, data, self.seq)
        self.buf.append(e)
        return e

    def drain(self):
        while self.buf:
            yield self.buf.popleft()
