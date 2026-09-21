# 업무 안의 Eevee Office — 단계별 구현 계획

> 상태: **E0~E4 코드 구현·로컬 검증 / 운영 적용 대기**
> 날짜: 2026-09-21
> 설계: [업무 안의 C레벨 심화 설계](../specs/2026-09-21-eevee-office-embedded-workflow-deep-design.md)
> 승인 범위: 운영자의 “구현, 서브에이전트 동원”에 따른 E0~E4 구현. 운영 DB 변경·배포·실제 모델 품질의 완료와 구분한다.
> 기준: 기존 원장의 책임을 유지하고 계약·저장, 화면·Studio, 문서를 구분해 검토한다.

## 1. 착수와 공통 검증

코드 구현은 최신 Git 상태와 현재 문서를 다시 확인한 뒤 전용 `codex/*` worktree에서 시작한다. 현 체크아웃의 메모·멀티모달 관련 미커밋 작업을 가져오거나 덮어쓰지 않는다. `packages/*`를 바꿀 단계는 worktree 루트에서 `npm install`을 먼저 실행한다. Hub 코드는 `apps/hub/AGENTS.md`가 지정한 설치된 Next.js 문서를 확인한다.

각 단계는 다음을 결과로 남긴다.

1. 변경 파일과 기존 기능에 미치는 영향.
2. 해당 상태 전이·실패 경로의 테스트, 화면 변경이면 브라우저 확인.
3. 실제 모델을 호출했는지, 어떤 정책/모델/사례로 평가했는지.
4. 로컬 구현·DB 적용·운영 배포·외부 실행 상태를 구별한 기록.

기존 30개 Office 테스트 통과는 출발점이며 아래의 새 의미·복구·UI 기준을 대신하지 않는다. 이번 구현·검증 결과는 §9에 기록한다.

## 2. E0 — 현재 Office의 약속과 사용성 정돈

**완료할 경험:** 담당을 먼저 연구하지 않고 요청을 쓸 수 있고, 담당·모드를 바꿔도 입력이 보존되며, 답변이 실행을 사칭하지 않는다.

| 위치 | 변경 |
|---|---|
| `apps/engine/lib/office/personas.ts` | 현재 도구와 충돌하는 저장·발송·예약·테스트 약속 예시 교정. 역할별 판단 차이는 유지 |
| `apps/engine/lib/office/playbooks.ts`, `prompt.ts`, `review.ts` | 같은 상태 규칙 정렬, 단순 요청 과잉 과제 방지, 원문에 없는 수치·경험 금지 |
| `packages/agent-contracts/office.js`·`.d.ts` | 정책 버전을 변경한다면 양쪽 일치. E0에서 strict API 필드 확대 없음 |
| `apps/hub/components/hub/pages/office-council.jsx`·`.module.css` | 요청→결과 중심 구성, 로스터/비교 조합 펼침, 카피 정리, 세션 대상·입력 관리 교정 |
| `apps/hub/components/hub/office-client.js` | 응답 역할·scope·참여자 검증 유지, 오류 후 입력 보존 |

현재 v2는 nextAction 문자열을 필수로 요구하므로 E0에서 `null`을 보내지 않는다. 추가 행동이 불필요한 경우 명시 문구로 표시하고, 실제 null 계약은 E1의 별도 parser에서 도입한다. 기존 v2 호환성을 이유로 모델에 새 업무를 강제하지 않는다.

필요 시 UI 세션 전이를 작은 순수 모듈로 분리한다. 회의 프리셋은 placeholder를 실제 사용자 입력으로 자동 제출할 내용에 넣지 않는다. 추천 예시는 placeholder/힌트로 남기고 실제 원문은 보존한다.

검증:

- 작성 후 담당·모드·참여자 변경, 프리셋 변경에서 원문이 사라지거나 이전 세션에 잘못 저장되지 않음.
- 진행 중 다른 scope로 이동한 뒤 늦은 결과가 새 화면에 붙지 않음.
- 한글 입력 중 Enter가 의도치 않게 전송하지 않음, 복사 실패에서 성공 표시 없음.
- 390px/데스크톱·키보드·light/dark 확인, 공통 hover/motion/state 계약 유지.
- 기존 Office contract/Engine/Hub/client/memory 테스트 및 변경한 지침의 실제 사례 검토.

**배포 설명:** 사용성·프롬프트 정돈. CRM/일정 직접 조회·실제 실행 연결이라고 소개하지 않는다.

## 3. E1 — workflow 계약과 요청 영수증

**완료할 경험:** 전송을 두 번 눌러도 생성은 한 번 시작하고, 응답이 끊겨도 같은 요청을 확인하거나 결과를 복구한다.

제안 신규 위치 — 실제 파일명은 구현 시 기존 모듈과 중복을 확인한다.

| 위치 | 책임 |
|---|---|
| `packages/agent-contracts/office-workflow.js`·`.d.ts` | workflow 입력·출력·intent별 문맥·엄격 parser |
| `apps/hub/lib/office/workflow-service.js` | 인증 문맥, hash, claim, Engine 호출, finish/recovery |
| `apps/hub/lib/repositories/office-workflow-context.js` | intent별 문맥 투영; 기존 주간 reader 재사용 |
| `apps/hub/app/api/hub/office/context/route.js` | 문맥 read, HTTP 200 error envelope |
| `apps/hub/app/api/hub/office/requests/**` | 요청·대상별 목록·receipt·recover. apply는 E4까지 없음 |
| `apps/engine/lib/office/`의 workflow 모듈·AI route | 같은 모델 생성/검수, 새 출력 schema, 기존 v2 영향 차단 |
| `supabase/migrations/<새 번호>_office_requests.sql` | service 전용 claim/finish/list/receipt/recover와 요청 테이블·대상 조회 인덱스 |

마이그레이션은 신설 테이블·인덱스·함수만 추가한다. 기존 AI 후보의 entity 제한이나 tasks/contacts schema는 완화하지 않는다. RLS·함수 실행 권한·workspace/actor 분리를 실제 postgres로 확인한다. macOS postgres test의 spawn env에는 `LC_ALL`을 적용한다.

DB RPC 반환 상태와 API UI 표시를 먼저 표로 고정한 뒤 구현한다. 생성 결과 JSON과 request/input hash는 버전별로 안정적으로 정규화한다. 개인정보 원문·token을 로그 메시지나 URL에 쓰지 않는다.

핵심 테스트:

- 동일 ID·동일 입력 concurrent claim에서 provider 1회, 다른 입력은 conflict.
- 첫 요청 claim 응답 유실에서 모델 재실행 없음.
- finish 응답 유실 뒤 receipt 조회 및 같은 서명 결과 복구.
- 다른 actor/workspace/ID로 복구 토큰 재사용 차단, 만료 토큰 차단.
- validator와 review 실패에 generated 반환 금지.
- 오래된 running을 unknown으로 표시, 자동 takeover 없음.
- 본문 만료 후 tombstone이 재실행 방지, agent_runs 전문 중복 없음.
- 탭/브라우저 재진입에서 sessionStorage 없이 같은 대상의 결과를 조회. actor·workspace·scope·기간·대상 ID 격리, 최신 실패와 이전 성공 구별, 커서 페이지 중복/누락 확인.

**완료 조건:** 신규 endpoint는 준비된 환경에서만 capability=true. 기존 chat/legacy 자문은 영향 없음.

## 4. E2 — 주간 카드의 샤미드

**완료할 경험:** 선택 기간의 원장을 다시 설명하지 않고 주간 보고서를 만들고 다시 열 수 있다.

| 위치 | 변경 |
|---|---|
| `apps/hub/lib/repositories/weekly-report.js` | 명시 기간 read 추가, 기존 최근 완료일 7일 기본 보존 |
| Office workflow context | company↔classin 매핑, 정의·coverage·sourceRefs 기반 snapshot/hash |
| `apps/hub/components/hub/pages/daily-brief.jsx` | WeeklyAiDebrief 슬롯의 기본 행동 교체, 기존 Council은 명시 더보기 |
| 공통 Office 결과 패널 | 본문·근거·미확인·receipt·복사·수정 요청 |
| `daily-brief-weekly-ai.test.mjs` | 기존 Council 호출의 존재를 고정하는 정적 기대를 새 동작 검증으로 교체 |

생성은 버튼에서만 일어난다. 월/목은 기존 카드 노출 규칙이며 자동 예약이 아니다. 새 집계 숫자를 클라이언트에서 재계산하지 않는다.

검증 사례: 월요일/목요일, 자정 전후 같은 reportRef, 일부 metric 실패, 미측정/null, 계약 금액과 입금, 활동과 고객 수, 새 세션에서 같은 기간의 결과 복원, 문맥 변경 conflict. 기존 주간 read 소비자의 기간·필드가 바뀌지 않았는지도 검사한다.

**첫 실제 사용 검증:** 같은 확인된 주간 기록으로 기존 결과와 새 결과를 비교해 사용자가 다시 정리해야 할 부분·없는 주장·검토 시간을 기록한다. 평가 사례의 이름·업무 데이터를 앱 소스에 심지 않는다.

## 5. E3 — 고객 연락과 Studio, 두 개의 독립 릴리스

### E3a 고객 연락

`customer_reply` adapter는 선택한 고객/거래와 관계된 최근 활동만 읽는다. 기존 repository의 실제 식별자·workspace·scope 계약을 확인해 사용한다. 레코드에 읽을 수 있는 발언이 없으면 추정 발언을 넣지 않는다.

고객 상세에 `답장 초안 · 부스터` 한 버튼과 결과 패널을 붙인다. 기존 Guru/Legend 도움은 더보기로 구별한다. 복사는 발송/활동 저장을 일으키지 않는다. 실제 연락 뒤 기록은 기존 연락 결과 폼이다.

검증: A→B 전환, 회사/개인, 동일 이름 고객, 원문 수정, 활동 0건/실패, 없는 할인·지원 약속, 두 탭 중복 생성.

### E3b Studio

기존 content transform에 role/policy provenance를 추가할 계약을 먼저 고정한다. Office 일반 생성 endpoint와 Studio transform을 동시에 호출하지 않는다. 님피아의 생성과 검수도 기존 후보 원장에 결과 하나를 남긴다.

검증: 원문 snapshot·revision, 생성 중 원문 수정, 실패 후 입력 보존, 후보 비교/적용/복원, 발행 상태 비변경, 없는 1인칭 경험 추가, 채널 요청 범위 준수.

## 6. E4 — task 연결과 작업·실행 배치

**완료할 경험:** 채택한 다음 행동을 한 번만 task로 만들고, 실행 작업의 상태를 자문과 구별해 찾는다.

- workflow 결과의 typed nextStep을 기존 편집 폼으로 전달한다. 실제 실행은 서버가 검증한 command만 사용한다.
- Office application claim에 commandId·최종 정규화 command payload·commandContractVersion·payloadHash·검증할 대상 버전을 먼저 저장한다. 미확인 동안 payload 수정 금지. claim 직후 중단과 receipt not-found는 보관된 동일 명령의 재전송으로 복구한다.
- 동일 scope의 projectId를 필수로 한다. dealId만으로는 실제 task scope가 보존되지 않으므로 보조 연결로만 사용한다. 기존 수동 생성은 유지한다.
- 서비스 전용 `office_apply_task_v1`과 Engine 적용 어댑터를 추가한다. 인증·저장된 application 대조 → 기존 command와 같은 키의 advisory transaction lock → receipt 재조회 → 대상/범위 참조를 FOR SHARE로 잠금 → 버전·scope 확인 → 같은 트랜잭션의 `agent_command_v1` 순서다. 기존 normalizer·receipt 투영·명령 원장을 재사용한다. Hub/지표/SQL scope 판정이 어긋나는 레코드는 적용하지 않는다.
- 본문 만료 검사보다 기존 application의 조회·복구를 먼저 처리한다. 미확인 명령의 payload·계약 버전·검증 정보는 상태 확정 전 보관하며 만료는 새 application만 막는다.
- saved receipt와 entity 재조회로 확인한다. receipt 조회 실패는 새 명령을 만드는 계기가 아니다.
- `AgentsOrders`에 작업 지시/코드 작업 보기를 두고 기존 CodexJobsPanel을 이동한다. 기존 Council에는 이동 링크를 남긴다.
- `hub-nav.js`, `hub-data.js`, `hub-app.jsx`, nav 테스트를 함께 확인한다. 하위 탭 라벨을 바꿔도 legacy path·서비스 ID는 유지한다.

핵심 검증: 동일 apply 1건, claim→dispatch 사이 중단, 업무 저장 뒤 Office 기록 갱신 실패 복구, source 변경·scope 불일치, task 저장과 프로젝트 scope 변경의 동시 트랜잭션, receipt 부재를 본 호출보다 다른 동일 명령과 scope 변경이 먼저 커밋한 경우에도 saved/replayed 반환, request 본문 만료 후 미확인 command 복구와 기존 업무 링크, wrapper의 함수 권한·명령 바꿔치기 차단, jobs offline·needs_attention, orders 승인과 jobs 성공의 구별.

## 7. 뒤로 미룬 기능

전체 대화 장기 기억, 인물 라이브러리 통합, Office 전용 원격 MCP, 역할별 독립 상주 에이전트, 자동 발송·발행·배포, 새 전사 승인함, 범용 업무 그래프는 이번 E0~E4의 완료 조건이 아니다. 기존 기능은 유지하고 연결 상태를 정확히 표시한다.

## 8. 단계별 확인 명령

기본 Office 회귀 묶음:

```bash
node --import ./scripts/register-hub-alias.mjs --test packages/agent-contracts/office.test.mjs apps/engine/lib/office/office.test.mjs apps/engine/lib/office/quality.test.mjs apps/hub/lib/office/office.test.mjs apps/hub/lib/office/legacy-memory.test.mjs apps/hub/components/hub/office-client.test.mjs
```

E1 이후에는 새 workflow/RPC 테스트, E2는 weekly-report 테스트, E3는 contact/Studio 계약, E4는 agent commands/jobs/nav 검증을 더한다. 실제 파일과 package scripts를 확인한 뒤 각 단계에 적합한 typecheck·build·저장소 필수 검사를 실행한다. 전부 통과한 검사를 이유 없이 반복하지 않는다.

유료 모델 평가는 로컬에 기록된 비식별 사례만으로 시작한다. `scripts/eval-office.mjs --live`는 비용이 발생하는 별도 실행이며 설계 완료 증거로 실행했다고 표기하지 않는다.

## 9. 이번 계획의 산출물 상태

- [x] 제품·UX·데이터·실행 경계의 심화 설계
- [x] 기존 코드와 신규 계약의 차이·단계별 파일 지도
- [x] E0 코드 구현과 화면 검증
- [x] E1~E4 코드 구현·임시 PostgreSQL 마이그레이션 검증
- [ ] 새 프롬프트의 실제 모델 평가
- [ ] 운영 환경 적용

### 실제 반영 범위

| 단계 | 구현·검증한 동작 |
|---|---|
| E0 | 9인 피치·실행 약속 정돈, 입력과 결과 우선 Office, 선택 설정 접기. 담당·모드·프리셋·범위 이동 시 초안 보존, 늦은 응답 격리, 한글 조합 입력·복사 실패 확인 |
| E1 | `office-workflow` 별도 strict 계약, 인증된 workspace/actor의 요청 선점·조회·목록·저장 복구. 원문 30일 조회 만료, 같은 ID 재생성 방지. 실패 봉투와 `unknown`·`unsaved` 구분 |
| E2 | 기존 주간 카드에 샤미드 연결. 선택한 완료일 7일을 고정하고 실제 집계·정의·미측정 값을 전달. 모델은 버튼에서만 호출하며 새 세션은 저장 결과를 조회 |
| E3a | 고객 DB 상세와 고객 연락에 부스터 연결. 선택 엔티티에 직접 연결된 최근 활동 5건만 전달. A/B 전환·늦은 응답·미전송 입력 격리 확인. 회사 단위 활동은 다른 사람의 발언으로 추정하지 않음 |
| E3b | Threads 원고 초안·다듬기에만 님피아 지침 적용. 기존 content transform 한 번과 후보 원장 유지. `officeProvenance`에 역할·정책·persona 버전·`schema-only` 검증 기록. 이전 정책/무정책 요청은 당시 hash로 재조회하며 재라벨·재생성하지 않음 |
| E4 | 같은 범위 프로젝트 선택 후 다음 행동을 task로 연결. 최종 명령 보관, 동일 command 잠금·receipt 재조회·대상 버전/scope 검증을 한 트랜잭션으로 수행. 기존 Orders에 코드 작업 보기 이동, 기존 네 목적지 경로 유지 |

`0038_office_requests.sql`은 기존 tasks·AI 후보 schema를 바꾸지 않는다. 읽기/쓰기 준비가 안 된 환경은 capability를 비활성화한다. 모델 호출 로그에 결과 전문을 중복 저장하지 않으며, 초안 저장과 활동 로그 저장 상태를 구분한다.

### 검증 환경과 증거

최종 전용 worktree 검증: `npm test` **1,801개 중 1,790 통과 · 0 실패 · 11 skip**, `npm run check:contracts` 통과, Engine typecheck와 **Hub·Engine production build 통과**, `git diff --check` 통과. skip 11개는 기존 Content workflow DB URL·Journal/Codex jobs opt-in 환경이 없는 검사다. 이번 Office PostgreSQL 묶음은 9개 하위 사례를 포함해 전부 실행·통과했다.

전용 worktree에서 `npm install` 후 검증했다. 운영 환경 파일을 복사하지 않았고 DB 검증은 테스트가 기동한 임시 PostgreSQL에서 실행했다. 브라우저는 `http://127.0.0.1:3017`, 1440px/390px, light/dark에서 확인했다. Browser plugin이 없어 Playwright와 설치된 Chrome의 격리 컨텍스트를 사용했다. 업무 응답은 테스트 스크립트의 네트워크 인터셉트로 제공했고 앱 소스에 테스트 레코드를 넣지 않았다.

- Office 10개 입력·전환 상호작용, Office/작업·실행/브랜드 자문 12개 화면 조합.
- 주간 패널: HTTP 200 error, 미저장 본문과 복구 token 유지, 생성 없이 재복구, 프로젝트 필수, 응답 유실 뒤 동일 필드로 task 확인, 새 브라우저 세션 결과 조회.
- 고객 패널: A 생성 중 B 이동, 늦은 A 답변 격리, A 결과 재진입, B 원문 보존.
- Studio: Threads 초안/다듬기 지침과 다른 채널 구분, 과거 후보 provenance 보존.
- 교차 리뷰 후 미저장 결과의 이탈 경고, 생성 중 새 발췌문 보존, 과거 결과 조회 순서·할 일 폼 대상 일치, 적용 본문의 길이 한도를 보완했다.

검증 중 기존 상단 시계의 분 경계 SSR hydration 불일치가 한 번 관찰됐다. 변경 화면의 흐름 검사에서는 추가 JS 오류·프레임워크 오류 화면·가로 넘침이 없었다. 연결 없는 코드 작업의 준비 상태는 실행 성공으로 표시하지 않았다.

### 운영 적용 전 남은 일

1. 대상 환경에 0038과 기존 command 전제 마이그레이션을 적용하고 `npm run db:check`로 테이블·RPC·권한을 확인한다. 이번 작업은 운영 DB에 SQL을 실행하지 않았다.
2. Hub/Engine의 기존 인증·shared secret·모델 연결과 workspace를 구성한 뒤 실제 자료로 주간·고객 생성 및 task 저장 왕복을 검증한다. 비용이 드는 실제 모델 평가는 이번 테스트 수에 포함하지 않는다.
3. 30일 이후 조회는 즉시 본문을 가린다. 물리적 본문 정리는 서비스 전용 `office_requests_expire_v1` 호출이 필요하며 **예약 실행은 추가하지 않았다**. 미확인 application의 명령 payload는 결과 확정까지 유지한다.
4. 운영 배포와 외부 발송·발행·예약은 이번 실행에 포함하지 않았다. Studio 독립 의미 검수, 다른 화면 연결, 장기 기억은 후속이다.
