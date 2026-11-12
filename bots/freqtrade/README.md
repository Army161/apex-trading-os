# Apex Freqtrade bot (crypto, dry-run first)

Freqtrade was the best crypto fit in the "Top 8 AI trading repos" video (archive/chat/20): dry-run mode, Telegram control,
backtesting and hyperopt. Apex ships two strategies:

| Strategy | Timeframe | Source |
|---|---|---|
| `ApexTurtle` | 1d | Turtle 55/20 breakout (archive/chat/03) |
| `ApexConfluence` | 4h | Confluence checklist scorer from the Apex engine (archive/chat/17 and others) |

## Invariants
- Every command starts through `launch.py` (the compose file runs it as the entrypoint). Freqtrade itself goes live on `dry_run: false` plus keys, so the launcher is the second switch: it refuses `trade` (and any command not on its read-only list) when the bot would run live unless `APEX_ALLOW_LIVE` is exactly yes in the environment, which only Jeremy sets, on his own machine.
- The launcher also refuses an empty or placeholder API server password or JWT secret, a config file that holds exchange keys, and a config it cannot read. `--dry-run` always means paper.
- `user_data/config.json` in the repo keeps `dry_run: true`. `python3 tools/drift_check.py` checks this, that `launch.py` still checks the switch, and that the compose file starts freqtrade only through it.
- The dashboard Halt does not reach Freqtrade yet. Its own Telegram `/stop` is the halt.

## Run (paper)
```bash
cp ../../.env.example .env          # fill only what you need; keys stay on your machine
# set your own FT_API_PASSWORD and FT_JWT_SECRET in .env: the launcher refuses the placeholders
docker compose up -d                # dry_run=true, $10k paper wallet
docker compose logs -f              # the first line says "[launch] starting: paper (dry run)"
```
FreqUI / REST API on http://127.0.0.1:8080 (localhost only). Set `APEX_WEBHOOK_ENABLED=true` and `APEX_DASHBOARD_URL`
to stream entries/exits to the Apex dashboard.

## Backtest and optimise before ever going live
```bash
C="--config /freqtrade/user_data/config.json"
docker compose run --rm freqtrade download-data $C --timeframes 1d 4h --timerange 20200101-
docker compose run --rm freqtrade backtesting $C --strategy ApexTurtle --timerange 20220101-
docker compose run --rm freqtrade hyperopt $C --strategy ApexTurtle --hyperopt-loss SharpeHyperOptLossDaily --epochs 200 --timerange 20200101-20231231
docker compose run --rm freqtrade backtesting $C --strategy ApexTurtle --timerange 20240101-   # untouched out-of-sample window
```

## Going live (only you can do this)
Live trading needs both switches, set by you on your own machine: `dry_run: false` in your local config, and set
`APEX_ALLOW_LIVE` to yes yourself in the shell you start `docker compose` from (the compose file passes it through by name
and never holds a value). Your exchange keys go in `.env` (`BINANCE_API_KEY`, `BINANCE_API_SECRET`), created with trade
permission only, withdrawals disabled and locked to your IP. Do it only after at least 4 weeks of dry-run results that match
the backtest. The full owner checklist is in `bots/README.md`. Tests for the launcher: `python3 -m pytest -q bots/freqtrade/tests`.
