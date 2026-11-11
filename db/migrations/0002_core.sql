-- 0002: gate versions, strategies, datasets and the projections that make the ledger fast to query.
-- Every table here can be rebuilt by replaying the ledger. Rows carry the ledger seq they came from.
create table if not exists gate_versions (version char(64) primary key, config jsonb not null, created_seq bigint not null);
create table if not exists strategies (id text primary key, fingerprint char(64) not null, name text, source text, tf text, direction text, kind text not null default 'builtin', spec jsonb, frozen boolean not null default false);
create table if not exists datasets (id text primary key, source text, symbol text, tf text, asset_class text, adj text, session text, calendar text, panel text[], current_version char(64));
create table if not exists dataset_versions (dataset text not null, version char(64) not null, rows int, first_t bigint, last_t bigint, status text, seq bigint, primary key (dataset, version));
create table if not exists preregs (trial_key char(64) primary key, seq bigint not null, hypothesis text, source text, strategy text, fingerprint char(64), panel text, tf text, gate_version char(64), planned_variants int);
create table if not exists trials (trial_key char(64) primary key, first_seq bigint not null, strategy text, panel text, tf text);
create table if not exists evaluations (seq bigint primary key, trial_key char(64) not null, input_hash char(64), result_hash char(64), status text, trades int, ret numeric, hold numeric, dd numeric,
  sharpe numeric, hold_sharpe numeric, dsr_n numeric, checks jsonb, why text, run_id text);
create table if not exists validator_runs (seq bigint primary key, trial_key char(64) not null, level text, source text, input_hash char(64), result_hash char(64), agrees boolean, diffs jsonb);
create table if not exists slots (key text primary key, trial_key char(64), strategy text, dataset text, role text, shadow_of text, status text, locked_at bigint, lock_hash char(64), weight numeric,
  risk_fraction numeric, baseline jsonb, updated_seq bigint);
create table if not exists slot_events (seq bigint primary key, slot text not null, from_status text, to_status text, reason text, numbers jsonb);
create table if not exists intents (id char(64) primary key, seq bigint, slot text, symbol text, side smallint, bar_t bigint, ref_price numeric, stop numeric, target numeric, qty numeric, risk_usd numeric, ok boolean, rules jsonb, mode text);
create table if not exists fills (seq bigint primary key, intent char(64), slot text, t bigint, kind text, price numeric, qty numeric, fee numeric, mode text);
create table if not exists book_snapshots (seq bigint primary key, at bigint, equity numeric, cash numeric, peak numeric, day_pnl numeric, week_pnl numeric, open_risk numeric, mode text);
create table if not exists runs (id text primary key, seq bigint, started bigint, kind text, commit_sha text, evaluated int, errors int, summary jsonb);
create table if not exists reports (id text primary key, kind text, at bigint, markdown text, summary jsonb);

do $$ declare t text; begin
  foreach t in array array['gate_versions', 'trials', 'evaluations', 'validator_runs', 'fills', 'slot_events'] loop
    execute format('drop trigger if exists %I_append_only on %I', t, t);
    execute format('create trigger %I_append_only before update or delete or truncate on %I for each statement execute function apex_append_only()', t, t);
  end loop;
end $$;
