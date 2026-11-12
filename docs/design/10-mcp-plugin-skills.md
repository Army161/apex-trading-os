# 10. MCP server, Claude Code plugin, skills and the guard hook

How Claude (Desktop, Code, mobile, claude.ai) talks to Apex, and how the repo protects its own money code from an agent's edits. Packages: `packages/mcp`, `plugin/`, `tools/guard_hook.mjs`.

Build note: the MCP SDK and the Claude Code plugin and hook formats change. The build thread reads the current MCP TypeScript SDK docs and the current Claude Code plugin and hooks docs before writing these, and treats the shapes below as requirements, not as exact syntax.

## 1. MCP server

One implementation, two transports.

| Transport | Where | For | Auth |
|---|---|---|---|
| stdio | `npx apex-mcp` from the repo (started by the plugin's `.mcp.json`) | Claude Code, Claude Desktop | `APEX_API_URL` and `APEX_API_KEY` from the environment, or local mode with `DATABASE_URL` |
| Streamable HTTP | `web/app/api/mcp/route.ts` | Claude apps as a custom connector, including on the phone | The same API key as a bearer token. OAuth is added with the product (see `12`) |

The server is a thin layer over `packages/sdk`. It contains no logic of its own, so it cannot disagree with the API. Rules from `docs/agent-safety-and-office.md` apply: it can read and it can queue work; it can never approve, resume, delete, change limits or see a credential.

### 1.1 Tools

Every tool has a JSON schema for input and output, a one-paragraph description that says what it does not do, and annotations. All are read-only except the three marked.

| Tool | Does | Annotation |
|---|---|---|
| `apex_status` | Mode, halts, runs, trial counts, needs-you | read-only |
| `apex_board` | Evaluations with filters and paging | read-only |
| `apex_pair` | One evaluation in full | read-only |
| `apex_strategies` | Registry list or one strategy | read-only |
| `apex_slots` | Slots with clocks; or one slot with trades, events, drift | read-only |
| `apex_book` | Equity, positions, fills, blocked intents | read-only |
| `apex_risk` | Limits, halts, exposure, locks for a slot | read-only |
| `apex_report` | Latest or dated report as Markdown | read-only |
| `apex_ledger` | Tail, one entry, head, verify a range | read-only |
| `apex_data_health` | Health rows or one dataset | read-only |
| `apex_queue` | Research queue list or item | read-only |
| `apex_claim_check_result` | Status and verdict of a claim check | read-only |
| `queue_claim_check` | Start a claim check from text | **write (queue)**, not destructive, idempotent with a key |
| `propose_research` | Add a `proposed` item to the research queue | **write (queue)**, not destructive |
| `apex_halt` | Pull the andon cord with a reason | **write**, not destructive, idempotent |

Not provided, on purpose: any tool to approve, resume, retire, change a limit, open a lock, run an arbitrary backtest with free parameters (that would be an uncounted try: use `queue_claim_check` or `propose_research`, which go through pre-registration), or read env or keys.

Tool results carry the same `Metric` objects as the API plus a short `text` rendering with the fixed wording. Results that include free text from outside sources (claim-check input, agent notes) wrap it in a clearly marked untrusted block.

### 1.2 Resources and prompts

- Resources: `apex://report/latest`, `apex://glossary`, `apex://playbook` (the trading playbook), `apex://design/README`.
- Prompts: `daily-review`, `check-a-claim`, `explain-why-not` (for a rejected pair). Each is the matching skill's instructions in prompt form.

### 1.3 The old Python server

`mcp-server/apex_mcp.py` stays until the new server's tools cover it. Its `backtest` and `leaderboard` tools run free-parameter tests that are not counted; when the new server ships they are removed rather than ported, and the README says why.

## 2. Claude Code plugin

```
plugin/
  .claude-plugin/plugin.json        name "apex", version, description
  .mcp.json                         starts the stdio MCP server
  skills/
    apex-archive/SKILL.md
    apex-claim-check/SKILL.md
    apex-validate/SKILL.md
    apex-daily-review/SKILL.md
    apex-risk-check/SKILL.md
    apex-data-health/SKILL.md
    apex-ledger/SKILL.md
  agents/
    build-buddy.md                  moved from .claude/agents
    playbook-distiller.md
    goldfish-reviewer.md            fresh-eyes review of a design doc: reads only the doc and the code
  commands/
    apex-status.md  apex-report.md  apex-check.md
  hooks/
    hooks.json                      PreToolUse guard, SessionStart reminder
  README.md                         what it installs, what it can and cannot do
```

Installed from the repo (a local marketplace entry pointing at `plugin/`). Before first use it is scanned with `tools/skill_scan.py`, like any other plugin, and the scan result is committed next to it.

### 2.1 Skill format

Each `SKILL.md` has front matter (`name`, `description` starting with when to use it) and a body with: what the skill is for, the exact tools or commands to call in order, the fixed wording to use when presenting results, what to do when a call fails, and a "never" list (never approve, never edit a limit, never present an in-sample figure without its tag, never call an untested rule a signal). The seven skills are specified in `06` section 5. They hold instructions only; all numbers come from the tools.

## 3. The guard hook

Purpose: an agent working in the repo cannot quietly edit risk limits, live flags, the gate, the ledger or the hook itself. This is the "tool level" guard from the plan. It is one of three layers and the weakest of them; the authoritative layers are CODEOWNERS with branch protection and the `protected-paths` CI job.

### 3.1 Behaviour

`plugin/hooks/hooks.json` registers `tools/guard_hook.mjs` for `PreToolUse` on the file-editing tools and on the shell tool.

- **File edits** (`Edit`, `Write`, `NotebookEdit`): resolve the target path. If it matches `.github/red-paths.txt`, deny, unless a valid sign-off exists for that path. The denial message tells the agent what to do: "This is a red path. Write the change as a proposal in docs/specs/ or open a PR for Jeremy. A sign-off is created by Jeremy with `apex signoff`."
- **Shell commands**: best-effort check of the command string for writes to red paths (`sed -i`, `>`, `tee`, `mv`, `cp`, `git checkout --`, `git apply`, `patch`) and for edits to `.env*`. A match is denied the same way. The hook also denies `git push` to `main` and `git merge` on a branch that touches red paths. This check can be evaded by a determined command, which is why it is not the authoritative layer.
- **Always denied, no sign-off possible**: writing a value that looks like a key into any file; setting `APEX_ALLOW_LIVE` or any `*_LIVE` variable; editing `ledger/heads/`; deleting migrations.
- Everything else passes with no output.

### 3.2 Sign-offs

A sign-off is a small file, `.apex/signoff/<sha256 of path>.json`:

```json
{ "path": "packages/kernel/src/guard.ts", "baseHash": "<sha256 of the file before the change>", "reason": "…",
  "expires": "2026-11-12T00:00:00Z", "sig": "<HMAC-SHA256 over path|baseHash|reason|expires with APEX_SIGNOFF_KEY>" }
```

- Created only by `apex signoff <path> --reason "..."`, which needs `APEX_SIGNOFF_KEY` in the environment and a real terminal for the confirmation prompt. The key exists only on Jeremy's machine. A cloud agent session does not have it, so in cloud sessions red paths are simply not editable and the agent must propose the change instead.
- The hook verifies the signature with the same key. With no key present, every sign-off is invalid (fail closed).
- Valid for 48 hours and for the file content it was made against. `.apex/signoff/` is git-ignored.

### 3.3 The other two layers

- **CODEOWNERS** lists Jeremy for every red path. Branch protection on `main`: pull requests only, one approving review from a code owner for red paths, required checks, no force pushes, no bypass for administrators' bots.
- **`protected-paths` job**: on every PR, list changed files, intersect with `.github/red-paths.txt`, and if any match, fail unless the PR has an approving review from Jeremy. It also posts the list of red files touched as the first line of the job summary. PR-Agent comments but never approves.

### 3.4 SessionStart reminder

A second small hook prints three lines at session start: the repo is paper-first, red paths need Jeremy, and where `AGENTS.md` and the design folder are. It installs nothing and makes no network call.

## 4. Other harnesses

`AGENTS.md` stays the model-agnostic entry point. The skills are plain Markdown and the MCP server is standard, so another coding agent can use them. The guard hook is Claude Code specific; other harnesses rely on the CODEOWNERS and CI layers, which is why those are the authoritative ones.

## 5. Tests

- MCP: each tool's output validates against its schema; the tool list is part of the inventory test; a contract test calls every tool against a fixture API; no tool description contains the words approve, resume, order or withdraw except in a "does not" sentence.
- Hook: table-driven tests on recorded hook inputs: a red-path edit is denied; the same edit with a valid sign-off passes; an expired, mismatched or unsigned sign-off is denied; each shell pattern is caught; a normal edit passes silently; the hook file itself is a red path.
- Skills: a lint checks front matter, that every tool named exists, and that the "never" list is present.
- `skill_scan.py` score for `plugin/` is recorded and must not drop.
