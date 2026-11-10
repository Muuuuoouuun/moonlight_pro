# 문라이트 탭별 로직·사용성 검수 — 2026-10-27

기준: `ade8e4abbb6f4a7843add68b78e38c0bf4cfd0cf` (PR55 병합 후 main). 작업 브랜치: `codex/tab-flow-audit-20261027`. 이번 후속 요청의 결과는 로컬 커밋만 준비한다. 원격 push·PR·merge·배포는 실행하지 않았다.

## 검수 방법과 범위

- 실제 `hub-nav`와 `PAGE_MAP`에서 12개 앵커(주요 10 + 유틸리티 2), 쿼리/소속 변형 포함 내비 경로 64개·마운트 경로 58개를 추출했다. 합집합 74경로를 1440×1000 / 390×844에서 열었다. 전 경로 렌더 성공, pageerror 0, 모바일 문서 너비 390px. 이 전수 검사는 연결 없는 Preview의 읽기·빈 상태 smoke이며 모든 업무 저장을 검증했다는 뜻은 아니다.
- 변경 동작은 실제 Playwright 렌더와 실제 JSX callback/effect를 실행하는 통제 하네스로 분리 검증했다. 브라우저의 모든 외부 호스트와 실제 쓰기는 차단했다. 테스트 POST는 합성 응답·응답 유실·지연 gate로 대체했다. 운영 데이터, 모델 생성, 발송, 결제, OAuth 변경은 사용하지 않았다.
- 별도 baseline worktree에서 수정 전 폐기/저장 실패/월 전환/리서치 경합을 재현했다. 기존 공유 체크아웃 및 다른 작업자의 변경은 수정하지 않았다.
- 실행 기능과 보류 표면을 구분했다. 기능 게이트와 기존 홈·오늘·현황·프로젝트 구조는 변경하지 않았다.

## 탭별 확인

| 앵커 / 실제 탭 | 목적·출처와 확인한 시나리오 | 결과·검증 수준 |
|---|---|---|
| 홈 / 홈·보고서 | Home 판단 요약, 보고서 원장; 동일 정보 링크·기간/소속·실패/빈 상태 | 코드·기존 회귀·desktop/mobile Preview 렌더. 보고서 생성은 실제 운영 미실행 |
| 오늘 | Daily brief·Task·후속 연락·하루 리뷰 연결; 날짜/시간대·실패 봉투 | 코드·기존 회귀·렌더. 외부 일정/연락 실행 미실행 |
| 현황 / 목표·집계·OKR·KPI | 목표 원장/집계; scope 변경 뒤 현재 보기 유지 | 집계→ClassIn 전환 실제 렌더 확인. 목표·측정 계약 회귀 포함 |
| 내 작업 / 실행 목록·메모·하루 리뷰·OKR·KPI | Task·journal·daily-review 읽기·필터·재진입 | 코드·기존 회귀·렌더. 실제 개인 기록 작성 없음 |
| 영업·매출 / 오늘 연락·고객·거래·문의 | Revenue·활동·문의 원장; New/딥링크, scope, 저장→갱신, 늦은 실패, duplicate 복구 | 고객 New 반복/개인 scope·문의 재시도→분류 변경→명시 저장을 desktop/mobile 렌더 검증. 연락 초안 입력창 렌더, 늦은 실패·캐시 경합은 실제 JSX 하네스 |
| 개인 현금 흐름 / ClassIn 세그먼트 | 범위별 금융/고객 분류; 원장 출처·기간·필터 | 코드·관련 회귀·Preview 렌더. 금융 반영/실제 세그먼트 쓰기 없음 |
| 기회 탐색 | 기회 원장·후보·연결 동선 | 코드·기존 회귀·렌더. 생성 미실행 |
| 프로젝트 / Projects·Calendar·Roadmap·Decisions·Rhythm | Work·프로젝트·캘린더·루틴 원장; 편집 폐기/저장/재조회·New 반복 | 결정/루틴 입력→폐기→재진입 실제 렌더. Calendar 중복 잠금·불확정/권한 분기는 실제 callback 시험. 실제 일정 쓰기 없음 |
| 제품 / 내부 개발·포트폴리오·제품 상세 | 제품 원장·월 숫자·프로젝트·문의 | 월 숫자 두 달에 각기 입력→왕복, 모바일 dark 렌더에서 두 값 보존. 저장 실패·재조회는 실제 JSX 시험 |
| 브랜드 / 브랜드 목록·컨텐츠 로그 | 브랜드/정체성·콘텐츠 기록 | 새 브랜드 입력→preview 저장 응답→입력 유지 실제 렌더. 로그/정체성 관련 회귀·렌더 |
| 콘텐츠 / 성과·리서치함·뉴스 탐색·소재·제작·원고 작성·발행·Campaigns | Content·research·campaign 원장; 선택 주소·초안·저장/재조회 경합 | 리서치 POST 대기→다른 자료 이동→완료후 버튼 해제, 캠페인 saved→늦은 초기GET도 카드 유지 실제 렌더. 원고 게시/수집/모델 준비 미실행 |
| AI·자동화 / 오피스·작업·실행·코칭·대화·브랜드 자문·자동화 개요·Runs·Flows·Email·Webhooks·Sheets | Office/실행 원장·persona·자동화/연결 상태 | Council 대기중 입력·잠금, Webhooks pending, Sheets 부분 실패/집계 미확인/모바일 dark 잠금 실제 렌더. Flows 준비중 표시. 실제 모델/발송/동기화 미실행 |
| 설정 / Settings·Evolution | 환경·사용량·연결 설정; Evolution Preview | 코드·기존 회귀·렌더. credential/보안 설정·로그아웃·연결 변경 없음 |

## 수정한 문제

1. 고객 화면을 유지한 채 받은 New·검색·고객 딥링크를 반복 소비하도록 수정했다. 읽기 오류 때 딥링크를 소거하지 않아 재시도 후 열 수 있다.
2. 영업·매출 New가 개인/ClassIn/all 범위를 잃지 않게 하고 ClassIn 거래에서도 생성창으로 이동한다. 현황 집계의 scope 변경도 집계를 유지한다.
3. 거래 저장·단계·예상일·결제·정기·숨김·삭제 확인 후 공유 원장을 새로 읽는다. 이전 GET을 무효화하며, 로딩의 빈 스냅샷이 다른 거래 편집창을 지우지 않게 했다.
4. 결정·루틴에서 버리고 닫으면 편집 이전 값으로 돌아간다. 저장 실패는 유지하며, 정상 재조회 후에는 저장 임시값이 최신 원장을 가리지 않는다. 같은 탭의 두 번째 New도 처리한다.
5. Calendar 생성은 동기 잠금으로 같은 render의 중복 호출을 막는다. 네트워크/5xx/잘못된 봉투는 저장 여부 미확인으로 안내하고 다시 읽기를 제공한다. 권한·입력 거절과 구분한다.
6. 제품의 월별 숫자 초안을 제품·월별로 보존해 비교 월 왕복/재조회/실패 재시도 때 입력이 사라지지 않는다.
7. 브랜드 생성 preview가 저장 성공으로 창을 닫지 않는다. 공용 편집기도 preview를 로컬 반영이라고 표현하지 않고 저장되지 않음과 입력 보존을 알린다.
8. 리서치 query 변경은 읽기만 취소하고 쓰기 완료/잠금 해제를 무효화하지 않는다. 완료 후 현재 주소를 다시 읽으며, 새 자료 생성 후 기존 자료 주소를 새 자료로 바꾼다.
9. Campaigns의 확정 생성 후 기존 공유 캐시 세대를 무효화하고 로딩 중 카드를 유지한다. 새 캠페인 주소를 반영한다. 생성 응답 불확정은 먼저 목록 확인을 요구하고, 읽기 실패/부분/Preview를 빈 성공과 구분한다.
10. 연락 요약의 늦은 실패는 별도 복구 보관으로 남겨 다음 초안을 덮지 않는다. 원래 채널/본문/약속/시각을 보존하며, 불확정 결과는 최근 기록 확인 후 같은 입력을 재전송하게 한다. 명확한 4xx 거절은 바로 재시도할 수 있다.
11. 문의 재시도의 duplicate가 현재 유형·업무 구분까지 저장했다고 오인하지 않는다. 현재 입력을 유지하고 기존 문의에 버전 검사를 붙인 명시 변경 저장을 제공한다. 같은 render 중복 submit도 막는다.
12. Council 초기 자동 요청도 공통 busy 잠금을 사용하며 해당 요청의 pending 메시지만 교체한다. 대기 중 입력과 기존 메시지를 보존한다.
13. Sheets HTTP200 partial/단계 실패/알 수 없는 응답을 성공·0건으로 표시하지 않는다. 집계 null·이력 실패를 구분하고 모든 실행/재연결 버튼을 처리 중 잠근다.
14. Webhooks 동일 테스트 중복 전송을 막고 pending 상태를 노출한다. Flows는 미구현 캔버스라는 설명과 실제 자동화 개요로의 이동을 제공한다.

## 최종 검사

- `npm run lint`: 1,934개 소스 구문 guard 통과(semantic/style lint는 별도 제공되지 않음).
- `npm run typecheck`: workspace 4개 성공.
- `npm run build`: Hub·Engine·Desktop 3개 성공. 배포/설치는 하지 않음.
- 루트 `npm test`: **6,552개 중 6,517 pass / 20 fail / 15 skipped**. 20개 모두 임시 PostgreSQL의 `initdb`/서버 기동 시 `shmget(size=56): No space left on device`로 실패했다. macOS 공유 메모리 한계이며 커널 설정·다른 세션의 메모리 삭제로 우회하지 않았다. 이 20개는 DB 계약 검증 미완료이며 전체 suite 통과가 아니다.
- 캠페인 메타 저장 시험의 신규 캐시 의존성 주입 누락을 보완한 뒤 회귀가 해소됐다. 비 JSON 401 연락 실패도 확정 거절로 처리하는 회귀를 추가했다. 마지막 전체 실행의 비 DB 실패는 0이다.
- Desktop 별도 시험 **471/471 pass**, skipped 0.
- 통제 브라우저 16개 시나리오와 desktop 연락 늦은 실패 보존 추가 확인. 모든 최종 JSON이 completed, pageerror 0. 모바일 문서 너비 390px. 연락 첫 POST 지연→다음 초안 입력→400 실패에서도 다음 초안과 이전 실패 사본이 각각 유지된다.
- `git diff --check` 통과. 원격 CI는 새 요청의 공개 금지에 따라 실행하지 않았다. 이 결과는 후속 오늘/프로젝트 UX 작업 전의 로컬 체크포인트다.

## 남은 제한·후속 검토

- Calendar 생성과 연락 요약 RPC에는 서버의 안정 요청 ID/receipt가 없다. 이번 변경은 동시 중복과 불확정 재시도 혼동을 줄였지만 응답 유실 뒤의 근본 멱등성을 해결하지 않는다. DB/API 계약·migration 변경은 하지 않았다.
- Decisions 수정의 서버 버전 비교가 없어 두 창의 동시 편집이 서로 덮을 수 있다. 별도 서버 계약 검토가 필요하다.
- Rhythm의 프로젝트 필터·캐시 만료 상태에서 저장 후 재조회 실패가 행을 비우는 기존 경계가 남는다. 이번 ACK 보존 시험은 캐시가 남아 partial로 전환되는 경우다.
- 레거시 Leads·Cases 경로의 저장 후 공유 캐시 갱신 누락, 과거 대화 목록의 실제 복원, 브랜드 자문의 이어서 맥락 전달, Webhooks 행별 테스트 대상 계약은 수정하지 않았다. 미완성 표면을 구현된 기능처럼 보고하지 않는다.
- 운영 OAuth/권한/외부 장애·실제 저장·발송·게시·모델 품질은 검증하지 않았다. 모바일은 Chromium viewport 검수이며 실제 iOS/Android·OS 키보드 검증을 대신하지 않는다.
- 기존 Vercel 상세 조회 403은 재시도하거나 우회하지 않았다. 이번 작업에서 새 승인 거부·불확실한 외부 쓰기는 없었다.

## 검수 증거

작업 폴더의 `../tab-evidence/`: `tab-inventory.json`, `route-scan.json`, `before-behavior.json`, `after-behavior.json`, `before-extra.json`, `after-extra.json`, `advanced-behavior.json`, `crm-behavior.json`과 전후 PNG. 합성 고객/브랜드/제품/리서치/문의는 브라우저 요청 가로채기와 테스트 하네스에서만 사용했으며 실제 원장에 쓰지 않았다.

핵심 PNG: `after-brand.png`, `after-decision.png`, `after-rhythm.png`, `after-sheets.png`, `after-month-mobile-dark.png`, `after-research-mobile-dark.png`, `after-inquiry-390.png`, `after-contact-390.png`, `after-campaign-desktop.png`, `after-council-desktop.png`.

브라우저 스크립트는 `/tmp/moonlight-tab-{scan,behavior,extra,advanced,crm-ui}.cjs`, 실행 로그는 `/tmp/moonlight-tab-*.log`, 최종 자동 검사 로그는 `/tmp/moonlight-tabs-final-{lint,types,tests,build}.log`, Desktop 로그는 `/tmp/moonlight-tabs-desktop.log`다. 증거는 로컬 검수용이며 원격에 공개하지 않았다.

## 실제 경로 목록

쿼리·소속 변형과 기존 직접 접근 경로를 포함한다. 현재 내비 탭과 보류/레거시 직접 경로는 같은 의미가 아니다.

```text
/dashboard/agents/chat
/dashboard/agents/council
/dashboard/agents/office-council
/dashboard/agents/office-request
/dashboard/agents/orders
/dashboard/automations
/dashboard/automations/email
/dashboard/automations/flows
/dashboard/automations/runs
/dashboard/automations/sheets
/dashboard/automations/webhooks
/dashboard/brand/projects
/dashboard/brand/queue
/dashboard/brand/studio
/dashboard/brands
/dashboard/brands/log
/dashboard/brands/log?scope=classin
/dashboard/brands/log?scope=personal
/dashboard/brands?scope=classin
/dashboard/brands?scope=personal
/dashboard/classin/accounts
/dashboard/classin/automations
/dashboard/classin/cohorts
/dashboard/classin/content
/dashboard/classin/pipeline
/dashboard/classin/projects
/dashboard/classin/revenue
/dashboard/classin/segments
/dashboard/content/campaigns
/dashboard/content/news
/dashboard/content/performance
/dashboard/content/publish
/dashboard/content/queue
/dashboard/content/research
/dashboard/content/studio
/dashboard/daily-brief
/dashboard/discovery
/dashboard/discovery?scope=classin
/dashboard/discovery?scope=personal
/dashboard/evolution
/dashboard/home
/dashboard/overview
/dashboard/overview?view=goals&scope=all
/dashboard/overview?view=goals&scope=classin
/dashboard/overview?view=goals&scope=personal
/dashboard/overview?view=summary
/dashboard/products
/dashboard/reports
/dashboard/revenue/accounts
/dashboard/revenue/cases
/dashboard/revenue/cashflow
/dashboard/revenue/cashflow?scope=personal
/dashboard/revenue/customers
/dashboard/revenue/customers?scope=classin
/dashboard/revenue/customers?scope=personal
/dashboard/revenue/deals
/dashboard/revenue/deals?scope=personal
/dashboard/revenue/followups
/dashboard/revenue/heatmap
/dashboard/revenue/inquiries
/dashboard/revenue/inquiries?scope=classin
/dashboard/revenue/inquiries?scope=personal
/dashboard/revenue/leads
/dashboard/revenue/overview
/dashboard/settings
/dashboard/work/calendar
/dashboard/work/daily-review
/dashboard/work/decisions
/dashboard/work/goals
/dashboard/work/memos
/dashboard/work/my
/dashboard/work/projects
/dashboard/work/rhythm
/dashboard/work/roadmap
```
