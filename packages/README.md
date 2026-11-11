# packages

The autopilot core. Design: `docs/design/` (start with `00-README.md`, then `04-autopilot-core.md`).

| Package | What it is | Imports |
|---|---|---|
| `engine` | Strategies (including the research-queue tests in `queue.ts`), indicators, `backtest()`, the six-check validator, deflated Sharpe, fingerprints, the look-ahead test, the rule language (`spec.ts`, version 2) and the template catalog (`templates.ts`) | nothing in this repo |
| `kernel` | Canonical JSON and hashing, the hash-chained ledger, gate `standard-bar-v1`, the risk guard, the four live locks, config, the ledger view | `engine` |
| `data` | Dataset registry, source adapters, the terms gate, the data firewall | `engine`, `kernel` |
| `store` | Ledger drivers: JSON-lines file and Postgres | `kernel` |
| `autopilot` | The run: paper broker, incubator, graduation, drift, weights, cost model, report | `engine`, `kernel`, `data` |

`apps/cli` is the `apex` command and the code the nightly job runs. It is the only place here that touches disk, clock, network or environment.

## Invariants

- Everything starts in paper. No package here holds a broker client, an order call, a transfer, a withdrawal or a payment. Going live needs the four locks in `kernel/src/locks.ts`, and three of them are Jeremy's alone.
- Nothing is evaluated without a pre-registration with a lower ledger sequence number. The ledger refuses a result that has none.
- A pair is never promoted by the run that found it. Promotion needs an agreeing validator run that is already in the ledger.
- A slot is judged only on bars after its lock.
- Every order intent goes through `checkIntent`. Size comes from nowhere else. A failed rule is recorded as `intent_blocked`.
- The ledger is append-only and hash-chained. Nothing rewrites or deletes an entry. State is rebuilt by replaying it.
- `runAutopilot` is a pure function: no clock, no network, no environment. The same input gives byte-identical output.
- Gate thresholds and limit ceilings are frozen constants. Changing a gate threshold makes a new gate version and new trials.
- A locked strategy does not change. A changed strategy is registered under a new id.
- Results are reported honestly: every return carries its sample size and whether it is in-sample or forward, costs are called assumed until measured, and "passed all seven checks" is never written as "proven".
- No GPL or AGPL code is copied in. Secrets are never written to the ledger, a log or a report.

## Checks

```
npm run typecheck && npm test
npm run apex -- strategies fingerprint --check
python3 tools/drift_check.py && node tools/protected_paths.mjs --self-check
```

The Postgres test runs when `APEX_TEST_DATABASE_URL` is set (CI sets it).
