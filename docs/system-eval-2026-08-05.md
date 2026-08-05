# Moonlight OS 비서 시스템 평가 (반복 개선 루프)

> 시작: 2026-08-05 · 상태: ACTIVE — 반복 진행 중
> 목표: **8개 축 평균 94점 이상, 축별 최저 90점 이상** (객관 평가 기준)
> 원칙: 기능 추가가 아니라 **처음 정체성(문준혁 1인용 운영 OS)에 맞는 핵심기능**의 완성도를 끌어올린다.
> 정체성 기준: `docs/README.md` §2 — 인지 에너지 1/3, 고객·프로젝트 후속 누락 0건, 첫 화면 5초 내 "지금 중요한 것" 판단.

## 0. 방법론

- 축별로 코드 전수 감사(“file:line 근거가 있는 검증된 결함만 채점에 반영”)를 수행하고, 사전 정의된 앵커에 맞춰 채점한다.
  - **100** = 해당 축의 계약(DESIGN.md·docs 정본·Phase 계약)이 전 표면에서 성립
  - **90** = 경미한 알려진 결손만 존재, 완화책 있음
  - **80** = 일상 루프에서 체감되는 결함 또는 반복되는 계약 위반 존재
- 재평가는 매 회차 동일 체크리스트로 수행한다(각 축의 체크리스트는 §2 축별 요약에 명시).
- 평가 대상: `apps/hub`(운영 UI) + `apps/engine`(intake/실행) + `packages/*` + 문서 정합.

## 1. 점수 추이

| 회차 | 날짜 | 정체성·핵심기능 | 사용성 | 편의성 | 안정성 | 속도 | 디자인 | UI/UX | 편의 부가기능 | **평균** |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 기준선 (iter 1 평가) | 2026-08-05 | 44 | 57 | 63 | 72 | 74 | 76 | 72 | 41 | **62.4** |
| 재감사 (iter 1~4 반영 후) | 2026-08-05 | 80 | 85 | 88 | 72 | 72 | 77 | — | — | **79.0*** |
| 2차 재감사 (iter 5 반영 후, 부분) | 2026-08-05 | 87 | 86 | — | — | 84 | — | — | — | 부분 측정** |

\** 2차 재감사는 축별 감사 에이전트 5기 중 2기만 완주(속도 84 · 정체성 87 · 사용성 86). 안정성·디자인·UI/UX·편의 에이전트는 세션 한도로 중단 — 09:10Z 리셋 후 재실행. 완주 2기의 잔여 지적(셸 ReferenceError·ClassIn 앵커 아카이브 착지·가짜 페르소나·팬아웃·캐시 부재 등)은 6~9차 수리로 전부 반영 완료.

\* 재감사는 새 체크리스트(각 축 감사 에이전트의 잔여 결함 실측)로 기준선보다 엄격하게 측정 — 안정성·속도는 기준선 대비 하락이 아니라 새로 발견된 결함(무음 병합 소실·records 불일치·팬아웃) 반영. UI/UX·부가기능 축은 세션 한도로 미측정, 5차 수리 후 통합 재측정.

## 2. 축별 요약 (기준선)

### 2.1 정체성·핵심기능 정합 — 44

체크리스트: docs/README §2 첫 화면 계약 11항목 + 비핵심 표면의 스코프 정직성.

- 첫 화면 계약 충족 4/11: Quick Capture ✓ · 오늘 할 일 ✓ · 기획/콘텐츠 pulse ✓ 뿐. **긴급 KA 슬롯 ✗ · 집중 고객 3~5건 슬롯 ✗ · 캘린더 아젠다 ✗ · 메시지 pulse ✗**.
- 정직성 위반 2건: ① 첫 화면 지표 카드가 **하드코딩 가짜 스파크라인**을 실데이터처럼 렌더(`apps/hub/app/api/hub/daily-brief/route.js:43` 기본 인자 `spark=[3,4,3,5,4,6,5,7]`), ② 결정 버튼이 **저장 없이 `✓ Decision` 영수증** 표시(`daily-brief.jsx` 로컬 state만, 새로고침 시 복원).
- `selectOperatorFocusLeads`(3건 캡)가 존재하나 tone 정렬 + `QUEUE_LIMIT=2`에 밀려 화면에서 소실. attention 원장(`attention-ledger.js`)은 첫 화면이 아닌 `my-work`에만 배선.
- PAGE_MAP 31개 중 **~16개가 비핵심(보류 스코프)인데 전부 코어와 동일한 내비 가중치**로 노출(agents×3, automations×6, evolution, heatmap, campaigns, cases). 보류 스코프인 Council이 첫 화면 히어로 CTA 점유.
- 연락 기록 경로 이원화: customers는 원자 RPC(`record_contact_outcome_v1`), followups는 비원자 단건 insert — 첫 화면 칩은 비원자 쪽을 가리킴.

### 2.2 사용성 — 57

체크리스트: "지금 중요한 것" 5초 판단 + 섹션별 다음 행동 1개 + 표면별 진실 상태.

- 강점: CommandCard 1장 + lane 구분된 오늘 할 일 + 침착한 빈 상태 → 최상위 결정은 5초 내 판단 가능.
- 감점: 결정 버튼의 가짜 완료 영수증(저장 안 됨), 지표 카드의 가짜 상승 곡선, 매출·기획·콘텐츠·승인 pulse가 접힌 MoreDetail 뒤(9개 계약 섹션 중 5개에 다음 행동 없음).

### 2.3 편의성 — 63

체크리스트: 코어 루프 3동작(할 일 완료·연락 기록·아이디어 캡처)의 클릭 수 + 영속 영수증.

- 할 일 완료 1클릭(durable PATCH + aria-live 영수증) ✓ · 캡처 type+Enter(idempotency+중복 감지) ✓ — 기준 충족.
- 연락 기록: 첫 화면 진입점 없음, 3클릭+폼, 도달 경로가 비원자 writer — 미충족.

### 2.4 안정성 — 72

체크리스트: 무음 실패 경로 0건 + 쓰기 상태 분류(Phase 0 taxonomy) 준수 + 테스트 배선.

- **CRITICAL**: `outcomes/record` 라우트가 실패 시에도 HTTP 200(`route.js:81` status 인자 누락) → followups가 `res.ok`만 확인해 **실패한 연락 기록이 "기록됨"으로 표시**되고 재시도 버튼 소멸. "후속 누락 0건" 목표를 정면으로 깨는 경로.
- **CRITICAL**: 같은 라우트가 비원자 2단계 쓰기(outcome insert + lead next_action update), followup 결과를 판정에 미반영 — 원자 RPC가 이미 존재하는데 미사용.
- MAJOR: `revenue-write.js`가 라이브 백엔드 거부(timeout/403/500)를 `preview`로 재라벨 → `my-work.jsx:713`이 성공 처리. 캘린더 이벤트 생성 무음 실패(`work.jsx:380-391`). followups 에러 상태가 preview 문구 렌더.
- MAJOR: 테스트 글롭이 `apps/hub/components/**` 미포함 — **17파일/190테스트가 CI 미실행**(정직성 계약 스위트 `partial-truth.test.mjs` 포함). 기존 실패 2건(project-ledger-context deep-equal, supabase-rest 타임아웃 flaky).
- 강점: supabase-rest never-throws + 정밀 reason 분류, Engine 15라우트 전부 fail-closed 서명 검증(timingSafeEqual), daily-brief의 durability predicate 패턴은 모범.

### 2.5 속도 — 74

체크리스트: 첫 페인트 차단 자원 + 핫패스 read 왕복 수 + 입력 지연.

- CRITICAL: `globals.css` 117KB 렌더 블로킹 중 **셀렉터 94%(363/387)가 미사용 死코드**.
- CRITICAL: 최다 호출 read `/api/hub/tasks`가 태스크 목록 하나에 전체 원장 11~14 왕복(`getProjectLedger()` 호출 후 todos만 반환). 딜 체크박스 1탭 ≈ 28 왕복(전체 reload ×2).
- MAJOR: 프로젝트 상세 열기/닫기마다 전체 원장 재조회(URL param이 fetch deps), revenue.jsx memo 0개(드로어 타이핑마다 2,343줄 재실행), 캐시 계층 전무(42 force-dynamic + no-store).
- 강점: 31페이지 전부 lazy 코드 스플리팅 + 유휴 프리페치, 원장 내부는 진짜 배치화(N+1 없음), 전 read limit, 랜딩 첫 페인트 fetch 1건.

### 2.6 디자인 — 76

체크리스트: DESIGN.md §5(색·보더) §6(타이포) §8(primitives) §11(a11y) 위반 카운트.

- MAJOR: 전체 행 opacity로 lifecycle 표현 4곳(§5.3 금지), 2px 레일 6곳 + 2px 보더 4곳(§5.2 "항상 1px"), §15 마이그레이션 완료 선언 표면에서 semantic 색상 카테고리 오용 ~11곳(automations 행 전체 `--success-bg` fill 포함), `AttentionRail` 사용처 0곳(선언과 실제 불일치), hub-app.jsx가 EmptyState/Button 인라인 재구현, h2 계약 위반 2곳.
- 강점: 하드코딩 색상 22개 중 21개 파일에서 0건, JS hover 위반 0건, mono ≥18px 위반 0건, red budget 준수, 계약 회귀 테스트 존재.

### 2.7 UI/UX — 72

체크리스트: §8.1 계약(생성 N·드로어 a11y·ESC·딥링크·정렬 3단·빈 상태 CTA) 표면별 커버리지 + §11.

- 계약 커버리지: 코어 12표면 79%, 전체 60%. Revenue/Work 클러스터는 거의 완비(3단 정렬·금액 파싱·퍼널 정렬·12종 딥링크 one-shot 계약 모범), 나머지(Accounts·Segments·Automations·Agents·Intake·Daily Brief)는 미이관.
- ESC 레이어링 버그: 드로어+⌘K 동시 열림 시 ESC가 둘 다 닫고 dirty confirm 발화. Accounts는 키보드로 열람 자체가 불가(clickable div triple 부재 — §11 위반 8곳). 죽은 create 링크 3곳(`?new=flow` 등 미소비). customers의 N 핸들러가 ⌘N 하이재킹 + 즉시 persist.

### 2.8 편의 부가기능 — 41

체크리스트: 단축키 체계 + 되돌리기 커버리지 + 관용(forgiveness) 설계.

- **완성된 키보드 시스템(j/k·e·n·/·?·x·1-5 + 한국어 치트시트 + 벌크바)이 작성돼 있으나 import 0곳** — 제품에는 ? 치트시트 없음.
- 되돌리기: my-work/projects의 3.5초 deferred-write undo는 상용 수준(쓰기 지연 방식) — 그러나 뮤테이션 ~15종 중 2종만 커버. 삭제 전부 hard delete+confirm, 최고 빈도 액션(연락 기록)·daily-brief 완료·스테이지 변경 undo 없음.
- ⌘K는 페이지 내비만(레코드 검색·생성 불가), TopBar "New"는 팔레트 위장 버튼. 토스트 시스템 부재(inline span, live region 없음).

## 3. 회차별 조치 로그

### Iteration 1 (2026-08-05) — 반영 완료

주제: **정직성 회복(가짜 데이터·가짜 영수증·무음 실패 제거) + 검증 기반(테스트 배선) + S급 계약 위반 일괄 수리.**
검증: `npm test` 480/480 · typecheck 4/4 · hub/engine build 통과.

1. 안정성 — 연락 기록 무음 손실 경로 제거: `outcomes/record` 라우트가 실패 시 502 + `saved` 어휘 + followup 갱신 실패를 판정에 반영. followups 인라인 기록을 **원자 RPC(`record_contact_outcome_v1`) 경로로 전환**(비원자 2단계 쓰기 폐기, 기록이 활동 패널의 `crm_activities`에도 표시되게 됨). 응답 `status==='saved'` 확인, 실패 시 입력 보존 + 상태별 에러 카피(preview/error 분리). 폼이 확정 최소 기록(요약+반응+날짜/기약없음)을 강제.
2. 안정성 — 테스트 배선: 루트 글롭에 `apps/hub/components/**` 편입(따옴표로 Node globstar 사용, +128 테스트 CI 편입), 부패 단언 2건 수리, supabase-rest 타임아웃 테스트 flaky(unref 타이머) 수리. 352→480 테스트.
3. 안정성 — **KST 시간대 버그**(평가 중 발견): 서버 사이드 저장소 포매터 8개 파일이 timeZone 미지정 → 배포(UTC)에서 라벨 -9시간·"오늘" 버킷이 KST 아침 내내 하루 어긋남. 전부 `Asia/Seoul` 고정 + `resolveDueBucket`을 KST day-key 기준으로 재작성 + 자동화 "오늘 실행" 경계도 KST 자정으로.
4. 정체성 — 첫 화면 정직화: 가짜 스파크라인 기본값 제거(실측 시계열 있을 때만 렌더), 결정 `✓` 영수증을 **KST 날짜 스코프 로컬 영속**으로 전환(새로고침 생존, "오늘 처리함" 카피, 되돌리기 추가), 완료 표시 녹색 → 중립(§5.3), all-clear 체크도 중립.
5. 속도: `/api/hub/tasks`를 lean `getTaskLedger()`(3콜)로 분리 — 기존 11~14콜 전체 원장 낭비 제거, `?dealId=` 서버 필터 추가. 프로젝트 상세 닫기/목록 탐색의 전체 재조회 제거(열기만 exact read), 로드맵 선택 해제는 스냅샷 복원. Deals 마운트 중복 fetch 제거. Telegram n8n 포워딩을 `after()`로 응답 뒤 실행(ACK 최대 10초 지연 제거). 캘린더 이벤트 생성 무음 실패 표면화, 딜 체크리스트 토글 실패 표면화.
6. 디자인: 2px 레일 7곳·2px 보더 5곳 → 1px 계약 복구(선택 강조는 §5.3 외곽 outline로), h2 위반 2곳(Calendar 28/700→20/500, Studio h2 추가), 상태 primitive 라벨 10→10.5px(12페이지 일괄), followups 기록 행·daily-brief 결정 카드의 전체 opacity 제거, automations 행 전체 semantic fill → danger 1px 레일, 성공률 신호등 색 → 중립.
7. UI/UX: **ESC 레이어 스택**(`esc-layers.js`) — 드로어 위 ⌘K에서 ESC가 팔레트만 닫음. §11 클릭 div triple 수복(Accounts 3곳·Segments 멤버·daily-brief 2곳·Projects 보드 카드 — 보드 카드는 열기 자체가 불가능했던 것을 수리). customers N 가드(⌘N 하이재킹·연타 대량 생성 차단). 죽은 create 경로 정직화(`?new=flow`/`?new=playbook`/`?new=delivery` 제거, automations 가짜 pause 토글 비활성+사유). ⌘K 어휘를 D4 확정 라벨과 동기화(고객 연락·영업·프로젝트 검색 가능), 중복 팔레트 행 2개 제거.

### Iteration 2 (2026-08-05) — 반영 완료

주제: **최저 2개 축 공략 — 편의 부가기능(死 키보드 시스템 배선·공유 undo)과 정체성(첫 화면 슬롯 컷오버·死코드 제거).**
검증: `npm test` 484/484 · typecheck · hub/engine build 통과.

1. 편의 — 키보드 시스템 배선: import 0곳이던 `ShortcutOverlay`(한국어 치트시트)를 hub-app 전역 `?` 키로 배선(ESC 레이어 스택 참여, 배선 안 된 키는 치트시트에서 제거해 정직 유지). `useCrmKeyboard`/`useCrmSelection`을 Leads·Customers에 배선 — j/k 행 이동(+Moonstone 선택 outline·scrollIntoView), e 편집, / 검색 포커스, Esc 해제, n은 페이지별 수제 리스너를 훅으로 흡수(중복 구현 정리 시작).
2. 편의/안정성 — 공유 되돌리기 훅 `useUndoableAction`: my-work의 deferred-write 패턴 추출 + **언마운트 시멘틱을 clear→flush로 교정**(기존엔 "완료됨" 영수증 후 3.5초 내 페이지 이탈 시 PATCH가 조용히 증발하는 무음 손실 경로였음). daily-brief 오늘 할 일 완료에 3.5초 되돌리기 신설, my-work·projects 이관, 알림 스팬에 `role=status`/`aria-live` 부여, 완료 카피 중립화(§5.3).
3. 정체성 — 첫 화면 확정 슬롯 컷오버(§2/§7): `buildDailyFocus`(lib/daily-focus.js, 계약 테스트 6건) — **긴급 KA ≤1**(KA 회사 × 기한 지난 다음 행동/7일+ 방치 딜, danger 레일), **집중 고객 ≤5**(`selectOperatorFocusLeads` limit 파라미터화 — 신호 큐 tone 정렬에 밀려 소실되던 풀을 명명 슬롯으로), **오늘 일정**(Google Calendar KST 오늘 창, Phase 1B 계약 최초 충족; 미연결은 preview+연결 CTA). 슬롯별 독립 truth 상태. Quick Capture를 §7 1순위 위치로.
4. 정체성 — 보류 스코프 정리: 첫 화면 히어로 CTA 'Council에 묻기'(보류 스코프) → '고객 연락'(코어 루프). 렌더 0회로 첫 화면 청크에 실려 있던 카드 3종(~270줄) 삭제. 도달 불가 eeocrm-sync 死코드 체인 삭제(페이지+라우트 2+repository+response 모듈, git 히스토리 보존).

### Iteration 3 (2026-08-05) — 반영 완료

주제: **속도 최대 항목(死 CSS 퍼지) + 안정성 taxonomy 완결 + 칸반 키보드 + 내비 정직성.**
검증: `npm test` 484/484 · hub/engine build 통과.

1. 속도 — **globals.css 死셀렉터 퍼지: 115KB → 24KB(-79%)**. detach된 public web 시절 셀렉터 704룰 제거(보수 규칙: 룰의 클래스 토큰이 소스에 하나라도 존재하면 유지, @font-face/keyframes/element 셀렉터 보존, 원본은 git 히스토리). 렌더 블로킹 CSS의 ~80%가 사라져 모바일 FCP 직접 개선.
2. 안정성 — revenue-write **preview/failed 분리 완결**(Phase 0 taxonomy): preview는 missing-config만, 라이브 백엔드 거부(timeout/RLS/5xx)는 `failed`→502 (lead/deal/case/account/activity 5개 라우트). EditDrawer는 failed를 자동으로 에러 경로(입력 보존+재시도)로 처리. my-work 삭제의 preview 오독 수리(행 복귀+사실 고지), customers 활동 기록 무언 롤백에 입력 보존 에러 표시.
3. UI/UX — **Deals 칸반 키보드**: j/k 카드 이동(컬럼 순서 평탄화+선택 outline+scrollIntoView) · e 편집 · **1–5 선택 딜 스테이지 이동** · n 흡수. 치트시트에 1–5 행 복원. 숨긴 딜의 전체 opacity → dashed 엣지+숨김 뱃지(§5.3).
4. 디자인 — §15 잔여 정리: 캘린더 이벤트 카테고리의 info/warning 死매핑 제거, evolution copied 녹색 fill·outgoing 녹색·active=success 뱃지 중립화, overview streak 녹색 제거(§13 high-score).
5. 정체성 — **내비 정직성**: 보류 스코프 탭(Agents×3·Flows·Email·Sheets·Evolution)에 `준비 중` 마커 — 코어와 같은 완성 표면처럼 읽히지 않게. Runs·Webhooks·자동화 개요는 Engine 실행 피드백 계약(§1)이라 코어 유지.

### Iteration 4 (2026-08-05) — 반영 완료

주제: **전 축 잔여 감점 소진 — 재평가 전 마지막 수리 회차.**
검증: `npm test` 484/484 · hub/engine build 통과.

1. 속도 — Deals 드로어 타이핑을 드래프트 오버레이로 격리(키스트로크당 보드 전체 재계산 제거, 저장 시점에만 커밋) + scopedDeals/visibleDeals/totals memo. Projects 파생 목록 5종 memo(생성 드로어 타이핑 시 트리 재계산 차단).
2. 편의 — **⌘K 레코드 검색**: 고객·딜·할 일 이름 검색 → 기존 딥링크로 직행(60초 캐시, 새 API 없음). **followups 기록 되돌리기**: 3.5초 지연 쓰기 + 늦은 실패 시 입력 복원(무언 소실 금지). Accounts에 N 단축키·j/k/e·검색 포커스.
3. UI/UX — Accounts 표준화: 3단 정렬(name/health/value/deals, 심각도 순) + `?account=` 딥링크 + Kbd N. Cases·Accounts 모바일 헤더-행 폭 드리프트 수리(`hub-table-min` 공유 규칙). 캐럿·글리프 10px 미만 5곳 → 10.5px.
4. 안정성 — 읽기 실패→preview 오독 잔여 2곳(customers 활동, segments) error로 분리. overview에 reload 노출 + 에러/미연결/빈 상태에 행동 부여.
5. 디자인 — customers HEALTH_TONE 신호등 해체(risk만 danger), content 큐/캠페인 lifecycle 톤 전면 중립화, DESIGN.md §15에 상태 primitive 채택 실측 보정 행 추가(선언-실제 불일치 해소).
6. 사용성/정체성 — 운영 지표 4카드를 접힌 MoreDetail 밖 상시 노출로(§2 매출 pulse "지금 값"), 할 일 목적지 4곳을 정본(work/my)으로 통일(B-12).

### Iteration 5 (2026-08-05) — 반영 완료

주제: **재감사(축별 감사 에이전트 4/5) → 실측 잔여 결함 5개 배치 수리.**
검증: 각 배치마다 `npm test` 549/549 · hub build 통과. 커밋 d920e76 · 1b3a9e4 · e333466 · 2a80f34.

1. 안정성(1/3) — 읽기 실패 정직화 마감: followups-ledger 한쪽 소스 null → `partial`+failedSources, 둘 다 → `error`(기존엔 한쪽 null이면 live로 렌더돼 행이 무음 소실). daily-brief/revenue 훅 transport 실패 → `error`(기존 preview 오독). overview `ledger.status` error 우선. work-orders/캘린더/사이드바 뱃지 `r.ok` 가드. followups/my-work 훅 staleness guard(늦은 응답이 새 상태를 덮는 레이스 차단).
2. 안정성(2/3) — 무음 쓰기 소실 제거: revenue persistActivity 실패 시 낙관 행 제거+입력 복원+role=alert 에러(기존엔 실패 무시+입력 소거). **engine pms-command-service `persistence.rows`→`records` 수리**(에코 반환·stale-409 데드코드 부활) + 유닛 mock 동기화. 테스트 글롭에 engine/packages 편입(484→549, quoted globstar).
3. 정체성/사용성(1·2/3) — §7 fold 순서: FocusSlots(긴급 KA·집중 고객·오늘 일정)를 CommandCard 위로. KA 빈 상태에 지정 방법 명시("KA 지정은 Sales Ledger 시트"). 집중 고객 숫자 점수 노출 제거(§7 금지). `queueApprovals` 죽은 self-link → agents/orders. 메시지 축 부재를 StatusLine에 정적 고지. classin 별칭 → LEGACY_REDIRECTS, intake-inbox 死페이지 삭제, ⌘K 설정/콘텐츠 키워드 보강.
4. 속도(3/3) — attention-ledger를 lean `getTaskLedger`(4콜/1웨이브)로 전환(최다 호출 엔드포인트, 기존 14콜/2웨이브). projects 태스크 낙관 flip+rollback(전체 reload 대기 제거). revenue SortHead 모듈 호이스트(헤더 unmount/remount 제거)·Leads/Accounts 파생 memo(검색 인덱스 1회 구축). SUIT/JetBrains preload + **MaruBuri 9.6MB 死폰트 삭제**.
5. 디자인(4·5) — §5.3 semantic 색 전면 소거(44곳 실측분): deal-stages `color`→`ramp` 인덱스 개명(Badge 톤 오용 경로 차단, Moonstone 게이지 유지), daily-brief syncTone(live=green 등) → error만 danger, work/content/automations/customers 등 truth·lifecycle·카테고리 색 전부 중립화. **hub-primitives 다크 전용 OKLCH 15곳 → 테마 토큰**(라이트 AA 복구). 칸반 스트라이프·드롭타깃 2px→1px. agents 채팅 h2 신설, overview 차트 키보드 탐색(←→/Home/End), 10px 메타 10곳 → 10.5, DESIGN.md §11 Daily Brief Display 카브아웃 명문화.

### Iteration 6~9 (2026-08-05) — 반영 완료

주제: **2차 재감사 완주 축(속도 84·정체성 87·사용성 86)의 잔여 지적 전량 소진 + 미완주 축 선제 수리.**
검증: 각 배치 `npm test` 549/549 · hub build 통과. 커밋 99a38cc · a350014 · 42de74e · 720b0a5 · 300cdff.

- **6차 (정체성/사용성)**: 셸 코어 결함 2건 수리 — hub-sidebar `ownerAnchorKey` 미import ReferenceError(스코프 토글 무음 no-op), ClassIn 고객 연락 앵커가 제거된 별칭으로 착지(Archive 플레이스홀더) → 정본 경로. 가짜 페르소나 "Hyeon Park" 3면 → 문준혁. followups h2를 D4 확정 라벨 "고객 연락"으로, 푸터 카피를 실제 writer(crm_activities)로 정정. daily-brief 집중 고객 행에 §7 최소 정보(이유·기한/기약 없음·최근 활동) 추가, 점프 칩을 확정 슬롯 아래로. content Queue/Campaigns N 단축키(usePageCreateHotkey 신설).
- **7차 (속도)**: next-intl 전면 제거(소비자 0, 전 페이지 런타임+메시지 번들 — legal 3페이지 static 복귀). daily-brief 60초 시계 BriefClock 리프 분리(분당 전체 트리 리렌더 제거). my-work 기한 변경(드래그·미루기) 낙관 반영+실패 롤백. revenue 원장 모듈 스코프 stale-while-revalidate 캐시(탭 전환 스켈레톤 제거, 신선도 1 RTT). projects 할 일 편집 저장 PATCH 응답 로컬 병합.
- **8차 (속도 — 첫 화면 팬아웃)**: daily-brief 라우트를 lean `getTaskLedger`(4콜)로 전환 — getProjectLedger 11~14콜/2웨이브 제거(시스템 최다 비용 라우트). lean projection에 status·partialSources 추가로 신호·요약·정직성 소비처 호환. 캡처/완료 후 재검증을 전체 집계(~30콜) → tasks 4콜 슬라이스 교체(refreshTasks). StatusLine error/partial 다시 읽기 버튼. 집계 테스트 4건을 lean 계약으로 갱신.
- **9차 (안정성/디자인)**: use-undoable-action pagehide flush(탭 닫기 시 3.5초 창 내 쓰기 확정 소실 → 최선 노력, re-audit S14). revenue 딜 체크리스트 읽기 실패 정직화(빈 목록 위장 금지). overview 활동 피드 카테고리 semantic 톤 → 중립(§5.3). engine webhook 11개 라우트 인증 검증 전수 확인(전부 통과), localStorage JSON.parse 전수 확인(전부 try 가드), fetch r.ok 휴리스틱 전수 스캔(실긍정 1건만 — 체크리스트).

**미완주 축 보류 항목** (09:10Z 재감사에서 확인): overview 라우트 lean 전환(~35콜, 브랜드/updates/decisions projection 필요 — M), beforeunload keepalive 보장(현행 pagehide 최선 노력), overview 활동 차트 위 브랜드·글리프 lean 필드.

### 다음 회차 백로그 (점수 영향 순)

- 편의 부가기능: 기존 키보드 시스템(useCrmKeyboard/ShortcutOverlay/BulkBar) 전면 배선, 공유 undo 훅 + live-region 토스트 → followups 기록·완료·스테이지 변경·삭제(soft) 확장, ⌘K 레코드 검색.
- 정체성: 첫 화면을 attention 원장으로 컷오버(긴급 KA ≤1 · 집중 고객 ≤5 · 오늘 일정 슬롯), 비핵심 표면 내비 강등(preview 배지/⌘K-only), Council 히어로 CTA 교체, eeocrm-sync 死코드/미사용 카드 3종 제거.
- 속도: globals.css 死셀렉터 퍼지(117KB→~10KB), 드로어 state 지역화 + memo(revenue/projects), 뮤테이션 후 좁은 재검증.
- 안정성: revenue-write preview/failed 분리 + 소비자 수정, 무음 실패 4곳 표면화, followups 에러 카피 분리.
- 디자인: 전체 행 opacity 4곳 → LifecycleBadge + 메타 luminance, §15 표면 semantic 색상 정리, AttentionRail 실사용 전환.
- UI/UX: Accounts/Cases/Automations 테이블 Leads 표준화(모바일 헤더-행 드리프트 수리 포함), Flows/Orders create 경로 완성 또는 버튼 제거.
