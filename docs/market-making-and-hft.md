# Market making and HFT ideas (archive/chat/77, 79, 80)

Everything here is paper only. No order tools were added. Nothing was installed. Every claim in the talks is unproven for us.

**The honest headline:** the crypto market-making talk (chat/77) says its own simple edges, spread capture and cross-exchange or cross-currency arbitrage, stopped paying once banks and hedge funds arrived. The two architecture talks (chat/79, 80) are about winning on microseconds with FPGAs, colocation and kernel bypass. **Apex can't compete on speed, so any edge that depends on being fastest is marked not viable for us.** What we can use is the discipline: record the data, measure honestly, and check risk before every order.

## What's built
| Piece | Where | What it does |
|---|---|---|
| Market-making simulator | `web/lib/engine/mm.ts` `simulateMM` | Replays recorded quotes and trades with two-sided quotes. It reports spread earned, fees, **adverse selection** (how far the mid moves against us after each fill) and inventory. It also says whether the average spread even beats the round-trip fee, which the talk says it usually doesn't (0.2% spread vs 0.1% fee per side). The fills are optimistic, because it assumes we're first in the queue, so a profit here is an upper bound. |
| Lead-lag research | `mm.ts` `leadLag`, `removeOffset`, `convert` | Lines up two venues second by second and removes the constant price gap between them, using the median log ratio. Then it finds which venue moves first and by how much. `convert` turns BTC/EUR into USD with the EUR/USD rate for the cross-currency check. |
| Order-book recorder | `bots/orderbook-recorder` | Saves the best bid/ask and public trades from the Kraken public websocket to dated JSONL files. Order-book history usually can't be downloaded later, so it has to be recorded live. It uses no keys and no order endpoints. |
| Hold-the-same-balances benchmark | `validate.ts` `holdSameBalances` | A market maker has to hold coins to quote both sides. Its result only counts if it beats simply holding those same coins over the same period. |
| Time-ordered splits | `validate.ts` `timeSplit` | Train, then validation, then test, in time order and never shuffled. |
| Paper exchange (Python) | `bots/paper-exchange` | An in-memory book with the best price at the end of a flat list (the chat/80 trick). It adds a sequenced event stream with nanosecond timestamps, a **pre-trade risk gate** on every paper order (size, notional, position, order rate, price band, and a pause after repeated rejects), the kill switch (`pause` / `resume` / `kill`), an order-state log (rested, partial, filled, rejected, cancelled) and p50/p99/max latency for the dashboard health panel. |

## Not built, on purpose
- FPGA, colocation, kernel bypass, multicast feeds and smart order routing across venues are out of scope for retail.
- Neural-network price prediction (chat/77 used Keras) is not built. If it is ever tried, it must beat the lazy forecast and the monkey test on time-ordered test data.

## Next step (needs nothing from Jeremy)
Run the recorder on a machine with exchange access for a few days. Then replay the files through `simulateMM` and `leadLag`, and report spread vs fees, adverse selection and lead-lag as they are. The cloud container can't reach exchange APIs.
