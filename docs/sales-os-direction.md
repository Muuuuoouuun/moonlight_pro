# Sales OS — 방향성 & 설계 지침 (SSOT)

> 상태: ACTIVE DOMAIN REFERENCE — 2026-07-13 이후 운영자 사실과 데이터 소유권은 `docs/operator-workflow-profile.md`와 Personal Operator OS 심화 설계가 우선한다.
> Sales OS 내부 결정의 참조 문서다. 구현·리뷰 전 `docs/README.md`의 문서 우선순위를 먼저 확인한다.
> 최종 갱신: 2026-06-17 · 설계 문서: `~/.gstack/projects/Muuuuoouuun-moonlight_pro/clmagi-codex-moonlight-p0-hardening-design-20260617-230521.md` (APPROVED, supersedes 155433)

---

## 1. 한 줄 정의 & 목표

ClassIn 플랫폼을 학원·기관에 파는 B2B 영업자(문준혁)의 **개인 세일즈 운영체제.** 기존 Moonlight
Hub/Engine/Supabase 위에 얹는다(신규 구축 아님).

목표 우선순위: ① **회사에서 1등** → ② 회사 성장 → ③ 자동화 → ④ 시스템 실험.
핵심 지표: **신규 계약 5배 · 주간 콘텐츠 생산 5배.** LTV는 보류(신규 계약 우선).

---

## 2. 3개 표면(레포)의 역할 + 경계

| 레포 | 정체 | 역할 | 머신 위치 |
| ---- | ---- | ---- | --------- |
| **moonlight_proj** (이 레포) | 개인 세일즈 콕핏 | 콘텐츠 엔진·5팀 두뇌·자동화·시트 동기화. **구현은 여기.** | `~/Desktop/Projects/moonlight_proj` |
| **classin_home** | ClassIn 정보 + 사용자 담당 회사 프로젝트 | 회사 데이터의 집 + **ClassIn 메시징 SSOT**. moonlight가 *재구축 말고 읽음*. | `~/Desktop/Projects/classin_home` |
| **classinkr-web** | 회사 홈페이지(사용자 구축) | ClassIn 로직·팀 지향 시스템 참고 | ⚠️ **이 머신(clmagi)엔 없음** — 사용자 다른 머신(`bigmac_moon`)에 있음 |

**경계 규칙**
- **2026-07-13 우선 결정:** 처음에는 ClassIn/Neo CRM의 운영자 담당 고객을 가져오고, 이후 Moonlight를 개인 업무 정본으로 사용한다. ClassIn은 회사 공식 객체·공식 활동 요약의 정본으로 남으며, Moonlight의 개인 상세 메모는 보내지 않는다. 동기화는 우선 수동 버튼으로 없는 기록만 가져오고 공식 write는 outbox/승인 경계를 거친다.
- 아래 “재구축하지 않고 읽는다”는 문장은 초기 v1.4 결합 방향의 역사적 제약이다. 새 결정을 막는 제품 원칙으로 사용하지 않는다. 기존 자산 파악에는 계속 참고한다. 이미 classin_home에
  있는 것: `external_crm_records`(Xiaoshouyi 스냅샷), `crm_xiaoshouyi_owner_names`(문준혁=
  3935704427463307), `deals`(contact→quote→contract→confirmed→installation→payment→closed) + 금액/
  결제 상태, 퍼널 이코노믹스(노출→리드→…→고객, CPL/CPA/CPD/ROI), **채널별 광고비**(구글·메타·네이버·
  카카오·유튜브·오프라인).
- classin_home env는 다른 레포 → moonlight에서 직접 grep/읽기 금지(auto-mode 차단). 결합은 v1.4에서
  명시적으로(같은/연결 Supabase 직접 읽기 vs eeocrm MCP 라이브).
- **classinkr-web은 이 머신에 없음.** ClassIn 로직 근거가 필요하면 아래 §5의 classin_home 포지셔닝
  파일을 SSOT로 쓴다(classinkr-web과 동일 메시징). 굳이 classinkr-web을 보려면 그 머신에서 작업.

---

## 3. 실제 세일즈 모션 (사용자 "맞음" 확인)

```
[유입] 숏폼 소셜 콘텐츠(인스타 피드/카드뉴스 · 스레드/X 짧은글 · 릴스)
        + 인스타/메타 광고(브랜드·콘텐츠 도달)
   │        병목 ①소재/아이디어  ②발행 꾸준함     (초안·디자인은 병목 아님 — 잘 씀)
   ▼
[인바운드] 관심 리드가 인스타/스레드 DM으로 먼저 연락
   │   (별도로) 직접 발굴 = 네이버 등 수기 리스트업
   ▼
[컨택·진행]  전화/문자  →  방문/대면  →  (계약 고객) 카카오톡
   ▼
[전환] 딜 파이프라인 (classin_home stages 재사용)
   ▼
[관리] 제일 큰 잡무 = 팔로업 챙김(언제 누구에게 다시)   ← v1.2 타깃
```

리드 소스: **자가 발굴(수기) + 콘텐츠 인바운드** (회사 배정 아님).

---

## 4. 확정 결정 (인터뷰 기반)

| 영역 | 결정 |
| ---- | ---- |
| **채널** | **ClassIn 회사 업무엔 이메일 0.** 인바운드=인스타/스레드 DM, 진행=전화/문자→방문/대면→(고객)카톡. 발송·자료 레이어를 여기에 맞춤(기존 이메일 가정 폐기). |
| **콘텐츠** | 형식=인스타 피드/카드뉴스·스레드/X·릴스(블로그 X). 병목=**소재+꾸준함**(초안·디자인 아님). 엔진=*아이디어 큐 + 발행 케이던스*, 생성기 아님. |
| **광고** | 인스타/메타 — **브랜드·콘텐츠 확산용**(네이버 검색 직접 리드 아님). |
| **CRM** | 회사 Xiaoshouyi를 classin_home이 이미 동기화. moonlight는 내 담당(ownerId)을 *읽어와* 통합(v1.4). |
| **LTV** | **보류.** 지금은 신규 계약 수 집중. |
| **리드 발굴** | 자가(수기) + 콘텐츠 인바운드. 네이버 자동 수집은 PIPA/ToS 근거 확정 전 비활성. |
| **제일 큰 잡무** | 팔로업 챙김 → v1.2 우선. |

---

## 5. ClassIn 메시징 근거 (콘텐츠 엔진 grounding)

**SSOT(빌드 시 읽을 것):** `classin_home/lib/classin-positioning.ts` (코드 상수) +
`classin_home/docs/active/classin-korea-positioning-guidelines.md` + `classin-home/docs/active/prd.md`.
보조: `classin_home/data/blog-posts.json`, `data/chatbot-golden-set.json`,
`components/sections/CaseStudies.tsx`(7개: 청주·평택·부산·대치·대구·천안·온라인).

**카테고리 정의:** "학원 시스템 OS" — 전자칠판/녹화/EDB 교안/LMS/학생관리/관리자데이터를 *한 흐름*으로.
Zoom 대체재·전자칠판 스펙표로 설명하면 가치가 작아짐.

**핵심 내러티브(아이디어 큐 1순위 앵글):**
- **감이 아니라 기준으로** — 강사 개인기 → 기관 표준화 → 데이터 운영. (가장 강한 앵글)
- **표준화 · 자동화 · 데이터화** — 시대 전환 프레임.
- **흩어진 도구 → 하나의 수업 운영 흐름** — Zoom/전자칠판/LMS가 못 잇는 prep→teach→record→review→
  homework→admin 흐름.

**정량화된 고객 페인(콘텐츠 훅 소스):**
- 에이스 강사 퇴사 → 재등록률 20%↓
- 반별 성적 편차 → 연 1200만원 손실
- 신규 강사 3개월 적응 / 학부모 상담마다 같은 질문

**4대 가치:** 강사 리소스 절감 · 수업 품질 표준화 · 학생 경험 확장 · 관리자 운영 가시성.

**정직한 경계(신뢰 자산):** 결제·오프라인 출석·고급 리포트·CRM은 *대체 아님, API 연결*. "만능 관리
프로그램처럼 말하지 않는다"가 오히려 설득력. → rip-and-replace 공포 제거.

**상위 반론(콘텐츠가 깨야 할 것 = 큐 신호):** "Zoom이랑 뭐가 달라?" · "전자칠판 있는데 왜 또?" ·
"EDB가 뭐고 왜 필요?" · "도입하면 뭐부터?"(→90일 로드맵) · "가격 얼마?"(→리소스 절감으로 리프레임).

> 콘텐츠 아이디어 큐의 fallback ranker는 위 **앵글 × 반론 × 단계**를 `classmoon` `content_rules`(voice)와
> 교차해 점수화. classinkr-web 없이 이 grounding으로 v1.1 착수 가능.

---

## 6. 설계 제약 (DESIGN.md / CLAUDE.md 핵심)

- 다크 네이티브, `hub-tokens.css` 토큰만 — **하드코딩 색 금지**(문스톤 `#5274a8` 액센트, warm gold/그린/
  보라 금지). 보더 `1px`.
- Hub read API → `apps/hub/lib/repositories/`. Engine write/intake → shared/provider secret 검증.
  Hub→Engine 호출은 `COM_MOON_SHARED_WEBHOOK_SECRET`.
- Supabase 없는 환경은 명시적 preview/empty state — mock·live 혼합 금지.
- 외부 연동은 raw `fetch`(googleapis SDK 추가 금지) — 머지된 `google-sheets.js`/`google-oauth.js` 패턴.
- 컴포넌트는 `hub-primitives.jsx` 우선, 새 페이지는 `pages/`에 두고 `hub-app.jsx` PAGE_MAP + `hub-data.js`
  NAV_TREE 등록.
- **선플래그(부채):** `agents.jsx`가 팔레트 밖 색(`#ffaebb`/`#d4b5ff`/`#ffd68f`) 하드코딩 — 5팀
  오케스트레이션 확장 전 토큰화 필요. **v1.1은 agents.jsx 미터치 → 이 부채는 vNext.**

---

## 7. 로드맵

| 단계 | 내용 | 상태 |
| ---- | ---- | ---- |
| v1.0 | 구글시트 동기화(import→staging→승격, DB→시트 push), sales_plays/lead_intake_raw DDL | ✅ 머지·라이브 적용됨 |
| v1.1 | 콘텐츠 아이디어 큐 + 발행 케이던스 엔진 | ✅ 머지됨 (`content_items`/`content_variants` 확장 + Content 페이지 Queue 탭) |
| v1.2 | 팔로업/다음행동 엔진 + `outreach_outcomes` 싱크 | ✅ 머지됨 (`followups.jsx`, `outcomes-ledger.js`) |
| Guru P0–P2 | 세일즈 구루 멘토 에이전트(페르소나 → Engine 루프 → 딜 단위 코칭) | ✅ 머지됨 — `docs/sales-guru-mentor-agent-plan.md` |
| Sales OS Phase 0–4 | work_orders/agent_runs 스파인 · 360 컨텍스트 어셈블러 · 인박스 라우터 · 크로스필러 리스크 · outcome-weighted triage + leads.score | ✅ 머지됨 |
| 학습 루프 closing | work_order 실행 결과 → `outreach_outcomes` → `agent_runs.outcome_id` 귀속(멱등) | ✅ 머지됨 |
| **v1.4 — CRM 통합** | classin_home 딜/퍼널을 읽어와 Guru의 `crm_facts` gap 해소 | P0a(코드 배관: `crmFacts` 파라미터, `crm-pipeline.js`)만 완료 · **이후 보류**(아래 결정 참고) |
| v1.3 | 인바운드 DM→리드 포착(콘텐츠↔딜 루프, 반수작업) | ✅ 머지됨 — legacy 분류기는 `inbox-classify.js`에 유지하고, 삭제된 direct `inbox-router.js` write 대신 Quick Capture는 Hub BFF→Engine capture command→atomic receipt로 `work_orders`에 저장한다. 승인된 `dm`/`lead` work order를 실제 `leads` row로 닫는 `promoteCaptureToLead`(`work-orders.js`)가 루프를 완성한다. `lead_intake_raw`→`companies` 매칭(구조화 필드 필요)은 의도적으로 생략 — 자유 텍스트에서 회사 매칭을 추측하지 않고, bare lead를 Revenue › Leads에서 사람이 채우게 함(§8 지식과 동일한 안전 원칙) |
| vNext | 네이버 공식 API 시드(법적) · 광고비/퍼널 연동(classin_home 재사용) · agents.jsx 팔레트 토큰화 · 인스타/스레드 자동 발행 · 5배 계기판 | 보류 |

> **2026-07-10 결정**: v1.4(classin_home CRM 통합)는 classin_home 레포 접근·별도 Supabase 프로젝트 여부 확인 등 moonlight 바깥의 의존이 커서 **후순위로 보류**한다. 당분간은 moonlight_pro 안에서 자체 완결되는 작업(v1.3 인바운드 캡처, 정리/부채 항목 등)을 우선한다. 상세 트레이드오프·재개 시 체크리스트는 `docs/sales-os-crm-integration-plan.md` 참고 — 그 문서의 P0a(라이브 DB 무영향)는 이미 머지됐고, P0b(마이그레이션) 이후부터가 보류 대상이다.

---

## 8. v1.1 구현 계획 (실행 준비)

**원칙:** 기존 Content OS 위에 *얇게*. 신규 테이블 0. 신규 컬럼 최소. agents.jsx 미터치.

### 8.1 데이터 (이미 존재 — 확장 최소)
기존 `content_items`(`status` idea/draft/review/scheduled/published/archived · `source_idea`·`idea_source`·
`source_type` · `scheduled_at`·`published_at` · `meta`) + `content_variants`(`variant_type` 8종 · `status` ·
`scheduled_at`·`published_at` · `meta`)가 idea→published 라이프사이클을 이미 커버.

**신규(마이그레이션 1개, 라이브 DB 적용은 사용자 승인 후 `npm run db:migrate`):**
- `content_items`에 랭킹·케이던스 메타: `rank_score numeric`(또는 `meta.rank`), `cadence_week text`(ISO week, 또는 `scheduled_at`에서 파생).
- `content_variants`에 `channel text`(insta/threads/reels — 대부분 `variant_type`에서 파생, 명시용).
- 인덱스: `(workspace_id, status, rank_score desc)` 큐 정렬용.

### 8.2 로직 (Hub repositories + 얇은 생성)
- `lib/repositories/content-ledger.js` 확장: 아이디어 큐 조회(status='idea' 정렬), 케이던스 집계
  (주차별 published 수 vs 목표), 발행 마킹(published_at+channel 기록).
- 아이디어 fallback ranker(레포 내부 신호): `classmoon` `content_rules` + 딜 단계·반론 + §5 ClassIn
  앵글 × (있으면) 과거 반응. classin_home 포지셔닝은 빌드 시 정적 시드로 가져오거나 수기 큐레이션.

### 8.3 UI (기존 Content 페이지 확장)
- `pages/content.jsx`에 **Queue 탭** 추가: idea/draft/scheduled/published 칸반 + 주간 목표/진척 +
  "발행됨" 마킹 버튼(수동 발행 후). 별도 라우트 아님.
- Daily Brief에 "오늘의 아이디어 1–3 + 이번 주 발행 n/목표" 카드.
- 토큰·primitives 준수, 신규 색 금지.

### 8.4 발행
- v1.1은 **수동**: 큐에서 복사 → 인스타/스레드/릴스 직접 게시 → "발행됨" 마킹. 자동 발행 vNext
  (Meta/Threads API 제약).

### 8.5 성공 기준
- 큐 미발행 아이디어 ≥10 상시. 큐 상위3 중 ≥1 실제 발행 채택. 1주차 baseline → 2주차부터 ≥5건/주.
  발행→DM 인입 수기 로깅 시작(v1.3 baseline).

---

## 9. Open Questions

1. **moonlight ↔ classin_home 결합 방식**(v1.4): 같은/연결 Supabase 직접 읽기 vs eeocrm MCP 라이브 vs push. `docs/sales-os-crm-integration-plan.md`가 push 스냅샷(C안)을 추천했으나, **실행 자체가 2026-07-10부로 보류**돼 이 질문의 최종 답은 재개 시점까지 미확정으로 남는다. (v1.1 비차단)
2. ~~classinkr-web 접근~~ → **해소:** 이 머신엔 없음, classin_home 포지셔닝 파일을 SSOT로 사용.
3. **케이던스 목표 수치** — 주 5건? 포맷 분배(카드뉴스/스레드/릴스)? (잠정 5, 빌드 중 조정)
4. **랭킹 1순위 신호** — 앵글 vs 단계 vs 철학(content_rules) 중 무엇 우선? (The Assignment 데이터로 보정)

**The Assignment(사용자):** 인스타/스레드 **반응 좋았던 글 3 + 안 좋았던 글 2** 공유 → 랭킹 신호 부트스트랩.

---

## 10. 참조

- 설계 문서(v3, APPROVED): `~/.gstack/projects/Muuuuoouuun-moonlight_pro/clmagi-codex-moonlight-p0-hardening-design-20260617-230521.md`
- 메모리: `sales-os-project` (CRM/eeocrm 셋업·크레덴셜·마이그레이션 적용 이력)
- ClassIn 메시징 SSOT: `classin_home/lib/classin-positioning.ts`, `docs/active/classin-korea-positioning-guidelines.md`
- 머지된 v1.0: `supabase/migrations/20260617_0005_sales_os_sheets_sync.sql`, `apps/hub/lib/google-{sheets,oauth}.js`, `sheets-normalize.js`, `repositories/sheets-sync.js`
- Content OS: `supabase/migrations/20260427_0003_*`·`_0004_*`, `apps/hub/components/hub/pages/content.jsx`, `lib/repositories/content-ledger.js`, `packages/content-manager`
