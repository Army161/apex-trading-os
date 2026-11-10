import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from paper_exchange import OrderBook, RiskGate, RiskLimits, EventStream
from paper_exchange.sim import PaperExchange


def test_book_keeps_best_at_end_and_removes_levels():
    b = OrderBook("X")
    for p, q in [(99, 1), (100, 2), (98, 3), (101.5, 1)]:
        b.apply("bid", p, q)
    for p, q in [(103, 1), (102, 2), (104, 1)]:
        b.apply("ask", p, q)
    assert b.best_bid() == (101.5, 1) and b.best_ask() == (102, 2)
    assert [x[0] for x in b.bids.levels] == [98, 99, 100, 101.5]
    b.apply("bid", 101.5, 0); b.apply("bid", 100, 5)
    assert b.best_bid() == (100, 5) and b.mid() == 101 and not b.crossed()


def test_risk_gate_rules_and_kill_switch():
    t = [0.0]
    g = RiskGate(RiskLimits(max_qty=1, max_notional=500, max_position=1, max_orders_per_min=2), clock=lambda: t[0])
    assert g.check(1, 2, 100, 100, 0) == (False, "max-qty")
    assert g.check(1, 1, 600, 600, 0) == (False, "max-notional")
    assert g.check(1, 1, 100, 100, 1) == (False, "max-position")
    assert g.check(1, 1, 110, 100, 0) == (False, "price-band")
    assert g.check(1, 0.5, 100, 100, 0)[0] and g.check(-1, 0.5, 100, 100, 0)[0]
    assert g.check(1, 0.5, 100, 100, 0) == (False, "order-rate")
    t[0] = 61
    assert g.check(1, 0.5, 100, 100, 0)[0]
    g.command("kill"); g.command("resume")
    assert g.check(1, 0.5, 100, 100, 0) == (False, "kill-switch")


def test_repeated_rejects_pause_the_strategy():
    g = RiskGate(RiskLimits(max_qty=1, max_rejects_in_row=3))
    for _ in range(3):
        ok, why = g.check(1, 5, 100, 100, 0)
    assert not ok and "paused" in why and g.paused


def test_fills_only_from_prints_with_partial_and_log():
    ex = PaperExchange("X")
    ex.on_row({"kind": "quote", "t": 1, "bid": 99, "ask": 101})
    o = ex.submit(1, 1.0, 99)
    ex.on_row({"kind": "print", "t": 2, "price": 100, "qty": 5, "side": "sell"})      # above our bid: no fill
    assert o.filled == 0
    ex.on_row({"kind": "print", "t": 3, "price": 99, "qty": 0.4, "side": "sell"})
    ex.on_row({"kind": "print", "t": 4, "price": 98.5, "qty": 1, "side": "sell"})
    assert o.filled == 1.0 and ex.position == 1.0
    assert [r["state"] for r in ex.log.rows] == ["rested", "partial", "filled"]
    assert all(r["mode"] == "paper" for r in ex.log.rows)
    h = ex.health()
    assert h["latency"]["n"] == 4 and h["latency"]["p99_us"] >= h["latency"]["p50_us"]


def test_event_stream_counts_drops():
    s = EventStream(capacity=2)
    for i in range(5):
        s.publish("quote", {"i": i})
    assert s.dropped == 3 and [e.data["i"] for e in s.drain()] == [3, 4]
