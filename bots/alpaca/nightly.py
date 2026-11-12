"""Core + sleeves bot (upload 01). Run by the OS scheduler every 30 min; it only acts:
  * evening run: once per trading day after 19:00 New York (Alpaca accepts market-on-open orders 19:00-09:28)
  * morning check: once after 09:35 New York -> places broker-held stops below actual fills
Steps of the evening run: lock -> trading day? -> reconcile -> fresh prices -> regime -> signals -> AI note ->
weights to whole shares -> risk check -> queue MOO orders with deterministic ids -> log + Telegram.
Dry run by default (--send to actually queue orders on the PAPER account)."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "engine"))

from apex_engine import indicators as ind  # noqa: E402
from apex_engine.strategies import get  # noqa: E402
from apex_engine.reporter import Reporter  # noqa: E402
from broker import Alpaca, to_df, telegram  # noqa: E402
from guard import Halted  # noqa: E402

NY = ZoneInfo("America/New_York")
BOT_ID = "alpaca-core-sleeves"
STATE = os.path.join(HERE, "state.json")
PAUSE = os.path.join(HERE, "pause")
LOCK = os.path.join(HERE, ".lock")


def load_state():
    return json.load(open(STATE)) if os.path.exists(STATE) else {"last_evening": "", "last_morning": "", "sleeves": {}, "hwm": 0, "prev_equity": 0}


def save_state(s):
    json.dump(s, open(STATE, "w"), indent=1)


def evening(api: Alpaca, cfg: dict, st: dict, send: bool, rep: Reporter):
    today = dt.datetime.now(NY).date().isoformat()
    cal = api.calendar(today, today)
    if not cal or cal[0]["date"] != today:
        return "not a trading day"
    acct = api.account()
    equity = float(acct["equity"])
    st["hwm"] = max(st.get("hwm", 0), equity)
    positions = {p["symbol"]: float(p["qty"]) for p in api.positions()}
    tickers = sorted({cfg["core"]["engine"], cfg["core"]["safe"], *[s["ticker"] for s in cfg["sleeves"]]})
    start = (dt.date.today() - dt.timedelta(days=600)).isoformat()
    bars = {k: to_df(v) for k, v in api.bars(tickers, "1Day", start).items()}
    for t, df in bars.items():
        if df.index[-1].tz_convert(NY).date().isoformat() != today:
            raise RuntimeError(f"stale price for {t}: last bar {df.index[-1]} (refusing to trade on old data)")
    e = bars[cfg["core"]["engine"]]
    line = ind.sma(e["close"], cfg["core"]["line"]).iloc[-1]
    engine_up = e["close"].iloc[-1] > line
    vol_now = (e["close"].pct_change().abs().rolling(20).mean()).iloc[-1]
    vol_med = (e["close"].pct_change().abs().rolling(20).mean()).iloc[-252:].median()
    volatile = vol_now > 1.5 * vol_med
    core_hold = cfg["core"]["engine"] if engine_up else cfg["core"]["safe"]
    # sleeves
    slot = cfg["volatile_slot_pct"] if volatile else cfg["slot_pct"]
    sleeve_targets, notes = {}, []
    for s in cfg["sleeves"]:
        df = bars[s["ticker"]]
        sig = get(s["strategy"]).latest(df)
        cur = st["sleeves"].get(s["id"], {"in": False})
        if cur["in"]:
            bars_in = cur.get("bars", 0) + 1
            mb = get(s["strategy"]).params.get("max_bars")
            if sig["exit_long"] or (mb and bars_in >= mb):
                cur = {"in": False}
                notes.append(f"{s['id']}: exit at open")
            else:
                cur["bars"] = bars_in
        elif sig["side"] == 1:
            cur = {"in": True, "bars": 0, "entry_signal": today}
            notes.append(f"{s['id']}: BUY signal")
        st["sleeves"][s["id"]] = cur
        if cur["in"]:
            sleeve_targets[s["ticker"]] = sleeve_targets.get(s["ticker"], 0) + slot
    # risk
    day_ret = equity / st["prev_equity"] - 1 if st.get("prev_equity") else 0
    if day_ret <= -cfg["pause_day_loss_pct"]:
        open(PAUSE, "w").write(f"auto-paused {today}: day {day_ret:.1%}")
    block_new = os.path.exists(PAUSE) or day_ret <= -cfg["daily_loss_stop_pct"]
    dd = equity / st["hwm"] - 1
    allow_borrow = dd > cfg["backtest_worst_dd"]
    weights = {core_hold: cfg["core"]["weight"]}
    for t, w in sleeve_targets.items():
        was = positions.get(t, 0) > 0
        if block_new and not was:
            continue
        weights[t] = weights.get(t, 0) + w
    total = sum(weights.values())
    cap = 1 + (cfg["max_borrow_pct"] if allow_borrow else 0)
    if total > cap:
        weights = {k: v * cap / total for k, v in weights.items()}
    last = {t: bars[t]["close"].iloc[-1] for t in tickers}
    target_sh = {t: int(equity * w // last[t]) for t, w in weights.items()}
    orders = []
    for t in sorted(set(target_sh) | set(positions)):
        diff = target_sh.get(t, 0) - int(positions.get(t, 0))
        if diff == 0:
            continue
        side = "buy" if diff > 0 else "sell"
        cid = f"apex-{today}-{t}-{side}"
        orders.append({"symbol": t, "qty": abs(diff), "side": side, "client_order_id": cid})
    sent, refused = [], ""
    if send:
        try:  # ask before cancelling any stop, so a halt never leaves positions without their stops
            api.gate()
        except Halted as e:
            refused = str(e)
            rep.event("risk", f"orders refused: {refused}")
    if send and not refused:
        open_ids = {o.get("client_order_id") for o in api.orders("all")}
        for o in api.orders("open"):  # Alpaca blocks a sell while a stop holds the shares: cancel sleeve stops first
            if o["type"] == "stop" and any(x["symbol"] == o["symbol"] and x["side"] == "sell" for x in orders):
                api.cancel(o["id"])
        for o in orders:
            if o["client_order_id"] in open_ids:
                continue
            try:  # the broker asks the dashboard halt state before every order
                api.submit(o["symbol"], o["qty"], o["side"], "market", "opg", o["client_order_id"])
            except Halted as e:
                refused = str(e)
                rep.event("risk", f"orders refused: {refused}")
                break
            sent.append(o)
    st["prev_equity"] = equity
    st["last_evening"] = today
    summary = (f"Apex evening {today} ({'PAPER' if api.paper else 'LIVE'}{'' if send else ', DRY RUN'})\n"
               f"{cfg['core']['engine']} {'above' if engine_up else 'below'} {cfg['core']['line']}d line -> core holds {core_hold}\n"
               f"volatile={volatile} slot={slot:.0%} borrow={'on' if allow_borrow else 'OFF (dd beyond backtest worst)'}"
               f"{' | NEW TRADES BLOCKED' if block_new else ''}{f' | ORDERS REFUSED ({refused})' if refused else ''}\n" + "\n".join(notes) +
               "\nOrders: " + (", ".join(f"{o['side']} {o['qty']} {o['symbol']}" for o in (sent if send else orders)) or "none"))
    telegram(summary)
    rep.heartbeat({"equity": equity, "core_hold": core_hold, "engine_up": bool(engine_up), "volatile": bool(volatile),
                   "weights": weights, "orders": orders, "paused": os.path.exists(PAUSE), "drawdown": dd})
    return summary


def morning(api: Alpaca, cfg: dict, st: dict, send: bool):
    today = dt.datetime.now(NY).date().isoformat()
    stops = {s["ticker"]: s["stop_pct"] for s in cfg["sleeves"]}
    have = {o["symbol"] for o in api.orders("open") if o["type"] == "stop"}
    placed = []
    for p in api.positions():
        t = p["symbol"]
        if t in stops and t not in have:
            px = float(p["avg_entry_price"]) * (1 - stops[t])
            if send:
                try:
                    api.submit(t, int(float(p["qty"])), "sell", "stop", "gtc", f"apex-stop-{today}-{t}", stop_price=px)
                except Halted as e:
                    placed.append(f"{t} stop NOT placed ({e})")
                    continue
            placed.append(f"{t} stop {px:.2f}")
    st["last_morning"] = today
    telegram(f"Apex morning {today}: " + (", ".join(placed) or "all positions already protected"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--send", action="store_true", help="queue real orders on the (paper) account")
    ap.add_argument("--force", choices=["evening", "morning"])
    a = ap.parse_args()
    if os.path.exists(LOCK):
        sys.exit("another run holds the lock")
    open(LOCK, "w").write(str(os.getpid()))
    try:
        cfg = json.load(open(os.path.join(HERE, "system.json")))
        api, st = Alpaca(BOT_ID), load_state()
        rep = Reporter(BOT_ID, "alpaca", "ETF Core + Sleeves", "paper" if api.paper else "live")
        now = dt.datetime.now(NY)
        today = now.date().isoformat()
        try:
            if a.force == "evening" or (now.hour >= 19 and st["last_evening"] != today):
                evening(api, cfg, st, a.send, rep)
            elif a.force == "morning" or ((now.hour, now.minute) >= (9, 35) and now.hour < 16 and st["last_morning"] != today):
                morning(api, cfg, st, a.send)
            elif now.hour == 23 and now.minute >= 30 and st["last_evening"] != today:
                telegram("Apex: evening run has NOT completed today")
        except Exception as e:  # noqa: BLE001
            telegram(f"Apex FAILURE: {e}")
            rep.event("error", str(e))
            raise
        save_state(st)
    finally:
        os.remove(LOCK)


if __name__ == "__main__":
    main()
