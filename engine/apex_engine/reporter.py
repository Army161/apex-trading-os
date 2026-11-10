"""Tiny client every bot uses to push heartbeats, trades and events to the Apex dashboard
(POST {APEX_DASHBOARD_URL}/api/ingest with header x-apex-token: APEX_INGEST_TOKEN) and to pull
commands (pause/resume/kill) from GET /api/bots/{id}/command. Fails soft: a dashboard outage never
stops a bot. Without env vars it only logs to stdout."""
from __future__ import annotations

import json
import os
import time
import urllib.request


class Reporter:
    def __init__(self, bot_id: str, kind: str, name: str = "", mode: str = "paper"):
        self.bot_id, self.kind, self.name, self.mode = bot_id, kind, name or bot_id, mode
        self.url = os.environ.get("APEX_DASHBOARD_URL", "").rstrip("/")
        self.token = os.environ.get("APEX_INGEST_TOKEN", "")

    def _post(self, payload: dict):
        payload = {"bot": {"id": self.bot_id, "kind": self.kind, "name": self.name, "mode": self.mode}, "ts": time.time(), **payload}
        print(json.dumps(payload, default=str)[:500], flush=True)
        if not self.url:
            return None
        try:
            req = urllib.request.Request(f"{self.url}/api/ingest", data=json.dumps(payload, default=str).encode(),
                                         headers={"content-type": "application/json", "x-apex-token": self.token}, method="POST")
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read() or b"{}")
        except Exception as e:  # noqa: BLE001
            print(f"[reporter] dashboard unreachable: {e}", flush=True)
            return None

    def heartbeat(self, status: dict):
        return self._post({"type": "heartbeat", "status": status})

    def trade(self, trade: dict):
        return self._post({"type": "trade", "trade": trade})

    def event(self, level: str, message: str):
        return self._post({"type": "event", "level": level, "message": message})

    def halt(self, reason: str):
        """Pull the andon cord: the dashboard pauses every bot and messages the owner. Use when something is wrong
        that this bot cannot judge alone (data looks broken, fills disagree with the plan, an invariant failed)."""
        return self.event("halt", reason)

    def command(self) -> str | None:
        """Returns 'pause', 'resume', 'kill' or None."""
        if not self.url:
            return None
        try:
            req = urllib.request.Request(f"{self.url}/api/bots/{self.bot_id}/command", headers={"x-apex-token": self.token})
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read()).get("command")
        except Exception:  # noqa: BLE001
            return None
