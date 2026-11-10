# Agent view and safety design (archive/chat/62–70)

These are lessons from two "pixel office" agent videos (chat/62 and 64), an agent setup walkthrough (chat/63), the OpenBot co-worker template (chat/65), a browser-control tool (chat/66) and a free coding agent (chat/67). All of it is written as our own design. Nothing was installed, downloaded or signed up for.

The videos say these tools are MIT licensed and that OpenBot needs a hosted service to run. Neither claim has been checked. Check the actual license file and the dependencies before reusing any idea at the code level. Agents have **no order, transfer, pay or withdraw tools**. That rule is built into `web/lib/policy.ts` and cannot be configured away.

## What's built now (`web/lib/policy.ts`, tested in `npm test`)

| Idea | Source | Where |
|---|---|---|
| One gateway for every agent action. Deny rules are checked first, and when nothing allows an action it is refused (default deny). | chat/65 | `decide()` |
| A rule that throws an error refuses the action instead of letting it through. | chat/65 | `decide()` |
| Every refusal names the rule that blocked it. | chat/65 | `Verdict.rule` |
| The audit row is written before the action runs. | chat/65 | `gate()` pushes to `agents:audit`, then returns |
| Money verbs (order, withdraw, transfer, pay) are always refused. | Jeremy's rules | `HARD_RULES.no-money-tools` |
| Scheduled routines and agents can't run shell commands, even when a person could. | chat/65 | `HARD_RULES.no-shell-from-routine` |
| Send, sign and delete always wait for Jeremy's yes. | chat/65 | `NEEDS_APPROVAL` |
| Secrets never reach the log; only their length is recorded. | chat/65, chat/66 | `redact()` |
| Each agent has one role, one project and one purpose. | chat/62 | `Agent` type |
| New agents start at low autonomy: one small job a day, read and analyze only. Autonomy is raised as the agent earns trust. | chat/64 | `newAgent()` |
| Each agent has a daily job budget and a token budget. | chat/62 | `rosterRules()` (`over-daily-budget`) |
| An agent's purpose must match the tools it has now. When the tools change, it is flagged as stale so it doesn't keep refusing work it can now do. | chat/63 | `purposeStale()` |
| A routine switches itself off after 10 failures in a row, and runs no more often than every 15 minutes. | chat/65 | `afterRun()` |
| New agents default to **ask for approval**, never full access. Only reads and analysis skip the ask. | chat/70 | `Agent.approval`, `asks()` |
| A scheduled run is skipped while the last one is still going. | chat/70 | `shouldRun()` |
| Imported routines arrive paused, with connections off until Jeremy approves them. | chat/70 | `imported()` |
| Debug agent: finds every error, explains each in plain English, fixes it, and ends with how to check the fix. | chat/67 | `.claude/agents/build-buddy.md` |

## Agent view on the dashboard (to build next)

- **One card per agent** showing role, project, purpose, tools, the model it runs on, jobs used today against its budget, and a "purpose stale" warning.
- **Activity list**: the audit trail in plain words, showing what was allowed, refused or failed. Each refusal shows the rule that stopped it.
- **Outbox**: finished work saved as real files, such as reports and drafts, ready for Jeremy to open.
- **Night shift**: agents keep working while Jeremy is away, but only within each agent's limits. Everything is logged. If an agent isn't sure what to do, it parks the job as "needs you" with one clear question and options, instead of guessing.
- **Shared memory**: every agent reads and writes the same memory store (`web/lib/memory.ts`), so one agent doesn't redo another's work.
- **Health check**: a cheap scheduled check on long-running jobs, such as paper bots and local training. It restarts a stuck job and reports back. Weekly summary on Telegram.
- **Read-only by default**: before building on a balance or analytics connector, check it with a harmless read and confirm what it can actually do.
- **Backend APIs over screen control**: use an API when one exists. Controlling the screen costs far more tokens.

## Browser control, for later (needs Jeremy's yes on Remote Control first)

These ideas from chat/66 could help with the TradingView or dashboard checks:

- Hand the tab back to Jeremy at every login, 2FA or payment step. Only his real click continues the run.
- Lock each session to a list of allowed sites.
- Store a site secret that is typed into the page without the agent ever seeing it, and only on the site it belongs to.
- Save network captures with credentials replaced.
- Keep a flight recorder of the last minute, saved when something breaks.

Do not use the tool's anti-bot-detection features on exchanges or brokers. That likely breaks their terms. Never automate a payment or withdrawal step.

## More rules from chat/70 (for when agents get real tools)
- Each bot keeps its own memory as markdown files. Only a capped slice (about 200 lines or 24 KB) loads into each turn. Older notes move to an archive and are never silently dropped. Secrets are turned into a redacted marker before anything is written, which is the same rule as `looksSecret` in `web/lib/memory.ts`.
- Tokens come only from files or environment variables, never from command-line flags. Other programs can read flags.
- Any MCP server Apex exposes can list jobs and send work, but it can never approve requests, delete anything or touch credentials.
- Never expose an agent or harness port directly to the internet. Use a private tunnel (for example Tailscale) with pairing.
- When a team is exported, chat history, keys, model choices and machines never go in the export file.

## Models
- **Model-agnostic** (chat/68): skills, instructions and tool config live in the repo (`AGENTS.md`, `.claude/agents/`, `docs/`). That way Claude, DeepSeek, Ollama or NVIDIA can all run the same tasks. `web/lib/gateway.ts` stays the one file that calls a provider.
- **Routing** (chat/69, `web/lib/router.ts`, tested): an ordered model list with priority or round-robin fallback. A model that errors or hits a rate limit is skipped for 5 minutes. There is an optional free-models-only mode, and each key has its own spend cap. The usage view is the existing AI spend page (`web/lib/usage.ts`). Wiring the router into the dashboard chat waits until Jeremy picks the extra providers. NVIDIA NIM is a good fit for that pick, but check its license and free-tier terms first; they are the provider's and can change.

DeepSeek V4.1 Flash is described in chat/67 as free inside Open Code, with fair-use limits. It is noted as one more option for Jeremy's pending model choice, alongside Ollama and NVIDIA. Apex stays on Claude until he decides.

The site cloner from chat/67 was deliberately not built, because it copies other sites' layouts.

## Inbox, webhooks and limits (chat/72)
These ideas come from a multi-harness coding app video. Nothing was installed, and its license has not been checked. The sponsor segment is an ad.
- **Inbox view** of bots and agent jobs. Each item can be settled, snoozed until a set time, or auto-settled when its PR merges or its job finishes. Items for a job that is still running stay hidden until there is something to look at.
- **Webhook-triggered jobs**: an incoming webhook (for example a TradingView alert) starts a job. Every payload is saved so the job can be replayed later with the same input. Payloads go through `redact()` before they are stored, and a webhook can only start read or analyze work. It can never place an order.
- **Load balancing across machines**: when more than one machine can run a job, send it to the least busy one that is healthy. This extends `web/lib/router.ts`, which already skips a model that errors.
- **Usage and limits tab**: each provider's current usage, its limit and when the limit resets, next to the AI spend page (`web/lib/usage.ts`).
- **Queued follow-up**: when a provider hits its rate limit, the follow-up waits in a queue and runs once the limit resets, instead of failing or retrying in a loop.
- **Triage command**: one command bundles the recent logs, the audit rows, versions and the failing check into a single file for debugging. Secrets are redacted before anything is written.
