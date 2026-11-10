# Apex design: start here

This folder is the full design for Apex, the trading system approved on 2026-11-10 (all phases, the ten ideas and the product track). It is written to be built from. A separate build thread does the build. Repo: `github.com/Army161/apex-trading-os` (private).

Status: design complete, nothing in it is built yet unless a file says "existing". The untested autopilot draft at `apex-drafts/autopilot/` is input only; `04` section 17 lists what it gets wrong.

## The rules that do not bend

1. Paper first. Going live happens only by Jeremy's switch, on his machine, with his own keys (`02` section 6).
2. Agents get no order, withdraw or pay tools. They can read, queue work and halt. They cannot approve, resume or change a limit.
3. No AGPL or GPL code is copied. Ideas only.
4. Nothing auto-merges into money code. Red paths need Jeremy's review (`02` section 9).
5. Validation stays honest. Every try is counted, every number carries its sample size and basis, and no gate is loosened to get a pass.

## Files

| File | What it specifies | Read it if you build |
|---|---|---|
| `01-architecture.md` | Layers, the three places code runs, repo layout, storage, config | anything |
| `02-safety-and-live-switch.md` | Invariants S1 to S17, halt levels, limits, the four live locks, threat model, red paths | anything |
| `03-data.md` | Datasets, versions, panels, sources, the data firewall, benchmark | data, autopilot |
| `04-autopilot-core.md` | Ledger, pre-registration, gate, validator, incubator, weights, paper broker, risk guard, drift, costs, report, data model | the core |
| `05-claim-checker.md` | Turning a video or script claim into a tested verdict | claim checker, product |
| `06-agents-and-automations.md` | Agent roster, what each may do, schedules, the seven skills | agents, plugin |
| `07-ui-ux.md` | Dashboard: sections, design tokens, components, every screen, states, phone and installable app | web, product UI |
| `08-terminal.md` | The `apex` command and its full-screen mode | CLI |
| `09-api.md` | REST API v1: scopes, endpoints, errors | API, SDK, extension |
| `10-mcp-plugin-skills.md` | MCP server (two transports), Claude Code plugin, guard hook, sign-offs | MCP, plugin |
| `11-browser-extension.md` | Chrome extension for the claim checker | extension |
| `12-saas-product.md` | The product ("Proof", working name): tenancy, billing, plans, sharing rules, legal list, launch stages | product |
| `13-testing-ci-ops.md` | Test layers, workflows, environments, alerts, runbooks, definition of done | anything |
| `14-build-plan.md` | Work packages P0.1 to P5.10, order, what only Jeremy can do, env vars | the build lead |
| `mockups/` | Six screen mockups (HTML) and `canvas.json` | UI |

Reading order for the build thread: `AGENTS.md` in the repo root, this file, `01`, `02`, `04`, `14`, then the file for the package in hand.

## Mockups

Live canvas (private to Jeremy): https://claude.ai/artifact/UDxXdWCkin1TFrvj3ZaYHC

Copies of the source are in `mockups/`: `Main.dc.html` (Today), `Autopilot.dc.html`, `Slot.dc.html`, `Claim.dc.html`, `Proof.dc.html` (product landing, prices left as `[PRICE]`), `Phone.dc.html`. They use the real stress-board numbers. Forward and book figures are shown empty because nothing is in paper yet. The tokens and component rules in `07` section 3 are the authority; the mockups illustrate them.

## Where things stand today (so nobody overstates it)

- 266 strategy and market pairs were stress-tested on six checks. One passed all six: `dave_prev_range` on SPY 1h (51 trades, +9.1%, drawdown 8.3%).
- The design adds a seventh check, beating buy and hold on risk. It has **not** been run. Over the same period holding SPY made +25.4% with a 20.5% drawdown, so the result is open.
- The independent validator has not run on it either.
- So the honest status of the one candidate is "checking", not "passed" and not "in paper". The first job after the build is to run both (`04` section 6).
- The video claim for Turtle 55/20 on BTC daily was +729%. Measured here: 7 trades, minus 1.5%, 0 of 6 checks. That is the claim checker's first example.

## Decisions made in this design

Each becomes a short record in `docs/adr/` when the build starts.

| Id | Decision | Why | Where |
|---|---|---|---|
| A1 | Heavy runs execute as `apex run --full` on a scheduled GitHub Action; Vercel does light ticks only | Vercel time limits; one code path for both | `01` s3 |
| A2 | No key that can trade is ever on Vercel or in GitHub secrets | Removes the biggest way to lose money by accident | `01` s3, `02` |
| A3 | Postgres (Supabase) is the system of record; Redis for cache and locks; object store for bars and reports | Append-only tables with triggers; replayable | `01` s5 |
| A4 | The TypeScript engine moves into `packages/engine`; Python engine stays and must agree on fixtures | Shared by web, CLI, validator | `01` s4 |
| K1 | A slot's forward record is deflated by M (slots ever locked), not N (all trials ever). Both are shown | Forward results are out of sample for trials before the lock; using N would make graduation impossible without making it more honest | `04` s8 |
| K2 | A candidate cannot be promoted in the run that found it | The draft did this; it removes the independent check | `04` s17, s19 |
| K3 | Gate versions are frozen. A change is a new version and old results keep their version | No moving the bar after seeing results | `04` s6 |
| K4 | Limits live in env vars, so the dashboard cannot loosen them. A tighter value applies at once; a looser one is adopted only after 24 hours | Stops loosening in the heat of a loss | `02` s5 |
| C1 | A claim check allows at most three readings of a claim, all pre-registered and all counted | Stops fishing for the reading that works | `05` s5 |
| M1 | One MCP server in TypeScript with stdio and HTTP transports; the old Python server's free-parameter backtest tools are removed, not ported | Those tools are uncounted tries | `10` s1 |
| M2 | The guard hook is the weakest of three layers; CODEOWNERS and the `protected-paths` CI job are the authority | A hook can be evaded | `10` s3 |
| U1 | Phone use is an installable web app plus Telegram, not a native app | One codebase; no store review | `07` s6 |
| P1 | The product is a separate deployment and database from personal Apex, sharing packages only | A product bug can never touch the personal book | `12` s4 |
| P2 | The product never executes trades and never gives advice; public pages follow fixed wording | Legal exposure | `12` s7, s9 |

## Open questions for Jeremy

None of these block the start of the build. The full list of things only he can do is in `14` section 4.

1. **Graduation takes time.** On its own the candidate makes about 25 trades a year, so 50 forward trades is roughly two years. The design offers pooled slots (the same rule on several markets counted together) to shorten that without lowering the bar. Is pooling acceptable?
2. **Long-history data.** The current plan gives two years. Longer history needs another source and its terms accepted (`03`).
3. **Gamma exposure data.** Paid. Wanted or not?
4. **Receipts page.** The ledger can publish a public proof page. Off by default. Keep it off?
5. **A machine that stays on** for the order-flow recorder. It cannot backfill, so each day without it is lost history.
6. **Product:** name and domain, business entity, Stripe account, commercial data licence, a lawyer's review, and prices. The build goes to test mode without them and stops before any outside user.
7. **Accounts:** the Vercel project, the Supabase project, branch protection, GitHub secrets, and `APEX_SIGNOFF_KEY` generated on his own machine. Keys never go in chat.

## Glossary

| Term | Meaning |
|---|---|
| Trial | One test of one strategy version on one dataset and timeframe under one gate version. Counted forever |
| N | Distinct trials ever run. Used to deflate backtest results |
| M | Slots ever locked into the incubator. Used to deflate forward results |
| Ledger | Append-only, hash-chained record of every trial, decision and change |
| Anchor | The ledger's head hash committed to git daily, so a rewrite is detectable |
| Pre-registration | Writing down what will be tested and what counts as a pass before running it |
| Gate | The fixed set of checks a result must pass (standard bar v1 has seven) |
| Fingerprint | Hash of a strategy's signals on fixture data; changes when behaviour changes |
| Validator | A second, independent re-run on a clean checkout. L1 same inputs, L2 fresh data, L3 other engine |
| Slot | One strategy on one market and timeframe, locked for forward paper trading |
| Incubator | Where locked slots trade on paper until they graduate or retire |
| Shadow | A slot tracked but given no weight because it is more than 0.8 correlated with a better one |
| Book | The whole paper portfolio |
| Guard | The risk check every order intent must pass before a broker sees it |
| Halt | The stop cord. Anyone and any agent may pull it; only Jeremy resumes |
| Drift alarm | Detects a live record departing from its backtest; pauses the slot |
| Red path | A file that touches money or safety. Changes need Jeremy |
| Sign-off | A signed, 48-hour permit from Jeremy's machine to edit one red path |
| Four locks | Evidence, independent check, Jeremy's approval, his machine with his key. All four before any live order |
| DSR | Deflated Sharpe ratio: the chance the Sharpe is real after counting how many things were tried |
| Proof | Working name for the product: the claim checker and forward tracking for other people |
