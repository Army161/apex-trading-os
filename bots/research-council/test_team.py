"""Offline tests for the analyst team: the model is stubbed, data is synthetic. Run: python -m pytest bots/research-council -q"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyst_team as T  # noqa: E402


def fake_ask(scores, side="long", rr=(1.0, 2.5, 4.0)):
    def ask(model, system, user, schema=None, search=0, effort="medium", max_tokens=6000):
        if schema is None:
            return "notes: nothing found (stub)"
        if schema is T.QUICK_SCHEMA:
            return {"score": 55, "stance": "neutral", "one_liner": "stub", "key_levels": [], "watch_for": []}
        if schema is T.PLAN_SCHEMA:
            pack = json.loads(user.split("Data pack:\n", 1)[1].split("\n\nDiscovery notes:", 1)[0])
            c, a = pack["last_close"], pack["atr14"]
            sgn = 1 if side == "long" else -1
            return {"side": side, "entry_low": c - 0.1 * a, "entry_high": c + 0.1 * a, "stop": c - sgn * a,
                    "targets": [c + sgn * r * a for r in rr], "invalidation": "close beyond stop", "notes": "",
                    "risk_matrix": [{"risk": "gap", "probability": "low", "impact": "high", "mitigation": "size small"}], "options_idea": ""}
        name = next((k for k, v in T.AGENTS.items() if system.startswith(v)), "lens")
        base = {"score": scores.get(name, 50), "stance": "neutral", "summary": f"{name} stub", "evidence": ["e"], "red_flags": []}
        if schema is T.THESIS_SCHEMA:
            base.update(bull_case=["b"], bear_case=["x"], catalysts=[{"date": "unknown", "event": "e", "impact": "unclear"}], horizon="weeks")
        return base
    return ask


def test_weighted_score_and_buy_when_rules_pass(monkeypatch):
    monkeypatch.setattr(T, "ask", fake_ask({"technical": 80, "fundamental": 70, "sentiment": 60, "risk": 70, "thesis": 75}))
    r = T.analyze("synthetic", "TEST", "1d", personas=True)
    assert r["score"]["score"] == round(0.3 * 80 + 0.2 * 70 + 0.15 * 60 + 0.15 * 70 + 0.2 * 75)
    assert r["plan"]["action"] == "BUY", r["plan"]["checks"]
    s = r["plan"]["size"]
    assert abs(s["risk_usd"] - min(T.EQUITY * T.RISK_PCT, s["risk_usd"])) < 1e-6 and s["notional"] <= T.EQUITY + 1e-6
    assert r["plan"]["r_multiples"][1] >= 2 and "lens_value" in r["reports"]
    md = T.to_markdown(r)
    assert "Trade score" in md and "Risk matrix" in md and "Bull case" in md


def test_low_score_or_bad_rr_holds(monkeypatch):
    monkeypatch.setattr(T, "ask", fake_ask({k: 40 for k in T.WEIGHTS}))
    assert T.analyze("synthetic", "TEST", "1d", web=False)["plan"]["action"] == "HOLD"
    monkeypatch.setattr(T, "ask", fake_ask({k: 80 for k in T.WEIGHTS}, rr=(1.0, 1.5, 1.8)))
    p = T.analyze("synthetic", "TEST", "1d", web=False)["plan"]
    assert p["action"] == "HOLD" and any("2R" in c for c in p["checks"])


def test_failed_agent_is_left_out(monkeypatch):
    good = fake_ask({k: 70 for k in T.WEIGHTS})
    def flaky(model, system, user, schema=None, **kw):
        if system.startswith(T.AGENTS["sentiment"]):
            raise RuntimeError("boom")
        return good(model, system, user, schema, **kw)
    monkeypatch.setattr(T, "ask", flaky)
    r = T.analyze("synthetic", "TEST", "1d", web=False)
    assert "error" in r["reports"]["sentiment"] and "sentiment" not in r["score"]["parts"] and r["score"]["score"] == 70


def test_compare_sorts(monkeypatch):
    monkeypatch.setattr(T, "ask", fake_ask({}))
    rows = T.compare("synthetic", ["A", "B"], "1d")
    assert len(rows) == 2 and rows[0]["score"] >= rows[1]["score"]


def test_rules_require_number_tags():
    for tag in ("[verified: source]", "[unverified]", "[suspicious: why]"):
        assert tag in T.RULES
