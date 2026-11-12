"""Start wrapper for Freqtrade: the second live switch. docker-compose.yml runs every freqtrade command through this file.

Before `freqtrade trade` (or any command not on the read-only list below) it reads the config files named with --config and the
FREQTRADE__* env overrides, and refuses to start when:
  * the bot would run live (dry_run is not exactly true, or cannot be read) and APEX_ALLOW_LIVE is not exactly 'yes' in the env.
    Only Jeremy sets that, on his own machine. `--dry-run` on the command line always means paper.
  * the API server password or JWT secret is empty or a placeholder.
  * a config file holds exchange keys (keys come only from env vars) or cannot be read.
Read-only commands (backtesting, hyperopt, download-data, list and show commands) place no orders and skip the checks.
Stdlib only. Never prints a secret: reasons name the setting, not its value."""
from __future__ import annotations

import json
import os
import sys
from typing import Mapping

READ_ONLY = {"backtesting", "backtesting-show", "backtesting-analysis", "hyperopt", "hyperopt-list", "hyperopt-show", "download-data",
             "convert-data", "convert-trade-data", "list-data", "list-strategies", "list-freqaimodels", "list-exchanges", "list-hyperoptloss",
             "list-markets", "list-pairs", "list-timeframes", "lookahead-analysis", "recursive-analysis", "plot-dataframe", "plot-profit",
             "test-pairlist", "show-config", "create-userdir", "new-config", "new-strategy", "install-ui", "--version", "-V", "--help", "-h"}
PLACEHOLDERS = {"", "change-me", "change-me-via-env", "changeme", "freqtrader", "password", "secret", "somethingrandomsomethingrandom"}
SECOND_SWITCH = "APEX_ALLOW_LIVE"


def config_paths(argv: list[str]) -> list[str]:
    out, i = [], 0
    while i < len(argv):
        a = argv[i]
        if a in ("-c", "--config") and i + 1 < len(argv):
            out.append(argv[i + 1])
            i += 2
            continue
        if a.startswith("--config="):
            out.append(a.split("=", 1)[1])
        i += 1
    return out


def _env_bool(v: str) -> bool | None:
    v = v.strip().lower()
    return True if v == "true" else False if v == "false" else None


def decide(argv: list[str], configs: list[dict], env: Mapping[str, str]) -> tuple[bool, str]:
    """(allowed, reason). Pure: the caller reads the files and the environment."""
    cmd = argv[0] if argv else ""
    if cmd in READ_ONLY:
        return True, f"{cmd}: read-only command, places no orders"
    if not configs:
        return False, "no readable --config given; refusing to start a trading command without one"
    for c in configs:
        if not isinstance(c, dict):
            return False, "a config file is not a JSON object"
        ex = c.get("exchange") or {}
        if not isinstance(ex, dict) or any(str(ex.get(k) or "").strip() for k in ("key", "secret", "password", "uid")):
            return False, "a config file holds exchange keys; keys come only from env vars"
    # dry run: the --dry-run flag forces paper. Otherwise the env override wins over the files, and the last file wins over earlier
    # ones. Anything other than an exact true (missing, false, a string, add_config_files we do not follow) counts as live.
    if "--dry-run" in argv:
        dry, why = True, "--dry-run flag"
    elif "FREQTRADE__DRY_RUN" in env:
        dry, why = _env_bool(env["FREQTRADE__DRY_RUN"]) is True, "FREQTRADE__DRY_RUN"
    elif any("add_config_files" in c for c in configs):
        dry, why = False, "add_config_files is set, which this launcher does not follow"
    else:
        last = [c["dry_run"] for c in configs if "dry_run" in c]
        dry, why = bool(last) and last[-1] is True, "config dry_run"
    if not dry and env.get(SECOND_SWITCH) != "yes":
        return False, f"live trading refused ({why} is not true) and the second switch is off: only Jeremy turns it on, on his own machine"
    api = {}
    for c in configs:
        if isinstance(c.get("api_server"), dict):
            api.update(c["api_server"])
    for name, key, env_key in (("API server password", "password", "FREQTRADE__API_SERVER__PASSWORD"),
                               ("API server JWT secret", "jwt_secret_key", "FREQTRADE__API_SERVER__JWT_SECRET_KEY")):
        val = env[env_key] if env_key in env else api.get(key)
        if not isinstance(val, str) or val.strip().lower() in PLACEHOLDERS:
            return False, f"{name} is empty or a placeholder; set your own (FT_API_PASSWORD / FT_JWT_SECRET in .env)"
    return True, "paper (dry run)" if dry else "LIVE: both switches are on"


def main(argv: list[str]) -> int:
    configs = []
    for p in config_paths(argv):
        try:
            with open(p) as f:
                configs.append(json.load(f))
        except Exception as e:  # noqa: BLE001
            print(f"[launch] refused: config {p} cannot be read ({type(e).__name__})", flush=True)
            return 2
    ok, why = decide(argv, configs, os.environ)
    print(f"[launch] {'starting' if ok else 'refused'}: {why}", flush=True)
    if not ok:
        return 2
    os.execvp("freqtrade", ["freqtrade", *argv])
    return 0  # not reached


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
