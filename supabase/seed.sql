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

insert into content_items (
  id,
  workspace_id,
  owner_id,
  brand_key,
  title,
  source_idea,
  source_type,
  status,
  next_action
)
values
  (
    '10101010-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'sinabro',
    '브랜드 운영 구조화 카드뉴스',
    '브랜드별 카피 규칙과 배포 리듬을 한 화면에서 보여준다.',
    'brief',
    'idea',
    '첫 장 훅을 더 조용하지만 분명하게 다듬기.'
  ),
  (
    '10101010-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'bridgemaker',
    'BridgeMaker 증거 랜딩 카피',
    '클라이언트 proof strip과 후속 메일 문장을 같은 메시지로 맞춘다.',
    'research',
    'draft',
    'proof block 문장을 하나의 business-fit narrative로 재정렬.'
  ),
  (
    '10101010-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'moonpm',
    '운영 시스템 인사이트 브리프',
    '운영 시스템이 실제로 어떤 마찰을 줄이는지 예시 중심으로 정리한다.',
    'meeting',
    'review',
    '과한 추상어를 줄이고 실제 운영 사례 한 줄을 추가.'
  ),
  (
    '10101010-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'class-moon',
    '문의 전환형 랜딩 proof strip',
    '상담 전환형 문구와 증거 블록을 재배치한다.',
    'repurpose',
    'scheduled',
    '배포 전 mobile first line-break 최종 확인.'
  ),
  (
    '10101010-0000-0000-0000-000000000005',
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'sinabro',
    '이번 주 운영 메모',
    '반응한 독자에게 이번 주 운영 시그널을 짧게 공유한다.',
    'brief',
    'published',
    'warm follow-up 메일과 같은 날 묶어서 다시 테스트.'
  )
on conflict do nothing;

insert into content_variants (
  id,
  workspace_id,
  content_id,
  brand_key,
  variant_type,
  title,
  body,
  status
)
values
  (
    '20202020-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '10101010-0000-0000-0000-000000000002',
    'bridgemaker',
    'landing_copy',
    'BridgeMaker 증거 랜딩 카피',
    '문제 -> proof -> next conversation 구조로 정리된 랜딩 초안입니다.',
    'draft'
  ),
  (
    '20202020-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '10101010-0000-0000-0000-000000000003',
    'moonpm',
    'blog',
    '운영 시스템 인사이트 글',
    '운영 시스템이 실제로 팀의 반복 마찰을 줄이는 사례 중심 글 초안입니다.',
    'draft'
  ),
  (
    '20202020-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '10101010-0000-0000-0000-000000000004',
    'class-moon',
    'landing_copy',
    '문의 전환형 랜딩 카피',
    '프리미엄 톤을 유지하면서 proof와 invitation만 남긴 랜딩 copy.',
    'ready'
  ),
  (
    '20202020-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '10101010-0000-0000-0000-000000000005',
    'sinabro',
    'newsletter',
    '이번 주 운영 메모',
    '이번 주 운영에서 가장 강하게 보인 신호와 다음 움직임을 짧게 적었습니다.',
    'published'
  )
on conflict do nothing;

insert into content_assets (
  id,
  workspace_id,
  variant_id,
  brand_key,
  asset_type,
  storage_path,
  meta
)
values
  (
    '30303030-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '20202020-0000-0000-0000-000000000002',
    'moonpm',
    'image',
    'content/moonpm/automation-insight-hero.png',
    '{"title":"automation-insight-hero","summary":"Long-form insight post용 hero image.","status":"draft","brand_key":"moonpm"}'::jsonb
  ),
  (
    '30303030-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '20202020-0000-0000-0000-000000000003',
    'class-moon',
    'html',
    'content/class-moon/landing-proof-strip.html',
    '{"title":"landing-proof-strip-copy","summary":"Landing proof strip reusable block.","status":"ready","brand_key":"class-moon"}'::jsonb
  ),
  (
    '30303030-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '20202020-0000-0000-0000-000000000004',
    'sinabro',
    'source',
    'content/sinabro/weekly-brief-source-note.md',
    '{"title":"weekly-brief-source-note","summary":"Repurposable operator memo for follow-up content.","status":"archived","brand_key":"sinabro"}'::jsonb
  )
on conflict do nothing;

insert into publish_logs (
  id,
  workspace_id,
  variant_id,
  brand_key,
  channel,
  status,
  external_id,
  payload,
  published_at,
  created_at
)
values
  (
    '40404040-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '20202020-0000-0000-0000-000000000004',
    'sinabro',
    'Email',
    'published',
    'send_001',
    '{"summary":"Warm lead and client segment으로 발송 완료.","brand_key":"sinabro"}'::jsonb,
    now() - interval '3 hours',
    now() - interval '3 hours'
  ),
  (
    '40404040-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '20202020-0000-0000-0000-000000000003',
    'class-moon',
    'Web',
    'queued',
    null,
    '{"summary":"Homepage proof strip publish queued.","brand_key":"class-moon"}'::jsonb,
    null,
    now() - interval '90 minutes'
  ),
  (
    '40404040-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '20202020-0000-0000-0000-000000000002',
    'moonpm',
    'Insights',
    'failed',
    null,
    '{"summary":"Insight post publish failed and needs retry.","brand_key":"moonpm"}'::jsonb,
    null,
    now() - interval '35 minutes'
  )
on conflict do nothing;

insert into campaigns (
  id,
  workspace_id,
  name,
  brand_key,
  channel,
  status,
  goal,
  next_action,
  handoff,
  start_date,
  end_date
)
values
  (
    '50505050-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '시나브로 리텐션 리프레시',
    'sinabro',
    'Email + Instagram',
    'active',
    '최근 반응한 독자를 다시 답장 리듬으로 끌어오는 것.',
    '카드뉴스 1건과 warm follow-up 메일을 같은 날 묶어 발송.',
    'Studio -> Publish -> Email',
    current_date - 7,
    current_date + 7
  ),
  (
    '50505050-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'BridgeMaker 증거 전개',
    'bridgemaker',
    'Landing + Newsletter',
    'draft',
    '클라이언트 proof를 랜딩과 메일에 같은 메시지로 맞추는 것.',
    '랜딩 proof strip 카피와 handoff 메일 문장을 같은 기준으로 재정렬.',
    'Content -> Revenue follow-up',
    current_date - 2,
    current_date + 10
  ),
  (
    '50505050-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'MoonPM 운영 인사이트 시리즈',
    'moonpm',
    'Insights + Newsletter',
    'active',
    '운영 시스템 인사이트를 연속 시리즈로 쌓아 신뢰를 높이는 것.',
    '이번 주 operator note 초안 1건을 금요일 브리프에 연결.',
    'Studio -> Insights -> Weekly brief',
    current_date - 5,
    current_date + 14
  )
on conflict do nothing;

insert into campaign_runs (
  id,
  workspace_id,
  campaign_id,
  status,
  payload,
  result_summary,
  created_at
)
values
  (
    '60606060-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '50505050-0000-0000-0000-000000000001',
    'running',
    '{"brand_key":"sinabro","goal":"답장 리듬 회복","handoff":"Studio -> Publish -> Email"}'::jsonb,
    '콘텐츠와 follow-up 메일 스케줄이 같은 날에 묶이는지 확인 중.',
    now() - interval '4 hours'
  ),
  (
    '60606060-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '50505050-0000-0000-0000-000000000003',
    'queued',
    '{"brand_key":"moonpm","goal":"운영 인사이트 시리즈 시작","handoff":"Insights -> Weekly brief"}'::jsonb,
    '첫 인사이트 글 publish 이후 브리프 handoff 대기.',
    now() - interval '2 hours'
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
  ),
  (
    '99999999-9999-9999-9999-999999999992',
    '11111111-1111-1111-1111-111111111111',
    'Claude',
    'system',
    'ready'
  ),
  (
    '99999999-9999-9999-9999-999999999993',
    '11111111-1111-1111-1111-111111111111',
    'Codex',
    'system',
    'working'
  ),
  (
    '99999999-9999-9999-9999-999999999994',
    '11111111-1111-1111-1111-111111111111',
    'Engine',
    'ops',
    'live'
  )
on conflict do nothing;

insert into ai_threads (
  id,
  workspace_id,
  title,
  target,
  status,
  preview,
  unread,
  updated_at,
  created_at
)
values
  (
    '70707070-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'AI console tab scaffolding',
    'both',
    'active',
    '네비게이션과 i18n에 ai 탭을 추가하고 챗/카운슬/오더 뷰를 배선합니다.',
    2,
    now() - interval '18 minutes',
    now() - interval '1 day'
  ),
  (
    '70707070-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'Engine webhook provider split',
    'codex',
    'active',
    '/api/webhook/project/[provider] 라우트로 분기 로직을 옮기는 중입니다.',
    0,
    now() - interval '42 minutes',
    now() - interval '1 day'
  ),
  (
    '70707070-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'Studio 카피 톤 교정',
    'claude',
    'paused',
    '카드뉴스 톤을 quiet premium으로 다시 맞추는 편집 제안입니다.',
    0,
    now() - interval '2 hours',
    now() - interval '2 days'
  )
on conflict do nothing;

insert into ai_messages (
  id,
  workspace_id,
  thread_id,
  author,
  author_label,
  body,
  created_at
)
values
  (
    '80808080-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '70707070-0000-0000-0000-000000000001',
    'operator',
    'You',
    'Hub에 AI 콘솔 탭을 새로 붙일 거야. Moonstone 미학 지키면서 챗, 카운슬, 오더 뷰 구조 잡아줘.',
    now() - interval '26 minutes'
  ),
  (
    '80808080-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '70707070-0000-0000-0000-000000000001',
    'claude',
    'Claude',
    '탭은 utility 그룹에 넣고 children 4개로 쪼개겠습니다. Overview는 signal-first KPI + 에이전트 상태, Chat은 단일 대화, Council은 멀티-에이전트 턴, Orders는 직접 명령 투입과 생성된 작업 추적입니다.',
    now() - interval '25 minutes'
  ),
  (
    '80808080-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '70707070-0000-0000-0000-000000000001',
    'codex',
    'Codex',
    'server-data.js에 getAiConsolePageData를 추가해 같은 upstream signals를 네 surface가 재사용하게 만들겠습니다.',
    now() - interval '24 minutes'
  ),
  (
    '80808080-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '70707070-0000-0000-0000-000000000002',
    'operator',
    'You',
    'shared-webhook.ts에 provider 검증을 모으고 싶어.',
    now() - interval '55 minutes'
  ),
  (
    '80808080-0000-0000-0000-000000000005',
    '11111111-1111-1111-1111-111111111111',
    '70707070-0000-0000-0000-000000000002',
    'codex',
    'Codex',
    'provider별 경로는 분리하되 검증 로직은 shared-webhook.ts에 모을게요.',
    now() - interval '52 minutes'
  )
on conflict do nothing;

insert into ai_council_sessions (
  id,
  workspace_id,
  topic,
  members,
  status,
  tone,
  context,
  created_at,
  updated_at
)
values
  (
    '90909090-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'AI 콘솔 탭 범위와 오픈 오더 UX',
    '["Claude","Codex"]'::jsonb,
    'active',
    'blue',
    'Chat은 대화, Orders는 실행, Council은 합의라는 레이어를 유지해야 한다.',
    now() - interval '30 minutes',
    now() - interval '21 minutes'
  ),
  (
    '90909090-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '엔진 웹훅 프로바이더 분리 경로',
    '["Claude","Codex"]'::jsonb,
    'done',
    'green',
    '공유 핸들러와 provider route를 어떻게 나눌지 합의한 세션.',
    now() - interval '3 hours',
    now() - interval '2 hours'
  )
on conflict do nothing;

insert into ai_council_turns (
  id,
  workspace_id,
  session_id,
  author,
  stance,
  body,
  created_at
)
values
  (
    '91919191-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '90909090-0000-0000-0000-000000000001',
    'Claude',
    '제안',
    '챗과 오더를 한 화면에 합치면 signal-first 원칙이 깨집니다. Chat은 대화, Orders는 실행 디스패치로 유지하는 것이 좋습니다.',
    now() - interval '29 minutes'
  ),
  (
    '91919191-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '90909090-0000-0000-0000-000000000001',
    'Codex',
    '보완',
    'Overview에 오픈 오더와 챗 점프 링크를 두면 왕복 동선은 줄일 수 있습니다.',
    now() - interval '28 minutes'
  ),
  (
    '91919191-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '90909090-0000-0000-0000-000000000001',
    'Claude',
    '결정',
    'Overview = KPI + 에이전트 상태 + 오픈 오더 스냅샷. Chat / Council / Orders를 분리 유지합니다.',
    now() - interval '27 minutes'
  ),
  (
    '91919191-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '90909090-0000-0000-0000-000000000002',
    'Codex',
    '결정',
    'shared-webhook.ts에 검증 로직을 통합하고 provider path를 분리하는 방향으로 마무리.',
    now() - interval '2 hours'
  )
on conflict do nothing;

insert into ai_orders (
  id,
  workspace_id,
  title,
  target,
  status,
  priority,
  lane,
  due_label,
  note,
  tone,
  created_at,
  updated_at
)
values
  (
    '92929292-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'AI 콘솔 탭 뷰 4종 실제 배선',
    'both',
    'running',
    'P1',
    'Hub UX',
    '오늘 17:00',
    'Chat / Council / Orders surface를 실제 POST 가능한 워크스페이스로 올린다.',
    'blue',
    now() - interval '40 minutes',
    now() - interval '18 minutes'
  ),
  (
    '92929292-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'Engine webhook 프로바이더 분기 이관',
    'codex',
    'review',
    'P1',
    'Engine',
    '내일 오전',
    'shared-webhook.ts 통합 후 provider별 회귀 테스트 필요.',
    'warning',
    now() - interval '5 hours',
    now() - interval '55 minutes'
  ),
  (
    '92929292-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '카드뉴스 톤 가이드 재정렬',
    'claude',
    'queued',
    'P2',
    'Content',
    '이번 주',
    'Studio에서 최근 3주 발행 카피를 샘플링해 quiet premium 기준을 다시 잡는다.',
    'muted',
    now() - interval '9 hours',
    now() - interval '3 hours'
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
