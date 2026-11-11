// Trial ledger: append-only, hash-chained (docs/design/04 s3 and s4). Red path.
// The ledger is the system of record. Every other table or view is a projection that can be rebuilt by replaying it.
import { canonicalJson, normalise, sha256 } from './canonical';

export const LEDGER_KINDS = ['config_snapshot', 'gate_version', 'data_version', 'strategy_registered', 'prereg', 'trial_result', 'skipped_data',
  'validator_run', 'slot_locked', 'slot_status', 'weights', 'intent', 'intent_blocked', 'fill', 'book_snapshot', 'drift_reading', 'cost_model',
  'graduation_check', 'live_approval', 'live_stage', 'halt', 'resume', 'limit_change_pending', 'claim_check', 'anchor', 'run'] as const;
export type LedgerKind = typeof LEDGER_KINDS[number];
export type LedgerEntry = { seq: number; ts: number; kind: LedgerKind; actor: string; payload: any; payloadHash: string; prevHash: string; hash: string };
export type Head = { seq: number; hash: string };
export const GENESIS = '0'.repeat(64);

/** Fields each kind must carry. A payload missing one is refused before it can reach the chain. */
export const REQUIRED: Partial<Record<LedgerKind, string[]>> = {
  gate_version: ['version', 'config'],
  data_version: ['dataset', 'version', 'rows', 'status'],
  prereg: ['trialKey', 'hypothesis', 'source', 'strategy', 'panel', 'tf', 'gateVersion', 'passBar'],
  trial_result: ['trialKey', 'gateVersion', 'inputs', 'inputHash', 'resultHash', 'status'],
  skipped_data: ['dataset', 'reason'],
  validator_run: ['trialKey', 'level', 'inputHash', 'resultHash', 'agrees'],
  slot_locked: ['slotKey', 'trialKey', 'inputs', 'inputHash', 'lockedAt', 'gateVersion', 'role'],
  slot_status: ['slotKey', 'from', 'to', 'reason'],
  weights: ['weights', 'method'],
  intent: ['id', 'slotKey', 'symbol', 'side', 'barT', 'qty', 'riskUsd', 'stop', 'rules'],
  intent_blocked: ['id', 'slotKey', 'symbol', 'side', 'barT', 'rules'],
  fill: ['intent', 'slotKey', 'kind', 't', 'price', 'qty'],
  book_snapshot: ['at', 'equity', 'cash', 'peak', 'cursors'],
  drift_reading: ['slotKey', 'n', 's'],
  graduation_check: ['slotKey', 'state', 'm', 'n'],
  halt: ['level', 'by', 'reason'],
  resume: ['level', 'by'],
  anchor: ['seq', 'hash'],
};

const SECRET = /sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abp]-[A-Za-z0-9-]{20,}|\b\d{8,}:[A-Za-z0-9_-]{35}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export function entryHash(e: Pick<LedgerEntry, 'seq' | 'ts' | 'kind' | 'actor' | 'payloadHash' | 'prevHash'>) {
  return sha256(`${e.prevHash}|${e.seq}|${e.ts}|${e.kind}|${e.actor}|${e.payloadHash}`);
}

export function makeEntry(prev: Head | null, ts: number, kind: LedgerKind, actor: string, payload: object): LedgerEntry {
  if (!LEDGER_KINDS.includes(kind)) throw new Error(`ledger: unknown kind ${kind}`);
  if (!Number.isInteger(ts) || ts <= 0) throw new Error('ledger: ts must be integer milliseconds');
  if (!actor || /[|\n]/.test(actor)) throw new Error('ledger: bad actor');
  const canon = canonicalJson(payload);
  if (SECRET.test(canon)) throw new Error('ledger: payload looks like it contains a secret; refused (S14)');
  const stored = JSON.parse(canon);
  for (const k of REQUIRED[kind] ?? []) if (stored[k] === undefined || stored[k] === null) throw new Error(`ledger: ${kind} is missing ${k}`);
  const e = { seq: (prev?.seq ?? 0) + 1, ts, kind, actor, payload: stored, payloadHash: sha256(canon), prevHash: prev?.hash ?? GENESIS, hash: '' };
  e.hash = entryHash(e);
  return e;
}

/** Recompute every hash. Returns the first bad seq, if any. `from` is the entry before entries[0] (omit when starting at seq 1). */
export function verifyChain(entries: LedgerEntry[], from: Head | null = null): { ok: boolean; badSeq?: number; why?: string; head: Head | null } {
  let prev = from;
  for (const e of entries) {
    const bad = (why: string) => ({ ok: false, badSeq: e.seq, why, head: prev });
    if (e.seq !== (prev?.seq ?? 0) + 1) return bad(`sequence gap: expected ${(prev?.seq ?? 0) + 1}`);
    if (e.prevHash !== (prev?.hash ?? GENESIS)) return bad('prevHash does not match the entry before it');
    if (sha256(canonicalJson(e.payload)) !== e.payloadHash) return bad('payload was changed after it was written');
    if (entryHash(e) !== e.hash) return bad('entry hash does not match its fields');
    prev = { seq: e.seq, hash: e.hash };
  }
  return { ok: true, head: prev };
}

/** Storage contract. `append` must be atomic and must refuse an entry whose seq is not head+1 or whose prevHash is not the head hash. */
export interface LedgerStore {
  head(): Promise<Head | null>;
  append(e: LedgerEntry): Promise<void>;
  read(fromSeq?: number, toSeq?: number): Promise<LedgerEntry[]>;
  /** True when the entries survive a restart. The autopilot refuses to open paper orders on a ledger that can vanish. */
  durable: boolean;
}
export class LedgerConflict extends Error { constructor() { super('ledger: another writer appended first'); } }

/** In-memory store: unit tests, and the base of the file store. */
export class MemoryLedgerStore implements LedgerStore {
  durable = false;
  constructor(protected rows: LedgerEntry[] = []) {}
  async head() { const l = this.rows[this.rows.length - 1]; return l ? { seq: l.seq, hash: l.hash } : null; }
  async append(e: LedgerEntry) {
    const l = this.rows[this.rows.length - 1];                    // no await between the check and the push: this is the atomic step
    if (e.seq !== (l?.seq ?? 0) + 1 || e.prevHash !== (l?.hash ?? GENESIS)) throw new LedgerConflict();
    this.rows.push(Object.freeze({ ...e }));
  }
  async read(fromSeq = 1, toSeq = Infinity) { return this.rows.filter(e => e.seq >= fromSeq && e.seq <= toSeq); }
}

export type Append = { kind: LedgerKind; actor?: string; payload: object };

/**
 * The only way to write. Enforces S9: a trial_result (or claim_check, validator_run) is refused unless a prereg with the same
 * trialKey and gateVersion has a lower sequence number.
 */
export class Ledger {
  private preregs = new Map<string, string>();     // trialKey -> gateVersion
  private loadedTo = 0;
  constructor(public store: LedgerStore, private clock: () => number = Date.now) {}

  private index(e: LedgerEntry) { if (e.kind === 'prereg') this.preregs.set(e.payload.trialKey, e.payload.gateVersion); this.loadedTo = e.seq; }
  private async sync() { for (const e of await this.store.read(this.loadedTo + 1)) this.index(e); }

  async append(kind: LedgerKind, actor: string, payload: object): Promise<LedgerEntry> {
    for (let attempt = 0; ; attempt++) {
      await this.sync();
      const p = payload as any;
      if (kind === 'trial_result' || kind === 'validator_run') {
        const g = this.preregs.get(p.trialKey);
        if (g === undefined) throw new Error(`ledger: ${kind} refused, no pre-registration for trial ${String(p.trialKey).slice(0, 12)}`);
        if (kind === 'trial_result' && g !== p.gateVersion) throw new Error('ledger: trial_result refused, gate version differs from the pre-registration');
      }
      if (kind === 'prereg' && this.preregs.has(p.trialKey)) throw new Error('ledger: this trial is already pre-registered');
      const head = await this.store.head();
      const e = makeEntry(head, Math.max(Math.floor(this.clock()), 1), kind, actor, payload);
      try { await this.store.append(e); this.index(e); return e; }
      catch (err) { if (!(err instanceof LedgerConflict) || attempt >= 50) throw err; }
    }
  }
  async appendAll(actor: string, items: Append[]) { const out: LedgerEntry[] = []; for (const a of items) out.push(await this.append(a.kind, a.actor ?? actor, a.payload)); return out; }
  async verify(fromSeq = 1, toSeq = Infinity) {
    const before = fromSeq > 1 ? (await this.store.read(fromSeq - 1, fromSeq - 1))[0] : undefined;
    return verifyChain(await this.store.read(fromSeq, toSeq), before ? { seq: before.seq, hash: before.hash } : null);
  }
}
export { normalise };
