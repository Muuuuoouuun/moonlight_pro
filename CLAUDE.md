# Classin Web — Claude Code 지침

## 프로젝트 개요
- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (인증, DB), Recharts (차트), Lucide (아이콘)
- 관리자(`/admin`), 파트너 포털(`/partner`), 랜딩 페이지(`/`)

## 디자인 시스템
@DESIGN.md

## 코드 규칙
- 컴포넌트: `components/` — 페이지 전용이 아닌 경우만 분리
- 관리자 API: `app/api/admin/` — `verifyAdmin()` 필수
- 파트너 API: `app/api/partner/` — `verifyPartner()` 필수
- 데이터 레이어: `lib/repositories/` — DB 접근은 여기서만
- Supabase 없는 환경: `data/*.json` 폴백 사용

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
- `codex/Bae`: 현재 파트너 포털 + 어드민 개발 브랜치

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
