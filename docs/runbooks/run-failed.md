# The run failed

## How you notice
GitHub emails you that the nightly workflow failed, and it is red in the repository's Actions tab. No report arrived. `npm run apex -- status` shows a last run older than a day. The Automations screen shows the last run of `autopilot-full` from the ledger. Telegram is optional, so GitHub's email is the alarm that always reaches you: keep failed-workflow emails on (GitHub, Settings, Notifications, Actions).

## Safe first step
Read before rerunning. The run is safe to repeat: an intent for the same slot and bar is written once, and a pair already evaluated is not counted again. A red night is not a lost night: a bad pull or a validator andon no longer stops the run, and state is saved every night.

## Steps
1. Open the failed workflow run and read the step that failed. The steps are, in order: verify the ledger, refresh bars, validator, run, verify again, anchor, save state, and last "Check the paper clock is moving".
2. If only the last step is red, the night ran and was saved, but the forward clock may not have moved. Its error lines say why:
   - "The bar refresh did not complete": open the "refresh bars" step. Each `Problem:` line names a symbol. "MASSIVE_API_KEY is not set" means the secret is missing: add it (docs/branch-protection.md). Without it no new bars arrive, no paper slot gets a new bar, and the forward clock never moves. "HTTP 401" or "HTTP 403" means the provider refused the key or the plan does not cover that symbol: check the plan at the provider. "HTTP 429" or a 5xx is the provider's own trouble; the next night tries again.
   - "Stale: <dataset>": the newest bar is more than 36 trading hours old. Weekends and US market holidays do not count for stocks and ETFs, weekends do not count for currencies, and every hour counts for crypto. The cause is usually a pull problem the same night. If the pull was clean, the provider has not published the bars yet, or the exchange closed for a day that is not on the holiday list: rerun the next day. Then follow `data-outage.md`.
   - "The validator pulled the andon cord": go to `validator-disagrees.md`. The run still went, opened nothing new, and its report says the cord is pulled. The job stays red each night until that is sorted out and you resume on the dashboard.
3. If a verify step failed, stop and go to `ledger-verify-failed.md`.
4. If "another run holds the lock" appears: with the file ledger, the nightly clears a lock left by a killed run when it starts and again before it saves, so a lock no longer carries over to the next night. On your own machine a run may still be going, or one died; the file lock is given up by itself after 2 hours. With Postgres the lock ends when the connection ends.
5. Try it without writing anything: `npm run apex -- run --dry-run`. It prints the report it would write.
6. Run `npm run apex -- doctor` for the config, the chain, the data and the strategy fingerprints in one go, and `npm run apex -- data health` for the newest bar of each dataset. The same freshness check the workflow makes is `apex data fresh --max-age-hours 36` (exit 4 when stale); run it with `APEX_STATE_DIR` set to the `state` folder of a checkout of the `apex-state` branch, where the refreshed bars are.
7. Start the workflow again from the Actions tab ("Run workflow").

## How to confirm
The workflow is green, including its last step, which prints "The paper clock is moving". A new `run` entry is in the ledger (`npm run apex -- ledger tail --kind run`), and the report is under Autopilot, Reports.

## What to write down
Nothing if a rerun fixed it. If a night was missed, or the last step was red because no new bars arrived, note the dates in an incident note: the forward record has a gap for those days.
