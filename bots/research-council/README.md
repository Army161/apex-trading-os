# AI Research Council

Two desks, both research only. Each posts a proposal to the dashboard's Council tab for you to approve or reject; neither places trades.

## Analyst team (`analyst_team.py`, from archive/chat/25)

1. **Discovery**: Claude with web search gathers dated, sourced facts (news, fundamentals or tokenomics, catalysts, sentiment).
2. **Five analysts in parallel**, each returning a structured 0-100 score: technical 30%, fundamental 20%, sentiment 15%, risk 15% (high = low risk), thesis 20% (bull case, bear case, dated catalysts).
3. Optional `--personas`: deep-value (Graham-style), quality (Buffett-style), growth (Lynch-style), inversion (Munger-style) and macro lenses, shown side by side so you can see where they agree and disagree (persona prompts as a research aid, not the real investors; ideas from archive/chat/26 and chat/30).
4. **Trade plan**: entry zone, stop, 3 targets, risk matrix, optional `--options` idea (illustrative, no chain data).
5. **House rules in code**: the model never sets the size or the action. Size = 1% of `APEX_EQUITY` / stop distance; target 2 must be at least 2R; stop between 0.3 and 3 ATR; a long needs a team score of 65+. Otherwise the answer is HOLD, with the reason.
6. Markdown report saved to `reports/`.

```bash
pip install anthropic pandas numpy
export ANTHROPIC_API_KEY=...            # in your shell, never in chat
python analyst_team.py analyze BTCUSDT --tf 1d --personas
python analyst_team.py analyze AAPL --source alpaca --tf 1d   # needs Alpaca paper keys
python analyst_team.py quick ETHUSDT                          # 60-second snapshot, no web search
python analyst_team.py compare BTCUSDT ETHUSDT SOLUSDT
python -m pytest test_team.py -q                              # offline tests, model stubbed
```

Models: `APEX_JUDGE_MODEL` (default claude-opus-5-5) for discovery, thesis and plan; `APEX_ANALYST_MODEL` (default claude-sonnet-5-5) for the other analysts. Server-side refusal fallbacks are switched on, and the report notes when a fallback model answered.

## Debate desk (`council.py`, from archive/chat/20)

Four analysts, a bull vs bear debate, a risk manager and a portfolio manager. `python council.py BTCUSDT --tf 1d`.
