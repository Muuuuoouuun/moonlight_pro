# 브랜치 통합 기록 — 2026-11-15 (예약 실행)

- 대상: `claude/eager-pascal-cposf9` (main은 건드리지 않음)
- 통합: `origin/main`(`ade8e4a`, PR #55)에서 `origin/claude/eager-pascal-ogd5zz`(`a39da95`, 2026-11-14)로 fast-forward. 11-14 이후 새 원격 브랜치·커밋은 없었고, 이 팁이 main보다 앞선 원격 `claude/*`·`codex/*` 브랜치 24개를 모두 포함한다. 충돌 없음.
- 미통합(운영자 결정 대기, 11-07부터 동일): `claude/inspiring-heisenberg-naw856` 2커밋 — 브랜드 아이콘 24px 선 아이콘 세트 안. 생성 이미지 타일(DESIGN.md §15 2026-10-21)과 반대 방향이라 운영자가 고르기 전에는 넣지 않는다.
- 원격 브랜치 삭제는 하지 않았다. `eager-pascal-*` 통합 브랜치가 하루 하나씩 쌓이고 각각이 이전 것의 상위집합이다 — 이 브랜치를 main으로 PR 하고 오래된 `eager-pascal-*`를 지울지는 운영자 결정이다.

## 고친 것

- `packages/content-manager`를 ESM 패키지로 표시했다(11-14 기록이 남긴 숙제). `package.json`에 `"type": "module"`, 확장자 없던 두 다시 내보내기를 `./card-news/index.ts`·`./generator.ts`로, `tsconfig.json`에 `allowImportingTsExtensions`(이미 `noEmit`). 이제 `npm test`의 `MODULE_TYPELESS_PACKAGE_JSON` 경고가 7 → 0건이다. 앱이 가져오는 하위 경로(`editorial-criteria`·`format-prompts`·`reels-script`)는 그대로이고, 루트·`card-news` 진입점은 Node에서 직접 불러 확인했다.
- `npm install`이 만드는 `package-lock.json` 변경(로컬 npm 버전의 `libc` 필드 60줄 삭제)은 이번에도 넣지 않았다 — 이번 수정은 락 파일 변경이 필요 없다.

## 검증

| 항목 | 결과 |
|---|---|
| 루트 `npm test` (root, 클라우드 기본, 수정 전·후 같음) | 6714 tests · 통과 6679 · 실패 6 · skip 29 — 실패 6건은 모두 `initdb: cannot be run as root`(환경) |
| `MODULE_TYPELESS_PACKAGE_JSON` 경고 | 7 → 0 |
| `npm run lint` · `check:contracts` · `turbo run typecheck --force` | 통과 (`content-manager` 포함 4개 작업) |
| `apps/hub`·`apps/engine` `next build` | 둘 다 성공 (Engine은 `transpilePackages`로 `content-manager`를 묶는다) |

비 root PostgreSQL 실행은 이번엔 하지 않았다 — 방법은 [11-11 기록](branch-integration-2026-11-11.md).
