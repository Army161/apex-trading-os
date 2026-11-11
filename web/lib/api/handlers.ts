// What each v1 route returns (docs/design/09). One handler for each route id in the contract; a test fails when the two lists
// differ. A handler is handed the ledger and its replayed view and calls the same query functions the screens use, so the API
// and the dashboard cannot disagree. Every performance figure leaves here as a Metric, and every time as RFC 3339.
//
// Nothing here imports the broker, the admin routes or the resume route. The two writes (a claim check and a halt) are passed
// in by the caller as `deps`, so this file cannot grow a third.
import { type Check, type ClaimCheckRow, type Evaluation, type Intent, type Metric, type Page, type ProblemCode, type Receipt, type ReportRow, type Responses, type RouteId, type Slot, type Trade } from '@apex/sdk/contract';
import { verifyChain, type LedgerEntry } from '@apex/kernel/ledger';
import type { ApexConfig } from '@apex/kernel/config';
import type { LedgerView } from '@apex/kernel/view';
import type { ShellStatus } from '../status';
import * as Q from '../queries';

export class ApiFail extends Error { constructor(public code: ProblemCode, public detail: string) { super(detail); } }
const fail = (code: ProblemCode, detail: string): never => { throw new ApiFail(code, detail); };

export type Deps = {
  readReport: (id: string) => Promise<string | null>;
  /** Run a claim check and record it. Returns the checker's own answer. */
  claimCheck: (req: { text: unknown; kind?: unknown; extraction?: unknown; run?: boolean }) => Promise<import('../claimrun').ClaimAnswer>;
  /** Pull the andon cord and record the halt in the ledger, once: a halt that is already recorded is not recorded again. */
  halt: (by: string, reason: string) => Promise<{ already: boolean; ledger: 'recorded' | 'already' | 'no_ledger' | 'failed' }>;
  remember: { get: (k: string) => Promise<string | null>; set: (k: string, v: string) => Promise<void> };
};
export type Ctx = { entries: LedgerEntry[]; view: LedgerView; cfg: ApexConfig; now: number; params: Record<string, string>; query: URLSearchParams; body: any; status: ShellStatus; actor: string; deps: Deps };
export type Out<T> = T | { markdown: string };

// ---- shapes ----
const iso = (ms: number) => new Date(Number.isFinite(ms) ? ms : 0).toISOString();
const isoOrNull = (ms: number | null | undefined) => (typeof ms === 'number' && Number.isFinite(ms) ? iso(ms) : null);
const side = (s: 1 | -1) => (s === -1 ? 'short' : 'long') as 'long' | 'short';
const metric = (value: number, unit: Metric['unit'], n: number, basis: Metric['basis'], receipt?: number, net = true): Metric => ({ value: Number.isFinite(value) ? value : 0, unit, n: Math.max(0, Math.trunc(n)), basis, net, ...(receipt ? { receipt } : {}) });
const receipt = (r: Q.ReceiptRow): Receipt => ({ seq: r.seq, kind: r.kind, ts: iso(r.ts), actor: r.actor, payloadHash: r.payloadHash, prevHash: r.prevHash, hash: r.hash });
const receiptOf = (e: LedgerEntry) => receipt(e as Q.ReceiptRow);

const evaluation = (r: Q.BoardRow): Evaluation => ({ trialKey: r.trialKey, strategy: r.strategy, symbol: r.symbol, tf: r.tf, panel: r.panel, status: r.status, slotKey: r.slotKey, checksPassed: r.passed, checks: r.checks as Check[], why: r.why, source: r.source,
  validated: r.validated, error: r.error, nTrials: r.nTrials,
  metrics: { ret: metric(r.ret, 'pct', r.trades, 'in_sample', r.seq), sharpe: metric(r.sharpe, 'ratio', r.trades, 'in_sample', r.seq), maxDrawdown: metric(r.dd, 'pct', r.trades, 'in_sample', r.seq), dsr: r.dsr === null ? null : metric(r.dsr, 'prob', r.trades, 'in_sample', r.seq) }, receipt: r.seq });
const slot = (s: Q.SlotRow): Slot => ({ slotKey: s.slotKey, trialKey: s.trialKey, strategy: s.strategy, symbol: s.symbol, tf: s.tf, status: s.status, role: s.role, shadowOf: s.shadowOf, weight: s.weight, riskFraction: s.riskFraction,
  lockedAt: iso(s.lockedAt), lockSeq: s.lockSeq, forwardTrades: s.forwardTrades, drift: { cusum: s.cusum, pauses: s.driftPauses }, graduation: { state: s.gradState, month: s.gradMonth } });
const trade = (t: Q.Trade): Trade => ({ slotKey: t.slotKey, symbol: t.symbol, side: side(t.side), entryAt: iso(t.entryT), exitAt: iso(t.exitT), entry: t.entry, exit: t.exit, qty: t.qty, pnl: t.pnl, r: t.r, reason: String(t.reason ?? '') });
const intent = (i: Q.IntentRow): Intent => ({ seq: i.seq, ts: iso(i.ts), ok: i.ok, id: i.id, slotKey: i.slotKey, symbol: i.symbol, side: side(i.side), barAt: iso(i.barT), qty: i.qty, riskUsd: i.riskUsd, rules: i.rules, note: i.note });
const position = (p: { slotKey: string; symbol: string; side: 1 | -1; qty: number; entry: number; stop: number; riskUsd: number; riskPct: number; entryT: number }) =>
  ({ slotKey: p.slotKey, symbol: p.symbol, side: side(p.side), qty: p.qty, entry: p.entry, stop: p.stop, riskUsd: p.riskUsd, riskPct: p.riskPct, since: iso(p.entryT) });
const report = (r: Q.RunRow): ReportRow => ({ id: r.id, receipt: r.seq, ts: iso(r.ts), mode: r.mode, evaluated: r.evaluated, newTrials: r.newTrials, intents: r.intents, blocked: r.blocked, fills: r.fills, errors: r.errors, waitingBudget: r.waitingBudget, problems: r.problems });
const claimRow = (c: Q.ClaimRow): ClaimCheckRow => ({ id: c.id, status: 'done', verdict: c.verdict, ts: iso(c.ts), sourceKind: c.sourceKind, chars: c.chars, readings: c.readings, untested: c.untested, flags: c.flags, contentHash: c.contentHash, receipt: c.seq });

// ---- paging and query values ----
const int = (q: URLSearchParams, name: string, d: number, min: number, max: number) => { const raw = q.get(name); if (raw === null || raw === '') return d;
  const n = Number(raw); return Number.isInteger(n) && n >= min && n <= max ? n : fail('validation', `${name} must be a whole number from ${min} to ${max}.`); };
const when = (q: URLSearchParams, name: string) => { const raw = q.get(name); if (!raw) return null; const t = Date.parse(raw); return Number.isFinite(t) ? t : fail('validation', `${name} must be an RFC 3339 time.`); };
/** A page of a list that is already in order. The cursor is the offset of the next row, and is checked like any other input. */
function page<T, U>(q: URLSearchParams, rows: T[], shape: (r: T) => U): Page<U> {
  const limit = int(q, 'limit', 50, 1, 200), c = q.get('cursor'), m = c ? /^o(\d{1,9})$/.exec(c) : null; if (c && !m) fail('validation', 'cursor is not one this API gave out.');
  const at = m ? Number(m[1]) : 0;
  return { items: rows.slice(at, at + limit).map(shape), next: at + limit < rows.length ? `o${at + limit}` : null };
}
const need = <T>(x: T | null | undefined, what: string): T => x ?? fail('not_found', `There is no ${what} with that id.`);
const halted = (s: ShellStatus) => s.halted;

export const HANDLERS: { [K in RouteId]: (c: Ctx) => Out<Responses[K]> | Promise<Out<Responses[K]>> } = {
  status: ({ status: s }) => ({ mode: s.mode, halted: s.halted, halts: s.halts.map(h => ({ level: h.level, by: h.by, reason: h.reason, ts: isoOrNull(h.ts), from: h.from })), ledger: s.ledger, entries: s.entries, trials: s.trials, slots: s.slots,
    data: s.data, dataBlocked: s.dataBlocked, dataStale: s.dataStale, lastRun: s.lastRun ? { id: s.lastRun.id, mode: s.lastRun.mode, ts: iso(s.lastRun.ts) } : null, aiEnabled: s.aiEnabled, at: iso(s.at) }),
  funnel: c => Q.funnelOf(c.view),
  board: c => page(c.query, Q.board(c.view, { status: c.query.get('status') ?? undefined, market: c.query.get('market') ?? undefined, tf: c.query.get('tf') ?? undefined, q: c.query.get('q') ?? undefined }).rows, evaluation),
  pair: c => { const p = need(Q.pair(c.view, c.entries, c.params.trialKey), 'evaluation'), r = p.row, bars = p.data?.rows ?? 0;
    return { ...evaluation(r), hypothesis: p.hypothesis, passBar: p.passBar, preregSeq: p.preregSeq, validator: p.validator, receiptEntry: p.receipt ? receipt(p.receipt) : null, tStat: p.tStat, inputs: p.inputs,
      // Buy and hold over the same bars. Its sample is the bars, and no costs are taken off it.
      benchmark: r.error ? null : { bars, ret: metric(r.hold, 'pct', bars, 'in_sample', r.seq, false), sharpe: metric(r.holdSharpe, 'ratio', bars, 'in_sample', r.seq, false), maxDrawdown: metric(r.holdDd, 'pct', bars, 'in_sample', r.seq, false) },
      data: p.data ? { first: iso(p.data.first), last: iso(p.data.last), rows: p.data.rows } : null }; },
  slots: c => page(c.query, Q.slots(c.view), slot),
  slot: c => { const d = need(Q.slotDetail(c.view, c.entries, c.params.key, c.now), 'slot'), k = d.clock, f = d.forward;
    return { ...slot(d.slot), fingerprint: d.fingerprint, lock: d.lock ? receipt(d.lock) : null, locks: d.locks,
      clock: { months: k.months, trades: k.trades, dsr: k.dsr === null ? null : metric(k.dsr, 'prob', k.trades, 'forward'), slotsEverLocked: k.m, state: k.state, fails: k.fails, note: k.note, earliestMonth: k.earliestMonth, needMonths: k.needMonths, needTrades: k.needTrades, needDsr: k.needDsr, checkedMonth: k.checkedMonth },
      forward: { trades: f.n, wins: f.wins, pnl: metric(f.pnl, 'usd', f.n, 'forward'), avgR: f.avgR === null ? null : metric(f.avgR, 'ratio', f.n, 'forward') },
      position: d.position ? position({ ...d.position, slotKey: d.slot.slotKey, symbol: d.slot.symbol, riskPct: Q.book(c.view, c.entries, c.cfg.limits, c.now).positions.find(p => p.slotKey === d.slot.slotKey)?.riskPct ?? 0 }) : null,
      inSample: d.inSample ? evaluation(d.inSample) : null, shadows: d.shadows.map(s => s.slotKey) }; },
  slotTrades: c => page(c.query, need(Q.slotDetail(c.view, c.entries, c.params.key, c.now), 'slot').forward.trades, trade),
  slotEvents: c => page(c.query, need(Q.slotDetail(c.view, c.entries, c.params.key, c.now), 'slot').events, e => ({ seq: e.seq, ts: iso(e.ts), from: e.from, to: e.to, why: e.why })),
  slotDrift: c => { const d = need(Q.slotDetail(c.view, c.entries, c.params.key, c.now), 'slot'), threshold = Q.risk(c.view, c.entries, c.cfg.limits, c.now).drift.find(x => x.slotKey === d.slot.slotKey)?.threshold ?? d.drift?.threshold ?? 0;
    return page(c.query, c.entries.filter(e => e.kind === 'drift_reading' && e.payload?.slotKey === d.slot.slotKey).reverse(), e => ({ seq: e.seq, ts: iso(e.ts), n: Math.trunc(Number(e.payload.n) || 0), s: Number(e.payload.s) || 0, alarms: Array.isArray(e.payload.alarms) ? e.payload.alarms.map(String) : [], threshold })); },
  locks: c => { const d = need(Q.slotDetail(c.view, c.entries, c.params.slotKey, c.now), 'slot'); return { slotKey: d.slot.slotKey, allowed: d.locks.every(l => l.open), locks: d.locks }; },
  book: c => { const s = Q.book(c.view, c.entries, c.cfg.limits, c.now).summary, n = s.closed, m = (v: number, u: Metric['unit']) => metric(v, u, n, 'book'), used = (loss: number) => Math.max(0, -loss);
    return { capital: s.capital, equity: m(s.equity, 'usd'), change: m(s.capital > 0 ? s.equity / s.capital - 1 : 0, 'pct'), drawdown: m(s.drawdown, 'pct'), day: m(s.dayPnl, 'usd'), week: m(s.weekPnl, 'usd'), peak: s.peak, cash: s.cash, openPositions: s.open, closedTrades: s.closed,
      limits: s.limits, lossUsed: { day: used(s.dayLossPct), week: used(s.weekLossPct), fromPeak: used(s.drawdown) }, drawdownPaused: s.drawdownPaused, since: isoOrNull(s.since), lastMark: isoOrNull(s.lastMark), costs: s.costs }; },
  positions: c => page(c.query, Q.book(c.view, c.entries, c.cfg.limits, c.now).positions, position),
  fills: c => page(c.query, c.entries.filter(e => e.kind === 'fill').reverse(), e => ({ seq: e.seq, ts: iso(e.ts), intent: String(e.payload.intent ?? ''), slotKey: String(e.payload.slotKey ?? ''), kind: String(e.payload.kind ?? ''), at: iso(Number(e.payload.t)), price: Number(e.payload.price) || 0, qty: Number(e.payload.qty) || 0 })),
  intents: c => { const ok = c.query.get('ok'); if (ok !== null && ok !== 'true' && ok !== 'false') fail('validation', 'ok must be true or false.');
    return page(c.query, Q.intents(c.entries, { limit: 5000 }).filter(i => ok === null || i.ok === (ok === 'true')), intent); },
  risk: c => { const r = Q.risk(c.view, c.entries, c.cfg.limits, c.now);
    return { limits: r.limits.map(l => ({ key: l.key, inForce: l.inForce, requested: l.requested, default: l.def, ceiling: Number.isFinite(l.ceiling) ? l.ceiling : null, pending: l.pending ? { value: l.pending.value, since: iso(l.pending.since), effective: iso(l.pending.effective) } : null })),
      halts: r.halts.map(h => ({ level: h.level, by: h.by, reason: h.reason, ts: iso(h.ts) })), drawdownPaused: r.drawdownPaused, openRiskPct: r.openRiskPct, exposure: r.exposure, drift: r.drift }; },
  queue: c => { const q = Q.queue(c.view, c.entries, c.cfg.trialsPerWeek, c.now); return { used: q.used, budget: q.budget, waiting: q.waiting, items: q.items.map(({ firstTs, ...i }) => ({ ...i, first: iso(firstTs) })) }; },
  dataHealth: c => page(c.query, Q.dataHealth(c.view, c.entries), ({ seq, first, last, ...d }) => ({ ...d, rows: Math.trunc(d.rows), first: iso(first), last: iso(last), receipt: seq })),
  costs: c => { const e = [...c.entries].reverse().find(x => x.kind === 'cost_model'); return e ? { version: String(e.payload.version ?? ''), receipt: e.seq, rows: Array.isArray(e.payload.rows) ? e.payload.rows : [] } : null; },
  reports: c => page(c.query, Q.runs(c.entries), report),
  report: async c => { const r = need(Q.runs(c.entries).find(x => x.id === c.params.id), 'report'), fmt = c.query.get('format') ?? 'json'; if (fmt !== 'json' && fmt !== 'md') fail('validation', 'format must be json or md.');
    const markdown = await c.deps.readReport(r.id); if (fmt === 'md') return { markdown: need(markdown, 'kept report text') };
    return { ...report(r), markdown }; },
  ledger: c => { const kind = c.query.get('kind'), slotKey = c.query.get('slot'), from = when(c.query, 'from'), to = when(c.query, 'to');
    const rows = c.entries.filter(e => (!kind || e.kind === kind) && (!slotKey || e.payload?.slotKey === slotKey) && (from === null || e.ts >= from) && (to === null || e.ts <= to)).reverse();
    return page(c.query, rows, e => ({ ...receiptOf(e), summary: Q.summarise(e), slotKey: typeof e.payload?.slotKey === 'string' ? e.payload.slotKey : null })); },
  ledgerHead: c => { const last = c.entries[c.entries.length - 1], a = [...c.entries].reverse().find(e => e.kind === 'anchor'); if (!last) return { seq: 0, hash: null, anchor: null };
    return { seq: last.seq, hash: last.hash, anchor: a ? { seq: Number(a.payload.seq), hash: String(a.payload.hash), at: iso(a.ts) } : null }; },
  ledgerVerify: c => { const head = c.entries.length ? c.entries[c.entries.length - 1].seq : 0, MAX = 5000, from = int(c.query, 'from', 1, 1, 1e9), to = int(c.query, 'to', Math.min(head, from + MAX - 1), 1, 1e9);
    if (to < from) fail('validation', 'to must not be before from.'); if (to - from + 1 > MAX) fail('validation', `At most ${MAX} entries a call.`);
    // Entries are stored in sequence order starting at 1, so a range is a slice. The entry before the range anchors its first prevHash.
    const range = c.entries.filter(e => e.seq >= from && e.seq <= to), before = c.entries.find(e => e.seq === from - 1) ?? null;
    if (from > 1 && !before) fail('not_found', 'There is no entry before that range to check it against.');
    const v = verifyChain(range, before ? { seq: before.seq, hash: before.hash } : null);
    return { ok: v.ok && range.length > 0, from, to: Math.min(to, head), checked: range.length, badSeq: v.badSeq ?? null, why: range.length ? v.why ?? null : 'There are no entries in that range.' }; },
  ledgerEntry: c => { const seq = Number(c.params.seq); if (!Number.isInteger(seq) || seq < 1) fail('validation', 'The sequence number must be a whole number from 1.');
    const e = need(Q.ledgerEntry(c.entries, seq), 'ledger entry'); return { ...receipt(e.receipt), summary: e.summary, payload: e.payload, prev: e.prev, next: e.next }; },
  claimChecks: c => page(c.query, Q.claimChecks(c.entries), claimRow),
  claimCheck: c => { const d = need(Q.claimDetail(c.view, c.entries, c.params.id), 'claim check'), keys = c.entries.find(e => e.seq === d.receipt.seq)?.payload?.trialKeys;
    return { ...claimRow(d.check), receiptEntry: receipt(d.receipt), trialsUsed: Array.isArray(keys) ? new Set(keys).size : 0,
      interpretations: d.readings.map(r => ({ ruleSet: r.ruleSet, strategy: r.strategy, panel: r.panel, proxy: r.proxy, status: r.status, dsrInCheck: r.dsrInCheck === null ? null : metric(r.dsrInCheck, 'prob', r.row?.trades ?? 0, 'in_sample', r.row?.seq),
        hypothesis: r.hypothesis, rules: r.rules, evaluation: r.row ? evaluation(r.row) : null })) }; },
  claimCheckStart: async c => {
    if (halted(c.status)) fail('halted', 'Apex is halted, so no new check is started. Reads still work.');
    const idem = typeof c.body.idempotencyKey === 'string' && c.body.idempotencyKey ? `idem:${c.actor}:${c.body.idempotencyKey}` : null, seen = idem ? await c.deps.remember.get(idem) : null;
    if (seen) { const d = Q.claimDetail(c.view, c.entries, seen); if (d) return { id: seen, status: 'done', verdict: d.check.verdict, headline: 'This check was already run with that idempotency key. Nothing was run again.', trialsUsed: 0, receipt: d.receipt.seq, repeated: true }; }
    const req = { text: c.body.text, kind: c.body.kind ?? 'transcript' }; let extraction = c.body.extraction;
    const bad = (a: { status: number; error: string }): never => fail(a.status === 422 ? 'validation' : a.status === 409 ? 'busy' : 'unavailable', a.error);
    if (extraction === undefined) { const plan = await c.deps.claimCheck({ ...req, run: false }); if (!plan.ok) return bad(plan);
      if (plan.step !== 'plan' || !plan.extraction) return fail('validation', `The rules could not be read from the source: ${plan.step === 'plan' ? plan.extractionErrors.slice(0, 3).join('; ') : 'no extraction'}`);
      extraction = plan.extraction; }
    const ran = await c.deps.claimCheck({ ...req, extraction, run: true }); if (!ran.ok) return bad(ran); if (ran.step !== 'run') return fail('unavailable', 'The check did not run.');
    const r = ran.result; if (r.status === 'waiting_budget') fail('budget', r.headline);
    if (idem) await c.deps.remember.set(idem, r.id);
    return { id: r.id, status: 'done', verdict: r.verdict, headline: r.headline, trialsUsed: r.tries.fresh, receipt: ran.seq, repeated: false }; },
  halt: async c => { const h = await c.deps.halt(c.actor, String(c.body.reason).slice(0, 300)); return { halted: true, already: h.already, ledger: h.ledger }; },
};
