-- Moonlight live setup contract fixes
-- Apply to existing Supabase projects that already ran schema.sql and earlier
-- migrations. New projects can run supabase/setup/00_live_schema.sql instead.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table if exists public.milestones
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.milestones m
set workspace_id = p.workspace_id
from public.projects p
where m.project_id = p.id
  and m.workspace_id is null;

alter table if exists public.content_items
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists idea_source text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists visibility text not null default 'private',
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.content_variants
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists visibility text not null default 'private',
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.content_assets
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists checksum text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.publish_logs
  add column if not exists provider text,
  add column if not exists target_url text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.integration_connections
  add column if not exists external_account_id text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.content_items
  drop constraint if exists content_items_source_type_check;
alter table if exists public.content_items
  add constraint content_items_source_type_check
  check (source_type in ('idea', 'brief', 'meeting', 'research', 'repurpose', 'manual', 'import', 'generated'));

alter table if exists public.content_variants
  drop constraint if exists content_variants_variant_type_check;

update public.content_variants
set variant_type = case variant_type
  when 'blog' then 'blog_insight'
  when 'social_post' then 'x_thread'
  when 'landing_copy' then 'blog_insight'
  else variant_type
end
where variant_type in ('blog', 'social_post', 'landing_copy');

alter table if exists public.content_variants
  add constraint content_variants_variant_type_check
  check (variant_type in (
    'newsletter',
    'blog',
    'blog_insight',
    'card_news',
    'social_post',
    'x_thread',
    'reels_script',
    'landing_copy'
  ));

create index if not exists idx_content_items_workspace_brand_status_updated
  on public.content_items (workspace_id, brand_id, status, updated_at desc);

create unique index if not exists idx_content_items_workspace_slug
  on public.content_items (workspace_id, slug)
  where slug is not null;

create index if not exists idx_content_variants_public
  on public.content_variants (workspace_id, visibility, status, published_at desc);

create unique index if not exists idx_content_variants_workspace_slug
  on public.content_variants (workspace_id, slug)
  where slug is not null;

create index if not exists idx_integration_connections_workspace_provider
  on public.integration_connections (workspace_id, provider, status);

create index if not exists idx_integration_connections_external_account
  on public.integration_connections (workspace_id, provider, external_account_id)
  where external_account_id is not null;

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'content_items',
    'content_variants',
    'content_assets',
    'publish_logs',
    'integration_connections'
  ]
  loop
    trigger_name := target_table || '_set_updated_at';

    if to_regclass(format('public.%I', target_table)) is not null
      and not exists (
        select 1
        from pg_trigger
        where tgname = trigger_name
          and tgrelid = to_regclass(format('public.%I', target_table))
      )
    then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        trigger_name,
        target_table
      );
    end if;
  end loop;
end;
$$;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets not found. Skipping Supabase Storage bucket setup.';
    return;
  end if;

  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      (
        'moonlight-content-assets',
        'moonlight-content-assets',
        false,
        52428800,
        array[
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/svg+xml',
          'text/html',
          'application/zip',
          'application/json',
          'text/plain'
        ]
      ),
      (
        'moonlight-public',
        'moonlight-public',
        true,
        52428800,
        array[
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/svg+xml',
          'text/html'
        ]
      )
    on conflict (id) do update
    set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types
  $sql$;
end;
$$;
