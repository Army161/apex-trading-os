// Ledger view: the state of the system, rebuilt by replaying ledger entries in order. Nothing here is stored anywhere else,
// so trials, slots, positions and the book cannot be lost, reset or quietly edited (S10; docs/design/04 s17 "counted from the ledger").
import type { LedgerEntry, LedgerKind } from './ledger';
import type { LimitsSnapshot, AssetClass, Side, OpenPosition, BookView } from './guard';
import { STAGES } from './locks';

const DAY = 864e5;
export type Baseline = { n: number; mu: number; sigma: number; p: number; ddR95: number };
export type SlotState = {
  slotKey: string; trialKey: string; strategy: string; dataset: string; symbol: string; tf: string; assetClass: AssetClass;
  lockedAt: number; lockSeq: number; inputHash: string; gateVersion: string; role: 'primary' | 'shadow'; shadowOf: string | null; status: string;
  baseline: Baseline; weight: number; riskFraction: number; cusum: number; driftPauses: number; lastStopT: number | null; lastGradMonth: string | null;
  lastGrad: any | null; lastDrift: any | null; fingerprint: string; costBucket: string; lock: any;
};
export type PositionState = OpenPosition & { intent: string; stop0: number; target: number | null; entryT: number; entryFee: number };
export type ClosedTrade = { slotKey: string; symbol: string; side: Side; entryT: number; exitT: number; entry: number; exit: number; qty: number; pnl: number; r: number; reason: string };
/** Live book (docs/design/02 s6). Built only from live_fill entries and kept apart from the paper book: a live fill never moves paper cash, equity, cursors or positions. */
export const LIVE_FILL_KINDS = ['entry', 'stop', 'target', 'trail', 'time', 'signal', 'exit'] as const;
export const LIVE_STAGE_IDS = STAGES.map(x => x.id);
export type LiveFill = { intent: string; slotKey: string; symbol: string; side: Side; kind: typeof LIVE_FILL_KINDS[number]; t: number; price: number; qty: number; fee: number; brokerOrderId: string; stage: typeof STAGES[number]['id'] };
export type LivePosition = { slotKey: string; intent: string; symbol: string; side: Side; qty: number; entry: number; entryT: number; fees: number; stage: string };
export type LiveTrade = { slotKey: string; symbol: string; side: Side; entryT: number; exitT: number; entry: number; exit: number; qty: number; pnl: number; reason: string; stage: string };
/** `unmatched` counts fills that did not fit the live book (an exit with no position, a fill against the other side). Anything above zero needs reconciling. */
export type LiveBook = { positions: Map<string, LivePosition>; closed: LiveTrade[]; fills: number; unmatched: number };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:|@\/-]{0,199}$/, BROKER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const pos = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0;
/** Every way a live fill can be malformed. Empty means it may be recorded. */
export function liveFillProblems(p: any): string[] {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['not an object'];
  const out: string[] = [];
  for (const k of ['intent', 'slotKey', 'symbol'] as const) if (typeof p[k] !== 'string' || !ID.test(p[k])) out.push(`${k} must be a plain id`);
  if (p.side !== 1 && p.side !== -1) out.push('side must be 1 or -1');
  if (!(LIVE_FILL_KINDS as readonly string[]).includes(p.kind)) out.push(`kind must be one of ${LIVE_FILL_KINDS.join(', ')}`);
  if (!Number.isSafeInteger(p.t) || p.t <= 0) out.push('t must be integer milliseconds');
  if (!pos(p.price)) out.push('price must be a positive number'); if (!pos(p.qty)) out.push('qty must be a positive number');
  if (typeof p.fee !== 'number' || !Number.isFinite(p.fee) || p.fee < 0) out.push('fee must be zero or more');
  if (typeof p.brokerOrderId !== 'string' || !BROKER_ID.test(p.brokerOrderId)) out.push('brokerOrderId must be a plain id');
  if (!(LIVE_STAGE_IDS as readonly string[]).includes(p.stage)) out.push(`stage must be one of ${LIVE_STAGE_IDS.join(', ')}`);
  return out;
}

function applyLiveFill(b: LiveBook, p: LiveFill) {
  if (liveFillProblems(p).length) { b.unmatched++; return; }
  b.fills++;
  const cur = b.positions.get(p.slotKey);
  if (p.kind === 'entry') {
    if (!cur) { b.positions.set(p.slotKey, { slotKey: p.slotKey, intent: p.intent, symbol: p.symbol, side: p.side, qty: p.qty, entry: p.price, entryT: p.t, fees: p.fee, stage: p.stage }); return; }
    if (cur.side !== p.side || cur.symbol !== p.symbol) { b.unmatched++; return; }
    const qty = cur.qty + p.qty; cur.entry = (cur.entry * cur.qty + p.price * p.qty) / qty; cur.qty = qty; cur.fees += p.fee; return;
  }
  if (!cur || cur.side !== p.side || cur.symbol !== p.symbol) { b.unmatched++; return; }
  const q = Math.min(p.qty, cur.qty), share = cur.fees * (q / cur.qty), gross = (p.price - cur.entry) * q * cur.side;
  b.closed.push({ slotKey: p.slotKey, symbol: cur.symbol, side: cur.side, entryT: cur.entryT, exitT: p.t, entry: cur.entry, exit: p.price, qty: q, pnl: gross - p.fee - share, reason: p.kind, stage: p.stage });
  if (p.qty > cur.qty + 1e-9) b.unmatched++;                                       // sold more than the book held
  cur.qty -= q; cur.fees -= share; if (cur.qty <= 1e-12) b.positions.delete(p.slotKey);
}

export type TrialState = { trialKey: string; firstSeq: number; lastSeq: number; prereg: any; result: any; validator: (any & { seq: number })[] };
export type LedgerView = {
  capital: number; headSeq: number;
  gateVersions: Set<string>; dataVersions: Map<string, any>; skipped: Set<string>;
  preregs: Map<string, any & { seq: number; ts: number }>; trials: Map<string, TrialState>;
  slots: Map<string, SlotState>; positions: Map<string, PositionState>; pending: Map<string, any>; closed: ClosedTrade[]; intentIds: Set<string>;
  cash: number; peak: number; cursors: Record<string, number>; drawdownPaused: boolean; halts: { level: string; by: string; reason: string; ts: number }[];
  limits: LimitsSnapshot | null; lastSnapshot: any | null; lastWeights: any | null; lastConfig: any | null; counts: Partial<Record<LedgerKind, number>>;
  live: LiveBook;
};

export const emptyView = (capital: number): LedgerView => ({ capital, headSeq: 0, gateVersions: new Set(), dataVersions: new Map(), skipped: new Set(), preregs: new Map(), trials: new Map(),
  slots: new Map(), positions: new Map(), pending: new Map(), closed: [], intentIds: new Set(), cash: capital, peak: capital, cursors: {}, drawdownPaused: false, halts: [],
  limits: null, lastSnapshot: null, lastWeights: null, lastConfig: null, counts: {}, live: { positions: new Map(), closed: [], fills: 0, unmatched: 0 } });

/** Apply one entry. Used for replay and by the pipeline to keep its working state in step with what it is about to append. */
export function applyEntry(v: LedgerView, e: { kind: LedgerKind; payload: any; seq: number; ts: number }): LedgerView {
  const p = e.payload; v.headSeq = Math.max(v.headSeq, e.seq); v.counts[e.kind] = (v.counts[e.kind] ?? 0) + 1;
  switch (e.kind) {
    case 'gate_version': v.gateVersions.add(p.version); break;
    case 'config_snapshot': v.limits = { limits: p.limits, pending: p.pending ?? {} }; v.lastConfig = p; break;
    case 'data_version': v.dataVersions.set(p.dataset, p); break;
    case 'skipped_data': v.skipped.add(`${p.dataset}|${p.version ?? ''}|${p.strategy ?? ''}`); break;
    case 'prereg': v.preregs.set(p.trialKey, { ...p, seq: e.seq, ts: e.ts }); break;
    case 'trial_result': {
      const t = v.trials.get(p.trialKey);
      if (t) { t.result = p; t.lastSeq = e.seq; } else v.trials.set(p.trialKey, { trialKey: p.trialKey, firstSeq: e.seq, lastSeq: e.seq, prereg: v.preregs.get(p.trialKey), result: p, validator: [] });
      break;
    }
    case 'validator_run': v.trials.get(p.trialKey)?.validator.push({ ...p, seq: e.seq }); break;
    case 'slot_locked':
      v.slots.set(p.slotKey, { slotKey: p.slotKey, trialKey: p.trialKey, strategy: p.strategy, dataset: p.dataset, symbol: p.symbol, tf: p.tf, assetClass: p.assetClass, lockedAt: p.lockedAt, lockSeq: e.seq,
        inputHash: p.inputHash, gateVersion: p.gateVersion, role: p.role, shadowOf: p.shadowOf ?? null, status: 'paper', baseline: p.baseline, weight: 0, riskFraction: 0, cusum: 0, driftPauses: 0,
        lastStopT: null, lastGradMonth: null, lastGrad: null, lastDrift: null, fingerprint: p.inputs?.strategy?.fingerprint ?? '', costBucket: p.costBucket ?? 'liquid', lock: p });
      break;
    case 'slot_status': {
      const s = v.slots.get(p.slotKey); if (!s) break;
      s.status = p.to; if (p.role) { s.role = p.role; s.shadowOf = p.shadowOf ?? null; }
      if (p.to === 'paused_drift') s.driftPauses++;
      if (p.from === 'paused_drift' && p.to === 'paper') s.cusum = 0;
      break;
    }
    case 'weights': v.lastWeights = p; for (const s of v.slots.values()) { s.weight = p.weights[s.slotKey] ?? 0; s.riskFraction = p.riskFractions?.[s.slotKey] ?? 0; } break;
    case 'intent': v.intentIds.add(p.id); v.pending.set(p.slotKey, p); break;
    case 'intent_blocked': v.intentIds.add(p.id); break;
    case 'fill': {
      if (p.kind === 'cancelled') { v.pending.delete(p.slotKey); break; }
      if (p.kind === 'entry') {
        const i = v.pending.get(p.slotKey); v.pending.delete(p.slotKey); v.cash -= p.fee ?? 0;
        v.positions.set(p.slotKey, { slotKey: p.slotKey, intent: p.intent, symbol: p.symbol, assetClass: p.assetClass, side: p.side, qty: p.qty, entry: p.price, stop: p.stop, stop0: p.stop,
          target: p.target ?? null, entryT: p.t, entryFee: p.fee ?? 0, riskUsd: Math.abs(p.price - p.stop) * p.qty });
        void i; break;
      }
      const pos = v.positions.get(p.slotKey); if (!pos) break;
      const gross = (p.price - pos.entry) * pos.qty * pos.side; v.cash += gross - (p.fee ?? 0); v.positions.delete(p.slotKey);
      const pnl = gross - (p.fee ?? 0) - pos.entryFee, risk = Math.abs(pos.entry - pos.stop0) * pos.qty;
      v.closed.push({ slotKey: p.slotKey, symbol: pos.symbol, side: pos.side, entryT: pos.entryT, exitT: p.t, entry: pos.entry, exit: p.price, qty: pos.qty, pnl, r: risk > 0 ? pnl / risk : 0, reason: p.kind });
      const s = v.slots.get(p.slotKey); if (s && (p.kind === 'stop' || p.kind === 'trail')) s.lastStopT = p.t;
      v.peak = Math.max(v.peak, v.cash);
      break;
    }
    case 'live_fill': applyLiveFill(v.live, p); break;                    // the live book only: never cash, peak, cursors or paper positions
    case 'book_snapshot': v.lastSnapshot = p; v.cursors = { ...p.cursors }; v.peak = Math.max(v.peak, p.peak ?? 0, p.equity ?? 0); break;
    case 'drift_reading': { const s = v.slots.get(p.slotKey); if (s) { s.cusum = p.s; s.lastDrift = p; } break; }
    case 'graduation_check': { const s = v.slots.get(p.slotKey); if (s) { s.lastGradMonth = p.month ?? null; s.lastGrad = { ...p, seq: e.seq }; } break; }
    case 'halt': v.halts.push({ level: p.level, by: p.by, reason: p.reason, ts: e.ts }); if (p.level === 'book-drawdown') v.drawdownPaused = true; break;
    case 'resume': v.halts = v.halts.filter(h => h.level !== p.level); if (p.level === 'book-drawdown') { v.drawdownPaused = false; v.peak = v.cash; } break;
    default: break;
  }
  return v;
}
export function buildView(entries: LedgerEntry[], capital: number): LedgerView { const v = emptyView(capital); for (const e of entries) applyEntry(v, e); return v; }

/** N: distinct trials ever tested. Only goes up. */
export const trialsEver = (v: LedgerView) => v.trials.size;
/** M: slots ever locked into the incubator, including retired and shadow slots. */
export const slotsEver = (v: LedgerView) => v.slots.size;

const isoWeek = (t: number) => Math.floor((t / DAY + 3) / 7);        // weeks start on Monday (1 Jan 1970 was a Thursday)
/** The book as the guard sees it at time `at`, with open positions marked at `marks` (symbol -> last close). */
export function bookAt(v: LedgerView, at: number, marks: Record<string, number> = {}): BookView {
  const day = Math.floor(at / DAY), week = isoWeek(at); let dayPnl = 0, weekPnl = 0;
  for (const c of v.closed) { if (Math.floor(c.exitT / DAY) === day) dayPnl += c.pnl; if (isoWeek(c.exitT) === week) weekPnl += c.pnl; }
  const positions = [...v.positions.values()];
  const unreal = positions.reduce((s, p) => s + ((marks[p.symbol] ?? p.entry) - p.entry) * p.qty * p.side, 0), equity = v.cash + unreal;
  return { equity, peak: Math.max(v.peak, equity), positions, pendingSlots: [...v.pending.keys()], dayPnl, dayStartEquity: v.cash - dayPnl, weekPnl, weekStartEquity: v.cash - weekPnl, drawdownPaused: v.drawdownPaused };
}
