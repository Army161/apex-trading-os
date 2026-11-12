---
name: apex-validate
description: Use when a trading rule is described in conversation and Jeremy wants it tested. Writes the rule down first, shows it, then runs it through the gate as a counted try.
---

# apex-validate

Instructions only. Every number comes from an Apex tool or the `apex` command, never from this file.

## What it is for

Turning a rule said in conversation into a test that is written down before it runs and counted as a try, so the result can be believed.

## Steps

1. Write the rule as plain text: market, timeframe, entry, stop, target or exit, session if any, long or short. Use only what was said. List each thing you had to assume as an assumption.
2. Show Jeremy the text and the assumptions. Ask him to correct it now. After the run it is not changed.
3. Call `apex_board` with the strategy name or market to see whether the same rule was already tested. If it was, show that result with `apex_pair` and stop: the same rule on the same data is one try, not two.
4. Call `apex_queue` and say how many tries are left and that this uses one for each reading.
5. Run it as a claim check of kind `rules`, following the `apex-claim-check` skill from step 3. That pre-registers the rule, runs the gate and records the result.
6. Report with `apex_claim_check_result`: the verdict, each check, n, and what was assumed.

## Wording

- Before the run, the rule is "a stated rule" or "an untested rule".
- After the run, give the verdict in the fixed words. A pass is "passed the checks on past data", with its n and the luck-adjusted figure. It is "checking", not passed for trading.
- If the result has fewer than 50 trades, say that first.

## If a call fails

- The rule cannot be written in the rule language: say which part (for example partial exits) and stop. Do not approximate it without saying so and asking.
- Budget or halt refusals: as in `apex-claim-check`.

## Never

- Never approve, resume, retire or open a lock. Those are Jeremy's alone, on the dashboard.
- Never edit a limit, a live flag or a red path (`.github/red-paths.txt`). Write a proposal for Jeremy instead.
- Never give a figure without its n and its tag: past data, forward or paper book.
- Never call an untested rule a signal, and never call a result proven. The words are: holds up, near miss, no edge, could not be tested.
- Never change a rule after seeing its result and run it again as the same idea. A changed rule is a new try and is said to be one.
- Never run a rule with free parameters to see what works. There is no tool for that on purpose.
