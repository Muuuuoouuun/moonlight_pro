-- ============================================================================
-- apply-pending.sql — 적용 대기 마이그레이션 묶음 (0003~0011 + 0014, 시점순)
--
-- 생성물(편의용 번들). 정본은 supabase/migrations/<each>.sql 개별 파일.
-- 전부 멱등(if not exists / 제약 재생성 / on conflict / not-exists 시드 가드)이라
-- 이미 적용된 항목이 섞여 있어도 재실행 무해.
--
-- 적용: Supabase 대시보드 SQL Editor에 전체 붙여넣기 → Run.
--       또는 PAT 있으면 scripts/apply-migrations.mjs 로 개별 적용.
-- 전제: 20260420_0001_*(foundation), 20260425_0002_* 가 먼저 적용돼 있어야 함.
-- 주의: 바깥 트랜잭션으로 감싸지 않음 — 20260602_0003 이 자체 begin/commit 을 가져
--       중첩 트랜잭션을 피하기 위함. 각 마이그레이션은 멱등이라 부분 적용도 안전.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 20260427_0003_content_os_variant_contract.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260427_0004_canonical_brand_directory.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260602_0003_content_variant_type_contract.sql
-- ─────────────────────────────────────────────────────────────────────────
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
  check (variant_type in ('newsletter', 'blog_insight', 'card_news', 'x_thread', 'reels_script'));

commit;


-- ─────────────────────────────────────────────────────────────────────────
-- 20260602_0004_live_setup_contracts.sql
-- ─────────────────────────────────────────────────────────────────────────
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
    'blog_insight',
    'card_news',
    'x_thread',
    'reels_script'
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260617_0005_sales_os_sheets_sync.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260617_0006_crm_xiaoshouyi_owner_names.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260617_0007_content_idea_cadence.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260618_0008_outreach_outcomes.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260618_0009_business_card_source.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260618_0010_agents_personas_inbox.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 20260619_0011_work_orders_agent_runs.sql
-- ─────────────────────────────────────────────────────────────────────────
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
    check (status in ('proposed', 'approved', 'executed', 'dismissed')),
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
-- ─────────────────────────────────────────────────────────────────────────
-- 20260713_0014_atomic_content_draft_approval.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Materialize internal content-draft approvals atomically and idempotently.
-- A locked content item can leave idea state once; later states are never downgraded.

begin;

create unique index if not exists idx_content_variants_workspace_work_order
  on public.content_variants (workspace_id, ((meta ->> 'work_order_id')))
  where meta ? 'work_order_id';

create or replace function public.approve_content_draft_work_order(
  p_workspace_id uuid,
  p_work_order_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.work_orders%rowtype;
  v_content_id uuid;
  v_content_status text;
  v_variant_id uuid;
  v_variant_content_id uuid;
  v_now timestamptz := now();
  v_title text;
  v_body text;
begin
  if p_workspace_id is null or p_work_order_id is null then
    raise exception 'workspace id and work order id are required'
      using errcode = '22004';
  end if;

  select wo.*
  into v_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'content draft work order not found'
      using errcode = 'P0002';
  end if;

  if v_order.kind <> 'content-draft' then
    raise exception 'work order is not a content draft'
      using errcode = '22023';
  end if;

  if nullif(btrim(v_order.asset_id), '') is null then
    raise exception 'content draft work order requires an asset id'
      using errcode = '23502';
  end if;

  select ci.id, ci.status
  into v_content_id, v_content_status
  from public.content_items ci
  where ci.workspace_id = p_workspace_id
    and ci.id::text = v_order.asset_id
  for update;

  if not found then
    raise exception 'content item for work order not found'
      using errcode = '23503';
  end if;

  select cv.id, cv.content_id
  into v_variant_id, v_variant_content_id
  from public.content_variants cv
  where cv.workspace_id = p_workspace_id
    and cv.meta ->> 'work_order_id' = p_work_order_id::text
  order by cv.created_at asc
  limit 1;

  if v_variant_id is not null and v_variant_content_id <> v_content_id then
    raise exception 'content draft variant points to a different content item'
      using errcode = '23514';
  end if;

  if v_variant_id is not null then
    if v_order.status = 'proposed' then
      update public.work_orders
      set status = 'approved',
          decided_at = coalesce(decided_at, v_now)
      where id = p_work_order_id
        and workspace_id = p_workspace_id
        and status = 'proposed';

      v_order.status := 'approved';
    end if;

    return jsonb_build_object(
      'reason', 'already-materialized',
      'status', v_order.status,
      'materialized', true,
      'variant_id', v_variant_id,
      'content_id', v_content_id,
      'idempotent', true
    );
  end if;

  if v_order.status not in ('proposed', 'approved') then
    return jsonb_build_object(
      'reason', 'already-decided',
      'status', v_order.status,
      'materialized', false,
      'variant_id', null,
      'content_id', v_content_id,
      'idempotent', true
    );
  end if;

  if v_content_status <> 'idea' then
    return jsonb_build_object(
      'reason', 'content-not-idea',
      'status', v_order.status,
      'materialized', false,
      'variant_id', null,
      'content_id', v_content_id,
      'content_status', v_content_status,
      'idempotent', false
    );
  end if;

  v_title := coalesce(nullif(btrim(v_order.body ->> 'title'), ''), v_order.title);
  v_body := coalesce(v_order.body ->> 'body', '');
  v_variant_id := gen_random_uuid();

  insert into public.content_variants (
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
    meta,
    created_at,
    updated_at
  ) values (
    v_variant_id,
    p_workspace_id,
    v_content_id,
    'blog_insight',
    v_title,
    v_body,
    null,
    nullif(left(v_body, 200), ''),
    'draft',
    null,
    null,
    'private',
    jsonb_build_object(
      'origin', 'content-flywheel',
      'work_order_id', p_work_order_id::text,
      'run_id', v_order.run_id,
      'brand_key', v_order.body ->> 'brandKey',
      'model', v_order.body ->> 'model'
    ),
    v_now,
    v_now
  );

  update public.content_items
  set status = 'draft',
      next_action = 'Studio에서 초안 검토 후 발행 준비',
      updated_at = v_now
  where id = v_content_id
    and workspace_id = p_workspace_id
    and status = 'idea';

  if not found then
    raise exception 'content item is no longer an idea'
      using errcode = '40001';
  end if;

  update public.work_orders
  set status = 'approved',
      decided_at = coalesce(decided_at, v_now)
  where id = p_work_order_id
    and workspace_id = p_workspace_id
    and status in ('proposed', 'approved');

  if not found then
    raise exception 'content draft work order is no longer recoverable'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'reason', case when v_order.status = 'approved' then 'recovered' else 'ok' end,
    'status', 'approved',
    'materialized', true,
    'variant_id', v_variant_id,
    'content_id', v_content_id,
    'idempotent', false
  );
end;
$$;

do $repair$
declare
  repair_order record;
  repair_result jsonb;
begin
  for repair_order in
    -- Materialize only the latest approved decision for each content item.
    -- Older duplicate approvals remain unchanged for a later audit.
    select distinct on (wo.workspace_id, ci.id)
      wo.workspace_id,
      ci.id as content_id,
      wo.id
    from public.work_orders wo
    join public.content_items ci
      on ci.workspace_id = wo.workspace_id
     and ci.id::text = wo.asset_id
    where wo.kind = 'content-draft'
      and wo.status = 'approved'
      and ci.status = 'idea'
      and not exists (
        select 1
        from public.content_variants cv
        where cv.workspace_id = wo.workspace_id
          and cv.content_id = ci.id
          and cv.meta ->> 'work_order_id' = wo.id::text
      )
    order by
      wo.workspace_id,
      ci.id,
      wo.decided_at desc nulls last,
      wo.proposed_at desc,
      wo.id desc
  loop
    repair_result := public.approve_content_draft_work_order(
      repair_order.workspace_id,
      repair_order.id
    );

    if coalesce((repair_result ->> 'materialized')::boolean, false) is not true
       or repair_result ->> 'status' is distinct from 'approved' then
      raise exception 'approved content draft repair did not materialize'
        using detail = repair_result::text;
    end if;
  end loop;
end;
$repair$;

revoke all on function public.approve_content_draft_work_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_content_draft_work_order(uuid, uuid)
  to service_role;

commit;
-- Source: supabase/migrations/20260713_0015_durable_task_loop.sql
-- Durable task mutations and quick capture with workspace-scoped idempotency.

begin;

create table if not exists public.mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null,
  destination text not null check (destination in ('task', 'inbox')),
  action text not null check (action in ('create', 'update', 'capture')),
  payload_hash text not null,
  task_id uuid references public.tasks(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete restrict,
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  check (
    response is null
    or (destination = 'task' and task_id is not null and work_order_id is null)
    or (destination = 'inbox' and work_order_id is not null and task_id is null)
  ),
  check (
    (destination = 'task' and action in ('create', 'update'))
    or (destination = 'inbox' and action = 'capture')
  )
);

alter table public.mutation_receipts enable row level security;

revoke all on table public.mutation_receipts from public, anon, authenticated;
grant select, insert, update on table public.mutation_receipts to service_role;

create or replace function public.create_task_v1(
  p_workspace_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_destination constant text := 'task';
  v_action constant text := 'create';
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.mutation_receipts%rowtype;
  v_task public.tasks%rowtype;
  v_task_json jsonb;
  v_project_id uuid;
  v_project jsonb;
  v_entity_ref jsonb;
  v_entity_id uuid;
  v_entity_type text;
  v_title text;
  v_status text;
  v_priority text;
  v_next_action text;
  v_due_at timestamptz;
  v_due_precision text;
  v_meta jsonb;
  v_now timestamptz := now();
begin
  if p_workspace_id is null
     or nullif(btrim(p_idempotency_key), '') is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'workspace, idempotency key, and object payload are required'
      using errcode = '22023';
  end if;

  select w.owner_id
  into v_owner_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found or v_owner_id is null then
    raise exception 'workspace owner not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.workspace_memberships wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_owner_id
    and wm.role = 'owner'
    and wm.status = 'active';

  if not found then
    raise exception 'active workspace owner membership not found'
      using errcode = '42501';
  end if;

  v_title := nullif(btrim(p_payload ->> 'title'), '');
  if v_title is null then
    raise exception 'task title is required'
      using errcode = '22023';
  end if;

  v_status := coalesce(nullif(p_payload ->> 'status', ''), 'inbox');
  if v_status not in ('inbox', 'todo', 'doing', 'blocked', 'done') then
    raise exception 'invalid task status'
      using errcode = '22023';
  end if;

  v_priority := coalesce(nullif(p_payload ->> 'priority', ''), 'medium');
  if v_priority not in ('low', 'medium', 'high', 'critical') then
    raise exception 'invalid task priority'
      using errcode = '22023';
  end if;

  v_next_action := coalesce(p_payload ->> 'nextAction', p_payload ->> 'next_action');
  v_due_at := nullif(coalesce(p_payload ->> 'dueAt', p_payload ->> 'due_at'), '')::timestamptz;
  v_due_precision := coalesce(
    nullif(p_payload ->> 'duePrecision', ''),
    nullif(p_payload ->> 'due_precision', ''),
    case when v_due_at is null then 'none' else 'timed' end
  );
  if v_due_precision not in ('timed', 'date', 'none')
     or (v_due_precision = 'none' and v_due_at is not null)
     or (v_due_precision <> 'none' and v_due_at is null) then
    raise exception 'invalid due precision'
      using errcode = '22023';
  end if;

  v_project_id := nullif(coalesce(p_payload ->> 'projectId', p_payload ->> 'project_id'), '')::uuid;
  if v_project_id is not null then
    select jsonb_build_object('id', p.id, 'name', p.name)
    into v_project
    from public.projects p
    where p.id = v_project_id
      and p.workspace_id = p_workspace_id;

    if not found then
      raise exception 'project not found in workspace'
        using errcode = 'P0002';
    end if;
  end if;

  v_entity_ref := coalesce(p_payload -> 'entityRef', p_payload -> 'entity_ref');
  if v_entity_ref is not null and jsonb_typeof(v_entity_ref) <> 'null' then
    if jsonb_typeof(v_entity_ref) <> 'object' then
      raise exception 'entity ref must be an object'
        using errcode = '22023';
    end if;

    v_entity_type := nullif(v_entity_ref ->> 'type', '');
    v_entity_id := nullif(v_entity_ref ->> 'id', '')::uuid;
    if v_entity_type is null or v_entity_id is null then
      raise exception 'entity ref type and id are required'
        using errcode = '22023';
    end if;

    if v_entity_type = 'lead' then
      perform 1 from public.leads l
      where l.id = v_entity_id and l.workspace_id = p_workspace_id;
    elsif v_entity_type = 'deal' then
      perform 1 from public.deals d
      where d.id = v_entity_id and d.workspace_id = p_workspace_id;
    elsif v_entity_type = 'contact' then
      perform 1 from public.contacts c
      where c.id = v_entity_id and c.workspace_id = p_workspace_id;
    elsif v_entity_type = 'company' then
      perform 1 from public.companies c
      where c.id = v_entity_id and c.workspace_id = p_workspace_id;
    else
      raise exception 'invalid entity ref type'
        using errcode = '22023';
    end if;

    if not found then
      raise exception 'entity ref not found in workspace'
        using errcode = 'P0002';
    end if;

  else
    v_entity_ref := null;
  end if;

  if p_payload ? 'meta'
     and jsonb_typeof(p_payload -> 'meta') not in ('object', 'null') then
    raise exception 'task meta must be an object'
      using errcode = '22023';
  end if;

  v_meta := case
    when jsonb_typeof(p_payload -> 'meta') = 'object' then p_payload -> 'meta'
    else '{}'::jsonb
  end - 'due_precision' - 'entity_ref';
  v_meta := v_meta || jsonb_build_object('due_precision', v_due_precision);
  if v_entity_ref is not null then
    v_meta := v_meta || jsonb_build_object('entity_ref', v_entity_ref);
  end if;

  v_canonical_payload := jsonb_build_object(
    'title', v_title,
    'status', v_status,
    'priority', v_priority,
    'next_action', v_next_action,
    'due_at', v_due_at,
    'due_precision', v_due_precision,
    'project_id', v_project_id,
    'entity_ref', v_entity_ref,
    'meta', v_meta
  );
  v_payload_hash := md5(v_canonical_payload::text);

  insert into public.mutation_receipts (
    workspace_id,
    idempotency_key,
    destination,
    action,
    payload_hash
  ) values (
    p_workspace_id,
    btrim(p_idempotency_key),
    v_destination,
    v_action,
    v_payload_hash
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning * into v_receipt;

  if not found then
    select mr.*
    into v_receipt
    from public.mutation_receipts mr
    where mr.workspace_id = p_workspace_id
      and mr.idempotency_key = btrim(p_idempotency_key)
    for update;

    if v_receipt.destination is distinct from v_destination
       or v_receipt.action is distinct from v_action
       or v_receipt.payload_hash is distinct from v_payload_hash then
      return jsonb_build_object('result', 'conflict', 'reason', 'idempotency-key-reused');
    end if;

    if v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('result', 'duplicate');
    end if;

    return jsonb_build_object('result', 'conflict', 'reason', 'mutation-in-progress');
  end if;

  insert into public.tasks (
    workspace_id,
    project_id,
    owner_id,
    title,
    status,
    priority,
    next_action,
    started_at,
    due_at,
    completed_at,
    meta,
    created_at,
    updated_at
  ) values (
    p_workspace_id,
    v_project_id,
    v_owner_id,
    v_title,
    v_status,
    v_priority,
    v_next_action,
    case when v_status = 'doing' then v_now else null end,
    v_due_at,
    case when v_status = 'done' then v_now else null end,
    v_meta,
    v_now,
    v_now
  )
  returning * into v_task;

  v_task_json := jsonb_build_object(
    'id', v_task.id,
    'title', v_task.title,
    'status', v_task.status,
    'priority', v_task.priority,
    'due_at', v_task.due_at,
    'due_precision', v_task.meta ->> 'due_precision',
    'meta', v_task.meta,
    'project', v_project,
    'owner', jsonb_build_object('id', v_owner_id),
    'next_action', v_task.next_action,
    'created_at', v_task.created_at,
    'updated_at', v_task.updated_at,
    'completed_at', v_task.completed_at,
    'started_at', v_task.started_at,
    'workspace_id', v_task.workspace_id
  );

  update public.mutation_receipts
  set task_id = v_task.id,
      response = jsonb_build_object('result', 'saved', 'task', v_task_json),
      updated_at = v_now
  where id = v_receipt.id
  returning response into v_task_json;

  return v_task_json;
end;
$$;

revoke all on function public.create_task_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_task_v1(uuid, text, jsonb)
  to service_role;

create or replace function public.update_task_v1(
  p_workspace_id uuid,
  p_task_id uuid,
  p_idempotency_key text,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_destination constant text := 'task';
  v_action constant text := 'update';
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.mutation_receipts%rowtype;
  v_task public.tasks%rowtype;
  v_task_json jsonb;
  v_response jsonb;
  v_project_id uuid;
  v_project jsonb;
  v_entity_ref jsonb;
  v_entity_id uuid;
  v_entity_type text;
  v_title text;
  v_status text;
  v_priority text;
  v_next_action text;
  v_due_at timestamptz;
  v_due_precision text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_meta jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_workspace_id is null
     or p_task_id is null
     or nullif(btrim(p_idempotency_key), '') is null
     or p_expected_updated_at is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'workspace, task, idempotency key, expected timestamp, and object payload are required'
      using errcode = '22023';
  end if;

  select w.owner_id
  into v_owner_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found or v_owner_id is null then
    raise exception 'workspace owner not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.workspace_memberships wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_owner_id
    and wm.role = 'owner'
    and wm.status = 'active';

  if not found then
    raise exception 'active workspace owner membership not found'
      using errcode = '42501';
  end if;

  v_canonical_payload := jsonb_build_object(
    'task_id', p_task_id,
    'expected_updated_at', p_expected_updated_at,
    'patch', p_payload
  );
  v_payload_hash := md5(v_canonical_payload::text);

  insert into public.mutation_receipts (
    workspace_id,
    idempotency_key,
    destination,
    action,
    payload_hash
  ) values (
    p_workspace_id,
    btrim(p_idempotency_key),
    v_destination,
    v_action,
    v_payload_hash
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning * into v_receipt;

  if not found then
    select mr.*
    into v_receipt
    from public.mutation_receipts mr
    where mr.workspace_id = p_workspace_id
      and mr.idempotency_key = btrim(p_idempotency_key)
    for update;

    if v_receipt.destination is distinct from v_destination
       or v_receipt.action is distinct from v_action
       or v_receipt.payload_hash is distinct from v_payload_hash then
      return jsonb_build_object('result', 'conflict', 'reason', 'idempotency-key-reused');
    end if;

    if v_receipt.response is not null then
      if v_receipt.response ->> 'result' = 'saved' then
        return v_receipt.response || jsonb_build_object('result', 'duplicate');
      end if;
      return v_receipt.response;
    end if;

    return jsonb_build_object('result', 'conflict', 'reason', 'mutation-in-progress');
  end if;

  select t.*
  into v_task
  from public.tasks t
  where t.id = p_task_id
    and t.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'task not found in workspace'
      using errcode = 'P0002';
  end if;

  if v_task.updated_at is distinct from p_expected_updated_at then
    v_task_json := jsonb_build_object(
      'id', v_task.id,
      'title', v_task.title,
      'status', v_task.status,
      'priority', v_task.priority,
      'due_at', v_task.due_at,
      'due_precision', coalesce(v_task.meta ->> 'due_precision', case when v_task.due_at is null then 'none' else 'timed' end),
      'meta', v_task.meta,
      'project', case when v_task.project_id is null then null else jsonb_build_object('id', v_task.project_id) end,
      'owner', jsonb_build_object('id', v_task.owner_id),
      'next_action', v_task.next_action,
      'created_at', v_task.created_at,
      'updated_at', v_task.updated_at,
      'completed_at', v_task.completed_at,
      'started_at', v_task.started_at,
      'workspace_id', v_task.workspace_id
    );
    v_response := jsonb_build_object('result', 'conflict', 'reason', 'stale-write', 'task', v_task_json);

    update public.mutation_receipts
    set task_id = v_task.id,
        response = v_response,
        updated_at = v_now
    where id = v_receipt.id;

    return v_response;
  end if;

  v_title := case
    when p_payload ? 'title' then nullif(btrim(p_payload ->> 'title'), '')
    else v_task.title
  end;
  if v_title is null then
    raise exception 'task title cannot be empty'
      using errcode = '22023';
  end if;

  v_status := case
    when p_payload ? 'status' then nullif(p_payload ->> 'status', '')
    else v_task.status
  end;
  if v_status is null or v_status not in ('inbox', 'todo', 'doing', 'blocked', 'done') then
    raise exception 'invalid task status'
      using errcode = '22023';
  end if;

  if v_status is distinct from v_task.status and not (
    (v_task.status = 'inbox' and v_status in ('todo', 'done'))
    or (v_task.status = 'todo' and v_status in ('doing', 'blocked', 'done'))
    or (v_task.status = 'doing' and v_status in ('todo', 'blocked', 'done'))
    or (v_task.status = 'blocked' and v_status in ('todo', 'doing', 'done'))
    or (v_task.status = 'done' and v_status = 'todo')
  ) then
    raise exception 'invalid task status transition'
      using errcode = '22023';
  end if;

  v_priority := case
    when p_payload ? 'priority' then nullif(p_payload ->> 'priority', '')
    else v_task.priority
  end;
  if v_priority is null or v_priority not in ('low', 'medium', 'high', 'critical') then
    raise exception 'invalid task priority'
      using errcode = '22023';
  end if;

  if p_payload ? 'nextAction' then
    v_next_action := p_payload ->> 'nextAction';
  elsif p_payload ? 'next_action' then
    v_next_action := p_payload ->> 'next_action';
  else
    v_next_action := v_task.next_action;
  end if;

  if p_payload ? 'dueAt' then
    v_due_at := nullif(p_payload ->> 'dueAt', '')::timestamptz;
  elsif p_payload ? 'due_at' then
    v_due_at := nullif(p_payload ->> 'due_at', '')::timestamptz;
  else
    v_due_at := v_task.due_at;
  end if;

  if p_payload ? 'duePrecision' then
    v_due_precision := nullif(p_payload ->> 'duePrecision', '');
  elsif p_payload ? 'due_precision' then
    v_due_precision := nullif(p_payload ->> 'due_precision', '');
  elsif p_payload ? 'dueAt' or p_payload ? 'due_at' then
    v_due_precision := case when v_due_at is null then 'none' else 'timed' end;
  else
    v_due_precision := coalesce(
      v_task.meta ->> 'due_precision',
      case when v_due_at is null then 'none' else 'timed' end
    );
  end if;
  if v_due_precision is null
     or v_due_precision not in ('timed', 'date', 'none')
     or (v_due_precision = 'none' and v_due_at is not null)
     or (v_due_precision <> 'none' and v_due_at is null) then
    raise exception 'invalid due precision'
      using errcode = '22023';
  end if;

  if p_payload ? 'projectId' then
    v_project_id := nullif(p_payload ->> 'projectId', '')::uuid;
  elsif p_payload ? 'project_id' then
    v_project_id := nullif(p_payload ->> 'project_id', '')::uuid;
  else
    v_project_id := v_task.project_id;
  end if;
  if v_project_id is not null then
    select jsonb_build_object('id', p.id, 'name', p.name)
    into v_project
    from public.projects p
    where p.id = v_project_id
      and p.workspace_id = p_workspace_id;

    if not found then
      raise exception 'project not found in workspace'
        using errcode = 'P0002';
    end if;
  end if;

  v_meta := v_task.meta;
  if jsonb_typeof(p_payload -> 'meta') = 'object' then
    v_meta := v_meta || ((p_payload -> 'meta') - 'due_precision' - 'entity_ref');
  elsif p_payload ? 'meta' and jsonb_typeof(p_payload -> 'meta') <> 'null' then
    raise exception 'task meta must be an object'
      using errcode = '22023';
  end if;
  v_meta := v_meta || jsonb_build_object('due_precision', v_due_precision);

  if p_payload ? 'entityRef' or p_payload ? 'entity_ref' then
    v_entity_ref := coalesce(p_payload -> 'entityRef', p_payload -> 'entity_ref');
    if v_entity_ref is null or jsonb_typeof(v_entity_ref) = 'null' then
      v_meta := v_meta - 'entity_ref';
    else
      if jsonb_typeof(v_entity_ref) <> 'object' then
        raise exception 'entity ref must be an object'
          using errcode = '22023';
      end if;

      v_entity_type := nullif(v_entity_ref ->> 'type', '');
      v_entity_id := nullif(v_entity_ref ->> 'id', '')::uuid;
      if v_entity_type is null or v_entity_id is null then
        raise exception 'entity ref type and id are required'
          using errcode = '22023';
      end if;

      if v_entity_type = 'lead' then
        perform 1 from public.leads l
        where l.id = v_entity_id and l.workspace_id = p_workspace_id;
      elsif v_entity_type = 'deal' then
        perform 1 from public.deals d
        where d.id = v_entity_id and d.workspace_id = p_workspace_id;
      elsif v_entity_type = 'contact' then
        perform 1 from public.contacts c
        where c.id = v_entity_id and c.workspace_id = p_workspace_id;
      elsif v_entity_type = 'company' then
        perform 1 from public.companies c
        where c.id = v_entity_id and c.workspace_id = p_workspace_id;
      else
        raise exception 'invalid entity ref type'
          using errcode = '22023';
      end if;

      if not found then
        raise exception 'entity ref not found in workspace'
          using errcode = 'P0002';
      end if;
      v_meta := v_meta || jsonb_build_object('entity_ref', v_entity_ref);
    end if;
  end if;

  v_started_at := v_task.started_at;
  if v_status = 'doing' then
    v_started_at := coalesce(v_task.started_at, v_now);
  end if;

  v_completed_at := v_task.completed_at;
  if v_status = 'done' then
    v_completed_at := coalesce(v_task.completed_at, v_now);
  elsif v_task.status = 'done' and v_status = 'todo' then
    v_completed_at := null;
  end if;

  update public.tasks
  set project_id = v_project_id,
      owner_id = v_owner_id,
      title = v_title,
      status = v_status,
      priority = v_priority,
      next_action = v_next_action,
      started_at = v_started_at,
      due_at = v_due_at,
      completed_at = v_completed_at,
      meta = v_meta,
      updated_at = v_now
  where id = p_task_id
    and workspace_id = p_workspace_id
  returning * into v_task;

  v_task_json := jsonb_build_object(
    'id', v_task.id,
    'title', v_task.title,
    'status', v_task.status,
    'priority', v_task.priority,
    'due_at', v_task.due_at,
    'due_precision', v_task.meta ->> 'due_precision',
    'meta', v_task.meta,
    'project', v_project,
    'owner', jsonb_build_object('id', v_owner_id),
    'next_action', v_task.next_action,
    'created_at', v_task.created_at,
    'updated_at', v_task.updated_at,
    'completed_at', v_task.completed_at,
    'started_at', v_task.started_at,
    'workspace_id', v_task.workspace_id
  );
  v_response := jsonb_build_object('result', 'saved', 'task', v_task_json);

  update public.mutation_receipts
  set task_id = v_task.id,
      response = v_response,
      updated_at = v_now
  where id = v_receipt.id;

  return v_response;
end;
$$;

revoke all on function public.update_task_v1(uuid, uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_task_v1(uuid, uuid, text, timestamptz, jsonb)
  to service_role;

create or replace function public.capture_quick_input_v1(
  p_workspace_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_destination constant text := 'inbox';
  v_action constant text := 'capture';
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.mutation_receipts%rowtype;
  v_work_order public.work_orders%rowtype;
  v_work_order_json jsonb;
  v_response jsonb;
  v_raw text;
  v_kind text;
  v_persona text;
  v_summary text;
  v_channel text;
  v_entity_ref jsonb;
  v_entity_id uuid;
  v_entity_type text;
  v_lead_id uuid;
  v_deal_id uuid;
  v_company_id uuid;
  v_body jsonb;
  v_now timestamptz := now();
begin
  if p_workspace_id is null
     or nullif(btrim(p_idempotency_key), '') is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'workspace, idempotency key, and object payload are required'
      using errcode = '22023';
  end if;

  select w.owner_id
  into v_owner_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found or v_owner_id is null then
    raise exception 'workspace owner not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.workspace_memberships wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_owner_id
    and wm.role = 'owner'
    and wm.status = 'active';

  if not found then
    raise exception 'active workspace owner membership not found'
      using errcode = '42501';
  end if;

  v_raw := nullif(btrim(p_payload ->> 'raw'), '');
  if v_raw is null or length(v_raw) > 4000 then
    raise exception 'quick input raw text must be between 1 and 4000 characters'
      using errcode = '22023';
  end if;

  v_kind := coalesce(nullif(btrim(p_payload ->> 'kind'), ''), 'note');
  v_persona := coalesce(nullif(btrim(p_payload ->> 'persona'), ''), 'inbox');
  v_summary := coalesce(nullif(btrim(p_payload ->> 'summary'), ''), left(v_raw, 160));
  v_channel := nullif(btrim(p_payload ->> 'channel'), '');
  v_entity_ref := coalesce(p_payload -> 'entityRef', p_payload -> 'entity_ref');

  if v_entity_ref is not null and jsonb_typeof(v_entity_ref) <> 'null' then
    if jsonb_typeof(v_entity_ref) <> 'object' then
      raise exception 'entity ref must be an object'
        using errcode = '22023';
    end if;

    v_entity_type := nullif(v_entity_ref ->> 'type', '');
    v_entity_id := nullif(v_entity_ref ->> 'id', '')::uuid;
    if v_entity_type is null or v_entity_id is null then
      raise exception 'entity ref type and id are required'
        using errcode = '22023';
    end if;

    if v_entity_type = 'lead' then
      select l.id into v_lead_id
      from public.leads l
      where l.id = v_entity_id and l.workspace_id = p_workspace_id;
    elsif v_entity_type = 'deal' then
      select d.id, d.lead_id, d.company_id
      into v_deal_id, v_lead_id, v_company_id
      from public.deals d
      where d.id = v_entity_id and d.workspace_id = p_workspace_id;
    elsif v_entity_type = 'contact' then
      perform 1 from public.contacts c
      where c.id = v_entity_id and c.workspace_id = p_workspace_id;
    elsif v_entity_type = 'company' then
      select c.id into v_company_id
      from public.companies c
      where c.id = v_entity_id and c.workspace_id = p_workspace_id;
    else
      raise exception 'invalid entity ref type'
        using errcode = '22023';
    end if;

    if not found then
      raise exception 'entity ref not found in workspace'
        using errcode = 'P0002';
    end if;

    if v_deal_id is not null and v_lead_id is not null then
      perform 1
      from public.leads l
      where l.id = v_lead_id
        and l.workspace_id = p_workspace_id;

      if not found then
        raise exception 'deal lead is not in workspace'
          using errcode = '23514';
      end if;
    end if;

    if v_deal_id is not null and v_company_id is not null then
      perform 1
      from public.companies c
      where c.id = v_company_id
        and c.workspace_id = p_workspace_id;

      if not found then
        raise exception 'deal company is not in workspace'
          using errcode = '23514';
      end if;
    end if;
  else
    v_entity_ref := null;
  end if;

  v_body := jsonb_build_object(
    'raw', v_raw,
    'kind', v_kind,
    'persona', v_persona,
    'summary', v_summary,
    'owner_id', v_owner_id,
    'entity_ref', v_entity_ref
  );
  v_canonical_payload := jsonb_build_object(
    'raw', v_raw,
    'kind', v_kind,
    'persona', v_persona,
    'summary', v_summary,
    'channel', v_channel,
    'entity_ref', v_entity_ref
  );
  v_payload_hash := md5(v_canonical_payload::text);

  insert into public.mutation_receipts (
    workspace_id,
    idempotency_key,
    destination,
    action,
    payload_hash
  ) values (
    p_workspace_id,
    btrim(p_idempotency_key),
    v_destination,
    v_action,
    v_payload_hash
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning * into v_receipt;

  if not found then
    select mr.*
    into v_receipt
    from public.mutation_receipts mr
    where mr.workspace_id = p_workspace_id
      and mr.idempotency_key = btrim(p_idempotency_key)
    for update;

    if v_receipt.destination is distinct from v_destination
       or v_receipt.action is distinct from v_action
       or v_receipt.payload_hash is distinct from v_payload_hash then
      return jsonb_build_object('result', 'conflict', 'reason', 'idempotency-key-reused');
    end if;

    if v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('result', 'duplicate');
    end if;

    return jsonb_build_object('result', 'conflict', 'reason', 'mutation-in-progress');
  end if;

  insert into public.work_orders (
    workspace_id,
    persona,
    kind,
    title,
    body,
    lead_id,
    deal_id,
    company_id,
    channel,
    status,
    gate,
    source,
    proposed_at,
    created_at
  ) values (
    p_workspace_id,
    v_persona,
    v_kind,
    v_summary,
    v_body,
    v_lead_id,
    v_deal_id,
    v_company_id,
    v_channel,
    'proposed',
    'n/a',
    'inbox',
    v_now,
    v_now
  )
  returning * into v_work_order;

  v_work_order_json := jsonb_build_object(
    'id', v_work_order.id,
    'status', v_work_order.status,
    'persona', v_work_order.persona,
    'kind', v_work_order.kind,
    'title', v_work_order.title,
    'body', v_work_order.body,
    'source', v_work_order.source,
    'proposed_at', v_work_order.proposed_at,
    'created_at', v_work_order.created_at,
    'workspace_id', v_work_order.workspace_id
  );
  v_response := jsonb_build_object('result', 'saved', 'work_order', v_work_order_json);

  update public.mutation_receipts
  set work_order_id = v_work_order.id,
      response = v_response,
      updated_at = v_now
  where id = v_receipt.id;

  return v_response;
end;
$$;

revoke all on function public.capture_quick_input_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.capture_quick_input_v1(uuid, text, jsonb)
  to service_role;

commit;
-- end of apply-pending.sql
