# Sales OS v1.4 — classin_home CRM 결합 기획

> **상태(2026-07-10): 보류.** P0a(§9 표 — `crmFacts` 배관, `crm-pipeline.js`, 라이브 DB 무영향)만 구현·머지됨.
> classin_home 레포 접근 필요 등 moonlight 바깥 의존이 큰 P0b 이후는 사용자 결정으로 후순위로 밀림 —
> 당분간 moonlight_pro 안에서 자체 완결되는 작업을 우선한다. 재개 시 §8 질문(특히 Q1, 동일 Supabase 프로젝트 여부)부터 확인할 것.
>
> `docs/sales-os-direction.md` §9 Open Question #1 해소 + v1.4 실행 준비. 형식은 `docs/sales-guru-mentor-agent-plan.md`를 따름.
> 작성: Fable(총괄) + Opus(통합방식 트레이드오프 판단) + Sonnet(코드 패턴 검증) 조합.
> 근거: 두 서브에이전트 각 2회 실행(결론 일치) + 총괄이 직접 확인한 `docs/sales-os-direction.md`,
> `docs/sales-guru-mentor-agent-plan.md`, `20260710_0012_classin_side_brand_and_org_scope.sql`(uncommitted),
> `docs/sales-os/context-spine.md`, `.gitignore`, `apps/hub/vercel.json`, `apps/hub/app/api/cron/**`.
> 상위 오케스트레이터가 `apps/hub/lib/sales-os/context-assembler.js`, `apps/engine/app/api/ai/sales-mentor/route.ts`,
> `.gitignore:25`, `apps/hub/app/api/hub/sales-mentor/route.js`, `apps/engine/app/api/webhook/`를 직접 재검증함 — 인용 전부 일치.

---

## 1. 한 줄 정의

moonlight는 classin_home의 CRM/딜/퍼널을 **재구축하지 않고, classin_home이 주기적으로 push한 read-only 스냅샷을 moonlight 자체 Supabase에 적재해 읽는다.** 판단 시점의 런타임 경로는 항상 moonlight 자기 DB만 본다 — classin_home 장애·스키마 변경이 Guru 코칭·Daily Brief를 직접 깨뜨리지 않는다.

이것이 Open Question #1의 답이다: **C안(push snapshot)을 P0 백본으로 채택**한다.

---

## 2. Open Question #1 — 통합 방식 결정

### 2.1 세 안과 7축 비교

| 축 | A — 직접 읽기(cross-project) | B — eeoCRM MCP 라이브 | C — classin_home push 스냅샷 |
| --- | --- | --- | --- |
| ① 데이터 신선도 | 명목상 최고. 단 classin_home 자체가 Xiaoshouyi를 배치 동기화하므로 실질 우위는 작음 | 이론상 최고. 단 **배포(Vercel) 환경에서 실현 불가**(아래 참고) | 배치(시간/일 단위). 상류 배치 지연과 실질 동급 |
| ② 구현 난이도(레포 제약 하) | 중 — 대체 read 클라이언트 1벌 신설 | **배포용은 사실상 불가** / 로컬은 이미 부분 설계됨 | 중 — intake 인증·payload 계약·멱등성은 기존 패턴 재사용, snapshot 테이블만 신규 |
| ③ 장애 격리 | 약함 — classin_home 장애가 판단 시점에 직결 전파 | 배포에서 상시 불가용(=격리는 되지만 기능 자체가 없음) | **최상** — 런타임은 자기 DB만 read, classin_home 다운 중에도 마지막 스냅샷으로 지속 판단 |
| ④ 경계 규칙 준수 | 양호하나 물리 스키마에 가장 밀착 | 최상(순수 읽기 API 소비) — 배포 불가로 무의미해짐 | 양호. "재구축 아님, read-only 캐시"로 규율 필요(§7 리스크1) |
| ⑤ 자격증명/보안 | classin_home Supabase read 키를 moonlight env에 상주 — 새 상시 크로스 프로젝트 시크릿 | 개인 세션 토큰(~2h), 팀 공유 불가 — 상시 시크릿 없음(장점)이나 배포 불가 | **최상** — 기존 `COM_MOON_SHARED_WEBHOOK_SECRET` 재사용, 새 DB 열람 키 불필요 |
| ⑥ 스키마 결합·드리프트 | 최악 — classin_home 마이그레이션이 moonlight를 조용히 깸 | 최저(API 객체 모델에 결합, DB 드리프트 무관) — 배포 불가로 무의미 | 낮음 — 드리프트를 intake 정규화 한 지점(anti-corruption layer)에 격리 |
| ⑦ preview/empty + 배포 실행 가능성 | Vercel 네이티브, config 없으면 preview | **Vercel/cron에서 도달 불가**(`localhost:3010`) → 배포 Hub는 이 경로로 crm_facts 영구 결핍 | Vercel 네이티브, 기존 `source: 'supabase' \| 'preview'` 패턴 그대로 |

**결정타 사실**: eeoCRM MCP는 실존하지만 `.gitignore:25`("Personal MCP config (local eeoCRM SSE on :3010 — not team-shareable)")와 `docs/superpowers/plans/2026-06-18-sales-os-team-operating-layer.md:60`(세션 토큰 ~2h, 미연결 graceful skip)이 명시하듯 **이 머신의 로컬 대화형 세션 전용**이다. v1.4의 실행 표면은 Vercel 배포 Hub + 무인 nightly cron(`apps/hub/vercel.json`의 `/api/cron/recompute-scores`, 매일 15시)이므로, **B안은 이 백본을 구동할 수 없다.**

### 2.2 기존 코드가 이미 C안을 blessed하고 있다는 근거

- `apps/hub/lib/external-crm/owner-names.js`가 읽는 `crm_xiaoshouyi_owner_names`(migration `20260617_0006`)는 **classin_home을 런타임에 읽는 게 아니라, migration이 moonlight 자체 Supabase에 seed한 스냅샷**을 읽는 구조 — C안의 축소판이 이미 이 레포에 존재.
- Engine intake 인증(`validateSharedWebhookRequest` — `x-com-moon-shared-secret` 헤더)과 payload 계약이 이미 완비 — C안의 수신부는 **신규 인프라가 아니라 기존 패턴 복제**. (`apps/engine/app/api/webhook/project/`가 그 선례로 실제 존재 확인됨.)
- `context-schema.js`의 `missing[{source, reason}]` 격리 규약, `revenue-ledger.js`의 `source === 'supabase' ? '...' : 'preview'` 판별 — 전부 "런타임엔 자기 DB만 본다"는 전제 위에 설계돼 있음. C안이 이 결과와 정합적.

### 2.3 최종 추천 — 단계적 하이브리드

- **P0 백본 — C안**: classin_home 쪽 cron/스크립트가 `ownerId=3935704427463307` 슬라이스를 moonlight Engine intake로 POST → moonlight 자체 Supabase의 신규 read-only 스냅샷 테이블에 멱등 upsert. `crm_facts`는 이 테이블에서 채움.
- **분기 조건부(사용자 확인 필요, §8 Q1)**: 만약 moonlight와 classin_home이 **이미 동일한 Supabase 프로젝트**라면, C안 대신 **classin_home 소유의 안정 VIEW를 same-project로 read**하는 축소형 A안이 더 단순(별도 push 파이프라인·새 시크릿 불필요). 별개 프로젝트로 확인되면 C안 확정.
- **로컬 보강 — B안 현행 유지**: 스파인이 이미 `crm_facts` 슬롯 + `missing` 훅을 남겨뒀으므로, 운영자가 로컬 Claude Code 세션에서 eeoCRM MCP를 띄우고 대화형으로 `deal-review`를 돌리면 그 세션 한정으로 라이브 보강 가능. **배포 인프라 추가 0, 순수 이득이므로 막지 않되 v1.4 스코프에는 포함하지 않는다.**
- **A안(크로스 프로젝트 직접 read) 단독 채택은 비추천**: 이 레포의 격리·자격증명·드리프트 posture를 정반대로 뒤집음.

---

## 3. 리포지토리 / 라우트 계획

### 3.1 신규 파일

| 파일 | 역할 | 근거 패턴 |
| --- | --- | --- |
| `supabase/migrations/2026XXXX_00XX_classin_crm_snapshot.sql` | 신규 테이블 `classin_crm_snapshot`(가칭) — `owner_id`, `external_deal_id`, `stage`, `amount`, `payment_status`, `last_contact_at`, `synced_at`, `meta jsonb`(`org_scope: 'classin'` 고정, §5) | `20260617_0006_crm_xiaoshouyi_owner_names.sql`과 동일 구조(글로벌 테이블, workspace_id 없음) |
| `apps/hub/lib/repositories/crm-pipeline.js` | Hub read 리포지토리. `fetchSupabaseRows("classin_crm_snapshot", {...})` + `eqFilter(OWNER_ID)`, config 없거나 fetch 실패 시 `source: "preview"` | `apps/hub/lib/repositories/revenue-ledger.js`의 `emptyLedger`/`source` 판별 패턴 그대로 |
| `apps/hub/app/api/hub/crm-pipeline/route.js` | 얇은 GET 래퍼. `status: ledger.source === "supabase" ? "live" : "preview"` | `apps/hub/app/api/hub/revenue/route.js` 템플릿 그대로 |
| `apps/engine/app/api/webhook/crm-snapshot/route.ts` | classin_home → moonlight push 수신. `validateSharedWebhookRequest` 인증 + 멱등 upsert(`updateSupabaseRecordReturning` + `synced_at` 갱신 가드) | `apps/engine/app/api/webhook/project/route.ts` 패턴 복제 |

### 3.2 기존 파일과의 통합 지점 (파일:라인, 재검증 완료)

- **`apps/hub/lib/sales-os/context-schema.js:70-114`**: `buildFocusOperatingContext()`가 지금 무조건 `crm_facts: null`(98행)과 `missing`의 세 번째 항목 `{ source: "eeoCRM", reason: "MCP 미연결 — crm_facts 보강 없음" }`(111행)을 반환. **시그니처에 `crmFacts = null` 파라미터를 추가**해 98행을 `crm_facts: crmFacts`로, 111행의 `missing` 항목은 `crmFacts`가 null일 때만 push하도록 조건화.
- **`apps/hub/lib/sales-os/context-assembler.js:75-85`**: `assembleSalesContext({ mode, ref })`의 `mode === "deal-review"` 분기(75-85행)에서 `buildFocusOperatingContext({ deal, account, entityOutcomes, brand })`(84행) 호출 **직전**에 `getCrmPipeline({ ownerId: OWNER_ID, dealId: deal.id })`를 조회해 `crmFacts` 인자로 전달. `crm_facts`는 개별 딜/계정 단위 조인이라 전체 리스트(35-40행의 병렬 그룹)보다 이 focus 조립 지점이 자연스럽다.
- **`apps/engine/app/api/ai/sales-mentor/route.ts`**: Engine에는 (당초 `sales-guru-mentor-agent-plan.md`가 가정했던) `buildSalesContext()` 함수가 **존재하지 않는다** — 실제로는 `payload.context ?? {}`(164행)를 그대로 받아 `digest360()`(70-104행)으로 요약 후 프롬프트에 직렬화할 뿐, Supabase 접근이 없다. `crm_facts`는 이미 `JSON.stringify(context)`(129행)로 프롬프트에 통째로 들어가므로 **Engine 쪽 로직 변경은 불필요**하나, `digest360()`에 crm_facts 요약 한 줄(예: "eeoCRM 계정상태: {status}, 최근 opportunity: {stage}")을 추가하면 모델이 놓치지 않게 도움.
- **실제 컨텍스트 조립은 Hub 쪽에서 일어남**: `apps/hub/app/api/hub/sales-mentor/route.js`가 `assembleSalesContext({ mode, ref })`를 호출해 `callEngine(...)`으로 넘김. 즉 `crm_facts` 배관의 전체 작업은 **Hub 레이어(`context-schema.js` + `context-assembler.js`) 안에서 완결**되고 Engine 라우트/프록시 라우트는 손댈 필요가 최소.
- **`apps/hub/lib/external-crm/owner-names.js`**: 별도 Supabase URL 없이 메인 프로젝트의 `fetchSupabaseRows`를 재사용하는 패턴, "정적 폴백 ⊕ DB override, DB wins" 구조, `normalizeId()` key 정규화 — `crm-pipeline.js`가 그대로 따라할 읽기 패턴의 참고처.
- **워크스페이스 필터 주의**: `crm_xiaoshouyi_owner_names`는 workspace 필터 없이 글로벌 테이블로 취급됨. `classin_crm_snapshot`도 동일하게 **workspace_id 없이 `owner_id`로만 스코프**하는 것이 기존 관례와 일치.

---

## 4. `crm_facts` gap 해소 — 구체적 동작

1. `classin_home`이 push한 스냅샷이 `classin_crm_snapshot`에 upsert됨(`synced_at` 갱신).
2. `crm-pipeline.js`의 `getCrmPipeline({ ownerId, dealId })`가 이 테이블을 read — config 없거나 fetch 실패 시 `null` 반환(기존 `fetchSupabaseRows` 규약 그대로).
3. `context-assembler.js`가 `deal-review` 모드에서 이 값을 `buildFocusOperatingContext(..., crmFacts)`로 전달.
4. `context-schema.js`가 `crm_facts`에 실제 값을 채우고, 성공 시 `missing`에서 `eeoCRM` 항목을 제거(실패/미매칭 시에만 유지) — **`missing[]`이 "silent blank 금지" 불변식을 계속 지킴**(파일 상단 주석에 이미 명시된 invariant).
5. **Guru `deal-review` 모드가 얻는 것**: 지금은 로컬 근사(`deals.type`/moonlight 자체 leads) + "eeoCRM 미연결"이라는 결손 고백만 가능. 채워지면 `digest360()` 요약에 실제 회사 CRM의 stage/금액/결제상태가 들어가, Keenan 4층 GAP 진단이나 구매자 의사결정 스타일 추정(§14 매핑표, `sales-guru-mentor-agent-plan.md`)이 **진짜 파이프라인 사실**에 근거하게 됨. "데이터에 없는 단정 0건" 사실성 가드가 더 넓은 사실 위에서 작동.

---

## 5. `org_scope` 패턴과의 관계 — 권고

현재 어휘가 두 갈래로 갈라져 있음이 확인됨:
- `deals`/`leads`의 `type: 'company' | 'personal'` (기존, 로컬 근사 파이프라인)
- `brands.meta.org_scope: 'classin' | 'personal'` (신생, `20260710_0012_classin_side_brand_and_org_scope.sql`, 이 대화 세션 중 발견된 uncommitted 변경)

**권고 — 지금 당장 리네임하지 않는다. 신규 표면부터 새 어휘를 쓰고, 매핑 헬퍼로 연결한다.**

- `classin_crm_snapshot`(신규 스냅샷 테이블)은 **처음부터 `meta.org_scope: 'classin'`을 고정값으로 태깅**한다 — 이 테이블은 정의상 전량 회사(클래스인) 데이터이므로 레거시 부담 없이 새 어휘를 바로 채택 가능.
- `deals.type`은 **라이브 스키마이고 이미 소비하는 코드(`revenue-ledger.js` 등)가 많아 이번 v1.4 스코프에서 리네임하지 않는다**(마이그레이션 리스크 대비 이득 작음).
- 대신 코드 레벨에 얇은 매핑 헬퍼(예: `dealTypeToOrgScope(type) => type === 'company' ? 'classin' : 'personal'`)를 하나 두고, CRM 통합 코드나 신규 UI 필터가 두 어휘를 오갈 때 이 헬퍼를 경유하게 한다.
- **vNext**: `org_scope` 어휘가 브랜드·CRM 양쪽에서 안정화되면, `deals.type`을 `org_scope`로 통합하는 별도 마이그레이션(컬럼 추가 후 `type` deprecate)을 정식 제안. 지금 이 기획에서는 스코프 밖으로 명시적으로 미룬다.

---

## 6. 데이터 범위 — v1.4에 필요한 것 vs 나중

| 필드/영역 | v1.4 포함 | 근거 |
| --- | --- | --- |
| `deal.stage`(contact→...→closed) | **포함** | Guru의 pipeline-triage·deal-review 핵심 입력 |
| `deal.amount`, `payment_status` | **포함** | "무엇부터 손대야 하나" 판단에 직결 |
| 최근 컨택 이력(요약, 마지막 접촉일) | **포함(요약만)** | 팔로업 타이밍 판단에 필요. 원문 로그 전체는 불필요 |
| 고객 원시 연락처(전화/이메일) | **제외(v1.4)** | PIPA 리스크 최소화(§8). 꼭 필요하면 판단 시점 온디맨드로 최소 조회하는 vNext 검토 |
| 퍼널 이코노믹스(CPL/CPA/CPD/ROI) | **제외 → vNext** | v1.4 목적은 "딜 판단", 마케팅 효율 분석은 다른 JTBD |
| 채널별 광고비 | **제외 → vNext** | 동일 이유. 스냅샷 스코프에 넣으면 "재구축" 경계를 넘기 쉬움 |
| `external_crm_records`(Xiaoshouyi 원시 스냅샷) 전체 | **제외** | 스냅샷 테이블은 Guru가 실제로 쓰는 필드만 담는 **얇은 투영**이어야 함(재구축 금지 원칙) |

---

## 7. 롤아웃 / 안전장치

- **preview/empty state**: `classin_crm_snapshot`이 비어있거나(첫 push 전) config 미설정이면 `crm-pipeline.js`가 `source: "preview"` 반환 → `context-schema.js`는 기존과 동일하게 `crm_facts: null` + `missing[{source, reason:"스냅샷 없음"}]`으로 정직하게 표기. mock과 혼합하지 않음.
- **staleness 배지(신규 필요)**: 스냅샷의 `synced_at`이 임계치(예: 48h) 초과하면 "live"이지만 **오래된 데이터임을 명시**하는 배지 필요 — silent stale이 "가짜 신선함"으로 오인되는 것을 방지.
- **마이그레이션 승인 절차**: `classin_crm_snapshot` 마이그레이션은 CLAUDE.md 규칙대로 **사용자 승인 후에만** `npm run db:migrate`로 적용. 이 기획 문서 자체는 라이브 DB를 건드리지 않음.
- **마이그레이션 필요 여부**: C안(push) 채택 시 필요(신규 테이블 1개). §2.3의 "동일 프로젝트" 분기로 A안 축소형이 채택되면, moonlight 쪽엔 신규 테이블이 필요 없고 classin_home 쪽에 read-only VIEW/role만 필요해질 수 있음.
- **Engine intake 인증**: 신규 `crm-snapshot` 웹훅도 기존 `COM_MOON_SHARED_WEBHOOK_SECRET`을 재사용(신규 시크릿 발급 없음).
- **멱등성**: push가 재시도되거나 중복 전송돼도 `external_deal_id` 기준 upsert + `synced_at` 최신값 갱신 가드로 안전(레포 관례: `updateSupabaseRecordReturning` + status transition lock + `X is null` 가드).

---

## 8. 미해결 리스크 / 사용자에게 되물어야 할 질문

1. **두 Supabase 프로젝트가 동일한가, 별개인가?** — 이 기획의 최대 분기점. 동일/연결이면 same-project VIEW read가 C안보다 단순해질 수 있음(§2.3). 확인 전엔 C안이 기본값.
2. **classin_home 쪽 push producer를 누가/어떻게 구축하는가?** — C안의 유일한 moonlight-외부 의존. 이 세션에서는 classin_home 레포에 접근할 수 없으므로 확정 불가.
3. **로컬 전용 eeoCRM MCP(:3010)를 배포 환경에서도 쓸 계획이 있는가?** — 현재 형태로는 Vercel/cron에서 불가. 배포 라이브가 꼭 필요하면 Xiaoshouyi 서비스 계정 OAuth+리프레시라는 별도 대공사가 전제이며, 이는 "개인·팀 공유 불가"라는 현재 배치와 충돌.
4. **PIPA — 크로스 프로젝트로 복제되는 고객 PII의 처리 방침** — 원시 연락처를 스냅샷에 포함할지, 보존기간·목적 한정을 어떻게 정의할지. "네이버 자동수집 PIPA 보류" 전례와 일관되게 보수적으로 접근할 것을 권고하되 최종 결정은 사용자 몫.
5. **신선도 요구치** — 일 1회(현 cron 케이던스)로 충분한가, 시간 단위 push가 필요한가?
6. **스냅샷 계약 버전 관리** — classin_home 스키마가 변할 때 payload 계약을 누가 언제 갱신할지 운영 절차 미정.

---

## 9. 단계적 Phase 표

| Phase | 범위 | 산출물 | 데이터 변경 없이 검증 가능한가 |
| --- | --- | --- | --- |
| **P0a — 배관 검증** | `context-schema.js`/`context-assembler.js`에 `crmFacts` 파라미터 배관만 추가(§3.2). `crm-pipeline.js`는 존재하되 테이블이 비어있는 상태로 preview 반환 확인 | `crm_facts` 슬롯이 실제로 조건부 채움/미채움을 오가는 코드 경로 확정 | **예 — 라이브 마이그레이션 없이 유닛 테스트/스텁 데이터로 검증 가능**(가장 먼저 착수할 단계) |
| **P0b — 스냅샷 테이블 + intake** | `classin_crm_snapshot` 마이그레이션(승인 후 적용) + `apps/engine/app/api/webhook/crm-snapshot/route.ts` + Hub 리포지토리/라우트 | 수기로 스냅샷 row 1건 삽입해 end-to-end smoke test(Guru deal-review가 실제 crm_facts를 프롬프트에 반영하는지 확인) | 마이그레이션은 필요하나 classin_home 쪽 producer 없이도 수기 삽입으로 검증 가능 |
| **P1 — classin_home push 연동** | classin_home 쪽 cron/스크립트 실제 구축(타 레포) + 실 데이터 push | 실제 문준혁 담당 딜이 Guru 코칭에 등장 | 아니오 — classin_home 측 작업 완료가 전제 |
| **P2 — 안전장치 강화 + org_scope 정리** | staleness 배지 UI, PIPA 필드 최소화 감사, `dealTypeToOrgScope()` 매핑 헬퍼 도입, (조건부) A안/B안 하이브리드 검토 | 운영 신뢰도 확보, 용어 정합성 정리 | 부분적 — UI/헬퍼는 즉시 검증 가능, 하이브리드 검토는 Q1 답 확정 후 |

**권고 착수 순서**: P0a(코드 배관, 라이브 무영향) → 사용자에게 §8 질문 확인 → P0b(승인 후 마이그레이션) → P1(classin_home 조율) → P2.
