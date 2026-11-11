# Instructions for any coding agent working on Apex

These are model-agnostic (archive/chat/68). Claude Code, OpenCode, Codex, or a local model running through Ollama or DeepSeek should all read this file first. Skills, instructions and tool config live in the repo, not in any one vendor's app.

## Hard rules
- Every bot starts in **paper** mode. Going live is Jeremy's call alone.
- Agents have **no order, transfer, pay or withdraw tools**. `web/lib/policy.ts` refuses those actions with a rule no config can remove.
- Never ask for keys in chat, and never commit, log or print them. Keys live in environment variables that Jeremy sets himself.
- Never put Jeremy's email or other personal details in configs or outside requests. SEC requests use the `SEC_USER_AGENT` environment variable.
- Don't clone video repos, install their tools, or sign up for paid services unless Jeremy asks. Check the license first.
- Never copy AGPL or GPL code (Fincept, Honcho), and never clone another product's look.
- Be honest about results. A backtest with fewer than 50 trades is flagged. A strategy only counts as having an edge if it beats 95% of random traders (the monkey test), makes money on locked test data, and survives fees (`web/lib/engine/validate.ts`).

## Where things are
- `archive/`: every transcript Jeremy sent, word for word. `archive/INDEX.md` lists them.
- `web/`: the Next.js dashboard. The strategy engine now lives in `packages/engine`; `web/lib/engine/` re-exports it.
- `packages/`: the autopilot core (engine, kernel, data, store, autopilot). Read `packages/README.md` and its Invariants first.
- `apps/proof/`: the product (the claim checker as a service), a separate business with its own deployment and keys. It shares seven packages with the rest and nothing else. Read `apps/proof/README.md` first; `node tools/separation_check.mjs` holds the line and runs as a test.
- `apps/cli/`: the `apex` command (`npm run apex -- help`) and the code the nightly paper run uses.
- `packages/mcp`: the MCP server (`apex mcp` over stdio, `/api/mcp` on the dashboard). It can read, start a claim check and pull the halt, and nothing else. `mcp-server/` is the old Python one.
- `.github/red-paths.txt`: paths that need Jeremy's review. They never auto-merge.
- `bots/`: Python paper bots.
- `docs/`: how-tos and design notes. Start with `docs/how-to-direct-apex-agents.md`, `docs/agent-safety-and-office.md` and `docs/validation-results.md`.
- `plugin/`: the Claude Code plugin. Seven skills (`plugin/skills/`), three commands, three agent prompts (`plugin/agents/`, with the debug helper `build-buddy.md`), the MCP server and the guard hook. All plain markdown, so any agent can read them.
- `web/lib/gateway.ts`: the only file that calls a model. Switching providers is a change to that one file.

## Before you change a folder
Read its README.md first. The `## Invariants` section lists rules that must stay true. For big or risky features, follow the design-doc and fresh-eyes review steps in `docs/how-to-direct-apex-agents.md` (chat/74).

## Checks before you say you're done
```
npm run typecheck && npm test
npm run apex -- strategies fingerprint --check
python3 -m pytest -q
python3 tools/drift_check.py && node tools/protected_paths.mjs --self-check
```
