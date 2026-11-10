"""Apex Day Trader desk: the 11-skill day-trading pack from archive/chat/22, rebuilt on the Apex engine.
Stdlib + pandas only, free data (Yahoo chart API, Nasdaq Trader symbol list, SEC EDGAR, House Clerk),
Alpaca PAPER for execution. Nothing here trades on its own: `execute` needs you to type the exact
confirmation phrase, or approve the ticket on the Apex dashboard.

Desk 1  hunt     scan | news | earnings | congress
Desk 2  timing   entry | exits
Desk 3  capital  timemachine | budget | risk
Desk 4  execute  alerts | execute

  python desk.py scan --watchlist TSLA,NVDA,AMD,AAPL,META --tf 5m
  python desk.py exits TSLA --entry 251.2 --stop 248.9
  python desk.py timemachine TSLA --setup orb --tf 5m
  python desk.py execute TSLA --side buy --entry 251.2 --stop 248.9 --target 255.8
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "engine"))

from apex_engine import indicators as ind, backtest as bt  # noqa: E402
from apex_engine.patterns import candles  # noqa: E402
from apex_engine.risk import RiskGuard, RiskConfig  # noqa: E402
from apex_engine.strategies.base import Strategy  # noqa: E402
from apex_engine.reporter import Reporter  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (apex-desk)"}
CFG_PATH = os.path.join(HERE, "desk_config.json")
CFG = {"account_size": 25_000, "max_risk_per_trade_pct": 0.5, "max_daily_loss_pct": 2.0, "max_trades_per_day": 3,
       "min_rr": 2.0, "no_trade_first_minutes": 5, "flat_by": "15:55", "watchlist": ["TSLA", "NVDA", "AMD", "AAPL", "META", "SPY", "QQQ"]}
if os.path.exists(CFG_PATH):
    CFG.update(json.load(open(CFG_PATH)))


def get(url, params=None, headers=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **(headers or {})}), timeout=20) as r:
        return r.read()


def yahoo(sym: str, tf: str = "5m", rng: str = "5d") -> pd.DataFrame:
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}", {"interval": tf, "range": rng, "includePrePost": "false"}))
    r = j["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    df = pd.DataFrame({k: q[k] for k in ("open", "high", "low", "close", "volume")}, index=pd.to_datetime(r["timestamp"], unit="s", utc=True))
    return df.dropna().tz_convert("America/New_York")


# ---------------- Desk 1: hunt ----------------
def scan(watchlist, tf="5m"):
    """Opening-range breakout, bull flag and oversold bounce on intraday bars, ranked by relative volume."""
    rows = []
    for s in watchlist:
        try:
            df = yahoo(s, tf, "5d")
        except Exception as e:  # noqa: BLE001
            rows.append({"symbol": s, "error": str(e)})
            continue
        today = df[df.index.date == df.index[-1].date()]
        if len(today) < 4:
            continue
        orb = today.iloc[:3]  # first 15 minutes on 5m bars
        orh, orl = orb["high"].max(), orb["low"].min()
        last = today.iloc[-1]
        vwap = ind.vwap(today.tz_convert("UTC"), "D").iloc[-1]
        rvol = today["volume"].sum() / max(df[df.index.date != df.index[-1].date()].groupby(lambda t: t.date())["volume"].sum().mean(), 1) * (78 / len(today))
        r = ind.rsi(df["close"], 14).iloc[-1]
        cd = candles(today).iloc[-1]
        setups = []
        if last["close"] > orh and last["close"] > vwap:
            setups.append({"setup": "orb_long", "entry": float(last["close"]), "stop": float(max(orl, vwap * 0.998))})
        if last["close"] < orl and last["close"] < vwap:
            setups.append({"setup": "orb_short", "entry": float(last["close"]), "stop": float(min(orh, vwap * 1.002))})
        pole = today["close"].iloc[-8] - today["close"].iloc[-13] if len(today) > 13 else 0
        if pole > 2 * ind.atr(df, 14).iloc[-1] and today["high"].iloc[-6:-1].max() - today["low"].iloc[-6:-1].min() < 0.5 * pole and last["close"] > today["high"].iloc[-6:-1].max():
            setups.append({"setup": "bull_flag", "entry": float(last["close"]), "stop": float(today["low"].iloc[-6:-1].min())})
        if r < 25 and bool(cd["bull_reversal"]):
            setups.append({"setup": "oversold_bounce", "entry": float(last["close"]), "stop": float(today["low"].iloc[-3:].min())})
        for st in setups:
            d = abs(st["entry"] - st["stop"])
            st["target"] = st["entry"] + (2 if "short" not in st["setup"] else -2) * d
        rows.append({"symbol": s, "price": float(last["close"]), "rvol": round(float(rvol), 2), "rsi": round(float(r), 1),
                     "vwap": round(float(vwap), 2), "or_high": float(orh), "or_low": float(orl), "setups": setups})
    return sorted(rows, key=lambda x: -x.get("rvol", 0))


def news(watchlist, hours=24):
    out = []
    for s in watchlist:
        try:
            root = ET.fromstring(get("https://feeds.finance.yahoo.com/rss/2.0/headline", {"s": s, "region": "US", "lang": "en-US"}))
        except Exception:  # noqa: BLE001
            continue
        for it in root.iter("item"):
            ts = pd.to_datetime(it.findtext("pubDate"), utc=True)
            if ts > pd.Timestamp.utcnow() - pd.Timedelta(hours=hours):
                out.append({"symbol": s, "time": ts.isoformat(), "title": it.findtext("title"), "link": it.findtext("link")})
    return sorted(out, key=lambda x: x["time"], reverse=True)


def earnings(symbol):
    """Latest 10-Q/10-K facts from SEC EDGAR companyfacts. SEC requires a contact in the User-Agent:
    set SEC_USER_AGENT="YourApp your-contact@domain" yourself. Apex never fills this in for you."""
    ua = os.environ.get("SEC_USER_AGENT")
    if not ua:
        return {"error": "set SEC_USER_AGENT env var (SEC policy requires a contact string)"}
    h = {"User-Agent": ua}
    tickers = json.loads(get("https://www.sec.gov/files/company_tickers.json", headers=h))
    cik = next((v["cik_str"] for v in tickers.values() if v["ticker"] == symbol.upper()), None)
    if not cik:
        return {"error": "ticker not found"}
    facts = json.loads(get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json", headers=h))
    g = facts["facts"].get("us-gaap", {})
    out = {}
    for k in ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "NetIncomeLoss", "EarningsPerShareDiluted", "OperatingIncomeLoss"):
        if k in g:
            units = next(iter(g[k]["units"].values()))
            q = [u for u in units if u.get("form") in ("10-Q", "10-K") and u.get("fp")][-5:]
            out[k] = [{"end": u["end"], "val": u["val"], "form": u["form"]} for u in q]
    return {"symbol": symbol, "cik": cik, "facts": out}


def congress(year=None, last=40):
    """Periodic Transaction Reports (stock trades) filed by House members, from the House Clerk index."""
    year = year or datetime.now().year
    z = zipfile.ZipFile(io.BytesIO(get(f"https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip")))
    root = ET.fromstring(z.read(f"{year}FD.xml"))
    rows = [{"name": f"{m.findtext('First')} {m.findtext('Last')}", "state": m.findtext("StateDst"), "date": m.findtext("FilingDate"),
             "pdf": f"https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{m.findtext('DocID')}.pdf"}
            for m in root.iter("Member") if m.findtext("FilingType") == "P"]
    return sorted(rows, key=lambda r: datetime.strptime(r["date"], "%m/%d/%Y"), reverse=True)[:last]


# ---------------- Desk 2: timing ----------------
def entry_timer(symbol, setup, level, tf="1m"):
    """Watches bar by bar until a CLOSED candle confirms the setup through `level` (no wick entries)."""
    while True:
        df = yahoo(symbol, tf, "1d").iloc[:-1]
        c, cd = df.iloc[-1], candles(df).iloc[-1]
        if ("long" in setup or setup in ("bull_flag", "oversold_bounce")) and c["close"] > level and (cd["momentum_bull"] or cd["bull_engulf"] or c["close"] > c["open"]):
            return {"symbol": symbol, "trigger": "long", "close": float(c["close"]), "time": str(df.index[-1])}
        if "short" in setup and c["close"] < level and (cd["momentum_bear"] or cd["bear_engulf"] or c["close"] < c["open"]):
            return {"symbol": symbol, "trigger": "short", "close": float(c["close"]), "time": str(df.index[-1])}
        print(f"{df.index[-1]} {symbol} {c['close']:.2f} waiting for close through {level}", flush=True)
        time.sleep(30)


def exit_plan(entry, stop, rr=None):
    rr = rr or CFG["min_rr"]
    d = abs(entry - stop)
    side = 1 if entry > stop else -1
    return {"entry": entry, "stop": stop, "risk_per_share": round(d, 4), "t1_1R_scale_half": round(entry + side * d, 2),
            "t2_target": round(entry + side * rr * d, 2), "move_stop_to_breakeven_at": round(entry + side * d, 2),
            "time_stop": f"flat by {CFG['flat_by']} New York"}


# ---------------- Desk 3: capital ----------------
class _Setup(Strategy):
    id = "desk_setup"

    def signals(self, df):
        out = self.frame(df)
        day = df.index.tz_convert("America/New_York").date
        g = df.groupby(day)
        first = g.cumcount()
        orh = g["high"].transform(lambda s: s.iloc[:3].max())
        orl = g["low"].transform(lambda s: s.iloc[:3].min())
        if self.params.get("setup", "orb") == "orb":
            v = ind.vwap(df, "D")
            out["long_entry"] = (first >= 3) & (first <= 30) & (df["close"] > orh) & (df["close"].shift(1) <= orh) & (df["close"] > v)
            out["stop"] = np.maximum(orl, v * 0.998)
        else:
            r = ind.rsi(df["close"], 14)
            out["long_entry"] = (r.shift(1) < 25) & candles(df)["bull_reversal"]
            out["stop"] = df["low"].rolling(3).min()
        out["target"] = df["close"] + 2 * (df["close"] - out["stop"])
        out["long_exit"] = pd.Series(first, index=df.index) >= 76  # flat into the close
        return out


def time_machine(symbol, setup="orb", tf="5m"):
    """Replays the setup over the last ~60 days of intraday bars, then Monte Carlo reshuffles the trades."""
    df = yahoo(symbol, tf, "60d").tz_convert("UTC")
    res = bt.run(df, _Setup(setup=setup), symbol=symbol, timeframe=tf, risk_pct=CFG["max_risk_per_trade_pct"] / 100, fee=0.0002, slippage=0.0003)
    return {"symbol": symbol, "setup": setup, "historical": res.metrics, "monte_carlo": bt.monte_carlo(res.trades, risk_pct=CFG["max_risk_per_trade_pct"] / 100),
            "verdict": "no edge in this window: skip" if res.metrics["profit_factor"] in (0, None) or res.metrics["profit_factor"] < 1.1 else "edge present in this window (past results only)"}


def budget(entry, stop):
    g = RiskGuard(RiskConfig(risk_pct=CFG["max_risk_per_trade_pct"] / 100), equity=CFG["account_size"])
    sh = int(g.size(entry, stop))
    return {"shares": sh, "risk_usd": round(sh * abs(entry - stop), 2), "notional": round(sh * entry, 2)}


def risk_check(entry, stop, target):
    log = os.path.join(HERE, "desk_log.json")
    hist = json.load(open(log)) if os.path.exists(log) else []
    today = datetime.now().strftime("%Y-%m-%d")
    todays = [h for h in hist if h["date"] == today]
    g = RiskGuard(RiskConfig(min_rr=CFG["min_rr"], daily_loss_limit_pct=CFG["max_daily_loss_pct"] / 100, max_open_positions=CFG["max_trades_per_day"]),
                  equity=CFG["account_size"])
    g.state.open_positions = len(todays)
    g.state.day = today
    g.state.day_start_equity = CFG["account_size"]
    g.state.equity = CFG["account_size"] + sum(h.get("pnl", 0) for h in todays)
    ok, why = g.check(entry, stop, target)
    now = datetime.now(tz=pd.Timestamp.now(tz="America/New_York").tz)
    mins_open = (now.hour * 60 + now.minute) - (9 * 60 + 30)
    if ok and 0 <= mins_open < CFG["no_trade_first_minutes"]:
        ok, why = False, f"no trades in the first {CFG['no_trade_first_minutes']} minutes"
    return {"allowed": ok, "reason": why}


# ---------------- Desk 4: execute ----------------
def alerts(symbol, levels: dict):
    while True:
        px = float(yahoo(symbol, "1m", "1d")["close"].iloc[-1])
        for name, lv in list(levels.items()):
            if (name == "stop" and px <= lv) or (name != "stop" and px >= lv):
                msg = f"ALERT {symbol} {name} {lv} hit at {px}"
                print(msg, flush=True)
                Reporter("day-trader", "alpaca", "Day Trader Desk").event("alert", msg)
                levels.pop(name)
        if not levels:
            return
        time.sleep(20)


def execute(symbol, side, entry, stop, target, yes=False):
    from broker import Alpaca
    rc = risk_check(entry, stop, target)
    if not rc["allowed"]:
        return {"blocked": rc["reason"]}
    b = budget(entry, stop)
    ticket = {"symbol": symbol, "side": side, "qty": b["shares"], "entry_ref": entry, "stop": stop, "target": target, **b}
    api = Alpaca()
    print(json.dumps({"ORDER TICKET": ticket, "account": "PAPER" if api.paper else "LIVE"}, indent=1))
    phrase = f"YES {side.upper()} {b['shares']} {symbol}"
    if not yes:
        if input(f"Type exactly '{phrase}' to send: ").strip() != phrase:
            return {"cancelled": True}
    o = api.bracket(symbol, b["shares"], side, take_profit=target, stop_loss=stop, client_order_id=f"desk-{symbol}-{int(time.time())}")
    Reporter("day-trader", "alpaca", "Day Trader Desk", "paper" if api.paper else "live").trade({**ticket, "order_id": o.get("id"), "status": "submitted"})
    return {"submitted": o.get("id"), "status": o.get("status")}


def main():
    p = argparse.ArgumentParser("desk")
    s = p.add_subparsers(dest="cmd", required=True)
    a = s.add_parser("scan"); a.add_argument("--watchlist", default=",".join(CFG["watchlist"])); a.add_argument("--tf", default="5m")
    a = s.add_parser("news"); a.add_argument("--watchlist", default=",".join(CFG["watchlist"]))
    a = s.add_parser("earnings"); a.add_argument("symbol")
    a = s.add_parser("congress"); a.add_argument("--year", type=int)
    a = s.add_parser("entry"); a.add_argument("symbol"); a.add_argument("--setup", default="orb_long"); a.add_argument("--level", type=float, required=True)
    a = s.add_parser("exits"); a.add_argument("symbol"); a.add_argument("--entry", type=float, required=True); a.add_argument("--stop", type=float, required=True)
    a = s.add_parser("timemachine"); a.add_argument("symbol"); a.add_argument("--setup", default="orb"); a.add_argument("--tf", default="5m")
    a = s.add_parser("budget"); a.add_argument("--entry", type=float, required=True); a.add_argument("--stop", type=float, required=True)
    a = s.add_parser("risk"); [a.add_argument(f"--{k}", type=float, required=True) for k in ("entry", "stop", "target")]
    a = s.add_parser("alerts"); a.add_argument("symbol"); a.add_argument("--stop", type=float); a.add_argument("--target", type=float)
    a = s.add_parser("execute"); a.add_argument("symbol"); a.add_argument("--side", choices=["buy", "sell"], required=True)
    [a.add_argument(f"--{k}", type=float, required=True) for k in ("entry", "stop", "target")]
    x = p.parse_args()
    wl = lambda: x.watchlist.split(",")  # noqa: E731
    out = {"scan": lambda: scan(wl(), x.tf), "news": lambda: news(wl()), "earnings": lambda: earnings(x.symbol),
           "congress": lambda: congress(x.year), "entry": lambda: entry_timer(x.symbol, x.setup, x.level),
           "exits": lambda: exit_plan(x.entry, x.stop), "timemachine": lambda: time_machine(x.symbol, x.setup, x.tf),
           "budget": lambda: budget(x.entry, x.stop), "risk": lambda: risk_check(x.entry, x.stop, x.target),
           "alerts": lambda: alerts(x.symbol, {k: v for k, v in (("stop", x.stop), ("target", x.target)) if v}),
           "execute": lambda: execute(x.symbol, x.side, x.entry, x.stop, x.target)}[x.cmd]()
    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
