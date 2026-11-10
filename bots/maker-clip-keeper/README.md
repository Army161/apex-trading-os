# Maker / Sky Clip Keeper (modernised auction-keeper)

Source: archive/chat/01 (QuickNode "Run a Keeper Bot" guide). That guide uses `auction-keeper --type flip`, which no longer
works: flip auctions were replaced by **Liquidations 2.0** (Dog + Clipper Dutch auctions) in 2021. This keeper:

- reads every `MCD_CLIP_*` Clipper from the on-chain Chainlog, so new collateral types appear automatically
- prices each running auction against an independent market price and estimates profit after gas
- flags stale auctions where `redo()` pays the keeper incentive (`tip + chip * tab`)
- reports to the Apex dashboard; **watch-only by default**, never sends a transaction

```bash
pip install -r requirements.txt
export ETH_RPC_URL=https://your-node     # QuickNode/Alchemy etc. Public RPCs rate-limit
python keeper.py                          # watch mode
```

Live mode needs both `--live` and `APEX_ALLOW_LIVE=yes`, plus `KEEPER_PRIVATE_KEY` (a dedicated hot wallet), DAI joined
into the Vat and `vat.hope(<clipper>)` done once. Honest expectation: liquidations are rare in calm markets and MEV searchers
compete for every profitable `take`. Run it in watch mode through a volatile week before deciding.
