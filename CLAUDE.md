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
- 색상: DESIGN.md 팔레트만 사용 (파랑/보라 금지, Classin Green `#084734` 액센트)
- 보더: `1px solid rgba(0,0,0,0.08)` — 절대 두껍게 하지 않음
- 섹션 배경 교차: `#FFFFFF` ↔ `#F6F5F4` ↔ `#ECFDF5`
- 반응형: 모바일 우선, `sm:` / `lg:` 브레이크포인트

## 브랜치 구조
- `main`: 프로덕션
- `codex/Bae`: 현재 파트너 포털 + 어드민 개발 브랜치
