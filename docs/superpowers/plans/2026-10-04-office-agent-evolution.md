# Office 안건 지속성·펫 연결 Implementation Plan

> 2026-10-07 통합 메모: 아래 v25 언급은 작성 당시의 기준이다. 통합본은 최신 main의 v27 역할 카드·Commander·고객 준비·요청 수신함·브랜드 연결을 보존한다. 영속 흐름은 별도 `저장 회의` 탭에 공존하며, 브랜드 결과 연결은 기존 관점 대화 흐름을 사용한다. 마이그레이션 정본은 `20261007_0069_office_meetings.sql`; 운영 DB 적용·배포·실제 모델 호출은 수행하지 않았다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 저장 안건을 Hub·Mac 펫에서 이어가고 기존 할 일·로컬 실행 증거로 연결한다.
**Architecture:** Office 전용 meeting/turn 저장소와 서버 생성 경로를 두고 두 클라이언트가 공유한다. 기존 Engine·task mutation·skill receipt를 재사용한다.
**Tech Stack:** Next.js, React, JavaScript/TypeScript, Supabase RPC/PostgreSQL, SwiftUI.

## 1. 서버·저장소

담당: office_persistence, 전용 codex/office-meeting-storage-1004.
파일: apps/hub/lib/office/meeting-{service,runtime,http}.js 및 테스트, lib/repositories/office-meetings.js, app/api/hub/office/meetings/**, supabase/migrations/20261007_0069_office_meetings.sql, scripts/database-readiness.mjs.

- [x] service/http 테스트를 먼저 작성한다. 같은 requestId 재시도 시 generator 호출 1회, stale revision 시 409, 다른 workspace ID 접근 차단을 검증한다.
- [x] SQL claim/finish를 구현한다. meeting 행 잠금 → revision 검사 → turn running 선점 → 서버 모델 호출 → token 일치 finish 순서다.
- [x] 개인·회사 원본 할 일 검증, 결정 문맥 4000자, 저장 원문과 bounded history를 구현한다.
- [x] 서비스 성공/실패/unknown 재조회와 HTTP 200 read error 봉투를 확인한다.
- [x] local_skill_requests에 meeting_id·office_turn_id와 기존 생성/공개 RPC의 호환 확장을 넣는다.
- [x] 실제 로컬 Postgres 테스트로 권한·중복·동시 실행·완료 복구를 검증한다. spawn env는 LC_ALL:C다.
- [x] db:check에 테이블과 RPC를 등록한다.

실행: node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/office/meeting*.test.mjs

## 2. Hub 연속 안건

담당: office_hub_ui, 전용 codex/office-meeting-ui-1004.
파일: office-session.js/test, office-session-provider.jsx, 새 office-meetings-client.js/test, pages/office-council.jsx/CSS, 필요한 안건 드로어·task apply helper.

- [x] 복구된 판이 기존 ResultTurn에 그대로 렌더 가능한 request/result를 갖는지 테스트한다.
- [x] create/list/get/update/send 클라이언트를 구현하고 저장 전 성공 표시를 차단한다.
- [x] 새로고침 복원·목록 재개·딥링크, personal/classin 선택, draft 유지·stale response 억제를 연결한다.
- [x] 설정 드로어에 명시적 결정 문맥·안건 닫기·기존 task 최신 비교/nextAction 적용을 둔다.
- [x] skillRequests를 기존 OfficeSkillRequestHistory로 표시하고 스킬 생성에 meetingId/officeTurnId를 넘긴다.
- [x] 의미 있는 상태 테스트와 기존 Office 회귀 테스트를 통과시킨다.

실행: node --import ./scripts/register-hub-alias.mjs --test apps/hub/components/hub/office*.test.mjs

## 3. 요청서 출처 연결

담당: root, 통합 worktree.
파일: apps/hub/lib/skill-requests.js/test, components/hub/office-skill-request.js/test, office-skill-request-drawer.jsx/test.

- [x] 기존 요청 호환과 두 출처 ID의 함께 존재/UUID 검증 테스트를 먼저 추가한다.
- [x] 요청 생성·복사 원문·반환 검증에 meetingId/officeTurnId를 반영한다.
- [x] 회의에서 여는 기록은 meeting 상세에 연결된 receipt를 읽고 입력 task ID와 일치하는 항목만 보여준다.
- [x] 서버 검증 실패·읽기 실패·부분 ID·위조 출처를 테스트한다.

## 4. Mac 펫

담당: office_pet, 전용 codex/office-meeting-pet-1004.
파일: prototypes/moonlight-pet-macos의 HubOfficeAPI·OfficeChatStore·CompanionPanelView·전용 Office 내용·테스트.

- [x] durable meeting 디코딩·상태 전이·같은 ID 전송·실패 입력 보존 테스트를 먼저 작성한다.
- [x] Office 전용 store와 Hub API create/list/detail/PATCH/turn 전송을 구현한다.
- [x] 기존 Office 카드 자리를 안건 선택·대화로 바꾸고 기존 Council과 분리한다.
- [x] 원래 Hub task만 sourceTaskId로 전달하고 같은 meeting UUID 링크를 연다.
- [x] native 패널 크기와 긴 생성 타임아웃을 해당 경로에만 적용한다.
- [x] Swift 테스트·빌드·서명·self-check를 수행한다. 대화 패널 실기 조작은 아래 검증 한계로 기록한다.

## 5. 통합·리뷰·검증

- [x] backend·skill JS·Hub·pet의 전용 커밋을 통합하고 API 계약을 함께 검증한다.
- [x] spec compliance 리뷰 후 코드 품질/권한/복구 리뷰를 독립적으로 수행한다.
- [x] 대상 테스트, 전체 npm test, npm run typecheck, npm run build, native 테스트·빌드를 확인한다.
- [x] 로컬 390px/데스크톱 화면과 read error/preview를 확인한다. live 데이터인 것처럼 예시를 코드에 넣지 않는다.
- [x] docs/README.md와 승인 스펙에 실제 검증·운영 적용 여부를 기록한다.
- [x] 명시 경로만 stage하고 branch 확인 후 커밋, git show --stat으로 규모를 확인한다.

## 2026-10-04 구현·검증 기록

전용 통합 브랜치: `codex/office-agent-evolution-1004`. 시작점은 `d235372c`이며 공유 메인 체크아웃의 기존 수정은 건드리지 않았다.

### 검증 결과

| 검증 | 결과와 범위 |
|---|---|
| 전체 Node 테스트 | `OFFICE_MEETING_POSTGRES_TEST=1 SKILL_REQUEST_POSTGRES_TEST=1 npm test`: 4,223개 중 4,211 통과, 실패 0, 환경 의존 12 skip. 로그 `/tmp/office-evolution-tests-final.log` |
| 실제 PostgreSQL | 회의 suite 8/8. 동일 요청 동시 5회 claim, revision 충돌, 불확실한 판의 새 요청 차단, 늦은 완료·반복 완료, workspace·레인·권한, 보관 회의 조회, 원본 할 일 삭제 뒤 보존을 검증했다. |
| 통합 데이터 흐름 | 실제 Hub client → HTTP handler → service → SQL로 생성·새 store 복원·다음 판 문맥·회의별 스킬 생성·receipt 조회. 모델 응답은 결정적인 테스트 생성기를 사용했고 실제 유료 모델 호출은 아니다. |
| 타입 검사 | `npm run typecheck` 4개 작업 성공. Hub JSX는 별도 typecheck 스크립트가 없으므로 빌드와 동작 테스트로 검증. |
| Hub·Engine 빌드 | `npm run build`: 3개 작업 성공. 로그 `/tmp/office-evolution-build-final.log` |
| 브라우저 | Chrome, 1280×900·390×844, light/dark. 실제 no-config preview·읽기 오류 구분, 공백/줄바꿈 입력 보존, 재조회 잠금, 드로어, 범위 선택. 390px 가로 넘침 없음, 입력 16px, 전송 버튼 44px, 첫 화면 안에 전송 버튼. 관련 console warning/error 0. |
| Mac 통합본 | meeting API/store 스크립트 성공, `script/build_and_run.sh --build-only` 성공, strict signature 확인, 실행 파일 `--self-check` 성공. 로그 `/tmp/office-evolution-native-build.log` |
| Mac 회귀 | 별도 리뷰와 구현 worktree에서 기존 chat API/store, transport 17, Hub domain 14+복구 6, panel 205 체크 통과. `/tmp/moonlight-office-meeting-pet-1004-verification.log` |
| 독립 리뷰 | UI·서버·SQL·스킬·native를 읽고 발견한 결함을 수정 후 재검토. 다른 회의의 할 일 적용, 깨끗한 로컬 설정의 원격 결정 덮어쓰기, 보관 회의 누락, Mac 담당자·범위 변경의 초안/출처 손실을 회귀 검사로 고정. |

검증 중 추가한 주요 복구 규칙: task 비교/저장은 회의 ID와 source task ID 모두 일치해야 한다. 읽기 후에는 변경하지 않은 필드에 서버 최신값을 채택한다. 모델 통신 timeout·유실은 legacy chat과 구분하는 opt-in unknown 정책으로 처리하며, Office의 다음 생성은 그 판의 확인 전까지 차단한다. 연결이 없는 읽기·쓰기에는 명시적인 preview를 반환한다.

마지막 브라우저 회귀 수정: Office에서 사이드바 범위를 명시적으로 바꾸면 URL scope도 바꾸고 이전 meeting query를 제거한다. 개인→회사→개인 전환의 본문·주소 일치, 범위별 원문·판단 맥락 보존, 전체 범위에서 전송 잠금을 실제 UI로 확인했다. 보관 회의의 성공 렌더는 저장된 실사용 데이터가 없는 QA 환경에서 확인하지 못했으며, 목록 보존·복원은 SQL와 client/service 통합 테스트로 확인했다.

### 운영 적용과 검증 한계

- 운영 DB에는 `20261007_0069_office_meetings.sql`을 아직 적용하지 않았다. 적용 시 기존 서울 ref를 확인하고 정본 마이그레이션 실행기와 `db:check`를 사용한다.
- Hub·Engine 운영 배포, 설치된 Mac 앱 교체, 실제 모델 왕복은 하지 않았다. 역할 카드 v25의 의미 품질 재평가도 이번 범위에 포함하지 않는다.
- Mac 대화 패널의 연결된 운영 데이터 실기 조작은 아직 하지 않았다. API/store·실제 Swift 빌드·GPU/앱 자체 검사는 완료했다.
- Windows 표면은 수정하지 않았고 Windows 실기 결과를 주장하지 않는다.
- 서버에 보관되는 것은 전송한 판과 명시적으로 저장한 판단 메모다. 미전송 입력과 멘토 후속 상담은 브라우저/펫 세션을 벗어나 영속 보존된다고 표시하지 않는다.
