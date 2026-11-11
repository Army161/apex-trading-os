// The autopilot run (docs/design/04 s19). Red path.
// A pure function: bars, health, the ledger so far, limits and halts go in; the entries to append and a report come out.
// It reads no clock, no network and no environment. Replaying the same input gives byte-identical appends, which is what makes
// the independent validator and the golden tests possible. The caller loads the input, holds the run lock and writes the appends.
//
// Rules this file must keep (each has a test):
//  - Nothing is evaluated without a pre-registration made first (S9). Every evaluation, including one that throws, is recorded.
//  - A pair is never promoted by the run that found it (K2). Promotion needs an agreeing validator run already in the ledger.
//  - Paper slots are stepped before any new evaluation. A slot is judged only on bars after its lock (S11).
//  - Every order intent goes through the risk guard, and size comes from nowhere else (S5).
//  - A slot is never retired because an in-sample re-run moved. Retirement comes from the forward record or drift.
import type { Sig } from '@apex/engine/core';
import type { StratDef } from '@apex/engine/strategies';
import { hashOf, normalise, sha256 } from '@apex/kernel/canonical';
import type { Append, LedgerEntry, LedgerKind } from '@apex/kernel/ledger';
import { evaluate, gateVersion, inputHash, passBar, resultHash, trialKey, type GateConfig, type GateResult, type TrialInputs } from '@apex/kernel/gate';
import { checkIntent, effectiveLimits, type Halts, type Intent, type Limits } from '@apex/kernel/guard';
import { applyEntry, bookAt, buildView, slotsEver, trialsEver, type LedgerView, type SlotState, type TrialState } from '@apex/kernel/view';
import { TF_MS, type DataHealth, type LoadedDataset } from '@apex/data/types';
import { versionOf } from '@apex/data/bars';
import { costFor, measured, type CostModel } from './costs';
import { stepBar } from './broker/barsim';
import { baselineOf, driftReading } from './drift';
import { graduation, holdDaily, strategyRecord, type ForwardRecord, type Graduation } from './incubator';
import { dedupe, overlapCorr, portfolioWeights, type Daily } from './portfolio';
import { agreement, digestOf } from './validator';
import type { QueueItem, ReportData } from './report';

export type StrategyEntry = { def: StratDef; fingerprint: string };
export type RunInput = {
  now: number; runId: string; commit: string; mode: 'tick' | 'full' | 'validator';
  datasets: LoadedDataset[]; health: DataHealth[]; registry: StrategyEntry[]; engineFingerprint: string;
  entries: LedgerEntry[]; durable: boolean;
  requestedLimits: Limits; halts: Halts; costModel: CostModel; gate: GateConfig; capital: number;
  budget?: number; trialsPerWeek: number; seedSource?: string;       // seedSource: a plan-approved batch that is exempt from the weekly budget
  secondSourceExists: boolean; validator?: { level: 'L1' | 'L2' | 'L3'; source: string };
};
export type RunOutput = { appends: Append[]; report: ReportData; queue: QueueItem[]; pullAndon: string | null; view: LedgerView };

const DAY = 864e5;
const LOT: Record<string, number> = { stock: 0.001, etf: 0.001, crypto: 0.000001, fx: 1, commodity: 0.001, rate: 1 };
const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);
export const slotKeyOf = (strategyId: string, dataset: string) => `${strategyId}@${dataset}`;
export const intentId = (slotKey: string, barT: number, side: number) => sha256(`${slotKey}|${barT}|${side}`);

export function runAutopilot(inp: RunInput): RunOutput {
  const g = inp.gate, gv = gateVersion(g), cm = inp.costModel, view = buildView(inp.entries, inp.capital), appends: Append[] = [];
  let seq = view.headSeq, pullAndon: string | null = null;
  const emit = (kind: LedgerKind, payload: object, actor?: string) => { const p = normalise(payload); appends.push({ kind, payload: p, actor }); applyEntry(view, { kind, payload: p, seq: ++seq, ts: inp.now }); return seq; };
  const actor = inp.mode === 'validator' ? 'validator' : 'autopilot';
  const dsById = new Map(inp.datasets.map(d => [d.spec.id, d])), health = new Map(inp.health.map(h => [h.dataset, h])), reg = new Map(inp.registry.map(s => [s.def.id, s]));
  const problems: string[] = [], queue: QueueItem[] = [], runIntents: any[] = [], runBlocks: any[] = [], runFills: any[] = [];

  // ---- 0. Record what this run is judged by: gate, limits, costs, data ----
  if (!view.gateVersions.has(gv)) emit('gate_version', { version: gv, config: g, passBar: passBar(g) });
  const snap = effectiveLimits(inp.requestedLimits, view.limits, inp.now), limits = snap.limits;
  const newPending = Object.keys(snap.pending).filter(k => (view.limits?.pending as any)?.[k]?.value !== (snap.pending as any)[k].value);
  if (view.lastConfig?.costModelVersion !== cm.version) emit('cost_model', { version: cm.version, rows: cm.rows.map(({ why, ...r }) => r) });
  emit('config_snapshot', { limits, pending: snap.pending, requested: inp.requestedLimits, capital: inp.capital, costModelVersion: cm.version, engineFingerprint: inp.engineFingerprint, gateVersion: gv, runId: inp.runId });
  if (newPending.length) emit('limit_change_pending', { keys: newPending, pending: snap.pending, note: 'a looser limit was requested; it is adopted only after 24 hours unchanged' });
  for (const d of inp.datasets) {
    const h = health.get(d.spec.id), prev = view.dataVersions.get(d.spec.id);
    if (!h) { problems.push(`${d.spec.id}: no health verdict, treated as blocked`); continue; }
    if (!prev || prev.version !== d.version || prev.status !== h.status || prev.tradable !== h.tradable)
      emit('data_version', { dataset: d.spec.id, version: d.version, rows: d.bars.length, first: d.bars[0]?.t ?? 0, last: d.bars[d.bars.length - 1]?.t ?? 0, status: h.status, tradable: h.tradable,
        warnings: h.checks.filter(c => c.status !== 'ok').map(c => `${c.id}: ${c.detail}`), source: h.provenance.source, second: h.provenance.second ?? null });
  }

  const sigCache = new Map<string, Sig>();
  const sigOf = (s: { strategy: string; dataset: string }) => { const k = `${s.strategy}|${s.dataset}`; if (!sigCache.has(k)) sigCache.set(k, reg.get(s.strategy)!.def.build(dsById.get(s.dataset)!.bars)); return sigCache.get(k)!; };
  const usable = (s: SlotState) => dsById.has(s.dataset) && reg.has(s.strategy);
  const records = new Map<string, ForwardRecord>(), grads = new Map<string, Graduation>();
  const inSampleCache = new Map<string, GateResult>();
  /** The slot's in-sample result, recomputed from the bars up to its lock. */
  const inSample = (s: SlotState) => { if (!inSampleCache.has(s.slotKey)) { const d = dsById.get(s.dataset)!; inSampleCache.set(s.slotKey, evaluate(d.bars.filter(b => b.t < s.lockedAt), reg.get(s.strategy)!.def.build, costFor(cm, { assetClass: s.assetClass, costBucket: s.costBucket }), g)); } return inSampleCache.get(s.slotKey)!; };
  const dailyCloses = (dataset: string, upTo: number): Daily => { const d = dsById.get(dataset); if (!d) return []; const last = new Map<number, number>(); for (const b of d.bars) { if (b.t > upTo) break; last.set(Math.floor(b.t / DAY), b.c); }
    const days = [...last.keys()].sort((a, b) => a - b).slice(-(g.guard.corrDays + 1)); return days.slice(1).map((dd, i) => [dd, last.get(dd)! / last.get(days[i])! - 1] as [number, number]); };
  let weightsStale = false;
  const recomputeWeights = (why: string) => {
    const prim = [...view.slots.values()].filter(s => s.role === 'primary' && s.status !== 'retired' && usable(s));
    const w = portfolioWeights(prim.map(s => ({ slotKey: s.slotKey, daily: inSample(s).daily })), { cap: Math.min(g.weights.cap, limits.maxWeightPct), minAlignedDays: g.weights.minAlignedDays, riskPct: limits.riskPct });
    emit('weights', { weights: w.weights, riskFractions: w.riskFractions, method: w.method, month: monthOf(inp.now), why });
  };

  // ---- paper: step every active slot through its new bars, oldest bar first ----
  function stepPaper() {
    const active = [...view.slots.values()].filter(s => s.status !== 'retired'), marks: Record<string, number> = {};
    const events: { t: number; s: SlotState; i: number }[] = [];
    for (const s of active) {
      if (!usable(s)) { problems.push(`${s.slotKey}: its strategy or dataset is missing from this run, slot not stepped`); continue; }
      if (reg.get(s.strategy)!.fingerprint !== s.fingerprint) {               // frozen while locked (04 s2)
        if (s.status === 'paper') emit('slot_status', { slotKey: s.slotKey, from: s.status, to: 'paused_data', reason: 'the strategy code changed after the lock; a changed strategy must be registered under a new id', numbers: {} });
        problems.push(`${s.slotKey}: strategy fingerprint differs from the one in its lock`); continue;
      }
      const bars = dsById.get(s.dataset)!.bars, cursor = view.cursors[s.slotKey] ?? s.lockedAt - 1;
      for (let i = bars.length - 1; i >= 0 && bars[i].t > cursor; i--) events.push({ t: bars[i].t, s, i });
    }
    events.sort((a, b) => a.t - b.t || (a.s.slotKey < b.s.slotKey ? -1 : 1));
    for (const { s, i } of events) {
      const k = s.slotKey, d = dsById.get(s.dataset)!, bars = d.bars, bar = bars[i], sig = sigOf(s), cost = costFor(cm, d.spec), h = health.get(d.spec.id);
      const before = view.closed.length;
      if (view.positions.has(k) || view.pending.has(k)) stepBar(() => ({ position: view.positions.get(k) ?? null, pending: view.pending.get(k) ?? null }), bars, i, sig, cost, f => { emit('fill', f); runFills.push(f); });
      marks[s.symbol] = bar.c;
      for (const c of view.closed.slice(before)) {
        const fr = view.closed.filter(x => x.slotKey === k).map(x => x.r), rd = driftReading(fr, s.cusum, s.baseline, g.drift);
        emit('drift_reading', { slotKey: k, n: rd.n, s: rd.s, winP: rd.winP, ddR: rd.ddR, alarms: rd.alarms, costNote: rd.costNote, tradeR: c.r, exitT: c.exitT });
        if (rd.alarms.length && s.status === 'paper') {
          const third = s.driftPauses + 1 >= g.drift.maxPauses;
          emit('slot_status', { slotKey: k, from: 'paper', to: 'paused_drift', reason: `drift alarm: ${rd.alarms.join('; ')}`, numbers: { n: rd.n, s: rd.s, winP: rd.winP, ddR: rd.ddR } });
          if (third) { emit('slot_status', { slotKey: k, from: 'paused_drift', to: 'retired', reason: `${g.drift.maxPauses} drift pauses`, numbers: {} }); weightsStale = true; }
        }
        const b = bookAt(view, bar.t, marks);
        if (!view.drawdownPaused && b.equity <= b.peak * (1 - limits.maxDrawdownPct)) emit('halt', { level: 'book-drawdown', by: 'autopilot', reason: `paper book is ${((b.equity / b.peak - 1) * 100).toFixed(1)}% below its peak; no new entries until Jeremy resumes` });
      }
      // a signal on this closed bar becomes an intent for the next bar's open
      const side = sig.le[i] ? 1 : sig.se[i] ? -1 : 0;
      if (side && s.role === 'primary' && s.status !== 'retired' && !view.positions.has(k) && !view.pending.has(k)) {
        const id = intentId(k, bar.t, side);
        if (!view.intentIds.has(id)) {
          const intent: Intent = { id, slotKey: k, symbol: s.symbol, assetClass: s.assetClass, side, barT: bar.t, refPrice: bar.c, stop: sig.stop[i], target: Number.isFinite(sig.target[i]) ? sig.target[i] : null, riskFraction: s.riskFraction };
          const open = [...view.positions.values()], mine = dailyCloses(s.dataset, bar.t);
          const correlated = [...new Set(open.filter(p => p.symbol !== s.symbol).map(p => p.symbol))].filter(sym => { const other = [...view.slots.values()].find(x => x.symbol === sym); const c = other ? overlapCorr(mine, dailyCloses(other.dataset, bar.t), 20) : null; return !!c && c.corr > g.guard.corr; });
          const stopIdx = s.lastStopT === null ? -1 : bars.findIndex(b => b.t === s.lastStopT);
          const r = checkIntent(intent, bookAt(view, bar.t, marks), limits, { halts: inp.durable ? inp.halts : { ...inp.halts, readable: false }, slot: { status: s.status, role: s.role, weight: s.weight, barsSinceStop: stopIdx < 0 ? null : i - stopIdx },
            dataStatus: !h || !h.tradable ? 'blocked' : h.status, correlatedSymbols: correlated, lotStep: LOT[s.assetClass] ?? 1, minQty: LOT[s.assetClass] ?? 1, minRiskShareAfterCap: g.guard.minRiskShareAfterCap });
          const base = { id, slotKey: k, symbol: s.symbol, assetClass: s.assetClass, side, barT: bar.t, refPrice: bar.c, stop: intent.stop, target: intent.target, mode: 'paper' };
          if (r.ok) { const p = { ...base, qty: r.qty, riskUsd: r.riskUsd, riskFraction: r.intent!.riskFraction, rules: r.rules.map(x => x.id) }; emit('intent', p); runIntents.push(p); }
          else { const p = { ...base, rules: r.rules.filter(x => !x.pass).map(x => ({ id: x.id, detail: x.detail })), ...(inp.durable ? {} : { note: 'no durable ledger: paper orders are refused' }) }; emit('intent_blocked', p); runBlocks.push(p); }
        }
      }
      view.cursors[k] = bar.t;
    }
    // forward records, the monthly check and graduation
    const month = monthOf(inp.now);
    for (const s of [...view.slots.values()]) {
      if (s.status === 'retired' || !usable(s) || reg.get(s.strategy)!.fingerprint !== s.fingerprint) continue;
      const d = dsById.get(s.dataset)!, rec = strategyRecord(d.bars, sigOf(s), s.lockedAt, costFor(cm, d.spec), g); records.set(s.slotKey, rec);
      const gr = graduation(rec, holdDaily(d.bars, s.lockedAt), slotsEver(view), trialsEver(view), g); grads.set(s.slotKey, gr);
      if (s.lastGradMonth !== month && rec.months >= 1) {
        emit('graduation_check', { slotKey: s.slotKey, month, state: gr.state, months: gr.months, trades: gr.trades, ret: gr.ret, pf: gr.pf, dd: gr.dd, dsrM: gr.dsrM, dsrN: gr.dsrN, m: gr.m, n: gr.n, fails: gr.fails, clock: gr.clock });
        if (gr.state === 'failed') {
          emit('slot_status', { slotKey: s.slotKey, from: s.status, to: 'retired', reason: `forward record failed after ${gr.months.toFixed(1)} months: return ${(gr.ret * 100).toFixed(1)}%, profit factor ${gr.pf === null ? 'n/a' : gr.pf.toFixed(2)}`, numbers: { ret: gr.ret, pf: gr.pf } });
          weightsStale = true;
          if (s.role === 'primary') {                                          // its best shadow, by forward Sharpe, takes over and keeps its own lock date
            const sh = [...view.slots.values()].filter(x => x.shadowOf === s.slotKey && x.status !== 'retired' && records.has(x.slotKey) && records.get(x.slotKey)!.months >= g.dedupe.shadowMinMonths)
              .sort((a, b) => records.get(b.slotKey)!.sharpeDaily - records.get(a.slotKey)!.sharpeDaily || (a.slotKey < b.slotKey ? -1 : 1))[0];
            if (sh) emit('slot_status', { slotKey: sh.slotKey, from: sh.status, to: sh.status, role: 'primary', shadowOf: null, reason: `promoted from shadow: ${s.slotKey} retired`, numbers: {} });
          }
        }
      }
      const tr = view.trials.get(s.trialKey);
      if (s.status === 'paper' && s.lastGrad?.state === 'strict_pass' && tr?.validator.some(v => v.purpose === 'graduation' && v.slotKey === s.slotKey && v.seq > s.lastGrad.seq && v.agrees))
        emit('slot_status', { slotKey: s.slotKey, from: 'paper', to: 'live_eligible', reason: 'held up in paper, passed the strict forward gate, and a fresh validator run agrees. Live still needs locks 2, 3 and 4', numbers: { dsrM: s.lastGrad.dsrM, trades: s.lastGrad.trades } });
    }
  }

  // ---- factory: pre-register, evaluate, record ----
  let evaluated = 0, errors = 0, newTrials = 0, waitingBudget = 0, skipped = 0, pairsTotal = 0;
  function runFactory() {
    const pairs: { d: LoadedDataset; s: StrategyEntry; key: string; inputs: TrialInputs; ih: string; t?: TrialState }[] = [];
    for (const d of inp.datasets) for (const s of inp.registry) {
      // A research-queue test pairs only with the panels it names, on its own timeframe. Everything else pairs as before
      // (the whole stress board, other panels by timeframe) and never with a panel that exists only for the queue.
      const q = s.def.queue;
      if (q ? !(s.def.tf === d.spec.tf && q.panels.some(x => d.spec.panels.includes(x))) : !d.spec.panels.includes('stress-board') && (s.def.tf !== d.spec.tf || d.spec.panels.every(x => x.startsWith('queue-')))) continue;
      const key = trialKey({ strategyId: s.def.id, fingerprint: s.fingerprint, panel: d.spec.id, tf: d.spec.tf, gateVersion: gv });
      const inputs: TrialInputs = { strategy: { id: s.def.id, fingerprint: s.fingerprint }, dataset: [{ id: d.spec.id, version: d.version }], gateVersion: gv, costModelVersion: cm.version, engineFingerprint: inp.engineFingerprint, seed: g.monkey.seed };
      pairs.push({ d, s, key, inputs, ih: inputHash(inputs), t: view.trials.get(key) });
    }
    // Queue tests go first, in the plan's order (the order they are registered in), so the weekly budget is spent on them in that order.
    const order = new Map(inp.registry.map((s, i) => [s, i])), queued = pairs.filter(p => p.s.def.queue).sort((a, b) => order.get(a.s)! - order.get(b.s)!);
    pairs.splice(0, pairs.length, ...queued, ...pairs.filter(p => !p.s.def.queue));
    pairsTotal = pairs.length;
    // The N behind the deflated-Sharpe readout is every trial ever plus every new pair in this registry, so the readout does not
    // depend on the order pairs happen to be evaluated in. It is a readout only: it is not part of the result hash.
    const nReadout = view.trials.size + pairs.filter(p => !p.t).length;
    pairs.sort((a, b) => (a.t ? a.t.lastSeq : -1) - (b.t ? b.t.lastSeq : -1));                // never evaluated first, then oldest first (stable)
    const budget = inp.mode === 'full' ? Infinity : inp.budget ?? 10, weekAgo = inp.now - 7 * DAY;
    let newThisWeek = [...view.preregs.values()].filter(p => (p.source === 'factory' || p.source.startsWith('queue:')) && p.ts > weekAgo).length;
    for (const p of pairs) {
      if (evaluated >= budget) break;
      if (p.t && p.t.result.inputHash === p.ih) continue;                                     // already judged on exactly these inputs
      const h = health.get(p.d.spec.id);
      if (!h || h.status === 'blocked') { const sk = `${p.d.spec.id}|${p.d.version}|${p.s.def.id}`; skipped++;
        if (!view.skipped.has(sk)) emit('skipped_data', { dataset: p.d.spec.id, version: p.d.version, strategy: p.s.def.id, reason: h ? h.checks.filter(c => c.status === 'blocked').map(c => `${c.id}: ${c.detail}`).join('; ') : 'no health verdict' });
        continue; }
      if (!view.preregs.has(p.key)) {
        const q = p.s.def.queue;                                                              // queue tests always wait for the weekly budget, even in a seeded run
        if ((q || !inp.seedSource) && newThisWeek >= inp.trialsPerWeek) { waitingBudget++; continue; }
        emit('prereg', { trialKey: p.key, hypothesis: `${p.s.def.name} beats random entries, costs and buy and hold on ${p.d.spec.symbol} ${p.d.spec.tf}`, source: q ? `queue:${q.id}` : inp.seedSource ?? 'factory',
          strategy: { id: p.s.def.id, fingerprint: p.s.fingerprint }, panel: p.d.spec.id, tf: p.d.spec.tf, gateVersion: gv, passBar: passBar(g), plannedVariants: 1 });
        if (q || !inp.seedSource) newThisWeek++; newTrials++;
      }
      const res = evaluate(p.d.bars, p.s.def.build, costFor(cm, p.d.spec), g, Math.max(nReadout, trialsEver(view) + (p.t ? 0 : 1))); if (res.error) errors++;
      emit('trial_result', { trialKey: p.key, gateVersion: gv, inputs: p.inputs, inputHash: p.ih, resultHash: resultHash(res), status: res.status, why: res.why, checks: res.checks, metrics: res.metrics, readouts: res.readouts,
        data: { first: p.d.bars[0]?.t ?? 0, last: p.d.bars[p.d.bars.length - 1]?.t ?? 0, rows: p.d.bars.length }, strategy: p.s.def.id, panel: p.d.spec.id, symbol: p.d.spec.symbol, tf: p.d.spec.tf, runId: inp.runId, ...(res.error ? { error: res.error } : {}) });
      evaluated++;
    }
    if (waitingBudget) queue.push({ id: `budget-${monthOf(inp.now)}`, kind: 'gap', title: `${waitingBudget} new pairs are waiting for the weekly trial budget`, why: `at most ${inp.trialsPerWeek} new trials start automatically each week, so the system does not burn its own statistical power`, source: 'factory', needs: ['jeremy:tap'], cost: { trials: waitingBudget, aiUsd: 0 }, status: 'proposed', createdBy: 'autopilot' });
  }

  // ---- promotion: only with an agreeing validator run that is already in the ledger (K2) ----
  const pendingValidation: TrialState[] = [];
  function promote() {
    const need = inp.secondSourceExists ? 'L2' : 'L1';
    for (const t of [...view.trials.values()].sort((a, b) => a.firstSeq - b.firstSeq)) {
      const r = t.result; if (r.status !== 'passed_pending_validation') continue;
      const k = slotKeyOf(r.strategy, r.panel); if (view.slots.has(k)) continue;
      const vs = t.validator.filter(v => v.purpose === 'promotion' && v.resultOf === r.resultHash);
      if (!vs.length) { pendingValidation.push(t); continue; }
      if (!vs[vs.length - 1].agrees) { queue.push({ id: `validator-${t.trialKey.slice(0, 12)}`, kind: 'near_miss', title: `Validator disagreed on ${r.strategy} ${r.symbol} ${r.tf}`, why: (vs[vs.length - 1].diffs ?? []).join('; '), source: 'validator', needs: [], cost: { trials: 0, aiUsd: 0 }, status: 'proposed', createdBy: 'validator' }); continue; }
      if (need === 'L2' && !vs.some(v => v.agrees && v.level !== 'L1')) { pendingValidation.push(t); continue; }
      if (!inp.durable) { problems.push(`${k}: validated, but there is no durable ledger, so it is not locked into paper`); continue; }
      const d = dsById.get(r.panel), s = reg.get(r.strategy); if (!d || !s) continue;
      const inBars = d.bars.filter(b => b.t <= r.data.last), again = evaluate(inBars, s.def.build, costFor(cm, d.spec), g);
      if (resultHash(again) !== r.resultHash) { problems.push(`${k}: the bars behind its result have changed; it waits for a fresh evaluation and validator run`); continue; }
      const prim = [...view.slots.values()].filter(x => x.role === 'primary' && x.status !== 'retired' && usable(x)).map(x => ({ slotKey: x.slotKey, daily: inSample(x).daily }));
      const dd = dedupe(again.daily, prim, g.dedupe.corr, g.dedupe.minDays);
      emit('slot_locked', { slotKey: k, trialKey: t.trialKey, strategy: r.strategy, dataset: r.panel, symbol: r.symbol, tf: r.tf, assetClass: d.spec.assetClass, costBucket: d.spec.costBucket, inputs: r.inputs, inputHash: r.inputHash,
        resultHash: r.resultHash, digest: digestOf(again), data: r.data, lockedAt: r.data.last + TF_MS[d.spec.tf], gateVersion: gv, role: dd.role, shadowOf: dd.shadowOf, corr: dd.corr, baseline: baselineOf(again.tradesR, g.drift), validatorSeq: vs[vs.length - 1].seq, mode: 'paper' });
      weightsStale = true;
    }
  }

  // ---- validator: an independent re-run. It never promotes and never opens an order ----
  function runValidator() {
    const level = inp.validator?.level ?? 'L1', source = inp.validator?.source ?? 'same';
    const rerun = (strategy: string, panel: string, data: { first: number; last: number }, orig: { checks: any[]; metrics: any }, origHash: string, origVersion: string) => {
      const d = dsById.get(panel), s = reg.get(strategy); if (!d || !s) return null;
      const bars = d.bars.filter(b => b.t >= data.first && b.t <= data.last), res = evaluate(bars, s.def.build, costFor(cm, d.spec), g), rh = resultHash(res), version = versionOf(bars);
      const inputs: TrialInputs = { strategy: { id: strategy, fingerprint: s.fingerprint }, dataset: [{ id: panel, version }], gateVersion: gv, costModelVersion: cm.version, engineFingerprint: inp.engineFingerprint, seed: g.monkey.seed };
      const ag = agreement({ checks: orig.checks, metrics: orig.metrics }, digestOf(res), g.validator, { orig: origHash, re: rh });
      return { inputs, inputHash: inputHash(inputs), resultHash: rh, agrees: ag.agrees, exact: ag.exact, diffs: ag.diffs, sameVersion: version === origVersion };
    };
    for (const t of [...view.trials.values()].sort((a, b) => a.firstSeq - b.firstSeq)) {
      const r = t.result;
      if (r.status === 'passed_pending_validation' && !view.slots.has(slotKeyOf(r.strategy, r.panel)) && !t.validator.some(v => v.purpose === 'promotion' && v.resultOf === r.resultHash && v.level === level)) {
        const v = rerun(r.strategy, r.panel, r.data, r, r.resultHash, r.inputs.dataset[0].version); if (!v) { problems.push(`${r.strategy}@${r.panel}: cannot validate, strategy or data missing`); continue; }
        emit('validator_run', { trialKey: t.trialKey, purpose: 'promotion', level, source, resultOf: r.resultHash, ...v, runId: inp.runId, commit: inp.commit });
        if (v.sameVersion && !v.exact) { pullAndon = `validator: identical bars gave a different result for ${r.strategy} on ${r.panel}. That is a bug, not noise`; emit('halt', { level: 'andon', by: 'validator', reason: pullAndon }); }
      }
    }
    const month = monthOf(inp.now);
    for (const s of [...view.slots.values()]) {
      if (s.status === 'retired' || !usable(s)) continue; const t = view.trials.get(s.trialKey); if (!t) continue;
      const wantsGrad = s.lastGrad?.state === 'strict_pass' && !t.validator.some(v => v.purpose === 'graduation' && v.slotKey === s.slotKey && v.seq > s.lastGrad.seq);
      const wantsMonthly = !t.validator.some(v => v.purpose === 'monthly' && v.slotKey === s.slotKey && v.month === month);
      if (!wantsGrad && !wantsMonthly) continue;
      const v = rerun(s.strategy, s.dataset, s.lock.data, s.lock.digest, s.lock.resultHash, s.lock.inputs.dataset[0].version); if (!v) continue;
      emit('validator_run', { trialKey: s.trialKey, slotKey: s.slotKey, purpose: wantsGrad ? 'graduation' : 'monthly', month, level, source, resultOf: s.lock.resultHash, ...v, runId: inp.runId, commit: inp.commit });
      if (!v.agrees && s.status === 'paper') emit('slot_status', { slotKey: s.slotKey, from: 'paper', to: 'paused_data', reason: `re-validation no longer reproduces the locked result: ${v.diffs.join('; ')}`, numbers: {} });
      if (v.sameVersion && !v.exact) { pullAndon = `validator: identical bars gave a different result for locked slot ${s.slotKey}`; emit('halt', { level: 'andon', by: 'validator', reason: pullAndon }); }
    }
  }

  if (inp.mode === 'validator') runValidator(); else { stepPaper(); runFactory(); promote(); if (weightsStale || (view.lastWeights && view.lastWeights.month !== monthOf(inp.now) && [...view.slots.values()].some(s => s.status !== 'retired'))) recomputeWeights(weightsStale ? 'the set of primary slots changed' : 'first run of the month'); }

  // ---- close the run: book snapshot, run record, report ----
  const lastT = Math.max(0, ...inp.datasets.map(d => d.bars[d.bars.length - 1]?.t ?? 0)), marks: Record<string, number> = {};
  for (const d of inp.datasets) if (d.bars.length) marks[d.spec.symbol] = d.bars[d.bars.length - 1].c;
  const book = bookAt(view, lastT || inp.now, marks), openRisk = book.positions.reduce((s, p) => s + p.riskUsd, 0);
  if (inp.mode !== 'validator' && (view.slots.size > 0 || view.lastSnapshot))
    emit('book_snapshot', { at: lastT || inp.now, equity: book.equity, cash: view.cash, peak: book.peak, dayPnl: book.dayPnl, weekPnl: book.weekPnl, openRisk, cursors: view.cursors, mode: 'paper' });
  emit('run', { id: inp.runId, mode: inp.mode, commit: inp.commit, evaluated, errors, newTrials, skipped, waitingBudget, intents: runIntents.length, blocked: runBlocks.length, fills: runFills.length, problems }, actor);
  for (const a of appends) a.actor = a.actor ?? actor;

  const trials = [...view.trials.values()], byStatus: Record<string, number> = {};
  for (const t of trials) { const st = view.slots.has(slotKeyOf(t.result.strategy, t.result.panel)) ? 'in_paper' : t.result.status; byStatus[st] = (byStatus[st] ?? 0) + 1; }
  for (const t of trials) if (t.result.status === 'watch' || t.result.status === 'needs_data') { const failed = (t.result.checks as any[]).filter(c => !c.pass);
    queue.push({ id: `near-${t.trialKey.slice(0, 12)}`, kind: t.result.status === 'needs_data' ? 'data' : 'near_miss', title: `${t.result.strategy} on ${t.result.symbol} ${t.result.tf}: ${t.result.status === 'needs_data' ? 'needs more trades' : `one check short (${failed[0]?.name})`}`,
      why: t.result.why, source: 'factory', needs: t.result.status === 'needs_data' ? ['data:more-history-or-pooled-panel'] : [], cost: { trials: 1, aiUsd: 0 }, status: 'proposed', createdBy: 'autopilot' }); }
  const nearMisses = trials.filter(t => !view.slots.has(slotKeyOf(t.result.strategy, t.result.panel)) && !t.result.error)
    .sort((a, b) => b.result.checks.filter((c: any) => c.pass).length - a.result.checks.filter((c: any) => c.pass).length || b.result.metrics.sharpe - a.result.metrics.sharpe || (a.trialKey < b.trialKey ? -1 : 1)).slice(0, 10)
    .map(t => ({ strategy: t.result.strategy, symbol: t.result.symbol, tf: t.result.tf, status: t.result.status, passed: t.result.checks.filter((c: any) => c.pass).length, of: t.result.checks.length, trades: t.result.metrics.trades,
      ret: t.result.metrics.ret, hold: t.result.metrics.hold, sharpe: t.result.metrics.sharpe, holdSharpe: t.result.metrics.holdSharpe, dd: t.result.metrics.dd, failed: t.result.checks.filter((c: any) => !c.pass).map((c: any) => `${c.n} ${c.name}`) }));
  const haltsNow = [...(inp.halts.readable ? [] : ['halt state unreadable: treated as halted']), ...(inp.halts.kill ? ['kill switch is on'] : []), ...(inp.halts.andon ? ['andon cord is pulled'] : []), ...(view.drawdownPaused ? ['book drawdown pause: waits for Jeremy'] : [])];
  const waiting = [...pendingValidation.map(t => `${t.result.strategy} on ${t.result.symbol} ${t.result.tf} passed all seven checks and waits for the independent validator`),
    ...Object.entries(snap.pending).map(([k, v]) => `limit ${k}: looser value ${(v as any).value} requested, adopted 24 hours after it was first seen`), ...(view.drawdownPaused ? ['resume after the drawdown pause'] : [])];
  const report: ReportData = {
    at: inp.now, runId: inp.runId, mode: inp.mode, commit: inp.commit, gateVersion: gv, durable: inp.durable,
    status: { halts: haltsNow, dataProblems: inp.health.filter(h => h.status !== 'ok' || !h.tradable).map(h => `${h.dataset}: ${h.status}${h.tradable ? '' : ', not tradable'} (${h.checks.filter(c => c.status !== 'ok').map(c => c.id).join(', ')})`), waiting, problems },
    funnel: { pairs: pairsTotal, evaluated, errors, newTrials, n: trialsEver(view), m: slotsEver(view), byStatus, waitingBudget, skipped },
    book: { equity: book.equity, cash: view.cash, peak: book.peak, capital: inp.capital, dayPnl: book.dayPnl, weekPnl: book.weekPnl, drawdown: book.peak > 0 ? book.equity / book.peak - 1 : 0, openRisk, closedTrades: view.closed.length,
      positions: book.positions.map(p => ({ slotKey: p.slotKey, symbol: p.symbol, side: p.side, qty: p.qty, entry: p.entry, stop: p.stop, riskUsd: p.riskUsd })) },
    slots: [...view.slots.values()].map(s => { const rec = records.get(s.slotKey), gr = grads.get(s.slotKey); return { slotKey: s.slotKey, status: s.status, role: s.role, shadowOf: s.shadowOf, weight: s.weight, riskFraction: s.riskFraction, lockedAt: s.lockedAt,
      months: rec?.months ?? 0, trades: rec?.trades ?? 0, tradesNeeded: g.forward.minTrades, ret: rec?.ret ?? 0, dd: rec?.dd ?? 0, dsrM: gr?.dsrM ?? 0, dsrN: gr?.dsrN ?? 0, cusum: s.cusum, driftPauses: s.driftPauses, grad: gr?.state ?? 'too_early', clock: gr?.clock.note ?? 'locked this run; the forward record starts with the next bar',
      bookTrades: view.closed.filter(c => c.slotKey === s.slotKey).length }; }),
    intents: runIntents.map(i => ({ slotKey: i.slotKey, symbol: i.symbol, side: i.side, barT: i.barT, qty: i.qty, riskUsd: i.riskUsd, stop: i.stop })),
    blocks: runBlocks.map(b => ({ slotKey: b.slotKey, symbol: b.symbol, side: b.side, barT: b.barT, rules: b.rules.map((r: any) => r.id) })),
    fills: runFills.map(f => ({ slotKey: f.slotKey, kind: f.kind, t: f.t, price: f.price, qty: f.qty })),
    nearMisses, queue,
    data: inp.datasets.map(d => { const h = health.get(d.spec.id); return { dataset: d.spec.id, status: h?.status ?? 'blocked', tradable: h?.tradable ?? false, source: d.spec.source, second: h?.provenance.second ?? null, version: d.version.slice(0, 12), rows: d.bars.length, last: d.bars[d.bars.length - 1]?.t ?? 0, adj: d.spec.adj,
      warnings: (h?.checks ?? []).filter(c => c.status !== 'ok').map(c => `${c.id}: ${c.detail}`) }; }),
    costs: { version: cm.version.slice(0, 12), anyMeasured: inp.datasets.some(d => measured(cm, d.spec)), note: inp.datasets.some(d => measured(cm, d.spec)) ? 'some costs are measured from paper fills' : 'costs are assumed, not measured' },
    ledger: { added: appends.length, headSeqBefore: inp.entries.length ? inp.entries[inp.entries.length - 1].seq : 0, digest: hashOf(appends.map(a => [a.kind, a.payload])) },
  };
  return { appends, report, queue, pullAndon, view };
}
