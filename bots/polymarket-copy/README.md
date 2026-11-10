# bots/polymarket-copy

Copies a target Polymarket wallet at a fraction of its size (guide: quiknode-labs polymarket copy bot, rewritten as our own code).

## Invariants
- `MODE=paper` is the default. `MODE=live` also needs `APEX_ALLOW_LIVE=yes`, a `PRIVATE_KEY` that Jeremy sets himself, and non-zero session and per-market caps.
- Paper fills walk the real order book, so paper results include slippage.
- Sells are not copied unless `COPY_SELLS=true`.
