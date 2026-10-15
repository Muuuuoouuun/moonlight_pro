# Go;Re Threads P2 — 만료된 worker의 POST 시작 차단

독립 읽기 검토 `01a0f3e9-6160-71d4-a601-e4916c463009`에서 확인한 P2의 로컬 증분이다. 기존 PR20 재정합과 텍스트 1건 구현은 별도 보존했고, 이 증분은 `moonlight-threads-text` / `codex/gore-threads-text-test-1001`, base `a595b624c4bbcd616cdf7b3b2500d6de3a983075`에서 만들었다. 대상과 본문은 [기존 고정 계약](2026-09-30-gore-threads-publish-plan.md#확정된-대상과-본문)을 그대로 사용한다. 실제 provider 요청·OAuth·토큰 변경·운영 DB 적용·게시·배포·설치는 하지 않았다.

## 문제와 변경

`creating` 또는 `publish_requested`가 저장됐다는 응답을 받은 뒤 worker가 오래 멈추면, 그 사이 90초 lease가 만료되고 다른 실행 요청이 job을 ambiguous로 바꾸거나 조회용 lease를 얻을 수 있었다. 이전 worker가 재개하면서 POST를 먼저 보내면 이후 CAS 거절로 외부 효과를 되돌릴 수 없다. 수정 전 새 회귀 7개가 실패했고, 저장 직후 만료/복구 전환에도 create 호출이 시작되는 것을 의존성 모델에서 재현했다.

변경은 다음 네 파일과 이 문서에 한정한다.

| 파일 | 변경 |
|---|---|
| `apps/hub/lib/gore-threads-test-service.js` | private claim의 만료/잔여 시간 유지, 두 POST 직전 예산 검사, adapter에 동기식 최종 검사 전달 |
| `apps/hub/lib/threads-text-test-adapter.js` | 10초 요청 제한시간 공통 상수, POST fetch 직전 `beforeSend` 실행 |
| `apps/hub/lib/gore-threads-test.test.mjs` | 13개 회귀 추가, fake clock 및 lease 소유권/버전 모델 보강 |
| 미적용 `supabase/migrations/20261001_0064_gore_threads_text_test_job.sql` | claim/lookup RPC의 private top-level `leaseExpiresAt`/`leaseRemainingMs` 반환, CAS 보장 범위 주석 정정 |

0064는 여전히 제안 번호의 미적용 SQL이다. 테이블 구조, lease 90초, 스케줄, RLS, 공개 job projection과 승인 대상은 바꾸지 않았다. 운영 반영 전에 최신 main/ledger/다른 작업의 번호 예약을 다시 조율해야 한다. 이전 단계의 patch·로그·상태 JSON을 수정하지 않았다.

## 예산 및 공개 경계

- DB가 만료까지 남은 밀리초를 floor해 반환한다. 서비스는 RPC를 기다리기 **전** 시각에 이를 붙여, 응답 지연을 새 lease로 취급하지 않는다. DB와 앱의 절대 시각이 동기화됐다고 가정하지 않는다.
- elapsed는 monotonic 시간과 wall time 중 더 큰 값을 쓴다. wall clock 뒤로 이동에는 monotonic 시간이, 일부 Mac clock이 suspend 중 멈추는 경우에는 wall time이 보수적인 검사에 쓰인다. 시계가 앞으로 크게 이동하면 안전하게 중단할 수 있다.
- create/publish 각각 **10,000ms 제한시간 + 2,000ms 여유보다 많이** 남아야 한다. 12,000ms 이하, 만료, 누락/잘못된 metadata이면 POST를 시작하지 않는다. timeout 상수는 실제 adapter의 `AbortSignal.timeout`과 공유한다.
- durable intent 응답 직후 검사하고, adapter 요청 준비 뒤 실제 fetch 바로 앞에서 동일한 동기식 검사를 다시 한다. callback, 내부 expiry/잔여 시간, lease token/owner는 HTTP 응답·job projection·provider 입력에 넣지 않고 로그도 추가하지 않았다. 오류는 기존 고정된 ambiguity 안내로 처리한다.
- 이미 전송된 요청을 취소하거나 되돌리는 기능이 아니다. provider는 DB lease/CAS를 원자적으로 검사하지 않는다. 마지막 검사와 외부 전송 사이의 프로세스 중단 경계까지 exactly-once로 보장하지 않는다. 응답 유실/저장 불명확은 계속 ambiguous이며, 조회·운영자 확인 전 자동 재게시하지 않는다.

## 검증

핵심 service/adapter 32개, Go;Re OAuth/route/쓰기·접근 경계까지 합쳐 **74/74** 통과했다. 이전 핵심 19개에 13개를 추가한 결과이며, 기존 61개를 별도로 더한 숫자가 아니다.

새 회귀는 creating와 publish_requested 저장 직후의 만료, 다른 요청의 ambiguous 전환 및 lookup lease 획득 후 이전 worker 재개, timeout+margin 경계, claim 응답 지연, 누락/잘못된 private metadata, host sleep/clock rollback, adapter 안에서 멈춘 뒤 최종 callback 검사, raw JSON container/post 파싱을 포함한다. create 단계 만료에는 create/publish 모두 0건, publish intent 만료에는 이전 create 1건 이후 publish 0건이며, 이전 worker가 복구 worker의 상태/버전을 덮지 않는다.

실제 adapter 함수의 `container()`는 다섯 상태를 선택된 ID/status로 파싱하고, `post()`는 owner string/object를 정확한 owner ID로 매핑한다. 잘못된 ID, malformed/HTTP error 응답은 고정 코드로 거부한다. 누락/다른 owner·본문·username·URL은 receipt를 검증하지 못하며, extra token/error 필드는 결과에 남지 않는다. 이 증거는 합성 fetch 응답이며 live provider 성공을 의미하지 않는다.

정적 readiness/no-mock 검사는 **9/9**, 변경 JS 3개 syntax와 whitespace 검사가 통과했다. 총 83개가 현재 로컬 통과 결과다. 명령:

```sh
node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/gore-threads-test.test.mjs apps/hub/app/api/social/meta/threads/test-post/test-post.test.mjs apps/hub/app/api/social/gore-connection.test.mjs apps/hub/lib/hub-write-guard.test.mjs apps/hub/lib/route-access.test.mjs
node --import ./scripts/register-hub-alias.mjs --test --test-skip-pattern='PostgreSQL' scripts/database-readiness.test.mjs scripts/no-mock-data.test.mjs
```

정적 검사 첫 실행에서 제외용 negative name pattern이 의도대로 작동하지 않아 기존 PostgreSQL 테스트가 임시 `initdb`를 1회 시도했다. 이는 이 단계의 'DB 초기화 없이' 조건에 대한 실행 실수다. `shmget ... Operation not permitted`로 실패해 pg_ctl 시작/SQL 적용까지 가지 않았고 테스트 finally가 임시 root를 제거한 것을 경로 부재로 확인했다. 운영 DB에 연결하지 않았다. 실패 원문은 `gore-lease-p2-static-filter-failure.log`에 보존했고, 명시적 skip pattern으로 정적 검사만 다시 실행했다. PostgreSQL 권한을 높이거나 초기화를 재시도하지 않았다.

## 산출물과 남은 단계

workspace의 `gore-lease-p2-before`는 수정 전 선택 파일 사본이다. `gore-lease-p2-fix.patch`는 그 사본/기존 텍스트 단계에 적용하는 증분이며 forward/reverse check를 한다. `gore-lease-p2-tests.log`, `gore-lease-p2-static-tests.log`, `gore-lease-p2-state.json`은 이번 단계의 증거다. 적용 기준은 기존 `gore-threads-text-full-pr20.patch` 이후이며 social 재정합 패치만 있는 트리에 단독 적용하는 패치가 아니다. 코드 복구는 이 증분만 되돌리면 이전 텍스트 단계가 보존된다. 실제 게시/credential 복구를 대신하지 않는다.

실제 PostgreSQL 함수 실행·두 세션 CAS/RLS/lease 검사, 신규 route Hub build, 숫자 account/app ID 및 실제 OAuth grant/권한 검증은 미완료다. 대형 빌드·DB 초기화 재시도 없이 마무리한다. 운영 schema/code 반영, 전용 앱 설정/사용자 직접 OAuth 동의, gate 설정, 정확한 대상·본문·한 건 작업키의 실행 직전 확인이 별도 단계로 남는다. 실제 job/container/post/permalink는 없다.
