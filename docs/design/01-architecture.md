# 01. Architecture

Status: design, 2026-11-10. Source of truth for scope: `docs/study-and-plan.md` (approved). This document says how the pieces fit. The other files in this folder specify each piece.

## 1. What Apex is

Apex is a research and paper-trading system that keeps searching for trading rules, tests them honestly, risks little, and only promotes what survives. It is built as a small operating system:

| Layer | What lives there | Rule |
|---|---|---|
| **Kernel** | Risk guard, trial ledger, validation gate, live locks | Pure code, deterministic, no model calls, red blast radius |
| **Services** | Data platform, strategy factory, incubator, paper broker, portfolio, drift alarm, cost model, reports, claim checker | Call the kernel. Never bypass it |
| **Agents** | Scout, data steward, validator, risk officer, reporter, code reviewer, claim extractor | Read, analyse, write files, notify. No order, withdraw, transfer or pay verbs |
| **Shells** | Web dashboard (installable PWA), `apex` terminal, REST API, MCP server, Claude Code plugin and skills, Telegram, browser extension | Read state and queue research work. No shell can place an order or change a limit without Jeremy's signed-in session |
| **Product** | "Proof" (working name): the claim checker as a separate multi-user SaaS | Separate deployment, database and keys. Shares only the open packages |

The design goal for every layer is the same: when something is wrong, the cheapest thing that can happen is "nothing trades and the report says why".

## 2. System diagram

```
                         Jeremy (browser, phone PWA, terminal, Telegram, Claude apps)
                                              |
        +-------------------------------------+-------------------------------------+
        |                    |                |                  |                  |
   Web dashboard        apex CLI/TUI      Telegram bot      MCP server        Browser ext.
   (Next.js, PWA)       (Node)            (webhook)         (stdio + HTTP)    (MV3)
        |                    |                |                  |                  |
        +--------------------+-------+--------+------------------+------------------+
                                     |
                            REST API v1  (read scopes + queue scopes, no trade routes)
                                     |
     +---------------+---------------+----------------+----------------+-------------+
     |               |               |                |                |             |
  Autopilot       Claim           Data            Reports          Agents         Policy
  pipeline        checker         platform        + notify         runner         gateway
     |               |               |                |                |             |
     +-------+-------+-------+-------+                +----------------+-------------+
             |               |
        KERNEL: validation gate, trial ledger (hash chain), risk guard, live locks
             |
     +-------+---------------------------+
     |                                   |
  Paper broker (bar simulator,       Order intents outbox  ------>  Executor (Jeremy's machine only,
  optional Alpaca paper)             (approved, signed)             his keys, re-checks guard, reconciles)
                                                                    Not built until a strategy graduates
Storage: Postgres (system of record)  |  Redis (cache, locks, rate limits)  |  Object store (bars, reports, receipts)
Compute: Vercel functions + cron  |  GitHub Actions schedules (heavy runs)  |  Worker box (recorder, bots, optional)
```

## 3. Runtime topology

Apex runs in three places. Each one can be missing and the rest still works.

| Plane | Runs | Why here | If it is down |
|---|---|---|---|
| **Vercel** (project `apex-trading-os`) | Dashboard, API, MCP over HTTP, Telegram webhook, light crons (hourly data health, budgeted autopilot tick, daily report) | Always reachable, no server to keep | Nothing trades (paper orders are created only by a run). The next run catches up from bars |
| **GitHub Actions** (repo `apex-trading-os`) | CI, the nightly full factory run, monthly re-validation, validator re-runs, ledger head anchoring, daily long-history data pulls | Free scheduled compute with no time limit that matters, a clean machine for every run (which is what an independent validator needs), full network access | Vercel's budgeted tick still re-checks paper slots daily. Full board refresh waits |
| **Worker box** (Jeremy's machine or a small VM, optional) | Order-book recorder, Python bots, TradingView bridge, later the live executor | Needs to be always on, or needs his keys | Recorder has gaps (never filled in). No live trading is possible, by design |

**Decision A1.** The heavy autopilot run is a CLI command (`apex run --full`) executed by a scheduled GitHub Action, which writes results through the same repository layer as the web app. The Vercel cron runs `apex run --budget N` semantics in-process and always re-checks paper slots first. Reason: Vercel functions have a time limit; a 266-pair board with monkey tests does not fit reliably. The draft `pipeline.ts` already has a rotating cursor for this.

**Decision A2.** No broker or exchange key that can trade ever lives on Vercel or in GitHub secrets. Vercel holds data-only keys (Massive, FRED, Alpaca data), the model key, and storage keys. Live keys exist only on the executor box. See `02-safety-and-live-switch.md`.

## 4. Repository layout

One monorepo, npm workspaces. Existing paths stay where they are unless listed under "moves".

```
apex-trading-os/
  AGENTS.md  README.md  .env.example  package.json (workspaces)
  packages/
    engine/        TS strategy engine: bars, indicators, backtest, validate, stats (moved from web/lib/engine,
                   web/lib/leaderboard.ts, web/lib/sharpe.ts)
    kernel/        risk guard, live locks, ledger (hash chain, canonical JSON), gate config. Red.
    autopilot/     factory, incubator, portfolio, paper broker, drift, dedupe, cost model, report
    data/          source adapters, dataset registry, firewall, cache
    claims/        claim checker: extraction schema, spec DSL v2, runner, verdict
    store/         repository interfaces + drivers (postgres, memory)
    sdk/           typed API client (used by CLI remote mode, MCP, extension, product)
    mcp/           MCP server (stdio and streamable HTTP)
    ui/            design tokens (CSS variables) and shared React components
  web/             personal dashboard + API + crons (Next.js). Imports packages/*
  apps/
    cli/           `apex` terminal (commands + TUI)
    extension/     browser extension (MV3)
    proof/         product SaaS (Next.js), Phase 5
  plugin/          Claude Code plugin: skills/, agents/, hooks/, .mcp.json, .claude-plugin/plugin.json
  engine/          Python engine (kept: bots use it, validator uses it as a second implementation)
  bots/            paper bots, recorder, paper exchange (kept)
  mcp-server/      old Python MCP (kept until packages/mcp reaches parity, then removed)
  tools/           drift_check.py, mutate.py, skill_scan.py, guard_hook.mjs
  data/            small committed fixtures only; real data lives in the object store
  ledger/heads/    daily ledger head hashes, committed by CI (the public anchor)
  docs/            design/ (this folder), specs/, runbooks/, adr/, archive-study/
  .github/         workflows/, CODEOWNERS, pull_request_template.md
```

**Moves (Phase 0, mechanical, one PR, parity test must stay green):**
- `web/lib/engine/*`, `web/lib/leaderboard.ts`, `web/lib/sharpe.ts` to `packages/engine/src/`. `web/lib/engine/index.ts` re-exports for one release so existing imports keep working.
- `apex-drafts/autopilot/risk.ts` to `packages/kernel/src/guard.ts`, `pipeline.ts` to `packages/autopilot/src/pipeline.ts`, both rewritten to the specs in `04-autopilot-core.md` (the draft has known gaps listed there).
- `web/lib/store.ts` becomes the Redis driver behind `packages/store`.

**Dependency rule** (enforced by a lint rule in CI): `kernel` imports only `engine`. `engine` imports nothing from the repo. Nothing in `kernel`, `engine` or `autopilot` may import the model gateway, `fetch`, or `process.env` (configuration is passed in). `autopilot` never imports the regime panel.

## 5. Storage

**Decision A3.** Postgres becomes the system of record. Redis stays for cache, locks and rate limits. An object store holds bars and files.

| Store | Holds | Why |
|---|---|---|
| **Postgres** (Supabase project `apex`, via the Vercel Marketplace or directly) | Ledger entries, trials, pre-registrations, slots, paper orders and fills, book snapshots, data health, reports index, research queue, agents roster and audit, API keys, limits history | The ledger must be append-only, ordered and queryable. JSON blobs in Redis lists cap at 500 rows and cannot enforce that. Row-level security also serves the product later |
| **Redis** (Upstash, existing) | Candle cache, run locks, rate-limit counters, kill switch and andon flags (also mirrored to Postgres), session hot state | Already wired. Fast flags must not depend on a database round trip |
| **Object store** (Supabase Storage bucket `apex-data`, private) | Bars as gzip CSV per dataset version, order-book recordings, report Markdown, golden files, claim-check inputs | Large, immutable, content-addressed |

Existing Redis keys (`strategies`, `jobs`, `agents:roster`, `agents:audit`, `events`, `trades`, `proposals`, `decisions`, `ai_calls`, memory) keep working. They migrate table by table behind `packages/store` and each migration is its own green PR. The `memory` driver is used in unit tests and when no database is configured, in which case the dashboard shows the existing "state is not persistent" banner and the autopilot refuses to open paper orders (a ledger that can vanish is not a ledger).

Schema: `04-autopilot-core.md` section 12 has the tables. Append-only tables (`ledger`, `trials`, `fills`) have `INSERT`-only grants for the application role and a trigger that raises on `UPDATE` or `DELETE`.

## 6. Main flows

**Daily autopilot run** (detail in `04`):
1. Data steward pulls new bars. The firewall grades every dataset.
2. Factory lists every strategy and dataset pair. New pairs are pre-registered in the ledger, then evaluated. Every evaluation is a ledger entry with hashes of inputs and result.
3. Passing pairs go to the validator queue. The validator re-runs each one from a clean checkout with its own data pull. Two agreeing runs make a slot.
4. The slot is locked. From then on only bars after the lock count.
5. Each new closed bar for an active slot can produce an order intent. The risk guard sizes or blocks it. The paper broker fills it at the next bar's open.
6. Forward records update. Drift alarm, loss limits and data health can pause. Graduation is checked monthly.
7. The report is written, stored, shown on the dashboard and sent to Telegram.

**Claim check** (detail in `05`): text in, rules extracted to a spec, pre-registered, tested with the same gate, verdict out.

**Going live** (detail in `02`): four locks, all must be open, two of them only Jeremy can open, one of them only on his own machine.

## 7. Technology choices

| Choice | Decision | Alternatives considered |
|---|---|---|
| Web | Keep Next.js (App Router) on Vercel | A separate SPA and API server: more to run, no gain |
| Engine language | TypeScript is canonical for the autopilot. Python engine stays for bots and as the second implementation the validator can use | Porting everything to Python: loses the working TS engine and Vercel fit |
| Database | Postgres (Supabase) | Stay on Redis: cannot enforce append-only or query the ledger. SQLite: no serverless fit |
| DB access | Plain SQL through a thin typed repository layer (`packages/store`), migrations as numbered `.sql` files | An ORM: not needed for about 20 tables, and hides the append-only grants |
| Hashing | SHA-256 over RFC 8785 canonical JSON | The draft's 32-bit FNV: collisions are plausible, not acceptable for receipts |
| Charts | Keep `lightweight-charts` for price, hand-rolled SVG for small multiples | A heavy chart library |
| CLI | Node, same packages, `--json` everywhere. TUI with Ink | A separate Go or Rust binary: second implementation of the engine |
| MCP | One TypeScript server, two transports (stdio for Claude Code, streamable HTTP at `/api/mcp` for Claude apps). Build against the current MCP TypeScript SDK docs, not memory | Keep the Python MCP: it can only reach the Python engine |
| Mobile and desktop | Installable PWA. Telegram for push until web push is proven | Native apps: store work with no benefit yet. Tauri later only if offline matters |
| Auth (personal) | Existing admin password session, plus API keys with scopes for machines | OAuth for one user: overkill |
| Auth (product) | Supabase Auth, row-level security, Stripe Billing | See `12-saas-product.md` |
| Models | Claude only, through `web/lib/gateway.ts`. Fable 5.2 for claim extraction and promotion reviews, Sonnet 5.5 for scout and reporter, Haiku 5.5 for triage. Every call under the spend cap in `usage.ts` | Other providers wait for Jeremy's pick |

## 8. Configuration

All configuration is environment variables, validated at boot by one schema (`packages/kernel/src/config.ts`). A missing or malformed value fails closed: the feature is off and Setup shows what is missing. New variables (full list in `14-build-plan.md` section 5):

```
DATABASE_URL                 Postgres connection (pooled)
APEX_STORAGE_URL / _KEY      object store
APEX_API_KEYS_PEPPER         server secret used to hash API keys
APEX_SIGNOFF_KEY             only on Jeremy's machine: signs guard-hook sign-offs and live approvals
APEX_LEDGER_ANCHOR=git       git | git+ots | off
APEX_VALIDATOR_SOURCE        second data source for the validator (for example alpaca)
TIINGO_API_KEY               long daily history, if its terms are accepted (see 03)
APEX_PAPER_CAPITAL=10000     paper book starting equity
```

## 9. Non-goals

Carried from the plan, restated because the build must not drift into them: no memecoin snipers, no live keeper, no options income, no order-flow rules before the recorder has history, no speed games, no leverage setting, no pooled or resold model access, no vendor bots, no copied AGPL or GPL code, no cloning of another product's look.

## 10. Decision records

Each decision marked "Decision" in this folder becomes a short ADR in `docs/adr/` when the build starts (number, context, decision, consequence). The list is in `00-README.md`.
