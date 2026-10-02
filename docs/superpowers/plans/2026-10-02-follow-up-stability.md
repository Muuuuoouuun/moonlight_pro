# 추가 성능·안정성 개발 기록

CMac 통합·보안 패치 검증을 마친 `90ed9be2`에서 이어서 점검했다. 범위는 제품 조회·저장, Studio AI 템플릿, 리서치함, 발행 성과 조회, 작업·자동화·캠페인·개요 원장의 반복 날짜 변환이다. 제품 기능·권한·운영 DB 스키마는 변경하지 않았다.

## 재현 및 수정

### 리서치함과 발행 성과

- 이전 조회가 최신 새로고침을 덮어쓰거나, 이전 요청의 실패가 최신 성공을 오류로 바꾸는 경합을 재현했다.
- 요청별 소유권과 취소, unmount 정리, Strict Mode 첫 요청의 전송 전 취소를 적용했다. 리서치 저장 응답도 화면을 떠난 후 알림·재조회·상태 변경을 실행하지 않는다.
- HTTP 결과와 read 봉투를 함께 검증한다. malformed/error 응답은 명시적 오류가 되고, preview/error에 딸린 업무 행은 표시하지 않는다. 리서치 partial 상태는 유지한다.
- 리서치 브랜드는 기존 공용 카탈로그 구독을 사용한다. 발행 성과는 서버의 서울 기준 기본 연도를 사용해 클라이언트 시간대에 따른 연말 오차를 없앴다.
- 실제 페이지의 JSX 이전 로직을 제어된 React 생명주기 어댑터에서 실행했다. 최초 14개 중 13개 실패를 확인한 뒤 14개 모두 통과했다. 이는 실제 브라우저 React 렌더러에서의 경합 측정과는 구분한다.
- 독립 리뷰에서 추가로 리서치 생성-초기 GET 경합, 생성 후 unmount, 전송 시작 후 두 화면의 Strict Mode 재실행을 확인했다. P1/P2 발견 없음.

### AI 템플릿

- 저장한 revision 2가 저장 전 GET의 revision 1로 되돌아가고, 삭제한 행이 다시 나타나는 문제를 재현했다.
- 인스턴스 내 중복 조회 합류, 이전 읽기 취소, 저장·삭제 후 전체 목록 재조회, 오래된 duplicate 응답 보호를 적용했다. conflict 뒤 새로고침도 이전 조회에 합류하지 않는다.
- GET 헤더·본문 대기는 15초로 제한하고, 취소를 무시하는 응답도 화면 상태를 바꾸지 못하게 했다. POST의 기존 서버 결과 계약은 유지했다.
- 신규 회귀 16개 및 관련 검증 통과. 독립 리뷰의 훅·저장소 검증 20개 통과, P1/P2 발견 없음.

### 제품 조회와 생성 재시도

- 제품 목록은 GitHub 상태 요청과 독립적으로 표시한다. 더 늦게 도착한 이전 목록은 최신 목록을 덮어쓸 수 없고, 화면을 떠난 뒤 후속 조회·알림을 실행하지 않는다.
- 제품·문의 제품·GitHub 상태 조회와 제품 write의 헤더·본문 대기를 15초로 제한한다. GitHub sync는 60초다. 호출자 취소는 AbortError로 구분하며 timeout·불명확한 저장 결과를 성공으로 표시하지 않는다.
- 같은 생성 폼의 수동 재시도는 제품 ID뿐 아니라 기능·요구사항 ID와 요청 본문 전체를 재사용한다. 보존 범위는 열린 편집 세션이다. Engine의 duplicate 판정이 details 전체를 비교하지 않으므로 ID만 고정하는 것으로는 충분하지 않았다.
- 결과 미확정 뒤 폼을 바꿨다면 원 생성 receipt를 먼저 확인하고 기존 제품 편집 상태로 전환한다. 수정한 입력을 보존하며 운영자가 다시 카드 저장을 눌러 반영한다. 소속은 서버 계약상 수정 불가이므로 처음 확정된 소속을 유지하고 안내한다. 자동 write 재시도는 없다.
- 독립 리뷰에서 저장 응답 유실 → 재시도 401/preview/conflict → 다시 저장 시 새 ID로 중복 생성되는 경계를 추가로 발견·재현했다. 한 번이라도 결과가 미확정이었던 요청은 이후 거절만으로 초기화하지 않도록 수정했다. 최초 확정 거절은 입력을 고쳐 새 명령을 보낼 수 있다.
- 제품 client·페이지 관련 독립 검증 35개 통과, 남은 P1/P2 발견 없음. 저장 경합은 제어된 transport에서 검증했으며 실제 운영 DB에 제품을 만들지 않았다.

### 원장 날짜 변환

행마다 생성하던 고정 locale/timeZone의 날짜 포맷터 7개를 처음 사용할 때 생성해 재사용한다. null/invalid 처리, 예외 fallback, preview 동작을 유지한다.

300행 실제 소스 매퍼에 합성 입력을 넣어 5회 warmup 후 30회 교차 측정한 UTC 환경 중앙값:

| CPU 변환 구간 | 이전 | 이후 |
| --- | ---: | ---: |
| 작업 `mapDecisions` | 7.845 ms | 0.158 ms |
| 자동화 `mapRuns` | 15.958 ms | 0.580 ms |
| 캠페인 `mapCampaign` | 7.678 ms | 0.215 ms |
| 개요 `mapProjectDomain` | 14.791 ms | 0.385 ms |

이는 DB·네트워크·화면 전체 속도 수치가 아니다. UTC와 Asia/Seoul 환경 각각 날짜 경계·invalid 21조건, 전체 매핑 결과, 포맷터 생성 실패 시 출력의 동등성을 확인했다. 기존 저장소 테스트는 각 환경 43개 통과했다.

측정 스크립트 및 원시 결과는 `/tmp/moonlight-read-model-cpu-1002/bench.mjs`, `current-UTC.json`, `current-Asia-Seoul.json`에 있다. `TZ=UTC node /tmp/moonlight-read-model-cpu-1002/bench.mjs --current`로 재실행할 수 있다. 임시 작업 트리 정리 후에는 같은 소스가 통합된 `moonlight_pro-speed-stability-1002`를 기본 경로로 읽도록 스크립트 경로만 갱신했다. 원래 측정 결과는 덮어쓰지 않았다.

## 최종 통합 검증

코드 최종 통합 커밋 `de7e68e3`에서 root tests와 웹 빌드를 실행했다. Desktop·typecheck·contracts·ClassIn·audit는 변경된 제품 파일과 무관한 입력이 동일한 직전 통합 상태에서 통과했다.

| 검증 | 결과 |
| --- | --- |
| `npm test` | 3,927 tests / 3,914 pass / 0 fail / 13 DB 연결 의존 skip |
| `npm --workspace @com-moon/desktop test` | 346 pass / 0 fail |
| `npm run typecheck` | 4 successful tasks, 기존 입력 캐시 사용 |
| `npm run check:contracts` | 통과 |
| `npm run check:classin` | 통과 |
| `npm run build -- --filter=@com-moon/hub --filter=@com-moon/engine` | 2 successful tasks, Hub 새 빌드·Engine 기존 입력 캐시 사용 |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `git diff --check` | 통과 |

로그: `/tmp/moonlight-followup-{test,desktop-test,typecheck,contracts,classin,build,audit}.log`. 원래 페이지 회귀 실패 로그는 `/tmp/moonlight-content-page-reads-baseline-red.log`, 수정 후 로그는 `/tmp/moonlight-content-page-reads-green.log`에 있다.

실제 브라우저는 운영 환경 변수 없는 `127.0.0.1:3127`과 별도 `.next.qa-develop-1002`에서 확인했다. 리서치함의 연결 상태·추가 드로어·저장 비활성화, 발행 새로고침·원고 작성 전환, Studio AI 템플릿 펼침·연결 안내, 제품 포트폴리오·문의함 전환을 확인했다. 최종 제품 변경을 반영한 새로고침 이후에도 정상 렌더링하며 콘솔 warning/error 0건이었다. 저장 경합과 실제 업무 행은 제어된 테스트로 검증했고, 브라우저에서 운영 쓰기를 실행하지 않았다. 이번 변경은 native/Windows/Android 소스를 바꾸지 않았으며 해당 패키징·실기기 실행은 다시 하지 않았다.

추가 커밋:

- `247613aa`: 리서치·발행 조회 소유권과 14개 회귀 테스트.
- `429ed597`: AI 템플릿 생명주기와 16개 회귀 테스트.
- `2871defa`: 네 원장의 고정 날짜 포맷터 재사용.
- `de7e68e3`: 제품 I/O 제한·조회 독립화·미확정 생성 요청 보존과 회귀 테스트.

이전 CMac 통합 원본 `42d12e4c`는 계속 통합 브랜치의 조상이다. 결과는 `/Users/bigmac_moon/dev/moonlight_pro-speed-stability-1002`의 `codex/speed-stability-1002`에 보존한다. 메인 `10.bigmac2.0`의 `6ed72d09`와 기존 미커밋 파일은 그대로다. 병합한 보조 작업 트리 3개는 정리했고, 브랜치·커밋은 남겼다. 임시 브라우저와 검증 서버를 종료했다. push·배포·운영 마이그레이션은 수행하지 않았다.

## 후속 요청: 메인 작업 폴더에 병합

운영자의 “끝나면 워크트리도 병합 시켜줘” 요청에 따라 `/Users/bigmac_moon/dev/moonlight_pro`의 `10.bigmac2.0`을 `6ed72d09`에서 `4fa0b3af`로 fast-forward했다. 이 절은 위의 작업 트리 보존 상태를 대체하는 후속 기록이다.

병합 전에 메인의 미커밋 15파일과 미추적 2파일을 별도 백업하고, 파일별 3-way 결과를 사전 확인했다. `DESIGN.md`는 기존 프로젝트 완료 묶음 결정과 새 위젯 결정을 모두 보존했다. `daily-brief.jsx`는 기존 navigation prop·컴팩트 일정 구성과 새 ClassIn Guru 판정·추천 목록을 함께 보존했다. 나머지 파일은 자동 복원됐고, 17파일 전부 검토한 합본과 일치함을 바이트 단위로 확인했다. 기존 변경은 커밋하지 않고 모두 원래처럼 unstaged/untracked 상태로 남겼다. 충돌과 staged 항목은 없다.

`npm install --ignore-scripts`로 메인 의존성을 갱신했으며 package-lock 변경은 없다. 병합된 코드와 기존 미커밋 수정이 함께 있는 메인 작업 폴더에서 다시 검증했다:

- Root: **3,929 tests / 3,916 pass / 0 fail / 13 DB 연결 의존 skip**. 기존 미커밋 테스트 두 건도 포함된다.
- Desktop: **346 pass / 0 fail**.
- Typecheck: 4 successful tasks(Engine 새 실행, 나머지 입력 캐시).
- Hub·Engine build: 2 successful tasks, 모두 새 빌드.
- Contract 검사 통과, production dependency audit 0 vulnerabilities.
- 로그: `/tmp/moonlight-main-merge-{install,test,desktop,typecheck,build,contracts,audit}.log`.
- 기존 `project-index-order.test.mjs`의 EOF 빈 줄 경고는 원본에도 있으며 이 병합에서 수정하지 않았다.

원본·패치·복원 합본·파일 해시는 `/var/folders/l6/tx5c_hw97452y83gkpgpnxcr0000gn/T/moonlight-main-merge-20261002-b_0amlbn`에 보관했다. 최종 기록까지 메인에 병합한 뒤 완료된 speed-stability 작업 트리와 작업 브랜치를 정리한다. 원격 push·배포는 수행하지 않는다.
