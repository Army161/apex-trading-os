"""In-memory order book. Following the low-latency talk (chat/80): each side is a flat sorted list of [price, qty] levels,
not a tree or dict of nodes, stored so the best price is at the END of the list. Most updates land near the top of the book,
so a search from the end finds them in a few steps and inserting or removing there moves few elements."""
from __future__ import annotations


class Side:
    def __init__(self, is_bid: bool):
        self.is_bid = is_bid
        self.levels: list[list[float]] = []   # bids: ascending (best = highest at end); asks: descending (best = lowest at end)

    def _better_or_equal(self, a: float, b: float) -> bool:
        return a >= b if self.is_bid else a <= b

    def update(self, price: float, qty: float) -> None:
        """Set the resting size at a price; qty 0 removes the level. Linear search from the best end."""
        lv = self.levels
        i = len(lv) - 1
        while i >= 0 and not self._better_or_equal(price, lv[i][0]):   # walk down from the best price
            i -= 1
        if i >= 0 and lv[i][0] == price:
            if qty > 0:
                lv[i][1] = qty
            else:
                del lv[i]
        elif qty > 0:
            lv.insert(i + 1, [price, qty])

    def best(self):
        return tuple(self.levels[-1]) if self.levels else None

    def depth(self, n: int = 5):
        return [tuple(x) for x in reversed(self.levels[-n:])]


class OrderBook:
    def __init__(self, symbol: str):
        self.symbol = symbol
        self.bids, self.asks = Side(True), Side(False)
        self.last_ts = 0

    def apply(self, side: str, price: float, qty: float, ts: int = 0) -> None:
        (self.bids if side == "bid" else self.asks).update(price, qty)
        self.last_ts = ts or self.last_ts

    def apply_quote(self, bid: float, ask: float, ts: int = 0, size: float = 1.0) -> None:
        """Top-of-book only (what the recorder's ticker channel gives): replace both best levels."""
        self.bids.levels = [[bid, size]]
        self.asks.levels = [[ask, size]]
        self.last_ts = ts or self.last_ts

    def best_bid(self):
        return self.bids.best()

    def best_ask(self):
        return self.asks.best()

    def mid(self):
        b, a = self.best_bid(), self.best_ask()
        return (b[0] + a[0]) / 2 if b and a else None

    def crossed(self) -> bool:
        b, a = self.best_bid(), self.best_ask()
        return bool(b and a and b[0] >= a[0])
