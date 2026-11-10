# Strategy gap map (archive/chat/75)

Each registered strategy is placed on a grid of style and default timeframe, so you can see where the library has nothing. Regenerate it with `cd web && npx tsx scripts/gap-scan.ts`. The selftest fails if a new strategy is added without a style in `web/lib/engine/gaps.ts`.

**A gap is a research lead, not an edge.** Anything built to fill one has to pass the same six checks as every other rule (`docs/validation-results.md`). So far nothing has passed all six. Timeframes here are each strategy's default. The validation runs try every rule on every data set anyway.

| Style | Intraday (1h and under) | Swing (4h) | Daily |
|---|---|---|---|
| trend | supertrend, golden_cross (long) | **gap** | rsi_regime, psar_reverse, psar_adx, sma_10_20, sma50_trend (long) |
| breakout | **gap** | **gap** | bb_squeeze, turtle_55_20 (long), breakout_50_20 (long) |
| mean_reversion | **gap** | **gap** | ema50_bands, rsi2_dip (long) |
| reversal | liq_reversal, liq_reversal_ema, urban_sr_memory | liq_fx_levels, sharp_reversal_aoi (long) | failure_test_2b, wyckoff_spring, gws_reversal |
| sweep | ict_turtle_soup, ict_silver_bullet, ict_turtle_soup_ema | smc_sweep_lite, liq_trend_sweep | **gap** |
| pullback | ict_unicorn, demand_second_leg | anchor_discount (long) | urban_deal_flow |
| score | **gap** | **gap** | confluence |

**Empty cells (8):** trend / swing, breakout / intraday, breakout / swing, mean_reversion / intraday, mean_reversion / swing, sweep / daily, score / intraday, score / swing.
**Long only (1):** pullback / swing.

**Ideas in the archive with no strategy yet:**
- VWAP reversion and VWAP trend days (uploads/05): needs intraday volume; SPY 30m is available.
- MACD divergence with a reversal candle (chat/16): macd() exists in core.ts; plain crossovers lose, so divergence only.
- Chart patterns: flags, double tops, head and shoulders (chat/08): measured-move targets.
- Top-down timeframe filter (D/4H/30m) (chat/11): only some rules use a higher-timeframe filter today.
- Order flow and footprint delta (uploads/10): needs tick or footprint data we do not have.
- Futures session and roll effects (uploads/04): needs futures data.

## Where to look first
- **Breakout and mean reversion on 4h and 1h.** Both styles exist only as daily rules. The SPY 30m data we already have can test them with no new data source.
- **VWAP rules** (uploads/05) fit the same SPY intraday data.
- **MACD divergence** (chat/16) needs only `macd()` from `core.ts` plus a reversal candle.
- **Order flow and futures** ideas need data we don't have, so they wait.
