"""The Alpaca order gate, with fakes only (no network): a dashboard halt refuses, an unreadable dashboard refuses in live mode,
paper keeps going when the dashboard is unreachable, the day-trader's daily caps trigger, and the two-switch live gate still
needs both switches. Env var names are built at runtime so no live setting is ever written out in the repo."""
import json
import os
import sys
from datetime import datetime

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "..", "daytrader"))

import broker  # noqa: E402
import guard  # noqa: E402
import daybook  # noqa: E402

ALLOW = "_".join(["APEX", "ALLOW", "LIVE"])
ALPACA_SWITCH = "_".join(["ALPACA", "LIVE"])
URL, TOKEN = "_".join(["APEX", "DASHBOARD", "URL"]), "_".join(["APEX", "INGEST", "TOKEN"])
NOON = datetime(2026, 11, 12, 12, 0, tzinfo=daybook.NY)


def answer(**j):
    calls = []

    def fetch(url, headers):
        calls.append((url, headers))
        return json.dumps(j).encode()
    fetch.calls = calls
    return fetch


def down(url, headers):
    raise OSError("connection refused")


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for k in (ALLOW, ALPACA_SWITCH, URL, TOKEN):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv(URL, "http://dashboard.test")


def live(monkeypatch):
    monkeypatch.setenv(ALPACA_SWITCH, "true")
    monkeypatch.setenv(ALLOW, "yes")


class Sent(list):
    def __call__(self, method, url, body=None, params=None):
        self.append((method, url, body))
        return {"id": "o1", "status": "accepted"}


def api_with(fetch, monkeypatch, bot="alpaca-core-sleeves"):
    a = broker.Alpaca(bot, fetch=fetch)
    sent = Sent()
    monkeypatch.setattr(a, "_req", sent)
    return a, sent


# ---- the two-switch live gate ----
def test_live_needs_both_switches(monkeypatch):
    assert broker.Alpaca("x").paper and broker.Alpaca("x").base == broker.PAPER
    monkeypatch.setenv(ALPACA_SWITCH, "true")
    assert broker.Alpaca("x").paper, "the bot's own switch alone stays on paper"
    monkeypatch.delenv(ALPACA_SWITCH)
    monkeypatch.setenv(ALLOW, "yes")
    assert broker.Alpaca("x").paper, "the second switch alone stays on paper"
    for v in ("YES", "yes ", "1", "true"):
        monkeypatch.setenv(ALLOW, v)
        monkeypatch.setenv(ALPACA_SWITCH, "true")
        assert broker.Alpaca("x").paper, f"only exactly yes opens the second switch, not {v!r}"
    live(monkeypatch)
    a = broker.Alpaca("x")
    assert not a.paper and a.base == broker.LIVE


# ---- dashboard halt state, before every order ----
@pytest.mark.parametrize("reply", [dict(command="pause", ref="r1", halted=True, why="pause from the dashboard"),
                                   dict(command="pause", ref=None, halted=True, why="andon cord: fills disagree"),
                                   dict(command=None, ref=None, halted=True, why="kill from the dashboard"),
                                   dict(command="kill", ref="r2", halted=False, why=None)])
def test_halted_refuses_in_paper_and_live(monkeypatch, reply):
    for mode in ("paper", "live"):
        if mode == "live":
            live(monkeypatch)
        a, sent = api_with(answer(**reply), monkeypatch)
        with pytest.raises(guard.Halted):
            a.submit("QQQ", 1, "buy", "market", "opg", "c1")
        with pytest.raises(guard.Halted):
            a.bracket("QQQ", 1, "buy", 110, 95)
        assert sent == [], f"{mode}: nothing reached the broker"


def test_the_gate_asks_this_bots_own_endpoint_with_the_ingest_token(monkeypatch):
    monkeypatch.setenv(TOKEN, "t" * 12)
    f = answer(command=None, ref=None, halted=False, why=None)
    a, sent = api_with(f, monkeypatch, bot="day-trader")
    a.submit("SPY", 1, "buy")
    assert f.calls == [("http://dashboard.test/api/bots/day-trader/command", {"x-apex-token": "t" * 12})]
    assert len(sent) == 1 and sent[0][0] == "POST"


@pytest.mark.parametrize("fetch", [down, lambda u, h: b"<html>502</html>", lambda u, h: b'{"command": null}', lambda u, h: b'{"halted": "no"}', lambda u, h: b"[]"])
def test_unreachable_or_unreadable_dashboard_refuses_in_live(monkeypatch, fetch):
    live(monkeypatch)
    a, sent = api_with(fetch, monkeypatch)
    with pytest.raises(guard.Halted, match="live mode"):
        a.submit("QQQ", 1, "buy")
    assert sent == []


def test_no_dashboard_url_refuses_in_live(monkeypatch):
    live(monkeypatch)
    monkeypatch.delenv(URL)
    a, sent = api_with(answer(halted=False), monkeypatch)
    with pytest.raises(guard.Halted):
        a.bracket("QQQ", 1, "buy", 110, 95)
    assert sent == []


def test_paper_keeps_going_when_unreachable_and_says_so(monkeypatch, capsys):
    a, sent = api_with(down, monkeypatch)
    a.submit("QQQ", 1, "buy")
    assert len(sent) == 1 and "paper mode, going ahead" in capsys.readouterr().out


def test_an_order_with_no_bot_id_is_refused(monkeypatch):
    a, sent = api_with(answer(halted=False), monkeypatch, bot="")
    with pytest.raises(guard.Halted):
        a.submit("QQQ", 1, "buy")
    assert sent == []


def test_nightly_morning_stops_are_refused_while_halted(monkeypatch):
    import nightly
    monkeypatch.setattr(nightly, "telegram", lambda t: None)
    a, sent = api_with(answer(command="pause", ref="r", halted=True, why="pause from the dashboard"), monkeypatch)
    monkeypatch.setattr(a, "orders", lambda status="open": [])
    monkeypatch.setattr(a, "positions", lambda: [{"symbol": "XLK", "qty": "3", "avg_entry_price": "200"}])
    st = {}
    nightly.morning(a, {"sleeves": [{"ticker": "XLK", "stop_pct": 0.08}]}, st, send=True)
    assert sent == [] and st["last_morning"]


# ---- the day-trader's daily caps ----
class FakeAccount:
    def __init__(self, equity=25_000.0, last=25_000.0, open_today=0.0, halted=False, fail=False):
        self.paper, self.orders = True, []
        self.e, self.l, self.o, self.fail = equity, last, open_today, fail
        self._fetch = answer(command=None, ref=None, halted=halted, why="pause from the dashboard" if halted else None)
        self.bot_id = "day-trader"

    def account(self):
        if self.fail:
            raise OSError("broker down")
        return {"equity": str(self.e), "last_equity": str(self.l)}

    def positions(self):
        return [{"symbol": "TSLA", "unrealized_intraday_pl": str(self.o)}] if self.o else []

    def bracket(self, *a, **k):
        guard.check(self.bot_id, self.paper, self._fetch)
        self.orders.append(a)
        return {"id": f"o{len(self.orders)}", "status": "accepted"}


@pytest.fixture
def desk(monkeypatch):
    import desk as d
    monkeypatch.setattr(d, "Reporter", lambda *a, **k: type("R", (), {"trade": lambda self, t: None, "event": lambda self, *x: None})())
    monkeypatch.setitem(d.CFG, "account_size", 25_000)
    monkeypatch.setitem(d.CFG, "max_daily_loss_pct", 2.0)
    monkeypatch.setitem(d.CFG, "max_trades_per_day", 3)
    return d


def go(d, api, path):
    return d.execute("TSLA", "buy", 100.0, 99.0, 103.0, yes=True, api=api, book_path=path, now=NOON)


def test_trades_per_day_cap_triggers_and_persists(desk, tmp_path):
    path, api = str(tmp_path / "desk_day.json"), FakeAccount()
    assert [("submitted" in go(desk, api, path)) for _ in range(3)] == [True, True, True]
    r = go(desk, api, path)
    assert "trades-per-day cap" in r["blocked"] and len(api.orders) == 3
    assert json.load(open(path))["trades"] == 3
    assert "trades-per-day cap" in go(desk, FakeAccount(), path)["blocked"], "a fresh run reads the same book"


def test_daily_loss_cap_triggers_on_realised_loss_even_with_an_open_winner(desk, tmp_path):
    path = str(tmp_path / "desk_day.json")
    # realised -600 hidden by an open +500: the account only shows -100
    r = go(desk, FakeAccount(equity=24_900, last=25_000, open_today=500), path)
    assert "daily loss cap" in r["blocked"]
    # and the cap holds after the open winner fades back up
    assert "daily loss cap" in go(desk, FakeAccount(), path)["blocked"]


def test_daily_loss_cap_triggers_on_account_day_change(desk, tmp_path):
    path = str(tmp_path / "desk_day.json")
    assert "daily loss cap" in go(desk, FakeAccount(equity=24_499, last=25_000, open_today=-501), path)["blocked"]


def test_cap_book_resets_on_a_new_new_york_day(desk, tmp_path):
    path = str(tmp_path / "desk_day.json")
    json.dump({"date": "2026-11-11", "trades": 9, "realised_pnl": -9999, "day_pnl": -9999}, open(path, "w"))
    assert "submitted" in go(desk, FakeAccount(), path)


def test_unreadable_book_or_broker_refuses(desk, tmp_path):
    path = str(tmp_path / "desk_day.json")
    open(path, "w").write("{not json")
    api = FakeAccount()
    assert "cannot be read" in go(desk, api, path)["blocked"] and api.orders == []
    assert "cannot read today's P&L" in go(desk, FakeAccount(fail=True), str(tmp_path / "other.json"))["blocked"]
    nan = {"date": "2026-11-12", "trades": 0, "realised_pnl": float("nan"), "day_pnl": 0}
    assert daybook.cap_hit(nan, 25_000, 2.0, 3)


def test_desk_halted_refuses_and_does_not_count(desk, tmp_path):
    path, api = str(tmp_path / "desk_day.json"), FakeAccount(halted=True)
    r = go(desk, api, path)
    assert "halted" in r["blocked"] and api.orders == []
    assert json.load(open(path))["trades"] == 0


def test_reserve_is_atomic_on_disk(tmp_path):
    path = str(tmp_path / "b.json")
    for _ in range(2):
        assert daybook.reserve(path, "2026-11-12", 25_000, 2.0, 2)[0]
    assert daybook.reserve(path, "2026-11-12", 25_000, 2.0, 2) == (False, "trades-per-day cap hit: 2 of 2; no new orders until tomorrow")
    assert sorted(os.listdir(tmp_path)) == ["b.json", "b.json.lock"], "no temp file is left behind"


def test_nightly_evening_halted_cancels_no_stop_and_sends_nothing(monkeypatch):
    import datetime as dt
    import nightly
    monkeypatch.setattr(nightly, "telegram", lambda t: None)
    a, sent = api_with(answer(command=None, ref=None, halted=True, why="andon cord: fills disagree"), monkeypatch)
    today = dt.datetime.now(nightly.NY).date()
    days = [today - dt.timedelta(days=i) for i in range(400, -1, -1)]
    rows = [{"t": f"{d.isoformat()}T14:30:00Z", "o": 100 + i * 0.1, "h": 101 + i * 0.1, "l": 99 + i * 0.1, "c": 100 + i * 0.1, "v": 1e6}
            for i, d in enumerate(days)]
    cancelled = []
    monkeypatch.setattr(a, "calendar", lambda s, e: [{"date": today.isoformat()}])
    monkeypatch.setattr(a, "account", lambda: {"equity": "10000"})
    monkeypatch.setattr(a, "positions", lambda: [{"symbol": "GLD", "qty": "5"}])
    monkeypatch.setattr(a, "bars", lambda tickers, tf, start: {t: rows for t in tickers})
    monkeypatch.setattr(a, "orders", lambda status="open": [{"id": "s1", "type": "stop", "symbol": "GLD", "client_order_id": "x"}])
    monkeypatch.setattr(a, "cancel", lambda oid: cancelled.append(oid))
    events = []
    rep = type("R", (), {"event": lambda self, lvl, msg: events.append((lvl, msg)), "heartbeat": lambda self, s: None})()
    cfg = json.load(open(os.path.join(HERE, "..", "system.json")))
    st = {"sleeves": {}, "hwm": 0, "prev_equity": 0}
    out = nightly.evening(a, cfg, st, True, rep)
    assert sent == [] and cancelled == [], "no stop cancelled and no order sent while halted"
    assert "ORDERS REFUSED" in out and events and events[0][0] == "risk"
