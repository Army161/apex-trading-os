# bots/

The paper and test bots. Each folder is one bot with its own README.

## Invariants
These must always stay true. `python3 tools/drift_check.py` checks them.
- Every bot starts in **paper** or test mode. Live needs two switches: the bot's own live setting **and** `APEX_ALLOW_LIVE=yes`, which only Jeremy sets, on his own machine.
- No bot has a withdraw or transfer function. Exchange and broker keys are trade-only, with withdrawals turned off on the exchange side.
- Keys come only from environment variables, never from files in the repo, command-line flags, chat or logs.

Not yet true everywhere (to do): the andon cord and kill switch (`web/lib/andon.ts`) are handled by the Solana copy and Polymarket copy bots (pause, resume and kill commands from the dashboard) and by the paper exchange's risk gate (`bots/paper-exchange`), but not yet by the Alpaca nightly and day-trader, Freqtrade or keeper bots.
