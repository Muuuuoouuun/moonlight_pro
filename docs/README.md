# Moonlight 문서 지도

> 상태: ACTIVE DOCUMENTATION INDEX
> 마지막 정리: 2026-09-20 (Supabase 서울 리전 이관, 테스트 기준선, 빠른 입력 전역화, 목업 가드레일 반영. 이전 정리: 2026-09-14 콘텐츠·메모·문의·Agent DB 준비 상태)
> 목적: 같은 주제의 문서가 충돌할 때 무엇을 먼저 믿을지 고정한다.

## 1. 읽는 순서와 우선순위

문서가 충돌하면 아래 순서가 우선한다.

1. [`operator-workflow-profile.md`](operator-workflow-profile.md) — 운영자 인터뷰 Q1~Q115의 사실·권장·미정
2. [`2026-07-13-moonlight-personal-operator-os-deep-design.md`](superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md) — 현재 제품 구조와 Phase 0~1C 설계
3. **주제별 최신 확정 스펙** — §4 "제품·운영 정본"의 스펙 목록에서 해당 주제의 가장 최근 문서를 확인한다(예: 사이드바 아코디언은 `2026-07-15-sidebar-second-level-and-pms-taxonomy.md`, 그중 PMS 분류 §4의 `sns-channel` 축은 `2026-08-29-brand-tab-design.md`가 부분 대체). 스펙 상단의 "상위 정본"·"관계" 헤더가 이전 스펙 중 어떤 절이 대체됐는지 명시하므로 함께 읽는다.
4. [`../DESIGN.md`](../DESIGN.md) — UI 토큰·컴포넌트·인터랙션 계약
5. [`master-directive.md`](master-directive.md) — 바뀌지 않는 제품 경계와 원칙
6. [`master-roadmap.md`](master-roadmap.md) — 현재 단계와 다음 구현 순서
7. 도메인별 문서 — 위 문서와 충돌하지 않는 범위에서 참고
8. `HISTORICAL` 또는 `SUPERSEDED` 문서 — 결정 배경만 참고하고 새 구현의 근거로 사용하지 않음

코드 작업 지침은 루트의 [`CLAUDE.md`](../CLAUDE.md)가 정본이고 [`AGENTS.md`](../AGENTS.md)는 그 Codex용 사본이다(둘은 같은 커밋에서 함께 갱신한다). 브랜치명이나 특정 커밋은 제품 정본이 아니며, 작업 시점의 Git 상태를 직접 확인한다.

## 2. 2026-07-13 통합 결정

오늘 인터뷰와 기획에서 확정된 핵심은 다음과 같다.

- Moonlight는 문준혁 본인만 쓰는 개인 운영체제이며 판매·다중 사용자 SaaS가 아니다.
- 성공 기준은 인지 에너지를 현재의 약 1/3로 줄이고, 고객 연락·프로젝트 후속 누락을 0건으로 만드는 것이다.
- 첫 화면은 할 일, 매출, 메시지, 기획, 콘텐츠 순서의 판단을 돕고 긴급 KA 1건과 집중 고객 3~5건을 우선한다.
- 고객은 사람을 기본 단위로 보고 조직·거래·활동·다음 행동을 연결한다. 새 문의·재문의는 원칙적으로 새 Opportunity다.
- 초기 이관은 ClassIn/Neo CRM에서 가져오되, 이후 Moonlight가 개인 업무 정본이 된다. ClassIn에는 공식 요약만 승인 경계를 거쳐 보낸다.
- 모든 상세 개인 메모를 ClassIn으로 옮기지 않는다. 공식 기록은 기록 여부·일자·유형·간략 요약 중심이다.
- 캘린더는 첫 화면의 핵심 문맥이고 모바일은 후순위다. 이메일보다 메시지·전화가 우선이다.
- 프로젝트는 활동량, 가격 논의, 방문/데모, 두 번째 미팅 같은 신호로 후보를 추천한다. 자동 생성은 후보 확인 UI를 거친다.
- 콘텐츠는 떠오른 아이디어나 참고 콘텐츠에서 시작해 원본 하나를 스레드·인스타그램·유튜브 쇼츠 등으로 재가공한다. 복잡한 성과 분석은 후순위다.
- 추가 인터뷰는 Q116부터 한 번에 5개씩 재개하되, Phase 1 실사용 데이터나 운영자의 요청 전에는 멈춘다.

상세 답변과 예외는 요약문에 재복제하지 않고 [`operator-workflow-profile.md`](operator-workflow-profile.md)를 단일 원본으로 유지한다.

## 3. 현재 실행 상태

2026-09-20 DB 위치: 운영 Supabase를 싱가포르에서 **서울 리전으로 이관 완료**했다. 아래 DB 준비 상태 기록은 그대로 유효하되, 대상 프로젝트가 바뀌었다는 점을 함께 읽는다. 상세는 [`supabase-korea-region-migration.md`](supabase-korea-region-migration.md).

2026-09-14 DB 준비 상태: 누락된 0026·0027·0028·0030·0031·0032·0033을 운영 Supabase에 적용했고, `npm run db:check`로 테이블·RLS·서비스 전용 RPC 권한을 확인했다. 이미 적용된 0029는 재실행하지 않았다. Hub/Engine 코드 배포, 문의 외부 수집 연결, worker 활성화는 별도다.

| 단계 | 상태 | 근거 |
|---|---|---|
| 인터뷰 Q1~Q115 정리 | 완료 | [`operator-workflow-profile.md`](operator-workflow-profile.md) |
| 전제 1~7 및 접근안 B | 승인됨 | 구현 지시와 Phase 0 착수 |
| Phase 0 신뢰 기준선 | 완료·푸시 | `5c9ccc2`, `codex/moonlight-phase0-trust` |
| Phase 1A Durable Task Loop | 완료 | project/task durable create·update·status·reload, 홈 Quick Capture의 task/work-order 두 destination, 공통 receipt의 duplicate/conflict, task-only Today 완료·재조회를 live 검증 |
| Phase 1B Action Desk | 작동 | Daily Brief 확정 슬롯(긴급 KA ≤1 · 집중 고객 ≤5 · 오늘 일정) live(2026-08-05) + 첫 화면 신호 엔진의 정식 Attention adapter 통합(2026-08-09, A-1): daily-brief가 tasks·revenue·calendar를 `getAttentionLedger({ includeRaw })` 하나로 소비하고, 정체 딜 신호 판정을 attention 원장(§4 공식·STALLED_DAYS 단일 기준)에서 받는다 — 첫 화면과 내 작업이 같은 우선순위 척추를 본다 |
| Phase 1C Contact Outcome Loop | 작동 | `record_contact_outcome_v1` 원자 RPC(마이그레이션 `20260716_0018`) — 고객 DB 컨택 시트와 고객 연락(followups) 인라인 폼 **양쪽 모두** 이 경로로 이관 완료(2026-08-05). followups 기록에는 3.5초 되돌리기 포함. 비원자 `/api/integrations/outcomes/record`는 UI 소비자 0 (외부/cron 대비 유지, 실패 시 502) |
| ClassIn 전체 동기화·음성 AI·콘텐츠 직접 발행 | 보류 | 별도 하드 게이트 필요 |
| 프로젝트 빠른 생성 드로어(1-1) · PMS 커맨드 센터 | 구현됨 | 스펙 `2026-07-17-project-create-drawer-design.md`, 플랜 `2026-07-17-*` 2건. `codex/project-fast-create-1-1` 병합 완료(2026-07 브랜치 정리). 잔여 범위는 플랜 문서 기준 |
| 프로젝트 실행 백로그 | 구현·로컬 검증 완료 | 프로젝트·우선순위·기한 필터, 보드/할 일 연결, 선택 작업의 상태·기한 일괄 변경, 다음 행동 편집, 충돌·부분 실패 처리. [구현·검증 기록](superpowers/plans/2026-09-13-pms-execution.md). 운영 배포는 별도 |
| 하위 아이템 체크리스트 | 구현·로컬 검증 완료 | 항목별 진행 게이지, 클릭 상세·체크리스트 탭, 세부 메모·순서 변경·삭제 되돌리기, 저장·재조회 및 동시 수정 선택. [구현·검증 기록](superpowers/plans/2026-09-13-pms-task-checklists.md). 운영 배포는 별도 |
| 백엔드 통합 | 완료 | `0c5e522` real_v1.3(bm) UI + real_v1.4 백엔드 병합, `adcf619` `@com-moon/supabase-rest` 단일 클라이언트 추출 |
| 브랜드 탭 | P0·P1 구현, P2~P5 제안 | `2026-08-29-brand-tab-design.md`, `3627eef` |
| 개인 매출 30일 로드맵 | 출시, 디자인 QA `blocked` | `2026-08-31-personal-revenue-roadmap.md`, `68517ec`, 루트 `design-qa.md` |
| 문의 수집·알림 | 코드 구현, 운영 연결 대기 | Gmail 감지·안전한 웹훅·문의 내역·미확인 알림. [설정](inquiry-integration-setup.md), [검증](superpowers/plans/2026-09-13-unified-inquiries.md) |
| Supabase 서울 리전 이관 | 이관 완료(2026-09-20) · Vercel 환경 변수 교체 대기 | `rwqefdxalmbrkybxqwxj`(싱가포르 `ap-southeast-1`) → `ncgpnqfulnlshegalmbd`(서울 `ap-northeast-2`). 테이블 71·1368행 **전부 행 수 일치**, `npm run db:check` 7/7 PASS, 앱 읽기(`status: live`)·쓰기 왕복 확인, REST 지연 150ms→57ms. 구 싱가포르 프로젝트는 롤백 경로로 **삭제하지 않고 보존**. 툴킷은 `npm run db:move-region`, 런북·함정(함수 실행 권한 회귀 등)은 [`supabase-korea-region-migration.md`](supabase-korea-region-migration.md), 커밋 `fa1757e`. **Vercel 환경 변수는 아직 구 싱가포르 값이므로 배포 전 교체가 필요하다** |
| 빠른 입력 전역화 | 구현 완료(2026-09-20) | 캡처 폼을 `daily-brief.jsx` 내부에서 `apps/hub/components/hub/quick-capture.jsx`로 분리해 단일 정본화(`layout="inline"`/`"compact"`). 전역 `C` 단축키(입력 요소 안·팔레트 열림이면 무시)와 ⌘K 팔레트의 `빠른 입력` 액션, 치트시트 등록까지 포함 — DESIGN.md §8.1 생성 단축키 계약을 따른다. 커밋 `6423822` |
| 목업 데이터 가드레일 | 구현 완료(2026-09-20) | `scripts/no-mock-data.test.mjs`가 저장소 전체에서 목업 식별자(`MOCK_`·`DEMO_`·`SAMPLE_`·`DUMMY_`·`FAKE_`·fixtures 계열) 선언과 업무 레코드형 하드코딩 배열을 막는다. 감사 시점의 저장소에는 가짜 업무 데이터가 0건이었고 없던 것은 강제 장치였다. 운영자 확정: 더미 데이터는 **로컬 전용 Supabase 프로젝트에만** 두고 코드에는 넣지 않는다 — 그 프로젝트는 free 플랜 활성 2개 상한 때문에 아직 미생성이다. 커밋 `4516e49` |

Phase 0는 Content canonical contract, write 응답 분류, honest empty/error UI, 사용자 identity, Content 승인 원자화를 포함한다. 당시 검증 기준선은 Node test 50/50, contract check, typecheck, Hub/Engine build 통과다. 2026-07-15 현재 저장소 검증은 102/102이며 Phase 1A 완료를 뜻한다. Phase 1B·1C는 아직 남아 있으므로 Phase 1 전체 완료로 해석하지 않는다.

2026-09-20 현재 루트 `npm test`는 **1433 tests · 실패 0**이다. 이전 기록의 "692/692 통과, 82파일"은 낡았으므로 이 줄을 기준선으로 쓴다. 2026-09-20에 **아예 돌지 않던 테스트 55건을 복구**해 1378 → 1433이 됐고, 원인 두 가지 모두 소스와 무관했다. (1) postgres를 띄우는 8파일이 macOS에서 `LC_ALL` 없이 기동을 거부해 discovery·daily review·inquiry·agent command의 **원자 RPC 검증이 통째로 미실행**이었다. (2) 스윕 테스트 3개(`motion`·`focus-ring`·`button-hover`)가 `.next` 정확일치로만 걸러 `.next.qa`·`.next.ship-*` 같은 빌드 잔재 디렉터리의 미니파이 CSS를 새 위반으로 오인했다. 커밋 `0cc7f18`.

파일 범위(2026-09-20 실측): 저장소의 `*.test.mjs` 203파일 중 **201파일**이 루트 글롭에 포함되고, `apps/hub/app/api/hub/content/transform/route.test.mjs`·`.../workflow/route.test.mjs` **2파일은 글롭 밖**이다(루트 글롭에 `apps/hub/app/**` 패턴이 없다). 2609 병합이 글롭을 `apps/hub/components/**`·`apps/engine/**`·`packages/**`로 확장하면서 이전에 CI 밖이던 20파일과 실패 4건이 해소된 것은 사실이나, "전부 포함"은 더 이상 맞지 않다. CI(`.github/workflows/ci.yml`)는 `npm test`에 위임하므로 CI와 로컬의 범위는 어긋나지 않는다 — 다만 두 파일은 양쪽 모두에서 돌지 않는다.

사이드바 앵커는 코드(`hub-nav.js` 8 primary + 2 utility)·`hub-nav.test.mjs`·07-15 스펙 §3.1이 모두 일치한다(2026-09-04 주석·스펙 갱신으로 해소).

## 4. 현재 문서

### 제품·운영 정본

- [실사용 입력 개선](superpowers/specs/2026-09-20-input-usability-design.md) — **승인·구현(2026-09-20)**. 체크리스트 한 줄·Enter 연속 입력, 새 할 일 중앙 팝업·저장 후 계속, 메모 태그·업무 연결, PMS 소속 선택 및 반복 범례 축소. [검증 기록](superpowers/plans/2026-09-20-input-usability.md). 태그 검색 0035는 서울 DB 적용 완료.

- [첫 화면 디자인 디벨롭](superpowers/specs/2026-09-21-home-screen-design-development.md) — **DRAFT · 권장(2026-09-21)**. 첫 화면이 두 개라는 사실(`dashboard` Daily Brief 12슬롯 vs 운영자 확정 Futura 트리아지 `dashboard/home` — DESIGN.md §15 2026-09-18·19 `confirmed`인데 `09.bigmac1.02`에 **미병합**)을 정리하고, 12슬롯·3.34폴드(모바일 4.22)를 6슬롯·2폴드로 줄이는 권장안. 실측·진단 6건(팔레트 원색 13건과 가드 공백 포함)·구현 순서 4주·미정 Q132~Q137. 데이터 쪽은 [세 축·Action KPI 기획](superpowers/specs/2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md) §6.2가 짝이다.

- [CRM 탭 디벨롭 기획](superpowers/specs/2026-09-21-crm-tab-develop-design.md) — **DRAFT v0.2 · 권장 · 적용 준비(2026-09-21)**. 운영자가 지정한 여섯 축(연락·미팅 내용·기록·매출 내용·니즈·위기)을 코드에 대입한 지도와 CRM 탭 재구성 권장안(정본 1 + 렌즈 3, 통합 기록창, 니즈·위기 사건 판정, Q117 계층 정렬, 매출 필드). 검증된 구조 문제 8건 — 기록 원장 2분열, `reaction` 소비자 0, 큐 정렬이 Q117과 반대, **고객 연락 행의 버킷 필터·레일·클릭·반응 줄이 다른 원장 모양을 기대해 전부 죽음**, **첫 화면 집중 고객이 `won`만 뽑고 `next_action`은 이관 템플릿**(첫 화면 스펙 D3의 원인), 위험 라벨이 점수 밴드. 디자인 부채 9건. `classinkr-web` `home_v4.2`에서 가져올 7가지·버릴 5가지. 테이블·컬럼 변경 0(RPC v2 함수 1개). 미정 Q138~Q146에 **권장 기본값**을 달아 반대 없으면 진행. 0·1단계 파일 단위 실행 계획은 [`plans/2026-09-21-crm-tab-develop-phase0-1.md`](superpowers/plans/2026-09-21-crm-tab-develop-phase0-1.md).

- [`operator-workflow-profile.md`](operator-workflow-profile.md) — 운영자 업무 사실과 인터뷰 원본
- [`superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`](superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md) — 활성 제품 설계
- [`master-directive.md`](master-directive.md) — 제품 불변식
- [`master-roadmap.md`](master-roadmap.md) — 단계와 다음 순서
- [`../TODOS.md`](../TODOS.md) — 아직 하지 않을 일과 남은 기술 부채

**사이드바 IA · PMS 분류 (최신순, 확정 스펙만 정본)**

- [`superpowers/specs/2026-09-11-scope-as-global-filter.md`](superpowers/specs/2026-09-11-scope-as-global-filter.md) — **결정됨(2026-09-11)**. 스코프(전체·ClassIn·개인)의 의미와 적용 범위 정본. `2026-07-14` 스펙의 "스코프 = 목적지 전환" 해석을 폐기하고 전역 필터로 바꾼다. 앵커·2레벨 구조 자체는 아래 `2026-07-15` 스펙이 계속 정본이다. 구현은 단계별.
- [`2026-09-11-brand-content-refocus-proposal.md`](superpowers/specs/2026-09-11-brand-content-refocus-proposal.md) — 9월 14일 첫 구현 지시 반영: 브랜드 기준 편집·독립 조회, 소재함·Threads 원고·수동 발행 기록·빠른 메모 연결. §10이 실제 구현 범위이며 나머지는 후속 권장안. 운영 DB 타입 확장은 인증 실패로 미적용.

- [`superpowers/specs/2026-09-09-project-delivery-lifecycle.md`](superpowers/specs/2026-09-09-project-delivery-lifecycle.md) — 시작·검증·종료 일정, 최소 결과물, 완료 조건, 마무리 가능성 및 완료 검증 UI. 운영자 구현 요청 반영, 로컬 검증·운영 배포 별도.
- [`superpowers/specs/2026-07-15-sidebar-second-level-and-pms-taxonomy.md`](superpowers/specs/2026-07-15-sidebar-second-level-and-pms-taxonomy.md) — **확정(2026-07-15)**. 사이드바 2레벨 아코디언 + PMS 분류 체계 정본. `2026-07-14` 8앵커 IA는 유지하되 하위 레벨 노출 방식을 이 문서가 규정한다.
- [`superpowers/specs/2026-07-15-personal-os-surface-restoration-design.md`](superpowers/specs/2026-07-15-personal-os-surface-restoration-design.md) — §3~4(5앵커+More 내비게이션 안)은 위 문서로 대체되어 **채택하지 않음**. §5(Personal 스코프 데이터 계약)·§6(구조적 화면 복구)는 별도로 유효.
- [`superpowers/specs/2026-07-14-sidebar-consolidation-design.md`](superpowers/specs/2026-07-14-sidebar-consolidation-design.md) — 8앵커 압축 + 스코프 셸. 하위 레벨이 통째로 사라진 부분은 위 07-15 분류 스펙 문서가 보완.

**프로젝트 · PMS (2026-09-13 실행 백로그·하위 아이템 보강)**

- [`superpowers/plans/2026-09-13-pms-task-checklists.md`](superpowers/plans/2026-09-13-pms-task-checklists.md) — **구현·로컬 검증 완료**. 하위 아이템 상세와 체크리스트 기반 진척, 항목별 메모·정렬·저장·충돌 선택. `tasks.meta.checklist`를 사용하며 작업 상태와 체크리스트 완료율은 별도로 유지한다.

- [`superpowers/plans/2026-09-13-pms-execution.md`](superpowers/plans/2026-09-13-pms-execution.md) — **구현·로컬 검증 완료**. 기존 tasks 원장의 실행 백로그, 공통 필터, 일괄 변경, 다음 행동, 정확한 버전 비교와 회사/개인 범위 구분. 새 스키마 없이 개인 운영 방향을 유지한다.
- [`superpowers/specs/2026-07-17-project-create-drawer-design.md`](superpowers/specs/2026-07-17-project-create-drawer-design.md) — **APPROVED**. 프로젝트 탭 3단계 × 3요소 중 `1-1 · 빠른 생성 드로어`. 브랜드 소유 분류(`sns-channel`) 처리는 아래 08-29 브랜드 탭 스펙이 이어받는다.
- [`superpowers/plans/2026-07-17-project-fast-create-1-1.md`](superpowers/plans/2026-07-17-project-fast-create-1-1.md) — 위 스펙의 구현 계획(병합 완료).
- [`superpowers/plans/2026-07-17-pms-command-center.md`](superpowers/plans/2026-07-17-pms-command-center.md) — Projects·Timeline·Roadmap·Rhythm을 하나의 PMS 커맨드 센터로 묶는 구현 계획.

**브랜드 · 개인 매출 (2026-08 이후 추가, 이 인덱스에 늦게 등재)**

- [`superpowers/specs/2026-08-29-brand-tab-design.md`](superpowers/specs/2026-08-29-brand-tab-design.md) — **P0·P1 구현됨 / P2~P5 제안**. 브랜드를 콘텐츠 필터가 아닌 운영 대상으로 분리. `2026-07-15` PMS 분류 §4의 `sns-channel` 축을 부분 대체.
- [`superpowers/specs/2026-09-01-brand-content-log.md`](superpowers/specs/2026-09-01-brand-content-log.md) — **확정**. 브랜드 컨텐츠 로그(`dashboard/brands/log`) 설계. 운영자 v5 첨부가 확정한 8색 브랜드 아이덴티티 팔레트와 3px 좌측 레일은 DESIGN.md §8.1·§8.2의 이 표면 한정 예외다(§15 2026-09-01 결정).
- [`superpowers/specs/2026-08-19-lead-subject-region-labels-design.md`](superpowers/specs/2026-08-19-lead-subject-region-labels-design.md) — 리드 과목·지역 라벨 설계(12키 고정 어휘·`label_source` 확정도·백필 게이트). 구현 계획은 [`superpowers/plans/2026-08-19-lead-subject-region-labels.md`](superpowers/plans/2026-08-19-lead-subject-region-labels.md).
- [`superpowers/plans/2026-08-31-personal-revenue-roadmap.md`](superpowers/plans/2026-08-31-personal-revenue-roadmap.md) — 개인 스코프 30일 현금흐름 로드맵 구현 계획(`68517ec`로 출시). 디자인 QA 결과는 루트 [`design-qa.md`](../design-qa.md)(플랜이 지정한 경로)이며 `final result: blocked`.

**기회 탐색 (2026-09-13)**

- [`superpowers/specs/2026-09-13-discovery-contact-signals-design.md`](superpowers/specs/2026-09-13-discovery-contact-signals-design.md) — **신호 목록 입력됨 / 동작 설계 제안 / 구현 전**. 대면 미팅·연락 2회 또는 장시간 통화·선제적인 결제 일정 발언. 자동 판정의 기간·시간 기준은 확인 중이다.

- [`superpowers/specs/2026-09-13-discovery-nudge-design.md`](superpowers/specs/2026-09-13-discovery-nudge-design.md) — **문맥별 넛지 구현·로컬 검증 완료**. 상세의 주요 행동·직접 입력 포커스·단계적 펼침, 날짜 미루기·계기별 숨김·해제, 목록/상세/다른 창 상태 공유. [실행 기록](superpowers/plans/2026-09-13-discovery-nudge.md). 0031 운영 DB는 2026-09-14 적용 완료. 코드 배포는 별도.

- [`superpowers/specs/2026-09-13-opportunity-discovery-v2-design.md`](superpowers/specs/2026-09-13-opportunity-discovery-v2-design.md) — **2A 구현·로컬 검증 완료**. 작업 중심 전환·전체 서버 검색·읽기 중심 상세·관심 질문 시작·검토일 도래 표시. [실행 기록](superpowers/plans/2026-09-13-opportunity-discovery-v2.md). 2B·2C 및 운영 배포는 후속.

- [`superpowers/specs/2026-09-13-opportunity-discovery-design.md`](superpowers/specs/2026-09-13-opportunity-discovery-design.md) — **1차 구현·로컬 검증 완료**. 독립 기회 탐색에서 포착·발굴·검증·실행 연결·보류·종료를 관리한다. 사이드바 primary 9개로 확장. 실제 업무 연결·revision/receipt·이력과 페이지네이션 포함. [실행 기록](superpowers/plans/2026-09-13-opportunity-discovery.md). 2026-09-13 운영 DB 적용·생성/재시도 검증 완료. Vercel 배포를 막던 문의 동기화 크론 주기는 2026-09-17 운영자 확정으로 일 1회(`0 21 * * *`)로 낮췄다([설정 문서](inquiry-gmail-setup.md)). 일간 크론 5개 등록 상태의 프리뷰 배포가 성공해 개수 제한은 배포를 막지 않았다(PR #3). AI 탐색은 후속 범위다.

**하루 리뷰 (R0)**

- [`superpowers/specs/2026-09-12-daily-review-and-council-design.md`](superpowers/specs/2026-09-12-daily-review-and-council-design.md) — **R0 승인·구현 / 후속 단계 DRAFT**. 내 작업 → 하루 리뷰에서 에너지·당일 목표 진척·메모를 날짜별 저장·수정한다. 2026-09-13 운영 DB 적용 및 실제 API 연결 확인 완료. [구현·검증·적용 안내](superpowers/plans/2026-09-12-daily-review-r0.md). Council과 주간 리포트는 후속 제안이다.

**콘텐츠 제작 (2026-09-12)**

- [`superpowers/specs/2026-09-12-content-notes-drafts-ai-workflow-design.md`](superpowers/specs/2026-09-12-content-notes-drafts-ai-workflow-design.md) — **방향 승인 · Studio 1차 구현**. 원문·기획·채널별 초안·AI 후보 비교/적용·버전 복원을 연결. 구현·로컬 검증 범위는 문서 §0과 [실행 기록](superpowers/plans/2026-09-12-content-workflow.md)을 따른다. [후속 검증·운영 적용 준비](superpowers/plans/2026-09-12-content-release.md)에서 통합 테스트 오류를 해결했다. 2026-09-14 인증 갱신 및 0026 운영 DB 적용 완료. 일지 신설·기간 회고·자동 콘텐츠 크론과 코드 배포는 후속 범위다.

**메모 작성·활용 (2026-09-13)**

- [`superpowers/specs/2026-09-12-memo-writing-reuse-and-analysis-design.md`](superpowers/specs/2026-09-12-memo-writing-reuse-and-analysis-design.md) — **1차 승인·구현 / 후속 분석·추천 DRAFT**. 내 작업 → 메모에서 제목 없는 빠른 기록·선택 보강·업무 연결·발췌의 할 일/Studio 생성과 원문 복귀를 연결한다. 같은 탭 새로고침 복구·충돌 비교·중복 방지 포함. [구현·검증·운영 적용 전제](superpowers/plans/2026-09-13-memo-workflow.md). 0027 운영 DB는 2026-09-14 적용 완료. 코드 배포는 별도다.

**기획 초안 (미확정, 새 구현의 근거로 쓰지 않음)**

- [`superpowers/specs/2026-09-21-reference-capture-and-browse-usability-design.md`](superpowers/specs/2026-09-21-reference-capture-and-browse-usability-design.md) — **입력·모아보기 우선순위 운영자 확정 / 상세 동작 권장안 / 구현 전**. 한 칸에 링크·생각 입력, 저장 후 연속 입력, 전체 검색·상세·수정·즐겨찾기·복귀, 기존 자료 이관을 첫 출시로 제안한다. 09-20 기획의 Studio 우선 순서를 대체하며 AI 초안 연결은 후속이다.

- [`superpowers/specs/2026-09-20-reference-library-writing-workflow-design.md`](superpowers/specs/2026-09-20-reference-library-writing-workflow-design.md) — **DRAFT · 권장안 / 구현 미착수**. 저장 레퍼런스에서 질문·출처 1–3개를 골라 내 관점을 기록하고 기존 소재함·Studio 초안으로 연결한다. item의 선별 출처 사본, 확인 범위, AI 생성 근거와 재시도 계약을 제안한다. 전체 DB 이관·자동 수집·발행은 후속 범위다.

- [`superpowers/specs/2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md`](superpowers/specs/2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md) — **DRAFT · 권장안**. 운영자의 외부 브레인스토밍(워크플로우 OS 4계층·4모듈·"일단 세 가지"·Action KPI/OKR)을 현재 코드에 대입한 지도(있음·부분·없음·충돌)와 "루프 닫기" 묶음(오늘 Top 3 `tasks.meta.focus_dates`, 주간 집계 원천 교정, 딜 단계 이동 기록, 메모 3분할 통합, 텔레그램 평문 캡처). 새 테이블·마이그레이션 0. 09-03 성장 기획서의 F-0→F-1→F-3 순서를 유지하며 그 옆에서 병행. 초안 크론 수리 커밋 `34bb180`이 이 브랜치에 미병합임을 확인. 운영자 확정 전까지 권장.
- [`superpowers/specs/2026-09-13-revenue-and-cashflow-design.md`](superpowers/specs/2026-09-13-revenue-and-cashflow-design.md) — **초기 기능 범위 확정 · 상세 설계 권장안**. 사업·개인 재정의 통합/분할 보기, 계좌·카드, 할부·대출·반복 지출, 직접 입력·엑셀/CSV 가져오기와 매출 수금 연결. 구현 전이며 기존 거래 기반 30일 전망과 실제 현금 흐름을 구분한다.

- [`superpowers/specs/2026-09-13-crm-recording-and-lead-scoring-guidelines-design.md`](superpowers/specs/2026-09-13-crm-recording-and-lead-scoring-guidelines-design.md) — **디자인·UI/UX 우선 확정(09-14) / 세부 설계 DRAFT v0.2**. 고객 목록·상세·빠른 기록의 UX 시나리오 → 화면 구조 → 시각·인터랙션 확인 → 실제 기록 연결 → 근거 평가·제한 추천 순서. 메모/연락 결과·버튼·템플릿·내 패턴·리드 스코어링·넛지를 함께 설계하며 실패/복구 상태와 디자인 게이트를 포함한다. 시안 제작·UX 검증·앱 구현·라이브 재채점은 아직 하지 않음.

- [`superpowers/specs/2026-09-13-memo-discovery-and-analysis-design.md`](superpowers/specs/2026-09-13-memo-discovery-and-analysis-design.md) — **2A 승인·구현 / 2B DRAFT**. 한 검색창에서 제목·원문·보강 문장을 찾고, 선택 기간·종류·업무·활용 여부로 좁힌다. 편집 중 입력·펼친 목록·위치를 보존하며 프로젝트·고객·브랜드에서 최근 연결 메모 3개와 전체 보기를 제공한다. [구현·검증 기록](superpowers/plans/2026-09-13-memo-discovery.md). 0030 운영 DB는 2026-09-14 적용 완료. 코드 배포와 선택 AI 분석은 별도다.

- [`superpowers/specs/2026-09-12-unified-inquiries-email-webhook-design.md`](superpowers/specs/2026-09-12-unified-inquiries-email-webhook-design.md) — **APPROVED · 코드 구현(2026-09-13), 운영 연결 대기**. 메일·랜딩페이지 문의 원장, 감지·중복·읽음·처리 상태와 기존 알림 통합. [연결 가이드](inquiry-integration-setup.md), [Gmail 서명·수집](inquiry-gmail-setup.md), [구현·검증 기록](superpowers/plans/2026-09-13-unified-inquiries.md).
- [`superpowers/specs/2026-09-03-sales-content-marketing-to-branding-growth-plan.md`](superpowers/specs/2026-09-03-sales-content-marketing-to-branding-growth-plan.md) — **DRAFT · 권장안**. 세일즈·콘텐츠·마케팅 → 브랜딩 프레임으로 현재 시스템의 강점·약점·보완점·새 베팅을 정리. 초안 크론 2개 고장(W19)과 첫 빌드 후보("오늘 연락할 리드")를 포함. 운영자 확정 전까지 권장.
- [`superpowers/specs/2026-09-04-mcp-server-audit-and-expansion-design.md`](superpowers/specs/2026-09-04-mcp-server-audit-and-expansion-design.md) — **DRAFT · 제안**. MCP 서버 실측 점검(§2만 사실)과 확충·보강 설계. read 라우트 응답 158KB·94KB·52KB 실측으로 "화면용 BFF 통과" 전제를 반증하고 MCP 전용 투영 계층을 제안. 위 성장 계획 F-14를 흡수·확장하며, `integration-control-plane-inheritance.md` §6 계약은 그대로 상속한다.
- [`superpowers/specs/2026-09-13-codex-mcp-api-integration-design.md`](superpowers/specs/2026-09-13-codex-mcp-api-integration-design.md) — **로컬 P0–P2 구현**. 인증된 공통 Agent API, 작은 MCP 조회, 멱등 명령·receipt, SDK worker와 Council 작업 화면을 구현했다. 0032·0033 운영 DB는 2026-09-14 적용 완료. 코드 배포·worker 로그인은 별도 활성화가 필요하고 원격 MCP(P3)는 후속 범위다. 설정은 [`MCP/API 안내`](../packages/mcp-server/README.md)·[`worker 안내`](../packages/codex-worker/README.md)를 따른다.
- [`superpowers/specs/2026-09-05-journal-timeline-and-ai-digest.md`](superpowers/specs/2026-09-05-journal-timeline-and-ai-digest.md) — **DRAFT · 제안**. 일지를 `journal_entries` 단일 타임라인으로 신설하고 AI 정리를 2계층(Gemini 단건 요약·태그 / Claude Code 기간 회고)으로 분할. §3 범위 4건은 2026-09-05 운영자 확정, §2 실측은 사실, 나머지는 구현 전 제안이다. `daily-operating-note-todo.md`의 P1-5·P1-6·P2-8·P2-10을 흡수한다.
- [`superpowers/plans/2026-09-04-post-2609-merge-design-agenda.md`](superpowers/plans/2026-09-04-post-2609-merge-design-agenda.md) — **DRAFT · 권장안**. 2609 병합 직후 실측 기준의 디자인 부채·아젠다. §1~§3은 사실(병합 안전성, 재감사 30차 정지 지점, 프리미티브 채택률·신규 문법 불일치), §4~§5는 권장 우선순위다. `system-eval-2026-08-05.md`를 이어받되 개별 주제의 확정 스펙을 대체하지 않는다.

**재감사 기록 (2026-08~09)**

- [`system-eval-2026-08-05.md`](system-eval-2026-08-05.md) — 재감사 1~30차 채점·조치 로그. 축별(안정성·속도·정체성·사용성·디자인·편의성·UIUX) 점수 추이와 각 차수의 지적·수리 내역. 기록 문서이므로 새 구현의 근거로는 §4의 최신 스펙을 우선한다.

### 아키텍처·데이터 정본

- [`supabase-first-operating-ledger.md`](supabase-first-operating-ledger.md)
- [`supabase-db-strategy.md`](supabase-db-strategy.md)
- [`supabase-korea-region-migration.md`](supabase-korea-region-migration.md) — **완료(2026-09-20) 실행 기록과 런북**. 싱가포르 → 서울 리전 이관의 결과 수치, 마이그레이션 재생 대신 덤프 복제를 택한 이유, 연결 문자열(Session pooler) 주의, 실행 중 부딪힌 4가지, 그리고 가장 위험했던 **함수 실행 권한 회귀**(복원된 RPC 29개 중 25개가 anon 실행 가능으로 태어남 → `reconcile-privileges`가 자동 교정). 이관 후 남은 일(Vercel 환경 변수 교체, 로컬 전용 개발 DB 분리, 덤프 정리)도 이 문서가 정본이다. 명령은 `npm run db:move-region`
- [`integration-inventory.md`](integration-inventory.md)
- [`projects-connection-inventory.md`](projects-connection-inventory.md)

### 도메인 참고

- Office Council 캐릭터: [`superpowers/specs/2026-09-15-eevee-office-council-personas.md`](superpowers/specs/2026-09-15-eevee-office-council-personas.md) — **9명 구성·역할 매핑·정립 방향 승인 / 세부 지침 v1 작성**. 역할·성격·말투와 Guru·Mentor·Legend의 업무 분할, 기존/신규 라우팅·인계 경계(§19~23). 기존 실행 계약은 유지하며 런타임 연결·경로 수정은 미적용.
- 빠른 메모: [`quick-memo-plan-2026-09-09.md`](quick-memo-plan-2026-09-09.md) — 공통 우측 하단 입력창·초안 복원·기존 메모 저장 경로 재사용. **2026-09-10 로컬 구현·검증 완료, 운영 배포 별도**
- Agent/Council API·MCP: [`agent-council-api-mcp-operating-plan-2026-09-09.md`](agent-council-api-mcp-operating-plan-2026-09-09.md) — 현재 연동 구현과 권장 운영법. 아래 보류된 전체 Agent UI·자율 실행 설계를 승인한 것은 아님
- Sales OS: [`sales-os-direction.md`](sales-os-direction.md), [`sales-os/`](sales-os/), [`sales-daily-loop-playbook.md`](sales-daily-loop-playbook.md)
- Content OS: [`content-os-deep-plan.md`](content-os-deep-plan.md)
- Hub/Engine 경계: [`engine-os-separation-ui-plan.md`](engine-os-separation-ui-plan.md)
- 실행 backlog: [`engine-priority-todo.md`](engine-priority-todo.md), [`hub-design-priority-todo.md`](hub-design-priority-todo.md)

도메인 문서가 개인 운영 OS 심화 설계와 충돌하면 심화 설계를 따른다. 특히 과거의 “ClassIn CRM을 읽기만 한다”는 전제는 오늘 확정한 “최초 이관 후 Moonlight 개인 정본 + 공식 요약 outbox” 경계로 대체한다.

### 보류된 기능 설계

- Agent/Council: [`agent-tab-mvp-ui-spec.md`](agent-tab-mvp-ui-spec.md)
- Daily note/Obsidian: [`daily-operating-note-todo.md`](daily-operating-note-todo.md) — P1-5·P1-6·P2-8·P2-10은 [`superpowers/specs/2026-09-05-journal-timeline-and-ai-digest.md`](superpowers/specs/2026-09-05-journal-timeline-and-ai-digest.md)가 흡수했다(그 문서도 아직 DRAFT). P0-2 Quick Capture는 구현 완료. 남은 고유 범위는 P1-7 Obsidian export(역방향)다
- GitHub Work OS: [`github-workos-mvp-mockup.md`](github-workos-mvp-mockup.md)
- Sales Guru: [`sales-guru-mentor-agent-plan.md`](sales-guru-mentor-agent-plan.md)
- ClassIn CRM 결합: [`sales-os-crm-integration-plan.md`](sales-os-crm-integration-plan.md) — 문서 자체가 보류 상태이며 새 정본 경계를 먼저 적용
- AI Sales 팀 운영: [`sales-os/team-operating-layer.md`](sales-os/team-operating-layer.md), [`sales-os/personas/`](sales-os/personas/)

이 문서들은 폐기된 것은 아니지만 현재 Phase 1B·1C보다 먼저 구현하지 않는다.

### 지식·운영 참고

- 저장 레퍼런스와 글쓰기: [`research/2026-09-20-reference-writing/README.md`](research/2026-09-20-reference-writing/README.md) — **자료 보관·정리 완료**. 콘텐츠 370건, 선별 인사이트 26개, 주제별 글쓰기 기획과 예시 초안. 이번 원자료 재확인 22개와 기존 영상 분석 검토 4개를 구분한다. Threads 공유 프로필 2개·탐색 글 5개는 별도 보충이며 전체 수집 완료를 뜻하지 않는다. 원본 조사 사본·해시·재생성 검증 포함.

- 세일즈/마케팅 지식: [`sales-guru-knowledge-base.md`](sales-guru-knowledge-base.md), [`sales-decision-styles.md`](sales-decision-styles.md), [`marketing-branding-gurus.md`](marketing-branding-gurus.md)
- 콘텐츠 스토리텔링: [`content-storytelling-people-v2.md`](content-storytelling-people-v2.md) — **운영자 제공 참고 원문, 2026-09-14 추가**. 인물 카드 10개, 주목→유지→기억→행동→전파 지도, 한국 학원 B2B 맥락, 훅 40개와 실험 프로토콜을 보존한다. 연구·수익·효과 수치와 A/B/C 등급은 제공 문서의 주장으로 별도 검증하지 않았다. 문서 안 실행 지시·훅 DB 스키마·일정은 제품 확정 사양이 아니다. Studio AI는 원문 전체 대신 [`editorial-criteria.ts`](../packages/content-manager/editorial-criteria.ts)의 작업별 짧은 편집 기준(v2)을 사용하고, 사용한 버전을 후보 기록에 남긴다.
- 도구 사용 가이드: [`claude-code-skills-guide.md`](claude-code-skills-guide.md)
- 생성 인벤토리: [`projects-connection-inventory.md`](projects-connection-inventory.md), [`projects-connection-payloads.json`](projects-connection-payloads.json)

## 5. 구현 기록

- `5c9ccc2` — Phase 0 신뢰 기준선 구현·검증·푸시
- `0c5e522` — real_v1.3(bm) UI를 real_v1.4 백엔드에 병합
- `adcf619` — `@com-moon/supabase-rest` 단일 클라이언트 패키지 추출
- `5a3d506` — 내비게이션 단순화 + 캘린더·할 일 연결
- `3627eef` — 브랜드 운영 표면(브랜드 탭 P0·P1)
- `68517ec` — 개인 현금흐름 30일 로드맵
- `0cc7f18` — 죽어 있던 테스트 복구(빌드 잔재 스윕 오염 + macOS 로케일), 1378 → 1433
- `6423822` — 빠른 입력 전역화(`quick-capture.jsx` 정본, 전역 `C`, ⌘K 액션)
- `fa1757e` — Supabase 리전 이전 툴킷과 싱가포르 → 서울 이관 완료
- `4516e49` — 목업 데이터 재발 방지 가드레일
- `docs/superpowers/plans/2026-07-13-phase0-trust-repair.md` — Phase 0 구현 체크리스트(`codex/moonlight-phase0-trust` 브랜치에 존재)
- [`superpowers/plans/`](superpowers/plans/) — 특정 기능의 실행 기록
- [`superpowers/specs/`](superpowers/specs/) — 승인 당시의 상세 설계와 결정 배경

구현 기록은 당시 사실을 보존한다. 완료 후에는 현재 로드맵을 대신하지 않는다.

## 6. 과거 참고 문서

다음 문서는 삭제하지 않되 새 구현의 정본으로 사용하지 않는다.

| 문서 | 이유 | 현재 대체 문서 |
|---|---|---|
| [`master-plan.md`](master-plan.md) | 2026-05 autoplan 전체 검토 기록, 현재 상태·브랜치가 오래됨 | 심화 설계 + master roadmap |
| [`superpowers/specs/2026-07-13-claude-current-vs-operator-os-comparison.md`](superpowers/specs/2026-07-13-claude-current-vs-operator-os-comparison.md) | Phase 0 전 코드 감사 스냅샷 | Phase 0 커밋 + 심화 설계 |
| [`hub-tab-mvp-ui-spec.md`](hub-tab-mvp-ui-spec.md) | 과거 라우트 중심 UI 사양 | 심화 설계 + DESIGN.md |
| [`claude-notion-hybrid-ui-plan.md`](claude-notion-hybrid-ui-plan.md) | 폐기된 warm/green/public 시각 전제 포함 | DESIGN.md |
| [`frontend-execution-plan.md`](frontend-execution-plan.md) | public detach 전후의 과거 실행 계획 | master roadmap |
| [`design-guidelines.md`](design-guidelines.md) | light/white 중심의 구 디자인 토큰 | DESIGN.md |
| [`brand-efficiency-operating-model.md`](brand-efficiency-operating-model.md) | 2026-05 office-hours DRAFT | 운영자 프로필 + 심화 설계 |
| [`detail-tab-ui-overhaul-prep.md`](detail-tab-ui-overhaul-prep.md) | 특정 UI 개편 준비 기록 | DESIGN.md + 현재 Phase 설계 |

## 7. 정리 규칙

- 같은 답변을 새 문서에 반복하지 않는다. 운영자 사실은 프로필, 제품 계약은 심화 설계, 순서는 로드맵에만 적는다.
- 구현이 끝나면 설계 문서의 상태와 TODO를 함께 갱신한다.
- 과거 문서는 배경 근거가 있으면 보존하되 상단에 `HISTORICAL` 또는 `SUPERSEDED`를 표시한다.
- 현재 사실처럼 보이는 오래된 브랜치명, 승인 대기, 실패 테스트 수치는 제거하거나 날짜가 있는 스냅샷으로 바꾼다.
- 개인정보 원문과 개인 캘린더 URL은 저장소 문서에 복사하지 않는다.
