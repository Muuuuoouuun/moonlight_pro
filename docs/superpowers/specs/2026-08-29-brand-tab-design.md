# 브랜드 탭 설계 — 브랜드를 콘텐츠 필터에서 운영 대상으로

> 상태: **P0·P1 구현됨 / P2~P5 제안**. 운영자가 2026-08-29 D1을 (A) 화면에서 숨김으로 확정하고 P0+P1 연속 구현을 지시했다.
> 작성일: 2026-08-29 (Asia/Seoul) · 구현 반영 2026-08-29
> 상위 정본: `DESIGN.md`, `docs/operator-workflow-profile.md`
> 관계:
> - `2026-07-15-sidebar-second-level-and-pms-taxonomy.md` §4(PMS 분류 3종)를 **부분 대체**한다. `sns-channel` 분류를 PMS 축에서 분리하고 브랜드 탭으로 옮긴다. 아코디언 동작 계약(§3)과 상단 3표면 경계(§2.2)는 그대로 유지한다.
> - `docs/content-os-deep-plan.md` §9(브랜드별 템플릿)의 소유 화면을 브랜드 탭으로 확정한다.
> - 소셜 API 수집(§7)은 Phase 2이며 Phase 1B·1C 완료 전에 먼저 구현하지 않는다.

---

## 1. 배경 — 운영자 지적 3건

1. **"브랜드 = 콘텐츠가 되는 게 이상하다."** 안 맞고 안 쓰인다.
2. **"브랜드별 관리가 더 철저하고 분리돼야 한다."**
3. **"프로젝트·타임라인·PMS에서의 브랜드 관리가 비효율적이고, 갑자기 확 많아져서 집중력을 떨어뜨린다."** 빅 브랜드 일정은 프로젝트로 관리되면 충분하다.

---

## 2. 진단 — `brands` 테이블 하나가 네 역할을 겸직한다

| 역할 | 소비처 | 현재 상태 |
|---|---|---|
| PMS 컨테이너(폴더) | `projects.brand_id` → `pages/projects.jsx` 트리 | 프로젝트 0건인 채널 9개가 항상 폴더로 렌더 |
| 콘텐츠 레인 | `content_items.brand_id` → Studio/Queue 브랜드 드롭다운 | 브랜드가 **필터로만** 보임 |
| 정체성·가드레일 | `brands.meta` | **화면이 없다.** `lib/sales-os/brand-context.js`가 AI 프롬프트로만 읽음 |
| 워크스페이스 소속 | `meta.org_scope` → `workspace-map.js` | 스코프 셸과 얽힘 |

### 2.1 "브랜드 = 콘텐츠" 착시의 실제 원인

`brands.meta`에는 브랜드당 이미 다음이 들어 있다 (마이그레이션 `20260427_0004`):

```
philosophy · direction · voice · cadence · keywords ·
channels · source_links · content_rules · forbidden_terms · glyph · order
```

즉 **브랜드의 실체는 이미 DB에 있는데 볼 수 있는 화면이 하나도 없다.** 운영자가 브랜드를 만날 수 있는 유일한 지점이 "Studio의 드롭다운"과 "PMS의 폴더"뿐이라, 브랜드가 콘텐츠의 태그로 축소됐다. 지적 ①은 UI 부재의 증상이지 개념 오류가 아니다.

### 2.2 PMS 소음의 실제 원인

PMS 트리는 `분류(폴더) → 컨테이너(브랜드) → 프로젝트` 3단이다.
- 빈 **폴더**는 렌더하지 않지만, 빈 **컨테이너**는 항상 렌더한다.
- 현재 컨테이너 9개가 전부 `sns-channel`이다 (`operating-ledger.js:30-40`).
- 결과: 프로젝트가 없는 채널 9줄이 실제 일보다 먼저 보인다. → 지적 ③.

축이 두 개 섞였다. PMS는 **일(work)** 축인데 **채널(identity)** 축이 같은 트리에 들어와 있다.

---

## 3. 확정할 경계 (제안)

**브랜드는 PMS 컨테이너가 아니고, 콘텐츠 필터도 아니다. 브랜드는 운영 대상 그 자체다.**

`DESIGN.md`의 상단 3표면 경계 계약과 같은 방식으로 단일 책임을 못박는다.

| 표면 | 라우트 | 단일 책임 | 시간축 | 하지 않는 것 |
|---|---|---|---|---|
| **브랜드** | `dashboard/brands` | **정체성 · 리듬 · 기록** — 이 브랜드는 무엇이고, 어떤 규칙으로, 어떤 주기로 움직이며, 무슨 일이 있었나 | 브랜드 수명 전체 | 태스크 보드, 프로젝트 단계 관리 |
| **프로젝트** | `dashboard/work/projects` | **일의 구조** — 컨테이너 → 프로젝트 → 태스크 | 프로젝트 기간 | 브랜드 정체성 보관 |
| **콘텐츠** | `dashboard/content/*` | **제작** — 아이디어 → 초안 → 발행 | 개별 콘텐츠 | 브랜드 규칙 소유(읽기만) |

**중복 회피 규칙:** 같은 브랜드가 세 표면에 나와도 목적이 달라야 한다.
- 브랜드 탭 → "시나브로는 이번 주 2/3편, 12일째 조용함"
- 프로젝트 → "시나브로 시집 출간 프로젝트, 3단계 중 2단계"
- 콘텐츠 → "이 초안은 시나브로 보이스를 따른다"

**브랜드 ↔ 프로젝트 연결은 유지한다.** 운영자 말대로 빅 브랜드 일정은 프로젝트로 관리된다. 바뀌는 것은 방향이다 — PMS가 브랜드를 폴더로 품는 게 아니라, **브랜드 탭이 `projects.brand_id`로 "이 브랜드의 프로젝트"를 조회**한다. 새 컬럼이 필요 없다.

---

## 4. Phase 0 — PMS 브랜드 초기화

목표: 프로젝트 화면에서 브랜드 소음을 0으로 만들고, 필요할 때 저절로 다시 나타나게 한다.

| # | 변경 | 파일 | 크기 |
|---|---|---|---|
| P0-1 | **빈 컨테이너 숨김.** PMS 트리는 `projects > 0 \|\| open > 0`인 컨테이너만 렌더. 하단에 `숨긴 컨테이너 N개 보기` 토글 1줄(`EmptyState` 아님, 인라인 ghost 버튼). | `pages/projects.jsx` `brandGroups` | S |
| P0-2 | **컨테이너 분류에서 `SNS 채널` 제거.** 생성/편집 드로어 옵션은 `KA·딜` / `일반` 2종. 기존 `sns-channel` 행은 **지우지 않고** PMS 기본 축에서만 빠진다. | `pages/projects.jsx:92,2308` | S |
| P0-3 | **트리 기본 접힘.** `sns-channel` 컨테이너는 프로젝트가 생겨 다시 나타나도 기본 접힘 상태로 들어온다. | `pages/projects.jsx` 접힘 기본값 | XS |
| P0-4 | **Roadmap(타임라인) 브랜드 필터 1개 추가.** 프로젝트가 정본이므로 P0-1만으로도 조용해지지만, 브랜드 하나만 보는 렌즈를 남긴다. | `pages/work.jsx` `Roadmap` | S |

**"나중에 생성 시에 되도록"의 구현:** 컨테이너를 지우는 게 아니라 **빈 컨테이너를 안 그리는 것**이다. 프로젝트를 하나 만들면 그 컨테이너가 자동으로 트리에 복귀한다. 별도 재생성 절차가 필요 없다.

### 4.1 데이터를 지우지 않는 이유 — 결정 필요

`brands` 행을 실제로 삭제하면 §2.1의 `meta`(철학·보이스·규칙·금지어)가 함께 사라진다. 그건 브랜드 탭이 쓸 유일한 재료다. 또 `content_items.brand_id`, `campaigns.brand_id`, `projects.brand_id`가 전부 `on delete set null`이라 기존 콘텐츠의 브랜드 소속도 끊긴다.

> **결정됨 (D1, 2026-08-29):** (A) 화면에서 숨김. `brands` 행은 삭제하지 않는다.

### 4.2 P0 구현 결과 (2026-08-29)

| # | 구현 | 위치 |
|---|---|---|
| P0-1 | 컨테이너 트리를 순수 함수 `buildContainerTree`로 분리하고 빈 컨테이너를 숨김. 사이드바·헤더 드롭다운 양쪽에 `숨긴 컨테이너 보기 N` 토글(localStorage 영속). | `lib/pms-ui.js`, `pages/projects.jsx` |
| P0-2 | 컨테이너 생성/편집 분류 옵션에서 `SNS 채널` 제거(`CONTAINER_CATEGORY_OPTIONS`). 이미 그 분류인 컨테이너를 편집할 때만 현재 값이 옵션으로 되살아난다. | `pages/projects.jsx` |
| P0-3 | `sns-channel` 폴더는 저장된 선호가 없으면 접힌 채로 시작. 이 과정에서 `toggleFolder`가 저장값 `undefined`를 뒤집지 못해 **첫 클릭이 먹지 않던 버그**를 함께 고쳤다(현재 표시 상태를 기준으로 반전). | `pages/projects.jsx` |
| P0-4 | Roadmap에 브랜드 렌즈 추가. `work-ledger`가 `brands`를 읽고 `projects.brand_id`를 매핑하며, 브랜드 읽기 실패는 `failedSources`에 넣지 않는다 — 렌즈가 없어도 타임라인은 온전하다. | `lib/repositories/work-ledger.js`, `lib/pms-ui.js`, `pages/work.jsx` |
| P0-5 | **브랜드 소유 컨테이너의 PMS 편집 차단**(아래 D6). 편집 아이콘 대신 브랜드 탭 딥링크. | `pages/projects.jsx` |

검증: `buildContainerTree` 6건 + Roadmap 렌즈 3건 단위 테스트 추가, 저장소 전체 374/374 통과.

---

## 5. 브랜드 탭 IA

### 5.1 라우트

| 경로 | 화면 | 상태 |
|---|---|---|
| `dashboard/brands` | 브랜드 목록 | ✅ P1 |
| `dashboard/brands?b=<slug>` | 특정 브랜드 상세 딥링크 | ✅ P1 |
| `dashboard/brands?scope=classin\|personal` | 스코프 필터 | ✅ P1 |
| `dashboard/brands/calendar` | 전 브랜드 통합 발행 캘린더 | P3 |
| `dashboard/brands/channels` | 채널 연결 상태 (IG · Threads · YouTube) | P5 |

목록 ⇄ 상세는 **같은 라우트의 두 상태**로 구현했다(마스터-디테일 aside 아님). 모바일에서
`.hub-workspace-shell > aside`가 통째로 숨겨져 브랜드를 바꿀 방법이 사라지기 때문이다.

**복수형 `brands`인 이유:** `dashboard/brand/*`는 이미 "개인 스코프 별칭"(`brand/projects`, `brand/studio`, `brand/queue`)으로 점유돼 있다. 충돌을 피하려면 새 네임스페이스가 필요하다.

> **후속 정리 제안:** 새 브랜드 앵커가 생기면 `dashboard/brand/projects`가 "개인 스코프 프로젝트"를 뜻하는 건 혼동이다. 나중에 `dashboard/personal/*`로 개명하고 구 경로는 북마크 호환으로 남긴다. 이번 범위에는 넣지 않는다.

### 5.2 사이드바

`SIDEBAR_PRIMARY`에 앵커 추가 — **프로젝트 다음, 콘텐츠 앞**. 브랜드가 콘텐츠와 붙어야 한다는 요구를 인접 배치로 만족시키되 표면은 분리한다.

```
오늘 · 현황 · 내 작업 · 영업·매출 · 고객 연락 · 프로젝트 · [브랜드] · 콘텐츠
```

- `icon: 'brand'` — `hub-icons.jsx:64`에 이미 존재
- `scopeAware: true` — 3단 스코프(전체/ClassIn/개인)가 `orgScope`로 브랜드 목록을 거른다. `classmoon`·`studyseagull`·`classin_side`만 ClassIn, 나머지는 개인.
- children: `브랜드` / `발행 캘린더` / `채널 연결` (3개이므로 아코디언 렌더됨)
- `hub-data.js`의 `NAV_TREE` ⌘K 카탈로그에도 등록

앵커 세트는 고정 계약이 아니다 (2026-07-15 스펙 §3.1, 운영자 정정). 비효율이 파악되면 추가한다는 그 조항이 이번 케이스다.

---

## 6. 브랜드 목록 — `dashboard/brands`

한 줄에 한 브랜드. 기본 정렬은 **"지금 손이 필요한 순"** (조용한 기간 ÷ 브랜드 cadence 목표).

| 열 | 내용 | 데이터 출처 |
|---|---|---|
| 브랜드 | 단색 글리프 + 이름 + 한 줄 정체성 | `brands.name` · `meta.glyph` · `description` |
| 리듬 | `이번 주 2/3` + 최근 8주 스파크라인 | `buildCadence` (브랜드별로 분해 필요) |
| 마지막 발행 | `12일 전` | `content_items.published_at` / `publish_logs` |
| 대기 | `아이디어 4 · 초안 1 · 예약 2` | `content_items.status` |
| 채널 | IG · TH · YT 글리프 + 연결 상태 | `meta.channels` + `/api/social/*/status` |

**상태 문법 (DESIGN §5.3 준수)**
- **조용함은 danger가 아니다.** `n일 조용함` + pause 글리프 + 중립 톤. 붉은색은 "지연·실패로 실제 손실"일 때만 — 브랜드 탭에서 danger는 *발행 실패(`publish_logs.status = 'failed'`)* 와 *예약 시각이 지났는데 미발행* 두 가지뿐.
- red-budget: 목록 전체에서 강한 붉은 영역 3개 이하. 초과 시 섹션 헤더에 집계 카운트 + 행에는 작은 글리프.
- 정체성이 비어 있는 브랜드(철학·보이스 미입력)는 `CertaintyBadge state="unknown"` + `확인 필요`.

**인터랙션 (DESIGN §8.1)**
- 헤더에 primary `새 브랜드` + `<Kbd>N</Kbd>`
- 행 클릭 → 우측 상세 (`role="button" tabIndex={0}` + Enter/Space)
- 행 hover는 `.hub-row`
- 빈 상태 → `EmptyState` + `첫 브랜드 만들기`

---

## 7. 브랜드 상세 — 5개 탭

`SegmentedControl` primitive. 기본 탭은 **정체성**.

### 7.1 정체성 (Identity)

**이 탭이 이번 작업의 가장 큰 해금이다.** DB에만 있던 것을 처음으로 화면에 올린다.

| 필드 | 소스 | 편집 |
|---|---|---|
| 철학 | `meta.philosophy` | 인라인 textarea |
| 방향 | `meta.direction` | 인라인 textarea |
| 보이스 | `meta.voice` | 인라인 textarea |
| 발행 리듬 | `meta.cadence` + **주당 목표 발행 수(신규)** | select + number |
| 키워드 | `meta.keywords[]` | 칩 추가/삭제 |
| 콘텐츠 규칙 | `meta.content_rules[]` | 리스트 편집 |
| 금지어 | `meta.forbidden_terms[]` | 리스트 편집 |
| 채널·링크 | `meta.channels[]` · `meta.source_links[]` | 리스트 편집 |

- 저장: 기존 `PATCH /api/hub/brands` → Engine `update_brand`. `meta` 병합 필드 확장 필요.
- 저장 봉투는 `{ ok, status }` — `saved` / `preview` / `error` (§8.1).
- **주당 목표 발행 수는 신규 필드다.** 현재 `buildCadence(items, goal = 5)`가 전역 하드코딩이라 브랜드별 리듬(저빈도 고품질 vs 고빈도 확산)을 표현하지 못한다. `meta.weekly_goal`을 읽도록 바꾼다.

이 탭이 **Studio 가드레일과 AI brand-mentor의 공통 정본**이 된다 → "AI가 보는 것 = 내가 보는 것".

### 7.2 스케줄 (Schedule)

브랜드 하나의 발행 캘린더. 운영자 요구 "브랜드별 스케줄"의 본체.

- **주간 그리드 (7일 × 채널)**, 4주 전환 가능
- 셀 내용: 예약된 `content_items`/`content_variants`(`scheduled_at`), 발행 완료, 빈 슬롯
- 상단 요약: `이번 주 2/3 · 다음 발행 목 09:00`
- **빈 슬롯 클릭 → Studio 신규 생성** (`dashboard/content/studio?brand=<key>&scheduled=<iso>&new=1`). `brandParam`·`newParam`은 Studio에 이미 구현돼 있다 (`content.jsx:213-215`).
- **프로젝트 겹쳐보기:** 이 브랜드에 연결된 프로젝트의 마감·마일스톤이 같은 캘린더에 얇은 1px 줄로 읽기 전용 표시. 클릭 → PMS 딥링크.
  → 운영자가 말한 "빅 브랜드 일정은 프로젝트로 관리"의 접점. 관리는 PMS, **보기는 브랜드 캘린더**.

### 7.3 기록 (Record)

브랜드 하나의 시간순 원장. 지금 네 곳에 흩어진 것을 한 줄로 모은다.

| 소스 | 조인 경로 |
|---|---|
| 발행 로그 (성공·실패·채널·URL) | `publish_logs` → `content_variants` → `content_items.brand_id` |
| 콘텐츠 상태 변경 | `content_items` (idea → draft → published) |
| 프로젝트 업데이트 | `project_updates` → `projects.brand_id` |
| 결정 | `decisions` → `projects.brand_id` |

- **새 테이블 없이 기존 원장 조인으로 시작한다.**
- **운영자 수기 메모(브랜드 저널)만 갈 곳이 없다.** `notes`는 `project_id`만 있고 `brand_id`가 없다 (`schema.sql:75`).
  → 작은 마이그레이션 1개: `alter table notes add column brand_id uuid references brands(id) on delete set null;` + 인덱스. `meta.journal[]` 배열보다 이쪽이 맞다(조회·정렬·삭제가 정상 동작).

### 7.4 콘텐츠 (Content)

- 이 브랜드의 아이디어함 / 초안 / 예약 / 발행 — Queue의 브랜드 슬라이스
- primary CTA: `이 브랜드로 새 콘텐츠` → Studio 딥링크
- 목록은 Queue 컴포넌트를 브랜드 prop으로 재사용 (인라인 재구현 금지, §8.1)

### 7.5 성과 (Performance) — Phase 2

- 지금은 **정직한 preview**: `TruthBadge state="preview"` + `Preview · 연결 필요` + 연결 버튼. **mock 숫자 금지.**
- 연결 후 지표는 운영자가 확인한다고 답한 3개로 한정 (`operator-workflow-profile.md:463`): **조회 수 · 공유 수 · 답글·문의 수**. 조회 수는 도달의 선행 신호로 쓰되 공유·문의는 별도 추적.
- 복잡한 점수·추천 분석은 하지 않는다 (프로필 §후속 범위: "초기에는 필요하지 않다").

---

## 8. 콘텐츠 제작소와의 결합

현재 Studio는 브랜드를 드롭다운 필터로만 쓴다. 세 지점을 연결한다.

1. **가드레일 노출.** Studio에서 브랜드를 고르면 보이스·규칙·금지어가 접이식 패널로 보인다. 지금은 AI만 본다(`brand-context.js`의 `brandGuardrail`). 초안에 금지어가 들어가면 인라인 힌트 — 차단은 하지 않는다.
2. **브랜드별 템플릿.** `content-os-deep-plan.md` §9가 정의한 `brand_key` / `variant_type` / `template_id` / `export_profile`을 **브랜드 탭에서 지정** → Studio template selector가 자동 선택. 템플릿 팩 자체는 운영자가 별도 제공(같은 문서 §미정 1).
3. **양방향 딥링크.** 브랜드 탭 → Studio(브랜드 시드) / Studio 브랜드 선택기 옆 `규칙 보기` → 브랜드 탭.

---

## 9. Phase 2 — 인스타그램 · 유튜브 API

이미 있는 것 / 없는 것을 구분한다.

| 채널 | 현재 상태 |
|---|---|
| Instagram | `/api/social/instagram/{connect,callback,status}` **구현됨** (OAuth + 연결 상태) |
| Meta Threads | `/api/social/meta/threads/{connect,callback,status}` **구현됨** |
| YouTube | **없음.** 신규 구현 필요 |

**수집 설계**
- 연결 단위를 **브랜드**로 만든다. 지금 `resolveInstagramApiConfig()`는 env의 단일 `brandHandle`을 쓴다 → 브랜드별 계정 매핑으로 확장.
- 매칭 키는 이미 있다: `publish_logs.external_id` + `target_url`. 발행한 콘텐츠와 플랫폼 게시물을 연결할 수 있다.
- 수집 주기는 cron (`/api/cron/content-flywheel` 패턴 재사용).

**"한번에 분석이나 컨텐츠 다듬기"**
- 성과 상위 콘텐츠 → Studio `이 형식으로 재가공` 제안. 운영자의 재생산 루프(Threads → Instagram → Shorts, `operator-workflow-profile.md:466`)와 정확히 맞는다.
- brand-mentor AI 입력에 실제 성과를 추가 → 조언이 추측이 아니라 데이터 기반이 된다.

**게이트:** Phase 1B(Action Desk) · 1C(Contact Outcome) 완료 전에 착수하지 않는다 (`docs/README.md` §3).

---

## 10. 구현 순서

| 단계 | 내용 | 크기 | 효과 |
|---|---|---|---|
| **P0** | ✅ **완료** PMS 빈 컨테이너 숨김 + SNS 분류 제거 + Roadmap 브랜드 필터 | S | **지적 ③ 즉시 해소** |
| **P1** | ✅ **완료** 브랜드 탭 셸 — 라우트 · 사이드바 앵커 · 목록 · 정체성 탭(읽기) · 브랜드 생성 | M | 지적 ① 해소 시작 |
| **P2** | 정체성 편집(`update_brand` meta 확장, `meta.weekly_goal`) + Studio 가드레일 패널 | M | 브랜드가 실제로 콘텐츠를 지배 |
| **P3** | 스케줄 탭 (브랜드 캘린더 + 빈 슬롯 → Studio 시드 + 프로젝트 겹쳐보기) | M | 지적 ②의 "스케줄" |
| **P4** | 기록 탭 (원장 조인 + `notes.brand_id` 마이그레이션) | M | 지적 ②의 "기록" |
| **P5** | 성과 탭 + IG/Threads 브랜드별 연결, YouTube 신규 | L | Phase 2 |

**P0만으로도 운영자가 말한 "집중력 저하"는 바로 사라진다.** P1~P2가 "브랜드 = 콘텐츠" 착시를 없앤다.

---

## 11. 디자인 준수 체크

- 색: `hub-tokens.css` 토큰만. 브랜드 식별에 색을 쓰지 않는다 — 글리프 + 이름 (§5.2 "색은 카테고리를 분류하지 않는다"). 기존 `brands.color_hex`가 전부 `#5274a8` 동일값인 것도 이 원칙과 일치한다.
- 보더 1px 고정. 상태 강조는 `--*-line` 좌측 inset 스트라이프.
- 숫자: 발행 수·목표 같은 큰 지표는 `.stat`, 날짜·핸들·ID는 `.mono`.
- primitives 우선: `SegmentedControl`(탭) · `TruthBadge`(연결/preview) · `EmptyState` · `EditDrawer`(브랜드 생성/편집) · `Checkbox(label)`. 인라인 재구현 금지.
- 페이지당 `<h2>` 정확히 1개.
- 모바일 우선. 마스터-디테일은 모바일에서 목록 → 상세 풀스크린 전환.

---

## 12. 열린 결정

| # | 질문 | 권장 |
|---|---|---|
| D1 | "브랜드 항목 초기화" = 화면에서 숨김(A) vs DB 행 삭제(B) | **A** — `meta` 정체성이 브랜드 탭의 재료다 |
| D2 | 브랜드 탭이 사이드바 최상위 앵커인가, 콘텐츠의 하위인가 | **최상위** — 운영자가 "따로"라고 명시 |
| D3 | 브랜드별 주당 목표 발행 수를 지금 넣는가 | **P2에 포함** — 전역 `goal=5`로는 저빈도/고빈도 브랜드를 같이 못 본다 |
| D4 | `dashboard/brand/*` 개인 스코프 별칭 개명 | 이번 범위 밖. 별도 정리 |
| D5 | 브랜드 저널을 `notes.brand_id`로 갈 것인가 `meta`로 갈 것인가 | **`notes.brand_id`** — 마이그레이션 1줄, 조회·정렬 정상 |
| **D6** | **Engine `update_brand`가 `brands.meta`를 통째로 교체한다** (`apps/engine/lib/pms-command.ts:473`). patch가 `{category, org_scope, source, glyph}`만 담으므로, 저장하면 철학·보이스·규칙·금지어·키워드·채널이 지워진다. P0에서 PMS의 브랜드 컨테이너 편집을 막아 유일한 노출 경로를 닫았지만, **P2(정체성 편집) 전에 meta 병합으로 고쳐야 한다.** 읽고-병합해서 쓰거나 `meta = meta \|\| patch` RPC. | **P2의 첫 작업** |
