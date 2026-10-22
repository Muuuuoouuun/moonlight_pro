# 모바일 production 저장 왕복 검증 — 2026-10-23

기준 소스는 `caa200cf10465cca2e2f9fe86014e88c3fc07ebc`다. 격리한 Next.js **production build** Hub/Engine을 Chromium 390×844 CSS px, touch/mobile 에뮬레이션으로 조작했다. 실제 휴대폰·가상 키보드·사람 사용자의 인지 효과를 검증한 결과는 아니다. Browser 전용 스킬이 없어 설치된 Playwright를 사용했다.

검증 완료 보안 백업을 별도 PostgreSQL 17.10에 복원하고 public 업무 113테이블을 비운 뒤 로컬 workspace 한 행만 만들었다. 원래 archive는 읽기 전용으로 사용했고 전후 SHA-256은 동일하다. 공식 PostgREST 14.18 macOS arm64 배포의 SHA-256을 GitHub 공식 asset digest와 대조했다. 실제 PostgREST가 모든 REST 저장을 수행한다. localhost prefix proxy는 `/rest/v1`만 제거하며 합성 응답을 만들지 않는다. 코드·운영 데이터 수정은 없다.

운영·AI·외부 integration 자격은 주입하지 않았다. 모든 자격은 신규 로컬 값이다. PG는 보호된 Unix socket만 사용하고 Hub/Engine/proxy/PostgREST는 127.0.0.1의 19451~19454에만 바인딩했다. 앱 fetch/http 및 브라우저 외부 egress 차단, DB 외부 호출 관련 함수 0·foreign server 0을 확인했다. 확장은 plpgsql/uuid-ossp/pgcrypto뿐이다. 이번 실행의 차단된 외부 요청도 0이다. 최초 준비 검사 47/47 통과, 업무 테이블은 모두 비었으며 workspace만 1행이었다.

| 흐름 | UI 확인 | 실제 DB 대조 | 결과 |
| --- | --- | --- | --- |
| 할 일 생성·보기·재발견 | 제목 입력→Enter 저장→안내의 보기→새로고침→나중 필터에서 동일 제목 | 처음 todo 1행, 이후 완료 조작 후 같은 ID done 1행 | 통과 |
| 할 일 완료·Undo | 첫 항목 완료 후 지연 저장; 별도 항목에서 완료→즉시 되돌리기 | 첫 항목 done, Undo 항목 todo, 추가 버튼 검증 항목 todo. 전체 3행, 중복 없음 | DB 취소 통과·빠른 Undo UI 결함 발견(아래) |
| 할 일 저장 버튼 | Enter 외에도 실제 저장 버튼 tap으로 저장 | POST /api/hub/tasks 201 saved, 해당 ID 1행 | 통과 |
| 연락 요약·다음 행동·날짜 | 고객 등록→연락 기록→요약·긍정·다음 행동·내일→저장→새로고침 | lead 1행, 연결 crm_activity 1행, 요약/통화/긍정 일치. next_action 및 2026-10-24 일치, last_touch_at 저장 | 통과 |
| 두 줄 메모·재로그인 | 두 줄 입력→저장→브라우저 완전 종료→새 브라우저·새 로그인→동일 메모 열기 | journal 1행·revision 1, 원문/줄바꿈 동일, saved workflow receipt 1행의 entry ID 일치 | 통과 |

할 일은 별도의 mutation receipt 테이블을 만드는 계약이 아니므로 실제 ID/상태/행 수로 대조했다. 메모는 journal workflow receipt까지 대조했다. 연락은 activity와 lead의 관계·다음 행동을 대조했다. Undo는 완료 PATCH를 보내기 전의 지연 커밋 취소이며 저장 후 역변경을 주장하지 않는다.

대표 저장 조작 수(인증·경로 이동 제외, 에이전트가 수행한 한 경로): 할 일 2회(입력+Enter), 저장 안내 보기 1회, 새로고침 후 재발견 2회(새로고침+나중). 연락은 이미 선택된 고객 기준 7회(열기·요약·반응 띠 열기·긍정·다음 행동·날짜·저장), 빈 DB의 고객 등록 3회가 별도다. 메모 저장 3회(열기·두 줄 입력·저장), 새 로그인 뒤 기록 열기 1회가 별도다. 사람의 작성 시간·인지 비용·학습성을 나타내는 지표가 아니다.

| 모바일 주요 타깃 | 실측 | 가림·입력 확인 |
| --- | --- | --- |
| 첫 할 일 입력 | 높이44, 글자16px, x24/y409.5 | 첫 viewport 안, 중심 가림 없음 |
| 할 일 저장 버튼 | 68.7×44, x297.3/y409.5 | floating 메모와 겹치지 않음. 중심 hit test 및 실제 tap 저장 성공 |
| 저장 후 보기 | 45.9×44 | 첫 viewport 안, 중심 가림 없음 |
| 빈 고객 등록 | 90.6×44 | 첫 viewport 안, 중심 가림 없음 |
| 연락 요약/다음 행동 | 높이48, 글자16px | 각 입력 viewport 안, 중심 가림 없음 |
| 연락 저장 | 52.7×44, x324.3/y27 | 상단에 유지, 중심 가림 없음 |
| 메모 첫 진입 | 101.5×44 | 첫 viewport 안, 중심 가림 없음 |
| 메모 본문 | 340×110, 글자16px | 첫 viewport 안, 중심 가림 없음 |
| 메모 저장 | 70.6×44, x21/y786 | 첫 viewport 안, 중심 가림 없음 |

baseline의 할 일 Checkbox는 본체 14×14, ::before hit 영역 30×30으로 44px 기준에 미달했다. 본체 중심 tap은 실제 완료됐지만 중심 ±20px 모서리 4곳은 checkbox를 맞히지 못했다. 이 항목은 후속 통합 소스에서 수정됐으며, 아래 후보 검증·수정 후 production 재빌드 결과를 baseline과 구분한다.

일시적인 토스트가 viewport 아래의 새 항목/고객 상세 연락 버튼 중심을 가렸다. Playwright mouse click의 hover/자동 scroll 영향이 섞인 재시도 timeout이 있었으며, touch tap 경로에서는 알림이 사라진 뒤 진행 가능했다. 영구적인 저장 차단이나 데이터 손실로 확정하지 않았다. 키보드가 나타나는 실제 휴대폰의 가림은 이번 에뮬레이션으로 판정하지 않는다.

최초 `127.0.0.1` 로그인은 NextRequest의 localhost 정규화 때문에 production same-origin guard에서 403으로 차단됐다. 주소를 `http://localhost:19451`로 맞추고 동일 production 인증 경계를 통과했다. 자격/세션/Origin 우회는 하지 않았다. 최초 환경설정 실패의 console 403 1건과 하네스의 URL/응답 locator 대기 실패를 제품 저장 실패와 분리했다. 업무 흐름에서 관측한 pageerror는 0이며 실제 페이지 제목은 Moonlight, 원문 UI와 저장 후 내용이 표시됐다.

DB 최종 대조는 02:05:34 KST에 통과했다. 증거는 `ui-report.json`, `sql-verification.json`, `task-created-sql.json`, `task-complete-undo-sql.json`, `browser-write-responses.jsonl`, `initial-validation.json`, `egress-summary.json`과 PNG들에 있다. 디렉터리0700/파일0600이다. 업무 텍스트는 로컬에서 검증용으로 새로 만든 내용뿐이다.

## 후속 Checkbox 후보 — 원본 production build + 브라우저 CSS 주입

접근성 후보 `64569953`의 CSS만 브라우저에 주입했다. production 소스/빌드 자체에 통합된 검증으로 표현하지 않는다. 본체 14×14는 유지되고 ::before hit 영역은30→44px로 확대됐다. 마지막 행 중심 기준 ±21px 모서리 hit는 [좌상 true, 우상 true, 좌하 false, 우하 true]였다. 기존 Card의 radius14/overflow:hidden에 의해 좌하 외곽이 잘린다. 카드 외형을 변경하지 않는 현재 수정 범위의 한계다.

세 성공 모서리의 실제 touch는 해당 완료 동작을 열었다. 우하 모서리를250ms 누른 뒤 놓아도 동작했고, 180ms 이후 Undo는 행을 복원했다. 별도 항목의 오른쪽 중심+21px touch는 실제 PATCH200/saved까지 도달했으며 SQL 상태도 done으로 바뀌었다. Undo 시험 항목은 todo로 유지됐다. 기존 3개 task 총행수는 변하지 않았다. `checkbox-candidate.json`과 `checkbox-candidate-sql.json`이 증거다.

추가로 **기존 Undo 화면 race**를 확인했다. 원본 CSS로 새로고침한 뒤 완료→180ms 이내 즉시 Undo→300ms 대기 시 ‘완료 취소됨’이 보이지만 항목은 목록에서 사라진다. DB는 todo라 데이터 손실은 없고 새로고침하면 다시 나타난다. `my-work.jsx`의 취소되지 않는 STRIKE_MS timer가 나중에 hiddenIds를 다시 설정한다. CSS 후보의 회귀가 아니며 후속 e2cc44d8에서 수정했다. 이 관측 때문에 Undo를 UI/DB 전체 통과로 과장하지 않고, 위 표의 SQL 취소 성공과 구분한다. `undo-race-baseline.png`와 `checkbox-candidate.json.baselineUndoRace`가 근거다.

## Undo 수정 후 production 재빌드

원본 caa200cf 위에 `e2cc44d8`(행별 애니메이션 타이머 취소)와 `64569953`(Checkbox 터치 영역)를 적용한 전용 WT HEAD는 `212d68060a57b193f9dc466ec7cdfcb1ae4fab33`다. Hub를 실제 production으로 다시 빌드해 같은 격리 DB에 연결했다. 이 후속 검증에는 CSS 주입이나 API mocking을 사용하지 않았다. 부모 통합본 `2efb3c3d`와 관련 3파일의 내용 및 두 커밋 patch-id가 동일함을 확인했다.

100ms 이내의 실제 완료→Undo click 간격은 47.6/67.7/67.3ms 세 건이다. 모두300ms·3.6초 뒤 행이 계속 보이고, 해당 구간 PATCH는0회, SQL은 같은 ID 한 행 todo였다. 추가102.8/154.7ms도 동일하게 통과했다. 정상 완료는 실제44px 오른쪽 중심+21px touch로 실행했으며 PATCH가정확히1회, HTTP200/status saved, SQL done을 확인했다. pageerror는0이다. `undo-fixed-production.json`과 `undo-fixed-production.png`에 기록했다. 기존 빠른 Undo UI 결함은 이 재빌드에서 해소됐다. 마지막 행 외곽 좌하 코너 clipping 한계는 그대로다.

02:16:54KST 최종SQL에서 검증 task3개가 의도한 완료 상태이고, 연락·메모·영수증 각행수와 원문/날짜는 유지됐으며 원백업SHA도 불변이었다. 각 Undo 직후 todo 검증 결과는 별도 시간대 증거로 보존해, 마지막 정상완료 뒤 done 상태와 혼동하지 않는다.

02:16~02:17KST 전용Chromium·Hub·Engine·PostgREST·PostgreSQL을 모두 종료했다.19451~19454포트가 닫혔고 PostgreSQL pid파일이 없음을 확인한 뒤 보호된 임시runtime(DB·로컬키·다운로드바이너리 포함)를 삭제했다. 전용WT도 clean/통합patch동일을 확인한 후 제거했다. 브랜치와212d6806커밋은 보존했다. 부모3037와 다른 세션 프로세스는 건드리지 않았다. `cleanup.json`이 근거다.

## 범위와 남은 한계

대표3저장 흐름과 빠른Undo/정상완료를 로컬production·실제DB로 검증한 결과다. 운영write, 실제휴대폰 가상키보드, 사용자 인지효과, 장기 업무누락률, 모든 오류·동시성경로를 인증하지 않는다. 이번환경의PostgreSQL17.10과 운영17.11 차이도 남는다. 캘린더·AI·외부발송은 의도적으로실행하지 않았다. 체크박스의실제44px중심선은개선됐지만 둥근카드 외곽코너한곳clip을 숨기지 않는다.
