"""Apex Research Council: a TradingAgents-style multi-agent desk (archive/chat/20 ranks TradingAgents S tier,
AI Hedge Fund's investor personas and Vibe Trading's research agents) running on Claude.

Pipeline per symbol:
  1. Data pack (computed, not hallucinated): engine confluence breakdown, every strategy's latest signal,
     backtest leaderboard row for the asset, recent candles, and optional headlines.
  2. Analysts in parallel: technical, market-structure/SMC, risk/volatility, news/sentiment.
  3. Bull researcher vs bear researcher debate (2 rounds) using only the analysts' reports.
  4. Risk manager applies the Apex house rules (1% risk, R:R >= 2, cooldowns, no trade without a stop).
  5. Portfolio manager outputs ONE structured decision: BUY / SELL / HOLD with entry, stop, target, confidence.
Decisions are PROPOSALS. They are posted to the dashboard approval queue and never executed by this script.

  ANTHROPIC_API_KEY=... python council.py BTCUSDT --source binance --tf 1d
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "engine"))

from apex_engine import data, backtest as bt  # noqa: E402
from apex_engine.strategies import REGISTRY, get  # noqa: E402
from apex_engine.strategies.confluence import explain  # noqa: E402
from apex_engine.reporter import Reporter  # noqa: E402

FAST = os.environ.get("APEX_ANALYST_MODEL", "claude-sonnet-5-5")
DEEP = os.environ.get("APEX_JUDGE_MODEL", "claude-opus-5-5")

HOUSE_RULES = """House rules (non-negotiable): risk at most 1% of equity per trade; every trade has an entry, a stop and a
target before it is placed; reward:risk at least 2; no trading against the higher-timeframe trend unless it is an explicit
failure-test reversal; after a loss there is a cooldown; HOLD is always an acceptable answer and usually the right one.
Never invent data: use only the numbers in the data pack. Past backtests do not guarantee future results."""

ANALYSTS = {
    "technical": "You are the technical analyst. Read trend, momentum (RSI regime, MACD divergence), volatility (ATR, Bollinger width) and the confluence breakdown. Say what the chart says and what would invalidate it.",
    "structure": "You are the market-structure and smart-money analyst. Identify HH/HL or LH/LL structure, last BOS/CHoCH, liquidity resting above/below, any sweep or failure test, and the nearest support/resistance.",
    "risk": "You are the risk and volatility analyst. Given ATR and recent range, propose a stop that sits beyond structure (not inside noise), compute R multiples to the nearest levels, and flag event or volatility risk.",
    "sentiment": "You are the news and sentiment analyst. Using only the headlines provided (may be empty), judge whether news supports, contradicts or is irrelevant to the technical picture. If there are no headlines, say so.",
}


def claude(model: str, system: str, user: str, max_tokens: int = 1200) -> str:
    import anthropic
    client = anthropic.Anthropic()
    msg = client.messages.create(model=model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}])
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def data_pack(source: str, symbol: str, tf: str, headlines: list[str] | None = None) -> dict:
    df = data.load(source, symbol, tf, 800).iloc[:-1]
    sigs = []
    for sid in sorted(REGISTRY):
        if sid == "buy_hold":
            continue
        s = get(sid).latest(df)
        if s["side"]:
            res = bt.run(df, get(sid), symbol=symbol, timeframe=tf)
            sigs.append({**s, "name": REGISTRY[sid].name, "backtest": {k: res.metrics[k] for k in ("total_return", "max_drawdown", "trades", "win_rate", "profit_factor")}})
    last = df.tail(30).round(4)
    from apex_engine import indicators as ind
    return {"symbol": symbol, "timeframe": tf, "last_close": float(df["close"].iloc[-1]), "atr14": float(ind.atr(df, 14).iloc[-1]),
            "rsi14": float(ind.rsi(df["close"], 14).iloc[-1]), "sma50": float(ind.sma(df["close"], 50).iloc[-1]),
            "sma200": float(ind.sma(df["close"], 200).iloc[-1]), "confluence": explain(df), "active_signals": sigs,
            "candles_last_30": last.reset_index().astype(str).values.tolist(), "headlines": headlines or []}


def run(source, symbol, tf, headlines=None, rounds=2):
    pack = data_pack(source, symbol, tf, headlines)
    pj = json.dumps(pack, default=str)
    with cf.ThreadPoolExecutor(4) as ex:
        futs = {k: ex.submit(claude, FAST, f"{v}\n{HOUSE_RULES}", f"Data pack:\n{pj}\n\nWrite your report in under 200 words.") for k, v in ANALYSTS.items()}
        reports = {k: f.result() for k, f in futs.items()}
    rep_txt = "\n\n".join(f"## {k}\n{v}" for k, v in reports.items())
    debate = []
    for r in range(rounds):
        hist = "\n".join(debate)
        bull = claude(FAST, "You are the bull researcher. Argue the strongest evidence-based case to go long, rebutting the bear.", f"Analyst reports:\n{rep_txt}\n\nDebate so far:\n{hist}\n\nRound {r + 1}, under 150 words.")
        debate.append(f"BULL: {bull}")
        bear = claude(FAST, "You are the bear researcher. Argue the strongest evidence-based case against going long (or for a short), rebutting the bull.", f"Analyst reports:\n{rep_txt}\n\nDebate so far:\n{chr(10).join(debate)}\n\nRound {r + 1}, under 150 words.")
        debate.append(f"BEAR: {bear}")
    risk = claude(FAST, f"You are the risk manager.\n{HOUSE_RULES}", f"Data pack:\n{pj}\n\nReports:\n{rep_txt}\n\nDebate:\n{chr(10).join(debate)}\n\nList any rule violations a trade here would cause and the maximum acceptable stop distance. Under 150 words.")
    schema = '{"action":"BUY|SELL|HOLD","entry":number|null,"stop":number|null,"target":number|null,"confidence":0-1,"horizon":"string","thesis":"<=60 words","invalidation":"string"}'
    final = claude(DEEP, f"You are the portfolio manager. Decide. {HOUSE_RULES}\nReply with ONLY a JSON object: {schema}",
                   f"Data pack:\n{pj}\n\nAnalysts:\n{rep_txt}\n\nDebate:\n{chr(10).join(debate)}\n\nRisk manager:\n{risk}", 800)
    m = re.search(r"\{.*\}", final, re.S)
    decision = json.loads(m.group(0)) if m else {"action": "HOLD", "thesis": "unparseable decision; defaulting to HOLD"}
    if decision.get("action") in ("BUY", "SELL"):
        e, s, t = decision.get("entry"), decision.get("stop"), decision.get("target")
        if not all(isinstance(x, (int, float)) for x in (e, s, t)) or abs(t - e) < 2 * abs(e - s):
            decision = {**decision, "action": "HOLD", "overridden": "failed house rules (missing levels or R:R < 2)"}
    out = {"symbol": symbol, "timeframe": tf, "decision": decision, "analysts": reports, "debate": debate, "risk": risk, "pack": pack}
    Reporter("research-council", "research", "AI Research Council", "proposal").event("proposal", json.dumps({"symbol": symbol, "tf": tf, **decision}))
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("symbol")
    p.add_argument("--source", default="binance")
    p.add_argument("--tf", default="1d")
    p.add_argument("--rounds", type=int, default=2)
    p.add_argument("--out")
    a = p.parse_args()
    res = run(a.source, a.symbol, a.tf, rounds=a.rounds)
    txt = json.dumps(res, indent=1, default=str)
    if a.out:
        open(a.out, "w").write(txt)
    print(json.dumps(res["decision"], indent=1))


if __name__ == "__main__":
    main()
