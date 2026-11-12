#!/usr/bin/env python3
"""Drift check (archive/chat/74): compares the code against the invariants written in the folder READMEs.
Plain checks, no model. Run: python3 tools/drift_check.py   (exit code 1 when anything has drifted)."""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = {"node_modules", ".next", "__pycache__", ".venv", ".pytest_cache", "archive", "data", ".git"}
CODE = {".py", ".ts", ".tsx", ".js", ".mjs"}
CONF = {".json", ".yml", ".yaml"}  # bot configs, compose files and workflows: live switches and keys can sit here too


def files(base: pathlib.Path, exts: set[str] = CODE):
    for p in base.rglob("*"):
        if p.is_file() and p.suffix in exts and not SKIP & set(p.relative_to(ROOT).parts):
            yield p


def rel(p): return str(p.relative_to(ROOT))


def main() -> int:
    bad: list[str] = []
    # 1. Every bot folder has a README with an Invariants section.
    for d in sorted((ROOT / "bots").iterdir()):
        if d.is_dir() and not d.name.startswith("."):
            r = d / "README.md"
            if not r.exists():
                bad.append(f"bots/{d.name}: no README.md")
    for r in [ROOT / "bots/README.md", ROOT / "web/lib/README.md", ROOT / "packages/README.md", ROOT / "apps/cli/README.md", ROOT / "apps/executor/README.md"]:
        if not r.exists() or "## Invariants" not in r.read_text():
            bad.append(f"{rel(r)}: missing '## Invariants' section")
    # 2. Bots start in paper. Any bot code that can switch to live must also require APEX_ALLOW_LIVE=yes (the second switch).
    for p in files(ROOT / "bots"):
        if "/test" in rel(p) or p.name.startswith("test_"):
            continue
        t = p.read_text(errors="ignore")
        can_go_live = re.search(r"mode\s*===?\s*['\"]live['\"]|--live|ALPACA_LIVE|api\.alpaca\.markets", t)
        if can_go_live and "APEX_ALLOW_LIVE" not in t and "allowLive" not in t:
            bad.append(f"{rel(p)}: can switch to live without the APEX_ALLOW_LIVE=yes second switch")
    # 2b. Bot configs and compose files start in paper too, and nothing in the repo turns the second switch on.
    for p in files(ROOT / "bots", CONF):
        if "package" in p.name or p.name.startswith("tsconfig"):
            continue
        t = p.read_text(errors="ignore")
        if p.suffix == ".json" and re.search(r"\"dry_run\"\s*:\s*(?=\S)(?!true\b)", t):
            bad.append(f"{rel(p)}: dry_run is not true; bot configs in the repo start in paper")
        if re.search(r"^\s*-?\s*\"?(MODE|ALPACA_LIVE)\"?\s*[:=]\s*['\"]?(live|true)\b", t, re.M | re.I):
            bad.append(f"{rel(p)}: sets a bot's own live switch; bots in the repo start in paper")
    for p in files(ROOT, CONF | {".sh", ".toml"}):
        if re.search(r"APEX_ALLOW_LIVE\"?\s*[:=]\s*['\"]?[^\s'\"$]", p.read_text(errors="ignore")):
            bad.append(f"{rel(p)}: gives the second switch a value; only Jeremy sets it, on his own machine")
    # 2c. Freqtrade's second switch: the start wrapper checks it, and the compose file starts freqtrade only through the wrapper.
    ft = ROOT / "bots/freqtrade"
    if ft.exists():
        launch, compose = ft / "launch.py", ft / "docker-compose.yml"
        lt = launch.read_text() if launch.exists() else ""
        if not re.search(r"SECOND_SWITCH = \"APEX_ALLOW_LIVE\"", lt) or "!= \"yes\"" not in lt or "PLACEHOLDERS" not in lt:
            bad.append("bots/freqtrade/launch.py: missing, or no longer checks the second switch and the API password")
        ct = compose.read_text() if compose.exists() else ""
        if "/apex/launch.py" not in ct or "./launch.py:/apex/launch.py:ro" not in ct or re.search(r"(^|[\s\"'&;])freqtrade\s+trade\b", ct):
            bad.append("bots/freqtrade/docker-compose.yml: must start freqtrade only through launch.py")
        if not re.search(r"^\s*-\s*APEX_ALLOW_LIVE\s*$", ct, re.M):
            bad.append("bots/freqtrade/docker-compose.yml: does not pass the second switch through to the launcher (by name only)")
    # 3. No withdraw or transfer tools anywhere. The only allowed mentions are the deny list and its test.
    allow = {"web/lib/policy.ts", "web/lib/engine/selftest.ts", "tools/drift_check.py"}
    for base in [ROOT / "bots", ROOT / "web", ROOT / "mcp-server", ROOT / "tools", ROOT / "packages", ROOT / "apps"]:
        if not base.exists():
            continue
        for p in files(base):
            if rel(p) in allow:
                continue
            for m in re.finditer(r"(def|function|const|async function)\s+(\w*(withdraw|transfer)\w*)", p.read_text(errors="ignore"), re.I):
                bad.append(f"{rel(p)}: defines {m.group(2)}; agents and bots get no withdraw or transfer tools")
    # 4. The hard money rule is still in the policy gateway.
    pol = (ROOT / "web/lib/policy.ts").read_text()
    if "no-money-tools" not in pol or not re.search(r"'order', 'withdraw', 'transfer', 'pay'", pol):
        bad.append("web/lib/policy.ts: the no-money-tools hard rule has changed")
    # 5. No keys committed. Same patterns as redact() in policy.ts, on real-looking values only.
    secret = re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abp]-[A-Za-z0-9-]{20,}|\b\d{8,}:[A-Za-z0-9_-]{35}\b")
    for p in files(ROOT, CODE | CONF):
        if secret.search(p.read_text(errors="ignore")):
            bad.append(f"{rel(p)}: looks like it contains a key")
    for line in bad:
        print("DRIFT", line)
    print("drift check:", "clean" if not bad else f"{len(bad)} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
