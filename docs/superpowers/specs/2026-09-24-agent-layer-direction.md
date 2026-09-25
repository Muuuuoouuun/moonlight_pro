# 에이전트 계층 방향 정본 — Office · Guru/Mentor · Legend · 스킬 실행

> 상태: **확정 (2026-09-24 운영자 결정 5건)** · 구현은 이 문서 §6의 빌드 플랜을 따르며 2026-09-28(월) 실사용 시작 전에 마친다.
> 작성일: 2026-09-24 (Asia/Seoul) · 에이전트 전수 실측(허브 UI·엔진·허브 API·패키지·문서 5갈래) → 관점 3개 제안·심사 3명·종합·완결성 검사 → 운영자 결정.
> 운영자 원안(운영자의 말): ① Office는 Guru·Mentor·Legend와 조금 별개 ② 이브이와 9인이 Office의 주된 내용이고 업무를 다룬다 ③ Office에서 해결 안 되면 Guru·Mentor에게 얘기한다 ④ 폴더 정리·영수증 정리 같은 특정 업무는 스킬을 발동해 처리한다.
> 관계: [업무 안의 Eevee Office 심화 설계](2026-09-21-eevee-office-embedded-workflow-deep-design.md)의 권한·기록·승인 경계, [P0 교정](../plans/2026-09-23-office-p0-fixes.md)의 말투·역할 카드 동결, [작업 지시 큐 재평가](2026-09-23-work-order-queue-reassessment-design.md) A, [Guru 카드 방향](2026-09-24-guru-guidance-cards-design.md), [회의실 레이아웃 A](2026-09-24-office-meeting-room-layout.md)를 그대로 둔다. 이 문서는 그 위에 **계층 간 경계와 연결 방향**을 확정한다. 2026-09-21 스펙 4건(C-Suite OS·전문화 9인·voice v4·Council·Mentor·Guru·Legend 통합 프레임워크)이 각자 "정본"을 주장하던 상태는 이 문서로 닫는다 — 그 넷은 설계 기준 기록이며 현행 경계는 여기와 심화 설계 §2가 정본이다.
> 정본 순서: `docs/README.md` → `docs/operator-workflow-profile.md` → 개인 OS 심화 설계 → 이 문서 → 주제별 최신 스펙.

## 1. 실측 요약 (2026-09-24, HEAD 4958a89b)

| 층 | 만들어진 것 | 상태 |
|---|---|---|
| Office 9인 | 대화·초안·검토·관점 비교, 역할 카드 v25, 주간 리포트·고객 답장 임베드 3곳, 결과→할 일 연결, 마이그레이션 0038·0040 운영 적용 | 실사용 0건. 독립 심사 통과 0/9(v10 기준), v11~v25 미채점 |
| Guru·Council 자문 | sales-mentor·brand-mentor 각 6모드, 멘토 위젯 9곳, 코칭 채팅(보류 탭), Guru·Legend 카드 3곳 | 마지막 실행 2026-07-12 |
| persona-chat 5인 | 7프로필·8모드·9렌즈, 11개 컴포넌트가 호출 | 5인 로스터는 idle·이름 없음 |
| 작업 지시 큐·크론 | work_orders, 크론 4개 예약(후속 초안은 09-24 해제) | 지시 26건 중 25건 보류, Vercel env 0이라 운영에서 돈 적 없음 |
| Agent API·MCP·Codex worker | 라우트 13묶음, MCP 43도구(core 8 사용), agent_jobs + 로컬 worker | 작업 0건, worker 미가동 |
| Legend | 데이터셋 4벌(허브 16·엔진 14·persona-chat 9·카드 3) | Office 미연결(의도) |

원안 대비: ②만 만들어졌고 ①③④는 그림으로만 있었다. Office는 `apps/engine/lib/office/prompt.ts`가 "이 호출에는 도구가 없다"고 못 박은 텍스트 생성 계층이고, Office→Guru 손잡이는 코드에 없으며, 실행기는 등록된 git 저장소만 다루는 Codex worker 하나뿐이었다.

## 2. 확정 결정 (2026-09-24)

| # | 질문 | 결정 | 뜻 |
|---|---|---|---|
| ① | 스킬 실행 위치 | **Office가 아니라 운영자 Mac의 Claude Code·Codex가 실행하고 Moonlight는 기록만 한다.** Gemini API 키도 로컬 스킬에서 쓸 수 있다 | 원안 ④는 "Office가 실행 요청서를 쓰고, 별도 실행기가 확인 뒤 돈다"로 바뀐다. Office 프롬프트에 도구를 붙이지 않는다 |
| ② | 에스컬레이션 형태 | **기본은 Office 결과를 들고 멘토에게 한 번 묻는 버튼.** 여러 턴 상담(의견 묻고 서로 토의)도 필요하므로 **채팅 역할을 둔다** | 버튼 한 홉 + 이어서 상담할 수 있는 진짜 스레드 |
| ③ | 이브이의 역할 | **담당은 운영자가 고르되, 이브이의 배분(접수·담당 추천)도 살린다** | 이브이가 안건을 읽고 담당·참석자를 추천, 운영자가 확인 |
| ④ | 회의실 레이아웃 A 시점 | **지금 당장 시작. 2026-09-28(월)부터 실사용하므로 그 전에 만든다** | 09-24 승인 스펙 그대로 구현 |
| ⑤ | 브랜드 Council | **Office에 흡수하지 않고 별개로 유지** | brand-mentor는 개인 레인 자문으로 남는다 |

OKR v3 확정 12(10월 Moonlight 개발 동결)와의 관계: 이 빌드는 9월 안에 마치는 것으로 운영자가 소화했다. 10월에는 쓰기·고치기만 한다.

## 3. 계층과 경계 (확정)

```text
운영자
  │ 안건(막힌 할 일·요청)
  ▼
Office 9인 ── 이브이 접수·담당 추천 → 담당 1명 (+관점 0~2명)
  │  판단·초안·검토·회의  ·  도구 없음 · DB 안 만짐 · 실행 사칭 금지
  │  결과 = 본문 + 근거 + 다음 행동 (+ 실행 요청서)
  ├─▶ 할 일로 연결 (확인 후, office_apply_task_v1)
  ├─▶ [다른 관점으로 검토] ─▶ 회사=세일즈 멘토 / 개인=브랜드 멘토 ── 한 홉, 일 안 만듦
  │                              └▶ [이어서 상담] ─▶ 멘토 스레드(여러 턴)
  └─▶ 실행 요청서 ─▶ 운영자 Mac의 Claude Code·Codex(+Gemini 키) 가 스킬 실행
                        └▶ MCP(core 도구)로 할 일 완료·receipt만 Moonlight에 기록
Legend ── 주간 카드만 · 에스컬레이션 목적지 아님 · Office 미연결
```

경계 문장:

- Office는 끝까지 도구를 갖지 않는다. 저장·발송·코드 수정·파일 조작을 하지 않고 했다고 말하지도 않는다(`prompt.ts`, `role-cards.ts` boundaries 유지).
- 어느 계층도 자동으로 일을 만들거나 밖으로 보내지 않는다. 발동은 전부 운영자 버튼이다(프로필 §2·큐 설계 A·09-24 카드 방향).
- 멘토는 같은 Gemini 모델이라 검증 기관이 아니라 다른 렌즈다. 멘토 답을 Office에 자동으로 되넣지 않는다.
- 회사 범위(classin)는 sales-mentor, 개인 범위(personal)는 brand-mentor. 레인을 넘지 않는다. `all` 범위는 레인을 고른 뒤에만 넘긴다.
- Legend는 주간 카드로만 산다(09-24 확정). dissent가 남을 때 두 번째 목적지로 쓸지는 미정.
- 스킬은 저장소가 아니라 운영자 개인 환경(`~/.claude/skills` 등)에 산다. Moonlight가 아는 것은 "요청서"와 "완료 receipt"뿐이다. 영수증 정리가 이미지를 읽는 것은 로컬 스킬의 일이며, Moonlight 앱의 멀티모달 입력 휴면(09-23 확정)은 그대로다.
- 말투·역할 카드 튜닝은 동결(P0). 이브이 배분·에스컬레이션·채팅은 카드 본문을 바꾸지 않고 만든다.

## 4. 결과 그림 — 운영자의 한 주

- 월·목 아침, 오늘 화면의 주간 카드에서 샤미드 정리를 받고 필요한 것 하나만 할 일로 연결한다.
- 고객 답장은 고객 상세에서 부스터 초안 → 복사 → 카톡 직접 발송 → 연락 결과 기록. 복사는 발송 기록이 아니다.
- 막힌 할 일은 회의실에 안건으로 올린다. 이브이가 담당·참석자를 추천하고 운영자가 확인한 뒤 회의를 연다. 발언이 스레드로 보이고, 종합 카드에서 복사·수정 요청·할 일로 연결한다.
- 판단이 안 서면 종합 카드의 **다른 관점으로 검토**로 멘토에게 한 번 묻는다. 답은 같은 카드 아래 참고 자료로 접힌다. 더 얘기해야 하면 **이어서 상담**으로 멘토 스레드에 들어간다.
- 폴더 정리 같은 실행은 Claude Code·Codex 세션에서 스킬로 돌리고, MCP로 할 일 완료만 남긴다.
- 숫자는 새로 세지 않는다. Office 하단의 7일 요약만 본다.

## 5. 진입문 (줄이는 방향)

현재 Office로 가는 문: 사이드바 AI·자동화, ⌘J, 탑바 ✦, 임베드 3곳(주간 카드·고객 답장 2곳), 카드 3곳, 멘토 위젯 9곳. 예정: 회의실(같은 자리), macOS 펫(시연 목업).

- 유지: 사이드바·⌘J·✦ → 회의실(Office 화면 하나). 임베드 3곳. 카드 3곳.
- 수렴 대상(9월 빌드 범위 밖, 11월 정리): 멘토 위젯 9곳·답장 초안 7곳·주간 정리 6곳·행동 추출 5곳의 중복은 Office 결과 카드 행동과 임베드 패널로 줄인다. 새 진입문을 더 만들지 않는다.

## 6. 빌드 플랜 (2026-09-25 ~ 09-27)

이 절은 승인 당시의 구현 순서와 검증 기준이다. 09-24 통합 작업에서 1~5의 연결 코드를 앞당겨 로컬 구현했지만, 실제 모델·운영 DB·배포 검증은 별개다. Guru 서가·조용한 레일·질문 드로어(`mentor-shelf.jsx`, `context-mentor-rail.jsx`, `guidance-question-drawer.jsx`)는 병합했고 기존 `office_apply_task_v1`도 유지한다. 09-28 실사용은 코드 병합만으로 완료라고 부르지 않고 실제 모델·DB·390px 화면으로 확인한다.

| 순서 | 날짜·작업 | 파일 경계와 완료 조건 |
|---|---|---|
| 1 | **09-25 · 회의실 A** | `apps/hub/components/hub/office-session.js`·`office-session.test.mjs`: 기본 관점 `[]`, 안건 복사본·범위별 reset, 후속 `chat` 1회와 6,000자 오류. `pages/office-council.jsx`·`office-council.module.css`: 안건 바, 할 일 가져오기(`GET /api/hub/tasks` 소비), 참석자 드로어, 시간순 발언 스레드, 하단 입력·순서 예고·결과 카드. `office-deliberation-controls.jsx`의 기존 발언 자료를 재사용한다. 할 일 read 실패를 빈 목록으로 보이지 않게 하고, 390px 첫 화면에 입력·가져오기·보내기가 보이면 통과. **A에서는 Engine·Office 계약·DB, 할 일 쪽 입구와 원래 할 일 자동 반영을 바꾸지 않는다.** |
| 2 | **09-26 · 이브이 배분** | `packages/agent-contracts/office-routing.js`와 테스트에 추천 결과(주관 1명·관점 0~2명·이유·범위)를 한정한다. `apps/engine/lib/office/routing.ts`·`apps/engine/app/api/ai/office-assignment/route.ts`, `apps/hub/app/api/hub/office/assignment/route.js`와 라우트 테스트는 **운영자가 `담당 추천`을 누를 때만** 안건 복사본을 읽고 추천한다. `pages/office-council.jsx`는 추천을 확인 카드로 보여 주고 운영자가 적용·수정·무시한다. 명시 선택이 추천보다 우선하며 실패·미설정 때는 수동 선택이 그대로 작동한다. Office 생성 프롬프트와 역할 카드 v25는 건드리지 않는다. |
| 3 | **09-26 · Office→Mentor 한 홉** | `apps/hub/components/hub/office-mentor-client.js`·테스트에서 Office 종합의 본문·근거·이견·다음 행동을 길이 제한된 질문으로 만들고 출처 `requestId/runId`를 보존한다. `pages/office-council.jsx` 결과 카드의 `다른 관점으로 검토`는 운영자가 누른 뒤에만 호출한다. `classin`은 기존 `/api/hub/sales-mentor`의 `open-question`, `personal`은 새 `office-review` 모드를 `apps/engine/app/api/ai/brand-mentor/route.ts`·`apps/engine/lib/brand-office-review.test.mjs`와 `apps/hub/lib/sales-os/brand-context.js`에 추가해 호출한다. 개인 범위에서 첫 브랜드 목소리를 임의로 선택하거나 출처 없는 질문에 Guru 카드 ID를 꾸미지 않는다. `all`은 회사/개인을 먼저 고르게 한다. `createWorkOrder:false`, 답변은 접힌 참고 카드, Office에 자동 재주입 없음. |
| 4 | **09-27 · 이어서 상담** | `apps/hub/components/hub/office-mentor-session.js`·테스트, `office-mentor-drawer.jsx`·CSS에서 한 홉의 답을 첫 턴으로 삼고 운영자 질문·멘토 답을 같은 스레드에 쌓는다. `office-mentor-client.js`가 직전 대화의 길이·턴 수를 제한해 **선택된 한 레인의 같은 멘토**에 넘긴다. 실패 시 입력·이전 턴을 보존하고 재전송은 명시 버튼으로만 한다. 최소 완료선은 실제 후속 두 턴이 앞선 답을 참고하며 이어지는 것. 세션 밖 복원이 없으면 UI에 그 한계를 밝히고 `영구 보관된 상담`으로 표현하지 않는다. |
| 5 | **09-27 · 로컬 스킬 요청·receipt** | `apps/hub/components/hub/office-skill-request.js`·테스트와 Office 결과 카드의 `더보기`에 **명시적 요청서 생성**(요청 ID, 할 일 링크, 수행 범위, 완료 증거)과 복사를 둔다. `supabase/migrations/20260925_0047_local_skill_requests.sql`(착수 시 번호 재확인), `apps/hub/lib/skill-requests.js`·테스트, 인증된 `apps/hub/app/api/hub/skill-requests/route.js`와 `apps/hub/app/api/agent/v1/skill-requests/[id]/route.js`·`receipts/route.js`, `packages/mcp-server/src/agent-tools.js`·테스트에 동일 요청 ID의 결과 receipt 읽기·기록만 더한다. Claude Code·Codex의 **로컬 스킬이** 폴더/영수증을 처리하고, Moonlight는 `요청됨/완료/실패/미확인`과 증거·연결된 기존 `complete_task` 명령 receipt만 기록한다. 저장 실패한 요청서는 실행 대기로 표시하지 않는다. 요청서 복사나 모델의 `완료` 문장만으로 task를 완료 처리하지 않는다. 실행·재시도·비밀키·파일 내용은 Hub/Office로 옮기지 않는다. |

새 `agent/v1` 경로는 현행 `route-access.js`의 `/api/agent/v1/` 공개 접두사 안에 들어간다. 공개 범위를 넓히지 않고 각 새 라우트가 `authorizeAgentRequest`를 자체 적용하는지 `route-access.test.mjs`에서 확인한다. Hub 쓰기는 `hub-write-guard.js`를 거치며, 영수증 기록 전에는 요청 ID·운영자 범위·기존 할 일 소유권을 다시 확인한다.

**통합·검증 컷라인.** 이미 만든 `codex/ai-office-agent-integration-0924` 워크트리에서 1번을 닫는다. 2번의 계약·Engine, 3~4번의 멘토, 5번의 DB·MCP는 그 검증된 커밋에서 별도 워크트리로 나눌 수 있지만, 공통 `office-council.jsx` 편집은 1→2→3→4→5 순서로 통합 브랜치에 반영한다. `packages/*`를 바꾼 워크트리는 루트에서 `npm install` 후 검증한다. 각 묶음은 해당 `node --import ./scripts/register-hub-alias.mjs --test <파일>` 및 Engine/패키지 단일 테스트를 먼저 통과시킨다. 마지막에 `npm test`, `npm run typecheck`, `npm run build`, `npm run db:check`를 실행한다. 새 마이그레이션은 적용 전 충돌 번호·함수 권한을 확인하고, 운영 DB에 실제 적용·재조회되지 않았다면 스킬 receipt를 `운영 가능`으로 표시하지 않는다. 개발 서버에서 실제 막힌 할 일 1건으로 회의→이브이 추천 확인→멘토 한 홉·후속 대화→로컬 스킬 요청과 receipt를 확인한다. **실패한 묶음은 숨겨 둔 채 이미 검증된 범위만 09-28에 사용하며, 미완료 기능을 완료로 보고하지 않는다.** 역할 의미 품질 인증, 영구 상담 보관, 자동 스킬 실행·발송, A안이 제외한 할 일 양방향 연결은 이 컷라인 밖이다.

### 6.1 검증 기록 — 2026-09-24 20:25~20:35, 병합 `9d43beda` 기준, 로컬 Hub :3000 + Engine :3001, 실제 Gemini·운영 DB

| 항목 | 결과 | 근거 |
|---|---|---|
| 전체 테스트 | `npm test` 2930건 · 통과 2917 · 실패 0 · skip 13 | 로컬 실행 |
| 회의실 A 화면 | 안건 바·출처 칩(`할 일에서 가져옴 · 복사본 · HH:MM`)·참석자 드로어(주관 9 + 관점 체크)·더보기 드로어(담당 추천·참석자 바꾸기·새 안건·응답 방식·추천 조합 4·체크 2)·순서 예고 Skeleton·시간순 스레드(첫 의견 → 상호 검토 · 판단 유지/관점 수정 → 종합)·이어서 묻기(주관에게/다시 회의) 모두 렌더 | 실제 할 일 "리임버스, ai 청구주소 변경 요청 메일"로 회의 1판, 모델 호출 5회, 25초 |
| 이브이 담당 추천 | 동작. 주관 리피아 + 관점 샤미드 + 이유, `확정도: 권장`, 적용/수정/무시. **첫 호출 1회 502**(엔진 직접 호출 3/3 성공, 재시도 성공 — 콜드 스타트 추정, 재현 안 됨) | POST /api/hub/office/assignment |
| 멘토 한 홉 | `다른 관점으로 검토` → 범위 `전체`라 회사/개인 먼저 고름 → 회사=영업 멘토(sales-mentor) 200 → 답이 결과 카드 아래 `다른 관점 · 영업 멘토 답변 보기`로 접힘, `확정도: 권장` | POST /api/hub/sales-mentor |
| 이어서 상담 | 2번째 질문("6개 서비스, 하루 30분")에 앞 문맥을 반영한 답. 세션 한계 문구 표시("이 브라우저 세션에만 남습니다") | sales-mentor 2회째 200 |
| 로컬 스킬 요청서 | 드로어(연결된 할 일·범위 선택·수행 범위·완료 증거) → 저장 시 `읽기 실패 · skill-storage-unavailable`, 입력 보존 | **0047 미적용**(운영 DB). `npm run db:check`는 `SUPABASE_ACCESS_TOKEN` 401로 실행 불가 |
| 기록 | Office 7일 요약 `요청 1 · 평균 25초 · 실패 0` | GET /api/hub/office/usage |
| 모바일 375×812 | 첫 화면에 `안건 가져오기`(44px)·입력(16px, 112px)·`보내기`(44px) 모두 보임 | computed style 실측 |

다듬기(9/28 전 권장): 멘토 답변의 마크다운 별표(`**`)가 그대로 보임 · 스킬 요청서 오류가 원인 코드(`skill-storage-unavailable`)로 노출됨(사람 말로: "요청서 저장소가 아직 준비되지 않았습니다") · 결과 카드 `더보기` 안 `로컬 스킬 요청서`가 하단 고정 입력창에 가려지는 스크롤 위치가 있음 · 안건 가져오기 목록과 참석자 드로어의 항목 버튼에 접근 가능한 이름이 없음 · 종합 카드에 `다음 행동`→새 할 일 버튼 없음(회의실 스펙 Open Question 2, 미채택).

운영자만 할 수 있는 것: `SUPABASE_ACCESS_TOKEN` 갱신 후 `npm run db:check` → 0047 적용(`npm run db:migrate 20260925_0047_local_skill_requests.sql`, 적용 전 0046 번호 중복 2건과 파일명 날짜 확인). → **2026-09-25 해소**(아래 §6.2).

### 6.2 검증 기록 — 2026-09-25 13:50~14:20, HEAD `d4c34b8d` + 이 세션 커밋 2건

| 항목 | 결과 | 근거 |
|---|---|---|
| 0047 로컬 스킬 저장소 | 운영 DB 적용됨(다른 세션). `GET /api/hub/skill-requests` → `status: ready`. db:check에 미등록이던 것을 `8df840d2`로 등록, `[PASS] 로컬 스킬 요청서` | `scripts/database-readiness.mjs` |
| 요청서 → receipt 왕복 | 회의실 결과 카드 → `로컬 스킬 요청서` → 범위 `회사` 선택 시 "할 일의 범위가 일치하지 않습니다"(서버 소유권 검사, 입력 보존) → `개인`으로 저장 성공 `요청서 저장됨 · 실행 전`(ID `5a7d57b0…`) → `GET /api/agent/v1/skill-requests/{id}` `requested` → `POST …/receipts` `unconfirmed`(검증용, 할 일 완료 없음) | 실제 할 일 `cbde85a5…`에 검증 receipt 1건이 남아 있다 |
| **MCP 클라이언트 차단(블로커였음)** | Claude Code의 MCP 클라이언트가 2020-12 검증기만 쓰게 바뀌어 `outputSchema`가 draft-07 `$schema`를 단 도구를 호출 시 전부 거절 — `get_hub_health`부터 새 스킬 도구까지 **moonlight 도구 10개 전부**. 원인은 `packages/mcp-server/node_modules/zod` 3.x + SDK의 zod-to-json-schema(draft-07 고정, SDK 1.30.1도 동일). `ce098afb`로 outputSchema 선언을 제거(structuredContent는 유지)하고 `schema-dialect.test.mjs`가 인메모리 실제 클라이언트로 재발을 막는다. **이 세션의 MCP 서버 프로세스는 옛 코드라 재시작 전엔 여전히 실패한다** — 새 Claude Code 세션(또는 `/mcp` 재연결)에서 `get_skill_request`로 확인 | `packages/mcp-server/src/{agent-tools,assistance-tools,tools}.js` |
| 후속 수정(다른 세션) | `e1c0327b` 멘토 답 굵게 표시(마크다운 별표 문제)·스킬 요청서 오류 문구·Hub→Engine 502/503 재시도, `4493804f` Gemini 재시도, 안건 목록 버튼에 접근 가능한 이름(`안건으로 가져오기: …`) | §6.1 다듬기 항목 중 3건 해소 |
| 코드 리뷰(5영역 34건 → 반박 검증) | 결과는 아래 §6.3 | 워크플로 `wf_88f7be22-8f8` |

### 6.3 코드 리뷰 결과 — 병합 `9d43beda` 기준 리뷰 5영역 34건, 현재 HEAD에서 1명 반박 검증

블로커 0. 확인 10건 · 반박 24건(이미 고쳐졌거나, 스펙을 과잉 해석했거나, 9/28 실사용에 영향 없음). 확인 10건의 처리:

| ID | 내용 | 처리 |
|---|---|---|
| MR-1 (major) | 첫 판 이후 초안·검토 방식이 chat으로 전송됨(수정 요청 포함) | `a7f34123` — override를 council 세션에만 |
| MR-2 (major) | 첫 요청 실패 뒤 원문을 바꾸면 옛 원문 1,500자가 보이지 않게 앞에 붙고 제목이 옛 첫 줄로 남음 | `a7f34123` — manual 안건은 성공 시에만 고정, 첫 판엔 재부착 없음 |
| ROUTE-1 (major) | 담당 추천 본문 상한 12,000B가 6,000자 계약과 어긋나 한글 ~3,900자부터 413 | `09549b64` — 24,000B(6,000자 한글 최악 18,031B), 실서버 5,872자 → 200 확인 |
| ROUTE-3 (major) | `maxOutputTokens: 1200`이 thinking 모델에서 MAX_TOKENS → 추천 실패(실키 재현) | `09549b64` — 4096 |
| F3 (minor) | 멘토·가드레일 프롬프트에 "원장" 9곳 + 페이지 1곳(2026-09-22 운영자 금지어) | `3eb865ea`·`a7f34123` — "기록" |
| MR-7 (minor) | 할 일 읽기 실패에 내부 오류 코드 원문 노출 | `a7f34123` — 한국어 매핑 |
| SKILL-001 (minor) | 0047이 db:check 미등록 | `8df840d2` |
| SKILL-005 (minor) | MCP README HTTP 표에 skill-requests 2라우트·16 KiB·receipt 어휘 누락 | 미처리(문서) |
| X-4 (minor) | DESIGN.md 헤더 SHA·§6/§11 셸프 42px 카브아웃·§8/§14 composites 미기재 | 미처리(문서, 다른 세션이 DESIGN.md 편집 중) |
| MR-8 (minor) | 세션 `agenda`에 스펙 §9 목록 밖 `taskWorkspace` 필드(로컬 스킬 범위 판정용) | 코드 변경 없음 — 회의실 스펙 §9에 기록 필요 |

추가로 이 세션에서 잡은 것: **MCP 클라이언트 outputSchema 차단**(§6.2, `ce098afb`). 리뷰 범위 밖이지만 결정 ①의 경로 전체를 막고 있었다.

범위 밖 병합(결정 ①~⑤ 밖, 별도 근거 있음): 회의 텍스트 검토 M0·M0.5(메모 작성창·내 작업 렌즈, 마이그레이션 0045·0046은 2026-09-24 22:51 KST 운영 적용됨 — 테이블 2·함수 11 존재·RLS 켜짐·service_role 전용 실행 확인(09-25 실측). db:check에는 미등록), 멘토 서가·레일(`2026-09-24-guru-dual-experience-design.md` 운영자 승인). 마이그레이션 번호 중복 3쌍(0045·0046·0047)은 실행기가 파일명 전체로 키잉해 기계적 충돌 없음, 적용된 파일은 개명 금지.

운영자 확인 항목: ① 9/28 전 갤럭시(390px)에서 회의실 첫 화면·키보드 올라온 상태의 보내기 버튼 실기 확인 ② 새 Claude Code 세션에서 `get_skill_request`가 실제로 호출되는지(MCP 수정은 재시작 뒤 반영) ③ 회의 텍스트 검토 M0를 쓸지(0045·0046은 이미 적용돼 있어 DB 작업은 필요 없음) ④ 실사용 1주 뒤 회의실 스펙 Open Question 1·2·4 결정 ⑤ `docs/README.md:65`의 "0047 미적용" 문구는 낡음(다른 세션이 README 편집 중이라 이 세션은 손대지 않음).

### 6.4 운영 DB 마이그레이션 대조 — 2026-09-25, 읽기 전용

저장소 67파일 전부가 운영 서울 DB에 반영돼 있다. 적용 대기 파일은 없다.

- **이력 테이블 이후(0044 부트스트랩 뒤) 8파일**: `moonlight_ops.applied_migrations`에 8/8 기록 — 0045 두 개(Studio 템플릿·회의 검토), 0046 두 개(회의 실행 계획·소셜 다중 계정), 0047 두 개(소셜 OAuth 가드·로컬 스킬 요청서), 0048 Meta 앱 바인딩, 0049 제품. 적용 시각은 09-24 15:13 ~ 09-25 13:13 KST이며 이 세션이 적용한 것은 없다.
- **이력 테이블 이전 59파일**: 이력 행이 없는 것이 정상이다(테이블이 0044에서 생겼다). `npm run db:check`가 객체 존재·RLS·실행 권한·함수 본문 버전으로 검사하며 전부 PASS다.
- **db:check 미등록**: 회의 0045·0046은 위 방식으로 직접 대조했다 — 테이블 2개(RLS 켜짐), 함수 11개(service_role 실행). 예외 하나는 `journal_task_plan_receipt_v1`이 anon 실행 권한을 가진 것인데, 이 함수는 `returns trigger`라 Postgres가 트리거 밖 직접 호출을 거절하므로 노출 경로는 없다. 다른 트리거 함수(`enforce_task_focus_cap_v1`)처럼 revoke하는 것은 위생 항목이다.
- 따라서 `docs/README.md` §3의 "0047 미적용"과 리뷰 종합의 "0045·0046 미적용"은 둘 다 낡은 서술이다.

## 7. 미정 (이번 빌드에서 답하지 않음)

- dissent가 남을 때 Legend 트라이어드를 두 번째 목적지로 둘지.
- 크론 content-flywheel·chief-of-staff 예약 해제 시점(큐 설계 B7과 함께).
- 5인 로스터·agents 테이블·브랜드 자문 탭 폐기(P0에서 미정).
- 중복 진입점 수렴 순서(11월).
- 월별 AI 비용 표시(프로필 §11 확정, 구현 0) — 스킬이 Gemini 키를 쓰기 시작하면 먼저 필요해진다.
- Office 의미 품질 독립 재채점 시점(replan P3).
