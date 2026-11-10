"""Bar-by-bar backtester with honest defaults.

Contract with strategies: `Strategy.signals(df)` returns a DataFrame aligned to df with columns
  long_entry, short_entry (bool, decided on bar CLOSE), stop, target (price, may be NaN),
  long_exit, short_exit (bool, decided on bar close).
Fills: entries and signal exits fill at the NEXT bar's open (plus slippage). Stops and targets fill
intrabar; if both are touched in the same bar the stop is assumed first (pessimistic). Gaps through a
stop fill at the open. Fees are charged on both sides. Position size = equity * risk_pct / stop
distance, capped at max_leverage * equity notional.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
import math

import numpy as np
import pandas as pd

from .indicators import atr


@dataclass
class Trade:
    side: int
    entry_time: str
    entry: float
    stop: float
    target: float
    qty: float
    exit_time: str = ""
    exit: float = float("nan")
    reason: str = ""
    pnl: float = 0.0
    r: float = 0.0
    bars: int = 0


@dataclass
class Result:
    strategy: str
    symbol: str
    timeframe: str
    params: dict
    trades: list[Trade]
    equity: pd.Series
    metrics: dict = field(default_factory=dict)

    def to_json(self, max_points: int = 400) -> dict:
        eq = self.equity
        step = max(1, len(eq) // max_points)
        pts = [[t.isoformat(), round(float(v), 2)] for t, v in eq.iloc[::step].items()]
        if len(eq) and pts[-1][0] != eq.index[-1].isoformat():
            pts.append([eq.index[-1].isoformat(), round(float(eq.iloc[-1]), 2)])
        return {"strategy": self.strategy, "symbol": self.symbol, "timeframe": self.timeframe, "params": self.params,
                "metrics": self.metrics, "equity": pts, "trades": [asdict(t) for t in self.trades[-200:]]}


def run(df: pd.DataFrame, strategy, symbol: str = "", timeframe: str = "", capital: float = 10_000.0,
        risk_pct: float = 0.01, fee: float = 0.001, slippage: float = 0.0005, max_leverage: float = 1.0,
        allow_short: bool = True) -> Result:
    sig = strategy.signals(df)
    a = atr(df, 14)
    o, h, l, c = (df[k].to_numpy(float) for k in ("open", "high", "low", "close"))
    le = sig["long_entry"].to_numpy(bool)
    se = sig.get("short_entry", pd.Series(False, index=df.index)).to_numpy(bool) & allow_short
    lx = sig.get("long_exit", pd.Series(False, index=df.index)).to_numpy(bool)
    sx = sig.get("short_exit", pd.Series(False, index=df.index)).to_numpy(bool)
    st = sig.get("stop", pd.Series(np.nan, index=df.index)).to_numpy(float)
    tg = sig.get("target", pd.Series(np.nan, index=df.index)).to_numpy(float)
    trail = sig.get("trail", pd.Series(np.nan, index=df.index)).to_numpy(float)
    idx = df.index
    n = len(df)
    cash = capital
    pos: Trade | None = None
    pending = None  # (side, stop, target) decided at close of previous bar
    pending_exit = False
    trades: list[Trade] = []
    eq = np.empty(n)

    def close_pos(i, price, reason):
        nonlocal cash, pos
        side = pos.side
        px = price * (1 - slippage * side)
        gross = (px - pos.entry) * pos.qty * side
        cost = fee * px * pos.qty
        cash += gross - cost
        pos.exit, pos.exit_time, pos.reason = px, idx[i].isoformat(), reason
        risk_amt = abs(pos.entry - pos.stop) * pos.qty
        pos.pnl = gross - cost - fee * pos.entry * pos.qty
        pos.r = pos.pnl / risk_amt if risk_amt > 0 else 0.0
        trades.append(pos)
        pos = None

    for i in range(n):
        # 1) fills at this bar's open from decisions made at previous close
        if pos is not None and pending_exit:
            close_pos(i, o[i], "signal")
            pending_exit = False
        if pos is None and pending is not None:
            side, stp, tgt = pending
            px = o[i] * (1 + slippage * side)
            if math.isnan(stp) or (side == 1 and stp >= px) or (side == -1 and stp <= px):
                av = a.iloc[i - 1] if i > 0 else np.nan
                stp = px - 2 * av * side if not math.isnan(av) else px * (1 - 0.05 * side)
            dist = abs(px - stp)
            equity_now = cash
            qty = min(equity_now * risk_pct / dist, equity_now * max_leverage / px) if dist > 0 else 0
            if getattr(strategy, "full_size", False):
                qty = equity_now * max_leverage / px
            if qty > 0:
                cash -= fee * px * qty
                pos = Trade(side, idx[i].isoformat(), px, stp, tgt, qty)
        pending = None
        # 2) intrabar stop / target
        if pos is not None:
            pos.bars += 1
            if not math.isnan(trail[i - 1] if i > 0 else np.nan):
                t = trail[i - 1]
                if pos.side == 1 and t > pos.stop:
                    pos.stop = t
                if pos.side == -1 and t < pos.stop:
                    pos.stop = t
            if pos.side == 1:
                if l[i] <= pos.stop:
                    close_pos(i, min(o[i], pos.stop), "stop")
                elif not math.isnan(pos.target) and h[i] >= pos.target:
                    close_pos(i, max(o[i], pos.target), "target")
            else:
                if h[i] >= pos.stop:
                    close_pos(i, max(o[i], pos.stop), "stop")
                elif not math.isnan(pos.target) and l[i] <= pos.target:
                    close_pos(i, min(o[i], pos.target), "target")
        # 3) decisions on close
        if pos is not None:
            if (pos.side == 1 and lx[i]) or (pos.side == -1 and sx[i]):
                pending_exit = True
            mb = getattr(strategy, "params", {}).get("max_bars")
            if mb and pos.bars >= mb:
                pending_exit = True
        elif i < n - 1:
            if le[i]:
                pending = (1, st[i], tg[i])
            elif se[i]:
                pending = (-1, st[i], tg[i])
        mtm = cash + ((c[i] - pos.entry) * pos.qty * pos.side if pos is not None else 0.0)
        eq[i] = mtm
    if pos is not None:
        close_pos(n - 1, c[-1], "end")
        eq[-1] = cash
    equity = pd.Series(eq, index=idx)
    res = Result(getattr(strategy, "id", type(strategy).__name__), symbol, timeframe, getattr(strategy, "params", {}), trades, equity)
    res.metrics = metrics(equity, trades, df, capital)
    return res


def periods_per_year(index: pd.DatetimeIndex) -> float:
    if len(index) < 2:
        return 252
    dt = np.median(np.diff(index.values).astype("timedelta64[s]").astype(float))
    return 365.25 * 86400 / dt if dt > 0 else 252


def metrics(equity: pd.Series, trades: list[Trade], df: pd.DataFrame, capital: float) -> dict:
    ret = equity.pct_change().fillna(0)
    ppy = periods_per_year(equity.index)
    years = max((equity.index[-1] - equity.index[0]).days / 365.25, 1e-9)
    total = equity.iloc[-1] / capital - 1
    dd = equity / equity.cummax() - 1
    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    gp, gl = sum(t.pnl for t in wins), -sum(t.pnl for t in losses)
    bh = df["close"].iloc[-1] / df["close"].iloc[0] - 1
    bh_eq = df["close"] / df["close"].iloc[0]
    sd = ret.std()
    # longest losing streak (psychology course: know your normal streaks before you go live)
    streak = worst = 0
    for t in trades:
        streak = streak + 1 if t.pnl <= 0 else 0
        worst = max(worst, streak)
    in_mkt = sum(t.bars for t in trades) / max(len(equity), 1)
    return {
        "total_return": round(total, 4),
        "cagr": round((1 + total) ** (1 / years) - 1, 4) if total > -1 else -1.0,
        "max_drawdown": round(float(dd.min()), 4),
        "sharpe": round(float(ret.mean() / sd * np.sqrt(ppy)), 2) if sd > 0 else 0.0,
        "trades": len(trades),
        "win_rate": round(len(wins) / len(trades), 4) if trades else 0.0,
        "profit_factor": round(gp / gl, 2) if gl > 0 else (float("inf") if gp > 0 else 0.0),
        "avg_r": round(float(np.mean([t.r for t in trades])), 3) if trades else 0.0,
        "expectancy": round(float(np.mean([t.pnl for t in trades])), 2) if trades else 0.0,
        "max_losing_streak": worst,
        "exposure": round(in_mkt, 3),
        "buy_hold_return": round(float(bh), 4),
        "buy_hold_max_drawdown": round(float((bh_eq / bh_eq.cummax() - 1).min()), 4),
        "start": equity.index[0].isoformat(), "end": equity.index[-1].isoformat(), "bars": len(equity),
    }


def monte_carlo(trades: list[Trade], capital: float = 10_000.0, risk_pct: float = 0.01, runs: int = 2000, seed: int = 7) -> dict:
    """Reshuffles the R-multiples of the trade list to estimate the drawdown and return you should EXPECT,
    not just the one path history gave you (Day Trader 'time machine' idea, risk management course)."""
    if not trades:
        return {}
    rs = np.array([t.r for t in trades])
    rng = np.random.default_rng(seed)
    dds, finals = [], []
    for _ in range(runs):
        seq = rng.choice(rs, size=len(rs), replace=True)
        eq = capital * np.cumprod(1 + seq * risk_pct)
        eq = np.concatenate([[capital], eq])
        dds.append((eq / np.maximum.accumulate(eq) - 1).min())
        finals.append(eq[-1] / capital - 1)
    return {"dd_p50": round(float(np.percentile(dds, 50)), 4), "dd_p95": round(float(np.percentile(dds, 5)), 4),
            "ret_p5": round(float(np.percentile(finals, 5)), 4), "ret_p50": round(float(np.percentile(finals, 50)), 4),
            "ret_p95": round(float(np.percentile(finals, 95)), 4), "prob_loss": round(float(np.mean(np.array(finals) < 0)), 3)}
