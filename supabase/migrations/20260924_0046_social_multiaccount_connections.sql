-- Keep existing connection IDs and sync_runs references while allowing one row
-- per verified external account for social providers. Other providers retain
-- one row per workspace/provider through the default empty account key.
alter table public.integration_connections
  add column if not exists account_key text not null default '';

update public.integration_connections
set account_key = coalesce(
  nullif(btrim(external_account_id), ''),
  case provider
    when 'meta_threads' then nullif(btrim(config->>'userId'), '')
    when 'instagram_api' then nullif(btrim(config->>'appScopedId'), '')
    when 'youtube' then nullif(btrim(config->>'channelId'), '')
  end,
  ''
)
where provider in ('meta_threads', 'instagram_api', 'youtube')
  and account_key = '';

update public.integration_connections
set external_account_id = account_key
where provider in ('meta_threads', 'instagram_api', 'youtube')
  and account_key <> ''
  and external_account_id is distinct from account_key;

create unique index if not exists uq_integration_connections_workspace_provider_account
  on public.integration_connections (workspace_id, provider, account_key);

drop index if exists public.uq_integration_connections_workspace_provider;

notify pgrst, 'reload schema';
