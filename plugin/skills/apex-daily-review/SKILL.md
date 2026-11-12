---
name: apex-daily-review
description: Use when Jeremy asks how Apex is doing, what happened overnight or what needs him. Reads the latest run, the board, the slots, the book and the risk state, and reports them.
---

# apex-daily-review

Instructions only. Every number comes from an Apex tool or the `apex` command, never from this file.

## What it is for

A short, honest account of the paper system: what ran, what it found, and what needs Jeremy.

## Steps

1. Call `apex_status`. If anything is halted, that is the first line of the answer, with the reason and who pulled it.
2. Call `apex_report` for the latest run. Note errors and blocked data.
3. Call `apex_slots`. For each slot in paper: its graduation clock (days and forward trades against what is needed).
4. Call `apex_book`: equity and how much of each loss limit is used.
5. Call `apex_risk`: any limit waiting to change, and drift readings near their alarm line.
6. Call `apex_board` filtered to near misses if Jeremy asks what is close.
7. Report in this order: halts, what needs Jeremy, what ran, slots, book, what changed since the last run.

In a checkout with no MCP connection, the same reads are `npm run apex -- status`, `npm run apex -- report`, `npm run apex -- slots`, `npm run apex -- book` and `npm run apex -- risk`.

## Wording

- Start with the mode: PAPER. Say the count of tries.
- Every figure carries its n and its tag. "Sharpe, n, past data, after assumed costs", all four together, as the tool gives them.
- A slot in paper is "checking". Say how far its clock is, not how well it is doing, unless it has forward trades, and then give n.
- If nothing needs Jeremy, say "Nothing needs you today." Do not invent a task.
- If the data is stale, say which datasets and that results on them are held.

## If a call fails

- If `apex_status` says no ledger is connected, say so. Tries are unknown, not zero.
- If one read fails, report the others and name the one that failed. Do not fill the gap from memory.

## Never

- Never approve, resume, retire or open a lock. Those are Jeremy's alone, on the dashboard.
- Never edit a limit, a live flag or a red path (`.github/red-paths.txt`). Write a proposal for Jeremy instead.
- Never give a figure without its n and its tag: past data, forward or paper book.
- Never call an untested rule a signal, and never call a result proven. The words are: holds up, near miss, no edge, could not be tested.
- Never report a number that did not come from a tool in this session.
- Never describe a paper result as money made.
