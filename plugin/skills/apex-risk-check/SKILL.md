---
name: apex-risk-check
description: Use when a change to limits, live flags or money code is being considered, or Jeremy asks "is it safe to...". Reads the limits, halts, book and locks and explains what the change would do. It never makes the change.
---

# apex-risk-check

Instructions only. Every number comes from an Apex tool or the `apex` command, never from this file.

## What it is for

Explaining the risk state and what a proposed change would mean, before anyone touches it. The change itself is Jeremy's.

## Steps

1. Call `apex_status` for mode and halts.
2. Call `apex_risk`: each limit in force, what was asked for, its default and its ceiling, exposure and drift.
3. Call `apex_book`: equity and how much of each loss limit is already used.
4. If the question is about a slot going live, call `apex_risk` with the slot key and list the four locks as reported. Locks 3 and 4 need Jeremy's approval and his own machine; from here they always read closed.
5. Explain the proposed change in plain words: what it loosens or tightens, when it would take effect (a tighter limit applies at once, a looser one only after 24 hours unchanged, nothing can exceed its ceiling), and what the worst case on the current book would be.
6. If the change touches a red path, say so and say what to do: write the proposal in `docs/specs/` or open a pull request for Jeremy. A sign-off is made only by Jeremy with `npm run apex -- signoff <path> --reason "..."` on his own machine.
7. If something looks wrong right now (a fill that cannot be right, a broken ledger), call `apex_halt` with the reason and tell Jeremy. Halting is always allowed.

## Wording

- "This would..." and "Jeremy would need to...". Never "I will change".
- Limits are given as in force, asked for, default and ceiling, in that order.
- Say plainly when the answer is "not from here": limits are set in the environment on the machine that runs the autopilot.

## If a call fails

- If the risk state cannot be read, treat it as halted and say so. Do not reason from an older reading.
- If `apex_halt` is refused for scope, tell Jeremy to press Halt on the dashboard or run `npm run apex -- halt "<reason>"`.

## Never

- Never approve, resume, retire or open a lock. Those are Jeremy's alone, on the dashboard.
- Never edit a limit, a live flag or a red path (`.github/red-paths.txt`). Write a proposal for Jeremy instead.
- Never give a figure without its n and its tag: past data, forward or paper book.
- Never call an untested rule a signal, and never call a result proven. The words are: holds up, near miss, no edge, could not be tested.
- Never make the change being asked about, and never set a live flag or write a key.
- Never look for a way around the guard hook. If it refuses an edit, the refusal is the answer.
- Never suggest a way to resume. Resuming is Jeremy's, signed in on the dashboard, with a reason and the phrase typed out.
