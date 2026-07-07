# CRM 센스있는 사용성 팩 — 설계 (Design)

> **생성일: 2026-07-07**
> 대상: `apps/hub` **Revenue 표면**(moonlight Hub 개인 콕핏 CRM). 회사 CRM(`classin_home` `/admin/crm`)은 범위 밖.
> 승인: 사용자 "전부 다 진행" — 아래 4단계 전체.
> 근거: 레포 실측(2026-07-07) — `revenue.jsx`(2663줄), `revenue-ledger.js`, `revenue-write.js`, `followups-ledger.js`, `crm-activities.js`, `followups.jsx`, `hub-primitives.jsx`.

---

## 1. 배경 & 현재 상태 (재사용 지도)

**데이터 흐름**
- **읽기:** `lib/repositories/revenue-ledger.js` → Supabase `leads`/`deals`/`customer_accounts`/`operation_cases`(+companies/contacts). 설정+워크스페이스 있으면 `source: supabase`, 없으면 `preview` 빈 상태. **mock/live 안 섞음.**
- **쓰기:** `saveRevenueRecord(kind, op, record)` → `POST /api/hub/revenue/{lead,deal,case,account}` → `lib/sales-os/revenue-write.js` `persistRevenueRecord` + `build{Lead,Deal,Case,Account}Write`. 부분 패치 O(칸반 스테이지 이동이 이미 사용). meta는 기존 행과 머지(형제 키 보존).
- **활동:** `saveActivity` → `/api/hub/revenue/activity` → `crm-activities.js`(`crm_activities`, migration 0014). 타임라인 = `DrawerTimeline`(revenue.jsx:546) / Accounts `LogComposer`(revenue.jsx:1882).
- **팔로업:** `followups-ledger.js` `getFollowups()` → overdue-first 큐(채널·왜·다음행동·우선순위) → `followups.jsx` 페이지(`dashboard/revenue/followups`, `dashboard/classin/followups`). 원클릭 로그 → `outreach_outcomes`.
- **원천:** `eeocrm-sync.js` — eeoCRM(Xiaoshouyi) MCP → `lead_intake_raw` staging → promote → `leads`. 유일한 실 CRM 소스.

**이미 있는 것(재사용 대상)**

| 영역 | 현황 |
|------|------|
| Leads | 생성(local→persist)·EditDrawer·삭제·**딜 전환**·**명함 intake(Gemini)**·스코어 정렬·워크스페이스 필터·`?lead=` 딥링크·DrawerTimeline |
| Deals | 칸반 **드래그-드롭 스테이지 이동**·생성(상단 버튼→항상 lead 스테이지)·EditDrawer·stalled 필터·Guru 진단·팔로업 큐 추가 |
| Cases | CRUD·SegmentedControl 필터 |
| Accounts | 리스트 + 360 DetailPanel(HealthDot·ContactMenu 드롭다운·LogComposer·QuickActions·노트 핀·eeoCRM) |
| 팔로업 엔진 | `getFollowups` 완성(채널=전화/DM/방문/카톡, 실제 모션). followups.jsx에 원클릭 outcome 로그 O |
| 활동 로그 | `recordActivity` 완성(call/meeting/demo/visit/note…). LogComposer는 **Accounts 전용** |
| 프리미티브 | Badge·Kbd·Drawer·EditDrawer·SegmentedControl·**Checkbox**·Input(onKeyDown)·ContactMenu(우클릭 메뉴 패턴) |

**사용성 갭(코드 실측)**
1. 칸반 빈 컬럼 클릭 → 그 스테이지에 바로 딜 생성 **없음**(항상 lead 스테이지 + 드로어).
2. 리드/케이스 **인라인 빠른 추가 없음**(드로어 왕복).
3. **키보드 단축키 0**(⌘K는 페이지 이동만).
4. 카드/행 **우클릭 컨텍스트 메뉴 없음**, ⌘K에 **즉석 CRM 액션 없음**.
5. **일괄 선택·일괄 작업 없음.**
6. 원클릭 채널 로그가 followups 페이지에만, **카드/리스트엔 없음**. 스누즈·next_action 쓰기 없음.
7. 저장된 뷰(자주 쓰는 필터) 없음.

---

## 2. 목표 / 비목표

**목표:** Revenue 표면의 (a) 빠른 생성·편집 손맛, (b) 키보드·컨텍스트 메뉴·⌘K 액션, (c) 활동·팔로업을 카드/큐에 배선, (d) 일괄 작업·저장된 뷰 — 를 **기존 인프라 위에 얹어** 추가.

**비목표:** eeoCRM/Supabase 스키마 변경(가능한 한 마이그레이션 0), 회사 CRM(`classin_home`) 로직, 새 top-level 탭(캐논 탭 IA 존중), LLM 통화분석/요약, 팔로업 스코어링 알고리즘 재설계.

---

## 3. 단계 설계 (의존성 순서 — 각 단계 독립 shippable)

### Phase 1 — 손맛 기반 + 선택 모델
> 매일 마찰 최대. 여기서 만드는 **선택 모델**이 Phase 2(컨텍스트 메뉴)·4(일괄)의 토대.

- **칸반 빈 컬럼 빠른 생성:** 각 스테이지 컬럼 하단에 "+ 딜" 인라인 입력 → 제목 타이핑 → Enter로 **그 스테이지에** 생성. `createDeal`을 `createDealInStage(stageKey)`로 리팩터(기존 로직 재사용, 기본 stage만 파라미터화). Esc 취소.
- **리드/케이스 인라인 빠른 추가:** 리스트 상단 "+ " 행 → 이름 Enter → 최소 레코드 즉시 생성·persist(드로어 왕복 제거). 생성 후 행 클릭 시 기존 드로어로 확장.
- **드로어 ⌘Enter 저장 / Esc 취소:** EditDrawer/Drawer에 키 핸들러(현재 없음).
- **선택 모델 + 기본 단축키(`useCrmKeyboard` 훅, 신규):**
  - `J`/`K` 카드·행 선택 이동, `E` 편집(선택 → 드로어), `N` 새로(페이지 문맥: Deals=딜, Leads=리드, Cases=케이스), `/` 검색 포커스, `1–5` 선택 딜 스테이지 이동, `?` 단축키 오버레이(Kbd 프리미티브 재사용), `Esc` 선택 해제/닫기.
  - **스코프:** 활성 CRM 페이지에서만. `input/textarea/select`·드로어 열림 중엔 비활성(단 ⌘Enter·Esc는 예외). 포커스 링 `outline: 1px solid var(--moon-300)`(DESIGN.md).
- **쓰기 변경:** 없음(기존 create/update 재사용).
- **파일:** `revenue.jsx`(Leads/Deals/Cases), 신규 `components/hub/use-crm-keyboard.js`, 신규 `ShortcutOverlay`(작은 컴포넌트).

### Phase 2 — 컨텍스트 메뉴 + ⌘K CRM 액션
- **우클릭 컨텍스트 메뉴(카드·행):** `ContactMenu` 드롭다운 패턴을 일반화한 `ContextMenu`. 항목: 편집 / 스테이지 이동(딜) / 딜 전환(리드) / 팔로업 큐 / Guru 진단 / 삭제. `onContextMenu`로 위치 앵커.
- **⌘K 즉석 CRM 액션:** `hub-command-palette.jsx`에 실행형 액션 추가 — "새 리드", "새 딜", "활동 기록", "리드로 점프…"(이름 부분검색). 현재 `Action` 항목은 라우팅만 → 콜백 실행 or 딥링크(`?new=`/`?lead=`) 방식으로. 팔레트가 페이지 액션에 접근하려면 얇은 액션 레지스트리 or 딥링크 컨벤션 사용(딥링크 우선 — 기존 `?lead=`/`?new=` 패턴 재사용).
- **쓰기 변경:** 없음.
- **파일:** `revenue.jsx`, `hub-command-palette.jsx`, `hub-app.jsx`(팔레트 액션 배선 시).

### Phase 3 — 활동·팔로업 카드 배선
- **카드/드로어 원클릭 채널 로그:** Lead/Deal 드로어(+카드 호버 액션)에 `전화·DM·방문·카톡` 버튼 → 기록 + `next_action` 갱신 + **스누즈**(다음 팔로업일). LogComposer를 Lead/Deal에도 확장(Accounts 전용 해제).
- **"오늘 팔로업" 스트립:** `getFollowups()`를 Overview·Deals 상단에 요약 스트립으로 끌어올림(overdue/dueToday). 각 항목 채널 원클릭 + 스누즈. followups.jsx의 로그 UI 재사용.
- **두 로깅 시스템 화해(핵심 결정):** 카드 원클릭 로그는 **`outreach_outcomes`(스코어링 신호, 내일 우선순위 반영 — followups.jsx가 이미 사용) + `crm_activities`(타임라인 가시성, DrawerTimeline이 읽음)** 둘 다 기록. followups.jsx의 기존 outcome-only 로그와 동작 통일.
- **쓰기 변경(필수):**
  - `buildLeadWrite` += `next_action`(leads.next_action **컬럼**, mapLead가 이미 읽음) + `meta.snooze_until`.
  - `buildDealWrite` += `meta.next_action` + `meta.snooze_until`(deals엔 next_action 컬럼 없음 → meta).
  - `followups-ledger.js` `getFollowups`: `meta.snooze_until`가 미래면 overdue에서 제외(스누즈 존중). **팔로업 엔진 손대는 유일한 지점.**
  - 마이그레이션 **없음**(모두 기존 컬럼 or meta).
- **파일:** `revenue.jsx`, `revenue-write.js`, `followups-ledger.js`, `followups.jsx`(로그가 crm_activities도 기록하도록).

### Phase 4 — 일괄 작업 + 저장된 뷰
- **멀티선택:** Checkbox(호버 노출) + Shift-클릭 범위 + `X`(선택 토글) 단축키. Phase 1 선택 모델 확장(단일 → Set).
- **일괄 바(하단 고정):** 스테이지 변경(딜) · 태그 추가(region/scale/situation) · 팔로업 큐 · 삭제. 부분 패치 **루프**(칸반 이동과 동일 경로), 낙관적 업데이트 + 결과 토스트.
  - **담당(owner) 일괄은 1차 보류** — `owner_id` 소스(내 user id) 불확실 + buildWrite가 의도적으로 owner 미터치. 확인 후 별도. (열린 질문 §7)
- **저장된 뷰:** 필터 조합(workspace+stage+search+sort)을 **localStorage**(`mlp.revenue.views`, 밀도·테마 저장 패턴과 동일)에 저장·칩 전환. 마이그레이션 없음.
- **쓰기 변경:** 태그 일괄은 buildLeadWrite 기존 meta 필드 재사용(추가 없음). 삭제/스테이지 기존 경로.
- **파일:** `revenue.jsx`, 신규 `BulkBar`·`SavedViews` 소형 컴포넌트.

---

## 4. 핵심 설계 결정

1. **선택 모델 SSOT:** 페이지별 `selectedId`(단일, Phase 1) → `selectedIds: Set`(Phase 4). 한 훅(`useCrmSelection`)에서 관리, 키보드·컨텍스트 메뉴·일괄이 공유.
2. **단축키 스코프:** CRM 페이지 한정, 입력/드로어 중 비활성(⌘Enter·Esc 예외). 전역 ⌘K와 충돌 없음.
3. **스누즈 = `meta.snooze_until`**(ISO date). 마이그레이션 0. getFollowups가 존중.
4. **next_action 쓰기:** 리드=`next_action` 컬럼, 딜=`meta.next_action`.
5. **로깅 이중기록:** outreach_outcomes(신호) + crm_activities(타임라인). 카드/큐/followups 페이지 동작 통일.
6. **저장된 뷰 = localStorage.** 개인 콕핏, 마이그레이션 없음.
7. **owner 일괄 보류.** owner_id 소스 확정 전까지 stage/tag/queue/delete 일괄만.
8. **DESIGN.md 준수:** 문스톤 팔레트·헤어라인·흰 카드 금지·포커스 링 `--moon-300`. 기존 프리미티브 우선.

---

## 5. 제약 & 품질 게이트

- **mock/live 안 섞음** — preview 빈 상태 유지, 신규 UI도 preview에서 빈/비활성.
- **마이그레이션 0 목표** — 전부 기존 컬럼 or meta or localStorage.
- **기존 프리미티브·헬퍼 재사용** — 신규 raw `<div>`는 프리미티브가 안 맞을 때만.
- **완료 게이트(각 Phase):** `npm run lint`(or eslint 범위) + `npm run build` 통과 + preview 라이브 검증(에러 0, 빈 상태 처리).
- **각 Phase 독립 shippable** — 로컬 main 머지, 푸시는 수동(사용자 규칙).

---

## 6. 검증 계획

- Phase별: preview_start → 상호작용(빈칸 생성·인라인 추가·단축키·드래그·우클릭·일괄) → preview_snapshot/inspect로 확인 → 스크린샷.
- 키보드: J/K/E/N/1-5/?/Esc 각 경로 수동 시나리오. 입력 중 비활성 확인.
- 쓰기: 생성/스테이지/스누즈/next_action이 Supabase에 반영되는지(라이브) or preview 낙관적 유지 확인.
- 회귀: 기존 드래그-드롭·명함 intake·딜 전환·Guru 진단 무손상.

---

## 7. 열린 질문

1. **owner 일괄 담당:** `owner_id`에 쓸 내 user id 소스가 있는가(resolveDefault…Owner)? 없으면 Phase 4 owner 일괄은 제외.
2. **로그 이중기록 OK?** 카드 원클릭이 outreach_outcomes + crm_activities 둘 다 기록하는 방향으로 확정해도 되는지(아니면 outcomes만).
3. **⌘K 액션 배선 방식:** 딥링크(`?new=`/`?lead=`) 재사용 vs 얇은 액션 레지스트리 — 딥링크 우선 제안.

---

*근거: 레포 실측 2026-07-07. 값의 정본은 각 소스 파일이며, 이 스펙은 사실이 바뀌면 갱신 대상이다.*
