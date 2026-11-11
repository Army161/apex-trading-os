# Restore the ledger

## How you notice
The ledger file is gone, cut short or damaged (`ledger-verify-failed.md` sent you here), or the database was lost.

## Safe first step
Halt (the dashboard button, if the terminal halt is refused because the file is damaged), and keep the damaged copy. Rename it. Do not delete it: it shows what happened.

## Steps
File ledger (the default, kept on the `apex-state` branch):
1. Fetch the branch: `git fetch origin apex-state`.
2. Walk back through its commits until `ledger verify` passes on that commit's `state` folder: check the commit out into a scratch folder, set `APEX_STATE_DIR` to its `state` folder, and run `npm run apex -- ledger verify`.
3. Put that `state` folder back as the current one, in a new commit on `apex-state`. Do not rewrite the branch's history: the history is the witness.
4. `npm run apex -- ledger replay` rebuilds every figure from the entries and reports the counts.

Postgres ledger (when `DATABASE_URL` is set):
1. Use the database provider's point-in-time restore to a moment before the damage. This has not been rehearsed: no database has been connected to the dashboard yet.
2. Then `npm run apex -- ledger verify` and `npm run apex -- ledger replay` against it.

Entries written after the restored copy are lost. Paper fills in that window are gone from the record and the forward record has a gap.

## How to confirm
`npm run apex -- ledger verify` exits 0 with every saved head matching. `npm run apex -- status` shows the slots and the book you expect.

## What to write down
An incident note: the commit or time restored to, the first entry lost, and the dates the forward record does not cover.
