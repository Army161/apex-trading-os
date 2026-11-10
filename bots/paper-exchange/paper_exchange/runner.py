"""Closed-bar paper runner with a run manifest (archive/chat/85). Our own code, paper only, not his sample bot.

- Acts only on CLOSED bars. A higher signal timeframe (60m by default) decides direction; a lower execution timeframe
  (5m) times entries and manages exits. Bars are built here from the replayed lower bars, so no forming bar is ever used.
- Settings come from environment variables: APEX_ACCOUNT_CAPITAL, APEX_RISK_PCT (default 1), APEX_MAX_CONTRACTS,
  APEX_DAILY_LOSS_PCT (default 2), APEX_WEEKLY_LOSS_PCT (default 5), APEX_TRADABLE (default "no": signals are logged,
  no paper entries). There is no live mode here at all.
- Daily and weekly loss limits stop new entries for the rest of the day or week.
- Every event is one JSON line. The run manifest records the source hash, Python and OS version, the settings used, the
  dataset id and date range, and a hash of the captured output, so a result can be reproduced or shown to be different.
The author's "821% in one month across 765 bots" is a selection and multiple-testing artifact; nothing here is proven.
"""
from __future__ import annotations
import hashlib, json, os, platform, sys, time
from dataclasses import dataclass, asdict, field
from typing import Callable, Iterable


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass
class Settings:
    capital: float = float(_env("APEX_ACCOUNT_CAPITAL", "10000"))
    risk_pct: float = float(_env("APEX_RISK_PCT", "1"))
    max_contracts: int = int(_env("APEX_MAX_CONTRACTS", "2"))
    daily_loss_pct: float = float(_env("APEX_DAILY_LOSS_PCT", "2"))
    weekly_loss_pct: float = float(_env("APEX_WEEKLY_LOSS_PCT", "5"))
    tradable: bool = _env("APEX_TRADABLE", "no") == "yes"
    signal_min: int = 60
    exec_min: int = 5

    @classmethod
    def from_env(cls):
        return cls(float(_env("APEX_ACCOUNT_CAPITAL", "10000")), float(_env("APEX_RISK_PCT", "1")), int(_env("APEX_MAX_CONTRACTS", "2")),
                   float(_env("APEX_DAILY_LOSS_PCT", "2")), float(_env("APEX_WEEKLY_LOSS_PCT", "5")), _env("APEX_TRADABLE", "no") == "yes")


Bar = dict  # {"t": epoch seconds of bar open, "o", "h", "l", "c", "v"}


@dataclass
class Runner:
    settings: Settings
    signal: Callable[[list[Bar]], int]                       # closed signal bars -> +1 / -1 / 0
    entry: Callable[[list[Bar], int], tuple[float, float] | None]   # closed exec bars, direction -> (stop, target) or None
    dataset_id: str = "unknown"
    log: list[str] = field(default_factory=list)
    trades: list[dict] = field(default_factory=list)

    def _emit(self, event: str, **kw):
        self.log.append(json.dumps({"event": event, "mode": "paper", **kw}, sort_keys=True))

    def run(self, bars: Iterable[Bar]):
        s, step = self.settings, self.settings.signal_min * 60
        sig_bars: list[Bar] = []; exe: list[Bar] = []; cur: Bar | None = None
        direction, pos, equity = 0, None, s.capital
        day_pnl: dict[int, float] = {}; week_pnl: dict[int, float] = {}
        first = last = None
        self._emit("start", settings=asdict(s), dataset=self.dataset_id)
        for b in bars:
            first = first if first is not None else b["t"]; last = b["t"]
            # 1. the higher-timeframe bar closes when a new bucket starts
            k = b["t"] - b["t"] % step
            if cur is not None and cur["t"] != k:
                sig_bars.append(cur); direction = self.signal(sig_bars); self._emit("signal_bar", t=cur["t"], close=cur["c"], direction=direction)
                cur = None
            cur = {**b, "t": k} if cur is None else {**cur, "h": max(cur["h"], b["h"]), "l": min(cur["l"], b["l"]), "c": b["c"], "v": cur["v"] + b["v"]}
            # 2. the execution bar b is closed; manage the open position first
            exe.append(b); d, w = int(b["t"] // 86400), int((b["t"] // 86400 + 3) // 7)
            if pos:
                hit = (b["l"] <= pos["stop"] or b["h"] >= pos["target"]) if pos["side"] == 1 else (b["h"] >= pos["stop"] or b["l"] <= pos["target"])
                if hit:
                    px = pos["stop"] if ((pos["side"] == 1 and b["l"] <= pos["stop"]) or (pos["side"] == -1 and b["h"] >= pos["stop"])) else pos["target"]
                    pnl = (px - pos["entry"]) * pos["qty"] * pos["side"]; equity += pnl
                    day_pnl[d] = day_pnl.get(d, 0) + pnl; week_pnl[w] = week_pnl.get(w, 0) + pnl
                    self.trades.append({**pos, "exit": px, "exit_t": b["t"], "pnl": pnl}); self._emit("sim_exit", t=b["t"], price=px, pnl=round(pnl, 2)); pos = None
            if pos or not direction:
                continue
            if day_pnl.get(d, 0) <= -s.daily_loss_pct / 100 * s.capital or week_pnl.get(w, 0) <= -s.weekly_loss_pct / 100 * s.capital:
                self._emit("loss_limit", t=b["t"], day=round(day_pnl.get(d, 0), 2), week=round(week_pnl.get(w, 0), 2)); continue
            plan = self.entry(exe, direction)
            if not plan:
                continue
            stop, target = plan; dist = abs(b["c"] - stop)
            qty = min(s.max_contracts, int(equity * s.risk_pct / 100 / dist)) if dist > 0 else 0
            if not s.tradable or qty < 1:
                self._emit("signal_only", t=b["t"], direction=direction, reason="APEX_TRADABLE is not yes" if not s.tradable else "size below one contract"); continue
            pos = {"side": direction, "entry": b["c"], "stop": stop, "target": target, "qty": qty, "entry_t": b["t"]}
            self._emit("sim_entry", t=b["t"], side=direction, price=b["c"], stop=stop, target=target, qty=qty)
        self._emit("end", trades=len(self.trades), equity=round(equity, 2))
        self.range = (first, last)
        return self

    def manifest(self, source_files: list[str]) -> dict:
        out = "\n".join(self.log).encode()
        return {
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "mode": "paper",
            "source_sha256": {f: hashlib.sha256(open(f, "rb").read()).hexdigest() for f in source_files},
            "python": sys.version.split()[0], "os": platform.platform(), "settings": asdict(self.settings),
            "dataset_id": self.dataset_id, "date_range": getattr(self, "range", (None, None)),
            "events": len(self.log), "output_sha256": hashlib.sha256(out).hexdigest(), "trades": len(self.trades),
        }
