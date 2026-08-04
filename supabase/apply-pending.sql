-- ============================================================================
-- apply-pending.sql — 적용 대기 마이그레이션 묶음 (0003 → 0023, 시점순)
--
-- 용도: 기존 Supabase 프로젝트의 대시보드 SQL Editor 에 한 번에 붙여넣는
--       편의 번들. 정본은 supabase/migrations/ 의 개별 파일이다.
-- 멱등: 모든 구성 마이그레이션이 if not exists / 동적 제약 재생성 패턴을 사용.
-- 참고: 라이브 프로젝트(rwqefdxalmbrkybxqwxj)에는 0003→0018 전부 적용·검증됨
--       (2026-08-04). 이 번들은 새/다른 기존 프로젝트를 따라잡게 할 때 쓴다.
-- 주의: 바깥 트랜잭션으로 감싸지 않음 — 20260602_0003 이 자체 begin/commit 을 가져
--       중첩 트랜잭션이 되면 실패한다. SQL Editor 기본(Run) 그대로 실행할 것.
-- ============================================================================


-- ============================================================================
-- 20260427_0003_content_os_variant_contract.sql
-- ============================================================================

-- Align Content OS DB constraints with the Hub Studio/Queue contract.
--
-- This is safe after the Supabase-first foundation migration. It keeps legacy
-- values (`blog`, `social_post`) while allowing the expanded Content OS types
-- planned for Newsletter, Blog/Insight, Card News, X Thread, and Reels Script.

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.content_items'::regclass
    and pg_get_constraintdef(oid) like '%source_type%';

  if constraint_name is not null then
    execute format('alter table public.content_items drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.content_items
  add constraint content_items_source_type_check
  check (source_type in ('idea', 'brief', 'meeting', 'research', 'repurpose', 'manual', 'studio', 'import'));

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.content_variants'::regclass
    and pg_get_constraintdef(oid) like '%variant_type%';

  if constraint_name is not null then
    execute format('alter table public.content_variants drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.content_variants
  add constraint content_variants_variant_type_check
  check (variant_type in ('card_news', 'blog', 'blog_insight', 'newsletter', 'social_post', 'x_thread', 'reels_script', 'landing_copy'));


-- ============================================================================
-- 20260427_0004_canonical_brand_directory.sql
-- ============================================================================

-- Keep the live Supabase brand directory aligned with Hub fallback brands.
--
-- The Hub initially renders the local fallback directory, then replaces it with
-- live rows from `brands`. Missing or differently named live rows make the UI
-- appear to change after loading, so this migration upserts the canonical
-- Moonlight brand scopes for the seeded Com_Moon workspace.

with canonical_brands(slug, name, kind, color_hex, description, meta) as (
  values
    (
      'sinabro', '시나브로', 'content', '#5274a8', '출판·콘텐츠 레이블',
      jsonb_build_object(
        'glyph', '✦', 'tone', 'info', 'order', 10,
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
      'gore', '고래(Go;Re)', 'product', '#5274a8', '회복·리커버리 프로덕트',
      jsonb_build_object(
        'glyph', '◌', 'tone', 'company', 'order', 20,
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
      'holyfuncollector', 'HolyFunCollector', 'community', '#5274a8', '기독교 신앙을 밈과 유머로 풀어내는 확산형 콘텐츠',
      jsonb_build_object(
        'glyph', '✧', 'tone', 'warning', 'order', 30,
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
      'bridgemaker', 'BridgeMaker', 'agency', '#5274a8', '신앙과 삶, 신학과 일상 사이의 다리를 놓는 사유형 콘텐츠',
      jsonb_build_object(
        'glyph', '◇', 'tone', 'moon', 'order', 40,
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
      'moonpm', 'MoonPM', 'tool', '#5274a8', 'PM 툴킷과 Moonlight Hub 운영 OS',
      jsonb_build_object(
        'glyph', '◐', 'tone', 'warning', 'order', 50,
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
      'classmoon', 'Class.Moon', 'education', '#5274a8', '에듀테크 현장 기반 세일즈 개인 브랜드',
      jsonb_build_object(
        'glyph', '□', 'tone', 'info', 'order', 60,
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
      'studyseagull', 'Study.Seagull', 'education', '#5274a8', '학습과 교육에 대한 관찰과 비판을 밈으로 풀어내는 익명 계정',
      jsonb_build_object(
        'glyph', '△', 'tone', 'danger', 'order', 70,
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
      'politicofficer', 'Politic_Officer', 'research', '#5274a8', '정치와 사회 현상을 관찰하고 질문을 던지는 실험적 채널',
      jsonb_build_object(
        'glyph', '◎', 'tone', 'info', 'order', 80,
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
      '22nomad', '22th.Nomad', 'personal', '#5274a8', '개인 블로그·메모',
      jsonb_build_object(
        'glyph', '◻', 'tone', 'personal', 'order', 90,
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
insert into public.brands (workspace_id, slug, name, kind, color_hex, description, meta)
select
  w.id,
  c.slug,
  c.name,
  c.kind,
  c.color_hex,
  c.description,
  c.meta
from public.workspaces w
cross join canonical_brands c
where w.slug = 'com-moon-os'
   or w.id = '11111111-1111-1111-1111-111111111111'
on conflict (workspace_id, slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  status = 'active',
  color_hex = excluded.color_hex,
  description = excluded.description,
  meta = public.brands.meta || excluded.meta,
  updated_at = now();


-- ============================================================================
-- 20260602_0003_content_variant_type_contract.sql
-- ============================================================================

begin;

update content_variants
set variant_type = case variant_type
  when 'blog' then 'blog_insight'
  when 'social_post' then 'x_thread'
  when 'landing_copy' then 'blog_insight'
  else variant_type
end
where variant_type in ('blog', 'social_post', 'landing_copy');

alter table if exists content_variants
  drop constraint if exists content_variants_variant_type_check;

alter table if exists content_variants
  add constraint content_variants_variant_type_check
  check (variant_type in ('newsletter', 'blog', 'blog_insight', 'card_news', 'social_post', 'x_thread', 'reels_script', 'landing_copy'));

commit;


-- ============================================================================
-- 20260602_0004_live_setup_contracts.sql
-- ============================================================================

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


-- ============================================================================
-- 20260617_0005_sales_os_sheets_sync.sql
-- ============================================================================

-- Sales OS v1 — Google Sheets sync staging + sales plays
--
-- Backs the approved design "ClassIn B2B 세일즈 OS — B의 척추 + C의 실행".
-- Single source of truth stays the Supabase ledger; spreadsheet edits land in a
-- staging table (`lead_intake_raw`) and are *promoted* into `leads`/`companies`
-- rather than upserting straight in (proposal model). Naver collection is NOT
-- enabled here — the `source` enum reserves it for a later, legally-reviewed phase.
--
-- Also fills gaps the read layer already expects: `apps/hub/lib/repositories/
-- revenue-ledger.js` orders leads by `last_touch_at` and reads `name/email/
-- channel/owner_id/meta`, none of which existed on `leads` yet.

-- ----------------------------------------------------------------------------
-- 1. Extend leads/companies for academy (학원) matching + sheet import.
--    All additive + idempotent so re-running is safe.
-- ----------------------------------------------------------------------------
alter table public.companies
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists match_key text,
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.leads
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists channel text,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists last_touch_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists idx_companies_match_key
  on public.companies (workspace_id, match_key);
create index if not exists idx_leads_last_touch_at
  on public.leads (workspace_id, last_touch_at desc nulls last);

-- ----------------------------------------------------------------------------
-- 2. Staging table — raw rows from Sheets / CSV (Naver reserved, disabled).
--    Promotion maps raw -> companies/leads; nothing is trusted until promoted.
-- ----------------------------------------------------------------------------
create table if not exists public.lead_intake_raw (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  source text not null default 'google_sheets'
    check (source in ('google_sheets', 'csv', 'manual', 'naver')),
  source_ref text,                       -- sheet row key / external id
  raw jsonb not null default '{}'::jsonb, -- original row, verbatim
  normalized jsonb not null default '{}'::jsonb,
  match_key text,
  status text not null default 'pending'
    check (status in ('pending', 'promoted', 'merged', 'ignored', 'review')),
  company_id uuid references public.companies(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  promoted_at timestamptz
);

create index if not exists idx_lead_intake_raw_status
  on public.lead_intake_raw (workspace_id, status);
create index if not exists idx_lead_intake_raw_match_key
  on public.lead_intake_raw (workspace_id, match_key);
-- Idempotent re-import: same connection + source row should not duplicate.
create unique index if not exists uq_lead_intake_raw_source_ref
  on public.lead_intake_raw (workspace_id, source, source_ref)
  where source_ref is not null;

-- ----------------------------------------------------------------------------
-- 3. Sales plays — the "이기는 플레이" definitions + run log (5x measurement).
-- ----------------------------------------------------------------------------
create table if not exists public.sales_plays (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  brand_slug text not null default 'classmoon',  -- ties content to Class.Moon voice
  stage text,                                     -- deal stage this play targets
  definition jsonb not null default '{}'::jsonb,  -- steps / objections / content_types
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.sales_play_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  play_id uuid references public.sales_plays(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'failure')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_sales_play_runs_play
  on public.sales_play_runs (workspace_id, play_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. Seed the first play for the Com_Moon workspace (idempotent).
-- ----------------------------------------------------------------------------
insert into public.sales_plays (workspace_id, slug, name, description, brand_slug, stage, definition)
select
  w.id,
  'district-academy-first-touch',
  '지역 학원 → 단계별 맞춤 자료',
  '수기 리드 시트 import → 정규화·중복제거 → 단계+반론 묶인 맞춤 자료 자동 생성 → 검토 후 시트 발송. 네이버 무의존(v1).',
  'classmoon',
  'lead',
  jsonb_build_object(
    'steps', jsonb_build_array(
      'import_or_collect', 'normalize_dedupe_score', 'generate_assets',
      'review_gate', 'push_to_outreach', 'measure'
    ),
    'objections', jsonb_build_array('price', 'trust', 'switching_cost', 'time'),
    'content_types', jsonb_build_array('one_pager_proposal', 'roi_table', 'case_study', 'outreach_email'),
    'guardrails', jsonb_build_object(
      'naver', 'official_api_only__disabled_until_legal_review',
      'outreach', 'consent_or_legitimate_interest_required'
    )
  )
from public.workspaces w
where w.slug = 'com-moon-os'
   or w.id = '11111111-1111-1111-1111-111111111111'
on conflict (workspace_id, slug) do update
set
  name = excluded.name,
  description = excluded.description,
  brand_slug = excluded.brand_slug,
  stage = excluded.stage,
  definition = excluded.definition,
  status = 'active',
  updated_at = now();


-- ============================================================================
-- 20260617_0006_crm_xiaoshouyi_owner_names.sql
-- ============================================================================

-- CRM (Xiaoshouyi/EEO) ownerId -> name resolution for moonlight.
--
-- Xiaoshouyi records carry only a numeric `ownerId`. This curated table resolves
-- it to display/Korean names + team. Used when CRM account/opportunity rows are
-- synced into companies/deals so the owner shows a real name instead of a number.
-- Global (not workspace-scoped). No RLS/trigger (matches moonlight migration style).
--
-- Seeds ONLY the current operator (문준혁 = ownerId 3935704427463307), the one
-- mapping the user provided. Other owners are resolved from the live CRM User
-- object at sync time, or curated into this table by the user — we do not
-- pre-populate colleagues' names/codes here.

create table if not exists public.crm_xiaoshouyi_owner_names (
  external_id  text primary key,        -- Xiaoshouyi User.id / ownerId (numeric, as text)
  display_name text not null,
  korean_name  text,
  eeo_code     text,
  team         text,
  is_excluded  boolean not null default false,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.crm_xiaoshouyi_owner_names
  (external_id, display_name, korean_name, eeo_code, team, is_excluded, metadata)
values
  ('3935704427463307', 'Mun Junhyuk (문준혁)', '문준혁', 'EEO04186', 'KR', false, '{"anchor_account":"윤유경플러스학원","is_current_user":true}'::jsonb)
on conflict (external_id) do update
set
  display_name = excluded.display_name,
  korean_name  = excluded.korean_name,
  eeo_code     = excluded.eeo_code,
  team         = excluded.team,
  is_excluded  = excluded.is_excluded,
  metadata     = public.crm_xiaoshouyi_owner_names.metadata || excluded.metadata,
  updated_at   = now();


-- ============================================================================
-- 20260617_0007_content_idea_cadence.sql
-- ============================================================================

-- Content OS: idea-queue ranking + publishing cadence (Sales OS v1.1).
--
-- Additive only. Backs two things from the approved Sales OS v3 design:
--   1. Idea queue   — `content_items.rank_score` surfaces "what to post next".
--   2. Publishing cadence — `content_items.cadence_week` buckets published items
--      per ISO week; `content_variants.channel` records insta/threads/reels.
-- No new tables: `content_items.status` already covers idea→draft→scheduled→published.
-- Safe after the Content OS foundation + variant-contract migrations (0001/0003).

alter table public.content_items
  add column if not exists rank_score numeric not null default 0;

alter table public.content_items
  add column if not exists cadence_week text;

comment on column public.content_items.rank_score is
  'Idea-queue ranking score (higher surfaces first). Sales OS v1.1.';
comment on column public.content_items.cadence_week is
  'ISO week bucket (e.g. 2026-W25) for publishing-cadence tracking. Null until scheduled/published.';

alter table public.content_variants
  add column if not exists channel text;

comment on column public.content_variants.channel is
  'Publish channel: instagram | threads | reels | x | blog. Derived from variant_type when null.';

-- Queue ordering: surface highest-ranked idea/draft items per workspace fast.
create index if not exists content_items_queue_idx
  on public.content_items (workspace_id, status, rank_score desc);

-- Cadence aggregation: count published items per workspace per ISO week.
create index if not exists content_items_cadence_idx
  on public.content_items (workspace_id, cadence_week)
  where status = 'published';


-- ============================================================================
-- 20260618_0008_outreach_outcomes.sql
-- ============================================================================

-- Learning sink for the sales daily-loop (closes the loop).
--
-- Approved design: clmagi-codex-moonlight-p0-hardening-design-20260618-000940.md
-- (orchestration operating model). Each outreach result is logged here so the
-- next day's triage can read recent outcomes and bias prioritization — without
-- this table the loop is open and the "5x" target has no machinery behind it.
--
-- Records the human-executed sales motion (phone/visit/kakao), tied back to the
-- lead/deal/company and the play that produced the asset. Additive + idempotent.

create table if not exists public.outreach_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  play text,                       -- which play produced this (e.g. district-academy-first-touch)
  asset_id text,                   -- content asset reference, if any
  channel text,                    -- phone | visit | kakao | email | other
  action text not null default 'sent'
    check (action in ('sent', 'replied', 'meeting', 'proposal', 'won', 'lost', 'no_response')),
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_outcomes_recent
  on public.outreach_outcomes (workspace_id, occurred_at desc);
create index if not exists idx_outreach_outcomes_lead
  on public.outreach_outcomes (workspace_id, lead_id);
create index if not exists idx_outreach_outcomes_play
  on public.outreach_outcomes (workspace_id, play, occurred_at desc);


-- ============================================================================
-- 20260618_0009_business_card_source.sql
-- ============================================================================

-- Allow business-card intake as a lead_intake_raw source (Sales OS).
-- Additive: widens the source check constraint. Safe after 0005.
-- (0008 = outreach_outcomes, a different table — no conflict.)
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.lead_intake_raw'::regclass
     and pg_get_constraintdef(oid) like '%source%';
  if c is not null then
    execute format('alter table public.lead_intake_raw drop constraint %I', c);
  end if;
end $$;

alter table public.lead_intake_raw
  add constraint lead_intake_raw_source_check
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card'));


-- ============================================================================
-- 20260618_0010_agents_personas_inbox.sql
-- ============================================================================

-- Sales OS AI 팀 운영 레이어 (v1.3) — agents 시드 + Inbox 캡처 소스.
--
-- 설계: docs/sales-os/team-operating-layer.md · capture-spine.md
-- 새 테이블 없음. 기존 스키마에 최소 추가:
--   (1) lead_intake_raw.source 에 'inbox' 추가 (현장 한 줄 캡처 → 리드 라우팅).
--       0009 의 'business_card' 를 유지하며 widen.
--   (2) agents.agent_type 에 'order'/'production'/'review' 추가 ('sales'/'content' 는 이미 있음).
--   (3) 5 페르소나(오더·세일즈·콘텐츠·제작·검수)를 agents 에 시드 → registry.json 이 DB 로.
-- 멱등: 제약은 동적 이름 조회 후 재생성(0009 패턴), 시드는 not-exists 가드.
-- 안전: additive only. 기존 행/값 보존.

-- (1) lead_intake_raw.source widen ('business_card' 보존 + 'inbox')
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.lead_intake_raw'::regclass
     and pg_get_constraintdef(oid) like '%source%';
  if c is not null then
    execute format('alter table public.lead_intake_raw drop constraint %I', c);
  end if;
end $$;

alter table public.lead_intake_raw
  add constraint lead_intake_raw_source_check
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card', 'inbox'));

-- (2) agents.agent_type widen ('sales'/'content' 보존 + 'order'/'production'/'review')
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.agents'::regclass
     and pg_get_constraintdef(oid) like '%agent_type%';
  if c is not null then
    execute format('alter table public.agents drop constraint %I', c);
  end if;
end $$;

alter table public.agents
  add constraint agents_agent_type_check
  check (agent_type in ('system', 'strategist', 'content', 'sales', 'ops', 'order', 'production', 'review'));

-- (3) 5 페르소나 시드 (기본 워크스페이스, persona_id 로 멱등)
do $$
declare ws uuid;
begin
  select id into ws from public.workspaces order by created_at asc limit 1;
  if ws is null then
    raise notice 'no workspace found — persona seed skipped';
    return;
  end if;

  insert into public.agents (workspace_id, name, agent_type, status, config)
  select ws, v.name, v.atype, 'idle', v.config::jsonb
  from (values
    ('오더',  'order',
      '{"persona_id":"order","file":"docs/sales-os/personas/00-order-dispatch.md","emits":"work_order[]","activation":"always-first","role":"신호 읽고 작업지시서 + 360 조립 + 건별 활성 페르소나 선택"}'),
    ('세일즈','sales',
      '{"persona_id":"sales","file":"docs/sales-os/personas/01-sales-followup.md","emits":"{next_action,objection,followups[]}","gate":"outbound->codex","role":"딜 다음수·반론·팔로업"}'),
    ('콘텐츠','content',
      '{"persona_id":"content","file":"docs/sales-os/personas/02-content.md","emits":"{ideas[],cadence_note,today_pick}","role":"아이디어 큐·발행 케이던스·앵글"}'),
    ('제작',  'production',
      '{"persona_id":"production","file":"docs/sales-os/personas/03-production.md","emits":"{channel,format,skeleton}","gate":"outbound->codex","role":"승인 앵글 → 채널 포맷 골격"}'),
    ('검수',  'review',
      '{"persona_id":"review","file":"docs/sales-os/personas/04-review-gate.md","emits":"{internal_review,gate,disposition}","gate":"orchestrates","role":"브랜드·사실 셀프리뷰 → Codex 게이트"}')
  ) as v(name, atype, config)
  where not exists (
    select 1 from public.agents a
     where a.workspace_id = ws
       and a.config->>'persona_id' = v.atype
  );
end $$;


-- ============================================================================
-- 20260619_0011_work_orders_agent_runs.sql
-- ============================================================================

-- Sales OS 심화 v0 — 반자동 큐 + 에피소드 메모리 (Phase 0 토대).
--
-- 설계: docs/sales-os/ai-sales-system-deep-config.md (Phase 0)
-- 페르소나(/team)·인박스(/inbox)·Guru 가 산출하는 "제안"을 사람이 1클릭 승인하기 전까지
-- 머무는 큐(work_orders)와, 각 에이전트 실행 1건을 기억하는 로그(agent_runs)를 추가.
-- registry.json gates.no_auto_send=true → 모든 외부 액션은 status='approved' 이후에만.
--
-- 안전: 신규 테이블만 추가(additive). 멱등: create table/index if not exists.
-- 의존: workspaces·leads·deals·companies(0001~), outreach_outcomes(0008). 새 컬럼/제약 변경 없음.

-- (1) agent_runs — 에피소드 메모리. 페르소나/Guru 실행 1건 = 1행. 나중에 outcome 으로 귀속.
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent text not null,                       -- persona_id (order|sales|content|production|review) | 'guru'
  mode text,                                 -- guru 코칭 모드(deal-review 등) 또는 페르소나 단계
  ref text,                                  -- 대상 식별자(deal id / lead id / account name)
  input_summary text,                        -- 조립된 컨텍스트 지문(트림)
  recommendation jsonb,                      -- 에이전트가 제안한 내용
  emitted_count integer not null default 0,  -- 이 실행이 만든 work_orders 수
  result text not null default 'ok'
    check (result in ('ok', 'needs_human', 'error')),
  outcome_id uuid references public.outreach_outcomes(id) on delete set null,  -- 사후 성과 귀속(학습)
  ran_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_recent
  on public.agent_runs (workspace_id, ran_at desc);
create index if not exists idx_agent_runs_ref
  on public.agent_runs (workspace_id, ref);
create index if not exists idx_agent_runs_agent
  on public.agent_runs (workspace_id, agent, ran_at desc);

-- (2) work_orders — 반자동 승인 큐. 페르소나/인박스/Guru 가 'proposed' 로 적재.
--     데일리 브리프에서 1클릭 승인 → 'approved' → 실행 → 'executed'.
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  persona text not null,                     -- persona_id | 'guru' | 'inbox'
  kind text not null,                        -- emit 종류: next_action | followup | idea | skeleton | review | dispatch | note
  title text not null,                       -- 오퍼레이터용 짧은 라벨
  body jsonb not null default '{}'::jsonb,    -- 페르소나 emit 페이로드(next_action/objection/ideas/skeleton/...)
  -- 파이프라인 참조(모두 nullable: 딜/리드/회사 또는 콘텐츠 자산을 겨눔)
  lead_id uuid references public.leads(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  asset_id text,
  channel text,                              -- phone | visit | kakao | email | dm | publish | other
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'executing', 'executed', 'dismissed')),
  gate text,                                 -- 페르소나 gate: outbound->codex | internal->auto | orchestrates | n/a
  source text not null default 'team'
    check (source in ('team', 'inbox', 'guru', 'manual')),
  run_id uuid references public.agent_runs(id) on delete set null,  -- 이 제안을 만든 실행
  outcome_id uuid references public.outreach_outcomes(id) on delete set null,  -- 실행 후 성과(루프 닫기)
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,                    -- 승인/기각 시각
  executed_at timestamptz,                   -- 외부 액션 발사 시각
  created_at timestamptz not null default now()
);

-- 승인 대기 큐(데일리 브리프 콕핏): 워크스페이스 × 상태 × 최신순.
create index if not exists idx_work_orders_queue
  on public.work_orders (workspace_id, status, proposed_at desc);
create index if not exists idx_work_orders_deal
  on public.work_orders (workspace_id, deal_id);
create index if not exists idx_work_orders_lead
  on public.work_orders (workspace_id, lead_id);
create index if not exists idx_work_orders_company
  on public.work_orders (workspace_id, company_id);
create index if not exists idx_work_orders_run
  on public.work_orders (run_id);


-- ============================================================================
-- 20260620_0012_work_orders_execution_claim.sql
-- ============================================================================

-- Add the transient execution-claim status used to prevent double sends/uploads.
-- Flow: proposed -> approved -> executing -> executed. Terminal: executed, dismissed.

alter table if exists public.work_orders
  drop constraint if exists work_orders_status_check;

alter table if exists public.work_orders
  add constraint work_orders_status_check
  check (status in ('proposed', 'approved', 'executing', 'executed', 'dismissed'));


-- ============================================================================
-- 20260702_0013_eeocrm_source.sql
-- ============================================================================

-- Allow eeoCRM (Xiaoshouyi personal MCP) intake as a lead_intake_raw source (Sales OS).
-- Additive: widens the source check constraint. Safe after 0009/0010, which already
-- widened this same constraint for 'business_card' and 'inbox'.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.lead_intake_raw'::regclass
     and pg_get_constraintdef(oid) like '%source%';
  if c is not null then
    execute format('alter table public.lead_intake_raw drop constraint %I', c);
  end if;
end $$;

alter table public.lead_intake_raw
  add constraint lead_intake_raw_source_check
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card', 'inbox', 'eeocrm'));


-- ============================================================================
-- 20260707_0014_crm_activities.sql
-- ============================================================================

-- CRM activity timeline — human-facing interaction log per lead/deal/account.
--
-- The Revenue surface (apps/hub/components/hub/pages/revenue.jsx) logs what
-- actually happened with a lead/account: 통화(call) · 미팅(meeting) · 설명회
-- (info_session) · 데모(demo) · 방문(visit) · 이메일(email) · 소식(update) ·
-- 노트(note). Until now the Account detail panel kept these in React state
-- only — a refresh dropped every logged call/note. This table makes the
-- timeline durable. Additive + idempotent (create table/index if not exists).
--
-- Distinct from `outreach_outcomes` (0008): that table is a funnel-measurement
-- sink with a fixed sent/replied/meeting/proposal/won/lost enum for the "5x"
-- loop. This one is the free-form operator timeline (any interaction kind,
-- plus pinnable notes). They can coexist; a logged call may also produce an
-- outreach_outcome, but this table is the record of the conversation itself.

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Entity linkage — an activity hangs off exactly one of these (account is most common).
  lead_id uuid references public.leads(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  account_id uuid references public.customer_accounts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  entity_type text not null default 'account'
    check (entity_type in ('lead', 'deal', 'account')),
  kind text not null default 'update'
    check (kind in ('call', 'meeting', 'info_session', 'demo', 'visit', 'email', 'update', 'note', 'deal')),
  body text not null default '',
  pinned boolean not null default false,   -- meaningful for kind='note'
  owner_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_activities_account
  on public.crm_activities (workspace_id, account_id, occurred_at desc);
create index if not exists idx_crm_activities_lead
  on public.crm_activities (workspace_id, lead_id, occurred_at desc);
create index if not exists idx_crm_activities_deal
  on public.crm_activities (workspace_id, deal_id, occurred_at desc);
create index if not exists idx_crm_activities_recent
  on public.crm_activities (workspace_id, occurred_at desc);


-- ============================================================================
-- 20260707_0015_lead_intake_gmail_source.sql
-- ============================================================================

-- Allow Gmail-scanned lead candidates as a lead_intake_raw source (Sales OS).
-- Additive: widens the source check constraint. Safe after 0013 — the recreated
-- check must carry EVERY previously-allowed value ('business_card' from 0009,
-- 'inbox' from 0010, 'eeocrm' from 0013), or applying this migration would fail
-- on rows using them / silently break those intake paths.
-- Idempotent constraint recreation so re-running is a no-op.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.lead_intake_raw'::regclass
     and pg_get_constraintdef(oid) like '%source%';
  if c is not null then
    execute format('alter table public.lead_intake_raw drop constraint %I', c);
  end if;
end $$;

alter table public.lead_intake_raw
  add constraint lead_intake_raw_source_check
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card', 'inbox', 'eeocrm', 'gmail'));


-- ============================================================================
-- 20260707_0016_campaigns_meta.sql
-- ============================================================================

-- Campaigns display metadata — the Hub Campaigns war room card renders fields
-- beyond the base `campaigns` columns (id, name, channel, status, start_date,
-- end_date): a channel list, a progress percent, and a goal/current pair
-- ("신청 40" / 24). None of those have a dedicated column and don't warrant
-- one yet (still shaping), so they live in a jsonb `meta` column, matching the
-- convention already used by `content_items.meta` / `leads.meta` etc.
-- Additive + idempotent.

alter table public.campaigns
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.campaigns
  add column if not exists updated_at timestamptz not null default now();


-- ============================================================================
-- 20260707_0017_work_orders_open_followup_unique.sql
-- ============================================================================

-- One OPEN followup work_order per deal — DB-level dedupe for the stalled-deal scan.
--
-- The scan (apps/hub/lib/sales-os/stalled-scan.js) and the kanban's manual queue
-- button both propose followups with a read-then-insert dedupe, which races under
-- concurrent requests (two brief loads can both see "no open order" and insert).
-- This partial unique index makes the insert itself the arbiter: the loser gets a
-- unique-violation, which createWorkOrder surfaces as persisted:false and the scan
-- counts as skipped. Terminal orders (executed/dismissed) don't block a new proposal.
-- Additive + idempotent.

create unique index if not exists uq_work_orders_open_followup
  on public.work_orders (workspace_id, deal_id)
  where kind = 'followup'
    and status in ('proposed', 'approved', 'executing')
    and deal_id is not null;


-- ============================================================================
-- 20260804_0018_backend_optimization.sql
-- ============================================================================

-- Backend/DB 최적화 배치 — 코드가 실제로 치는 조회 키에 인덱스를 맞추고,
-- 단일-콜 upsert(on_conflict)가 성립하도록 unique 제약을 추가한다.
--
-- 근거(2026-08-04 백엔드 조사):
-- - eeoCRM hydrate/sheets promote 루프가 JSONB 경로·복합 키 조회를 레코드마다
--   반복 실행 — 전부 seq scan이었음. 배치화 코드(레코드당→배치당 1회)와 함께
--   이 인덱스들이 남은 스캔 비용을 제거한다.
-- - integration_connections 는 upsert 가 (read→write→read) 3왕복이던 것을
--   on_conflict 단일 콜로 바꿈 → unique (workspace_id, provider) 필요.
-- - field_mappings 는 notion-sync 가 프로퍼티당 SELECT+INSERT 하던 것을
--   bulk ignore-duplicates 로 바꿈 → 4-컬럼 unique 필요.
-- - lead_intake_raw 의 재임포트 dedupe 는 partial unique 라 PostgREST
--   on_conflict 의 arbiter 로 쓸 수 없었음 → full unique 로 교체.
--
-- 안전: additive + 멱등(if not exists). 파괴적 변경 없음 — 기존 partial index
-- drop 은 동일 키의 full unique 생성 *이후*에만 수행.
-- 적용: npm run db:migrate 20260804_0018_backend_optimization.sql
-- (라이브 확인 2026-08-04: integration_connections·field_mappings·lead_intake_raw
--  모두 중복 0 — unique 생성이 즉시 성립. 만에 하나 다른 환경에 중복이 있으면
--  아래 suffix 가드가 0002 패턴대로 비파괴 격리한다.)

-- ----------------------------------------------------------------------------
-- 1. eeoCRM 동기화 조회 키 (JSONB 표현식 인덱스)
-- ----------------------------------------------------------------------------

create index if not exists idx_companies_eeocrm_account_id
  on public.companies ((meta->>'eeocrm_account_id'))
  where meta ? 'eeocrm_account_id';

create index if not exists idx_customer_accounts_eeocrm_account_id
  on public.customer_accounts ((meta->>'eeocrm_account_id'))
  where meta ? 'eeocrm_account_id';

create index if not exists idx_deals_eeocrm_opportunity_id
  on public.deals ((meta->>'eeocrm_opportunity_id'))
  where meta ? 'eeocrm_opportunity_id';

create index if not exists idx_deals_eeocrm_order_id
  on public.deals ((meta->>'eeocrm_order_id'))
  where meta ? 'eeocrm_order_id';

-- sheets/eeocrm 상태 뷰의 최근 실행 조회: payload->>provider 필터 + started_at 정렬.
create index if not exists idx_sync_runs_provider_started
  on public.sync_runs (workspace_id, (payload->>'provider'), started_at desc);

-- ----------------------------------------------------------------------------
-- 2. promote/hydrate 배치 조회 키
-- ----------------------------------------------------------------------------

-- contacts 는 인덱스가 하나도 없었다. promote/hydrate 의 (회사, 이름) 결정자
-- 조회와 company_id in.() 프리페치를 커버.
create index if not exists idx_contacts_workspace_company_name
  on public.contacts (workspace_id, company_id, name);

-- promote 의 pending 스캔: (status, source) 필터 + created_at.asc 정렬.
create index if not exists idx_lead_intake_raw_status_source_created
  on public.lead_intake_raw (workspace_id, status, source, created_at);

-- eeoCRM hydrate 의 name 폴백 조회.
create index if not exists idx_companies_workspace_name
  on public.companies (workspace_id, name);

-- automations 대시보드의 미해결 에러 카운트: resolved=false 필터 + 최신순.
create index if not exists idx_error_logs_workspace_unresolved
  on public.error_logs (workspace_id, timestamp desc)
  where resolved = false;

-- ----------------------------------------------------------------------------
-- 3. integration_connections — 단일-콜 upsert 성립
-- ----------------------------------------------------------------------------

-- 혹시 남아 있을 중복을 0002 패턴대로 비파괴 격리(최신 행이 정본 유지).
with ranked_connections as (
  select
    id,
    row_number() over (
      partition by workspace_id, provider
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.integration_connections
  where provider not like '%:duplicate:%'
)
update public.integration_connections
set provider = provider || ':duplicate:' || id::text
where id in (
  select id from ranked_connections where duplicate_rank > 1
);

create unique index if not exists uq_integration_connections_workspace_provider
  on public.integration_connections (workspace_id, provider);

-- ----------------------------------------------------------------------------
-- 4. field_mappings — bulk ignore-duplicates 성립 (+ 첫 인덱스)
-- ----------------------------------------------------------------------------

with ranked_mappings as (
  select
    id,
    row_number() over (
      partition by workspace_id, connection_id, source_field, target_field
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.field_mappings
  where source_field not like '%:duplicate:%'
)
update public.field_mappings
set source_field = source_field || ':duplicate:' || id::text
where id in (
  select id from ranked_mappings where duplicate_rank > 1
);

create unique index if not exists uq_field_mappings_scope
  on public.field_mappings (workspace_id, connection_id, source_field, target_field);

-- ----------------------------------------------------------------------------
-- 5. lead_intake_raw 재임포트 dedupe — partial → full unique 교체
-- ----------------------------------------------------------------------------
-- partial unique 는 PostgREST on_conflict 의 arbiter 가 될 수 없다(추론에 WHERE
-- 절이 필요). full unique 는 NULLS DISTINCT(기본)라 source_ref null 행의 기존
-- 동작(중복 허용)이 그대로 유지된다. 새 인덱스 생성 후에만 기존 것을 제거.

create unique index if not exists uq_lead_intake_raw_source_ref_all
  on public.lead_intake_raw (workspace_id, source, source_ref);

drop index if exists public.uq_lead_intake_raw_source_ref;


-- ─────────────────────────────────────────────────────────────────────────
-- 20260717_0019_routine_check_idempotency.sql
-- Apply before deploying the Hub routine check route that writes idempotency_key.
-- ─────────────────────────────────────────────────────────────────────────
alter table if exists public.routine_checks
  add column if not exists idempotency_key text;

create unique index if not exists routine_checks_workspace_idempotency_key_uidx
  on public.routine_checks (workspace_id, idempotency_key)
  where idempotency_key is not null;


-- ─────────────────────────────────────────────────────────────────────────
-- 20260717_0020_nullable_project_progress.sql
-- Preserve the difference between "no progress evidence" and a reported 0%.
-- ─────────────────────────────────────────────────────────────────────────
alter table if exists public.projects
  alter column progress drop default,
  alter column progress drop not null;


-- ─────────────────────────────────────────────────────────────────────────
-- 20260718_0021_task_description.sql
-- Free-text detail field for tasks (하위 항목 상세 · 참고 자료).
-- ─────────────────────────────────────────────────────────────────────────
alter table if exists public.tasks
  add column if not exists description text;


-- ─────────────────────────────────────────────────────────────────────────
-- 20260719_0022_project_context_links.sql
-- Project context links for the fast-create flow (lead/customer account).
-- ─────────────────────────────────────────────────────────────────────────
alter table if exists public.projects
  add column if not exists lead_id uuid,
  add column if not exists customer_account_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_lead_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_lead_id_fkey
      foreign key (lead_id) references public.leads(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_customer_account_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_customer_account_id_fkey
      foreign key (customer_account_id) references public.customer_accounts(id) on delete set null;
  end if;
end $$;

alter table public.projects
  drop constraint if exists projects_single_customer_context;
alter table public.projects
  add constraint projects_single_customer_context
  check (num_nonnulls(lead_id, customer_account_id) <= 1);

create index if not exists idx_projects_workspace_lead_updated
  on public.projects (workspace_id, lead_id, updated_at desc)
  where lead_id is not null;

create index if not exists idx_projects_workspace_customer_account_updated
  on public.projects (workspace_id, customer_account_id, updated_at desc)
  where customer_account_id is not null;

create unique index if not exists idx_areas_workspace_slug
  on public.areas (workspace_id, slug)
  where slug is not null;

insert into public.areas (workspace_id, slug, name, kind, status)
select
  workspace.id,
  canonical.slug,
  canonical.name,
  canonical.kind,
  'active'
from public.workspaces as workspace
cross join (values
  ('sales', '영업', 'client'),
  ('marketing', '마케팅', 'growth'),
  ('content', '콘텐츠', 'brand'),
  ('it', 'IT', 'ops'),
  ('ai-third-party-development', 'AI 기반 서드파티 개발', 'ops'),
  ('personal-projects', '개인 프로젝트', 'personal')
) as canonical(slug, name, kind)
where not exists (
  select 1
  from public.areas as existing
  where existing.workspace_id = workspace.id
    and existing.slug = canonical.slug
);


-- ─────────────────────────────────────────────────────────────────────────
-- 20260719_0023_deal_hidden_at.sql
-- Reversible hide/show for deals (파이프라인에서만 걷어내는 용도).
-- ─────────────────────────────────────────────────────────────────────────
alter table if exists public.deals
  add column if not exists hidden_at timestamptz;


-- end of apply-pending.sql
