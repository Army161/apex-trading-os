// Postgres ledger (docs/design/01 s5, 04 s18). The database assigns nothing: the entry carries its own seq and hashes, and the
// insert trigger from migration 0001 refuses anything that does not follow the head, so two writers cannot fork the chain.
// Projections are written in the same transaction as the entry they come from.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { LedgerConflict, type Head, type LedgerEntry, type LedgerStore } from '@apex/kernel/ledger';

type Q = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const row = (r: any): LedgerEntry => ({ seq: Number(r.seq), ts: Number(r.ts), kind: r.kind, actor: r.actor, payload: r.payload, payloadHash: r.payload_hash, prevHash: r.prev_hash, hash: r.hash });

/** One insert per ledger kind that has a projection table. Anything else lives in the ledger alone. */
async function project(q: Q, e: LedgerEntry) {
  const p = e.payload, j = (x: unknown) => JSON.stringify(x ?? null);
  switch (e.kind) {
    case 'gate_version': await q.query('insert into gate_versions (version, config, created_seq) values ($1,$2,$3) on conflict do nothing', [p.version, j(p.config), e.seq]); break;
    case 'data_version': await q.query('insert into dataset_versions (dataset, version, rows, first_t, last_t, status, seq) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing', [p.dataset, p.version, p.rows, p.first ?? null, p.last ?? null, p.status, e.seq]); break;
    case 'prereg': await q.query('insert into preregs (trial_key, seq, hypothesis, source, strategy, fingerprint, panel, tf, gate_version, planned_variants) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing',
      [p.trialKey, e.seq, p.hypothesis, p.source, p.strategy?.id, p.strategy?.fingerprint, p.panel, p.tf, p.gateVersion, p.plannedVariants ?? 1]); break;
    case 'trial_result':
      await q.query('insert into trials (trial_key, first_seq, strategy, panel, tf) values ($1,$2,$3,$4,$5) on conflict do nothing', [p.trialKey, e.seq, p.inputs?.strategy?.id, p.panel ?? null, p.tf ?? null]);
      await q.query('insert into evaluations (seq, trial_key, input_hash, result_hash, status, trades, ret, hold, dd, sharpe, hold_sharpe, dsr_n, checks, why, run_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
        [e.seq, p.trialKey, p.inputHash, p.resultHash, p.status, p.metrics?.trades ?? 0, p.metrics?.ret ?? 0, p.metrics?.hold ?? 0, p.metrics?.dd ?? 0, p.metrics?.sharpe ?? 0, p.metrics?.holdSharpe ?? 0, p.readouts?.dsrN ?? 0, j(p.checks), p.why ?? '', p.runId ?? null]);
      break;
    case 'validator_run': await q.query('insert into validator_runs (seq, trial_key, level, source, input_hash, result_hash, agrees, diffs) values ($1,$2,$3,$4,$5,$6,$7,$8)', [e.seq, p.trialKey, p.level, p.source ?? null, p.inputHash, p.resultHash, p.agrees, j(p.diffs)]); break;
    case 'slot_locked': await q.query('insert into slots (key, trial_key, strategy, dataset, role, shadow_of, status, locked_at, lock_hash, weight, risk_fraction, baseline, updated_seq) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,$10,$11) on conflict do nothing',
      [p.slotKey, p.trialKey, p.strategy, p.dataset, p.role, p.shadowOf ?? null, 'paper', p.lockedAt, p.inputHash, j(p.baseline), e.seq]); break;
    case 'slot_status':
      await q.query('insert into slot_events (seq, slot, from_status, to_status, reason, numbers) values ($1,$2,$3,$4,$5,$6)', [e.seq, p.slotKey, p.from, p.to, p.reason, j(p.numbers)]);
      await q.query('update slots set status = $2, role = coalesce($3, role), shadow_of = case when $3 is null then shadow_of else $4 end, updated_seq = $5 where key = $1', [p.slotKey, p.to, p.role ?? null, p.shadowOf ?? null, e.seq]);
      break;
    case 'weights': for (const [k, w] of Object.entries(p.weights ?? {})) await q.query('update slots set weight = $2, risk_fraction = $3, updated_seq = $4 where key = $1', [k, w, p.riskFractions?.[k] ?? 0, e.seq]); break;
    case 'intent': case 'intent_blocked': await q.query('insert into intents (id, seq, slot, symbol, side, bar_t, ref_price, stop, target, qty, risk_usd, ok, rules, mode) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing',
      [p.id, e.seq, p.slotKey, p.symbol, p.side, p.barT, p.refPrice ?? null, Number.isFinite(p.stop) ? p.stop : null, p.target ?? null, p.qty ?? 0, p.riskUsd ?? 0, e.kind === 'intent', j(p.rules), p.mode ?? 'paper']); break;
    case 'fill': await q.query('insert into fills (seq, intent, slot, t, kind, price, qty, fee, mode) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [e.seq, p.intent, p.slotKey, p.t, p.kind, p.price, p.qty, p.fee ?? 0, p.mode ?? 'paper']); break;
    case 'book_snapshot': await q.query('insert into book_snapshots (seq, at, equity, cash, peak, day_pnl, week_pnl, open_risk, mode) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [e.seq, p.at, p.equity, p.cash, p.peak, p.dayPnl ?? 0, p.weekPnl ?? 0, p.openRisk ?? 0, p.mode ?? 'paper']); break;
    case 'run': await q.query('insert into runs (id, seq, started, kind, commit_sha, evaluated, errors, summary) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing', [p.id, e.seq, e.ts, p.mode, p.commit ?? null, p.evaluated ?? 0, p.errors ?? 0, j(p)]); break;
    default: break;
  }
}

export class PgLedgerStore implements LedgerStore {
  durable = true;
  constructor(public pool: pg.Pool) {}
  static connect(url: string) { return new PgLedgerStore(new pg.Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1|\/var\/run|sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false } })); }
  async head(): Promise<Head | null> { const r = await this.pool.query('select seq, hash from ledger order by seq desc limit 1'); return r.rows[0] ? { seq: Number(r.rows[0].seq), hash: r.rows[0].hash } : null; }
  async read(fromSeq = 1, toSeq = Number.MAX_SAFE_INTEGER) { const r = await this.pool.query('select * from ledger where seq >= $1 and seq <= $2 order by seq', [fromSeq, Number.isFinite(toSeq) ? toSeq : Number.MAX_SAFE_INTEGER]); return r.rows.map(row); }
  async append(e: LedgerEntry) {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      await c.query('lock table ledger in share row exclusive mode');                    // one appender at a time; readers are not blocked
      await c.query('insert into ledger (seq, ts, kind, actor, payload, payload_hash, prev_hash, hash) values ($1,$2,$3,$4,$5,$6,$7,$8)', [e.seq, e.ts, e.kind, e.actor, JSON.stringify(e.payload), e.payloadHash, e.prevHash, e.hash]);
      await project(c, e);
      await c.query('commit');
    } catch (err: any) {
      await c.query('rollback').catch(() => {});
      if (err?.code === '40001' || err?.code === '23505') throw new LedgerConflict();
      throw err;
    } finally { c.release(); }
  }
  /** Simple advisory lock for "one run at a time". Returns a release function or null. */
  async runLock(): Promise<(() => Promise<void>) | null> {
    const c = await this.pool.connect(); const r = await c.query('select pg_try_advisory_lock(42715001) as ok');
    if (!r.rows[0].ok) { c.release(); return null; }
    return async () => { await c.query('select pg_advisory_unlock(42715001)').catch(() => {}); c.release(); };
  }
  async saveReport(id: string, kind: string, at: number, markdown: string, summary: unknown) {
    await this.pool.query('insert into reports (id, kind, at, markdown, summary) values ($1,$2,$3,$4,$5) on conflict (id) do update set markdown = excluded.markdown, summary = excluded.summary', [id, kind, at, markdown, JSON.stringify(summary)]);
  }
  async close() { await this.pool.end(); }
}

/** Apply every db/migrations/*.sql in order, once each. Run with an owner connection, not the application role. */
export async function migrate(pool: pg.Pool, dir: string): Promise<string[]> {
  await pool.query('create table if not exists apex_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await pool.query('select name from apex_migrations')).rows.map(r => r.name)), applied: string[] = [];
  for (const f of readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) {
    if (done.has(f)) continue;
    const c = await pool.connect();
    try { await c.query('begin'); await c.query(readFileSync(join(dir, f), 'utf8')); await c.query('insert into apex_migrations (name) values ($1)', [f]); await c.query('commit'); applied.push(f); }
    catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
  }
  return applied;
}
