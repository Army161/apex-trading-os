# Apex plugin for Claude Code

Skills, commands, agent prompts, the MCP server and the guard hook for working on Apex with Claude Code. Design: `docs/design/10-mcp-plugin-skills.md`.

## What it installs

| Part | What it is |
|---|---|
| Skills (`skills/`) | Seven sets of instructions: `apex-archive`, `apex-claim-check`, `apex-validate`, `apex-daily-review`, `apex-risk-check`, `apex-data-health`, `apex-ledger`. They hold no logic and no numbers. Each one says which Apex tools or `apex` commands to call, in what order, the wording to use, what to do when a call fails, and what never to do |
| Commands (`commands/`) | `/apex-status`, `/apex-report`, `/apex-check` |
| Agents (`agents/`) | `build-buddy` (debug helper), `playbook-distiller` (transcripts into testable rules), `goldfish-reviewer` (fresh-eyes review of a design doc; it only reads) |
| MCP server (`.mcp.json`, `mcp.mjs`) | Starts `apex mcp` over stdio from the repo this folder sits in. It reads the local ledger and can record a halt. In local mode it cannot start a claim check; the claim check skill uses the `apex claim` command there |
| Guard hook (`hooks/guard.mjs`, rules in `tools/guard_hook.mjs`) | Before an agent edits a file or runs a shell command in the Apex repo, the hook checks it. An edit to a red path is refused unless Jeremy signed off on that file. Writing a key into a file, setting a live-trading flag, editing `ledger/heads/`, deleting a migration, pushing to `main` and merging a pull request that touches red paths are always refused |
| Session reminder (`hooks/session_start.mjs`) | Prints three lines when a session starts: paper first, red paths need Jeremy, where to start reading |

## What it cannot do

- It holds no key and has no tool that can trade or move money. The MCP server has no tool to approve, resume, retire, change a limit or open a lock.
- It cannot approve anything. A sign-off is made only by Jeremy with `apex signoff <path> --reason "..."`, on a machine that holds `APEX_SIGNOFF_KEY`, at a real keyboard. A cloud session has no key, so in a cloud session red paths cannot be edited at all.
- The hook is not the lock. A determined shell command can get around the command check. The layers that decide are CODEOWNERS with branch protection and the `protected-paths` check. This hook stops the ordinary case early and tells the agent what to do instead.

## Invariants

- A skill is instructions only. Every number comes from a tool or the `apex` command, and a skill file carries no figures.
- Every skill has the same five sections (what it is for, steps, wording, if a call fails, never) and its never list covers: never approve, never edit a limit, never a figure without its n and tag, never call an untested rule a signal.
- A skill, command or agent names only tools, commands and skills that exist. The lint fails otherwise.
- The hook fails closed: an input it cannot read, or rules it cannot load, means the call is refused.
- No sign-off is valid without `APEX_SIGNOFF_KEY`. A sign-off covers one file, the exact content it was made against, for at most 48 hours.
- Keys, live flags and `ledger/heads/` have no sign-off.
- `tools/guard_hook.mjs` and `plugin/hooks/` are red paths themselves.
- The hooks and the launcher make no network call and install nothing. `.mcp.json` passes no environment.
- The safety scan score for this folder is recorded in `SCAN.json` and must not rise.

## Install

Run `npm install` in the repo first (the MCP server needs it). Then, from the repo root in Claude Code, either:

- `claude --plugin-dir plugin`, or
- `/plugin marketplace add .` and then install `apex` from the `apex-local` marketplace (`.claude-plugin/marketplace.json` points at this folder).

Scan it first, like any plugin: `python3 tools/skill_scan.py plugin`. The last result is in `SCAN.json`.

To let a Claude app read a deployed dashboard instead of a checkout, add `<dashboard address>/api/mcp` as a connector with an Apex API key made on You, Setup.

## Tests

- `apps/cli/test/plugin.test.ts`: the skill lint, the "does not" check on every line that mentions approving, resuming or going live, the commands and agents, and a real start of the MCP server through `mcp.mjs`.
- `apps/cli/test/guard_hook.test.ts`: a table of recorded hook inputs, the sign-off cases, a check that the hook verifies a sign-off made by `apex signoff`, and the scan score.
