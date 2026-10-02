# Go;Re Threads — 빅맥 로컬 계약·빌드 검증

2026-10-01 KST. 새 route의 production build와 로컬 계약 검증은 통과했다. 실제 PostgreSQL 실행은 이전 권한 거부 경로를 반복하지 않아 **미실행·미검증**이다. 실제 OAuth, 토큰 발급, provider 호출, 게시, 운영 SQL, 배포는 하지 않았다.

## 실행 환경과 보존

- 호스트: `bigmaegmun-ui-Macmini.local`, Darwin 25.6.0, arm64.
- 작업 경로: `/Users/bigmac_moon/Documents/Codex/2026-09-30/task-2/moonlight-threads-text`.
- 브랜치: `codex/gore-threads-text-test-1001`; HEAD `a595b624c4bbcd616cdf7b3b2500d6de3a983075`.
- 비교 대상: 사용자 지정 main 커밋 `8cbc0ab1`. 로컬 `main` ref는 `98d920c3`으로 오래돼 있어 비교에 사용하지 않았으며 ref를 변경하지 않았다.
- 시작 시 존재하던 변경/신규 파일 43개의 SHA-256을 기록했다. 그중 이번에 수정한 `scripts/database-readiness.mjs` 외에는 내용이 그대로다. 다른 작업자의 코드를 덮거나 통합하지 않았다.
- 빅맥에서만 수행했다. 별도 클라우드 환경, 새 작업트리, 설치, 의존성 복제, 원본 repo의 빌드는 사용하지 않았다.
- 기존 공유 node_modules가 참조하는 내부 패키지 5개(agent-contracts, goal-contracts, guru-guidance, supabase-rest, ui)의 55개 파일이 현 작업트리와 동일함을 확인했다. 공유 의존성은 수정하지 않았다.

## 결과 구분

| 항목 | 결과 | 증거·한계 |
|---|---|---|
| P2 이전 SQL을 감지하는 신규 readiness 회귀 | 수정 전 실패, 수정 후 통과 | private lease 반환 항목이 없는 함수도 기존 readiness는 통과시키는 누락을 재현 |
| 소셜/route/guard/readiness/no-mock 계약 검사 | 84/84 통과 | PostgreSQL 이름의 테스트는 명시적으로 제외. 숫자는 SQL 실행 증거가 아님 |
| Hub production build | 종료 코드 0, 경고 있음 | Next.js 16.3.8 webpack, 전체 Hub build 1회. 고래 작업트리 기준이며 main 8cbc0ab1 통합 빌드가 아님 |
| 새 route 산출물 | 확인 | `/api/social/meta/threads/test-post`가 dynamic route로 manifest와 빌드 목록에 존재 |
| 빌드된 route 직접 함수 검사 | 5건 통과 | GET 잘못된 ID, 세션 없는 server writer, cross-origin, 확인 누락, 정상 세션의 disabled gate. listener 없이 실행, network 시도 0건 |
| JS 구문·diff whitespace | 통과 | 이번 변경 두 JS 파일과 작업트리 diff 검사 |
| 실제 PostgreSQL SQL/RPC/CAS/RLS | 실행 안 함, 미검증 | 설치된 psql/initdb 17.10의 버전만 확인. 기존 거부된 initdb/pg_ctl/접속은 실행하지 않음 |
| 실제 grant/계정·운영 검증 | 실행 안 함, 미검증 | 운영 서비스·환경 설정도 변경하지 않음 |

빌드 ID는 `6s2N5wvmNuYn1Hfb6kJQh`, 새 route 파일 SHA-256은 `5243f6701ce9f9b4be6e127e435bfc638b739c47a77872f5043b7f7ebeb7a063`이다. `.next.gore-local-validation-1001`에 산출물을 분리했다. 이번 생성 캐시 417 MiB만 제거했고 route/manifest/bundle은 남겼다. 작업 전 약 10 GiB, 캐시 정리 후 약 10 GiB 여유다.

## 작은 보완

`scripts/database-readiness.mjs`의 0064 feature에 `'leaseExpiresAt',j.lease_expires_at` 및 `'leaseRemainingMs',greatest` marker를 추가했다. P2 서비스는 이 두 필드가 없으면 실행하지 않으므로, 준비 상태에서도 구 SQL을 미리 거부하도록 맞췄다. `scripts/gore-threads-readiness.test.mjs`는 현재 함수 본문과 private 반환 필드를 제거한 본문을 비교해 readiness 판정이 갈리는지 검사한다. 이는 기존 SQL의 `strpos(prosrc, marker)` 판정에 대한 모델이며 PostgreSQL 실행·권한 검증이 아니다.

## main 정합과 협의 사항

`HEAD..8cbc0ab1`과 현 고래 변경의 파일 교집합은 `scripts/database-readiness.mjs` 하나다. 실제 3-way 텍스트 병합은 끝부분 feature 추가 위치에서 충돌한다. main의 보고서 0061/0062 feature와 고래 0063/0064 feature를 모두 유지하면 조정 가능하다. 확인된 main migration 목록에는 0063/0064가 없어 이 커밋과 파일명 충돌은 없다. 운영 ledger나 이후 다른 작업 예약은 조회하지 않았으므로 실제 반영 전 재조율은 남는다.

작업트리에 main을 자동 병합하지 않았다. 증거 폴더의 `readiness-main-8cbc0ab1-proposal.mjs`는 main 0061/0062와 수정된 고래 0063/0064를 함께 담는 검토용 조정안이다. 중복/정렬 및 준비 상태 SELECT 생성만 검증했으며 적용본이 아니다.

빌드에서 `apps/hub/components/hub/pages/home.jsx:13`의 확장자 없는 `./home-morning-brief` import가 `.js` helper를 선택해 `HomeMorningBrief` export를 찾지 못한다는 경고가 나왔다. 실제 컴포넌트는 동명의 `.jsx`에 있다. 이 부분은 HEAD와 8cbc0ab1에서 같고 고래 변경에도 포함되지 않아 보존했다. 홈 담당자가 `.jsx` 명시 또는 파일명 분리를 검토할 사항이며, 빌드 종료 코드 0을 모든 화면 정상으로 해석하면 안 된다. Next의 기존 middleware→proxy deprecation 경고도 있다.

## PostgreSQL 미실행 근거

기존 `gore-lease-p2-static-filter-failure.log`에 2026-10-01 05:26:20 KST initdb의 `could not create shared memory segment: Operation not permitted`, 실패 syscall `shmget`이 남아 있다. 현재 동일 빅맥 sandbox와 기존 설치 도구에서 별도 허용된 격리 DB 검증 경로가 확인되지 않았다. 이 경로를 재시도하거나 elevated 실행·서비스 설정 변경·다른 DB 접속으로 우회하지 않았다. 이번 프로세스 목록 읽기도 `Operation not permitted`여서 반복하지 않았고, 빌드는 이 세션에서 한 번만 실행했다.

실제 SQL 문법·함수 실행·동시 세션 claim/lease/CAS·RLS와 service_role 권한은 여전히 검증해야 한다. 이 보고서의 정적/모델 검사를 그 대체 증거로 쓰면 안 된다.

## 명령과 증거

테스트는 비밀 없는 최소 환경에서 아래 범위로 실행했다.

```sh
node --import ./scripts/register-hub-alias.mjs --test --test-concurrency=2 --test-skip-pattern=PostgreSQL apps/hub/lib/gore-threads-test.test.mjs apps/hub/app/api/social/meta/threads/test-post/test-post.test.mjs apps/hub/app/api/social/gore-connection.test.mjs apps/hub/lib/hub-write-guard.test.mjs apps/hub/lib/route-access.test.mjs scripts/database-readiness.test.mjs scripts/no-mock-data.test.mjs scripts/gore-threads-readiness.test.mjs
NEXT_DIST_DIR=.next.gore-local-validation-1001 node node_modules/next/dist/bin/next build apps/hub --webpack
```

빌드는 최소 환경, `NEXT_TELEMETRY_DISABLED=1`, 4 GiB Node heap 상한 및 fetch 차단 preload를 함께 사용했다. 루트/Hub의 실제 env 파일이 없음을 파일명만 확인했고 비밀파일을 읽지 않았다.

증거 폴더: `/Users/bigmac_moon/Documents/Codex/2026-10-01/task-3/gore-local-validation/`.

- `baseline.json`: 호스트·경로·시작 상태·파일 해시.
- `readiness-regression-before.log`, `local-tests.log`: 수정 전 실패와 최종 84개 통과.
- `hub-build.log`, `built-route.json`, `built-route-smoke.log`: 경고를 포함한 build/산출물/직접 함수 검사.
- `main-compatibility.json`, `readiness-merge-review.txt`, `readiness-main-8cbc0ab1-proposal.mjs`: main 비교와 조정안.
- `validation-increment.patch`: 이번 작은 readiness 보완·회귀·보고서만 담은 증분. 이전 고래 패치 이후가 적용 기준이다.

새 exactly-once 보장은 추가하지 않았다. 마지막 lease 검사와 외부 전송 사이의 중단 및 이미 전송된 요청의 결과 유실 한계는 기존 P2 문서와 같다.
