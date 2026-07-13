-- Moonlight Supabase smoke checks
-- Apply after setup files. This only reads metadata and ledger rows.

with required_tables(table_name) as (
  values
    ('profiles'),
    ('workspaces'),
    ('workspace_memberships'),
    ('brands'),
    ('projects'),
    ('tasks'),
    ('mutation_receipts'),
    ('project_updates'),
    ('routine_checks'),
    ('content_items'),
    ('content_variants'),
    ('publish_logs'),
    ('automation_runs'),
    ('sync_runs'),
    ('webhook_endpoints'),
    ('webhook_events'),
    ('error_logs'),
    ('integration_connections')
),
table_status as (
  select
    rt.table_name,
    to_regclass('public.' || rt.table_name) is not null as present
  from required_tables rt
)
select *
from table_status
order by table_name;

select
  'workspace_rows' as check_name,
  count(*) as count
from public.workspaces;

select
  'project_rows' as check_name,
  count(*) as count
from public.projects;

select
  'webhook_endpoint_rows' as check_name,
  count(*) as count
from public.webhook_endpoints;

select
  'content_variant_types' as check_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'content_variants'
  and c.conname = 'content_variants_variant_type_check';

select
  'webhook_idempotency_index' as check_name,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'webhook_events'
  and indexname = 'idx_webhook_events_provider_event';

select
  'mutation_receipts_workspace_idempotency_key' as check_name,
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'mutation_receipts'
  and c.contype = 'u'
  and pg_get_constraintdef(c.oid) ilike '%workspace_id%idempotency_key%';

with required_routines(signature) as (
  values
    ('create_task_v1(uuid,text,jsonb)'),
    ('update_task_v1(uuid,uuid,text,timestamptz,jsonb)'),
    ('capture_quick_input_v1(uuid,text,jsonb)')
)
select
  signature,
  to_regprocedure('public.' || signature) is not null as present
from required_routines
order by signature;

select
  p.proname as routine_name,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_task_v1', 'update_task_v1', 'capture_quick_input_v1')
order by p.proname;
