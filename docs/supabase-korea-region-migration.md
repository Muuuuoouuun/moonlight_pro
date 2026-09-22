# Supabase 한국 리전 이전 — 실행 기록과 런북

> **완료: 2026-09-20.** `rwqefdxalmbrkybxqwxj`(싱가포르 `ap-southeast-1`) → `ncgpnqfulnlshegalmbd`(서울 `ap-northeast-2`)
> 운영자 확정: 데이터 전부 이관 · 로컬 전용 개발 프로젝트 분리 · 구 프로젝트는 백업으로 보존

## 1. 결과

| 항목 | 결과 |
|---|---|
| 스키마 | 테이블 71 · 함수 29 · 인덱스 181 |
| 데이터 | 1368행, 71개 테이블 **전부 행 수 일치** |
| 함수 실행 권한 | 원본과 완전 일치 (교정 51건 적용) |
| `npm run db:check` | 7개 기능 전부 PASS |
| 앱 읽기 | `status: live` · `source: supabase` |
| 앱 쓰기 | 빠른 입력 → Engine → 서울 DB 왕복 확인 |
| REST 지연 | **150ms → 57ms** (동일 측정 방식, 중앙값 126→57, 편차 92\~240 → 42\~71) |

## 2. 왜 마이그레이션 재생이 아니라 덤프 복제인가

- `supabase/migrations` 45개는 번호가 7쌍 충돌한다(`0003`·`0004`·`0012`·`0013`·`0014`·`0018`·`0025`).
- `setup/00_live_schema.sql` 은 기본 41개 테이블만 만들고 2026-09에 추가된
  `inquiries`·`journal_notes`·`content_revisions`·`agent_jobs`·`discovery_nudge_states` 가 없다.
- 빈 DB에 처음부터 적용해 성공한 기록이 없었다.
- 반면 운영 프로젝트는 실제로 동작하던 상태이므로 그 스키마가 정본이다.

## 3. 실행

```bash
export MOONLIGHT_SOURCE_DB_URL='postgresql://postgres.<구ref>:<pw>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
export MOONLIGHT_TARGET_DB_URL='postgresql://postgres.<신ref>:<pw>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'

npm run db:move-region preflight   # 연결·버전·대상 비어있음
npm run db:move-region dump        # → .migration-dump/
npm run db:move-region restore     # 스키마 → 데이터 → 권한 교정
npm run db:move-region verify      # 테이블별 행 수 대조
```

세부 단계도 따로 부를 수 있다: `restore-schema` · `restore-data` · `reconcile-privileges`.

**연결 문자열 주의.** 직결(`db.<ref>.supabase.co`)은 IPv6 전용이므로 IPv4 환경에서는 **Session pooler** 를 쓴다.
pooler 호스트의 `aws-0`/`aws-1` 접두사는 프로젝트마다 다르다 — 추측하지 말고 대시보드
Connect → Direct → Session pooler 에서 확인한다. (실제로 구=`aws-1`, 신=`aws-0` 이었다.)

## 4. 실행 중 실제로 부딪힌 4가지 — 전부 스크립트에 반영됨

1. **`CREATE SCHEMA "public"` 충돌** — 대상 Supabase 프로젝트에는 public 스키마가 이미 있다.
   적용 직전에만 `IF NOT EXISTS` 로 바꾼다(덤프 자체는 원본의 충실한 사본으로 남긴다).
2. **플랫폼 함수 충돌** — Supabase 가 만들어 두는 `public.rls_auto_enable()`(이벤트 트리거
   `ensure_rls` 에 연결)이 원본 덤프에도 들어 있다. 대상 것이 더 최신일 수 있으므로 덮어쓰지 않고
   건너뛴다. 스크립트는 **대상에 이미 있는 public 함수를 일반적으로 건너뛴다.**
3. **`ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"`** — 플랫폼 소유 역할이라 우리 postgres
   역할로는 못 바꾼다(permission denied). 기본 권한은 *앞으로 만들어질* 객체에만 적용되고 대상에는
   같은 플랫폼 기본값이 이미 서 있으므로 건너뛴다. `FOR ROLE "postgres"` 12건은 적용한다.
4. **`--disable-triggers` 불가** — `ALTER TABLE ... DISABLE TRIGGER ALL` 이 FK 시스템 트리거를 건드려
   슈퍼유저를 요구하는데 Supabase 의 postgres 역할은 슈퍼유저가 아니다. 대신 복원 트랜잭션에서
   `session_replication_role = replica` 를 쓴다(순환 FK: `profiles`↔`workspaces`, `inquiries`).
   덤으로 `set_updated_at` 같은 앱 트리거도 멈춰 **원본 타임스탬프가 그대로 보존된다.**

### 가장 중요한 함정 — 함수 실행 권한 회귀

Supabase 는 public 스키마에 `ALTER DEFAULT PRIVILEGES FOR ROLE postgres ... GRANT ALL ON FUNCTIONS
TO anon, authenticated` 를 걸어 둔다. 그래서 **복원으로 만들어진 모든 RPC 가 anon 실행 가능 상태로
태어난다.** 덤프의 `REVOKE ALL ... FROM PUBLIC` 은 PUBLIC 유사권한만 지우고 anon/authenticated 에
준 *명시적* GRANT 는 지우지 못한다.

이번 이관에서 RPC 29개 중 **25개가 anon·authenticated 실행 가능으로 넘어갔고** `db:check` 가 잡았다.
`reconcile-privileges` 단계가 원본과 대상의 함수 권한을 대조해 차이를 자동 교정한다(이번엔 51건).
이 단계는 멱등하며 `restore` 에 포함된다.

> `pg_dump --no-privileges` 를 쓰면 이 문제가 조용히 더 커진다. 권한은 반드시 덤프에 포함한다.
> (`--no-owner` 는 유지한다 — 소유 역할은 프로젝트마다 다를 수 있다.)

## 5. 이관 후

- `apps/hub/.env.local` · `apps/engine/.env.local` 의 `SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_URL`·
  `SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_ANON_KEY`·`NEXT_PUBLIC_SUPABASE_ANON_KEY` 교체 완료.
  구 값은 각 줄 위에 `# 구 싱가포르 값:` 주석으로 남겼고 `.env.local.pre-kr-*` 백업도 있다.
- `COM_MOON_DEFAULT_WORKSPACE_ID` 가 신 DB 의 실제 `workspaces.id` 와 일치함을 확인했다
  (`11111111-1111-1111-1111-111111111111` · Com_Moon OS).
- **Vercel 환경 변수는 아직 교체하지 않았다.** 배포 전에 같은 5개 값을 바꿔야 한다.
- 구 싱가포르 프로젝트는 **삭제하지 않았다.** 롤백 경로로 살려 둔다.

## 6. 로컬 개발 DB (미완)

조직 플랜이 **free** 라 활성 프로젝트 상한이 2개이고 현재 구·신 프로젝트가 그 2칸을 쓰고 있다.
로컬 전용 프로젝트를 만들려면 구 싱가포르 프로젝트를 **pause** 해 칸을 비워야 한다
(pause 는 데이터를 보존하며 되돌릴 수 있다 — 2026-09-19 자동 pause 때 실제로 보존됐다).
운영자가 서울 DB 실사용에 충분히 확신이 선 뒤 진행한다.

더미 데이터는 그 개발 DB에만 넣고 **코드에는 넣지 않는다.** `scripts/no-mock-data.test.mjs` 가
저장소 전체를 훑어 목업 식별자와 업무 레코드형 하드코딩 배열을 막으므로, "로컬에만 보이고
배포에는 안 보인다"가 런타임 분기가 아니라 구조로 보장된다.

## 7. 정리할 것

- `.env.migration.local` (DB 연결 문자열, gitignore 대상) — 이관 확정 후 삭제
- `.migration-dump/` (스키마·데이터 덤프) — 롤백 필요 없다고 판단되면 삭제
- `apps/*/.env.local.pre-kr-*` 백업

## 8. 연결 설정 재발 점검 (2026-09-21)

메인 체크아웃의 루트·Hub·Engine `.env.local`이 구 싱가포르 주소를 가리켜
DNS `ENOTFOUND`, 프로젝트 조회 502, 빠른 입력 연결 실패가 발생했다.
서울 프로젝트의 키와 워크스페이스를 확인한 뒤 세 파일을 교체하고 서버를 재시작했다.
과거 이관 완료 기록만으로 현재 체크아웃의 환경 설정까지 보장되지는 않는다.

- `npm run check:runtime`: Next의 개발 환경 변수 우선순위로 루트·Hub·Engine을 읽고
  URL·서버 키·워크스페이스·공유 비밀키 불일치를 검사한다. 각 DB에서 워크스페이스를
  읽기만 하며 요청당 5초로 제한한다. 키 원문은 출력하지 않고 실패 시 종료 코드 1을 반환한다.
- `npm run db:check`: 연결 복구 뒤 기능별 스키마·권한을 확인한다.
- 설정 변경 뒤 해당 체크아웃의 Hub·Engine을 재시작하고 두 `/api/health` 및
  `/api/hub/projects`의 `status: live`를 확인한다. `check:runtime`은 디스크·셸의 설정 검사이며
  이미 떠 있는 프로세스가 어느 설정을 로드했는지 대신 증명하지 않는다.
- 워크트리에는 `.env.local`이 Git으로 복사되지 않는다. 사용할 DB를 확인해 설정을 준비한다.
  다른 워크트리에서 실행 중인 서버의 포트·작업 디렉터리와 혼동하지 않는다.

`npm test`는 파일 동시 실행을 2개로 제한한다. macOS에서 기본 CPU 수만큼 DB 통합
테스트를 동시에 띄우면 PostgreSQL의 공유 메모리 한도를 소진해
`could not create shared memory segment: No space left on device`가 발생할 수 있다.
테스트 범위와 DB 검사는 유지하고 병렬도만 제한한다.
