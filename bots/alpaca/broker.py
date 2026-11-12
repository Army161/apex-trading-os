"""Minimal Alpaca REST client (stdlib only). PAPER endpoint is forced unless you set both switches yourself, on your own
machine: ALPACA_LIVE to true and APEX_ALLOW_LIVE to exactly yes. Every order (submit, bracket) first asks guard.check for the
dashboard halt state of this bot; live mode refuses when that state cannot be read."""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

import guard

PAPER = "https://paper-api.alpaca.markets"
LIVE = "https://api.alpaca.markets"
DATA = "https://data.alpaca.markets"


class Alpaca:
    def __init__(self, bot_id: str = "", fetch=None):
        self.bot_id, self._fetch = bot_id, fetch  # fetch: only tests hand one in
        self.key = os.environ.get("ALPACA_API_KEY", "")
        self.secret = os.environ.get("ALPACA_SECRET_KEY", "")
        live = os.environ.get("ALPACA_LIVE") == "true" and os.environ.get("APEX_ALLOW_LIVE") == "yes"
        self.base = LIVE if live else PAPER
        self.paper = not live

    def _req(self, method, url, body=None, params=None):
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"APCA-API-KEY-ID": self.key, "APCA-API-SECRET-KEY": self.secret, "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}

    def account(self):
        return self._req("GET", f"{self.base}/v2/account")

    def positions(self):
        return self._req("GET", f"{self.base}/v2/positions")

    def orders(self, status="open"):
        return self._req("GET", f"{self.base}/v2/orders", params={"status": status, "limit": 500})

    def calendar(self, start, end):
        return self._req("GET", f"{self.base}/v2/calendar", params={"start": start, "end": end})

    def clock(self):
        return self._req("GET", f"{self.base}/v2/clock")

    def gate(self):
        """Raises guard.Halted when no order may go out now. Every order calls it; callers may also ask before other steps."""
        if not self.bot_id:
            raise guard.Halted("no bot id: cannot check the dashboard halt state, order refused")
        guard.check(self.bot_id, self.paper, self._fetch)

    def submit(self, symbol, qty, side, type_="market", tif="day", client_order_id=None, stop_price=None, limit_price=None):
        self.gate()
        body = {"symbol": symbol, "qty": str(qty), "side": side, "type": type_, "time_in_force": tif}
        if client_order_id:
            body["client_order_id"] = client_order_id
        if stop_price:
            body["stop_price"] = str(round(stop_price, 2))
        if limit_price:
            body["limit_price"] = str(round(limit_price, 2))
        return self._req("POST", f"{self.base}/v2/orders", body)

    def bracket(self, symbol, qty, side, take_profit, stop_loss, client_order_id=None):
        self.gate()
        body = {"symbol": symbol, "qty": str(qty), "side": side, "type": "market", "time_in_force": "day", "order_class": "bracket",
                "take_profit": {"limit_price": str(round(take_profit, 2))}, "stop_loss": {"stop_price": str(round(stop_loss, 2))}}
        if client_order_id:
            body["client_order_id"] = client_order_id
        return self._req("POST", f"{self.base}/v2/orders", body)

    def cancel(self, order_id):
        return self._req("DELETE", f"{self.base}/v2/orders/{order_id}")

    def bars(self, symbols, timeframe="1Day", start=None, limit=10000):
        out, token = {}, None
        while True:
            p = {"symbols": ",".join(symbols), "timeframe": timeframe, "limit": limit, "adjustment": "all", "feed": "iex"}
            if start:
                p["start"] = start
            if token:
                p["page_token"] = token
            j = self._req("GET", f"{DATA}/v2/stocks/bars", params=p)
            for s, rows in (j.get("bars") or {}).items():
                out.setdefault(s, []).extend(rows)
            token = j.get("next_page_token")
            if not token:
                return out

    def latest_trades(self, symbols):
        return self._req("GET", f"{DATA}/v2/stocks/trades/latest", params={"symbols": ",".join(symbols), "feed": "iex"}).get("trades", {})


def to_df(rows):
    import pandas as pd
    df = pd.DataFrame(rows)
    df["time"] = pd.to_datetime(df["t"], utc=True)
    return df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"}).set_index("time")[["open", "high", "low", "close", "volume"]].astype(float)


def telegram(text: str):
    tok, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    print(text, flush=True)
    if not tok or not chat:
        return
    try:
        data = urllib.parse.urlencode({"chat_id": chat, "text": text[:4000]}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/sendMessage", data=data, timeout=10)
    except Exception as e:  # noqa: BLE001
        print("telegram failed:", e)
