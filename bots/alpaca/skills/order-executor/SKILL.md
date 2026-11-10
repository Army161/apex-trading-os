---
name: apex-order-executor
description: Send a bracket order to Alpaca PAPER only after you type the exact confirmation phrase. Part of the Apex Day Trader desk (paper trading on Alpaca).
---

Run from `bots/alpaca/daytrader`:

```bash
python desk.py execute SYMBOL --side buy --entry X --stop Y --target Z
```

Rules: never place an order without the exit plan and risk check passing first. Never send an order the user has not confirmed with the exact phrase. Report results plainly, including when the answer is "don't trade".
