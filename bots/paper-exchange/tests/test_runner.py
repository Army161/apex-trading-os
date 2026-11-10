import sys, pathlib, json
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from paper_exchange.runner import Runner, Settings


def bars(n=24 * 12 * 3, start=1_700_000_400):
    out = []
    for i in range(n):
        c = 100 + i * 0.01
        out.append({"t": start + i * 300, "o": c, "h": c + 0.2, "l": c - 0.2, "c": c, "v": 1})
    return out


def trend(sig):  # closed 60m bars only
    return 1 if len(sig) >= 2 and sig[-1]["c"] > sig[-2]["c"] else 0


def entry(exe, d):
    b = exe[-1]
    return (b["c"] - 0.5, b["c"] + 0.1) if d == 1 else None


def test_signal_uses_closed_bars_only_and_untradable_by_default():
    r = Runner(Settings(tradable=False), trend, entry, dataset_id="synthetic-up").run(bars())
    ev = [json.loads(x) for x in r.log]
    sig = [e for e in ev if e["event"] == "signal_bar"]
    assert all(e["t"] % 3600 == 0 for e in sig)                      # every signal bar is a whole hour, already closed
    assert not r.trades and any(e["event"] == "signal_only" for e in ev)
    assert all(e["mode"] == "paper" for e in ev)


def test_trades_and_manifest_are_reproducible():
    a = Runner(Settings(tradable=True), trend, entry, dataset_id="synthetic-up").run(bars())
    b = Runner(Settings(tradable=True), trend, entry, dataset_id="synthetic-up").run(bars())
    assert a.trades and all(t["pnl"] > 0 for t in a.trades)
    src = [str(pathlib.Path(__file__).resolve().parent.parent / "paper_exchange" / "runner.py")]
    ma, mb = a.manifest(src), b.manifest(src)
    assert ma["output_sha256"] == mb["output_sha256"] and ma["dataset_id"] == "synthetic-up" and ma["mode"] == "paper"


def test_daily_loss_limit_blocks_entries():
    down = [{**x, "l": x["c"] - 1} for x in bars()]                  # every trade stops out
    r = Runner(Settings(tradable=True, daily_loss_pct=0.01), trend, entry).run(down)
    days = {int(t["entry_t"] // 86400) for t in r.trades}
    assert len(r.trades) == len(days)                                # one losing trade, then the day is closed
    assert any(json.loads(x)["event"] == "loss_limit" for x in r.log)
