# 확인할 것 — 끝내기 버튼과 막힘 풀기

> 상태: **방향 운영자 선택(2026-09-30) · 화면 방향 운영자 선택(2026-10-01) · §12 기본값 운영자 승인(2026-10-01) · 단계 0 구현(2026-10-01), 단계 1~4 진행 중**. 운영자가 시안 둘 가운데 "A의 끝내기 버튼 + B의 막힘 풀기"를 골랐고(2026-09-30), 화면 시안 넷 가운데 "2의 한 장씩 + 4의 시간 잡기"를 골랐다(2026-10-01). 이 문서의 이름·버튼 구성·보류·시간 잡기 규칙·데이터 모양은 그 방향을 구체화한 **권장안**이며, §12의 미정 질문과 함께 운영자 확인을 받은 뒤 확정으로 올린다.
> 작성일: 2026-09-30 (Asia/Seoul)
> 상위 정본: [`docs/README.md`](../../README.md) 우선순위 → [운영자 프로필](../../operator-workflow-profile.md) → [개인 운영 OS 심화 설계](2026-07-13-moonlight-personal-operator-os-deep-design.md) → 주제별 최신 스펙 → [`DESIGN.md`](../../../DESIGN.md).
> 관계:
> - [2026-09-21 첫 화면 디자인 디벨롭](2026-09-21-home-screen-design-development.md)(DRAFT)의 §5.2 표 "9 명령 카드 + 10 결정 큐 → **5 지금 결정할 것**" 행에서 **슬롯 이름과 버튼 동작**을 대체한다 — 이름은 `확인할 것`, 버튼은 이 문서 §4의 끝내기다. 두 슬롯을 하나로 합칠지, 첫 화면 폴드 예산은 여전히 그 문서의 소관이다.
> - [2026-09-09 프로젝트 시작·검증·종료](2026-09-09-project-delivery-lifecycle.md)의 `보류 기록`·`다시 진행` 규칙("다시 진행은 병목을 해결하거나 다음 버전으로 옮긴 뒤")은 **그대로 상속**한다. 이 문서는 그 위에 병목 분류·막힘 이력·"결정으로 풀기"를 더한다.
> - 2026-09-25 넛지 결정(DESIGN.md §15 — 넛지는 대상에 붙는 `SuggestionTip`)은 **유지**한다. 확인할 것은 홈의 처리 목록이고, 고객·거래의 보류는 넛지와 같은 저장(`meta.nudges.snoozedUntil`)을 쓴다(§4.3).
> - 화면 결정은 운영자 확인 뒤 DESIGN.md §15에 한 행으로 기록한다. 이 문서는 화면·데이터 계약이다.
> 근거: 2026-09-30 코드 조사(§1)와 운영자가 본 목업 캔버스 `결정·확인 흐름 시안`(Claude 아티팩트, 비공개) — 지금 로직·제안 로직·시안 A·B 각 2화면·결합안 8장·화면 시안 1~4(데스크톱·모바일 쌍)·최종 방향 6장. 목업은 저장소 밖에 있고 **예시 데이터만** 담는다([거래 A] 같은 자리표시자). 이름·건수·날짜를 코드나 테스트로 옮기지 않는다(CLAUDE.md 목업 금지, `scripts/no-mock-data.test.mjs`).

---

## 0. 한 장 요약

지금 홈과 오늘의 "결정"·"결정 큐"는 이름은 판단인데 실제로는 **알림 목록**이고, 버튼은 **다른 화면으로 가는 링크**다. 누르는 순간 "처리함"이 되지만 운영 기록에는 아무것도 남지 않는다. 운영자가 "진짜 업무와 어떻게 연관 지어야 하는지 모르겠다"고 한 이유가 이것이다.

이 문서는 네 가지를 바꾼다.

1. **이름** — `결정 큐`는 `확인할 것`이 된다. "결정"은 결정 일지(정말 판단한 것)에만 쓴다. 화면 문구에서 "큐"는 쓰지 않는다.
2. **끝내기** — 모든 항목에 끝내기 버튼 1~4가 붙는다: 연락 기록 · 할 일로 만들기 · 날짜 다시 · 보류 · 다시 볼 날(항목 종류에 따라 §4.2). 끝냄은 **저장 성공**이다. 화면만 여는 링크는 끝낸 것으로 세지 않는다. 끝낸 것은 서버 영수증으로 남아 모든 기기에서 같게 보인다.
3. **막힘 풀기** — 막힌 프로젝트에는 병목 분류(운영자 프로필 §11의 다섯 가지)가 붙고, 푸는 길이 세 갈래다: 이유가 풀렸어요 · **결정으로 풀기** · 다음 버전으로. 결정으로 풀면 결정 1건과 "그래서 할 일" 1건이 남고 프로젝트가 진행으로 돌아간다. 같은 막힘 풀기 화면을 확인할 것의 상세와 프로젝트 상세가 함께 쓴다.
4. **한 장씩 + 시간 잡기** — 확인할 것은 목록이 아니라 **카드 한 장씩** 보여 준다. 카드마다 끝내기 1~4가 있고, 지금 못 하면 `T 시간 잡기`로 오늘의 빈 시간(권장)에 잡는다. 잡아 둔 일은 그 시간이 되면 맨 앞으로 돌아온다. 오른쪽에는 오늘의 시간표가 붙어 일정·잡아 둔 일·권장 시간을 함께 보여 준다. 시간 잡기는 끝냄이 아니다 — 언제 할지를 정한 것이다(§4.7).

누락 0건(운영자 프로필 §2 확정)을 지키는 규칙 하나가 모든 것을 묶는다: **확인할 것에서 항목이 조용히 사라지는 길은 없다.** 대상 기록이 바뀌어 규칙이 더는 잡지 않거나, 연결한 할 일·보류가 살아 있는 동안만 숨는다. 보류는 그 날짜에 `보류했던 것`으로 다시 뜬다.

---

## 1. 지금 코드 (2026-09-30 조사)

| 문제 | 근거 |
|---|---|
| 신호는 `/api/hub/daily-brief`가 규칙으로 조립한다: 멈춘 거래 · 새 리드 · 콘텐츠 · 자동화 실패 · 막힌 프로젝트 · 위험 겹침 · "결정 기록 없음". 홈(`dashboard/home`)과 오늘(`dashboard/daily-brief`)이 같은 신호를 다른 모양으로 그린다 | `apps/hub/app/api/hub/daily-brief/route.js` `buildRevenueSignals`·`buildContentSignals`·`buildAutomationSignals`·`buildWorkSignals`, `components/hub/daily-brief-signals.js` |
| 오늘 화면의 섹션 이름이 `결정 큐`, 홈 상세의 버튼 줄 이름이 `결정` | `pages/daily-brief.jsx:2113`, `pages/home.jsx:104` |
| 버튼은 `SIGNAL_TARGETS`의 경로로 이동만 한다. 오늘 화면은 누르는 순간 "오늘 처리함"을 이 기기의 localStorage에 하루 동안 적고, 홈은 컴포넌트 상태에만 적어 새로고침하면 다시 뜬다 | `lib/signal-targets.js`, `pages/daily-brief.jsx:92`(`useBriefDecision`), `pages/home.jsx:184` |
| 버튼 이름과 도착 화면이 어긋난다: `리마인드 초안`은 거래 창만 연다(초안 없음). `오늘 보류`·`Rhythm 보기`는 리듬으로 가는데, 리듬은 2026-09-23부터 생활 루틴 화면이다 | `lib/signal-targets.js:9`(`wait`), `route.js` 멈춘 거래·위험 신호의 `action("오늘 보류", "wait")` |
| "오늘의 결정 기록이 비어 있습니다" 신호는 오늘이 아니라 **결정 기록이 0건**일 때 뜨고, 이유가 "브랜드 자산으로 남길 판단"이다 — 업무가 아니라 의례를 만든다 | `route.js:268`(`work-decision-missing`) |
| 결정이 세 곳에 따로 저장된다: Decisions(`decisions` 테이블) · 메모의 `decision` 종류(`journal`) · 회의 리뷰의 `decision` 제안(`meeting_review_proposals`, 수락해도 그 자리에 남음) | `pages/work.jsx` `Decisions`, `lib/journal.js`, `lib/meeting-review-service.js` |
| "큐"가 네 가지 뜻으로 쓰인다: 결정 큐(신호) · 승인 대기(AI 작업 지시) · 콘텐츠 Queue(소재·제작) · 에이전트 작업 큐 | `pages/daily-brief.jsx` `ApprovalQueueCard`, `hub-data.js`, `evolution-settings.jsx` |

이미 있어서 **새로 만들 필요가 없는 저장 경로**:

| 동작 | 경로 | 대상 |
|---|---|---|
| 연락 기록 | `ContactRecordDrawer`(`contact-record-form.jsx`) → `record_contact_outcome_v1` | `target.kind` = lead · deal · account |
| 날짜 다시 | `POST /api/hub/followups { action: "reschedule", kind, id, at }` | lead · deal · account |
| 보류(고객·거래) | `POST /api/hub/crm-nudges { action: "snooze", subjectType, subjectId, until }` → 대상 `meta.nudges.snoozedUntil` | lead · deal · account |
| 할 일 만들기 | `POST /api/hub/tasks` (`create_task` — `projectId`, `dealId`, `entityRef`) | 프로젝트 · 거래 · 리드/고객에 연결 |
| 결정 기록 | `POST/PATCH /api/hub/decisions` (`create_decision`·`update_decision`) | `projectId` 하나, `meta.source` |
| 막힘 걸기·풀기 | 프로젝트 `meta.delivery.blocker` + `deliveryEvent: "pause" | "resume"` — `resume`은 blocker가 비어 있어야 한다 | `apps/engine/lib/pms-command-service.ts` |

없는 것은 두 가지뿐이다: 고객·거래가 아닌 대상(프로젝트·자동화·콘텐츠·리드 묶음)의 **보류 저장**, 그리고 모든 끝내기의 **서버 영수증**. 병목 분류는 운영자 프로필 §11에 목록만 있고 데이터 필드가 없다.

---

## 2. 결정·권장 구분

| 항목 | 상태 |
|---|---|
| 방향: A의 끝내기 버튼 + B의 막힘 풀기 | **운영자 선택(2026-09-30)** |
| 화면: 시안 2 한 장씩 + 시안 4 시간 잡기 | **운영자 선택(2026-10-01)** |
| 시간 잡기의 권장 시간 계산·소요 시간 기본값·근무 시간 창 | 권장 — Q-CF9·Q-CF10 |
| 시간 잡기를 구글 캘린더에도 넣기(기본 켬) | 권장 — Q-CF8. 운영자 프로필 §2 "캘린더와 내부 기록을 자동 생성하는 것에 거부감이 없다"(확정)와 첫 화면 `15분 집중`이 이미 구글 일정을 만드는 선례에서 도출 |
| 끝냄 = 저장 성공, 화면만 열기는 끝냄 아님 | 권장 — 운영자 프로필 §2(누락 0건)·DESIGN.md §8.1(Save envelope)에서 도출 |
| `결정 큐` → `확인할 것`, "큐" 표기 제거 | 권장 |
| 항목 종류별 끝내기 구성(§4.2) | 권장 |
| 보류 기본 선택지와 최대 30일 | 권장 — Q-CF1 |
| 병목 분류 다섯 가지 | 운영자 프로필 §11의 목록을 그대로 쓴다. 필수 여부는 Q-CF5 |
| 결정 일지(Decisions 이름 변경·출처·그래서 할 일) | 권장 — 시안 A 쪽 화면, Q-CF3 |
| 콘텐츠·데이터 입력 항목은 제작·입력 화면으로 바로 이동 | **확정**(운영자 프로필 §4 "콘텐츠나 데이터 입력 업무는 해당 제작·입력 화면으로 바로 이어져야 한다") |
| 일반 업무는 체크리스트로 | **확정**(같은 절 "일반 업무는 체크리스트로 이어져야 한다") — `할 일로 만들기`가 이것이다 |

---

## 3. 용어

| 화면 말 | 뜻 | 쓰지 않는 말 |
|---|---|---|
| **확인할 것** | 규칙이 운영 기록에서 찾아낸, 지금 손대야 할 항목 목록 | 결정 큐, 신호 큐, 트리아지 |
| **끝내기** | 항목을 저장까지 마치는 동작. 1~4 번호가 붙는다 | 결정, 처리함 |
| **보류 · 다시 볼 날** | 다시 볼 날 전까지 목록에서 숨기기. 그날 `보류했던 것`으로 다시 뜬다 | 오늘 보류, ~까지 보류(끝나는 날이 모호하다), 무시, 숨기기 |
| **오늘 끝낸 것** | 오늘 저장된 끝내기의 영수증 목록 | 처리 완료 |
| **막힘 풀기** | 막힌 프로젝트를 진행으로 돌리는 세 갈래 | — |
| **병목** | 막힌 이유의 분류: 고객 응답 · 내부 작업 · 의사결정 · 자료 부족 · 외부 일정 | — |
| **결정 일지** | 정말 판단한 것의 기록. 출처와 "그래서 할 일"이 붙는다 | Decisions(탭 이름, Q-CF3) |
| **AI 제안 검토** | 지금의 "승인 대기"(work order proposals) | 승인 큐 |
| **한 장씩** | 확인할 것을 카드 한 장씩 보여 주는 화면 | 트리아지, 플래시카드 |
| **시간 잡기** | 지금 못 하는 항목을 오늘·내일의 시간에 붙이기. 끝냄이 아니다 | 일정 등록, 예약 |
| **잡아 둔 일** | 시간 잡기를 한 항목. 그 시간 전까지 카드에서 빠진다 | 예약됨 |
| **건너뛰기** | 끝내지 않고 다음 카드로. 항목은 남고 이번 차례 끝에 다시 나온다 | 넘기기, 무시 |

영문 kind 라벨(`Revenue`·`Work`·`Automation`)은 한국어 종류 라벨로 바꾼다: 거래 · 리드 · 프로젝트 · 자동화 · 콘텐츠 · 위험. 뒤에 상태를 붙인다(`거래 · 멈춤 16일`, `프로젝트 · 막힘 9일`).

---

## 4. 끝내기 계약

### 4.1 원칙

1. **끝냄은 저장 성공이다.** 서버가 `saved` 또는 `duplicate`로 답해야 항목이 목록에서 빠지고 영수증이 생긴다(DESIGN.md §8.1). `preview`는 저장되지 않았다는 뜻이므로 끝낸 것으로 세지 않는다. 실패하면 입력을 보존하고 항목을 그대로 둔다(§4.6).
2. **화면만 여는 링크는 보조다.** `거래 열기 ›` 같은 링크는 `그 밖에` 줄에 두고 끝낸 것으로 세지 않는다. 확정 규칙대로 콘텐츠·데이터 입력은 제작·입력 화면으로 바로 가지만, 이때도 항목은 **대상 기록이 바뀌어야** 빠진다(원고 상태가 바뀌거나 리드가 분류되면).
3. **입력이 필요한 끝내기는 그 자리에서 펼친다.** 보류 날짜, 결정 내용 같은 입력은 상세 카드 안에 펼쳐지는 칸으로 받는다. 연락 기록만 기존 공용 기록창(`ContactRecordDrawer`, compact)을 연다.
4. **번호는 항목마다 같은 자리다.** `1`은 그 항목의 가장 직접적인 끝내기, `4`는 언제나 `보류 · 다시 볼 날`. 키보드 `1`–`4` 끝내기, `T` 시간 잡기, `J`/`→` 건너뛰기(다음 카드), `K`/`←` 이전 카드(홈의 기존 `J`/`K` 계약을 한 장씩에 맞게 옮긴다 — 입력 요소·드로어 위에서 미발화, §8.1). 전역 `C`·`?`·`⌘K`·`⌘J`와 겹치지 않는다.

### 4.2 항목 종류별 끝내기

| 항목(지금 신호) | 1 | 2 | 3 | 4 | 목록에서 빠지는 조건 |
|---|---|---|---|---|---|
| 거래 · 멈춤(`revenue-stale-*`, 대상 deal) | 연락 기록 남기기 (기록창 `kind: deal`) | 할 일로 만들기 (`dealId`) | 날짜 다시 (`reschedule kind: deal`) | 보류 (`crm-nudges snooze deal`) | 활동이 생기거나 다음 연락일이 생겨 멈춤 판정이 풀림 · 연결한 할 일이 열려 있음 · 다시 볼 날 전 |
| 리드 · 분류 전(`revenue-new-leads`, 묶음) | 분류하러 가기 (리드 화면 — 데이터 입력, 확정 규칙) | 할 일로 만들기 | — | 보류 (묶음 단위, §4.3) | 묶음의 리드가 모두 New를 벗어남 · 다시 볼 날 전 |
| 자동화 · 실패(`automation-failed-*`) | 실행 기록에서 원인 보기 (이동) | 할 일로 만들기 | — | 보류 | 같은 자동화의 다음 성공 실행(현행 `getActionableAutomationFailures` 규칙) · 연결한 할 일이 열려 있음 · 다시 볼 날 전 |
| 프로젝트 · 막힘(`work-blocked-*`) | **결정 남기고 막힘 풀기** (병목이 의사결정일 때) / **이유가 풀렸어요** (그 밖) | 이유가 풀렸어요 / 결정 남기고 막힘 풀기 (1과 자리 바꿈) | 할 일로 만들기 (`projectId`) | 보류 | 프로젝트가 진행으로 돌아감(§5) · 연결한 할 일이 열려 있음 · 다시 볼 날 전 |
| 콘텐츠 · 주의/초안(`content-*`) | 이어쓰기 (Studio — 제작 화면, 확정 규칙) | 할 일로 만들기 | — | 보류 | 원고 상태가 바뀜 · 연결한 할 일이 열려 있음 · 다시 볼 날 전 |
| 위험 · 겹침(`risk-*`) | 구성 항목 보기 (이동) | — | — | 보류 | 구성 신호가 풀려 겹침이 사라짐 · 다시 볼 날 전 |

- 모든 항목에 `그 밖에` 줄: `대상 열기 ›` · `결정으로 남기기`(§6, 결정 일지로 가는 입력) · `조언 구하기`(기존 FloatingMentorWidget).
- **없앤다**: `work-decision-missing` 신호, `wait` 대상(`오늘 보류`→리듬, `Rhythm 보기`), `리마인드 초안` 라벨(초안 기능이 생기기 전까지 쓰지 않는다), 누르는 순간의 "오늘 처리함".
- 버튼 아래 한 줄 캡션으로 **남는 기록**을 말한다: `남는 기록 · 고객 활동 1건, 다음 연락일`.

### 4.3 보류

- 선택지: `내일` · `모레` · `다음 주 월요일` · `날짜 고르기`(최대 30일, Q-CF1) + 이유(선택, 200자).
- 저장 위치 — **억제의 정본은 대상 쪽**:
  - 고객·거래·리드(lead · deal · account): 기존 `POST /api/hub/crm-nudges` snooze → 대상 `meta.nudges.snoozedUntil`. 그래서 확인할 것에서 보류한 거래는 오늘 연락의 넛지에서도 같이 조용해지고, 반대도 같다.
  - 그 밖(프로젝트·자동화·콘텐츠·리드 묶음·위험): 새 `signal_outcomes` 행의 `snoozed_until`(§8).
  - 두 경우 모두 영수증 한 줄은 `signal_outcomes`에 남긴다(오늘 끝낸 것).
- 보류 날짜가 되면 항목은 **`보류했던 것`** 표시(점선 테두리 + 일시정지 글리프 + 직접 라벨, §5.3 unknown 문법 — 색 없음)와 `9월 27일에 오늘까지 보류` 한 줄을 달고 다시 뜬다.
- 영구 숨기기는 없다. 한 항목을 보류로 반복해서 미룬 횟수는 영수증에서 셀 수 있지만 경고로 칠하지 않는다(§5.2 no warning-by-default).

### 4.4 목록에서 빠지는 조건 (억제 규칙)

daily-brief 라우트가 신호를 만든 뒤, 아래 중 하나면 그 신호를 확인할 것에 올리지 않는다.

1. 대상 쪽 보류: `meta.nudges.snoozedUntil > 오늘`(lead·deal·account) — 기존 넛지 판정(`lib/sales-os/crm-nudges.js`의 `snoozedUntil > todayKey`)과 같은 경계다. 저장값은 **다시 볼 날**이고, 그날 아침부터 다시 뜬다.
2. `signal_outcomes`의 보류: 같은 `signal_key`에 `snoozed_until > 오늘`이고 되돌려지지 않은 행(같은 경계).
3. 연결한 할 일: 같은 `signal_key`로 만든 할 일(`signal_outcomes.record_ref`)이 아직 완료·취소되지 않음. 할 일이 끝났는데 조건이 남아 있으면 다시 뜬다.
4. 잡아 둔 일: 같은 `signal_key`에 되돌려지지 않은 `scheduled` 행이 있고 `scheduled_start > 지금`. 시작 시각이 되면 카드 맨 앞으로 돌아오고(`지금 할 시간`), 끝 시각이 지나도록 끝내지 않았으면 `잡아 둔 시간이 지났습니다` 표시와 함께 남는다(§4.7).
5. 그 밖(연락 기록·날짜 다시·막힘 풀기·원고 진행)은 **억제하지 않는다** — 대상 기록이 바뀌어 규칙이 신호를 만들지 않는 것이 곧 사라짐이다. 저장은 됐는데 규칙이 여전히 잡으면(예: 연락 기록을 남겼지만 다음 연락일을 비워 둠) 항목은 남고, 상세에 `기록은 남았지만 다음 연락일이 없어 다시 떴습니다` 한 줄을 보인다.

`signal_key`는 지금 신호 `id`의 안정된 형태를 쓴다: `revenue-stale:<dealId>`, `automation-failed:<automationId>`, `work-blocked:<projectId>`, `content:<itemId>`, `revenue-new-leads:<정렬된 leadId 목록의 해시>`, `risk:<구성 키>`.

### 4.5 오늘 끝낸 것 (영수증)

- 출처: `signal_outcomes` 중 오늘(Asia/Seoul) 행 — 모든 기기에서 같다. localStorage `오늘 처리함`은 제거하고, 남은 옛 키는 읽지 않는다.
- 한 줄: 체크 글리프 + 항목 제목(취소선, 낮은 명도) + 남긴 기록(`할 일 ‘초안 마무리’를 만들었습니다`) + 시각. 초록 없음(§5.3 done).
- 진행 줄: 오늘 본 항목 수만큼의 칸. 끝냄(채움) · 잡아 둔 일(속 빈 칸, `--fg` 1px 테두리) · 보류(속 빈 칸, `--line-strong` 테두리) · 지금 카드(`--accent`, 현재 위치) · 남음(빈 칸). 숫자는 `끝냄 N · 잡음 N · 남음 N` 글로 함께 말한다(색만으로 말하지 않는다 §5.3). 다 끝내도 축하 연출은 두지 않는다(Q134 미결 — 기존 `fx-progress--completed` 부채를 늘리지 않는다).
- 남은 카드가 0이 되면 `오늘 확인할 것을 다 봤습니다` 정리 카드: 끝낸 것 · 잡아 둔 것(시각) · 보류한 것(다시 볼 날). "남은 것 없음"은 잡아 둔 일과 보류가 그 시간에 돌아온다는 문장과 함께만 말한다.
- 되돌리기는 **저장 경로가 이미 주는 것만**: 연락 기록(기존 undo 창), 보류(영수증 행 `undone_at` + 대상 `resume`). 만든 할 일·결정은 되돌리기 대신 그 기록을 열어 고친다(결정은 append-only — 기존 Decisions 계약).

### 4.6 저장 실패와 정직성

| 상황 | 표시 |
|---|---|
| `failed`·`error` | 상세 카드 안 compact 오류 배너(danger 글리프 + 원인 + `다시 시도`), 입력 보존, 항목 유지 |
| `conflict` | "다른 곳에서 먼저 바뀌었습니다" + `대상 열어 비교` |
| `preview` | `Preview · 연결 필요` 점선 배지, 끝내기 버튼 비활성, "눌러도 끝낸 것으로 세지 않습니다" |
| 읽기 실패 | 기존 봉투 계약 그대로(HTTP 200 + `status: "error"`) — 빈 목록 "확인할 것 없음"으로 위장하지 않는다 |
| 여러 쓰기 중 일부만 성공(§5.3) | 성공한 것 체크, 실패한 것 danger 글리프 + 이유, 남은 쓰기만 다시 시도하는 버튼 |
| 시간 잡기에서 구글 일정 쓰기 실패 | 잡지 않은 상태로 두고 원인 + `다시 시도` · `Moonlight에만 잡기` 선택지 — 조용히 Moonlight에만 잡지 않는다 |

### 4.7 시간 잡기

지금 끝낼 수 없는 카드를 **언제 할지** 정한다. 끝냄이 아니므로 `오늘 끝낸 것`에 들어가지 않고, 진행 줄에서는 `잡음`으로 따로 센다.

**권장 시간 계산** (`lib/check-items/slots.js`, 순수 함수 — 테스트 대상)

- 입력: 캘린더 일정(종일 일정 제외), 이미 잡아 둔 일, 지금 시각, 근무 시간 창(권장 09:00–19:00, Q-CF9), 소요 시간. 오늘 일정은 홈의 `useTodaySchedule`이 이미 `GET /api/calendar/google/event?timeMin&timeMax`로 읽는다 — 그 범위를 내일 끝까지 넓혀 한 번에 읽는다(요청 수를 늘리지 않는다).
- 규칙: 지금 시각을 5분 단위로 올리고 5분 여유를 둔 뒤, 일정과 잡아 둔 일 사이에서 소요 시간이 들어가는 **가장 이른 빈 시간**을 권장한다. 선택지는 최대 셋 — `권장(첫 빈 시간)` · `그다음 빈 시간` · `내일 첫 빈 시간` — 과 `직접 고르기`.
- 오늘 들어갈 자리가 없으면 권장은 내일 첫 빈 시간이고, 카드에 `오늘은 빈 시간이 없습니다` 한 줄을 보인다.
- 캘린더를 읽지 못하면 권장 시간을 계산하지 않는다(`TruthBadge`로 원인 표시). 빈 시간을 지어내지 않는다 — `직접 고르기`만 남긴다.
- 권장은 `CertaintyBadge recommended`(점선 + ◇ + `권장 시간`)로 보인다. 운영자가 `잡기`를 누르기 전에는 아무것도 저장하지 않는다.

**소요 시간 기본값** (권장 — Q-CF10. 고른 값은 종류별로 이 기기에 기억 `mlp.checkScheduleMinutes`)

| 항목 | 기본 |
|---|---|
| 거래·리드 연락 기록 / 날짜 다시 | 20분 |
| 막힌 프로젝트 — 병목이 의사결정(정하기) | 30분 |
| 막힌 프로젝트 — 그 밖 병목(이유 확인) | 15분 |
| 자동화 실패 원인 보기 | 15분 |
| 새 리드 묶음 분류 | 20분 |
| 콘텐츠 이어쓰기 | 45분 |
| 위험 겹침 | 15분 |

선택지는 `15분 · 30분 · 45분 · 1시간`.

**저장**

1. `구글 캘린더에도 넣기`(기본 켬, 캘린더가 쓰기 가능할 때만 보임 — Q-CF8): 기존 `POST /api/calendar/google/event { title, startAt, endAt }`. 제목은 `확인할 것 · <대상> <동사>`(예: `확인할 것 · [프로젝트 C] 정하기`). 응답 `saved`일 때만 다음 단계로 간다. iCal 읽기 전용·미연결이면 체크 칸 자리에 `Moonlight에만 잡힙니다` 한 줄.
2. `signal_outcomes`에 `outcome: "scheduled"`, `scheduled_start`, `scheduled_end`, `calendar_event_id`(있으면) 한 줄.
3. 카드는 다음으로 넘어가고, 토스트 `13:30에 다시 보여 드립니다`(되돌리기 포함).

**바꾸기·취소**

- 잡아 둔 일을 시간표 레일에서 누르면 `다른 시간`·`취소`. 다른 시간은 같은 행을 고치고 구글 일정은 `eventId`로 갱신한다(기존 경로가 갱신을 지원).
- 취소는 행의 `undone_at` + 구글 일정 삭제. 지금 경로에는 **삭제가 없다** — `DELETE /api/calendar/google/event { eventId }`를 더한다(§8.2). 삭제가 실패하면 "Moonlight에서는 취소했고 구글 일정은 남아 있습니다"라고 말한다.

**시간이 되면**

- `scheduled_start`가 되면 그 카드가 차례와 상관없이 맨 앞에 오고, 카드 위에 `잡아 둔 시간입니다 · 13:30–14:00 · 남은 28분` 띠가 붙는다(중립, 시계 글리프). 깜빡임·알림음·빨강 없음(§5.3 urgent never blinks).
- 끝 시각이 지나도 끝내지 않았으면 띠가 `잡아 둔 시간이 지났습니다`로 바뀌고 `다시 잡기`가 1순위가 된다. 자동으로 다음 시간으로 옮기지 않는다(Q-CF11).
- 휴대폰 푸시는 후순위(운영자 프로필 §4 확정) — 구글 캘린더 알림이 그 역할을 한다.

---

## 5. 막힘 풀기 계약

### 5.1 데이터 (`projects.meta.delivery`, 2026-09-09 계약 확장)

| 필드 | 뜻 | 누가 쓰나 |
|---|---|---|
| `blocker` | 막힌 점(글) — 기존 | 운영자 |
| `blockerKind` | `customer` · `internal` · `decision` · `material` · `external` (고객 응답 · 내부 작업 · 의사결정 · 자료 부족 · 외부 일정) | 운영자, 선택(Q-CF5) |
| `blockerHistory[]` | `{ at, resolvedAt, text, kind, resolution: "resolved" | "decision" | "next-version", decisionId? }` | **서버 관리** — `resume` 때 직전 blocker를 한 줄로 옮긴다. 클라이언트가 덮어쓸 수 없다(`history`·`pausedAt`과 같은 규칙) |

Engine `validateDelivery`/`deliveryDraft`에 `blockerKind` 열거 검증을 더하고, `resume` 처리에서 `blockerHistory`를 쌓는다. 입력 `unblockResolution`(`resolved`·`decision`·`next-version`)과 `decisionId`는 이 이력 한 줄에만 쓰인다.

### 5.2 세 갈래

| 갈래 | 운영자가 하는 일 | 저장 |
|---|---|---|
| 이유가 풀렸어요 | 한 번 누른다(한 줄 메모 선택) | `blocker` 비움 + `resume` + 이력 `resolved` |
| **결정으로 풀기** | 무엇을 정했나 · 왜 · 그래서 할 일(+기한) · `막힌 점 비우고 진행으로`(기본 체크) | 결정 1건 → 할 일 1건 → `blocker` 비움 + `resume` + 이력 `decision`(§5.3) |
| 다음 버전으로 | 이번 범위에서 뺄 것을 적는다 | `nextVersion`에 덧붙임 + `blocker` 비움 + `resume` + 이력 `next-version` |

병목이 `의사결정`이면 결정으로 풀기를 1번에 두고 `◇ 병목에 맞춘 권장` 표시(§5.3 recommended 문법)를 단다. 다른 병목이면 이유가 풀렸어요가 1번이다. 권장은 순서와 표시일 뿐, 어느 갈래든 운영자가 고른다.

막힘을 걸 때(`pause`)는 지금처럼 막힌 점 글이 필수이고, 병목 칩 다섯 개를 함께 보인다.

### 5.3 결정으로 풀기 — 쓰기 순서

세 기록은 서로 다른 테이블이라 한 트랜잭션이 아니다. 순서와 멱등성으로 정직하게 만든다.

1. 클라이언트가 `decisionId`·`taskId`를 미리 만든다(UUID). 같은 요청 재시도는 Engine의 멱등 경로(`sameCanonicalCreatePayload`)가 `duplicate`로 답해야 한다 — **할 일은 지금 그렇지만 결정은 아니다**: `canonicalCreatePayload`(`apps/engine/lib/pms-command-service.ts`)에 `create_decision` 분기가 없어 같은 id 재시도가 `conflict`(`id-reuse-payload-mismatch`)로 떨어진다. §8.4에서 분기를 더한다.
2. `create_decision` — `projectId`, `meta.source: "project-unblock"`, `meta.sourceRef: { type: "project", id }`. 실패하면 멈춘다(아무것도 안 남음).
3. `create_task`(그래서 할 일이 있을 때) — `projectId`, `meta.decision_id`. 실패하면 멈추고 "결정은 남았습니다 · 할 일을 만들지 못했습니다"를 보인다.
4. 프로젝트 `update` — `blocker: ""`, `deliveryEvent: "resume"`, `unblockResolution: "decision"`, `decisionId`, 버전 가드(`updated_at`). `conflict`면 "결정은 남았습니다 · 막힘은 아직 풀리지 않았습니다 — 프로젝트가 다른 곳에서 먼저 바뀌었습니다" + `막힘만 다시 풀기`.
5. 결정 행에 `meta.nextTaskId`, `meta.unblockedProjectId`를 `update_decision`으로 붙인다(표시용 링크, 실패해도 막힘 풀기는 성공으로 본다 — 결정 일지가 할 일 쪽 `meta.decision_id`로도 찾을 수 있다).
6. 영수증: `signal_outcomes`에 `outcome: "unblocked"`, `record_ref: { table: "decisions", id }` (확인할 것에서 풀었을 때만).

한 번에 묶는 RPC(`unblock_with_decision_v1`)는 이 순서가 실사용에서 부분 실패를 자주 내면 그때 만든다 — 지금 만들지 않는다.

### 5.4 어디서

- **프로젝트 상세**(`project-detail-panel.jsx` · `project-delivery.jsx`)의 막힌 점 자리에 `막힘 풀기` 섹션: 막힌 점 글 · 병목 칩 · `어떻게 풀까요` 세 갈래 세그먼트(`SegmentedControl`) · 입력 · 막힘 이력 · 이 프로젝트의 결정.
- **확인할 것 카드**(한 장씩)가 막힌 프로젝트면 끝내기 1·2가 막힘 풀기 갈래이고, 누르면 같은 컴포넌트(`UnblockPanel`)를 그 줄 아래에 펼친다. 결과는 두 곳이 같다.
- 목록 행에는 `막힘 · 의사결정 · 9일`처럼 병목 라벨을 글로 붙인다(색 없음, blocked 글리프만 danger — §5.3 lifecycle).

---

## 6. 결정 일지 (최소 변경, 권장)

막힘 풀기로 생긴 결정이 보여야 할 자리가 필요하다. 새 화면을 만들지 않고 지금 Decisions를 고친다.

- 이름 `Decisions` → `결정 일지`(Q-CF3). 영문 버튼 `Record decision` → `결정 남기기 N`.
- 행마다: 날짜 · 확실성(`확정`/`미정` — 기존 `decidedAt` 규칙 그대로) · **출처 칩**(막힘 풀기 · 회의 · 메모 · 확인할 것 · 직접) · 연결 프로젝트 · 근거 한 줄 · **그래서 할 일** 줄(할 일의 lifecycle 글리프 + 제목 + 기한, 없으면 한 줄 입력으로 바로 만들기) · 막힘을 풀었으면 `막힘 풀림 · 9일` 칩.
- 출처 필터 세그먼트: 전체 · 막힘 풀기 · 회의 · 메모 · 확인할 것 · 직접.
- `결정으로 남기기`(확인할 것의 `그 밖에`)는 대상 이름을 채운 결정 입력을 연다. 대상이 거래면 `meta.sourceRef: { type: "deal", id }`.
- 회의 리뷰에서 수락한 결정·메모의 결정 종류를 이 일지로 모으는 것은 Q-CF4 — 모으더라도 원문 행은 그 자리에 두고 결정 행이 `sourceRef`로 가리킨다(복제 대신 참조).
- Decisions 페이지의 Futura 텍스처·`PAGE_OWNS_TABS`는 그대로다.

---

## 7. 화면 — 한 장씩 + 시간 잡기 (운영자 선택 2026-10-01)

목업 캔버스의 `최종 방향` 줄이 이 문서의 화면이다. `결합안` 줄(목록 + 상세 분할)은 끝내기·막힘 풀기·결정 일지·저장 상태의 **세부 동작** 참고로 남고, 배치는 이 절이 대체한다.

| 목업 | 이 문서 |
|---|---|
| 최종 · 기본 카드 — 거래 | §7.1 · §4.2 거래 행 · §4.7 권장 시간 띠 |
| 최종 · 시간 고르기 — 막힌 프로젝트 | §4.7 저장 · §7.1 |
| 최종 · 잡아 둔 시간이 됨 — 막힘 풀기 | §4.7 시간이 되면 · §5.3 |
| 최종 · 다 봤음 | §4.5 정리 카드 |
| 최종 · 모바일 390 — 한 장씩 / 시간 잡기 | §7.2 |
| 결합 로직 · 결합안 홈 2장 · 프로젝트 막힘 풀기 · 결정 일지 · 저장 상태 | §4.2~§4.6 · §5 · §6 세부 동작 |

### 7.1 데스크톱 — 홈(`dashboard/home`, Futura 확정)

두 칸이다: 가운데 **카드 열**(최대 720px) + 오른쪽 **시간표 레일**(340px).

- **진행 줄**(카드 열 맨 위): `확인할 것 · 한 장씩 · 날짜` eyebrow, `끝냄 · 잡음 · 남음` 숫자, 칸 막대(§4.5).
- **카드**(`fx-card`, 패딩 32): 종류·상태 라벨(긴급이면 danger 글리프 + 라벨만 danger) · 제목(`--fx-title` 27px/300 — `.fx-card-title`과 같은 토큰. 목업의 32px는 시각 검토용이며 새 크기를 만들지 않는다. `fx-hero` 44px는 쓰지 않는다) · 근거 한 줄 · (막힌 프로젝트면 병목 칩) · `어떻게 끝낼까요` — 끝내기 1~4를 **세로 전폭 줄**(54px, 번호 `Kbd` + 라벨 + `남는 기록` 캡션)로. 입력이 필요한 끝내기는 그 줄 바로 아래에 펼친다(막힘 풀기 입력·보류 날짜).
- **시간 잡기 띠**(끝내기 아래, 점선 1px): `T 지금 못 하면 시간 잡기` · `◇ 권장 시간 10:30–10:50 · 20분` · `잡기` · `다른 시간`. `다른 시간`이나 `T`는 띠를 고르기 칸으로 펼친다: 선택지 셋 + 직접 고르기, 소요 시간 칩, `구글 캘린더에도 넣기`, `13:30에 잡기`. 고르기 칸이 열리면 그 칸의 확정 버튼이 화면의 유일한 primary가 되고 끝내기 1번은 보조로 내려간다(§5.2 한 뷰에 primary 하나).
- `그 밖에` 줄: `대상 열기 ›` · `결정으로 남기기` · `조언 구하기`.
- **카드 바닥**: `→ 건너뛰기 — 끝내지 않고 다음으로` + `다음 · <다음 카드 제목>` 미리보기.
- **시간표 레일**: 09–19시 세로 시간표. 일정(`--surface-2` 면), 잡아 둔 일(흰 면 + `--line-strong` 1px + 시계 글리프), 지금 카드의 권장 시간(점선 + ◇, 지금 위치라 `--accent` 1px 외곽선), 지금 시각 선(`--accent`). 끝낸 잡아 둔 일은 체크 글리프 + 낮은 명도. 레일 아래 `오늘 끝낸 것` 영수증. 레일 블록을 누르면 `다른 시간`·`취소`(§4.7).
- **카드 차례**: 잡아 둔 시간이 된 카드 → 보류에서 돌아온 카드(`보류했던 것`) → 긴급(danger) → 나머지(daily-brief 기존 `rankSignals` 순서). 건너뛴 카드는 이번 차례 끝으로.
- **오늘**(`dashboard/daily-brief`): `결정 큐` 섹션 자리에 지금 카드 한 장 요약(종류·제목·끝내기 1번)과 `홈에서 이어 보기 ›`만 둔다 — 같은 컴포넌트를 두 번 펼치지 않는다(Q-CF2).
- 상태 표시는 전부 기존 프리미티브: `CertaintyBadge`(권장 시간·병목 권장), `LifecycleBadge`(막힘·진행·완료), `TruthBadge`(preview·error·캘린더 미연결), 로딩은 `Skeleton`.

### 7.2 모바일 390

- 한 장씩이 그대로 모바일 화면이다: 진행 줄 · 카드(제목은 ≤900px의 `--fx-title` 축소값 21px) · 끝내기 네 줄(56px 이상, 번호 없음) · `시간 잡기` 줄(점선, 권장 시각 표시) · 바닥 고정 `건너뛰기`·`다음`.
- 시간표 레일은 숨기고, `시간 잡기`를 누르면 **하단 시트**(`Drawer presentation="compact"` — ≤600px에서 이미 바닥 시트): 선택지 넷(52px 줄) · 소요 시간 칩 · `구글 캘린더에도 넣기` · `13:30에 잡기`(52px).
- 입력은 16px 이상, 터치 44px(DESIGN.md §7 Responsive 공통 규칙이 이미 보장).

---

## 8. 데이터·API

### 8.1 새 테이블 — `supabase/migrations/20260930_0056_signal_outcomes.sql`

```text
signal_outcomes
  id              uuid primary key
  workspace_id    uuid not null
  signal_key      text not null          -- §4.4
  subject_type    text not null          -- deal · lead · account · project · automation · content · lead-group · risk
  subject_id      text                   -- uuid 또는 묶음 키
  outcome         text not null          -- contact_logged · task_created · rescheduled · snoozed · unblocked · decision_logged · scheduled
  record_ref      jsonb                  -- { table, id } 남긴 기록
  snoozed_until   date                   -- outcome = snoozed일 때만
  scheduled_start timestamptz            -- outcome = scheduled일 때만 (§4.7)
  scheduled_end   timestamptz
  calendar_event_id text                 -- 구글 일정에도 넣었을 때
  note            text                   -- 보류 이유 등, 200자
  request_id      uuid not null unique   -- 멱등 키
  created_at      timestamptz not null default now()
  undone_at       timestamptz
index (workspace_id, signal_key, created_at desc)
```

- 선례: `discovery_nudge_states`·`discovery_nudge_receipts`(0031)의 상태+영수증 분리. 이 테이블은 영수증이 주이고 보류는 비CRM 대상만 쓴다.
- 0044 이후 규칙대로 `begin;`/`commit;` 없음. `scripts/database-readiness.mjs`의 `DATABASE_FEATURES`에 `{ name: '확인할 것 영수증', migration: '20260930_0056_signal_outcomes.sql', tables: ['signal_outcomes'], functions: [] }` 등록.

### 8.2 Hub 라우트

- `GET /api/hub/signal-outcomes?day=YYYY-MM-DD` — 오늘 영수증. 읽기 실패는 HTTP 200 + `status: "error"`.
- `POST /api/hub/signal-outcomes` — `{ requestId, signalKey, subject, outcome, recordRef?, snoozedUntil?, note? }`, `hub-write-guard` 통과, `{ ok, status }` 봉투(`saved`·`duplicate`·`failed`·`preview`).
- `PATCH /api/hub/signal-outcomes` — `{ id, action: "undo" }`(보류·잡아 둔 일) · `{ id, action: "move", scheduledStart, scheduledEnd }`(잡아 둔 일의 다른 시간).
- `DELETE /api/calendar/google/event` — `{ eventId }`. **새로 더한다**(지금은 GET·POST만 있다). 쓰기 가드·`recordGoogleCalendarSync` 실패 기록은 POST와 같다. 잡아 둔 일 취소에만 쓴다.
- 새 경로는 미들웨어 기본(막힘) 그대로 — 세션이 있는 브라우저만 통과한다. `OPEN_PREFIXES`에 올리지 않는다.

### 8.3 `/api/hub/daily-brief` 변경

- 모든 신호에 `signalKey`와 `subject: { type, id }`를 싣는다(지금은 멈춘 거래만 `subject`가 있다).
- `decisions: [action(...)]` 배열을 `outcomes: [{ key, label, record, kind: "write" | "navigate", primary }]`로 바꾼다 — 클라이언트가 `kind`로 끝냄과 이동을 구분한다. `SIGNAL_TARGETS`는 `navigate` 대상 표로 줄인다(`wait`·`hold`·`decision`·`dismiss` 삭제).
- §4.4 억제를 적용하고, 억제된 수와 보류 복귀 항목(`returnedFromSnooze: { at }`)을 응답에 싣는다.
- `buildWorkSignals`의 `work-decision-missing` 삭제. 막힌 프로젝트 신호에 `blocker`·`blockerKind`·`pausedAt`을 싣는다.
- 영수증을 같은 응답에 `finishedToday`로 싣는다(첫 화면 요청 수를 늘리지 않는다). 읽기 실패는 `finishedTodayState: "error"`.
- 잡아 둔 일을 `scheduled: [{ signalKey, start, end, calendarEventId, state: "waiting" | "now" | "passed" }]`로 싣는다 — 시간표 레일과 카드 차례가 같은 값을 쓴다.

### 8.4 Engine

- `pms-command-service.ts`: `blockerKind` 검증, `resume` 때 `blockerHistory` 추가, 입력 `unblockResolution`·`decisionId` 수용.
- `pms-command-service.ts` `canonicalCreatePayload`: `create_decision` 분기 추가(id·workspace_id·project_id·title·rationale·decided_at·meta.source·meta.sourceRef) — 같은 요청 재시도를 `duplicate`로 받기 위해서다. 지금 Decisions 화면도 `duplicate`를 성공으로 읽지만 실제로는 받을 수 없는 상태다.
- `pms-command.ts` `create_decision`: `meta.sourceRef`(type 열거 + id) 수용. `update_decision`: `meta` 병합(`nextTaskId`, `unblockedProjectId`) — 프로젝트 meta 병합과 같은 읽기 후 병합 규칙.
- `create_task`: `meta.decision_id`, `meta.signal_key` 수용(§4.4 규칙 3의 조인 키).

### 8.5 공용 컴포넌트

- `components/hub/check-items/focus-card.jsx` — 한 장씩 카드(`FocusCard`)와 차례·키보드(`useCheckItemDeck`).
- `components/hub/check-items/outcomes.jsx` — `OutcomeRows`(세로 전폭 끝내기), `SnoozePicker`, `FinishedTodayList`, `useSignalOutcome`(쓰기 순서·봉투·토스트).
- `components/hub/check-items/schedule.jsx` — `ScheduleBand`(권장 시간 띠·고르기 칸), `TimeRail`(시간표 레일), 모바일은 `Drawer presentation="compact"`로 같은 고르기 칸을 연다.
- `lib/check-items/slots.js` — 권장 시간 계산 순수 함수(§4.7).
- `components/hub/unblock-panel.jsx` — 병목 칩 + 세 갈래 + 결정 입력, 확인할 것 상세와 프로젝트 상세가 함께 쓴다.
- 데스크톱 위젯(`quick-widget.jsx`)은 같은 신호를 읽지만 이번 범위에서는 건수·열기만 유지한다.

---

## 9. 테스트 (가드)

| 규칙 | 테스트 |
|---|---|
| 끝냄은 `saved`/`duplicate`에서만 — `preview`·실패는 항목 유지·영수증 없음 | `signal-outcomes.test.mjs`(컴포넌트 계약) |
| 억제 규칙 1~4, 보류 복귀 표시, 할 일 완료 뒤 재등장 | `apps/hub/app/api/hub/daily-brief/*.test.mjs` |
| `wait`·`work-decision-missing`·`결정 큐` 문구 재등장 금지 | 같은 파일 + `pages/*` 문자열 스윕 |
| `blockerKind` 열거, `blockerHistory` 서버 관리(클라이언트 값 무시), `resume` 전 blocker 비움 | `apps/engine/lib/pms-command-service.test.mjs` 확장 |
| 결정으로 풀기 부분 실패 문구·재시도 대상 | `unblock-panel.test.mjs` |
| `create_decision` 같은 id·같은 내용 재시도 → `duplicate`, 다른 내용 → `conflict` | `apps/engine/lib/pms-command-service.test.mjs` 확장 |
| 보류 경계 — 다시 볼 날 당일에 다시 뜸(넛지와 같은 `>` 경계) | daily-brief 억제 테스트 |
| 권장 시간: 지금 이후·근무 시간 창 안·일정과 잡아 둔 일을 피함·종일 일정 무시·오늘 자리 없으면 내일·캘린더 읽기 실패면 계산 안 함 | `lib/check-items/slots.test.mjs` |
| 시간 잡기는 끝냄으로 세지 않음, 시작 시각 전 숨김·시작 시 맨 앞·끝난 뒤 `지났습니다` | daily-brief 억제 테스트 + `focus-card.test.mjs` |
| 구글 쓰기 실패 시 조용히 Moonlight에만 잡지 않음 | `schedule.test.mjs` |
| 한 장씩 키보드(`1`–`4`·`T`·`J`/`→`·`K`/`←`)가 입력 요소·드로어 위에서 미발화 | `focus-card.test.mjs` |
| 새 테이블 readiness 등록 | `scripts/database-readiness` 기존 테스트 |
| 목업 데이터 금지 | 기존 `scripts/no-mock-data.test.mjs` |

---

## 10. 단계

| 단계 | 묶음 | 규모 | 완료 기준 |
|---|---|---|---|
| 0 | **끊긴 연결 정리** — `wait`·`Rhythm 보기`·`리마인드 초안`·`work-decision-missing` 제거, `결정 큐`→`확인할 것`, 홈 `결정`→`어떻게 끝낼까요`, 누르는 순간의 "처리함" 제거 | S | 리듬으로 가는 버튼 0개, 이동 버튼을 눌러도 목록이 줄지 않음, `npm test` 통과 |
| 1 | **끝내기 + 한 장씩** — `signal_outcomes`(0056)·라우트·억제·영수증·보류, 거래·자동화·콘텐츠·리드 묶음의 끝내기, 홈을 한 장씩 카드로(§7.1, 시간표 레일은 기존 `useTodaySchedule`로 읽기만) | M | 거래 멈춤 항목을 네 끝내기로 각각 끝내 보고 새로고침·다른 기기에서도 같은 차례, 보류 항목이 날짜에 다시 뜸, 키보드 계약 테스트 통과 |
| 2 | **시간 잡기** — `slots.js`·`ScheduleBand`·레일 블록 바꾸기/취소, 구글 일정 생성·갱신·`DELETE` 추가, 시간이 되면 맨 앞, 지난 시간 표시 | M | 카드 하나를 권장 시간에 잡고 구글 캘린더에 생긴 것을 확인, 그 시각에 맨 앞으로 돌아옴, 취소하면 구글 일정도 지워짐, 캘린더 미연결이면 `Moonlight에만 잡힙니다` |
| 3 | **막힘 풀기** — `blockerKind`·`blockerHistory`·`UnblockPanel`, 카드·프로젝트 상세 연결, 결정으로 풀기 | M | 막힌 프로젝트를 세 갈래로 각각 풀어 보고 이력·결정·할 일이 남음, 버전 충돌 시 부분 성공 문구 |
| 4 | **결정 일지** (Q-CF3·Q-CF4 답 뒤) — 이름, 출처 칩·필터, 그래서 할 일 줄, 막힘 풀림 칩 | S–M | 막힘 풀기로 만든 결정이 출처·할 일과 함께 보임 |

각 단계는 독립 커밋이고 단계 0만으로도 "누르면 사라지는데 아무것도 안 남는" 문제의 가장 나쁜 부분이 없어진다.

---

## 11. 하지 않는 것

- 자동 실행: 끝내기는 전부 운영자가 누른다. 연락 기록을 대신 쓰거나 메시지를 보내지 않는다(운영자 프로필 §2 안전한 해석).
- 초안 생성(`리마인드 초안`)의 부활 — 초안 기능이 실제로 생길 때 별도 결정.
- 넛지(`SuggestionTip`)를 확인할 것으로 대체하거나 그 반대.
- 결정 일지의 AI 요약, Council 검증 버튼 재배치.
- 첫 화면 슬롯 수·폴드 예산(09-21 스펙 소관), 축하 연출(Q134).
- AI 작업 지시(승인 대기) 화면 자체의 재설계 — 이름만 `AI 제안 검토`로 맞춘다.
- 자동 배치: 권장 시간은 보여 주기만 하고, `잡기`를 눌러야 일정이 생긴다. 시안 4 모바일의 `권장 배치 모두 잡기`는 첫 버전에서 빼고 실사용 뒤 다시 정한다.
- 시간 블록의 자동 미루기 — 지난 잡아 둔 일은 표시만 바꾸고 운영자가 다시 잡는다(Q-CF11).
- Calendar 페이지(`dashboard/work/calendar`)의 그리드에 잡아 둔 일을 따로 그리기 — 구글에 넣은 것은 구글 일정으로 이미 보인다.

---

## 12. 미정 질문 (운영자 확인)

2026-10-01 운영자가 아래 **권장 기본값 그대로 진행**을 승인했다("기본값대로 가도 되면 말씀해 주세요"에 "ㄱㄱ"). 실사용 뒤 바꾸려면 이 표를 고치고 해당 단계의 테스트를 함께 바꾼다.

| 번호 | 질문 | 권장 기본값 |
|---|---|---|
| Q-CF1 | 보류 최대 기간은? | 30일 |
| Q-CF2 | 오늘 화면에도 확인할 것을 둘까? | 오늘에는 지금 카드 한 장 요약 + `홈에서 이어 보기`만(§7.1). 두 첫 화면을 합칠지는 09-21 스펙 결정 때 |
| Q-CF3 | Decisions 탭 이름을 `결정 일지`로 바꿀까? | 바꾼다 |
| Q-CF4 | 회의 리뷰에서 수락한 결정·메모의 결정 종류를 결정 일지에 자동으로 모을까? | 모은다(참조 행, 원문은 그 자리) — 자동 등록은 운영자 프로필 §2가 허용 |
| Q-CF5 | 병목 분류를 막힘 걸 때 필수로 할까? | 선택, 비어 있으면 확인할 것 상세에서 한 번 묻는다 |
| Q-CF6 | 결정으로 풀기의 `막힌 점 비우고 진행으로` 기본 체크를 켤까? | 켠다 |
| Q-CF7 | 새 리드 묶음의 보류 단위 — 묶음 전체 vs 리드마다? | 묶음 전체(새 리드가 추가되면 새 묶음 키로 다시 뜬다) |
| Q-CF8 | 시간 잡기 때 구글 캘린더에도 넣기를 기본으로 켤까? | 켠다(쓰기 가능할 때만 보임) |
| Q-CF9 | 권장 시간을 찾는 근무 시간 창은? | 09:00–19:00, 주말은 내일 후보에서 건너뜀 |
| Q-CF10 | 소요 시간 기본값(§4.7 표)이 맞나? | 표 그대로, 고른 값은 종류별로 기억 |
| Q-CF11 | 잡아 둔 시간이 지났는데 못 끝냈을 때 자동으로 다음 빈 시간에 옮길까? | 옮기지 않는다 — `지났습니다` 표시 + `다시 잡기` 1순위 |
