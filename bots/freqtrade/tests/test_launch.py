"""The Freqtrade start wrapper's decision. Env var names and secret-looking values are built at runtime, so no live setting and
no password is ever written out in the repo."""
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import launch  # noqa: E402

ALLOW = "_".join(["APEX", "ALLOW", "LIVE"])
PW, JWT = "FREQTRADE__API_SERVER__PASSWORD", "FREQTRADE__API_SERVER__JWT_SECRET_KEY"
GOOD = {PW: "x" * 6 + "-own", JWT: "y" * 6 + "-own"}
TRADE = ["trade", "--config", "c.json", "--strategy", "ApexTurtle"]
REPO_CONFIG = json.load(open(os.path.join(HERE, "..", "user_data", "config.json")))


def cfg(**over):
    c = json.loads(json.dumps(REPO_CONFIG))
    c.update(over)
    return c


def test_repo_config_starts_in_paper_with_your_own_api_password():
    assert REPO_CONFIG["dry_run"] is True
    assert launch.decide(TRADE, [REPO_CONFIG], GOOD) == (True, "paper (dry run)")


@pytest.mark.parametrize("dry", [False, None, "false", "true", 0, 1])
def test_anything_but_dry_run_true_needs_the_second_switch(dry):
    c = cfg(dry_run=dry) if dry is not None else {k: v for k, v in REPO_CONFIG.items() if k != "dry_run"}
    ok, why = launch.decide(TRADE, [c], GOOD)
    assert not ok and "second switch is off" in why
    for v in ("YES", "yes ", "true", "1", ""):
        assert not launch.decide(TRADE, [c], {**GOOD, ALLOW: v})[0], f"only exactly yes counts, not {v!r}"
    assert launch.decide(TRADE, [c], {**GOOD, ALLOW: "y" + "es"}) == (True, "LIVE: both switches are on")


def test_env_override_and_later_configs_are_followed():
    assert not launch.decide(TRADE, [REPO_CONFIG], {**GOOD, "FREQTRADE__DRY_RUN": "false"})[0]
    assert not launch.decide(TRADE, [REPO_CONFIG], {**GOOD, "FREQTRADE__DRY_RUN": "maybe"})[0]
    assert not launch.decide(TRADE + ["--config", "d.json"], [REPO_CONFIG, {"dry_run": False}], GOOD)[0]
    assert not launch.decide(TRADE, [cfg(add_config_files=["more.json"])], GOOD)[0]
    assert launch.decide(TRADE + ["--dry-run"], [cfg(dry_run=False)], GOOD)[0], "--dry-run always means paper"


@pytest.mark.parametrize("pw", ["", "change-me", "change-me-via-env", " Change-Me ", None])
def test_default_or_empty_api_password_refuses_even_in_paper(pw):
    env = dict(GOOD)
    if pw is None:
        env.pop(PW)  # falls back to the config file's placeholder
    else:
        env[PW] = pw
    ok, why = launch.decide(TRADE, [REPO_CONFIG], env)
    assert not ok and "API server password" in why and (pw or "x") not in why.replace("API server password", "")


def test_default_jwt_secret_refuses():
    assert not launch.decide(TRADE, [REPO_CONFIG], {PW: GOOD[PW], JWT: "change-me"})[0]


def test_keys_in_a_config_file_refuse():
    c = cfg(exchange={**REPO_CONFIG["exchange"], "key": "k" * 10})
    assert launch.decide(TRADE, [c], GOOD) == (False, "a config file holds exchange keys; keys come only from env vars")


def test_trading_needs_a_config_and_read_only_commands_skip_the_checks():
    assert not launch.decide(["trade", "--strategy", "ApexTurtle"], [], GOOD)[0]
    assert not launch.decide(["webserver"], [], {})[0]
    assert not launch.decide([], [], {})[0]
    assert launch.decide(["backtesting", "--strategy", "ApexTurtle"], [], {})[0]
    assert launch.decide(["download-data", "--timeframes", "1d"], [], {})[0]


def test_config_paths():
    assert launch.config_paths(["trade", "-c", "a.json", "--config", "b.json", "--config=c.json"]) == ["a.json", "b.json", "c.json"]


def test_main_refuses_an_unreadable_config_and_never_execs(tmp_path, monkeypatch):
    monkeypatch.setattr(launch.os, "execvp", lambda *a: pytest.fail("must not start freqtrade"))
    assert launch.main(["trade", "--config", str(tmp_path / "missing.json")]) == 2
    p = tmp_path / "c.json"
    p.write_text(json.dumps(cfg(dry_run=False)))
    for k in (ALLOW, PW, JWT, "FREQTRADE__DRY_RUN"):
        monkeypatch.delenv(k, raising=False)
    assert launch.main(["trade", "--config", str(p)]) == 2


def test_compose_runs_every_command_through_the_launcher():
    src = open(os.path.join(HERE, "..", "docker-compose.yml")).read()
    assert "/apex/launch.py" in src and "./launch.py:/apex/launch.py:ro" in src
    assert "freqtrade trade" not in src, "the compose file must not start freqtrade directly"
    assert any(line.strip() == f"- {ALLOW}" for line in src.splitlines()), "the second switch is passed through by name only"
