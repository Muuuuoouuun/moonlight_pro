# PostgreSQL 격리 시험 환경 차단 — 2026-10-27

검증 코드 commit: `c9b39333540fd0e07f8c92441d403cd4a00586f4`. 이후 변경은 보고서뿐이다. [최종 동선 검수](2026-10-27-today-project-connections.md)의 DB 실패 20건을 추가 요청에 따라 재확인했다.

## 확인한 원인과 실행 전제

- `initdb`, `pg_ctl`, `psql`, `postgres`가 `/opt/homebrew/bin/`에 설치돼 있고 네 바이너리 모두 PostgreSQL **17.11 (Homebrew)** 버전 조회에 성공했다. 설치나 외부 서비스가 없어 실패한 경우가 아니다.
- 해당 20개 시험은 기존 서비스에 접속하지 않고 각자 새 임시 디렉터리에 `initdb`를 실행하고, Unix socket 전용 서버를 올린 후 종료·정리한다. TCP 운영 DB를 사용하지 않는다. 비 root 사용자, 실행 가능한 바이너리, 임시 경로 쓰기 및 OS의 공유 메모리 할당 여유가 필요하다.
- 관련 시험은 자식 프로세스에 `LC_ALL=C` 또는 기존 locale을 설정한다. 로그의 initdb는 locale C/UTF8 단계까지 진행했으며, locale 누락이나 바이너리 미발견이 이번 원인이 아니다.
- 모든 실패 로그가 initdb bootstrap의 **`FATAL: could not create shared memory segment: No space left on device`**, **`shmget(size=56)`**를 포함한다. 업무 스키마·migration·트랜잭션 assertion을 실행하기 전 실패했다.
- 읽기 전용 확인에서 할당된 SysV shared memory segment **32개**, `kern.sysv.shmmni=32`, `kern.sysv.shmseg=8`이었다. 전역 segment 수가 한계에 도달한 상태다. PostgreSQL 자체 HINT도 디스크 부족이 아니라 shared memory ID/한계 문제라고 설명한다. 타 세션의 segment 내용·소유자는 수집하거나 삭제하지 않았다.
- 이 20개 시험 파일은 기준 main `ade8e4ab`와 바이트 변경이 없다. 같은 초기화 단계와 같은 OS 오류로 실패하고 있어 UI 변경에 의한 assertion 회귀라는 증거는 없다. 다만 SQL 검증을 실행하지 못했으므로 DB 동작 정상까지 입증한 것은 아니다.

## 안전한 재검증 결과

기존 설치 바이너리로 아래 20개 파일만 `node --import ./scripts/register-hub-alias.mjs --test --test-concurrency=1 <20개 파일>`로 순차 실행했다. 파일 안의 동거 시험을 포함해 **41개 중 21 pass / 20 fail / 0 skipped / 0 cancelled**, 7.1초에 종료했다. 20개 모두 같은 shared memory 오류다. 프로세스가 멈추거나 테스트를 취소한 상태가 아니다.

별도 격리 DB 연결 환경변수(`CONTENT_WORKFLOW_TEST_DATABASE_URL`, `PG_TEST_URL`, `TEST_DATABASE_URL`, `TEST_DB_URL`, `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`)는 설정되지 않았다. 실패한 20개 시험 자체에도 외부 DB URL override가 없다. 따라서 알 수 없는 기존 DB를 시험 DB로 대체하거나 하네스를 임의 개조하지 않았다. 원래 시험이 사용하는 임시 클러스터 생성으로만 재시도했다.

상태: **환경 차단 / DB 검증 미완료**. 승인 거부가 아니며 운영 DB·서비스·보안 설정·credential을 변경하지 않았다. 복구에는 다른 작업자가 자기 자원을 정상 해제한 뒤 공유 메모리 여유가 생기거나, 별도로 승인된 OS 환경 조정/깨끗한 실행 환경이 필요하다. 커널 한계 변경, 다른 프로세스 종료, 타 세션 shared memory 삭제, 새 설치는 실행하지 않았다. 전체 suite 통과로 표시하지 않는다.

## 실패한 시험 이름

| 파일 | 시험 |
|---|---|
| `apps/engine/lib/agent-command-database.test.mjs` | agent command PostgreSQL transaction contract |
| `apps/engine/lib/content-performance-restore.postgres.test.mjs` | revision restore preserves current performance in real PostgreSQL |
| `apps/engine/lib/inquiry-database.test.mjs` | atomic inquiry PostgreSQL transactions |
| `apps/engine/lib/task-focus-cap.postgres.test.mjs` | concurrent task updates cannot select a fourth focus task |
| `apps/hub/lib/ai-assistance.postgres.test.mjs` | AI candidate transactions preserve receipt, source version, workspace and review history |
| `apps/hub/lib/calendar-outcomes-postgres.test.mjs` | calendar outcomes migration enforces unique identity, CAS and private access |
| `apps/hub/lib/daily-review-postgres.test.mjs` | daily review PostgreSQL migration, atomic writes and permissions |
| `apps/hub/lib/discovery-nudge-postgres.test.mjs` | discovery nudges in real PostgreSQL |
| `apps/hub/lib/discovery-postgres.test.mjs` | discovery atomic PostgreSQL saves, target checks, audit and permissions |
| `apps/hub/lib/goals-postgres.test.mjs` | operating goals PostgreSQL contract and security |
| `apps/hub/lib/office/workflow-storage.postgres.test.mjs` | Office PostgreSQL receipts, retention and task application share real command transaction rules |
| `apps/hub/lib/sales-os/contact-outcome-reactionless.postgres.test.mjs` | record_contact_outcome_v1 saves reactionless channels and keeps conversation channels strict |
| `scripts/ai-usage-log-migration.test.mjs` | 0052 applies through the migration history executor on real PostgreSQL |
| `scripts/apply-migrations.test.mjs` | migration ledger and DDL commit or roll back together in PostgreSQL |
| `scripts/brand-research-backfill-migration.test.mjs` | 0054 fills blanks, keeps operator input and confirmed identities, and is idempotent (real PostgreSQL) |
| `scripts/database-readiness.test.mjs` | readinessSql runs read-only on PostgreSQL and tells old and new versions apart |
| `scripts/finance-migration.test.mjs` | finance import is atomic/idempotent, review uses revisions, and public roles cannot read |
| `scripts/report-documents-migration.test.mjs` | report ledger persists immutable facts, replays requests, serializes weekly identity and scopes decisions |
| `scripts/research-inbox-migration.test.mjs` | research migration provides scoped, replayable, atomic promotion on PostgreSQL |
| `scripts/research-runs-migration.test.mjs` | research PostgreSQL claims serialize and replay model results without mutating reviewed drafts |

## 로컬 증거

작업 폴더 `../today-project-evidence/`에 `postgres-failures.json`(파일·이름·초기화 오류·main 동일 여부), `postgres-retry-environment.json`(버전·shared memory 수/한계), `postgres-serial-retry.log`, `postgres-serial-retry-result.json`을 저장했다. 원래 전체 검사는 `final-tests.log`다. 운영 credential 값은 조회·출력하지 않았다.

부수 도구 제한: sandbox 안의 `ps -axo pid,command` 프로세스 전체 조회는 `operation not permitted`로 denied였고 우회 재시도하지 않았다. 직접 만든 Next 개발 서버 두 개와 합성 QA 프록시 한 개는 기존 세션 핸들로 정상 종료했다. 보고서를 Codex 패널에서 여는 호출은 `source chat file executor unavailable`로 열리지 않았으며, 산출물은 실제 로컬 파일과 링크로 전달한다. 이 두 제한은 코드·검수·commit 완성을 막지 않았다. 자동 승인 검토가 변경을 거부한 사례는 없다.
