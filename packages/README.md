# packages

The autopilot core. Design: `docs/design/` (start with `00-README.md`, then `04-autopilot-core.md`).

| Package | What it is | Imports |
|---|---|---|
| `engine` | Strategies (including the research-queue tests in `queue.ts`), indicators, `backtest()`, the six-check validator, deflated Sharpe, fingerprints, the look-ahead test, the rule language (`spec.ts`, version 2) and the template catalog (`templates.ts`) | nothing in this repo |
| `kernel` | Canonical JSON and hashing, the hash-chained ledger, gate `standard-bar-v1`, the risk guard, the four live locks, config, the ledger view | `engine` |
| `data` | Dataset registry, source adapters, the terms gate, the data firewall | `engine`, `kernel` |
| `store` | Ledger drivers: JSON-lines file and Postgres | `kernel` |
| `autopilot` | The run: paper broker, incubator, graduation, drift, weights, cost model, report | `engine`, `kernel`, `data` |
| `claims` | The claim checker: intake (size limit, key redaction, injection and sales flags), the extraction shape and its checks against the source, mapping to a template or a rule spec, the gate run, the four verdicts and the report wording | `engine`, `kernel`, `data`, `autopilot` |
| `ui` | The design system: colour tokens for light and dark (`tokens.ts` generates `tokens.css`), the status vocabulary, number formats and fixed phrases, and the display components (`Metric`, checks table, funnel, graduation clock, receipts, banners, claim compare) | `react` only |
| `sdk` | The v1 API contract (every route, scope and shape), the OpenAPI document built from it, a response checker, and the typed client with `paginate`, `waitForClaimCheck` and `verifyReceipt` | nothing in this repo |
| `api` | What each v1 route returns: the ledger queries (`queries.ts`), the status line (`status.ts`) and one handler a route (`handlers.ts`). The dashboard serves them and the terminal calls them directly, so both print the same figure | `kernel`, `sdk` |

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
- A claim check is judged only by the gate. Text from a source or from the model is data: it is quoted, never obeyed, and the source text itself never goes into the ledger. The checker never writes "scam", "fake" or "proven".
- A figure on screen goes through `Metric`, which will not render without its sample size and its basis. A status is always a label and a shape as well as a colour, and the live colour is used for live states only.
- No package here calls a model. The claim checker is handed its extraction; the app makes that call through `web/lib/gateway.ts`.
- No GPL or AGPL code is copied in. Secrets are never written to the ledger, a log or a report.
- The v1 API contract in `sdk/src/contract.ts` has no route or scope that trades, approves, resumes, changes a limit or goes live. Its only writes are a claim check and a halt. `docs/design/openapi.yaml` is written from it by `npm run openapi` and never by hand.
- `api` reads only what it is handed: entries, a view, config, a clock value and a few functions. It imports no store, no file system, no network and no environment, and a test in `web/test/api.test.ts` holds that.

## Checks

```
npm run typecheck && npm test
npm run apex -- strategies fingerprint --check
python3 tools/drift_check.py && node tools/protected_paths.mjs --self-check
```

The Postgres test runs when `APEX_TEST_DATABASE_URL` is set (CI sets it).
