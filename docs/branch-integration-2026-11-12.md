# 브랜치 통합 기록 — 2026-11-12 (예약 실행)

- 대상: `claude/eager-pascal-qzq8a5` (main은 건드리지 않음)
- 통합: `origin/main`(`ade8e4a`, PR #55)에서 `origin/claude/eager-pascal-tks5yb`(`0051f95`, 2026-11-11)로 fast-forward. 이 팁이 main보다 앞선 원격 `claude/*`·`codex/*` 브랜치 22개를 모두 포함한다(11-11 기록의 20개 + `eager-pascal-95d2fo`·`eager-pascal-tks5yb`). 충돌 없음.
- 미통합(운영자 결정 대기, 11-07·11-11과 동일): `claude/inspiring-heisenberg-naw856` 2커밋 — 브랜드 아이콘 24px 선 아이콘 세트 안. 생성 이미지 타일(DESIGN.md §15 2026-10-21)과 반대 방향.
- 원격 브랜치 삭제는 하지 않았다.

## 고친 것

- `scripts/office-codex-provider.test.mjs` `abort-cleanup` 픽스처: 준비 신호(`reasoning`)를 SIGTERM 처리기보다 먼저 내보내, 부하 중에는 처리기 설치 전에 abort가 닿아 기본 동작으로 죽었다(`exitCode null !== 0`, 비 root 전체 실행에서 1회 재현). 처리기를 먼저 걸고 신호를 내보내도록 순서만 바꿨다. 제품 코드 변경 없음.

## 검증

| 항목 | 결과 |
|---|---|
| 루트 `npm test` (root, 클라우드 기본) | 6714 tests · 통과 6679 · 실패 6 · skip 29 — 실패 6건은 모두 `initdb: cannot be run as root`(환경) |
| 루트 `npm test` (비 root + PostgreSQL 16, 수정 전) | 6817 tests · 통과 6802 · 실패 1 · skip 14 — 위 픽스처 경합 1건 |
| 수정 뒤 해당 파일 단독 반복 | 3회 모두 실패 0 |
| 데스크톱 `npm --workspace @com-moon/desktop test` | 471 tests · 통과 467 · 실패 0 · skip 4 |
| `npm run lint` · `check:contracts` · `typecheck` | 통과 |

비 root PostgreSQL 실행법은 [11-11 기록](branch-integration-2026-11-11.md)을 따른다.
