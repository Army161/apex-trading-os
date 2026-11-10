---
name: apex-time-machine
description: Replay the setup over 60 days of intraday bars plus Monte Carlo. Part of the Apex Day Trader desk (paper trading on Alpaca).
---

Run from `bots/alpaca/daytrader`:

```bash
python desk.py timemachine SYMBOL --setup orb
```

Rules: never place an order without the exit plan and risk check passing first. Never send an order the user has not confirmed with the exact phrase. Report results plainly, including when the answer is "don't trade".
