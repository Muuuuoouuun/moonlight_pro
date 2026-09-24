-- A public OAuth callback can redeem only an operator-started, unexpired flow.
-- Conditional UPDATE of consumed_at allows exactly one callback to win.
create table if not exists public.social_oauth_flows (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('instagram_api', 'meta_threads')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists idx_social_oauth_flows_expires_at
  on public.social_oauth_flows (expires_at);

alter table public.social_oauth_flows enable row level security;
revoke all on public.social_oauth_flows from anon, authenticated;
grant select, insert, update, delete on public.social_oauth_flows to service_role;

-- Keep an established social account attached to its original brand even when
-- two OAuth callbacks race or another writer bypasses the application check.
create or replace function public.guard_social_connection_brand_key()
returns trigger language plpgsql as $$
declare
  previous_brand text;
  next_brand text;
begin
  if old.provider not in ('instagram_api', 'meta_threads', 'youtube') then
    return new;
  end if;
  previous_brand := nullif(old.config->>'brandKey', '');
  next_brand := nullif(new.config->>'brandKey', '');
  if previous_brand is not null and next_brand is distinct from previous_brand then
    raise exception 'social-account-brand-mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_social_connection_brand_key on public.integration_connections;
create trigger trg_social_connection_brand_key
before update of config on public.integration_connections
for each row execute function public.guard_social_connection_brand_key();

notify pgrst, 'reload schema';
