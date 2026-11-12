// The executor's seven steps (docs/design/02 s6), plus the freshness check in front of them. Red path.
// For one intent from the ledger it runs every step in order and stops at the first failure. Everything it touches is passed
// in (ledger entries, broker, journal, signature, fetch, clock, environment), so the tests run with no network and no real key.
// Rules this file must keep (each has a test):
//  - Fail closed. Unknown, unreadable or unreachable is a refusal, and a dashboard that cannot be read means halted.
//  - The journal is written before the broker is called, and the fill before it is posted. A failed post is retried from
//    the journal and never sent to the broker again.
//  - A rehearsal never reaches a venue: it runs only with the rehearsal broker, which records and does not send.
//  - Size comes from checkIntent only, at the approved stage's share of the paper-sized risk, capped by the approval. Only
//    micro_live (at most 1%) is sent until a scale check exists.
//  - The chain is always verified from genesis. Anchors and saved heads add checks; they never shorten one.
//  - An intent reaches the broker at most once, even with two runs at once: the journal's claim is atomic.
import { checkIntent, clampLimits, DEFAULT_LIMITS, type AssetClass, type BookView, type GuardedIntent, type Intent, type OpenPosition } from '@apex/kernel/guard';
import { GATE_V1 } from '@apex/kernel/gate';
import { verifyChain, type LedgerEntry } from '@apex/kernel/ledger';
import { liveAllowed, lockFactsOf, serverLocksOpen, STAGES, verifyApproval } from '@apex/kernel/locks';
import { buildView, liveFillProblems, type LedgerView } from '@apex/kernel/view';
import { EXECUTOR_KEY_MIN, EXECUTOR_SIG_HEADER, EXECUTOR_TS_HEADER, signExecutor } from '@apex/kernel/executor-auth';
import { intentId } from '@apex/autopilot/pipeline';
import { TF_MS } from '@apex/data/types';
import { DryRunBroker, type LiveBroker, type LiveOrder, type Mirror } from './broker';
import { peakEquity, pendingPosts, seenBefore, type Journal, type JournalRecord, type Mode } from './journal';
import type { SignatureFile } from './signature';

export type Env = Record<string, string | undefined>;
export const STEP_IDS = ['fresh', 'chain-and-locks', 'halts', 'not-sent', 'reconcile', 'guard', 'place', 'post'] as const;
export type Step = { n: number; id: typeof STEP_IDS[number]; ok: boolean; detail: string };
/** stale and duplicate are final: the intent will never be sent. refused may pass on a later run while the intent is still fresh. */
export type Outcome = 'sent' | 'rehearsed' | 'refused' | 'stale' | 'duplicate' | 'unconfirmed';
export type ExecResult = { sent: boolean; outcome: Outcome; steps: Step[]; order?: GuardedIntent };
export type Post = { env: Env; now: () => number; fetch: typeof fetch; timeoutMs?: number };
export type ExecDeps = Post & {
  mode: Mode; entries: LedgerEntry[]; capital: number;
  broker: LiveBroker; journal: Journal; signature: (slotKey: string) => SignatureFile | null;
  pullAndon: (reason: string) => Promise<void>;
  /** Heads saved outside the ledger, when this machine has them. */
  heads?: () => SavedHeads;
};

const DAY = 864e5, isoWeek = (t: number) => Math.floor((t / DAY + 3) / 7);
const iso = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The dashboard's base address. https only, except on this machine's loopback. Anything else is treated as not set. */
export function dashboardBase(env: Env): string | null {
  try { const u = new URL(String(env.APEX_DASHBOARD_URL ?? ''));
    if (u.username || u.password || !(u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname)))) return null;
    return u.origin + u.pathname.replace(/\/+$/, ''); } catch { return null; }
}

/** Heads saved outside the ledger by `apex ledger anchor` (state/heads/*.json). A file that cannot be read is listed by name. */
export type SavedHeads = { heads: { seq: number; hash: string; date: string }[]; unreadable: string[] };

/**
 * Step 1's chain check. Always from genesis through `through`: an anchor is read from the ledger it vouches for, so it can only
 * add a check, never stand in for the entries before it (lockFactsOf reads those). Every anchor entry and every saved head must
 * match the entry at its seq.
 */
export function verifyLedger(entries: LedgerEntry[], through: number, saved: SavedHeads = { heads: [], unreadable: [] }): { ok: boolean; why: string } {
  const part = entries.filter(x => x.seq <= through);
  if (!part.length || part[part.length - 1].seq !== through) return { ok: false, why: 'the ledger read does not reach the intent' };
  const v = verifyChain(part, null);
  if (!v.ok) return { ok: false, why: `chain broken at seq ${v.badSeq}: ${v.why}` };
  const at = (seq: unknown) => (Number.isSafeInteger(seq) ? entries.find(x => x.seq === seq) : undefined);
  for (const x of part) if (x.kind === 'anchor' && at(x.payload?.seq)?.hash !== x.payload?.hash) return { ok: false, why: `anchor entry ${x.seq} names a head that is not in the ledger` };
  if (saved.unreadable.length) return { ok: false, why: `the saved head ${saved.unreadable[0]} cannot be read` };
  for (const h of saved.heads) if (at(h.seq)?.hash !== h.hash) return { ok: false, why: `the head saved on ${h.date} does not match entry ${h.seq}: the ledger was changed after that day` };
  const n = part.filter(x => x.kind === 'anchor').length + saved.heads.length;
  return { ok: true, why: `chain verified from genesis through seq ${through}${n ? `, and ${n} anchored head(s) match` : ''}` };
}

/** The live book as the guard sees it: positions from live_fill entries, the stop from each one's intent, P&L from live trades. */
export function liveBookView(v: LedgerView, entries: LedgerEntry[], equity: number, peak: number, at: number): BookView {
  const stops = new Map<string, number>(); for (const e of entries) if (e.kind === 'intent') stops.set(String(e.payload?.id), Number(e.payload?.stop));
  const positions: OpenPosition[] = [...v.live.positions.values()].map(p => {
    const s = v.slots.get(p.slotKey), stop = stops.get(p.intent), known = typeof stop === 'number' && Number.isFinite(stop) && stop > 0;
    // A stop that cannot be found counts the whole notional as at risk.
    return { slotKey: p.slotKey, symbol: p.symbol, assetClass: (s?.assetClass ?? 'stock') as AssetClass, side: p.side, qty: p.qty, entry: p.entry, stop: known ? stop! : 0, riskUsd: known ? Math.abs(p.entry - stop!) * p.qty : p.entry * p.qty };
  });
  let dayPnl = 0, weekPnl = 0; const day = Math.floor(at / DAY), wk = isoWeek(at);
  for (const c of v.live.closed) { if (Math.floor(c.exitT / DAY) === day) dayPnl += c.pnl; if (isoWeek(c.exitT) === wk) weekPnl += c.pnl; }
  return { equity, peak: Math.max(peak, equity), positions, pendingSlots: [], dayPnl, dayStartEquity: equity - dayPnl, weekPnl, weekStartEquity: equity - weekPnl, drawdownPaused: v.drawdownPaused };
}

/** What the rehearsal reads when there is no adapter: the live book, with its stops resting, and the paper capital. */
export function mirrorOf(entries: LedgerEntry[], capital: number, at: number): Mirror {
  const v = buildView(entries, capital), positions = liveBookView(v, entries, capital, capital, at).positions;
  return { positions, openOrders: positions.map(p => ({ id: `mirror-stop-${p.slotKey}`, slotKey: p.slotKey, kind: 'stop' as const, side: (-p.side) as 1 | -1, qty: p.qty })), equity: capital };
}

/** Every way the broker and the live book disagree. Empty means they match. Every live position must have a stop resting that covers it. */
export function reconcile(positions: OpenPosition[], orders: LiveOrder[], v: LedgerView): string[] {
  const out: string[] = [], book = v.live.positions, seen = new Set<string>();
  if (v.live.unmatched > 0) out.push(`${v.live.unmatched} live fill(s) do not fit the live book`);
  for (const p of positions) {
    if (seen.has(p.slotKey)) { out.push(`the broker reports two positions for ${p.slotKey}`); continue; }
    seen.add(p.slotKey); const b = book.get(p.slotKey);
    if (!b) { out.push(`the broker holds ${p.symbol} for ${p.slotKey}; the live book does not`); continue; }
    if (b.symbol !== p.symbol || b.side !== p.side || !(Math.abs(b.qty - p.qty) <= 1e-9 * Math.max(1, b.qty))) out.push(`${p.slotKey}: broker ${p.side} ${p.qty} ${p.symbol}, live book ${b.side} ${b.qty} ${b.symbol}`);
  }
  for (const k of book.keys()) if (!seen.has(k)) out.push(`the live book holds ${k}; the broker does not`);
  for (const o of orders) {
    if (!o || !['entry', 'stop', 'target'].includes(o.kind) || (o.side !== 1 && o.side !== -1) || !(Number(o.qty) > 0)) out.push(`open order ${o?.id} for ${o?.slotKey} has no readable kind, side or quantity`);
    else if (!book.has(o.slotKey)) out.push(`open order ${o.id} for ${o.slotKey}, which holds no live position`);
  }
  for (const [k, b] of book) if (!orders.some(o => o?.slotKey === k && o.kind === 'stop' && o.side === -b.side && o.qty >= b.qty * (1 - 1e-9))) out.push(`${k} has no stop resting at the broker that covers its ${b.qty}`);
  return out;
}

/** Halts from the dashboard and from the ledger. Unreachable, unreadable or anything but a clear "not halted" is halted. */
export async function readHalts(d: Post, v: LedgerView): Promise<{ halted: boolean; detail: string }> {
  const base = dashboardBase(d.env);
  if (!base) return { halted: true, detail: 'APEX_DASHBOARD_URL is not an https address, so the halt state cannot be read: treated as halted' };
  let j: any;
  try { const r = await d.fetch(`${base}/api/status`, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(d.timeoutMs ?? 5000) });
    if (!r.ok) return { halted: true, detail: `the dashboard answered ${r.status}: treated as halted` };
    j = await r.json(); }
  catch { return { halted: true, detail: 'the dashboard could not be reached or read: treated as halted' }; }
  if (!j || j.halted !== false || !Array.isArray(j.halts) || j.halts.length) {
    const levels = Array.isArray(j?.halts) ? j.halts.map((h: any) => String(h?.level)).join(', ') : '';
    return { halted: true, detail: `the dashboard reports a halt${levels ? ` (${levels})` : ' or an answer that is not a clear no'}` };
  }
  const ledger = v.halts.map(h => h.level); if (v.drawdownPaused && !ledger.includes('book-drawdown')) ledger.push('book-drawdown');
  if (ledger.length) return { halted: true, detail: `the ledger has an active halt: ${ledger.join(', ')}` };
  return { halted: false, detail: 'no halt on the dashboard or in the ledger' };
}

/** Post one fill body to the dashboard, signed with APEX_EXECUTOR_KEY. Only the signature travels, never the key. */
export async function postFill(d: Post, body: string): Promise<{ ok: true } | { ok: false; why: string }> {
  const key = d.env.APEX_EXECUTOR_KEY, base = dashboardBase(d.env);
  if (typeof key !== 'string' || key.length < EXECUTOR_KEY_MIN) return { ok: false, why: `APEX_EXECUTOR_KEY is not set or shorter than ${EXECUTOR_KEY_MIN} characters` };
  if (!base) return { ok: false, why: 'APEX_DASHBOARD_URL is not an https address' };
  const ts = String(Math.floor(d.now()));
  try {
    const r = await d.fetch(`${base}/api/executor/fill`, { method: 'POST', body, signal: AbortSignal.timeout(d.timeoutMs ?? 5000),
      headers: { 'content-type': 'application/json', [EXECUTOR_TS_HEADER]: ts, [EXECUTOR_SIG_HEADER]: signExecutor(key, ts, body) } });
    const j: any = await r.json().catch(() => null);
    return r.ok && j?.ok === true ? { ok: true } : { ok: false, why: `the dashboard answered ${r.status}${typeof j?.error === 'string' ? `: ${j.error.slice(0, 200)}` : ''}` };
  } catch { return { ok: false, why: 'the dashboard could not be reached' }; }
}

/** Post every fill the journal holds that the dashboard has not taken. Never touches the broker. */
export async function retryPosts(d: Post & { journal: Journal }): Promise<{ posted: number; failed: string[] }> {
  let posted = 0; const failed: string[] = [];
  for (const p of pendingPosts(d.journal.read())) {
    const r = await postFill(d, p.body);
    if (r.ok) { d.journal.append({ type: 'posted', mode: 'live', at: Math.floor(d.now()), id: p.id, body: p.body }); posted++; } else failed.push(`${p.id.slice(0, 12)}: ${r.why}`);
  }
  return { posted, failed };
}

/** Intents the executor should look at: after the slot's approval and after this mode's cursor, for slots with locks 1 to 3 open. */
export function pendingIntents(entries: LedgerEntry[], capital: number, cursor: number, now: number): LedgerEntry[] {
  const v = buildView(entries, capital), out: LedgerEntry[] = [], facts = new Map<string, ReturnType<typeof lockFactsOf>>();
  for (const e of entries) {
    if (e.kind !== 'intent' || e.seq <= cursor) continue;
    const k = String(e.payload?.slotKey); if (!v.slots.has(k)) continue;
    if (!facts.has(k)) facts.set(k, lockFactsOf(v, entries, k));
    const f = facts.get(k)!; if (f.approval && e.seq > f.approval.seq && serverLocksOpen(k, f, now)) out.push(e);
  }
  return out;
}

export async function executeIntent(d: ExecDeps, e: LedgerEntry): Promise<ExecResult> {
  const steps: Step[] = [], now = Math.floor(d.now()), p = e?.payload ?? {}, live = d.mode === 'live';
  const step = (n: number, ok: boolean, detail: string) => { steps.push({ n, id: STEP_IDS[n], ok, detail }); return ok; };
  const done = (outcome: Outcome, sent = false, order?: GuardedIntent): ExecResult => ({ sent, outcome, steps, order });
  const refuse = (n: number, detail: string, outcome: Outcome = 'refused') => { step(n, false, detail); return done(outcome); };
  const andon = async (reason: string) => { try { await d.pullAndon(reason); return 'the andon cord is pulled'; } catch { return 'pulling the andon cord FAILED as well: pull it by hand'; } };

  // A rehearsal runs only with the rehearsal broker, and live never does, so a live adapter can never be handed to a rehearsal.
  const dry = d.broker instanceof DryRunBroker;
  if (live === dry) return refuse(0, live ? 'live mode refuses the rehearsal broker' : 'a rehearsal runs only with the rehearsal broker, never a live adapter');
  let v: LedgerView; try { v = buildView(d.entries, d.capital); } catch { return refuse(0, 'the ledger could not be replayed'); }

  // ---- 0. The intent is the paper pipeline's, for an approved slot, and its signal bar is the most recent closed bar ----
  if (e?.kind !== 'intent' || e.actor !== 'autopilot' || p.mode !== 'paper') return refuse(0, 'not an intent written by the paper pipeline');
  const slot = v.slots.get(p.slotKey), tf = slot ? (TF_MS as Record<string, number>)[slot.tf] : undefined;
  if (!slot || !tf) return refuse(0, 'the slot or its timeframe is unknown');
  if (p.symbol !== slot.symbol || p.assetClass !== slot.assetClass || (p.side !== 1 && p.side !== -1)) return refuse(0, 'the intent\'s symbol, asset class or side does not fit its slot');
  const facts = lockFactsOf(v, d.entries, p.slotKey), a = facts.approval;
  if (!a || a.slotKey !== p.slotKey) return refuse(0, 'there is no live approval for this slot');
  if (e.seq <= a.seq) return refuse(0, 'the intent is older than the approval');
  if (!Number.isSafeInteger(p.barT) || now < p.barT + tf) return refuse(0, 'the signal bar has not closed yet');
  if (now >= p.barT + 2 * tf) return refuse(0, `stale: the signal bar (${iso(p.barT)}) is no longer the most recent closed ${slot.tf} bar; a late entry is never sent`, 'stale');
  step(0, true, `the signal bar ${iso(p.barT)} is the most recent closed ${slot.tf} bar`);

  // ---- 1. The chain from the last anchor through the intent, and all four locks ----
  let heads: SavedHeads | undefined; try { heads = d.heads?.(); } catch { heads = { heads: [], unreadable: ['(the heads folder)'] }; }
  const chain = verifyLedger(d.entries, e.seq, heads);
  if (!chain.ok) return refuse(1, chain.why);
  const key = d.env.APEX_SIGNOFF_KEY ?? '', sig = d.signature(p.slotKey);
  const signatureValid = !!sig && sig.approvalSeq === a.seq && sig.approvalHash === a.hash && sig.expiresAt === a.expiresAt && verifyApproval(key, a.hash, sig.signature);
  let flag = false; try { flag = d.broker.liveFlag() === true; } catch { flag = false; }
  const envFlag = d.env.APEX_ALLOW_LIVE === 'yes', allowLive = envFlag && flag && d.broker.mode === 'live';
  const locks = liveAllowed(p.slotKey, { ...facts, machine: { allowLive, signatureValid } }, now).locks;
  const missing = [...locks.slice(0, 3).filter(l => !l.open).map(l => `${l.id}: ${l.why}`),
    ...(key.length < 32 ? ['APEX_SIGNOFF_KEY is missing or shorter than 32 characters'] : !sig ? ['no signature file for this slot: run apex-executor sign'] : !signatureValid ? ['the signature does not match this approval'] : []),
    ...(live && !envFlag ? ['APEX_ALLOW_LIVE is not yes on this machine'] : []), ...(live && !flag ? ['the broker\'s own live flag is off'] : []),
    ...(live && d.broker.mode !== 'live' ? ['the broker adapter is not in live mode'] : [])];
  const open = live ? locks.every(l => l.open) : locks.slice(0, 3).every(l => l.open) && signatureValid;
  if (!open || missing.length) return refuse(1, `${chain.why}; locks closed: ${missing.join('; ') || `machine: ${locks[3].why}`}`);
  step(1, true, `${chain.why}; ${live ? 'all four locks are open' : 'locks 1 to 3 are open and the signature is valid (rehearsal: the live flags are not needed)'}`);

  // ---- 2. Halts. The executor key is checked here as well: an order whose fill cannot be reported is not placed ----
  const h = await readHalts(d, v);
  if (h.halted) return refuse(2, h.detail);
  if (live && !((d.env.APEX_EXECUTOR_KEY ?? '').length >= EXECUTOR_KEY_MIN)) return refuse(2, `APEX_EXECUTOR_KEY is not set or shorter than ${EXECUTOR_KEY_MIN} characters, so a fill could not be reported`);
  step(2, true, h.detail);

  // ---- 3. Not sent before: the id, the journal, the ledger's live fills and the broker's client order ids ----
  if (p.id !== intentId(p.slotKey, p.barT, p.side)) return refuse(3, 'the intent id is not sha256(slot key, bar time, side)');
  let rows: JournalRecord[]; try { rows = d.journal.read(); } catch (err) { return refuse(3, `the local journal cannot be read (${(err as Error).message}), so nothing is sent`); }
  if (seenBefore(rows, p.id, d.mode)) return refuse(3, 'the journal already has this intent', 'duplicate');
  if (d.entries.some(x => x.kind === 'live_fill' && x.payload?.intent === p.id)) return refuse(3, 'the ledger already has a live fill for this intent', 'duplicate');
  let ids: unknown; try { ids = await d.broker.clientOrderIds(); } catch { ids = null; }
  if (!Array.isArray(ids)) return refuse(3, 'the broker\'s client order ids could not be read');
  if (ids.includes(p.id)) return refuse(3, 'the broker already has an order with this client order id', 'duplicate');
  step(3, true, 'not in the journal, the ledger or at the broker');

  // ---- 4. Reconcile the broker against the live book ----
  let pos: OpenPosition[], ord: LiveOrder[];
  try { [pos, ord] = await Promise.all([d.broker.positions(), d.broker.openOrders()]); if (!Array.isArray(pos) || !Array.isArray(ord)) throw new Error('not a list'); }
  catch { return refuse(4, 'the broker\'s positions or open orders could not be read'); }
  const diff = reconcile(pos, ord, v);
  if (diff.length) return refuse(4, `the broker and the live book disagree: ${diff.join('; ')}; ${await andon(`executor: the broker and the live book disagree: ${diff.join('; ')}`)}`);
  step(4, true, dry && !(d.broker as DryRunBroker).hasAdapter ? 'rehearsal without an adapter: the live book stands in for the broker' : `the broker matches the live book (${pos.length} position(s))`);

  // ---- 5. The guard, again, with the broker's equity and the stage's size ----
  // Only the first stage, at most 1% of the paper-sized risk, until a scale check exists. The ledger takes any writer's approval.
  const stage = STAGES[0];
  if (a.stage !== stage.id) return refuse(5, `the approval names stage ${a.stage}; only ${stage.id} is sent until a scale check exists`);
  if (!(a.sizeCap > 0) || a.sizeCap > stage.size) return refuse(5, `the approval's size cap ${a.sizeCap} is outside 0 to ${stage.size} of the paper-sized risk`);
  const share = Math.min(stage.size, a.sizeCap), paperRf = Number(p.riskFraction);
  if (!Number.isFinite(paperRf) || paperRf <= 0) return refuse(5, 'the intent carries no paper risk fraction');
  let equity = NaN; try { equity = Number(await d.broker.equity()); } catch { equity = NaN; }
  if (!Number.isFinite(equity) || equity <= 0) return refuse(5, 'the broker\'s equity could not be read');
  let lot: { lotStep: number; minQty: number }; try { lot = d.broker.lot(p.symbol, p.assetClass); } catch { return refuse(5, 'the broker\'s lot size could not be read'); }
  const book = liveBookView(v, d.entries, equity, peakEquity(rows, d.mode), now), dv = v.dataVersions.get(slot.dataset);
  const lastStop = v.live.closed.filter(c => c.slotKey === p.slotKey && (c.reason === 'stop' || c.reason === 'trail')).pop();
  const intent: Intent = { id: p.id, slotKey: p.slotKey, symbol: p.symbol, assetClass: p.assetClass, side: p.side, barT: p.barT, refPrice: Number(p.refPrice), stop: Number(p.stop),
    target: typeof p.target === 'number' ? p.target : null, riskFraction: paperRf * share };
  const r = checkIntent(intent, book, clampLimits(v.limits?.limits ?? DEFAULT_LIMITS), {
    halts: { readable: true, kill: false, andon: false }, slot: { status: slot.status, role: slot.role, weight: slot.weight, barsSinceStop: lastStop ? Math.max(0, Math.floor((p.barT - lastStop.exitT) / tf)) : null },
    dataStatus: !dv || dv.tradable === false || dv.status === 'blocked' ? 'blocked' : dv.status === 'warn' ? 'warn' : 'ok',
    correlatedSymbols: book.positions.map(x => x.symbol),               // no return series here, so every open live symbol counts as correlated
    lotStep: lot.lotStep, minQty: lot.minQty, minRiskShareAfterCap: GATE_V1.guard.minRiskShareAfterCap, live: { reconciled: true } });
  if (!r.ok || !r.intent) return refuse(5, `the guard blocks it: ${r.rules.filter(x => !x.pass).map(x => `${x.id} (${x.detail})`).join('; ')}`);
  const order = r.intent;
  step(5, true, `qty ${order.qty}, risk ${order.riskUsd.toFixed(4)} on equity ${equity.toFixed(2)}: ${+(share * 100).toFixed(4)}% of the paper-sized risk (${stage.id}, cap ${a.sizeCap})`);
  const plain = { ...order };

  // ---- 6. One bracket order. A rehearsal records it and stops here ----
  if (!live) {
    try { await d.broker.submitBracket(order); d.journal.append({ type: 'rehearsal', mode: 'rehearsal', at: now, id: p.id, slotKey: p.slotKey, equity, order: plain }); }
    catch (err) { return refuse(6, `the rehearsal could not be recorded (${(err as Error).message})`); }
    step(6, true, 'rehearsal: written to the journal as what would have been sent; nothing was sent');
    return done('rehearsed', false, order);
  }
  // The claim is atomic across processes, so two runs at once cannot both reach the broker with this intent.
  let claimed = false; try { claimed = d.journal.claim(p.id) === true; } catch (err) { return refuse(6, `the intent could not be claimed in the journal (${(err as Error).message}), so nothing was sent`); }
  if (!claimed) return refuse(6, 'another run already claimed this intent; it is never sent twice', 'duplicate');
  try { d.journal.append({ type: 'submitting', mode: 'live', at: now, id: p.id, slotKey: p.slotKey, equity, order: plain }); }
  catch (err) { return refuse(6, `the journal could not be written (${(err as Error).message}), so nothing was sent`); }
  let ack: Awaited<ReturnType<LiveBroker['submitBracket']>> | null = null;
  try { ack = await d.broker.submitBracket(order); } catch { ack = null; }
  const note = (type: JournalRecord['type'], extra: Record<string, unknown>) => { try { d.journal.append({ type, mode: 'live', at: Math.floor(d.now()), id: p.id, ...extra }); } catch { /* the submitting record already blocks a resend */ } };
  if (!ack) { note('unconfirmed', {}); step(6, false, `the broker did not answer; the order's state is unknown and it will not be sent again; ${await andon(`executor: no answer from the broker for ${p.slotKey}; its state is unknown`)}`); return done('unconfirmed'); }
  if (!ack.accepted) { note('refused', { why: String(ack.why ?? '') }); return refuse(6, `the broker refused the order${ack.why ? `: ${ack.why}` : ''}`); }
  if (ack.stopResting !== true) {
    let cancelled = false; try { cancelled = (await d.broker.cancel(ack.brokerOrderId)) === true; } catch { cancelled = false; }
    note('cancelled', { brokerOrderId: ack.brokerOrderId, cancelled });
    return refuse(6, `the broker did not confirm a resting stop; the entry was ${cancelled ? 'cancelled' : 'NOT confirmed cancelled'}; ${await andon(`executor: no resting stop confirmed for ${p.slotKey}; entry ${cancelled ? 'cancelled' : 'cancel not confirmed'}`)}`);
  }
  note('sent', { brokerOrderId: ack.brokerOrderId, equity });
  step(6, true, `placed with a hard stop resting at the broker (order ${ack.brokerOrderId})`);

  // ---- 7. Post the fill back. Journal first, so a failed post is retried and never resent to the broker ----
  if (!ack.entry) { step(7, false, 'the broker has not reported the entry fill, so there is nothing to post yet'); return done('sent', true, order); }
  const fill = { intent: p.id, slotKey: p.slotKey, symbol: p.symbol, side: p.side, kind: 'entry', t: Math.floor(ack.entry.t), price: ack.entry.price, qty: ack.entry.qty, fee: ack.entry.fee, brokerOrderId: ack.brokerOrderId, stage: a.stage };
  const bad = liveFillProblems(fill);
  if (bad.length) { step(7, false, `the broker's fill cannot be recorded (${bad.join('; ')}); ${await andon(`executor: an unrecordable fill for ${p.slotKey}`)}`); return done('sent', true, order); }
  const body = JSON.stringify(fill);
  let saved = true; try { d.journal.append({ type: 'fill', mode: 'live', at: Math.floor(d.now()), id: p.id, body }); } catch { saved = false; }
  const posted = await postFill(d, body);
  if (!posted.ok && !saved) { step(7, false, `not posted (${posted.why}) and not saved to the journal; ${await andon(`executor: a fill for ${p.slotKey} could be neither saved nor posted`)}`); return done('sent', true, order); }
  if (!posted.ok) { step(7, false, `not posted (${posted.why}); the fill is in the journal and is posted again on the next run, never sent to the broker again`); return done('sent', true, order); }
  note('posted', { body });
  step(7, true, 'the fill was posted to the dashboard, which writes it to the ledger');
  return done('sent', true, order);
}
