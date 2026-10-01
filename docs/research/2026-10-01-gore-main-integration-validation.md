# Go;Re Threads — main 통합 로컬 검증

2026-10-01. 원격 main `8cbc0ab1cdb21bf090af16b472b89e4d066eb541`과 기존 소셜·고래·P2·readiness 패치를 합친 로컬 소스에서 **357개 회귀 검사와 Hub production build가 통과**했다. 실제 PostgreSQL과 provider 실행은 미검증이다. 기존 Home import 결함은 빌드를 통과하지만 화면 실행에 영향을 주므로 운영 준비 완료로 해석하면 안 된다.

관계: `2026-10-01-gore-local-runtime-validation.md`의 “main 미통합” 상태를 이 통합본에 한해 갱신한다. 원래 고래 작업트리·브랜치에는 main을 병합하지 않았다. 기존 기록의 테스트 수와 빌드 ID는 별도 실행 기록이다.

## 게시 준비 상태 — 추가 수정 중단

후속 사용자 지시에 따라 Home 수정은 착수 전 중단했다. Home 코드·테스트 변경은 없고, 추가 테스트/빌드도 실행하지 않았다. 아래 Home 오류는 known issue로 남는다. Preview의 블루 스크린·계정 불일치 증상과 같은 원인이라고 확인한 것은 아니다.

이 자료는 `8cbc0ab1cdb21bf090af16b472b89e4d066eb541`에 고정한 로컬 통합 결과다. 다른 컴퓨터/환경의 후속 작업이나 이후 원격 main은 통합하지 않았다. 357개 검사 및 build 통과를 현재 모든 환경의 최신 상태에 대한 검증으로 확대하지 않는다. 기존 패치와 소스는 보존하며 별도 브랜치 공유 준비만 한다.

- 기존 checkout에 설정된 origin: `https://github.com/Muuuuoouuun/moonlight_pro`.
- 예정 브랜치: `codex/gore-threads-main-integration-1001` (미생성).
- 예정 커밋: 이 보고서를 포함한 명시적 46개 파일. 증거 폴더의 `push-preparation.json`에 정확한 경로와 SHA-256을 기록한다.
- 원격 목적지 최종 확정 전 push하지 않는다. main 변경·병합·배포·운영 SQL·OAuth·게시도 실행하지 않는다.
- 기존 통합 패치는 보존한다. 보고서 상태 갱신을 포함한 게시 준비용 단일 패치는 `gore-main-8cbc0ab1-push-prepared.patch`로 따로 기록한다. 두 단일 패치를 중복 적용하지 않는다.

Home 오류를 해결하는 후속 최소 제품 변경은 `home.jsx`의 컴포넌트 import 한 줄이며, 아직 이 통합본에 포함하지 않는다. 고래 운영 최소 범위는 아래의 Hub·공유 REST 코드 및 0063/0064 SQL로 유지되고, 실제 PostgreSQL과 grant/게시/조회 검증은 여전히 미실행이다.

## 환경·보존

- 실행 호스트: `bigmaegmun-ui-Macmini.local`, Darwin 25.6.0 arm64. 빅맥 로컬에서만 실행했다.
- 원본: `/Users/bigmac_moon/Documents/Codex/2026-09-30/task-2/moonlight-threads-text`.
- 통합본: `/Users/bigmac_moon/Documents/Codex/2026-10-01/task-3/moonlight-main-gore-integration-1001`.
- 증거: `/Users/bigmac_moon/Documents/Codex/2026-10-01/task-3/gore-main-integration-validation`.
- 원격 main은 read-only `git ls-remote`로 확인했다. fetch/ref 변경, commit, push는 없었다.
- main의 약 68 MiB 추적 파일만 `git archive`로 격리했다. 새 clone/worktree 등록·reset·rebase를 하지 않았다.
- `gore-threads-text-full-pr20.patch` → `gore-lease-p2-fix.patch` → `validation-increment.patch` 순서로 적용했다. 별도 `gore-threads-text-step.patch`는 보존했으며 중복 적용하지 않았다.
- `scripts/database-readiness.mjs`만 main 기반으로 수동 조합했다. 그 외 패치 대상 44개 파일은 보존된 원본과 동일하다. 원본 45개 변경 파일·기존 패치 4개 SHA-256 및 branch/status가 검증 전후 일치한다.
- 기존 설치의 node_modules를 심볼릭 링크로 재사용했다. main은 내부 패키지를 바꾸지 않았고, 이전 검증에서 재사용 내부 패키지 5개/55개 파일의 원본 일치를 확인했다. 설치·의존성 복제는 없었다.
- Turbo를 거치지 않고 Hub 빌드 1회만 실행했다. `.turbo`는 생성되지 않았다. 이번 빌드 cache 약 418 MiB만 제거했고, 작은 검증 bundle/manifest는 남겼다. 정리 후 여유 약 9.75 GiB.

## 결과와 한계

| 항목 | 결과 | 근거·범위 |
|---|---|---|
| 합성·정적 회귀 | 357/357 통과, 실패 0 | 47개 파일. 소셜·고래·P2·guard·readiness·shared REST 및 main PR21 report/office 계약. `test-manifest.json`, `integration-tests.log` |
| Hub 통합 빌드 | exit 0, 경고 있음 | Next.js 16.3.8, `next build apps/hub --webpack`. `hub-integration-build.log` |
| 새 route 포함 | 통과 | `/api/social/meta/threads/test-post/route`가 app-paths manifest에 존재, dynamic Node route |
| 빌드된 route 직접 함수 검사 | 5건 통과 | 잘못된 GET ID, 세션 없는 writer, cross-origin, 명시 확인 누락, disabled gate. 네트워크 시도 0. `built-route-smoke.log` |
| Home 모듈 로딩 | 실패 재현, 기존 결함 | 아래 P2. `home-module-link-check.log`, `home-compiled-reference.txt` |
| 실제 PostgreSQL | 실행 안 함·미검증 | 이전 initdb 권한 거부 경로를 재시도하거나 우회하지 않음. SQL syntax/RPC/CAS/RLS 실행 증거가 아님 |
| OAuth·provider·운영 | 실행 안 함·미검증 | 실제 grant, 숫자 계정 ID, 토큰 발급, 게시, 운영 SQL, 배포 없음 |

테스트/빌드는 비밀 환경을 상속하지 않는 `env -i`와 fetch 차단 preload로 실행했다. 검사에서 사용하는 fetch는 합성 stub이다. PostgreSQL을 기동하는 `workflow-storage.postgres.test.mjs`, `report-documents-migration.test.mjs`는 대상에서 제외했고, readiness의 PostgreSQL 명명 검사는 `--test-skip-pattern=PostgreSQL`로 제외했다. 357은 전체 저장소 테스트나 실제 SQL 실행 수가 아니다. 직접 route 함수 검사는 HTTP listener/미들웨어를 통한 실브라우저 검증이 아니다.

## 기존 Home 결함 — P2

- 위치: `apps/hub/components/hub/pages/home.jsx:13`, 사용 위치 `:297`.
- 재현: `HomeMorningBrief`를 확장자 없이 import하면 `.js` helper가 선택된다. 실제 컴포넌트는 `.jsx`에만 있다. Home은 이 컴포넌트를 조건 없이 렌더한다.
- 빌드: 누락 export 경고 2회 후 exit 0. 실제 chunk에는 helper namespace의 `s.HomeMorningBrief` 참조가 남으며 이 export는 정의되지 않는다. 따라서 Home 렌더 시 React의 invalid element type 오류로 이어지는 경로다.
- 로컬 런타임: 기존 JSX 테스트 loader에 `next/*`의 Node `.js` 경로 보정만 추가한 모듈 import에서도 같은 줄의 missing named export `SyntaxError`를 재현했다. 첫 시도는 `next/navigation` Node 해석 문제로 중단됐고, 해당 경로만 보정한 재검사에서 본 결함을 확인했다. 실브라우저 화면은 실행하지 않았다.
- 귀속: Home 및 두 동명 파일은 main `8cbc0ab1`과 바이트 단위로 동일하다. 이번 소셜/고래 회귀가 아니다. Home 관련 단위 테스트는 `.jsx`를 직접 import하므로 이 부모 import 문제를 잡지 못한다.
- 작은 수정 방향: Home의 컴포넌트 import를 `./home-morning-brief.jsx`로 명시하고 부모 Home 로딩/렌더 회귀를 확인한다. 요청 범위에 따라 이번 통합 패치에는 수정하지 않았다.

middleware→proxy deprecation 경고도 기존 상태로 남았다. 이번 빌드를 막지 않았고 이 검증에서 별도 런타임 장애는 확인하지 않았다.

## Readiness·마이그레이션 통합

`scripts/database-readiness.mjs:128–140`에 아래 네 feature를 모두 보존했다.

1. main 0061 `report_archive_v1`의 uncertainties 및 `report_office_weeklies_v1`의 sourceCheck.
2. main 0062 `office_request_claim_v1`의 `office_weekly_content_deadline_v1`.
3. 고래 0063 OAuth allowlist의 `gore`.
4. 고래 0064 테이블/RPC/직접 쓰기 차단과 `expired-effect-lease`, `expectedVersion`, `leaseExpiresAt`, `leaseRemainingMs` 본문 marker.

main의 0061/0062 SQL 파일은 변경하지 않았다. 이 main 소스에는 0063/0064가 없어서 통합본의 0061–0064 파일 번호 충돌은 없다. 운영 migration ledger와 다른 작업자의 이후 번호 예약은 조회하지 않았으므로 적용 직전 다시 조율해야 한다. 오래된 번호의 기존 중복은 이번 범위 밖이며 손대지 않았다.

- `20261001_0063_gore_oauth_app_binding.sql`: 기존 `social_oauth_flows_app_key_check`에 gore 추가.
  SHA-256 `9b0f0d1943a76b850e3810c404144e157888e89699a011a3d1cde169a80dcaf3`.
- `20261001_0064_gore_threads_text_test_job.sql`: 고정 1건 job, RPC, lease/CAS와 공개 receipt 투영.
  SHA-256 `ef5695b3cce7c27fdf18c17458ea5bad48e821358e3000d6b6205d23c52d60a4`.

## 운영 반영 전 필요한 범위

통합 패치는 위 main에 적용할 **단일 패치**다. 기존 full/P2/increment 패치와 다시 중복 적용하지 않는다. 코드 24개, SQL 2개, 테스트 13개, 기존 문서 6개 및 이 보고서 1개다. 정확한 경로·SHA는 증거 폴더의 `integration-file-manifest.json`, 패치는 `gore-main-8cbc0ab1-integrated.patch`다.

실행 코드 범위는 Hub 소셜 callback/status·새 Threads test-post 및 YouTube refresh route, 소셜 설정 UI 3개, 계정/브랜드·토큰/업로드 readiness·Gore contract/service/adapter/repository, 공유 `packages/supabase-rest/index.js`, `scripts/database-readiness.mjs`다. 이 패치의 Engine 파일 변경은 없다. 공유 REST 패키지를 배포 아티팩트에 반영해야 하며, Hub 코드 배포만으로 SQL이 생기지 않는다.

필요한 운영 권한/설정은 별도 승인 단계다.

- SQL 0063/0064를 실행할 migration 권한과 기존 테이블/제약/RPC 변경 권한. 런타임은 `service_role` RPC EXECUTE이며 job 테이블 직접 쓰기는 service_role에도 revoke된다. anon/authenticated/public RPC 실행은 허용하지 않는다.
- 고래 전용 `COM_MOON_META_THREADS_GORE_APP_ID`/`COM_MOON_META_THREADS_GORE_APP_SECRET`, 올바른 HTTPS callback·대상 workspace/고래 brand 매핑. 값은 이번에 조회하거나 설정하지 않았다.
- 실제 `@go_re_startagain` OAuth grant와 `threads_basic`, `threads_content_publish`, 공급자가 반환한 숫자 계정 ID 확인. 로그인 세션·정확한 same-origin과 prepare/publish의 명시 확인이 필요하다. 일반 Hub write secret만으로 게시할 수 없다.
- `COM_MOON_THREADS_TEXT_TEST_ENABLED`는 기본 차단 상태를 유지했다. 실제 게시 단계에 별도 승인 후 설정해야 한다.
- 허용된 정상 로컬 PostgreSQL 경로에서 SQL/RPC 실행, 동시 claim·lease 만료/CAS·권한 실검증. 이어 운영 적용 직전 최신 main/번호/ledger 확인과 readiness 검증이 남는다.
- 실제 create/publish/조회 API 계약, 토큰/계정/앱 일치, post ID·permalink·본문 검증은 공급자와 실행하지 않았다. 본문 SHA-256은 `cefd7d31a8c445c8693c307f630b6462ddd8b19798665c27f4147293d8a1807e`로 고정이다.

P2의 POST 직전 10초 timeout+2초 여유 검사는 통합본에도 유지된다. 이미 전송된 외부 효과는 DB CAS로 취소할 수 없고 응답/저장 유실은 ambiguous로 멈추므로 **exactly-once를 보장하지 않는다**. 이 검증을 실게시 성공이나 운영반영 허가로 해석하지 않는다.
