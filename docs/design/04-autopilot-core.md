# 04. Autopilot core

The loop that finds, tests, incubates, paper-trades and retires strategies. Packages: `packages/kernel` (ledger, guard, locks, gate config) and `packages/autopilot` (everything else here). This file covers plan Phase 1 and ideas 2, 3, 4, 5, 7, 8, 9 and 10.

The draft in `apex-drafts/autopilot/` is the starting point. Section 17 lists what it gets wrong so the build does not carry those over.

## 1. Life of a strategy

```
 registered ──pair with dataset──▶ pre-registered ──run──▶ evaluated
                                                             │
        rejected ◀── fails 2+ checks ────────────────────────┤
        watch    ◀── fails exactly 1 check (not trade count) ┤
        needs_data ◀ only the trade count fails ─────────────┤
                                                             ▼
                                              passed_pending_validation
                                                             │ validator re-run agrees (section 7)
                                                             ▼
                              ┌────────── paper (locked, incubating) ◀──────────────┐
                              │                │            │                       │
              drift alarm ───▶ paused_drift    │            │ fails monthly         │ any scale check fails
              bad data ──────▶ paused_data     │            │ re-validation or      │
                              │                │            ▼ forward record        │
                              └── cleared ─────┘         retired                    │
                                               │ 6+ months held up + strict gate    │
                                               ▼                                    │
                                         live_eligible ──locks 2,3,4──▶ micro_live ─┴─▶ live_10 ▶ live_50 ▶ live_100
```

Slot statuses: `paper`, `paused_drift`, `paused_data`, `live_eligible`, `micro_live`, `live_10`, `live_50`, `live_100`, `retired`. A slot is also `primary` or `shadow` (section 9). Every transition is a ledger entry with the reason and the numbers that caused it. `retired` is final: a retired idea can come back only as a new pre-registration, which is a new trial.

## 2. Strategy identity

A result is only meaningful if "the strategy" cannot quietly change.

- **Built-in strategies** (`StratDef` in `packages/engine`): identity is `id` plus a **fingerprint**, the SHA-256 of the signals (`le`, `se`, `lx`, `sx`, rounded `stop`, `target`) the strategy produces on three committed fixture datasets. The fingerprint is computed in CI and stored in `packages/engine/fingerprints.json`. A behaviour change shows up as a fingerprint diff in the PR.
- **Spec strategies** (the DSL in `spec.ts`, used by the builder and the claim checker): identity is the SHA-256 of the canonical spec JSON.
- **Parameters**: built-ins take none at the registry level (each parameter set is its own `id`, as today). Variants in the Phase 3 queue are registered as separate ids (`dave_prev_range__close_break`), each its own trial.
- **Engine fingerprint**: the SHA-256 of `backtest()` output on golden fixtures. It changes when fill logic changes.
- **Frozen while locked**: a strategy with any non-retired slot may not change. CI fails if a locked strategy's fingerprint differs from the one in its lock. To change it, register a new id.

## 3. Trial ledger with receipts (idea 2)

### 3.1 Entries

One append-only table, `ledger`. Every entry:

```ts
type LedgerEntry = {
  seq: number;              // gapless, assigned by the database
  ts: number;               // ms UTC, server clock
  kind: LedgerKind;
  actor: string;            // 'autopilot' | 'validator' | 'jeremy' | 'cron:<name>' | 'agent:<id>' | 'ci'
  payload: object;          // schema per kind, validated before append
  payloadHash: string;      // sha256(canonicalJson(payload))
  prevHash: string;         // hash of entry seq-1 ('0'*64 for the first)
  hash: string;             // sha256(prevHash + '|' + seq + '|' + ts + '|' + kind + '|' + actor + '|' + payloadHash)
}
type LedgerKind =
  | 'config_snapshot' | 'gate_version' | 'data_version' | 'strategy_registered'
  | 'prereg' | 'trial_result' | 'skipped_data' | 'validator_run'
  | 'slot_locked' | 'slot_status' | 'weights' | 'intent' | 'intent_blocked' | 'fill' | 'book_snapshot'
  | 'drift_reading' | 'cost_model' | 'graduation_check' | 'live_approval' | 'live_stage'
  | 'halt' | 'resume' | 'limit_change_pending' | 'claim_check' | 'anchor';
```

Canonical JSON is RFC 8785 (sorted keys, shortest number form). Numbers that come from floating-point maths are rounded to 10 significant digits before hashing so two machines agree.

`ledger.append(kind, actor, payload)` runs in one serialisable transaction: read the last hash, compute, insert. Two concurrent appends cannot fork the chain. `ledger.verify(from, to)` recomputes every hash and returns the first bad `seq`, if any.

### 3.2 Input and result hashes

Every `trial_result`, `validator_run` and `claim_check` payload carries:

```ts
inputs: { strategy: { id, fingerprint }, dataset: { id, version }[], gateVersion, costModelVersion, engineFingerprint, seed }
inputHash: sha256(canonicalJson(inputs))
resultHash: sha256(canonicalJson(result))       // result = metrics + checks + daily returns digest
```

Anyone holding the same bars and code can recompute both. That is the receipt.

### 3.3 What counts as a trial

A **trial** is a distinct hypothesis that has been tested: `trialKey = sha256(strategy id, strategy fingerprint, panel or dataset id, timeframe, gate version)`.

| Event | New trial? |
|---|---|
| A strategy is run on a dataset for the first time | Yes |
| The same pair is re-run on newer bars or a restated dataset version | No (same hypothesis, more data) |
| A parameter, rule or filter changes (new id or fingerprint) | Yes |
| The gate version changes and old pairs are re-judged | Yes, for every pair re-judged |
| The cost model or engine fingerprint changes | No, but every active slot is re-validated and the entry says why |
| A claim check runs an extracted spec | Yes, one per interpretation tested |
| A pair is skipped because data is blocked | No |
| A validator re-run of an existing trial | No |

`N` (trials ever) is `count(distinct trialKey)` read from the ledger. It only goes up. It is shown in the header of the dashboard, every report and every board.

### 3.4 Anchoring and public receipts

- A daily GitHub Action reads the ledger head and commits `ledger/heads/YYYY-MM-DD.json` (`{ seq, hash, entries }`), then appends an `anchor` entry pointing at the commit. Git history is the timestamp. With `APEX_LEDGER_ANCHOR=git+ots` the job also creates an OpenTimestamps proof for the head hash and commits it.
- `apex ledger verify` checks the chain and every anchored head against the repo.
- A receipts page (`/receipts`, off by default, Jeremy switches it on in Settings because publishing is his call) lists each slot's forward paper record with entry sequence numbers and hashes, the anchors that cover them, and a "how to verify" note. It shows paper results exactly as they are, including retired slots. No account data, limits or keys appear on it.

## 4. Pre-registration (idea 3)

Nothing is evaluated without a `prereg` entry made first.

```ts
type Prereg = {
  trialKey: string;
  hypothesis: string;                 // one sentence, plain words
  source: string;                     // 'factory' | 'queue:<id>' | 'claim:<id>' | 'jeremy'
  strategy: { id, fingerprint }; panel: string; tf: string;
  gateVersion: string;                // hash of the frozen gate config
  passBar: string;                    // human summary generated from the gate config
  plannedVariants: number;            // how many siblings this idea will get (each still needs its own prereg)
}
```

- The **gate config** (thresholds for the six checks, holdout length, monkey runs and seed, beats-hold rule, firewall thresholds, forward gate thresholds) is a frozen object. Its SHA-256 is the `gateVersion`. A `gate_version` entry stores the full config. Changing any threshold creates a new version; the old one is never edited.
- `ledger.append('trial_result', ...)` is rejected unless a `prereg` with the same `trialKey` and `gateVersion` has a lower `seq`.
- The factory pre-registers automatically with the standard hypothesis text ("<strategy name> beats random entries, costs and buy and hold on <panel> <tf>"). Queue items and claim checks carry their own hypothesis.
- A result can never be re-labelled. If a different bar is wanted, that is a new gate version and a new trial.

## 5. Strategy factory

`factory.plan(registry, panels, ledger) -> Pair[]` lists every strategy and dataset pair whose timeframe fits, drops pairs whose data is `blocked`, and orders them: active slots first (always re-checked), then pairs never evaluated, then the rest oldest-first. `factory.run(pairs, budget)` evaluates up to `budget` pairs.

- The full run (GitHub Action, nightly) has no budget. The Vercel tick uses a budget sized to finish in the function limit and always covers active slots.
- An evaluation that throws is recorded as a `trial_result` with `error`, status `rejected`, and counts as a trial (a strategy that cannot run on a dataset did not pass on it).
- **Trial budget**: at most `APEX_TRIALS_PER_WEEK` (default 25) new trials per week are started automatically. More than that waits in the research queue for Jeremy's tap. This stops the system from burning its own statistical power, which is the bot-factory trap from the study.

## 6. The validation gate (standard bar v1)

Run on all bars of the dataset version, net of the cost model. A pair passes when all of these hold:

| # | Check | Rule (existing `stressSuite` unless noted) |
|---|---|---|
| 1 | Enough trades | 50 or more |
| 2 | Monkey test | Beats 95% of 1,000 random-entry runs with the same number of trades, holding periods and sides. Fixed seed from the gate config |
| 3 | Locked test window | Positive net return on the last 18 months alone |
| 4 | One bar late | Positive net return when every decision is delayed one bar |
| 5 | Double costs | Positive net return with costs doubled |
| 6 | Costs under half the moves | Total costs below 50% of gross profit |
| 7 | Beats hold on risk | Sharpe above the market's buy-and-hold Sharpe over the same bars, and total return above zero |

**First job after the build.** The 10 Nov 2026 stress board ran checks 1 to 6 only. Check 7 has not been run across the board. The one pair that passed six checks, `dave_prev_range` on SPY 1h, returned +9.1% against +25.4% for SPY hold over the same bars, with a drawdown of −8.3% against −20.5%. Whether it enters paper depends on the Sharpe comparison and the validator, and the design does not assume the answer. If it fails check 7 the honest state after Phase 1 is "nothing in paper", which the plan already names as a valid outcome.

Readouts that are shown but do not decide at this stage: deflated Sharpe at `N` trials, t-statistic and p-value of the Sharpe (`sharpeReport`), maximum drawdown, profit factor, average R, exposure, and the Monte Carlo drawdown range.

Result status: all pass gives `passed_pending_validation`; only check 1 failing gives `needs_data`; exactly one other failing gives `watch`; otherwise `rejected`. The `why` text lists each failed check with its number, as today.

Why the deflated Sharpe is a readout here and a requirement later: in-sample, with two years of data, almost nothing can clear a 95% deflated bar, and the six checks plus the forward period already do the filtering. The forward gate (section 8) is where it binds.

## 7. Independent validator (idea 10)

A pair that passes is not promoted by the run that found it.

1. The run appends `trial_result` with status `passed_pending_validation` and queues a validator job.
2. The validator job runs in a GitHub Action on a clean checkout at the same commit. It pulls the bars itself from the adapter (not from the object store), from the second source when one exists, runs the gate, and appends a `validator_run` with its own input and result hashes and an **independence level**:
   - **L1**: fresh process, fresh pull from the same source.
   - **L2**: fresh pull from a different source.
   - **L3**: a different engine implementation (the Python engine, for strategies that exist in both and pass the parity fixture).
3. **Agreement** means: same pass or fail on every check, trade count within 2%, net return within 1 percentage point, Sharpe within 0.1. L1 agreement on the same dataset version should be exact; any difference there is a bug and pulls the andon cord for the autopilot.
4. Promotion needs the original run plus one agreeing validator run at L2 where a second source exists, otherwise L1. L3 is recorded when available and shown as a badge.
5. Disagreement sets the pair to `watch` with the reason "validator disagreed", and opens a research queue item.

The validator also re-runs every active slot monthly and before any graduation or stage change. The LLM plays no part in the verdict. A reviewer model may write a plain-words note on the result afterwards, under the spend cap.

## 8. Incubator and graduation

### 8.1 Lock

On promotion: `slot_locked { slotKey, inputs, inputHash, lockedAt, gateVersion }` where `inputs` is the full set from 3.2. `lockedAt` is the close time of the last bar in the dataset version used, not the wall clock, so no bar the strategy was selected on can count as forward.

### 8.2 Two forward records

| Record | What it is | Used for |
|---|---|---|
| **Strategy record** | The strategy alone on bars after the lock: `backtest()` with entries before `lockedAt` removed, fixed 1% risk, cost model costs | Graduation, drift baseline comparison, the receipts page |
| **Book record** | What the paper book actually did: weights, guard blocks, loss-limit pauses, paper broker fills | Book equity, risk limits, the daily report |

For a single slot that the guard never blocks, the two must agree on every entry and exit bar. That is a test.

### 8.3 Monthly check and graduation

Each month, per slot, on the strategy record:
- `failed`: after 6 months, net return at or below zero or profit factor at or below 1. The slot is retired.
- `held up`: after 6 months, positive and profit factor above 1.
- **Strict forward gate** (existing `strictGate`): drawdown no worse than 15%, at least 3 profitable months, at least 50 forward trades, deflated Sharpe probability of at least 95%, positive alpha against the market's buy and hold.
- A slot becomes `live_eligible` when it has held up and passes the strict forward gate and a fresh validator run agrees. Each check is a `graduation_check` entry.

**Decision K1: which trial count deflates the forward record.** The forward record of a locked slot is out of sample for all the trials that were tried before the lock. The selection that can still fool us on forward data is among the slots that entered incubation. So the forward gate deflates by `M`, the number of slots ever locked (including retired and shadow slots), not by `N`. The report shows both numbers. Using `N` here would be wrong in the other direction: with 1,000 trials and six months of data, the bar would be an annual Sharpe above 4, which nothing honest clears, and the gate would stop measuring anything.

### 8.4 What the approved bar means in time (must be shown to Jeremy, not hidden)

The strict gate is the one Jeremy approved, and the design keeps it. The arithmetic matters for expectations:

- **Fifty forward trades.** `dave_prev_range` on SPY 1h made 51 trades in two years. Alone it reaches 50 forward trades in about two years, not six months.
- **Deflated Sharpe of 95%.** With `M = 5` slots tried, a strategy needs an observed annual Sharpe of roughly 4 to pass after six months, roughly 2.6 after one year, and roughly 2.0 after two years. With `M = 1` the figures are about 2.3, 1.6 and 1.2.

Two honest ways to get there sooner, both inside the approved rules:
1. **Pooled slots.** A slot may be pre-registered over a panel (for example SPY, QQQ and IWM at 1h) as one hypothesis. Trades accumulate across its symbols, so 50 forward trades can arrive in under a year. It is one trial and one slot, and it must pass the gate pooled.
2. **Patience.** A slot that has held up but not yet passed stays in paper and is re-checked monthly. The evidence grows with time.

The dashboard shows a **graduation clock** per slot: forward trades so far against 50, the current deflated probability, and the earliest month it could pass if its forward Sharpe stays where it is. If Jeremy later wants a different bar, that is a new gate version in the ledger, decided by him, never a quiet edit.

## 9. Portfolio weights and correlation dedupe (idea 5)

**Dedupe at promotion.** Before a new slot gets a weight, its in-sample daily returns are correlated with each active primary slot over their overlapping days (at least 60). If any correlation is above 0.8 the new slot becomes a **shadow** of that primary: it is locked and its strategy record is tracked like any other, but it has weight 0 and creates no orders. If a primary retires, its best shadow by forward Sharpe (with at least 3 months forward) becomes primary, keeping its own lock date.

**Weights** (primary slots only), recomputed when the set of primaries changes and on the first run of each month:
1. With at least 2 primaries and 30 aligned days: inverse-volatility weights on in-sample daily returns. Otherwise equal weights.
2. Cap each weight at 25% by water-filling (excess is redistributed to uncapped slots; if all are capped the remainder stays in cash). Weights sum to at most 1.
3. Risk scale: `riskFraction_i = riskPerTrade × (w_i / max_j w_j)`. The largest-weight slot trades at the full 1%; the rest are scaled down. One slot alone trades at 1%.

No optimiser. The study showed in-sample max-Sharpe weights lose out of sample. `weightsFor(..., 'max_sharpe')` stays research-only and the pipeline may not import it (lint rule).

## 10. Paper execution

### 10.1 From bar to fill

```
new closed bar for a primary slot
  -> signal on that bar?  (le or se at the last index; one intent per slot per bar)
  -> Intent { id = sha256(slotKey, barT, side), slotKey, symbol, side, refPrice = bar close, stop, target, riskFraction }
  -> guard.checkIntent(intent, book, limits, context)        (section 11)
       blocked -> ledger 'intent_blocked' with rule ids
       ok      -> ledger 'intent' with qty and riskUsd -> broker.submit(guardedIntent)
  -> paper broker fills at the next bar's open, with spread and slippage from the cost model
  -> on each later bar: stop first, then target, then signal exit or max bars (same order as backtest())
  -> every fill -> ledger 'fill' -> positions and book updated
```

A stop that is missing or on the wrong side blocks the intent. (The backtester substitutes a 2×ATR stop in that case; the pipeline does not, because a live system must never invent a stop. A strategy that relies on the fallback must declare an explicit ATR stop.)

### 10.2 Broker interface

```ts
interface Broker {
  id: string; mode: 'paper' | 'live';
  submit(i: GuardedIntent): Promise<OrderAck>;       // idempotent on i.id
  onBar(symbol: string, bar: Bar): Promise<Fill[]>;  // paper: advances the simulator. live: no-op
  positions(): Promise<Position[]>; openOrders(): Promise<Order[]>; equity(): Promise<number>;
}
```

- `BarSimBroker` (default): the simulator above. Deterministic. Its fill logic is the same code path as `backtest()` (extract the per-bar position logic from `core.ts` into one shared function so they cannot drift; a parity test replays a backtest through the broker and expects identical trades).
- `AlpacaPaperBroker` (optional, later in Phase 1): sends the same intents to Alpaca's paper API with paper keys, to measure real quotes and fills for the cost model. Paper keys only; the adapter refuses a live endpoint.
- Live adapters are not built. See `02` section 6.

### 10.3 Book

`book` is derived from fills: cash, open positions, equity marked at each run from last closes, high-water mark, realised P&L by UTC day and ISO week. A `book_snapshot` entry is written at the end of every run. Starting equity is `APEX_PAPER_CAPITAL`.

## 11. Risk guard

`guard.checkIntent(intent, book, limits, ctx) -> { ok, qty, riskUsd, rules: { id, pass, detail }[] }`. Pure. Every rule is evaluated every time (no short-circuit) so the report can show all reasons. An intent passes only if every rule passes.

| Rule id | Blocks when |
|---|---|
| `halted` | Kill switch or andon cord is on, or halt state unreadable |
| `book-paused` | Daily loss, weekly loss or drawdown limit reached |
| `slot-paused` | Slot is `paused_drift`, `paused_data`, `retired` or shadow |
| `data-blocked` | Firewall status for the symbol is `blocked` |
| `stop-required` | No finite stop, zero distance, or stop on the wrong side |
| `max-open` | Open positions at the limit |
| `max-per-symbol` | Already at the per-symbol limit |
| `one-per-slot` | Slot already has an open position or a pending intent |
| `cooldown` | Slot was stopped out fewer than `APEX_COOLDOWN_BARS` bars ago |
| `class-exposure` | Open risk in the intent's asset class would exceed the class cap |
| `correlated-risk` | Combined open risk across positions whose 60-day return correlation with this symbol is above 0.7 would exceed the cap |
| `min-size` | Quantity rounds to zero or below the venue minimum |
| `notional` | Quantity capped so notional is at most equity × weight (never leverage); if the cap leaves less than half the intended risk, block instead of taking an odd size |
| `reconcile` (live stages only) | Broker and book disagree |

Size: `qty = equity × riskFraction ÷ |entry − stop|`, then the notional cap, then the venue's lot rounding (down). `riskUsd` is recomputed from the final quantity. `GuardedIntent` is a branded type that only this function returns.

The existing `engine/apex_engine/risk.py`, `bots/paper-exchange/.../risk.py` and each bot's own risk file keep their own checks; a shared JSON test-vector file (`packages/kernel/test/guard-vectors.json`) is run against the TS guard and the Python paper-exchange guard so the two agree on the common rules.

## 12. Drift alarm (idea 4)

Compares each slot's forward trades with its own backtest distribution and pauses it before the drawdown limit does.

Baseline, frozen at lock: per-trade R values from the in-sample backtest, giving mean `μ0`, standard deviation `σ0`, win rate `p0`, and the 95th percentile of maximum drawdown from 1,000 bootstrap resamples (`monteCarlo`, existing).

After each closed forward trade with R value `r`:

| Monitor | Statistic | Alarm |
|---|---|---|
| Mean R (one-sided CUSUM) | `z = clip((r − μ0)/σ0, −3, 3)`; `S = max(0, S − z − 0.5)` | `S > 4` |
| Win rate | `P(X ≤ wins | n, p0)` from the binomial, once `n ≥ 10` | below 0.01 |
| Drawdown | Forward maximum drawdown in R units | beyond the baseline 95th percentile |
| Cost | Median measured cost per trade against the cost model | above 2× |

The CUSUM parameters (allowance 0.5σ, threshold 4) give roughly one false alarm per 170 trades when nothing has changed, and detect a 1σ drop in mean R in about 8 trades. They live in the gate config.

On alarm: `slot_status -> paused_drift` with the readings. No new entries; an open paper position keeps its stop. The validator re-runs the slot. Jeremy then chooses resume (the CUSUM resets, the alarm stays on the record) or retire. Three drift pauses on one slot retire it automatically.

Every reading is a `drift_reading` entry, so the slot page can chart `S` over time.

## 13. Venue cost model (idea 7)

```ts
type CostModel = { version: string; rows: CostRow[] }
type CostRow = { venue: string; assetClass: string; bucket: 'mega'|'liquid'|'thin'; feeBps: number; halfSpreadBps: number; slipBps: number; n: number; source: 'prior'|'measured' }
```

- One-way cost in a backtest or the simulator is `feeBps + halfSpreadBps + slipBps` for the row matching the dataset. This replaces the single `fee` number on `Dataset` in the draft.
- **Priors** ship in `packages/autopilot/src/costs.prior.json`, deliberately on the high side, each with a comment saying where the number came from. The 4 bp round trip used in the study for liquid ETFs is the floor, not the default.
- **Measurement**: when an intent is created, the pipeline records the best bid and ask at that moment if a quote source exists (Alpaca latest quote for stocks, the recorder for crypto). When the paper venue returns a real fill (Alpaca paper), slippage is the fill against the mid. Each observation is a `cost_obs` row.
- **Update**, monthly: for a row with 30 or more observations, the new value is the 75th percentile of the observations (not the mean: costs are judged pessimistically). A value may rise freely. It may fall by at most half per update, and never below the prior's floor without Jeremy's acknowledgement. A new `cost_model` entry records the version.
- A new cost model triggers re-validation of active slots (not new trials). A slot whose check 5 or 6 now fails is retired with that reason.

Without a quote source, the model stays on priors and the report says "costs are assumed, not measured" next to every affected number.

## 14. Regime panel (idea 9)

Context only. `packages/autopilot/src/regime.ts`, computed daily per asset class from the `daily-long` panel:

| Reading | Definition | Labels |
|---|---|---|
| Trend | Benchmark close against its 200-day average, and ADX(14) | up, down, range |
| Volatility | 20-day realised volatility as a percentile of the last 2 years | low (<33), normal, high (>67) |
| Correlation | Mean pairwise 60-day correlation across the panel, as a percentile of the last 2 years | low, normal, high |

Shown next to each slot with that slot's own in-sample results split by regime, each bucket with its trade count. It never changes a weight, a status or an order. A lint rule forbids importing `regime.ts` from the pipeline, the guard or the broker, and the panel carries a fixed line: "Regime filters did not help in our tests. This is context, not a switch."

## 15. Daily report

Written at the end of the daily run as Markdown, stored in the object store and indexed in `reports`. Sections, in this order, from a fixed template (golden-file tested):

1. **Status line.** Mode (paper), halts, data problems, anything waiting on Jeremy.
2. **Funnel.** Pairs, evaluated this run, trials ever (`N`), counts by status, slots ever locked (`M`).
3. **Paper book.** Equity, day, week, drawdown, against the diversified core and SPY hold over the same period. Open positions with stop and risk.
4. **Slots.** Each slot: status, weight, forward months, forward trades against 50, forward return, deflated probability, drift state, graduation clock.
5. **New intents and blocks.** Each with rule ids.
6. **Closest near misses.** Top 10 by checks passed, then Sharpe.
7. **Research queue.** New items and why.
8. **Data.** Provenance table and any warnings.
9. **Costs.** Measured or assumed.
10. **Ledger.** Entries added, head hash, last anchor.
11. **AI review** (optional, under the spend cap): a short note from the reporter agent, which receives only the numbers above and the fixed instructions from `dailyReviewPrompt`.

Fixed wording: the first line always says "Paper mode. Nothing here is proven or guaranteed." If no slot is active, section 4 says "Nothing has passed yet. The diversified core is the benchmark."

Delivery: dashboard (Reports), Telegram (sections 1 to 5, shortened, with a link), optional Discord webhook. A weekly digest and a monthly re-validation report use the same template with wider windows.

## 16. Research queue

```ts
type QueueItem = { id; kind: 'variant'|'new_rule'|'data'|'near_miss'|'gap'|'claim'; title; why; source; draftPrereg?: Prereg;
  needs: string[];                       // e.g. ['data:daily-long']
  cost: { trials: number; aiUsd: number };
  status: 'proposed'|'approved'|'running'|'done'|'dropped'; createdBy; decidedBy? }
```

Seeded with the nine Phase 3 tests in the plan's order. Sources of new items: near misses and `needs_data` results, the gap map, the scout agent, claim checks, Jeremy. Items whose needs are met and which fit the weekly trial budget are approved automatically if they came from the approved plan; items proposed by an agent wait for Jeremy's tap. Running an item means writing its preregs and letting the factory pick them up.

## 17. What the draft gets wrong (do not carry over)

| Draft behaviour | Problem | Design |
|---|---|---|
| `pnlSince()` returns 0 | Daily and weekly loss limits never fire | Book is derived from fills (10.3) |
| Open positions are "orders younger than 30 days" | Wrong position count and exposure | Positions from fills |
| Order entry price is the signal bar's close; no fill, no exit handling | Paper record does not match the backtest | Paper broker with next-open fills and stop-first exits (10) |
| `lockForIncubation` hashes id and dataset id with 32-bit FNV, `lockedAt = now` | Weak hash; lock does not cover code, gate or costs; wall-clock lock can admit a selected-on bar | SHA-256 over full inputs; `lockedAt` is the last bar's close (8.1) |
| A paper slot is retired the first time the in-sample re-run fails | In-sample checks move when new bars arrive; a slot would be retired for noise, and re-judging on selected data is not forward evidence | Retirement comes from the forward record, the monthly re-validation, drift, or costs (8.3, 12, 13) |
| Forward gate deflates by `trialsEver` | Unpassable bar (8.3) | Deflate by `M`, show `N` |
| Promotion in the same run that found the pair | No independent check | Validator (7) |
| Weight cap loop does not redistribute | Weights do not sum correctly | Water-filling (9) |
| Risk = 1% × weight | One of four slots trades at 0.25% for no stated reason | Risk scale relative to the largest weight (9) |
| Trials counted from mutable state (`tried[]`) | Can be lost or reset | Counted from the ledger |
| Evaluation errors are swallowed (`catch → null`) | Silent gaps | Recorded as failed trials |
| One `fee` per dataset, slip = fee ÷ 2 | Guessed costs | Cost model (13) |
| State is one JSON blob, orders capped at 500 | History lost | Tables and ledger (18) |

## 18. Data model

Postgres. The ledger is the record; the other tables are projections that make queries fast and can be rebuilt by replaying the ledger (`apex ledger replay --check` compares). Migrations live in `db/migrations/NNNN_name.sql`.

```sql
ledger(seq bigserial primary key, ts timestamptz, kind text, actor text, payload jsonb, payload_hash char(64), prev_hash char(64), hash char(64) unique)
gate_versions(version char(64) primary key, config jsonb, created_seq bigint)
strategies(id text primary key, fingerprint char(64), name text, source text, style text, tf text, direction text, kind text /* builtin|spec */, spec jsonb, frozen boolean)
datasets(id text primary key, source text, symbol text, tf text, asset_class text, adj text, session text, calendar text, panel text[], current_version char(64))
dataset_versions(dataset text, version char(64), rows int, first_t timestamptz, last_t timestamptz, fetched_at timestamptz, uri text, primary key(dataset, version))
data_health(id bigserial, dataset text, version char(64), at timestamptz, status text, checks jsonb, provenance jsonb)
preregs(trial_key char(64) primary key, seq bigint, hypothesis text, source text, strategy text, fingerprint char(64), panel text, tf text, gate_version char(64), planned_variants int)
trials(trial_key char(64) primary key, first_seq bigint, strategy text, panel text, tf text)            -- N = count(*)
evaluations(id bigserial, trial_key char(64), seq bigint, dataset_version char(64), input_hash char(64), result_hash char(64),
            status text, trades int, ret numeric, hold numeric, dd numeric, sharpe numeric, hold_sharpe numeric, dsr_n numeric, checks jsonb, why text, run_id text)
validator_runs(id bigserial, trial_key char(64), seq bigint, level text, source text, input_hash char(64), result_hash char(64), agrees boolean, diffs jsonb)
slots(key text primary key, trial_key char(64), strategy text, panel text, role text /* primary|shadow */, shadow_of text, status text, locked_at timestamptz,
      lock_hash char(64), weight numeric, risk_fraction numeric, baseline jsonb, cusum numeric, drift_pauses int, stage text, updated_seq bigint)
slot_events(id bigserial, slot text, seq bigint, from_status text, to_status text, reason text, numbers jsonb)
forward_records(slot text, as_of timestamptz, months numeric, trades int, ret numeric, pf numeric, dd numeric, sharpe numeric, dsr_m numeric, dsr_n numeric, state text, primary key(slot, as_of))
intents(id char(64) primary key, seq bigint, slot text, symbol text, side smallint, bar_t timestamptz, ref_price numeric, stop numeric, target numeric,
        qty numeric, risk_usd numeric, ok boolean, rules jsonb, mode text)
fills(id bigserial, intent char(64), seq bigint, t timestamptz, kind text /* entry|stop|target|signal|time */, price numeric, qty numeric, fee numeric, slip numeric, mode text)
positions(slot text primary key, symbol text, side smallint, qty numeric, entry numeric, stop numeric, target numeric, opened_at timestamptz, risk_usd numeric, mode text)   -- maintained from fills
book_snapshots(at timestamptz primary key, equity numeric, cash numeric, peak numeric, day_pnl numeric, week_pnl numeric, open_risk numeric, mode text)
weights(at timestamptz, slot text, weight numeric, method text, primary key(at, slot))
cost_obs(id bigserial, at timestamptz, venue text, symbol text, half_spread_bps numeric, slip_bps numeric, fee_bps numeric, source text)
cost_models(version char(64) primary key, rows jsonb, created_seq bigint)
limits_snapshots(seq bigint primary key, limits jsonb, pending jsonb)
research_queue(id text primary key, kind text, title text, why text, source text, draft jsonb, needs text[], cost jsonb, status text, created_by text, decided_by text, created_at timestamptz, updated_at timestamptz)
runs(id text primary key, started timestamptz, finished timestamptz, kind text, commit text, budget int, evaluated int, errors int, summary jsonb)
reports(id text primary key, kind text, at timestamptz, uri text, summary jsonb)
api_keys(id text primary key, name text, hash char(64), scopes text[], created_at timestamptz, last_used timestamptz, revoked_at timestamptz)
```

`ledger`, `trials`, `evaluations`, `validator_runs`, `fills`, `slot_events`, `gate_versions`, `cost_models`: the application role has `INSERT` and `SELECT` only, and a trigger raises on `UPDATE` or `DELETE`.

## 19. Pipeline shape

`runAutopilot(input) -> output` stays a pure function, as in the draft, with the side effects at the edges:

```ts
type RunInput = { now; datasets: LoadedDataset[]; health: DataHealth[]; registry: StratDef[]; ledgerView: LedgerView; limits: RiskLimits; halts: Halts;
                  costModel: CostModel; gate: GateConfig; budget?: number; mode: 'tick'|'full'|'validator' }
type RunOutput = { appends: { kind; payload }[]; report: ReportData; queue: QueueItem[] }
```

The caller (CLI or cron route) loads the input through `packages/store`, calls the function, writes `appends` in order inside one transaction per logical step, and renders the report. A run holds a Redis lock (`apex:run`) so two runs cannot interleave; a second caller exits with "a run is in progress". Replaying the same input gives byte-identical appends, which is what makes the validator and the golden tests possible.

## 20. Tests (minimum set)

- **Ledger**: chain verify; tamper detection; result without prereg rejected; concurrent appends serialise; canonical JSON vectors.
- **Trials**: the counting table in 3.3, one test per row.
- **Gate**: a planted-edge series passes; pure noise fails; a look-ahead strategy fails check 4; 500 no-edge strategies yield zero promotions (the existing selftest idea, now end to end).
- **Validator**: identical inputs agree exactly; a perturbed second source within tolerance agrees; outside tolerance disagrees.
- **Incubator**: no pre-lock bar contributes; lock hash changes with every hashed input; strategy record equals book record for an unblocked single slot.
- **Graduation**: a synthetic slot with a known Sharpe crosses the gate at the month the formula predicts; `M` versus `N` readouts.
- **Guard**: one test per rule, plus the shared vectors; mutation testing must kill every mutant in `guard.ts`.
- **Paper broker**: parity with `backtest()` on three fixtures; idempotent submit; gap-through-stop fills at the open.
- **Drift**: no alarm on resamples of the baseline (false alarm rate inside the expected band over 1,000 runs); alarm within 12 trades on a 1σ shift.
- **Dedupe and weights**: a 0.9-correlated clone becomes a shadow; water-filling sums and caps.
- **Cost model**: update rules; pessimistic percentile; floor.
- **Pipeline**: replay determinism; a full fixture run matches the golden report; halted input produces zero intents.
- **Regime**: import-ban lint passes; panel never appears in any pipeline decision path.
