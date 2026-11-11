# The run failed

## How you notice
No report arrived. The nightly workflow is red in the repository's Actions tab. `npm run apex -- status` shows a last run older than a day. The Automations screen shows the last run of `autopilot-full` from the ledger.

## Safe first step
Read before rerunning. The run is safe to repeat: an intent for the same slot and bar is written once, and a pair already evaluated is not counted again.

## Steps
1. Open the failed workflow run and read the step that failed. The steps are, in order: verify the ledger, refresh bars, validator, run, verify again, anchor, save state.
2. If a verify step failed, stop and go to `ledger-verify-failed.md`.
3. If "another run holds the lock" appears: a run is still going, or one died. The file lock is given up by itself after 2 hours. With Postgres the lock ends when the connection ends.
4. Try it without writing anything: `npm run apex -- run --dry-run`. It prints the report it would write.
5. Run `npm run apex -- doctor` for the config, the chain, the data and the strategy fingerprints in one go.
6. Start the workflow again from the Actions tab ("Run workflow").

## How to confirm
The workflow is green, a new `run` entry is in the ledger (`npm run apex -- ledger tail --kind run`), and the report is under Autopilot, Reports.

## What to write down
Nothing if a rerun fixed it. If a night was missed, note the date in an incident note: the forward record has a gap of one day.
