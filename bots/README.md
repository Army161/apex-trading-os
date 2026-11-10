# bots/

The paper and test bots. Each folder is one bot with its own README.

## Invariants
These must always stay true. `python3 tools/drift_check.py` checks them.
- Every bot starts in **paper** or test mode. Live needs two switches: the bot's own live setting **and** `APEX_ALLOW_LIVE=yes`, which only Jeremy sets, on his own machine.
- No bot has a withdraw or transfer function. Exchange and broker keys are trade-only, with withdrawals turned off on the exchange side.
- Keys come only from environment variables, never from files in the repo, command-line flags, chat or logs.

Not yet true everywhere (to do): the andon cord and kill switch (`web/lib/andon.ts`) are checked by the Solana copy, Polymarket copy and day-trader bots, but not yet by the nightly Alpaca, Freqtrade or keeper bots.
