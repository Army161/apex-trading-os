# Mutation test report

Run 2026-11-10 18:13 UTC with `python3 tools/mutate.py`.

| Target | What it guards | Killed | Survived | Score |
|---|---|---|---|---|
| py-risk | Python RiskGuard: sizing, pre-trade check, loss cooldown, drawdown auto-pause | 30 | 0 | 100% |
| ts-check-trade | Risk Mitigator reward:risk gate and 1%-risk position size | 11 | 1 | 92% |
| ts-backtest | Engine: size = risk / stop distance, stop checked before target, fill at next open | 46 | 4 | 92% |
| ts-halt | Kill switch and andon cord: which command a bot gets, and when a check halts everything | 6 | 0 | 100% |

## Survivors in ts-check-trade (web/lib/assistants.ts)

- line 111 `> to >=`: `if (!(reward >= 0)) return { ok: false, problem: 'the target is on the wrong side of the entry' };`

## Survivors in ts-backtest (web/lib/engine/core.ts)

- line 71 `> to >=`: `const ra = Math.abs(p.entry - p.stop) * p.qty; p.r = ra >= 0 ? p.pnl / ra : 0;`
- line 80 `> to >=`: `let qty = d >= 0 ? Math.min(cash * risk / d, cash / px) : 0; if (s.fullSize) qty = cash / px;`
- line 81 `> to >=`: `if (qty >= 0) { cash -= fee * px * qty; pos = { side, entryT: b[i].t, entry: px, stop: st, target: tg, qty, exitT: 0, exit: N, reason: '', pnl: 0, r: 0, bars: 0 }; }`
- line 90 `< to <=`: `else if (i <= b.length - 1) { if (s.le[i]) pending = [1, s.stop[i], s.target[i]]; else if (s.se[i]) pending = [-1, s.stop[i], s.target[i]]; }`
