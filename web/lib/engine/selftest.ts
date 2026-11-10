// Parity + sanity checks between the TS port and the Python engine. Run: npm test
import fs from 'node:fs';
import path from 'node:path';
import { backtest, atr, Bar, Sig } from './core';
import { byId, STRATEGIES } from './strategies';
import { EXAMPLE, compile, validate, setPath, Spec } from './spec';
import { paperRecord } from '../strategies';
import { checkTrade, oversoldScore } from '../assistants';
import { cost } from '../usage';
import { applyOp, applyDream, current, history, memoryBlock, looksSecret, Fact } from '../memory';
import { botCommand, shouldPull } from '../andon';
import { finalVerdict, triage } from '../review';
import { normalizeRules, rulesBlock, riskSystem, QUESTIONS } from '../rules';
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/parity.json'), 'utf8'));
const bars: Bar[] = fx.bars.map((r: number[]) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
let fail = 0;
for (const [id, e] of Object.entries<any>(fx.expected)) {
  const m = backtest(bars, byId(id).build(bars)).metrics;
  const ok = m.trades === e.trades && Math.abs(m.totalReturn - e.ret) < 0.005;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ts trades ${m.trades} ret ${m.totalReturn.toFixed(4)} | py trades ${e.trades} ret ${e.ret}`);
}
for (const s of STRATEGIES) { const r = backtest(bars, s.build(bars)); if (!r.equity.every(Number.isFinite)) { fail++; console.log('FAIL finite', s.id); } }
// look-ahead: truncating the data must not change the last-bar signal
for (const s of STRATEGIES) for (const cut of [300, 450, 600, 750]) {
  const full = s.build(bars), part = s.build(bars.slice(0, cut + 1));
  if (full.le[cut] !== part.le[cut] || full.se[cut] !== part.se[cut] || full.lx[cut] !== part.lx[cut]) { fail++; console.log(`FAIL lookahead ${s.id} @${cut}`); }
}
// strategy spec compiler: the video's example must validate, match the built-in Supertrend flips, and not look ahead
const v = validate(EXAMPLE); if (v.length) { fail++; console.log('FAIL example spec invalid', v); }
const ex = compile(EXAMPLE)(bars), bi = byId('supertrend').build(bars);
const mism = ex.le.filter((x, i) => x !== bi.le[i]).length + ex.se.filter((x, i) => x !== bi.se[i]).length;
console.log(`${mism ? 'FAIL' : 'PASS'} spec supertrend entries match built-in (${ex.le.filter(Boolean).length} long, ${ex.se.filter(Boolean).length} short)`); if (mism) fail++;
for (const cut of [300, 600]) { const part = compile(EXAMPLE)(bars.slice(0, cut + 1)); if (part.le[cut] !== ex.le[cut] || part.se[cut] !== ex.se[cut]) { fail++; console.log('FAIL spec lookahead', cut); } }
const bad: Spec = setPath(EXAMPLE, 'stop.value', 0.9); if (!validate(bad).length) { fail++; console.log('FAIL validator accepted a 90% stop'); }
const rsiSpec: Spec = { ...EXAMPLE, direction: 'long', indicators: [{ id: 'r', type: 'rsi', length: 2, length2: 0, length3: 0, mult: 0 }, { id: 't', type: 'sma', length: 200, length2: 0, length3: 0, mult: 0 }],
  long_entry: [{ left: 'r', op: '<', right: '10' }, { left: 'close', op: '>', right: 't' }], short_entry: [], exit_long: [{ left: 'pattern:bull_reversal', op: '>', right: '0' }], exit_short: [] };
if (validate(rsiSpec).length) { fail++; console.log('FAIL rsi spec invalid', validate(rsiSpec)); }
const rb = backtest(bars, compile(rsiSpec)(bars)); if (!rb.equity.every(Number.isFinite)) { fail++; console.log('FAIL rsi spec equity'); } else console.log(`PASS rsi spec backtest: ${rb.metrics.trades} trades`);
// paper record since deploy: no entries before deploy or while paused, net = equity change, stop = exit all
{
  const T = (i: number) => bars[i].t, bar = T(1) - T(0);
  const dep = { status: 'running' as const, mode: 'paper' as const, since: T(400), capital: 10000, paused: [[T(550), T(650)]] as [number, number | null][] };
  const pr = paperRecord(bars, EXAMPLE, dep);
  const badEntry = pr.trades.filter(t => t.entryT < dep.since || (t.entryT > T(550) + bar && t.entryT < T(650))).length;
  const eqEnd = pr.equity[pr.equity.length - 1].v;
  const netOk = Math.abs(pr.net - (eqEnd - 10000)) < 1;
  const stopped = paperRecord(bars, EXAMPLE, { ...dep, status: 'stopped', stoppedAt: T(700) });
  const after = stopped.trades.filter(t => t.exitT > T(700)).length + (stopped.open ? 1 : 0);
  const ok = !badEntry && netOk && !after && pr.fills >= pr.closed * 2;
  console.log(`${ok ? 'PASS' : 'FAIL'} paper record: ${pr.closed} closed, net ${pr.net.toFixed(2)} vs equity ${(eqEnd - 10000).toFixed(2)}, ${badEntry} bad entries, ${after} after stop`); if (!ok) fail++;
}
// Risk Mitigator math: 3:1 passes, 2:1 fails, shorts need more, wrong-side stops are caught, size risks 1%
{
  const a = checkTrade({ side: 'long', entry: 100, stop: 98, target: 106 }) as any, b = checkTrade({ side: 'long', entry: 100, stop: 98, target: 104 }) as any;
  const c = checkTrade({ side: 'short', entry: 100, stop: 102, target: 94 }) as any, d = checkTrade({ side: 'long', entry: 100, stop: 101, target: 110 }) as any;
  const ok = a.ok && a.rr === 3 && Math.abs(a.size.max_loss - 100) < 0.5 && !b.ok && !c.ok && c.required_rr > 3 && d.ok === false && !!d.problem;
  const o = oversoldScore(bars); const ok2 = o != null && Number.isFinite(o.score);
  console.log(`${ok && ok2 ? 'PASS' : 'FAIL'} risk mitigator checks + oversold screen`); if (!(ok && ok2)) fail++;
}
// AI spend estimate: 1M input + 1M output on opus-5-5 = $24; 10 web searches add $0.10; unknown models price as opus
{
  const a = cost('claude-opus-5-5', { input_tokens: 1e6, output_tokens: 1e6 }), b = cost('claude-sonnet-5-5', { input_tokens: 1e6, server_tool_use: { web_search_requests: 10 } });
  const ok = Math.abs(a - 24) < 1e-9 && Math.abs(b - 2.1) < 1e-9 && cost('mystery', { output_tokens: 1e6 }) === 20 && cost('claude-opus-5-5', undefined) === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} AI spend estimate`); if (!ok) fail++;
}
// Trader rules + red team: no rules leaves prompts unchanged, rules are added with the house rules, HTML stripped, length capped
{
  const base = 'BASE';
  const ok = rulesBlock(null) === '' && riskSystem(base, null) === base && riskSystem(base, { text: 'x' }).includes('house rules win')
    && riskSystem(base, null, true).includes('RED TEAM') && !riskSystem(base, null, false).includes('RED TEAM')
    && normalizeRules('<b>hi</b> there') === 'hi there' && normalizeRules('a'.repeat(9000)).length === 4000 && QUESTIONS.length === 20
    && Math.abs(cost('claude-fable-5-2', { input_tokens: 1e6, output_tokens: 1e6 }) - 48) < 1e-9;
  console.log(`${ok ? 'PASS' : 'FAIL'} trader rules, red team, Fable pricing`); if (!ok) fail++;
}
// Memory: newer fact on the same key replaces the old one (kept with date), retire ends it, dream ops apply, secrets dropped
{
  let fs: Fact[] = [];
  fs = applyOp(fs, { op: 'add', key: 'Risk per trade', text: 'risks 1% per trade' }, 'chat', 1000);
  fs = applyOp(fs, { op: 'replace', key: 'risk-per-trade', text: 'risks 0.5% per trade now' }, 'telegram', 2000);
  const c1 = current(fs), h = history(fs, 'risk-per-trade');
  const okReplace = c1.length === 1 && c1[0].text.includes('0.5%') && h.length === 2 && h[1].replacedAt === 2000;
  fs = applyOp(fs, { op: 'retire', key: 'risk-per-trade' }, 'you', 3000);
  const okRetire = current(fs).length === 0 && history(fs, 'risk-per-trade').length === 2;
  const d = applyDream([], [{ op: 'add', key: 'tf', text: 'trades the 4h chart' }, { op: 'add', key: 'style', text: 'wants short answers' }, { op: 'replace', key: 'tf', text: 'moved to the daily chart' }, { op: 'nonsense' as any, key: 'x', text: 'y' }], 5000);
  const okDream = current(d).length === 2 && current(d).some(f => f.text.includes('daily')) && !current(d).some(f => f.text.includes('4h'));
  const okSecret = looksSecret('my key is sk-ant-abcdefghijklmnop') && looksSecret('0x' + 'a'.repeat(64)) && looksSecret('seed phrase: apple river stone cloud tiger lamp ocean ring fork salt wind moon')
    && !looksSecret('I risk 1% and like the daily chart') && applyOp([], { op: 'add', key: 'k', text: 'sk-ant-abcdefghijklmnop' }, 'chat').length === 0;
  const okBlock = memoryBlock([]) === '' && memoryBlock(current(d)).includes('daily');
  const ok = okReplace && okRetire && okDream && okSecret && okBlock;
  console.log(`${ok ? 'PASS' : 'FAIL'} memory: replace ${okReplace}, retire ${okRetire}, dream ${okDream}, secrets ${okSecret}, block ${okBlock}`); if (!ok) fail++;
}
{ // andon cord: halt wins over any queued command; each reading pulls exactly at its line
  const off = { on: false }, on = { on: true, reason: 'x' };
  const cmdOk = botCommand(false, off, null) === null && botCommand(false, off, 'resume') === 'resume' && botCommand(true, off, 'resume') === 'pause'
    && botCommand(false, on, 'resume') === 'pause' && botCommand(true, on, null) === 'pause';
  const pullOk = shouldPull({ kind: 'drawdown', value: -0.26, limit: -0.25 }) && shouldPull({ kind: 'drawdown', value: -0.25, limit: -0.25 })
    && !shouldPull({ kind: 'drawdown', value: -0.24, limit: -0.25 }) && shouldPull({ kind: 'daily_loss', value: -0.031, limit: -0.03 })
    && !shouldPull({ kind: 'daily_loss', value: 0.01, limit: -0.03 }) && shouldPull({ kind: 'errors', value: 5, limit: 5 })
    && !shouldPull({ kind: 'errors', value: 4, limit: 5 }) && !shouldPull({ kind: 'drawdown', value: NaN, limit: -0.25 });
  const ok = cmdOk && pullOk;
  console.log(`${ok ? 'PASS' : 'FAIL'} andon: commands ${cmdOk}, readings ${pullOk}`); if (!ok) fail++;
}
{ // review: only high-severity issues can block; the worst remaining verdict wins
  const hi = { severity: 'high' as const, issue: 'a', fix: 'b' }, lo = { severity: 'low' as const, issue: 'c', fix: 'd' }, md = { severity: 'medium' as const, issue: 'e', fix: 'f' };
  const ok = finalVerdict([{ step: 'qa', verdict: 'block', summary: '', issues: [hi] }]) === 'block'
    && finalVerdict([{ step: 'qa', verdict: 'block', summary: '', issues: [lo, md] }]) === 'concerns'
    && finalVerdict([{ step: 'a', verdict: 'ok', summary: '', issues: [] }, { step: 'b', verdict: 'concerns', summary: '', issues: [md] }]) === 'concerns'
    && finalVerdict([{ step: 'a', verdict: 'ok', summary: '', issues: [] }]) === 'ok'
    && finalVerdict([{ step: 'a', verdict: 'concerns', summary: '', issues: [] }, { step: 'b', verdict: 'block', summary: '', issues: [hi] }]) === 'block'
    && triage([hi, md, lo]).serious.length === 1 && triage([hi, md, lo]).optional.length === 1 && triage([hi, md, lo]).ignore.length === 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} review: stop-overthinking verdict and triage`); if (!ok) fail++;
}
{ // engine edges (added after mutation testing): exact stop/target touches, invalid stops, R multiple, time exits
  const mk = (n: number, last: Partial<Bar>[] = []) => { const b: Bar[] = []; for (let i = 0; i < n; i++) b.push({ t: i * 864e5, o: 100, h: 101, l: 99, c: 100, v: 1 });
    last.forEach((x, k) => Object.assign(b[n - last.length + k], x)); return b; };
  const sig = (n: number, at: number, o: Partial<Sig> & { side?: 1 | -1; st?: number; tg?: number } = {}): Sig => {
    const f = () => Array(n).fill(false), s: Sig = { le: f(), se: f(), lx: f(), sx: f(), stop: Array(n).fill(NaN), target: Array(n).fill(NaN), maxBars: o.maxBars };
    (o.side === -1 ? s.se : s.le)[at] = true; s.stop[at] = o.st ?? NaN; s.target[at] = o.tg ?? NaN; if (o.sx) s.sx = o.sx; return s; };
  const one = (b: Bar[], s: Sig) => backtest(b, s, { fee: 0, slip: 0 }).trades[0];
  const n = 24, atrv = atr(mk(n), 14)[19];
  const L1 = one(mk(n, [{}, { l: 95, c: 96 }, {}, {}]), sig(n, 19, { st: 95, tg: 110 }));
  const L2 = one(mk(n, [{}, { h: 110 }, {}, {}]), sig(n, 19, { st: 95, tg: 110 }));
  const S1 = one(mk(n, [{}, { h: 105 }, {}, {}]), sig(n, 19, { side: -1, st: 105, tg: 90 }));
  const S2 = one(mk(n, [{}, { l: 90 }, {}, {}]), sig(n, 19, { side: -1, st: 105, tg: 90 }));
  const touch = L1?.reason === 'stop' && L1.exit === 95 && L2?.reason === 'target' && L2.exit === 110 && S1?.reason === 'stop' && S1.exit === 105 && S2?.reason === 'target' && S2.exit === 90;
  const rOk = Math.abs((L1?.r ?? 0) + 1) < 1e-9;
  const E1 = one(mk(n), sig(n, 19, { st: 100 })), E2 = one(mk(n), sig(n, 19, { side: -1, st: 100 })), E3 = one(mk(n), sig(n, 19, {}));
  const fallback = !!E1 && Math.abs(E1.stop - (100 - 2 * atrv)) < 1e-9 && !!E2 && Math.abs(E2.stop - (100 + 2 * atrv)) < 1e-9 && !!E3 && Math.abs(E3.stop - (100 - 2 * atrv)) < 1e-9;
  const tb = mk(n), T1 = one(tb, sig(n, 19, { st: 50, maxBars: 2 }));
  const timeExit = T1?.reason === 'signal' && T1.exitT === tb[22].t;
  const T2 = one(mk(n), sig(n, 19, { st: 50, sx: Array(n).fill(true) }));
  const sideOk = T2?.reason === 'end';
  const ct = (checkTrade({ side: 'long', entry: 100, stop: 100, target: 110 }) as any).ok === false && /target/.test((checkTrade({ side: 'long', entry: 100, stop: 95, target: 100 }) as any).problem ?? '')
    && (checkTrade({ side: 'short', entry: 100, stop: 100, target: 90 }) as any).ok === false && !!(checkTrade({ side: 'short', entry: 100, stop: 102, target: 90 }) as any).note
    && !(checkTrade({ side: 'long', entry: 100, stop: 98, target: 110 }) as any).note;
  const ok = touch && rOk && fallback && timeExit && sideOk && ct;
  console.log(`${ok ? 'PASS' : 'FAIL'} engine edges: touches ${touch}, R ${rOk}, stop fallback ${fallback}, time exit ${timeExit}, side exits ${sideOk}, checkTrade ${ct}`); if (!ok) fail++;
}
console.log(fail ? `${fail} failures` : 'all checks passed');
process.exit(fail ? 1 : 0);
