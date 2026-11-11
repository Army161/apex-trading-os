# ADR 0001: decisions made while building phases 0 to 2

Date: 2026-11-11. Status: in force. These are the places where the build had to choose, or where it departs from `docs/design/`. Each is small. None loosens a safety rule.

| # | Decision | Why |
|---|---|---|
| 1 | Packages export TypeScript source and run with `tsx`. No build step | One toolchain for the CLI, tests and Next.js (`transpilePackages`) |
| 2 | A ledger kind `run` was added | A run with no other effect still needs a record, for the heartbeat and for run-by-run audit |
| 3 | Check 5 doubles both fee and slippage | The design says "2x costs". Doubling only the fee would be the easier reading |
| 4 | Cost priors are slightly above the study's numbers | Costs are judged pessimistically until paper fills are measured |
| 5 | Class exposure cap is `maxClassPct x maxOpen x riskPct x equity` | The design gave a percentage without a base. This reading caps open risk, which is what the rule is for |
| 6 | The file ledger (`.apex/ledger.jsonl`, on the `apex-state` branch in CI) is the ledger of record until `DATABASE_URL` exists | It is durable and append-only, and git history is a second witness. Postgres takes over without a format change |
| 7 | 4h bars use the same epoch-aligned resample as the earlier stress board | Results stay comparable with the 10 Nov board. A session-anchored builder is deferred |
| 8 | A slot whose monthly re-validation no longer reproduces is paused (`paused_data`), not retired | Retirement comes only from the forward record or drift. A data restatement should stop trading, not erase the slot |
| 9 | A paper entry whose open gaps past its stop is cancelled | `backtest()` invents a stop in that case. A system that could go live must never invent one |
| 10 | The validator runs as a separate step before the run, in the same nightly job | A separate workflow needs shared state between jobs. Rule K2 still holds: a pair found tonight is validated tomorrow |
| 11 | Massive's terms are recorded in `data/SOURCES.md` from the approved plan. The build did not re-read them | Accepting terms is Jeremy's. The entry says so |
| 12 | The "diversified core" benchmark is not built. The report says so instead of showing a comparison | It needs the long daily history (Tiingo terms are open) |
| 13 | Refreshed bars extend the committed files in the state directory. The dataset id does not change | Per `04` section 3.3, the same pair on newer bars is the same trial. History is appended to, never refetched |
| 14 | The deflated-Sharpe readout uses every trial ever plus every new pair in the registry | Otherwise the readout depended on the order pairs were evaluated in. It is a readout only and is not part of the result hash |
| 15 | Workflow actions are pinned to major tags (`@v4`), not commit hashes | The build container could not look the hashes up. Pinning by hash is a follow-up |
| 16 | Fingerprint fixtures are frozen copies of three committed data files | Deterministic across machines. They must never be refreshed |

## Open question for Jeremy

With one slot, the weight cap is 25% of equity and there is no leverage. On `dave_prev_range` SPY 1h the stops are tight, so the cap leaves less than half of the intended risk on 68 of 79 past signals. The guard blocks those (`minRiskShareAfterCap` is 0.5). Graduation is not affected, because the slot's own record is kept at fixed risk. The paper book would take few of its trades. The safe alternative is to take the smaller capped size instead of blocking. That changes a gate setting, so it makes a new gate version, and it is Jeremy's call.
