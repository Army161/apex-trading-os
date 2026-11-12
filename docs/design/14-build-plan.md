# 14. Build plan and handoff

For the build thread. Work packages in order, each with what it delivers, what it depends on, its blast radius and the test that proves it. One package is one or a few PRs. Follow `docs/how-to-direct-apex-agents.md`: short spec, tests first, checkpoints, a commit per working step.

## 1. Before writing code

1. Read `AGENTS.md`, this folder's `00-README.md`, then `01`, `02` and `04`.
2. Read the folder README of every folder you touch.
3. The repo is `github.com/Army161/apex-trading-os`, `main`. The autopilot draft is not in the repo; it is at `/mnt/project-files/apex-drafts/autopilot/`. Use it as reference only (`04` section 17 lists its faults).
4. Things only Jeremy can do are listed in section 4. Start the ones that block you early.
5. Red paths (`02` section 9) never auto-merge. In a cloud session the guard hook will refuse edits to them once it is installed; write those changes as PRs for Jeremy's review from the start.

## 2. Work packages

Blast radius: G green, Y yellow, R red.

### Phase 0: foundations

| ID | Deliver | Depends | BR | Proof |
|---|---|---|---|---|
| P0.1 | npm workspaces; `packages/engine` moved from `web/lib/engine` with re-exports; all existing tests green | none | Y | `npm test`, `pytest`, parity unchanged |
| P0.2 | `ci.yml` with types, unit, python, parity, invariants; branch protection settings documented for Jeremy to apply | P0.1 | R | A deliberately broken PR fails each job |
| P0.3 | `.github/red-paths.txt`, CODEOWNERS, `protected-paths` job, blast-radius labeller | P0.2 | R | Test PR touching `packages/kernel` fails without Jeremy's review |
| P0.4 | `plugin/` skeleton with the guard hook and its tests; `apex signoff` stub; SessionStart reminder; `skill_scan.py` result committed | P0.1 | R | Hook table tests (`10` section 5) |
| P0.5 | PR-Agent workflow, pinned, comment-only | P0.2 | R | A test PR gets a review comment; the bot cannot approve |
| P0.6 | Close the two open-by-default gaps: `ingestOk` and `isAdmin` fail closed in production | none | R | Unit tests; Setup shows the missing variable |
| P0.7 | `packages/store` with memory and Postgres drivers; migrations 0001 to 0003 (ledger, gate versions, strategies, datasets); `db` CI job | P0.1 | R | Append-only trigger test; migrations apply clean |
| P0.8 | Fingerprints for every strategy and the engine; `fingerprints` job; `lookahead` job | P0.1 | Y | Changing a strategy's logic fails the job until the file is updated |

### Phase 1: autopilot core

| ID | Deliver | Depends | BR | Proof |
|---|---|---|---|---|
| P1.1 | `packages/kernel/ledger`: canonical JSON, hash chain, append, verify, prereg rule | P0.7 | R | Ledger tests (`04` section 20) |
| P1.2 | Gate config and versions; check 7 (beats hold); `evaluate()` returning the new status set; trial keys | P1.1 | R | Trial-counting table tests; noise and planted-edge tests |
| P1.3 | `packages/kernel/guard`: all rules, branded `GuardedIntent`, limits with ceilings and the 24-hour loosen delay, shared vectors with Python | P0.7 | R | One test per rule; mutation score 100% |
| P1.4 | Cost model with priors; backtest and gate read it | P1.2 | R | Update-rule tests; gate results on fixtures unchanged when the prior equals the old fee |
| P1.5 | Paper broker (`BarSimBroker`) sharing the per-bar logic with `backtest()`; book from fills | P1.3, P1.4 | R | Broker parity on three fixtures |
| P1.6 | Incubator: lock, two forward records, monthly check, graduation with `M` and `N`, graduation clock maths | P1.2, P1.5 | R | Incubator and graduation tests |
| P1.7 | Dedupe, shadows, weights (water-filling), risk scale | P1.6 | R | Dedupe and weights tests |
| P1.8 | Drift alarm with baseline and readings | P1.6 | R | False-alarm and detection tests |
| P1.9 | `runAutopilot()` pure pipeline, run lock, `apex run` (minimal CLI), cron route `api/cron/autopilot` | P1.1 to P1.8 | R | Replay determinism; golden report; halted input gives zero intents |
| P1.10 | Validator workflow and agreement rules; promotion requires it | P1.9, P2.1 | R | Validator tests; an L1 mismatch pulls the cord in a fixture |
| P1.11 | Report template, storage, Telegram delivery, optional AI review under the cap | P1.9 | Y | Golden files; delivery to a test chat |
| P1.12 | Live locks (`locks.ts`), `liveAllowed`, the `Broker` interface with a fake live broker for tests, executor logic tested against the fake. No live adapter | P1.5 | R | Lock matrix test; executor refuses without signature |
| P1.13 | First real run: check 7 across the 266 pairs; validator on the candidate; write `docs/validation-results.md` addendum with whatever the result is | P1.10 | Y | The ledger holds the entries; the report says plainly what passed |

### Phase 2: data (parallel with Phase 1 from P0.7)

| ID | Deliver | Depends | BR | Proof |
|---|---|---|---|---|
| P2.1 | `packages/data`: adapter interface, Massive and Alpaca adapters from recorded responses, registry, versions in the object store | P0.7 | Y | Round-trip property test |
| P2.2 | Firewall with all checks, health table, guard input, provenance in reports | P2.1 | R (thresholds are in the gate version) | One fixture per check |
| P2.3 | `data/SOURCES.md` with terms recorded; long daily history adapter (Tiingo or Stooq after reading terms); `daily-long` panel; diversified core benchmark | P2.1 | Y | Benchmark fixture test; terms entries present or the adapter refuses |
| P2.4 | Pooled intraday panel (20 to 50 names) and pooled evaluation | P2.1 | Y | Pooled result is one trial |
| P2.5 | Recorder manifests and Data health card; recorder runbook for Jeremy's machine | none | G | Manifest fixture |
| P2.6 | EDGAR insider adapter using `SEC_USER_AGENT` | P2.1 | Y | Recorded-response test; rate limit respected |
| P2.7 | Gamma exposure: only after Jeremy answers the open question | Jeremy | Y | n/a |

### Phase 3: test queue and claim checker

| ID | Deliver | Depends | BR | Proof |
|---|---|---|---|---|
| P3.1 | Research queue table, seeding with the nine plan tests, weekly trial budget | P1.9 | Y | Budget test |
| P3.2 | Queue tests 1 to 5 as registered strategies with fingerprints (variants of `dave_prev_range`, opening-range breakout, session VWAP pair, momentum-candle breakout, divergence with confirmed pivot) | P3.1 | Y | Look-ahead tests; each pre-registered before its first run |
| P3.3 | Tests 6 to 9 as their data arrives | P2.3, P2.4, P2.6, P2.7 | Y | Same |
| P3.4 | Spec DSL v2 with per-operand look-ahead tests | P0.8 | Y | Operand tests |
| P3.5 | Template catalog with bounds | P3.4 | Y | Round-trip tests |
| P3.6 | Claim extraction (schema, quote check, injection fixtures) | none | Y | Extraction and injection fixtures |
| P3.7 | Claim pipeline, verdict rules, wording goldens, ledger entries | P3.4 to P3.6, P1.2 | Y | Verdict table tests; turtle end to end |
| P3.8 | Run the archive backlog through the checker inside the trial budget; summarise in a report | P3.7 | G | Report exists; `untestable` share measured |

### Phase 4: surfaces

| ID | Deliver | Depends | BR | Proof |
|---|---|---|---|---|
| P4.1 | `packages/ui` tokens and components (`Metric` first); contrast script | none | G | Component tests |
| P4.2 | App shell: routes, rail, header with mode badge, trial counter, Halt; move existing tabs under Research, Agents and You | P4.1 | Y | `check:ui` on every route |
| P4.3 | Today, Autopilot board, Slot detail, Paper book, Risk, Queue, Data health, Reports, Ledger screens | P4.2, P1.9 | Y | Playwright per screen; states from `07` section 5 |
| P4.4 | Claim check screens | P4.2, P3.7 | Y | Playwright |
| P4.5 | REST API v1, keys and scopes, `openapi.yaml`, `packages/sdk`, inventory test | P1.9 | R (auth) / Y | Contract and auth tests |
| P4.6 | `apex` CLI complete, TUI, completions | P4.5 | Y | Snapshot tests |
| P4.7 | `packages/mcp` on both transports; retire the Python MCP tools that run uncounted tests | P4.5 | Y | MCP contract tests |
| P4.8 | Skills, commands and agents in `plugin/`; skill lint | P4.7 | G | Lint; scan score |
| P4.9 | PWA: manifest, icons, service worker (read-only cache), share target, install help | P4.2 | Y | Lighthouse installability; offline shows cached reads and disables actions |
| P4.10 | Telegram commands from `07` section 9 | P4.5 | Y | Webhook tests; `/halt` needs the second tap |
| P4.11 | Agents roster seed, Automations card, Inbox and Outbox | P1.11 | Y | `06` section 7 tests |
| P4.12 | Approval flow UI for lock 3 (visible only when locks 1 and 2 are open); admin routes with re-auth | P1.12, P4.3 | R | Typed-name and re-auth tests; no route opens lock 4 |
| P4.13 | Public receipts page behind its switch; anchors workflow | P1.1 | Y | Page shows nothing private; verify instructions work |
| P4.14 | Runbooks written and linked from Setup | all above | G | Each runbook rehearsed once on fixtures |

### Phase 5: product

| ID | Deliver | Depends | BR | Proof |
|---|---|---|---|---|
| P5.1 | `apps/proof` skeleton, separate env schema, separation lint | P3.7, P4.1 | Y | Separation tests |
| P5.2 | Tenancy schema with row-level security, Supabase Auth | P5.1 | R | Isolation tests on a real database |
| P5.3 | Claim check flow, per-account ledger and try counting, history, rule page | P5.2 | Y | `12` section 13 |
| P5.4 | Stripe Billing in test mode: plans, Checkout, Portal, webhooks, quotas | P5.2 | R | Billing tests |
| P5.5 | Landing, method, account, admin screens | P5.3 | G/Y | Playwright |
| P5.6 | Share links with redaction rules | P5.3 | Y | Shared-page tests |
| P5.7 | Internal stage 5a: the archive run on the product build; measure cost per check | P5.3 | G | Numbers recorded |
| P5.8 | Extension (`11`) | P5.3, P4.5 | Y | Extension tests |
| P5.9 | Product API keys, OAuth, MCP connector | P5.4 | R | Auth tests |
| P5.10 | Forward tracking feature (1.2) | P5.3, P1.6 | Y | Incubator tests reused |
| stop | Private beta with outside users, and anything after it, waits for Jeremy's items in section 4 | | | |

## 3. Order and parallel tracks

```
P0.1 ─ P0.2 ─ P0.3 ─ P0.5
   ├── P0.4            P0.6 (any time)
   ├── P0.7 ─┬─ P1.1 ─ P1.2 ─ P1.4 ─┐
   │         ├─ P1.3 ───────────────┼─ P1.5 ─ P1.6 ─ P1.7, P1.8 ─ P1.9 ─ P1.10 ─ P1.13
   │         └─ P2.1 ─ P2.2 ─ P2.3, P2.4, P2.6                      └─ P1.11, P1.12
   └── P0.8 ─ P3.4 ─ P3.5 ─┐
                 P3.6 ─────┴─ P3.7 ─ P3.8          P3.1 ─ P3.2 ─ P3.3 (after P1.9)
P4.1 (any time) ─ P4.2 ─ P4.3 … ; P4.5 after P1.9 ; P5 after P3.7
```

The shortest path to "the system runs by itself every day in paper and says plainly what it found" is P0.1, P0.7, P1.1 to P1.9, P2.1, P2.2, P1.11. Everything else improves it.

## 4. What only Jeremy can do

| Item | Blocks | Note |
|---|---|---|
| Apply branch protection and CODEOWNERS enforcement on the repo | P0.3 | Settings, two minutes |
| Create the Vercel project `apex-trading-os` linked to the repo (the earlier attempt to create one from here was refused) | deploys | Then set env vars there himself |
| Create the Supabase project (or approve creating it through the connector) and set `DATABASE_URL` and storage keys | P0.7 in production | The build can run on the memory driver and CI Postgres until then |
| Set GitHub secrets (section 2 of `13`) | scheduled workflows | Data and paper keys only. `MASSIVE_API_KEY` is required for the nightly: without it no new bars arrive and the forward clock never moves |
| Generate `APEX_SIGNOFF_KEY` on his own machine | sign-offs, lock 4 | Never in chat, never in the cloud |
| Read and accept data terms (Tiingo or other), or choose another source | P2.3 | |
| Decide on gamma exposure data | P2.7 | Open question |
| A machine that stays on, for the recorder | P2.5 | The recorder cannot backfill |
| Product: name and domain, business entity, Stripe account, data licence, lawyer's review, prices | 5b and later | The build goes as far as test mode without them |
| Install on his machine: SkillSpector, the Solana dev skill, the TradingView bridge | optional | From the approved shortlist |

## 5. New environment variables

Add to `.env.example` with a comment each. Web app unless marked.

```
DATABASE_URL=
APEX_STORAGE_URL=                 APEX_STORAGE_KEY=
APEX_API_KEYS_PEPPER=
APEX_PAPER_CAPITAL=10000
APEX_MAX_WEIGHT_PCT=25            APEX_MAX_CLASS_PCT=60          APEX_MAX_CORR_RISK_PCT=2
APEX_COOLDOWN_BARS=1              APEX_TRIALS_PER_WEEK=25
APEX_LEDGER_ANCHOR=git            APEX_VALIDATOR_SOURCE=alpaca
APEX_RECEIPTS_PUBLIC=no
TIINGO_API_KEY=
APEX_API_URL=  APEX_API_KEY=      # CLI remote mode, MCP stdio, extension (client side)
APEX_SIGNOFF_KEY=                 # Jeremy's machine only. Never on Vercel, GitHub or in a cloud session
# apps/proof has its own .env.example: SUPABASE_*, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY, data provider key
```

## 6. Approved installs (from the plan), where each lands

| Tool | Package |
|---|---|
| PR-Agent | P0.5 |
| Elephant-goldfish planning plugin | Used by the build thread for red features; its review pattern is also `plugin/agents/goldfish-reviewer.md` |
| Playwright MCP | P4.3, for screen checks during development; CI uses plain Playwright |
| TradingAgents, anthropics/financial-services | After P4.11, as paper-only research desks posting proposals through ingest; scanned first; no extra verbs |
| SkillSpector, Solana dev skill | Jeremy's machine |

Each is scanned with `tools/skill_scan.py` before install, pinned to a version, and gets no order, withdraw or pay tools.

## 7. Risks to the build and how the design handles them

| Risk | Handling |
|---|---|
| The engine move breaks imports | Re-export shim for one release; parity and self-test unchanged as the gate |
| Vercel time limits on runs | Budgeted tick plus full runs on GitHub Actions |
| Float differences between machines break hash agreement | Round to 10 significant digits before hashing; fixed seeds; validator tolerances for L2 |
| The strict gate means nothing graduates for a long time | Expected and stated; pooled slots; graduation clock makes the wait visible |
| The candidate fails check 7 or the validator | The system runs with nothing in paper and says so; the queue continues |
| Claim extraction is unreliable on vague sources | Quote check, `untestable` verdict, ambiguity shown, user-editable assumptions |
| Scope: this is a lot | The shortest path in section 3 is small; every other package is independent and can be cut or deferred without breaking the core |
