# Moonlight — Codex 지침

> 이 문서는 `CLAUDE.md`의 Codex용 사본이다. 규칙을 바꾸면 두 파일을 같은 커밋에서 함께 갱신한다. 내용이 다르면 `CLAUDE.md`가 정본이다.

## 프로젝트 개요
- Next.js App Router monorepo (`apps/hub`, `apps/engine`, `packages/*`) + TypeScript/JavaScript
- Supabase REST ledger 중심: Hub는 운영 판단 UI, Engine은 webhook/intake/실행 기록
- Hub(`/dashboard/**`)와 Engine(`/api/**`)이 현역 실행 표면이며, public web은 active workspace에서 분리됨
- `packages/*`: `supabase-rest`(Hub·Engine·gateway가 공유하는 단일 Supabase REST 클라이언트 `@com-moon/supabase-rest`), `hub-gateway`, `content-manager`, `ui`(공유 CSS 토큰 `--cm-*`와 구 TS 프리미티브 — Hub UI 프리미티브의 정본은 `apps/hub/components/hub/hub-primitives.jsx`), `mcp-server`(`.mcp.json`의 `moonlight` MCP 서버)
- 워크트리에서 `packages/*`를 고치면 그 워크트리 루트에서 `npm install`을 먼저 해야 dev/build에 반영된다

## 운영자 업무 기준
- 문서가 충돌하면 `docs/README.md`의 우선순위와 상태 지도를 먼저 따른다.
- 제품 기획, CRM, 우선순위, 캘린더, PMS, 자동화 작업 전에 `docs/operator-workflow-profile.md`를 읽는다.
- 문서의 `확정`, `권장`, `미정`을 구분하고, 권장안을 운영자의 확정 결정처럼 구현하지 않는다.
- 추가 업무 인터뷰는 현재 중단 상태다. 운영자가 요청하거나 Phase 1 실사용 결과가 생기면 문서의 `Q116`부터 한 번에 정확하고 짧은 질문 5개씩 진행한다.
- 최초 이관 뒤 Moonlight가 개인 업무 정본이고 ClassIn은 회사 공식 객체·공식 활동 요약의 정본이다. 개인 상세 메모를 ClassIn으로 복제하지 않는다.
- 제작 기획과 Phase 1 작업 전 `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`를 읽는다. 전제 1~7과 접근안 B는 승인됐고, Phase 0·1A는 완료, Phase 1B·1C는 부분 작동 상태다. 현재 상태표는 `docs/README.md` §3이 정본이다.
- 이 문서는 전체 제품 구조의 기준선일 뿐, 개별 주제의 최신 확정 스펙을 대신하지 않는다. 사이드바·내비게이션·PMS 분류·브랜드 탭처럼 자주 갱신되는 주제는 작업 전에 `docs/README.md` §4 "제품·운영 정본"에서 해당 주제의 가장 최근 스펙(파일명 날짜 기준)을 먼저 확인한다. 스펙 상단의 "관계" 헤더가 이전 스펙의 어느 절을 대체했는지 명시한다.

## 디자인 시스템
- UI 작업 전 루트 `DESIGN.md`를 전부 읽는다. 토큰·프리미티브·인터랙션·모션 계약의 정본이며, 아래 체크리스트는 그 요약이다.

## 코드 규칙
- 컴포넌트: `components/` — 페이지 전용이 아닌 경우만 분리
- Hub read API: `apps/hub/app/api/hub/` → `apps/hub/lib/repositories/` 사용
- Hub write/BFF API: `apps/hub/app/api/**`의 POST/PATCH 라우트는 `apps/hub/lib/hub-write-guard.js`를 거친다 — 브라우저는 same-origin 헤더, 서버 간 호출은 `COM_MOON_HUB_WRITE_SECRET`. 영속화는 `apps/hub/lib/server-write.js`가 `@com-moon/supabase-rest`에 위임한다
- Engine write/intake API: `apps/engine/app/api/` — 공개 POST는 shared secret 또는 provider secret 검증
- Hub → Engine 호출은 `COM_MOON_SHARED_WEBHOOK_SECRET`를 전달
- Supabase 없는 환경은 명시적 `preview`/empty state로 표시하고 mock과 live 데이터를 섞지 않음
- `apps/hub/components/hub/hub-app.jsx`의 `lazyPage`는 `ssr: false`가 필수 — 빼면 모든 대시보드 페이지가 "불러오는 중…"에서 멈춘다(콘솔 에러 없음)
- 테스트: 루트 `npm test`(node `--test`, `*.test.mjs` 동거). 루트 글롭은 `scripts/`·`apps/hub/lib/`·`packages/*` 1단계만 포함하므로 `apps/hub/components/hub/**`, `apps/engine/**`, `packages/mcp-server/src/`의 테스트는 `node --import ./scripts/register-hub-alias.mjs --test <파일>`로 직접 돌린다. CI(`.github/workflows/ci.yml`)도 같은 글롭이다

## UI 작업 시 필수 체크
- 색상: DESIGN.md 팔레트(토큰)만 사용 — 페이지 안 하드코딩 hex/rgba/oklch 금지, warm gold/그린/보라 금지. `--success`/`--warning`/`--info`로 카테고리나 일상 단계를 칠하지 않는다(DESIGN.md §5.2)
- 보더: 항상 `1px` + `--line*` 토큰 — 절대 두껍게 하지 않음. 상태 강조는 `--*-line` 좌측 inset 스트라이프
- 숫자: 큰 지표(≥18px)는 `.stat`(sans tabular), 계기 데이터(ID·타임스탬프·인라인 값)는 `.mono`, sans 소형 카운트는 `.num`
- 크기 플로어: 데이터 값 ≥12px, 보조 메타 ≥10.5px, 10px 미만 금지
- Primitives first: `SegmentedControl`·`EmptyState`·`Checkbox(label)`·`EditDrawer`·`Drawer`를 인라인 재구현 금지. 상태 표시는 `TruthBadge`·`AttentionRail`·`CertaintyBadge`·`LifecycleBadge`(DESIGN.md §8.2)로 선언하고, `SyncBadge`는 호환 래퍼이므로 새 호출처에서 쓰지 않는다
- 행 hover는 `.hub-row`, 카드형 클릭 타깃은 `.hub-card-link`, 칸반 카드는 `.hub-kanban-card` (JS onMouseEnter/Leave 신규 작성 금지)
- 모션: `--dur-hover`/`--dur-enter`/`--dur-panel`/`--dur-overlay`·`--ease-hub`·`--stagger-step` 토큰과 `.fade-up`/`.stagger-up`만 사용 — 페이지 안 raw ms 리터럴 금지 (DESIGN.md §9)
- 내비: 사이드바 앵커는 `hub-nav.js`(+ `hub-nav.test.mjs`), ⌘K 카탈로그는 `hub-data.js`의 `NAV_TREE`, 워크스페이스 소속은 `workspace-map.js` — `NAV_TREE`에 넣어도 사이드바 행은 생기지 않는다
- 인터랙션 계약(생성 N 단축키·ESC/오버레이 닫기·딥링크·정렬 3단 토글)은 DESIGN.md §8.1 준수
- 반응형: 모바일 우선. 허브에는 Tailwind가 없다 — 브레이크포인트는 `hub-tokens.css`/`globals.css`의 미디어쿼리와 인라인 스타일로 처리한다. 세그먼트 토글은 모바일에서도 가로 유지 (flex-basis:100% 자식 강제 금지)

## 디자인 레퍼런스 (awesome-design-md)
> UI 컴포넌트 작업 시 아래 브랜드 DESIGN.md를 참고 레퍼런스로 활용할 것

- Linear (허브 다크 서피스 기준) → `design-system/references/linear.app/DESIGN.md`
- Apple (쿨 실버 정밀 기기 느낌) → `design-system/references/apple/DESIGN.md`
- Vercel (흑백 정밀 타이포) → `design-system/references/vercel/DESIGN.md`
- Cursor (다크 개발 도구 밀도) → `design-system/references/cursor/DESIGN.md`
- Raycast (다크 크롬 + 그라디언트 액센트) → `design-system/references/raycast/DESIGN.md`
- Stripe (프리미엄 SaaS 공공 표면) → `design-system/references/stripe/DESIGN.md`

## UI/UX Pro Max 스킬 (검색 사용법)
> 컴포넌트 설계 전 아래 명령으로 최적 패턴 검색. 스크립트는 `.agents/skills/ui-ux-pro-max/scripts/search.py`(Claude·Codex 공용, git 추적)

```bash
# 스타일 검색 (어떤 UI 스타일이 맞는지)
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "dark dashboard minimal" --domain style

# 색상 팔레트 검색
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "SaaS operational dark" --domain color

# 타이포그래피 추천
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "precision instrument mono" --domain typography

# 랜딩 페이지 패턴
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "trust authority conversion" --domain landing

# UX 가이드라인
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "data table status badge" --domain ux
```

## 브랜치·Git 협업
- `main`: 프로덕션. CI push 트리거는 `main`·`codex/**`뿐이라 그 밖의 브랜치는 PR을 열어야 CI가 돈다
- `codex/*`: Codex 작업 브랜치 · `claude/*`: Claude Code 워크트리 브랜치 · `real_v*`: 운영자 통합 브랜치
- 고정된 "현재 작업 브랜치"를 문서에 적지 않는다. 작업 시작 시 Git 상태를 직접 확인한다.
- 메인 워크트리는 여러 세션이 동시에 쓴다. 여러 파일에 걸친 기능·리팩터는 전용 worktree(`git worktree add ../moonlight_pro-<slug> -b <branch>`)에서 시작하고, 병합 뒤 `git worktree remove`까지 마친다(2026-07-16 운영자 확정). 1~2줄 수정과 조사는 예외
- `git add -A`·`git commit -am` 금지 — 내가 만진 파일만 명시 경로로 stage하고, 커밋 직후 `git show --stat`으로 ±라인이 편집 규모와 맞는지 확인한다. `foo 2.jsx`처럼 " 2"가 붙은 중복 파일이 보이면 동기화 충돌부터 의심한다

## Skill routing

요청이 아래 스킬에 해당하면 다른 도구보다 먼저 해당 스킬(`~/.codex/skills/<이름>/SKILL.md`)을 읽고 그 워크플로를 따른다. 즉흥 답변보다 스킬의 절차가 더 나은 결과를 낸다. Codex 설치 이름은 `gstack-` 접두어가 붙는다.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → `gstack-office-hours`
- Bugs, errors, "why is this broken", 500 errors → `gstack-investigate`
- Ship, deploy, push, create PR → `gstack-ship`
- QA, test the site, find bugs → `gstack-qa` (report-only: `gstack-qa-only`)
- Code review, check my diff → `gstack-review`
- Update docs after shipping → `gstack-document-release`
- Weekly retro → `gstack-retro`
- Design system, brand → `gstack-design-consultation`
- Visual audit, design polish → `gstack-design-review`
- Architecture review → `gstack-plan-eng-review`
- Code quality / health check, save-or-resume checkpoint → Codex에는 해당 스킬(`health`, `context-save`/`context-restore`)이 설치돼 있지 않다. 직접 처리한다.
