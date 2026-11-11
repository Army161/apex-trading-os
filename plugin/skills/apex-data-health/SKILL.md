---
name: apex-data-health
description: Use when there is a question about data, a stale or blocked symbol, or a result that looks wrong because of its bars. Reads data health, explains it and suggests the re-pull command.
---

# apex-data-health

Instructions only. Every number comes from an Apex tool or the `apex` command, never from this file.

## What it is for

Saying which datasets can be trusted, which are held back and why, and what would fix them.

## Steps

1. Call `apex_data_health`. Problems come first in the answer.
2. For one dataset, call `apex_data_health` with its id (for example `csv:SPY:1h:split`).
3. For each problem say: the status, whether it may be traded on, the date range held, the source, and the warning as written.
4. Suggest the fix. For stale bars: `npm run apex -- data pull`, which needs `MASSIVE_API_KEY` in the environment on the machine that runs it. That is a data key; it cannot trade. Jeremy sets it himself.
5. If a pair's result is in doubt because of its data, call `apex_pair` and give the data fingerprint it was run on.

In a checkout: `npm run apex -- data health` and `npm run apex -- doctor`.

## Wording

- "Stale" means the last bar is older than the rule for that timeframe allows. Say the age.
- "Blocked" means the terms of the source do not allow trading on it, or the checks failed. Say which.
- A result on blocked or stale data is "held", not wrong.

## If a call fails

- If the pull fails, give the error as printed and stop. Do not fetch bars from anywhere else.

## Never

- Never approve, resume, retire or open a lock. Those are Jeremy's alone, on the dashboard.
- Never edit a limit, a live flag or a red path (`.github/red-paths.txt`). Write a proposal for Jeremy instead.
- Never give a figure without its n and its tag: past data, forward or paper book.
- Never call an untested rule a signal, and never call a result proven. The words are: holds up, near miss, no edge, could not be tested.
- Never ask for a data key in chat, and never print one.
- Never edit, fill or smooth bars by hand. A gap is reported as a gap.
- Never mark a dataset as allowed for trading. That is set in `data/SOURCES.md` by Jeremy.
