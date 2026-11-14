# 브랜치 통합 기록 — 2026-11-14 (예약 실행)

- 대상: `claude/eager-pascal-ogd5zz` (main은 건드리지 않음)
- 통합: `origin/main`(`ade8e4a`)에서 `origin/claude/eager-pascal-qzq8a5`(`fed0151`, 2026-11-12)로 fast-forward. 11-12 이후 새 원격 브랜치·커밋은 없었고, 이 팁이 main보다 앞선 원격 `claude/*`·`codex/*` 브랜치를 모두 포함한다. 충돌 없음.
- 미통합(운영자 결정 대기, 11-07·11-11·11-12와 동일): `claude/inspiring-heisenberg-naw856` 2커밋 — 브랜드 아이콘 24px 선 아이콘 세트 안. 생성 이미지 타일(DESIGN.md §15 2026-10-21)과 반대 방향.
- 원격 브랜치 삭제는 하지 않았다. 통합 브랜치가 쌓이고 있으니(`eager-pascal-*` 20여 개, 각각 이전 것의 상위집합) main으로 PR을 열지, 오래된 것을 지울지는 운영자 결정이다.

## 고친 것

- `packages/project-delivery`에 `package.json`(`"type": "module"`, 워크스페이스 `@com-moon/project-delivery`)을 더했다. 가장 가까운 `package.json`이 루트라 Node가 `index.ts`를 CommonJS로 읽다 실패한 뒤 ESM으로 다시 파싱했고, 시험 실행마다 `MODULE_TYPELESS_PACKAGE_JSON` 경고가 49번 찍혔다. 이제 `npm test` 경고는 56 → 7건(남은 7건은 `packages/content-manager`). 가져오는 경로(상대 경로 `.../packages/project-delivery/index.ts`)는 그대로다. `package-lock.json`은 워크스페이스 링크 8줄만 더했다(로컬 npm 버전의 `libc` 필드 삭제 변경은 넣지 않음).
- `content-manager`는 고치지 않았다: `index.ts`·`card-news/index.ts`가 확장자 없는 경로(`./card-news`, `./generator`)를 가져와, `"type": "module"`을 붙이면 Node ESM 해석과 Engine `transpilePackages` 빌드가 깨질 수 있다. 고치려면 가져오기 경로에 확장자를 붙이는 작업이 먼저다.

## 검증

| 항목 | 결과 |
|---|---|
| 루트 `npm test` (root, 클라우드 기본, 수정 전·후 같음) | 6714 tests · 통과 6679 · 실패 6 · skip 29 — 실패 6건은 모두 `initdb: cannot be run as root`(환경) |
| `npm run lint` · `check:contracts` · `turbo run typecheck --force` | 통과 (lint 1975파일 0건) |
| `apps/hub`·`apps/engine` `next build` | 둘 다 성공 |

비 root PostgreSQL 실행은 이번엔 하지 않았다 — 방법은 [11-11 기록](branch-integration-2026-11-11.md).
