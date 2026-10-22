# 격리 PostgreSQL·실제 PostgREST UI 저장 왕복 — 2026-10-23

대표 3개 흐름과 응답 유실 복구 1개가 통과했다. 화면의 성공 표시뿐 아니라 실제 PostgreSQL 행, 연락 연결, journal 영수증을 확인했다. 운영 DB/API에는 쓰지 않았고 앱 코드는 변경하지 않았다. 테스트 자료는 비워진 로컬 DB에서 UI로 생성했으며 저장소 코드에 업무 목업을 넣지 않았다.

검사 기준 코드는 `34ff2ea4f53a5a2eb5173244ab520baa45518a70`이다. 전용 worktree에서 PostgreSQL 17.10, 운영과 같은 PostgREST 14.18 공식 macOS arm64 바이너리, Next.js development Hub/Engine, Playwright 1.62.1 Chromium을 사용했다. UI는 1440×1000, Asia/Seoul 시간대였다. Browser plugin의 browser skill이 제공되지 않아 설치된 정식 Playwright를 사용했다. 모바일·운영 production build의 저장은 이번 검사 범위 밖이다.

환경은 검증 완료된 보안 백업의 public/moonlight_ops 스키마를 복원했다. 로컬 public 업무 113테이블을 모두 비운 다음 테스트 workspace만 다시 만들었으며, 준비 상태 47개 feature와 migration-history 항목(총 48개 논리 항목)을 통과했다. PostgreSQL은 보호된 Unix socket만 사용하고 Hub 19441, Engine 19442, prefix proxy 19443, PostgREST 19444를 모두 127.0.0.1에 바인딩했다. proxy는 `/rest/v1` prefix를 제거하고 HTTP를 실제 PostgREST로 전달하기만 한다. 합성 API 응답·가짜 저장 어댑터는 사용하지 않았다.

PostgREST는 [공식 v14.18 release](https://github.com/PostgREST/postgrest/releases/tag/v14.18)의 배포 바이너리이며 GitHub asset SHA-256 `e38374c68b927c565b62eebfd32f7b3ce4fe8801cac41c21565a1ce7dbac85b6`과 일치했다. 전역 패키지는 설치하거나 바꾸지 않고 기존 PostgreSQL의 libpq를 해당 프로세스에만 지정했다. 운영 자격·외부 Integration·AI 자격은 주입하지 않고 모두 신규 로컬 자격을 생성했다. 앱 fetch/http 및 브라우저의 외부 네트워크 요청도 차단했다. 로컬 SQL 외부 호출 관련 함수와 foreign server는 0, 확장은 plpgsql/uuid-ossp/pgcrypto뿐이었다. 차단된 서버 요청은 Next 개발 서버의 npm 버전 확인이며 브라우저의 외부 요청은 0이었다.

| 흐름 | 실제 UI 경로와 응답 | DB 및 재조회 근거 | 결과 |
| --- | --- | --- | --- |
| 할 일 | 내 작업 → 제목 입력 → Enter. Hub→Engine→PostgREST HTTP 201 / saved | UUID에 해당하는 tasks 행 정확히 1개. 새로고침 뒤 ‘나중’ 필터에서 동일 제목 표시 | 통과 |
| 연락 기록 | 테스트 고객 등록 → 연락 기록 → 요약·긍정 반응·다음 약속·내일 선택 → 저장. contact-outcome HTTP 200 / saved, 이어지는 followups 저장도 saved | crm_activities 정확히 1개. 해당 lead와 연결되고 요약·통화·긍정이 일치. lead의 next_action과 2026-10-24 약속 날짜, last_touch_at 저장. 새로고침 뒤 목록에서 동일 약속·반응 표시 | 통과 |
| 메모 | 메모 남기기 → 두 줄 원문 입력 → 메모 저장. HTTP 200 / saved, revision 1 | journal_entries 정확히 1개, 원문·줄바꿈 동일. journal_workflow_receipts 1개, saved 및 entry ID 일치. 브라우저 완전 종료 후 새 브라우저·새 로그인 세션에서 원문 동일 | 통과 |
| 응답 유실 복구 | 두 번째 task를 실제 서버에 저장시킨 후 클라이언트 응답만 차단 → 불확실 안내 → 같은 탭 새로고침 → ‘이전 요청 확인’ | 최초 201 / saved, 재확인 200 / duplicate, UUID 동일. 해당 task 행은 1개이며 전체 tasks는 정상 생성 1개+복구 생성 1개로 정확히 2개 | 통과 |

task 저장은 별도 mutation_receipts 행을 만들지 않는 기존 PMS 계약이다. 같은 객체 UUID로 실제 저장 결과를 읽어 duplicate를 확인했다. 반면 메모는 journal_workflow_receipts의 저장 응답까지 대조했다. 연락의 activityId·entityId 응답과 실제 관계를 확인했으며 연락 활동은 중복되지 않았다. 서로 다른 영수증 계약을 모두 같은 receipt 테이블 검증으로 표현하지 않는다.

| 화면 검사 | 근거 | 결과 |
| --- | --- | --- |
| 페이지 식별 | /dashboard/work/my, /dashboard/revenue/customers, /dashboard/work/memos 및 title Moonlight | 통과 |
| 빈 화면·프레임워크 오류 | 실제 업무 영역·입력·저장 후 기록이 보임. 보존한 3개 재조회 screenshot을 직접 확인 | 통과 |
| 콘솔 | 최초 세션 error/warn 0, 모든 관측 세션의 pageerror 0. 응답 유실 주입은 의도한 네트워크 실패로 분리 | 통과 |
| 저장 상호작용 | 실제 UI 입력·클릭·Enter 이후 서버 응답과 PostgreSQL을 교차 확인 | 통과 |
| 복구 | 브라우저 재시작 메모 복구, 같은 탭 재시작 후 task 동일 ID 재확인 | 통과 |
| 외부 실행 제한 | 운영 자격 없음, 외부 egress 차단, 모델·외부 발송 미실행 | 통과 |

에이전트가 관찰한 조작 수다. 사람 실사용의 시간·인지 부담·학습성을 대신하지 않는다. 화면에 도착한 뒤 할 일 저장까지 입력 1회+Enter 1회, 메모 저장까지 열기+입력+저장 3회였다. 연락 기록은 이미 선택된 고객에서 열기·요약·반응·다음 약속·날짜·저장 6회였고, 이번 빈 DB에서는 고객 최초 등록 3회가 별도로 필요했다. 인증·내비게이션·검사용 새로고침은 저장 조작 수에 섞지 않았다.

기한 없는 할 일은 저장 직후 약 2.6초 동안만 기본 ‘전체 기한’ 목록에 예외적으로 보이고, 이후 ‘나중’ 필터에서 찾는 현행 계약을 관찰했다. 검사에서는 저장 안내의 ‘보기’와 새로고침 후 ‘나중’ 필터를 사용해 확인했다. 저장 실패는 아니지만 처음 보는 사용자는 저장됐다는 안내와 빈 기본 목록을 함께 볼 수 있는 사용성 부담이다. Q120의 무기한 분리 계약이 있으므로 이번 검사에서 임의로 변경하지 않았다. 후속 `050e12f4`는 저장 안내의 ‘보기’를 해당 기한 렌즈로 이동하도록 수정했다. Production 390/1440px에서 강조 표시가 사라진 뒤와 새로고침 후에도 선택한 항목이 남는 것을 확인했다([현재 통합 근거](evidence.json), savedTaskViewNavigation). 원래 Q120 분류 자체는 유지한다.

새 브라우저 세션에서 고객 상세의 ‘연락 기록’을 처음 열고 실제 요약 입력이 보이며 editable임을 확인하기까지 277ms였다. 실제 텍스트 입력도 수용했다. 로컬 Next 개발 서버에서 얻은 n=1 관측이며 운영 지연, 완전한 자원 cold start, 사람의 기록 작성 시간으로 일반화하지 않는다. 최초 검사 중 URL 대기 패턴과 자동 전환되는 dialog를 기다리는 하네스 timeout이 있었으나, 실제 로그인/저장 성공 응답과 UI를 확인해 검사 조건을 바로잡았다. 이를 앱 오류로 집계하지 않았다.

SQL 검증은 2026-10-23 00:34:30 KST에 모두 통과했다. 기존 보안 백업 archive SHA-256은 변하지 않았다. 00:35:39 KST에 전용 브라우저·Hub·Engine·PostgREST·PostgreSQL을 종료했고 19441~19444가 닫혔으며, 임시 DB·로컬 자격·runtime 디렉터리를 삭제했다. 별도 worktree도 변경 없는 상태에서 제거했다. 타 세션의 3037/3038 및 다른 프로세스는 건드리지 않았다. 정제한 근거와 로컬 생성 자료의 screenshot만 0700 디렉터리/0600 파일로 남겼다.

SQL 결과 요약은 [local-roundtrip.json](local-roundtrip.json)에 보존했다. 원본 근거는 [정제된 결과 디렉터리](/tmp/moonlight-quality-20261022/local-roundtrip-evidence)에 있다. `ui-report.json`은 실제 조작·응답·복구 관측, `sql-verification.json`은 행 수·내용 일치·영수증 검증, `task-response-recovery.json`은 saved→duplicate/같은 ID, `cold-contact-input.json`은 입력 준비 시간, `cleanup.json`은 종료·삭제 확인이다. 환경 버전과 바인딩은 [환경 기록](/tmp/moonlight-quality-20261022/local-roundtrip-environment.json)에 별도 보존했다.

이 결과는 실제 저장 왕복과 불확실 응답 복구의 근거 공백을 줄인다. 실사용 효용, 장기 누락률, 인지 에너지 절감, 다중 사용자 경쟁, 모바일 쓰기, 모든 오류 경로, 배포된 운영 write 경로를 인증하지 않는다. Production 인증 경계와 운영 DB 17.11 상태는 별도의 기존 검사 근거를 사용해야 한다. 이번 환경은 17.10/개발 모드이고 캘린더 등 외부 연결은 의도적으로 Preview였다. 전체 품질 목표 점수를 이 네 건만으로 보장하지 않는다.
