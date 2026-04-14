-- Com_Moon Hub OS seed data
-- Safe starter data for local or staging environments.

insert into profiles (id, email, display_name, role)
values
  ('00000000-0000-0000-0000-000000000001', 'boss@com-moon.local', 'Boss', 'owner')
on conflict (email) do update
set
  display_name = excluded.display_name,
  role = excluded.role;

insert into workspaces (id, owner_id, slug, name, timezone)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'com-moon-os',
    'Com_Moon OS',
    'Asia/Seoul'
  )
on conflict (slug) do update
set
  owner_id = excluded.owner_id,
  name = excluded.name,
  timezone = excluded.timezone;

insert into areas (id, workspace_id, name, kind, status)
values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Founder Desk', 'focus', 'active'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Growth Engine', 'growth', 'active'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Client Ops', 'ops', 'active')
on conflict do nothing;

insert into projects (id, workspace_id, area_id, name, status, priority, next_action)
values
  (
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    'Hub OS Activation',
    'active',
    'critical',
    'Connect live Supabase reads into the operating shell.'
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Content Engine Rollout',
    'active',
    'high',
    'Turn the card-news flow into HTML, PNG, and ZIP output.'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222223',
    'Project Webhook Intake',
    'blocked',
    'high',
    'Map external project tools to the webhook payload format.'
  )
on conflict do nothing;

insert into tasks (id, workspace_id, project_id, owner_id, title, status, next_action)
values
  (
    '44444444-4444-4444-4444-444444444441',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    '00000000-0000-0000-0000-000000000001',
    'Wire dashboard counts to live reads',
    'doing',
    'Confirm project, task, and log cards render from the seeded workspace.'
  ),
  (
    '44444444-4444-4444-4444-444444444442',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    '00000000-0000-0000-0000-000000000001',
    'Finalize card-news export spec',
    'todo',
    'Translate the skill document into a concrete render pipeline.'
  ),
  (
    '44444444-4444-4444-4444-444444444443',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000001',
    'Validate webhook smoke test',
    'blocked',
    'Provide the engine URL and a reachable workspace configuration.'
  )
on conflict do nothing;

insert into project_updates (
  id,
  workspace_id,
  project_id,
  source,
  event_type,
  status,
  title,
  summary,
  progress,
  milestone,
  next_action
)
values
  (
    '55555555-5555-5555-5555-555555555551',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    'seed',
    'project.progress',
    'active',
    'Hub shell connected to seeded workspace',
    'Dashboard routes now resolve dynamic workspace reads and render without mock-only mode.',
    72,
    'Read layer + operator views',
    'Move from seed data to production workspace config.'
  ),
  (
    '55555555-5555-5555-5555-555555555552',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'seed',
    'project.progress',
    'active',
    'Card-news result structure ready',
    'Engine returns structured card-news metadata so the next render step has a stable contract.',
    58,
    'Structured generation result',
    'Implement HTML/PNG/ZIP rendering.'
  ),
  (
    '55555555-5555-5555-5555-555555555553',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    'seed',
    'project.progress',
    'blocked',
    'Webhook intake is waiting on real tool mapping',
    'The engine route is live, but external project tools still need payload mapping and credentials.',
    41,
    'Smoke test route online',
    'Map one external system into the project webhook contract.'
  )
on conflict do nothing;

insert into routine_checks (workspace_id, project_id, check_type, status, note, checked_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    'morning',
    'done',
    'Checked the dashboard, picked the top project, and verified the engine routes.',
    now() - interval '6 hours'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    'midday',
    'pending',
    'Review project movement and confirm whether the next action changed.',
    null
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    'weekly',
    'blocked',
    'Cannot close the weekly review until an external webhook payload lands successfully.',
    null
  )
on conflict do nothing;

insert into leads (id, workspace_id, source, status, score, next_action)
values
  (
    '66666666-6666-6666-6666-666666666661',
    '11111111-1111-1111-1111-111111111111',
    'insight-post',
    'qualified',
    82,
    'Send a follow-up message after the next case study publish.'
  ),
  (
    '66666666-6666-6666-6666-666666666662',
    '11111111-1111-1111-1111-111111111111',
    'referral',
    'nurturing',
    64,
    'Prepare a short deck and confirm the next call.'
  )
on conflict do nothing;

insert into deals (id, workspace_id, lead_id, title, amount, stage)
values
  (
    '77777777-7777-7777-7777-777777777771',
    '11111111-1111-1111-1111-111111111111',
    '66666666-6666-6666-6666-666666666661',
    'Studio OS advisory pilot',
    3200000,
    'proposal'
  )
on conflict do nothing;

insert into operation_cases (id, workspace_id, owner_id, title, status, next_action)
values
  (
    '88888888-8888-8888-8888-888888888881',
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'Inbound operating setup',
    'active',
    'Review the lead and decide whether to move it into the proposal lane.'
  )
on conflict do nothing;

insert into agents (id, workspace_id, name, agent_type, status)
values
  (
    '99999999-9999-9999-9999-999999999991',
    '11111111-1111-1111-1111-111111111111',
    'Strategist Maggie',
    'strategist',
    'idle'
  )
on conflict do nothing;

insert into automations (id, workspace_id, agent_id, name, status, last_run_at)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    '99999999-9999-9999-9999-999999999991',
    'Telegram command intake',
    'active',
    now() - interval '30 minutes'
  )
on conflict do nothing;

insert into automation_runs (
  id,
  workspace_id,
  automation_id,
  agent_id,
  status,
  input_payload,
  output_payload,
  created_at,
  finished_at
)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '99999999-9999-9999-9999-999999999991',
    'success',
    '{"command":"cardnews","source":"seed"}'::jsonb,
    '{"title":"Retention campaign draft","summary":"Structured card-news result ready for rendering."}'::jsonb,
    now() - interval '45 minutes',
    now() - interval '44 minutes'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '99999999-9999-9999-9999-999999999991',
    'ignored',
    '{"command":"status","source":"seed"}'::jsonb,
    '{"message":"Engine is alive."}'::jsonb,
    now() - interval '20 minutes',
    now() - interval '20 minutes'
  )
on conflict do nothing;

insert into webhook_endpoints (id, workspace_id, name, provider, route_path, status, last_seen_at)
values
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc1',
    '11111111-1111-1111-1111-111111111111',
    'Telegram Bot Intake',
    'telegram',
    '/api/webhook/telegram',
    'active',
    now() - interval '20 minutes'
  ),
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc2',
    '11111111-1111-1111-1111-111111111111',
    'Project Progress Intake',
    'project-tool',
    '/api/webhook/project',
    'active',
    now() - interval '10 minutes'
  ),
  (
    'cccccccc-cccc-cccc-cccc-ccccccccccc3',
    '11111111-1111-1111-1111-111111111111',
    'Engine Health',
    'system',
    '/api/health',
    'active',
    now() - interval '5 minutes'
  )
on conflict do nothing;

insert into webhook_events (workspace_id, endpoint_id, event_type, source, status, payload, received_at, processed_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'cccccccc-cccc-cccc-cccc-ccccccccccc1',
    'telegram.cardnews',
    'telegram',
    'processed',
    '{"command":"cardnews"}'::jsonb,
    now() - interval '45 minutes',
    now() - interval '44 minutes'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'cccccccc-cccc-cccc-cccc-ccccccccccc2',
    'project.progress',
    'hub-smoke-test',
    'received',
    '{"origin":"seed"}'::jsonb,
    now() - interval '12 minutes',
    now() - interval '11 minutes'
  )
on conflict do nothing;

insert into error_logs (workspace_id, context, payload, trace, level, source, resolved, timestamp)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'project-webhook',
    '{"warning":"External payload mapping still pending."}'::jsonb,
    'project-webhook:seed',
    'warn',
    'system',
    false,
    now() - interval '2 hours'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'telegram-command',
    '{"info":"Latest command flow completed successfully."}'::jsonb,
    'telegram:seed',
    'info',
    'telegram',
    false,
    now() - interval '30 minutes'
  )
on conflict do nothing;
