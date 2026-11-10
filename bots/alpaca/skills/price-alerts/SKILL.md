---
name: apex-price-alerts
description: Ping when stop or target is hit. Part of the Apex Day Trader desk (paper trading on Alpaca).
---

Run from `bots/alpaca/daytrader`:

```bash
python desk.py alerts SYMBOL --stop X --target Y
```

Rules: never place an order without the exit plan and risk check passing first. Never send an order the user has not confirmed with the exact phrase. Report results plainly, including when the answer is "don't trade".
