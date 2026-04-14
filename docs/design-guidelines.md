# Com_Moon Design Guidelines

> Moon Design System — Black · Silver · White  
> 최소주의(Minimalism) 기반, 한국어 우선, Pretendard 서체

---

## 1. 철학

| 원칙 | 내용 |
|------|------|
| **Minimal** | 필요한 것만 화면에 존재한다. 장식은 제거한다. |
| **Korean-first** | 기본 언어는 한국어. 영어 전환 가능. |
| **Legible** | 어두운 배경보다 밝은 배경 위 어두운 텍스트. 대비율 AAA 목표. |
| **Touchable** | 모바일 44px 터치 타깃. PWA-ready. |
| **Coherent** | 컬러, 간격, 폰트 토큰은 이 문서가 단일 출처. |

---

## 2. 색상 시스템

### 2.1 코어 팔레트

| 토큰 | Hex | 용도 |
|------|-----|------|
| `moon-black` | `#0F0F0F` | 기본 텍스트, 프라이머리 버튼 배경 |
| `moon-dark` | `#1A1A1A` | 호버 상태, 진한 강조 |
| `moon-dark-2` | `#2D2D2D` | 액티브/프레스 상태 |
| `silver` | `#9BA8B5` | 보조 강조, 메타데이터, silver 버튼 |
| `silver-dark` | `#4B5563` | 본문 보조 텍스트 |
| `muted` | `#6B7280` | 라벨, 플레이스홀더 |
| `surface` | `#F8F8F9` | 페이지 배경, 인풋 배경 |
| `surface-alt` | `#F0F0F2` | 호버 배경, 교차 섹션 |
| `white` | `#FFFFFF` | 카드 배경, 버튼 보조 배경 |
| `border` | `rgba(0,0,0,0.08)` | 카드 테두리, 구분선 |
| `border-strong` | `rgba(0,0,0,0.15)` | 인풋 테두리, secondary 버튼 |
| `danger` | `#DC2626` | 오류, 삭제 액션 |
| `danger-hover` | `#B91C1C` | danger 호버 |

### 2.2 시맨틱 토큰

| 역할 | 토큰 | 적용 |
|------|------|------|
| 페이지 배경 | `surface` `#F8F8F9` | `<body>`, 페이지 래퍼 |
| 컴포넌트 배경 | `white` `#FFFFFF` | 카드, 패널, 드롭다운 |
| 주요 텍스트 | `moon-black` `#0F0F0F` | 제목, 본문 |
| 보조 텍스트 | `muted` `#6B7280` | 설명, 날짜, 라벨 |
| 액센트 | `silver` `#9BA8B5` | 상태 배지, 부가 정보 |
| 경계선 | `border` `rgba(0,0,0,0.08)` | 카드·섹션 구분 |

### 2.3 금지 패턴

```
❌ 파랑 계열 (#3B82F6, #60A5FA) — 브랜드 컬러 아님
❌ 보라 계열 (#7C3AED) — 브랜드 컬러 아님
❌ 초록 계열 (Classin Green #084734) — 이 프로젝트에서 사용 안 함
❌ 순수 검정 #000000 텍스트 — #0F0F0F 사용
❌ 2px 이상 테두리 — 1px border만 허용 (bordered variant 제외)
❌ 그라디언트 배경 — 단색 사용
```

---

## 3. 타이포그래피

### 3.1 서체

```css
font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

- **Pretendard** — 기본 서체. 한국어/영문 동시 지원.  
  CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css`
- 한국어 기본, 영어 전환 가능 (`lang="ko"` / `lang="en"`)
- `antialiased` 렌더링 필수

### 3.2 타입 스케일

| 토큰 | Size | Line-height | Weight | Tailwind | 용도 |
|------|------|-------------|--------|----------|------|
| `xs` | 10px | 1.5 | 400–500 | `text-[10px]` | 배지, 캡션, 초소형 라벨 |
| `sm` | 12px | 1.5 | 400–500 | `text-xs` | 메타, 날짜, 서브 라벨 |
| `base-sm` | 14px | 1.57 | 400 | `text-sm` | 본문 소, 인풋 텍스트 |
| `base` | 16px | 1.625 | 400 | `text-base` | 기본 본문 |
| `lg` | 18px | 1.556 | 500–600 | `text-lg` | 카드 제목 |
| `xl` | 20px | 1.4 | 600 | `text-xl` | 섹션 헤딩 |
| `2xl` | 24px | 1.333 | 700 | `text-2xl` | 페이지 제목 |
| `3xl` | 30px | 1.267 | 700 | `text-3xl` | KPI 수치, 히어로 |

### 3.3 웨이트 규칙

| Weight | Tailwind | 용도 |
|--------|----------|------|
| 400 | `font-normal` | 본문, 설명 |
| 500 | `font-medium` | UI 라벨, 버튼 |
| 600 | `font-semibold` | 서브헤딩, 카드 제목 |
| 700 | `font-bold` | 페이지 제목, KPI 수치 |

### 3.4 Letter-spacing

- 제목: `tracking-tight` (-0.025em)
- 소문자 라벨/캡션: `tracking-wide` (0.05em) + 대문자 (`uppercase`)
- 배지/슈퍼스크립트: `tracking-widest` (0.1em)

---

## 4. 간격 시스템

**베이스 단위: 4px**. 모든 spacing은 4의 배수.

| 토큰 | px | rem | Tailwind | 용도 |
|------|----|-----|----------|------|
| `xs` | 4 | 0.25 | `p-1` / `gap-1` | 아이콘 패딩, 밀착 간격 |
| `sm` | 8 | 0.5 | `p-2` / `gap-2` | 컴팩트 요소 내부 |
| `md` | 16 | 1.0 | `p-4` / `gap-4` | 기본 컴포넌트 패딩 |
| `lg` | 24 | 1.5 | `p-6` / `gap-6` | 카드 패딩, 섹션 gap |
| `xl` | 32 | 2.0 | `p-8` / `gap-8` | 페이지 패딩 |
| `2xl` | 48 | 3.0 | `p-12` / `gap-12` | 섹션 간 수직 간격 |

---

## 5. 컴포넌트 토큰

### 5.1 Border Radius

| 토큰 | 값 | Tailwind | 용도 |
|------|-----|----------|------|
| `sm` | 4px | `rounded` (default) | 인풋 필드 |
| `md` | 8px | `rounded-lg` | 버튼, 뱃지, 소형 카드 |
| `lg` | 12px | `rounded-xl` | 카드, 패널 |
| `xl` | 16px | `rounded-2xl` | 미리보기 패널, 모달 |
| `full` | 9999px | `rounded-full` | 아바타, pill 뱃지 |

### 5.2 그림자

| 토큰 | 값 | 용도 |
|------|-----|------|
| `sm` | `0 1px 2px rgba(0,0,0,0.06)` | 카드 기본 부양감 |
| `DEFAULT` | `0 2px 8px rgba(0,0,0,0.08)` | 일반 카드 |
| `md` | `0 4px 16px rgba(0,0,0,0.10)` | 드롭다운, elevated 카드 |
| `lg` | `0 8px 24px rgba(0,0,0,0.12)` | 모달, 오버레이 |

### 5.3 테두리 규칙

```
기본:    1px solid rgba(0,0,0,0.08)
강조:    1px solid rgba(0,0,0,0.15)
Primary: 2px solid #0F0F0F  (bordered variant에만)
입력:    focus:ring-1 focus:ring-[#1A1A1A]
```

---

## 6. 모션 토큰

| 토큰 | Duration | Easing | 용도 |
|------|----------|--------|------|
| `fast` | 100ms | `ease-out` | 클릭 피드백, 마이크로인터랙션 |
| `default` | 150ms | `ease-in-out` | 버튼 hover, 색상 전환 |
| `medium` | 250ms | `ease-in-out` | 카드 hover, 확장/축소 |
| `slow` | 350ms | `ease-in-out` | 페이지 전환, 모달 |

**규칙:**
- `width` / `height` / `layout` 속성 애니메이션 금지 (성능)
- `transform` + `opacity`만 애니메이션
- Tailwind: `transition-all`, `transition-shadow`, `transition-colors`, `duration-150`

---

## 7. 컴포넌트 사용 가이드

### Button (`packages/ui/button.tsx`)

```tsx
// 올바른 사용
<Button variant="primary" size="md">저장</Button>
<Button variant="secondary" size="sm">취소</Button>
<Button variant="ghost">돌아가기</Button>
<Button variant="silver">보조 액션</Button>
<Button variant="danger">삭제</Button>
<Button variant="primary" loading>처리 중...</Button>
<Button variant="primary" leftIcon={<PlusIcon />}>추가</Button>

// 잘못된 사용
<button className="bg-blue-500 ...">저장</button>       // ❌ 브랜드 컬러 아님
<Button style={{ background: "green" }}>저장</Button>   // ❌ 인라인 색상 오버라이드
```

**Variants:**

| variant | 배경 | 텍스트 | 용도 |
|---------|------|--------|------|
| `primary` | `#0F0F0F` | white | 주요 CTA |
| `secondary` | white | `#0F0F0F` | 보조 액션 |
| `ghost` | transparent | `#0F0F0F` | 네비게이션, 인라인 액션 |
| `silver` | `#9BA8B5` | white | 부가 액션, 상태 버튼 |
| `danger` | `#DC2626` | white | 삭제, 비가역 액션 |

---

### Card (`packages/ui/card.tsx`)

```tsx
// 기본 카드
<Card>
  <CardHeader><CardTitle>현재 운영 건</CardTitle></CardHeader>
  <CardBody>
    <p className="text-3xl font-bold">24</p>
  </CardBody>
  <CardFooter>
    <span className="text-xs text-[#9BA8B5]">진행중</span>
  </CardFooter>
</Card>

// G-Stack 패턴 — 인라인 서브컴포넌트로 래핑
function SummaryCard({ title, value, status }: { title: string; value: string; status?: string }) {
  return (
    <Card>
      <CardBody>
        <h3 className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">{title}</h3>
        <p className="text-3xl font-bold mt-3 text-[#0F0F0F]">{value}</p>
        {status && <span className="text-xs text-[#9BA8B5] mt-1 block">{status}</span>}
      </CardBody>
    </Card>
  )
}
```

**Variants:**

| variant | 스타일 | 용도 |
|---------|--------|------|
| `default` | 흰 배경 + 얇은 테두리 + sm 그림자 | 기본 카드 |
| `elevated` | 그림자 md, hover시 lg | 강조 카드 |
| `bordered` | 2px 검정 테두리 | 선택된 상태, 강조 패널 |
| `silver` | silver 테두리 + surface 배경 | 보조 정보 카드 |

---

## 8. 레이아웃 규칙

### 페이지 구조
```tsx
<div className="min-h-screen bg-[#F8F8F9] p-8">
  <header className="mb-8">
    <h1 className="text-2xl font-semibold text-[#0F0F0F] tracking-tight">페이지 제목</h1>
    <p className="text-sm text-[#6B7280] mt-1">부가 설명</p>
  </header>
  {/* 콘텐츠 */}
</div>
```

### 그리드
- 카드 그리드: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- 에디터/프리뷰 분할: `grid grid-cols-1 lg:grid-cols-2 gap-6`
- 반응형 우선: 모바일 → `sm:` → `lg:` 순서

---

## 9. 접근성 체크리스트

- [ ] 모든 인터랙티브 요소에 `focus-visible:ring-2 focus-visible:ring-[#0F0F0F]`
- [ ] 최소 터치 타깃: 44×44px (`min-h-[44px]`)
- [ ] 색상 대비: `#0F0F0F` on `#F8F8F9` = 17.7:1 (AAA)
- [ ] loading 버튼에 `aria-busy={true}`
- [ ] 이미지에 `alt` 속성
- [ ] `outline-none`은 반드시 ring 대체 제공 시에만

---

## 10. 파일 참조

| 항목 | 경로 |
|------|------|
| Button 컴포넌트 | `packages/ui/button.tsx` |
| Card 컴포넌트 | `packages/ui/card.tsx` |
| UI 패키지 진입점 | `packages/ui/index.ts` |
| Tailwind 설정 | `apps/hub/tailwind.config.ts` |
| 글로벌 CSS | `apps/hub/app/globals.css` |
| 카드뉴스 템플릿 토큰 | `packages/content-manager/card-news/templates.ts` |
| 프로젝트 방향성 | `docs/master-directive.md` |

---

*최종 수정: 2026-04-13 — Moon Design System v1.0*
