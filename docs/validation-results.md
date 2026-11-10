# Validation results on real data (2026-11-10)

This is the honest scorecard. No strategy is guaranteed, and past data is not the future. Everything here is paper only.

## Data
- **SPY**: 30-minute bars from Nov 2024 to Nov 2026, including extended hours, resampled to 1h and 4h.
- **Daily bars** for GLD, USO and QQQ (500 days each), EURUSD (622 days) and BTC (730 days).
- **FX**: the seven USD majors over 622 days. All 28 crosses of 8 currencies are built from them. Open and close are exact; high and low are estimates.
- All data came from the Massive market data connector.
- **Missing**: gold 1h and BTC 4h/1h, because the connector's intraday crypto history is too short to fetch. So the chat/48 "golden cross on gold 1h" claim was checked on GLD daily instead.

## The checks (`web/lib/engine/validate.ts`)
Each strategy is run through six checks:
1. At least 50 trades.
2. The monkey test: it must beat 95% of 200 random traders who take the same number of trades, with the same holding times and the same costs.
3. Profit on the locked last 18 months.
4. Still profitable when every decision acts one bar late.
5. Still profitable with doubled fees.
6. Fees under half of what the price moves earned.

Fees are set per market: 2 bp for SPY/QQQ, 5 bp for GLD/USO, 1 bp for FX, 10 bp for BTC. Slippage is half the fee.

## Headline
**No strategy passed every check on any data set.** None has an edge yet. Not one strategy reached both 50 trades and a 95% monkey score anywhere. The closest results were:
- `confluence` on SPY 4h: 49 trades, +15.1%, beat 85% of random traders. It fell just short on both the trade count and the monkey test.
- `demand_second_leg` on USO daily: +12.1% and beat 97.5% of random traders, but on only 3 trades. That is a story, not evidence.
- Buy and hold beat almost every rule on GLD, USO and QQQ over this window (+57%, +98% and +32%).

## Urban Forex rules (chat/60 + 61), pooled across all 28 FX crosses
Results are from `web/scripts/validate-urban.ts` at FX costs (1 bp a side). "Avg R" is the average result per trade in units of risk.

| Rule | Window | Trades | Win rate | Avg R | Monkey |
|---|---|---|---|---|---|
| Deal flow, no filter | 2 years | 26 | 35% | +0.03 | 0.46 |
| Deal flow + strength filter | 2 years | 19 | 21% | -0.35 | 0.33 |
| S/R memory + DNA, no filter | 2 years | 19 | 26% | -0.33 | 0.25 |
| S/R memory + DNA + strength | 2 years | 11 | 18% | -0.61 | 0.19 |
| Deal flow, no filter | last 18 months | 20 | 30% | -0.09 | 0.44 |
| S/R memory + DNA, no filter | last 18 months | 6 | 17% | -0.69 | 0.20 |

- **With vs without the strength filter**: on this data the filter made both rules *worse*, and it halved the number of trades.
- **Neighbour settings**: a deeper required discount (50% instead of 38%) did better (22 trades, 41% win rate, +0.22R), but that is still under 50 trades and below the monkey bar. Moving the S/R departure threshold between 2 and 3 ATR made no difference to the result.
- **On SPY 1h** (both webinars say any product works): deal flow made 24 trades and lost 7.2%, beating 10% of random traders. S/R memory made 31 trades and lost 2.8%, beating 39%. Both passed 0 of 6 checks.
- **The webinars' CADJPY and EURJPY P&L screens** (20 standard lots, $2,250 and $1,400 open P&L, and the "300–400k a trade" claim) are **unproven**. They are screenshots of open trades, not a track record.

## Every registered strategy across the 7 data sets
"Sets that made money" counts data sets with a positive total return. "Best monkey score" is the share of random traders beaten on the best data set, with that set's trade count. "Most checks passed" is out of 6.

| Strategy | Trades (all 7 sets) | Sets that made money | Best monkey score | Most checks passed |
|---|---|---|---|---|
| turtle_55_20 | 120 | 3 of 7 | 0.72 (USO 1d, 3 trades) | 4/6 (GLD 1d) |
| sma50_trend | 441 | 5 of 7 | 0.73 (BTC 1d, 23 trades) | 4/6 (GLD 1d) |
| rsi2_dip | 309 | 3 of 7 | 0.84 (BTC 1d, 12 trades) | 4/6 (SPY 4h) |
| breakout_50_20 | 12 | 2 of 7 | 0.60 (SPY 4h, 1 trades) | 4/6 (SPY 1h) |
| bb_squeeze | 171 | 1 of 7 | 0.94 (GLD 1d, 5 trades) | 4/6 (GLD 1d) |
| rsi_regime | 148 | 2 of 7 | 0.48 (GLD 1d, 5 trades) | 4/6 (QQQ 1d) |
| failure_test_2b | 530 | 1 of 7 | 0.82 (USO 1d, 31 trades) | 3/6 (USO 1d) |
| smc_sweep_lite | 142 | 2 of 7 | 0.55 (EURUSD 1d, 3 trades) | 4/6 (USO 1d) |
| wyckoff_spring | 180 | 2 of 7 | 0.73 (USO 1d, 4 trades) | 4/6 (EURUSD 1d) |
| confluence | 337 | 3 of 7 | 0.84 (SPY 4h, 49 trades) | 4/6 (SPY 4h) |
| supertrend | 245 | 1 of 7 | 0.78 (BTC 1d, 18 trades) | 3/6 (BTC 1d) |
| golden_cross | 35 | 2 of 7 | 0.69 (USO 1d, 1 trades) | 4/6 (SPY 4h) |
| ict_turtle_soup | 89 | 2 of 7 | 0.79 (BTC 1d, 1 trades) | 4/6 (USO 1d) |
| ict_silver_bullet | 0 | 0 of 7 | 0.00 (SPY 1h, 0 trades) | 0/6 (SPY 1h) |
| ict_unicorn | 368 | 0 of 7 | 0.43 (BTC 1d, 23 trades) | 1/6 (SPY 1h) |
| liq_trend_sweep | 55 | 2 of 7 | 0.64 (GLD 1d, 3 trades) | 4/6 (GLD 1d) |
| liq_reversal | 56 | 5 of 7 | 0.72 (GLD 1d, 3 trades) | 4/6 (USO 1d) |
| liq_fx_levels | 74 | 3 of 7 | 0.93 (QQQ 1d, 6 trades) | 4/6 (QQQ 1d) |
| psar_reverse | 670 | 2 of 7 | 0.55 (BTC 1d, 32 trades) | 4/6 (GLD 1d) |
| psar_adx | 443 | 3 of 7 | 0.93 (USO 1d, 11 trades) | 4/6 (USO 1d) |
| sma_10_20 | 355 | 1 of 7 | 0.84 (GLD 1d, 12 trades) | 3/6 (EURUSD 1d) |
| ema50_bands | 132 | 3 of 7 | 0.88 (SPY 4h, 22 trades) | 4/6 (EURUSD 1d) |
| ict_turtle_soup_ema | 16 | 2 of 7 | 0.79 (BTC 1d, 1 trades) | 4/6 (USO 1d) |
| liq_reversal_ema | 23 | 1 of 7 | 0.72 (GLD 1d, 3 trades) | 4/6 (GLD 1d) |
| demand_second_leg | 82 | 1 of 7 | 0.97 (USO 1d, 3 trades) | 5/6 (USO 1d) |
| sharp_reversal_aoi | 7 | 2 of 7 | 0.84 (SPY 4h, 1 trades) | 4/6 (SPY 1h) |
| gws_reversal | 9 | 0 of 7 | 0.40 (SPY 4h, 3 trades) | 1/6 (SPY 1h) |
| anchor_discount | 101 | 1 of 7 | 0.62 (BTC 1d, 4 trades) | 3/6 (BTC 1d) |
| urban_deal_flow | 44 | 2 of 7 | 0.75 (QQQ 1d, 1 trades) | 4/6 (GLD 1d) |
| urban_sr_memory | 39 | 2 of 7 | 0.88 (USO 1d, 2 trades) | 4/6 (USO 1d) |
| buy_hold | 7 | 6 of 7 | 1.00 (GLD 1d, 1 trades) | 5/6 (GLD 1d) |

## What this means
- Daily bars over two years give too few trades for most of these rules. The 50-trade bar is the main failure everywhere.
- The next step is more history (5–10 years of daily data, or 1h bars across many symbols), not more rules. More history will only come from a data source with longer intraday history, or from the TradingView bridge once Jeremy approves Remote Control.
- Nothing gets promoted from paper on these numbers.

Rerun with `cd web && npx tsx scripts/validate-all.ts` and `npx tsx scripts/validate-urban.ts`.
