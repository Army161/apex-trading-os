// Claim checker steps 4 to 7 (docs/design/05 s5, s6): choose data, count the tries, pre-register, run the same gate as every
// other trial, and give one of four verdicts. A pure function like runAutopilot: it reads a ledger and returns what to append.
// A claim check never promotes anything. A passing reading is an ordinary trial that still waits for the validator and for
// forward paper trading, and it counts toward N like any other try.
import { deflatedSharpe } from '@apex/engine/stats/deflated';
import { buildView, evaluate, gateVersion, hashOf, inputHash, normalise, passBar, resultHash, trialKey, trialsEver,
  type Append, type GateCheck, type GateConfig, type GateResult, type LedgerEntry, type LedgerKind, type TrialInputs, type TrialStatus } from '@apex/kernel';
import type { DataHealth, LoadedDataset } from '@apex/data/types';
import { costFor, type CostModel } from '@apex/autopilot/costs';
import type { Flag, Intake } from './intake';
import { EXTRACT_FAILED, type ClaimExtraction, type Extracted } from './extract';
import { mapInterpretation, type Runnable, type Tf } from './map';

export const VERDICTS = ['holds_up', 'near_miss', 'no_edge', 'untestable'] as const;
export type Verdict = typeof VERDICTS[number];
/** A reading must clear this deflated-Sharpe probability, deflated by the number of readings tested in the same check, to hold up. */
export const MIN_DSR_IN_CHECK = 0.5;

// Markets Apex has data for under another name. `exact` false means a stand-in: a different instrument that tracks the same thing.
const ALIASES: Record<string, { symbol: string; exact: boolean }> = Object.fromEntries(([
  ['SPY', true, 'SPY'], ['QQQ', true, 'QQQ'], ['IWM', true, 'IWM'], ['GLD', true, 'GLD'], ['USO', true, 'USO'],
  ['BTC', true, 'BTC BTCUSD BTCUSDT BITCOIN XBT XBTUSD'], ['EURUSD', true, 'EURUSD EURO EUR'],
  ['SPY', false, 'SPX SP500 S&P500 S&P ES MES US500 SPX500'], ['QQQ', false, 'NDX NASDAQ NASDAQ100 NQ MNQ US100 NAS100'], ['IWM', false, 'RUT RUSSELL RUSSELL2000 RTY M2K US2000'],
  ['GLD', false, 'GOLD XAUUSD XAU GC MGC'], ['USO', false, 'OIL CRUDE CRUDEOIL WTI CL MCL USOIL'],
] as [string, boolean, string][]).flatMap(([symbol, exact, names]) => names.split(' ').map(n => [n, { symbol, exact }])));
const DEFAULT_SYMBOL: Partial<Record<Tf, string[]>> = { '1d': ['QQQ', 'BTC'], '1h': ['SPY'], '4h': ['SPY'], '30m': ['SPY'] };
const normMarket = (m: string) => m.toUpperCase().replace(/\b(FUTURES?|INDEX|ETF|SPOT|PERP(ETUAL)?|CFD|E-?MINI|MICRO)\b/g, '').replace(/[^A-Z0-9&]/g, '');

export type DataChoice = { ok: true; dataset: LoadedDataset; proxy: string | null } | { ok: false; missing: string };
/** The claimed market on the claimed timeframe when Apex has it; otherwise the nearest stand-in, and the reader is told (05 s5). */
export function chooseData(markets: string[], tf: Tf, datasets: LoadedDataset[], health: Map<string, DataHealth>): DataChoice {
  const usable = datasets.filter(d => d.spec.tf === tf && (health.get(d.spec.id)?.status ?? 'blocked') !== 'blocked'), has = (sym: string) => usable.find(d => d.spec.symbol === sym);
  if (!usable.length) return { ok: false, missing: `healthy data on the ${tf} timeframe` };
  let standIn: { d: LoadedDataset; named: string } | null = null; const wrongTf: string[] = [];
  for (const m of markets) {
    const key = normMarket(m), a = ALIASES[key] ?? (has(key) ? { symbol: key, exact: true } : null); if (!a) continue;
    const d = has(a.symbol);
    if (d && a.exact) return { ok: true, dataset: d, proxy: null };
    if (d) standIn ??= { d, named: m }; else if (datasets.some(x => x.spec.symbol === a.symbol)) wrongTf.push(`${a.symbol} on ${tf}`);
  }
  if (standIn) return { ok: true, dataset: standIn.d, proxy: `The source trades ${standIn.named}. Apex has no data for that, so this ran on ${standIn.d.spec.symbol} ${tf} as the nearest stand-in.` };
  const d = (DEFAULT_SYMBOL[tf] ?? []).map(has).find(Boolean) ?? usable[0];
  return { ok: true, dataset: d, proxy: markets.length ? `The source trades ${markets.join(', ')}. Apex has no ${wrongTf.length ? `data for ${wrongTf.join(' or ')}` : 'data for that'}, so this ran on ${d.spec.symbol} ${tf} as the nearest stand-in.`
    : `The source names no market, so this ran on ${d.spec.symbol} ${tf}.` };
}

export type Tested = {
  ruleSet: number; label: string; strategyId: string; kind: Runnable['kind']; rules: Runnable['rules']; tf: Tf;
  data: { id: string; symbol: string; tf: string; first: number; last: number; rows: number; version: string }; proxy: string | null;
  trialKey: string; inputHash: string; resultHash: string; newTrial: boolean; recorded: boolean;
  status: TrialStatus; why: string; checks: GateCheck[]; metrics: GateResult['metrics']; readouts: GateResult['readouts'];
  dsrInCheck: number; notTested: string[];
};
export type Untested = { ruleSet: number; label: string; missing: string[] };
export type RuleSetResult = { index: number; name: string; verdict: Verdict; headline: string; best: number | null; tested: Tested[]; untested: Untested[] };
export type ClaimVsMeasured = { claim: string; claimed: string; measured: string };
export type ClaimResult = {
  id: string; status: 'done' | 'waiting_budget'; verdict: Verdict | null; headline: string;
  title: string; sourceKind: string; contentHash: string; chars: number;
  tries: { planned: number; fresh: number; leftThisWeek: number; everAfter: number };
  ruleSets: RuleSetResult[]; claims: ClaimVsMeasured[]; flags: Flag[]; extraction: ClaimExtraction | null;
  receipt: { gateVersion: string; costModelVersion: string; engineFingerprint: string; trialKeys: string[]; extractionHash: string | null };
};
export type CheckInput = {
  now: number; intake: Intake; extracted: Extracted; datasets: LoadedDataset[]; health: DataHealth[]; entries: LedgerEntry[];
  gate: GateConfig; costModel: CostModel; engineFingerprint: string; capital: number; trialsPerWeek: number;
};
export type CheckOutput = { result: ClaimResult; appends: Append[] };

/** Fixed wording (05 s6). Every sentence a verdict can open with is built here and nowhere else; test/claims.test.ts checks them all for banned words. */
export const HEADLINES = {
  holds_up: () => 'These rules passed every check on past data. That is not proof they will work. The next step is forward paper trading.',
  near_miss: (failed: string) => `Close, but not there. It failed: ${failed}.`,
  no_edge: (data: string) => `On ${data}, these rules did not beat random entries, costs and buy and hold.`,
  untestable: (missing: string[]) => `Apex could not test this as stated. Missing: ${missing.join('; ')}.`,
  waiting: (need: number, left: number) => `This check needs ${need} new ${need === 1 ? 'try' : 'tries'} and ${left} ${left === 1 ? 'is' : 'are'} left this week. Nothing was run.`,
};
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
export const dataLabel = (d: Tested['data']) => `${d.symbol} ${d.tf}, ${day(d.first)} to ${day(d.last)}`;
const RANK: Record<Verdict, number> = { holds_up: 3, near_miss: 2, no_edge: 1, untestable: 0 };

/** One reading's verdict and, for a near miss, what it failed. A stand-in market can never hold up. */
export function judge(t: Pick<Tested, 'status' | 'checks' | 'proxy' | 'dsrInCheck' | 'data'>, readings: number): { verdict: Verdict; failed?: string } {
  const failed = t.checks.filter(c => !c.pass);
  if (t.status === 'passed_pending_validation') {
    if (t.proxy) return { verdict: 'near_miss', failed: `the claimed market. It passed every check on ${t.data.symbol} ${t.data.tf}, which is a stand-in, not the market the source trades` };
    if (t.dsrInCheck < MIN_DSR_IN_CHECK) return { verdict: 'near_miss', failed: `the luck adjustment. After allowing for ${readings} ${readings === 1 ? 'reading' : 'readings'} tried in this check, the chance the result is more than luck is ${(t.dsrInCheck * 100).toFixed(0)}%, and 50% is needed` };
    return { verdict: 'holds_up' };
  }
  if (failed.length === 1) return { verdict: 'near_miss', failed: `check ${failed[0].n}, ${failed[0].name} (${failed[0].why})` };
  return { verdict: 'no_edge' };
}

const fmtNum = (x: number, d = 2) => (Number.isInteger(x) ? String(x) : x.toFixed(d));
/** Each figure the source states, next to what was measured for the same metric on the best reading (05 s6 item 2). */
export function claimedVsMeasured(x: ClaimExtraction, best: Tested | null): ClaimVsMeasured[] {
  if (!x.claims.length) return [{ claim: 'Results stated by the source', claimed: 'no figure given', measured: best ? `${pct(best.metrics.ret)} over ${best.metrics.trades} trades on ${dataLabel(best.data)}` : 'not measured' }];
  return x.claims.map(c => {
    const claimed = c.value === null ? 'no figure given' : `${fmtNum(c.value)}${c.unit ? (/^[%xR]$/.test(c.unit) ? c.unit : ` ${c.unit}`) : ''}${c.period ? ` (${c.period})` : ''}`;
    if (!best) return { claim: c.text, claimed, measured: 'not measured' };
    const m = best.metrics, on = `${m.trades} trades, ${dataLabel(best.data)}`;
    const measured = c.metric === 'return' ? `${pct(m.ret)} total (${on}); buy and hold ${pct(m.hold)}` : c.metric === 'win_rate' ? `${(m.winRate * 100).toFixed(0)}% (${on})` : c.metric === 'profit_factor' ? `${m.pf === null ? 'not defined' : m.pf.toFixed(2)} (${on})`
      : c.metric === 'drawdown' ? `${pct(m.dd)} worst drop (${on})` : c.metric === 'sharpe' ? `${m.sharpe.toFixed(2)} (${on}); buy and hold ${m.holdSharpe.toFixed(2)}` : `not a figure Apex measures (${on})`;
    return { claim: c.text, claimed, measured };
  });
}
export const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;

const WEEK = 7 * 864e5;
/** New automatic trials in the last week. Factory, research-queue and claim-check trials share one weekly budget. */
export const triesThisWeek = (preregs: Iterable<{ source: string; ts: number }>, now: number) => [...preregs].filter(p => (p.source === 'factory' || p.source.startsWith('queue:') || p.source.startsWith('claim:')) && p.ts > now - WEEK).length;

export function runClaimCheck(inp: CheckInput): CheckOutput {
  const g = inp.gate, gv = gateVersion(g), cm = inp.costModel, view = buildView(inp.entries, inp.capital), health = new Map(inp.health.map(h => [h.dataset, h]));
  const id = `chk_${inp.intake.hash.slice(0, 16)}`, appends: Append[] = [];
  const emit = (kind: LedgerKind, payload: object) => appends.push({ kind, actor: 'claim-checker', payload: normalise(payload) });
  const base = { id, title: 'Untitled source', sourceKind: inp.intake.kind, contentHash: inp.intake.hash, chars: inp.intake.chars };
  const receipt = (trialKeys: string[], x: ClaimExtraction | null) => ({ gateVersion: gv, costModelVersion: cm.version, engineFingerprint: inp.engineFingerprint, trialKeys, extractionHash: x ? hashOf(x) : null });
  const left = Math.max(0, inp.trialsPerWeek - triesThisWeek(view.preregs.values(), inp.now));
  const record = (r: ClaimResult) => { emit('claim_check', { id, contentHash: r.contentHash, sourceKind: r.sourceKind, chars: r.chars, verdict: r.verdict, extractionHash: r.receipt.extractionHash, gateVersion: gv, trialKeys: r.receipt.trialKeys,
    readings: r.ruleSets.flatMap(s => s.tested.map(t => ({ ruleSet: t.ruleSet, strategy: t.strategyId, panel: t.data.id, proxy: !!t.proxy, status: t.status, resultHash: t.resultHash, dsrInCheck: t.dsrInCheck }))),
    untested: r.ruleSets.reduce((a, s) => a + s.untested.length, 0), flags: [...new Set(r.flags.map(f => f.kind))].sort() }); return { result: r, appends }; };

  if (!inp.extracted.ok) {
    const missing = [inp.extracted.reason];
    return record({ ...base, status: 'done', verdict: 'untestable', headline: HEADLINES.untestable(missing), tries: { planned: 0, fresh: 0, leftThisWeek: left, everAfter: trialsEver(view) }, ruleSets: [], claims: [], flags: inp.intake.flags, extraction: null, receipt: receipt([], null) });
  }
  const x = inp.extracted.extraction, flags = dedupeFlags([...inp.intake.flags, ...x.flags]);
  // ---- plan: map every reading, choose its data, count the tries ----
  type Planned = { ruleSet: number; r: Runnable; d: LoadedDataset; proxy: string | null; key: string; inputs: TrialInputs; ih: string; fresh: boolean; judged: boolean };
  const planned: Planned[] = [], untested: Untested[] = [], seen = new Set<string>();
  for (const it of x.interpretations) {
    const m = mapInterpretation(x, it); if (!m.ok) { untested.push({ ruleSet: it.ruleSet, label: it.label, missing: m.missing }); continue; }
    const c = chooseData(x.ruleSets[it.ruleSet].market, m.runnable.tf, inp.datasets, health); if (!c.ok) { untested.push({ ruleSet: it.ruleSet, label: it.label, missing: [c.missing] }); continue; }
    const r = m.runnable, d = c.dataset, key = trialKey({ strategyId: r.id, fingerprint: r.fingerprint, panel: d.spec.id, tf: d.spec.tf, gateVersion: gv });
    if (seen.has(key)) { untested.push({ ruleSet: it.ruleSet, label: it.label, missing: ['a different reading: this one comes out as the same rules as another reading in this check'] }); continue; } seen.add(key);
    const inputs: TrialInputs = { strategy: { id: r.id, fingerprint: r.fingerprint }, dataset: [{ id: d.spec.id, version: d.version }], gateVersion: gv, costModelVersion: cm.version, engineFingerprint: inp.engineFingerprint, seed: g.monkey.seed };
    const ih = inputHash(inputs), t = view.trials.get(key);
    planned.push({ ruleSet: it.ruleSet, r, d, proxy: c.proxy, key, inputs, ih, fresh: !view.preregs.has(key), judged: !!t && t.result.inputHash === ih });
  }
  for (const [i, rs] of x.ruleSets.entries()) if (!x.interpretations.some(it => it.ruleSet === i)) untested.push({ ruleSet: i, label: rs.name, missing: ['a runnable reading of these rules'] });
  const fresh = planned.filter(p => p.fresh).length, tries = { planned: planned.length, fresh, leftThisWeek: left, everAfter: trialsEver(view) + fresh };
  if (fresh > left) return { appends: [], result: { ...base, title: x.title, status: 'waiting_budget', verdict: null, headline: HEADLINES.waiting(fresh, left), tries: { ...tries, everAfter: trialsEver(view) }, ruleSets: [], claims: [], flags, extraction: x, receipt: receipt([], x) } };

  // ---- pre-register every new reading before any of them is run, then run the gate ----
  if (planned.some(p => !p.judged) && !view.gateVersions.has(gv)) emit('gate_version', { version: gv, config: g, passBar: passBar(g) });
  planned.forEach((p, k) => { if (p.fresh) emit('prereg', { trialKey: p.key, hypothesis: `Claim check ${id}, reading ${k + 1} of ${planned.length}: these rules beat random entries, costs and buy and hold on ${p.d.spec.symbol} ${p.d.spec.tf}`, source: `claim:${id}`,
    strategy: { id: p.r.id, fingerprint: p.r.fingerprint }, panel: p.d.spec.id, tf: p.d.spec.tf, gateVersion: gv, passBar: passBar(g), plannedVariants: planned.length, rules: p.r.canonical, proxy: !!p.proxy }); });
  const tested: Tested[] = planned.map(p => {
    const res = evaluate(p.d.bars, p.r.build, costFor(cm, p.d.spec), g, tries.everAfter), rh = resultHash(res), b = p.d.bars;
    const data = { id: p.d.spec.id, symbol: p.d.spec.symbol, tf: p.d.spec.tf, first: b[0]?.t ?? 0, last: b[b.length - 1]?.t ?? 0, rows: b.length, version: p.d.version };
    if (!p.judged) emit('trial_result', { trialKey: p.key, gateVersion: gv, inputs: p.inputs, inputHash: p.ih, resultHash: rh, status: res.status, why: res.why, checks: res.checks, metrics: res.metrics, readouts: res.readouts,
      data: { first: data.first, last: data.last, rows: data.rows }, strategy: p.r.id, panel: p.d.spec.id, symbol: p.d.spec.symbol, tf: p.d.spec.tf, runId: id, ...(res.error ? { error: res.error } : {}) });
    return { ruleSet: p.ruleSet, label: p.r.label, strategyId: p.r.id, kind: p.r.kind, rules: p.r.rules, tf: p.r.tf, data, proxy: p.proxy, trialKey: p.key, inputHash: p.ih, resultHash: rh, newTrial: p.fresh, recorded: !p.judged,
      status: res.status, why: res.why, checks: res.checks, metrics: res.metrics, readouts: res.readouts, dsrInCheck: deflatedSharpe(res.daily.map(d => d[1]), Math.max(1, planned.length)).psr, notTested: p.r.notTested };
  });

  // ---- verdicts: one per rule set, and the best of them for the check ----
  const ruleSets: RuleSetResult[] = x.ruleSets.map((rs, index) => {
    const ts = tested.filter(t => t.ruleSet === index), us = untested.filter(u => u.ruleSet === index);
    if (!ts.length) { const missing = [...new Set(us.flatMap(u => u.missing))]; return { index, name: rs.name, verdict: 'untestable' as Verdict, headline: HEADLINES.untestable(missing.length ? missing : ['a runnable reading of these rules']), best: null, tested: ts, untested: us }; }
    const js = ts.map(t => judge(t, planned.length)), order = ts.map((_, i) => i).sort((a, b) => RANK[js[b].verdict] - RANK[js[a].verdict] || ts[b].checks.filter(c => c.pass).length - ts[a].checks.filter(c => c.pass).length || ts[b].metrics.ret - ts[a].metrics.ret);
    const bi = order[0], j = js[bi], headline = j.verdict === 'holds_up' ? HEADLINES.holds_up() : j.verdict === 'near_miss' ? HEADLINES.near_miss(j.failed!) : HEADLINES.no_edge(dataLabel(ts[bi].data));
    return { index, name: rs.name, verdict: j.verdict, headline, best: tested.indexOf(ts[bi]), tested: ts, untested: us };
  });
  const top = [...ruleSets].sort((a, b) => RANK[b.verdict] - RANK[a.verdict])[0];
  const verdict: Verdict = top?.verdict ?? 'untestable', headline = top?.headline ?? HEADLINES.untestable(['any trading rules. The source states none']);
  return record({ ...base, title: x.title, status: 'done', verdict, headline, tries, ruleSets, claims: claimedVsMeasured(x, top?.best != null ? tested[top.best] : null), flags, extraction: x, receipt: receipt(tested.map(t => t.trialKey), x) });
}

function dedupeFlags(fs: Flag[]): Flag[] { const seen = new Set<string>(); return fs.filter(f => { const k = f.kind; if (seen.has(k) && !f.evidence) return false; const kk = `${k}|${f.evidence?.offset ?? f.detail}`; if (seen.has(kk)) return false; seen.add(k); seen.add(kk); return true; }); }
export { EXTRACT_FAILED };
