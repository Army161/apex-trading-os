# 02. Safety, permissions and the live switch

Everything in this file is red blast radius. Changes to the code it describes never auto-merge and always wait for Jeremy.

## 1. The one principle

**Safer is easy from anywhere. Riskier needs Jeremy, signed in, and time.**

- Halting, pausing, tightening a limit, retiring a strategy: one tap from the dashboard, Telegram, the terminal or an agent (the risk officer can pull the andon cord).
- Resuming, loosening a limit, approving live, raising size: only Jeremy's signed-in dashboard session, with a typed confirmation, a ledger entry, and for loosening a 24-hour cooling-off before it takes effect.
- Placing a live order: only the executor on Jeremy's own machine, with his keys, after it has re-checked everything itself.

## 2. Invariants

Each invariant has an enforcement point in code and a test. `tools/drift_check.py` and the kernel tests fail the build when one stops being true. The folder READMEs repeat the ones that apply to that folder.

| # | Invariant | Enforced by | Test |
|---|---|---|---|
| S1 | Every bot and every strategy starts in paper | `Slot.mode` has no default other than `paper`; broker factory returns the paper broker unless all four live locks pass | Kernel test: every lock combination except all-open returns paper |
| S2 | Agents have no order, withdraw, transfer or pay verbs | `HARD_RULES.no-money-tools` in `web/lib/policy.ts`; MCP and API expose no such route | Existing policy tests; route inventory test (section 8) |
| S3 | Live needs four locks; two only Jeremy can open; one only on his machine | `packages/kernel/src/locks.ts`, executor | Lock matrix test; executor refuses without a valid signature |
| S4 | No trading key on Vercel or in GitHub | Config schema rejects `*_SECRET_KEY` style broker variables in the web app when `ALPACA_LIVE` or any live flag is set; Setup shows a red banner | Config test; drift check greps workflow files and `vercel.json` |
| S5 | Every order intent passes the risk guard, and size is computed nowhere else | Only `guard.checkIntent` returns a quantity; the broker interface accepts a `GuardedIntent` type that only the guard can construct (branded type) | Type-level test; mutation tests on the guard |
| S6 | Every trade has a hard stop on the correct side | Guard rule `stop-required` | Guard tests |
| S7 | No leverage | `maxNotional` is the constant 1 and is not read from configuration | Guard test; drift check |
| S8 | Hard ceilings cannot be raised by configuration | Ceilings are constants in `guard.ts`; env values are clamped | Existing clamp behaviour, tested |
| S9 | The ledger is append-only and every result has a pre-registration made before it | DB grants and trigger; `ledger.append` checks the chain; `trial_result` requires a `prereg` id with an earlier sequence number | Ledger tests; DB migration test tries `UPDATE` and expects an error |
| S10 | Every try is counted, forever | `trials` is append-only; trial count is read from the ledger, never from mutable state | Test: re-running a pair does not add a trial; a changed parameter does |
| S11 | A strategy is judged only on bars after its lock | Incubator zeroes entries before `lockedAt`; lock hash covers code, parameters, dataset id, gate version and cost model version | Incubator tests; changing any hashed input changes the hash |
| S12 | Bad data blocks trading for that symbol | Firewall verdict `blocked` is an input to the guard | Guard test |
| S13 | Money code never auto-merges | CODEOWNERS on red paths, branch protection, `protected-paths` CI job, plugin guard hook | CI config test in `drift_check.py` |
| S14 | Secrets never reach logs, the ledger, reports or model prompts | `redact()` on every write path; ledger payload schema has no free-text field that takes env values | Redaction tests with planted keys |
| S15 | Honest reporting: no performance number is shown without its sample size, cost basis and in-sample or forward tag | `Metric` type carries those fields; UI components take a `Metric`, not a number | Component tests; golden report files |
| S16 | No AGPL or GPL code in the repo | License check in CI on dependencies; `AGENTS.md` rule | `license-check` job |
| S17 | Untrusted text (transcripts, web pages, PR comments, webhook bodies) is data, never instructions | Extraction calls have no tools; outputs are schema-validated; specs are interpreted, never `eval`'d; Pine is translated, never executed | Injection fixtures in the claim-checker tests |

## 3. Actors and what each may do

| Actor | Authenticates with | May | May not |
|---|---|---|---|
| Jeremy, signed in | Admin session cookie (existing), re-prompt for password on red actions | Everything in the dashboard, including approvals | Set env vars or enter keys through the dashboard (there is no such form) |
| Machine client (CLI remote, MCP, extension) | API key with scopes | Read board, ledger, reports, data health; queue a claim check or a pre-registered test | Approve, resume, change limits, see secrets |
| Cron and GitHub Action jobs | `CRON_SECRET`, service database role | Run the pipeline, write ledger entries, send reports, pull the andon cord | Approve live, loosen limits |
| Agents | Policy gateway roster entry | `read`, `analyze`, `write_file` (to the outbox and docs), `notify`; risk officer may also `halt` | Money verbs (hard rule), shell from routines (hard rule), `send`, `sign`, `delete` without Jeremy's yes |
| Bots on the worker box | `APEX_INGEST_TOKEN` | Post heartbeats, paper trades and events; read their command (pause, resume, kill) | Read other bots' state or any key |
| Executor (later) | Executor key plus `APEX_SIGNOFF_KEY` on Jeremy's machine | Pull approved intents, post fills | Create intents, change approvals |
| Telegram | Allow-listed chat id plus webhook secret | Read status; `/halt`; queue a claim check | Resume, approve, change anything risky |

A new verb `halt` is added to `Verb` in `policy.ts`. It is allowed for the risk officer agent and every routine. `resume` is not an agent verb at all.

## 4. Halt levels

| Level | Trigger | Effect | Who can clear |
|---|---|---|---|
| Slot pause | Drift alarm, failed re-validation, Jeremy | No new entries for that slot. Open paper position keeps its stop | Jeremy after a validator re-run, or retire |
| Symbol block | Data firewall `blocked` | No new entries on that symbol | Clears itself when data health is `ok` for two consecutive checks |
| Book pause | Daily loss, weekly loss or drawdown limit | No new entries anywhere. Daily clears at the next UTC day, weekly at the next week, drawdown only by Jeremy | Automatic for day and week; Jeremy for drawdown |
| Andon cord | Any check or the risk officer (`web/lib/andon.ts`, existing) | Every bot is told to pause | Jeremy |
| Kill switch | Jeremy | Everything stops; bots exit | Jeremy |

Fail-closed rule: if the pipeline cannot read the halt flags (Redis and Postgres both unreachable), it behaves as if the kill switch is on.

## 5. Risk limits and how they change

Defaults and ceilings (ceilings are code constants):

| Limit | Default | Ceiling | Env var |
|---|---|---|---|
| Risk per trade | 1% of equity | 2% | `APEX_RISK_PCT` |
| Open positions | 5 | 20 | `APEX_MAX_OPEN` |
| Positions per symbol | 1 | 3 | `APEX_MAX_PER_SYMBOL` |
| Daily loss stop | −2% | −5% | `APEX_DAILY_LOSS_PCT` |
| Weekly loss stop | −5% | −10% | `APEX_WEEKLY_LOSS_PCT` |
| Drawdown pause | −15% | −25% | `APEX_MAX_DRAWDOWN_PCT` |
| Notional per position | 1× equity × weight | 1× (constant) | none |
| Weight per strategy | 25% | 40% | `APEX_MAX_WEIGHT_PCT` |
| Exposure per asset class | 60% of open risk | 100% | `APEX_MAX_CLASS_PCT` |
| Correlated open risk (pairwise ρ > 0.7) | 2% of equity combined | 4% | `APEX_MAX_CORR_RISK_PCT` |
| Cool-down after a stopped-out trade, same slot | 1 bar of that slot's timeframe | none | `APEX_COOLDOWN_BARS` |

Change policy: limits live in env vars (so the dashboard cannot loosen them) and the effective values are written to the ledger at every run (`config_snapshot`). When a run sees a value looser than the previous snapshot, it keeps using the previous value for 24 hours, reports the pending change, and only then adopts it. A tighter value applies at once. This gives the "cool down" rule from the psychology material teeth: a limit cannot be raised in the heat of a loss.

## 6. The live switch: four locks

Live trading is off. The design below is what "on" would require. Nothing in Phases 0 to 5 turns it on.

| Lock | Opens when | Who or what opens it | Where it is checked |
|---|---|---|---|
| **1. Evidence** | The slot is `live_eligible`: six or more months of forward paper that held up and the strict gate passed on the forward record (see `04` section 8) | Code, from the ledger | `locks.evidence(slot, ledger)` |
| **2. Independent check** | Two agreeing validator runs for the promotion, a fresh validator run on the forward record, and the owner, engineer and QA review chain (`web/lib/review.ts`) with no blocking issue | Validator job and review chain | `locks.validated(slot, ledger)` |
| **3. Jeremy's approval** | Jeremy opens the slot's Live panel, reads the checklist, types the slot name, re-enters his password. The approval names a stage (micro-live first), a size cap and an expiry (default 90 days) | Jeremy, signed in | `locks.approved(slot, ledger, now)` |
| **4. His machine** | The executor runs on his machine with `APEX_ALLOW_LIVE=yes`, the broker's own live flag, his trade-only keys, and a local signature over the approval made with `APEX_SIGNOFF_KEY` (`apex live sign <slot>` asks him to confirm in the terminal) | Jeremy, on his machine | Executor, before every order |

`liveAllowed()` returns `{ allowed, locks: [{ id, open, why }] }`. The dashboard shows the four locks exactly as that function reports them. There is no button that opens lock 4, and the UI says so.

### Stages after the locks open (idea 8)

| Stage | Size | Stays until | Then |
|---|---|---|---|
| `micro_live` | 1% of the paper-sized risk (so 0.01% of equity at the default), fractional shares where the venue allows, otherwise the minimum order | 30 live trades or 3 months, whichever is later | Scale check |
| `live_10` | 10% | 30 more trades | Scale check |
| `live_50` | 50% | 30 more trades | Scale check |
| `live_100` | Full paper size | Ongoing | Monthly re-validation |

A scale check passes when: the live per-trade R matches the paper per-trade R for the same signals within the tolerance in `04` section 11, measured cost is within 1.5× the cost model, no drift alarm fired, and Jeremy approves the next stage (lock 3 again, new ledger entry). Any failure sends the slot back to `paper`. Live and paper run side by side for the same slot at every stage, so the comparison is always available.

### The executor (designed now, built only when a slot reaches lock 3)

A small Node process in `apps/executor/`, run only on Jeremy's machine. It is the only code that ever holds live keys.

For every approved intent it pulls from the outbox it does the following, in order, and stops at the first failure:
1. Verify the ledger chain from the last anchored head to the approval entry, and the local signature (lock 4).
2. Check the halt flags. If the dashboard is unreachable, treat as halted.
3. Check the intent id (`sha256(slot key, bar time, side)`) has not been sent before (local journal plus broker client-order-id).
4. Reconcile: broker positions and open orders must match the live book. Any mismatch pulls the andon cord and sends a Telegram alert.
5. Re-run `guard.checkIntent` with the broker's actual equity and the stage's size multiplier.
6. Place a bracket order: entry plus a hard stop resting at the broker, so the stop survives the executor dying.
7. Post the fill back through the ingest route. The pipeline writes it to the ledger.

The executor shares the `Broker` interface with the paper broker, so its logic is tested from Phase 1 with a fake broker. The live adapter itself is not written until it is needed.

## 7. Threat model

| Threat | Path | Mitigation |
|---|---|---|
| Prompt injection | A transcript, Pine script, web page or PR comment tells a model to do something | S17. Extraction and review calls get no tools. The only output accepted is a schema-valid spec or note. Agents that read the web cannot write outside the outbox |
| Luck sold as skill | Many tries, best one shown | Ledger counts every try (S10), deflated Sharpe, pre-registration (S9), forward-only judgment (S11) |
| Quiet loosening | An agent or a tired human edits a limit, the gate or a live flag | Ceilings in code, 24-hour loosen delay, CODEOWNERS, guard hook, CI protected-paths job, config snapshots in the ledger |
| Key leak | Key in chat, log, repo or prompt | Keys only in env vars Jeremy sets; `redact()`; secret scanning in CI; trade-only keys with withdrawals off and IP lock at the venue; no trading key on Vercel or GitHub (S4) |
| API key leak | A machine key is exposed | Keys are read-only or queue-only by scope, hashed at rest, shown once, revocable, rate limited |
| Forged webhook or cron call | Someone calls `/api/cron/*`, `/api/telegram`, `/api/ingest` | Existing secrets; ingest must have a token set in production (today it is open when unset: change to fail closed); HMAC and timestamp on executor posts |
| Supply chain | A dependency, skill or MCP server is malicious | Lockfiles and `npm ci`, pinned action SHAs, `ignore-scripts` for installs in CI, `tools/skill_scan.py` before any skill or MCP install, nothing installed without Jeremy's yes |
| Bad data | Stale, gapped, wrong or unadjusted bars | Firewall (S12), second-source check, provenance on every report |
| Double orders | Retry or re-run sends the same order twice | Deterministic intent ids, unique constraint, broker client-order-id |
| State loss | Redis flush, redeploy | Postgres is the record; the pipeline is a pure function of bars and ledger, so it can be replayed |
| Runaway spend | An agent loops | Per-agent job and token budgets, routine self-disable after 10 failures, daily AI budget with hard stop at 2× |
| Misleading output | A report or the product implies a promise | S15, fixed wording in report templates, golden-file tests, the product's verdict language (see `05`, `12`) |

Two existing gaps this design closes: `ingestOk()` returns true when no token is set, and `isAdmin()` returns true when no password is set. Both become: allowed only when `NODE_ENV !== 'production'`; in production the route refuses and Setup shows the missing variable.

## 8. Route and tool inventory test

One test enumerates every HTTP route, MCP tool and CLI command from their registries and asserts:
- none has a name or scope containing `order`, `withdraw`, `transfer`, `pay`, `approve` or `resume`, except the session-only dashboard routes listed in an explicit allow-list in the test file;
- every non-GET route declares an auth requirement;
- every MCP tool declares `readOnlyHint` or is one of the two queue tools.

Adding a route that breaks this fails CI and needs Jeremy's review to change the allow-list (the test file is a red path).

## 9. Red paths

Used by CODEOWNERS, the guard hook and the `protected-paths` CI job. One file, `.github/red-paths.txt`, is the single source.

```
packages/kernel/**
packages/autopilot/src/broker/**
packages/autopilot/src/pipeline.ts
packages/engine/src/validate.ts
packages/engine/src/stats/deflated.ts
web/lib/policy.ts
web/lib/auth.ts
web/lib/andon.ts
web/app/api/killswitch/**
web/app/api/live/**
apps/executor/**
bots/**/broker*.py
bots/**/executor*
bots/**/keeper.py
tools/drift_check.py
tools/guard_hook.mjs
plugin/hooks/**
.github/**
.env.example
db/migrations/**
```

## 10. Before real money: the go-live runbook (outline)

`docs/runbooks/going-live.md`, written during the build. It must cover: trade-only keys with withdrawals off and IP lock; a separate key per bot; the venue's current rules for small accounts and intraday trading (check the pattern-day-trading and margin rules that apply on the day, they change); tax records (the ledger export gives every fill); the first week checklist; how to halt from the phone; and what to do if the executor and broker disagree.
