# Strategy gap map (archive/chat/75)

Each registered strategy is placed on a grid of style and default timeframe, so you can see where the library has nothing. Regenerate it with `cd web && npx tsx scripts/gap-scan.ts`. The selftest fails if a new strategy is added without a style in `web/lib/engine/gaps.ts`.

**A gap is a research lead, not an edge.** Anything built to fill one has to pass the same six checks as every other rule (`docs/validation-results.md`). So far nothing has passed all six. Timeframes here are each strategy's default. The validation runs try every rule on every data set anyway.

| Style | Intraday (1h and under) | Swing (4h) | Daily |
|---|---|---|---|
| trend | supertrend, golden_cross (long) | **gap** | rsi_regime, psar_reverse, psar_adx, sma_10_20, peak_dueling_momentum, sma50_trend (long) |
| breakout | opening_range_breakout, momentum_candle_breakout | **gap** | bb_squeeze, peak_stop_breakout, turtle_55_20 (long), breakout_50_20 (long) |
| mean_reversion | garch_vol_premium, vwap_flat_fade | **gap** | ema50_bands, peak_extreme_fade, peak_low_vol_reversal, rsi2_dip (long) |
| reversal | liq_reversal, liq_reversal_ema, urban_sr_memory, dave_swing_count, divergence_pivot | liq_fx_levels, sharp_reversal_aoi (long) | failure_test_2b, wyckoff_spring, gws_reversal |
| sweep | ict_turtle_soup, ict_silver_bullet, ict_turtle_soup_ema | smc_sweep_lite, liq_trend_sweep | **gap** |
| pullback | ict_unicorn, demand_second_leg, dave_prev_range, dave_prev_range__measured_move, dave_prev_range__close_break, dave_prev_range__macd_impulse, dave_prev_range__weak_stop, vwap_trend_pullback | anchor_discount (long) | urban_deal_flow |
| score | **gap** | **gap** | confluence |

**Empty cells (6):** trend / swing, breakout / swing, mean_reversion / swing, sweep / daily, score / intraday, score / swing.
**Long only (1):** pullback / swing.

**Ideas in the archive with no strategy yet:**
- Chart patterns: flags, double tops, head and shoulders (chat/08): measured-move targets.
- Top-down timeframe filter (D/4H/30m) (chat/11): only some rules use a higher-timeframe filter today.
- Order flow and footprint delta (uploads/10): needs tick or footprint data we do not have.
- Futures session and roll effects (uploads/04): needs futures data.

## Where to look first
- **Breakout and mean reversion on 4h.** Both styles still have no swing-timeframe rule.
- **The intraday breakout cell is filled, and it loses.** Opening-range and momentum-candle breakouts were tested on SPY, QQQ and IWM 30m on 11 November 2026 and rejected on all three (`docs/validation-results.md`, last section). The same run tested the VWAP rules (rejected) and MACD divergence (passes on SPY 1h only, loses on QQQ and IWM).
- **Order flow and futures** ideas need data we don't have, so they wait.
