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

## chat/78 rules (fractal scalper interview), added 2026-11-10
Scripts: `web/scripts/validate-dave.ts` (21 variants × 7 data sets = 139 runs) and `web/scripts/validate-dave-oos.ts` (QQQ and IWM 30m, fetched afterwards as fresh data). Sizing is the engine's 1% fixed fraction, never the 5–8% from the video. The "$700 to $89,000 in three weeks" claim is **unverified**.

**The first result here that passes all six checks, with caveats.** The previous-range pullback (`dave_prev_range`, 50% retrace, fixed target back to the high) is it:

| Data | Trades | Return | Monkey | Checks |
|---|---|---|---|---|
| SPY 30m | 109 | +9.9% | 0.995 | 6/6 |
| SPY 1h | 51 | +9.1% | 0.975 | 6/6 |
| SPY 4h | 25 | +11.9% | 0.985 | 5/6 (too few trades) |
| **IWM 30m (fresh data)** | 73 | +11.6% | 0.97 | **6/6** |
| **IWM 1h (fresh data)** | 56 | +12.7% | 0.995 | **6/6** |
| QQQ 30m (fresh data) | 96 | +8.9% | 0.945 | 5/6 (just misses the monkey bar) |
| QQQ 1h / 4h, IWM 4h | 49 / 27 / 21 | −4.9% / −3.0% / −1.8% | ~0.5 | fails |
| Daily bars (GLD, QQQ, EURUSD, BTC) | 1–9 each | mixed | — | fails (too few trades) |

Why this is a **candidate, not a proven edge**:
- **It was one of 21 variants tried.** The 50% depth and the fixed target were the video's own defaults, chosen before testing, which helps. Still, some passes are expected by chance at this many tries.
- **The fresh-data check uses the same two years** of US index ETFs that move together. It's a check on new markets, not on a new time period.
- **About 90% of the trades are shorts, in a rising market.** Buy and hold made +25.6% on SPY, +31.6% on QQQ and +17.3% on IWM, so the rule earned less than holding. Its value would be as a hedge that makes money when holding doesn't, not as a replacement.
- **Costs matter.** On SPY 30m, raising fees to 2.5× cuts the return from +9.9% to +0.7%. It passes the doubled-fee check only narrowly.
- **It only works intraday (30m and 1h).** On 4h and daily it fails.
- **Next step:** paper trade it forward on SPY, QQQ and IWM 30m from today, and judge it only on trades made after today.

**Other chat/78 claims:**
- **"Wait for 4 higher highs and 4 higher lows" (`dave_swing_count`)** almost never triggers: 18 trades across all 7 sets, and 4–6 on each fresh set. That is too few to prove or disprove it. With 2 swings it passed on SPY 30m (57 trades, 6/6) but lost on SPY 1h and 4h and on IWM and QQQ, so that pass looks like chance. **Unproven.**
- **Exits:** the fixed target beat all three trailing exits (bullish candle lows, swing lows, 21 EMA close-below) on most sets. A swing-low trail at a 70% depth also passed on SPY 30m (72 trades).
- **Skipping the first hour of the New York open** made little difference. It cut about 17% of trades and passed 6/6 on SPY 30m and IWM 30m, but it fell to 4/6 on IWM 1h.
- **Top-down alignment (4× and 16× timeframes agree)** cut trades by about 85% and made results worse. We have no 1m or 15m data, so his exact daily/4h/15m/1m stack couldn't be tested.

## chat/81: trailing-stop modes vs Dave's trails (run 2026-11-10)

The MQL5 EA author says he never tested his EA, warns it bleeds in quiet markets, needs low spreads, and sends so many stop
modifications that a broker may ban the account. We built the four modes ourselves (`web/lib/engine/trail.ts`) with his
guards: never loosen, keep the stop past the entry, stay on the right side of the bid/ask, and respect a broker stop level.
The trail is measured from the bid (ask for shorts) with a 0.02% spread, and every stop modification is counted. All on the
chat/78 previous-range pullback (0.5 depth), fees 0.02% a side, full six checks. Cells: checks passed · trades · return.

| Exit | SPY 30m | SPY 1h | QQQ 30m | QQQ 1h | IWM 30m | IWM 1h | Mods/trade |
|---|---|---|---|---|---|---|---|
| fixed target (baseline) | 6/6 · 109 · +9.9% | 6/6 · 51 · +9.1% | 5/6 · 96 · +8.9% | 1/6 · 49 · -4.9% | 6/6 · 73 · +11.6% | 6/6 · 56 · +12.7% | 0.0 |
| dave: candle-low trail | 1/6 · 151 · -1.3% | 1/6 · 77 · -4.3% | 1/6 · 162 · -6.2% | 1/6 · 76 · -10.2% | 2/6 · 131 · -1.7% | 1/6 · 74 · +0.3% | 0.0 |
| dave: swing-low trail | 1/6 · 136 · -7.1% | 2/6 · 70 · -4.6% | 1/6 · 148 · -9.8% | 1/6 · 73 · -16.6% | 1/6 · 122 · -8.4% | 1/6 · 67 · -3.5% | 0.0 |
| dave: 21 EMA trail | 1/6 · 142 · -3.4% | 1/6 · 74 · -6.3% | 1/6 · 146 · -5.2% | 1/6 · 73 · -14.4% | 2/6 · 126 · -6.1% | 1/6 · 64 · -5.5% | 0.0 |
| ea: scalp 0.5/0.3 ATR | 1/6 · 152 · -4.0% | 1/6 · 76 · -4.2% | 2/6 · 156 · -2.2% | 2/6 · 75 · -5.4% | 2/6 · 129 · -5.1% | 5/6 · 73 · +3.4% | 1.2 |
| ea: scalp 1.0/0.5 ATR | 1/6 · 146 · +0.6% | 2/6 · 73 · -4.5% | 3/6 · 152 · -1.3% | 1/6 · 68 · -5.7% | 2/6 · 124 · -0.8% | 6/6 · 69 · +7.5% | 1.3 |
| ea: scalp 0.5/0.3 + target | 1/6 · 152 · -5.4% | 1/6 · 76 · -3.4% | 2/6 · 156 · -2.4% | 1/6 · 76 · -3.5% | 2/6 · 129 · -3.9% | 5/6 · 73 · +4.0% | 0.8 |
| ea: previous 2 candles | 1/6 · 146 · -3.5% | 1/6 · 71 · -2.7% | 6/6 · 136 · +7.8% | 2/6 · 69 · -3.8% | 3/6 · 125 · +3.4% | 6/6 · 71 · +10.8% | 2.1 |
| ea: previous 3 candles + target | 1/6 · 144 · -1.9% | 2/6 · 71 · -3.6% | 6/6 · 136 · +7.4% | 1/6 · 67 · -6.4% | 3/6 · 124 · +3.5% | 6/6 · 73 · +7.7% | 1.1 |
| ea: fast EMA 9 | 1/6 · 148 · -5.7% | 1/6 · 70 · -6.3% | 2/6 · 151 · -3.3% | 1/6 · 67 · -9.1% | 3/6 · 126 · -3.0% | 5/6 · 69 · +5.9% | 3.5 |
| ea: Tenkan-sen 9 | 1/6 · 146 · -3.2% | 1/6 · 69 · -9.0% | 1/6 · 131 · -3.9% | 1/6 · 66 · -5.9% | 3/6 · 126 · -7.8% | 3/6 · 69 · +0.6% | 2.6 |
| ea: Tenkan-sen 9 + target | 1/6 · 148 · -6.7% | 1/6 · 69 · -6.7% | 2/6 · 134 · +0.2% | 1/6 · 67 · -1.1% | 3/6 · 127 · -2.6% | 3/6 · 73 · +1.4% | 1.2 |

- **No trail beat the fixed target.** The fixed target passed 6/6 on four sets; the best trail (previous 2 candles) passed on
  two (QQQ 30m, IWM 1h) and lost money on SPY. Trailing cuts winners short, so the strategy re-enters more often and pays more fees.
- **Modification counts here are a floor.** We decide on 30m/1h closes, so it is 1 to 3.5 changes a trade. His EA trails on
  every tick, which is where the broker-ban warning comes from. The paper-bot version (`bots/paper-exchange/paper_exchange/trail.py`)
  caps modifications per minute for that reason.
- Status: **unproven, no edge.** Reproduce with `cd web && npx tsx scripts/validate-trails.ts`.

## chat/82: GARCH volatility-premium intraday rule (run 2026-11-10)

The course built this on simulated data, so its equity curve proves nothing. Our version (`garch_vol_premium`) fits a
GARCH(1,1) (we recover alpha 0.091, beta 0.853 from simulated data with true 0.10/0.85), needs 180 days for the fit and
another 180 for the premium's own spread. With two years of real data that leaves about 140 tradable days, and the rule
fired 1 to 4 times on SPY, QQQ and IWM 30m (returns -0.8% to +1.1%). **Too few trades to judge.** It needs a longer daily
history; our data plan returns two years. The course's k-means momentum portfolio needs the full S&P 500 universe and the
Twitter engagement strategy needs a sentiment dataset; neither is built. Reproduce with `npx tsx scripts/validate-garch.ts`.

## chat/86: daily profit-target stop and midday filter vs always-on (run 2026-11-10)

Tested on SPY, QQQ and IWM at 30m and 1h (6 sets each), averages across sets:

| Strategy | Always on | Skip 11:30-13:30 NY | Stop at +0.5% day | Stop at +1% day | Stop at -1% day |
|---|---|---|---|---|---|
| dave_prev_range | +7.9%, 4/6 sets pass | +6.5%, 4/6 | +7.5%, 4/6 | +7.3%, 4/6 | +8.0%, 5/6 |
| smc_sweep_lite | -9.7%, 0/6 | -7.4%, 0/6 | -9.2%, 0/6 | -9.2%, 0/6 | -10.3%, 0/6 |
| rsi2_dip | -2.0%, 0/6 | -1.9%, 0/6 | -2.0%, 0/6 | -2.0%, 0/6 | -2.0%, 0/6 |

- **Neither rule turned a loser into a winner, and neither helped the candidate in any meaningful way.** The -1% daily loss
  stop moved one set (QQQ 30m) from 5/6 to 6/6 by 0.7 points; that is one test out of many, so it counts as noise.
- Skipping the midday lull cut losses a little on the sweep rule but cost the candidate 1.4 points.
- The author's "4 wins, 0 losses" bots are far below our 50-trade minimum and mean nothing yet.
- Reproduce with `npx tsx scripts/validate-session.ts`.

## chat/87: AR(1) taking strategy (run 2026-11-10)

`web/lib/engine/quant.ts`: the feature is the log return over the last h bars and the target is the next h bars. The model
is fit by OLS (and by SGD as a check) on the first 60% in time order and traded on the last 40%. Every bar opens a 1/h slice
held h bars (frequency scaling), with 0.02% fees a side on SPY/QQQ/IWM 1h. There are 84 configurations in total, so the
deflated Sharpe is charged for 84 tries.

- **Every fitted weight was negative (mean reversion)** on every market and horizon.
- **1-hour horizon:** fees eat it. The net EV is about -3.5 to -4.5 basis points a slice on all three ETFs, and -68% to -77% at constant size.
- **12-hour horizon:** SPY and QQQ never beat buy-and-hold in 28 tries (best +1.9% vs +8.7% and +8.3%). IWM made +15% to +21% vs +6.9%,
  with a Sharpe of 0.9 to 1.5 and a 51% to 56% win rate. That is the video's "tiny edge, many bets" shape, but the deflated Sharpe
  after 84 tries is only 0.10 to 0.33 (we need 0.95). **It is a lead for forward paper trading, not an edge.**
- **The threshold filter** (keep only the strongest 30% of predictions) raised EV per trade on IWM 12h from +0.5 to +1.9 bp, while cutting trades by 72%.
- **tanh and hardtanh sizing** matched constant sizing once the scale was set from the training predictions. Neither beat it clearly.
- **Daily BTC, GLD and EURUSD:** about 200 to 300 test days. Nothing was significant (best deflated Sharpe 0.03).
- Stops and targets were not added. The video's rule is to add them only if they raise EV, and our trailing-stop tests (chat/81) never did.
- Reproduce with `npx tsx scripts/validate-quant.ts`. The market-making simulator also gained a model skew (`predict`, `skewK`) and a
  volatility spread (`volSpreadK`). These are untested on real quotes because the recorder hasn't run yet.

## chat/88: commodity course example systems (run 2026-11-10)

His examples (profit factor 1.7 to 4.2) were picked from about 1.5 million entry, exit and market tests. We ran our versions on 8 sets:
GLD, USO, QQQ, BTC and EURUSD daily, and SPY, QQQ and IWM 4h. Each had a 20-bar time exit and a 2 ATR stop.

| System | Best result | Sets passing 6/6 |
|---|---|---|
| 35-bar extreme fade | 4/6 on QQQ 1d (24 trades) and SPY 4h (+8.2%, vs +25.4% hold) | 0 of 8 |
| Low-volume reversal | 4/6 on QQQ and BTC 1d, under 20 trades each | 0 of 8 |
| Dueling momentum 50/100 | 4/6 on USO 1d, 10 trades | 0 of 8 |
| 45-bar stop breakout | 4/6 on GLD, USO and BTC 1d, 12 to 20 trades; lost on all 4h sets | 0 of 8 |

- **None passed.** Daily data gives too few trades, and on 4h bars, where there are enough trades, most of these systems lose money.
- **Walk-forward** (re-tuning on about a year of bars, then trading the next quarter, on SPY 4h): the extreme fade made -1.8% out of sample
  and the breakout made -27.2%. The chosen lookback kept changing from window to window, which is the instability walk-forward is meant to expose.
- **Correlation matrix** of the 16 system-market daily return series: the average pair correlation is 0.00 (from -0.73 to +0.69). So
  the diversification point holds, but diversifying across rules that don't make money doesn't help.
- **Incubation** is now a locked record (`lockForIncubation`) plus a report that scores only bars after the lock
  (`incubationReport`, 6 months minimum). This is the same idea as forward paper trading.
- Reproduce with `npx tsx scripts/validate-peak.ts`.

## chat/90: Sharpe reports, SPY benchmark, correlation-aware combiner (run 2026-11-10)

`web/lib/sharpe.ts` and `web/scripts/validate-sharpe.ts`. Annualised Sharpe uses √252 for daily bars and √12 for monthly. The t-stat equals the per-period Sharpe × √n.

**Buy and hold, about 2 years of daily bars:**

| Asset | Sharpe | t-stat | one-sided p |
|---|---|---|---|
| SPY (benchmark) | 0.73 | 1.06 | 0.14 |
| QQQ | 0.68 | 1.00 | 0.16 |
| IWM | 0.45 | 0.66 | 0.26 |
| GLD | 1.04 | 1.47 | 0.07 |
| USO | 1.05 | 1.48 | 0.07 |
| BTC (√365) | 0.14 | 0.20 | 0.42 |
| EURUSD | 0.31 | 0.49 | 0.31 |

None of these clears t ≥ 1.96. Two years is too short to tell even SPY's Sharpe from zero. The video quotes 0.45 for SPY over 20 years; our window was a good one.

**Combiner:** weights were fitted on the first half (497 common days) and scored on the second.

| Method | Test Sharpe | Annual vol | Sharpe vs the average single asset |
|---|---|---|---|
| Equal weight | 1.08 | 14.0% | 2.32× |
| Inverse vol | 1.02 | 11.0% | 2.20× |
| Min variance | 1.04 | 5.8% | 2.23× |
| Max Sharpe (tangency) | 0.36 | 21.3% | 0.78× |

Diversification works: low correlations helped. SPY/QQQ/IWM have correlations of 0.8–0.95; USO, EURUSD and GLD sit near zero. But the "optimal" max-Sharpe weights, fitted in-sample, were the worst out of sample. They loaded 61% on GLD just before it cooled off. Use equal weight or inverse vol unless the weights hold up on fresh data.

**IWM AR(1) 12h lead vs SPY (208 test days):**
- Sharpe 1.48 against SPY's 0.83 on the same days.
- t-stat 1.34, p = 0.09.
- Correlation 0.30, beta 0.26.
- Alpha +15.2% a year, information ratio 0.40.

This is still a lead only. It isn't significant on its own, and its deflated Sharpe after 84 tries is 0.33.

**Leverage, research only** (with a 5% a year borrow cost):

| Leverage | Sharpe | Max drawdown |
|---|---|---|
| 1× | 1.48 | −6.7% |
| 2× | 1.27 | −13.7% |
| 3× | 1.21 | −20.4% |

Borrowing costs make Sharpe fall, not hold steady, and drawdown scales with leverage. Leverage is not a setting anywhere in the bots.

## First autopilot run: check 7 across the 266 pairs (run 2026-11-11, plan item P1.13)

This is the first run of the new pipeline (`npm run apex -- run --full --seed plan:P1.13`), with every result pre-registered and written to a hash-chained ledger before it was looked at. Gate `standard-bar-v1` (version `5fc1ec70c4da`) has seven checks. The first six are the ones the earlier board used; check 7 is new: the strategy's Sharpe must beat buy and hold of its own market over the same bars, with a positive return. Costs are the cost-model priors, which are assumed, not measured.

**Result: 1 of 266 pairs passes all seven checks.** 261 are rejected, 4 need more trades, none errored.

| | Count |
|---|---|
| Pairs evaluated | 266 (38 strategies on 7 markets) |
| Pass checks 1 to 6 | 1 |
| Pass check 7 alone (beat hold on Sharpe) | 21 |
| Pass all seven | 1 |
| Failed check 1 (50 trades) | 233 |
| Failed check 2 (monkey test) | 258 |

**The one that passes is still `dave_prev_range` on SPY 1h** (bars from 2024-11-11 to 2026-11-10):

| Measure | Value |
|---|---|
| Trades | 51 (the bar is 50) |
| Return | +8.7%, against +25.5% for holding SPY |
| Sharpe | 0.90, against 0.75 for holding SPY |
| Max drawdown | -8.4%, against -20.5% for holding SPY |
| Win rate, profit factor | 55%, 1.46 |
| t-stat | 1.27 |
| Deflated Sharpe after 266 trials | 4.6% (the forward gate asks for 95%) |

**How to read it.** It passes the bar, so it moves on. It is not proven:

- It made about a third of what holding SPY made. It wins check 7 only on risk, because it sat in cash 70% of the time.
- 51 trades is one over the minimum.
- With 266 things tried, one pass is about what luck alone would produce. The deflated Sharpe of 4.6% says the same.
- The same rule on SPY 4h has 25 trades and fails only on the trade count. That is weak support, not confirmation.

**What happened next.** A separate validator run re-ran it on the same bars and agreed exactly (level L1: same data, so this catches bugs, not bad data). The next run locked it into paper as the first slot. Its status is **checking**. It will be judged only on bars after the lock. The earliest it can graduate is six months of forward bars and 50 forward trades.

**Limits of this run.**

- The validator could only use the same file. A second data source (level L2) needs a data key and accepted terms, which are Jeremy's to set up.
- The SPY 1h file is a day old, so the firewall marks it not tradable and no paper order was opened. That is correct behaviour. Paper orders start when the nightly run has fresh bars.
- With one slot the weight cap is 25% of equity. On this strategy's tight intraday stops, that cap leaves less than half the intended risk on 68 of 79 past signals, and the risk guard blocks those rather than take an odd size. The slot's own forward record is not affected (it is judged at fixed risk), but the paper book would take few of its trades. This is a rule choice for Jeremy, not something to loosen quietly.
- The ledger for this run was made in a build container. The ledger of record starts with the first nightly run in GitHub Actions, which repeats this run from an empty ledger.

Still not passing, as before: trails (chat/81), GARCH (chat/82), daily stop and midday filter (chat/86), the Peak systems (chat/88), and every daily strategy on 2 years of data (too few trades). The IWM AR(1) lead is not in this registry yet.
