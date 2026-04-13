-- com_moon/supabase/seed.sql
-- Optional demo data for local/dev bootstrap

begin;

with default_workspace as (
  select id
  from public.workspaces
  where slug = 'com-moon'
  limit 1
)
insert into public.projects (workspace_id, key, name, description, repo_name, status)
select
  w.id,
  v.key,
  v.name,
  v.description,
  v.repo_name,
  'active'
from default_workspace as w
cross join (
  values
    ('hub-os', 'Com_Moon Hub OS', '관리자용 통합 허브', 'com_moon'),
    ('classinkr-web', 'ClassinKR Web', '콘텐츠/랜딩 운영 자산', 'classinkr-web'),
    ('sales-branding-dash', 'Sales Branding Dashboard', '세일즈/브랜딩 파이프라인', 'sales_branding_dash'),
    ('ai-command-pot', 'AI Command Pot', '자동화/오케스트레이션 실험실', 'ai-command-pot')
) as v(key, name, description, repo_name)
where not exists (
  select 1
  from public.projects p
  where p.workspace_id = w.id
    and p.key = v.key
);

with default_workspace as (
  select id
  from public.workspaces
  where slug = 'com-moon'
  limit 1
)
insert into public.leads (
  workspace_id,
  name,
  email,
  source,
  status,
  notes,
  company,
  desired_service,
  created_at
)
select
  w.id,
  v.name,
  v.email,
  v.source,
  v.status::public.lead_status,
  v.notes,
  v.company,
  v.desired_service,
  v.created_at
from default_workspace as w
cross join (
  values
    ('김하늘', 'sky@demo.com', '인스타그램', 'new', '상담 요청 접수, 오늘 재연락 예정', 'Haneul Edu', '콘텐츠 운영', now() - interval '2 hours'),
    ('이서준', 'seojun@demo.com', '소개', 'contacted', '소개 리드, 어제 통화 완료', 'Moon Studio', '브랜딩 리뉴얼', now() - interval '1 day 3 hours'),
    ('박민지', 'minji@demo.com', '광고', 'qualified', '예산 범위 공유 완료', 'Minji Academy', '세일즈 자동화', now() - interval '4 hours'),
    ('최도윤', 'doyun@demo.com', '블로그', 'won', '파일럿 계약 체결', 'Doyun Lab', '리드 관리 대시보드', now() - interval '5 days'),
    ('정유진', 'yujin@demo.com', '지인 소개', 'lost', '시점 보류로 종료', 'YJ English', '콘텐츠 에디터', now() - interval '8 days')
) as v(name, email, source, status, notes, company, desired_service, created_at)
where not exists (
  select 1 from public.leads limit 1
);

with default_workspace as (
  select id
  from public.workspaces
  where slug = 'com-moon'
  limit 1
)
insert into public.operation_cases (
  workspace_id,
  title,
  description,
  status,
  priority,
  started_at,
  created_at
)
select
  w.id,
  v.title,
  v.description,
  v.status::public.operation_case_status,
  v.priority::public.priority_level,
  v.started_at,
  v.created_at
from default_workspace as w
cross join (
  values
    ('Hub OS 대시보드 정리', '메인 KPI 카드/상태 흐름 정리', 'active', 'high', now() - interval '3 days', now() - interval '3 days'),
    ('세일즈 리드 파이프라인 리팩터링', '리드 상태 및 액션 흐름 개선', 'active', 'medium', now() - interval '1 day', now() - interval '1 day'),
    ('n8n 연동 초안 검토', '자동화 Phase 3 설계 문서화', 'closed', 'low', now() - interval '12 days', now() - interval '12 days')
) as v(title, description, status, priority, started_at, created_at)
where not exists (
  select 1 from public.operation_cases limit 1
);

with default_workspace as (
  select id
  from public.workspaces
  where slug = 'com-moon'
  limit 1
)
insert into public.content_items (
  workspace_id,
  title,
  subtitle,
  body,
  status,
  template_id,
  content_type,
  created_at,
  published_at
)
select
  w.id,
  v.title,
  v.subtitle,
  v.body,
  v.status::public.content_status,
  'v3',
  'card_news',
  v.created_at,
  v.published_at
from default_workspace as w
cross join (
  values
    (
      '입시 설명회 핵심 포인트',
      '학부모 대상 · 04월 11일',
      E'- 핵심 일정 먼저 정리\n- 질문 많은 항목만 선별\n- CTA는 상담 예약으로 통일',
      'published',
      now() - interval '2 days',
      now() - interval '2 days'
    ),
    (
      '브랜딩 진단 체크리스트',
      '진행중 초안 · 오늘',
      E'- 현재 채널 톤 점검\n- CTA 위치 재정렬\n- 서비스 카테고리 명확화',
      'draft',
      now() - interval '3 hours',
      null
    ),
    (
      '학부모 상담 FAQ',
      '지난주 발행 · 아카이브용',
      E'- 상담 준비물 안내\n- 빈출 질문 미리 정리\n- 후속 알림 문구 표준화',
      'published',
      now() - interval '9 days',
      now() - interval '9 days'
    )
) as v(title, subtitle, body, status, created_at, published_at)
where not exists (
  select 1 from public.content_items limit 1
);

insert into public.content_publications (
  content_id,
  channel,
  status,
  published_url,
  published_at
)
select
  ci.id,
  'web',
  'published',
  'https://example.com/content/guide-1',
  ci.published_at
from public.content_items as ci
where ci.title = '입시 설명회 핵심 포인트'
  and not exists (
    select 1 from public.content_publications limit 1
  );

with default_workspace as (
  select id
  from public.workspaces
  where slug = 'com-moon'
  limit 1
)
insert into public.automation_workflows (
  workspace_id,
  key,
  name,
  description,
  trigger_source,
  status,
  schedule_text,
  last_run_at,
  next_run_at
)
select
  w.id,
  'daily-kpi-brief',
  'Daily KPI Brief',
  '대시보드 요약을 생성하는 일일 브리프 워크플로',
  'schedule',
  'active',
  'Every weekday at 09:00 Asia/Seoul',
  now() - interval '7 hours',
  date_trunc('day', now()) + interval '1 day 9 hours'
from default_workspace as w
where not exists (
  select 1
  from public.automation_workflows
  where key = 'daily-kpi-brief'
);

insert into public.automation_runs (
  workflow_id,
  agent_id,
  status,
  trigger_source,
  payload,
  started_at,
  finished_at,
  created_at
)
select
  aw.id,
  'moon-strategist',
  'success',
  'schedule',
  '{"summary":"Morning KPI brief"}'::jsonb,
  now() - interval '7 hours',
  now() - interval '6 hours 58 minutes',
  now() - interval '7 hours'
from public.automation_workflows aw
where aw.key = 'daily-kpi-brief'
  and not exists (
    select 1 from public.automation_runs limit 1
  );

with default_workspace as (
  select id
  from public.workspaces
  where slug = 'com-moon'
  limit 1
)
insert into public.error_logs (
  workspace_id,
  context,
  payload,
  trace,
  severity,
  archived,
  "timestamp",
  created_at
)
select
  w.id,
  v.context,
  v.payload::jsonb,
  v.trace,
  v.severity::public.error_severity,
  v.archived,
  v.logged_at,
  v.logged_at
from default_workspace as w
cross join (
  values
    ('telegram-webhook', '{"error":"timeout"}', 'telegram-api', 'error', false, now() - interval '6 hours'),
    ('hub-dashboard', '{"note":"stale cache detected"}', 'dashboard-kpi', 'warn', true, now() - interval '3 days')
) as v(context, payload, trace, severity, archived, logged_at)
where not exists (
  select 1 from public.error_logs limit 1
);

with default_workspace as (
  select id
  from public.workspaces
  where slug = 'com-moon'
  limit 1
)
insert into public.decision_records (
  workspace_id,
  title,
  context,
  decision,
  status,
  tags,
  decided_at,
  created_at
)
select
  w.id,
  'Hub OS의 기본 데이터 소스는 Supabase로 통일',
  '콘텐츠/세일즈/운영 모듈을 하나의 운영 DB로 묶기 위함',
  'Supabase public schema를 운영 허브의 단일 소스로 사용',
  'accepted',
  array['db', 'architecture', 'hub-os'],
  now() - interval '2 days',
  now() - interval '2 days'
from default_workspace as w
where not exists (
  select 1 from public.decision_records limit 1
);

commit;
