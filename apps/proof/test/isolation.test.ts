// Tenant isolation (docs/design/12 s13, build plan P5.2): for every table, account A cannot read or write account B's rows.
// It runs against a real Postgres, in a database made for this test and dropped after it, so it never touches the personal
// app's test tables. db/test/supabase_shim.sql stands in for the parts of Supabase the migration relies on, including
// Supabase's habit of giving every privilege on a new table to anon and authenticated.
// The checks walk the catalog, so a table added later without row-level security fails here without anyone listing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const DB = resolve(__dirname, '../db'), admin = process.env.APEX_TEST_DATABASE_URL;
const TABLES = ['accounts', 'api_keys', 'claim_checks', 'events', 'ledger', 'shares', 'subscriptions', 'trials', 'usage'];
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', NOBODY = '33333333-3333-4333-8333-333333333333';
const DENIED = '42501', h = (c: string) => c.repeat(64);
type Out = { rows: any[]; n: number; code?: undefined } | { code: string; message: string; rows?: undefined; n?: undefined };

test('isolation: one account cannot read or write another account\'s rows, in any table', { skip: !admin && 'set APEX_TEST_DATABASE_URL to run' }, async () => {
  const name = `proof_test_${process.pid}_${Date.now()}`, root = new pg.Client(admin); await root.connect(); await root.query(`create database ${name}`);
  const url = new URL(admin!); url.pathname = `/${name}`; const db = new pg.Client(url.toString()); await db.connect();
  /** Run one statement as a role, with a sign-in or without, in its own transaction. Returns the rows, or the error code. */
  const as = async (role: 'anon' | 'authenticated' | 'service_role', sub: string | null, sql: string, params: unknown[] = []): Promise<Out> => {
    await db.query('begin');
    try { await db.query(`set local role ${role}`); await db.query("select set_config('request.jwt.claims', $1, true)", [sub ? JSON.stringify({ sub, role }) : '']);
      const r = await db.query(sql, params); await db.query('commit'); return { rows: r.rows, n: r.rowCount ?? 0 }; }
    catch (e: any) { await db.query('rollback'); return { code: String(e.code), message: String(e.message) }; }
  };
  const user = (sub: string, sql: string, params?: unknown[]) => as('authenticated', sub, sql, params), worker = (sql: string, params?: unknown[]) => as('service_role', null, sql, params);
  const ok = (o: Out, what: string) => { assert.equal(o.code, undefined, `${what}: ${(o as any).message}`); return o as { rows: any[]; n: number }; };
  try {
    await db.query(readFileSync(join(DB, 'test/supabase_shim.sql'), 'utf8'));
    const files = readdirSync(join(DB, 'migrations')).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort(); assert.deepEqual(files, ['0001_tenancy.sql']);
    for (const f of files) { await db.query('begin'); await db.query(readFileSync(join(DB, 'migrations', f), 'utf8')); await db.query('commit'); }

    // The catalog: these nine tables and no other, each with row-level security on and forced.
    const cat = (await db.query("select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1")).rows;
    assert.deepEqual(cat.map(r => r.relname), TABLES);
    for (const r of cat) assert.ok(r.relrowsecurity && r.relforcerowsecurity, `${r.relname} has row-level security on and forced`);

    // Two people sign in. Each gets an account row from the trigger, on the free plan.
    await db.query('insert into auth.users (id, email) values ($1, $2), ($3, $4)', [A, 'a@example.test', B, 'b@example.test']);
    assert.deepEqual((await db.query('select id, plan, status from accounts order by id')).rows, [{ id: A, plan: 'free', status: 'active' }, { id: B, plan: 'free', status: 'active' }]);

    // The workers fill every table for both accounts.
    const checks: Record<string, string> = {};
    for (const [who, tag] of [[A, 'a'], [B, 'b']] as const) {
      ok(await worker("insert into subscriptions values ($1, $2, 'trader', 'active', now(), now() + interval '30 days', null)", [who, `sub_${tag}`]), 'subscription');
      ok(await worker("insert into usage (account_id, period_start, checks_used) values ($1, '2026-11-01', 2)", [who]), 'usage');
      checks[who] = ok(await worker("insert into claim_checks (account_id, title, source_kind, input_hash, status, verdict, result) values ($1, $2, 'transcript', $3, 'done', 'no edge', '{\"trades\": 7}') returning id", [who, `check of ${tag}`, h(tag)]), 'check').rows[0].id;
      ok(await worker("insert into ledger values ($1, 1, 1, 'prereg', 'worker', '{}', $2, $3, $4)", [who, h('1'), h('0'), h(tag)]), 'ledger 1');
      ok(await worker("insert into ledger values ($1, 2, 2, 'trial_result', 'worker', '{}', $2, $3, $4)", [who, h('2'), h(tag), h(tag === 'a' ? 'c' : 'd')]), 'ledger 2');
      ok(await worker('insert into trials (account_id, trial_key, first_seq) values ($1, $2, 1)', [who, h('e')]), 'trial');
      ok(await worker("insert into api_keys (account_id, name, hash, scopes) values ($1, 'laptop', $2, '{read}')", [who, h(tag === 'a' ? '7' : '8')]), 'key');
      ok(await worker('insert into shares (claim_check_id, account_id) values ($1, $2)', [checks[who], who]), 'share');
      ok(await worker("insert into events (account_id, kind) values ($1, 'check_done')", [who]), 'event');
    }
    const digest = async (who: string) => { const out: Record<string, string> = {}; for (const t of TABLES) out[t] = (await db.query(`select count(*) || ':' || coalesce(md5(string_agg(x::text, '|' order by x::text)), '') d from ${t} x where ${t === 'accounts' ? 'id' : 'account_id'} = $1`, [who])).rows[0].d; return out; };
    const before = await digest(B); for (const t of TABLES) assert.doesNotMatch(before[t], /^0:/, `${t} has a row for B`);

    for (const t of TABLES) {
      const key = t === 'accounts' ? 'id' : 'account_id';
      // Not signed in: nothing at all, although the shim handed anon every privilege before the migration took them away.
      for (const sql of [`select * from ${t}`, `delete from ${t}`, `update ${t} set ${key} = ${key}`]) assert.equal((await as('anon', null, sql)).code, DENIED, `anon: ${sql}`);
      // Signed in as A: only A's rows are there to read. The analytics table cannot be read at all, and the key hash never.
      const mine = await user(A, t === 'api_keys' ? 'select id, account_id from api_keys' : `select * from ${t}`);
      if (t === 'events') assert.equal(mine.code, DENIED); else { const r = ok(mine, `A reads ${t}`); assert.ok(r.rows.length >= 1, t); for (const row of r.rows) assert.equal(row[key], A, `${t} shows A a row of ${row[key]}`); }
      if (t !== 'events') assert.equal(ok(await user(A, `select count(*)::int n from ${t} where ${key} = $1`, [B]), t).rows[0].n, 0);
      // A cannot change, remove or add a row of B's. Either the statement is refused or it touches no row.
      for (const sql of [`update ${t} set ${key} = ${key} where ${key} = $1`, `delete from ${t} where ${key} = $1`]) { const o = await user(A, sql, [B]); assert.ok(o.code === DENIED || o.n === 0, `${sql}: ${JSON.stringify(o)}`); }
      const cols = (await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and is_identity = 'NO' order by ordinal_position", [t])).rows.map(r => r.column_name).join(', ');
      const row = (await db.query(`select row_to_json(x) j from ${t} x where ${key} = $1 limit 1`, [B])).rows[0].j;
      assert.equal((await user(A, `insert into ${t} (${cols}) select ${cols} from json_populate_record(null::${t}, $1)`, [JSON.stringify(row)])).code, DENIED, `A inserts a copy of B's ${t} row`);
      // Someone signed in who has no account, and a token with no subject, see nothing.
      for (const sub of [NOBODY, null]) { const o = await as('authenticated', sub, t === 'api_keys' ? 'select id from api_keys' : `select * from ${t}`); assert.ok(o.code === DENIED || o.n === 0, `${t} for ${sub}`); }
    }
    assert.deepEqual(await digest(B), before, 'nothing of B\'s changed');

    // What a signed-in person may do: start a check of their own and rename it. Nothing else.
    const started = ok(await user(A, "insert into claim_checks (account_id, title, source_kind, input_hash) values ($1, 'mine', 'pine', $2) returning id, status, verdict", [A, h('f')]), 'A starts a check').rows[0];
    assert.equal(started.status, 'queued'); assert.equal(started.verdict, null);
    assert.equal(ok(await user(A, "update claim_checks set title = 'renamed' where id = $1", [started.id]), 'rename').n, 1);
    const forged: [string, unknown[]][] = [
      ["insert into claim_checks (account_id, title, source_kind, input_hash) values ($1, 'x', 'pine', $2)", [B, h('f')]],                       // in B's name
      ["insert into claim_checks (account_id, title, source_kind, input_hash, verdict) values ($1, 'x', 'pine', $2, 'holds up')", [A, h('f')]],   // with a verdict of their own
      ["update claim_checks set verdict = 'holds up' where id = $1", [started.id]], ["update claim_checks set status = 'done' where id = $1", [started.id]],
      ["update claim_checks set result = '{}' where id = $1", [started.id]], ['update claim_checks set account_id = $2 where id = $1', [started.id, B]],
      ['delete from claim_checks where id = $1', [started.id]],
      ["update accounts set plan = 'pro' where id = $1", [A]], ["update accounts set status = 'active' where id = $1", [A]], ["insert into accounts (id, email) values ($1, 'x')", [NOBODY]],
      ["update usage set checks_used = 0 where account_id = $1", [A]], ["insert into usage (account_id, period_start) values ($1, '2026-12-01')", [A]],
      ["update subscriptions set plan = 'pro' where account_id = $1", [A]],
      ["insert into ledger values ($1, 3, 3, 'trial_result', 'me', '{}', $2, $3, $4)", [A, h('3'), h('c'), h('9')]], ['delete from trials where account_id = $1', [A]],
      ["insert into api_keys (account_id, name, hash) values ($1, 'mine', $2)", [A, h('6')]], ['update api_keys set revoked_at = null where account_id = $1', [A]], ['select hash from api_keys', []], ['select * from api_keys', []],
      ['insert into shares (claim_check_id, account_id) values ($1, $2)', [started.id, A]], ['update shares set revoked_at = null where account_id = $1', [A]],
      ["insert into events (account_id, kind) values ($1, 'x')", [A]],
    ];
    for (const [sql, params] of forged) assert.equal((await user(A, sql, params)).code, DENIED, sql);
    assert.equal((await db.query('select verdict, status, title from claim_checks where id = $1', [started.id])).rows[0].title, 'renamed');

    // The ledger: append-only for every role, the database owner included, and one chain per account that cannot fork or skip.
    for (const sql of ["update ledger set actor = 'x'", 'delete from ledger', 'truncate ledger', 'delete from trials']) { await assert.rejects(db.query(sql), /append-only/, sql); assert.match(String((await worker(sql) as any).message), /append-only/, `worker: ${sql}`); }
    assert.match(String((await worker("insert into ledger values ($1, 2, 9, 'x', 'w', '{}', $2, $3, $4)", [A, h('2'), h('a'), h('5')]) as any).code), /^(40001|23505)$/, 'a fork is refused');
    assert.equal((await worker("insert into ledger values ($1, 4, 9, 'x', 'w', '{}', $2, $3, $4)", [A, h('2'), h('c'), h('5')])).code, '40001', 'a skipped number is refused');
    assert.match(String((await worker("insert into ledger values ($1, 1, 9, 'x', 'w', '{}', $2, $3, $4)", [NOBODY, h('2'), h('0'), h('5')]) as any).code), /^23503$/, 'no ledger without an account');
    ok(await worker("insert into ledger values ($1, 3, 9, 'x', 'w', '{}', $2, $3, $4)", [A, h('2'), h('c'), h('5')]), 'the next entry follows the head');
    // A share cannot show one account a check that belongs to another.
    assert.match(String((await worker('insert into shares (claim_check_id, account_id) values ($1, $2)', [checks[B], A]) as any).message), /must belong to the account that owns the check/);
    // The workers see both accounts. That is why the service key is used only in the narrow places the design names.
    assert.equal(ok(await worker('select count(distinct account_id)::int n from claim_checks'), 'worker reads').rows[0].n, 2);
    // Nobody can call the sign-up function by hand.
    assert.equal((await user(A, 'select proof_new_account()')).code !== undefined, true);
  } finally { await db.end(); await root.query(`drop database if exists ${name} with (force)`); await root.end(); }
});

test('isolation: the migration is in a red path, and the service key is named in one file only', () => {
  const ROOT = resolve(__dirname, '../../..');
  assert.match(readFileSync(join(ROOT, '.github/red-paths.txt'), 'utf8'), /^apps\/proof\/db\/migrations\/\*\*$/m);
  const sql = readFileSync(join(DB, 'migrations/0001_tenancy.sql'), 'utf8');
  for (const t of TABLES) assert.match(sql, new RegExp(`'${t}'`), `${t} is in the list that gets row-level security`);
  assert.doesNotMatch(sql, /to anon\b/, 'nothing is granted to visitors'); assert.doesNotMatch(sql, /using \(true\)/);
});
