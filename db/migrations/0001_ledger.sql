-- 0001: the ledger. Append-only, hash-chained. The system of record (docs/design/04 s3, s18).
create table if not exists ledger (
  seq          bigint primary key,
  ts           bigint not null,
  kind         text not null,
  actor        text not null,
  payload      jsonb not null,
  payload_hash char(64) not null,
  prev_hash    char(64) not null,
  hash         char(64) not null unique
);
create index if not exists ledger_kind_idx on ledger (kind, seq);

-- S9: no entry is ever changed or removed. Raised for every role, including the table owner.
create or replace function apex_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'apex: % is append-only (% refused)', tg_table_name, tg_op;
end $$;

drop trigger if exists ledger_append_only on ledger;
create trigger ledger_append_only before update or delete or truncate on ledger for each statement execute function apex_append_only();

-- The chain cannot fork or skip: a new row must point at the current head.
create or replace function apex_ledger_link() returns trigger language plpgsql as $$
declare h record;
begin
  select seq, hash into h from ledger order by seq desc limit 1;
  if h is null then
    if new.seq <> 1 or new.prev_hash <> repeat('0', 64) then raise exception 'apex: first ledger entry must be seq 1 with the genesis hash'; end if;
  elsif new.seq <> h.seq + 1 or new.prev_hash <> h.hash then
    raise exception 'apex: ledger entry does not follow the head (conflict)' using errcode = '40001';
  end if;
  return new;
end $$;
drop trigger if exists ledger_link on ledger;
create trigger ledger_link before insert on ledger for each row execute function apex_ledger_link();
