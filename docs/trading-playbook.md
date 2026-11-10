# Apex trading playbook

This is every testable rule in the archive, boiled down. The method comes from archive/chat/75, and `.claude/agents/playbook-distiller.md` keeps it up to date. The tested status comes only from `docs/validation-results.md` (real data, run 2026-11-10), never from what a speaker claimed. **No rule here has a proven edge yet.** The closest is the chat/78 previous-range pullback, which passes all six checks on SPY and IWM intraday but still needs forward paper trading (see `docs/validation-results.md`). Profit screenshots in the videos are unproven.

The status tags mean:
- **no edge**: tested, failed the checks.
- **closest**: tested, best result so far, but still short of the bar.
- **untested**: not run on real data yet.
- **habit**: can't be backtested, but is enforced in the dashboard or the bots.

## 1. Survival and size (habit; enforced in risk code)
- Risk 1% of the account per trade; 2% at most. Size = (account × risk%) ÷ |entry − stop|. (uploads/06, uploads/03, chat/17)
- Losses compound against you. A loss of L needs a gain of L ÷ (1 − L) to recover: −10% needs +11%, −50% needs +100%. (uploads/06)
- Break-even win rate = 1 ÷ (1 + R). At 2R you need 33%; at 3R you need 25%. Win rate alone means nothing. (uploads/06)
- Kelly sizing only after 100+ backtested trades, and then only half or quarter Kelly. (uploads/06)
- No Martingale. Never average down without a written plan and a maximum size. (uploads/06, chat/58–59)
- Use a hard stop. Never a mental stop. (uploads/06)
- Set entry, stop and target before you enter. Cool down after a loss. Pause a bot when its drawdown passes its backtest worst. (chat/07)

## 2. Stops and targets (habit)
- Technical stop: just past the point where the idea is wrong (the swing, the wick, the zone). (uploads/06, chat/06)
- Volatility stop: 1.5–2× ATR. Combined stop: technical level plus 0.25–0.5× ATR of room. (uploads/06)
- Target: 2R by default, or the next opposing level, whichever comes first. Skip the trade when a level sits too close to leave room. (uploads/06, chat/08, chat/09)

## 3. Filters
- **Regime first.** In a trend (ADX ≥ 25), trade with it. RSI above 50 is a continuation bias, and RSI over 70 alone is never a sell. In a range, fade 30/70 only with a reversal candle. (chat/15) `rsi_regime`: no edge.
- **Higher timeframe agrees.** Use daily, then 4h, then the entry timeframe. (chat/11, chat/61) Used in `urban_sr_memory`: no edge.
- **Indicators filter; they don't trigger.** Plain MACD crossovers lose. Use divergence plus a reversal candle. (chat/16) untested.
- **Bollinger Bands aren't support or resistance.** In a trend, price rides the band. (chat/18)
- **Currency strength** (trade only currencies that are strong or weak across the board). (chat/60) Tested: it made results *worse* and halved the trade count.

## 4. Setups, by type
| Setup | Rule in short | Source | Strategy id | Status |
|---|---|---|---|---|
| Breakout | Close above the 55-day high, 2× ATR stop, exit on the 20-day low | chat/03 | `turtle_55_20` | no edge |
| Trend | Long above the SMA 50, flat below | chat/05 | `sma50_trend` | no edge |
| Dip in an uptrend | RSI(2) < 10 above the SMA 200 | uploads/01 | `rsi2_dip` | no edge |
| Squeeze | Tightest bands, then a strong close outside on volume | chat/18 | `bb_squeeze` | no edge |
| Failure test (2B) | Break past the swing, close back inside | chat/06, uploads/12 | `failure_test_2b` | no edge |
| Liquidity grab | Wick sweeps a level and closes back; stop past the wick | chat/09, uploads/08, chat/50–51 | `smc_sweep_lite`, `liq_*`, `ict_*` | no edge |
| Spring / upthrust | False break of a range that closes back inside on volume | chat/19 | `wyckoff_spring` | no edge |
| Confluence score | Structure, level, candle, momentum and context ≥ 60 | chat/17 | `confluence` | **closest**: SPY 4h, 49 trades, +15%, beat 85% of random traders |
| Second leg | Skip leg one; enter leg two after a 30–79% pullback | chat/56 | `demand_second_leg` | closest on USO, but only 3 trades |
| Pullback speed | After an impulse, wait for a 38%+ discount, then the fast return | chat/60 | `urban_deal_flow` | no edge |
| S/R memory + DNA | The second push into a zone is choppier; enter on the failed retest | chat/61 | `urban_sr_memory` | no edge |
| Previous-range pullback | After a break of structure, a 50% retrace into the leg that broke it, a sweep and a close above the last down candle; target the high | chat/78 | `dave_prev_range` | **candidate**: 6/6 on SPY 30m/1h and on fresh IWM 30m/1h; fails on 4h and daily; mostly shorts |
| Swing-count reversal | Counter-trend only after 4+ swings into a higher-timeframe level | chat/78 | `dave_swing_count` | too few trades to judge |
| GARCH volatility premium | Fade an intraday RSI/Bollinger extreme on days after GARCH forecasts more volatility than recent history | chat/82 | `garch_vol_premium` | too few trades (1-4 in two years) |
| AR(1) 12h mean reversion | Fit return(next 12h) on return(last 12h); trade every hour, hold 12h, cap the total | chat/87 | `quant.ts takeStrategy` | lead on IWM 1h only (deflated Sharpe 0.33 after 84 tries); SPY and QQQ lose to holding |
| Commodity course systems | 35-bar fade, low-volume reversal, dueling momentum, 45-bar breakout, 20-bar time exit | chat/88 | `peak_*` | no edge (0 of 8 sets pass) |
| Insider buying | Officer or director open-market buys of $10k or more; hold 5 sessions | chat/46 | `bots/alpaca/daytrader/insider.py` | untested on real data |

## 5. What the tests taught
- Buy and hold beat almost every rule on GLD, USO and QQQ in this window. Every rule has to beat that first.
- Two years of daily data rarely gives 50 trades. Longer history or intraday data comes before any verdict.
- Filters cut the trade count faster than they lift quality. Test each filter on and off.
- Trailing stops (chat/78 and chat/81) all did worse than the fixed target on the pullback candidate.
- Daily profit-target stops and skipping the midday lull (chat/86) did not help either.
- The best of many tries looks good by luck alone: the best of 500 no-edge bots has a Sharpe near 2.6. Count every try (`docs/bot-factory-and-leaderboard.md`).
- Judge on expected value per trade after fees, not win rate (chat/87). At 1-hour horizons, fees turned every AR(1) model negative.
- Lock the inputs and incubate for 6 months or more before trusting a rule (chat/88).
- Gaps in the library are listed in `docs/strategy-gaps.md`.
