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


def files(base: pathlib.Path):
    for p in base.rglob("*"):
        if p.is_file() and p.suffix in CODE and not SKIP & set(p.relative_to(ROOT).parts):
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
    for r in [ROOT / "bots/README.md", ROOT / "web/lib/README.md", ROOT / "packages/README.md", ROOT / "apps/cli/README.md"]:
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
    for p in files(ROOT):
        if secret.search(p.read_text(errors="ignore")):
            bad.append(f"{rel(p)}: looks like it contains a key")
    for line in bad:
        print("DRIFT", line)
    print("drift check:", "clean" if not bad else f"{len(bad)} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
