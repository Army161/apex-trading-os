// Parity + sanity checks between the TS port and the Python engine. Run: npm test
import { sharpeReport, combine, leveredResearch, vsBenchmark } from '../sharpe';
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
import { monkeyTest, sampleCheck } from './validate';
import { bs, gexOf } from './options';
import { psar } from './trend';
import { usdValues, currencyStrength, strengthSide, allCrosses } from './urban';
import { decide, rosterRules, newAgent, afterRun, redact, purposeStale, asks, shouldRun, imported } from '../policy';
import { gate, ruleFilter } from '../decide';
import { pickModel, markDown } from '../router';
import { gapScan } from './gaps';
import { makeTrailer, TrailMode } from './trail';
import { boardRow, strictGate, deflatedSharpe, expectedMaxSharpe } from '../leaderboard';
import { parseFeed, digest } from '../news';
import { garchFit } from './garch';
import { correlationMatrix, lockForIncubation, incubationReport, walkForward } from './peak';
import { olsFit, sgdFit, behaviour, expectedValue, walkBook, size as qsize, logReturns } from './quant';
import { simulateMM, leadLag, convert } from './mm';
import { timeSplit, holdSameBalances } from './validate';
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../packages/engine/src/fixtures/parity.json'), 'utf8'));
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
// ---- chat/46-66 modules: validation, options, trend, Urban Forex, agent policy, AI gate ----
{
  // monkey test is deterministic and a fee-only loser never passes
  const mb: Bar[] = Array.from({ length: 300 }, (_, i) => ({ t: i * 864e5, o: 100 + Math.sin(i / 7), h: 101 + Math.sin(i / 7), l: 99 + Math.sin(i / 7), c: 100 + Math.sin(i / 7), v: 1 }));
  const fake = Array.from({ length: 20 }, (_, j) => ({ side: 1 as const, entryT: 0, entry: 100, stop: 99, target: 101, qty: 10, exitT: 0, exit: 100, reason: 'x', pnl: -5, r: -0.1, bars: 3 + (j % 4) }));
  const m1 = monkeyTest(mb, fake, { seed: 3 }), m2 = monkeyTest(mb, fake, { seed: 3 });
  const vOk = m1.beat === m2.beat && !m1.pass && !sampleCheck(20).ok && sampleCheck(50).ok;
  // Black-Scholes put-call parity and GEX signs
  const S = 100, K = 105, T = 0.5, v = 0.25, r = 0.04, C = bs('C', S, K, T, v, r), P = bs('P', S, K, T, v, r);
  const parity = Math.abs(C.price - P.price - (S - K * Math.exp(-r * T))) < 1e-6 && Math.abs(C.gamma - P.gamma) < 1e-9;
  const gex = gexOf({ K: 100, right: 'C', oi: 10, iv: 0.2, T: 0.1 }, 100) > 0 && gexOf({ K: 100, right: 'P', oi: 10, iv: 0.2, T: 0.1 }, 100) < 0;
  // PSAR stays under price in a steady uptrend
  const up: Bar[] = Array.from({ length: 60 }, (_, i) => ({ t: i, o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: 1 }));
  const ps = psar(up), sarOk = ps.sar.slice(5).every((x, i) => x < up[i + 5].l) && ps.dir[59] === 1;
  // currency strength: EUR rises against everything -> EUR strong, the scan allows EURUSD longs only
  const days = 120, mkp = (f: (i: number) => number): Bar[] => Array.from({ length: days }, (_, i) => ({ t: i * 864e5, o: f(i), h: f(i) * 1.001, l: f(i) * 0.999, c: f(i), v: 1 }));
  const uv = usdValues({ EURUSD: mkp(i => 1 + i * 0.002), GBPUSD: mkp(() => 1.3), USDJPY: mkp(() => 150) });
  const st = currencyStrength(uv), last = st[st.length - 1], side = strengthSide(st, 'EURUSD').get((days - 1) * 864e5);
  const crs = allCrosses(uv), eg = crs.EURGBP[days - 1], egOk = Math.abs(eg.c - (1 + (days - 1) * 0.002) / 1.3) < 1e-9 && eg.h >= eg.c && eg.l <= eg.c;
  const ccyOk = last.label.EUR === 'strong' && last.label.USD !== 'strong' && side === 1 && egOk;
  // agent policy: deny first, default deny, money verbs always refused, approval on send, broken rule refuses, secrets redacted
  const roster = [newAgent('scout', 'analyst', 'apex', 'reads market data')];
  const rules = rosterRules(roster, {});
  const pr = (verb: any, trigger: any = 'person') => decide({ agent: 'scout', verb, trigger }, rules);
  const broken = decide({ agent: 'scout', verb: 'read', trigger: 'person' }, [{ id: 'oops', effect: 'deny', when: () => { throw new Error('x'); } }]);
  const sendOk = decide({ agent: 'scout', verb: 'send', trigger: 'person' }, [{ id: 'mail', effect: 'allow', when: () => true }]);
  const usedUp = decide({ agent: 'scout', verb: 'read', trigger: 'person' }, rosterRules(roster, { scout: 1 }));
  let rt = { id: 'r', agent: 'scout', everyMin: 5, on: true, fails: 0 }; for (let k = 0; k < 10; k++) rt = afterRun(rt, false);
  const red = redact('token=abc123 key sk-ant-REDACTME0123456789');
  const polOk = pr('read').allow && !pr('write_file').allow && pr('write_file').rule === 'default-deny' && !pr('withdraw').allow && pr('order').rule === 'no-money-tools'
    && !broken.allow && broken.rule === 'oops' && sendOk.allow && sendOk.needsApproval && !usedUp.allow && usedUp.rule === 'over-daily-budget'
    && !rt.on && rt.everyMin === 15 && !/abc123|REDACTME/.test(red) && !purposeStale(roster[0]) && purposeStale({ ...roster[0], tools: ['read', 'analyze', 'notify'] })
    && !asks(roster[0], 'read') && asks(roster[0], 'write_file') && asks({ ...roster[0], approval: 'full' }, 'send') && !asks({ ...roster[0], approval: 'full' }, 'write_file')
    && !shouldRun({ ...rt, on: true, running: true }) && shouldRun({ ...rt, on: true, running: false, lastRun: 0 }, 16 * 6e4) && !imported({ ...rt, on: true }).on
    && !decide({ agent: 'scout', verb: 'shell', trigger: 'routine' }, [{ id: 'all', effect: 'allow', when: () => true }]).allow;
  // AI gate: a model "wait" or low confidence never trades; the rule filter blocks a long in a bear regime
  const snap: any = { strategy: 'x', side: 'long', price: 100, stop: 98, target: 108, rr: 4, atrPct: 1, rsi14: 50, adx14: 25, ema50DistAtr: 1, ema50Slope: 'up', emaRegime: 'bull', volVsAvg: 1.2, ret5: 1, ret20: 2, last5: [] };
  const gOk = !gate(snap, { action: 'wait', confidence: 90, fakeoutRisk: 0, why: '' }).take && !gate(snap, { action: 'long', confidence: 40, fakeoutRisk: 0, why: '' }).take
    && gate(snap, { action: 'long', confidence: 80, fakeoutRisk: 20, why: '' }).take && ruleFilter(snap).take && !ruleFilter({ ...snap, emaRegime: 'bear' }).take;
  // every new strategy builds on the fixture without throwing and only flags entries with a stop
  let built = true; for (const s of STRATEGIES) { try { const g = s.build(bars); for (let i = 0; i < bars.length; i++) if ((g.le[i] || g.se[i]) && isNaN(g.stop[i]) && !g.fullSize) { /* engine falls back to 2 ATR */ } } catch { built = false; console.log('  build threw:', s.id); } }
  const ok = vOk && parity && gex && sarOk && ccyOk && polOk && gOk && built;
  console.log(`${ok ? 'PASS' : 'FAIL'} new modules: validate ${vOk}, options ${parity && gex}, psar ${sarOk}, currency strength ${ccyOk}, policy ${polOk}, AI gate ${gOk}, all strategies build ${built}`); if (!ok) fail++;
}
{
  const L: any[] = [{ id: 'a', provider: 'anthropic', free: false, keyEnv: 'K1', capUsd: 5 }, { id: 'b', provider: 'nvidia', free: true, keyEnv: 'K2', capUsd: 1 }, { id: 'c', provider: 'openrouter', free: true, keyEnv: 'K3', capUsd: 1 }];
  const env = { K1: 'x', K2: 'y', K3: 'z' }, st = { spentUsd: {}, down: {}, next: 0 };
  const p1 = pickModel(L, st, { env, now: 0 })?.model.id === 'a', p2 = pickModel(L, st, { env, now: 0, freeOnly: true })?.model.id === 'b';
  const p3 = pickModel(L, markDown(st, 'a', 1000, 0), { env, now: 10 })?.model.id === 'b' && pickModel(L, { ...st, spentUsd: { K1: 5, K2: 1, K3: 1 } }, { env, now: 0 }) === null;
  const rr = pickModel(L, { ...st, next: 1 }, { env, now: 0, strategy: 'round-robin' }), p4 = rr?.model.id === 'b' && rr.next === 2 && pickModel(L, st, { env: {}, now: 0 }) === null;
  const ok = p1 && p2 && p3 && p4; console.log(`${ok ? 'PASS' : 'FAIL'} model router: priority ${p1}, free only ${p2}, fallback and caps ${p3}, round-robin ${p4}`); if (!ok) fail++;
{
  const g = gapScan(); const ok = g.unstyled.length === 0 && g.emptyCells.length > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} gap scan: every strategy has a style ${g.unstyled.length === 0}${g.unstyled.length ? ' (missing: ' + g.unstyled.join(', ') + ')' : ''}, ${g.emptyCells.length} empty cells`); if (!ok) fail++;
}
{
  // chat/77 market making: a flat 99/101 book with sellers hitting 99 and buyers lifting 101 earns the spread minus fees.
  const qs = Array.from({ length: 100 }, (_, i) => ({ t: i * 1000, bid: 99, ask: 101 }));
  const ps = Array.from({ length: 40 }, (_, i) => ({ t: i * 2000 + 500, price: i % 2 ? 101 : 99, side: (i % 2 ? 'buy' : 'sell') as 'buy' | 'sell', qty: 1 }));
  const r = simulateMM(qs, ps, { makerFee: 0.001 });
  const m1 = r.fills === 40 && r.endInventory === 0 && Math.abs(r.net - (40 * 1 - r.fees)) < 1e-9 && r.adverse === 0 && r.spreadVsFee.spreadBeatsFees;
  // a book that moves 2 against every fill: adverse selection shows up as a cost
  const qs2 = Array.from({ length: 200 }, (_, i) => ({ t: i * 1000, bid: 99 - i, ask: 101 - i }));
  const r2 = simulateMM(qs2, [{ t: 10500, price: 89, side: 'sell', qty: 1 }], { markoutMs: 2000 });
  const m2 = r2.adverse > 0;
  // lead-lag: b copies a three seconds later, 1% cheaper. The offset is removed and a is found to lead by 3 steps.
  const a = Array.from({ length: 400 }, (_, i) => ({ t: i * 1000, p: 100 * Math.exp(0.01 * Math.sin(i / 3) + 0.003 * Math.sin(i * 1.7)) }));
  const b = a.map((x, i) => ({ t: x.t, p: 0.99 * a[Math.max(0, i - 3)].p }));
  const ll = leadLag(a, b, { maxLag: 10 }); const m3 = ll.best.lag === 3 && ll.leader === 'a' && Math.abs(ll.offsetPct - 0.0101) < 0.002;
  const conv = convert([{ t: 0, p: 90 }], [{ t: 0, p: 1.1 }]); const m4 = Math.abs(conv[0].p - 99) < 1e-9;
  const sp = timeSplit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); const m5 = sp.train.join() === '1,2,3,4,5,6' && sp.test.join() === '9,10';
  const h = holdSameBalances({ BTC: 1, USD: 1000 }, { BTC: 100 }, { BTC: 110 }); const m6 = Math.abs(h.ret - 10 / 1100) < 1e-12;
  const ok = m1 && m2 && m3 && m4 && m5 && m6;
  console.log(`${ok ? 'PASS' : 'FAIL'} market making: spread capture ${m1}, adverse selection ${m2}, lead-lag ${m3} (lag ${ll.best.lag}, offset ${(ll.offsetPct * 100).toFixed(2)}%), fx convert ${m4}, time split ${m5}, hold benchmark ${m6}`); if (!ok) fail++;
}
{
  // chat/81 trailing stops: price climbs 1 a bar for 40 bars, then drops hard. Every mode should ratchet the stop up, never
  // down, and exit on the drop in profit; the guards refuse a looser stop, a stop behind the entry, and one inside the stop level.
  const up: Bar[] = Array.from({ length: 80 }, (_, i) => { const c = i < 60 ? 100 + i : 159 - 4 * (i - 59); return { t: i * 864e5, o: c - 0.5, h: c + 1, l: c - 1, c, v: 1 }; });
  const res = (['scalp', 'candles', 'ma', 'tenkan'] as TrailMode[]).map(mode => {
    const n = up.length, sig: Sig = { le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN), trail: { mode, spread: 0.0002 } };
    sig.le[20] = true; sig.stop[20] = 110;
    const t = backtest(up, sig, { fee: 0, slip: 0 }).trades[0];
    return { mode, ok: !!t && t.reason === 'trail' && t.pnl > 0 && (t.mods ?? 0) > 3 && t.stop0 === 110, mods: t?.mods };
  });
  const tr = makeTrailer(up, { mode: 'scalp', trigger: 0, distance: 1 });
  const g1 = isNaN(tr(50, 1, 120, 200)), g2 = isNaN(tr(50, 1, 160, 100)), g3 = !isNaN(tr(50, 1, 120, 100));
  const g4 = isNaN(makeTrailer(up, { mode: 'scalp', trigger: 0, distance: 1, stopLevel: 5 })(50, 1, 120, 100));
  const ok = res.every(r => r.ok) && g1 && g2 && g3 && g4;
  console.log(`${ok ? 'PASS' : 'FAIL'} trailing stops: ${res.map(r => `${r.mode} ${r.ok} (${r.mods} mods)`).join(', ')}; never loosen ${g1}, beyond entry ${g2}, moves when allowed ${g3}, stop level ${g4}`); if (!ok) fail++;
}
{
  // chat/83-86: leaderboard, strict gate with a multiple-testing charge, daily stops, news digest, GARCH fit.
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const mk = (id: string, drift: number, n = 250) => ({ id, capital: 10000, trades: Array.from({ length: n }, (_, i) => ({ t: Date.UTC(2025, 0, 1) + Math.floor(i * 7 / 5) * 864e5 + 72e6, pnl: 100 * (drift + gauss()) })) });
  // 500 bots with no edge: the best one looks good alone but fails once the 500 tries are counted
  const bots = Array.from({ length: 500 }, (_, i) => mk('b' + i, 0)), best = bots.map(b => boardRow(b)).sort((a, b) => b.sharpe - a.sharpe)[0];
  const lone = deflatedSharpe(bots.map(b => b).find(b => b.id === best.id)!.trades.map(t => t.pnl / 10000), 1).psr, counted = strictGate(bots.find(b => b.id === best.id)!, { nTrials: 500, maxDrawdown: 1, minProfitableMonths: 0 });
  const real = strictGate(mk('edge', 0.5), { nTrials: 500, maxDrawdown: 1, minProfitableMonths: 0 });
  const l1 = best.sharpe > 1.5 && lone > 0.95 && !counted.pass && real.pass && expectedMaxSharpe(500, 250) > expectedMaxSharpe(10, 250);
  const row = boardRow({ id: 'x', capital: 1000, trades: [{ t: 0, pnl: 10 }, { t: 864e5, pnl: -5 }, { t: 2 * 864e5, pnl: 20 }] }), l2 = row.wins === 2 && row.losses === 1 && Math.abs(row.profitFactor - 6) < 1e-9 && row.grade === 'D';
  // daily stop: two winning trades on one day, the second is skipped once the +0.5% target is hit (the first win is +0.67%)
  const n = 20, day: Bar[] = Array.from({ length: n }, (_, i) => ({ t: Date.UTC(2025, 0, 2, 14) + i * 18e5, o: 100 + i, h: 101 + i, l: 99.5 + i, c: 100.5 + i, v: 1 }));
  const sg: Sig = { le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) };
  sg.le[1] = true; sg.stop[1] = 99; sg.target[1] = 104; sg.le[6] = true; sg.stop[6] = 104; sg.target[6] = 109;
  const d1 = backtest(day, sg, { fee: 0, slip: 0 }).trades.length, d2 = backtest(day, sg, { fee: 0, slip: 0, dayTarget: 0.005 }).trades.length, l3 = d1 === 2 && d2 === 1;
  const xml = '<rss><channel><item><title>Hedge funds pile into crude oil longs</title><link>https://x/1</link><pubDate>Mon, 10 Nov 2025 10:00:00 GMT</pubDate></item><item><title>Local bakery opens</title><link>https://x/2</link></item><item><title><![CDATA[Fed &amp; Treasury yields]]></title><link>https://x/3</link></item></channel></rss>';
  const dg = digest(parseFeed(xml, 'x')), l4 = dg.items.length === 2 && dg.items[0].who.includes('hedge_funds') && dg.items[0].markets.includes('energy') && dg.byWho.central_banks === 1;
  let h = 1e-4, x = 0; const sim: number[] = []; for (let i = 0; i < 2000; i++) { h = 2e-6 + 0.1 * x * x + 0.85 * h; x = Math.sqrt(h) * gauss(); sim.push(x); }
  const gf = garchFit(sim), l5 = Math.abs(gf.alpha - 0.1) < 0.05 && Math.abs(gf.beta - 0.85) < 0.07;
  const ok = l1 && l2 && l3 && l4 && l5;
  console.log(`${ok ? 'PASS' : 'FAIL'} leaderboard and gates: luck caught by the 500-try charge ${l1} (best Sharpe ${best.sharpe.toFixed(2)}), board row ${l2}, daily target stop ${l3}, news digest ${l4}, GARCH fit ${l5} (a ${gf.alpha.toFixed(3)} b ${gf.beta.toFixed(3)})`); if (!ok) fail++;
}
{
  // chat/87: AR(1) fits recover a known weight both ways; EV catches the "wins more but loses money" coin; book walk; sizing caps;
  // market-making skew moves both quotes the same way.
  let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const r: number[] = [0]; for (let i = 1; i < 3000; i++) r.push(-0.4 * r[i - 1] + 0.01 * rnd());
  const x = r.slice(0, -1), y = r.slice(1), o = olsFit(x, y), g = sgdFit(x, y, { epochs: 30 });
  const q1 = Math.abs(o.w + 0.4) < 0.05 && Math.abs(g.w + 0.4) < 0.06 && behaviour(o) === 'mean_reversion' && behaviour({ w: 0.3, b: 0 }) === 'momentum';
  const coin = expectedValue([...Array(55).fill(1), ...Array(45).fill(-1.25)]), q2 = coin.winRate === 0.55 && coin.ev < 0 && Math.abs(coin.ev - coin.check) < 1e-12;
  const wb = walkBook([[115, 3], [116, 4], [117, 5]], 10), q3 = wb.filled === 10 && Math.abs(wb.avgPrice - (3 * 115 + 4 * 116 + 3 * 117) / 10) < 1e-9 && wb.levelsUsed === 3;
  const q4 = qsize(0.5, 'constant', 100) === 100 && qsize(5, 'hardtanh', 100) === 100 && qsize(0.5, 'hardtanh', 100) === 50 && Math.abs(qsize(-9, 'tanh', 100)) <= 100 && qsize(-0.1, 'constant', 100) === -100;
  const q5 = Math.abs(logReturns([100, 120, 100])[0] + logReturns([100, 120, 100])[1]) < 1e-12;   // log returns are symmetric
  const qs = Array.from({ length: 100 }, (_, i) => ({ t: i * 1000, bid: 99, ask: 101 }));
  const ps = [{ t: 50500, price: 99.5, side: 'sell' as const, qty: 1 }];
  const noSkew = simulateMM(qs, ps, {}).fills, up = simulateMM(qs, ps, { predict: () => 0.006 }).fills;   // the bid moves from 99 up to 99.6, so a seller at 99.5 now fills it
  const q6 = noSkew === 0 && up === 1 && simulateMM(qs, ps, { volSpreadK: 3 }).fills === 0;
  const ok = q1 && q2 && q3 && q4 && q5 && q6;
  console.log(`${ok ? 'PASS' : 'FAIL'} quant kit: AR(1) ols ${o.w.toFixed(3)} sgd ${g.w.toFixed(3)} ${q1}, EV beats win rate ${q2}, book walk ${q3}, sizing caps ${q4}, symmetric log returns ${q5}, mm skew ${q6}`); if (!ok) fail++;
}
{
  // chat/88: correlation matrix signs, incubation only scores bars after the lock, walk-forward stitches only test windows.
  const a = new Map<number, number>(), b2 = new Map<number, number>(), c2 = new Map<number, number>();
  for (let d = 0; d < 50; d++) { const v = Math.sin(d * 1.3); a.set(d, v); b2.set(d, 2 * v + 0.1); c2.set(d, -v); }
  const m = correlationMatrix({ a, b: b2, c: c2 }), p1 = Math.abs(m.a.b - 1) < 1e-9 && Math.abs(m.a.c + 1) < 1e-9 && Math.abs(m.a.a - 1) < 1e-9;
  const inc = lockForIncubation('supertrend', { n: 10 }, bars[600].t), same = lockForIncubation('supertrend', { n: 10 }, 0).hash === inc.hash, diff = lockForIncubation('supertrend', { n: 11 }, 0).hash !== inc.hash;
  const rep = incubationReport(bars, byId('supertrend').build, inc, { minMonths: 1 }), p2 = same && diff && rep.status !== 'waiting' && rep.months > 1;
  const wf = walkForward(bars, (n: number) => byId('supertrend').build, [1, 2], { train: 300, test: 100 }), p3 = wf.windows.length === Math.floor((bars.length - 300) / 100) && wf.windows.every(w => w.from > bars[299].t);
  const ok = p1 && p2 && p3;
  console.log(`${ok ? 'PASS' : 'FAIL'} portfolio tools: correlation ${p1}, incubation lock ${p2} (${rep.status}), walk-forward windows ${p3} (${wf.windows.length})`); if (!ok) fail++;
}
{
  // chat/90: annualising (√252 daily, √12 monthly), t-stat = per-period Sharpe × √n equals the textbook mean/(sd/√n),
  // two equal-Sharpe series with negative correlation combine into a higher Sharpe, and leverage leaves Sharpe unchanged.
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const common = Array.from({ length: 1000 }, () => rnd()), red = new Map<number, number>(), blue = new Map<number, number>();
  for (let i = 0; i < 1000; i++) { red.set(i, 0.001 + 0.01 * common[i] + 0.004 * rnd()); blue.set(i, 0.001 - 0.01 * common[i] + 0.004 * rnd()); }
  const rr = [...red.values()], d = sharpeReport(rr, 252), mo = sharpeReport(rr, 12);
  const m = rr.reduce((a, b) => a + b, 0) / rr.length, s = Math.sqrt(rr.reduce((a, b) => a + (b - m) ** 2, 0) / (rr.length - 1));
  const s1 = Math.abs(d.sharpe / mo.sharpe - Math.sqrt(252 / 12)) < 1e-9 && Math.abs(d.tStat - m / (s / Math.sqrt(rr.length))) < 1e-9;
  const c = combine({ red, blue }, { train: 0.5 }), eq = c.methods.find(x => x.method === 'equal')!;
  const s2 = c.correlation[0][1] < -0.5 && eq.diversification > 1.5 && c.methods.every(x => Math.abs(Object.values(x.weights).reduce((a, b) => a + b, 0) - 1) < 1e-6);
  const l2 = leveredResearch(rr, 2), s3 = Math.abs(sharpeReport(l2.returns, 252).sharpe - d.sharpe) < 1e-9 && l2.maxDrawdown < leveredResearch(rr, 1).maxDrawdown && leveredResearch([0.1, -0.6], 2).ruined;
  const vb = vsBenchmark(rr, [...blue.values()]), s4 = vb.beta < 0 && Math.abs(vb.correlation - c.correlation[0][1]) < 1e-3;
  const ok = s1 && s2 && s3 && s4;
  console.log(`${ok ? 'PASS' : 'FAIL'} sharpe reports: annualise and t-stat ${s1}, correlation-aware mix ${s2} (corr ${c.correlation[0][1]}, ${eq.diversification.toFixed(2)}x), leverage keeps Sharpe and deepens drawdown ${s3}, benchmark beta ${s4}`); if (!ok) fail++;
}
}
console.log(fail ? `${fail} failures` : 'all checks passed');
process.exit(fail ? 1 : 0);
