# Bot factories, leaderboards and the multiple-testing trap (archive/chat/83, 84, 85, 86)

Four videos from one author who sells futures bots. Everything here is paper only. Nothing was downloaded, installed or
signed up for (no Rithmic package, no Substack, no course, no sample bots). Every performance claim in the videos is unproven.

**The honest headline:** he generates 556 to 1,000 bots a day and says 90 to 99% of them fail. Then he shows the best few
(82% win rate, Sharpe 3, "821% in one month across 765 bots", "4 wins, 0 losses"). Picking the best of hundreds of tries
is how you get great-looking numbers from pure luck. Our selftest shows it: **of 500 simulated bots with no edge at all,
the best one has a Sharpe of 2.6** and would pass a naive check. Our gate charges for every try, and that bot fails it.

## What's built
| Piece | Where | What it does |
|---|---|---|
| Leaderboard | `web/lib/leaderboard.ts` `boardRow`, `rankBoard` | From each paper bot's trade log: wins, losses, win rate, profit factor, Sharpe, max drawdown, profitable months, share of profitable weeks, and alpha and beta against SPY when a benchmark is given. Ranked by a grade built on consistency, not the best day. |
| Strict gate | `strictGate` | Max drawdown (15% default; set 5% for the strict version he mentions), profitable months, at least 50 trades, an optional "must beat the S&P" rule, and a **deflated Sharpe ratio** (Bailey and Lopez de Prado) that tests the Sharpe against what luck would give across `nTrials` tries. `nTrials` must count every variant ever tried, not just the survivors. |
| AI daily review | `dailyReviewPrompt` | Builds the prompt for the dashboard chat. The model gets only the numbers and is told that one day is noise, that many tries inflate the best result, and never to call anything ready for live money. It goes through the gateway, so the daily AI spend cap applies (`APEX_AI_DAILY_BUDGET`, default $5, hard stop at 2x). |
| News digest | `web/lib/news.ts` | Reads RSS/Atom feeds listed in `APEX_NEWS_FEEDS`, keeps headlines about banks, hedge funds, CTAs, central banks, producers, options flow and positioning, and tags the market. Read-only; tags are hints, not signals. |
| Closed-bar paper runner | `bots/paper-exchange/paper_exchange/runner.py` | 60m signal, 5m execution, both from closed bars only. Settings from env vars (`APEX_ACCOUNT_CAPITAL`, `APEX_RISK_PCT`, `APEX_MAX_CONTRACTS`, `APEX_DAILY_LOSS_PCT`, `APEX_WEEKLY_LOSS_PCT`, `APEX_TRADABLE`, default no). Daily and weekly loss limits. JSON event lines and a run manifest (source hash, Python and OS version, settings, dataset id, date range, output hash). No live mode exists. |
| Daily stops and midday filter | `backtest(..., { dayTarget, dayLoss })`, `web/lib/engine/session.ts` `skipMidday` | Tested against always-on in `docs/validation-results.md`: neither rule helped. |

## Rules we keep from these videos
- Judge a bot on weeks and months, drawdown and trade count. A single good day means nothing.
- A track record only counts if it is recorded before the result is known (forward paper trading with logs and a manifest), and if it beats simply holding the S&P 500.
- Count every bot tried. Report the deflated Sharpe next to the raw Sharpe.
- CME micro, nano and weekend Bitcoin contracts are noted as possible data sources only. We have no futures data yet.

## Not built, on purpose
- No Rithmic, IBKR or Redis connection. An in-process event stream already exists in the paper exchange.
- No mass bot generator. The archive already has more rules than real edges; generating more only makes the multiple-testing problem worse.
