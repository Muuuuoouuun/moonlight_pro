alter table if exists public.routine_checks
  add column if not exists idempotency_key text;

create unique index if not exists routine_checks_workspace_idempotency_key_uidx
  on public.routine_checks (workspace_id, idempotency_key)
  where idempotency_key is not null;
