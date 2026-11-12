// One hash-chained ledger per account (docs/design/12 s3 and s4.1). The same chain, the same entry format and the same
// pre-registration rule as the personal ledger: the kernel's Ledger class does the writing, and this store only scopes it
// to one account. It works inside the caller's transaction, so a check's entries, its result and its usage are written
// together or not at all. The database refuses an entry that does not follow the account's head, and refuses any change.
import { hashOf } from '@apex/kernel';
import { LedgerConflict, type Head, type LedgerEntry, type LedgerStore } from '@apex/kernel/ledger';
import { isId, type Q } from './db';

const row = (r: any): LedgerEntry => ({ seq: Number(r.seq), ts: Number(r.ts), kind: r.kind, actor: r.actor, payload: r.payload, payloadHash: r.payload_hash, prevHash: r.prev_hash, hash: r.hash });

/** The rule family a set of rules belongs to: the same rules with other numbers. A known strategy family is one family
 *  whatever its parameters. Rules written out in full are one family when they differ only in their numbers. */
export function familyOf(rules: unknown): string {
  const r = rules as { template?: unknown; params?: unknown } | null;
  if (r && typeof r.template === 'string' && r.params && typeof r.params === 'object') return `template:${r.template}`;
  const shape = (x: unknown): unknown => typeof x === 'number' ? 0 : typeof x === 'string' ? x.replace(/\d+(\.\d+)?/g, '#')
    : Array.isArray(x) ? x.map(shape) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, shape(v)])) : x;
  return `rules:${hashOf(shape(rules) as object).slice(0, 16)}`;
}

export class AccountLedgerStore implements LedgerStore {
  durable = true;
  constructor(private q: Q, readonly accountId: string) { if (!isId(accountId)) throw new Error('proof: not an account id'); }
  /** One writer per account at a time, until the transaction ends. Take it before reading the entries a check is planned from. */
  async lock() { await this.q.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`proof-ledger:${this.accountId}`]); }
  async head(): Promise<Head | null> { const r = await this.q.query('select seq, hash from ledger where account_id = $1 order by seq desc limit 1', [this.accountId]); return r.rows[0] ? { seq: Number(r.rows[0].seq), hash: r.rows[0].hash } : null; }
  async read(fromSeq = 1, toSeq = Number.MAX_SAFE_INTEGER) {
    const r = await this.q.query('select * from ledger where account_id = $1 and seq >= $2 and seq <= $3 order by seq', [this.accountId, fromSeq, Number.isFinite(toSeq) ? toSeq : Number.MAX_SAFE_INTEGER]); return r.rows.map(row);
  }
  async append(e: LedgerEntry) {
    try {
      await this.q.query('insert into ledger (account_id, seq, ts, kind, actor, payload, payload_hash, prev_hash, hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [this.accountId, e.seq, e.ts, e.kind, e.actor, JSON.stringify(e.payload), e.payloadHash, e.prevHash, e.hash]);
      // A try is counted when it is written down, before it is run, so a run that is abandoned still counts.
      if (e.kind === 'prereg') await this.q.query('insert into trials (account_id, trial_key, first_seq, strategy, panel, tf, family) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',
        [this.accountId, e.payload.trialKey, e.seq, e.payload.strategy?.id ?? null, e.payload.panel ?? null, e.payload.tf ?? null, familyOf(e.payload.rules)]);
    } catch (err: any) { if (err?.code === '40001' || err?.code === '23505') throw new LedgerConflict(); throw err; }
  }
}
