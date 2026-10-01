# Go;Re Threads 1건 — 실행 전 계약과 최소 후속 범위

아래는 연결 단계 당시의 승인 본문과 후속 계획을 보존한 기록이다. 현재 [고래 로컬 최소 실행 단계](2026-10-01-gore-threads-text-local-step.md)에 서버/API/합성 테스트를 추가했으나 실제 연결·게시·DB 적용은 하지 않았다. migration은 다른 작업과의 번호 충돌을 피하도록 0063/0064로 제안했으며 운영 전에 재조율해야 한다.

PR20 기준 재정합에서 고래 allowlist는 미적용 `20261001_0061_gore_oauth_app_binding.sql`로 분리했다. 기존 0056~0060을 변경하지 않았다. 현재 공통 계층과 후속 파일/RPC 최소안은 [PR20 재정합 결과](2026-10-01-social-pr20-reconciliation.md)를 함께 본다. 실제 publish executor와 영속 job은 아직 구현하지 않았다.

## 확정된 대상과 본문

- 사용자 지정 공개 프로필: https://www.threads.com/@go_re_startagain
- Moonlight brand: `gore`, 표시명 `고래(Go;Re)`, brand ID `7fad9d64-bb90-4a63-8528-de8a8a23836d`.
- provider `meta_threads`, 앱 설정 key `gore`, scope `threads_basic,threads_content_publish`. 현재 숫자 provider account ID/실제 grant/운영 app ID는 **미확인**이며 공개 handle에서 추측하지 않는다.
- 출처: 사용자가 직접 제공한 소재 “확실히 하고 후회하는게 훨씬 이득이다”와 부모가 게시 전 제시한 아래 확정 초안. 추가 광범위 메모 검색/개인 일화 창작은 하지 않는다.
- 사용자 승인 범위는 이 계정의 비민감 짧은 글 **1건**뿐이다. 다른 브랜드·반복 스케줄·다른 본문·권한 추가는 포함하지 않는다.

```text
확실히 하고 후회하는 게 훨씬 이득이다.

해보고 나면, 적어도 다음 선택은 더 선명해진다.
오늘은 작은 행동 하나부터.
```

본문은 위 67개 Unicode 문자, UTF-8, LF, 끝 개행 없이 고정한다.
SHA-256: `cefd7d31a8c445c8693c307f630b6462ddd8b19798665c27f4147293d8a1807e`.
단일 작업키 후보: `gore-threads-test-20260930-01`.
이 키는 로컬 문서에만 예약했으며 운영 job/게시물은 아직 없다. 확정 post ID/permalink도 없다.

## 현재 차단과 필요한 사용자 단계

1. PR20 이후 운영 세션 GET은 configured:true이고 dashboard는 로그인으로 리디렉션된다. 사용자가 정상 인증된 설정 화면을 사용해야 한다. 새 비밀번호 적용 여부는 별도 로그인 작업의 확인 대상이다. 이 소셜 브랜치에는 로그인 변경/배포를 섞지 않는다.
2. 고래 전용 Meta Threads app ID/secret, HTTPS OAuth callback, 현재 앱 역할/tester·검수 상태를 확인한다. 로컬/운영 설정 저장은 사용자가 직접 또는 별도 승인된 비밀 입력 도구로 한다. 채팅/브라우저 클립보드로 토큰을 전달하지 않는다.
3. 0061 allowlist migration과 고래 코드의 운영 반영은 별도 승인 후 진행한다. 기존 flow/계정 행을 삭제하거나 기존 credentials를 회전하지 않는다.
4. Chrome 1의 정확한 고래 로그인 세션에서 Moonlight Connect → Threads OAuth 화면으로 진행하고, 사용자에게 앱·handle·요청 scope를 보여 직접 동의하게 한다. 숫자 app-scoped account ID는 callback `/me`의 정확한 handle 검증 결과로 저장한다. 잘못된 profile/account/app ID이면 연결을 저장하지 않는다.
5. 아래 executor/job을 준비한 뒤 부모와 실제 account ID·확정 본문 해시·단일 작업키·공개 프로필 게시 계약을 정합시킨다. 사용자에게 대상/본문/1회 범위를 명확히 보여야 한다. 사용자 게시 승인은 있어도 OAuth grant/credentials 설정 승인과 동일하지 않다.

## 가장 작은 다음 구현

텍스트 1건에는 미디어 storage bucket이 필요 없다. 기존 `content_items/variants`, `publish_logs`를 재사용하고, 아래 로컬 구현을 먼저 마친다.

- 미적용 SQL: 영속 `social_publish_jobs`와 이벤트/receipt, `(workspace_id, job_key)` unique, 고정 brand/provider/account/app/content revision/body hash/승인 범위/상태/lease/version/오류 코드/container ID/post ID/permalink. service_role 전용 RPC가 원자적으로 lease/버전을 변경한다. 운영 적용 전 합성 DB로 검증한다.
- BFF 명시적 1회 POST: 정상 operator session 또는 기존 승인된 원격 서버 인증, 서버 workspace 고정, 명시적인 exact content/account confirmation, 기존 연결 읽기/유효기간/권한 검사, 동일 키의 다른 본문·계정·앱 거부. 원격 앱에는 access token/secret/session URL을 내보내지 않는다.
- Threads text executor: `/me` 재확인 → TEXT container 생성 → 해당 container 완료 상태 확인 → publish → post ID를 이용해 사용자/본문/permalink 조회 검증 → receipt 저장. 자동 publish 플래그/스케줄은 사용하지 않는다. 공식 API 문서와 현재 endpoints를 다시 확인한다.
- 중복·복구: 단일 프로세스 Map에 의존하지 않는다. 작업 lease와 CAS가 중복 실행/덮어쓰기를 막고, container/post ID를 각 단계에서 영속화한다. 네트워크/응답 저장 실패로 발행 여부가 모호하면 `reconciliation-required`로 멈춰 조회한다. 조회로 단일 결과가 확인되지 않으면 재게시하지 않는다. 외부 API에 자체 idempotency가 없다면 crash 경계에서 exactly-once를 보장한다고 주장하지 않는다.
- 결과 검증: 저장된 provider post ID/permalink와 실제 본문/대상을 읽어 확인한다. API 최종 성공/운영 배포/실게시 성공은 로컬 테스트 성공과 구분한다. 수동 Threads 브라우저 게시로 Moonlight end-to-end 성공을 대체하지 않는다.
- 트래킹: 기존 수동 performance 기록에 provider post ID/source/capturedAt 기반 수집 adapter를 연결한다. 현재 basic/publish만으로 가능한 공개 결과 확인부터 한다. insights 등 추가 scope가 필요하면 별도 승인을 받고, 없는 수치를 0으로 채우지 않는다.

위 계약/상태기계·가짜 provider adapter·중복/실패 복구 테스트·상태 UI는 로컬 구현 가능하다. 운영 migration/credentials 설정·사용자 OAuth 직접 동의·배포는 선행 승인/직접 단계다. 새 cron/스토리지 생성은 이번 1건 시험에 필요하지 않다.

## 반영과 복구

최신 main 및 별도 로그인 배포와 비교해 소셜 파일만 반영한다. schema 준비 → 코드 배포 → 사용자 OAuth → 읽기 검증 → 단일 job 실행 순서다. 연결/게시 side effect 이후 코드 롤백은 토큰·게시물을 자동 되돌리지 않는다. ambiguous job은 먼저 reconcile하고, 게시 결과를 지우거나 새 키로 재게시하는 복구는 별도 사용자 결정이다.
