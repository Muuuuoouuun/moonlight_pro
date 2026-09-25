-- DB hygiene pass: drop confirmed-duplicate btree indexes, close a trigger-function
-- execute-permission gap, and revoke anon/authenticated from RLS-enabled public
-- tables that carry no policy (defense in depth — PostgREST never routes to them
-- without a policy, but a bare grant should not sit unused either).
--
-- No explicit begin/commit: moonlight_ops.apply_migration() runs this file's SQL
-- via SPI EXECUTE inside its own transaction, which rejects transaction control
-- statements (0044). All statements below run in that one transaction already.

-- (a) Index drops. Every dropped index is a plain, non-unique btree with no
-- constraint or FK depending on it, and its columns are a left prefix (or exact
-- duplicate) of an index this migration keeps. Not CONCURRENTLY: this runs inside
-- moonlight_ops.apply_migration()'s transaction, and CONCURRENTLY cannot run
-- inside a transaction block.
--   idx_crm_activities_workspace_account_occurred (0016:30) duplicates
--   idx_crm_activities_account (0014:35) — same (workspace_id, account_id, occurred_at desc).
drop index if exists public.idx_crm_activities_workspace_account_occurred;
--   idx_crm_activities_workspace_occurred is a production-only index (no migration
--   defines it) confirmed via pg_indexes to equal idx_crm_activities_recent
--   (0014:41) — same (workspace_id, occurred_at desc). Dropped here as a known
--   duplicate rather than left unreported; idx_crm_activities_recent stays.
drop index if exists public.idx_crm_activities_workspace_occurred;
--   idx_contacts_workspace_company (0017:10, workspace_id, company_id) is a left
--   prefix of idx_contacts_workspace_company_name (0018:52, + name).
drop index if exists public.idx_contacts_workspace_company;
--   idx_content_items_workspace_status (schema.sql:520, workspace_id, status) is a
--   left prefix of content_items_queue_idx (0007:28, + rank_score desc).
drop index if exists public.idx_content_items_workspace_status;
--   idx_lead_intake_raw_status (0005:60, workspace_id, status) is a left prefix of
--   idx_lead_intake_raw_status_source_created (0018:56, + source, created_at).
drop index if exists public.idx_lead_intake_raw_status;

-- (b) These three are trigger functions: PostgreSQL invokes them internally and
-- no role can call them directly, so revoking public/anon/authenticated changes
-- no behavior. The service_role grant exists only so npm run db:check's function
-- readiness shape (service_role EXECUTE, not anon/authenticated) applies to them too.
revoke execute on function public.journal_task_plan_receipt_v1(), public.guard_social_connection_brand_key(), public.set_updated_at()
  from public, anon, authenticated;
grant execute on function public.journal_task_plan_receipt_v1(), public.guard_social_connection_brand_key(), public.set_updated_at()
  to service_role;

-- (c) rls_auto_enable() is not defined by any migration in this repository and may
-- be a Supabase-platform-owned function; only attempt the revoke if it exists, and
-- tolerate a permission error rather than failing the whole migration.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    begin
      execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    exception when insufficient_privilege then
      raise notice 'rls_auto_enable skipped';
    end;
  end if;
end $$;

-- (d) Any ordinary public table that has RLS enabled, has zero pg_policies rows
-- (so no role can pass its RLS check regardless of grants) and still grants
-- anon/authenticated some privilege: revoke that residual grant. This does not
-- touch service_role privileges — anon/authenticated access was already dead via
-- RLS, and re-granting service_role is a separate, intentional decision this
-- migration does not make.
do $$
declare
  v_table record;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
      and (
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      )
  loop
    execute format('revoke all on table public.%I from anon, authenticated', v_table.relname);
  end loop;
end $$;

-- (e) PostgREST caches the schema; make the dropped indexes and permission
-- changes visible without waiting for its next poll.
notify pgrst, 'reload schema';
