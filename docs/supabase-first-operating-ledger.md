# Moonlight Supabase-first operating ledger

## 결론

Moonlight는 Supabase를 1차 source of truth로 둔다. Notion, Telegram, GitHub, Calendar, Email은 source of truth가 아니라 입력/실행 채널이다.

DB는 아래 3층으로 운영한다.

```text
1. 운영 원장
   workspace, brand, area, project, task, note, decision, lead, deal, account, case

2. 로그 원장
   project_updates, routine_checks, automation_runs, webhook_events, sync_runs, error_logs, activity_logs

3. 공개 뷰
   public_content_variants 같은 read-only view
```

## 핵심 관계

```text
workspace
  -> workspace_memberships
  -> brands
    -> projects
      -> tasks
      -> project_updates
      -> notes
      -> decisions
      -> content_items / assets
      -> automation_runs / webhook_events by correlation_id
```

`workspace_id`는 권한과 tenancy의 기준이다. `brand_id`는 문맥 전환의 기준이고, `area_id`는 업무 영역 분류다.

## Project 원칙

`projects`는 두꺼운 문서 테이블이 아니라 현재 상태판이다.

프로젝트 row는 아래 질문에 빠르게 답해야 한다.

- 지금 살아 있는가?
- 누가 맡고 있는가?
- 어떤 브랜드/영역의 일인가?
- 얼마나 진행됐는가?
- 다음 액션은 무엇인가?
- 마지막 활동은 언제인가?

프로젝트 세부 정보는 성격별 ledger로 분산한다.

| 정보 | 테이블 |
| --- | --- |
| 할 일 | `tasks` |
| 진행 이벤트 | `project_updates` |
| 자유 메모 | `notes` |
| 결정 기록 | `decisions` |
| 루틴 점검 | `routine_checks` |
| 산출물/파일 | `content_assets`, 이후 `resources` 검토 |
| 자동화 실행 | `automation_runs` |
| 외부 입력 | `webhook_events`, `sync_runs` |
| 오류 | `error_logs` |

## Brand와 Area

`brands`는 제품, 사업, 콘텐츠 브랜드, 클라이언트 브랜드 같은 문맥을 나타낸다.

예:

```text
MoonPM
BridgeMaker
Class.Moon
22th.Nomad
```

`areas`는 운영 영역이다.

예:

```text
Product
Growth
Client Ops
Revenue
Content
Personal
```

한 프로젝트는 우선 `brand_id` 하나와 `area_id` 하나를 가진다. 나중에 하나의 프로젝트가 여러 브랜드를 걸치면 `project_brands` 조인 테이블을 추가한다.

## Supabase 적용 순서

### 1. 초기 스키마

Supabase SQL Editor에서 기존 파일을 먼저 적용한다.

```text
supabase/schema.sql
supabase/seed.sql
```

### 2. Foundation migration

그 다음 아래 migration을 적용한다.

```text
supabase/migrations/20260420_0001_supabase_first_foundation.sql
```

이 migration은 다음을 추가한다.

- `workspace_memberships`
- `brands`
- 주요 테이블의 `updated_at`
- 프로젝트/태스크/콘텐츠/매출 운영 컬럼
- `correlation_id`, `provider_event_id`
- RLS helper 함수
- `public_content_variants` 공개 뷰
- 운영 조회용 인덱스

샘플 브랜드/프로젝트 문맥까지 채우려면 이어서 아래 파일을 적용한다.

```text
supabase/seed.supabase_first.sql
```

### 3. Auth 연결 후 RLS

Supabase Auth가 실제 사용자와 연결되고 `workspace_memberships`가 채워진 뒤 아래 정책 파일을 적용한다.

```text
supabase/policies/supabase_first_rls.sql
```

중요:

- Hub/Engine 서버 쓰기는 `SUPABASE_SERVICE_ROLE_KEY`를 사용한다.
- 브라우저 직접 접근은 authenticated user + RLS를 사용한다.
- RLS를 켠 뒤 anon key만으로 서버 write를 기대하면 막힌다.

## Engine / Hub 경계

Engine은 외부 입력을 받고 정규화하고 기록한다.

```text
Telegram / GitHub / Notion / Calendar / Webhook
  -> Engine
  -> webhook_events / sync_runs
  -> projects / tasks / project_updates
```

Hub는 상태를 읽고 사람이 판단하게 한다.

```text
Supabase ledger
  -> Hub dashboard
  -> operator decision
  -> Engine dispatch
  -> ledger update
```

Hub가 provider별 실행 세부사항을 소유하지 않고, Engine이 UI/정보구조를 소유하지 않는 것이 기준이다.

## P0 바인딩 순서

앱 코드는 아래 순서로 mock data에서 live data로 옮긴다.

1. `projects`, `tasks`, `project_updates`를 Work OS에 연결
2. `brands`를 Projects 좌측 브랜드 레일에 연결
3. `routine_checks`, `decisions`, `notes`를 프로젝트 상세 drawer에 연결
4. `automation_runs`, `webhook_events`, `error_logs`를 Automations/Evolution에 연결
5. `content_items`, `content_variants`, `publish_logs`를 Content Queue/Studio에 연결
6. `leads`, `deals`, `customer_accounts`, `operation_cases`를 Revenue에 연결

## 다음에 추가할 수 있는 테이블

P0에는 넣지 않고, 실제 필요가 생기면 추가한다.

```text
resources
  프로젝트/노트/콘텐츠/딜에 붙는 공통 파일/링크/참조 자산

project_relations
  프로젝트 간 dependency, parent/child, related project 표현

external_refs
  Notion page, GitHub issue, Calendar event 같은 외부 객체 참조를 통합 저장
```

지금은 `meta jsonb`, `provider_event_id`, `correlation_id`로 충분히 버틸 수 있다.
