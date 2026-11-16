# 브랜치 통합 기록 — 2026-11-16 (예약 실행)

- 대상: `claude/eager-pascal-s0khj6` (main은 건드리지 않음)
- 통합: `origin/main`(`ade8e4a`, PR #55)에서 `origin/claude/eager-pascal-cposf9`(`75fbe43`, 2026-11-15)로 fast-forward. 11-15 이후 새 원격 브랜치·커밋은 없었고, 이 팁이 main보다 앞선 원격 `claude/*`·`codex/*` 브랜치를 모두 포함한다. 충돌 없음.
- 미통합(운영자 결정 대기, 11-07부터 동일): `claude/inspiring-heisenberg-naw856` 2커밋 — 브랜드 아이콘 24px 선 아이콘 세트 안. 생성 이미지 타일(DESIGN.md §15 2026-10-21)과 반대 방향이라 운영자가 고르기 전에는 넣지 않는다.
- 원격 브랜치 삭제는 하지 않았다. `eager-pascal-*` 통합 브랜치가 하루 하나씩 쌓인다(원격에 24개, 각각 이전 것의 상위집합) — 이 브랜치를 main으로 PR 하고 오래된 것을 지울지는 운영자 결정이다.

## 고친 것

- 재시도 대기를 주입할 수 있게 했다. 운영 기본값은 그대로다.
  - `apps/hub/lib/office/engine-client.js` `callOfficeEngine`: `retryDelayMs`(기본 600). 시험은 0을 넘긴다.
  - `scripts/evaluate-legend-personas.mjs` `callApi`: `manifest.retryBaseMs`(기본 2000, 시도 번호만큼 곱함). 시험은 0을 넘긴다.
  - 두 시험이 진짜로 2.0s·1.8s를 자고 있었다. `apps/hub/lib/office/*` + 평가 스크립트 시험 묶음이 4.6s → 2.0s.
- `npm install`이 만드는 `package-lock.json` 변경(로컬 npm의 `libc` 필드 삭제)은 이번에도 넣지 않았다.

## 검증

| 항목 | 결과 |
|---|---|
| 루트 `npm test` (root, 클라우드 기본) | 6714 tests · 통과 6679 · 실패 6 · skip 29 — 실패 6건은 모두 `initdb: cannot be run as root`(환경) |
| 남은 경고 | `MockTimers` ExperimentalWarning 15건(Node 실험 API, 동작 영향 없음)만 |
| `npm run lint` · `check:contracts` · `turbo run typecheck --force` | 통과 |
| `apps/hub`·`apps/engine` `next build` | 둘 다 성공, 경고 없음 |

비 root PostgreSQL 실행은 이번엔 하지 않았다 — 방법은 [11-11 기록](branch-integration-2026-11-11.md).
