# Runbooks

Short pages for when something goes wrong. Each has the same five parts: how you notice, the safe first step, the steps, how to confirm it is fixed, and what to write down.

Every command is run from the repository root as `npm run apex -- <command>`. Each page says plainly where a step is not built yet. Everything here is paper trading: none of these steps can place an order.

| Runbook | When |
|---|---|
| [halt-and-resume.md](halt-and-resume.md) | You want everything to stop, or want to start again after a halt |
| [data-outage.md](data-outage.md) | A dataset is blocked or stale |
| [run-failed.md](run-failed.md) | The nightly run failed or did not happen |
| [ledger-verify-failed.md](ledger-verify-failed.md) | `ledger verify` reports a broken chain or a head that does not match |
| [validator-disagrees.md](validator-disagrees.md) | The independent re-run does not reproduce a result |
| [drift-pause.md](drift-pause.md) | A slot was paused by the drift alarm |
| [restore.md](restore.md) | The ledger was lost or damaged and has to come back from a copy |
| [rotate-keys.md](rotate-keys.md) | A key or password may have leaked, or it is time to change them |
| [going-live.md](going-live.md) | Before any real money. Most of it cannot be done yet |
| [incident-template.md](incident-template.md) | After any of the above: the note to write |

`apps/cli/test/runbooks.test.ts` rehearses the command sequences on the demo ledger and fails if a page names a command that does not exist.
