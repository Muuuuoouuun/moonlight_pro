# Moonlight — Claude Code 지침

## 프로젝트 개요
- Next.js App Router monorepo (`apps/hub`, `apps/engine`) + TypeScript/JavaScript
- Supabase REST ledger 중심: Hub는 운영 판단 UI, Engine은 webhook/intake/실행 기록
- Hub(`/dashboard/**`)와 Engine(`/api/**`)이 현역 실행 표면이며, public web은 active workspace에서 분리됨

## 운영자 업무 기준
- 문서가 충돌하면 `docs/README.md`의 우선순위와 상태 지도를 먼저 따른다.
- 제품 기획, CRM, 우선순위, 캘린더, PMS, 자동화 작업 전에 `docs/operator-workflow-profile.md`를 읽는다.
- 문서의 `확정`, `권장`, `미정`을 구분하고, 권장안을 운영자의 확정 결정처럼 구현하지 않는다.
- 추가 업무 인터뷰는 현재 중단 상태다. 운영자가 요청하거나 Phase 1 실사용 결과가 생기면 문서의 `Q116`부터 한 번에 정확하고 짧은 질문 5개씩 진행한다.
- 최초 이관 뒤 Moonlight가 개인 업무 정본이고 ClassIn은 회사 공식 객체·공식 활동 요약의 정본이다. 개인 상세 메모를 ClassIn으로 복제하지 않는다.
- 제작 기획과 Phase 1 작업 전 `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`를 읽는다. 전제 1~7과 접근안 B는 승인됐고 Phase 0는 완료됐다. Phase 1A의 변동 상태와 live 활성화 게이트는 `docs/status/current-state.md`를 정본으로 따른다.

## 디자인 시스템
@DESIGN.md

## 코드 규칙
- 컴포넌트: `components/` — 페이지 전용이 아닌 경우만 분리
- Hub read API: `apps/hub/app/api/hub/` → `apps/hub/lib/repositories/` 사용
- Engine write/intake API: `apps/engine/app/api/` — 공개 POST는 shared secret 또는 provider secret 검증
- Hub → Engine 호출은 `COM_MOON_SHARED_WEBHOOK_SECRET`를 전달
- Supabase 없는 환경은 명시적 `preview`/empty state로 표시하고 mock과 live 데이터를 섞지 않음

## UI 작업 시 필수 체크
- 색상: DESIGN.md 팔레트(토큰)만 사용 — 페이지 안 하드코딩 hex/rgba/oklch 금지, warm gold/그린/보라 금지
- 보더: 항상 `1px` + `--line*` 토큰 — 절대 두껍게 하지 않음. 상태 강조는 `--*-line` 좌측 inset 스트라이프
- 숫자: 큰 지표(≥18px)는 `.stat`(sans tabular), 계기 데이터(ID·타임스탬프·인라인 값)는 `.mono`, sans 소형 카운트는 `.num`
- 크기 플로어: 데이터 값 ≥12px, 보조 메타 ≥10.5px, 10px 미만 금지
- Primitives first: `SegmentedControl`·`SyncBadge`·`EmptyState`·`Checkbox(label)`·`EditDrawer`를 인라인 재구현 금지
- 행 hover는 `.hub-row` 클래스 (JS onMouseEnter/Leave 신규 작성 금지)
- 인터랙션 계약(생성 N 단축키·ESC/오버레이 닫기·딥링크·정렬 3단 토글)은 DESIGN.md §8.1 준수
- 반응형: 모바일 우선. 세그먼트 토글은 모바일에서도 가로 유지 (flex-basis:100% 자식 강제 금지)

## 디자인 레퍼런스 (awesome-design-md)
> UI 컴포넌트 작업 시 아래 브랜드 DESIGN.md를 참고 레퍼런스로 활용할 것

- Linear (허브 다크 서피스 기준) → `design-system/references/linear.app/DESIGN.md`
- Apple (쿨 실버 정밀 기기 느낌) → `design-system/references/apple/DESIGN.md`
- Vercel (흑백 정밀 타이포) → `design-system/references/vercel/DESIGN.md`
- Cursor (다크 개발 도구 밀도) → `design-system/references/cursor/DESIGN.md`
- Raycast (다크 크롬 + 그라디언트 액센트) → `design-system/references/raycast/DESIGN.md`
- Stripe (프리미엄 SaaS 공공 표면) → `design-system/references/stripe/DESIGN.md`

## UI/UX Pro Max 스킬 (검색 사용법)
> 컴포넌트 설계 전 아래 명령으로 최적 패턴 검색

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

## 브랜치 구조
- `main`: 프로덕션
- `codex/*`: Codex 작업 브랜치
- 고정된 "현재 작업 브랜치"를 문서에 적지 않는다. 작업 시작 시 Git 상태를 직접 확인한다.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
