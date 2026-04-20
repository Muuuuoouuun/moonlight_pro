-- Moonlight Supabase-first seed supplement
-- Run after:
-- 1. supabase/schema.sql
-- 2. supabase/seed.sql
-- 3. supabase/migrations/20260420_0001_supabase_first_foundation.sql

insert into brands (workspace_id, slug, name, kind, color_hex, description, meta)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'moonpm',
    'MoonPM',
    'tool',
    '#5274a8',
    'Moonlight Hub와 개인 운영 OS',
    '{"glyph":"◐","tone":"moon"}'::jsonb
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'bridgemaker',
    'BridgeMaker',
    'agency',
    '#5274a8',
    '클라이언트 운영과 세일즈 브릿지',
    '{"glyph":"◇","tone":"company"}'::jsonb
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'classmoon',
    'Class.Moon',
    'education',
    '#5274a8',
    '교육, 코호트, 콘텐츠 상품',
    '{"glyph":"□","tone":"info"}'::jsonb
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'sinabro',
    'Sinabro',
    'content',
    '#5274a8',
    '출판과 긴 호흡의 콘텐츠 브랜드',
    '{"glyph":"✦","tone":"warning"}'::jsonb
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    '22nomad',
    '22th.Nomad',
    'personal',
    '#5274a8',
    '개인 기록과 퍼스널 브랜딩',
    '{"glyph":"◎","tone":"personal"}'::jsonb
  )
on conflict (workspace_id, slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  color_hex = excluded.color_hex,
  description = excluded.description,
  meta = brands.meta || excluded.meta,
  updated_at = now();

update projects p
set
  brand_id = b.id,
  owner_id = '00000000-0000-0000-0000-000000000001',
  slug = 'hub-os-activation',
  summary = 'Hub, Engine, Supabase ledger를 하나의 운영 표면으로 연결한다.',
  progress = 72,
  last_activity_at = now(),
  meta = p.meta || '{"tag":null}'::jsonb
from brands b
where p.id = '33333333-3333-3333-3333-333333333331'
  and b.workspace_id = p.workspace_id
  and b.slug = 'moonpm';

update projects p
set
  brand_id = b.id,
  owner_id = '00000000-0000-0000-0000-000000000001',
  slug = 'content-engine-rollout',
  summary = '카드뉴스와 콘텐츠 제작 흐름을 Hub Queue, Studio, Publish로 연결한다.',
  progress = 58,
  last_activity_at = now() - interval '2 hours',
  meta = p.meta || '{"tag":null}'::jsonb
from brands b
where p.id = '33333333-3333-3333-3333-333333333332'
  and b.workspace_id = p.workspace_id
  and b.slug = 'classmoon';

update projects p
set
  brand_id = b.id,
  owner_id = '00000000-0000-0000-0000-000000000001',
  slug = 'project-webhook-intake',
  summary = '외부 프로젝트 도구와 agent workflow를 generic project webhook으로 수집한다.',
  progress = 41,
  last_activity_at = now() - interval '4 hours',
  meta = p.meta || '{"tag":null}'::jsonb
from brands b
where p.id = '33333333-3333-3333-3333-333333333333'
  and b.workspace_id = p.workspace_id
  and b.slug = 'moonpm';

insert into projects (
  id,
  workspace_id,
  brand_id,
  area_id,
  owner_id,
  slug,
  name,
  summary,
  status,
  priority,
  progress,
  next_action,
  due_at,
  last_activity_at,
  meta
)
select
  '33333333-3333-3333-3333-333333333334',
  '11111111-1111-1111-1111-111111111111',
  b.id,
  '22222222-2222-2222-2222-222222222223',
  '00000000-0000-0000-0000-000000000001',
  'classin-spring-cohort',
  'ClassIn Spring Cohort',
  '클라이언트 코호트 운영, 제안, 계약, 후속 액션을 관리한다.',
  'active',
  'high',
  45,
  '계약 리마인드 메일과 제안서 v3를 정리한다.',
  now() + interval '18 days',
  now() - interval '1 hour',
  '{"tag":"company"}'::jsonb
from brands b
where b.workspace_id = '11111111-1111-1111-1111-111111111111'
  and b.slug = 'bridgemaker'
on conflict do nothing;

insert into tasks (
  id,
  workspace_id,
  project_id,
  owner_id,
  title,
  status,
  priority,
  next_action,
  due_at
)
values
  (
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333334',
    '00000000-0000-0000-0000-000000000001',
    '계약 리마인드 메일 초안 작성',
    'todo',
    'high',
    '최근 미팅 요약과 다음 결정을 한 문단으로 정리한다.',
    now() + interval '1 day'
  ),
  (
    '44444444-4444-4444-4444-444444444445',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333334',
    '00000000-0000-0000-0000-000000000001',
    '제안서 v3 범위와 가격표 검토',
    'doing',
    'medium',
    '두 티어로 압축한 가격 구조를 확인한다.',
    now() + interval '3 days'
  )
on conflict do nothing;
