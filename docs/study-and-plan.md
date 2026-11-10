# Archive study and recommended plan

Written 2026-11-10, after reading all 105 archived sources in full (about 4.5 MB of transcripts) and re-running every strategy we have on real data. The per-source notes are in `docs/archive-study/batch0.md` to `batch8.md`. The full stress-test board is in `docs/archive-study/stress-board-2026-11-10.jsonl`.

**Short version.** None of the sources proved a trading edge. Our own tests found one candidate and one lead. So the data does not support a machine that is guaranteed to make money. It does support a system that keeps searching, tests honestly, risks little, and only promotes what survives. That is what this plan builds. It may take months to find anything worth real money, or it may find nothing; this plan is built to say so either way.

## 1. What the archive contains

| Kind | About | Examples |
|---|---|---|
| Trading education (indicators, patterns, structure, SMC/ICT, Wyckoff, RSI/MACD/BB, VWAP, risk, psychology) | 45 | chat/03–19, chat/47–61, uploads/02–15 |
| AI tools, agents, repos, terminals, model gateways | 35 | chat/20–42, chat/62–76 |
| Quant, HFT and bot-factory material | 14 | chat/77–90, uploads/01 |
| Copy trading, memecoins, keepers | 7 | chat/01–02, chat/23, chat/43–45 |
| Business and careers | 4 | chat/39, chat/63, chat/89 |

**How independent are these sources?**
- Several are duplicates. chat/12 is chat/11. uploads/09 is uploads/07. The second half of uploads/08 is uploads/07 again. Most of chat/90 repeats chat/89.
- About 16 files come from a single educator, so they count as one opinion, not sixteen.
- 45 files mention an affiliate link, a membership, a paid group or a sponsor.

**What evidence do they offer?** No source shows an out-of-sample, cost-inclusive, live track record.
- The biggest numbers are selection bias. These include "821%", "$700 to $89k", "+729% turtle" and "4 wins, 0 losses". The bot factory makes 556–1,000 bots a day. The commodity course ran 1.5–3.2 million optimisation tests.
- The most honest sources are the ones that report failures: the Kronos monkey test (chat/49), the crypto market-making talk (chat/77) and the Day Trader skill's own coin-flip replay (chat/22).

## 2. What our tests say

All of these ran on real bars, net of fees, with the six checks: at least 50 trades, a monkey test, an 18-month holdout, acting one bar late, doubled fees, and costs under half of the moves.

**The full board.** 266 strategy × market pairs. **One passes all six checks:** `dave_prev_range` on SPY 1h (51 trades, +9.1%). It also passed on fresh IWM 30m/1h data earlier.
- Everything else fails, mostly on "beats random" and "survives costs".
- Buy and hold beat almost every rule.

**Leads:**

| Lead | Result |
|---|---|
| IWM AR(1) 12h mean reversion (chat/87) | Sharpe 1.48 vs SPY 0.83, t = 1.34, deflated Sharpe 0.33. Not significant. |
| `dave_prev_range` SPY 4h | Passes everything except trade count (25). |
| End-of-day fade on IWM (new today) | Fading the day's move in the last 30 minutes earns +3.2 bp gross (t = 2.96). After 4 bp round-trip fees it loses. |

**Things that do not help:**
- trailing stops, daily profit stops, the midday filter, currency strength, higher-timeframe alignment
- GARCH (too few trades)
- the Peak systems (0 of 8)
- in-sample "max-Sharpe" weights
- leverage once you pay to borrow

**Things that do work:**
- **Diversification.** Equal weights across low-correlation assets gave 2.3× the average single asset's Sharpe out of sample.
- **Fixed-fraction risk and loss limits.** They don't create profit, but they cap the damage.
- **The validation process itself.** It caught every hyped rule.

**The binding constraint is data, not ideas.** The Massive plan gives only 2 years of history, and two years of daily bars rarely give 50 trades. Even SPY's own Sharpe over 2 years has t = 1.06.

## 3. What that means for the build

1. **Don't build on any one strategy.** Build the loop that finds, tests, incubates and retires them. Count every try, so luck can't sneak through.
2. **Get more data before more rules.** Longer daily history, more symbols, and recorded order books will change more conclusions than another indicator would.
3. **Forward paper trading is the only real evidence.** A rule earns money only after 6 months locked and untouched in paper, and after passing the deflated-Sharpe gate on that forward record.
4. **The safe default is a diversified core.** Until something graduates, the honest benchmark (and what the money would do) is a diversified, risk-weighted hold. Every strategy has to beat it.
5. **Agents do research and reporting, not trading.** They feed the test queue and review results. They never get order, withdraw or pay tools. The risk guard is code, not a prompt.

## 4. Recommended plan

### Phase 1: the autopilot core (build first)

| Part | What it does | Status |
|---|---|---|
| Strategy factory | Runs every registered rule on every market and timeframe it fits. Counts every try, forever. | draft written |
| Validation gate | Applies the six checks, a risk-adjusted win over buy and hold, and a deflated-Sharpe readout. | exists, gets wired in |
| Incubator | Locks each passing rule by hashing its inputs. Judges it only on bars after the lock. Retires it on any failed re-check. | exists (`peak.ts`), gets wired in |
| Portfolio | Inverse-volatility weights, 25% cap per strategy, equal-weight fallback. | `sharpe.ts` |
| Paper execution | Turns each new bar's signal into a paper order intent, through the risk guard: 1% risk, 5 open positions at most, −2% day and −5% week loss limits, a 15% drawdown pause, a hard stop on every trade, no leverage. | draft written |
| Graduation | `live_eligible` needs 6+ months of forward paper that held up, plus the strict gate. Live stays off until Jeremy approves it on the dashboard and sets `APEX_ALLOW_LIVE` himself. | draft written |
| Report | A daily Markdown report: the funnel, the paper book, the closest near-misses, new orders and the research queue. Goes to Telegram and the dashboard, with an AI review under the spend cap. | draft written |
| Terminal and dashboard | An Autopilot tab, plus an `apex` command-line terminal (run, board, report, strategy details). | to build |

### Phase 2: data (runs alongside Phase 1)

1. Longer daily history: 10–20 years for SPY, QQQ, IWM, GLD, TLT, USO and sector ETFs, from a free source whose terms allow it.
2. More intraday symbols from Massive. The plan limits how many years we get, not how many symbols, so pool 20–50 liquid stocks to reach 50+ trades.
3. Start the order-book recorder on a machine with exchange access. That history can't be downloaded later.
4. SEC insider filings via EDGAR, using the `SEC_USER_AGENT` env var, for the insider-buying test.
5. A daily gamma-exposure history, for the chat/47 gamma-filtered last-half-hour test, if the provider's terms allow it.

### Phase 3: the test queue, cheapest first

Each test counts as a try. Each runs on data we already have unless it says otherwise.

1. `dave_prev_range` variants: a measured-move target, a close-not-wick break, a MACD 3-10-16 impulse filter, and strong/weak-level stops.
2. Opening-range breakout from the Day Trader desk, through the six checks on SPY/QQQ/IWM 30m.
3. Session VWAP with 1–3σ bands: a trend pullback, and a flat-VWAP band-2 fade. VWAP is listed first in `strategy-gaps.md`.
4. A momentum-candle breakout: body at least 2× the prior 3 candles, closing strongly beyond the level. It fills the empty breakout/intraday cell.
5. Divergence plus a reversal candle, with the pivot confirmed so it can't look ahead.
6. The chat/13 swing system on a pooled stock list.
7. The QQQ/GLD core rotation, judged by drawdown against hold, on the long daily history (needs Phase 2.1).
8. Insider buying, 5-day hold (needs Phase 2.4).
9. The gamma-filtered last half-hour (needs Phase 2.5). The unfiltered version loses.

### What we should not build

- **Memecoin snipers, dev-snipe copying and paid alert feeds.** No testable edge, and impersonation and manipulation risk.
- **A live Maker keeper.** It needs a hot wallet, and the guide is outdated.
- **Options income.** We have no options chains to test it on.
- **Order-flow, footprint or heat-map rules.** We have no tick data; the recorder comes first.
- **HFT speed games.** Retail can't win them.
- **Leverage as a setting.**
- **Quote stuffing or spoofing.** Illegal.
- **Pooled free AI accounts or unofficial model resellers.** Against the providers' terms.
- **Downloaded vendor bots.** Supply-chain risk.

### What success looks like, honestly

- **After Phase 1:** the system runs by itself every day in paper, and it says plainly that nothing has graduated yet.
- **After 6 months:** zero to a few strategies may graduate. Expect small edges, not the screenshots in the videos.
- **If nothing graduates:** the honest answer is the diversified core plus continued research. Apex will say so instead of inventing a win.

## 5. My own ideas, added to the plan

These come from what the study showed is missing, not from the videos.

1. **Claim checker.** Paste a transcript, a Pine script or a sales page. Apex pulls out the exact rules, writes them as a strategy spec, and runs the six checks plus the deflated Sharpe. It then gives a plain verdict: holds up, near miss, or no edge. That turns our slowest step (reading a video and hand-coding it) into one click. It is also the core of the product track (section 7).
2. **A trial ledger with receipts.** Every test run is recorded with a hash of its inputs, the data and the result, so the deflated Sharpe always charges for every try. Paper results are also published as a verifiable record. This is the honest version of chat/84's "verifiable record".
3. **Pre-registration.** Each test states its hypothesis and pass bar before it runs. The ledger rejects changes to the bar afterwards.
4. **Drift alarm.** Each paper strategy's live trades are compared with its backtest distribution (win rate, average R, drawdown) using a CUSUM-style alarm. A strategy that drifts is paused automatically, before it reaches the drawdown limit.
5. **Correlation dedupe.** A new strategy whose returns correlate above 0.8 with one already in paper counts as a variant, not as diversification. It doesn't get its own weight.
6. **Data firewall.** Stale bars, gaps, bad prints or a feed that disagrees with a second source block trading for that symbol. Every report shows where the data came from.
7. **Venue cost model.** Fees, spread and slippage per venue and asset are measured from the paper fills and fed back into the backtests, so costs aren't guessed.
8. **A micro-live stage after graduation.** If Jeremy approves, a graduated strategy trades a tiny fixed amount first, for example 1% of the intended size. It only scales up once its live record matches paper.
9. **Regime panel.** Trend or range, volatility level and correlation level, shown next to each strategy. This is context only: it never switches strategies on or off by itself, because regime filters didn't help in our tests.
10. **A reviewer that didn't tune it.** An independent validator agent re-runs every promotion from scratch with its own data pull. Two agreeing runs are needed (chat/74).

## 6. Extras Jeremy asked for, and what each is for

All paper-first. None of them gets order, withdraw, pay or transfer tools.

| Type | What to make | Why |
|---|---|---|
| Skills | `apex-archive` (save a transcript verbatim and index it), `apex-claim-check`, `apex-validate` (six checks on a described rule), `apex-daily-review`, `apex-risk-check` | Repeatable steps any Claude session can run the same way |
| MCP server | Extend the read-only Apex MCP with the autopilot board, the trial ledger, run a queued test, the report, and data health | Claude Desktop, Claude Code or the mobile app can ask Apex anything without trade access |
| Claude Code plugin | Bundle the skills, the MCP server and hooks. One hook blocks edits to risk limits or live flags unless a reviewer signs off | Guards the money code at the tool level |
| Agents | Research scout (new sources and papers go into the test queue), data steward (pulls and checks data), validator, risk officer (read-only, can pull the andon cord), reporter, code reviewer. Each has a budget and a purpose in the policy roster | Research and oversight run 24/7 without touching money |
| Automations | Daily autopilot run, hourly data health, weekly research digest, monthly re-validation of everything in paper, end-of-day report to Telegram | "Fully autonomous" in the parts where autonomy is safe |
| Verification | GitHub Actions CI: types, unit tests, pytest, TS/Python parity, look-ahead tests, mutation tests, smoke tests of every API and cron route, golden-file reports. Also a canary paper run on each deploy | Nothing ships that breaks the honesty checks |
| Risk | The existing guard (1% risk, loss limits, drawdown pause, hard stops, no leverage), plus a correlation cap, an asset-class exposure cap, the drift alarm, broker reconciliation before any order, and idempotent order ids | Caps the damage when something is wrong |
| Terminal | `apex` command line: run, board, report, strategy details, ledger, data health | Fast control from a shell |
| Web app | The Vercel dashboard, with an Autopilot tab (funnel, paper book, risk, research queue, ledger) | The main control room |
| Mobile | An installable PWA of the dashboard, plus Telegram for alerts and commands | Phone access without app-store work. Native apps later only if needed |
| Desktop | The same PWA installed as a desktop app. A Tauri wrapper later only if offline use matters | Covered without a second codebase |
| API | Read-only, key-based REST for reports, the board and the ledger | Feeds the MCP server, the mobile app, extensions and the product |
| Browser extension | Later: on a YouTube or TradingView page, send the transcript or script to the claim checker | Research and product channel |
| SaaS | Only if Jeremy picks the product track: multi-user accounts, Stripe billing, per-user limits | A business, separate from trading |
| Docs | White paper, architecture spec, a short spec and test plan per feature, runbooks (data outage, halt, going live), decision records | The design and build threads work from these |

### Approved install shortlist (Jeremy said yes on 2026-11-10)

From `docs/repo-catalog.md`. The build thread installs these. Each is scanned first, and none of them gets order, withdraw or pay tools.
1. PR-Agent, as a GitHub Action on `apex-trading-os`. Money-code changes still need a person's approval.
2. The elephant-goldfish planning plugin, for the design and build threads.
3. Playwright MCP, for dashboard smoke tests.
4. TradingAgents and anthropics/financial-services, as paper-only research desks next to `bots/research-council`.
5. SkillSpector and the Solana dev skill, on Jeremy's machine, because the cloud environment blocked them.

Freqtrade (GPL) and Fincept/Honcho (AGPL) stay separate or ideas-only.

## 7. Product track (Jeremy's call)

The one business model in the archive that clearly makes money is the vendors' own: selling tools and education. The honest version is the claim checker as a product. It answers "does this strategy or bot actually work?" with the six checks and the deflated Sharpe, for traders who buy bots and courses. Delivered as web, API, browser extension and an MCP or plugin for Claude users. It is separate from trading, and nothing is built for it unless he picks it.

## 8. Phases and handover

| Phase | Scope |
|---|---|
| 0 | Repo `apex-trading-os`, CI and the plugin's guard hook |
| 1 | Autopilot core, trial ledger, risk additions, report |
| 2 | Data (in parallel) |
| 3 | Test queue and claim checker |
| 4 | Surfaces: Autopilot tab, CLI terminal, MCP, skills, PWA, API |
| 5 | Product track, only if chosen |

Handover: once Jeremy approves, the design goes to a Fable 5.2 design thread, then the build to a Fable 5.2 build thread, both working from this document. A draft of the autopilot core (`risk.ts`, `pipeline.ts`) is saved in the project files under `apex-drafts/autopilot/` as a starting point. It isn't committed or tested yet.
