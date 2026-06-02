-- Moonlight Supabase Storage setup
-- Apply after 00_live_schema.sql. Safe to re-run on hosted Supabase.
-- Server-side Hub/Engine writes use SUPABASE_SERVICE_ROLE_KEY and bypass RLS.
-- Browser uploads, if enabled later, are constrained to a workspace-id folder.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets not found. Skipping Supabase Storage setup.';
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

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects not found. Skipping Supabase Storage policies.';
    return;
  end if;

  execute 'drop policy if exists moonlight_public_read on storage.objects';
  execute $sql$
    create policy moonlight_public_read
    on storage.objects
    for select
    using (bucket_id = 'moonlight-public')
  $sql$;

  execute 'drop policy if exists moonlight_content_workspace_read on storage.objects';
  execute $sql$
    create policy moonlight_content_workspace_read
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'moonlight-content-assets'
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    )
  $sql$;

  execute 'drop policy if exists moonlight_content_workspace_insert on storage.objects';
  execute $sql$
    create policy moonlight_content_workspace_insert
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'moonlight-content-assets'
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_workspace_role(((storage.foldername(name))[1])::uuid, array['owner', 'operator'])
    )
  $sql$;

  execute 'drop policy if exists moonlight_content_workspace_update on storage.objects';
  execute $sql$
    create policy moonlight_content_workspace_update
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'moonlight-content-assets'
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_workspace_role(((storage.foldername(name))[1])::uuid, array['owner', 'operator'])
    )
    with check (
      bucket_id = 'moonlight-content-assets'
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_workspace_role(((storage.foldername(name))[1])::uuid, array['owner', 'operator'])
    )
  $sql$;

  execute 'drop policy if exists moonlight_content_workspace_delete on storage.objects';
  execute $sql$
    create policy moonlight_content_workspace_delete
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'moonlight-content-assets'
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_workspace_role(((storage.foldername(name))[1])::uuid, array['owner'])
    )
  $sql$;
end;
$$;
