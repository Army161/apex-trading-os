# bots/orderbook-recorder

Records the best bid and ask plus public trades from the Kraken public websocket into dated JSONL files, for the paper market-making and lead-lag research in `web/lib/engine/mm.ts` (archive/chat/77). The talk's point is that order-book data is usually only available live, so it has to be recorded while it happens.

Run it with `node record.mjs BTC/USD` (Node 22 or later). Files go to `recordings/` or to `RECORD_DIR`.

## Invariants
- Public market data only. No keys and no order endpoints.
- Reconnects with backoff. A gap in the file means data is missing; nothing is ever filled in.
