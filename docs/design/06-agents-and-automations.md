# 06. Agents, skills and automations

Agents do research, checking and reporting. They never trade. This file fixes the roster, what each one may touch, how it runs, and the schedules. It builds on `web/lib/policy.ts`, `jobs.ts`, `team.ts`, `usage.ts` and `docs/agent-safety-and-office.md`.

## 1. Ground rules

1. **Code decides, models describe.** Every verdict, status change, size and block comes from deterministic code. A model may extract rules from text, propose queue items, and write notes about numbers it is given.
2. Every agent action goes through `policy.gate()`. The audit row is written before the action.
3. An agent's output is a file in the outbox, a queue item, a job note or a notification. Nothing else.
4. Each agent has one purpose, a tool list, a model, a daily job budget and a token budget. Going over budget parks the job as `needs_you`.
5. When an agent is unsure it stops and asks one clear question with options (`needs_you`), instead of guessing.
6. All model calls go through `web/lib/gateway.ts` and count against `APEX_AI_DAILY_BUDGET`.

## 2. Roster

| Agent id | Purpose | Verbs | Model | Jobs per day | Trigger |
|---|---|---|---|---|---|
| `scout` | Find new testable rules (new archive entries, papers, Jeremy's links) and turn them into research queue proposals with a draft pre-registration | read, analyze, browse (allow-listed hosts), write_file | Sonnet 5.5 | 3 | Weekly digest cron; on new archive entry |
| `claim-extractor` | Step 2 of the claim checker: text to `ClaimExtraction` | analyze | Fable 5.2 | 30 | On claim check |
| `data-steward` | Run pulls, read firewall results, explain data problems in plain words, propose fixes (new source, re-pull) | read, analyze, notify, write_file | Haiku 5.5 for triage; code does the pulls | 24 | Hourly data health cron |
| `validator` | Run the independent re-run (code). Write a short note on any disagreement | read, analyze, write_file | none for the verdict; Sonnet 5.5 for the note | 20 | On `passed_pending_validation`; monthly; before graduation |
| `risk-officer` | Read the book, limits, drift readings and data health after every run. Pull the andon cord when a reading crosses a line. Write the risk paragraph of the report | read, analyze, notify, halt | none for the decision (rules in `andon.shouldPull`); Haiku 5.5 for the paragraph | 48 | After every run |
| `reporter` | Turn the run's `ReportData` into the daily report's AI review, the weekly digest and the Telegram summary | read, analyze, notify, write_file | Sonnet 5.5 | 4 | Daily and weekly crons |
| `code-reviewer` | Review PRs (PR-Agent in CI). Comment and suggest only | read, analyze | per PR-Agent config | per PR | GitHub Action |
| `promotion-reviewer` | The existing owner, engineer and QA chain in `review.ts`, run before a live approval can be offered | read, analyze, write_file | Fable 5.2 | 2 | On `live_eligible` |
| `playbook-distiller`, `build-buddy` | Existing helpers in `.claude/agents/` | unchanged | unchanged | unchanged | Manual |

Notes:
- `halt` is the one non-read power any agent has, and it only ever makes things safer.
- `browse` for the scout is limited to an allow-list (`arxiv.org`, `ssrn.com`, `sec.gov`, `fred.stlouisfed.org`, and hosts Jeremy adds). Fetched pages are untrusted data. The scout cannot write outside the outbox and the queue.
- The research desks on the approved install list (TradingAgents, anthropics/financial-services) run as separate paper-only programs under `bots/research-council/`, post proposals through ingest, and get no additional verbs.

## 3. How an agent job runs

```
trigger -> jobs.createJob(kind, input, risk)
        -> policy.gate({ agent, verb, trigger: 'routine' })      // budget and rule check, audit row
        -> usage.guard()                                          // daily AI budget
        -> run: load inputs through the read API -> model call (if any) -> validate output against the job's schema
        -> write output: outbox file | queue item | note | notification
        -> jobs.advance(stage: done | needs_you | failed)
```

Each job kind has a JSON schema for its output. Output that fails validation twice fails the job; nothing unvalidated is stored as a result. Agents receive numbers and identifiers, not credentials or raw env.

## 4. Automations

Schedules are UTC. "Where" is Vercel cron (V) or GitHub Actions (G). Every job takes the run lock where it writes pipeline state, is idempotent, and reports its last success on the Automations card. A job that fails 10 times in a row switches itself off and alerts (`afterRun`, existing).

| Job | Schedule | Where | Does |
|---|---|---|---|
| `data-health` | hourly at :05 | V | Pull new bars for active-slot datasets, run the firewall, update health, alert on `blocked` |
| `autopilot-tick` | every 30 minutes during US market hours, hourly otherwise | V | Budgeted run: active slots first, then new intents, fills, book, risk officer |
| `autopilot-full` | 00:30 daily | G | Full factory run over every pair, validator queue, weights, report data |
| `daily-report` | 21:30 Mon to Fri (after the US close), 00:45 Sat and Sun for crypto | V | Render and send the report |
| `validator` | on demand, plus 02:00 on the 1st of each month for every active slot | G | Independent re-runs |
| `graduation-check` | 03:00 on the 1st of each month | G | Monthly forward checks (section 8.3 of `04`) |
| `cost-model` | 04:00 on the 1st of each month | G | Update from observations |
| `ledger-anchor` | 23:55 daily | G | Commit the head hash, optional OpenTimestamps proof |
| `weekly-digest` | Sunday 18:00 | V | Scout proposals, the week's funnel and near misses, queue status |
| `data-long-pull` | 06:00 daily | G | Long daily history and pooled intraday refresh |
| `brief`, `deals`, `dream`, `strategies` | existing | V | Unchanged |
| `canary` | on every production deploy | G | Fixture run against the deployed build; compare with the golden report; alert on diff |
| `health-ping` | every 2 hours | V | Check each worker-box bot's heartbeat age and the recorder manifest; alert when stale |

Vercel's cron count and frequency depend on the plan. If the plan allows fewer jobs, `autopilot-tick` and `data-health` merge into one route that does both, and the 30-minute cadence falls back to hourly; the design does not depend on the faster cadence because signals are on 30-minute bars or slower and fills are at the next bar's open.

## 5. Skills

Skills are Markdown instructions any Claude session can follow, shipped in `plugin/skills/` (see `10`). Each one calls the Apex MCP tools or the `apex` CLI; none contains logic of its own that could disagree with the code.

| Skill | When to use | What it does |
|---|---|---|
| `apex-archive` | Jeremy sends a transcript or file | Save it word for word under `archive/`, add it to `INDEX.md`, extract rule notes, propose a claim check |
| `apex-claim-check` | "Does this strategy work?" with pasted text or a file | Queue a claim check, wait, present the verdict page in the fixed wording |
| `apex-validate` | A rule is described in conversation | Build a spec, show it, pre-register, run the gate, report |
| `apex-daily-review` | "How is Apex doing?" | Read today's report and board, summarise status, what needs Jeremy, and what changed |
| `apex-risk-check` | Before any change to limits, live flags or money code; or "is it safe to..." | Read limits, halts, book and locks; explain what a proposed change would do; never make the change |
| `apex-data-health` | Data questions or a blocked symbol | Read data health, explain, suggest the re-pull command |
| `apex-ledger` | "Prove it" | Show the receipt for a result and how to verify it |

## 6. Dashboard views for agents (built on the existing Agents tab)

- **Roster**: one card per agent: purpose, verbs, model, jobs used against budget, last run, stale-purpose warning.
- **Activity**: the audit trail in plain words; refusals show the rule.
- **Inbox**: jobs in `needs_you`, each with one question and options; snooze and settle.
- **Outbox**: files agents produced (reports, notes, proposals).
- **Automations**: the table in section 4 with last run, next run, status, and a switch (off is always allowed; on needs sign-in).

## 7. Tests

- Each agent's verbs match the roster table (a test reads the roster seed and this table's JSON twin in `packages/kernel/test/roster.json`).
- A job whose model output fails its schema is failed, not stored.
- The scout cannot fetch a host outside its allow-list.
- A routine cannot run shell, send, sign, delete or any money verb (existing tests extended to the new agents).
- Budget overrun parks the job.
- `risk-officer` pulls the cord on each reading kind and cannot release it.
