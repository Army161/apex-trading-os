# Apex Solana Copy Bot

Built from **archive/chat/23** (Trade Wiz copy-trading settings video). It copies chosen Solana wallets on pump.fun and bonk
tokens using the video's settings, plus the hard caps Apex puts on every bot. **PAPER mode is the default**: every buy and sell
is priced against a real Jupiter quote for that exact size (so price impact on thin pools counts), fees and tips are charged,
and nothing is sent on-chain.

**Be clear-eyed about this one.** Memecoin copy trading is the highest-risk thing in Apex. Most of these tokens go to zero, and the
video itself says many "smart money" wallets use their copiers as exit liquidity. The profit claims in the video come from an
affiliate promoting Trade Wiz, so treat them as marketing. Run paper mode for weeks before you put real SOL in.

## What it does (video rule → where it lives)
| Video rule | Apex implementation |
|---|---|
| Pick wallets with long average hold time | `npm run score -- <wallet>`: median hold must be 5 min+ |
| More sells than buys (conviction, scaling out) | score: sells must exceed buys |
| Look at P&L and win rate before copying | score: net SOL P&L and win rate over the last 300 txs, needs 10+ closed tokens |
| Anti-PVP: stop copying wallets that flip fast | live mute after 3 buy→sell flips within 60s in 30 min (`PVP_*`) |
| Fixed copy (e.g. 1 SOL) or buy ratio (e.g. 50%) | `SIZE_MODE=fixed|ratio`, capped by `MAX_SOL_PER_TRADE` (default 0.1) |
| Copy sells | proportional: they sell 40% of their bag, you sell 40% of yours |
| Launchpads: pump and bonk only | `LAUNCHPADS=pump,bonk` (mint suffix and DEX id) |
| 35% slippage, 0.001 fee and 0.001 tip minimum | `SLIPPAGE_PCT`, `PRIORITY_FEE_SOL`, `JITO_TIP_SOL` |
| Minimum market cap 10k, token age limits | `MIN_MCAP_USD`, `MAX_MCAP_USD`, `MIN/MAX_TOKEN_AGE_MIN` |
| No duplicate buys | `NO_DUPLICATE_BUYS=true` |
| Sell 80% at 2x, keep a 20% moon bag | `TP_LADDER=2:0.8` (any ladder, e.g. `2:0.5,4:0.25`) |
| Trailing stop that moves into profit | at `TRAIL_TRIGGER_X` the stop jumps to +`TRAIL_LOCK_PCT`% and then trails `TRAIL_PCT`% under the high |
| (not in the video) | hard `STOP_LOSS_PCT=50`, `MAX_OPEN_POSITIONS`, `MAX_DAILY_LOSS_SOL` auto-pause, dashboard pause/resume/kill |

Not copied from the video: "dev create" sniping (buying a dev's launch in the first block) and paid anti-MEV. Sniping needs
co-located RPC and Jito bundles to compete, and it is where most rugs happen. BNB chain is also not covered yet.

## Run it
```bash
cd bots/solana-copy && npm install && cp .env.example .env
npm test                                   # 12 rule and decoder tests
npm run score -- <wallet1> <wallet2>       # check wallets first; only copy ones that PASS
# put the passing wallets in TARGET_WALLETS, then:
npm start                                  # paper mode
```
Use a paid RPC (Helius, Triton, QuickNode) for `RPC_URL`. The public endpoint rate-limits fast and will miss trades.
On the first poll it records the latest transaction and only copies trades made after it starts.

## Going live (you do this, on your machine)
Set `MODE=live`, `APEX_ALLOW_LIVE=yes` and `PRIVATE_KEY` (base58) in your local `.env`. Use a fresh hot wallet holding only what
you can lose. Live mode signs Jupiter swaps locally; keys never leave the machine and never go in chat.
Live fills use Jupiter's priority-fee setting, and the tip is folded into that fee rather than sent as a separate Jito bundle.

The bot shows up on the Apex dashboard as **Solana Copy Bot** once `APEX_DASHBOARD_URL` and `APEX_INGEST_TOKEN` are set.
