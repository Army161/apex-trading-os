// Query functions over the ledger. Pure: entries in, plain rows out, no clock, file, network or environment. The screens, the
// v1 API and the terminal's remote mode all call these, so the surfaces cannot disagree (docs/design/07 s10, 09).
// Every figure a row carries comes with what it needs to be shown honestly: the sample size and whether it is past data,
// forward or the paper book.
import { buildView, bookAt, trialsEver, slotsEver, type LedgerView, type SlotState } from '@apex/kernel/view';
import { verifyChain, type LedgerEntry } from '@apex/kernel/ledger';
import { CEILINGS, DEFAULT_LIMITS, LIMIT_KEYS, effectiveLimits, type Limits } from '@apex/kernel/guard';
import { liveAllowed, type Lock } from '@apex/kernel/locks';
import { GATE_V1 } from '@apex/kernel/gate';

const DAY = 864e5;
const LIVE = /^(micro_live|live_\d+)$/;
export const viewOf = (entries: LedgerEntry[], capital: number) => buildView(entries, capital);

// ---- funnel ----
export type FunnelCounts = { tried: number; waiting: number; passed: number; validated: number; paper: number; eligible: number; live: number; rejected: number; nearMiss: number; needsData: number };
export function funnelOf(v: LedgerView): FunnelCounts {
  const trials = [...v.trials.values()], results = trials.map(t => t.result).filter(Boolean), slots = [...v.slots.values()].filter(s => s.role === 'primary');
  const by = (st: string) => results.filter(r => r.status === st).length, allPass = (r: any) => Array.isArray(r.checks) && r.checks.length > 0 && r.checks.every((c: any) => c.pass);
  return { tried: trialsEver(v), waiting: [...v.preregs.keys()].filter(k => !v.trials.has(k)).length, passed: results.filter(allPass).length,
    validated: trials.filter(t => t.result && allPass(t.result) && t.validator.some(x => x.purpose === 'promotion' && x.agrees)).length,
    paper: slots.filter(s => s.status === 'paper').length, eligible: slots.filter(s => s.status === 'live_eligible').length, live: slots.filter(s => LIVE.test(s.status)).length,
    rejected: by('rejected'), nearMiss: by('watch'), needsData: by('needs_data') };
}
export const funnel = (entries: LedgerEntry[], capital: number) => funnelOf(buildView(entries, capital));

// ---- board ----
export type CheckRow = { n: number; name: string; pass: boolean; why: string; value: number | null };
export type BoardRow = {
  trialKey: string; strategy: string; symbol: string; tf: string; panel: string;
  /** The slot's status when the pair holds a primary slot, otherwise the gate's verdict on past data. */
  status: string; slotKey: string | null; checks: CheckRow[]; passed: number;
  trades: number; ret: number; hold: number; sharpe: number; holdSharpe: number; dd: number; holdDd: number;
  /** Deflated Sharpe probability after all tries so far, and how many tries that was. */
  dsr: number | null; nTrials: number | null; why: string; source: string; seq: number; validated: boolean; error: string | null;
};
const RANK = ['live_100', 'live_50', 'live_10', 'micro_live', 'live_eligible', 'paper', 'paused', 'passed_pending_validation', 'watch', 'needs_data', 'rejected', 'retired'];
const rank = (s: string) => { const i = RANK.indexOf(s.startsWith('paused') ? 'paused' : s); return i < 0 ? RANK.length : i; };
const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);

function rowOf(v: LedgerView, t: { trialKey: string; lastSeq: number; prereg: any; result: any; validator: any[] }, slotByTrial: Map<string, SlotState>): BoardRow {
  const r = t.result ?? {}, m = r.metrics ?? {}, slot = slotByTrial.get(t.trialKey) ?? null, checks: CheckRow[] = Array.isArray(r.checks) ? r.checks.map((c: any) => ({ n: c.n, name: String(c.name), pass: !!c.pass, why: String(c.why ?? ''), value: typeof c.value === 'number' ? c.value : null })) : [];
  return { trialKey: t.trialKey, strategy: String(r.strategy ?? t.prereg?.strategy?.id ?? ''), symbol: String(r.symbol ?? ''), tf: String(r.tf ?? t.prereg?.tf ?? ''), panel: String(r.panel ?? t.prereg?.panel ?? ''),
    status: slot ? slot.status : String(r.status ?? 'unknown'), slotKey: slot?.slotKey ?? null, checks, passed: checks.filter(c => c.pass).length,
    trades: num(m.trades), ret: num(m.ret), hold: num(m.hold), sharpe: num(m.sharpe), holdSharpe: num(m.holdSharpe), dd: num(m.dd), holdDd: num(m.holdDd),
    dsr: typeof r.readouts?.dsrN === 'number' ? r.readouts.dsrN : null, nTrials: typeof r.readouts?.nTrials === 'number' ? r.readouts.nTrials : null,
    why: String(r.why ?? ''), source: String(t.prereg?.source ?? 'unknown'), seq: t.lastSeq, validated: t.validator.some(x => x.purpose === 'promotion' && x.agrees), error: r.error ? String(r.error) : null };
}
const primaryByTrial = (v: LedgerView) => new Map([...v.slots.values()].filter(s => s.role === 'primary').map(s => [s.trialKey, s]));

export type BoardFilter = { status?: string; market?: string; tf?: string; q?: string };
export type Board = { rows: BoardRow[]; total: number; markets: string[]; tfs: string[]; statuses: string[] };
/** Sorted by status, then checks passed, then Sharpe. Never by return (07 s4.2). */
export function board(v: LedgerView, f: BoardFilter = {}): Board {
  const slots = primaryByTrial(v), all = [...v.trials.values()].filter(t => t.result).map(t => rowOf(v, t, slots));
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort(), q = (f.q ?? '').trim().toLowerCase();
  const rows = all.filter(r => (!f.status || r.status === f.status || (f.status === 'paused' && r.status.startsWith('paused'))) && (!f.market || r.symbol === f.market) && (!f.tf || r.tf === f.tf)
    && (!q || `${r.strategy} ${r.symbol} ${r.tf}`.toLowerCase().includes(q)))
    .sort((a, b) => rank(a.status) - rank(b.status) || b.passed - a.passed || b.sharpe - a.sharpe || a.strategy.localeCompare(b.strategy) || a.panel.localeCompare(b.panel));
  return { rows, total: all.length, markets: uniq(all.map(r => r.symbol)), tfs: uniq(all.map(r => r.tf)), statuses: uniq(all.map(r => r.status.startsWith('paused') ? 'paused' : r.status)).sort((a, b) => rank(a) - rank(b)) };
}

export type ReceiptRow = { seq: number; kind: string; ts: number; actor: string; hash: string; prevHash: string; payloadHash: string };
const receiptOf = (e: LedgerEntry): ReceiptRow => ({ seq: e.seq, kind: e.kind, ts: e.ts, actor: e.actor, hash: e.hash, prevHash: e.prevHash, payloadHash: e.payloadHash });
export type ValidatorRow = { seq: number; purpose: string; level: string; agrees: boolean; exact: boolean; source: string; diffs: string[] };
export type Pair = { row: BoardRow; hypothesis: string; passBar: string; preregSeq: number | null; validator: ValidatorRow[]; receipt: ReceiptRow | null;
  inputs: { strategyFingerprint: string; datasets: { id: string; version: string }[]; gateVersion: string; costModelVersion: string; engineFingerprint: string; seed: number | null } | null;
  data: { first: number; last: number; rows: number } | null; tStat: number | null };
/** One evaluation in full. `key` may be the whole trial key or an unambiguous start of it (links carry the first 16 characters). */
export function pair(v: LedgerView, entries: LedgerEntry[], key: string): Pair | null {
  const hits = key.length >= 8 ? [...v.trials.values()].filter(t => t.trialKey.startsWith(key) && t.result) : [];
  if (hits.length !== 1) return null;
  const t = hits[0], r = t.result, e = entries.find(x => x.seq === t.lastSeq) ?? null, i = r.inputs;
  return { row: rowOf(v, t, primaryByTrial(v)), hypothesis: String(t.prereg?.hypothesis ?? ''), passBar: String(t.prereg?.passBar ?? ''), preregSeq: t.prereg?.seq ?? null,
    validator: t.validator.map(x => ({ seq: x.seq, purpose: String(x.purpose), level: String(x.level), agrees: !!x.agrees, exact: !!x.exact, source: String(x.source ?? ''), diffs: Array.isArray(x.diffs) ? x.diffs.map(String) : [] })),
    receipt: e ? receiptOf(e) : null,
    inputs: i ? { strategyFingerprint: String(i.strategy?.fingerprint ?? ''), datasets: Array.isArray(i.dataset) ? i.dataset.map((d: any) => ({ id: String(d.id), version: String(d.version) })) : [], gateVersion: String(i.gateVersion ?? ''), costModelVersion: String(i.costModelVersion ?? ''), engineFingerprint: String(i.engineFingerprint ?? ''), seed: typeof i.seed === 'number' ? i.seed : null } : null,
    data: r.data ? { first: num(r.data.first), last: num(r.data.last), rows: num(r.data.rows) } : null, tStat: typeof r.readouts?.tStat === 'number' ? r.readouts.tStat : null };
}

// ---- slots ----
export type SlotRow = { slotKey: string; trialKey: string; strategy: string; symbol: string; tf: string; status: string; role: string; shadowOf: string | null; weight: number; riskFraction: number;
  lockedAt: number; lockSeq: number; forwardTrades: number; cusum: number; driftPauses: number; gradState: string | null; gradMonth: string | null };
const slotRow = (v: LedgerView, s: SlotState): SlotRow => ({ slotKey: s.slotKey, trialKey: s.trialKey, strategy: s.strategy, symbol: s.symbol, tf: s.tf, status: s.status, role: s.role, shadowOf: s.shadowOf, weight: s.weight, riskFraction: s.riskFraction,
  lockedAt: s.lockedAt, lockSeq: s.lockSeq, forwardTrades: v.closed.filter(c => c.slotKey === s.slotKey).length, cusum: s.cusum, driftPauses: s.driftPauses, gradState: s.lastGrad?.state ?? null, gradMonth: s.lastGradMonth });
export const slots = (v: LedgerView): SlotRow[] => [...v.slots.values()].map(s => slotRow(v, s)).sort((a, b) => rank(a.status) - rank(b.status) || a.role.localeCompare(b.role) || a.slotKey.localeCompare(b.slotKey));

export type Trade = { slotKey: string; symbol: string; side: 1 | -1; entryT: number; exitT: number; entry: number; exit: number; qty: number; pnl: number; r: number; reason: string };
export type IntentRow = { seq: number; ts: number; ok: boolean; id: string; slotKey: string; symbol: string; side: 1 | -1; barT: number; qty: number | null; riskUsd: number | null; rules: { id: string; detail: string }[]; note: string | null };
const intentRow = (e: LedgerEntry): IntentRow => { const p = e.payload ?? {}, ok = e.kind === 'intent';
  return { seq: e.seq, ts: e.ts, ok, id: String(p.id ?? ''), slotKey: String(p.slotKey ?? ''), symbol: String(p.symbol ?? ''), side: p.side === -1 ? -1 : 1, barT: num(p.barT), qty: ok ? num(p.qty) : null, riskUsd: ok ? num(p.riskUsd) : null,
    rules: (Array.isArray(p.rules) ? p.rules : []).map((r: any) => typeof r === 'string' ? { id: r, detail: '' } : { id: String(r.id), detail: String(r.detail ?? '') }), note: p.note ? String(p.note) : null }; };
export const intents = (entries: LedgerEntry[], o: { slotKey?: string; limit?: number } = {}): IntentRow[] =>
  entries.filter(e => (e.kind === 'intent' || e.kind === 'intent_blocked') && (!o.slotKey || e.payload?.slotKey === o.slotKey)).slice(-(o.limit ?? 100)).reverse().map(intentRow);

export type Clock = { months: number; trades: number; dsr: number | null; m: number; state: string | null; fails: string[]; note: string | null; earliestMonth: number | null; needMonths: number; needTrades: number; needDsr: number; checkedMonth: string | null };
export type SlotDetail = { slot: SlotRow; clock: Clock; locks: Lock[]; inSample: BoardRow | null; baseline: { n: number; mu: number; p: number } | null;
  forward: { trades: Trade[]; n: number; pnl: number; wins: number; avgR: number | null }; position: { side: 1 | -1; qty: number; entry: number; stop: number; riskUsd: number; entryT: number } | null;
  intents: IntentRow[]; events: { seq: number; ts: number; from: string; to: string; why: string }[]; validator: ValidatorRow[]; drift: { n: number; s: number; alarms: string[]; threshold: number } | null;
  shadows: SlotRow[]; lock: ReceiptRow | null; fingerprint: string };
/** The forward gate's bars, from the gate version the ledger recorded, so the clock shows what the run will actually ask for. */
function forwardBars(entries: LedgerEntry[]) { const g = [...entries].reverse().find(e => e.kind === 'gate_version')?.payload?.config ?? {}; const f = { ...GATE_V1.forward, ...(g.forward ?? {}) };
  return { needMonths: num(f.minMonths, 6), needTrades: num(f.minTrades, 50), needDsr: num(f.minDsr, 0.95), driftThreshold: num(g.drift?.threshold ?? GATE_V1.drift.threshold, 4) }; }

export function slotDetail(v: LedgerView, entries: LedgerEntry[], slotKey: string, now: number): SlotDetail | null {
  const s = v.slots.get(slotKey); if (!s) return null;
  const tr = v.trials.get(s.trialKey), fb = forwardBars(entries), g = s.lastGrad, closed = v.closed.filter(c => c.slotKey === slotKey) as Trade[], pos = v.positions.get(slotKey) ?? null;
  const gradSeq = g?.state === 'strict_pass' ? g.seq : null, agree = tr?.validator.filter(x => x.purpose === 'graduation' && x.slotKey === slotKey && x.agrees).pop()?.seq ?? null;
  // Lock 2 also needs the review chain, and nothing records its result in the ledger yet, so it reads as closed and lock 3 cannot open.
  // Lock 3 is the latest approval the ledger holds for this slot. Lock 4 is never known here: only the executor on Jeremy's machine has the key.
  const ap = [...entries].reverse().find(e => e.kind === 'live_approval' && e.payload?.slotKey === slotKey);
  const approval = ap ? { seq: ap.seq, slotKey, stage: String(ap.payload.stage), sizeCap: num(ap.payload.sizeCap), expiresAt: num(ap.payload.expiresAt), hash: ap.hash } : null;
  const locks = liveAllowed(slotKey, { slotStatus: s.status, graduationPassedSeq: gradSeq, validatorAgreeSeq: agree, reviewClean: false, approval, machine: null }, now).locks;
  const lockEntry = entries.find(e => e.seq === s.lockSeq) ?? null, slotMap = primaryByTrial(v);
  return { slot: slotRow(v, s),
    clock: { months: num(g?.months), trades: g ? num(g.trades) : closed.length, dsr: g && num(g.trades) > 0 && typeof g.dsrM === 'number' ? g.dsrM : null, m: g ? num(g.m, slotsEver(v)) : slotsEver(v), state: g?.state ?? null, fails: Array.isArray(g?.fails) ? g.fails.map(String) : [],
      note: g?.clock?.note ? String(g.clock.note) : null, earliestMonth: typeof g?.clock?.earliestMonth === 'number' ? g.clock.earliestMonth : null, needMonths: fb.needMonths, needTrades: fb.needTrades, needDsr: fb.needDsr, checkedMonth: s.lastGradMonth },
    locks, inSample: tr?.result ? rowOf(v, tr, slotMap) : null, baseline: s.baseline ? { n: num(s.baseline.n), mu: num(s.baseline.mu), p: num(s.baseline.p) } : null,
    forward: { trades: [...closed].reverse(), n: closed.length, pnl: closed.reduce((a, c) => a + c.pnl, 0), wins: closed.filter(c => c.pnl > 0).length, avgR: closed.length ? closed.reduce((a, c) => a + c.r, 0) / closed.length : null },
    position: pos ? { side: pos.side, qty: pos.qty, entry: pos.entry, stop: pos.stop, riskUsd: pos.riskUsd, entryT: pos.entryT } : null,
    intents: intents(entries, { slotKey, limit: 50 }),
    events: entries.filter(e => e.kind === 'slot_status' && e.payload?.slotKey === slotKey).map(e => ({ seq: e.seq, ts: e.ts, from: String(e.payload.from ?? ''), to: String(e.payload.to ?? ''), why: String(e.payload.why ?? e.payload.reason ?? '') })).reverse(),
    validator: (tr?.validator ?? []).map(x => ({ seq: x.seq, purpose: String(x.purpose), level: String(x.level), agrees: !!x.agrees, exact: !!x.exact, source: String(x.source ?? ''), diffs: Array.isArray(x.diffs) ? x.diffs.map(String) : [] })),
    drift: s.lastDrift ? { n: num(s.lastDrift.n), s: num(s.lastDrift.s), alarms: Array.isArray(s.lastDrift.alarms) ? s.lastDrift.alarms.map(String) : [], threshold: fb.driftThreshold } : null,
    shadows: [...v.slots.values()].filter(x => x.shadowOf === slotKey).map(x => slotRow(v, x)), lock: lockEntry ? receiptOf(lockEntry) : null, fingerprint: s.fingerprint };
}

// ---- paper book ----
export type BookSummary = { capital: number; equity: number; cash: number; peak: number; drawdown: number; closed: number; open: number; dayPnl: number; weekPnl: number; dayLossPct: number; weekLossPct: number;
  limits: { dailyLossPct: number; weeklyLossPct: number; maxDrawdownPct: number }; drawdownPaused: boolean; since: number | null; lastMark: number | null; costs: { version: string; measured: number; assumed: number } | null };
export type PositionRow = { slotKey: string; symbol: string; side: 1 | -1; qty: number; entry: number; stop: number; riskUsd: number; riskPct: number; entryT: number };
export type BookData = { summary: BookSummary; positions: PositionRow[]; closed: Trade[]; blocked: IntentRow[]; curve: { t: number; equity: number }[] };
export function book(v: LedgerView, entries: LedgerEntry[], requested: Limits, now: number): BookData {
  const b = bookAt(v, now), lim = effectiveLimits(requested, v.limits, now).limits, snaps = entries.filter(e => e.kind === 'book_snapshot'), cm = [...entries].reverse().find(e => e.kind === 'cost_model')?.payload;
  const pct = (pnl: number, start: number) => (start > 0 ? pnl / start : 0), rows: any[] = Array.isArray(cm?.rows) ? cm.rows : [];
  return { summary: { capital: v.capital, equity: b.equity, cash: v.cash, peak: b.peak, drawdown: b.peak > 0 ? b.equity / b.peak - 1 : 0, closed: v.closed.length, open: b.positions.length, dayPnl: b.dayPnl, weekPnl: b.weekPnl,
      dayLossPct: pct(b.dayPnl, b.dayStartEquity), weekLossPct: pct(b.weekPnl, b.weekStartEquity), limits: { dailyLossPct: lim.dailyLossPct, weeklyLossPct: lim.weeklyLossPct, maxDrawdownPct: lim.maxDrawdownPct }, drawdownPaused: v.drawdownPaused,
      since: snaps[0]?.ts ?? null, lastMark: snaps.length ? num(snaps[snaps.length - 1].payload?.at, snaps[snaps.length - 1].ts) : null,
      costs: cm ? { version: String(cm.version ?? ''), measured: rows.filter(r => r.source !== 'prior').length, assumed: rows.filter(r => r.source === 'prior').length } : null },
    positions: [...v.positions.values()].map(p => ({ slotKey: p.slotKey, symbol: p.symbol, side: p.side, qty: p.qty, entry: p.entry, stop: p.stop, riskUsd: p.riskUsd, riskPct: b.equity > 0 ? p.riskUsd / b.equity : 0, entryT: p.entryT })),
    closed: ([...v.closed].reverse().slice(0, 100)) as Trade[], blocked: intents(entries, { limit: 500 }).filter(i => !i.ok).slice(0, 50),
    curve: snaps.map(e => ({ t: num(e.payload?.at, e.ts), equity: num(e.payload?.equity, v.capital) })) };
}

// ---- risk ----
export type LimitRow = { key: keyof Limits; inForce: number; requested: number; def: number; ceiling: number; pending: { value: number; since: number; effective: number } | null };
export type HaltEvent = { seq: number; ts: number; kind: 'halt' | 'resume'; level: string; by: string; reason: string };
export type RiskData = { limits: LimitRow[]; halts: { level: string; by: string; reason: string; ts: number }[]; history: HaltEvent[]; drawdownPaused: boolean;
  exposure: { assetClass: string; riskUsd: number; riskPct: number; positions: number }[]; openRiskPct: number; drift: { slotKey: string; status: string; cusum: number; threshold: number; pauses: number }[]; activity: IntentRow[] };
const LOOSEN_MS = 24 * 3600e3;
export function risk(v: LedgerView, entries: LedgerEntry[], requested: Limits, now: number): RiskData {
  const snap = effectiveLimits(requested, v.limits, now), b = bookAt(v, now), fb = forwardBars(entries), byClass = new Map<string, { riskUsd: number; positions: number }>();
  for (const p of v.positions.values()) { const x = byClass.get(p.assetClass) ?? { riskUsd: 0, positions: 0 }; x.riskUsd += p.riskUsd; x.positions++; byClass.set(p.assetClass, x); }
  const open = [...v.positions.values()].reduce((a, p) => a + p.riskUsd, 0);
  return { limits: LIMIT_KEYS.map(k => { const p = (snap.pending as any)[k] as { value: number; since: number } | undefined; return { key: k, inForce: snap.limits[k], requested: requested[k], def: DEFAULT_LIMITS[k], ceiling: CEILINGS[k], pending: p ? { ...p, effective: p.since + LOOSEN_MS } : null }; }),
    halts: v.halts.map(h => ({ ...h })), drawdownPaused: v.drawdownPaused,
    history: entries.filter(e => e.kind === 'halt' || e.kind === 'resume').map(e => ({ seq: e.seq, ts: e.ts, kind: e.kind as 'halt' | 'resume', level: String(e.payload?.level ?? ''), by: String(e.payload?.by ?? e.actor), reason: String(e.payload?.reason ?? '') })).reverse().slice(0, 50),
    exposure: [...byClass.entries()].map(([assetClass, x]) => ({ assetClass, riskUsd: x.riskUsd, riskPct: b.equity > 0 ? x.riskUsd / b.equity : 0, positions: x.positions })).sort((a, c) => c.riskUsd - a.riskUsd),
    openRiskPct: b.equity > 0 ? open / b.equity : 0,
    drift: [...v.slots.values()].filter(s => s.status !== 'retired').map(s => ({ slotKey: s.slotKey, status: s.status, cusum: s.cusum, threshold: fb.driftThreshold, pauses: s.driftPauses })),
    activity: intents(entries, { limit: 100 }) };
}
/** What has to be typed, exactly, to resume a level. */
export const confirmPhrase = (level: string) => `resume ${level}`;
/** The halt levels a person may resume from the dashboard, with what each one stops. */
export const RESUMABLE = { andon: 'the andon cord', kill: 'the kill switch', 'book-drawdown': 'the drawdown pause' } as const;

// ---- data health ----
export type DataRow = { dataset: string; status: string; tradable: boolean; rows: number; first: number; last: number; source: string; second: string | null; version: string; warnings: string[]; seq: number | null };
export function dataHealth(v: LedgerView, entries: LedgerEntry[]): DataRow[] {
  const seqOf = new Map<string, number>(); for (const e of entries) if (e.kind === 'data_version') seqOf.set(String(e.payload?.dataset), e.seq);
  const order = { blocked: 0, warn: 1, ok: 2 } as Record<string, number>;
  return [...v.dataVersions.values()].map(d => ({ dataset: String(d.dataset), status: String(d.status ?? 'unknown'), tradable: d.tradable !== false, rows: num(d.rows), first: num(d.first), last: num(d.last), source: String(d.source ?? ''), second: d.second ? String(d.second) : null,
    version: String(d.version ?? ''), warnings: Array.isArray(d.warnings) ? d.warnings.map(String) : [], seq: seqOf.get(String(d.dataset)) ?? null }))
    .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || Number(a.tradable) - Number(b.tradable) || a.dataset.localeCompare(b.dataset));
}

// ---- runs and reports ----
export type RunRow = { id: string; seq: number; ts: number; mode: string; evaluated: number; newTrials: number; intents: number; blocked: number; fills: number; errors: number; waitingBudget: number; problems: string[] };
export const runs = (entries: LedgerEntry[]): RunRow[] => entries.filter(e => e.kind === 'run').map(e => { const p = e.payload ?? {};
  return { id: String(p.id), seq: e.seq, ts: e.ts, mode: String(p.mode ?? ''), evaluated: num(p.evaluated), newTrials: num(p.newTrials), intents: num(p.intents), blocked: num(p.blocked), fills: num(p.fills), errors: num(p.errors), waitingBudget: num(p.waitingBudget), problems: Array.isArray(p.problems) ? p.problems.map(String) : [] }; }).reverse();

// ---- research queue ----
export type QueueItem = { source: string; label: string; pairs: number; done: number; passed: number; nearMiss: number; firstTs: number };
export type QueueData = { used: number; budget: number; waiting: number; items: QueueItem[] };
/** The weekly trial budget and what was registered against it, grouped by where the try came from. Counted the way the run counts it. */
export function queue(v: LedgerView, entries: LedgerEntry[], trialsPerWeek: number, now: number): QueueData {
  const counted = (s: string) => s === 'factory' || s.startsWith('queue:') || s.startsWith('claim:'), weekAgo = now - 7 * DAY, groups = new Map<string, QueueItem>();
  for (const p of v.preregs.values()) { const src = String(p.source ?? 'unknown'), r = v.trials.get(p.trialKey)?.result;
    const g = groups.get(src) ?? { source: src, label: src.startsWith('queue:') ? `Research queue test ${src.slice(6)}` : src.startsWith('claim:') ? `Claim check ${src.slice(6, 18)}` : src.startsWith('plan:') ? `Approved plan batch ${src.slice(5)}` : src === 'factory' ? 'Strategy factory' : src, pairs: 0, done: 0, passed: 0, nearMiss: 0, firstTs: p.ts };
    g.pairs++; if (r) { g.done++; if (r.status === 'passed_pending_validation') g.passed++; if (r.status === 'watch') g.nearMiss++; } g.firstTs = Math.min(g.firstTs, p.ts); groups.set(src, g); }
  const lastRun = [...entries].reverse().find(e => e.kind === 'run')?.payload;
  return { used: [...v.preregs.values()].filter(p => counted(String(p.source ?? '')) && p.ts > weekAgo).length, budget: trialsPerWeek, waiting: num(lastRun?.waitingBudget), items: [...groups.values()].sort((a, b) => b.firstTs - a.firstTs || a.source.localeCompare(b.source)) };
}

// ---- ledger ----
export type LedgerRow = ReceiptRow & { summary: string; slotKey: string | null };
export function summarise(e: LedgerEntry): string {
  const p = e.payload ?? {};
  switch (e.kind) {
    case 'trial_result': return `${p.strategy} ${p.symbol} ${p.tf}: ${p.status}`;
    case 'prereg': return `${p.strategy?.id} on ${p.panel}`;
    case 'validator_run': return `${p.purpose} ${p.level}: ${p.agrees ? 'agrees' : 'DISAGREES'}`;
    case 'slot_locked': return `${p.slotKey} as ${p.role}`;
    case 'slot_status': return `${p.slotKey}: ${p.from} -> ${p.to}`;
    case 'intent': case 'intent_blocked': return `${p.slotKey} ${p.side === 1 ? 'long' : 'short'}`;
    case 'fill': return `${p.slotKey} ${p.kind} ${p.qty} at ${p.price}`;
    case 'halt': return `${p.level}: ${p.reason}`;
    case 'resume': return `${p.level} resumed by ${p.by ?? e.actor}`;
    case 'run': return `${p.id}: ${p.evaluated} evaluated, ${p.intents} intents`;
    case 'data_version': return `${p.dataset} ${p.status}`;
    case 'weights': return `${Object.keys(p.weights ?? {}).length} slots, ${p.method}`;
    case 'book_snapshot': return `equity ${typeof p.equity === 'number' ? p.equity.toFixed(2) : '?'}`;
    case 'graduation_check': return `${p.slotKey}: ${p.state}`;
    case 'drift_reading': return `${p.slotKey}: ${typeof p.s === 'number' ? p.s.toFixed(2) : '?'}`;
    case 'claim_check': return `${p.id}: ${String(p.verdict ?? 'no verdict').replace(/_/g, ' ')}`;
    case 'gate_version': case 'cost_model': return String(p.version ?? '').slice(0, 12);
    default: return '';
  }
}
export type LedgerPage = { rows: LedgerRow[]; next: number | null; total: number; kinds: string[]; head: { seq: number; hash: string } | null; chain: { ok: boolean; badSeq: number | null; why: string | null } };
/** Newest first. `before` is the cursor: the seq to start below. */
export function ledgerPage(entries: LedgerEntry[], o: { kind?: string; slot?: string; before?: number; limit?: number } = {}): LedgerPage {
  const limit = Math.min(200, Math.max(1, o.limit ?? 50)), c = verifyChain(entries);
  const match = entries.filter(e => (!o.kind || e.kind === o.kind) && (!o.slot || e.payload?.slotKey === o.slot)), below = match.filter(e => !o.before || e.seq < o.before);
  const page = below.slice(-limit).reverse(), last = entries[entries.length - 1];
  return { rows: page.map(e => ({ ...receiptOf(e), summary: summarise(e), slotKey: typeof e.payload?.slotKey === 'string' ? e.payload.slotKey : null })), next: below.length > limit ? page[page.length - 1].seq : null, total: match.length,
    kinds: [...new Set(entries.map(e => e.kind))].sort(), head: last ? { seq: last.seq, hash: last.hash } : null, chain: { ok: c.ok, badSeq: c.badSeq ?? null, why: c.why ?? null } };
}
export function ledgerEntry(entries: LedgerEntry[], seq: number): { receipt: ReceiptRow; summary: string; payload: unknown; prev: number | null; next: number | null } | null {
  const i = entries.findIndex(e => e.seq === seq); if (i < 0) return null; const e = entries[i];
  return { receipt: receiptOf(e), summary: summarise(e), payload: e.payload, prev: entries[i - 1]?.seq ?? null, next: entries[i + 1]?.seq ?? null };
}

// ---- today ----
export type TodayData = { funnel: FunnelCounts; book: BookSummary; slots: SlotRow[]; lastRun: RunRow | null; nearMisses: BoardRow[]; needsYou: { text: string; href: string }[] };
export function today(v: LedgerView, entries: LedgerEntry[], requested: Limits, now: number): TodayData {
  const bd = board(v), rs = runs(entries), dh = dataHealth(v, entries), needsYou: { text: string; href: string }[] = [];
  for (const h of v.halts) needsYou.push({ text: `Halted (${h.level}): ${h.reason}`, href: '/autopilot/risk' });
  const blocked = dh.filter(d => d.status === 'blocked'); if (blocked.length) needsYou.push({ text: `${blocked.length} ${blocked.length === 1 ? 'dataset is' : 'datasets are'} blocked: ${blocked.slice(0, 3).map(d => d.dataset).join(', ')}`, href: '/autopilot/data' });
  for (const s of v.slots.values()) if (s.status.startsWith('paused')) needsYou.push({ text: `${s.slotKey} is paused (${s.status.replace('paused_', '')})`, href: `/autopilot/slots/${encodeURIComponent(s.slotKey)}` });
  if (rs[0]?.errors) needsYou.push({ text: `The last run had ${rs[0].errors} ${rs[0].errors === 1 ? 'error' : 'errors'}`, href: '/autopilot/reports' });
  return { funnel: funnelOf(v), book: book(v, entries, requested, now).summary, slots: slots(v).filter(s => s.status !== 'retired' && s.role === 'primary'), lastRun: rs[0] ?? null,
    nearMisses: bd.rows.filter(r => !r.slotKey && r.status !== 'passed_pending_validation' && r.checks.length > 0).sort((a, b) => b.passed - a.passed || b.sharpe - a.sharpe).slice(0, 5), needsYou };
}

// ---- claim checks ----
export type ClaimRow = { id: string; seq: number; ts: number; verdict: string | null; sourceKind: string; chars: number; readings: number; untested: number; flags: string[]; contentHash: string };
const claimRow = (e: LedgerEntry): ClaimRow => { const p = e.payload ?? {}; return { id: String(p.id), seq: e.seq, ts: e.ts, verdict: typeof p.verdict === 'string' ? p.verdict : null, sourceKind: String(p.sourceKind ?? ''), chars: num(p.chars),
  readings: Array.isArray(p.readings) ? p.readings.length : 0, untested: num(p.untested), flags: Array.isArray(p.flags) ? p.flags.map(String) : [], contentHash: String(p.contentHash ?? '') }; };
/** Every recorded check, newest first. Checking the same text again adds a row; the tries are only counted once. */
export const claimChecks = (entries: LedgerEntry[]): ClaimRow[] => entries.filter(e => e.kind === 'claim_check').map(claimRow).reverse();
export type ClaimReading = { ruleSet: number; strategy: string; panel: string; proxy: boolean; status: string; dsrInCheck: number | null; row: BoardRow | null; rules: unknown; hypothesis: string };
export type ClaimDetail = { check: ClaimRow; receipt: ReceiptRow; readings: ClaimReading[]; earlier: ClaimRow[] };
/** One check as the ledger holds it: the verdict, each reading with its seven checks, and the rules in the form they were run. The source's own words are not here, because the source is never stored. */
export function claimDetail(v: LedgerView, entries: LedgerEntry[], id: string): ClaimDetail | null {
  const all = entries.filter(e => e.kind === 'claim_check' && e.payload?.id === id); if (!id || !all.length) return null;
  const e = all[all.length - 1], p = e.payload ?? {}, slotMap = primaryByTrial(v), keys: string[] = Array.isArray(p.trialKeys) ? p.trialKeys.map(String) : [];
  const readings: ClaimReading[] = (Array.isArray(p.readings) ? p.readings : []).map((r: any, i: number) => { const t = v.trials.get(keys[i] ?? '');
    return { ruleSet: num(r.ruleSet), strategy: String(r.strategy ?? ''), panel: String(r.panel ?? ''), proxy: !!r.proxy, status: String(r.status ?? ''), dsrInCheck: typeof r.dsrInCheck === 'number' ? r.dsrInCheck : null,
      row: t?.result ? rowOf(v, t, slotMap) : null, rules: t?.prereg?.rules ?? null, hypothesis: String(t?.prereg?.hypothesis ?? '') }; });
  return { check: claimRow(e), receipt: receiptOf(e), readings, earlier: all.slice(0, -1).map(claimRow).reverse() };
}
