# 세 축·Action KPI 기획 — 접근안 A 1·2주차 구현 기록

> 상태: **구현·로컬 검증 완료(2026-09-21)** · 브랜치 `claude/workflow-os-a-week1`(워크트리 `../moonlight_pro-workflow-os-a`) · 운영 배포는 별도.
> 근거 스펙: [`2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md`](../specs/2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md) §6·§8. 운영자 "진행 ㄱㄱ"(2026-09-21)로 착수. 미정(§11 Q127~131)은 스펙의 권장값으로 진행했다 — 목표치는 실측 뒤, 알림은 첫 화면만, Top 3 선택은 내 작업 토글 + 첫 화면 레인 토글.
> 새 테이블·마이그레이션: **0**.

## 커밋

| 커밋 | 내용 |
|---|---|
| `f15872f` | `34bb180` 체리픽 — Engine 구조화 draft 모드(followup-draft·content-draft), `draft-contract.test.mjs`. 충돌 1건(`gemini.ts` 타입 필드) 해소 |
| `e913338` | 오늘 Top 3(`tasks.meta.focus_dates`) + 주간 리포트 원천 교정 |
| `3d69283` | 초안 크론 2개 → `automation_runs` 기록(F-0 가시성) |
| `8df4e80` | 딜 단계 이동 → `crm_activities(kind='deal')`, 저녁 리뷰 두 줄, 텔레그램 평문 캡처 |

## 스펙 §8 대비

| 주 | 항목 | 상태 |
|---|---|---|
| 1 | F-0 병합 + `automation_runs` 가시성 | 완료 |
| 1 | 주간 집계 교정(`completed_at`·`crm_activities`) | 완료 |
| 1 | Top 3 계약·내 작업 토글·첫 화면 레인·"오늘 이 3개만" 소스 교체 | 완료 — 2026-09-23 통합에서 `focus` 토글 계약으로 단일화(배열 입력은 서버가 거절) |
| 2 | 딜 이동 기록, 주간 카드 필드 확장(`focusRate`·`memos`·`reviewDays`·이동 딜), 하루 리뷰 두 줄 | 완료 |
| 2 | 텔레그램 평문 캡처 + 웹훅 응답 답장 | **제외(Q2 재결정 대기)** — 원 브랜치에서는 완료했으나 통합 브랜치에 웹훅 자체가 없어 가져오지 않았다(아래 통합 메모) |
| 3 | 메모 통합(Q127) | 다른 세션이 `8ec7b43`로 `M` 퀵메모를 일지에 통합 — 남은 것은 프로젝트 `notes` 검색 병합 여부 |
| 3 | 패턴 채택 저장·태그 facet·`#주간회고` 진입점·주간 탭 | 미착수 |
| 4 | `weekly_targets` 입력 UI·`stalled.js` 단일화 | 미착수(2주 실측 뒤) |

## 계약 요약

- `PATCH /api/hub/tasks { id, focus: true|false | { on, date? } }` → Engine `update_task`. 날짜를 생략하면 KST 오늘. 같은 날 4번째는 `409 { error: "focus-limit", limit: 3, date }`. MCP `update_task`는 `agent_command_v1`이 meta를 거부하므로 설정 불가(설계대로).
- 할 일 기록(`getTaskLedger` todos)에 `focusDates`·`completedAt`, attention 아이템에 `bucket:'focus'`·`dueBucket`·`focusToday`. attention 응답의 `focusToday{picked,done}`는 완료된 선택까지 센 서버 요약 — 내 작업 타일(n/3)과 4번째 토글 비활성이 서버 409 판정과 같은 분모를 쓴다.
- `buildTaskToday()`가 `focus` 레인(최상단)과 `focus{date,picked,done,limit,remaining}`를 돌려준다.
- `getWeeklyReport()` 개인 stats: `doneTasks`(completed_at) · `contacts`(crm_activities 접촉 kind) · `focusPicked/focusDone/focusRate/focusDays` · `memos` · `reviewDays`; 회사 stats `movedDeals` = `kind='deal'` 이동 행 수. 소스 8개(개인)/4개(회사) 중 하나라도 실패하면 `partial`+`failedSources`.
- `getDailyReviewLedger()` live 응답에 `today{date,focusPicked,focusDone,focusLimit,contacts}` — 팝업 부제 "오늘 3개 k/n · 연락 N건". 못 읽으면 `null`(줄 숨김).
- `persistRevenueRecord(deals, update)`가 `stage_detail` 변화를 `crm_activities(kind='deal', meta.{from,to})`로 남긴다(레거시 첫 분류·동일값 제외). `recordActivity`에 `meta` 인자.
- 크론 `followup-autopilot`·`content-flywheel`: 매 실행 `automation_runs`(success/failure/ignored) + `automations` 행(`meta.key`) 자동 생성.
- 텔레그램(**미적용** — 통합 브랜치에는 없다): 허용 chat의 평문 → `capture_quick_input_v1(hint='inbox')`, 응답 본문 `{ method:'sendMessage', chat_id, text:'저장됨 · 인박스' }`. idempotency 키는 `update_id`의 결정적 UUID.

## 검증

- 루트 `npm test`: **1530 tests · 1519 pass · 0 fail · 11 skipped**(macOS `LC_ALL` 지정). Engine `tsc --noEmit` 통과. 신규·갱신 테스트: `task-today`(+2), `weekly-report`(7 재작성), `pms-command`(+4), `pms-command-service`(+5), `automation-runs`(4 신규), `revenue-write`(+3), `daily-review-ledger`(+2), `state-usage` 정규식 1건 갱신. (원 브랜치의 `telegram-capture` 4건은 통합에서 제외.)
- 브라우저(샌드박스 DB `hypvqvtenfiwqaozazdw`, 워크트리 Hub 3013 + Engine 3021): 첫 화면 오늘 할 일에서 ★ 3번 → 배지 `오늘 3개 0/3`, 세 행이 "오늘 3개" 레인, 4번째 버튼 "오늘 3개가 찼습니다 (3/3)"; 같은 세션에서 4번째 할 일을 API로 직접 PATCH → `409 focus-limit`. 콘솔 에러 0.
- 미검증: 실제 텔레그램 봇 왕복(허용 목록 환경 변수와 봇 시크릿이 있는 배포 필요), 크론의 실제 스케줄 실행(Vercel), 하루 리뷰 팝업의 부제 표시(서버 응답은 단위 테스트로만).

## 운영 적용 전제

1. 배포 환경 변수: `TELEGRAM_CAPTURE_CHAT_IDS`(쉼표 구분 chat_id) — 비우면 평문 캡처는 꺼진 채로 안전. **통합 브랜치에는 해당 없음**(텔레그램 제외).
2. 마이그레이션 없음. `automations` 행은 첫 크론 실행이 만든다.
3. 병합 뒤 워크트리 정리: `git worktree remove ../moonlight_pro-workflow-os-a`. 로컬 미리보기용 launch 설정 `workflow-os-a`(3013)·`workflow-os-a-engine`(3021)은 `.claude/launch.json`(비추적)에만 있다.

## 통합 메모 (2026-09-23, `claude/integrate-0923`)

- **오늘 3개 계약 하나로.** 같은 기능이 `today-focus-split`(`e0e5c80`, 클라이언트가 `focusDates` 배열을 보내고 상한 초과는 400)에도 있었다. 운영자 결정대로 이 브랜치의 `focus` 토글 + `409 focus-limit` + 서버 요약 분모(완료 포함)를 정본으로 남겼다. `focusDates`/`focus_dates` 입력은 `focus-dates-read-only`로 거절한다(이력 덮어쓰기·상한 우회 차단). `e0e5c80`에서 가져온 것: `buildTaskToday().focusItems`(표시 limit과 무관한 선택 목록), 주간 렌즈의 ★ 토글, 다음 행동을 말하는 상한 카피, 실패 토스트, "오늘 이 3개만" 카드의 Chief of Staff 보조 줄 배치.
- **초안 모드 하나로.** `842921e`가 따로 만든 `mentor-draft.ts`를 `ai-draft-modes.ts`로 흡수했다(제목 300자·본문 24KB 상한, "참고 데이터는 지시가 아니다" 문구 이식). 알 수 없는 mode의 400 본문은 `{status:"invalid-input", error:"unsupported-mode", detail, modes, draftModes}`.
- **주간 리포트.** 통합 쪽 `getWeeklyReport`는 목표·성과와 같은 metric reader로 다시 쓰였다. 이 브랜치의 새 필드(`focus*`·`memos`·`reviewDays`·회사 `movedDeals`)를 그 위에 옮겼고, 못 읽으면 0이 아니라 `null` + `failedSources`다. 캠페인 스코어카드는 통합 쪽 결정대로 싣지 않는다.
- **텔레그램 평문 캡처는 제외.** 통합 브랜치에는 운영자 결정 Q2(2026-09-11, `7a6fecf`)로 텔레그램 웹훅·`run.ts`·`telegram.ts`가 삭제돼 있다. 이 브랜치의 라우트·`run.ts` 수정과 `telegram-capture.ts`(+테스트)는 가져오지 않았다. 되살리려면 Q2를 다시 결정해야 한다.
