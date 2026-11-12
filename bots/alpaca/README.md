# bots/alpaca

Alpaca paper bots: the nightly ETF core plus sleeves (`nightly.py`), the day-trader desk (`daytrader/desk.py`, including the ORB rule) and the insider follower (`daytrader/insider.py`).

Before every order, `broker.py` asks `guard.py` for this bot's halt state on the dashboard (`GET {APEX_DASHBOARD_URL}/api/bots/{id}/command` with the `APEX_INGEST_TOKEN` header, the same endpoint and token the reporter uses). The day-trader keeps its day book in `daytrader/desk_day.json` (`daytrader/daybook.py`): the trades sent today and today's P&L from the broker, so its daily caps hold across runs. Tests: `python3 -m pytest -q bots/alpaca` (fakes only, no network).

## Invariants
- `broker.py` uses the paper endpoint unless both switches are set: `ALPACA_LIVE` to true and `APEX_ALLOW_LIVE` to exactly yes, both by Jeremy on his own machine.
- Every order (`submit`, `bracket`) first passes `guard.check` for its bot id. A pause, kill, kill switch or andon cord refuses it. In live mode an unset, unreachable or unreadable dashboard also refuses it. In paper mode an unreachable dashboard lets it through with a log line. An order with no bot id is refused.
- The day-trader refuses new orders once today's trades reach `max_trades_per_day` or today's P&L (the worse of realised and account day change, lowest seen today) reaches `max_daily_loss_pct` of `account_size`. The count and the check are one locked step; the book is written atomically; a book that cannot be read, or a broker P&L that cannot be read, refuses.
- Order tickets need a manual yes before they are sent.
- SEC requests use the `SEC_USER_AGENT` environment variable, never a personal email.
