#!/usr/bin/env python3
"""Apex skill safety scan (idea from archive/chat/31, NVIDIA SkillSpector). Our own small static checker, no third-party code.

Run it on any agent skill, MCP server or plugin folder BEFORE you install it:
    python tools/skill_scan.py path/to/skill [more paths] [--json]

It looks for the patterns that matter most for a trading setup: hidden instructions, secret or wallet-key access,
sending data out, piping downloads into a shell, destructive commands, obfuscated code and over-broad permissions.
Score 0-100 (higher = riskier). It is a first filter, not a guarantee: a clean score means "no known red flags found",
and anything 40+ should be read by a human before installing. For a deeper scan with an LLM stage use NVIDIA SkillSpector
(Apache-2.0) on your own machine: uv tool install git+https://github.com/NVIDIA/skillspector.git && skillspector scan <path>
"""
import json, re, sys
from pathlib import Path

TEXT = {".md", ".txt", ".py", ".js", ".ts", ".mjs", ".cjs", ".sh", ".bash", ".zsh", ".ps1", ".json", ".yaml", ".yml", ".toml", ".rb", ".go"}
# (id, weight, description, regex)
RULES = [
    ("hidden-unicode", 25, "invisible or bidi characters that can hide instructions", r"[​-‏‪-‮⁠-⁤﻿\U000e0000-\U000e007f]"),
    ("hidden-comment-instruction", 20, "HTML comment telling the agent what to do", r"<!--[^>]{0,400}?\b(ignore|disregard|do not tell|don't tell|secretly|without (asking|telling)|system prompt|you must)\b"),
    ("override-instructions", 25, "tries to override the user's or system's instructions", r"\b(ignore|disregard|forget) (all |any )?(previous|prior|above|earlier) (instructions|rules|messages)\b"),
    ("conceal-from-user", 20, "asks the agent to hide actions from the user", r"\b(do not|don't|never) (tell|inform|mention|show)( this)? (to )?the user\b|\bwithout (the user|asking|telling)\b"),
    ("secret-paths", 20, "reads SSH keys, cloud creds, browser data or wallet files", r"(?-i:(~|\$HOME|/home/\w+|/root|%USERPROFILE%)[/\\]\.(ssh|aws|gnupg|kube|docker|config/solana|ethereum|bitcoin|electrum)\b|\bid_(rsa|ed25519)\b|wallet\.dat|keystore/|Login Data|cookies\.sqlite)|seed ?phrase|mnemonic phrase|private[_ ]key\s*[=:]"),
    ("env-dump", 15, "dumps or uploads the whole environment", r"\b(printenv|env\s*\|\s*(curl|nc|wget)|os\.environ\b(?!\.get|\[)|process\.env\b(?!\.[A-Z_])|Get-ChildItem\s+env:)"),
    ("exfil-endpoint", 15, "posts data to a paste, webhook or tunnel service", r"(pastebin\.com|transfer\.sh|webhook\.site|requestbin|ngrok\.io|discord(app)?\.com/api/webhooks|hooks\.slack\.com|api\.telegram\.org/bot|\.onion\b)"),
    ("curl-pipe-shell", 25, "pipes a download straight into a shell or interpreter", r"(curl|wget|iwr|Invoke-WebRequest)[^\n|]{0,200}\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node|iex)\b"),
    ("destructive", 20, "deletes or wipes broadly", r"\brm\s+-[a-z]*r[a-z]*f?\s+(/|~|\$HOME|\*|\.\s)|\bmkfs\b|\bdd\s+if=.*of=/dev/|Remove-Item\s+.*-Recurse.*-Force|\bshred\b"),
    ("obfuscated-exec", 20, "runs decoded or dynamic code", r"\b(eval|exec)\s*\(\s*(base64|atob|bytes\.fromhex|codecs\.decode|zlib\.decompress|__import__)|base64\s+-d\s*\|\s*(sh|bash)|\bFunction\s*\(\s*atob"),
    ("long-base64", 10, "large encoded blob", r"[A-Za-z0-9+/]{300,}={0,2}"),
    ("persistence", 15, "adds startup, cron or shell-profile entries", r"crontab\s+-|/etc/cron|launchctl\s+load|LaunchAgents|\.bashrc|\.zshrc|\.profile\b|schtasks\s+/create|HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run"),
    ("privilege", 10, "asks for root or disables safety prompts", r"\bsudo\b|--dangerously-skip-permissions|bypassPermissions|chmod\s+777|--no-sandbox"),
    ("broad-tools", 10, "grants every tool or unrestricted shell", r"allowed[-_]tools\s*[:=]\s*[\"']?\*|\"Bash\(\*\)\"|Bash\(\*\)"),
    ("trade-execution", 10, "can place orders or move funds (check it is paper/test first)", r"\b(create_order|place_order|submit_order|market_buy|market_sell|withdraw|transfer_funds|send_transaction|sendTransaction|signTransaction)\b"),
]
COMPILED = [(i, w, d, re.compile(p, re.I)) for i, w, d, p in RULES]


def scan_file(p: Path):
    try:
        if p.stat().st_size > 2_000_000:
            return []
        text = p.read_text("utf-8", errors="replace")
    except OSError:
        return []
    hits = []
    for rid, w, desc, rx in COMPILED:
        for m in list(rx.finditer(text))[:3]:
            line = text.count("\n", 0, m.start()) + 1
            hits.append({"rule": rid, "weight": w, "why": desc, "file": str(p), "line": line, "match": m.group(0)[:80].encode("unicode_escape").decode()})
    return hits


def scan(target: str):
    root = Path(target)
    files = [root] if root.is_file() else [f for f in root.rglob("*") if f.is_file() and (f.suffix.lower() in TEXT or f.name == "SKILL.md")
                                           and not any(x in f.parts for x in ("node_modules", ".git", ".venv", "__pycache__"))]
    hits = [h for f in files for h in scan_file(f)]
    # score: each rule counts once at full weight, repeats add a little, capped at 100
    by = {}
    for h in hits:
        by.setdefault(h["rule"], []).append(h)
    score = min(100, sum(v[0]["weight"] + 2 * (len(v) - 1) for v in by.values()))
    label = "high" if score >= 60 else "review" if score >= 40 else "low" if score >= 15 else "clean"
    return {"target": target, "files": len(files), "score": score, "label": label, "findings": hits}


def units(target: str):
    """A folder holding several skills (each with its own SKILL.md) is scored as a whole first, then one skill at a time.
    The whole comes first so that hooks, launchers, agents and commands beside the skills are never left out."""
    root = Path(target)
    if root.is_file() or (root / "SKILL.md").exists():
        return [target]
    subs = sorted({str(f.parent) for f in root.rglob("SKILL.md") if "node_modules" not in f.parts})
    return [target] + subs


def main(argv):
    as_json = "--json" in argv
    paths = [a for a in argv if a != "--json"] or ["."]
    results = [scan(u) for p in paths for u in units(p)]
    if as_json:
        print(json.dumps(results, indent=1)); return 1 if any(r["score"] >= 60 for r in results) else 0
    for r in results:
        print(f"\n{r['target']}: risk {r['score']}/100 ({r['label']}), {r['files']} files")
        for h in r["findings"][:25]:
            print(f"  [{h['rule']}] {h['why']}\n      {h['file']}:{h['line']}  {h['match']}")
        if len(r["findings"]) > 25:
            print(f"  ... {len(r['findings']) - 25} more")
    print("\nA clean score means no known red flags were found, not that a skill is safe. Read anything rated 'review' or 'high' before installing.")
    return 1 if any(r["score"] >= 60 for r in results) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
