"""Apex AI Analyst Team (archive/chat/25, plus the investor-persona idea from archive/chat/26).

  analyze SYMBOL   discovery (web search) -> 5 analysts in parallel -> weighted 0-100 trade score -> trade plan -> report
  quick SYMBOL     60-second snapshot: one call, no web search, same score scale
  compare A B ...  quick snapshot of each, ranked side by side
  --personas       add value / quality / growth / inversion / macro investor lenses (persona prompts, a research aid, not the real people)
  --options        add an options idea (educational: Apex has no options chain feed, so strikes are illustrative)

Every number the agents see comes from the engine's data pack or cited web results. Sizing, R:R and the final action are
computed in code from the house rules, never taken from the model. Output is a PROPOSAL: it goes to the dashboard
approval queue and a Markdown report. Nothing here places trades.

  ANTHROPIC_API_KEY=... python analyst_team.py analyze BTCUSDT --source binance --tf 1d
  python analyst_team.py analyze AAPL --source alpaca --tf 1d --personas
  python analyst_team.py compare BTCUSDT ETHUSDT SOLUSDT
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "engine"))

from apex_engine import data, indicators as ind, backtest as bt  # noqa: E402
from apex_engine.strategies import REGISTRY, get  # noqa: E402
from apex_engine.strategies.confluence import explain  # noqa: E402
from apex_engine.patterns import swings  # noqa: E402

FAST = os.environ.get("APEX_ANALYST_MODEL", "claude-sonnet-5-5")
DEEP = os.environ.get("APEX_JUDGE_MODEL", "claude-opus-5-5")
RISK_PCT = float(os.environ.get("APEX_RISK_PCT", "0.01"))
EQUITY = float(os.environ.get("APEX_EQUITY", "10000"))

WEIGHTS = {"technical": 0.30, "fundamental": 0.20, "sentiment": 0.15, "risk": 0.15, "thesis": 0.20}
RULES = ("Use only numbers from the data pack or the discovery notes (which cite sources). If something is unknown, say "
         "unknown; never guess prices, dates or figures. No strategy is guaranteed and past results do not predict returns. "
         "Scores: 0-100 where 50 is neutral, above 50 favours buying, below 50 favours avoiding or selling. "
         # number trust tags (archive/chat/33): every figure says how far to trust it
         "Tag every figure you state: [verified: source] when a cited source or the data pack shows it, [unverified] when only "
         "one weak or undated source has it, [suspicious: why] when sources disagree or it looks wrong. Data-pack numbers count as verified.")

AGENTS = {
    "technical": "You are the technical analyst. Judge trend, structure (higher highs/lows), momentum (RSI regime, MACD), volatility (ATR), "
                 "the confluence breakdown and which engine strategies are signalling, with their backtest record.",
    "fundamental": "You are the fundamental analyst. For a stock: revenue and earnings trend, margins, balance sheet, valuation versus peers. "
                   "For a crypto asset: supply and unlocks, adoption and on-chain activity, revenue or fees, token utility. Use the discovery notes.",
    "sentiment": "You are the sentiment analyst. Judge news flow, analyst or community tone, positioning (funding, short interest, flows) "
                 "from the discovery notes, and whether sentiment is stretched (a contrarian warning) or just starting to turn.",
    "risk": "You are the risk analyst. A HIGH score means LOW risk. Judge volatility versus the asset's history, drawdown in the backtests, "
            "event risk (earnings, unlocks, macro dates), liquidity, and how far the nearest invalidation level is.",
    "thesis": "You are the thesis strategist. Write the strongest bull case and bear case, list dated catalysts, and score your conviction "
              "that the bull case plays out over the stated horizon.",
}
# Investor-style lenses (archive/chat/26 and chat/30). Prompts written in the spirit of each style's public writing,
# a research aid, not the real people and not their views.
PERSONAS = {
    "value": "Deep-value lens (Graham-style): price versus book and earnings, balance-sheet safety, margin of safety. "
             "Would a cautious buyer pay this price if the market closed for five years?",
    "quality": "Quality-compounder lens (Buffett-style): durable moat, owner earnings, honest management, pricing power. "
               "Is this a wonderful business at a fair price, or a fair business at a wonderful price?",
    "growth": "Growth-at-a-reasonable-price lens (Lynch-style): is the growth story simple, early and still accelerating, "
              "and is the price reasonable for that growth (PEG near or below 1)?",
    "inversion": "Inversion lens (Munger-style): list how this investment loses money first. Incentives, leverage, "
                 "dilution, competition. Score high only if the ways to lose are few and unlikely.",
    "macro": "Macro lens: rates, dollar, liquidity and risk appetite. Does the macro backdrop help or fight this asset right now?",
}

AGENT_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["score", "stance", "summary", "evidence", "red_flags"],
                "properties": {"score": {"type": "integer"}, "stance": {"type": "string", "enum": ["bullish", "neutral", "bearish"]},
                               "summary": {"type": "string"}, "evidence": {"type": "array", "items": {"type": "string"}},
                               "red_flags": {"type": "array", "items": {"type": "string"}}}}
THESIS_SCHEMA = {"type": "object", "additionalProperties": False,
                 "required": ["score", "stance", "summary", "evidence", "red_flags", "bull_case", "bear_case", "catalysts", "horizon"],
                 "properties": {**AGENT_SCHEMA["properties"], "bull_case": {"type": "array", "items": {"type": "string"}},
                                "bear_case": {"type": "array", "items": {"type": "string"}}, "horizon": {"type": "string"},
                                "catalysts": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["date", "event", "impact"],
                                                                         "properties": {"date": {"type": "string"}, "event": {"type": "string"},
                                                                                        "impact": {"type": "string", "enum": ["positive", "negative", "unclear"]}}}}}}
PLAN_SCHEMA = {"type": "object", "additionalProperties": False,
               "required": ["side", "entry_low", "entry_high", "stop", "targets", "invalidation", "risk_matrix", "options_idea", "notes"],
               "properties": {"side": {"type": "string", "enum": ["long", "short", "none"]}, "entry_low": {"type": "number"}, "entry_high": {"type": "number"},
                              "stop": {"type": "number"}, "targets": {"type": "array", "items": {"type": "number"}}, "invalidation": {"type": "string"},
                              "risk_matrix": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["risk", "probability", "impact", "mitigation"],
                                                                         "properties": {"risk": {"type": "string"}, "probability": {"type": "string", "enum": ["low", "medium", "high"]},
                                                                                        "impact": {"type": "string", "enum": ["low", "medium", "high"]}, "mitigation": {"type": "string"}}}},
                              "options_idea": {"type": "string"}, "notes": {"type": "string"}}}
QUICK_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["score", "stance", "one_liner", "key_levels", "watch_for"],
                "properties": {"score": {"type": "integer"}, "stance": {"type": "string", "enum": ["bullish", "neutral", "bearish"]},
                               "one_liner": {"type": "string"}, "key_levels": {"type": "array", "items": {"type": "string"}},
                               "watch_for": {"type": "array", "items": {"type": "string"}}}}

USED_FALLBACK = []


def ask(model: str, system: str, user: str, schema: dict | None = None, search: int = 0, effort: str = "medium", max_tokens: int = 6000):
    """One Claude call. Structured output when a schema is given; web search when search > 0. Server-side refusal fallbacks are on."""
    import anthropic
    client = anthropic.Anthropic()
    kw: dict = {"output_config": {"effort": effort, **({"format": {"type": "json_schema", "schema": schema}} if schema else {})}}
    if search:
        kw["tools"] = [{"type": "web_search_20260209", "name": "web_search", "max_uses": search}]
    msgs = [{"role": "user", "content": user}]
    for _ in range(4):  # server-side tool loops can pause; resend to resume
        r = client.beta.messages.create(model=model, max_tokens=max_tokens, system=system, messages=msgs,
                                        betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kw)
        if any(getattr(x, "type", "") == "fallback_message" for x in (getattr(r.usage, "iterations", None) or [])):
            USED_FALLBACK.append(model)
        if r.stop_reason == "pause_turn":
            msgs = [msgs[0], {"role": "assistant", "content": r.content}]
            continue
        break
    if r.stop_reason == "refusal":
        raise RuntimeError("model declined")
    if r.stop_reason == "max_tokens":
        raise RuntimeError("reply cut off at max_tokens")
    text = "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
    return json.loads(text) if schema else text


def data_pack(source: str, symbol: str, tf: str) -> dict:
    df = data.load(source, symbol, tf, 800)
    if source != "csv":
        df = df.iloc[:-1]  # drop the forming candle
    c = df["close"]
    a = float(ind.atr(df, 14).iloc[-1])
    sw = swings(df)
    active, board = [], []
    for sid in sorted(REGISTRY):
        if sid == "buy_hold":
            continue
        res = bt.run(df, get(sid), symbol=symbol, timeframe=tf)
        row = {"id": sid, **{k: res.metrics[k] for k in ("total_return", "max_drawdown", "trades", "win_rate", "profit_factor")}}
        board.append(row)
        s = get(sid).latest(df)
        if s["side"]:
            active.append({**s, "name": REGISTRY[sid].name, "backtest": row})
    hi52, lo52 = float(df["high"].tail(252).max()), float(df["low"].tail(252).min())
    ret = lambda n: float(c.iloc[-1] / c.iloc[-1 - n] - 1) if len(c) > n else None  # noqa: E731
    return {"symbol": symbol, "timeframe": tf, "source": source, "asof": str(df.index[-1]), "last_close": float(c.iloc[-1]), "atr14": a,
            "atr_pct": a / float(c.iloc[-1]), "rsi14": float(ind.rsi(c, 14).iloc[-1]), "sma50": float(ind.sma(c, 50).iloc[-1]),
            "sma200": float(ind.sma(c, 200).iloc[-1]), "range_252": [lo52, hi52], "returns": {"20": ret(20), "60": ret(60), "252": ret(252)},
            "last_swing_high": float(sw["last_sh"].iloc[-1]) if "last_sh" in sw else None, "last_swing_low": float(sw["last_sl"].iloc[-1]) if "last_sl" in sw else None,
            "confluence": explain(df), "active_signals": active,
            "strategy_backtests": sorted(board, key=lambda r: r["total_return"], reverse=True)[:8],
            "candles_last_20": df.tail(20).round(6).reset_index().astype(str).values.tolist()}


def discovery(symbol: str, pack: dict) -> str:
    return ask(DEEP, "You are the research lead. Use web search to gather current, dated facts with sources. " + RULES,
               f"Asset: {symbol} (last close {pack['last_close']} as of {pack['asof']}). Find: what the asset is; latest news (last 30 days) with dates; "
               "fundamentals (stock: last 4 quarters revenue/EPS, margins, debt, valuation vs peers; crypto: supply, unlocks, fees/revenue, "
               "adoption); upcoming dated catalysts (earnings, unlocks, launches, macro); sentiment and positioning. "
               "Crowd check (idea from archive/chat/32): sweep the last 30 days of Reddit, X, YouTube, Hacker News and Polymarket "
               "for what real people say, the main bull and bear arguments, and any Polymarket odds on related events; label it "
               "crowd opinion, not fact, and flag one-sided euphoria or panic as a contrarian warning. "
               "Return compact notes grouped by topic, each fact with its source URL and date. Under 600 words.", search=6, effort="medium", max_tokens=12000)


def score(reports: dict) -> dict:
    total = sum(WEIGHTS[k] * max(0, min(100, int(reports[k]["score"]))) for k in WEIGHTS if k in reports)
    w = sum(WEIGHTS[k] for k in WEIGHTS if k in reports) or 1
    s = round(total / w)
    grade = "strong buy setup" if s >= 75 else "buy setup" if s >= 65 else "neutral / watch" if s >= 45 else "avoid"
    return {"score": s, "grade": grade, "weights": WEIGHTS, "parts": {k: reports[k]["score"] for k in WEIGHTS if k in reports}}


def finalize(plan: dict, pack: dict, sc: dict) -> dict:
    """House rules in code: stop on the right side, T2 at least 2R, size = 1% risk / stop distance, 1/3 off at each target."""
    side, e_lo, e_hi, stop, tg = plan["side"], plan["entry_low"], plan["entry_high"], plan["stop"], sorted(plan.get("targets") or [])
    out = {**plan, "action": "HOLD", "checks": []}
    if side == "none":
        out["checks"].append("no trade proposed")
        return out
    entry = (e_lo + e_hi) / 2
    if side == "short":
        tg = tg[::-1]
    risk = (entry - stop) if side == "long" else (stop - entry)
    if risk <= 0:
        out["checks"].append("stop is on the wrong side of the entry")
    if len(tg) < 3:
        out["checks"].append("needs three targets")
    rr = [((t - entry) if side == "long" else (entry - t)) / risk for t in tg] if risk > 0 else []
    if rr and (len(rr) < 2 or rr[1] < 2):
        out["checks"].append("second target is under 2R")
    if risk > 0 and risk > 3 * pack["atr14"]:
        out["checks"].append("stop is more than 3 ATR away; size would be tiny, wait for a tighter setup")
    if risk > 0 and risk < 0.3 * pack["atr14"]:
        out["checks"].append("stop sits inside normal noise (under 0.3 ATR)")
    need = 65 if side == "long" else 35
    if (side == "long" and sc["score"] < need) or (side == "short" and sc["score"] > need):
        out["checks"].append(f"team score {sc['score']} does not support a {side} (needs {'>=' if side == 'long' else '<='} {need})")
    qty = EQUITY * RISK_PCT / risk if risk > 0 else 0
    qty = min(qty, EQUITY / entry)
    out.update({"entry": entry, "targets": tg, "r_multiples": [round(x, 2) for x in rr], "size": {"equity": EQUITY, "risk_pct": RISK_PCT, "qty": qty,
                "notional": qty * entry, "risk_usd": qty * risk}, "scaling": "take 1/3 at each target; move the stop to breakeven after target 1"})
    if not out["checks"]:
        out["action"] = "BUY" if side == "long" else "SELL"
    return out


def analyze(source: str, symbol: str, tf: str, personas: bool = False, options: bool = False, web: bool = True) -> dict:
    pack = data_pack(source, symbol, tf)
    notes = discovery(symbol, pack) if web else "Discovery skipped (no web search). Fundamentals and news are unknown."
    ctx = f"Data pack:\n{json.dumps(pack, default=str)}\n\nDiscovery notes:\n{notes}"
    jobs = {k: (DEEP if k == "thesis" else FAST, v, THESIS_SCHEMA if k == "thesis" else AGENT_SCHEMA) for k, v in AGENTS.items()}
    if personas:
        jobs.update({f"lens_{k}": (FAST, v, AGENT_SCHEMA) for k, v in PERSONAS.items()})
    with cf.ThreadPoolExecutor(len(jobs)) as ex:
        futs = {k: ex.submit(ask, m, f"{p}\n{RULES}", f"{ctx}\n\nReport on {symbol}. Keep summary under 120 words.", sch) for k, (m, p, sch) in jobs.items()}
        reports = {}
        for k, f in futs.items():
            try:
                reports[k] = f.result()
            except Exception as e:  # one failed agent shouldn't sink the report; it is left out of the score
                reports[k] = {"error": str(e)}
    good = {k: v for k, v in reports.items() if "score" in v}
    sc = score(good)
    plan = ask(DEEP, "You are the head of trading. Turn the team's work into one trade plan or none. " + RULES +
               " Entry zone near current price or a nearby level; stop beyond structure; three targets at real levels. "
               "side 'none' is a good answer when the score or setup is weak. " +
               ("Add one options idea using strikes relative to the targets, labelled illustrative because no options chain data is available."
                if options else "Set options_idea to an empty string."),
               f"{ctx}\n\nTeam reports:\n{json.dumps(good)}\n\nWeighted team score: {sc['score']}/100 ({sc['grade']}).", PLAN_SCHEMA, effort="high")
    final = finalize(plan, pack, sc)
    return {"symbol": symbol, "timeframe": tf, "asof": pack["asof"], "score": sc, "reports": reports, "plan": final, "discovery": notes,
            "pack": pack, "fallback_used": sorted(set(USED_FALLBACK))}


def quick(source: str, symbol: str, tf: str) -> dict:
    pack = data_pack(source, symbol, tf)
    q = ask(FAST, "You give 60-second market snapshots from data only. " + RULES,
            f"Data pack:\n{json.dumps(pack, default=str)}\n\nSnapshot {symbol}: score, stance, one line, 3 key levels, 3 things to watch.", QUICK_SCHEMA, effort="low", max_tokens=3000)
    return {"symbol": symbol, "timeframe": tf, "asof": pack["asof"], "last_close": pack["last_close"], **q}


def compare(source: str, symbols: list[str], tf: str) -> list[dict]:
    with cf.ThreadPoolExecutor(min(6, len(symbols))) as ex:
        rows = list(ex.map(lambda s: quick(source, s, tf), symbols))
    return sorted(rows, key=lambda r: r["score"], reverse=True)


def to_markdown(r: dict) -> str:
    p, sc = r["plan"], r["score"]
    L = [f"# {r['symbol']} {r['timeframe']} analyst team report", f"As of {r['asof']}. Research only, not advice. No strategy is guaranteed.", "",
         f"## Trade score: {sc['score']}/100 ({sc['grade']})", "", "| Dimension | Weight | Score | Stance |", "|---|---|---|---|"]
    for k, w in sc["weights"].items():
        x = r["reports"].get(k, {})
        L.append(f"| {k} | {int(w * 100)}% | {x.get('score', 'failed')} | {x.get('stance', x.get('error', ''))} |")
    t = r["reports"].get("thesis", {})
    L += ["", "## Bull case", *[f"- {x}" for x in t.get("bull_case", [])], "", "## Bear case", *[f"- {x}" for x in t.get("bear_case", [])],
          "", "## Catalysts", *[f"- {c['date']}: {c['event']} ({c['impact']})" for c in t.get("catalysts", [])], "",
          f"## Trade plan: {p['action']}"]
    if p.get("side") != "none":
        L += [f"- Side: {p['side']}, entry zone {p['entry_low']:.4g} to {p['entry_high']:.4g}, stop {p['stop']:.4g}",
              f"- Targets: {', '.join(f'{x:.4g}' for x in p.get('targets', []))} (R: {', '.join(map(str, p.get('r_multiples', [])))})"]
        if p.get("size"):
            s = p["size"]
            L.append(f"- Size at {s['risk_pct'] * 100:.1f}% risk on ${s['equity']:,.0f}: {s['qty']:.6g} units, ${s['notional']:,.0f} notional, ${s['risk_usd']:,.0f} at risk")
        L.append(f"- Scaling: {p.get('scaling', '')}")
    L += [f"- Invalidation: {p['invalidation']}", *[f"- Blocked: {c}" for c in p.get("checks", [])], "", "## Risk matrix", "",
          "| Risk | Probability | Impact | Mitigation |", "|---|---|---|---|", *[f"| {m['risk']} | {m['probability']} | {m['impact']} | {m['mitigation']} |" for m in p.get("risk_matrix", [])]]
    if p.get("options_idea"):
        L += ["", "## Options idea (illustrative, no chain data)", p["options_idea"]]
    lenses = {k: x for k, x in r["reports"].items() if k.startswith("lens_") and "score" in x}
    if lenses:  # side-by-side view so agreement and disagreement are visible at a glance
        L += ["", "## Investor lenses compared", "", "| Lens | Score | Stance | Biggest red flag |", "|---|---|---|---|",
              *[f"| {k[5:].title()} | {x['score']} | {x['stance']} | {(x.get('red_flags') or ['none listed'])[0]} |" for k, x in lenses.items()]]
        st = {x["stance"] for x in lenses.values()}
        L.append("" if not st else f"\nLenses {'agree: ' + st.pop() if len(st) == 1 else 'disagree, read the red flags before acting'}.")
    for k, x in r["reports"].items():
        if "summary" in x:
            L += ["", f"## {k.replace('lens_', '').title()} {'lens' if k.startswith('lens_') else 'analyst'} ({x['score']}/100, {x['stance']})", x["summary"],
                  *[f"- {e}" for e in x.get("evidence", [])], *[f"- Red flag: {e}" for e in x.get("red_flags", [])]]
    L += ["", "## Discovery notes (web, with sources)", r["discovery"]]
    if r.get("fallback_used"):
        L += ["", f"_A fallback model answered for: {', '.join(r['fallback_used'])}._"]
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["analyze", "quick", "compare"])
    ap.add_argument("symbols", nargs="+")
    ap.add_argument("--source", default="binance")
    ap.add_argument("--tf", default="1d")
    ap.add_argument("--personas", action="store_true")
    ap.add_argument("--options", action="store_true")
    ap.add_argument("--no-web", action="store_true")
    ap.add_argument("--no-post", action="store_true", help="don't send the proposal to the dashboard")
    a = ap.parse_args()
    if a.mode == "quick":
        print(json.dumps(quick(a.source, a.symbols[0], a.tf), indent=1))
        return
    if a.mode == "compare":
        for r in compare(a.source, a.symbols, a.tf):
            print(f"{r['score']:>3}/100 {r['stance']:<8} {r['symbol']:<10} {r['one_liner']}")
        return
    r = analyze(a.source, a.symbols[0], a.tf, a.personas, a.options, not a.no_web)
    os.makedirs(os.path.join(HERE, "reports"), exist_ok=True)
    path = os.path.join(HERE, "reports", f"{a.symbols[0]}-{a.tf}-{dt.date.today()}.md")
    open(path, "w").write(to_markdown(r))
    p = r["plan"]
    print(f"{r['symbol']}: score {r['score']['score']}/100 ({r['score']['grade']}), action {p['action']}. Report: {path}")
    if not a.no_post:
        from apex_engine.reporter import Reporter
        Reporter("research-council", "research", "AI Research Council", "proposal").event("proposal", json.dumps({
            "symbol": r["symbol"], "tf": r["timeframe"], "action": p["action"], "entry": p.get("entry"), "stop": p.get("stop"),
            "target": (p.get("targets") or [None])[min(1, len(p.get("targets") or [1]) - 1)], "targets": p.get("targets"),
            "confidence": r["score"]["score"] / 100, "score": r["score"], "thesis": r["reports"].get("thesis", {}).get("summary", ""),
            "invalidation": p.get("invalidation"), "overridden": "; ".join(p.get("checks", [])) or None, "team": True}, default=str))


if __name__ == "__main__":
    main()
