# Moonlight 문서 지도

> 상태: ACTIVE DOCUMENTATION INDEX
> 마지막 정리: 2026-09-24 (영업·매출 4탭 재구성 스펙 추가·사이드바 앵커 서술을 9+2로 갱신 — `고객 연락` 앵커가 영업·매출 첫 탭 `오늘 연락`으로 흡수. Guru 도움 카드 개발 서버 시범 설계·구현 위치 추가. main·생활 루틴 통합과 운영 DB 0043 적용 기록 반영. Office P0 교정 6건 — 역할 카드 v25·말투 튜닝 동결, 의미 품질 인증 대기. DESIGN.md를 코드 실측과 대조해 정정)
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
| Phase 1B Action Desk | 작동 | Daily Brief 확정 슬롯(긴급 KA ≤1 · 집중 고객 ≤5 · 오늘 일정) live(2026-08-05) + 첫 화면 신호 엔진의 정식 Attention adapter 통합(2026-08-09, A-1): daily-brief가 tasks·revenue·calendar를 `getAttentionLedger({ includeRaw })` 하나로 소비하고, 정체 딜 신호 판정을 attention 기록(§4 공식·STALLED_DAYS 단일 기준)에서 받는다 — 첫 화면과 내 작업이 같은 우선순위 척추를 본다 |
| Phase 1C Contact Outcome Loop | 작동 | `record_contact_outcome_v1` 원자 RPC(마이그레이션 `20260716_0018`) — 고객 DB 컨택 시트와 고객 연락(followups) 인라인 폼 **양쪽 모두** 이 경로로 이관 완료(2026-08-05). followups 기록에는 3.5초 되돌리기 포함. 비원자 `/api/integrations/outcomes/record`는 UI 소비자 0 (외부/cron 대비 유지, 실패 시 502). 2026-09-23 통합(CRM 0a `282572a`): **읽기도** `crm_activities` 단일 원천으로 통일 — 주간 리포트 연락 수·고객 연락 큐의 왜 지금/boost·컨텍스트 어셈블러가 같은 테이블을 본다. `outreach_outcomes`는 외부/cron 쓰기 라우트(`/api/integrations/outcomes/record`)와 소비자 0인 읽기 라우트(`/api/hub/outcomes`·`/api/hub/calendar-outcomes`)에만 남는다 |
| ClassIn 전체 동기화·음성 AI·콘텐츠 직접 발행 | 보류 | 별도 하드 게이트 필요 |
| 사진·음성 메모 입력(Gemini 요약·전사·할 일 후보) | 코드 있음 · 화면 미연결 · 휴면 유지(2026-09-23 운영자 결정) | `555e757`·`212c093`은 이 입력을 `pages/memo-capture.jsx`(`MemoCapture`)에 붙였지만, 그 화면은 이미 `e9d585d`(09-21)에서 `MemoCaptureLink`로 교체돼 어디서도 import하지 않는다(`pages/memo-entry-routing.test.mjs`가 재마운트를 막는다). 그래서 `/api/hub/intake/multimodal`·`lib/multimodal-intake-core.js`·Engine `lib/multimodal-intake.ts`(라우트 없음)·`gemini.ts`의 `media` 인자도 호출하는 곳이 없고, 각 테스트는 화면에서 닿지 않는 코드를 검사한다. 라우트는 인증 게이트 뒤에 살아 있어 직접 호출하면 Gemini 비용이 든다. `lib/memo-intake-tasks.js`의 `saveMemoIntakeTasks`는 메모 편집기의 AI 액션 추출이 쓰는 현역 코드다. 되살릴 때는 위 "음성 AI" 보류부터 풀고 ① 빠른 메모 같은 살아 있는 입력에 붙여 저장 후 `MEMO_SAVED_EVENT`를 보낸다(없으면 새로고침 전까지 목록에 안 뜬다) ② `readQuickMemoDraft`의 복원 조건(`source.type==="manual"`·제목·라벨 없음)을 넓힌다(그대로면 분석 결과가 든 초안이 새로고침 때 버려진다) ③ 라우팅 테스트를 의도적으로 고친다. 심화 설계 §15의 월별 분석 횟수·비용 표시는 아직 없다 |
| 프로젝트 빠른 생성 드로어(1-1) · PMS 커맨드 센터 | 구현됨 | 스펙 `2026-07-17-project-create-drawer-design.md`, 플랜 `2026-07-17-*` 2건. `codex/project-fast-create-1-1` 병합 완료(2026-07 브랜치 정리). 잔여 범위는 플랜 문서 기준 |
| 프로젝트 실행 백로그 | 구현·로컬 검증 완료 | 프로젝트·우선순위·기한 필터, 보드/할 일 연결, 선택 작업의 상태·기한 일괄 변경, 다음 행동 편집, 충돌·부분 실패 처리. [구현·검증 기록](superpowers/plans/2026-09-13-pms-execution.md). 운영 배포는 별도 |
| 하위 아이템 체크리스트 | 구현·로컬 검증 완료 | 항목별 진행 게이지, 클릭 상세·체크리스트 탭, 세부 메모·순서 변경·삭제 되돌리기, 저장·재조회 및 동시 수정 선택. [구현·검증 기록](superpowers/plans/2026-09-13-pms-task-checklists.md). 운영 배포는 별도 |
| 백엔드 통합 | 완료 | `0c5e522` real_v1.3(bm) UI + real_v1.4 백엔드 병합, `adcf619` `@com-moon/supabase-rest` 단일 클라이언트 추출 |
| 브랜드 탭 | P0·P1 구현, P2~P5 제안 | `2026-08-29-brand-tab-design.md`, `3627eef` |
| 개인 매출 30일 로드맵 | 출시, 디자인 QA `blocked` | `2026-08-31-personal-revenue-roadmap.md`, `68517ec`, 루트 `design-qa.md`. 2026-09-23 통합: 정체 판정 `STALLED_DAYS` 단일 상수화·정체 스캔 `won`→`closing` 교정·Deals 칸반 Lost 컬럼(`2aa1d21`·`da146bb`) |
| 문의 수집·알림 | 코드 구현, 운영 연결 대기 | Gmail 감지·안전한 웹훅·문의 내역·미확인 알림. [설정](inquiry-integration-setup.md), [검증](superpowers/plans/2026-09-13-unified-inquiries.md) |
| 업무 안의 Eevee Office E0~E4 | 구현·로컬 검증 / 운영 DB 적용(2026-09-23) | 요청 중심 Office·입력 보존, 주간 정리·고객 답장, Threads 님피아 지침, 요청 보관·복구, 같은 범위 프로젝트의 할 일 연결, 작업·실행 보기. [구현 기록](superpowers/plans/2026-09-21-eevee-office-embedded-workflow.md). 0038과 일시 실패 재시도 수정 0040(`20260922_0040_office_apply_transient_retry.sql`)을 2026-09-23 운영 DB에 적용했다(`db:check` PASS). 배포·보관 정리 예약은 미실행. 후속 실제 모델 평가는 아래 역할 품질 작업에서 진행 중 |
| 회의 텍스트 검토 M0·실행 계획 M0.5 | 코드 구현·로컬 검증·운영 DB 적용 / 배포·실사용 검증 전 | 저장된 메모의 TXT 가져오기·수동 분석·원문 근거 검토, `내가 할 일 / 함께 신경 쓸 일 / 담당 확인 필요` 분류와 날짜 역할·방법·단계 확인. 확정한 내 행동은 원문·기한·다음 행동·체크리스트를 한 트랜잭션으로 작업에 연결하고 내 작업에서 단계를 체크한다. 확정된 관련 주시는 My Work의 읽기 전용 목록에 최대 20개를 표시하고 회의 원문을 열 수 있다. 현재 원문 revision·최신 검토 결정만 반영하며 알림·완료 처리·페이지네이션은 없다. 0045·0046 migration은 2026-09-24 22:51 KST 서울 운영 DB에 적용됐다(2026-09-25 `db:check` 등록·PASS). 직접 녹음·30일 원본 삭제·월 비용·CRM/Office/MCP 배분은 M1~M3. [구현·검증 기록](superpowers/plans/2026-09-23-meeting-text-review-m0.md) |
| Office 역할 품질·토론 조절 | 구현·UI 로컬 검증 / 의미 품질 인증 대기 | [9명 역할 지침](superpowers/specs/2026-09-22-office-agent-role-instructions.md), 같은 모델의 역할별 개별 호출·공개 반론·주관 종합, 상황/강도/관점 비중 설정과 요청 스냅샷·복구를 구현했다. source review는 원문 인용의 존재 확인이며 의미 검증이나 독립 검증이 아니다. Office UI 15개 시나리오와 기존 자문·진행률 18개 체크 완료. [완전 독립 심사](evaluations/2026-09-22-office-agent-quality/README.md)의 총점 57~71점·최종 통과 0/9명은 **v10 기준(v11 이전)** 실행 결과다. 후속 [평가 전용 CLI 전체 실행](evaluations/2026-09-22-office-agent-quality/diagnostics/codex-async-core/README.md)은 33/39건 생성·미채점이며 운영 경로에 연결되지 않았다. 현재 역할 카드 v25까지 v11 이후 전부 미채점이다. [원인 평가·재기획](superpowers/plans/2026-09-23-office-agent-quality-replan.md)은 DRAFT·권장안이며 품질 목표와 운영 적용은 아직 대기다. [구현·QA 근거](superpowers/plans/2026-09-22-office-agent-quality.md) **2026-09-23 P0 교정(운영자 확정 6건)**: 역할 카드 v25로 실행 가장·창작 수치·압박 예시를 없애고 v24에서 지워진 근거 규칙을 복원했다 — **말투 튜닝은 독립 재채점 전까지 동결**, 카드 속 영업·재무 수치(40%·20%·14일·5개사)는 운영자의 실제 규칙이 아니다. ⌘J·✦·사이드바 AI 착지가 Office로 바뀌었고, 결과 생성 뒤 기록이 바뀌어도 확인 후 할 일로 연결한다. 불량 다음 행동·근거는 항목만 제외하고 전부 추적되지 않으면 `근거 확인 안 됨`을 표시한다. 실패 원인 분류(단계·원인)와 자유 대화 지연·토큰을 `agent_runs`에 남기고 Office 하단에 최근 7일 요약을 보인다(마이그레이션 없음). 구현 직후 운영 DB 확인: `agent_runs`의 `office.*` 행은 0건(전체 에이전트 최근 실행 2026-07-12) — 실사용 기록이 아직 없다. [P0 교정 계획](superpowers/plans/2026-09-23-office-p0-fixes.md) |
| Office 회의실 A·이브이 배분·멘토 연결·로컬 스킬 요청 | 로컬 코드·테스트·빌드 완료 · 실제 모델·운영 DB 검증(2026-09-25) / 배포·실사용 검증 전 | 안건 복사본·시간순 발언·하단 입력, 명시적 담당 추천과 승인, 결과에서 회사/개인 멘토 한 번 검토·브라우저 세션 후속 상담, 기존 할 일에 연결된 로컬 스킬 요청·증거 영수증을 구현했다. Office와 멘토의 조언은 업무를 자동 변경하지 않고 로컬 스킬은 Mac의 Claude Code·Codex가 별도로 실행한다. 0045·0046·0047 모두 서울 운영 DB에 적용됐다(2026-09-24, [계층 결정](superpowers/specs/2026-09-24-agent-layer-direction.md) §6.4). [계층 결정](superpowers/specs/2026-09-24-agent-layer-direction.md)·[회의실 A](superpowers/specs/2026-09-24-office-meeting-room-layout.md) |
| Supabase 서울 리전 이관 | 이관 완료(2026-09-20) · Vercel 환경 변수 구성 대기 | `rwqefdxalmbrkybxqwxj`(싱가포르 `ap-southeast-1`) → `ncgpnqfulnlshegalmbd`(서울 `ap-northeast-2`). 테이블 71·1368행 **전부 행 수 일치**, `npm run db:check` 7/7 PASS, 앱 읽기(`status: live`)·쓰기 왕복 확인, REST 지연 150ms→57ms. 구 싱가포르 프로젝트는 롤백 경로로 **삭제하지 않고 보존**. 툴킷은 `npm run db:move-region`, 런북·함정(함수 실행 권한 회귀 등)은 [`supabase-korea-region-migration.md`](supabase-korea-region-migration.md), 커밋 `fa1757e`. **Vercel Project·Shared 환경 변수는 2026-09-20 확인 시 0개로, 배포 전에 서울 프로젝트 값으로 처음부터 구성해야 한다** |
| 세 축·Action KPI 기획 1·2주차(오늘 Top 3 · 주간 집계 교정 · 크론 가시성 · 딜 이동 기록 · 저녁 리뷰 두 줄) | 구현·로컬 검증 완료(2026-09-21) · 운영 배포 별도 | 브랜치 `claude/workflow-os-a-week1` 커밋 `e913338`·`3d69283`·`8df4e80`(+ `34bb180` 체리픽). 새 테이블·마이그레이션 0. [구현 기록](superpowers/plans/2026-09-21-workflow-os-a-week1-2.md). **2026-09-23 통합(`claude/integrate-0923`)**: 오늘 3개는 `today-focus-split`(`e0e5c80`)과 한 계약으로 합침(`focus` 토글·409, `focus_dates` 배열은 서버 소유). **텔레그램 평문 캡처는 통합에서 제외** — 웹훅 자체가 운영자 결정 Q2(2026-09-11, `7a6fecf`)로 삭제돼 있어 되살리려면 운영자 재결정이 필요하다. 초안 모드는 `ai-draft-modes.ts` 하나로(옛 `mentor-draft.ts` 흡수) |
| 빠른 입력 전역화 | 구현 완료(2026-09-20) | 캡처 폼을 `daily-brief.jsx` 내부에서 `apps/hub/components/hub/quick-capture.jsx`로 분리해 단일 정본화(`layout="inline"`/`"compact"`). 전역 `C` 단축키(입력 요소 안·팔레트 열림이면 무시)와 ⌘K 팔레트의 `빠른 입력` 액션, 치트시트 등록까지 포함 — DESIGN.md §8.1 생성 단축키 계약을 따른다. 커밋 `6423822` |
| 목업 데이터 가드레일 | 구현 완료(2026-09-20) | `scripts/no-mock-data.test.mjs`가 저장소 전체에서 목업 식별자(`MOCK_`·`DEMO_`·`SAMPLE_`·`DUMMY_`·`FAKE_`·fixtures 계열) 선언과 업무 레코드형 하드코딩 배열을 막는다. 감사 시점의 저장소에는 가짜 업무 데이터가 0건이었고 없던 것은 강제 장치였다. 운영자 확정: 더미 데이터는 **로컬 전용 Supabase 프로젝트에만** 두고 코드에는 넣지 않는다 — 그 프로젝트는 free 플랜 활성 2개 상한 때문에 아직 미생성이다. 커밋 `4516e49` |
| CRM 0단계(0a·0b·0c) · 연락 기록창 전역화 · 넛지 N1~N3 | 구현·로컬 검증 완료(2026-09-23 통합) · 운영 배포 별도 | 연락 기록의 단일 원천을 `crm_activities`로 통일(`282572a`), 고객 연락 행의 죽은 버킷·레일·클릭·반응 복구와 약속 기준 2단 정렬(`1a67949`), 집중 고객을 `won` 전용에서 실제 약속 기준으로(`d4b57b5`·보강 `1879595`), 어디서든 열리는 공용 연락 기록창(`6530533`), 캘린더 접점·넛지 엔진과 읽기·억제 계층(`cae4944`·`0f63bf6`·`8cf3809`), 병합 검증 수리 `eadd97e`. 발신·메모 채널의 무반응 기록을 살리는 `20260923_0042_contact_outcome_reactionless.sql`은 2026-09-23 운영 DB에 적용했다(`db:check` PASS — 0018이 빈 반응을 `invalid-reaction`으로 거절해 "카톡 보냄, 아직 답 없음" 같은 기록이 전부 실패하던 것을 해소). 파일 단위 실행 계획과 잔여 범위는 [`plans/2026-09-21-crm-tab-develop-phase0-1.md`](superpowers/plans/2026-09-21-crm-tab-develop-phase0-1.md) — N3 나머지 표시 2곳과 N4는 대기 |
| 영업·매출 4탭 재구성(오늘 연락·고객·거래·문의) · Futura 확장 · 휴대폰 기록 후보 | 운영자 확정(2026-09-24) · 1차 구현 완료(`09.bigmac1.3` 병합) · 실제 폰 연결·운영 배포 별도 | 운영자가 목업 4장을 보고 "상당히 좋은 것 같아… 진행"·Futura 확장 "2번 오케이". `고객 연락` 앵커를 첫 탭 `오늘 연락`으로 흡수(주요 앵커 10 → 9), 탭 9개를 4개(개인 +현금 흐름, ClassIn +세그먼트)로. 개요·히트맵·Leads·Accounts·Cases는 라우트·⌘K로 남고 가장 가까운 탭을 켠다. 휴대폰은 갤럭시 자동화 앱(MacroDroid/Tasker) → Engine intake → 확인 전엔 기록이 아닌 **기록 후보**. CRM 기획 §4.1의 "2단계 실사용 뒤" 게이트를 운영자 결정으로 앞당겼다. [스펙](superpowers/specs/2026-09-24-revenue-four-tabs-design.md) |
| Rhythm 탭 재설계 | 구현·로컬 검증 완료(2026-09-23 통합) · 운영 배포 별도 | 하드코딩 탭 2개를 제거하고 `computeWeeklyRhythmMatrix` 실데이터로 배선, 루틴 카테고리·주간 목표 필드, Futura 어휘 리스킨(`0a44c6c`·병합 `b7ddf9a`·수리 `0103f9f`). Futura 범위 확장은 DESIGN.md §15 2026-09-23 행(`recommended`)에 기록 |
| 생활 루틴 `오늘의 리듬` | 구현·자동 테스트 통과 / 실사용 화면 검증 대기(2026-09-23) · 운영 배포 별도 | 할 일과 생활 루틴 체크를 분리한 오늘 전용 화면·저장/취소 API(`505394c`), 호출처가 없어진 기존 Visualizer 제거(`2512f21`). 2026-09-23 병합에서 순수 규칙·라우트 테스트 66건이 통과했다. Futura 범위와 세부 화면은 DESIGN.md §15의 `recommended` 상태이며 운영자 화면 검토 전이다. |
| OKR·KPI 수집·측정 흐름 점검 | 구현·로컬 검증 완료(2026-09-23) · 마이그레이션 0 · 운영 배포 별도 | 목표 원장·자동 지표·주간 리포트는 재구현하지 않고 수집·전달 공백만 닫았다: `deals.won_at` 무작성으로 회사 성사 KR이 영구 미측정이던 결함(알려진 단계 전환에서만 기록 + 창 이전 수정 미상 성사 제외), MCP·Council 주간 요약의 Action KPI 누락과 partial 은폐, 월·목 밖에서 볼 수 없던 주간 수치를 목표·성과 → **주간 실측**(지난 4주 + 이번 주, ⌘K)으로. 목표값은 정하지 않았다(09-20 §7.1). 남은 공백·순서는 [기록](superpowers/plans/2026-09-23-okr-kpi-measurement-flow.md) §4 |

2026-09-23 안정화에서 오늘 Top 3의 동시 선택 상한을 위한 `20260923_0043_task_focus_cap.sql`을 추가하고 로컬 PostgreSQL로 검증했다. 같은 날 서울 운영 DB(`ncgpnqfulnlshegalmbd`)에 해당 파일만 적용했으며 `npm run db:check` 전 항목이 통과했다. 트리거는 활성 상태이고 함수 실행 권한은 `service_role`에만 있다. 기존 작업 행은 변경하지 않았다.

2026-09-23 DB 적용 점검에서 현재 기능 20개와 `notes`→`journal_entries` 메모 2건의 이관 완료를 확인했다. 추가 인덱스는 작업 30행 규모와 기존 workspace 인덱스 실행 계획에서 근거가 없어 만들지 않았다. `20260923_0044_migration_history.sql`만 서울 운영 DB에 적용해 비공개 `moonlight_ops` 스키마와 원자적 이력 실행 함수를 만들었다. `db:check`는 기존 기능 20개와 새 이력·RLS·함수 본문·권한 검사를 모두 통과했고, 재실행은 객체 확인 후 건너뛰었다. 테스트용 트랜잭션은 롤백되어 업무 행과 이력 행이 늘지 않았다. 이후 새 SQL은 전체 파일명·SHA256으로 기록한다. 과거 파일은 적용 기록으로 임의 채우지 않았다.

Phase 0는 Content canonical contract, write 응답 분류, honest empty/error UI, 사용자 identity, Content 승인 원자화를 포함한다. 당시 검증 기준선은 Node test 50/50, contract check, typecheck, Hub/Engine build 통과다. 2026-07-15 현재 저장소 검증은 102/102이며 Phase 1A 완료를 뜻한다. Phase 1B·1C는 아직 남아 있으므로 Phase 1 전체 완료로 해석하지 않는다.

2026-09-24 현재 루트 `npm test` 실측은 **2795 tests · 통과 2784 · 실패 0 · 건너뜀 11**이다(건너뜀은 테스트 DB 연결이 있어야 도는 postgres 테스트). 이 줄을 기준선으로 쓰고, 이전 기록의 "1433 tests"·"692/692 통과, 82파일"은 낡았다. CLAUDE.md·AGENTS.md의 테스트 줄도 같은 값이어야 한다. 아래는 그 숫자에 이르기까지의 복구 경위다 — 2026-09-20에 **아예 돌지 않던 테스트 55건을 복구**해 1378 → 1433이 됐고, 원인 두 가지 모두 소스와 무관했다. (1) postgres를 띄우는 8파일이 macOS에서 `LC_ALL` 없이 기동을 거부해 discovery·daily review·inquiry·agent command의 **원자 RPC 검증이 통째로 미실행**이었다. (2) 스윕 테스트 3개(`motion`·`focus-ring`·`button-hover`)가 `.next` 정확일치로만 걸러 `.next.qa`·`.next.ship-*` 같은 빌드 잔재 디렉터리의 미니파이 CSS를 새 위반으로 오인했다. 커밋 `0cc7f18`.

파일 범위(2026-09-24 실측): 저장소의 `*.test.mjs`는 **378파일**이고 **전부 루트 글롭 안**이다(글롭 밖 0건). 한때 글롭 밖이던 `apps/hub/app/api/hub/content/transform/route.test.mjs`·`.../workflow/route.test.mjs` 2파일은 2026-09-20에 `apps/hub/app/**` 패턴이 추가되면서(`cc1b5c9`) 해소됐다. 그 전 2609 병합이 글롭을 `apps/hub/components/**`·`apps/engine/**`·`packages/**`로 확장해 이전에 CI 밖이던 20파일과 실패 4건을 해소한 것도 사실이다. CI(`.github/workflows/ci.yml`)는 `npm test`에 위임하므로 CI와 로컬의 범위는 어긋나지 않는다.

사이드바 앵커는 `hub-nav.test.mjs`가 **주요 9 + 유틸리티 2**로 고정한다(2026-09-24 — 홈, 오늘, 현황, 내 작업, 영업·매출, 기회 탐색, 프로젝트, 브랜드, 콘텐츠 + AI·자동화, 설정). 2026-09-23까지는 `고객 연락` 앵커가 따로 있어 10 + 2였고, 운영자 결정으로 영업·매출의 첫 탭 `오늘 연락`이 됐다([영업·매출 4탭 스펙](superpowers/specs/2026-09-24-revenue-four-tabs-design.md)). 2026-09-04에 맞췄던 "8 primary" 서술은 그 전에 이미 낡았고, 07-15 스펙 §3.1의 숫자는 여전히 과거 기준이고, `hub-tokens.css`·`hub-nav.js`의 주요 9개 앵커 주석은 현재 코드와 맞췄다. 사이드바는 2026-08-04(`5a3d506`)부터 한 단계이며, 07-15 스펙의 2레벨 목적지는 아코디언이 아니라 탑바 탭으로 렌더된다(DESIGN.md §7).

## 4. 현재 문서

### 제품·운영 정본

- [모바일 캡처 & 폰 연동 아키텍처](superpowers/specs/2026-09-24-mobile-capture-and-phone-integration-spec.md) — **기획 확정(2026-09-24) · 1단계 구현 완료, 2~3단계 고가용성 버퍼·공유 시트 설계**. Mac 잠자기 시 웹훅 유실을 방지하는 3중 버퍼(Supabase 직결·MacroDroid 로컬 큐·텔레그램), 안드로이드 시스템 공유 시트(Share Target) 및 통화 종료 10초 팝업 연동 규격 정본.
- [에이전트 계층 방향](superpowers/specs/2026-09-24-agent-layer-direction.md) — **운영자 확정(2026-09-24) · 연결 코드 구현·실제 모델·운영 DB 검증(2026-09-25, §6.1~6.4), 배포·실사용 전**. Office 9인·이브이 접수, Guru/Mentor 에스컬레이션, Legend 주간 카드, 로컬 스킬 실행기의 경계와 연결을 확정한다. Office는 도구 없이 판단·초안·검토만 수행하고, 외부 발송과 작업 변경은 운영자 확인을 거친다.
- [Office 회의실 레이아웃 A](superpowers/specs/2026-09-24-office-meeting-room-layout.md) — **운영자 승인(2026-09-24) · 화면 로컬 구현·390px·실제 호출 검증 완료(계층 결정 §6.1), 실사용 전**. 막힌 할 일 안건을 회의 스레드로 보여 주는 Office 화면 설계다. 메모 기반 회의 텍스트 검토 M0·M0.5와는 별개이며, Engine·계약은 유지한다.

- [macOS 가장자리 펫 목업](superpowers/specs/2026-09-24-macos-edge-pet-mockup-design.md) — **네이티브 프로토타입 · Hub 연결 구현(2026-09-25)**. 오른쪽 펫 → 빠른 기능/고정 위젯 → Mac 화면 집중 차단. [SwiftPM 앱](../prototypes/moonlight-pet-macos/README.md)은 Hub 할 일 조회·추가·완료, 명시적 메모 저장, 실제 주간 일정 조회를 지원한다. 기존 Mac 기록은 보존하며 상세 화면은 브라우저로 연다. [연결·검증 범위](superpowers/plans/2026-09-25-pet-hub-connection.md): 실제 조회 확인, 운영 데이터 시험 쓰기 없음. 전체 화면 앱·다중 화면·Spaces 동작은 실장비 검증 항목이다.

- [회의·녹음·메모에서 실행까지](superpowers/specs/2026-09-23-meeting-to-action-orchestration-design.md) — **DRAFT · M0 텍스트 코드 일부 구현 / M1~M3 권장·미구현(2026-09-23)**. 메모/멀티모달/Office/MCP/Codex의 연결 상태를 점검하고, 근거 검토→선택 저장→역할 배분→실행 영수증의 단계별 설계를 제안한다. 실제 구현 범위는 [M0 기록](superpowers/plans/2026-09-23-meeting-text-review-m0.md)을 따른다. 운영자 프로필의 직접 녹음·30일 원본 삭제·월 비용 표시 요구는 아직 남아 있다.

- [Eevee Office — 9명 역할 지침](superpowers/specs/2026-09-22-office-agent-role-instructions.md) — **실행 지침 구현 · 의미 품질 인증 대기(2026-09-22)**. `role-cards.ts`에서 생성한 읽기용 사본으로 2026-09-21 역할·말투·운영 품질 설계를 구체화한다. 실제 호출·토론 설정·UI 스냅샷·같은 모델의 source review 경계·완료한 UI QA는 [역할 품질 구현 및 검증 계획](superpowers/plans/2026-09-22-office-agent-quality.md)을 따른다. 지침·형식 검사·화면 QA 통과를 역할별 의미 점수로 환산하지 않는다. 아래 업무 내장 설계의 권한·기록·승인·보관 경계는 유지한다.

- [업무 안의 Eevee Office — C레벨 심화 설계](superpowers/specs/2026-09-21-eevee-office-embedded-workflow-deep-design.md) — **구현 승인 · E0~E4 로컬 구현(2026-09-21)**. [통합 검토](2026-09-21-agent-office-consolidated-review.md)의 B 방향을 주간·고객·Threads Studio에 연결했다. Office/작업·실행/코칭·대화/브랜드 자문으로 기존 목적지를 정리하고, 요청 보관·복구와 기존 command를 통한 task 연결을 구현했다. 대체 조항은 §2, 실제 범위·검증·운영 적용 전제는 [단계별 구현 기록](superpowers/plans/2026-09-21-eevee-office-embedded-workflow.md) §9를 따른다. 다른 표면·장기 기억·자동 발송은 후속 제안이다.

- [실사용 입력 개선](superpowers/specs/2026-09-20-input-usability-design.md) — **승인·구현(2026-09-20)**. 체크리스트 한 줄·Enter 연속 입력, 새 할 일 중앙 팝업·저장 후 계속, 메모 태그·업무 연결, PMS 소속 선택 및 반복 범례 축소. [검증 기록](superpowers/plans/2026-09-20-input-usability.md). 태그 검색 0035는 서울 DB 적용 완료.

- [첫 화면 디자인 디벨롭](superpowers/specs/2026-09-21-home-screen-design-development.md) — **DRAFT · 권장(2026-09-21)**. 첫 화면이 두 개라는 사실(`dashboard` Daily Brief 12슬롯 vs 운영자 확정 Futura 트리아지 `dashboard/home` — DESIGN.md §15 2026-09-18·19 `confirmed`)을 정리하고, 12슬롯·3.34폴드(모바일 4.22)를 6슬롯·2폴드로 줄이는 권장안. 실측·진단 6건(팔레트 원색 13건과 가드 공백 포함)·구현 순서 4주·미정 Q132~Q137. **작성 시점의 "Futura 미병합" 전제는 해소됐다** — Futura 3커밋은 2026-09-22 `bcc975f`로 병합됐고(DESIGN.md §15 2026-09-22) 2026-09-23 통합에 그대로 들어왔다. 문서의 접근안 C(두 홈을 한 화면으로 합치는 안)는 여전히 DRAFT·미적용이다. 같은 통합에서 Home 시간표에 일정 완료·특이사항(`CalendarOutcome compact`)을 연결했다(`cff642c`). 데이터 쪽은 [세 축·Action KPI 기획](superpowers/specs/2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md) §6.2가 짝이다.

- [영업·매출 4탭 — 오늘 연락 · 고객 · 거래 · 문의](superpowers/specs/2026-09-24-revenue-four-tabs-design.md) — **운영자 확정(2026-09-24) · 1차 구현 완료 (branch `claude/revenue-redesign` → `09.bigmac1.3` 병합)**. 목업 4장 검토 뒤 확정한 영업·매출 재구성의 정본: 탭 × 스코프 표(개인 +현금 흐름, ClassIn +세그먼트), 탭에서 내려온 화면의 라우트 유지·가장 가까운 탭 규칙, 오늘 연락(놓친 약속 → 기록할까요 → 오늘 약속 → 접힘, 30초 기록 시트, 이번 주 습관 지표) · 고객(검색 우선, 행동 기준 세그먼트 5, 5열, 약속이 맨 위인 드로어) · 거래("언제" 시간 레인, §5.3 선 모양 확실성 리본, 멈춘 거래, 하단 요약 창, 단계·지역 보기) · 휴대폰 기록 후보(MacroDroid/Tasker → Engine intake, 고객 번호 일치만, 자동 저장 없음, Tailscale, 한계 목록)와 데이터 공백·정직성 규칙(측정 원천 없는 수치·목표선·입금됨은 그리지 않음), Q-RR1 해소 및 Q-RR2~Q-RR11 결정·미정 항목. 07-15 사이드바 스펙 D4의 영업·매출 하위 영어 이름과 §3.2 영업·매출 행, CRM 탭 디벨롭 기획 §4.1·§7 3단계 게이트를 대체한다. Futura 확장은 DESIGN.md §15 2026-09-24.

- [CRM 탭 디벨롭 기획](superpowers/specs/2026-09-21-crm-tab-develop-design.md) — **0단계(0a·0b·0c) 적용 완료(2026-09-23) · §4~§5 대설계는 보류**. 운영자가 지정한 여섯 축(연락·미팅 내용·기록·매출 내용·니즈·위기)을 코드에 대입한 지도와 CRM 탭 재구성 권장안(정본 1 + 렌즈 3, 통합 기록창, 니즈·위기 사건 판정, Q117 계층 정렬, 매출 필드). 작성 시점에 검증된 구조 문제 8건 — 기록 저장소 2분열이었고, `reaction` 소비자가 0이었고, 큐 정렬이 Q117과 반대였고, 고객 연락 행의 버킷 필터·레일·클릭·반응 줄이 다른 데이터 모양을 기대해 전부 죽어 있었고, 첫 화면 집중 고객이 `won`만 뽑고 `next_action`은 이관 템플릿이었고(첫 화면 스펙 D3의 원인), 위험 라벨이 점수 밴드다 — **앞의 다섯 건은 2026-09-23 통합에서 0a·0b·0c로 해소했다**(`282572a`·`1a67949`·`d4b57b5`). 남은 것: 위험 라벨이 점수 밴드, 디자인 부채 9건, §4~§5 대설계(여섯 축 중 미팅 내용·매출 내용·니즈) 보류. **§4.1 정보구조는 2026-09-24 운영자 결정으로 앞당겨 일부 채택됐고 위 영업·매출 4탭 스펙이 대체한다**(기록 렌즈·문의 흡수는 불채택). `classinkr-web` `home_v4.2`에서 가져올 7가지·버릴 5가지. 테이블·컬럼 변경 0(RPC v2 함수 1개). 미정 Q138~Q146에 **권장 기본값**을 달아 반대 없으면 진행. 0·1단계 파일 단위 실행 계획은 [`plans/2026-09-21-crm-tab-develop-phase0-1.md`](superpowers/plans/2026-09-21-crm-tab-develop-phase0-1.md).

- [CRM 최적화·편의성·UI/UX 보완 기획](superpowers/specs/2026-09-21-crm-optimization-usability-ux-plan.md) — **DRAFT · 검토용(2026-09-21)**. 위 CRM 탭 기획을 현재 코드와 로컬 화면에 대조한 보완안. 이미 반영된 주간 집계는 제외하고, 저장·조회 신뢰성 → 공통 상세·기록창 → 검색·조회 최적화 → 기록 탐색 순서로 정리했다. 정책 승인·구현 완료를 뜻하지 않는다.

- [CRM·프로젝트의 간결한 보기·입력·고객 연결](superpowers/specs/2026-09-21-crm-project-context-and-focus-design.md) — **진행 승인 · 1·2단계 구현(2026-09-21)**. 프로젝트 고객 칩·요약·역조회, `할 일 / 기록·자료`, 문맥을 이어받는 메모 입력과 초안 복구를 적용했다. 기존 단일 고객 관계·메모 기록을 재사용하며 다중 고객·통합 인물 검색·선택 분석은 후속이다. 운영 DB의 시험 저장은 실행하지 않았다.

- [`operator-workflow-profile.md`](operator-workflow-profile.md) — 운영자 업무 사실과 인터뷰 원본
- [`superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`](superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md) — 활성 제품 설계
- [`master-directive.md`](master-directive.md) — 제품 불변식
- [`master-roadmap.md`](master-roadmap.md) — 단계와 다음 순서
- [`../TODOS.md`](../TODOS.md) — 아직 하지 않을 일과 남은 기술 부채

- [`superpowers/specs/2026-09-21-personal-business-track-and-scope-boundary.md`](superpowers/specs/2026-09-21-personal-business-track-and-scope-boundary.md) — **APPROVED(2026-09-22)**. 개인 사업 트랙(판매 정의 → 오퍼 → 고객 → 외출)과 회사/개인 경계. 핵심: `workspace-map.js`의 `revenueTypes` OR가 고객 유형과 사업 트랙을 융합하고 있어 `org_scope` 선언만으로는 분리가 안 된다. 2026-09-11 스코프 스펙 D10 1단계와 같은 작업이며, D5(미분류 칸 불채택)와의 충돌 1건은 Open Question으로 운영자 결정 대기.

**사이드바 IA · PMS 분류 (최신순, 확정 스펙만 정본)**

- [`superpowers/specs/2026-09-24-revenue-four-tabs-design.md`](superpowers/specs/2026-09-24-revenue-four-tabs-design.md) — **확정(2026-09-24)** 중 IA 부분(§2): 주요 앵커 9 + 유틸리티 2(`고객 연락` 앵커 흡수), 영업·매출 탭 4개와 스코프별 구성, 탭에서 내려온 라우트의 역할 별칭(`REVENUE_ROUTE_TABS`). 다른 앵커의 2레벨 구성은 아래 07-15 스펙 그대로다.
- [`superpowers/specs/2026-09-11-scope-as-global-filter.md`](superpowers/specs/2026-09-11-scope-as-global-filter.md) — **결정됨(2026-09-11)**. 스코프(전체·ClassIn·개인)의 의미와 적용 범위 정본. `2026-07-14` 스펙의 "스코프 = 목적지 전환" 해석을 폐기하고 전역 필터로 바꾼다. 앵커·2레벨 구조 자체는 아래 `2026-07-15` 스펙이 계속 정본이다. 구현은 단계별.
- [`2026-09-11-brand-content-refocus-proposal.md`](superpowers/specs/2026-09-11-brand-content-refocus-proposal.md) — 9월 14일 첫 구현 지시 반영: 브랜드 기준 편집·독립 조회, 소재함·Threads 원고·수동 발행 기록·빠른 메모 연결. §10이 실제 구현 범위이며 나머지는 후속 권장안. 운영 DB 타입 확장은 인증 실패로 미적용.

- [`superpowers/specs/2026-09-09-project-delivery-lifecycle.md`](superpowers/specs/2026-09-09-project-delivery-lifecycle.md) — 시작·검증·종료 일정, 최소 결과물, 완료 조건, 마무리 가능성 및 완료 검증 UI. 운영자 구현 요청 반영, 로컬 검증·운영 배포 별도.
- [`superpowers/specs/2026-07-15-sidebar-second-level-and-pms-taxonomy.md`](superpowers/specs/2026-07-15-sidebar-second-level-and-pms-taxonomy.md) — **확정(2026-07-15)**. 사이드바 2레벨 아코디언 + PMS 분류 체계 정본. `2026-07-14` 8앵커 IA는 유지하되 하위 레벨 노출 방식을 이 문서가 규정한다. 단, 2026-08-04(`5a3d506`) 이후 코드는 사이드바를 한 단계로 두고 하위 목적지를 탑바 탭으로 렌더한다(`hub-nav.test.mjs` "sidebar is one level deep…", DESIGN.md §7). 스펙 본문은 이 변경 뒤 갱신되지 않았다. D4의 영업·매출 하위 이름(개요·Leads·Deals·Accounts·Cases, 영어 유지)과 §3.2의 영업·매출 행, `고객 연락` 앵커는 [2026-09-24 영업·매출 4탭 스펙](superpowers/specs/2026-09-24-revenue-four-tabs-design.md)이 대체한다.
- [`superpowers/specs/2026-07-15-personal-os-surface-restoration-design.md`](superpowers/specs/2026-07-15-personal-os-surface-restoration-design.md) — §3~4(5앵커+More 내비게이션 안)은 위 문서로 대체되어 **채택하지 않음**. §5(Personal 스코프 데이터 계약)·§6(구조적 화면 복구)는 별도로 유효.
- [`superpowers/specs/2026-07-14-sidebar-consolidation-design.md`](superpowers/specs/2026-07-14-sidebar-consolidation-design.md) — 8앵커 압축 + 스코프 셸. 하위 레벨이 통째로 사라진 부분은 위 07-15 분류 스펙 문서가 보완.

**프로젝트 · PMS (2026-09-13 실행 백로그·하위 아이템 보강)**

- [`superpowers/specs/2026-09-24-project-state-and-completion-clarity.md`](superpowers/specs/2026-09-24-project-state-and-completion-clarity.md) — **운영자 승인 1~4순위 구현·로컬 검증**. 프로젝트 상태와 할 일 진척을 구분하고, 모든 할 일 처리 후 결과 확인을 다음 행동으로 안내한다. 상태 용어와 편집·완료 서버 계약을 통일한다. 5순위 어휘·분류 정리는 보류한다. 아래 09-09 스펙의 착수·완료 필수 조건과 09-23 스펙 §5의 완료 검증 제안을 대체한다.
- [`superpowers/specs/2026-09-23-project-direct-workflow-redesign.md`](superpowers/specs/2026-09-23-project-direct-workflow-redesign.md) — **2026-09-23 직접 실행 UI·진척 게이지 후속 구현·로컬 검증**. 프로젝트 안에서 할 일·세부 체크를 바로 입력하고 Enter로 추가한다. 마일스톤·작업 묶음은 선택 사항이며, 결과·완료 기준의 긴 필드는 접는다. 초안·요청 ID 유지와 버전 비교로 재시도를 처리한다. 아래 개요 스펙의 하위 항목 우선 배치를 대체하며 진척의 근거·시점은 유지한다. 선택 프로젝트 게이지는 구간별 색·그라데이션·1회 가속 반짝임을 쓰되 실제 작업 속도 판정은 아니다. §5 서버 완료 검증 제안은 위 09-24 스펙으로 구현·대체됐다.
- [`superpowers/specs/2026-09-23-project-operator-experience-and-write-trust-design.md`](superpowers/specs/2026-09-23-project-operator-experience-and-write-trust-design.md) — **DRAFT · 평가/권장, 진척 근거 진행 바 UI만 구현·로컬 검증**. 할 일·요약·고객에서 프로젝트로 진입해 급한 하위 항목과 체크리스트를 처리하고, 진행/완료 프로젝트를 고객과 함께 월 평가하는 흐름을 구체화한다. 진척 근거 외 모바일 우선순위·보관 영향·저장 멱등성은 여전히 권장안이며 기존 완료 검증·PMS 저장 모델은 유지한다.
- [`superpowers/plans/2026-09-13-pms-task-checklists.md`](superpowers/plans/2026-09-13-pms-task-checklists.md) — **구현·로컬 검증 완료**. 하위 아이템 상세와 체크리스트 기반 진척, 항목별 메모·정렬·저장·충돌 선택. `tasks.meta.checklist`를 사용하며 작업 상태와 체크리스트 완료율은 별도로 유지한다.

- [`superpowers/plans/2026-09-13-pms-execution.md`](superpowers/plans/2026-09-13-pms-execution.md) — **구현·로컬 검증 완료**. 기존 tasks 기록의 실행 백로그, 공통 필터, 일괄 변경, 다음 행동, 정확한 버전 비교와 회사/개인 범위 구분. 새 스키마 없이 개인 운영 방향을 유지한다.
- [`superpowers/specs/2026-07-17-project-create-drawer-design.md`](superpowers/specs/2026-07-17-project-create-drawer-design.md) — **APPROVED**. 프로젝트 탭 3단계 × 3요소 중 `1-1 · 빠른 생성 드로어`. 브랜드 소유 분류(`sns-channel`) 처리는 아래 08-29 브랜드 탭 스펙이 이어받는다.
- [`superpowers/plans/2026-07-17-project-fast-create-1-1.md`](superpowers/plans/2026-07-17-project-fast-create-1-1.md) — 위 스펙의 구현 계획(병합 완료).
- [`superpowers/plans/2026-07-17-pms-command-center.md`](superpowers/plans/2026-07-17-pms-command-center.md) — Projects·Timeline·Roadmap·Rhythm을 하나의 PMS 커맨드 센터로 묶는 구현 계획.

**브랜드 · 개인 매출 (2026-08 이후 추가, 이 인덱스에 늦게 등재)**

- [`superpowers/specs/2026-09-24-personal-business-okr-kpi-design.md`](superpowers/specs/2026-09-24-personal-business-okr-kpi-design.md) — **DRAFT v3 · 운영자 확정 15건(2026-09-24, 3차 4문항 포함) + 권장안, 10월 목표·지표 10개 목표·성과에 등록(2026-09-24, v3 등록 변경 없음), 코드 변경 없음**. 개인 사업 10월 OKR "만들지 않고 이미 가진 것(강의·학원용 소프트웨어 2종·채널)을 돈으로": 주 5~10시간 예산(판매 60%+·유지 10% 이하, **Moonlight 개발은 예산 안이며 10월 동결**), KR 바닥/천장 분리와 안티 골(신규 개발 0, Moonlight 포함), KR2는 1:1 가격 제시만·강의 모집은 마일스톤(9/30 가격 확정·10/9 모집 오픈), 주간 스코어보드 6칸 + 월말 4칸, 소프트웨어 2종은 경계 확인과 병행해 바로 판매하되 취업규칙 관문 표(§6.1)로 멈출 갈래 명시, 끝 그림 미정에 대비한 결정 규칙·분기 결정 질문, 미정 Q1~Q3.
- [`evaluations/2026-09-20-instagram-reference-audit/brand-direction-operator-decisions-2026-09-23.md`](evaluations/2026-09-20-instagram-reference-audit/brand-direction-operator-decisions-2026-09-23.md) — **7개 브랜드 운영자 답변 반영(2026-09-23)**. 정상화·class.moon 집중과 브랜드별 정체성 기준은 운영자 확인 내용이며, 독자 정의·연재명·첫 게시물 아이디어는 제안이다. 이전 6개 브랜드 조사 문서의 정체성·우선순위·미답 질문을 대체한다.
- [`superpowers/specs/2026-08-29-brand-tab-design.md`](superpowers/specs/2026-08-29-brand-tab-design.md) — **P0·P1 구현됨 / P2~P5 제안**. 브랜드를 콘텐츠 필터가 아닌 운영 대상으로 분리. `2026-07-15` PMS 분류 §4의 `sns-channel` 축을 부분 대체.
- [`superpowers/specs/2026-09-01-brand-content-log.md`](superpowers/specs/2026-09-01-brand-content-log.md) — **확정**. 브랜드 컨텐츠 로그(`dashboard/brands/log`) 설계. 운영자 v5 첨부가 확정한 8색 브랜드 아이덴티티 팔레트와 3px 좌측 레일은 DESIGN.md §8.1·§8.2의 이 표면 한정 예외다(§15 2026-09-01 결정).
- [`superpowers/specs/2026-08-19-lead-subject-region-labels-design.md`](superpowers/specs/2026-08-19-lead-subject-region-labels-design.md) — 리드 과목·지역 라벨 설계(12키 고정 어휘·`label_source` 확정도·백필 게이트). 구현 계획은 [`superpowers/plans/2026-08-19-lead-subject-region-labels.md`](superpowers/plans/2026-08-19-lead-subject-region-labels.md).
- [`superpowers/plans/2026-08-31-personal-revenue-roadmap.md`](superpowers/plans/2026-08-31-personal-revenue-roadmap.md) — 개인 스코프 30일 현금흐름 로드맵 구현 계획(`68517ec`로 출시). 디자인 QA 결과는 루트 [`design-qa.md`](../design-qa.md)(플랜이 지정한 경로)이며 `final result: blocked`.

**기회 탐색 (2026-09-13)**

- [개인 사업 기회 캐치](superpowers/specs/2026-09-22-personal-business-opportunity-catch-design.md) — **요청 반영·코드 구현(2026-09-22)**. Council·AI 한 주 정리·일반 메모 분석에 SaaS/컨설팅 후보 포착 기준을 공유한다. 반복 문제·해결 요청·지불 의사·실제 결과를 구분하고 근거·미확인·최소 검증 행동을 제시한다. 원문 없는 패턴 후보를 임의 출처로 보정하지 않는다. 숫자형 주간 카드·기회 자동 등록·정기 실행·배포는 포함하지 않는다.

- [`superpowers/specs/2026-09-13-discovery-contact-signals-design.md`](superpowers/specs/2026-09-13-discovery-contact-signals-design.md) — **신호 목록 입력됨 / 동작 설계 제안 / 구현 전**. 대면 미팅·연락 2회 또는 장시간 통화·선제적인 결제 일정 발언. 자동 판정의 기간·시간 기준은 확인 중이다.

- [`superpowers/specs/2026-09-13-discovery-nudge-design.md`](superpowers/specs/2026-09-13-discovery-nudge-design.md) — **문맥별 넛지 구현·로컬 검증 완료**. 상세의 주요 행동·직접 입력 포커스·단계적 펼침, 날짜 미루기·계기별 숨김·해제, 목록/상세/다른 창 상태 공유. [실행 기록](superpowers/plans/2026-09-13-discovery-nudge.md). 0031 운영 DB는 2026-09-14 적용 완료. 코드 배포는 별도.

- [`superpowers/specs/2026-09-13-opportunity-discovery-v2-design.md`](superpowers/specs/2026-09-13-opportunity-discovery-v2-design.md) — **2A 구현·로컬 검증 완료**. 작업 중심 전환·전체 서버 검색·읽기 중심 상세·관심 질문 시작·검토일 도래 표시. [실행 기록](superpowers/plans/2026-09-13-opportunity-discovery-v2.md). 2B·2C 및 운영 배포는 후속.

- [`superpowers/specs/2026-09-13-opportunity-discovery-design.md`](superpowers/specs/2026-09-13-opportunity-discovery-design.md) — **1차 구현·로컬 검증 완료**. 독립 기회 탐색에서 포착·발굴·검증·실행 연결·보류·종료를 관리한다. 사이드바 primary 9개로 확장. 실제 업무 연결·revision/receipt·이력과 페이지네이션 포함. [실행 기록](superpowers/plans/2026-09-13-opportunity-discovery.md). 2026-09-13 운영 DB 적용·생성/재시도 검증 완료. Vercel 배포를 막던 문의 동기화 크론 주기는 2026-09-17 운영자 확정으로 일 1회(`0 21 * * *`)로 낮췄다([설정 문서](inquiry-gmail-setup.md)). 일간 크론 5개 등록 상태의 프리뷰 배포가 성공해 개수 제한은 배포를 막지 않았다(PR #3). AI 탐색은 후속 범위다.

**하루 리뷰 (R0)**

- [`superpowers/specs/2026-09-12-daily-review-and-council-design.md`](superpowers/specs/2026-09-12-daily-review-and-council-design.md) — **R0 승인·구현 / 후속 단계 DRAFT**. 내 작업 → 하루 리뷰에서 에너지·당일 목표 진척·메모를 날짜별 저장·수정한다. 2026-09-13 운영 DB 적용 및 실제 API 연결 확인 완료. [구현·검증·적용 안내](superpowers/plans/2026-09-12-daily-review-r0.md). Council과 주간 리포트는 후속 제안이다.
- [`superpowers/specs/2026-09-23-daily-review-sustainable-loop-design.md`](superpowers/specs/2026-09-23-daily-review-sustainable-loop-design.md) — **Phase 1~3 승인·구현(2026-09-23) / Phase 4 보류**. R0 입력·원장은 그대로 두고 진입(저녁 18시·다음 날 정오 전 cue, 셸 공용 팝업, `?review=` 딥링크, ⌘K)·입력(숫자 키 1~5, 오늘 3개 권장 카드, AI 코칭은 저장 후)·되돌아보기(월 캘린더·이번 주 k/5)·회복(어제 메우기)을 구현. 마이그레이션 0. 구현 기록은 문서 §10. 2차(원탭 에너지 저장·주간 5칸·지난주 비교·에너지 막대·⌘Enter)는 §11, 3차(GitHub식 16주 활동 흐름·캘린더 활동 농담·상단바 하루 리뷰 버튼)는 §12, 4차(리뷰 팝업: 오늘 한 일·에너지 막대 칸·메모 머리말·푸터 주간 5칸)는 §13.

**콘텐츠 제작 (2026-09-12)**

- [`superpowers/specs/2026-09-12-content-notes-drafts-ai-workflow-design.md`](superpowers/specs/2026-09-12-content-notes-drafts-ai-workflow-design.md) — **방향 승인 · Studio 1차 구현**. 원문·기획·채널별 초안·AI 후보 비교/적용·버전 복원을 연결. 구현·로컬 검증 범위는 문서 §0과 [실행 기록](superpowers/plans/2026-09-12-content-workflow.md)을 따른다. [후속 검증·운영 적용 준비](superpowers/plans/2026-09-12-content-release.md)에서 통합 테스트 오류를 해결했다. 2026-09-14 인증 갱신 및 0026 운영 DB 적용 완료. 일지 신설·기간 회고·자동 콘텐츠 크론과 코드 배포는 후속 범위다.
- [`superpowers/specs/2026-09-23-research-inbox-content-promotion-design.md`](superpowers/specs/2026-09-23-research-inbox-content-promotion-design.md) — **Studio 전 리서치함 선별과 두 목적지 운영자 확인 / 실행 계약 DRAFT, 구현 전**. 브랜드·콘텐츠에서 같은 검토용 원고를 보고 버리거나 기존 소재함의 콘텐츠 후보(`idea`) 또는 Studio 초안(`draft`)으로 보낸다. 기존 소재함 후보를 나중에 같은 콘텐츠 ID로 Studio 초안화한다. 체크·원자 승격·중립 원고 형식·검증 순서는 권장안이다.
- [`superpowers/plans/2026-09-24-brave-news-discovery.md`](superpowers/plans/2026-09-24-brave-news-discovery.md) — **Brave News 수동 탐색 계층 로컬 구현**. 콘텐츠 `뉴스 탐색`에서 세 브랜드·주제·기간을 골라 서버 전용 키로 검색한다. 1회 클릭=API 1회, 최대 10건, URL 중복 제거, 영속 저장 없음. 검색 결과는 원문 확인 전 신호다. 리서치함·AI 선별·원고·두 목적지 승격·정기 실행·유튜브는 아직 구현되지 않았다.
- [`superpowers/specs/2026-09-23-studio-simplification.md`](superpowers/specs/2026-09-23-studio-simplification.md) — **운영자 확정 · 구현(2026-09-23)**. Studio(원고 작성) 기본 화면을 "Threads 글 한 편 끝내기"로 좁혔다: 제목·원문 메모·본문·AI 초안/다듬기·복사·발행했음. 브랜드·기획 6칸·채널·버전·내보내기·다음 행동·목표·검토는 `더보기` 드로어로 옮겼고 기능·저장 계약·DB는 그대로다. 09-12 스펙의 화면 배치(좌 편집/우 도구 패널)를 대체한다. 표면 예산은 `content-studio-surface.test.mjs`가 고정한다. §7 AI 요청·템플릿(요청문 + 글 틀, 서버 DB)은 구현 완료, 운영 DB 마이그레이션 `20260923_0045`는 2026-09-24 적용됨.
- [`superpowers/specs/2026-09-21-brand-research-editorial-system-design.md`](superpowers/specs/2026-09-21-brand-research-editorial-system-design.md) — **브랜드별 목적·검토용 원고 주기·우선 리서치 범위 확정 / 수집·선별·첫 가동 계약은 DRAFT, 구현 전**. politic_officer 2시간 간격, class.moon 하루 3개, 22th nomad 하루 1개·큰 행사 때 최대 7개의 근거 있는 검토용 원고를 준비한다. 검토 위치와 콘텐츠 원장 승격은 위 09-23 후속 스펙이 대체한다. §15의 수동 회차와 근거·실패·비용 계약은 유효하다.

**콘텐츠 성과 (2026-09-22)**

- [`superpowers/specs/2026-09-22-content-performance-design.md`](superpowers/specs/2026-09-22-content-performance-design.md) — **구현·로컬 검증 완료**. 콘텐츠 → 성과에 요약·이번 주·월별 발행량과 직접 기록한 조회·공유·답글을 집계한다. 한국 시간 기준, 브랜드·채널 필터, 미기록/0 구분, 수정 충돌 복구 포함. 수치는 해당 기간 발행 원고의 최신 누적치이며 기간 중 증가량이 아니다. [실행 기록과 검증 한계](superpowers/plans/2026-09-22-content-performance.md). 지정 채널·대시보드의 API/브라우저 자동 수집은 후속 연결이며 아직 실행하지 않는다.

**메모 작성·활용 (2026-09-13)**

- [`superpowers/specs/2026-09-12-memo-writing-reuse-and-analysis-design.md`](superpowers/specs/2026-09-12-memo-writing-reuse-and-analysis-design.md) — **1차 승인·구현 / 후속 분석·추천 DRAFT**. 내 작업 → 메모에서 제목 없는 빠른 기록·선택 보강·업무 연결·발췌의 할 일/Studio 생성과 원문 복귀를 연결한다. 같은 탭 새로고침 복구·충돌 비교·중복 방지 포함. [구현·검증·운영 적용 전제](superpowers/plans/2026-09-13-memo-workflow.md). 0027 운영 DB는 2026-09-14 적용 완료. 코드 배포는 별도다.

**기획 초안 (미확정, 새 구현의 근거로 쓰지 않음)**

- [`superpowers/specs/2026-09-25-product-operations-room-design.md`](superpowers/specs/2026-09-25-product-operations-room-design.md) — **DRAFT · 목업 단계 / 전부 권장안 / 연결 없음**. 제품 운영실: 포트폴리오(상태·사용자·매출·비용·건강), 제품별 전용 페이지, 개발(릴리스 5단계)·보수(전역 점검 종류 × 제품) 체크, 돈 월 마감, 단계와 분리한 운영 상태 5개, 제품 하트비트 push 계약, 매일·매주·매월·분기 리듬, M1~M5. 목업은 비공개 아티팩트.

- [`superpowers/specs/2026-09-24-product-dev-projects-draft.md`](superpowers/specs/2026-09-24-product-dev-projects-draft.md) — **v0.3 · 방향 확정(갈래 B) / 결정 4건 확정(2026-09-25) / 0~2단계 구현(브랜치 `claude/product-lens`) · 운영 DB 미적용**. 제품은 새 `products` 테이블(컨테이너 재사용 권장안을 운영자가 뒤집음), 프로젝트는 `projects.product_id`로 붙는다. 저장소는 `product_repositories`(저장소→제품 1:1), GitHub 폴링 + HMAC webhook을 Engine이 받아 `project_updates.product_id`에 기록, 프로젝트 탭 `제품` 보기와 개요/개발 드로어. 동시 진행 상한은 나중에 정함, ClassIn 고객 ↔ 개인 제품 교차 후보는 표시만 허용. 템플릿·적합도·돈·점수는 3~5단계로 남았다(§13 구현 기록).

- [`superpowers/specs/2026-09-21-reference-capture-and-browse-usability-design.md`](superpowers/specs/2026-09-21-reference-capture-and-browse-usability-design.md) — **입력·모아보기 우선순위 운영자 확정 / 상세 동작 권장안 / 구현 전**. 한 칸에 링크·생각 입력, 저장 후 연속 입력, 전체 검색·상세·수정·즐겨찾기·복귀, 기존 자료 이관을 첫 출시로 제안한다. 09-20 기획의 Studio 우선 순서를 대체하며 AI 초안 연결은 후속이다.

- [`superpowers/specs/2026-09-20-reference-library-writing-workflow-design.md`](superpowers/specs/2026-09-20-reference-library-writing-workflow-design.md) — **DRAFT · 권장안 / 구현 미착수**. 저장 레퍼런스에서 질문·출처 1–3개를 골라 내 관점을 기록하고 기존 소재함·Studio 초안으로 연결한다. item의 선별 출처 사본, 확인 범위, AI 생성 근거와 재시도 계약을 제안한다. 전체 DB 이관·자동 수집·발행은 후속 범위다.

- [`superpowers/specs/2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md`](superpowers/specs/2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md) — **권장안 승인 · §8 1·2주차 구현·로컬 검증 완료(2026-09-21, [구현 기록](superpowers/plans/2026-09-21-workflow-os-a-week1-2.md))**. 운영자의 외부 브레인스토밍(워크플로우 OS 4계층·4모듈·"일단 세 가지"·Action KPI/OKR)을 현재 코드에 대입한 지도(있음·부분·없음·충돌)와 "루프 닫기" 묶음(오늘 Top 3 `tasks.meta.focus_dates`, 주간 집계 원천 교정, 딜 단계 이동 기록, 메모 3분할 통합, 텔레그램 평문 캡처). 새 테이블·마이그레이션 0. 09-03 성장 기획서의 F-0→F-1→F-3 순서를 유지하며 그 옆에서 병행. 초안 크론 수리 커밋 `34bb180`은 `claude/workflow-os-a-week1`에 체리픽(`f15872f`)했고 `automation_runs` 가시성을 더했다. 3·4주차(패턴 저장·태그 facet·목표치 UI)와 30일 게이트는 미착수.
- [`superpowers/specs/2026-09-13-revenue-and-cashflow-design.md`](superpowers/specs/2026-09-13-revenue-and-cashflow-design.md) — **초기 기능 범위 확정 · 상세 설계 권장안**. 사업·개인 재정의 통합/분할 보기, 계좌·카드, 할부·대출·반복 지출, 직접 입력·엑셀/CSV 가져오기와 매출 수금 연결. 구현 전이며 기존 거래 기반 30일 전망과 실제 현금 흐름을 구분한다.

- [`superpowers/specs/2026-09-13-crm-recording-and-lead-scoring-guidelines-design.md`](superpowers/specs/2026-09-13-crm-recording-and-lead-scoring-guidelines-design.md) — **디자인·UI/UX 우선 확정(09-14) / 세부 설계 DRAFT v0.2**. 고객 목록·상세·빠른 기록의 UX 시나리오 → 화면 구조 → 시각·인터랙션 확인 → 실제 기록 연결 → 근거 평가·제한 추천 순서. 메모/연락 결과·버튼·템플릿·내 패턴·리드 스코어링·넛지를 함께 설계하며 실패/복구 상태와 디자인 게이트를 포함한다. 시안 제작·UX 검증·앱 구현·라이브 재채점은 아직 하지 않음.

- [`superpowers/specs/2026-09-13-memo-discovery-and-analysis-design.md`](superpowers/specs/2026-09-13-memo-discovery-and-analysis-design.md) — **2A 승인·구현 / 2B DRAFT**. 한 검색창에서 제목·원문·보강 문장을 찾고, 선택 기간·종류·업무·활용 여부로 좁힌다. 편집 중 입력·펼친 목록·위치를 보존하며 프로젝트·고객·브랜드에서 최근 연결 메모 3개와 전체 보기를 제공한다. [구현·검증 기록](superpowers/plans/2026-09-13-memo-discovery.md). 0030 운영 DB는 2026-09-14 적용 완료. 코드 배포와 선택 AI 분석은 별도다.

- [`superpowers/specs/2026-09-12-unified-inquiries-email-webhook-design.md`](superpowers/specs/2026-09-12-unified-inquiries-email-webhook-design.md) — **APPROVED · 코드 구현(2026-09-13), 운영 연결 대기**. 메일·랜딩페이지 문의 기록, 감지·중복·읽음·처리 상태와 기존 알림 통합. [연결 가이드](inquiry-integration-setup.md), [Gmail 서명·수집](inquiry-gmail-setup.md), [구현·검증 기록](superpowers/plans/2026-09-13-unified-inquiries.md).
- [`superpowers/specs/2026-09-03-sales-content-marketing-to-branding-growth-plan.md`](superpowers/specs/2026-09-03-sales-content-marketing-to-branding-growth-plan.md) — **DRAFT · 권장안**. 세일즈·콘텐츠·마케팅 → 브랜딩 프레임으로 현재 시스템의 강점·약점·보완점·새 베팅을 정리. 실행 항목 대부분은 후속 주제 스펙이 흡수했다(2026-09-22, 문서 §15.9). 살아 있는 것은 F-0(초안 크론 2개 수리·실패 가시성)·마이그레이션 번호 규칙·시트 import뿐이고, 첫 빌드 후보였던 "오늘 연락할 리드"(B-5)는 Q117 확정과 충돌해 폐기됐다. 운영자 확정 전까지 권장.
- [`superpowers/specs/2026-09-04-mcp-server-audit-and-expansion-design.md`](superpowers/specs/2026-09-04-mcp-server-audit-and-expansion-design.md) — **DRAFT · 제안**. MCP 서버 실측 점검(§2만 사실)과 확충·보강 설계. read 라우트 응답 158KB·94KB·52KB 실측으로 "화면용 BFF 통과" 전제를 반증하고 MCP 전용 투영 계층을 제안. 위 성장 계획 F-14를 흡수·확장하며, `integration-control-plane-inheritance.md` §6 계약은 그대로 상속한다. 연결·등록 계층은 2026-09-23 통합으로 출하했다(`f6b6cfa`·`b95fdbe`): 자기 위치를 찾는 런처 단일 진입점, 클라이언트 등록 점검·설치 `npm run mcp:connect -- status --probe|install`, 도구별 bearer 토큰이 필요한 로컬 Streamable HTTP `npm run mcp:http`(127.0.0.1:3333). 공개 터널·OAuth는 운영자 결정 대기. 설정·계약은 [`MCP/API 안내`](../packages/mcp-server/README.md).
- [`superpowers/specs/2026-09-13-codex-mcp-api-integration-design.md`](superpowers/specs/2026-09-13-codex-mcp-api-integration-design.md) — **로컬 P0–P2 구현**. 인증된 공통 Agent API, 작은 MCP 조회, 멱등 명령·receipt, SDK worker와 Council 작업 화면을 구현했다. 0032·0033 운영 DB는 2026-09-14 적용 완료. 코드 배포·worker 로그인은 별도 활성화가 필요하고 원격 MCP(P3)는 후속 범위다. 설정은 [`MCP/API 안내`](../packages/mcp-server/README.md)·[`worker 안내`](../packages/codex-worker/README.md)를 따른다.
- [`superpowers/specs/2026-09-05-journal-timeline-and-ai-digest.md`](superpowers/specs/2026-09-05-journal-timeline-and-ai-digest.md) — **DRAFT · 제안**. 일지를 `journal_entries` 단일 타임라인으로 신설하고 AI 정리를 2계층(Gemini 단건 요약·태그 / Claude Code 기간 회고)으로 분할. §3 범위 4건은 2026-09-05 운영자 확정, §2 실측은 사실, 나머지는 구현 전 제안이다. `daily-operating-note-todo.md`의 P1-5·P1-6·P2-8·P2-10을 흡수한다.
- [`superpowers/plans/2026-09-04-post-2609-merge-design-agenda.md`](superpowers/plans/2026-09-04-post-2609-merge-design-agenda.md) — **DRAFT · 권장안**. 2609 병합 직후 실측 기준의 디자인 부채·아젠다. §1~§3은 사실(병합 안전성, 재감사 30차 정지 지점, 프리미티브 채택률·신규 문법 불일치), §4~§5는 권장 우선순위다. `system-eval-2026-08-05.md`를 이어받되 개별 주제의 확정 스펙을 대체하지 않는다.

**재감사 기록 (2026-08~09)**

- [`system-eval-2026-08-05.md`](system-eval-2026-08-05.md) — 재감사 1~30차 채점·조치 로그. 축별(안정성·속도·정체성·사용성·디자인·편의성·UIUX) 점수 추이와 각 차수의 지적·수리 내역. 기록 문서이므로 새 구현의 근거로는 §4의 최신 스펙을 우선한다.

- [`evaluations/2026-09-21-measurable-personal-os-validation.md`](evaluations/2026-09-21-measurable-personal-os-validation.md) — **격리 워크트리 구현·로컬 검증 완료 / 운영 적용 별도**. 공통 목표·지표·근거/관측, 업무 연결, Gemini·구독형 MCP 후보/검토, 실제 DB·브라우저·모델 검증과 6축 평가. [실행 계약](superpowers/plans/2026-09-21-measurable-personal-os.md), [설정/적용 가이드](measurable-personal-os-operations.md). 운영 DB에는 0036·0037이 적용돼 있었으나 목표 명령이 운영에 없는 `public.digest`(pgcrypto는 `extensions` 스키마)를 불러 쓰기가 한 번도 성공하지 못했다 — 2026-09-23 `0039`(해시 수정)·`0041`(AI 권한·NULL 검증 보강)을 적용해 해소. 후속 [최적화·UI/UX 개발안](superpowers/plans/2026-09-21-personal-os-optimization-and-experience.md)은 미확정 제안이다.
- [`superpowers/plans/2026-09-23-okr-kpi-measurement-flow.md`](superpowers/plans/2026-09-23-okr-kpi-measurement-flow.md) — **구현·로컬 검증 완료(2026-09-23)**. OKR·KPI 수집·측정 흐름의 현재 작동 범위, 결함 7건과 조치(성사 시각 무작성·MCP/Council 주간 수치 누락·주간 실측 보기 등), 남은 공백의 우선순위(Action KPI 목표 원천은 마이그레이션·운영 DB 적용 필요)를 기록한다.

### 아키텍처·데이터 정본

- [`supabase-first-operating-ledger.md`](supabase-first-operating-ledger.md)
- [`supabase-db-strategy.md`](supabase-db-strategy.md)
- [`supabase-korea-region-migration.md`](supabase-korea-region-migration.md) — **완료(2026-09-20) 실행 기록과 런북**. 싱가포르 → 서울 리전 이관의 결과 수치, 마이그레이션 재생 대신 덤프 복제를 택한 이유, 연결 문자열(Session pooler) 주의, 실행 중 부딪힌 4가지, 그리고 가장 위험했던 **함수 실행 권한 회귀**(복원된 RPC 29개 중 25개가 anon 실행 가능으로 태어남 → `reconcile-privileges`가 자동 교정). 이관 후 남은 일(Vercel 환경 변수 구성, 로컬 전용 개발 DB 분리, 덤프 정리)도 이 문서가 정본이다. 명령은 `npm run db:move-region`
- [`integration-inventory.md`](integration-inventory.md)
- [`projects-connection-inventory.md`](projects-connection-inventory.md)

### 도메인 참고

- Office Council: [`상위 1% C-Suite 워크플로우 OS 초고도화 명세`](superpowers/specs/2026-09-21-eevee-office-c-suite-operating-system.md), [`Moonlight 시스템 전문화 9인 C-Suite 운영 정본 명세`](superpowers/specs/2026-09-21-eevee-office-moonlight-specialized-roles.md) — **역할·업무 배치의 설계 기준**. 인지 부하 1/3 감소·후속 누락 0건과 고정 챔버·비대칭 린터는 설계 목표이며 달성한 성과나 전체 구현을 뜻하지 않는다. [`탭·기능·시나리오별 역할 배치`](superpowers/specs/2026-09-21-eevee-office-surface-role-map.md), [`9명 상세 설정`](superpowers/specs/2026-09-21-eevee-office-detailed-configuration.md), [`성격·말투 심화 설계`](superpowers/specs/2026-09-21-eevee-office-voice-and-personality-deep-design.md)를 함께 읽는다. 현재 실행 지침은 [2026-09-22 역할 지침](superpowers/specs/2026-09-22-office-agent-role-instructions.md), 실제 호출·UI 검증·미완료 품질 인증은 [구현 및 검증 계획](superpowers/plans/2026-09-22-office-agent-quality.md)을 우선한다. [`운영자 맞춤 판단·산출물 v2`](superpowers/specs/2026-09-21-eevee-office-operating-quality.md) §7과 [`역할·성격·경계 v1`](superpowers/specs/2026-09-15-eevee-office-council-personas.md)의 A+B 전용 API·화면·기억 분리는 유지하며, 업무 연결·운영 적용의 실제 범위는 E0~E4 구현 기록을 따른다. 운영 배포·Legend 카드·worker 연결은 별도다.


- 빠른 메모: [`quick-memo-plan-2026-09-09.md`](quick-memo-plan-2026-09-09.md) — 공통 우측 하단 입력창·초안 복원·기존 메모 저장 경로 재사용. **2026-09-10 로컬 구현·검증 완료, 운영 배포 별도**
- Agent/Council API·MCP: [`agent-council-api-mcp-operating-plan-2026-09-09.md`](agent-council-api-mcp-operating-plan-2026-09-09.md) — 현재 연동 구현과 권장 운영법. 아래 보류된 전체 Agent UI·자율 실행 설계를 승인한 것은 아님
- 작업 지시 큐·Guru: [A→B 승인 설계](superpowers/specs/2026-09-23-work-order-queue-reassessment-design.md)가 제품 기준이며 A0~A5는 로컬 구현·검증됐다([큐 정리 구현 기록](superpowers/plans/2026-09-23-work-order-queue-a.md), [신호 소음 차단 구현 기록](superpowers/plans/2026-09-23-guru-signal-core.md)). [입력→결과 연결 점검](superpowers/specs/2026-09-23-guru-input-to-outcome-audit.md)은 현재 코드·운영 기록의 관찰과 B 단계 후속 권장을 구분한다.
- Guru 도움 카드: [2026-09-24 개발 서버 시범 설계](superpowers/specs/2026-09-24-guru-guidance-cards-design.md)는 Guru를 필요할 때 요청하는 조언과 일간 자료 카드로, Legend를 주간 판단 카드로 둔다. 운영자가 두 후속 목업을 함께 승인해 [멘토 서가·조용한 레일 적용 스펙](superpowers/specs/2026-09-24-guru-dual-experience-design.md)이 코칭·대화 기본 화면과 고객·개인 브랜드·개인 콘텐츠의 접힌 진입점을 정한다([구현 계획](superpowers/plans/2026-09-24-guru-dual-experience.md)). 격리 개발 서버에서 실사용 확인 후 운영 적용은 별도다. 홈·오늘 승인 대기·Studio 본문에는 카드를 넣지 않고, 카드 열람으로 업무를 생성하지 않는다.
- Sales OS: [`sales-os-direction.md`](sales-os-direction.md), [`sales-os/`](sales-os/), [`sales-daily-loop-playbook.md`](sales-daily-loop-playbook.md)
- Content OS: [`content-os-deep-plan.md`](content-os-deep-plan.md)
- Hub/Engine 경계: [`engine-os-separation-ui-plan.md`](engine-os-separation-ui-plan.md)
- 실행 backlog: [`engine-priority-todo.md`](engine-priority-todo.md), [`hub-design-priority-todo.md`](hub-design-priority-todo.md)

도메인 문서가 개인 운영 OS 심화 설계와 충돌하면 심화 설계를 따른다. 특히 과거의 “ClassIn CRM을 읽기만 한다”는 전제는 오늘 확정한 “최초 이관 후 Moonlight 개인 정본 + 공식 요약 outbox” 경계로 대체한다.

### 보류된 기능 설계

- Agent/Council: [`agent-tab-mvp-ui-spec.md`](agent-tab-mvp-ui-spec.md) — 현행 에이전트 경계와 구현은 [에이전트 계층 방향](superpowers/specs/2026-09-24-agent-layer-direction.md)이 정본이다(이 문서의 `dashboard/ai` 라우트 전제는 코드에 없음)
- Daily note/Obsidian: [`daily-operating-note-todo.md`](daily-operating-note-todo.md) — P1-5·P1-6·P2-8·P2-10은 [`superpowers/specs/2026-09-05-journal-timeline-and-ai-digest.md`](superpowers/specs/2026-09-05-journal-timeline-and-ai-digest.md)가 흡수했다(그 문서도 아직 DRAFT). P0-2 Quick Capture는 구현 완료. 남은 고유 범위는 P1-7 Obsidian export(역방향)다
- GitHub Work OS: [`github-workos-mvp-mockup.md`](github-workos-mvp-mockup.md)
- Sales Guru: [`sales-guru-mentor-agent-plan.md`](sales-guru-mentor-agent-plan.md) — 현행 Guru는 [Guru 도움 카드](superpowers/specs/2026-09-24-guru-guidance-cards-design.md)·Office→멘토 한 홉으로 구현됐다(이 문서가 가리키는 `COUNCIL` 배열은 제거됨)
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
