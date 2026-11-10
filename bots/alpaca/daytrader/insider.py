"""Insider-buy follower (archive/chat/46), our own code. Paper only: it builds a plan and never places an order.

Rule: an officer or director buys at least $10k of their own company's stock on the open market (Form 4, transaction code P).
Plan: buy at the next session's open and hold for 5 sessions. Fees are counted in the backtest the same way as everywhere else.

Data comes from SEC EDGAR. The SEC requires a contact string in the User-Agent: set SEC_USER_AGENT="YourApp contact@yourdomain"
yourself. Apex never fills this in, and it never uses Jeremy's email.

  python insider.py latest --min 10000        # recent qualifying Form 4 buys (needs SEC_USER_AGENT)
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta

MIN_USD = 10_000
HOLD_SESSIONS = 5


def _t(node, path):
    x = node.find(path)
    return (x.text or "").strip() if x is not None and x.text else ""


def parse_form4(xml: str) -> list[dict]:
    """Pure: every non-derivative transaction in one Form 4, with who filed it. No network."""
    root = ET.fromstring(xml)
    ticker = _t(root, "issuer/issuerTradingSymbol").upper()
    rel = root.find("reportingOwner/reportingOwnerRelationship")
    is_officer = rel is not None and _t(rel, "isOfficer") in ("1", "true")
    is_director = rel is not None and _t(rel, "isDirector") in ("1", "true")
    title = _t(rel, "officerTitle") if rel is not None else ""
    owner = _t(root, "reportingOwner/reportingOwnerId/rptOwnerName")
    out = []
    for tx in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
        code = _t(tx, "transactionCoding/transactionCode")
        ad = _t(tx, "transactionAmounts/transactionAcquiredDisposedCode/value")
        try:
            shares = float(_t(tx, "transactionAmounts/transactionShares/value") or 0)
            price = float(_t(tx, "transactionAmounts/transactionPricePerShare/value") or 0)
        except ValueError:
            continue
        out.append({"ticker": ticker, "owner": owner, "officer": is_officer, "director": is_director, "title": title,
                    "date": _t(tx, "transactionDate/value"), "code": code, "acquired": ad == "A",
                    "shares": shares, "price": price, "usd": round(shares * price, 2)})
    return out


def qualifies(tx: dict, min_usd: float = MIN_USD) -> bool:
    """Open-market purchase (code P, acquired) by an officer or director, worth at least min_usd."""
    return tx["code"] == "P" and tx["acquired"] and (tx["officer"] or tx["director"]) and tx["usd"] >= min_usd and tx["price"] > 0


def plan(tx: dict, filed: str) -> dict:
    """Paper plan: enter at the next open after the filing date and exit after HOLD_SESSIONS sessions (weekdays; holidays
    are not modelled, so check the calendar before trusting the exit date)."""
    d = date.fromisoformat(filed) + timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    entry, n, x = d, 0, d
    while n < HOLD_SESSIONS:
        x += timedelta(days=1)
        if x.weekday() < 5:
            n += 1
    return {"ticker": tx["ticker"], "side": "buy", "enter_at": f"{entry.isoformat()} open", "exit_at": f"{x.isoformat()} open",
            "why": f"{tx['owner']} ({tx['title'] or ('director' if tx['director'] else 'officer')}) bought ${tx['usd']:,.0f} on {tx['date']}",
            "mode": "paper"}


def backtest_holds(closes_by_day: dict[str, list[tuple[str, float, float]]], plans: list[dict], fee: float = 0.001) -> dict:
    """Pure: closes_by_day[ticker] = [(day, open, close), ...]. Enter at the open of enter_at, exit at the open HOLD_SESSIONS
    sessions later. Fees on both sides. Returns per-trade returns and the summary; flags fewer than 50 trades."""
    rets = []
    for p in plans:
        rows = closes_by_day.get(p["ticker"], [])
        day = p["enter_at"].split()[0]
        i = next((k for k, r in enumerate(rows) if r[0] >= day), None)
        if i is None or i + HOLD_SESSIONS >= len(rows):
            continue
        en, ex = rows[i][1], rows[i + HOLD_SESSIONS][1]
        rets.append(ex / en - 1 - fee * (1 + ex / en))
    n = len(rets)
    return {"trades": n, "avg": sum(rets) / n if n else 0.0, "win_rate": sum(r > 0 for r in rets) / n if n else 0.0,
            "enough": n >= 50, "note": "" if n >= 50 else f"only {n} trades: too few to conclude"}


def _get(url: str, ua: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua}), timeout=20) as r:
        return r.read()


def latest(min_usd: float = MIN_USD, count: int = 40) -> list[dict]:
    """Recent Form 4 filings from the EDGAR current-filings feed, parsed and filtered. Needs SEC_USER_AGENT."""
    ua = os.environ.get("SEC_USER_AGENT")
    if not ua:
        return [{"error": "set SEC_USER_AGENT env var (SEC policy requires a contact string)"}]
    feed = _get(f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=only&count={count}&output=atom", ua)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out = []
    for e in ET.fromstring(feed).findall("a:entry", ns):
        link = e.find("a:link", ns).get("href")                       # filing index page
        filed = (e.findtext("a:updated", default="", namespaces=ns) or "")[:10]
        try:
            idx = json.loads(_get(link.replace("-index.htm", "-index.json").replace("-index.html", "-index.json"), ua))
        except Exception:
            continue
        xmls = [f["name"] for f in idx.get("directory", {}).get("item", []) if f["name"].endswith(".xml")]
        if not xmls:
            continue
        base = link.rsplit("/", 1)[0]
        for tx in parse_form4(_get(f"{base}/{xmls[0]}", ua).decode("utf-8", "replace")):
            if qualifies(tx, min_usd):
                out.append(plan(tx, filed or tx["date"]))
    return out


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "latest":
        m = float(sys.argv[sys.argv.index("--min") + 1]) if "--min" in sys.argv else MIN_USD
        print(json.dumps(latest(m), indent=1))
    else:
        print(__doc__)
