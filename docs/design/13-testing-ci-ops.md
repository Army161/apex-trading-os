# 13. Verification, CI and operations

Nothing ships that breaks the honesty checks. This file specifies the pipelines, the test layers, monitoring and the runbooks. Repo: `github.com/Army161/apex-trading-os` (private).

## 1. Test layers

| Layer | What | Where | Runs |
|---|---|---|---|
| Types | `tsc --noEmit` across workspaces | all packages | every PR |
| Unit | Kernel, engine, autopilot, data, claims, store (memory driver) | `packages/*/test` | every PR |
| Existing self-test | `web/lib/engine/selftest.ts` (kept; split into the packages over time) | `npm test` | every PR |
| Python | `engine/` and `bots/` pytest | `pytest -q` | every PR |
| Parity | TS and Python engines agree on the fixture (`parity.json`); paper broker equals `backtest()`; guard vectors agree in TS and Python | CI job `parity` | every PR |
| Look-ahead | Every strategy and every DSL operand: changing bars after `i` must not change the signal at `i` | CI job `lookahead` | every PR |
| Fingerprints | Strategy and engine fingerprints match the committed file; locked strategies unchanged | CI job `fingerprints` | every PR |
| Golden files | Report templates, verdict pages, CLI output, API fixtures | `test/golden` | every PR |
| Database | Migrations apply to an empty Postgres; append-only triggers hold; projections equal a ledger replay | CI job `db` with a Postgres service container | every PR |
| Invariants | `tools/drift_check.py` (S1 to S17 where checkable), route and tool inventory, red-path config, license check | CI job `invariants` | every PR |
| Mutation | `tools/mutate.py` on `packages/kernel` and `packages/engine/src/validate.ts`: every mutant killed in the guard, at least 90% elsewhere | workflow `mutation` | nightly and on red-path PRs |
| UI | Playwright: every screen, both themes, 390 and 1360 wide, no page-level horizontal scroll, Halt reachable, `Metric` context present, contrast script | `npm run check:ui` | every PR touching `web/` or `packages/ui` |
| API contract | Route registry equals `openapi.yaml`; fixtures validate | CI job `contract` | every PR |
| Smoke | Every API and cron route answers on a preview deployment with the memory store and fixtures | workflow `smoke` | every preview deploy |
| Canary | A fixture autopilot run on the deployed build equals the golden report byte for byte | workflow `canary` | every production deploy |
| Statistical | 500 no-edge strategies give zero promotions; planted edge passes; drift alarm false-alarm rate in band | part of unit, tagged `slow` | nightly |

Tests never use the network. Adapters are tested on recorded responses.

## 2. Workflows

All actions pinned to commit SHAs. Minimal `permissions:` per job. No secrets on pull requests from forks.

| File | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR, push to `main` | types, unit, python, parity, lookahead, fingerprints, golden, db, invariants, contract, ui (path-filtered), protected-paths |
| `mutation.yml` | nightly, PR label `red` | mutation |
| `pr-agent.yml` | PR opened or updated (same-repo branches only) | PR-Agent describe and review; comments only |
| `smoke.yml` | Vercel preview ready | smoke |
| `canary.yml` | Vercel production ready | canary; on failure: Telegram alert and an automatic `apex halt "canary failed"` |
| `autopilot-full.yml` | 00:30 UTC daily, manual | `apex run --full`; uploads the run summary |
| `validator.yml` | repository dispatch from the pipeline, 1st of month, manual | independent re-runs on a clean checkout |
| `monthly.yml` | 1st of month | graduation checks, cost model update, full re-validation report |
| `ledger-anchor.yml` | 23:55 UTC daily | commit `ledger/heads/…`, optional OpenTimestamps |
| `data-long.yml` | 06:00 UTC daily | long-history and pooled pulls |
| `secret-scan.yml` | PR, push | secret scanning; block on a finding |

**GitHub secrets** (Jeremy sets them; none can trade): `DATABASE_URL` (a role limited to the pipeline's tables), `APEX_STORAGE_URL` and key, `MASSIVE_API_KEY`, `ALPACA_API_KEY` and secret for **data and paper only**, `TIINGO_API_KEY`, `ANTHROPIC_API_KEY` (validator notes and PR-Agent), `TELEGRAM_BOT_TOKEN` and chat id, `APEX_DASHBOARD_URL`, `CRON_SECRET`. The `invariants` job fails if a workflow references any variable matching a live-trading name.

**Branch protection on `main`:** PRs only; required checks are every `ci.yml` job; one approving review from a code owner when red paths are touched; linear history; no force push; bots cannot approve.

**Blast radius labels**, applied by a small action from the changed paths: `green` (docs, archive, tests, UI text) may merge when checks pass; `yellow` (strategies, data, dashboard, agents) needs PR-Agent's review read and checks; `red` (the red-path list) needs Jeremy. Nothing auto-merges into red paths, whatever the labels say.

## 3. Environments

| Environment | Database | Data | Purpose |
|---|---|---|---|
| Local | memory driver or a local Postgres | fixtures | development |
| Preview (per PR) | memory driver | fixtures | smoke and UI checks; shows a "preview, fixtures" banner; crons off |
| Production (personal) | Supabase `apex` | real | the running system, paper |
| Product (later) | separate Supabase project | licensed | `12` |

Migrations run in CI against a scratch database and are applied to production by a manual workflow that Jeremy starts (they are red paths). Every migration is forward-only with a written rollback note.

## 4. Observability

- **Runs table and Automations card**: every job's last start, finish, status and duration.
- **Heartbeats**: bots and the recorder post to ingest; `health-ping` alerts on stale ones.
- **Structured logs**: one JSON line per pipeline step with run id, counts and durations; secrets redacted. Vercel log drains are enough to start.
- **Alerts** (Telegram): halt pulled; canary failed; ledger verify failed; run failed twice in a row; data blocked on an active slot; validator disagreement at L1; AI budget reached; database unreachable; anchor missed.
- **Triage bundle**: `apex doctor --bundle` writes one redacted file with recent logs, the last run summary, versions, config presence (not values) and the failing check.
- **Service levels** (personal, modest): daily report delivered by 22:30 UTC on market days; active slots re-checked at least daily; ledger anchored daily.

## 5. Runbooks

Short pages in `docs/runbooks/`, each with: how you notice, what is safe to do first, steps, how to confirm it is fixed, what to write in the ledger. To be written during the build:

| Runbook | Core of it |
|---|---|
| `halt-and-resume.md` | Halt from anywhere; what each level stops; resume only from the dashboard after reading why it was pulled |
| `data-outage.md` | Symbol blocks itself; check the second source; re-pull; never fill gaps; when to mark a dataset retired |
| `run-failed.md` | Read the run summary; the lock releases after 15 minutes; replay with `apex run --dry-run`; the pipeline is idempotent |
| `ledger-verify-failed.md` | Stop the pipeline (andon); find the first bad `seq`; compare with the last anchor in git; restore from backup; never edit entries; write an incident note |
| `validator-disagrees.md` | L1 disagreement is a bug: halt the autopilot and diff inputs; L2 is a data difference: open both versions and the firewall report |
| `drift-pause.md` | Read the readings; wait for the validator; resume or retire |
| `restore.md` | Supabase point-in-time restore; re-verify the chain; replay projections |
| `rotate-keys.md` | Which key lives where; rotate API keys, ingest token, cron secret, model key; nothing to rotate on Vercel for trading because none is there |
| `going-live.md` | `02` section 10 |
| `incident-template.md` | What happened, impact, timeline, cause, what changes (applying the inverse pyramid from `how-to-direct-apex-agents.md`) |

## 6. Backups and retention

- Postgres: provider point-in-time recovery plus a nightly logical dump of `ledger` to the object store (the ledger alone can rebuild the rest).
- Object store: versioned; bars and reports are immutable.
- Git: the anchored heads make silent ledger rewrites detectable.
- Retention: ledger, trials, fills, reports kept forever. Agent audit rows and logs 180 days. Claim-check inputs kept until deleted.

## 7. Definition of done for any change

1. A spec in `docs/specs/` for anything beyond a small fix, with its tests listed first.
2. Tests written before or with the code; all CI jobs green.
3. Folder README invariants still true (`drift_check.py`).
4. For yellow and red changes: PR-Agent review read; for red: Jeremy's review.
5. For UI: `check:ui` green and a screenshot in the PR.
6. A changelog line in `docs/CHANGELOG.md`.
7. No new dependency without a license check and a reason in the PR.
