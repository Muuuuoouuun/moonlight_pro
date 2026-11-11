# 브랜치 통합 기록 — 2026-11-11 (예약 실행)

- 대상: `claude/eager-pascal-tks5yb` (main은 건드리지 않음)
- 통합: `origin/claude/eager-pascal-95d2fo`(`0fd7041`, 2026-11-10)로 fast-forward. 이 팁이 main에서 앞선 원격 `claude/*`·`codex/*` 브랜치 20개(eager-cannon-ky5f0c, eager-pascal-3h2826·49hy9o·57gnq1·8n0dgv·bacouu·dxsjz8·gcc0qg·jlz5b2·meo1bk·t8k9y1·wvz08e·x0dx8w·xqev6t·y0ymjz, festive-hawking-h107y3, office-tab-a, youthful-einstein-vxhg61, codex/sidebar-transition-20261023, codex/tab-flow-audit-20261027)를 모두 포함한다. 충돌 없음, 새 코드 변경 없음.
- 미통합(운영자 결정 대기, 2026-11-07과 동일): `claude/inspiring-heisenberg-naw856` 2커밋 — 브랜드 아이콘을 24px 선 아이콘 세트로 바꾸는 안. 현재 팁의 생성 이미지 타일(DESIGN.md §15 2026-10-21)과 반대 방향이라 병합하지 않았다.
- 나머지 17개 원격 브랜치는 main 이하(ahead 0)다. 정리 후보 목록은 [2026-11-07 기록](branch-integration-2026-11-07.md)과 같고 삭제는 하지 않았다.

## 검증

| 항목 | 결과 |
|---|---|
| 루트 `npm test` (root 사용자, 클라우드 기본) | 6714 tests · 통과 6679 · 실패 6 · skip 29 — 실패 6건은 모두 `initdb: cannot be run as root` |
| 루트 `npm test` (비 root + PostgreSQL 16) | **6817 tests · 통과 6803 · 실패 0 · skip 14** — 실제 PostgreSQL 시험 포함 |
| 데스크톱 `npm --workspace @com-moon/desktop test` | 471 tests · 통과 467 · 실패 0 · skip 4 |
| `npm run lint` · `check:contracts` · `typecheck` | 통과 (1975 파일 · 0 issues) |
| `npm run build` | Hub·Engine 성공. 데스크톱 Windows 패키징만 `wine` 없음으로 실패(환경) |

## 클라우드 컨테이너에서 PostgreSQL 시험 돌리는 법

컨테이너는 root로 실행되고 PostgreSQL 바이너리가 PATH에 없어, 기본 `npm test`에서는 DB 시험 6건이 실패하고 나머지는 skip된다. 아래처럼 돌리면 전부 실제로 실행된다(2026-11-07 기록의 "환경 실패" 6건이 코드 회귀가 아님을 이번에 실행으로 확인).

```bash
mkdir -p /tmp/pgnobody && chmod 777 /tmp/pgnobody
runuser -u nobody -- env HOME=/tmp/pgnobody TMPDIR=/tmp/pgnobody \
  PATH="/usr/lib/postgresql/16/bin:$PATH" npm test
```

각 시험은 임시 디렉터리에 Unix socket 전용 클러스터를 만들고 지운다 — 운영 DB에 접속하지 않는다.
