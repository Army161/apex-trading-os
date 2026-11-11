// How the product's server code reaches its database (docs/design/12 s4.1). Every statement runs inside a transaction that
// first takes one of two roles: the signed-in person's (row-level security then shows them only their own rows) or the
// workers'. Nothing runs as the connection's own role, so a query that forgets to say who it is for cannot run at all.
import type pg from 'pg';

export type Q = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
export type Role = 'authenticated' | 'service_role';
const ROLES: Role[] = ['authenticated', 'service_role'], UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

async function inRole<T>(pool: pg.Pool, role: Role, sub: string | null, fn: (q: Q) => Promise<T>): Promise<T> {
  if (!ROLES.includes(role)) throw new Error('proof: unknown database role');
  const c = await pool.connect();
  try {
    await c.query('begin'); await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [sub ? JSON.stringify({ sub, role }) : '']);
    const out = await fn(c); await c.query('commit'); return out;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
/** One transaction as a signed-in person. `accountId` comes from their verified sign-in and from nowhere else. */
export const asUser = <T>(pool: pg.Pool, accountId: string, fn: (q: Q) => Promise<T>) => { if (!isId(accountId)) throw new Error('proof: not an account id'); return inRole(pool, 'authenticated', accountId, fn); };
/** One transaction as the workers. Used by the job steps and, later, the billing webhook. */
export const asWorker = <T>(pool: pg.Pool, fn: (q: Q) => Promise<T>) => inRole(pool, 'service_role', null, fn);
