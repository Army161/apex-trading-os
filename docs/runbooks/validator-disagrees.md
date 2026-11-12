# The validator disagrees

## How you notice
A report or the Research queue lists "Validator disagreed on ...". A pair stays at "passed, pending validation". A paper slot moves to `paused_data` with the reason "re-validation no longer reproduces the locked result". When the validator pulls the andon cord, the nightly workflow still runs (opening nothing) and ends red at its last step with "The validator pulled the andon cord".

## Safe first step
Nothing needs stopping. A pair that is not validated is never promoted, and a slot whose re-run no longer matches pauses itself.

## Steps
1. Read the difference: `npm run apex -- pair <strategy> <dataset>` shows each validator run, its level and what differed.
2. A disagreement at level L1 (same code, same bars, same inputs) should be impossible. Treat it as a bug: halt, and compare the two input hashes and result hashes shown.
3. A disagreement at level L2 is a data difference. Check whether the dataset's version changed between the two runs: `npm run apex -- data health` and `npm run apex -- ledger tail --kind data_version`.
4. Run it again: `npm run apex -- validate`.
5. Do not change the strategy or its settings to make it agree. A locked strategy does not change.

## How to confirm
A later validator run for the same pair agrees, and the pair moves on at the next run. If it never agrees, it stays where it is, which is the right outcome.

## What to write down
The validator runs are in the ledger. Write an incident note for any L1 disagreement.
