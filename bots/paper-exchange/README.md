# bots/paper-exchange

A paper exchange for testing market-making and execution logic against recorded data (archive/chat/77, 79, 80). It has an in-memory order book, a timestamped event stream, a pre-trade risk gate, an order-state log and latency metrics. Replay a file from `bots/orderbook-recorder` with `python3 -m paper_exchange.sim <file.jsonl>`, then run the tests with `python3 -m pytest -q tests`.

What we took from the HFT talks, and what we didn't:
- **Used:** a flat sorted book with the best price at the end of the list, so most updates touch only a few levels (chat/80). Every event is timestamped and sequenced. The risk gate runs before every order. Latency is reported as p50, p99 and max, not as an average.
- **Skipped:** FPGAs, colocation and kernel bypass. Apex can't compete on speed with colocated firms, so **any edge that depends on being fastest is not viable for us** and is marked that way in research.

## Invariants
- Paper only. There is no network code here and nothing can reach an exchange.
- Every order passes the risk gate before it rests: size, notional, position, order rate, price band, and repeated rejects pause the strategy.
- The kill switch uses the same `pause` / `resume` / `kill` commands as the other bots. After a kill, the gate refuses everything until the process restarts.
- Fills come only from replayed market prints, and every state change is logged with `mode: paper`.
- Trailing stops (`trail.py`, chat/81) only ever tighten, stay past the entry, respect the stop level, and are capped at `max_mods_per_min` modifications.
- The closed-bar runner (`runner.py`, chat/85) acts only on closed bars, reads its settings from env vars, defaults to `APEX_TRADABLE=no`, and has no live mode.
