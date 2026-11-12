# bots/

The paper and test bots. Each folder is one bot with its own README.

## Where things stand (read this first)
- **Going live is Jeremy's decision, made on his own machine, with both switches.** Each bot has its own live setting, and the second switch is `APEX_ALLOW_LIVE`: to go live you set `APEX_ALLOW_LIVE` to yes yourself, in your own shell on your own computer. Nothing in this repo, no agent, no workflow and no dashboard button sets it.
- **No bot has a stored paper record that shows an edge yet.** Paper runs so far are for checking the plumbing. `docs/validation-results.md` is the honest scoreboard, and today it says no strategy has passed every check.
- **The approved plan says two bots are not to be taken live:** the Solana copy bot (memecoin copying, no testable edge) and the Maker keeper (needs a hot wallet; the guide is outdated). See "What we should not build" in `docs/study-and-plan.md`. Their live code paths stay behind both switches, but the answer to "should I turn them on" is no.

## Invariants
These must always stay true. `python3 tools/drift_check.py` checks them.
- Every bot starts in **paper** or test mode. Live needs two switches: the bot's own live setting **and** `APEX_ALLOW_LIVE` set to exactly `yes`, which only Jeremy sets, on his own machine. No file in the repo gives `APEX_ALLOW_LIVE` a value; bot configs in the repo keep `dry_run` true and no bot's own live setting on.
- Freqtrade starts only through `bots/freqtrade/launch.py`, which checks the second switch (Freqtrade has no such switch of its own) and refuses an empty or placeholder API password.
- No bot has a withdraw or transfer function. Exchange and broker keys are trade-only, with withdrawals turned off on the exchange side.
- Keys come only from environment variables, never from files in the repo, command-line flags, chat or logs.
- A dashboard command (pause, resume, kill) for a bot is delivered only when that bot polls `GET /api/bots/{id}/command`, and it stays queued until that bot acknowledges it (`DELETE /api/bots/{id}/command?ref=...`) or a newer command replaces it. A heartbeat or trade report never reads it away. While the kill switch or andon cord is on, every poll answers pause.
- The Alpaca nightly bot and the day-trader desk ask the dashboard halt state before every order (`bots/alpaca/guard.py`). In live mode a dashboard that cannot be reached or read means halted.

Not yet true everywhere (to do): the andon cord and kill switch (`web/lib/andon.ts`) are obeyed by the Solana copy and Polymarket copy bots (pause, resume and kill from the dashboard), the paper exchange's risk gate (`bots/paper-exchange`) and the Alpaca nightly and day-trader (refuse every order while halted), but not yet by Freqtrade or the keeper. Freqtrade's own halt is its Telegram `/stop`.

## Going live checklist (owner steps, per bot)
Only after a stored forward paper record that passes the checks. Do every step yourself, on your own machine, in this order.

**Alpaca (nightly core + sleeves, and the day-trader desk)**
1. Your own Alpaca live account, funded with only what you can afford to lose.
2. Live API keys for trading only, with withdrawals off, locked to your machine's IP where Alpaca offers it. They go in your local env as `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`.
3. Small size: lower `account_size` in `daytrader/desk_config.json` and the weights in `system.json` before the first live run.
4. Both switches, set by you in your own shell: `ALPACA_LIVE` to true, and set `APEX_ALLOW_LIVE` to yes yourself.
5. Halt test from the phone first: pull Halt on the dashboard (or `/halt` in Telegram), then run `python nightly.py --force morning --send` and `python daytrader/desk.py execute ...` and check both answer "order refused, halted". Release, then go.

**Freqtrade**
1. Your own exchange account (Binance in `config.json`), with only what you can afford to lose.
2. API keys with trade permission only, withdrawals off, and the key locked to your machine's IP. Keys go in `.env` as `BINANCE_API_KEY` and `BINANCE_API_SECRET`, never in `config.json` (the launcher refuses a config with keys in it).
3. Small size: lower `max_open_trades` and set a fixed `stake_amount` before going live.
4. Both switches: `dry_run` false in your local config, and set `APEX_ALLOW_LIVE` to yes yourself in the shell you run `docker compose up` from. Set your own `FT_API_PASSWORD` and `FT_JWT_SECRET` too, or the launcher will not start.
5. Halt test from the phone first: the dashboard Halt does not reach Freqtrade yet, so test Freqtrade's own Telegram `/stop` from your phone in dry run and check it stops.

**Polymarket copy**
1. Your own Polymarket account and a fresh wallet holding only what you can afford to lose.
2. The wallet key only in your local `.env` (`PRIVATE_KEY`); it never leaves your machine. There is no withdraw function in the bot.
3. Small size: low session and per-market caps (live refuses zero caps).
4. Both switches: `MODE` to live, and set `APEX_ALLOW_LIVE` to yes yourself.
5. Halt test from the phone first: press Pause for the bot on the dashboard and check its next heartbeat says paused, then Resume.

**Solana copy and Maker keeper:** not to be taken live (approved plan). Run them in paper and watch mode only.
