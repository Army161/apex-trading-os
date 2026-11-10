# bots/alpaca

Alpaca paper bots: the nightly ETF core plus sleeves (`nightly.py`), the day-trader desk (`daytrader/desk.py`, including the ORB rule) and the insider follower (`daytrader/insider.py`).

## Invariants
- `broker.py` uses the paper endpoint unless both `ALPACA_LIVE=true` and `APEX_ALLOW_LIVE=yes` are set.
- Order tickets need a manual yes before they are sent.
- SEC requests use the `SEC_USER_AGENT` environment variable, never a personal email.
