---
name: apex-ledger
description: Use when Jeremy or anyone says "prove it", asks where a number came from, or wants to check that nothing was rewritten. Shows the receipt for a result and how to verify it.
---

# apex-ledger

Instructions only. Every number comes from an Apex tool or the `apex` command, never from this file.

## What it is for

Showing that a result is exactly what was recorded, in order, and that anyone can check it without trusting Apex.

## Steps

1. Find the entry. A result's receipt number is on `apex_pair`, `apex_slots` with a key, or `apex_claim_check_result`.
2. Call `apex_ledger` with the entry's number to show it: its kind, time, payload, its hash and the hash of the entry before it.
3. Call `apex_ledger` in verify mode over the range that holds it. Report whether the chain recomputes and over how many entries.
4. Show the order: the pre-registration comes before the result. Give both numbers.
5. Say how to check it on another machine: `npm run apex -- ledger verify`, or `verifyReceipt` in `packages/sdk`, which recomputes the hashes from what the API sent.

In a checkout: `npm run apex -- ledger show <seq>`, `npm run apex -- ledger verify` and `npm run apex -- ledger head`.

## Wording

- "The chain recomputes over entries A to B" or "The chain breaks at entry N". Nothing softer.
- A receipt proves what was recorded and when in the order. It does not prove the strategy works. Say both.

## If a call fails

- If verify reports damage, say at which entry, call `apex_halt` with that as the reason, and tell Jeremy. Do not try to repair the ledger.

## Never

- Never approve, resume, retire or open a lock. Those are Jeremy's alone, on the dashboard.
- Never edit a limit, a live flag or a red path (`.github/red-paths.txt`). Write a proposal for Jeremy instead.
- Never give a figure without its n and its tag: past data, forward or paper book.
- Never call an untested rule a signal, and never call a result proven. The words are: holds up, near miss, no edge, could not be tested.
- Never edit, delete or re-order a ledger entry, and never touch `ledger/heads/`.
- Never paraphrase a payload as if it were the entry. Show it as written.
