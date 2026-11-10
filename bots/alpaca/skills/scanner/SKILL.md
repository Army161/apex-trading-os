---
name: apex-scanner
description: Scan the watchlist for opening-range breakouts, bull flags and oversold bounces, ranked by relative volume. Part of the Apex Day Trader desk (paper trading on Alpaca).
---

Run from `bots/alpaca/daytrader`:

```bash
python desk.py scan
```

Rules: never place an order without the exit plan and risk check passing first. Never send an order the user has not confirmed with the exact phrase. Report results plainly, including when the answer is "don't trade".
