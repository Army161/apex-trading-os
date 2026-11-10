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
- `web/`: the Next.js dashboard and the TypeScript strategy engine (`web/lib/engine/`).
- `bots/`: Python paper bots.
- `docs/`: how-tos and design notes. Start with `docs/how-to-direct-apex-agents.md`, `docs/agent-safety-and-office.md` and `docs/validation-results.md`.
- `.claude/agents/build-buddy.md`: the debug helper prompt. It is plain markdown, so any agent can use it.
- `web/lib/gateway.ts`: the only file that calls a model. Switching providers is a change to that one file.

## Checks before you say you're done
```
cd web && npx tsc --noEmit -p . && npm test
```
