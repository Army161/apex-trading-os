# How to direct Apex agents

One page on getting good work out of Claude (in Claude Code, Cowork or this project) when you ask it to build or change
something in Apex. Based on archive/chat/34. Small asks (rename a button, fix a typo) skip straight to step 4.

## 1. Say the outcome, not the task
Say what the change has to make happen, and what must not change.
- Weak: "Add a Solana bot page."
- Strong: "I want to see each Solana copy-bot wallet's paper P&L from my phone, without touching the bot's own settings."

**Ask Claude:** "Interview me until you know what this must help me do. Play the outcome back to me and wait for my OK."

## 2. Agree a short spec
Claude asks about the goal, who uses it, limits, edge cases, and any decision it would otherwise make alone. The spec
lists goals, requirements, non-goals and open questions. Keep it short for small work.
In Apex, specs live in `docs/specs/` (example: `2026-11-10-trader-rules-red-team-tags.md`).

**Ask Claude:** "Before you build, ask me about goals, limits and edge cases, then write a short spec in docs/specs and wait."

**Always in the spec, for Apex:**
- Paper mode first.
- At most 1% risk per trade.
- A stop on every trade.
- Keys only in env vars, never in chat.
- No copying other products' code or look.

## 3. Turn the spec into tests before building
Every requirement becomes something Claude has to try. For example:

| Requirement | Test |
|---|---|
| Live flag needs a review | Flagging live without one is refused |
| Rules save needs login | Saving rules logged out returns 401 |

Apex already runs these checks:
- `cd engine && pytest`: engine tests.
- `cd web && npm test`: the self-test.
- `npm run check:ui`: every tab in a real browser, desktop and phone.

**Ask Claude:** "Write the test plan first. Run every test before you tell me it's done, and show me the results."

## 4. Build in checkpoints
Big work gets split into steps. Each step has one piece of work, its test, and a stop point where you choose
**keep going**, **change direction** or **stop**. This catches a wrong turn after one step, not after three hours.

**Ask Claude:** "Split this into checkpoints. Stop after each one and tell me what works."

## 5. Save each working checkpoint in Git
A commit is a save point you can go back to.
- **commit:** save a working version.
- **restore / revert:** go back to it.
- **push:** copy your commits to GitHub.

You don't need to type the Git commands yourself.

**Ask Claude:**
- "Commit this working version."
- "Show me the timeline of versions and what changed."
- "Undo back to yesterday's working upload."
- "Push to GitHub."

Apex has local commits for every checkpoint. They go to GitHub as soon as the `apex-trading-os` repo exists.

## Extra habits that pay off here
- **Get a second opinion on big calls.** A strategy must pass the owner, engineer and QA review before it can be flagged live.
- **Red-team trades.** Use the "Red team it" button in Risk Mitigator: it argues against the trade, then names the one thing that would change its mind.
- **Fill in your rules once.** The Journal interview writes down how you decide trades, and the AI tools follow it.
- **Trust tags.** Research numbers come tagged [verified], [unverified] or [suspicious]. Act only on verified ones.
- **Scan before you install.** Run `python tools/skill_scan.py <folder>` on any new skill or MCP server. Give AI tools one test folder before anything wider.
- **Watch the spend.** Setup shows today's AI spend. Also set a monthly limit in the Anthropic Console.

## Orchestrator and workers, blast radius, inverse pyramid (archive/chat/71)
- **The orchestrator plans and checks. Coding agents do the work.** Any job longer than a short question is handed to a coding agent along with an **acceptance test**. The orchestrator checks the proof, opens a pull request and reports back. The job board (`web/lib/jobs.ts`) and agent team (`web/lib/team.ts`) already follow this shape.
- **Score every change by blast radius** before it merges:
  - **Green**: docs, archive, UI text and tests. These can merge after checks pass.
  - **Yellow**: strategy logic, backtests and the dashboard. These need AI review plus the self-tests.
  - **Red**: anything touching trading, orders, keys, money, risk checks or the paper/live switch. These **never auto-merge** and always wait for Jeremy's review.
- **The inverse pyramid.** When the same mistake happens twice, fix it as high up this list as possible:
  1. In the code, so the easy path is the right path: types, a single gateway, pure functions.
  2. In a deterministic check: a lint rule, a self-test in `npm test`, or CI.
  3. In a rules file: `AGENTS.md` or a skill.
  4. Human review comes last, because it doesn't scale.
- **Lock the doors.** Agents run sandboxed with scoped credentials, read-only wherever possible. They open PRs but never merge them. Bots never share a machine that holds another bot's logins. Controls live in the environment, not in the agent's good intentions.
- **Backlog triage.** Score with RICE (reach × impact × confidence ÷ effort) and use the blast-radius colour as a tie-breaker: at the same score, green work goes first. Don't let a bot fill the backlog just because it can, and don't run hourly context-farming routines. They burn tokens.
- The orchestrator tools in the video (Grockbot, T3 Code) and the sponsor plug (a hosted database) are not used. Nothing was installed.

## Plan big features with a fresh-eyes review (chat/74)
This comes from a video on Google's "elephant goldfish" planning method. Nothing was installed and its license has not been checked. The sponsor segment is an ad.

**When to use it:** only for big or risky work, such as anything on a live-trading path, the risk engine, the policy gateway or key handling. Skip it for small fixes an agent can finish in one go, because the extra planning just slows those down.

1. **Design doc first** (the "elephant", the agent that knows the whole chat). Write it in `docs/specs/`. It covers the problem, what's in and out of scope, the main user journeys with a test for each, the technical plan, the alternatives considered and why they lost, and a step-by-step build list.
2. **Goldfish review.** Fresh sub-agents read only the doc and the code, never the chat, so nothing said earlier can talk them out of a finding. Each one takes a single angle:
   - **Simpler path:** is there an easier way, or does Apex already have something that does this?
   - **Outsider read:** does the doc make sense to someone who knows nothing about Apex?
   - **Scale and failure:** what breaks under load, bad data, a dead exchange or a restart?
   - **Buildability:** could a model build it from the doc without guessing?
   One coordinating agent merges their notes into a single report. Jeremy makes the final calls and keeps what's useful.
3. **Folder READMEs hold the invariants**, the rules that must always stay true. Examples: `bots/README.md` ("bots start in paper; live needs `APEX_ALLOW_LIVE=yes`", "no withdraw or transfer tools") and `web/lib/README.md`. Agents read the README of every folder they work in (see `AGENTS.md`).
4. **Drift check.** `python3 tools/drift_check.py` compares the code against those invariants and exits with an error when they no longer match. Its first run caught a real gap: the Polymarket copy bot could go live without the `APEX_ALLOW_LIVE=yes` second switch. That is fixed now.
