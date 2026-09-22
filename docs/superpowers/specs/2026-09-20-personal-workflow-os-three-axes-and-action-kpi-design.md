# 개인 워크플로우 OS — 세 축(메모·할 일·CRM/루틴)과 Action KPI 기획

> 상태: **권장안 → 2026-09-21 운영자 "진행" 승인, §8 1·2주차 구현·로컬 검증 완료**(브랜치 `claude/workflow-os-a-week1`, [구현 기록](../plans/2026-09-21-workflow-os-a-week1-2.md)). 3·4주차와 30일 게이트(B)는 미착수. 2026-09-20 office-hours(Builder 모드) 산출물. 운영자가 다른 AI와 나눈 브레인스토밍 원문("나만의 워크플로우 OS … 400%", "일단 세 가지", "액션 KPI·OKR 측정법")을 Moonlight의 현재 코드·문서에 대입해 정리한 기획이다.
> 작성일: 2026-09-20 (Asia/Seoul) · 브랜치 `09.bigmac1.02` · HEAD `0016fa9`
> 상위 정본: [`docs/README.md`](../../README.md) 우선순위 → [운영자 프로필](../../operator-workflow-profile.md) → [개인 운영 OS 심화 설계](2026-07-13-moonlight-personal-operator-os-deep-design.md) → 주제별 최신 스펙([09-05 일지](2026-09-05-journal-timeline-and-ai-digest.md), [09-12 하루 리뷰](2026-09-12-daily-review-and-council-design.md), [09-12 메모](2026-09-12-memo-writing-reuse-and-analysis-design.md), [09-13 메모 2차](2026-09-13-memo-discovery-and-analysis-design.md), [09-03 성장 기획서](2026-09-03-sales-content-marketing-to-branding-growth-plan.md), [09-20 입력 개선](2026-09-20-input-usability-design.md)).
> 관계(2026-09-23 갱신): **§6.2의 `focus_dates` 쓰기 계약은 2026-09-23 통합(`claude/integrate-0923`)이 대체했다** — 클라이언트가 배열을 보내는 원안 대신 서버 소유 이력 + `focus` 토글 + `409 focus-limit`이 현행이고, 토글 날짜는 운영자 오늘 ±1일까지만 받는다. 배열 수용을 되살리면 이력 덮어쓰기와 3건 상한 우회가 함께 돌아온다. 나머지 절은 아래 원문 그대로다.
> 관계: **기존 확정 결정을 바꾸지 않는다.** 09-03 성장 기획서의 첫 30일 순서(F-0 → F-1 → F-3/F-3a, 2026-09-04 CEO 리뷰 HOLD SCOPE)는 그대로 두고, 그 옆에 "루프 닫기" 묶음을 놓는다. 본문의 `확정`은 기존 문서에서 이미 확정된 사실만 가리키고, 이 문서가 새로 제안하는 것은 전부 `권장`이다. 운영자 인터뷰는 중단 상태이므로 여기서 질문을 던지지 않고 §11에 모아 둔다(재개 시 Q127~ 후보).
> 근거: 로컬 코드 읽기 전용 조사 3건(캡처·메모·할 일 / CRM·루틴·크론 / KPI·원장·스키마), 문서 정독, 독립 2차 의견 1회(§10 — Claude 서브에이전트; Codex CLI는 모델 버전 잠금으로 미실행), 적대적 스펙 리뷰 3회(사실 오류·불일치 반영; 리뷰어의 오판 1건 — "`crm_activities`에 `meta` 없음" — 은 0016 마이그레이션 확인으로 기각). 라인 번호 대신 파일·심볼을 인용한다. 운영 DB 건수·실사용 빈도·Vercel 배포 상태는 검증하지 않았다.

---

## 0. 한 장 요약

브레인스토밍이 제안한 4계층 스택(캡처 → 오케스트레이션 → DB → 인터페이스)과 4대 모듈은 **Moonlight에 이미 대부분 있다.** Notion·n8n·Obsidian·Slack 봇을 새로 붙일 일이 아니라, 있는 것을 세 축으로 다시 읽고 빠진 고리를 닫는 일이다. 코드를 직접 확인한 결론은 네 줄이다.

1. **세 축의 원장과 화면은 다 있다.** 메모(`journal_entries`·태그·검색·업무 연결·발췌→할 일/콘텐츠), 할 일(`tasks`·내 작업·첫 화면 오늘 레인·체크리스트·PMS), CRM(리드·딜·고객 연락·원자 결과 RPC·다음 연락일 프리셋), 루틴(하루 리뷰 R0·Rhythm·**주간 리포트 카드**). 주간 리포트(Q118 자동화 1순위)는 문서가 "후속 제안"이라 적고 있지만 `getWeeklyReport`와 첫 화면 카드로 **이미 구현돼 있다.** 단 하나의 예외가 폰 캡처다 — 텔레그램 봇은 슬래시 명령 6종만 처리하고 평문은 `ignored`로 버린다.
2. **없는 것은 기능이 아니라 "닫힘"이다.** 오늘 할 3개를 사람이 고르고 저녁에 완료율이 남는 고리, 주간 리포트가 목표치와 비교되는 고리, 메모 분석 결과가 저장되는 고리가 없다. 선행 지표를 셀 원천(`completed_at`·`created_at`·`occurred_at`)은 대부분 있고, 없는 것은 **사람이 고른 Top 3**와 **딜 단계 이동 이력** 둘이다. 주간 카드는 그마저 두 곳에서 잘못 센다(완료 할 일을 `updated_at`으로, 연락을 호출자 0인 `outreach_outcomes`로).
3. **메모가 세 테이블로 갈라져 있다.** 전역 `M` 퀵메모는 `notes`, 메모 페이지는 `journal_entries`, 빠른 입력 `C`의 비-할일 힌트는 `work_orders` 인박스. "메모를 모아 데이터화"하려면 먼저 하나로 읽혀야 한다.
4. **초안 크론 2개는 HEAD에서 지금도 고장이다.** `followup-autopilot`·`content-flywheel`이 요청하는 모드가 Engine에 없어 매일 조용히 실패하고, `agent_runs(result='error')`만 남을 뿐 에러로 표면화되지 않는다. 수리 커밋(`34bb180`, 2026-09-05, `claude/vigorous-taussig-0f4251`)은 존재하지만 이 브랜치에 **병합되지 않았다.** 09-03 기획서 F-0이 활성 결정 1순위인 이유이며, 이 문서도 그 순서를 유지한다.

**권장.** 접근안 A "있는 것을 닫기"(새 테이블 0, **마이그레이션 0**) + 접근안 C의 규율 하나(목표치는 2주 실측 뒤 정한다). 코드는 이번 주부터 만들되 목표 숫자만 미룬다. 30일 뒤 실사용 데이터가 생기면 접근안 B(행동 원장·목표 테이블·알림 채널·일지 AI 기간 회고)의 조각을 게이트별로 졸업시킨다. 상세는 §5·§8.

---

## 1. 원문 정리 — 브레인스토밍이 제안한 것

운영자가 붙여넣은 대화의 골자다. 판단 없이 그대로 요약한다.

| 구분 | 제안 내용 |
|---|---|
| 프레임 | "기록 마찰 0 + 수집 데이터가 자동으로 다음 실행·인사이트로 치환되는 파이프라인" = 생산성·성과 400% |
| 4계층 스택 | L1 Quick Capture(Telegram/Slack 봇·Raycast·Drafts·AudioPen) → L2 Brain(n8n·Make·LLM 구조화) → L3 Core DB(Notion 관계형 DB·Obsidian) → L4 Interface(Raycast·CLI) |
| 모듈 ① | Zero-friction 캡처 + LLM 파서: 한 줄 메모 → JSON(대상·규모·후속 태스크) → CRM·캘린더·할 일 자동 생성 |
| 모듈 ② | 세일즈 오토메이션: 단계 전환 → 팔로업 초안 자동 생성, 마지막 연락 5영업일 초과 → 아침 브리핑 알림 |
| 모듈 ③ | Closed-loop 루틴: 08:30 아침 브리핑 카드(일정+Top 3+팔로업), 19:00 저녁 회고(완료 체크 + 2줄 답변 → 일일 리포트 DB) |
| 모듈 ④ | 템플릿 엔진(제안서·콜드메일·주간 보고·미팅록) + 프로젝트 사후 분석 DB(태그 기반, AI가 유사 사례 검색) |
| 구축 순서 | Phase 1 DB 4개(프로젝트·태스크·파이프라인·데일리 로그) → 2 캡처 파이프라인 → 3 아침/저녁 봇 → 4 템플릿·자동화 확장 |
| 운영자의 축소 | "일단 세 가지": (1) 메모 빠른 캡처 + 모아서 데이터화·인사이트 (2) 할 일 빠른 입력 → 프로젝트화 또는 완료, **오늘 해야 할 목록이 잘 보이기** (3) (대화 상대가 채운) 세일즈 CRM·팔로업 + 일일 루틴 브리핑 |
| OKR·KPI | O(방향) → KR(결과·지행) → Action KPI(통제 가능한 행동·선행). 축별 예: 주 30건 캡처·인박스 제로, Top 3 완료율 85%·Deep Work 2블록, 주 15건 접촉·SLA 초과 0·24h 내 요약 발송 100%. 체크박스·롤업 자동 집계, 빨간불 자동 알림, 주간 15분 회고 3질문(지표 검증·인과 확인·다음 주 락인) |

---

## 2. Moonlight에 대입한 지도 — 있다 · 부분 · 없다 · 충돌

`있음` = 코드·원장이 있고 동작 경로가 확인됨 · `부분` = 일부만 · `없음` = 검색했으나 없음 · `충돌` = 운영자 확정 원칙과 어긋남. 심볼은 2026-09-20 HEAD 기준이다.

### 2.1 L1 캡처 (모듈 ①의 앞부분)

| 제안 | Moonlight 현재 | 상태 |
|---|---|---|
| 데스크톱 단축키 캡처(Raycast·Drafts) | 전역 `C` → `GlobalQuickCapture`/`QuickCaptureForm`(`apps/hub/components/hub/quick-capture.jsx`, compact Drawer) · 전역 `M` → `QuickMemo`(`quick-memo.jsx`) · 내 작업 `N` 인라인 · ⌘K `quick-capture`/`quick-memo` 액션. 2026-09-20 `6423822`로 전역화 완료 | 있음 |
| 메신저 봇 텍스트 캡처(Telegram/Slack) | Engine `/api/webhook/telegram`(`apps/engine/app/api/webhook/telegram/route.ts`)은 있으나 `COMMAND_HANDLERS`(`apps/engine/lib/run.ts`)가 `/cardnews` `/status` `/ping` `/projects` `/pms` `/webhooks`만 처리 — **슬래시 없는 평문은 `status:"ignored"`로 버려진다.** 답장 경로 없음(`api.telegram.org`·`sendMessage` 호출 0). 라우트에 `forwardToN8n`(`N8N_WEBHOOK_URL`) 전달 옵션이 있어 n8n이 이미 선택 경로에 있다. Slack 없음 | **없음**(폰 캡처는 코드에 없다) |
| 음성(AudioPen) | 없음. 심화 설계 §8 "후속 입력"으로 확정 보류 | 없음(의도) |
| 모바일 | PWA `manifest.json`만. share-target·service worker 없음. iOS 단축어 없음 | 부분 |
| 저장 신뢰 | `capture_quick_input_v1` RPC + `mutation_receipts` idempotency, 저장 확인 뒤에만 입력창 비움(Phase 1A 완료) | 있음 |

### 2.2 L2 오케스트레이션 (모듈 ①의 뒷부분 · 모듈 ②)

| 제안 | Moonlight 현재 | 상태 |
|---|---|---|
| 웹훅 파이프라인(n8n) | Hub BFF → Engine `/api/capture/command` → RPC. 목적지는 운영자가 고른 hint(`inbox/task/note/customer/idea`)로 결정(`task` → `tasks`, 그 외 → `work_orders` 인박스) | 있음(결정론적) |
| LLM 파서: 메모 → JSON → CRM·캘린더·할 일 자동 생성 | 없음. 있는 것은 **선택한 메모 ≤10건**을 `/api/hub/journal/analyze` → Engine `pattern-analyze`(`apps/engine/lib/pattern-analysis.ts`)로 보내 `PatternCandidate`(suggestedTarget task/content/deal/rule, 원문 인용 검증)를 받는 수동 버튼. 결과는 **저장되지 않는다**(`journal_patterns`는 타입 문자열만 있고 테이블 없음) | 부분 · **충돌**(§4 P3) |
| 단계 전환 → 팔로업 초안 | `apps/hub/app/api/cron/followup-autopilot/route.js`(07:00 KST)가 Engine `sales-mentor`에 `mode: "followup-draft"`를 요청하지만 HEAD의 `MODES`에 그 모드가 없다(`pipeline-triage`·`deal-review`·`proposal-critique`·`weekly-retro`·`sparring`만). `normalizeMode`가 조용히 `pipeline-triage`로 바꾸고 응답 `{text}`에 `subject/body`가 없어 항상 errored → `work_orders` 0건. `content-flywheel`도 같은 결함. `recordAgentRun`으로 `agent_runs(result='error')`는 남지만 에러로 표면화되지 않고 `automation_runs`에는 기록이 없다. **수리 커밋 `34bb180`(`apps/engine/lib/ai-draft-modes.ts`, `draft-contract.test.mjs`)이 별도 브랜치에 있고 미병합** | **고장(HEAD)** |
| 5영업일 무접촉 자동 리마인더 | `leads.last_touch_at`·`deals.last_activity_at` 컬럼은 있고 `record_contact_outcome_v1`이 갱신. 정체 기준은 **4곳에 3값**: `revenue.jsx` `STALLED_DAYS=14`, `attention-ledger.js` 리터럴 `14`, `stalled-scan.js` `DEFAULT_THRESHOLD_DAYS=10`, `followups-ledger.js` `STALE_DAYS`(단계별 2~4일, `agent/queries.js`에 복제). **Q117 확정**: N일 무접촉 자동 유입은 최하위(자동 범람 반대) | 부분 · **충돌**(§4 P4) |
| 미팅 후 24h 내 요약 발송 | 없음. 발송은 확정 금지(초안·승인까지). `work_orders` 승인은 `work-order-executor.js`에서 `marked_executed`일 뿐 아무것도 보내지 않는다 | 없음(의도) |
| 크론 스케줄러 | `apps/hub/vercel.json` 일간 5개(`recompute-scores` 00:00 · `followup-autopilot` 07:00 · `content-flywheel` 07:30 · `chief-of-staff` 07:45 · `inquiries-sync` 06:00 KST). 주간 크론 없음. Engine에는 크론 없음 | 있음 |

### 2.3 L3 원장 (구축 순서 Phase 1의 "DB 4개")

| 제안 | Moonlight 현재 | 상태 |
|---|---|---|
| 프로젝트·태스크 DB | `projects`, `tasks`(status inbox/todo/doing/blocked/done, priority, `next_action`, `due_at`, **`completed_at`**, `meta.checklist` ≤50) | 있음 |
| 세일즈 파이프라인 DB | `leads`·`deals`·`contacts`·`companies`·`customer_accounts`·`crm_activities`·`outreach_outcomes`. 6단계 퍼널(`deal-stages.js` `DEAL_STAGES`)은 `meta.stage_detail`에만 있고 DB CHECK는 5값(`prospect/proposal/negotiation/won/lost`) | 있음(부채 1) |
| 데일리 로그 DB | `journal_entries(entry_kind=daily_review)` 날짜당 1건: `review_data{energy 1~5, progress 0/1/2/'not_applicable'}`(CHECK로 키 고정), `focus_target`, `body`. RPC `save_daily_review_v1` | 있음 |
| 메모 DB | **세 곳**: `notes`(전역 `M`·프로젝트 메모 탭·파일 가져오기·`task_memo_links`), `journal_entries(note)`(메모 페이지·자유 태그 `note_meta.tags`·`journal_search_v1`·`journal_links`), `work_orders(kind capture/note/idea)`. `memos` 테이블은 존재하나 코드 참조 0(사장) | 부분(3분할) |
| Obsidian | export 역방향은 `daily-operating-note-todo.md` P1-7로 보류 | 없음(의도) |

### 2.4 L4 인터페이스

| 제안 | Moonlight 현재 | 상태 |
|---|---|---|
| Raycast·CLI | ⌘K 팔레트(`hub-command-palette.jsx`), MCP(`packages/mcp-server`: `create_task`·`update_task`·`complete_task`·`record_contact_outcome`·`get_daily_brief`·`get_weekly_report`·`search_knowledge`), codex-worker. MCP 명령은 Hub `/api/agent/v1/commands` → Engine `/api/agent/command` → SQL RPC `agent_command_v1`(0032)로 가며, PMS 명령 경로(`normalizePmsCommand`)를 거치지 않고 `taskFields`에 `meta`가 없다. **메모를 만드는 MCP 도구는 없다** | 있음(구멍 1) |

### 2.5 모듈 ③ 루틴 브리핑·회고

| 제안 | Moonlight 현재 | 상태 |
|---|---|---|
| 08:30 아침 브리핑 카드(메신저) | `chief-of-staff` 크론(07:45 KST)의 `pickToday`가 "오늘 이 3개만"을 **밤새 큐된 초안 → 정체 딜 1건 → 브랜드 케이던스**에서 뽑아 `project_updates(ai.morning_brief)`에 쓰고, 첫 화면 `MorningBriefCard`가 `brief-ledger.js getMorningBrief`로 읽는다. **할 일에서는 뽑지 않고**, 초안 레인은 크론 고장으로 항상 비어 있다. 발신 채널 0(텔레그램은 inbound만, `slack-alert.ts` 호출자 0, Resend는 `email_send` work order 전용, web-push/VAPID 없음). **확정**: 알림 표면은 첫 화면 + Google Calendar, 푸시는 후순위 | 부분 |
| 19:00 저녁 회고 2줄 → 일일 리포트 | 하루 리뷰 R0(`daily-review-composer.jsx`, compact 팝업, `use-daily-review.js`, `daily-review-ledger.js`) — 에너지·오늘의 목표·진척·메모. 회고 질문(잘된 점·병목) 없음, 세일즈 루프로의 역연결 없음 | 있음(얕음) |
| 주간 15분 회고 | `WeeklyReportCard`(`daily-brief.jsx`) 월=개인·목=회사(Q118·Q119) + `getWeeklyReport`(`apps/hub/lib/repositories/weekly-report.js`) 7일 창 + 캠페인 `business_truth` scorecard(`weekly_actual` 수동 입력) + "한 주 정리 & Council 평가" 위젯. 다른 요일엔 카드가 없고 별도 열람 경로 없음. **집계 오류 2건**: `doneTasks`를 `completed_at`이 아니라 `updated_at`으로 센다(3주 전 끝낸 할 일의 제목만 고쳐도 이번 주 완료로 잡힘), `contacts`를 `outreach_outcomes`로 세는데 그 테이블의 유일한 writer 라우트 `/api/integrations/outcomes/record`는 UI 호출자 0이라 실제 연락(`record_contact_outcome_v1` → `crm_activities`)이 **0으로 나온다.** `movedDeals`는 이동이 아니라 열린 딜 수 | 있음(부채 3) |
| 습관·루틴 트래커 | `routine_checks`(morning/midday/evening/weekly) + Rhythm(`/api/routine`, `/api/routine/check`). 정의 테이블 없이 pending 행 시드로 대체. 연속 달성은 클라이언트 계산만 | 부분 |

### 2.6 모듈 ④ 템플릿·사후 분석

| 제안 | Moonlight 현재 | 상태 |
|---|---|---|
| 템플릿 엔진 | `prompt_templates`, 콘텐츠 Studio 채널별 초안, `sales_plays`. 제안서·콜드메일 템플릿 없음(이 운영자는 이메일 0·인바운드 95%라 원문 예시 자체가 안 맞는다) | 부분 |
| 사후 분석 DB | `decisions` 테이블(`meta` jsonb), 기회 탐색(`discovery_records` findings·decision), 프로젝트 분기 리뷰·클로징 규칙(프로필 §11, 정의만) | 부분 |

### 2.7 OKR·Action KPI

| 제안 | Moonlight 현재 | 상태 |
|---|---|---|
| O/KR/Action KPI 계층 | 목표 테이블 없음. 목표치는 `campaigns.meta.business_truth`(`primary_metric`·`weekly_target`·`weekly_actual`)와 `brands.meta.weekly_goal`뿐 | 없음 |
| 체크박스·롤업 자동 집계 | 전부 in-JS 집계, `fetchSupabaseRows` `limit: 300` 상한, SQL view·집계 RPC 없음 | 부분 |
| 행동 이벤트 원천 | 연락은 `crm_activities`(원자 RPC가 씀)가 이벤트 소스. 할 일 완료는 `completed_at`, 메모는 `journal_entries`/`notes`의 `created_at`, 루틴은 `routine_checks.checked_at`, 발행은 `publish_logs` — 전부 셀 수 있다. **딜 단계 이동만 이력이 없다.** `activity_logs`(workspace·actor·entity·action·correlation·payload·created_at)는 스키마에 있고 writer 0 | 부분 |
| 성공 기준 계측 | 심화 설계 §20의 이벤트 계획(`quick_capture_saved` 등을 `activity_logs`에)은 **한 번도 연결되지 않았다** | 없음 |

---

## 3. 진단 — 부족한 것은 기능이 아니라 닫힘

1. **오늘 Top 3의 고리가 열려 있다.** "하루에 해야 될 목록이 잘 보여야겠지"는 이미 첫 화면 `buildTaskToday`(missed/today/waiting/inbox)와 내 작업 `overdue/today/week/later`가 답한다. 그런데 **사람이 고른 3개**라는 개념이 없고(`tasks`에 focus 플래그 없음), 아침 "오늘 이 3개만"은 죽은 초안 크론의 출력을 읽으며, 저녁 리뷰는 3개의 완료 여부를 모른다. Action KPI의 첫 번째 지표(Top 3 완료율)를 잴 수 없다.
2. **주간 리포트가 목표를 모르고, 두 숫자는 틀리다.** 카드는 숫자 4개를 보여주지만 목표치가 없어 "잘했는가"를 답하지 못한다. 그중 완료 할 일과 연락은 원천이 잘못돼 실제보다 크거나(수정한 옛 할 일) 작다(연락 0). 캠페인에만 있는 `weekly_target`은 콘텐츠 캠페인 전용이고 `weekly_actual`은 손으로 적는다.
3. **셀 수 있는데 안 세고, 하나는 못 센다.** 선행 지표의 원천은 연락·완료·메모·루틴·발행 모두 있다. 딜 단계 이동만 마지막 상태(`deals.stage`)뿐이라 "이번 주 견적으로 넘어간 딜 수"를 못 센다. `activity_logs`가 정확히 그 모양으로 비어 있지만, 지금 필요한 것은 그 테이블이 아니라 딜 이동 한 줄이다.
4. **메모가 세 곳에 있다.** 09-09 빠른 메모 계획("기존 메모 저장 경로 재사용" → `notes`)과 09-12/13 메모 스펙(`journal_entries`)이 각각 승인·구현되면서 생긴 부산물이다. 태그·검색·업무 연결·발췌 활용은 `journal_entries`에만 있다. 데이터화·인사이트는 하나의 읽기 모델이 먼저다.
5. **AI 초안 레인은 배관만 있고 물이 안 흐른다**(F-0). 이 문서가 새로 제안하는 것이 아니라, 활성 결정(2026-09-04)의 1순위다. 수리는 이미 `34bb180`에 있으니 남은 일은 병합과 가시성이다. 모듈 ②를 논하기 전에 이것부터 닫힌다.
6. **폰에서 오는 캡처 경로가 없다.** 프로필 §3의 유입처(머릿속·Instagram DM·회의)와 선호(짧은 텍스트)를 폰에서 받을 코드가 없다. 텔레그램 봇은 평문을 버리고 답장도 못 한다. 세 축 중 첫 번째("메모 빠른 캡처")의 유일한 진짜 결손이다.

부채 메모: 정체 기준 4중 정의(§8 주 4에 포함), `deals.stage` CHECK 5값 vs 6단계 UI, 비원자 결과 쓰기 라우트 1개(`/api/integrations/outcomes/record`, UI 호출자 0)와 그 죽은 테이블을 읽는 GET `/api/hub/outcomes`(`getOutcomeStats`)가 마운트됨(범위 밖, 기록만).

---

## 4. 전제 (권장 — 운영자 동의 필요)

1. **Moonlight가 곧 그 "워크플로우 OS"다.** L1~L4는 Hub/Engine/Supabase/MCP에 대응하므로 Notion·Obsidian·Slack을 새로 붙이지 않고, 텔레그램 라우트에 이미 있는 n8n 전달(`forwardToN8n`)을 **오케스트레이션 계층으로 넓히지 않는다.** 심화 설계 전제 3("기존 원장 재사용")의 연장이다.
2. **세 축은 원장·화면이 있다. 부족한 것은 매일 쓰는 것과 루프의 닫힘이다.** 단 하나의 예외는 폰 캡처(§3-6)로, 이것은 기능 자체가 없다. 2026-07-29 "아직 매일 안 씀"이 여전히 가장 무거운 사실이고, 09-03 기획서의 2차 의견("기능이 문제가 아니다")과 같은 결론이다.
3. **"모든 메모를 LLM으로 파싱해 CRM·캘린더·할 일에 자동 생성"은 하지 않는다.** 프로필 §11 확정(외부 AI 비용을 핵심 기능으로 삼지 않음·저비용 구조화 데이터 우선·AI 분석은 운영자가 누르는 버튼·결과는 확정 전 운영자 확인)과 심화 설계 §8("자동 이름 매칭으로 고객을 붙이지 않는다")에 어긋난다. AI 구조화는 **선택한 기록에, 운영자가 누를 때만**, 그리고 이미 있는 `pattern-analyze`를 쓴다.
4. **"5영업일 무접촉 자동 알림"은 그대로 넣지 않는다.** Q117 확정(4-2-3-1)에서 N일 무접촉 자동 유입은 최하위다. 확정된 메커니즘은 다음 연락일(Q121 프리셋 → `leads.meta.next_action_at`) 도래와 운영자의 컨택 트래킹 표시다. 정체 14일은 첫 화면의 **신호**이지 유입 피드가 아니다.
5. **Action KPI는 새 테이블·마이그레이션 없이 셀 수 있다.** 원천은 `tasks.completed_at`, `crm_activities.occurred_at`, `journal_entries`/`notes`의 `created_at`, `routine_checks.checked_at`, `publish_logs`다. 없는 것은 (a) 오늘 Top 3 표시, (b) 딜 단계 이동 한 줄, (c) 주간 목표치이며 셋 다 기존 컬럼(`tasks.meta`, `crm_activities`, `workspaces.meta`)에 들어간다.
6. **알림 표면은 첫 화면 + Google Calendar다(확정).** 아침 메신저 카드는 첫 빌드가 아니다. 다만 텔레그램 웹훅의 **응답으로 답장**하는 것(`{method:"sendMessage"}`)은 발신 인프라가 아니라 캡처 확인이므로 허용한다. 발신 채널을 새로 만드는 결정은 §11로 넘긴다.
7. **"400%"는 수사다.** 측정은 운영자 확정 기준(인지 에너지 1/3·누락 0건)과 심화 설계 §20의 계측(첫 행동 이해 5초·캡처 10초·연락 결과 20초·미노출 overdue 0건)으로 한다. 이 문서는 400%라는 지표를 만들지 않는다.

---

## 5. 접근안 비교와 권장

| | A. 있는 것을 닫기 | B. Action KPI 원장 | C. 의식 먼저 |
|---|---|---|---|
| 요지 | 새 테이블 0·마이그레이션 0. Top 3 표시(`tasks.meta.focus_dates`), 주간 집계 원천 교정, 딜 이동을 `crm_activities`에 기록, 메모 읽기 통합, 패턴 저장, 텔레그램 평문 캡처+답장 | `activity_logs` 소생 + 집계 RPC, `goals`(O/KR)·`action_kpis`, `deal_stage_history`, 일지 AI 2계층, 발신 채널, §20 클라이언트 계측 | 코드 0. 30일간 기존 주간 카드·하루 리뷰·Rhythm으로 의식을 돌리고 손으로 숫자를 적는다 |
| 규모 | S~M (human ~1주 / CC ~1일) | L (human 3~4주 / CC 3~4일) | 0 |
| 위험 | 낮음 | 중간 — 실사용 데이터 없이 목표치·스키마를 추측 | 낮음 — 다만 Top 3 완료율은 플래그가 없어 못 재고, 폰 캡처는 계속 없다 |
| 완성도 | 8/10 | 9/10(이론) | 4/10 |
| 재사용 | `getWeeklyReport`·하루 리뷰 R0·`pattern-analyze`·`crm_activities recordActivity`·`workspaces.meta`·`pms-command-service.ts`·`journal_links`·텔레그램 웹훅 | 위 전부 + 신규 3테이블 | 전부 |
| 장점 | 2주 안에 첫 Action KPI 숫자가 나온다. 확정 원칙과 충돌 0. 되돌리기 쉽다(meta 키·행 몇 개) | 장기 구조가 깔끔하다 | 빌드 신규성 대신 실사용을 강제한다 |
| 단점 | 목표치 저장 위치가 `workspaces.meta`라 임시적이다. 딜 이동을 활동 행으로 적는 것은 편법이다 | 09-03 2차 의견이 지적한 "루프 닫기보다 신규성으로 흐르는 패턴"의 재현 | 30일 더 기다리면 데이터 기아만 연장된다(§10 2차 의견) |

**권장: A + C의 규율 하나.** A를 이번 주부터 만들되 **목표 숫자만** 2주 실측 뒤 정한다(C에서 가져오는 것은 이것뿐이며, 코드를 미루지 않는다). B의 조각은 30일 게이트 뒤 별도 승인. 09-03 기획서와의 관계: F-0 → F-1 → F-3/F-3a 순서는 그대로이고, 이 문서의 묶음은 그 옆에서 같은 30일에 병행한다(§8).

---

## 6. 권장 설계 — 축별

### 6.1 메모 → 데이터화 · 인사이트

- **읽기 통합이 먼저.** `journal_entries(note)`를 메모의 정본 읽기 모델로 두고, 메모 페이지 검색이 `notes`(프로젝트 메모)도 같은 목록에서 보이게 한다. 방법은 둘 중 하나로 §11 Q127에 건다: (a) 전역 `M`의 목적지를 `journal_entries(note, source='hub')`로 옮기고 `notes`는 프로젝트 첨부·파일 가져오기에만 남긴다(권장), (b) `journal_search_v1`을 `notes`까지 union한다(마이그레이션 1 — A의 "0"이 깨지므로 비권장). (a)는 09-09 계획의 "기존 경로 재사용" 결정을 뒤집으므로 운영자 확인이 필요하다.
- **패턴을 저장한다.** `pattern-analyze`의 `PatternCandidate`를 운영자가 채택하면 `suggestedTarget` 4값을 전부 기존 경로로 보낸다: `task` → `journal_workflow_v1(uuid,uuid,jsonb)`의 `create_task` 액션(`journal_links(use)`, 이미 있음), `content` → 같은 RPC의 `create_content`(`content_workflow_v1`, 이미 있음), `deal` → 해당 딜의 활동 메모(`/api/hub/revenue/activity` `buildActivityWrite`, `crm_activities.meta.source_journal_ids` — 컬럼은 0016에 있다), `rule` → `decisions` 행(`meta.source_journal_ids`). 두 목적지 모두 지금은 `meta`를 실을 수 없다 — `revenue-write.js` `buildActivityWrite`의 `metaPatch`는 빈 객체이고, Engine `pms-command.ts` `create_decision`의 `meta`는 `source`만 허용한다. 두 화이트리스트에 `source_journal_ids` 키 하나를 더한다(코드 변경, 마이그레이션 없음). 새 `journal_patterns` 테이블은 만들지 않는다. 주의: `journal_links(link_kind='use')`의 CHECK는 `target_type in ('task','content')`뿐이라 deal·rule 채택은 `use` 링크로 남지 않는다 — 그래서 §7.2 "미활용 메모 수"는 task·content 활용만 세고, deal·rule 채택은 각 목적지의 `meta.source_journal_ids`로만 역추적한다(링크 CHECK 확장은 마이그레이션이라 B).
- **주기적 정리는 넛지, 자동 실행 아님.** 월요일 주간 카드에 "이번 주 메모 N건 · 분석 0회 · 미활용 M건" 한 줄과 "분석" 버튼. 실행은 운영자(전제 3).
- **태그 facet.** 0035로 태그 검색은 되지만 UI에 facet이 없다. 최근 30일 태그 상위 10개를 칩으로(클라이언트 집계). 태그 사전·정규화는 만들지 않는다(자유 태그 확정).
- **텔레그램 평문 캡처 + 답장.** 슬래시 없는 평문을 `capture_quick_input_v1(hint='inbox')`로 보내고, 웹훅 **응답 본문**으로 `{method:"sendMessage", chat_id, text:"저장됨 · 인박스"}`를 돌려준다(발신 API 호출 없이 Telegram이 처리). 발신자는 환경 변수의 chat_id 허용 목록 하나로 제한하고, 미등록 발신자는 무시한다. idempotency는 새로 만들지 않는다 — `run.ts`의 `reserveTelegramUpdate`가 명령 분기 **이전에** `webhook_events`에 `telegram:<update_id>`를 이미 예약하므로 평문 분기도 그 뒤에 놓으면 재전송이 걸러진다. 워크스페이스는 Engine이 환경 변수의 기본 workspace 하나로 해석(`resolveWorkspaceId`)하므로 chat_id → workspace 매핑은 필요 없다. n8n 전달은 켜지 않는다. 음성은 여전히 후속이다. 이것이 축 1("메모 빠른 캡처")의 폰 경로다.
- MCP `create_memo`(Claude Code·Codex 세션 산출을 일지에 남기기)는 세 축 밖이라 30일 게이트로 보낸다(§8).

### 6.2 할 일 → 오늘 Top 3 → 프로젝트

- **데이터: `tasks.meta.focus_dates`**(KST `YYYY-MM-DD` 문자열 **배열** — 고른 날짜의 이력). 오늘 고르면 오늘 날짜를 append, 해제하면 오늘만 제거한다. 단일 값이 아니라 배열인 이유는 전날 미완료를 오늘 다시 골라도 전날의 선택 수가 줄지 않게(전날 완료율의 소급 변동 방지) 하기 위해서다. 마이그레이션 없음. `focus_dates`를 쓰는 경로는 Hub `/api/hub/tasks` → Engine `/api/pms/command` 하나로 한정한다(`journal_workflow_v1`·`capture_quick_input_v1`·`agent_command_v1`도 `tasks`를 쓰지만 `focus_dates`는 만지지 않는다). `normalizePmsCommand`(`apps/engine/lib/pms-command.ts`, 순수 함수)가 **토글 하나**(`focus: true|false | { on, date? }`)만 받고 날짜 형식과 허용 폭(운영자 오늘 ±1일)을 검증한다 — 배열 입력(`focusDates`/`focus_dates`)은 `focus-dates-read-only`로 400이다(2026-09-23 통합; 아래 관계 참조). **3건 상한은 DB를 읽는 `pms-command-service.ts`**(기존 행을 읽어 `{...meta, ...patch.meta}`로 얕게 병합하는 곳)에서 같은 workspace에서 `meta->'focus_dates'`가 오늘을 포함하는 행 수(Supabase REST `cs` 필터)를 세어 `409 { error: "focus-limit", limit, date }`로 거부한다. 인덱스는 없지만 운영자 1인·수십 행 규모라 허용하고, 동시 요청 레이스는 마지막 쓰기 승리로 둔다(단일 사용자). **MCP `update_task`로는 설정 자체가 안 된다** — `agent_command_v1`(0032, SQL)이 `checklist` 외의 `meta` 키를 `invalid-task-metadata`로 거부한다. 우회가 아니라 차단이므로 MCP 쪽 상한 검증은 필요 없고, 허용하려면 0032 개정(마이그레이션)이라 30일 게이트(B)로 보낸다.
- **선택 화면 2곳, 같은 primitive.** (1) 내 작업 행에 "오늘 3개" 토글 — 선택 상태는 Moonstone(§5.2 selected 의미) + 라벨 "오늘", 색 단독 금지, 4번째부터 비활성. (2) 아침 하루 리뷰 팝업(같은 `Drawer presentation="compact"`)이 후보(missed/today 상위 5, Q116 정렬)를 보여주고 3개를 고른다. 어느 쪽이 기본인지는 §11 Q128.
- **표시.** 첫 화면 `buildTaskToday`(`apps/hub/lib/task-today.js`)와 내 작업 버킷(`/api/hub/attention` → `attention-ledger.js`; `work-ledger.js`는 루틴·Rhythm 원장이라 해당 없음)에 `focus` 레인을 최상단으로 추가(`focus → missed → today → waiting → inbox`). "오늘 이 3개만" 카드(`MorningBriefCard`)의 1차 소스를 `focus_dates`에 오늘이 든 할 일로 바꾸고, 비어 있으면 Q116 정렬 상위 3개를 dashed `◇ 권장`(§5.3 certainty)으로 제안한다. **`chief-of-staff` 크론은 손대지 않는다** — 그 출력은 카드의 보조 줄로 남긴다.
- **완료율은 저장하지 않고 계산한다.** `review_data`의 CHECK가 `{energy, progress}`로 고정돼 있어 필드를 늘리면 마이그레이션이 필요하다. 대신 읽기 시점에 `focus_dates`에 `D`가 든 할 일 중 `completed_at`을 KST로 바꾼 날짜가 `D`인 수를 센다. 규칙: 분모는 그날 고른 수(1~3건, 0이면 그날은 집계 제외), 삭제된 할 일은 분모·분자 모두 제외(`tasks.status`에 cancelled는 없다 — inbox/todo/doing/blocked/done), 전날 미완료는 배열에 전날이 남아 전날 집계에 미완료로 그대로 남고 다음 날은 `missed` 레인에 기한대로 다시 나타난다. 오늘 다시 고르면 오늘이 append되어 오늘의 3개에 들되 전날 집계는 변하지 않는다. 재오픈(done → todo)은 `pms-command.ts`가 `completed_at`을 비우므로 `focusRate`가 소급해 내려간다 — 허용하고 규칙으로 적는다. 근무일은 월~금(KST) 고정: 주말에 고른 것은 그날 집계에 포함하되 `reviewDays`의 분모(5)에는 넣지 않는다. 주간 `focusRate` = 고른 날들의 Σ완료 / Σ선택. 저녁 리뷰 팝업은 "오늘 3개 중 2개 완료"를 읽기 전용으로 보여주고 `progress` 기본값을 제안한다(덮어쓰기 가능). `review_data.focus_task_ids` 스냅샷 저장은 마이그레이션이 필요해 B로 보낸다.
- **프로젝트화.** "할 일 → 프로젝트 승격" 기능은 없다. 프로필 §11의 후보 감지 규칙(Opportunity 생성·가격 대화·14일 3회 활동)은 정의만 있고 구현 여부는 미확인이다. 이 문서는 새로 만들지 않는다 — 할 일 `EditDrawer`(`project-task-detail-drawer.jsx`)에 이미 `projectId` 선택 필드가 있어 "기존 프로젝트로 보내기"는 된다. 내 작업의 할 일 편집 드로어(`my-work.jsx` `EditDrawer`)에서도 같은 필드가 보이는지 확인만 한다.

### 6.3 CRM → 팔로업 + 루틴 브리핑

- **CRM 자체에 새 제안 없음.** 09-03 기획서 F-0(초안 크론 수리 + `automation_runs` 가시성) → F-1(IntakeInbox 라우팅) → F-3/F-3a("오늘 연락할 리드": `first_touch_at` 파생, 소스 배지, 24h 레일)가 활성 결정이며 이 문서는 그 순서를 존중한다. 브레인스토밍의 "5영업일 리마인더"는 F-3a의 24h 레일과 Q121 다음 연락일로 이미 더 정확하게 대체된다.
- **딜 단계 이동 한 줄.** `apps/hub/lib/sales-os/revenue-write.js` `persistRevenueRecord`는 기존 `meta`를 먼저 읽으므로 `stage_detail`의 from/to를 안다. 바뀌었을 때 `crm_activities`에 `entity_type='deal', kind='deal'`(CHECK에 이미 있는 값), `body='단계: 견적 → 최종 미팅'`, `meta.{from,to}` 행을 남긴다. `crm_activities.meta` 컬럼은 0016에 있지만 `recordActivity`(`crm-activities.js`)에 `meta` 인자가 없으므로 인자 하나를 추가한다(코드 변경, 마이그레이션 없음). 같은 값 재저장은 행을 만들지 않는다. 주간 "이동 딜"이 이 행을 센다.
- **부채 1건만 얹는다.** 정체 기준을 한 곳으로: `apps/hub/lib/stalled.js`에 `STALLED_DAYS=14`(첫 화면·칸반)와 `STALE_DAYS`(연락 화면 단계별)를 **둘 다** export하고 4곳이 import한다. 값은 바꾸지 않는다(각각 다른 질문에 답하는 것이 의도된 분리일 수 있음 — Q117 함의). `stalled-scan.js`의 10일은 크론 전용 기본값이라 그대로 두되 같은 파일에서 import한다.
- **아침 = 첫 화면.** 확정 표면이 첫 화면이므로 "아침 브리핑"은 Daily Brief 그 자체다. 바뀌는 것은 "오늘 이 3개만" 카드의 소스(6.2)뿐이다.
- **저녁 = 하루 리뷰 팝업.** 두 줄을 더한다: "오늘 연락 기록 N건"(`crm_activities` 당일 `occurred_at` 카운트, 읽기 전용 — 주간 카드와 같은 원천)과 "오늘 3개 중 k개 완료"(6.2). 회고 질문은 넣지 않는다 — R0의 "심플하게" 요청(09-12)을 유지하고, 잘된 점·병목은 주간에서 묻는다(7.4).
- **주간 = 월·목 카드 + 언제든 열람.** 카드 렌더 조건(월/목)은 유지하되 `dashboard/work/daily-review`에 "주간" 탭을 두어 다른 요일에도 같은 `getWeeklyReport`를 본다. 새 최상위 탭은 없다.

### 6.4 행동 원장 — 지금은 있는 원천으로 센다

`activity_logs`를 살리는 것은 30일 게이트(B)로 보낸다. 2주 실측에 필요한 행동은 전부 기존 테이블에서 셀 수 있고, `activity_logs`가 유일하게 더하는 것은 딜 이동(6.3이 `crm_activities`로 대신함)과 Top 3 선택 이력(지금은 필요 없음)뿐이기 때문이다.

| 행동 | 원천(현재) | 비고 |
|---|---|---|
| 할 일 완료 | `tasks.completed_at`(KST 변환) | 주간 카드의 `updated_at` 집계를 이것으로 교정 |
| 오늘 3개 선택·완료 | `tasks.meta.focus_dates` + `completed_at` | 6.2 |
| 연락 기록 | `crm_activities.occurred_at` | 주간 카드의 `outreach_outcomes` 집계를 이것으로 교정 |
| 딜 단계 이동 | `crm_activities(kind='deal', meta.from/to)` | 6.3, 신규 기록 |
| 메모 | `journal_entries(note).created_at` + `notes.created_at` | 6.1 통합 전까지 두 테이블 합산 |
| 루틴 체크 | `routine_checks.checked_at` | 있음 |
| 발행 | `publish_logs.created_at` | 있음 |

`limit: 300` 상한은 현재 규모에서 문제가 아니지만 집계 RPC(`count_activity_v1`)와 함께 B에서 없앤다. 심화 설계 §20의 시간 계측(`quick_capture_saved` 등)은 클라이언트 이벤트라 역시 B다.

### 6.5 알림 표면

- 지금은 첫 화면 + Google Calendar(확정). 발신 채널을 만들려면 결정이 필요하다(§11 Q130). 후보는 셋이며 각각 코드 규모가 다르다: (a) 없음 — 첫 화면만, (b) **캘린더 종일 이벤트** "오늘 3개: …"를 아침에 `createOrUpdateGoogleCalendarEvent`로 생성(발신 인프라 0, 캘린더가 확정 표면), (c) 텔레그램 능동 발신(`sendMessage` 호출 — 6.1의 웹훅 응답 답장과 달리 발신 코드 신규). 이 문서는 (b)를 권장 후보로 두되 캘린더 오염 우려가 있어 확정하지 않는다.

---

## 7. Action KPI · OKR 측정 설계

### 7.1 원칙

- **O와 KR은 새로 짓지 않는다.** 운영자 확정 성공 기준이 곧 O다: "인지 에너지 1/3, 누락 0건". KR은 프로필 §8 권장 지표(접촉 전환율·거래 성공률·집중 고객 수, 최근 30일 vs 이전 30일)와 09-03 KPI 표(누락 0, 열린 딜 다음 행동 커버리지 90%+, 24h 내 첫 접촉률, Threads 하루 1개)에서 가져온다.
- **Action KPI는 서버가 아는 행동만.** 브레인스토밍의 "Deep Work 2블록"은 시간 추적이 없어 못 잰다 — 넣지 않는다. "콜드 아웃바운드 20건"은 이 운영자의 현실(인바운드 95%, 이메일 0)과 맞지 않아 "리드 도착 → 24h 내 첫 접촉률"로 바꾼다.
- **목표치는 2주 실측 뒤.** 브레인스토밍의 숫자(주 30건 캡처, Top 3 85%, 주 15건 접촉)는 제안값으로만 적고, 실제 목표는 2주 카운트를 보고 정한다(§11 Q129). 저장 위치는 `workspaces.meta.weekly_targets`(jsonb, 컬럼 존재 확인) — B 단계에서 테이블로 승격.

### 7.2 KPI 표

| 축 | KR(지행 · 결과) | Action KPI(선행 · 행동) | 원천 | 현재 상태 | 제안값(미정) |
|---|---|---|---|---|---|
| 메모→인사이트 | 월 채택 패턴 → 행동 전환 n건(`decisions`/`tasks`/활동 생성 수) | 주 메모 수 · 주 1회 분석 실행 · 미활용 메모 수(`use` 링크는 task·content만 — §6.1) | `journal_entries`+`notes` `created_at`, `journal_links(use)` | 부분(두 테이블 합산 필요) | 30/주 |
| 할 일→오늘 | 기한 지난 할 일 0(내 작업 `overdue`) · 프로젝트 마감 준수 | **Top 3 완료율(`focusRate`)** · 하루 리뷰 기록일 수(주 5) · 연속 완주 | `tasks.meta.focus_dates`+`completed_at`, `journal_entries(daily_review)` | **없음**(Top 3) / 있음(리뷰) | 85% |
| CRM→팔로업 | 누락 0(확정) · 접촉 전환율 · 거래 성공률 | 주 연락 기록 수 · 주 이동 딜 수 · 다음 연락일 없는 열린 딜 0 · 24h 내 첫 접촉률(F-3) | `crm_activities`(연락·이동), `leads.meta.next_action_at`, `first_touch_at`(F-3에서 파생) | 부분(주간 카드가 죽은 `outreach_outcomes`를 셈 · 이동 이력 없음) | 15/주 · 0건 |
| 루틴 | 주간 카드를 읽고 결정 1건 남김 | 루틴 체크 n/7 · 주간 회고 메모 주 1건(`#주간회고`) | `routine_checks`, `journal_entries(note, tag)` | 있음 | 1/주 |
| 콘텐츠(참고) | Threads 하루 1개(프로필 §12) | 발행 수 | `publish_logs`(이미 이벤트) | 있음 | 7/주 |

### 7.3 집계 방식

- 주간 창은 현행 7일(`WINDOW_DAYS`)을 유지한다. 개인 카드 `stats`: `doneTasks`를 `completed_at`(KST) 기준으로, `contacts`를 `crm_activities`로 교정하고 `focusPicked`·`focusDone`·`focusRate`·`memos`·`routineRate`·`reviewDays`를 더한다. `movedDeals`는 `crm_activities(kind='deal')` 수로 바꾸고 이름을 맞춘다. `focusRate`는 §6.2 규칙(고른 날의 Σ완료/Σ선택, KST 날짜 일치)이다.
- 목표치가 있으면 각 stat 옆에 `목표 n · 달성 k · 갭` — 색은 쓰지 않는다(§5.2 no-warning-by-default). 미달은 텍스트와 순서로만.
- 회사 카드는 `contacts` 원천 교정 외에 손대지 않는다(ClassIn 축은 §8 권장 지표가 정해질 때 함께).

### 7.4 주간 15분 회고 3질문 → 어디에 매핑되는가

| 질문 | Moonlight에서 | 상태 |
|---|---|---|
| 지표 검증(달성 %) | 주간 카드 stats vs `weekly_targets` | A에서 생김 |
| 인과 확인(행동 채웠는데 KR 무반응 → 메시지·타깃 문제) | 회사 카드의 연락 수·이동 딜 vs 신규·성사 딜 나란히 보기 + "한 주 정리 & Council 평가" 위젯(sales-mentor `weekly-retro` 모드, 수동) | 있음 |
| 다음 주 락인 | 월요일 아침 Top 3 선택(6.2) + `weekly_targets` 갱신 + `#주간회고` 메모 3줄 | A에서 생김 |

### 7.5 "400%"에 대한 정직한 측정

400%는 측정 대상이 아니다. 대신 30일 뒤 다음 넷을 본다: (1) 하루 리뷰 기록일 수 / 근무일(월~금, KST), (2) Top 3 완료율 추이, (3) 첫 화면에 없는 overdue 약속 수(§20 "미노출 overdue 0"), (4) 운영자 자기 보고 에너지(하루 리뷰 `energy` 1~5의 주 평균). 넷 중 셋은 A가 끝나면 자동으로 쌓인다.

---

## 8. 구현 순서 (30일) 와 완료 기준

09-03 기획서의 F-0 → F-1 → F-3/F-3a와 병행한다. 전부 `권장`이며, 순서는 의존성 기준이다. **A 전체에 새 테이블·마이그레이션은 없다.**

| 주 | 묶음 | 규모 | 완료 기준 |
|---|---|---|---|
| 1 | **F-0**(활성 결정 1순위): `34bb180`(`ai-draft-modes.ts` + `draft-contract.test.mjs`, 613줄)을 이 브랜치에 cherry-pick/병합하고, 그 커밋에 없는 절반 — 두 크론이 `automation_runs`에 결과를 쓰는 것 — 을 추가 | S | 크론 1회 실행에 `work_orders` ≥1 생성, 실패가 자동화 화면(`automation_runs`)에 보임. `draft-contract.test.mjs` 통과 |
| 1 | **주간 집계 교정**: `doneTasks` → `completed_at`, `contacts` → `crm_activities` | XS | `weekly-report.test.mjs`가 옛 할 일 제목 수정과 `outreach_outcomes` 행을 무시함을 고정 |
| 1 | **Top 3**: `meta.focus_dates` 계약(`normalizePmsCommand` 형식 + `pms-command-service.ts` 3건 상한), 내 작업 토글, 첫 화면·내 작업 `focus` 레인, "오늘 이 3개만" 카드 소스 교체(+ 빈 상태의 dashed 권장 3개) | S | 3개 선택 → 새로고침 후 유지 → 완료 시 레인 이동. 4번째 선택 서버 거부. 순수 함수 테스트(`task-today.test.mjs`, `pms-command.test`) |
| 2 | **딜 이동 기록**(`persistRevenueRecord` → `recordActivity kind='deal'`, `recordActivity`에 `meta` 인자 추가), 주간 카드 필드 확장(`focusRate`·`memos`·`routineRate`·`reviewDays`·이동 딜), 하루 리뷰 팝업의 읽기 전용 2줄 + `progress` 기본값 제안 | S | 단계 변경 1회에 활동 행 1건(같은 값 재저장은 0건). 월요일 카드에 새 stat 표시, 실패 봉투(`partial`·`failedSources`) 유지 |
| 2 | **텔레그램 평문 캡처 + 답장**(chat_id 허용 목록, `update_id` idempotency, 웹훅 응답 `sendMessage`) | S | 평문 1건 → 인박스 `work_order` 1건 + 답장 1건. 재전송 시 중복 0. 미등록 chat_id는 무시 |
| 3 | 메모 통합(Q127 답변 방식으로), 패턴 채택 → 4목적지 저장(`buildActivityWrite`·`create_decision`의 `meta` 화이트리스트에 `source_journal_ids`), 태그 facet, `#주간회고` 메모 3줄 진입점, `dashboard/work/daily-review` 주간 탭 | M | 메모 페이지 검색에 `M` 메모가 보임. 채택 패턴 1건이 목적지에 `source_journal_ids`와 함께 남음 |
| 4 | 2주 실측 확인 → `weekly_targets` 입력 UI(설정 화면, `workspaces.meta`) → 카드 목표 대비, 정체 기준 단일 파일(`stalled.js`) | S | 목표 입력 → 카드 갭 표시. 4곳 import로 값 변경 없이 테스트 통과 |
| 30일 뒤 | 게이트 검토(B): `activity_logs` 소생 + `count_activity_v1` + §20 클라이언트 계측, `goals`/`action_kpis` 테이블, 발신 채널(Q130), 일지 AI 기간 회고, `deal_stage_history`, `review_data.focus_task_ids` 스냅샷, MCP `update_task` focus 검증·`create_memo` | — | 30일 실사용 수치(§7.5)를 보고 별도 승인 |

공통 규칙: CLAUDE.md의 Hub read 실패 봉투(HTTP 200 + `status:"error"`), write guard, 목업 금지, DESIGN.md 토큰·primitive 우선, 새 라우트는 미들웨어 기본 차단. 텔레그램 웹훅은 provider secret 검증을 유지한다.

---

## 9. 지금 만들지 않는 것

- 모든 메모의 LLM 자동 파싱·자동 CRM/캘린더 생성(전제 3).
- N일 무접촉 자동 알림 피드(전제 4) · 고객 메시지 자동 발송 · 미팅 요약 자동 발송 · 텔레그램 능동 발신(웹훅 응답 답장은 제외).
- Notion·n8n 확장·Make·Obsidian·Slack·Raycast 연동, 새 최상위 탭, 새 만능 테이블(심화 설계 §21), A 단계의 어떤 마이그레이션.
- 푸시 인프라(web-push/VAPID/service worker) · 음성 캡처(후속 확정).
- Deep Work 시간 추적 · "400%" 지수.
- `activity_logs` 소생, `goals`/`action_kpis`/`deal_stage_history` 테이블, MCP `create_memo`·MCP focus 검증(전부 B, 30일 게이트 뒤).
- 하루 리뷰에 회고 질문 추가(R0 "심플하게" 유지).

---

## 10. 2차 의견 (독립 콜드 리드)

이 대화를 보지 않은 별도 에이전트에게 §1·§2의 사실과 전제·접근안 초안만 주고 다섯 가지를 물었다(Codex CLI는 `gpt-6-astra` 모델 버전 잠금으로 실행 실패, Claude 서브에이전트로 대체). 원문 요지:

> **가장 멋진 버전.** "저녁이 아침을 채점하는" 단일 루프 — 아침에 `tasks` 중 오늘 3개를 고르고, 저녁 R0가 그 3개의 `completed_at`을 읽어 진척을 자동 채점하며, 주간 리포트가 "고른 수/끝낸 수" 비율 하나만 보여준다. 폰에서 한 줄 보내면 `tasks` inbox에 꽂히고 "저장됨" 답장이 온다. OKR 테이블 없이 선택→실행→채점이 매일 돌고 새 인프라는 0이다.
>
> **핵심 문장.** "할 일 빠른 입력 → 프로젝트화 또는 완료, 오늘 해야 할 목록이 잘 보이기." 4계층·OKR·400%는 다른 AI의 어휘이고, 운영자가 스스로 좁힌 문장은 세 가지뿐인데 이 항목만 측정이 아니라 "보이기"를 말한다 — 확정 성공 기준(인지 에너지 1/3, 누락 0)과 같은 축이다.
>
> **틀린 전제: 6번(그리고 "Telegram = 폰 유일 캡처 경로").** `COMMAND_HANDLERS`는 여섯 개뿐이고 슬래시 없는 텍스트는 `status:"ignored"`로 버려진다. 답장 경로도 없다. 유일한 폰 캡처 가능성은 `forwardToN8n`(`N8N_WEBHOOK_URL`)이다. 즉 전제 1 "n8n을 붙이지 않는다"는 이미 n8n이 경로에 있다는 점에서 어긋나고, 전제 2 "부족한 건 기능이 아니다"도 폰 캡처 한 곳에서는 틀렸다. 덤: 주간 리포트는 완료 할 일을 `updated_at`으로 센다 — 3주 전 끝낸 할 일의 제목만 고쳐도 이번 주 완료로 잡힌다.
>
> **도구.** Todoist·Things가 50%를 오늘 해결한다(기한순 오늘 목록, Top 3, 폰 캡처+확인, 푸시). 나머지 50%는 자체 앱만 가진 것 — `tasks↔leads↔journal_entries` 한 원장, `record_contact_outcome_v1`이 쓰는 `next_action_at`·`last_touch_at`, Q116/Q117 규칙, 주간 리포트. 도구를 더 붙이지 말고 Todoist가 잘하는 두 가지(캡처 확인 답장, 오늘 Top 3)만 Moonlight로 옮겨라.
>
> **주말 빌드.** `tasks.meta.focus_date`(하루 최대 3개) → `work-ledger.js` `focus` 버킷 → "오늘 이 3개만" 소스를 `brief-ledger.js`(죽은 크론의 `project_updates`)에서 focus 할 일로 교체, 비면 Q116 상위 3개를 dashed 권장으로. 크론은 손대지 않는다. `daily-review-ledger.js`가 focus 3개의 `completed_at`을 읽어 `progress`를 자동 제안. `weekly-report.js` `updated_at`→`completed_at` 교정 + `focusPicked/focusDone`. 텔레그램 `run.ts`에 평문 기본 핸들러 → `tasks` inbox + 응답 `{method:"sendMessage"}`. 건너뛴다: `goals` 테이블, 일지 AI 2계층, 텔레그램 카드, 딜 이력, `activity_logs`, 정체 통합, 접근안 C(30일 더 기다리면 데이터 기아만 연장).
>
> **Recommendation:** 접근안 A를 `tasks.meta.focus_date` 한 필드와 텔레그램 `task` 핸들러로 좁혀 이번 주말에 만들어라 — 첫 화면의 "오늘 이 3개만"은 죽은 초안 크론을 읽고 있고, 폰 캡처 경로는 코드에 존재하지 않으며, 주간 리포트는 `updated_at`으로 완료를 세고 있어서, 새 원장을 설계하기 전에 이미 있는 루프 세 곳이 실제로 닫혀야 실사용 데이터가 생긴다.

### 10.1 반영

| 지적 | 판단 | 반영 |
|---|---|---|
| 전제 2·6이 폰 캡처에서 틀렸다(코드에 경로 없음, 평문 `ignored`, 답장 불가) | **동의.** 초안은 "텔레그램 = 유일한 폰 캡처 경로"라는 낡은 문서 사실을 그대로 믿었다 | §0-1·§2.1·§3-6·§4 P2 정정. 텔레그램 평문 캡처+응답 답장을 §6.1·§8 주 2로 승격 |
| 전제 1이 n8n 전달 존재와 어긋난다 | **부분 동의.** 경로는 있지만 켜지 않는 것이 결정이다 | §4 P1을 "오케스트레이션 계층으로 넓히지 않는다"로 고쳐 씀 |
| 크론을 고치지 말고 카드 소스를 바꿔라 | **동의.** 더 작은 변경이고 크론의 다른 입력(정체 딜·케이던스)을 보존한다 | §6.2 표시·§8 주 1 |
| 접근안 C를 버려라 | **부분 동의.** 코드를 미루지 않는다. 다만 목표 숫자만 실측 뒤 정하는 규율은 유지 | §5 권장 문장 명시 |
| `activity_logs`·정체 통합·딜 이력을 건너뛰어라 | **대체로 동의.** `activity_logs`는 B로. 딜 이동은 `crm_activities` 한 줄이라 유지, 정체 통합은 부채라 주 4에 남김 | §6.4 재작성, §8 |
| `review_data.focus_task_ids` 스냅샷 | 마이그레이션이 필요해 A의 "0"과 충돌 | 읽기 시점 계산으로 대체, 스냅샷은 B |
| "`work-ledger.js`에 `focus` 버킷" | **파일 오기.** `work-ledger.js`는 루틴·Rhythm 원장이고 내 작업 버킷은 `attention-ledger.js`가 만든다 | §6.2에 바른 파일로 적음 |

---

## 11. 미정 — 운영자 결정 대기 (인터뷰 재개 시 Q127~ 후보)

프로필 §14에 이미 대기 중인 질문(주간 리포트 필수 내용·리포트 외부 채널·무기한 탭 승격 규칙, Q122~126 콘텐츠)은 그대로 앞서고, 아래는 그 뒤에 붙인다.

1. **Q127 메모 목적지.** 전역 `M` 퀵메모를 일지(`journal_entries`)로 통합할까(권장), 프로젝트 메모(`notes`)로 두고 검색만 합칠까?
2. **Q128 Top 3 선택 시점.** 아침 하루 리뷰 팝업에서 고를까, 전날 저녁 리뷰에서 "내일 3개"를 고를까, 내 작업 토글만 둘까?
3. **Q129 목표치.** 브레인스토밍 제안값(메모 30·연락 15·Top 3 85%)을 임시로 쓸까, 2주 실측 뒤 정할까(권장 후자)?
4. **Q130 알림 채널.** 첫 화면만 / 캘린더 종일 이벤트 / 텔레그램 능동 발신. (프로필 §4 "푸시 후순위"와 함께 읽음.)
5. **Q131 주간 회고 3줄의 자리.** 월요일 하루 리뷰 확장 vs `#주간회고` 태그 메모(권장 후자 — R0 심플 유지).

---

## 12. 이번 주 과제 (The Assignment)

**코드보다 먼저, 5일간의 손 기록.** 2026-09-21(월)~25(금).

1. **월요일 아침** 첫 화면에 뜨는 "나의 주간 리포트" 카드의 숫자 4개(완료 할 일·발행·연락·개인 딜)를 그대로 메모에 적고 `#주간회고` 태그를 단다. 3줄: 숫자 / 잘된 것 하나 / 병목 하나. 연락 수는 0으로 나올 것이다(§2.5 집계 오류) — 그 0을 그대로 적는 것이 기준선이다. 이것이 §7.4의 첫 실행이다.
2. **매일 아침** 내 작업에서 3개를 고른다. 플래그가 아직 없으니 하루 리뷰 팝업의 "오늘의 목표"에 `1) … 2) … 3) …`로 적는다. **매일 저녁** 같은 팝업에서 에너지와 진척을 남긴다. 금요일에 5일치가 있으면 Top 3 완료율의 첫 기준선이 손으로 나온다 — §7.1 "목표치는 실측 뒤"의 입력이다.
3. 09-03 과제(최근 90일 시트 리드의 도착→첫 접촉 중앙값·접촉 1회 이하 비율·결제율)의 결과가 아직 어느 문서에도 없다. 했다면 숫자 3개를 1번 메모에 같이 적는다. 안 했다면 이번 주에는 하지 않아도 된다 — F-3a의 비중 보정일 뿐 게이트가 아니다.

---

## 13. 내가 본 것

- "일단 세 가지 빠르게 필요할 것 같긴 해 … 세 번째가 뭐였지 기억이 안나." 기억에서 빠진 세 번째 축(CRM)은 Moonlight가 가장 깊게 만든 곳이고, 바로 떠오른 두 축(메모·오늘 목록)은 원장은 있는데 **닫힘이 없는** 곳이다. 아픈 데가 어딘지 이 한 문장이 말해 준다.
- "그 뭐 할 일 완료 이런 것들을 하루에 해야 될 목록들이 잘 보여야겠지." 첫 화면은 이미 오늘 레인을 보여준다. 그런데 운영자는 여전히 "잘 보여야겠지"라고 말한다 — 시스템이 고른 목록과 내가 고른 3개는 다르다. 그래서 첫 빌드가 Top 3 플래그다. 2차 의견도 이 문장을 골랐다.
- 브레인스토밍은 Notion·n8n·Telegram을 쇼핑하는데, 운영자는 그 스택을 이미 소유하고 있다. 만든 것이 아직 매일 "느껴지지" 않는다는 신호이고, 2026-07-29의 "아직 매일 안 씀"이 두 달째 가장 무거운 사실이다. 그래서 이 문서는 새 도구를 하나도 붙이지 않는다 — 폰 캡처 한 곳만 빼고, 그것도 이미 있는 봇의 평문 처리다.
- 다른 AI에게 "400%"라는 숫자를 요구했다. 정본 문서의 운영자 자신은 "인지 에너지 1/3, 누락 0"이라고 실패 비용으로 말했다. 이 문서는 후자를 잰다.
