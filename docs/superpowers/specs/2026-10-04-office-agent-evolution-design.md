# Office 안건 지속성·실행 연결·Mac 펫 연속 대화

> 2026-10-07 통합 메모: 아래 v25 언급은 작성 당시의 기준이다. 통합본은 최신 main의 v27 역할 카드·Commander·고객 준비·요청 수신함·브랜드 연결을 보존한다. 영속 흐름은 별도 `저장 회의` 탭에 공존하며, 브랜드 결과 연결은 기존 관점 대화 흐름을 사용한다. 마이그레이션 정본은 `20261007_0069_office_meetings.sql`; 운영 DB 적용·배포·실제 모델 호출은 수행하지 않았다.

> 상태: 구현 범위 승인(2026-10-04) · 전용 브랜치 구현·로컬 검증 · 운영 적용 전
> 승인: B(회의 복구·판단 맥락·할 일 연결·실행 추적) + C(기존 펫 진입·대화)를 제안했고 운영자가 “ㄱ ㄱ c까지도”로 진행을 지시했다.
> 관계: 2026-09-24 Office 회의실 A의 휘발성 세션·텍스트 복사본 한계를 대체한다. V4 배치와 2026-09-24 에이전트 계층의 역할·실행 경계는 유지한다. 아래 세부 저장·API 선택은 승인 범위를 구체화한 구현 결정이다.

## 목적과 완료선

같은 업무 안건을 Hub와 Mac 펫에서 다시 열고, 이전 판단을 참고해 대화를 이어간다. 운영자가 확인한 다음 행동을 기존 할 일에 반영하고, 그 안건에서 만든 로컬 실행 요청과 증거를 찾아본다.

1. 서버에 저장된 안건·완료된 판은 새로고침과 다른 기기 접속 뒤에도 복원된다.
2. 사용자 원문, 역할별 발언, 남은 이견, 판단을 바꿀 조건을 보관하고 다음 판에 제한된 분량으로 전달한다.
3. 운영자가 명시적으로 적은 결정 문맥을 별도로 저장·수정한다. AI의 추정을 운영자의 확정 결정으로 승격하지 않는다.
4. 원래 할 일을 실제 ID로 연결한다. 현재 기록과 비교한 뒤 명시적 저장으로 다음 행동만 반영한다.
5. 로컬 스킬 요청은 안건·판 ID를 선택적으로 가진다. 실행 결과의 원천은 기존 receipt다.
6. Mac 펫 Office에서 목록·새 안건·이어 쓰기·동일 안건 Hub 열기가 동작한다.

## 데이터·실행 경계

office_requests는 주간·고객 답장 전용이며 30일 만료 규칙을 가진다. 새 office_meetings와 office_meeting_turns에 회의만 보관하고 기존 만료 계약은 바꾸지 않는다. 새 안건은 명시적으로 닫을 수 있으며, 닫힌 회의도 목록에 남아 다시 열 수 있다. 자동 삭제·자동 추론 기억·자동 업무 생성은 없다.

안건 소유자는 workspace 안의 단일 operator이고 범위는 personal/classin이다. 전체 범위에서 시작할 때는 운영자가 레인을 고른다. 역할 ID는 판단 담당자이며 저장 기록의 소유자나 실제 실행자와 구분한다.

서버는 sourceTaskId로 원래 할 일의 소유권·범위를 확인하고 스냅샷을 만든다. 클라이언트의 history/result/source snapshot은 받지 않는다. 요청 ID·revision·실행 토큰으로 동일 판 재전송·동시 요청·늦은 결과를 구분한다. 불명확한 결과는 unknown으로 남기고 자동 재생성하지 않는다.

## API 계약

- GET /api/hub/office/meetings?scope=personal|classin&limit=20&cursor=…
- POST 같은 경로: meetingId,title,scope,sourceTaskId?,ownerId,reviewers,mode,decisionContext?
- GET /api/hub/office/meetings/[id]
- PATCH 같은 경로: expectedRevision,title?,ownerId?,reviewers?,mode?,decisionContext?,state?
- POST /api/hub/office/meetings/[id]/turns: requestId,expectedRevision,message,mode?,includeProjects?,deliberation?

목록은 ready/meetings/nextCursor, 상세는 ready/persisted/meeting/turns/skillRequests를 반환한다. 생성·수정도 상세 봉투를 반환하고 판 생성 성공은 generated와 turn을 함께 반환한다. 모든 읽기 실패는 HTTP 200+status:error이며 쓰기는 invalid 400/conflict 409/running·unknown 202다.

meeting은 meetingId,scope,title,sourceTask,ownerId,reviewers,mode,decisionContext(문자열 4000자),revision,state(open/closed),createdAt,updatedAt을 가진다. turn은 id,roundNumber,state(running/generated/error/unknown),request,result,createdAt,finishedAt을 가진다. 목록은 turnCount를 더한다.

DB는 RLS와 service_role 전용 RPC를 사용한다. sourceTask, history와 결과를 서버에서 구성하고 기록한다. 직접 테이블 접근은 허용하지 않는다. 모델 호출은 기존 Office Engine을 사용한다.

## 문맥과 복구

보관 원문과 모델에 전달할 분량을 구분한다. 최근 판의 사용자 요청·종합·역할 발언·이견·조건을 제한된 history로 전달하고 명시적 결정 문맥과 원래 할 일 스냅샷을 포함한다. 분량 제한은 기존 Office 계약을 지킨다. role cards v25는 바꾸지 않는다.

미전송 입력은 브라우저/펫 입력 상태로 유지하며 서버 저장을 주장하지 않는다. 오류·충돌·알 수 없는 저장 결과 뒤에도 입력을 보존한다. 서버 기록 재조회는 모델 재호출과 구분한다. 로딩/빈 상태/연결 전/오류를 따로 표시한다.

다른 표면에서 갱신한 회의를 다시 읽을 때, 로컬에서 실제 수정한 설정만 보존한다. 수정하지 않은 판단 문맥·참석자는 서버 최신값을 따른다. 모델 통신 타임아웃·응답 유실은 unknown으로 기록하고, 미확인 판이 남아 있으면 새 ID로도 생성을 시작하지 않는다.

## Hub 화면

V4의 세 열·결론 우선·한 판 표시를 유지한다. 기존 회의 설정 드로어를 안건 목록·결정 문맥·연결된 할 일 비교·실행 기록에도 사용하고 새 레일은 만들지 않는다. 최근 안건 재개는 기존 안건 영역에서 찾을 수 있게 한다.

?meeting=UUID&scope=personal|classin 링크로 같은 안건을 연다. 범위가 달라지거나 요청이 늦게 돌아와도 다른 안건/레인의 입력을 덮지 않는다. 불러온 뒤 딥링크를 소비한다. 390px 입력·보내기, 44px 터치, 토큰·프리미티브 계약을 지킨다.

기존 할 일 반영은 최신 task를 읽어 원본 스냅샷과 차이를 보여주고 PATCH /api/hub/tasks의 expectedUpdatedAt으로 nextAction만 저장한다. 중간 변경은 충돌로 남겨 운영자가 다시 확인한다.

스킬 요청에는 meetingId와 officeTurnId를 함께 넘긴다. 서버가 원래 task·레인·workspace와 해당 generated 판을 검증한다. 복사·모델 응답과 실행 완료는 구분하며 할 일 완료 명령은 기존 별도 계약이다.

## Mac 펫

실제 Mac 런타임인 prototypes/moonlight-pet-macos를 수정한다. 기존 Council의 임시 대화와 브랜드 Council 인계는 별도 흐름이다. Office에 전용 대화 store를 두고 같은 Hub API·인증 쿠키를 사용한다.

기존 링크 카드 대신 최근 안건 선택과 대화를 제공하고 460×580(+펫 배치 높이) 크기의 기존 대화 패널 규격을 재사용한다. 더보기에서 Hub 원본 할 일을 가져올 수 있다. 로컬 전용 할 일은 서버 ID가 있는 것처럼 전달하지 않는다. 같은 UUID로 Hub를 연다. Windows 표면은 이번 Mac 구현의 검증 결과로 대체하지 않는다.

## 검증

- SQL: RLS·RPC 권한, 다른 workspace/레인 차단, 원본 할 일 삭제 후 스냅샷, 요청 중복·동시 실행·revision 충돌·늦은 finish.
- 서버: 클라이언트 history/result 위조 거부, 저장 실패·unknown·재조회, bounded context, 회의별 receipt.
- Hub: 복원·범위 전환·늦은 응답·입력 보존·명시적 할 일 적용·deep link, 390px와 양 테마.
- Mac: 저장 안건 목록·복구·동일 ID 연속 대화·Hub 링크, 인증 오류·타임아웃·충돌 입력 보존.
- 공통: 대상 테스트 후 전체 npm test, typecheck, Hub/Engine build. Mac Swift 테스트·빌드. 운영 DB 적용·실제 모델 왕복·배포는 수행 여부를 별도로 기록한다.
