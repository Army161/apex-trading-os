# Apex plugin for Claude Code

A skeleton for now. It installs two hooks and nothing else. Skills, commands and the MCP server arrive with phase 4 (`docs/design/10-mcp-plugin-skills.md`).

## What it does

| Part | What happens |
|---|---|
| Guard hook (`hooks/guard.mjs`, rules in `tools/guard_hook.mjs`) | Before an agent edits a file or runs a shell command in the Apex repo, the hook checks it. An edit to a red path is refused unless Jeremy signed off on that file. Writing a key into a file, setting a live-trading flag, editing `ledger/heads/`, deleting a migration, pushing to `main` and merging a pull request that touches red paths are always refused. |
| Session reminder (`hooks/session_start.mjs`) | Prints three lines when a session starts: paper first, red paths need Jeremy, where to start reading. |

## What it cannot do

- It holds no key and has no tool that can trade or move money.
- It cannot approve anything. A sign-off is made only by Jeremy with `apex signoff <path> --reason "..."`, on a machine that holds `APEX_SIGNOFF_KEY`, at a real keyboard. A cloud session has no key, so in a cloud session red paths cannot be edited at all.
- It is not the lock. A determined shell command can get around the command check. The layers that decide are CODEOWNERS with branch protection and the `protected-paths` check. This hook stops the ordinary case early and tells the agent what to do instead.

## Invariants

- The hook fails closed: an input it cannot read, or rules it cannot load, means the call is refused.
- No sign-off is valid without `APEX_SIGNOFF_KEY`. A sign-off covers one file, the exact content it was made against, for at most 48 hours.
- Keys, live flags and `ledger/heads/` have no sign-off.
- `tools/guard_hook.mjs` and `plugin/hooks/` are red paths themselves.
- The hooks make no network call and install nothing.

## Install

From the repo root, in Claude Code: add this folder as a local plugin (`/plugin`, then add a marketplace that points at this repo, or run with `claude --plugin-dir plugin`). Scan it first, like any plugin: `python3 tools/skill_scan.py plugin`. The last result is in `plugin/SCAN.json`.

## Tests

`apps/cli/test/guard_hook.test.ts`: a table of recorded hook inputs, the sign-off cases, and a check that the hook verifies a sign-off made by `apex signoff`.
