# 브랜치 통합 기록 — 2026-11-07 (예약 실행)

- 대상: `claude/eager-pascal-jlz5b2` (main은 건드리지 않음)
- 통합: `origin/claude/eager-pascal-bacouu` (= `gcc0qg`와 동일 커밋 `d7e0212`)로 fast-forward. 이 팁이 main에서 갈라진 `claude/*`·`codex/*` 원격 브랜치 대부분(eager-cannon-ky5f0c, eager-pascal-49hy9o·57gnq1·8n0dgv·dxsjz8·meo1bk·t8k9y1·wvz08e·x0dx8w·xqev6t, festive-hawking-h107y3, office-tab-a, youthful-einstein-vxhg61, codex/sidebar-transition-20261023, codex/tab-flow-audit-20261027)를 이미 포함한다.
- 미통합: `claude/inspiring-heisenberg-naw856` — 브랜드 아이콘을 24px 선 아이콘 세트로 교체하는 안(2026-10-21)이라, 통합 팁의 생성 이미지 타일 결정(DESIGN.md §15 2026-10-21)과 `brand-icons.test.mjs`·`DESIGN.md`에서 충돌한다. 어느 쪽을 쓸지는 운영자 결정이라 병합하지 않았다.
- 나머지 원격 브랜치는 main 이하(ahead 0)라 병합할 것이 없다. 정리 후보: `depth-neumorph`, `design-1021`, `eager-pascal-2b0sgi·6so5a3·ixx5vd·wpjld4`, `peaceful-thompson-g42gwq`, `relaxed-dirac-18j0cc`, `review-fixes-ab`, `sweet-cerf-ul0nc6`, `today-bottom-options`, `codex/*` 중 ahead 0인 것 (삭제는 하지 않음).
- 검증: 루트 `npm test` 6714 tests · 통과 6679 · 실패 6 · skip 29. 실패 6건은 모두 실제 PostgreSQL을 띄우는 시험이며 클라우드 컨테이너가 root라 `initdb`가 거부한다(환경 실패, 코드 회귀 아님).
