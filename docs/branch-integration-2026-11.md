# 브랜치 통합 기록 — 2026-11 (예약 실행 누적)

> 11-07부터 하루 한 파일씩 쌓이던 기록(`branch-integration-2026-11-07·11·12·14·15·16.md`)을 2026-11-17에 이 파일 하나로 합쳤다. 원본은 git 이력에 남아 있다. 이후 예약 실행도 아래 "날짜별"에 한 줄 묶음으로 덧붙인다.

## 늘 같은 것

- **main은 건드리지 않는다.** 예약 실행은 매번 새 `claude/eager-pascal-*` 브랜치에 직전 통합 팁을 fast-forward 하고 push 한다. 각 브랜치는 이전 것의 상위집합이다(원격에 20개 넘게 쌓임). 최신 것을 main으로 PR 할지, 오래된 `eager-pascal-*`를 지울지는 **운영자 결정**이라 하지 않았다.
- **미통합(운영자 결정 대기, 11-07부터):** `claude/inspiring-heisenberg-naw856` 2커밋 — 브랜드 아이콘을 24px 선 아이콘 세트로 바꾸는 안. 현재 생성 이미지 타일 결정(DESIGN.md §15 2026-10-21)과 반대 방향이고 `brand-icons.test.mjs`·`DESIGN.md`에서 충돌한다.
- main 이하(ahead 0)라 병합할 것이 없는 정리 후보: `depth-neumorph`, `design-1021`, `eager-pascal-2b0sgi·6so5a3·ixx5vd·wpjld4`, `peaceful-thompson-g42gwq`, `relaxed-dirac-18j0cc`, `review-fixes-ab`, `sweet-cerf-ul0nc6`, `today-bottom-options`, ahead 0인 `codex/*`. 삭제하지 않았다.
- `npm install`이 만드는 `package-lock.json` 변경(로컬 npm 버전의 `libc` 필드 삭제)은 넣지 않는다.

### 클라우드 컨테이너에서 PostgreSQL 시험 돌리는 법

컨테이너는 root로 실행되고 `initdb`는 root를 거부한다. 11-17부터 실제 PostgreSQL을 띄우는 시험은 root일 때 모두 `initdb refuses to run as root`로 skip한다(그 전엔 6건이 실패로 찍혔다). 실제로 돌리려면:

```bash
mkdir -p /tmp/pgnobody && chmod 777 /tmp/pgnobody
runuser -u nobody -- env HOME=/tmp/pgnobody TMPDIR=/tmp/pgnobody \
  PATH="/usr/lib/postgresql/16/bin:$PATH" npm test
```

각 시험은 임시 디렉터리에 Unix socket 전용 클러스터를 만들고 지운다 — 운영 DB에 접속하지 않는다.

## 날짜별

| 날짜 · 브랜치 | 통합 | 고친 것 | 검증 |
|---|---|---|---|
| 11-07 `jlz5b2` | `eager-pascal-bacouu`(`d7e0212`)로 ff — main에서 갈라진 원격 브랜치 대부분 포함 | — | root `npm test` 6714 · 실패 6(전부 root `initdb`) |
| 11-11 `tks5yb` | `95d2fo`(`0fd7041`)로 ff — 원격 20개 포함, 충돌 없음 | — | 비 root + PG16 **6817 · 실패 0 · skip 14**, 데스크톱 471 · 실패 0, lint·contracts·typecheck·Hub/Engine build 통과(데스크톱 Windows 패키징만 `wine` 없음) |
| 11-12 `qzq8a5` | `tks5yb`(`0051f95`)로 ff — 22개 포함 | `office-codex-provider.test.mjs` abort 픽스처가 SIGTERM 처리기를 준비 신호보다 먼저 건다(부하 중 경합) | 비 root 수정 전 실패 1 → 수정 뒤 0, 데스크톱 실패 0 |
| 11-14 `ogd5zz` | `qzq8a5`(`fed0151`)로 ff | `packages/project-delivery`를 ESM 워크스페이스로(`MODULE_TYPELESS_PACKAGE_JSON` 경고 56 → 7) | root 실패 6(환경), build 통과 |
| 11-15 `cposf9` | `ogd5zz`(`a39da95`)로 ff — 24개 포함 | `packages/content-manager`를 ESM으로, 확장자 없던 다시 내보내기 두 곳에 `.ts`(경고 7 → 0) | root 실패 6(환경), build 통과 |
| 11-16 `s0khj6` | `cposf9`(`75fbe43`)로 ff | `callOfficeEngine` `retryDelayMs`·Legend 평가 `retryBaseMs` 주입 — 재시도 시험이 실제로 ~3.8s 자던 것 제거(운영 기본값 그대로) | root 실패 6(환경), build 통과 |
| 11-17 `8wme6f` | `s0khj6`(`12b774b`)로 ff. 11-16 이후 새 원격 브랜치·커밋 없음 | PostgreSQL 시험 6파일(`agent-command-database`·`inquiry-database`·`content-performance-restore`·`ai-assistance`·`office/workflow-storage`·`database-readiness`)에 root skip 가드 — 이미 `threads-publish-jobs`가 쓰는 줄과 같다. 11월 일일 기록 6개를 이 파일로 합침 | 아래 |
| 11-18 `0ghs0v` | `8wme6f`(`0f83d57`)로 ff. 11-17 이후 새 원격 커밋 없음(fetch로 새로 보인 `codex/*` 5개는 모두 이미 포함), `inspiring-heisenberg-naw856`은 계속 대기 | 코드 수정 없음 — 가장 느린 시험(`icon-registry` 2.3s, TS 검사기)도 정당한 비용이라 손대지 않음. `npm audit fix`는 hono 외에 `@capacitor/cli`의 glob 13→14 등 무관한 메이저까지 바꿔 되돌림 | 아래 |
| 11-19 `ipng6u` | `0ghs0v`(`921e1bc`)로 ff. 11-18 이후 새 원격 커밋 없음, `inspiring-heisenberg-naw856`은 계속 대기 | 코드 수정 없음 | 아래 |

### 2026-11-17 검증

| 항목 | 결과 |
|---|---|
| 루트 `npm test` (root, 수정 전) | 6714 tests · 통과 6679 · 실패 6 · skip 29 — 실패 6건 모두 `initdb: cannot be run as root` |
| 루트 `npm test` (root, 수정 후) | 6714 tests · 통과 6679 · **실패 0** · skip 35 (6건이 root skip으로 바뀜) |
| 루트 `npm test` (비 root + PostgreSQL 16, 수정 전) | **6817 tests · 통과 6803 · 실패 0 · skip 14** |
| 수정한 6파일 비 root 단독 | 70 tests 전부 실제 실행·통과(skip 0) |
| `npm run lint` · `check:contracts` · `turbo run typecheck --force` | 통과 (lint 1975 파일 0건) |
| `apps/hub`·`apps/engine` `next build` | 둘 다 성공, 경고 없음 — 단 첫 실행은 아래 보안 안내로 멈췄다 |

### 보안 안내 — Next.js 16.4.2 (운영자 결정 필요)

11-17부터 `next build` 첫 실행이 `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability`로 멈추고 업그레이드를 권한다(같은 명령을 다시 돌리면 빌드는 끝까지 성공한다). `npm audit` 기준 해당 권고는 **GHSA-mfr8-8qww-v76h**(moderate, `>=16.3.0 <=16.4.4`, `'use cache'` 함수를 `unstable_cache()`로 부를 때 root params 정보 노출)이고 수정 버전은 **16.4.6**(semver 패치)이다. 저장소에는 `'use cache'`·`unstable_cache` 사용이 없어 직접 영향은 확인되지 않았다. Hub·Engine의 `next`를 16.4.6으로 올리는 것은 의존성·락 파일 변경이라 이번 예약 실행에서는 하지 않았다. Vercel 빌드가 같은 안내로 멈추는지는 확인하지 않았다.

### 2026-11-18 검증

| 항목 | 결과 |
|---|---|
| 루트 `npm test` (root) | 6714 tests · 통과 6679 · **실패 0** · skip 35 (2분) — 11-17과 같음 |
| `npm run lint` · `check:contracts` | 통과 (lint 1975 파일 0건) |
| `npm audit --omit=dev` | moderate 3건: `next` 16.4.2(위 GHSA-mfr8-8qww-v76h + 새 **GHSA-vc7v-qv4w-wrv8** — 중첩 `'use cache'` 캐시 누출, 같은 16.4.6에서 수정), 그리고 **새로** `hono` 4.13.13 5건(≤4.13.15, 최신 4.13.19) |

### 보안 안내 — hono (운영자 결정 필요, 11-18 추가)

`hono`는 직접 의존성이 아니라 `@modelcontextprotocol/sdk@1.32.2`(Hub·`packages/mcp-server`)가 끌고 오는 전이 의존성이다. 권고 5건은 `mount()`·RegExpRouter 와일드카드 미들웨어·`css` 헬퍼·`csrf()`·`validator('form')` 문제인데, 저장소는 hono를 직접 import하지 않고 `packages/mcp-server/src/http.js`도 `node:http` + SDK의 `StreamableHTTPServerTransport`만 쓰므로 해당 기능 사용은 확인되지 않았다. `npm audit fix`가 관련 없는 패키지 메이저까지 함께 올려 이번에는 넣지 않았다. 고치려면 루트 `package.json`의 `overrides`에 `"hono": "^4.13.19"`를 두거나 SDK를 올리는 쪽이 범위가 좁다.

### 2026-11-19 검증

| 항목 | 결과 |
|---|---|
| 루트 `npm test` (root) | 6714 tests · 통과 6679 · **실패 0** · skip 35 — 11-18과 같음 |
| `npm run lint` · `check:contracts` | 통과 (lint 1975 파일 0건) |
| `npm audit --omit=dev` | moderate 3패키지, 11-18과 같은 상태. 위에 이름이 빠졌던 셋째 패키지는 `@hono/node-server` 1.19.17(≤2.1.2, GHSA-rmxm-3fg6-px4f·GHSA-jpvv-r467-5p4w) — 역시 `@modelcontextprotocol/sdk`가 끌고 오는 전이 의존성이고 직접 import 없음. 최신 `next` 16.4.6·`hono` 4.13.19·`@hono/node-server` 2.1.9. 세 건 모두 의존성 변경이라 운영자 결정 대기 |
