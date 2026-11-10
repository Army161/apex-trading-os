# Apex Freqtrade bot (crypto, dry-run first)

Freqtrade was the best crypto fit in the "Top 8 AI trading repos" video (archive/chat/20): dry-run mode, Telegram control,
backtesting and hyperopt. Apex ships two strategies:

| Strategy | Timeframe | Source |
|---|---|---|
| `ApexTurtle` | 1d | Turtle 55/20 breakout (archive/chat/03) |
| `ApexConfluence` | 4h | Confluence checklist scorer from the Apex engine (archive/chat/17 and others) |

## Run (paper)
```bash
cp ../../.env.example .env          # fill only what you need; keys stay on your machine
docker compose up -d                # dry_run=true, $10k paper wallet
docker compose logs -f
```
FreqUI / REST API on http://127.0.0.1:8080 (localhost only). Set `APEX_WEBHOOK_ENABLED=true` and `APEX_DASHBOARD_URL`
to stream entries/exits to the Apex dashboard.

## Backtest and optimise before ever going live
```bash
docker compose run --rm freqtrade download-data --timeframes 1d 4h --timerange 20200101-
docker compose run --rm freqtrade backtesting --strategy ApexTurtle --timerange 20220101-
docker compose run --rm freqtrade hyperopt --strategy ApexTurtle --hyperopt-loss SharpeHyperOptLossDaily --epochs 200 --timerange 20200101-20231231
docker compose run --rm freqtrade backtesting --strategy ApexTurtle --timerange 20240101-   # untouched out-of-sample window
```

## Going live (only you can do this)
Live trading needs `dry_run: false` plus your exchange keys in `.env` (`BINANCE_API_KEY`, `BINANCE_API_SECRET`), created
with trade permission only and withdrawals disabled. Do it only after at least 4 weeks of dry-run results that match the backtest.
