"""Order gate for the Alpaca bots, asked before every order (broker.py calls it from submit and bracket).

It reads the dashboard halt state for this bot together with the global kill switch and andon cord, from the endpoint the bots
already poll: GET {APEX_DASHBOARD_URL}/api/bots/{bot_id}/command with header x-apex-token: APEX_INGEST_TOKEN.
  * live: no dashboard URL, an unreachable dashboard or an answer that cannot be read all mean halted. The order is refused.
  * paper: an unreachable dashboard keeps the old behaviour (the order goes ahead, with a log line), but an explicit halt is obeyed.
The token is sent as a header only and is never printed."""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Callable

Fetch = Callable[[str, dict], bytes]


class Halted(RuntimeError):
    """The order was refused before it reached the broker."""


def _fetch(url: str, headers: dict) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as r:
        if r.status != 200:
            raise OSError(f"dashboard answered {r.status}")
        return r.read()


def read_halt(bot_id: str, fetch: Fetch | None = None) -> tuple[bool | None, str]:
    """(halted, why). halted is None when the state could not be read."""
    base = os.environ.get("APEX_DASHBOARD_URL", "").rstrip("/")
    if not base:
        return None, "no dashboard set (APEX_DASHBOARD_URL is empty)"
    url = f"{base}/api/bots/{urllib.parse.quote(bot_id, safe='')}/command"
    try:
        j = json.loads((fetch or _fetch)(url, {"x-apex-token": os.environ.get("APEX_INGEST_TOKEN", "")}))
    except Exception as e:  # noqa: BLE001
        return None, f"dashboard unreachable ({type(e).__name__})"
    if not isinstance(j, dict) or not isinstance(j.get("halted"), bool):
        return None, "dashboard answer has no readable halt state"
    if j["halted"] or j.get("command") in ("pause", "kill"):
        return True, str(j.get("why") or j.get("command") or "halted from the dashboard")
    return False, "ok"


def check(bot_id: str, paper: bool, fetch: Fetch | None = None, log: Callable[[str], None] = print) -> None:
    """Raises Halted when this order must not be sent."""
    halted, why = read_halt(bot_id, fetch)
    if halted:
        log(f"[guard] {bot_id}: order refused, halted: {why}")
        raise Halted(f"halted: {why}")
    if halted is None:
        if not paper:
            log(f"[guard] {bot_id}: order refused in LIVE mode: {why}")
            raise Halted(f"live mode and the halt state cannot be read: {why}")
        log(f"[guard] {bot_id}: {why}; paper mode, going ahead")
