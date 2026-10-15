# 리서치·보고서 연결 완성

상태: 2026-10-01 운영자 구현 지시. 기존 목업을 실제 원장과 연결하고 개발·최적화한다. 반복 API 비용은 운영자가 현재 상한을 두지 않고 사용량을 관찰하기로 결정했다. 이전 비용 상한 사전 확정 요구를 이 실행에 한해 대체한다.

## 흐름

1. 콘텐츠의 리서치함은 수동 입력과 자동 준비 결과를 함께 검토한다. 자동 준비는 공개 원문을 확보한 자료만 모델에 전달하고, 사실·해석·미확인·검토용 원고·출처를 분리하여 저장한다. 검색 발췌를 원문 검증으로 표시하지 않는다. 결과는 항상 검토 대기이며 콘텐츠 전환과 발행은 운영자 행동이다.
2. 보고서 허브는 기존 첫 화면의 보조 탭으로 `dashboard/reports`에 배치한다. 개인·회사 주간 실측을 고정 기간으로 저장하고, 기존 리서치 브리프와 Office의 주간 AI 정리 결과를 통합 목록과 상세에서 본다. 별도 sidebar primary 앵커를 늘리지 않는다. QA·평가는 명시적으로 제출한 문서만 저장하며 저장소 전체를 자동 수집하지 않는다.
3. 사실은 실제 원장 집계다. AI 해석은 기존 OfficeWorkflowPanel의 같은 기간·범위 실행 경로를 사용한다. 운영자 판단은 보고서별 별도 기록으로 저장한다. 회사 보고서에 개인 메모를 넣지 않는다. 미측정은 null·부분 상태로 보인다.

## 공통 보고서 계약

- `GET /api/hub/reports`: `{status:'live'|'partial'|'preview'|'error', reports:[Report], failedSources:[]}`. 각 report는 `{id,kind,scope,title,periodStart,periodEnd,createdAt,source,status,summary,facts,interpretation,decision,sourceRefs,actions}`이다. id는 `stored:<uuid>`, `research:<uuid>`, `office:<uuid>`의 안정적인 값이다. kind는 weekly/research/evaluation/qa, scope는 personal/company/content다. facts는 주간 원장 응답 또는 리서치 facts 객체다. 리스트는 bounded paging으로 제한하며 partial을 숨기지 않는다.
- `POST /api/hub/reports`: `{requestId,action:'capture-weekly',scope:'personal'|'company',periodStart,periodEnd}` 또는 `{requestId,action:'save-document',kind:'evaluation'|'qa',scope,title,body,sourceRefs}` 또는 `{requestId,action:'record-decision',reportId:<stored UUID>,expectedRevision,decision}`. 동일 requestId 재시도는 중복 없이 같은 receipt를 반환한다. 변경된 입력은 conflict다.
- 주간 저장은 Supabase `report_documents`와 RPC `report_command_v1`을 사용한다. snapshots는 frozen facts를 보관하고 revision을 유지한다. 공통 보고서의 회차키는 같은 범위·기간의 주간 보고서 한 건이다. 기존 Office 원본은 사본 생성 없이 읽기 투영한다.
- 주간 저장은 완료된 7일 기간만 허용한다. 월·목 오전의 정기 실행은 이전 완료 주간 스냅샷을 저장한다. `COM_MOON_REPORTS_AI_ENABLED=true`이면 기존 Office receipt를 먼저 확인하고 없을 때만 Vaporeon이 같은 기간·범위의 AI 해석을 작성한다. 월 개인·목 회사의 기존 주간 정의, Office 보관 기간·운영자 범위·도구 미실행 계약을 유지한다.
- 목록은 단일 RPC의 시간·ID 커서로 100건씩 읽는다. `?cursor=`는 이전 페이지, `?report=<prefixed id>`는 개별 자료를 직접 읽는다.

## 자동 리서치 계약

- `GET /api/hub/research/runs`: `{status,runs,settings}`; UI는 마지막 실행, 실제 준비 수, 실패 이유, 검색 호출 수, 토큰과 추정 비용을 표시한다.
- `POST /api/hub/research/runs`: `{requestId,brand:<brand slug>,topic?,limit?}`; 서비스는 서버 설정으로 등록 브랜드를 확인하고 claim → 공개 원문 확보 → Engine `/api/research/prepare` → 결과 검증 → 원자 저장을 한다. 브라우저는 origin·verificationLevel을 지정하지 못한다.
- 정기 설정은 `COM_MOON_RESEARCH_ENABLED=true`, 비용 상한은 현재 없음. politic_officer는 KST 08~22시 2시간 간격, class.moon 일 3개, 22nomad 일 1개를 시작 설정으로 사용하며 야간 24시간 실행·행사 모드는 이번 기본값에 포함하지 않는다. 수량은 근거가 있는 자료의 최대값이며 억지로 채우지 않는다.
- 실행·원문·브리프의 claim과 eventKey는 재시도와 중복 실행을 구분한다. 변동 원문은 문서 hash로 추적하고 기존 승인 원고를 조용히 수정하지 않는다. AI 원고는 `origin=research-ai`, `verificationLevel=unreviewed`다.
- 모델 사용량은 기존 ai_usage_log와 실행 receipt에 남기고 모르는 단가는 null이다. 외부 업로드와 자동 콘텐츠 전환은 하지 않는다.

## 실행 환경

Vercel Hobby는 일 1회 크론만 허용하므로 Hub에 매일 KST 08시 리서치·08시30분 보고서 fallback을 등록한다. 운영자 Mac의 launchd 작업은 15분마다 인증된 sweep을 호출하고 서버 회차 claim이 실제 브랜드 주기와 중복 방지를 결정한다. Mac이 잠들어 있으면 2시간 회차는 지연 또는 누락될 수 있고 클라우드 일간 fallback은 남는다. 유료 요금제 변경은 하지 않는다.

## 검증

먼저 회귀·계약 테스트가 실패하는 것을 확인하고 구현한다. RPC 중복·동시 요청·workspace 경계·권한·리서치 근거 누락·모델 실패·부분 결과를 확인한다. 전체 테스트와 Hub/Engine 빌드 후 서울 DB 적용·실제 생성 3브랜드·저장 재조회·390px/데스크톱 화면 왕복을 검증한다. 운영 로그인 작업의 다른 활성 세션과 충돌하지 않도록 현재 상태를 읽고 변경 범위를 정한다.
