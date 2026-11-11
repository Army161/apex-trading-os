# The ledger does not verify

## How you notice
`npm run apex -- ledger verify` exits with code 4. It names the first bad entry, or says a saved head does not match. The nightly workflow fails at a verify step. `npm run apex -- doctor` reports the chain as broken.

## Safe first step
A damaged ledger file stops the autopilot by itself: `run`, `validate`, `ledger anchor` and `halt` all refuse it with exit code 4 and write nothing, because nothing is appended to a broken chain. So the terminal halt cannot be recorded in this case. Press the Halt button on the dashboard, which also sets the dashboard's own switch, and leave the nightly workflow failing until the ledger is restored. If the file itself is whole and only a saved head does not match, `npm run apex -- halt "ledger does not verify"` works and should be the first thing you do.

## Steps
1. Find the first bad entry: the `badSeq` in the output. Everything before it is intact.
2. Decide which kind it is:
   - "does not match entry N: the ledger was changed after that day" means the chain differs from a head saved by an earlier anchor. Something was rewritten after that date.
   - A broken hash at an entry means that entry or the one before it was changed or lost.
   - "the ledger has no such entry" means the ledger was cut short.
3. Compare with history. The `apex-state` branch holds every night's ledger file and the `heads` folder. Find the last commit whose ledger verifies.
4. Restore from that copy: `restore.md`.
5. Never edit an entry to make the chain pass. An edited entry is exactly what this check exists to catch.

## How to confirm
`npm run apex -- ledger verify` exits 0 and reports every saved head as matching.

## What to write down
An incident note (`incident-template.md`): the bad entry number, which copy was restored, and which entries, if any, were lost. Then resume from the dashboard with that reason.
