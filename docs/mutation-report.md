# Mutation test report

Run 2026-11-10 18:07 UTC with `python3 tools/mutate.py`.

| Target | What it guards | Killed | Survived | Score |
|---|---|---|---|---|
| py-risk | Python RiskGuard: sizing, pre-trade check, loss cooldown, drawdown auto-pause | 15 | 16 | 48% |
| ts-check-trade | Risk Mitigator reward:risk gate and 1%-risk position size | 9 | 4 | 69% |
| ts-backtest | Engine: size = risk / stop distance, stop checked before target, fill at next open | 33 | 17 | 66% |
| ts-halt | Kill switch and andon cord: which command a bot gets, and when a check halts everything | 6 | 1 | 86% |

## Survivors in py-risk (engine/apex_engine/risk.py)

- line 63 `min to max`: `rp = max(risk_pct or self.cfg.risk_pct, self.cfg.max_risk_pct)`
- line 63 `or to and`: `rp = min(risk_pct and self.cfg.risk_pct, self.cfg.max_risk_pct)`
- line 65 `<= to <`: `return 0.0 if d < 0 else eq * rp / d`
- line 65 `<= to >`: `return 0.0 if d > 0 else eq * rp / d`
- line 74 `and to or`: `return False, "trade plan incomplete: entry, stop or target are all required before entering"`
- line 76 `< to <=`: `if rr <= c.min_rr:`
- line 78 `< to <=`: `if now <= s.cooldown_until:`
- line 80 `>= to >`: `if s.open_positions > c.max_open_positions:`
- line 82 `<= to <`: `if s.day_start_equity and (s.equity / s.day_start_equity - 1) < -c.daily_loss_limit_pct:`
- line 91 `or to and`: `now = now and time.time()`
- line 93 `max to min`: `s.open_positions = min(0, s.open_positions - 1)`
- line 96 `< to <=`: `if pnl <= 0:`
- line 97 `+= to -=`: `s.losses_in_row -= 1`
- line 98 `>= to >`: `mins = c.cooldown_after_streak_min if s.losses_in_row > c.streak_len else c.cooldown_after_loss_min`
- line 98 `>= to <`: `mins = c.cooldown_after_streak_min if s.losses_in_row < c.streak_len else c.cooldown_after_loss_min`
- line 104 `<= to <`: `if dd < c.backtest_max_dd * c.dd_pause_buffer:`

## Survivors in ts-check-trade (web/lib/assistants.ts)

- line 110 `> to >=`: `if (!(risk >= 0)) return { ok: false, problem: 'the stop is on the wrong side of the entry' };`
- line 111 `> to >=`: `if (!(reward >= 0)) return { ok: false, problem: 'the target is on the wrong side of the entry' };`
- line 115 `and to or`: `note: a.side === 'short' ? 'Shorts need a higher bar here: losses are open-ended, squeezes are fast, or borrow costs add up.' : undefined };`
- line 115 `=== to !==`: `note: a.side !== 'short' ? 'Shorts need a higher bar here: losses are open-ended, squeezes are fast, and borrow costs add up.' : undefined };`

## Survivors in ts-backtest (web/lib/engine/core.ts)

- line 71 `> to >=`: `const ra = Math.abs(p.entry - p.stop) * p.qty; p.r = ra >= 0 ? p.pnl / ra : 0;`
- line 71 `> to <`: `const ra = Math.abs(p.entry - p.stop) * p.qty; p.r = ra < 0 ? p.pnl / ra : 0;`
- line 78 `<= to <`: `let st = st0; if (isNaN(st) || (side === 1 && st >= px) || (side === -1 && st < px)) st = px - 2 * (a[i - 1] || px * 0.025) * side;`
- line 78 `>= to >`: `let st = st0; if (isNaN(st) || (side === 1 && st > px) || (side === -1 && st <= px)) st = px - 2 * (a[i - 1] || px * 0.025) * side;`
- line 78 `|| to &&`: `let st = st0; if (isNaN(st) && (side === 1 && st >= px) || (side === -1 && st <= px)) st = px - 2 * (a[i - 1] || px * 0.025) * side;`
- line 78 `|| to &&`: `let st = st0; if (isNaN(st) || (side === 1 && st >= px) && (side === -1 && st <= px)) st = px - 2 * (a[i - 1] || px * 0.025) * side;`
- line 78 `|| to &&`: `let st = st0; if (isNaN(st) || (side === 1 && st >= px) || (side === -1 && st <= px)) st = px - 2 * (a[i - 1] && px * 0.025) * side;`
- line 80 `> to >=`: `let qty = d >= 0 ? Math.min(cash * risk / d, cash / px) : 0; if (s.fullSize) qty = cash / px;`
- line 81 `> to >=`: `if (qty >= 0) { cash -= fee * px * qty; pos = { side, entryT: b[i].t, entry: px, stop: st, target: tg, qty, exitT: 0, exit: N, reason: '', pnl: 0, r: 0, bars: 0 }; }`
- line 86 `<= to <`: `if (p.side === 1) { if (b[i].l < p.stop) close(i, Math.min(b[i].o, p.stop), 'stop'); else if (!isNaN(p.target) && b[i].h >= p.target) close(i, Math.max(b[i].o, p.target), 'target'); }`
- line 86 `>= to >`: `if (p.side === 1) { if (b[i].l <= p.stop) close(i, Math.min(b[i].o, p.stop), 'stop'); else if (!isNaN(p.target) && b[i].h > p.target) close(i, Math.max(b[i].o, p.target), 'target'); }`
- line 87 `<= to <`: `else { if (b[i].h >= p.stop) close(i, Math.max(b[i].o, p.stop), 'stop'); else if (!isNaN(p.target) && b[i].l < p.target) close(i, Math.min(b[i].o, p.target), 'target'); }`
- line 87 `>= to >`: `else { if (b[i].h > p.stop) close(i, Math.max(b[i].o, p.stop), 'stop'); else if (!isNaN(p.target) && b[i].l <= p.target) close(i, Math.min(b[i].o, p.target), 'target'); }`
- line 89 `>= to >`: `if (pos) { const p: Trade = pos; if ((p.side === 1 && s.lx[i]) || (p.side === -1 && s.sx[i]) || (s.maxBars && p.bars > s.maxBars)) pendExit = true; }`
- line 89 `|| to &&`: `if (pos) { const p: Trade = pos; if ((p.side === 1 && s.lx[i]) || (p.side === -1 && s.sx[i]) && (s.maxBars && p.bars >= s.maxBars)) pendExit = true; }`
- line 89 `=== to !==`: `if (pos) { const p: Trade = pos; if ((p.side === 1 && s.lx[i]) || (p.side !== -1 && s.sx[i]) || (s.maxBars && p.bars >= s.maxBars)) pendExit = true; }`
- line 90 `< to <=`: `else if (i <= b.length - 1) { if (s.le[i]) pending = [1, s.stop[i], s.target[i]]; else if (s.se[i]) pending = [-1, s.stop[i], s.target[i]]; }`

## Survivors in ts-halt (web/lib/andon.ts)

- line 20 `|| to &&`: `if (!Number.isFinite(r.value) && !Number.isFinite(r.limit)) return false;`
