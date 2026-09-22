# Office → Codex CLI 비동기 연결 검토

**권고: 기존 `agent_jobs`를 실행 큐로 재사용하되 `office_generation`이라는 서버 전용 작업 종류와 Office 전용 실행기를 추가한다. Office 요청·결과는 `office_requests`가 계속 소유하고, 제출은 저장 후 즉시 202로 끝낸다.** 현재 기본 provider와 동기 HTTP의 48초 제한은 유지한다. 아래는 읽기 전용 제안이며 구현·설정·운영 DB·동결 심사 결과는 변경하지 않았다. 실제 CLI·모델 호출과 holdout 접근도 하지 않았다.

기준 루트: `/Users/clmagi/Desktop/Projects/moonlight_pro-office-cli-compare`.

## 동기 provider 교체가 부족한 이유

- `apps/engine/lib/office/service.ts:9`는 모든 draft→review 또는 회의→synthesis에 **하나의 48초 signal**을 만들고, `apps/engine/lib/office/workflow-service.ts:24`도 같다. Hub의 `apps/hub/lib/office/engine-client.js:5`·`workflow-engine-client.js:11`은 55초를 기다린다. worker가 기존 HTTP endpoint를 대신 호출해도 이 제한은 그대로 걸린다.
- 부모 작업에서 전달받은 **개별 draft+review 두 번 연속 48초 timeout, urgent/low 40.6초 생성**은 동기 경로의 여유가 부족하다는 근거다. 이번 검토에서 재호출하거나 성능 수치를 새로 검증하지 않았다. 비동기화가 CLI의 의미 품질이나 개별 호출 성공을 보장하지는 않는다.
- 평가용 `scripts/office-evaluation/codex-provider.mjs:43`은 설치된 CLI·로그인 경로, JSON schema, 도구 금지, 호출별 최대 45초라는 별도 adapter다. 기존 worker는 **SDK/CLI 0.154.0**으로 실행한다(`packages/codex-worker/README.md`). 둘의 런타임·기본 지침이 같다고 가정해 평가 품질을 이전할 수 없다. 새 실행기에는 실제 CLI/adapter 버전·지침/스키마 hash·보고된 모델 정보·usage를 남기고, 모델 미보고 값은 null로 둔다.

## 재사용할 부분과 추가 경계

| 부분 | 재사용 근거 | Office 연결 시 필요한 차이 |
|---|---|---|
| 요청 보존 | `apps/hub/lib/office/workflow-service.js:101`의 request ID/hash, contextHash 확인, snapshot claim; `supabase/migrations/20260921_0038_office_requests.sql:58` | claim 뒤 HTTP에서 생성하지 않고 **Office claim+job enqueue를 한 트랜잭션**으로 묶는다. 저장됐으나 큐에 없는 요청을 만들지 않는다. |
| 큐·멱등·claim | `supabase/migrations/20260913_0033_agent_jobs.sql:93`의 request conflict/duplicate, `:178`의 worker claim | 내부 typed `job_kind`와 `office_request_id` 연결을 추가한다. 일반 prompt·projectId나 모델 출력으로 종류를 선택하지 않는다. 구 worker는 Office 작업을 claim하지 못하도록 capability 필터도 함께 추가한다. |
| lease·취소·event | 같은 migration `:82`, `:142`, `:194`; `packages/codex-worker/runtime.mjs:25`, `process.mjs:4`, `client.mjs:3` | 90초 lease/15초 heartbeat, 안정 event ID, cancel 요청→확인, stale lease 차단을 유지한다. Office 원장 finish도 **현재 job lease**에 묶는다. |
| 결과 저장 | Office `finish_v1`의 attempt token·context·resultRevision 검사(`0038:103`) | 구조 검증을 통과한 Office result 저장과 job terminal 상태를 원자적으로 끝낸다. 일반 job.result에는 Office 결과 참조만 남긴다. 두 번째 생성으로 저장 실패를 복구하지 않는다. |
| 상태 조회 | `apps/hub/lib/office/workflow-http.js:15`, `workflow-service.js:52`; job events `0033:135` | Office 사용자의 identity로 같은 request를 재조회한다. job 이벤트의 seq/after 방식은 재사용할 수 있다. GET 읽기 실패는 HTTP 200+error 봉투를 보존한다. |
| UI 입력 보존 | `apps/hub/components/hub/office-workflow-client.js:39`, `:65`; `office-workflow-panel.jsx:54` | 현재 Office는 수동 상태 확인이며 자동 polling이 없다. queued/running/cancel-requested/needs-attention 상태 해석과 한 개의 backoff polling을 추가한다. 패널 닫기는 polling만 멈추고 작업 취소는 별도 동작으로 둔다. |

## 최소 실행 흐름

1. **입력·자료 확정:** Hub가 기존 parser와 `getOfficeWorkflowContext`로 scope·origin·contextHash를 검증한다. 서버가 provider 경로를 명시적으로 선택해 요청과 job을 원자 저장하고, requestId/jobId와 대기 상태를 반환한다. 같은 ID 재전송은 저장된 receipt만 반환한다. worker가 offline이면 기존 `queueIfOffline`의 명시적 대기 의도를 존중하고 임의로 큐잉하지 않는다.
2. **worker 실행:** `packages/codex-worker/cli.mjs:21`의 한 번에 하나 claim하는 흐름은 유지한다. **새 파일 제안** `packages/codex-worker/office-runtime.mjs`가 Office 작업만 분기 처리한다. `service.ts`/`workflow-service.ts`에서 prompt·draft·source review·parser orchestration을 재사용 가능한 core로 추출하고, 동기 wrapper는 지금의 48초 signal, worker는 기존 job wall-clock budget/lease 취소 signal을 넣는다. 기존 Engine 생성 HTTP를 경유하지 않는다.
3. **모델 호출 경계:** Office 전용 CLI adapter를 별도 파일로 둔다(제안: `packages/codex-worker/office-cli-provider.mjs`). 평가 adapter의 schema 전달·도구 거부·원문 전달 방식을 참고하되 평가 코드를 제품에 그대로 import하지 않는다. 기본 모델을 지정하거나 바꾸지 않는다. 각 역할의 개별 공개 발언, source review, 같은 모델 일관성 검증을 유지한다.
4. **검증·종료:** Engine의 authenticated worker handler가 저장된 요청/문맥에 대해 `parseOfficeWorkflowResult`를 검증하고, 현재 lease와 취소 상태를 확인한 뒤 Office 결과+job 완료를 저장한다. 성공은 `generated + persisted:true + resultRevision`의 receipt로만 표시한다. 검수 실패·불명·취소를 generated로 승격하지 않는다.
5. **업무 적용:** 기존 `apps/hub/lib/office/workflow-service.js:188`의 명시적 apply, 최신 contextHash·동일 범위 project/deal 확인, `apps/engine/lib/office-apply.ts`와 Agent command receipt 경계를 그대로 둔다. worker는 할 일 생성·발송·회사 기록 권한을 갖지 않는다.

## 새 마이그레이션이 필요한 이유

**운영 연결에는 필요하고, 아래의 오프라인 프로토타입에는 필요 없다.** 기존 0033·0038을 편집하지 않고 별도 migration을 작성하는 것이 맞다.

- 최소 내용은 job 종류/Office 연결 FK·일대일 멱등 제약, 지원 worker만 claim하는 필터, 원자 enqueue 및 fenced finish RPC, Office receipt의 비동기 상태 투영이다. 현재 Office는 `running + deadline_at(60초)`가 지나면 unknown으로 보인다(`0038:36`, `:97`). 비동기 요청은 연결 job의 queue/lease/terminal 상태를 읽어야 하며 이 60초를 늘리는 방식은 쓰지 않는다.
- Office `attempt_token`만으로는 취소·lease 만료 뒤 늦은 worker의 결과를 차단하지 못한다. terminal 기록과 Office 저장을 한 트랜잭션에 두고, 취소가 먼저 확정된 경우 이후 성공 응답을 게시하지 않는다. job 성공만 있고 Office 결과가 없는 중간 상태도 허용하지 않는다.
- 기존 일반 worker는 prompt 16KiB, 최종 text 16KiB로 자르고 finish result는 20,000byte를 검사한다(`packages/codex-worker/contracts.mjs:37`, `runtime.mjs:54`, `apps/engine/lib/agent-worker.ts:36`). Office는 facts 24KiB·result 32KiB다(`packages/agent-contracts/office-workflow.js:6`). **전체 snapshot을 일반 prompt에 욱여넣거나 JSON을 자르지 않는다.** job에는 opaque Office 참조만 저장하고, claim된 Office 작업에 한해 bounded typed snapshot/result 채널을 둔다. 초과는 명시적 오류로 거절한다.
- 원문·중간 초안·결과를 agent_job_events나 일반 job.result에 복제하면 Office의 30일 만료(`0038:306`) 밖에 데이터가 남는다. event는 phase·상태·usage/hash만, 최종 본문은 Office 원장 한 곳에 둔다. 필요한 private 실행 자료도 같은 만료 경계에 묶는다.

## 동시성·취소·scope·인증

- 현재 SQL은 **worker별이 아니라 workspace 전체에 running job 한 개**만 허용한다(`0033:189`). 첫 버전은 이 제한을 유지한다. Office 내부 `runOfficeDiscussion`은 현재 `Promise.all`로 역할을 병렬 호출한다(`apps/engine/lib/office/deliberation.ts:85`, `:131`). 초기 CLI 실행기는 내부 호출 동시성도 1로 제한하고 위치→응답→종합의 의존 순서를 유지한다. 병렬화는 이후 별도 측정 대상이다.
- 일반 worker의 `thread_id`는 한 개이고 변경을 거절한다(`0033:208`). 여러 역할/검수의 CLI thread ID를 이 칸에 번갈아 덮지 않는다. Office는 작업당 단계 메타데이터만 별도 관리하고 **초기 버전에서는 generic resume를 닫는다.** `draft` 작업의 lease 만료는 기존처럼 needs_attention으로 남긴다. 재시도는 확인 후 새 parent-linked Office request로 명시적으로 요청하며 숨은 자동 생성 재시도는 만들지 않는다.
- 프로세스 감독은 재사용할 수 있지만 현재 평가 adapter의 CLI spawn도 `detached:true`라 parent의 별도 process group 밖으로 나간다. `process.mjs:7`과 평가 adapter `codex-provider.mjs:134`를 그대로 중첩하면 강제 종료 때 CLI가 남을 수 있다. 새 전용 adapter는 job group 안에서 실행하거나 모든 group을 supervisor가 소유하도록 정하고, 종료 확인 전 다음 claim을 하지 않는다.
- Office identity는 세션 actor/`operator`이고(`apps/hub/lib/office/workflow-runtime.js:16`), 기존 Codex Hub BFF는 Agent token의 actor(기본 `codex`)를 사용한다(`apps/hub/lib/agent/hub-jobs-http.js:10`, `auth.js:11`). **브라우저에서 기존 Codex BFF만 연결하면 같은 actor가 아니다.** Office enqueue/get/cancel는 세션 identity에서 파생하고, worker 완료의 workspace/actor/scope는 연결된 저장 행에서만 가져온다. body의 actor·scope 재지정은 받지 않는다.
- `apps/engine/lib/agent-worker.ts:12`의 별도 worker token과 고정 workspace 검증, `packages/codex-worker/config.mjs`의 전용 home·최소 환경은 유지한다. 현재 인증 파일은 읽거나 복사하지 않는다. 전용 runtime 인증은 향후 운영 활성화의 별도 조건이며 이번 프로토타입에는 필요 없다. SDK read-only는 읽기 격리가 아니므로 Office 실행에는 빈 작업 디렉터리·도구 금지 profile을 쓰고, 저장된 scope 자료만 전달한다.
- 현재 durable 업무는 `weekly_report/customer_reply`, scope는 `personal/classin`뿐이다(`workflow-service.js:7`, `0038:7`). 자유 대화 `apps/hub/lib/office/http.js`는 request ledger가 없다. **첫 운영 연결은 이 두 workflow로 한정하는 것이 최소 변경**이다. 자유 대화·scope=all까지 비동기화하려면 별도의 typed request/receipt 보존 계약을 추가해야 하며, parser에 freeform이 있다는 이유만으로 DB에서 지원된다고 간주할 수 없다.

## 운영 연결 없이 확인할 프로토타입

새 파일 제안: `/tmp/moonlight-office-async-prototype.mjs`와 `/tmp/moonlight-office-async-prototype/`. 저장소·설정·DB에 쓰지 않는 별도 harness에서 순수 parser/core와 주입형 transport/clock/provider를 사용한다. provider는 실제 CLI를 실행하지 않고 허용된 동결 **개발** 응답이나 명시적 오류를 재생한다. 인증 환경·네트워크 fetch·child CLI spawn은 차단한다.

검증할 핵심은 ① 첫 응답은 가상 60초 생성 이전에 accepted로 반환, ② 같은 ID·동일 payload는 한 job/달라진 payload는 conflict, ③ draft/review 또는 역할 단계 순서를 지나 검증된 최종 결과만 generated, ④ 저장 응답 유실 뒤 동일 receipt 재조회로 회복, ⑤ cancel과 늦은 finish 경쟁·lease 만료의 stale finish 차단, ⑥ 다른 actor/scope·잘린 JSON·32KiB 초과·미완성 검수 거절, ⑦ HTTP read 오류를 완료/빈 상태로 오인하지 않음이다. **가상 clock/지연 재생은 구조 검증이지 실제 지연이나 의미 품질 평가가 아니다.**

DB 원자성까지 확인하는 후속 단계는 기존 `packages/codex-worker/jobs.postgres.test.mjs`와 `apps/hub/lib/office/workflow-storage.postgres.test.mjs` 방식의 disposable PostgreSQL에서 새 migration을 시험한다. 운영 연결·인증·모델 호출 없이 가능하지만 이번 읽기 전용 검토에서는 실행하지 않았다.

검토 방법: 로컬 코드·계약·migration을 읽었다. 프로젝트에서 지정한 `gstack-plan-eng-review`는 로컬 skills/plugin 경로에서 찾지 못해 직접 검토했다. 구현 가능성을 근거로 CLI 품질 통과나 운영 준비 완료를 선언하지 않는다.
