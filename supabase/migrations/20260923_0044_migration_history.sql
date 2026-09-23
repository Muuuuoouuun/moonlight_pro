-- Bootstrap a private migration runner. This file predates its own history:
-- verify the table/function as its marker; record subsequent files atomically.
begin;

create schema if not exists moonlight_ops;
revoke all on schema moonlight_ops from public, anon, authenticated, service_role;

create table if not exists moonlight_ops.applied_migrations (
  filename text primary key
    check (filename ~ '^[0-9]{8}_[0-9]{4}_[a-z0-9_]+\.sql$'),
  sha256 text not null
    check (sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default now()
);
alter table moonlight_ops.applied_migrations enable row level security;
revoke all on moonlight_ops.applied_migrations from public, anon, authenticated, service_role;

-- SPI EXECUTE runs the whole SQL string in this function's transaction.
-- PostgreSQL rejects transaction control inside EXECUTE, so a migration
-- cannot commit its DDL before the history insert.
create or replace function moonlight_ops.apply_migration(
  p_filename text, p_sha256 text, p_sql text
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, moonlight_ops
as $migration$
declare
  v_recorded text;
begin
  if p_filename !~ '^[0-9]{8}_[0-9]{4}_[a-z0-9_]+\.sql$'
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or encode(sha256(convert_to(p_sql, 'UTF8')), 'hex') <> p_sha256 then
    raise exception 'migration-invalid-identity';
  end if;

  perform pg_advisory_xact_lock(440044, 20260923);
  select sha256 into v_recorded
    from moonlight_ops.applied_migrations where filename = p_filename;
  if found then
    if v_recorded = p_sha256 then return 'already_applied'; end if;
    raise exception 'migration-checksum-conflict';
  end if;

  execute p_sql;
  insert into moonlight_ops.applied_migrations (filename, sha256)
    values (p_filename, p_sha256);
  return 'applied';
end;
$migration$;
revoke all on function moonlight_ops.apply_migration(text,text,text)
  from public, anon, authenticated, service_role;

commit;
