# 360 컨텍스트 스파인 — Sales OS

> 역할: 데일리 루프의 **오더(order)**가 항목 1건마다 `operating_context`(360 팩)를 조립할 때 따르는 단일 계약서. 어떤 소스를 어떤 키로 당겨, 어떤 슬라이스로 정규화하고, 빠지면 어떻게 기록하는지를 토씨까지 고정한다.

운영자: 문준혁 (ClassIn B2B 세일즈 — 학원·학교·기관에 ClassIn 도입 판매). CRM `ownerId = 3935704427463307`.

이 문서는 운영자가 말한 "자잘한 데이터 결합" 방법 전부다. 흩어진 소스(Supabase 레저·eeoCRM·시트·명함·소셜 수기·classin_home·classmoon 브랜드)를 항목 단위로 한 객체에 모으는 규약을 정의한다. 페르소나는 이 객체 전체를 받지 않는다 — **오더가 건별로 조립하고, 각 페르소나는 자기 슬라이스만 받는다.**

핵심 불변식:

- **정본 = Supabase ledger.** 다른 소스는 보강이거나 참고다. 시트 수기수정은 `lead_intake_raw` staging을 거쳐 *승격*되며 직접 upsert 금지.
- **루프는 소스 실패로 멈추지 않는다.** 어떤 소스가 비거나 깨져도 항목은 살아서 `missing[]`에 사유를 남기고 다음 단계로 간다.
- **필드명은 고정이다(논리 스키마).** 아래 스키마의 키를 토씨 하나 바꾸지 않는다. 페르소나 지침 파일이 이 키를 그대로 참조한다.
- **코드↔논리 매핑은 조립기 책임이다.** 레저 함수는 자기 모듈의 camelCase 반환값을 준다. 오더의 조립기가 §3 step8에서 이를 위 고정 논리 스키마(snake_case)로 정규화한다 — 키 불일치는 조립기 단계에서 닫고, 페르소나에는 항상 정규화된 키만 흘린다.

---

## 1. operating_context 360 스키마 (전체)

오더가 항목 1건마다 조립하는 객체. `item_type`은 `"deal" | "lead" | "content_slot"` 세 종류뿐이고, 타입에 따라 어떤 슬라이스가 채워지고 어떤 슬라이스가 `null`/빈 값인지가 갈린다.

```json
{
  "item_id": "string",
  "item_type": "deal | lead | content_slot",
  "entity": {
    "company": "string | null",
    "contact": "string | null",
    "lead_id": "string | null",
    "deal_id": "string | null",
    "stage": "string | null",
    "amount": "number | null",
    "owner_id": "3935704427463307"
  },
  "crm_facts": {
    "...eeoCRM 사실 객체...": "또는 null"
  },
  "ledger": {
    "recent_outcomes": [],
    "last_touch": "ISO8601 | null",
    "score": "number | null",
    "next_action_hint": "string | null"
  },
  "content": {
    "cadence_status": "string | null",
    "idea_queue_top": [],
    "recent_published": []
  },
  "social_signals": {
    "winners": [],
    "losers": []
  },
  "brand": {
    "voice": "classmoon",
    "rules": [],
    "forbidden": []
  },
  "missing": [
    { "source": "string", "reason": "string" }
  ]
}
```

### 1.1 필드별 의미

- **`item_id`** (string) — 항목의 안정 식별자. deal/lead는 해당 Supabase row id, `content_slot`은 케이던스 슬롯 키(예: 채널+ISO주차). 같은 항목은 루프 간에 같은 id를 유지해 outcome 추적이 닫힌다.

- **`item_type`** (`"deal" | "lead" | "content_slot"`) — 조립 분기의 기준. 오더는 이 값으로 어떤 소스를 당길지, 어떤 페르소나를 활성화할지 결정한다.
  - `deal` → entity·crm_facts·ledger 채움, content/social은 비움. 세일즈 페르소나 중심.
  - `lead` → entity·ledger 채움, crm_facts는 *고객으로 승격된 경우만* 조인. 세일즈 페르소나 중심.
  - `content_slot` → content·social_signals·brand 채움, entity/crm_facts는 비움(또는 슬롯이 특정 딜과 묶이면 entity 일부만). 콘텐츠·제작 페르소나 중심.

- **`entity`** — 항목의 신원. 필드는 고정:
  - `company` — 회사명(회사명 정규화 = 시트/명함 `match_key`의 입력).
  - `contact` — 담당자 이름.
  - `lead_id` / `deal_id` — Supabase `leads.id` / `deals.id`. 둘 중 하나는 항목 타입에 따라 null일 수 있다.
  - `stage` — 딜 파이프라인 단계 또는 리드 상태(new/qualified/nurturing/proposal/negotiation/won 등).
  - `amount` — 딜 금액(없으면 null).
  - `owner_id` — 항상 `3935704427463307`(문준혁). eeoCRM 조인의 필터 키.

- **`crm_facts`** — eeoCRM(Xiaoshouyi) 사실 객체 **또는 `null`**. null이면 그 자체로 결론이 아니라 `missing[]`에 사유가 함께 들어가야 한다(예: `{ source: "eeoCRM", reason: "리드가 아직 고객 account로 매칭 안 됨" }`). 내용은 eeoCRM `crm_account_360`이 돌려주는 사실 — account 상태, 최근 opportunity, ShroffAccount__c 서비스 계정 등. **API가 연결된 사실만 담고, 추정/보간 금지**(classmoon "정직한 경계").

- **`ledger`** — Supabase 레저에서 뽑은 운영 사실:
  - `recent_outcomes` — `outreach_outcomes`에서 이 항목(또는 같은 play 세그먼트) 최근 결과 배열. **논리 스키마상 각 원소 = `{lead_id, play, asset_id, action, at, note}`** (action 도메인: `sent | replied | meeting | proposal | won | lost | no_response`). 단 레저 함수 `getRecentOutcomes`는 이 모양을 직접 주지 않는다 — camelCase로 `{id, leadId, dealId, companyId, play, channel, action, note, occurredAt}`를 주며, `at`은 `occurredAt`에서 매핑하고 `asset_id`는 별도 소스에서 채운다. 코드→논리 매핑은 §3 step8에서 닫는다.
  - `last_touch` — 마지막 접촉 시각(ISO8601). 팔로업 정체 판정의 입력. 보통 가장 최근 outcome의 `occurredAt`을 정규화해 채운다.
  - `score` — `leads.score`(0 기본). 트리아지 우선순위 신호.
  - `next_action_hint` — `leads.next_action` 또는 팔로업 엔진이 계산한 제안. *힌트*일 뿐, 세일즈 페르소나가 확정하지 않으면 발송 행동이 아니다.

- **`content`** — 콘텐츠 엔진 슬라이스(`content_slot`일 때 핵심). 진입점은 단 하나, `getContentLedger()`다(아래 셋은 그 반환 객체의 슬라이스):
  - `cadence_status` — 이번 ISO 주차 발행 vs 목표 상태. `getContentLedger().cadence`(객체 `{ week, goal, published, remaining, behind, queueDepth, recentWeeks }`)에서 파생. 예: "이번 주 2/5 발행, behind".
  - `idea_queue_top` — rank 상위 아이디어 배열. `getContentLedger().ideaQueue`(이미 rank desc 정렬, status `idea` 한정, 상위 12개)에서 잘라 쓴다.
  - `recent_published` — 최근 발행물(status `published`) 배열. 중복 앵글 회피·연속성 판단용. `getContentLedger().publishLogs` 또는 `items`(status `published`)에서 파생.

- **`social_signals`** — 소셜 인게이지먼트 신호. **v1은 수기 입력**(인스타/스레드 API 미연결):
  - `winners` — 반응 좋았던 글 (The Assignment: 3개).
  - `losers` — 반응 안 좋았던 글 (The Assignment: 2개).
  - 수기 노트만 있고 분해 안 된 경우 `{ manual_note: "..." }` 형태로 대체 가능(스키마상 winners/losers가 비고 manual_note가 채워짐).

- **`brand`** — classmoon 가드레일(전 콘텐츠/세일즈 출력에 주입):
  - `voice` — 항상 `"classmoon"`.
  - `rules` — 사례·가치 우선, 교육현장 존중, 정직한 경계 등.
  - `forbidden` — 과장된 성과·보장·단정 표현, 제품홍보만, 현장 없는 조언, default SaaS 과장 톤(혁신적·차세대·시너지 등).

- **`missing`** — `[{ source, reason }]`. **실패한 소스의 명부.** 빈 소스든 깨진 호출이든 여기 한 줄 남기고 루프는 멈추지 않는다. 페르소나는 이 배열을 읽고 "이 슬라이스는 신뢰 불가"를 인지한다.

---

## 2. 소스 레지스트리

모든 소스를 한 행씩. "조인 키"는 항목 entity에서 각 소스로 들어가는 정확한 키다. **진입점(함수)은 실제 export 면만 적는다** — 모듈 밖에서 호출 불가능한 내부 함수는 진입점으로 쓰지 않는다.

| 소스 | 접근 방법 (실제 export 진입점) | 조인 키 | 신선도 | 실패 처리 | 소비 페르소나 |
|------|-----------|---------|--------|-----------|----------------|
| **Supabase 레저 — leads** | Hub read API (`lib/repositories/*`, `server-read`) | `lead_id` (= `leads.id`) · `contact_id` (= `leads.contact_id`) · `company` (= `companies.name`) | 실시간(정본) | 행 없음 → `missing:{source:"leads", reason}` + entity는 입력값 유지, 루프 계속 | 세일즈, 오더 |
| **Supabase 레저 — deals** | Hub read API (`server-read`) | `deal_id` (= `deals.id`), `company_id` 조인 | 실시간(정본) | 행 없음 → `missing:{source:"deals"}`, stage/amount = null | 세일즈, 오더 |
| **Supabase 레저 — contacts / companies** | Hub read API | `contact_id` · `company_id` · `match_key`(companies) | 실시간(정본) | 미해결 → entity.company/contact 부분 채움 + `missing` | 세일즈, 오더 |
| **Supabase 레저 — outreach_outcomes** | `outcomes-ledger.js` → `getRecentOutcomes({ workspaceId?, limit, play? })` (export됨, 기본 limit 30) | `play`(함수 인자) · `lead_id`(클라이언트단 필터, 함수 인자 아님) | 실시간(정본, 0008) | 비어 있음 = 정상(신규) → `recent_outcomes:[]`, missing 불필요 | 세일즈, 오더(트리아지), 검수 |
| **Supabase 레저 — content_items / content_variants** | `content-ledger.js` → `getContentLedger()` (export됨). 그 반환 객체의 `ideaQueue` / `cadence` 슬라이스를 읽는다. (`buildIdeaQueue`/`buildCadence`는 **모듈 내부 함수, export 아님 → 직접 호출 금지**) | `content_item` id, `channel`(variant), ISO 주차(`cadence.week`) | 실시간(정본, 0007) | 비어 있음 → `idea_queue_top:[]`, `getContentLedger()`가 빈 슬라이스 반환(`ideaQueue:[]`, `cadence` 기본값) + `missing` 사유 | 콘텐츠, 제작, 오더 |
| **Supabase 레저 — lead_intake_raw** (source 포함 `business_card`) | `card-intake.js`, `sheets-sync.js` staging | `match_key` · `intake_id`(row id) | staging(승격 전) | promote 실패 → status `review`, `missing:{source:"lead_intake_raw", reason}` | 세일즈(신규 리드), 오더 |
| **eeoCRM (Xiaoshouyi)** | MCP `eeoCRM` SSE — `crm_account_360`, `crm_soql_query`, `crm_query_eeo_accounts` | `ownerId = 3935704427463307` → 고객 account의 `Account__c`로 조인(ShroffAccount__c는 `Account__c`) | ~2h 토큰, 온디맨드 호출 | MCP 실패/타임아웃 → `crm_facts:null` + `missing:{source:"eeoCRM", reason}`, **항목 격리 아님, 루프 계속** | 세일즈, 오더 |
| **Google Sheets — intake / outreach log** | sheets-sync (raw fetch REST), `/api/integrations/sheets/sync` | `match_key`(회사명 정규화) | 동기화 주기(수동/배치) | match_key 없음 → staging status `review`("no match_key") + `missing` | 세일즈(신규 리드), 오더 |
| **명함 intake** | `/api/hub/cards` (Gemini Vision → staging → 자동 promote) | `match_key`(추출 회사/연락처 정규화) | 업로드 시점 | 식별 불가(이름·전화 둘 다 없음) → status `ignored` + `missing` | 세일즈(신규 리드), 오더 |
| **소셜 인게이지먼트 (인스타/스레드)** | **v1 = 수기 입력** (The Assignment: 반응 좋은 글 3 + 안 좋은 글 2). 향후 API. | 게시물 → `content_item` (게시물을 content_item에 매핑) | 수기, 비정기 | 수기 미입력 → `social_signals:{ winners:[], losers:[] }` 또는 `{ manual_note }` + `missing:{source:"social", reason:"v1 수기, 이번 루프 미입력"}` | 콘텐츠, 제작 |
| **classin_home** (퍼널 이코노믹스·채널별 광고비·딜 파이프라인) | **읽기 전용 별도 레포** — 동기화 아님, 참고만. 직접 grep 금지(다른 레포). | `company`(회사명) | 별도 레포 상태(비동기, 참고치) | 미접근 → `missing:{source:"classin_home", reason:"별도 레포, 이번 루프 미참조"}` | 세일즈(맥락), 오더 |
| **classmoon 브랜드 SSOT** | Supabase `brands` 시드 + positioning 원칙(감→기준→데이터, 정직한 경계) | 전역(항목 무관, 모든 출력에 주입) | 정적(거의 불변) | 항상 존재 → 실패 경로 없음(`brand` 슬라이스는 항상 채워짐) | 콘텐츠, 제작, 세일즈, 검수 |

> 정직한 경계: **소셜은 수기(v1)**, **classin_home은 읽기 전용 별도 레포**(moonlight가 재구축·동기화하지 않고 참고만), **광고비 통합은 vNext**(채널별 광고비를 360에 자동 결합하는 건 다음 버전). 지금 360은 이것들을 *참고 슬라이스*로만 다루고, 비면 `missing`에 정직하게 남긴다.
>
> 코드 진입점 정직성: 콘텐츠는 `getContentLedger()` **하나**가 진입점이고 `ideaQueue`/`cadence`는 그 반환 슬라이스다. outcomes는 `getRecentOutcomes`가 진입점이되 **`leadId` 인자가 없다** — 이 항목(lead)의 결과만 보려면 클라이언트단에서 당긴 뒤 `lead_id`로 거른다(§3 step2). 스파인은 실재 export 면만 박는다.

---

## 3. 360 조립 계약 (오더가 entity 기준으로 조각을 당겨 정규화)

오더는 수집·트리아지 후 선택된 상위 N건 각각에 대해 아래 단계로 `operating_context`를 조립한다. eeoCRM의 **`crm_account_360` 패턴을 차용**한다 — 하나의 entity 기준으로 사실 조각들을 한 객체로 모으되, 실패한 조각은 객체를 깨지 않고 명시적 null + 사유로 남긴다. 차용한 건 *패턴*이고, 실제 레저 함수의 반환 모양은 코드 그대로이므로 step8에서 논리 스키마로 정규화한다.

**단계별:**

1. **entity 시드.** 트리아지가 고른 항목에서 `item_id`·`item_type`을 정하고 `entity`를 채운다. 출처는 항목 타입에 따라 Supabase `deals`/`leads`. `owner_id`는 항상 `3935704427463307`. `company`는 이후 시트/명함/classin_home 조인을 위해 정규화(`match_key` 형태로 쓸 수 있게).

2. **ledger 슬라이스 당김.** Supabase 레저에서:
   - **recent_outcomes** ← `getRecentOutcomes({ limit: 30, play })`를 호출한다. **함수는 `leadId` 인자를 받지 않는다** — `play`(있으면)와 워크스페이스로만 필터해 최근 30건을 occurred_at desc로 돌려준다. 따라서 *이 항목(lead)의 결과만* 추리려면 반환된 `outcomes[]`를 클라이언트단에서 `o.leadId === entity.lead_id`로 거른다(또는 `play` 세그먼트 단위로 묶어 본다). 반환 원소는 camelCase `{id, leadId, dealId, companyId, play, channel, action, note, occurredAt}` — step8에서 논리 스키마로 정규화한다.
     > 함수에 lead 스코프가 필요하면 `getRecentOutcomes`에 `leadId` 파라미터를 추가하는 게 정공이다(현재 미지원). 그 전까지는 fetch-후-필터로 처리하고, 이 갭을 안다는 표시로 둔다.
   - `score` ← `leads.score`, `next_action_hint` ← `leads.next_action`(또는 팔로업 엔진 제안).
   - `last_touch` ← 필터된 outcomes 중 가장 최근 원소의 `occurredAt`(→ `at`로 정규화) 또는 별도 접촉 기록.
   - 정본이므로 비어 있으면(신규) 빈 배열/0으로 두고 missing 불필요.

3. **crm_facts 조인.** `item_type`이 `deal`이거나 `lead`가 고객으로 승격됐으면, eeoCRM MCP를 `ownerId = 3935704427463307`로 호출하고 고객 account의 `Account__c`로 조인해 `crm_account_360` 사실을 받는다. ShroffAccount__c는 `Account__c`로 추가 조인. 성공 → `crm_facts` 채움. 실패/미매칭 → `crm_facts:null` + `missing` 한 줄. (이 단계는 **API가 연결된 사실만** 담는다 — 추정 금지.)

4. **content 슬라이스 당김.** `item_type`이 `content_slot`이면(또는 항목이 콘텐츠를 동반하면) `getContentLedger()`를 **한 번** 호출하고 그 반환 객체에서 슬라이스를 읽는다(`buildIdeaQueue`/`buildCadence`는 export되지 않으므로 직접 호출하지 않는다):
   - `idea_queue_top` ← `getContentLedger().ideaQueue` (이미 rank desc 정렬·status `idea`·상위 12). 더 좁히면 앞에서 slice.
   - `cadence_status` ← `getContentLedger().cadence`(`{ week, goal, published, remaining, behind, queueDepth, recentWeeks }`)를 문자열/객체 상태로 파생. 예: `${published}/${goal}` + `behind ? "behind" : "on-track"`.
   - `recent_published` ← `getContentLedger().publishLogs`(또는 `items` 중 status `published`)에서 최근분.

5. **social_signals 결합.** 콘텐츠 동반 항목이면 수기 입력(winners 3 / losers 2)을 `content_item`에 매핑해 채운다. 미입력이면 빈 배열 또는 `manual_note` + `missing`.

6. **brand 주입.** classmoon 가드레일(`voice/rules/forbidden`)을 전역으로 항상 채운다. 이 슬라이스는 실패 경로가 없다.

7. **참고 소스 보강(선택).** classin_home의 퍼널·딜 파이프라인 맥락이 필요하고 접근 가능하면 `company`로 참고치를 붙인다. 동기화가 아니라 참고이므로, 못 붙이면 단순히 `missing`에 남기고 진행.

8. **정규화·검증 (코드 camelCase → 논리 snake_case).** 모든 슬라이스의 필드명을 **논리 스키마(1절)**와 일치시킨다. 레저 함수는 자기 모듈의 모양으로 반환하므로, 조립기가 여기서 명시적으로 매핑한다 — 안 하면 조립기가 키 불일치를 조용히 생산한다. 채워지지 않은 슬라이스는 타입 규칙대로 null/빈 값으로 명시하고 `missing[]`을 확정한다. → 이 객체가 `work_order[].context.operating_context`로 실린다.

   **recent_outcomes 원소 매핑 (`getRecentOutcomes` 반환 → 논리 스키마):**

   | 코드 반환(camelCase) | 논리 스키마(snake_case) | 처리 |
   |---|---|---|
   | `leadId` | `lead_id` | 그대로 매핑 |
   | `play` | `play` | 그대로 |
   | `action` | `action` | 그대로(도메인 `sent|replied|meeting|proposal|won|lost|no_response`) |
   | `note` | `note` | 그대로 |
   | `occurredAt` | `at` | **키 이름 변경**(ISO8601 유지) |
   | (없음) | `asset_id` | **별도 소스** — outcome 행에는 `assetId`가 따로 있을 수 있으나 `getRecentOutcomes` 반환에는 미포함. 없으면 `null`, 알면 자산 매핑에서 채움 |
   | `id`, `dealId`, `companyId`, `channel` | (논리 스키마 밖) | 운영상 필요하면 보존, 페르소나 계약 키는 위 6개로 고정 |

   정규화 후 각 원소는 반드시 `{lead_id, play, asset_id, action, at, note}` 형태여야 한다 — 페르소나(세일즈 `ledger.recent_outcomes`)는 이 키만 본다.

9. **페르소나 슬라이싱.** 오더는 `activate:[persona ids]`를 정하고, 각 페르소나에게 **자기 슬라이스만** 전달한다(페르소나 입출력 계약). 이때 넘기는 키는 step8에서 정규화된 논리 스키마 키다:
   - 세일즈(`personas/01-sales-followup.md`) ← `entity` + `crm_facts` + `ledger`.
   - 콘텐츠(`personas/02-content.md`) ← `content` + `social_signals` + `brand`.
   - 제작(`personas/03-production.md`) ← 승인된 idea/angle + `brand` + channel.
   - 검수(`personas/04-review-gate.md`) ← 임의 아웃바운드 후보(+ `brand`).
   페르소나는 360 전체를 보지 않는다. 합성은 오더(`personas/00-order-dispatch.md`)가 한다(merge).

---

## 4. 실패 / 누락 처리 — `missing[]` 규약

루프의 철칙: **소스 하나가 죽어도 항목은 죽지 않는다.** 360 조립은 best-effort 누적이고, 실패는 데이터의 부재로 *기록*되지 게이트로 작동하지 않는다.

**규약:**

- 어떤 소스 조각을 못 채우면 그 슬라이스를 타입 규칙대로 null/빈 값으로 두고 `missing`에 `{ source, reason }` 한 줄을 **반드시** 추가한다. 조용한 빈칸 금지 — 빈칸에는 항상 사유가 붙는다.
- `source`는 레지스트리(2절)의 소스명을 그대로 쓴다(`leads`, `eeoCRM`, `lead_intake_raw`, `social`, `classin_home` 등). `reason`은 운영자가 읽고 판단할 수 있는 짧은 사실(예: `"리드가 고객 account 미매칭"`, `"MCP 타임아웃"`, `"v1 수기, 이번 루프 미입력"`).
- **소스 실패의 종류와 처리:**
  - **빈 소스(정상)** — 신규 리드의 outcome 0건 같은 경우(`getRecentOutcomes`가 `outcomes:[]` 반환). 빈 배열로 채우고 missing 불필요(부재가 곧 사실).
  - **미매칭/미참조** — eeoCRM 미매칭, classin_home 미참조. 슬라이스 null + `missing` 한 줄. 루프 계속.
  - **error**(MCP 실패·JSON 깨짐·Codex 타임아웃) — 해당 *슬라이스*만 격리하고 사유를 `missing`에 남긴다. **루프 전체는 계속.** (게이트 단계의 error 처리와 정렬: 항목은 드롭되지 않고 통과(큐) 아니면 운영자(사유)로 간다.)
  - **정규화 실패**(코드↔논리 키 매핑 중 예상 키가 없음) — 그 원소/슬라이스를 버리지 말고 채울 수 있는 키만 채운 뒤 `missing:{source, reason:"정규화 키 누락: <필드>"}` 한 줄. step8의 매핑 표가 진실의 기준이다.
- 페르소나는 `missing[]`을 읽고 "이 슬라이스는 신뢰 불가"를 인지한 채 자기 출력을 낸다. 실패 처리(데이터 없을 때 반환 — 드롭 0)는 각 페르소나 지침 8번 섹션 계약과 같다.
- **게이트와의 관계:** 360 조립 실패는 게이트 *판정*과 별개다. crm_facts가 null이어도 세일즈 페르소나는 ledger·entity만으로 next_action을 낼 수 있고, 그 출력이 아웃바운드면 여전히 Codex 적대검증을 거친다. **Codex 타임아웃/에러는 게이트 스킵이 아니라 `needs_human` 강등** — 360의 missing과 게이트의 needs_human은 둘 다 "사라지지 않게 사유를 남긴다"는 같은 철학이다.

**한 줄 요약:** 360은 항목 1건을 위한 사실의 *최선 누적*이다. 소스 진입점은 실재 export 면(`getContentLedger`·`getRecentOutcomes`)만 쓰고, 코드 camelCase는 step8에서 논리 snake_case로 정규화한다. 어떤 조각이 빠져도 그 자리는 `null`/빈 값 + `missing` 한 줄로 정직하게 남고, 항목은 통과(큐) 아니면 운영자(사유)로 — 절대 드롭되지 않는다.
