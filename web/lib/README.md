# web/lib

The dashboard's server code: the strategy engine (`engine/`), the agent policy gateway (`policy.ts`), the model gateway (`gateway.ts`) and router (`router.ts`), memory, usage and the store.

## Invariants
These must always stay true. `python3 tools/drift_check.py` checks them.
- `policy.ts` refuses order, withdraw, transfer and pay for every agent, through the `no-money-tools` hard rule that no config can remove.
- Send, sign and delete wait for Jeremy's yes. New agents start on "ask".
- `gateway.ts` is the only file that calls a model provider.
- Secrets are redacted before anything is logged or stored (`redact()` in `policy.ts`, `looksSecret` in `memory.ts`).
- A strategy only counts as having an edge if it passes `engine/validate.ts`: 50 or more trades, beats 95% of random traders, makes money on locked test data, and survives fees.
- Going live with a strategy needs the second-opinion review (`review.ts`) and Jeremy's own switch.
