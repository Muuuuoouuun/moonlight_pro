-- Moonlight Supabase-first seed supplement
-- Run after:
-- 1. supabase/schema.sql
-- 2. supabase/seed.sql
-- 3. supabase/migrations/20260420_0001_supabase_first_foundation.sql

with canonical_brands(slug, name, kind, description, meta) as (
  values
    (
      'sinabro',
      '시나브로',
      'content',
      '출판·콘텐츠 레이블',
      jsonb_build_object(
        'glyph', '✦',
        'tone', 'info',
        'order', 10,
        'philosophy', '감정, 언어, 사유의 깊이를 조용히 탐구한다.',
        'direction', '저빈도·고품질로 한 편 한 편의 울림을 축적한다.',
        'voice', '조용하고 깊이 있는 언어, 서두르지 않는 호흡, 내면을 들여다보는 시선',
        'cadence', 'low_frequency_high_quality',
        'keywords', jsonb_build_array('시', '문학', '문화', '내면', '언어'),
        'content_rules', jsonb_build_array('트렌드를 좇지 않는다.', '감정이 준비되지 않았으면 쓰지 않는다.', '언어의 무게를 존중한다.'),
        'forbidden_terms', jsonb_build_array('가벼운 낚시성 훅', '과잉 설명', '트렌드 추종')
      )
    ),
    (
      'gore',
      '고래(Go;Re)',
      'product',
      '회복·리커버리 프로덕트',
      jsonb_build_object(
        'glyph', '◌',
        'tone', 'company',
        'order', 20,
        'philosophy', '루틴과 챌린지를 통해 스스로를 실험하고 회복의 과정을 기록한다.',
        'direction', '30일·100일 같은 챌린지 단위로 시작, 중간, 끝의 서사를 만든다.',
        'voice', '진솔하고 인간적이며 실패를 숨기지 않고 격려하되 강요하지 않는 언어',
        'cadence', 'challenge_based',
        'keywords', jsonb_build_array('도전', '루틴', '인간 실험', '동기부여', '회복'),
        'content_rules', jsonb_build_array('과정을 숨기지 않는다.', '완벽을 추구하지 않는다.', '다른 사람의 도전을 응원한다.'),
        'forbidden_terms', jsonb_build_array('성공 강요', '완벽한 척', '근거 없는 동기부여')
      )
    ),
    (
      'holyfuncollector',
      'HolyFunCollector',
      'community',
      '기독교 신앙을 밈과 유머로 풀어내는 확산형 콘텐츠',
      jsonb_build_object(
        'glyph', '✧',
        'tone', 'warning',
        'order', 30,
        'philosophy', '신앙의 일상성을 밈과 유머로 가볍게 열어 공감을 만든다.',
        'direction', '짧고 임팩트 있는 고빈도 콘텐츠로 확산성을 실험한다.',
        'voice', '가볍고 유머러스하지만 진정성을 잃지 않는 공감형 밈 언어',
        'cadence', 'high_frequency_viral',
        'keywords', jsonb_build_array('신앙', '밈', '유머', '확산성', '공감'),
        'channels', jsonb_build_array('Instagram'),
        'source_links', jsonb_build_array('https://www.instagram.com/holyfuncollect0r/'),
        'content_rules', jsonb_build_array('신앙을 희화화하지 않는다.', '공감 가능한 일상적 경험을 담는다.', '확산성과 진정성의 균형을 유지한다.'),
        'forbidden_terms', jsonb_build_array('조롱', '내부자만 아는 농담', '신앙의 희화화')
      )
    ),
    (
      'bridgemaker',
      'BridgeMaker',
      'agency',
      '신앙과 삶, 신학과 일상 사이의 다리를 놓는 사유형 콘텐츠',
      jsonb_build_object(
        'glyph', '◇',
        'tone', 'moon',
        'order', 40,
        'philosophy', '신앙과 삶, 신학과 일상 사이의 연결점을 찾는다.',
        'direction', '질문으로 시작해 사유로 마무리하는 중빈도 콘텐츠를 만든다.',
        'voice', '진지하되 무겁지 않고 질문을 던지며 연결과 통합을 지향하는 언어',
        'cadence', 'mid_frequency_reflective',
        'keywords', jsonb_build_array('신학', '삶', '질문', '다리 놓기', '연결'),
        'channels', jsonb_build_array('Threads', 'Instagram'),
        'source_links', jsonb_build_array('https://www.threads.com/@ml_bridgemaker?hl=ko', 'https://www.instagram.com/p/DXQXgrnn2rR/?img_index=1'),
        'content_rules', jsonb_build_array('답을 강요하지 않는다.', '이분법적 사고를 경계한다.', '연결점을 찾는 데 집중한다.'),
        'forbidden_terms', jsonb_build_array('단정적 정답', '편 가르기', '과도한 설교조')
      )
    ),
    (
      'moonpm',
      'MoonPM',
      'tool',
      'PM 툴킷과 Moonlight Hub 운영 OS',
      jsonb_build_object(
        'glyph', '◐',
        'tone', 'warning',
        'order', 50,
        'philosophy', '실무에서 검증된 PM·기획·마케팅 지식을 구조화해 쌓는다.',
        'direction', '다른 브랜드의 백본이 되는 콘텐츠 원천 저장소로 운영한다.',
        'voice', '명확하고 구조화된 실무 언어, 프레임워크 중심 접근',
        'cadence', 'archive_and_selective_share',
        'keywords', jsonb_build_array('PM', '기획', '구조화', '프레임워크', '마케팅'),
        'content_rules', jsonb_build_array('실무에서 검증된 내용만 공유한다.', '추상적 이론보다 구체적 방법론을 우선한다.', '지속적으로 업데이트한다.'),
        'forbidden_terms', jsonb_build_array('검증 없는 방법론', '뜬구름 잡는 이론', '과장된 생산성 약속')
      )
    ),
    (
      'classmoon',
      'Class.Moon',
      'education',
      '에듀테크 현장 기반 세일즈 개인 브랜드',
      jsonb_build_object(
        'glyph', '□',
        'tone', 'info',
        'order', 60,
        'philosophy', '교육 현장의 실제 문제 해결을 통해 신뢰를 만든다.',
        'direction', '사례 중심 콘텐츠로 가치 제공을 먼저 하고 세일즈는 뒤에 둔다.',
        'voice', '현장감 있는 언어, 관찰자의 시선, 진정성과 전문성의 균형',
        'cadence', 'priority_1_case_led',
        'keywords', jsonb_build_array('에듀테크', '세일즈', '현장', '신뢰', '사례'),
        'content_rules', jsonb_build_array('판매보다 가치 제공이 우선이다.', '과장하지 않는다.', '고객의 실제 변화를 기록한다.', '교육 현장을 존중한다.'),
        'forbidden_terms', jsonb_build_array('과장된 성과', '제품 홍보만 있는 글', '현장 없는 조언')
      )
    ),
    (
      'studyseagull',
      'Study.Seagull',
      'education',
      '학습과 교육에 대한 관찰과 비판을 밈으로 풀어내는 익명 계정',
      jsonb_build_object(
        'glyph', '△',
        'tone', 'danger',
        'order', 70,
        'philosophy', '교육과 학습의 구조적 문제를 공감 가능한 밈으로 드러낸다.',
        'direction', '익명성과 밈 형식으로 확산성을 확보하되 책임감 있게 비판한다.',
        'voice', '날카롭지만 유머러스하고 구조적 시각을 유지하는 문제 제기',
        'cadence', 'observational_meme',
        'keywords', jsonb_build_array('교육', '공부', '구조', '비판', '관찰', '밈'),
        'content_rules', jsonb_build_array('비판을 위한 비판은 하지 않는다.', '구조를 보고 지적한다.', '공감 가능한 지점을 찾는다.', '익명성을 책임감 있게 사용한다.'),
        'forbidden_terms', jsonb_build_array('개인 공격', '비난만 있는 글', '책임 없는 익명성')
      )
    ),
    (
      'politicofficer',
      'Politic_Officer',
      'research',
      '정치와 사회 현상을 관찰하고 질문을 던지는 실험적 채널',
      jsonb_build_object(
        'glyph', '◎',
        'tone', 'info',
        'order', 80,
        'philosophy', '정치와 사회 현상을 중립적으로 관찰하되 무관심하지 않게 질문한다.',
        'direction', '중요한 순간에만 저빈도로 발행하며 장기적 구조 이해를 축적한다.',
        'voice', '질문 중심, 구조를 보려는 시도, 감정보다 논리를 우선하되 인간을 잊지 않는 태도',
        'cadence', 'low_frequency_moment_based',
        'keywords', jsonb_build_array('정치', '관찰', '질문', '사회', '사유', '구조'),
        'channels', jsonb_build_array('Threads', 'Instagram'),
        'source_links', jsonb_build_array('https://www.threads.com/@politic_officer?hl=ko', 'https://www.instagram.com/politic_officer/'),
        'content_rules', jsonb_build_array('이분법적 사고를 경계한다.', '섣부른 결론을 내리지 않는다.', '구조적 이해를 추구한다.', '감정보다 논리를 우선하되 인간을 잊지 않는다.'),
        'forbidden_terms', jsonb_build_array('진영 논리', '성급한 단정', '혐오 조장')
      )
    ),
    (
      '22nomad',
      '22th.Nomad',
      'personal',
      '개인 블로그·메모',
      jsonb_build_object(
        'glyph', '◻',
        'tone', 'personal',
        'order', 90,
        'philosophy', '개인의 이동, 기록, 운영 로그를 남겨 다음 선택의 재료로 만든다.',
        'direction', '개인 브랜드 사이트와 공개 메모의 허브로 천천히 정리한다.',
        'voice', '담백하고 개인적인 기록, 지나친 포장보다 실제 맥락',
        'cadence', 'personal_archive',
        'keywords', jsonb_build_array('개인 기록', '퍼스널 브랜딩', '메모', '운영 로그'),
        'content_rules', jsonb_build_array('실제 경험을 우선한다.', '과장된 자기브랜딩을 피한다.', '다음 선택에 남는 기록으로 닫는다.'),
        'forbidden_terms', jsonb_build_array('빈 자기홍보', '근거 없는 선언'),
        'source_state', 'inferred_from_seed_notion_blank'
      )
    )
)
insert into brands (workspace_id, slug, name, kind, status, color_hex, description, meta)
select
  '11111111-1111-1111-1111-111111111111',
  slug,
  name,
  kind,
  'active',
  '#5274a8',
  description,
  meta
from canonical_brands
on conflict (workspace_id, slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  status = excluded.status,
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

insert into content_items (
  id,
  workspace_id,
  brand_id,
  owner_id,
  title,
  source_idea,
  source_type,
  status,
  summary,
  next_action,
  slug,
  scheduled_at,
  visibility,
  meta
)
values
  (
    'dddddddd-dddd-dddd-dddd-dddddddddd01',
    '11111111-1111-1111-1111-111111111111',
    (select id from brands where workspace_id = '11111111-1111-1111-1111-111111111111' and slug = 'classmoon'),
    '00000000-0000-0000-0000-000000000001',
    '뉴스레터 #47 · 운영 리듬을 되찾는 첫 화면',
    'Daily Brief, Content Queue, Revenue follow-up을 하나의 아침 운영면으로 묶는다.',
    'brief',
    'draft',
    'Spring Cohort warm audience에 보낼 founder-note 초안.',
    '2번 섹션에 실제 follow-up proof를 추가한다.',
    'newsletter-47-operating-rhythm',
    now() + interval '7 hours',
    'workspace',
    '{"origin":"seed","brand_key":"classmoon","automation_recipe_id":"newsletter_send"}'::jsonb
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddd02',
    '11111111-1111-1111-1111-111111111111',
    (select id from brands where workspace_id = '11111111-1111-1111-1111-111111111111' and slug = 'moonpm'),
    '00000000-0000-0000-0000-000000000001',
    '결정을 기록하는 노트의 구조',
    '결정은 흘러가면 사라지지만, 네 칸으로 잡으면 다음 행동의 원장이 된다.',
    'research',
    'review',
    'Moonlight Hub의 decision log 철학을 설명하는 insight draft.',
    'CTA를 MoonPM proof strip과 연결한다.',
    'decision-note-structure',
    null,
    'workspace',
    '{"origin":"seed","brand_key":"moonpm","template_id":"insight-note"}'::jsonb
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddd03',
    '11111111-1111-1111-1111-111111111111',
    (select id from brands where workspace_id = '11111111-1111-1111-1111-111111111111' and slug = 'sinabro'),
    '00000000-0000-0000-0000-000000000001',
    '한 해의 운영 회고를 콘텐츠 자산으로 바꾸는 법',
    '연말 회고는 감상이 아니라 다음 해 운영 시스템의 입력이다.',
    'repurpose',
    'scheduled',
    '시나브로 long-form 글을 카드뉴스로 요약한 배포 패키지.',
    'Google Drive export 결과를 content_assets에 기록한다.',
    'year-end-operating-review-carousel',
    now() + interval '1 day',
    'workspace',
    '{"origin":"seed","brand_key":"sinabro","export_profile":"instagram_carousel"}'::jsonb
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddd04',
    '11111111-1111-1111-1111-111111111111',
    (select id from brands where workspace_id = '11111111-1111-1111-1111-111111111111' and slug = '22nomad'),
    '00000000-0000-0000-0000-000000000001',
    '오늘의 운영 로그에서 배운 것',
    '짧은 공개 기록으로 개인 운영 리듬을 남긴다.',
    'idea',
    'published',
    '22th.Nomad용 짧은 X thread archive.',
    '다음 주 weekly review에서 반응을 확인한다.',
    'daily-ops-log-thread',
    null,
    'public',
    '{"origin":"seed","brand_key":"22nomad","target_channel":"x"}'::jsonb
  )
on conflict (id) do update
set
  brand_id = excluded.brand_id,
  title = excluded.title,
  source_idea = excluded.source_idea,
  source_type = excluded.source_type,
  status = excluded.status,
  summary = excluded.summary,
  next_action = excluded.next_action,
  slug = excluded.slug,
  scheduled_at = excluded.scheduled_at,
  visibility = excluded.visibility,
  meta = content_items.meta || excluded.meta,
  updated_at = now();

insert into content_variants (
  id,
  workspace_id,
  content_id,
  variant_type,
  title,
  body,
  summary,
  excerpt,
  status,
  slug,
  scheduled_at,
  visibility,
  meta
)
values
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
    '11111111-1111-1111-1111-111111111111',
    'dddddddd-dddd-dddd-dddd-dddddddddd01',
    'newsletter',
    '뉴스레터 #47 · 운영 리듬을 되찾는 첫 화면',
    E'안녕하세요. 이번 주에는 좋은 아이디어보다 먼저 보이는 운영면에 대해 씁니다.\n\nDaily Brief는 오늘의 판단을 좁히고, Content Queue는 멈춘 소재를 드러내고, Revenue follow-up은 놓치기 쉬운 관계를 다시 앞으로 가져옵니다.\n\n이번 편의 CTA는 Spring Cohort의 운영 리듬 점검으로 연결됩니다.',
    'Founder-note newsletter draft for warm audience.',
    '좋은 아이디어보다 먼저 보이는 운영면.',
    'draft',
    'newsletter-47-operating-rhythm',
    now() + interval '7 hours',
    'workspace',
    '{"preview_kind":"newsletter","handoff":"resend"}'::jsonb
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02',
    '11111111-1111-1111-1111-111111111111',
    'dddddddd-dddd-dddd-dddd-dddddddddd02',
    'blog',
    '결정을 기록하는 노트의 구조',
    E'결정은 공기처럼 흐릅니다. 하지만 기록하지 않은 결정은 다음 판단의 재료가 되지 않습니다.\n\n제가 쓰는 결정 노트는 네 칸입니다. 맥락, 선택, 근거, 회고. 이 구조는 멋진 문서가 아니라 다음 행동을 빠르게 고르는 운영 도구입니다.',
    'Decision note structure for operator-led work.',
    '맥락, 선택, 근거, 회고.',
    'ready',
    'decision-note-structure',
    null,
    'workspace',
    '{"preview_kind":"web_article","handoff":"blog_platform"}'::jsonb
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03',
    '11111111-1111-1111-1111-111111111111',
    'dddddddd-dddd-dddd-dddd-dddddddddd03',
    'card_news',
    '한 해의 운영 회고를 콘텐츠 자산으로 바꾸는 법',
    '{"slides":[{"id":"s1","bg":"oklch(0.35 0.04 280)","title":"회고는 감상이 아니라 입력이다","sub":"Year-end Operating Review"},{"id":"s2","bg":"oklch(0.35 0.05 220)","title":"결정 로그를 모은다","sub":"무엇을 선택했고 버렸나"},{"id":"s3","bg":"oklch(0.35 0.05 180)","title":"반복된 막힘을 찾는다","sub":"운영 시스템의 병목"},{"id":"s4","bg":"oklch(0.28 0.01 250)","title":"다음 해 첫 액션으로 닫는다","sub":"Review to operating plan"}]}',
    'Card news package for year-end operating review.',
    '회고를 다음 운영 시스템의 입력으로 바꾸는 4장 카드.',
    'ready',
    'year-end-operating-review-carousel',
    now() + interval '1 day',
    'workspace',
    '{"preview_kind":"card_news","export_profile":"instagram_carousel"}'::jsonb
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04',
    '11111111-1111-1111-1111-111111111111',
    'dddddddd-dddd-dddd-dddd-dddddddddd04',
    'social_post',
    '오늘의 운영 로그에서 배운 것',
    E'1/ 좋은 운영은 의지가 아니라 표면에서 시작된다.\n2/ 오늘 해야 할 일이 보이면 미루는 시간이 줄어든다.\n3/ 기록은 회고가 아니라 다음 행동의 재료다.',
    'Short public operating log thread.',
    '좋은 운영은 의지가 아니라 표면에서 시작된다.',
    'published',
    'daily-ops-log-thread',
    null,
    'public',
    '{"preview_kind":"x_thread","target_channel":"x"}'::jsonb
  )
on conflict (id) do update
set
  variant_type = excluded.variant_type,
  title = excluded.title,
  body = excluded.body,
  summary = excluded.summary,
  excerpt = excluded.excerpt,
  status = excluded.status,
  slug = excluded.slug,
  scheduled_at = excluded.scheduled_at,
  visibility = excluded.visibility,
  meta = content_variants.meta || excluded.meta,
  updated_at = now();

insert into publish_logs (
  id,
  workspace_id,
  variant_id,
  channel,
  status,
  provider,
  target_url,
  external_id,
  payload,
  published_at
)
values
  (
    'abababab-abab-abab-abab-ababababab01',
    '11111111-1111-1111-1111-111111111111',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03',
    'Instagram',
    'queued',
    'n8n',
    null,
    null,
    '{"event":"handoff_requested","recipe":"card_export_upload"}'::jsonb,
    null
  ),
  (
    'abababab-abab-abab-abab-ababababab02',
    '11111111-1111-1111-1111-111111111111',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04',
    'X',
    'published',
    'manual',
    'https://x.com/moonlight/status/seed',
    'seed-thread-001',
    '{"event":"manual_exported","source":"seed"}'::jsonb,
    now() - interval '2 days'
  )
on conflict (id) do update
set
  channel = excluded.channel,
  status = excluded.status,
  provider = excluded.provider,
  target_url = excluded.target_url,
  external_id = excluded.external_id,
  payload = excluded.payload,
  published_at = excluded.published_at,
  updated_at = now();

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
