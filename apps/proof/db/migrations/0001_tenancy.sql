-- Proof 0001: accounts and the per-account tables (docs/design/12 s4.1). Written for a Supabase project: it relies on
-- auth.users, auth.uid() and the roles anon, authenticated and service_role that Supabase provides.
--
-- The rules this file enforces in the database itself, so that no page or route has to be trusted with them:
--   1. A signed-in person reads only rows whose account_id is their own. Row-level security is on, and forced, on every table.
--   2. A signed-in person can write almost nothing: they may start a check and rename it. Plan, usage, verdicts, results,
--      the ledger, keys and shares are written only by the server's workers (service_role), in narrow functions.
--   3. A visitor who is not signed in (anon) can touch nothing.
--   4. The per-account ledger is append-only and hash-chained, for every role.
-- Supabase gives anon and authenticated every privilege on a new public table by default, so each table below takes them
-- all away first and then gives back only what is listed.

create table accounts (
  id                  uuid primary key references auth.users (id),
  email               text not null,
  created_at          timestamptz not null default now(),
  plan                text not null default 'free' check (plan in ('free', 'trader', 'pro')),
  stripe_customer_id  text unique,
  status              text not null default 'active' check (status in ('active', 'suspended', 'closed'))
);

create table subscriptions (
  account_id              uuid not null references accounts (id),
  stripe_subscription_id  text primary key,
  plan                    text not null check (plan in ('trader', 'pro')),
  status                  text not null,
  period_start            timestamptz not null,
  period_end              timestamptz not null,
  cancel_at               timestamptz
);
create index subscriptions_account_idx on subscriptions (account_id);

create table usage (
  account_id       uuid not null references accounts (id),
  period_start     date not null,
  checks_used      int not null default 0 check (checks_used >= 0),
  tries_used       int not null default 0 check (tries_used >= 0),
  ai_usd           numeric(12, 5) not null default 0 check (ai_usd >= 0),
  compute_seconds  numeric(14, 3) not null default 0 check (compute_seconds >= 0),
  primary key (account_id, period_start)
);

create table claim_checks (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts (id),
  created_at   timestamptz not null default now(),
  status       text not null default 'queued' check (status in ('queued', 'extracting', 'planned', 'running', 'done', 'failed', 'refused')),
  title        text not null default '' check (char_length(title) <= 200),
  source_kind  text not null check (source_kind in ('transcript', 'pine', 'page', 'rules')),
  input_uri    text,
  input_hash   char(64) not null,
  extraction   jsonb,
  verdict      text,
  result       jsonb,
  trials_used  int not null default 0 check (trials_used >= 0),
  visibility   text not null default 'private' check (visibility in ('private', 'shared'))
);
create index claim_checks_account_idx on claim_checks (account_id, created_at desc);

-- One chain per account. The same shape as the personal ledger, with the account in the key.
create table ledger (
  account_id    uuid not null references accounts (id),
  seq           bigint not null,
  ts            bigint not null,
  kind          text not null,
  actor         text not null,
  payload       jsonb not null,
  payload_hash  char(64) not null,
  prev_hash     char(64) not null,
  hash          char(64) not null,
  primary key (account_id, seq),
  unique (account_id, hash)
);

create table trials (
  account_id  uuid not null references accounts (id),
  trial_key   char(64) not null,
  first_seq   bigint not null,
  strategy    text,
  panel       text,
  tf          text,
  family      text,
  primary key (account_id, trial_key)
);

create table api_keys (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts (id),
  name        text not null check (char_length(name) between 1 and 80),
  hash        char(64) not null unique,
  scopes      text[] not null default '{}',
  created_at  timestamptz not null default now(),
  last_used   timestamptz,
  revoked_at  timestamptz
);
create index api_keys_account_idx on api_keys (account_id);

create table shares (
  id              uuid primary key default gen_random_uuid(),
  claim_check_id  uuid not null references claim_checks (id),
  account_id      uuid not null references accounts (id),
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  redactions      jsonb not null default '{}'
);
create index shares_account_idx on shares (account_id);

-- Product analytics: kinds and counts, never input text. Nobody but the workers reads or writes it.
create table events (
  id          bigint generated always as identity primary key,
  account_id  uuid references accounts (id),
  ts          timestamptz not null default now(),
  kind        text not null,
  detail      jsonb not null default '{}'
);
create index events_account_idx on events (account_id, ts);

-- Row-level security on every table, forced, and every default privilege taken away.
do $$ declare t text; begin
  foreach t in array array['accounts', 'subscriptions', 'usage', 'claim_checks', 'ledger', 'trials', 'api_keys', 'shares', 'events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on %I to service_role', t);
  end loop;
end $$;
revoke all on sequence events_id_seq from public, anon, authenticated;
grant usage on sequence events_id_seq to service_role;

-- What a signed-in person may read: their own rows. The key hash is never readable, not even by its owner.
create policy accounts_own on accounts for select to authenticated using (id = auth.uid());
create policy subscriptions_own on subscriptions for select to authenticated using (account_id = auth.uid());
create policy usage_own on usage for select to authenticated using (account_id = auth.uid());
create policy claim_checks_own on claim_checks for select to authenticated using (account_id = auth.uid());
create policy ledger_own on ledger for select to authenticated using (account_id = auth.uid());
create policy trials_own on trials for select to authenticated using (account_id = auth.uid());
create policy api_keys_own on api_keys for select to authenticated using (account_id = auth.uid());
create policy shares_own on shares for select to authenticated using (account_id = auth.uid());
grant select on accounts, subscriptions, usage, claim_checks, ledger, trials, shares to authenticated;
grant select (id, account_id, name, scopes, created_at, last_used, revoked_at) on api_keys to authenticated;

-- What a signed-in person may write: start a check of their own, with only the columns that describe the input, and rename it.
-- The status, the extraction, the verdict, the result and the count of tries are the workers' to write, so a verdict cannot be forged.
create policy claim_checks_start on claim_checks for insert to authenticated with check (account_id = auth.uid());
create policy claim_checks_rename on claim_checks for update to authenticated using (account_id = auth.uid()) with check (account_id = auth.uid());
grant insert (account_id, title, source_kind, input_uri, input_hash) on claim_checks to authenticated;
grant update (title) on claim_checks to authenticated;

-- The ledger: no entry is ever changed or removed, by any role.
create function proof_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'proof: % is append-only (% refused)', tg_table_name, tg_op;
end $$;
create trigger ledger_append_only before update or delete or truncate on ledger for each statement execute function proof_append_only();
create trigger trials_append_only before update or delete or truncate on trials for each statement execute function proof_append_only();

-- An account's chain cannot fork or skip: a new entry must follow that account's head.
create function proof_ledger_link() returns trigger language plpgsql as $$
declare h record;
begin
  select seq, hash into h from ledger where account_id = new.account_id order by seq desc limit 1;
  if h is null then
    if new.seq <> 1 or new.prev_hash <> repeat('0', 64) then raise exception 'proof: an account''s first ledger entry must be seq 1 with the genesis hash'; end if;
  elsif new.seq <> h.seq + 1 or new.prev_hash <> h.hash then
    raise exception 'proof: ledger entry does not follow the account''s head (conflict)' using errcode = '40001';
  end if;
  return new;
end $$;
create trigger ledger_link before insert on ledger for each row execute function proof_ledger_link();

-- A share always belongs to the account that owns the check it shows.
create function proof_share_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from claim_checks c where c.id = new.claim_check_id and c.account_id = new.account_id) then
    raise exception 'proof: a share must belong to the account that owns the check';
  end if;
  return new;
end $$;
create trigger shares_owner before insert or update on shares for each row execute function proof_share_owner();

-- A new sign-in gets its account row. The function runs as its owner, with a fixed search path, and does nothing else.
create function proof_new_account() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.accounts (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function proof_new_account() from public, anon, authenticated;
create trigger proof_on_auth_user after insert on auth.users for each row execute function proof_new_account();
