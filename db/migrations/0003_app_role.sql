-- 0003: the application role. INSERT and SELECT only on append-only tables. Run once per database; safe to re-run.
-- The login password is set by Jeremy outside this file (alter role apex_app with login password '...'), never committed.
do $$ begin if not exists (select from pg_roles where rolname = 'apex_app') then create role apex_app nologin; end if; end $$;
grant usage on schema public to apex_app;
grant select, insert on ledger, gate_versions, trials, evaluations, validator_runs, fills, slot_events to apex_app;
grant select, insert, update on strategies, datasets, dataset_versions, preregs, slots, intents, book_snapshots, runs, reports to apex_app;
create table if not exists apex_migrations (name text primary key, applied_at timestamptz not null default now());
grant select on apex_migrations to apex_app;
