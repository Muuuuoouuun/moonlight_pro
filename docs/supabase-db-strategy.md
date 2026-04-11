# Com_Moon Supabase DB 설계 작전

## 1. 목적

이 문서는 `Com_Moon Hub OS`의 Supabase DB를 "한 번에 다 만들기"가 아니라,
`지금 허브가 실제로 쓰는 운영 원장`부터 안정적으로 세우기 위한 설계 기준서다.

목표는 4가지다.

1. `apps/hub`와 `apps/engine`이 바로 붙을 수 있는 MVP 원장 만들기
2. Supabase Auth + RLS 기준으로 안전한 멀티테넌시 구조 만들기
3. Content / Revenue / Work / Automation을 한 DB 안에서 일관되게 연결하기
4. 추후 Notion, Telegram, Calendar, Email 연동이 들어와도 스키마가 무너지지 않게 하기

## 2. 현재 진단

현재 `supabase/schema.sql`은 제품 전체 그림을 꽤 잘 담고 있지만,
실제 코드 사용량보다 범위가 조금 넓다.

좋은 점:

- `work`, `revenue`, `content`, `automation`, `evolution` 도메인이 이미 분리되어 있다
- `workspace_id`가 대부분의 테이블에 들어가 있어 멀티테넌시 방향이 맞다
- `project_updates`, `automation_runs`, `webhook_events`, `error_logs`처럼 운영 로그성 원장이 잘 잡혀 있다

지금 바로 손봐야 하는 점:

1. `profiles`가 Supabase `auth.users`와 직접 연결되지 않는다
2. `workspace_memberships`가 없어 실제 RLS 기준이 약하다
3. 대부분 테이블에 `updated_at`이 없다
4. 공개 웹(`apps/web`)에 필요한 `slug`, `visibility`, `published_at`, `brand` 축이 부족하다
5. 외부 동기화를 위한 `external_id` / `provider` 축이 핵심 테이블에 없다
6. `campaigns`, `documents`, `field_mappings` 같은 일부 테이블은 아직 UI보다 앞서 있다

결론:
지금은 "새 스키마를 다시 그리기"보다
"기존 스키마를 MVP 원장 + 확장 레이어로 재편"하는 전략이 맞다.

## 3. 설계 원칙

### 원칙 1. 원장은 작고 명확해야 한다

허브 화면이 5초 안에 답해야 하는 질문은 아래다.

- 지금 무엇이 중요하지?
- 뭐가 막혀 있지?
- 다음 액션은 뭐지?

그래서 핵심 테이블은 `상태 + 소유자 + 다음 액션 + 시간`이 먼저 있어야 한다.

### 원칙 2. 모든 업무 데이터는 workspace 기준으로 묶는다

RLS는 `workspace_id` + `workspace_memberships`로 푼다.
사용자 권한은 이메일이 아니라 Supabase Auth의 `auth.uid()` 기준으로 간다.

### 원칙 3. 시스템 로그와 사용자 데이터는 분리한다

`error_logs`, `automation_runs`, `webhook_events`, `sync_runs`, `api_keys`는
일반 사용자 수정 테이블이 아니라 시스템 원장에 가깝다.
이 영역은 service role 중심으로 쓰고, 사용자에게는 read 위주로 열어야 한다.

### 원칙 4. 공개 웹은 "공개 뷰"로 분리한다

`apps/web`가 읽는 공개 콘텐츠는 내부 운영 테이블을 직접 노출하지 말고,
`published` 상태만 보여주는 view 또는 안전한 select policy로 분리한다.

### 원칙 5. integration은 본문 테이블을 오염시키지 않고 연결한다

Notion, Telegram, Calendar 같은 외부 시스템은 언제든 바뀔 수 있다.
핵심 원장에는 필요한 최소 필드만 두고,
연결 메타데이터는 `integration_connections`, `sync_runs`, `webhook_events`, `meta jsonb`로 흡수한다.

## 4. MVP 기준 도메인 재정의

### P0. Auth / Tenancy

반드시 먼저 고정할 것:

- `auth.users`
- `profiles`
- `workspaces`
- `workspace_memberships`

권장 구조:

- `profiles.id = auth.users.id`
- `workspaces`는 운영 단위
- `workspace_memberships`는 사용자-워크스페이스 관계와 역할 관리

권장 역할:

- `owner`
- `operator`
- `viewer`

### P0. Work OS

지금 허브가 실제로 많이 읽는 테이블:

- `areas`
- `projects`
- `tasks`
- `project_updates`
- `routine_checks`
- `decisions`
- `notes`

이 레인은 "무엇을 하고 있는가"와 "다음 액션"을 추적하는 코어다.

### P0. Revenue

실사용 우선순위:

- `leads`
- `deals`
- `customer_accounts`
- `operation_cases`

보조 관계:

- `companies`
- `contacts`

즉, 첫 단계에서는 CRM 전체보다 "리드 -> 딜 -> 운영 케이스" 흐름만 살아 있으면 된다.

### P0. Content

핵심:

- `brands`
- `content_items`
- `content_variants`
- `content_assets`
- `publish_logs`

`apps/hub`의 큐/스튜디오/퍼블리시와 `apps/web`의 공개 콘텐츠를 동시에 받으려면
브랜드 축과 공개 상태 축이 필요하다.

### P0. Automation / Evolution

핵심:

- `automations`
- `automation_runs`
- `integration_connections`
- `sync_runs`
- `webhook_endpoints`
- `webhook_events`
- `error_logs`
- `activity_logs`
- `issues`
- `memos`

이 영역은 "기계가 돌고 있는지"와 "무엇이 실패했는지"를 남기는 운영 원장이다.

## 5. 추천 테이블 구조

### 5.1 Auth / Workspace

#### `profiles`

유지하되 아래처럼 바꾸는 것을 권장한다.

- `id uuid primary key references auth.users(id) on delete cascade`
- `email text unique`
- `display_name text`
- `avatar_url text`
- `default_workspace_id uuid null references workspaces(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

주의:
프로필의 PK를 `gen_random_uuid()`로 따로 뽑으면
Supabase Auth와 join, RLS, `auth.uid()` 정책이 불편해진다.

#### `workspaces`

현재 구조를 유지하되 아래를 추천한다.

- `slug`
- `name`
- `timezone`
- `owner_user_id`
- `created_at`
- `updated_at`

`owner_id`가 `profiles.id`를 보게 하는 것은 괜찮지만,
이제는 이름을 `owner_user_id` 또는 `created_by`처럼 더 명확히 잡는 것이 좋다.

#### `workspace_memberships`

새로 추가 권장:

```sql
create table workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'operator', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
```

이 테이블이 있어야 RLS가 단순해진다.

### 5.2 Brand / Context

문서상 `Content`는 여러 브랜드 문맥을 전환한다.
그래서 `brands`는 P0에 넣는 것이 맞다.

```sql
create table brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  color_hex text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
```

## 6. 도메인별 컬럼 보강안

### 6.1 `projects`

현재 유지해도 되지만 아래 추가를 권장한다.

- `owner_id uuid null references profiles(id)`
- `slug text null`
- `summary text null`
- `last_activity_at timestamptz null`
- `completed_at timestamptz null`
- `updated_at timestamptz not null default now()`
- `meta jsonb not null default '{}'::jsonb`

### 6.2 `tasks`

지금 UI 기준으로 꼭 필요한 보강:

- `area_id uuid null`
- `priority text default 'medium'`
- `started_at timestamptz null`
- `completed_at timestamptz null`
- `updated_at timestamptz not null default now()`
- `meta jsonb not null default '{}'::jsonb`

### 6.3 `project_updates`

지금 테이블이 아주 좋다. 다만 아래 2개를 권장한다.

- `actor_id uuid null references profiles(id)`
- `provider_event_id text null`

이유:
외부 webhook 중복 방지와 감사 추적이 쉬워진다.

### 6.4 `leads`

현재 스키마는 허브 카드에는 충분하지만 실제 운영에는 조금 얇다.
아래 정도는 P0에서 같이 넣는 편이 좋다.

- `owner_id uuid null references profiles(id)`
- `name text null`
- `email text null`
- `phone text null`
- `channel text null`
- `last_touch_at timestamptz null`
- `qualified_at timestamptz null`
- `lost_at timestamptz null`
- `updated_at timestamptz not null default now()`
- `meta jsonb not null default '{}'::jsonb`

핵심 포인트:
리드 원장에는 최소한 "누구인지", "누가 맡는지", "마지막 접점이 언제인지"가 있어야 한다.

### 6.5 `deals`

권장 추가:

- `owner_id uuid null references profiles(id)`
- `currency text not null default 'KRW'`
- `next_action text null`
- `last_activity_at timestamptz null`
- `won_at timestamptz null`
- `lost_at timestamptz null`
- `updated_at timestamptz not null default now()`
- `meta jsonb not null default '{}'::jsonb`

### 6.6 `customer_accounts`

지금 형태는 시작점으로 괜찮다.
다만 장기적으로 아래를 넣는 것이 좋다.

- `owner_id uuid null references profiles(id)`
- `started_at timestamptz null`
- `ended_at timestamptz null`
- `health_score integer null`
- `next_action text null`
- `updated_at timestamptz not null default now()`

### 6.7 `operation_cases`

현재 허브 라우트와 잘 맞는다.
추천 보강:

- `priority text default 'medium'`
- `opened_at timestamptz not null default now()`
- `closed_at timestamptz null`
- `updated_at timestamptz not null default now()`
- `meta jsonb not null default '{}'::jsonb`

### 6.8 `content_items`

가장 중요하게 보강해야 하는 영역이다.

권장 추가:

- `brand_id uuid null references brands(id)`
- `slug text null`
- `summary text null`
- `idea_source text null`
- `scheduled_at timestamptz null`
- `published_at timestamptz null`
- `visibility text not null default 'private' check (visibility in ('private', 'workspace', 'public'))`
- `updated_at timestamptz not null default now()`
- `meta jsonb not null default '{}'::jsonb`

### 6.9 `content_variants`

`apps/web`까지 고려하면 이쪽도 중요하다.

권장 추가:

- `slug text null`
- `summary text null`
- `excerpt text null`
- `seo_title text null`
- `seo_description text null`
- `scheduled_at timestamptz null`
- `published_at timestamptz null`
- `visibility text not null default 'private' check (visibility in ('private', 'workspace', 'public'))`
- `updated_at timestamptz not null default now()`
- `meta jsonb not null default '{}'::jsonb`

실무 판단:
공개 블로그/인사이트를 `content_variants`에서 직접 내보낼지,
별도 `public_posts`로 분리할지는 취향 차이다.
현재 프로젝트 단계에서는 `content_variants`에 공개 발행 메타를 넣고,
`public` view를 하나 두는 방식이 가장 경제적이다.

### 6.10 `content_assets`

권장 추가:

- `file_name text null`
- `mime_type text null`
- `size_bytes bigint null`
- `checksum text null`
- `updated_at timestamptz not null default now()`

### 6.11 `publish_logs`

권장 추가:

- `provider text null`
- `target_url text null`
- `attempt_count integer not null default 1`
- `updated_at timestamptz not null default now()`

### 6.12 `automation_runs`, `webhook_events`, `error_logs`

이 3개는 잘 잡혀 있다.
다만 운영 안정성을 위해 아래 보강을 권장한다.

- `triggered_by_user_id uuid null`
- `correlation_id text null`
- `provider_event_id text null`
- `workspace_id` not null 유지
- 조회 최적화용 인덱스 강화

## 7. RLS 설계

### 기본 원칙

모든 업무 테이블은 아래 형태로 푼다.

- 사용자는 자신이 membership를 가진 workspace의 row만 읽을 수 있다
- `owner`, `operator`는 insert/update 가능
- `viewer`는 read only
- 시스템 테이블 일부는 service role only

### 권장 helper 함수

```sql
create or replace function is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;
```

```sql
create or replace function has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role = any(allowed_roles)
  );
$$;
```

### 대표 정책 예시

```sql
alter table projects enable row level security;

create policy "projects_select_member"
on projects
for select
using (is_workspace_member(workspace_id));

create policy "projects_write_operator"
on projects
for all
using (has_workspace_role(workspace_id, array['owner', 'operator']))
with check (has_workspace_role(workspace_id, array['owner', 'operator']));
```

### service-role only 권장 테이블

아래 테이블은 일반 사용자 write를 막는 편이 낫다.

- `api_keys`
- `secret_rotations`
- `automation_runs`
- `webhook_events`
- `sync_runs`
- `error_logs`

일반 사용자는 read 전용 또는 view 경유 접근이 안전하다.

### public read 권장 영역

`apps/web`를 위해 아래는 공개 select view 또는 제한적 public policy가 가능하다.

- `public_content_variants`
- `public_case_studies`

조건:

- `visibility = 'public'`
- `status in ('published')`
- `published_at is not null`

## 8. 인덱스 전략

지금 인덱스 방향은 좋지만, 아래를 추가하면 운영 화면이 더 빨라진다.

### 공통

- `(workspace_id, created_at desc)`
- `(workspace_id, updated_at desc)`
- `(workspace_id, status)`

### Work

- `projects(workspace_id, priority, status)`
- `tasks(workspace_id, owner_id, status, due_at)`
- `project_updates(workspace_id, project_id, happened_at desc)`

### Revenue

- `leads(workspace_id, status, score desc)`
- `leads(workspace_id, owner_id, last_touch_at desc)`
- `deals(workspace_id, stage, expected_close_at)`
- `operation_cases(workspace_id, status, owner_id)`

### Content

- `content_items(workspace_id, brand_id, status, created_at desc)`
- `content_variants(workspace_id, content_id, variant_type, status)`
- `publish_logs(workspace_id, status, created_at desc)`

### Automation

- `automation_runs(workspace_id, status, created_at desc)`
- `webhook_events(workspace_id, status, received_at desc)`
- `sync_runs(workspace_id, status, started_at desc)`
- `error_logs(workspace_id, resolved, timestamp desc)`

## 9. 지금 스키마에서 "살릴 것 / 미룰 것"

### 바로 살릴 것

- `profiles`
- `workspaces`
- `areas`
- `projects`
- `tasks`
- `notes`
- `decisions`
- `project_updates`
- `routine_checks`
- `content_items`
- `content_variants`
- `content_assets`
- `publish_logs`
- `leads`
- `deals`
- `customer_accounts`
- `operation_cases`
- `automations`
- `automation_runs`
- `integration_connections`
- `sync_runs`
- `webhook_endpoints`
- `webhook_events`
- `error_logs`
- `activity_logs`
- `issues`
- `memos`

### 구조는 유지하되 P1로 내릴 것

- `milestones`
- `companies`
- `contacts`
- `documents`
- `field_mappings`

### P2 이후가 자연스러운 것

- `campaigns`
- `campaign_runs`
- `api_keys`
- `secret_rotations`
- `export_logs`

이 말은 삭제하자는 뜻이 아니라,
"초기 migration, seed, UI binding의 우선순위에서 뒤로 미루자"는 뜻이다.

## 10. 권장 migration 순서

### Migration 1. Auth / Membership 정비

- `profiles.id -> auth.users.id` 정렬
- `workspace_memberships` 생성
- `workspaces.owner_user_id` 정리
- seed 재구성

### Migration 2. 공통 메타 정비

- 전 테이블 `updated_at` 추가
- 공통 `set_updated_at()` trigger 추가
- 필요한 unique / partial index 추가

### Migration 3. Brand / Public Content 축 추가

- `brands` 생성
- `content_items.brand_id` 추가
- `content_items`, `content_variants`에 `slug`, `visibility`, `published_at` 추가
- `public_content_variants` view 추가

### Migration 4. Revenue 운영 컬럼 보강

- `leads.owner_id`, `last_touch_at`, `meta`
- `deals.owner_id`, `next_action`, `last_activity_at`, `currency`
- `customer_accounts.owner_id`, `next_action`
- `operation_cases.priority`, `closed_at`

### Migration 5. Automation / Log 권한 잠그기

- system tables RLS 재설정
- service role write only 원칙 적용
- webhook / run / error correlation 필드 추가

### Migration 6. Integration 확장

- `field_mappings` 보강
- provider별 external ref 전략 확정
- Notion / Telegram / Calendar 첫 연결

## 11. 최종 판단

이 프로젝트의 Supabase DB는 "거대한 ERP형 설계"보다
"운영 원장 + 로그 원장 + 공개 콘텐츠 뷰" 3층 구조로 보는 것이 맞다.

정리하면:

1. 먼저 `Auth + Workspace Membership + RLS`를 고정한다
2. 그 위에 `Work / Revenue / Content / Automation` 코어 컬럼을 보강한다
3. 공개 웹은 `published/public` view로 분리한다
4. 외부 연동은 핵심 테이블을 과도하게 오염시키지 않고 로그/메타로 연결한다

가장 먼저 착수할 한 줄 우선순위:

`profiles/auth 정렬 -> workspace_memberships -> updated_at 전면 도입 -> brands/public content 축 추가`

