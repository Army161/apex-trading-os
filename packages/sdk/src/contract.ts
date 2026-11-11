// The v1 API contract (docs/design/09): every route, its scope and the shape it returns. This file is the one list. The
// dashboard's route registry, `docs/design/openapi.yaml` and the client in this package are all built from it, and tests fail
// when any of them disagrees. It imports nothing, so a browser extension can use it.
//
// There is no route here that creates, changes or cancels an order, approves anything, resumes anything or changes a limit,
// and no scope for any of those. The only writes are a claim check and a halt.

// ---- common shapes ----
/** A performance figure. It never travels as a bare number: it carries its sample size, its basis and whether costs are taken off. */
export type Metric = { value: number; unit: 'pct' | 'usd' | 'ratio' | 'count' | 'prob'; n: number; basis: 'in_sample' | 'forward' | 'book'; net: boolean; receipt?: number };
export type Page<T> = { items: T[]; next: string | null };
export type Problem = { type: string; title: string; status: number; detail?: string; instance?: string; code: ProblemCode };
/** Times are RFC 3339 UTC. `ts` here is the entry's own millisecond time written that way, so the hash can be recomputed. */
export type Receipt = { seq: number; kind: string; ts: string; actor: string; payloadHash: string; prevHash: string; hash: string };

export const SCOPES = ['read:status', 'read:board', 'read:slots', 'read:book', 'read:ledger', 'read:reports', 'read:data', 'read:agents', 'queue:claims', 'queue:research', 'halt'] as const;
export type Scope = (typeof SCOPES)[number];
/** What a new key gets unless Jeremy picks otherwise: every read, and nothing that writes. */
export const READ_SCOPES: Scope[] = SCOPES.filter(s => s.startsWith('read:'));

export const PROBLEMS = { unauthorized: 401, forbidden_scope: 403, not_found: 404, validation: 422, rate_limited: 429, halted: 409, budget: 409, busy: 409, unavailable: 503 } as const;
export type ProblemCode = keyof typeof PROBLEMS;

/** Per key. Reads a minute, queue writes an hour, halts an hour. */
export const RATE = { read: { limit: 120, windowSec: 60 }, queue: { limit: 10, windowSec: 3600 }, halt: { limit: 5, windowSec: 3600 } } as const;
export type RouteClass = keyof typeof RATE;

// ---- response types ----
export type Check = { n: number; name: string; pass: boolean; why: string; value: number | null };
export type Evaluation = { trialKey: string; strategy: string; symbol: string; tf: string; panel: string; status: string; slotKey: string | null; checksPassed: number; checks: Check[]; why: string; source: string;
  validated: boolean; error: string | null; nTrials: number | null; metrics: { ret: Metric; sharpe: Metric; maxDrawdown: Metric; dsr: Metric | null }; receipt: number };
export type ValidatorRun = { seq: number; purpose: string; level: string; agrees: boolean; exact: boolean; source: string; diffs: string[] };
export type EvaluationDetail = Evaluation & { hypothesis: string; passBar: string; preregSeq: number | null; validator: ValidatorRun[]; receiptEntry: Receipt | null;
  benchmark: { bars: number; ret: Metric; sharpe: Metric; maxDrawdown: Metric } | null; tStat: number | null;
  inputs: { strategyFingerprint: string; datasets: { id: string; version: string }[]; gateVersion: string; costModelVersion: string; engineFingerprint: string; seed: number | null } | null;
  data: { first: string; last: string; rows: number } | null };
export type Slot = { slotKey: string; trialKey: string; strategy: string; symbol: string; tf: string; status: string; role: string; shadowOf: string | null; weight: number; riskFraction: number;
  lockedAt: string; lockSeq: number; forwardTrades: number; drift: { cusum: number; pauses: number }; graduation: { state: string | null; month: string | null } };
export type Lock = { id: 'evidence' | 'validated' | 'approved' | 'machine'; open: boolean; why: string };
export type Locks = { slotKey: string; allowed: boolean; locks: Lock[] };
export type Position = { slotKey: string; symbol: string; side: 'long' | 'short'; qty: number; entry: number; stop: number; riskUsd: number; riskPct: number; since: string };
export type SlotDetail = Slot & { fingerprint: string; lock: Receipt | null; locks: Lock[];
  clock: { months: number; trades: number; dsr: Metric | null; slotsEverLocked: number; state: string | null; fails: string[]; note: string | null; earliestMonth: number | null; needMonths: number; needTrades: number; needDsr: number; checkedMonth: string | null };
  forward: { trades: number; wins: number; pnl: Metric; avgR: Metric | null }; position: Position | null; inSample: Evaluation | null; shadows: string[] };
export type Trade = { slotKey: string; symbol: string; side: 'long' | 'short'; entryAt: string; exitAt: string; entry: number; exit: number; qty: number; pnl: number; r: number; reason: string };
export type SlotEvent = { seq: number; ts: string; from: string; to: string; why: string };
export type DriftReading = { seq: number; ts: string; n: number; s: number; alarms: string[]; threshold: number };
export type Book = { capital: number; equity: Metric; change: Metric; drawdown: Metric; day: Metric; week: Metric; peak: number; cash: number; openPositions: number; closedTrades: number;
  limits: { dailyLossPct: number; weeklyLossPct: number; maxDrawdownPct: number }; lossUsed: { day: number; week: number; fromPeak: number }; drawdownPaused: boolean;
  since: string | null; lastMark: string | null; costs: { version: string; measured: number; assumed: number } | null };
export type Fill = { seq: number; ts: string; intent: string; slotKey: string; kind: string; at: string; price: number; qty: number };
export type Intent = { seq: number; ts: string; ok: boolean; id: string; slotKey: string; symbol: string; side: 'long' | 'short'; barAt: string; qty: number | null; riskUsd: number | null; rules: { id: string; detail: string }[]; note: string | null };
export type Risk = { limits: { key: string; inForce: number; requested: number; default: number; ceiling: number | null; pending: { value: number; since: string; effective: string } | null }[];
  halts: { level: string; by: string; reason: string; ts: string }[]; drawdownPaused: boolean; openRiskPct: number;
  exposure: { assetClass: string; riskUsd: number; riskPct: number; positions: number }[]; drift: { slotKey: string; status: string; cusum: number; threshold: number; pauses: number }[] };
export type Queue = { used: number; budget: number; waiting: number; items: { source: string; label: string; pairs: number; done: number; passed: number; nearMiss: number; first: string }[] };
export type DataHealth = { dataset: string; status: string; tradable: boolean; rows: number; first: string; last: string; source: string; second: string | null; version: string; warnings: string[]; receipt: number | null };
export type Costs = { version: string; receipt: number; rows: Record<string, unknown>[] } | null;
export type ReportRow = { id: string; receipt: number; ts: string; mode: string; evaluated: number; newTrials: number; intents: number; blocked: number; fills: number; errors: number; waitingBudget: number; problems: string[] };
export type Report = ReportRow & { markdown: string | null };
export type LedgerRow = Receipt & { summary: string; slotKey: string | null };
export type LedgerEntry = Receipt & { summary: string; payload: unknown; prev: number | null; next: number | null };
export type LedgerHead = { seq: number; hash: string; anchor: { seq: number; hash: string; at: string } | null } | { seq: 0; hash: null; anchor: null };
export type LedgerVerify = { ok: boolean; from: number; to: number; checked: number; badSeq: number | null; why: string | null };
export type ClaimCheckRow = { id: string; status: 'done'; verdict: string | null; ts: string; sourceKind: string; chars: number; readings: number; untested: number; flags: string[]; contentHash: string; receipt: number };
export type ClaimCheck = ClaimCheckRow & { receiptEntry: Receipt; trialsUsed: number;
  interpretations: { ruleSet: number; strategy: string; panel: string; proxy: boolean; status: string; dsrInCheck: Metric | null; hypothesis: string; rules: unknown; evaluation: Evaluation | null }[] };
export type ClaimCheckAccepted = { id: string; status: 'done'; verdict: string | null; headline: string; trialsUsed: number; receipt: number | null; repeated: boolean };
export type Funnel = { tried: number; waiting: number; passed: number; validated: number; paper: number; eligible: number; live: number; rejected: number; nearMiss: number; needsData: number };
export type Status = { mode: 'paper' | 'live'; halted: boolean; halts: { level: string; by: string; reason: string; ts: string | null; from: 'ledger' | 'dashboard' }[];
  ledger: 'postgres' | 'file' | 'none' | 'error'; entries: number; trials: number | null; slots: number | null; data: 'ok' | 'stale' | 'blocked' | 'unknown'; dataBlocked: string[]; dataStale: string[];
  lastRun: { id: string; mode: string; ts: string } | null; aiEnabled: boolean; at: string };
export type HaltResult = { halted: true; already: boolean; ledger: 'recorded' | 'already' | 'no_ledger' | 'failed' };
export type ClaimCheckBody = { kind?: 'transcript' | 'article' | 'post' | 'pine' | 'rules'; text: string; extraction?: unknown; idempotencyKey?: string };
export type HaltBody = { reason: string };

// ---- schemas (JSON Schema, as OpenAPI 3.1 uses it) ----
export type Schema = { [k: string]: unknown };
const str: Schema = { type: 'string' }, num: Schema = { type: 'number' }, int: Schema = { type: 'integer' }, bool: Schema = { type: 'boolean' }, time: Schema = { type: 'string', format: 'date-time' }, any: Schema = {};
const nul = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] });
const arr = (items: Schema): Schema => ({ type: 'array', items });
const obj = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({ type: 'object', properties, required: Object.keys(properties).filter(k => !optional.includes(k)) });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const all = (name: string, more: Record<string, Schema>): Schema => ({ allOf: [ref(name), obj(more)] });
const one = (...values: string[]): Schema => ({ type: 'string', enum: values });
const page = (name: string): Schema => obj({ items: arr(ref(name)), next: nul(str) });
const side = one('long', 'short'), M = ref('Metric');

export const SCHEMAS: Record<string, Schema> = {
  Metric: obj({ value: num, unit: one('pct', 'usd', 'ratio', 'count', 'prob'), n: int, basis: one('in_sample', 'forward', 'book'), net: bool, receipt: int }, ['receipt']),
  Problem: obj({ type: str, title: str, status: int, detail: str, instance: str, code: one(...Object.keys(PROBLEMS)) }, ['detail', 'instance']),
  Receipt: obj({ seq: int, kind: str, ts: time, actor: str, payloadHash: str, prevHash: str, hash: str }),
  Check: obj({ n: int, name: str, pass: bool, why: str, value: nul(num) }),
  Evaluation: obj({ trialKey: str, strategy: str, symbol: str, tf: str, panel: str, status: str, slotKey: nul(str), checksPassed: int, checks: arr(ref('Check')), why: str, source: str, validated: bool, error: nul(str), nTrials: nul(int),
    metrics: obj({ ret: M, sharpe: M, maxDrawdown: M, dsr: nul(M) }), receipt: int }),
  ValidatorRun: obj({ seq: int, purpose: str, level: str, agrees: bool, exact: bool, source: str, diffs: arr(str) }),
  EvaluationDetail: all('Evaluation', { hypothesis: str, passBar: str, preregSeq: nul(int), validator: arr(ref('ValidatorRun')), receiptEntry: nul(ref('Receipt')),
    benchmark: nul(obj({ bars: int, ret: M, sharpe: M, maxDrawdown: M })), tStat: nul(num),
    inputs: nul(obj({ strategyFingerprint: str, datasets: arr(obj({ id: str, version: str })), gateVersion: str, costModelVersion: str, engineFingerprint: str, seed: nul(num) })),
    data: nul(obj({ first: time, last: time, rows: int })) }),
  Slot: obj({ slotKey: str, trialKey: str, strategy: str, symbol: str, tf: str, status: str, role: str, shadowOf: nul(str), weight: num, riskFraction: num, lockedAt: time, lockSeq: int, forwardTrades: int,
    drift: obj({ cusum: num, pauses: int }), graduation: obj({ state: nul(str), month: nul(str) }) }),
  Lock: obj({ id: one('evidence', 'validated', 'approved', 'machine'), open: bool, why: str }),
  Locks: obj({ slotKey: str, allowed: bool, locks: arr(ref('Lock')) }),
  Position: obj({ slotKey: str, symbol: str, side, qty: num, entry: num, stop: num, riskUsd: num, riskPct: num, since: time }),
  SlotDetail: all('Slot', { fingerprint: str, lock: nul(ref('Receipt')), locks: arr(ref('Lock')),
    clock: obj({ months: num, trades: int, dsr: nul(M), slotsEverLocked: int, state: nul(str), fails: arr(str), note: nul(str), earliestMonth: nul(num), needMonths: num, needTrades: num, needDsr: num, checkedMonth: nul(str) }),
    forward: obj({ trades: int, wins: int, pnl: M, avgR: nul(M) }), position: nul(ref('Position')), inSample: nul(ref('Evaluation')), shadows: arr(str) }),
  Trade: obj({ slotKey: str, symbol: str, side, entryAt: time, exitAt: time, entry: num, exit: num, qty: num, pnl: num, r: num, reason: str }),
  SlotEvent: obj({ seq: int, ts: time, from: str, to: str, why: str }),
  DriftReading: obj({ seq: int, ts: time, n: int, s: num, alarms: arr(str), threshold: num }),
  Book: obj({ capital: num, equity: M, change: M, drawdown: M, day: M, week: M, peak: num, cash: num, openPositions: int, closedTrades: int, limits: obj({ dailyLossPct: num, weeklyLossPct: num, maxDrawdownPct: num }),
    lossUsed: obj({ day: num, week: num, fromPeak: num }), drawdownPaused: bool, since: nul(time), lastMark: nul(time), costs: nul(obj({ version: str, measured: int, assumed: int })) }),
  Fill: obj({ seq: int, ts: time, intent: str, slotKey: str, kind: str, at: time, price: num, qty: num }),
  Intent: obj({ seq: int, ts: time, ok: bool, id: str, slotKey: str, symbol: str, side, barAt: time, qty: nul(num), riskUsd: nul(num), rules: arr(obj({ id: str, detail: str })), note: nul(str) }),
  Risk: obj({ limits: arr(obj({ key: str, inForce: num, requested: num, default: num, ceiling: nul(num), pending: nul(obj({ value: num, since: time, effective: time })) })),
    halts: arr(obj({ level: str, by: str, reason: str, ts: time })), drawdownPaused: bool, openRiskPct: num,
    exposure: arr(obj({ assetClass: str, riskUsd: num, riskPct: num, positions: int })), drift: arr(obj({ slotKey: str, status: str, cusum: num, threshold: num, pauses: int })) }),
  Queue: obj({ used: int, budget: int, waiting: int, items: arr(obj({ source: str, label: str, pairs: int, done: int, passed: int, nearMiss: int, first: time })) }),
  DataHealth: obj({ dataset: str, status: str, tradable: bool, rows: int, first: time, last: time, source: str, second: nul(str), version: str, warnings: arr(str), receipt: nul(int) }),
  Costs: nul(obj({ version: str, receipt: int, rows: arr({ type: 'object' }) })),
  ReportRow: obj({ id: str, receipt: int, ts: time, mode: str, evaluated: int, newTrials: int, intents: int, blocked: int, fills: int, errors: int, waitingBudget: int, problems: arr(str) }),
  Report: all('ReportRow', { markdown: nul(str) }),
  LedgerRow: all('Receipt', { summary: str, slotKey: nul(str) }),
  LedgerEntry: all('Receipt', { summary: str, payload: any, prev: nul(int), next: nul(int) }),
  LedgerHead: obj({ seq: int, hash: nul(str), anchor: nul(obj({ seq: int, hash: str, at: time })) }),
  LedgerVerify: obj({ ok: bool, from: int, to: int, checked: int, badSeq: nul(int), why: nul(str) }),
  ClaimCheckRow: obj({ id: str, status: one('done'), verdict: nul(str), ts: time, sourceKind: str, chars: int, readings: int, untested: int, flags: arr(str), contentHash: str, receipt: int }),
  ClaimCheck: all('ClaimCheckRow', { receiptEntry: ref('Receipt'), trialsUsed: int,
    interpretations: arr(obj({ ruleSet: int, strategy: str, panel: str, proxy: bool, status: str, dsrInCheck: nul(M), hypothesis: str, rules: any, evaluation: nul(ref('Evaluation')) })) }),
  ClaimCheckAccepted: obj({ id: str, status: one('done'), verdict: nul(str), headline: str, trialsUsed: int, receipt: nul(int), repeated: bool }),
  Funnel: obj(Object.fromEntries(['tried', 'waiting', 'passed', 'validated', 'paper', 'eligible', 'live', 'rejected', 'nearMiss', 'needsData'].map(k => [k, int]))),
  Status: obj({ mode: one('paper', 'live'), halted: bool, halts: arr(obj({ level: str, by: str, reason: str, ts: nul(time), from: one('ledger', 'dashboard') })), ledger: one('postgres', 'file', 'none', 'error'), entries: int,
    trials: nul(int), slots: nul(int), data: one('ok', 'stale', 'blocked', 'unknown'), dataBlocked: arr(str), dataStale: arr(str), lastRun: nul(obj({ id: str, mode: str, ts: time })), aiEnabled: bool, at: time }),
  HaltResult: obj({ halted: { type: 'boolean', enum: [true] }, already: bool, ledger: one('recorded', 'already', 'no_ledger', 'failed') }),
  ClaimCheckBody: obj({ kind: one('transcript', 'article', 'post', 'pine', 'rules'), text: str, extraction: { type: 'object' }, idempotencyKey: { type: 'string', maxLength: 100 } }, ['kind', 'extraction', 'idempotencyKey']),
  HaltBody: obj({ reason: { type: 'string', minLength: 3, maxLength: 300 } }),
  ...Object.fromEntries(['Evaluation', 'Slot', 'Trade', 'SlotEvent', 'DriftReading', 'Position', 'Fill', 'Intent', 'DataHealth', 'ReportRow', 'LedgerRow', 'ClaimCheckRow'].map(n => [`${n}Page`, page(n)])),
};

// ---- routes ----
type Q = Record<string, { schema: Schema; about: string }>;
export type RouteDef = { method: 'GET' | 'POST'; path: string; scope: Scope; summary: string; response: string; status?: 200 | 202; query?: Q; body?: string };
const PAGED: Q = { limit: { schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 }, about: 'Rows a page.' }, cursor: { schema: str, about: 'The `next` value of the page before.' } };
const get = (path: string, scope: Scope, response: string, summary: string, query?: Q): RouteDef => ({ method: 'GET', path, scope, summary, response, query: response.endsWith('Page') ? { ...PAGED, ...query } : query });
const f = (about: string, schema: Schema = str) => ({ schema, about });

export const ROUTES = {
  status: get('/status', 'read:status', 'Status', 'Mode, halts, counts of tries and slots, data status and the last run.'),
  funnel: get('/funnel', 'read:board', 'Funnel', 'How many pairs are at each stage.'),
  board: get('/board', 'read:board', 'EvaluationPage', 'Every evaluated pair. Sorted by status, then checks passed, then Sharpe. Never by return.', { status: f('One status.'), market: f('One symbol.'), tf: f('One timeframe.'), q: f('Text in the strategy, symbol or timeframe.') }),
  pair: get('/pairs/{trialKey}', 'read:board', 'EvaluationDetail', 'One evaluation in full. The key may be the whole trial key or its first eight or more characters.'),
  slots: get('/slots', 'read:slots', 'SlotPage', 'Every slot ever locked.'),
  slot: get('/slots/{key}', 'read:slots', 'SlotDetail', 'One slot with its graduation clock, drift state and the four locks.'),
  slotTrades: get('/slots/{key}/trades', 'read:slots', 'TradePage', 'Forward paper trades for a slot, newest first.'),
  slotEvents: get('/slots/{key}/events', 'read:slots', 'SlotEventPage', 'Status changes for a slot, with the reason for each.'),
  slotDrift: get('/slots/{key}/drift', 'read:slots', 'DriftReadingPage', 'Drift readings for a slot, newest first.'),
  locks: get('/locks/{slotKey}', 'read:slots', 'Locks', 'The four live locks as the lock function reports them. Locks three and four never read open here.'),
  book: get('/book', 'read:book', 'Book', 'The paper book: equity, day, week, drawdown and how much of each loss limit is used.'),
  positions: get('/book/positions', 'read:book', 'PositionPage', 'Open paper positions.'),
  fills: get('/book/fills', 'read:book', 'FillPage', 'Paper fills, newest first.'),
  intents: get('/book/intents', 'read:book', 'IntentPage', 'Orders the strategies asked for and what the risk guard said, newest first.', { ok: f('`true` for allowed, `false` for blocked.', one('true', 'false')) }),
  risk: get('/risk', 'read:book', 'Risk', 'Limits with their ceilings, halts, exposure and drift.'),
  queue: get('/queue', 'read:board', 'Queue', 'The weekly budget of tries and what was registered against it.'),
  dataHealth: get('/data/health', 'read:data', 'DataHealthPage', 'One row a dataset: status, range and warnings.'),
  costs: get('/costs', 'read:data', 'Costs', 'The cost model in force.'),
  reports: get('/reports', 'read:reports', 'ReportRowPage', 'Runs, newest first.'),
  report: get('/reports/{id}', 'read:reports', 'Report', 'One run with its report text. `format=md` returns the Markdown alone.', { format: f('`md` for Markdown.', one('json', 'md')) }),
  ledger: get('/ledger', 'read:ledger', 'LedgerRowPage', 'Ledger entries, newest first.', { kind: f('One entry kind.'), slot: f('One slot key.'), from: f('Only entries at or after this time.', time), to: f('Only entries at or before this time.', time) }),
  ledgerHead: get('/ledger/head', 'read:ledger', 'LedgerHead', 'The head sequence number and hash, and the last anchor.'),
  ledgerVerify: get('/ledger/verify', 'read:ledger', 'LedgerVerify', 'Recompute the hash chain over a range. At most 5,000 entries a call.', { from: f('First sequence number. Default 1.', int), to: f('Last sequence number. Default: 4,999 after `from`, or the head.', int) }),
  ledgerEntry: get('/ledger/{seq}', 'read:ledger', 'LedgerEntry', 'One entry with its payload.'),
  claimChecks: get('/claim-checks', 'queue:claims', 'ClaimCheckRowPage', 'Claim checks, newest first.'),
  claimCheck: get('/claim-checks/{id}', 'queue:claims', 'ClaimCheck', 'One claim check as the ledger holds it. The source text is never stored, so it is not here.'),
  claimCheckStart: { method: 'POST', path: '/claim-checks', scope: 'queue:claims', summary: 'Run a claim check. It uses tries from the weekly budget. Refused while anything is halted.', response: 'ClaimCheckAccepted', status: 202, body: 'ClaimCheckBody' },
  halt: { method: 'POST', path: '/halt', scope: 'halt', summary: 'Pull the andon cord. Safe to repeat. There is no route that releases it.', response: 'HaltResult', body: 'HaltBody' },
} as const satisfies Record<string, RouteDef>;
export type RouteId = keyof typeof ROUTES;
export const ROUTE_IDS = Object.keys(ROUTES) as RouteId[];
export const routeClass = (r: RouteDef): RouteClass => r.method === 'GET' ? 'read' : r.scope === 'halt' ? 'halt' : 'queue';
export const pathParams = (path: string) => [...path.matchAll(/\{(\w+)\}/g)].map(m => m[1]);

export interface Responses {
  status: Status; funnel: Funnel; board: Page<Evaluation>; pair: EvaluationDetail; slots: Page<Slot>; slot: SlotDetail; slotTrades: Page<Trade>; slotEvents: Page<SlotEvent>; slotDrift: Page<DriftReading>; locks: Locks;
  book: Book; positions: Page<Position>; fills: Page<Fill>; intents: Page<Intent>; risk: Risk; queue: Queue; dataHealth: Page<DataHealth>; costs: Costs; reports: Page<ReportRow>; report: Report;
  ledger: Page<LedgerRow>; ledgerHead: LedgerHead; ledgerVerify: LedgerVerify; ledgerEntry: LedgerEntry; claimChecks: Page<ClaimCheckRow>; claimCheck: ClaimCheck; claimCheckStart: ClaimCheckAccepted; halt: HaltResult;
}
export interface Bodies { claimCheckStart: ClaimCheckBody; halt: HaltBody }

/** Find the route for a method and a path below `/api/v1`. A fixed segment wins over a `{param}` one. */
export function matchRoute(method: string, path: string): { id: RouteId; params: Record<string, string> } | null {
  const segs = path.split('/').filter(Boolean); let best: { id: RouteId; params: Record<string, string>; fixed: number } | null = null;
  for (const id of ROUTE_IDS) { const r: RouteDef = ROUTES[id], want = r.path.split('/').filter(Boolean); if (r.method !== method || want.length !== segs.length) continue;
    const params: Record<string, string> = {}; let fixed = 0, ok = true;
    for (let i = 0; i < want.length && ok; i++) { const m = /^\{(\w+)\}$/.exec(want[i]); if (m) { try { params[m[1]] = decodeURIComponent(segs[i]); } catch { ok = false; } } else if (want[i] === segs[i]) fixed++; else ok = false; }
    if (ok && (!best || fixed > best.fixed)) best = { id, params, fixed }; }
  return best && { id: best.id, params: best.params };
}
