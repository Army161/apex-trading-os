# Repo and tool catalog

This lists every GitHub repo, agent and open-source tool named in the archive. Each was checked on GitHub on 2026-11-10 for its license, stars, last push and whether it is archived. Nothing here has been installed. The standing rule is that nothing gets installed without Jeremy's yes, and two earlier installs (the Solana skill and SkillSpector) were blocked by this environment.

**Verdicts:**
- **use**: worth running as a separate tool next to Apex.
- **ideas**: borrow the design only. This applies to every copyleft license, and to closed or weak code.
- **skip**: no value for us, or not safe.

## Trading and finance repos

| Repo | Source | License | Stars | Last push | Verdict | Status in Apex |
|---|---|---|---|---|---|---|
| TauricResearch/TradingAgents | chat/20 | Apache-2.0 | 121.9k | 2026-11-04 | use as a research desk, paper only | Analyst-team pattern built in `bots/research-council` |
| freqtrade/freqtrade | chat/20 | **GPL-3.0** | 56.7k | 2026-11-10 | use as a separate program (dry-run); never copy its code into Apex | `bots/freqtrade` config + strategies |
| virattt/ai-hedge-fund | chat/20 | MIT | 64.6k | 2026-11-09 | ideas (investor personas) | Built as lenses |
| ZhuLinsen/daily_stock_analysis | chat/20 | MIT | 69.5k | 2026-11-10 | ideas | Built as the morning brief |
| HKUDS/Vibe-Trading | chat/20 | MIT | 38.0k | 2026-11-10 | use for research comparison, paper only | Not installed |
| anthropics/financial-services | chat/20 | Apache-2.0 | 41.2k | 2026-10-28 | use (analysis agents; no trading) | Not installed |
| LuckyOne7777/LLM-Trading-Lab | chat/20 | none stated | 7.6k | 2026-06-24 | skip (no license, one tiny account) | — |
| Jakeschincariol/day-trader-skill | chat/22 | MIT | 6.6k | 2026-10-20 | use (paper) | Built as `bots/alpaca/daytrader`; its ORB still needs our 6 checks |
| Fincept-Corporation/FinceptTerminal | chat/26, 30 | **AGPL-3.0** | 33.7k | 2026-11-09 | ideas only, never copy code | Ideas in the dashboard |
| shiyu-coder/Kronos | chat/49 | MIT | 47.6k | 2026-04-13 | skip as a signal: it failed the monkey test in the video. Possible benchmark later | — |
| tradesdontlie/tradingview-mcp | chat/04 | not stated (NOASSERTION) | 7.2k | 2026-10-21 | use on Jeremy's machine once the license is clarified; read-only | Setup in `bots/tradingview-bridge`; needs his Remote Control |
| quiknode-labs/qn-guide-examples (Polymarket copy bot) | chat/02 | MIT | 274 | 2026-11-10 | ideas | Built as `bots/polymarket-copy` (paper) |
| makerdao/auction-keeper | chat/01 | could not be checked (not found) | — | — | skip live; the guide is outdated | `bots/maker-clip-keeper`, watch-only |
| PyPortfolio/PyPortfolioOpt | chat/82 | MIT | 6.2k | 2026-07-07 | use if we need efficient frontiers (our tests favour simple weights) | Our own combiner in `sharpe.ts` |
| bashtage/arch | chat/82 | NCSA-style (shown as NOASSERTION) | 1.7k | 2026-11-09 | use for GARCH cross-checks | Our own GARCH in `garch.ts` |
| rundef/async_rithmic | chat/84 | MIT | 129 | 2026-10-09 | skip for now; Rithmic forbids sharing its code and allows one connection | — |
| solana-foundation/solana-dev-skill | Jeremy's request | MIT | 590 | 2026-11-04 | use; Jeremy asked for it, but the environment blocked the install | Not installed |

## AI agents, coding and ops tools

| Repo | Source | License | Stars | Last push | Verdict | Status in Apex |
|---|---|---|---|---|---|---|
| anomalyco/opencode | chat/66, 67 | MIT | 225.9k | 2026-11-10 | optional second coding agent | — |
| pingdotgg/t3code | chat/72 | MIT | 55.6k | 2026-11-10 | optional multi-agent front end | — |
| The-PR-Agent/pr-agent | chat/73 | MIT | 15.9k | 2026-11-10 | **use**: automatic PR review in CI for the money code | Planned in CI (plan section 6) |
| google/elephant-goldfish-model | chat/40, 74 | Apache-2.0 | 17.1k | 2026-11-10 | **use**: plan and review discipline as a plugin | Pattern used; plugin not installed |
| NVIDIA/SkillSpector | chat/31 | Apache-2.0 | 25.2k | 2026-11-10 | **use**: scan skills before installing; the install was blocked here | Our own `tools/skill_scan.py` |
| microsoft/playwright-mcp | chat/32 | Apache-2.0 | 39.5k | 2026-11-10 | **use**: smoke tests and UI checks | `npm run check:ui` uses Playwright |
| garrytan/gstack | chat/32 | MIT | 141.1k | 2026-11-10 | ideas (role skills for reviews) | — |
| mvanhorn/last30days-skill | chat/32 | MIT | 67.2k | 2026-11-10 | ideas | Built as the crowd check |
| tt-a1i/archify | chat/31 | Apache-2.0 | 95.4k | 2026-11-10 | optional (architecture diagrams for the docs) | — |
| CopilotKit/OpenBot | chat/65 | MIT | 10.7k | 2026-11-10 | ideas (action log, allow-list, failure off switch) | Built in `policy.ts` |
| cheaper-inference/OmniRoute | chat/69 | MIT | 86.3k | 2026-11-10 | skip: pooling free accounts breaks provider terms | — |
| open-jarvis/OpenJarvis | chat/29 | Apache-2.0 | 14.3k | 2026-11-10 | optional local assistant; Apex is Claude-only until Jeremy decides | — |
| androoAGI/starnet | chat/62–64 | MIT | 1.8k | 2026-11-07 | skip (funnel product; Apex already has an agent office) | — |
| mrdainami/nami | chat/68 | Apache-2.0 | 349 | 2026-09-22 | skip | — |
| plastic-labs/honcho | chat/35 | **AGPL-3.0** | 8.1k | 2026-11-10 | ideas only | Memory and "dream" built our own way |
| Herder (herder.dev) | chat/21, 41 | repo not found on GitHub | — | — | pending Jeremy's answer; don't install | — |
| Open Mousebot, Claude Ads, REA/Jarvis, God's Eye View, Floot, SlopMonster, Browse | chat/28, 31, 32, 66, 70 | not found or not clear | — | — | skip unless Jeremy wants one; Browse's "Patchright" evades bot detection, so never use it | — |
| Commit API, Grokbot, TradeWiz, Coinquant, the memecoin trackers | chat/23, 42–45, 48, 76 | closed or paid | — | — | skip | — |

## Shortlist to install, if Jeremy approves

1. **PR-Agent**, as a GitHub Action on the new repo. Every change gets an automatic review; money code also needs a person.
2. **Elephant-goldfish plugin**, for the Fable 5.2 design and build threads.
3. **SkillSpector**, on Jeremy's machine. It was blocked in this cloud environment.
4. **Playwright MCP**, for the dashboard smoke tests.
5. **TradingAgents and anthropics/financial-services**, as research desks next to `bots/research-council`, with no order tools.
6. **Solana dev skill**, which Jeremy asked for earlier. It needs to run on his machine.

Freqtrade is already set up (GPL, kept as a separate program). Everything else above is ideas only or skip.
