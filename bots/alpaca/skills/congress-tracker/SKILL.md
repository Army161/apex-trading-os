---
name: apex-congress-tracker
description: List the newest House member stock-trade disclosures (PTRs). Part of the Apex Day Trader desk (paper trading on Alpaca).
---

Run from `bots/alpaca/daytrader`:

```bash
python desk.py congress
```

Rules: never place an order without the exit plan and risk check passing first. Never send an order the user has not confirmed with the exact phrase. Report results plainly, including when the answer is "don't trade".
