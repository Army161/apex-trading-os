# Incident note

Copy this into a new file named by date, for example `docs/runbooks/incidents/2026-11-11-ledger.md`. Keep it short and say only what you know.

## How you notice
What showed the problem, and when (UTC). Who or what noticed: you, an alert, a check.

## Safe first step
What was done first to stop it getting worse, and when. Usually: halted.

## Steps
A timeline. One line per thing that happened or was done, each with its time and, where there is one, its ledger entry number.

- What happened, in one sentence.
- Impact: which slots, which dates, whether any figure shown anywhere was wrong.
- Cause, as far as it is known. Say "not known" rather than guess.

## How to confirm
What was checked to know it is fixed, with the command and its result. For the ledger: `npm run apex -- ledger verify`.

## What to write down
What changes so it does not happen again. Prefer, in this order: a check in code that would have caught it, a test, a line in a runbook, a note to be careful. A change to money code goes through a reviewed pull request like any other.
