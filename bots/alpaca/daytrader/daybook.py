"""The day-trader's day book: today's trade count and P&L, kept on disk so the daily caps hold across runs of desk.py.

One JSON file (desk_day.json next to desk.py). Every change happens under an exclusive file lock and is written to a temp file
that replaces the old one, so two desk runs cannot lose a count and a crash cannot leave half a file. The day is the New York
trading day. A book that exists but cannot be read counts as a cap hit: the desk refuses until you look at it.

  trades        orders sent today (counted before the order goes out, so a lost broker answer still counts)
  realised_pnl  the lowest realised P&L seen today, from the broker account: day change minus today's open-position change
  day_pnl       the lowest account day change seen today (realised plus open)
The loss cap uses the worse of the two, so neither an open winner nor an open loser can hide a realised loss."""
from __future__ import annotations

import contextlib
import fcntl
import json
import math
import os
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")


class Unreadable(RuntimeError):
    """The day book exists but could not be read."""


def today(now: datetime | None = None) -> str:
    return (now or datetime.now(NY)).astimezone(NY).date().isoformat()


def fresh(day: str) -> dict:
    return {"date": day, "trades": 0, "realised_pnl": 0.0, "day_pnl": 0.0}


@contextlib.contextmanager
def _locked(path: str):
    with open(path + ".lock", "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _read(path: str, day: str) -> dict:
    if not os.path.exists(path):
        return fresh(day)
    try:
        b = json.load(open(path))
        b = {"date": str(b["date"]), "trades": int(b["trades"]), "realised_pnl": float(b["realised_pnl"]), "day_pnl": float(b["day_pnl"])}
    except Exception as e:  # noqa: BLE001
        raise Unreadable(f"day book {os.path.basename(path)} cannot be read ({type(e).__name__})") from e
    return b if b["date"] == day else fresh(day)


def _write(path: str, book: dict) -> None:
    fd, tmp = tempfile.mkstemp(prefix=".desk_day.", dir=os.path.dirname(os.path.abspath(path)))
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(book, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.remove(tmp)
        raise


def load(path: str, day: str) -> dict:
    with _locked(path):
        return _read(path, day)


def cap_hit(book: dict, account_size: float, max_daily_loss_pct: float, max_trades_per_day: int) -> str | None:
    """The reason no new order may go out today, or None."""
    loss_line = -abs(account_size) * abs(max_daily_loss_pct) / 100
    if not all(math.isfinite(float(v)) for v in (book["realised_pnl"], book["day_pnl"], book["trades"], loss_line)):
        return "day book holds a number that is not finite; refusing until you look at it"
    worst = min(book["realised_pnl"], book["day_pnl"])
    if worst <= loss_line:
        return f"daily loss cap hit: {worst:.2f} at or below {loss_line:.2f}; no new orders until tomorrow"
    if book["trades"] >= max_trades_per_day:
        return f"trades-per-day cap hit: {book['trades']} of {max_trades_per_day}; no new orders until tomorrow"
    return None


def record_pnl(path: str, day: str, realised: float, day_change: float) -> dict:
    """Store today's P&L from the broker. Only ever moves down within a day: a later bounce does not lift a cap that was hit."""
    if not (math.isfinite(realised) and math.isfinite(day_change)):
        raise ValueError("broker P&L is not a finite number")
    with _locked(path):
        b = _read(path, day)
        b["realised_pnl"] = min(b["realised_pnl"], float(realised))
        b["day_pnl"] = min(b["day_pnl"], float(day_change))
        _write(path, b)
        return b


def reserve(path: str, day: str, account_size: float, max_daily_loss_pct: float, max_trades_per_day: int) -> tuple[bool, str]:
    """Check the caps and, when clear, count this order, in one locked step. Returns (allowed, reason)."""
    with _locked(path):
        try:
            b = _read(path, day)
        except Unreadable as e:
            return False, str(e)
        why = cap_hit(b, account_size, max_daily_loss_pct, max_trades_per_day)
        if why:
            return False, why
        b["trades"] += 1
        _write(path, b)
        return True, f"trade {b['trades']} of {max_trades_per_day} today"
