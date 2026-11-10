---
name: apex-earnings-analyzer
description: Summarise what changed in the latest SEC 10-Q/10-K facts (needs SEC_USER_AGENT). Part of the Apex Day Trader desk (paper trading on Alpaca).
---

Run from `bots/alpaca/daytrader`:

```bash
python desk.py earnings SYMBOL
```

Rules: never place an order without the exit plan and risk check passing first. Never send an order the user has not confirmed with the exact phrase. Report results plainly, including when the answer is "don't trade".
