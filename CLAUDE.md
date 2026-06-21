# Moonlight — Claude Code 지침

## 프로젝트 개요
- Next.js App Router monorepo (`apps/hub`, `apps/engine`) + TypeScript/JavaScript
- Supabase REST ledger 중심: Hub는 운영 판단 UI, Engine은 webhook/intake/실행 기록
- Hub(`/dashboard/**`)와 Engine(`/api/**`)이 현역 실행 표면이며, public web은 active workspace에서 분리됨

### 사이드바 3-Workspace 구조 (real_v1)
Hub 사이드바는 `apps/hub/components/hub/workspace-map.js`(SSOT)에 정의된 3개 워크스페이스로 구성됨:
- **클래스인** — 사용자 자신의 교육/클래스 비즈니스 (코호트, 수강생, 강의 결제). 브랜드: `classmoon`, `studyseagull`. ⚠️ Hub의 client 계정 `클래스인`(회사 딜)과 이름이 같으나 다른 개념
- **회사** — 에이전시·제품 회사 운영. 브랜드: `bridgemaker`, `moonpm`, `politicofficer`
- **브랜드 업무** — 브랜드/콘텐츠/퍼블리싱. 브랜드: `sinabro`, `gore`, `holyfuncollector`, `22nomad`

IA 순서: Daily Brief (전역) → 클래스인 → 회사 → 브랜드 업무 → Agents → Work → System
브랜드 재배치는 `workspace-map.js`의 `brands` 배열 하나만 수정하면 됨

## 디자인 시스템
@DESIGN.md

## 코드 규칙
- 컴포넌트: `components/` — 페이지 전용이 아닌 경우만 분리
- Hub read API: `apps/hub/app/api/hub/` → `apps/hub/lib/repositories/` 사용
- Engine write/intake API: `apps/engine/app/api/` — 공개 POST는 shared secret 또는 provider secret 검증
- Hub → Engine 호출은 `COM_MOON_SHARED_WEBHOOK_SECRET`를 전달
- Supabase 없는 환경은 명시적 `preview`/empty state로 표시하고 mock과 live 데이터를 섞지 않음

### 주요 Hub 클라이언트 모듈
- `hub-app.jsx` — 루트 앱, PAGE_MAP 등록, 워크스페이스 라우팅
- `workspace-map.js` — 브랜드→워크스페이스 매핑 SSOT
- `hub-data.js` — NAV_TREE, 데이터 모델
- `council-client.js` — Brand Council 클라이언트 (콘텐츠 심의 + 브랜드 보이스 검토)
- `guru-client.js` — Sales Guru 멘토 에이전트 클라이언트 (리드 코칭 + 360 컨텍스트)
- `hub-primitives.jsx` — 디자인 시스템 기본 컴포넌트 (Badge, Card, Button 등)

### Sales OS 데이터 레이어
- `leads` 테이블: 리드 + `leads.score` 스코링 필드
- `work_orders` 테이블: 에이전트 작업 지시 큐
- `agent_runs` 테이블: 에이전트 실행 기록
- `lead_intake_raw` 테이블: 명함/소스별 원시 유입 데이터
- 명함 intake 파이프라인: Gemini vision extract → staging → promote to leads

## UI 작업 시 필수 체크
- 색상: DESIGN.md 팔레트만 사용 (warm gold/그린/보라 금지, 문스톤 `#5274a8` 액센트)
- 보더: `1px solid rgba(12,16,24,0.08)` (light) / `rgba(255,255,255,0.07)` (dark) — 절대 두껍게 하지 않음
- 허브 카드 배경: `rgba(255,255,255,0.04~0.07)` — 흰 배경 절대 금지
- 반응형: 모바일 우선, `sm:` / `lg:` 브레이크포인트

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
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "dark dashboard minimal" --domain style

# 색상 팔레트 검색
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "SaaS operational dark" --domain color

# 타이포그래피 추천
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "precision instrument mono" --domain typography

# 랜딩 페이지 패턴
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "trust authority conversion" --domain landing

# UX 가이드라인
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "data table status badge" --domain ux
```

## 브랜치 구조
- `main`: 프로덕션
- `real_v1`: 현재 주력 개발 브랜치 — 3-workspace IA, Sales OS, Brand Council, Guru 포함
- `codex/*`: Codex 에이전트 작업 브랜치

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
