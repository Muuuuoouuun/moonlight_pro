-- Moonlight dev/staging seed
-- Apply after 00_live_schema.sql. Safe to re-run.
-- Keep COM_MOON_DEFAULT_WORKSPACE_ID aligned with this workspace id unless
-- you replace it with your real production workspace id.

insert into public.profiles (id, email, display_name, role)
values (
  '00000000-0000-0000-0000-000000000001',
  'boss@com-moon.local',
  'Boss',
  'owner'
)
on conflict (email) do update
set
  display_name = excluded.display_name,
  role = excluded.role,
  updated_at = now();

insert into public.workspaces (id, owner_id, slug, name, timezone, meta)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  'com-moon-os',
  'Com_Moon OS',
  'Asia/Seoul',
  '{"environment":"dev"}'::jsonb
)
on conflict (slug) do update
set
  owner_id = excluded.owner_id,
  name = excluded.name,
  timezone = excluded.timezone,
  meta = public.workspaces.meta || excluded.meta,
  updated_at = now();

update public.profiles
set default_workspace_id = '11111111-1111-1111-1111-111111111111'
where id = '00000000-0000-0000-0000-000000000001';

insert into public.workspace_memberships (workspace_id, user_id, role, status)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  'owner',
  'active'
)
on conflict (workspace_id, user_id) do update
set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();

insert into public.areas (id, workspace_id, slug, name, kind, status)
values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'founder-desk', 'Founder Desk', 'focus', 'active'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'growth-engine', 'Growth Engine', 'growth', 'active'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'client-ops', 'Client Ops', 'ops', 'active')
on conflict do nothing;

insert into public.brands (workspace_id, slug, name, kind, color_hex, description, meta)
values
  ('11111111-1111-1111-1111-111111111111', 'moonpm', 'MoonPM', 'tool', '#5274a8', 'Moonlight Hub and personal operating OS', '{"tone":"moon"}'::jsonb),
  ('11111111-1111-1111-1111-111111111111', 'bridgemaker', 'BridgeMaker', 'agency', '#5274a8', 'Client operations and sales bridge', '{"tone":"company"}'::jsonb),
  ('11111111-1111-1111-1111-111111111111', 'classmoon', 'Class.Moon', 'education', '#5274a8', 'Education, cohorts, and content products', '{"tone":"info"}'::jsonb)
on conflict (workspace_id, slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  color_hex = excluded.color_hex,
  description = excluded.description,
  meta = public.brands.meta || excluded.meta,
  updated_at = now();

insert into public.projects (
  id,
  workspace_id,
  area_id,
  brand_id,
  owner_id,
  slug,
  name,
  summary,
  status,
  priority,
  progress,
  next_action,
  last_activity_at,
  meta
)
select
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  b.id,
  '00000000-0000-0000-0000-000000000001',
  'hub-engine-supabase-live',
  'Hub / Engine / Supabase live wiring',
  'Make Hub and Engine read and write against the same live Supabase ledger.',
  'active',
  'critical',
  35,
  'Fix Supabase project reachability, then run check:connections.',
  now(),
  '{"tag":"p0"}'::jsonb
from public.brands b
where b.workspace_id = '11111111-1111-1111-1111-111111111111'
  and b.slug = 'moonpm'
on conflict do nothing;

insert into public.tasks (workspace_id, project_id, owner_id, title, status, priority, next_action)
values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333331', '00000000-0000-0000-0000-000000000001', 'Confirm Supabase URL resolves', 'doing', 'critical', 'Open the Supabase project and copy the exact Project URL.'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333331', '00000000-0000-0000-0000-000000000001', 'Start Engine runtime', 'todo', 'high', 'Run npm run dev:engine or deploy Engine and set COM_MOON_ENGINE_URL.')
on conflict do nothing;

insert into public.project_updates (
  workspace_id,
  project_id,
  source,
  event_type,
  status,
  title,
  summary,
  progress,
  milestone,
  next_action,
  correlation_id,
  payload
)
values (
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333331',
  'seed',
  'project.progress',
  'active',
  'Supabase setup pack installed',
  'The schema is ready. Runtime connectivity still depends on the real Supabase URL, service role key, and Engine URL.',
  35,
  'database setup',
  'Run supabase/setup/99_smoke_checks.sql and npm run check:connections.',
  'seed:supabase-setup',
  '{"source":"supabase/setup/03_seed_dev_workspace.sql"}'::jsonb
)
on conflict do nothing;

insert into public.webhook_endpoints (workspace_id, name, provider, route_path, status)
values
  ('11111111-1111-1111-1111-111111111111', 'Generic project webhook', 'generic', '/api/webhook/project', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'OpenClaw project webhook', 'openclaw', '/api/webhook/project/openclaw', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'Moltbot project webhook', 'moltbot', '/api/webhook/project/moltbot', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'Telegram webhook', 'telegram', '/api/webhook/telegram', 'active')
on conflict do nothing;

insert into public.integration_connections (workspace_id, provider, status, external_account_id, config, last_synced_at)
values
  ('11111111-1111-1111-1111-111111111111', 'supabase', 'connected', 'dev-ledger', '{"mode":"service-role-rest"}'::jsonb, now()),
  ('11111111-1111-1111-1111-111111111111', 'moonlight_engine', 'pending', 'local-engine', '{"expectedUrl":"http://localhost:3001"}'::jsonb, null)
on conflict do nothing;
