import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from paper_exchange.trail import TrailConfig, TrailingStop


def rising(n=40):
    return [(100 + i + 1, 100 + i - 1, 100 + i) for i in range(n)]


def test_every_mode_ratchets_and_never_loosens():
    for mode in ["scalp", "candles", "ma", "tenkan"]:
        t = TrailingStop(TrailConfig(mode=mode, max_mods_per_min=999), side=1, entry=110, stop=105)
        bars, last = rising(20), 105
        for i in range(20, 40):
            bars.append((100 + i + 1, 100 + i - 1, 100 + i))
            t.update(bars, bid=100 + i - 0.01, ask=100 + i + 0.01, now_s=i * 60)
            assert t.stop >= last
            last = t.stop
        assert t.mods > 3 and t.stop > t.entry, mode


def test_short_mirror():
    bars = [(200 - i + 1, 200 - i - 1, 200 - i) for i in range(40)]
    t = TrailingStop(TrailConfig(mode="candles"), side=-1, entry=180, stop=190)
    assert t.update(bars, bid=160.99, ask=161.01, now_s=0) == 163   # highest high of the last 2 bars
    assert not t.hit(low=160, high=162.5) and t.hit(low=160, high=163)


def test_guards():
    bars = rising()
    t = TrailingStop(TrailConfig(mode="scalp", trigger=0, distance=1), side=1, entry=160, stop=100)
    assert t.update(bars, 139, 139.02, 0) is None                     # would sit behind the entry
    t = TrailingStop(TrailConfig(mode="scalp", trigger=0, distance=1), side=1, entry=120, stop=200)
    assert t.update(bars, 139, 139.02, 0) is None                     # would loosen
    t = TrailingStop(TrailConfig(mode="scalp", trigger=0, distance=1, stop_level=5), side=1, entry=120, stop=100)
    assert t.update(bars, 139, 139.02, 0) is None                     # inside the broker stop level


def test_modification_budget():
    t = TrailingStop(TrailConfig(mode="scalp", trigger=0, distance=0.1, max_mods_per_min=2), side=1, entry=100, stop=99)
    bars = rising()
    for k in range(5):
        bars.append((141 + k, 139 + k, 140 + k))
        t.update(bars, 140 + k, 140.02 + k, now_s=k)
    assert t.mods == 2 and t.refused_rate == 3
