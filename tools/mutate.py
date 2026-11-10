#!/usr/bin/env python3
"""Mutation testing for Apex's risk rules (archive/chat/37: "try to flip a bit ... see if your tests catch it").

For each target function it makes one small change at a time (flip a comparison, swap min/max, and/or, true/false,
+= / -=), runs that target's tests, and restores the file. A mutation the tests catch is "killed"; one they miss
"survived" and points at a missing test. A mutation that no longer parses is "invalid" and is not counted.

    python3 tools/mutate.py               # all targets
    python3 tools/mutate.py --target py-risk --list
    python3 tools/mutate.py --min 0.9     # exit 1 if any target scores below 90%

The file is always restored, even on Ctrl-C. Run it on a clean working tree.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TS_TEST = (["npx", "tsx", "lib/engine/selftest.ts"], "web")
PY_TEST = ([sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", "tests"], "engine")
TARGETS = {
    "py-risk": {"file": "engine/apex_engine/risk.py", "funcs": ["size", "check", "on_close"], "test": PY_TEST,
                "what": "Python RiskGuard: sizing, pre-trade check, loss cooldown, drawdown auto-pause"},
    "ts-check-trade": {"file": "web/lib/assistants.ts", "funcs": ["checkTrade"], "test": TS_TEST,
                       "what": "Risk Mitigator reward:risk gate and 1%-risk position size"},
    "ts-backtest": {"file": "web/lib/engine/core.ts", "funcs": ["backtest"], "test": TS_TEST,
                    "what": "Engine: size = risk / stop distance, stop checked before target, fill at next open"},
    "ts-halt": {"file": "web/lib/andon.ts", "funcs": ["botCommand", "shouldPull"], "test": TS_TEST,
                "what": "Kill switch and andon cord: which command a bot gets, and when a check halts everything"},
}

# (name, pattern, replacement). Patterns avoid =>, ->, <<, >> and generics as far as a regex can.
OPS = [
    ("< to <=", r"(?<![<=!-])<(?![=<])(?=\s)", "<="),
    ("<= to <", r"(?<![<=!])<=", "<"),
    ("> to >=", r"(?<![=>-])>(?![=>])(?=\s)", ">="),
    (">= to >", r"(?<![>=!])>=", ">"),
    ("< to >", r"(?<![<=!-])<(?![=<])(?=\s)", ">"),
    ("> to <", r"(?<![=>-])>(?![=>])(?=\s)", "<"),
    ("<= to >", r"(?<![<=!])<=", ">"),
    (">= to <", r"(?<![>=!])>=", "<"),
    ("min to max", r"\bmin\(", "max("),
    ("max to min", r"\bmax\(", "min("),
    ("&& to ||", r"&&", "||"),
    ("|| to &&", r"\|\|", "&&"),
    ("and to or", r"\band\b", "or"),
    ("or to and", r"\bor\b", "and"),
    ("true to false", r"\btrue\b", "false"),
    ("True to False", r"\bTrue\b", "False"),
    ("+= to -=", r"\+=", "-="),
    ("=== to !==", r"===", "!=="),
    ("!== to ===", r"!==", "==="),
]


def func_range(lines: list[str], name: str, py: bool) -> tuple[int, int]:
    pat = re.compile(rf"^\s*def {name}\(" if py else rf"^\s*export (?:async )?function {name}\b|^\s*(?:export )?const {name}\s*=")
    start = next((i for i, l in enumerate(lines) if pat.search(l)), None)
    if start is None:
        raise SystemExit(f"function {name} not found")
    if py:
        ind = len(lines[start]) - len(lines[start].lstrip())
        end = start + 1
        while end < len(lines) and (not lines[end].strip() or len(lines[end]) - len(lines[end].lstrip()) > ind):
            end += 1
        return start, end
    depth, seen = 0, False
    for i in range(start, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        seen = seen or "{" in lines[i]
        if seen and depth <= 0:
            return start, i + 1
    return start, len(lines)


def code_part(line: str, py: bool) -> int:
    """Index where a trailing comment starts (strings are not parsed, so be conservative)."""
    m = re.search(r"\s#" if py else r"\s//", line)
    return m.start() if m else len(line)


def mutants(src: str, funcs: list[str], py: bool):
    lines = src.split("\n")
    for fn in funcs:
        a, b = func_range(lines, fn, py)
        for i in range(a + 1, b):
            line = lines[i]
            s = line.strip()
            if not s or s.startswith(("#", "//", '"""', "*")):
                continue
            cut = code_part(line, py)
            strs = [m.span() for m in re.finditer(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`[^`]*`", line)]
            for name, pat, rep in OPS:
                for m in re.finditer(pat, line[:cut]):
                    if any(a <= m.start() < b for a, b in strs):
                        continue  # inside a string literal: changing text is not a logic mutation
                    new = line[:m.start()] + rep + line[m.end():]
                    out = lines[:]
                    out[i] = new
                    yield {"func": fn, "line": i + 1, "op": name, "before": s, "after": new.strip()}, "\n".join(out)


def run_tests(test, timeout=180) -> tuple[str, str]:
    cmd, cwd = test
    try:
        p = subprocess.run(cmd, cwd=os.path.join(ROOT, cwd), capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return "killed", "timeout"
    out = p.stdout + p.stderr
    if p.returncode == 0:
        return "survived", ""
    if re.search(r"SyntaxError|Transform failed|IndentationError|ParseError|ERROR collecting", out):
        return "invalid", out[-300:]
    return "killed", out[-300:]


def run_target(key: str, only_list=False):
    t = TARGETS[key]
    path = os.path.join(ROOT, t["file"])
    py = path.endswith(".py")
    orig = open(path).read()
    ms = list(mutants(orig, t["funcs"], py))
    if only_list:
        for m, _ in ms:
            print(f"{key} {m['func']}:{m['line']} {m['op']}: {m['after']}")
        return {"target": key, "mutants": len(ms)}
    base, why = run_tests(t["test"])
    if base != "survived":
        raise SystemExit(f"{key}: tests fail before mutating, fix them first\n{why}")
    rows = []
    try:
        for m, src in ms:
            open(path, "w").write(src)
            m["result"], _ = run_tests(t["test"])
            rows.append(m)
            print(f"  {m['result']:8} {m['func']}:{m['line']} {m['op']}", flush=True)
    finally:
        open(path, "w").write(orig)
    k = sum(r["result"] == "killed" for r in rows)
    s = sum(r["result"] == "survived" for r in rows)
    return {"target": key, "what": t["what"], "file": t["file"], "killed": k, "survived": s,
            "invalid": sum(r["result"] == "invalid" for r in rows), "score": k / (k + s) if k + s else 1.0,
            "survivors": [r for r in rows if r["result"] == "survived"]}


def report_md(results) -> str:
    out = ["# Mutation test report", "", f"Run {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())} with `python3 tools/mutate.py`.", "",
           "| Target | What it guards | Killed | Survived | Score |", "|---|---|---|---|---|"]
    for r in results:
        out.append(f"| {r['target']} | {r['what']} | {r['killed']} | {r['survived']} | {r['score']:.0%} |")
    for r in results:
        if r["survivors"]:
            out += ["", f"## Survivors in {r['target']} ({r['file']})", ""]
            out += [f"- line {m['line']} `{m['op']}`: `{m['after']}`" for m in r["survivors"]]
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", choices=list(TARGETS), action="append")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--min", type=float, default=0.0)
    ap.add_argument("--report", default=os.path.join(ROOT, "docs", "mutation-report.md"))
    a = ap.parse_args()
    keys = a.target or list(TARGETS)
    results = []
    for k in keys:
        print(f"{k}: {TARGETS[k]['what']}", flush=True)
        results.append(run_target(k, a.list))
    if a.list:
        return
    open(a.report, "w").write(report_md(results))
    print(json.dumps([{k: v for k, v in r.items() if k != "survivors"} for r in results], indent=1))
    if any(r["score"] < a.min for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
