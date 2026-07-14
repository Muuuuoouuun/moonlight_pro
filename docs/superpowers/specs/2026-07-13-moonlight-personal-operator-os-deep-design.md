# Moonlight 개인 운영 OS 심화 설계

> 상태: ACTIVE — 전제 1~7·접근안 B 승인, Phase 0 완료, Phase 1A 진행 중
> 작성일: 2026-07-13
> 최초 작성 브랜치: `real_v1.1`
> 모드: Builder / 개인 전용 운영 시스템
> 근거: 운영자 인터뷰 Q1-Q115, 현재 Moonlight 코드·Supabase 원장, `classinkr-web` Neo CRM 구조, 기존 디자인 문서
> 심화·대체: `bigmac_moon-real_v1.1-design-20260711-180548.md`의 Capture–Attention–Done 설계
> 함께 유지: `bigmac_moon-real_v1.1-design-20260712-215411.md`의 승인 기반 자율화 로드맵

제품 전제 1~7과 접근안 B, **Phase 0·1A·1B·1C 방향은 승인됐다.** Phase 0는 `5c9ccc2` (`codex/moonlight-phase0-trust`)에서 완료·푸시됐다. Phase 2 이후, ClassIn Bridge, 음성, 콘텐츠 파생, 분기 리뷰는 전체 방향을 잃지 않기 위한 비구속적 로드맵이며 해당 Phase 착수 전에 별도 계약을 승인한다.

## 1. 한 줄 정의

Moonlight는 여러 업무 도구를 한 화면에 모은 대시보드가 아니다.

**운영자 문준혁이 고객·할 일·프로젝트·일정·콘텐츠에서 놓칠 다음 행동을 0건으로 만들고, 무엇을 해야 할지 판단하는 인지 에너지를 현재의 1/3로 줄이는 개인 운영체제**다.

핵심 루프는 다음 하나다.

```text
빠른 입력
  -> 실제 원장에 저장
  -> 고객·프로젝트·일정 문맥에 연결
  -> 지금 필요한 다음 행동으로 승격
  -> 실행과 최소 결과 기록
  -> 다음 행동 또는 완료
  -> 월간·분기 리뷰
```

CRM, PMS, 콘텐츠, 캘린더, AI는 이 루프의 서로 다른 입력·문맥·실행 레인이다. 각각이 별도의 홈 화면이 되어서는 안 된다.

## 2. 성공 기준

### 운영 결과

1. 고객 연락과 프로젝트 후속 조치 누락 0건.
2. 첫 화면을 연 뒤 5초 안에 가장 중요한 행동을 이해한다.
3. 떠오른 일이나 메모를 10초 안에 실제 저장한다.
4. 일반적인 영업 연락 완료 후 20초 안에 요약·반응·다음 날짜를 남긴다.
5. 새로고침해도 생성·수정·완료 결과가 그대로 남는다.
6. 시스템 장애나 미설정 상태에서 예시 데이터를 실제 데이터처럼 보여주지 않는다.

### 제품 결과

- 첫 화면: 긴급 KA 최대 1건, 집중 고객 3~5건, 오늘 일정과 필수 할 일.
- 고객: 사람을 중심으로 조직·거래·활동·다음 행동을 한 흐름에서 본다.
- 프로젝트: 지연·병목·다음 행동·체크리스트를 우선하고, 활동량이 커진 일을 프로젝트 후보로 추천한다.
- 콘텐츠: 복잡한 점수 없이 원문 아이디어를 한곳에 모으고, 제작할 때 채널별 결과물로 확장한다.
- ClassIn: 최초 이관 뒤 Moonlight가 개인 운영 정본이 되며, ClassIn에는 공식 요약만 안전하게 보낸다.

## 3. 현재 상태에서 확인된 사실

2026-07-13 기준 코드와 연결 상태를 읽기 전용으로 확인했다.

### 이미 가진 자산

- Daily Brief는 프로젝트, 업무, 콘텐츠, 매출, 자동화, 승인 큐를 병렬 조립한다.
- Revenue는 회사·연락처·리드·딜·고객 계정과 일부 CRUD를 이미 가진다.
- Follow-up 엔진은 정체된 리드·딜과 최근 결과를 이용해 연락 우선순위를 계산한다.
- Projects는 프로젝트, 할 일, 업데이트, 결정, 메모, 루틴 체크를 읽고 보드와 상세 화면을 만든다.
- Content는 `content_items`, `content_variants`, 자산, 발행 기록, Studio autosave를 가진다.
- Google Calendar OAuth와 이벤트 읽기·생성·수정 코드가 있다.
- `work_orders`와 `agent_runs`는 제안 → 승인 → 실행 → 결과 기록의 기반을 가진다.
- Supabase에는 실제 프로젝트·할 일·고객·리드·딜·콘텐츠·승인 큐 데이터가 존재한다.

### Phase 0 착수 전에 확인된 결손

1. Projects의 프로젝트·할 일 생성과 완료가 주로 React 로컬 상태라 새로고침하면 사라진다.
2. Daily Brief는 실제 Follow-up과 Google Calendar를 읽지 않고, 일부 시간 블록을 임의 시간으로 만든다.
3. live 데이터가 비어 있거나 fetch가 실패했을 때 mock 업무를 섞어 보여주는 화면이 있다.
4. 고객 데이터는 workspace 전체를 읽으며, `owner_id`가 있으면 실제 담당자와 무관하게 `Me`로 표시한다.
5. 고객 화면은 조직 중심·이메일 중심인데, 실제 운영은 사람 중심·메시지/전화 중심이다.
6. 연락 완료 시 `요약 / 반응 / 다음 행동과 날짜`를 강제하지 않는다.
7. Content 저장소는 `blog`, `social_post` 별칭을 만들지만 DB는 `blog_insight`, `x_thread`를 허용해 live 저장이 실패할 수 있다.
8. Calendar가 연결되지 않았을 때 사라지는 로컬 예시 일정을 만들 수 있다.
9. ClassIn snapshot 테이블과 실제 import/outbox/conflict UI는 아직 없다.
10. 음성 녹음·업로드·전사·30일 원본 삭제·비용 집계 기반은 없다.

### Phase 0 착수 전 품질 기준선

- `npm run typecheck`: 통과.
- `npm run build`: 통과.
- `npm test`: 12개 중 9개 통과, 3개 실패.
- 실패 3개는 모두 Content variant 저장소와 DB 계약 불일치 1건에서 파생된다.

이 기준선은 Phase 0 우선순위의 근거로 보존한다.

### Phase 0 완료 기준선

- 커밋: `5c9ccc2` (`codex/moonlight-phase0-trust`)
- Content variant canonical contract와 DB 계약 일치.
- write 응답의 `preview` / `degraded` / `failed` / `saved` 분리.
- live-empty와 fetch failure에서 업무 fixture를 섞는 경로 제거.
- 사용자 identity를 `Junhyuk Mun`으로 정리.
- Content draft 승인과 destination insert를 단일 RPC transaction으로 원자화.
- 검증: Node test 50/50, contracts, typecheck, Hub build, Engine build 통과.

위 결손 중 local-only task, 실제 Follow-up·Calendar 집계, owner scope, 연락 결과 강제, ClassIn bridge, 음성 기반은 Phase 1 이후 범위로 남아 있다.

## 4. 제품 전제

아래 전제는 운영자가 승인한 현재 제품 조건이다. 변경 시 이 문서와 운영자 프로필을 함께 갱신한다.

1. **핵심 제품은 통합 CRM이 아니라 다음 행동 기억 장치다.** 고객·프로젝트·콘텐츠 원장을 많이 만드는 것보다, 놓친 일을 정확히 올리고 실제 저장하는 것이 먼저다.
2. **초기 이관 뒤 Moonlight가 개인 업무 정본이다.** ClassIn은 회사 공식 객체와 공식 활동 요약의 정본이며, Moonlight의 개인 상세 메모를 소유하지 않는다.
3. **기존 원장을 재사용한다.** tasks, leads, deals, projects, content_items, work_orders를 새 만능 테이블로 옮기지 않고 공통 Attention read model로 조립한다.
4. **자동화는 기록·추천·초안 생성까지 적극 허용한다.** 고객 메시지 발송, 공식 거래 변경, 결제, 삭제는 별도 승인이 있기 전까지 확인 단계를 유지한다.
5. **사람이 고객의 기본 단위다.** 사람은 조직에 연결되고, 문의·재문의마다 새 Opportunity를 만든다. 현재 드문 다중 담당자·동시 거래도 데이터 구조상 막지는 않는다.
6. **1차 구현은 하나의 durable loop만 완성한다.** 빠른 텍스트 입력 → 실제 할 일 저장 → Today 승격 → 완료와 최소 결과 기록 → 재조회까지다.
7. **ClassIn 대규모 동기화, 음성 AI, 70/30 자동 진척률, 전체 콘텐츠 발행 자동화는 1차 구현 범위가 아니다.** 이 기반을 막지 않는 스키마·UI 자리만 남긴다.

## 5. 접근안 비교

### 접근안 A — 화면별 빠른 봉합

현재 Daily Brief, Projects, Revenue, Content 화면에 빠진 버튼과 POST/PATCH를 각각 붙인다.

- 규모: S
- 위험: 중간
- 완성도: 5/10
- 장점:
  - 눈에 보이는 개선이 가장 빠르다.
  - 기존 파일 수정을 최소화한다.
- 단점:
  - 화면마다 우선순위와 상태 의미가 달라진다.
  - 고객 후속, 할 일, 프로젝트 지연이 계속 별도 규칙으로 남는다.
  - 다시 “기능은 많은데 무엇부터 할지 모르는” 상태가 된다.
- 재사용: 현재 페이지 local state, 개별 API, 기존 카드 UI.

### 접근안 B — 기존 원장 기반 Personal Operating Spine (선택됨)

기존 원장은 그대로 두고, 실제 쓰기 계약과 공통 Attention read model을 먼저 닫는다. 홈은 Action Desk가 되고, 각 도메인은 상세 문맥과 실행 화면이 된다.

- 규모: M
- 위험: 낮음~중간
- 완성도: 9/10
- 장점:
  - 기존 코드와 실제 데이터를 가장 많이 재사용한다.
  - “저장 → 우선순위 → 실행 → 결과 → 다음 행동”을 한 계약으로 테스트할 수 있다.
  - CRM/PMS/콘텐츠/캘린더가 추가되어도 홈을 다시 만들 필요가 없다.
  - ClassIn은 경계 API와 outbox로 분리되어 개인 원장을 오염시키지 않는다.
- 단점:
  - 첫 UI 변화 전에 Content 계약과 durable task write를 먼저 고쳐야 한다.
  - owner scope와 honest state를 명확히 하지 않으면 잘못된 고객을 추천할 위험이 있다.
- 재사용: Daily Brief 조립, Follow-up 엔진, tasks/projects 원장, revenue CRUD, Content Studio, Google Calendar, work_orders.

### 접근안 C — 단일 Work Graph 재설계

고객, 거래, 프로젝트, 콘텐츠, 일정, 할 일을 하나의 새 그래프/업무 객체로 통합한다.

- 규모: XL
- 위험: 높음
- 완성도: 7/10
- 장점:
  - 장기적으로 객체 연결이 우아해질 수 있다.
  - 복합 검색과 자동화에 유리할 수 있다.
- 단점:
  - 이미 작동하는 원장을 다시 이관해야 한다.
  - ClassIn과 Moonlight 양쪽의 식별자·상태·이력을 동시에 마이그레이션해야 한다.
  - 현재 목표 대비 과도하며 실제 업무를 잃을 가능성이 가장 크다.
- 재사용: 제한적. 대부분 adapter 또는 migration이 필요하다.

### 권장

**접근안 B를 선택한다.**

화면은 접근안 B의 Action Desk를 사용하고, 입력 경험은 접근안 C가 아니라 Inbox-first 방식의 장점인 **범용 Quick Capture drawer**만 차용한다.

## 6. 권장 정보 구조

### 최상위 내비게이션

```text
Today
Customers
Projects
Content
Calendar
More
  - Sync & Review
  - Automations
  - System / Settings
```

- `Today`는 첫 화면이며 전체 업무의 다음 행동을 조립한다.
- `Customers`는 Revenue/Follow-up/Accounts의 개인 영업 작업대다.
- `Projects`는 영업, 마케팅, 콘텐츠, IT, AI 개발, 개인 프로젝트를 모두 담는다.
- `Content`는 아이디어함과 제작 작업대다.
- `Calendar`는 agenda와 일정 편집을 담당한다.
- 데이터 소스 상태, 동기화, 자동화, 설정은 첫 화면의 주인공이 아니다.

현재 ClassIn/개인 브랜드 workspace 구분은 데이터 필터와 badge로 남기되, 운영자의 전체 할 일을 갈라놓는 별도 홈으로 만들지 않는다.

## 7. 첫 화면: Action Desk

### 첫 fold 순서

1. **Quick Capture** 한 줄 입력.
2. **긴급 KA** 최대 1건.
3. **집중 고객** 최대 3~5건.
4. **오늘 일정과 필수 체크리스트**.
5. 접힌 보조 pulse: 매출, 프로젝트 추천·리뷰, 콘텐츠 목표.

### 각 행동 행의 최소 정보

- 고객 또는 대상 이름.
- 조직/프로젝트 badge.
- 지금 올린 이유.
- 정확한 다음 행동.
- 기한 또는 `기약 없음`.
- 최근 활동 한 줄.
- 보조 정보: 거래 단계, 예상 금액, 중요도.

### 상세 정보의 원칙

- 숫자 점수를 첫 화면에 노출하지 않는다.
- `왜 지금?`을 사람이 이해할 수 있는 문장으로 보여준다.
- 항목 클릭은 공통 `EditDrawer` 또는 해당 실행 화면으로 연결한다.
- 일반 할 일은 체크리스트/완료 sheet로, 콘텐츠는 Studio로, 데이터 입력은 입력 화면으로 바로 간다.

### Attention lane

전체 항목은 내부적으로 다음 lane 중 하나만 가진다.

| Lane | 의미 | 예시 |
|---|---|---|
| `missed` | 이미 약속·기한·실행이 지남 | 지난 연락 약속, 실패한 저장, overdue task |
| `today` | 오늘 실행해야 함 | 오늘 일정, 오늘 task, 승인 후 실행 대기 |
| `waiting` | 타인·외부 일정·snooze 대기 | 고객 회신 대기, 차주 재연락, blocked task |
| `inbox` | 아직 분류·결정되지 않음 | 빠른 메모, 신규 문의, 프로젝트 후보 |

홈은 이 전체 lane을 그대로 카드 네 묶음으로 펼치지 않는다. 우선순위 계산 후 긴급 1 + 집중 3~5만 보여주고, 나머지는 필터로 들어간다.

도메인의 원래 상태와 Attention lane은 별개다. 한 source record가 여러 조건에 해당하면 아래 precedence로 lane 하나만 고른다.

```text
1. terminal(done/executed/dismissed/cancelled/completed) -> Attention 제외
2. active snooze(snooze_until > now) -> waiting
3. write/execution failure 또는 overdue promise/task -> missed
4. blocked, waiting_on, 실행 중 -> waiting
5. 오늘 due, doing task, 오늘 scheduled calendar -> today
6. inbox task, proposed work order, 분류 전 capture -> inbox
7. 그 외 -> Attention 제외
```

- overdue이면서 waiting_on이면 `missed`가 우선한다. 단 운영자가 명시적으로 미래까지 snooze한 경우에만 `waiting`이 우선한다.
- rescheduled event는 기존 event를 Attention에서 제외하고 새 event만 `scheduled`로 계산한다.
- cancelled/no-show event는 자동 완료하지 않는다. cancelled는 후속 task 후보, no-show는 `missed` 고객 행동 후보를 만든다.

### Phase 1 AttentionItem 계약

```ts
type AttentionItem = {
  key: string;                 // `${sourceType}:${sourceId}`
  sourceType: "task" | "followup" | "calendar" | "work_order";
  sourceId: string;
  workspaceId: string;
  ownerScope: "verified" | "unverified" | "not_applicable";
  entityType: "customer" | "project" | "content" | "general";
  entityId: string | null;
  lane: "missed" | "today" | "waiting" | "inbox";
  priorityBand: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  reasonCodes: Array<
    | "write_failed"
    | "promise_overdue"
    | "timed_due_passed"
    | "today_calendar"
    | "critical_overdue"
    | "late_stage_stale"
    | "followup_stale"
    | "today_task"
    | "inbox_untriaged"
  >;
  title: string;
  reason: string;
  nextAction: string;
  dueAt: string | null;
  duePrecision: "timed" | "date" | "none";
  lastActivityAt: string | null;
  importance: "critical" | "important" | "normal";
  manualPriority: "raised" | "default" | "lowered";
  ka: boolean;
  focusSignalCount: number;
  opportunityStage: string | null;
  amount: number | null;
  destination: { page: string; query: Record<string, string> };
};
```

Phase 1 source mapping:

| Source | `entityType` | due | destination |
|---|---|---|---|
| task | customer link가 있으면 customer, 아니면 project/general | `tasks.due_at` | Projects 또는 task drawer |
| followup lead/deal | customer | 계산된 다음 연락 기준일 | 정확한 lead/deal deep link |
| Google Calendar event | customer link가 있으면 customer, 아니면 general | event start | Calendar event drawer |
| work order | kind에 따라 customer/content/general | approved면 오늘, proposed면 null | 승인 큐 또는 대상 drawer |

source record를 먼저 `updated_at LIMIT N`으로 자른 뒤 overdue를 계산하지 않는다. 각 source에서 inclusion predicate를 적용한 결과를 가져온 뒤 공통 정렬을 적용한다.

### 슬롯 배정

전체 정렬 후 타입별 cap을 억지로 적용하지 않는다. 먼저 중복 없는 pool을 만들고 각 pool 안에서 정렬한다.

1. `urgentKa`: `entityType=customer && ka && lane in (missed,today)`, 최대 1.
2. `focusCustomers`: customer이며 `manualPriority=raised` 또는 집중 신호가 있고 urgent와 중복되지 않음, 최대 5.
3. `todayTasks`: customer pool에 들어가지 않은 missed/today task, 기본 3, 최대 5.
4. `todayAgenda`: customer 여부와 무관한 오늘 Calendar event, 최대 5.
5. `inboxItems`: 분류 전 Quick Capture와 proposed work order, 최대 5.
6. `otherActionable`: 위 pool에 들지 않은 missed/today 항목의 안전 fallback, 최대 5.
7. `supportPulses`: revenue/project/content count와 review 후보. 행동 row가 아니라 접힌 요약.

고객과 연결된 task는 urgent/focus customer pool에 들어가면 한 번만 보인다. KA·focus 조건에 들지 않은 고객 task는 `todayTasks` 또는 `otherActionable`에 남는다. 모든 actionable item은 정확히 한 pool에 들어가며 cap 밖의 항목은 `모두 보기` count에 포함한다.

### 초기 결정 규칙

초기에는 AI 점수보다 설명 가능한 규칙을 사용한다.

```text
1. 저장·실행 실패 또는 기한이 지난 고객 약속
2. 오늘 확정된 고객 일정
3. 핵심 프로젝트 또는 KA 고객의 하루 지연
4. 견적·최종 미팅 등 거래 종료에 가까운 다음 행동
5. 다음 연락 날짜가 지난 집중 고객
6. 일반 due task와 프로젝트 지연
7. 콘텐츠 하루 1개 목표 또는 일반 아이디어
```

동률일 때는 다음 순서다.

```text
수동 집중도 높임
-> KA 여부
-> 거래 단계
-> 기한
-> 마지막 활동이 오래된 순
-> 안정적인 ID 순
```

결정론적 비교값은 다음과 같다.

| 조건 | 판정 |
|---|---|
| 시간 지정 기한 지남 | `duePrecision=timed && dueAt < now` |
| 날짜형 기한 지남 | `duePrecision=date && dueAt < 오늘 00:00`로 정규화된 다음 날 경계가 지남 |
| 오늘 일정·task | `[오늘 00:00, 내일 00:00)` |
| 거래 종료 근접 | Opportunity stage가 `quote` 또는 `final_meeting` |
| 연락 지연 | source stage별 threshold를 넘었거나 명시한 next-contact date가 지남 |
| 마지막 활동 없음 | `lastActivityAt=null`은 동일 band 안에서 가장 오래된 것으로 취급 |
| due 없음 | overdue로 만들지 않음. 열린 고객이면 waiting/review 규칙으로 이동 |

공통 sort tuple:

```text
priorityBand ASC
manualPriority(raised,default,lowered)
importance(critical,important,normal)
dueAt ASC NULLS LAST
lastActivityAt ASC NULLS FIRST
sourceType ASC
sourceId ASC
```

`priorityBand` 고정값:

| band | 조건 |
|---:|---|
| 0 | persistence/execution failure, 명시한 고객 약속일 overdue |
| 1 | 오늘 KA 고객 일정·연락, 오늘 확정 Calendar event |
| 2 | critical task/project overdue 또는 blocked |
| 3 | `quote`/`final_meeting` Opportunity의 due/stale follow-up |
| 4 | stage threshold를 넘은 일반 follow-up |
| 5 | missed/today 일반 task |
| 6 | inbox/proposed item |

follow-up threshold는 기존 `STALE_DAYS`를 하나의 exported contract로 옮겨 `new=2`, `qualified=3`, `nurturing=4`, `proposal=3`, `negotiation=2`, 기본 3 calendar days로 시작한다. 집중 신호는 한 개 이상이면 focus candidate가 되며, 신호 수는 같은 band의 설명과 tie-break 보조값으로만 사용한다. AI 확률로 변환하지 않는다.

adapter는 band를 직접 임의 계산하지 않고 아래 stable reason code를 먼저 만든다.

| reason code | band | source |
|---|---:|---|
| `write_failed` | 0 | failed task/work order mutation |
| `promise_overdue` | 0 | explicit next-contact date |
| `timed_due_passed` | 0 또는 5 | customer promise면 0, 일반 task면 5 |
| `today_calendar` | 1 | Calendar |
| `critical_overdue` | 2 | critical task/project |
| `late_stage_stale` | 3 | quote/final meeting follow-up |
| `followup_stale` | 4 | lead/deal threshold |
| `today_task` | 5 | general task |
| `inbox_untriaged` | 6 | inbox work order |

한 item에 reason code가 여러 개면 가장 낮은 band를 사용하고 모든 code를 보존한다. UI `reason` 문장은 reason code와 source facts에서 만들며 자유 생성 AI 문장을 ranking 근거로 사용하지 않는다.

수동 조정은 `높임 / 기본 / 낮춤` 세 단계만 제공한다. Phase 1 고객 집중도는 active lead/deal의 `meta.focus_override`, 프로젝트 중요도는 `projects.priority`, 일반 task 우선순위는 `tasks.priority`가 소유한다. Person-first 전환 뒤에는 Contact가 기본값을 소유하고 active Opportunity가 override할 수 있다. AttentionItem은 source 값을 읽어 `manualPriority`로 투영하며 별도 score를 저장하지 않는다.

### 용량 제한

- 긴급 KA: 0~1.
- 집중 고객: 0~5.
- 오늘 필수 task: 기본 3, 최대 5.
- 그 외 항목은 count와 `모두 보기`로 접는다.

제한은 항목을 삭제하는 것이 아니라 첫 화면의 주의력을 보호하는 장치다.

## 8. Quick Capture

### V1 입력

- 한 줄 텍스트.
- 원문 붙여넣기.
- 선택 hint: 할 일 / 메모 / 고객 / 아이디어.
- 필수 필드 없이 raw로 먼저 저장 가능.

### Phase 1 canonical 동작

새 `captures` 만능 테이블을 만들지 않는다. 기존 원장을 우선 사용한다.

1. 기본 입력은 `정리 전`이며 existing `/api/hub/inbox`를 통해 `source=inbox`, `kind=capture`인 `work_order`에 원문을 보존한다.
2. 사용자가 `할 일` hint를 선택하면 `tasks`에 직접 durable create한다.
3. deterministic classifier가 확실히 task로 분류해도 UI에 분류 결과를 보여주고 task 경로를 사용한다.
4. 고객/DM/아이디어처럼 추가 확인이 필요하면 inbox work order 상태로 유지한다.
5. 저장 결과가 `saved` 또는 동일 idempotency key의 `duplicate`일 때만 입력창을 비운다.
6. `failed`, `degraded`, timeout이면 원문과 idempotency key를 유지하고 retry한다.

Phase 1의 write transport는 저장소의 Hub/Engine 경계를 따른다.

```text
Browser
  -> Hub BFF (/api/hub/**, session/origin/CSRF 검증)
  -> Engine write API (shared secret + workspace/actor 검증)
  -> Supabase RPC / native ledger
```

현재 `/api/hub/inbox`는 직접 write sink가 아니라 위 BFF로 전환한다. Hub는 Engine 응답의 `status`, durable ID, `correlationId`, `retryable`을 의미 변경 없이 전달하며, 실제 task/quick-capture/contact-outcome mutation과 transaction은 Engine이 소유한다.

Phase 1 최소 필드:

```ts
type QuickCaptureRequest = {
  raw: string;                     // trim 후 1..4000자
  hint: "inbox" | "task" | "note" | "customer" | "idea";
  idempotencyKey: string;          // client UUID, retry에서 재사용
  entityRef?: {                    // 고객 화면에서 시작한 capture만 명시
    type: "lead" | "deal" | "contact" | "company";
    id: string;
  } | null;
};
```

- task 경로는 `title=raw`로 시작하고 due/project는 선택 편집한다.
- 고객과 연결된 task는 V1에서 `tasks.meta.entity_ref`에 위 `{type,id}`를 저장한다. 자동 이름 매칭으로 고객을 붙이지 않으며, Phase 2 person-first migration 전까지 nullable FK를 선제 추가하지 않는다.
- inbox 경로는 `work_orders.body.raw`에 원문을 보존한다.
- 같은 workspace+idempotency key는 destination 종류와 무관하게 하나만 만든다.
- 새 raw-capture schema나 음성용 빈 UI는 실제 Phase가 오기 전에 만들지 않는다.

목적지 간 중복을 막기 위해 공통 `mutation_receipts`를 사용한다.

```text
mutation_receipts
  workspace_id
  idempotency_key
  request_hash
  operation            // quick_capture
  destination_type     // task | work_order
  destination_id
  status               // processing | completed | failed
  response jsonb
  created_at / updated_at
unique(workspace_id, idempotency_key)
```

`capture_quick_input_v1` RPC가 receipt claim과 task 또는 work_order insert를 한 transaction에서 처리한다.

이 RPC는 Engine write command가 호출한다. Hub BFF나 client component가 service-role/Supabase REST helper를 직접 호출하지 않는다.

- same key + same hash + completed는 저장된 응답을 반환한다.
- same key + different hash는 409 conflict.
- destination 선택은 최초 request에 고정되며 retry에서 바뀌지 않는다.
- transaction 실패는 receipt와 destination을 함께 rollback한다.

### 후속 입력

- 직접 음성 녹음.
- 음성 파일 업로드.
- 외부 전사 텍스트 파일.
- 모바일 공유 sheet와 링크 공유.

이 입력들은 같은 Quick Capture request envelope과 idempotency 규칙을 사용하되, 음성 storage adapter는 해당 Phase에서 별도로 결정한다. 음성이 추가되어도 홈 정보 구조는 바뀌지 않는다.

## 9. 고객·영업 모델

### 권장 객체 관계

```text
Contact (사람)
  -> Account (조직·학원·기관)
    -> Opportunity (문의·구매 시도)
      -> Activity (메시지·전화·미팅·행사·견적·오더)
        -> Task (다음 행동)
          -> Project (구조화된 실행이 필요할 때)
```

V1 cardinality와 식별 규칙:

- Contact는 0..1 Account에 연결한다. 예외적인 복수 소속은 V1에서 primary Account 하나와 메모로 처리한다.
- Account는 0..N Contact를 가진다.
- Contact 또는 Account는 시간에 따라 0..N Opportunity를 가진다. 동시에 active인 Opportunity는 기본 1개지만 DB 제약으로 막지 않는다.
- Opportunity는 0..N Activity와 0..N Task를 가진다.
- Opportunity는 0..1 active sales Project에 연결한다. Project는 0..N Task를 가진다.
- 외부 참조는 `(source_system, source_object, external_id)` unique로 저장한다.
- 동일 인물 판정은 external contact ID가 최우선이며, 없으면 정규화 전화번호, 마지막으로 `이름+조직`을 검토 후보로 사용한다. 불확실한 자동 병합은 금지한다.

### owner scope 검증

고객 Attention source는 아래 세 상태를 가진다.

```text
disabled   owner mapping 미설정
unverified mapping은 있으나 표본·미매핑 검증 전
verified   stable owner ID와 alias 검증 완료
```

`verified` 활성 조건:

1. Neo owner ID가 `3935704427463307`로 설정됨.
2. alias set에 `Mun Junhyuk`, `문준혁`, `EEO04186`, 숫자 owner ID가 들어 있음.
3. import row는 explicit external owner ID 또는 신뢰 가능한 local owner ID를 가짐.
4. 임의 표본 20건 또는 전체가 20건 미만이면 전건을 사람이 확인해 다른 담당 고객 0건.
5. 미매핑·중복 건수를 UI에 공개하고, 미매핑 row는 집중 고객 pool에서 제외.

`disabled/unverified`에서는 workspace 전체 고객을 `내 고객`으로 바꾸어 표시하지 않는다. Follow-up source는 `partial`로 표시하고 명시적으로 검증된 row만 노출한다.

Attention projection에서 owner config의 `disabled`와 `unverified`는 모두 `ownerScope="unverified"`로 표현한다. 차이는 source metadata의 `ownerVerificationState`로 보존한다. `disabled`는 고객 후보 전체를 비활성화하고, `unverified`는 명시적으로 검증된 row만 허용한다. `not_applicable`은 task/content/general처럼 고객 owner 범위가 적용되지 않는 source에만 사용한다.

### 사람 중심 상세 화면

상단:

- 이름.
- 조직 chip.
- 전화/메시지 quick action.
- KA 여부와 규모.
- 현재 집중도.
- 마지막 활동과 다음 행동.

중단:

- 현재 Opportunity.
- 공식 단계, 결제 상태, HW/SW와 수량.
- 캘린더 일정.
- 관련 프로젝트.

하단:

- 시간순 Activity timeline.
- 개인 상세 메모.
- ClassIn 전송 가능한 공식 요약 상태.

### 상태 정규화

한 필드에 영업 단계, 문의 유형, 결제, 종료 결과를 섞지 않는다.

| 축 | 초기 권장 어휘 |
|---|---|
| 문의 유형 | `new`, `repeat` |
| Opportunity 단계 | `potential`, `lead`, `qualified`, `consulting`, `demo`, `quote`, `final_meeting`, `closed` |
| 종료 결과 | `open`, `won`, `lost`, `on_hold` |
| 결제 상태 | `unpaid`, `partial`, `paid` |
| 품목 | `HW`, `SW`, 각 수량 |
| 관계 상태 | `active`, `waiting`, `dormant`, `closed` |

현재 DB stage와 즉시 교체하지 않는다. V1은 mapping helper와 `meta`를 이용해 호환하고, 실제 migration은 ClassIn 매핑과 운영 데이터를 확인한 뒤 고정한다.

### KA와 규모

- 초기 KA rule: 300명 이상.
- 학생·교사 수는 별도 필드로 보관하고, 합산/기준 방식은 추후 확정한다.
- rule 계산값과 운영자의 수동 override를 함께 보존한다.

### 집중 신호

- 자진 쇼룸 방문.
- 방문 데모 요청.
- 자세하고 빈도 높은 문의.
- 자기 학원에 맞춘 질문.
- 반복 행사 참석.
- 가격·견적 질문.

V1은 신호 횟수를 기록하고 `왜 집중 고객인가`를 설명한다. 자동 확률 예측은 하지 않는다.

## 10. 활동 완료와 다음 행동

### Activity 유형

```text
message
call
meeting
demo
showroom
event
quote
order
payment
note
```

### 연락 완료 sheet

전화·메시지·미팅 완료 시 최소 세 덩어리를 입력한다.

1. 대화 요약 한 줄.
2. 고객 반응: 긍정 / 중립 / 우려 / 거절 / 응답 없음.
3. 다음 행동과 날짜 또는 `기약 없음`.

열린 Opportunity인데 다음 행동이 없으면 저장 전에 경고한다. 사용자가 `기약 없음`을 명시하면 허용하고 한 달 뒤 review 대상으로 올린다.

### 연락 채널

기본 quick action은 다음 순서다.

```text
메시지 -> 전화 -> 미팅/일정 -> 이메일
```

이메일은 More 안에 둔다.

### 공식 기록과 개인 기록

한 Activity에서 두 projection을 만든다.

- private detail: 전체 미팅 내용, 개인 판단, 거친 표현, 원문.
- official summary: 고객, 날짜, 종류, 한 줄 요약, 결과, 다음 행동.

ClassIn에는 official summary만 전송한다.

### Phase 1C 연락 완료 원자성

연락 완료는 한 버튼에서 세 원장을 부분 성공시키면 안 된다.

```text
outreach outcome/activity insert
+ 현재 연락 task complete
+ 다음 task create 또는 unscheduled review 예약
```

이를 Supabase transaction/RPC `record_contact_outcome_v1`로 묶는다. RPC가 실패하면 세 변경 모두 rollback하고 UI는 입력값과 idempotency key를 보존한다. 동일 idempotency key 재시도는 기존 결과를 반환하며 outcome이나 다음 task를 중복 생성하지 않는다.

실제 learning ledger는 기존 `outreach_outcomes`다. Phase 1C migration에서 다음 nullable 컬럼을 추가한다.

```text
contact_id uuid -> contacts
task_id uuid -> tasks
activity_type text
reaction text
summary text
next_action text
next_due_at timestamptz
review_due_at timestamptz
idempotency_key text
meta jsonb default {}
```

제약:

- `(workspace_id, idempotency_key)` partial unique where key is not null.
- `activity_type`은 Phase 1C 다섯 유형만 허용.
- `reaction`은 request의 다섯 값만 허용.
- 기존 `action` funnel은 호환을 위해 유지하고 `no_response -> no_response`, meeting/demo/showroom -> meeting, positive/neutral/concern/rejected -> replied`로 투영한다. 부정 반응 하나로 Opportunity를 `lost` 처리하지 않는다. 이 자동 투영값은 영업 퍼널 집계용이며 원래 reaction을 대체하지 않는다.
- private/official 상세 분리는 `summary`와 `meta.private_note_ref`로 연결하고 ClassIn outbox에는 `summary/reaction/next_action`만 사용한다.

RPC는 `outreach_outcomes` insert를 learning record로, `activity_logs` insert를 상태 전이 audit로 사용한다. 별도 activity 만능 테이블을 Phase 1C에 만들지 않는다.

```ts
type RecordContactOutcomeRequest = {
  taskId: string | null;
  leadId: string | null;
  dealId: string | null;
  contactId: string | null;
  companyId: string | null;
  activityType: "message" | "call" | "meeting" | "demo" | "showroom";
  activityAt: string | null;   // 실제 활동 시각, null이면 RPC transaction_timestamp()
  summary: string;             // 1..500자
  reaction: "positive" | "neutral" | "concern" | "rejected" | "no_response";
  nextAction:
    | { type: "dated"; title: string; dueAt: string }
    | { type: "unscheduled"; title: string }
    | { type: "complete" };
  expectedTaskUpdatedAt: string | null;
  idempotencyKey: string;
};
```

- `dated`는 새 task를 만든다.
- RPC는 `activityAt`이 있으면 검증 후 `outreach_outcomes.occurred_at`에 사용하고, null이면 같은 transaction의 `transaction_timestamp()`를 `activity_at` 기준으로 사용한다.
- `unscheduled`는 `review_due_at = activity_at + 30 calendar days`를 저장하고 waiting lane으로 보낸다.
- `complete`는 열린 Opportunity가 없거나 거래를 닫는 경우에만 허용한다.
- stale task timestamp는 409 conflict이며 현재 task를 반환한다.

## 10.1 시간 계약

- 기준 timezone은 `workspaces.timezone`, 없거나 잘못됐으면 `Asia/Seoul`.
- `오늘`은 해당 timezone의 `[00:00, 다음 날 00:00)`.
- `duePrecision=timed`는 정확한 `dueAt`을 지난 순간부터 missed.
- `duePrecision=date`는 사용자가 고른 날짜를 local date로 보존하고, 그 날짜가 끝난 다음 날 00:00부터 missed. adapter는 비교용 `effectiveDueAt`을 다음 날 00:00으로 계산한다.
- `하루 지연`은 calendar day 1일. V1에서는 영업일 달력을 만들지 않는다.
- `중요` 프로젝트 임시 기준도 3 calendar days를 사용한다.
- `한 달 뒤` review는 30 calendar days.
- 14일 활동 규칙은 현재 시각부터 과거 14×24시간의 rolling window.

## 11. PMS 심화

### 공통 상태

```text
collected -> planning -> active -> waiting -> completed
paused / cancelled
```

분야별 세부 단계는 공통 상태 아래 보조 workflow로 둔다. V1에서 모든 분야의 세부 단계를 확정하지 않는다.

### 프로젝트 기본 정보

- 제목.
- 분야: 영업 / 마케팅 / 콘텐츠 / IT / AI 서드파티 / 개인.
- 목표 결과.
- 종료일 또는 `종료일 없음`.
- 중요도: 핵심 / 중요 / 일반.
- 다음 행동.
- 관련 고객·Opportunity.
- 병목: 고객 응답 / 내부 작업 / 의사결정 / 자료 부족 / 외부 일정.

### 후보 생성

아래 하나를 만족하면 프로젝트를 만들지 않고 `candidate`를 제안한다.

1. Opportunity 생성.
2. 구체적인 가격·견적 대화.
3. 같은 고객 또는 주제의 미팅 2회 이상.
4. 14일 안에 관련 활동 3회 이상.

후보는 다음을 보여준다.

- 무엇을 프로젝트로 묶을지.
- 추천 근거.
- 관련 고객·활동.
- 추천 종료일과 기본 checklist.
- `프로젝트 만들기 / 나중에 / 무시`.

후보 만료 규칙은 실제 사용 전까지 확정하지 않는다. `나중에`는 한 달 review에 다시 올리는 안전한 기본값을 사용한다.

### 진척과 위험

V1의 진척은 확인 가능한 데이터만 사용한다.

```text
checklist 완료율
milestone 완료 수
기한 경과
최근 활동 빈도
```

70% 정량 + 30% 고객 반응은 데이터가 쌓인 뒤 설명 가능한 보조 score로 추가한다. V1에서 빈 데이터를 숫자로 꾸미지 않는다.

위험 표시는 다음으로 시작한다.

- 핵심: 하루 지연부터 `위험`.
- 일반: 일주일 지연부터 `지연·관심 필요`.
- 중요: 임시로 3 calendar days 지연부터 `관심 필요`, 운영 후 확정.

### 월간 리뷰

각 프로젝트에 대해 다음을 한 화면에서 결정한다.

- 진행률.
- 마감 대비 지연 일수.
- 최근 활동 추세.
- 병목.
- 완료 가능성: 높음 / 보통 / 낮음.
- 다음 행동.
- 계속 / 보류 / 클로징.

분기 리뷰는 월간 데이터가 쌓인 뒤 프로젝트 클로징과 `기약 없음` 고객을 함께 다룬다.

### 재발과 새 프로젝트

- 새로운 Opportunity나 별개 목표면 새 프로젝트.
- 과거와 동일한 문제가 재발하면 기존 프로젝트를 reopen하고 재발 event를 추가.
- 새 프로젝트에는 이전 프로젝트 link를 남긴다.

## 12. Calendar

### 역할

Calendar는 별도 일정 앱이 아니라 Today와 고객 다음 행동의 시간 축이다.

### 고객 일정 생성

고객 화면에서 일정을 만들면 다음 제목을 기본값으로 넣는다.

```text
[조직명] 고객명 · 목적
```

연결 필드:

- Contact.
- Account.
- Opportunity.
- Project.
- Activity type.

Phase 1B의 Google Calendar 고객 연결은 event의 `extendedProperties.private`에 Moonlight stable reference를 기록한다.

```text
moonlight_workspace_id
moonlight_entity_type     // lead | deal | contact | company
moonlight_entity_id
moonlight_project_id      // optional
moonlight_activity_type   // optional
```

이 속성이 없는 기존·외부 생성 event는 `entityType=general`로만 투영한다. 제목, 참석자 이름, 전화번호로 고객을 추측해 연결하지 않는다. 별도 `calendar_event_links` 원장은 실제 다중 provider·재연결 요구가 생길 때만 검토한다.

상태:

```text
scheduled / rescheduled / cancelled / no_show / completed
```

완료 시 Activity sheet를 열고 요약·반응·다음 행동을 받는다.

### 연결되지 않은 상태

- OAuth가 없으면 `연결 필요` CTA를 보여준다.
- 로컬 예시 이벤트를 실제 일정처럼 만들지 않는다.
- 모바일은 7열 주간표보다 agenda를 기본으로 한다.

## 13. 콘텐츠

### V1 목표

하나의 아이디어함에 생각을 놓치지 않고 모은다.

최소 필드:

- 아이디어 원문.
- 참고 링크.
- 떠오른 이유.
- 추천 채널.

### 흐름

```text
idea -> selected -> creating -> refining -> ready -> published -> archived
```

이 상태는 Q116-Q120 답변 전까지 임시 설계다. 첫 구현은 `idea` 저장과 기존 Studio handoff만 확정한다.

### 원본과 파생

```text
Source Idea
  -> Threads variant
  -> Instagram variant
  -> YouTube Shorts variant
  -> clipped / rewritten child
```

하나의 원본을 여러 결과물로 재가공하되, 초기에는 복잡한 성과 분석과 자동 추천을 만들지 않는다.

### 우선순위

- 운영자의 직감.
- 지금 바로 만들 수 있는가.
- Threads 하루 1개 기본 목표.

숫자 rank를 핵심 결정 UI로 노출하지 않는다.

### 개인/회사 채널

- 개인: 더 강하고 편하며 러프한 톤.
- 회사: 기능 중심·포멀한 톤.
- 최종 채널은 운영자가 선택한다.
- 별도 승인자는 없다.

## 14. ClassIn / Neo CRM 동기화 경계

### 정본 분리

| 데이터 | 정본 |
|---|---|
| 개인 상세 메모·미팅 원문·개인 우선순위·프로젝트·콘텐츠 | Moonlight |
| 회사 공식 리드·고객/거래 식별자·견적·오더·최종 거래 | ClassIn |
| 계정·구독·잔액 등 본사 필드 | NEO/HQ |

### 담당자 식별

- Neo owner ID: `3935704427463307`.
- EEO: `EEO04186`.
- 표시명: `Mun Junhyuk (문준혁)`.
- 별칭: Junhyuk Mun, Mun Junhyuk, 문준혁, 준혁.

`admin_profiles.neo_owner_id`와 alias seed가 실제로 설정되어야 `내 고객` 범위를 신뢰할 수 있다.

### 보안 경계

Moonlight가 ClassIn Supabase나 NEO API를 직접 읽고 쓰지 않는다.

현재 ClassIn Admin API는 브라우저 관리자 세션과 same-origin 검증을 사용한다. 따라서 ClassIn에 좁은 Moonlight 전용 HMAC API를 추가한다.

```text
Moonlight
  -> HMAC integration API
ClassIn
  -> existing repositories / source links / write request approval queue
NEO
```

NEO credential과 ClassIn service-role key를 Moonlight에 저장하지 않는다.

이 Bridge는 Moonlight Phase 1의 완료 조건이 아닌 **별도 ClassIn 프로젝트**다. ClassIn repository 변경, migration, 배포, integration test가 선행되어야 한다.

HMAC envelope 방향:

```text
X-Moonlight-Key-Id
X-Moonlight-Timestamp
X-Moonlight-Nonce
X-Moonlight-Signature
```

canonical string:

```text
METHOD\nPATH_WITH_QUERY\nTIMESTAMP\nNONCE\nSHA256(BODY)
```

- HMAC-SHA256 hex signature를 constant-time compare한다.
- timestamp 허용 오차는 ±5분.
- nonce는 key별 10분 unique로 저장해 replay를 거부한다.
- current/previous key 두 개를 받아 무중단 rotation하고 previous key는 최대 7일 후 폐기한다.
- bootstrap 응답은 PII allowlist를 사용하며 원본 payload 전체를 반환하지 않는다.

### 최초 bootstrap

ClassIn 측 `GET /api/integrations/moonlight/bootstrap`이 문준혁 owner ID를 서버에서 고정하고 cursor 페이지를 반환한다.

초기 원천:

- 조직: `crm_neo_customer_snapshots`.
- 사람: `external_crm_records`의 contact.
- 리드: 담당자 alias로 필터한 `leads`.
- 할 일: `crm_tasks.owner_key`.
- 거래: `crm_deals.owner_key`.
- 활동: 이관 target 또는 owner가 연결된 `crm_customer_events`.

Moonlight는 ClassIn stable ID와 `source_updated_at`을 외부 참조로 저장하며 insert-only bootstrap을 수행한다.

### 수동 missing-only sync

`동기화` 버튼을 누르면 다음 결과를 보여준다.

```text
missing   Moonlight에 없는 새 ClassIn 기록
same      양쪽이 동일
conflict  같은 객체지만 값 또는 수정 시각이 다름
```

- missing만 기본 선택한다.
- conflict는 양쪽 값을 비교하고 사람이 선택한다.
- Moonlight 값을 자동 덮어쓰지 않는다.
- 활동은 append-only로 취급한다.

### Moonlight -> ClassIn outbox

초기 명령 순서:

1. `activity_summary`.
2. lead.
3. Deal Lite / Opportunity.
4. quote reference.
5. order reference.
6. final transaction.

공식 활동 payload는 다음만 포함한다.

- 고객.
- 날짜.
- 활동 종류.
- 한 줄 요약.
- 결과.
- 다음 행동.

outbox 상태:

```text
pending / leased / sent / retry_required / dead_letter
```

모든 명령은 idempotency key와 body hash를 사용한다. 같은 key+same hash는 이전 응답을 반환하고, same key+different hash는 409를 반환한다.

필수 제약:

- external link: `(source_system, source_object, external_id)` unique.
- ClassIn receipt: `(source_system, idempotency_key)` unique + body hash.
- activity: `(source_type, source_id)` partial unique.
- outbox lease는 `leased_until` 이후 회수 가능.
- retry는 1분, 5분, 30분, 2시간, 24시간 순서로 최대 5회. 이후 `dead_letter`이며 사람이 재시도 또는 폐기한다.
- mutable deal command는 ClassIn `updated_at` optimistic concurrency token을 요구한다.

ClassIn의 기존 `crm_write_requests` 승인 큐를 NEO 발행에 재사용한다.

### 1차 동기화 범위

안전한 첫 범위는 다음 세 가지다.

1. 문준혁 담당 Account+Contact bootstrap.
2. 수동 missing-only sync와 conflict 비교.
3. 공식 활동 요약 발행.

리드·딜·견적·오더 자동 발행은 이 기반 뒤에 붙인다.

## 15. 음성·미팅 분석

### 초기 기반

- Moonlight 직접 녹음.
- 음성 파일 upload.
- 외부 전사 텍스트 upload.
- 원본 audio 30일 보존 후 삭제.
- transcript와 summary는 지속 보관.

### 분석 결과

- 요약.
- 결정.
- 고객 우려.
- 관심 신호.
- 다음 행동.

### 실행 원칙

- 운영자가 `분석` 버튼을 눌러 실행한다.
- 결과는 제안이며 저장 전에 확인한다.
- 실패하면 transcript와 수동 메모는 보존한다.
- 월별 분석 횟수와 비용을 보인다.

V1에서는 storage·retention·cost ledger의 설계 자리만 확보한다. STT provider와 화자 구분은 별도 스펙으로 확정한다.

## 16. 상태·오류·신뢰 UX

모든 주요 read surface는 아래 상태를 구분한다.

| 상태 | 의미 | UI |
|---|---|---|
| `loading` | 읽는 중 | 높이가 고정된 skeleton |
| `live` | 실제 데이터 | live badge는 조용하게 표시 |
| `live-empty` | 연결됐지만 데이터 없음 | 다음 유용한 행동 CTA |
| `preview` | 설정 또는 연결 전 | setup CTA, 실제 업무 row 없음 |
| `partial` | 일부 source 실패 또는 stale | 빠진 source 이름과 retry |
| `error` | 핵심 요청 실패 | 오류 설명, 원문 보존, retry |

금지:

- fetch 실패를 mock으로 바꾸기.
- live-empty에 demo 업무 넣기.
- persistence 실패를 HTTP 202 preview로 성공처럼 표현하기.
- 화면 state만 바꾼 뒤 `완료` toast 띄우기.

Mutation 성공 어휘:

```text
saved / accepted / duplicate
```

Mutation 실패 어휘:

```text
failed / conflict / degraded
```

응답에는 필요한 경우 `retryable`, `correlationId`, durable record ID를 포함한다.

### Phase 1 Task API 계약

`POST /api/hub/tasks`

```json
{
  "title": "A학원 원장님 방문 데모 일정 확인",
  "dueAt": "2026-07-14T09:00:00+09:00",
  "duePrecision": "timed",
  "priority": "high",
  "projectId": null,
  "entityRef": { "type": "deal", "id": "deal-uuid" },
  "nextAction": "카카오톡으로 가능한 시간 2개 제안",
  "idempotencyKey": "client-generated-uuid"
}
```

- 신규 저장: `201 { "status":"saved", "task":{...}, "correlationId":"..." }`.
- 같은 workspace+key+same payload: `200 { "status":"duplicate", "task":{...} }`.
- 같은 key+different payload: `409 { "status":"conflict", "retryable":false }`.

`PATCH /api/hub/tasks/:id`

```json
{
  "patch": { "status": "done" },
  "expectedUpdatedAt": "2026-07-13T04:00:00.000Z"
}
```

- 성공: `200 saved`와 갱신된 task.
- stale timestamp: `409 conflict`와 현재 task.
- 허용 상태 전이: `inbox -> todo|done`, `todo -> doing|blocked|done`, `doing -> todo|blocked|done`, `blocked -> todo|doing|done`, `done -> todo`.

공통 오류:

| HTTP | status | 의미 |
|---|---|---|
| 400 | `failed` | validation |
| 401/403 | `failed` | 인증·권한 |
| 404 | `failed` | entity 없음 |
| 409 | `conflict` | stale write 또는 key 재사용 충돌 |
| 503 | `degraded` | Supabase 미설정/쓰기 불가 |
| 504 | `failed` | upstream timeout, retryable |

task에는 nullable `idempotency_key`를 추가하고 `(workspace_id, idempotency_key)` partial unique index를 둔다. `updated_at`을 optimistic concurrency token으로 사용한다.

Phase 1의 `entityRef`는 `tasks.meta.entity_ref`에 저장하고 read adapter가 검증된 stable ID만 투영한다. 잘못된 type, 다른 workspace의 ID, 존재하지 않는 ID는 Engine validation 또는 RPC에서 거부한다.

`duePrecision`은 `tasks.meta.due_precision`에 `timed | date | none`으로 저장한다. 시간 선택을 한 요청은 `timed`, 날짜만 선택한 요청은 `date`, due가 없으면 `none`이다. 기존 task는 시간이 현지 00:00이면 `date`, 그 외에는 `timed`로 한 번만 보수적으로 추론하고 UI에서 수정할 수 있게 한다.

### Phase 1 Aggregation 응답

```ts
type AttentionResponse = {
  status: "live" | "partial" | "preview" | "error";
  generatedAt: string;
  correlationId: string;
  sources: Array<{
    key: "tasks" | "followups" | "calendar" | "work_orders";
    state: "live" | "empty" | "preview" | "stale" | "error";
    lastSuccessAt: string | null;
    staleAfterMs: number | null;
    errorCode: string | null;
    retryable: boolean;
  }>;
  urgentKa: AttentionItem[];
  focusCustomers: AttentionItem[];
  todayTasks: AttentionItem[];
  todayAgenda: AttentionItem[];
  inboxItems: AttentionItem[];
  otherActionable: AttentionItem[];
  supportPulses: Array<{ key: string; count: number; destination: string }>;
};
```

- source들은 병렬로 읽고 source당 2초 timeout, 전체 조립 2.5초 budget을 사용한다.
- tasks가 실패하면 핵심 Action Desk는 `error`; tasks는 live이고 보조 source가 실패하면 `partial`.
- Calendar 미연결은 `preview`이며 전체 오류가 아니다.
- V1은 stale cache를 의사결정 row로 사용하지 않는다. 나중에 last-known cache를 쓰면 row와 source에 `stale`을 명시한다.
- 실패한 source의 item은 만들지 않으며 named source retry를 제공한다.
- 목표 성능은 server aggregation p95 2.5초 이하, actionable UI p95 3초 이하다.

## 17. 모바일·접근성

- 390×844에서 첫 actionable item과 Quick Capture가 보인다.
- 입력은 iOS zoom을 피하도록 모바일에서 16px 이상.
- 모든 touch target은 44×44px 이상.
- clickable div 대신 button/link 또는 keyboard role 계약을 사용한다.
- drawer, palette, dialog는 focus trap과 ESC close를 제공한다.
- save/error 피드백은 `aria-live` 또는 `role=alert`로 알린다.
- Calendar는 모바일 agenda, 표는 desktop 보조 view.
- `prefers-reduced-motion`을 유지한다.

시각 스타일은 기존 `DESIGN.md`의 Moonstone Command Deck를 그대로 따른다. UI/UX 패턴 검색에서 나온 generic portfolio, green, vibrant 권장은 제품과 충돌하므로 채택하지 않는다.

## 18. 자동화 권한 경계

| 행동 | 초기 자동화 |
|---|---|
| raw capture 저장 | 자동 가능 |
| task/프로젝트 후보 생성 | 자동 가능 |
| 다음 행동 추천 | 자동 가능 |
| 공식 활동 요약 outbox 생성 | 자동 가능 |
| AI 초안 작성 | 자동 가능 |
| 고객 메시지 발송 | 승인 필요 |
| ClassIn 거래 상태 변경 | 승인 필요 |
| NEO write request 실행 | ClassIn 승인 필요 |
| 결제·계약·삭제 | 명시적 승인 필요 |

## 19. 구현 단계

### Phase 0 — 신뢰 기준선 (완료: `5c9ccc2`)

1. [x] Content variant canonical contract를 DB와 repository에서 일치시킨다.
2. [x] Node test 50/50, contracts, typecheck, Hub/Engine build를 녹색으로 만든다.
3. [x] write response taxonomy에서 failed persistence와 preview를 분리한다.
4. [x] live-empty와 fetch failure에 mock 업무를 섞는 경로를 제거한다.
5. [x] 사용자 identity를 `Junhyuk Mun`으로 바로잡고 founder/multi-user demo 문구를 제거한다.
6. [x] Content draft 승인처럼 내부 Supabase sink를 가진 work order는 상태 전이와 destination insert를 RPC 한 transaction으로 묶는다. destination 저장 실패 뒤 `approved`/`executed`가 남는 경로를 허용하지 않는다.

### Phase 1A — Durable Task Loop

2026-07-15 구현 스냅샷: Projects의 project/task create·update·상태 변경과 홈의 한 줄 Quick Capture→`tasks.status=inbox`는 Hub BFF → Engine `pms/command` → Supabase 경계에서 live round-trip, same-ID duplicate, reload를 통과했다. 저장 실패 시 입력과 client UUID를 유지한다. 범용 inbox/work-order destination, task/inbox 공통 receipt, task-only Today가 없으므로 Phase 1A 완료로 표시하지 않는다.

```text
Quick text(task hint)
  -> durable task
  -> task-only Today
  -> complete
  -> reload
```

- Hub session BFF → Engine guarded task create/update/complete API → RPC와 idempotency.
- Projects의 local-only task 생성·완료를 API에 연결.
- Quick Capture의 task/inbox 두 destination.
- task source만으로 missed/today/waiting/inbox를 계산.
- persistence 실패 시 rollback이 아니라 서버 row 복구와 retry.
- task 및 inbox의 loading/live-empty/preview/error에서 mock 제거.
- 모바일·키보드·aria-live 완료.

이 단계만으로 독립 배포·검증 가능해야 한다.

### Phase 1B — Action Desk Aggregation

2026-07-15 구현 스냅샷: Daily Brief는 6개 live ledger와 PMS/content pulse를 읽고, 전체 Revenue 원장 119건을 유지하면서 exact-owner `Me` 16건 중 deterministic 상위 3건만 집중 고객 신호로 올린다. `Unassigned` 고객 신호는 0건이다. 정식 `AttentionItem` adapter, Calendar agenda source, source별 timeout/partial 응답은 아직 남아 있다.

- Phase 1 `AttentionItem` adapter와 결정론적 ranking helper.
- `getFollowups()`와 실제 Google Calendar agenda를 병렬 source로 추가.
- source 상태·timeout·partial response contract.
- 긴급 KA 1, 집중 고객 3~5, 일반 Today task slotting.
- 정확한 lead/deal/calendar/task deep link.
- Calendar 미연결 CTA와 가짜 일정 제거.
- owner scope `verified` 전에는 명시적으로 검증된 고객만 노출.

### Phase 1C — Contact Outcome Loop

```text
고객 행동 실행
  -> 요약·반응·다음 행동
  -> RPC transaction
  -> 현재 task 완료 + outcome/activity + 새 task/review
  -> reload
```

- 연락 완료 sheet.
- `record_contact_outcome_v1` transaction과 중복 방지.
- `기약 없음` 30일 review.
- no-show/cancel 후속 규칙.
- owner mapping 표본 검증과 집중 고객 활성화 gate.

### 비구속적 로드맵 — Phase 2 이후

아래 단계는 제품 방향이며 이번 승인·구현 계획의 계약이 아니다. 각 Phase 착수 전에 데이터와 실제 사용 결과로 별도 설계를 승인한다.

#### Phase 2 — Person-first Customer Continuity

- Contact 중심 detail drawer/page.
- Account, Opportunity, Activity, Task 연결.
- KA/규모, 집중 신호, manual focus override.
- 고객 일정 prefill과 Activity completion.
- 기존 companies/customer_accounts 중복 역할 정리.
- ClassIn 외부 참조 자리와 official summary projection.

#### Phase 3 — PMS

- durable project CRUD와 checklist·관계 편집. Task CRUD는 Phase 1A 자산을 재사용.
- 공통 상태와 중요도/병목.
- project candidate inbox와 근거.
- checklist progress와 delay rule.
- 월간 review.

#### Phase 4 — ClassIn Bridge

- ClassIn HMAC bootstrap API.
- Account+Contact 최초 이관.
- missing-only sync와 conflict 비교.
- activity_summary outbox.
- 이후 lead/deal/quote/order 순차 확장.

#### Phase 5 — Content Intake

- 단일 idea inbox.
- raw/link capture.
- existing Studio handoff.
- parent idea와 채널별 variant.
- Threads 하루 1개 목표.

#### Phase 6 — Audio and Review Automation

- audio upload/recording/transcript.
- 30일 retention.
- 수동 AI 분석과 검수.
- 비용 ledger.
- 분기 리뷰와 프로젝트 closing 후보.

## 20. Phase 1 완료 기준

### Phase 0 / 1A

1. 테스트, contract check, typecheck, build가 모두 통과한다.
2. Content `blog_insight`와 `x_thread` 저장이 live DB 계약과 일치한다.
3. Quick Capture로 만든 task가 새로고침 후 남는다.
4. task complete 후 재조회하면 Today에서 사라지거나 적절한 상태로 이동한다.
5. duplicate submit을 두 번 보내도 task 또는 inbox destination은 1개다.
6. persistence 실패 시 원문과 UI 상태가 유지되고 retry할 수 있다.
7. live-empty는 실제 empty state이며 demo 업무가 없다.

### Phase 1B

8. disconnected Calendar는 연결 CTA만 보여주며 가짜 이벤트를 만들지 않는다.
9. stale customer follow-up을 누르면 정확한 lead/deal로 이동한다.
10. owner mapping이 불완전하면 다른 담당 고객을 집중 고객으로 추천하지 않는다.
11. 한 source timeout은 2.5초 안에 named `partial` 응답을 만들고 다른 live source를 보존한다.
12. 동일 fixture는 항상 같은 slot과 sort order를 반환한다.

### Phase 1C

13. 고객 연락 완료는 요약·반응·다음 행동 또는 `기약 없음`을 남긴다.
14. outcome RPC 재시도를 두 번 보내도 outcome과 다음 task는 각각 1개다.
15. RPC 중간 실패를 주입하면 현재 task, outcome, 다음 task가 모두 원상태다.

### 공통 UX

16. 390×844에서 capture와 첫 행동이 첫 화면에 보인다.
17. 키보드만으로 capture, 상세 열기, 완료, retry를 수행할 수 있다.
18. actionable UI p95가 3초 이하고, source 장애 시 무한 spinner가 없다.

### 운영 지표와 계측

14일 실사용 기간에 아래 event를 `activity_logs` 또는 동등한 운영 event에 기록한다.

| 목표 | 시작 event | 종료 event | 실패 정의 |
|---|---|---|---|
| 5초 안에 첫 행동 이해·선택 | `action_desk_rendered` | `attention_item_opened` | 5초 초과 또는 이탈 |
| 10초 안에 capture 저장 | `quick_capture_focused` | `quick_capture_saved` | 10초 초과, 실패, 포기 |
| 20초 안에 연락 결과 저장 | `contact_outcome_opened` | `contact_outcome_saved` | 20초 초과, validation 포기 |
| 후속 누락 0 | 매일 `attention_audit_started` | overdue promise 전체와 surfaced key 비교 | source 원장에는 overdue인데 Attention에 없는 건 |

- 14일 동안 unsurfaced overdue promise 0건을 목표로 한다.
- 시간 목표는 최소 20회 표본의 median과 p90을 함께 본다.
- 제품 telemetry를 크게 만들지 않고 기존 activity log에 필요한 event만 append한다.

## 21. 지금 만들지 않는 것

- 별도 Daily Note 홈.
- 모든 업무를 새 만능 테이블로 이관.
- 완전 자동 양방향 ClassIn sync.
- 자동 conflict merge.
- 모든 프로젝트의 70/30 AI 점수.
- 자동 고객 메시지 발송.
- 직접 소셜 발행.
- 복잡한 콘텐츠 성과 분석.
- 모든 미팅 자동 STT.
- Obsidian 양방향 sync.
- 다중 사용자 SaaS 권한·과금.
- 미래 음성·동기화·콘텐츠 기능을 위한 빈 화면이나 선제 추상화. 현재 레코드에 필요한 `external_ref`와 `meta` 확장성만 허용한다.

## 22. 남은 질문과 하드 게이트

Phase 1을 막지 않는 질문은 구현 중 다시 묻지 않는다. 실제 사용 데이터가 생긴 뒤 Q116부터 5개씩 재개한다. 현재 승인은 Phase 0·1A·1B·1C에만 적용한다.

### 해결된 결정

- [x] 이 문서의 전제 1~7 승인.
- [x] 접근안 B 승인.

### 이후 Phase 전 확인

- ClassIn bootstrap 역사 범위와 PII allowlist.
- project candidate 만료·dismiss 규칙.
- 분야별 세부 단계.
- `중요` 프로젝트의 최종 지연 기준.
- STT provider, 화자 구분, 비용 경고선.
- 콘텐츠 입력·상태·직접 발행 경계.

## 23. 구현 파일 경계 초안

Phase 1 구현 계획에서 다음 파일을 우선 검토한다.

### 재사용·수정

- `apps/hub/app/api/hub/daily-brief/route.js`
- `apps/hub/components/hub/pages/daily-brief.jsx`
- `apps/hub/components/hub/pages/projects.jsx`
- `apps/hub/components/hub/pages/followups.jsx`
- `apps/hub/lib/repositories/operating-ledger.js`
- `apps/hub/lib/repositories/followups-ledger.js`
- `apps/hub/lib/repositories/content-ledger.js`
- `apps/hub/lib/google-calendar.js`
- `apps/hub/lib/hub-write-guard.js`
- `apps/hub/lib/server-write.js`

위 Hub write helper는 기존 경로 호환과 BFF transport에만 사용한다. 신규 Phase 1 domain mutation을 Hub repository에 추가하지 않는다.

### 신규 후보

- `apps/hub/app/api/hub/tasks/route.js`
- `apps/hub/app/api/hub/tasks/[id]/route.js`
- `apps/hub/lib/engine-write-client.js`
- `apps/hub/lib/repositories/attention-ledger.js`
- `apps/hub/lib/attention/rank-items.js`
- `apps/engine/app/api/tasks/route.ts`
- `apps/engine/app/api/tasks/[id]/route.ts`
- `apps/engine/app/api/intake/quick-capture/route.ts`
- `apps/engine/app/api/contact-outcomes/route.ts`
- `apps/engine/lib/commands/task-command.ts`
- `apps/engine/lib/commands/contact-outcome-command.ts`
- `supabase/migrations/<timestamp>_attention_task_outcome_contract.sql`
- `supabase/apply-pending.sql`에 같은 migration delivery 반영
- 해당 helper와 route의 `.test.mjs`

구체 경로와 함수 시그니처는 Phase 1A 구현 계획의 CEO → Design → Eng 검토에서 고정한다.

## 24. 실제 다음 행동

다음 작업은 질문을 더 이어가는 것이 아니라 **Phase 1A Durable Task Loop의 미완료 구간**을 닫는 것이다. 현재 Quick Capture task path를 재사용하고 범용 inbox destination, 공통 idempotency receipt, task-only Today를 추가한다.

```text
Quick text(task hint)
  -> durable task
  -> task-only Today
  -> complete
  -> reload 후 동일 상태 확인
```

Phase 1A 완료 뒤 현재 부분 작동 중인 Phase 1B를 정식 Attention adapter와 Calendar agenda 계약으로 완성한다. Q116 이후 질문은 운영자가 요청하거나 실사용 데이터가 생길 때까지 보류한다.

## 25. 이번 정리에서 관찰한 것

- “인지적 에너지 1/3, 후속 조치 놓친 것 0”이라고 성공 기준을 숫자로 말했다. 기능 수가 아니라 실패 비용으로 제품을 정의했다.
- “나만 사용할 것”과 “등록 가능한 것은 다 등록”을 함께 말했다. 그래서 개인 기록은 자유롭게 넓히고 외부 발행만 엄격히 분리하는 경계가 맞다.
- 고객 가능성을 막연한 확률보다 쇼룸 방문, 데모 요청, 자기 학원에 맞춘 질문 같은 행동으로 설명했다. 초기 우선순위는 AI 예측보다 관찰 가능한 근거가 맞다.
- 콘텐츠는 “하나로 여러 가지를 재생산”하되 지금은 복잡한 분석이 필요 없다고 선을 그었다. 원본-파생 구조는 준비하고 scoring은 미루는 것이 일관된다.

## 26. 검토 메모

세 개의 독립 read-only 검토가 같은 결론에 도달했다.

- 코드 재사용 검토: Durable Daily Loop가 가장 작은 일관된 Phase 1.
- ClassIn 검토: 직접 DB/NEO 접근이 아니라 ClassIn 전용 HMAC API + existing approval queue.
- UX 검토: Action Desk + Universal Capture가 적합하며, workspace lane 또는 inbox-only 홈은 목적과 어긋남.

가장 큰 잔여 우려는 owner scope다. 문준혁 담당자 mapping이 검증되기 전에는 `내 고객 전체`나 자동 집중 고객 추천을 live 기능으로 선언하면 안 된다.

독립 문서 검토는 3회를 수행했다.

- 1차: 7/10. Attention 계약, Quick Capture 목적지, 연락 완료 원자성, owner 검증, Phase 1 과대 범위를 발견.
- 2차: 8/10. fallback slot, cross-destination idempotency, 실제 outcome ledger, reason code, due precision을 발견.
- 3차: 9/10. `activity_at` 기준 시각 1건을 발견했고 최종 문서에 반영.
- 잔여 승인 blocker: 없음. 다음 구현 범위는 Phase 1A이며, 이후 Phase의 하드 게이트는 §22에서 별도로 확인한다.
