# 브랜드 컨텐츠 로그 — 설계 (2026-09-01, 승인)

> 출처: 운영자 첨부 디자인 "Brand Content Log v5" (라이트 테마 캔버스, 2026-09-01).
> 라우트: `dashboard/brands/log`. `apps/hub/lib/brand-content-log.js` +
> `apps/hub/components/hub/pages/brand-content-log.jsx`.

## 1. 무엇인가

크로스 브랜드 콘텐츠 원장(`content_items`)을 보드(기획/제작중/발행 3열) 또는
리스트(그리드 행)로 보여주는 표면. 브랜드 8칩(아이덴티티 컬러 점 + 카운트) ·
검색(제목·메모) · 채널 칩 · 정렬(최신순/오래된순/성과순) 필터. 데이터는
`useContentLedger()`(content.jsx에서 export) → `buildContentLogEntries()` 투영이며,
mock 행은 없다 — preview/error/loading은 정직한 빈 상태로 표시한다.

## 2. 브랜드 아이덴티티 컬러 — §11 예외 (확정)

`2026-08-29-brand-tab-design.md` §11은 "브랜드 식별에 색을 쓰지 않는다 — 글리프 +
이름"을 확정했다. v5 첨부는 이 표면에 한해 브랜드마다 고유 색 점을 명시적으로
요구한다 — **이 문서는 그 지시를 컨텐츠 로그 한정으로 §11에 대한 예외로 확정한다.**
다른 브랜드 표면(디렉터리, PMS 사이드바 등)은 §11 그대로 글리프+이름을 유지한다.
색은 항상 이름 라벨과 함께 있고 단독으로 의미를 전달하지 않는다(DESIGN §5.2).

### 색 해석 우선순위 (`resolveBrandLogColors`)

1. `brand.colorHex`가 있고 accent 기본값(`#5274a8`, 미설정을 뜻함)이 아니면 그 값 — 운영자 확정.
2. 확정 슬러그 시드 4개 (v5 디자인 색 그대로):

   | slug | color |
   | --- | --- |
   | `gore` | `#4FB8C9` |
   | `holyfuncollector` | `#E6C34A` |
   | `bridgemaker` | `#5B9BD5` |
   | `22nomad` | `#A0764B` |

3. 나머지는 `BRAND_LOG_PALETTE`(8색, 디자인 순서)에서 이미 쓰인 색을 건너뛰며
   주어진 순서대로 결정적 배정. 9개 이상이면 처음부터 순환(반복 배정 허용).

### 미확정 매핑 (운영자 확인 전까지 심지 않음)

v5 디자인의 나머지 4개 브랜드명은 실제 슬러그로 확정되지 않았다 — **추측 금지**:

| v5 디자인 이름 | 후보 슬러그 | 상태 |
| --- | --- | --- |
| classin | classmoon | 미확정 |
| moon.classin | moonpm | 미확정 |
| 정상화 | politicofficer | 미확정 |
| 눈이 부시게 | sinabro | 미확정 |

확인 전까지 이 4개는 팔레트 폴백(우선순위 3)으로 결정적 배정된다 — 라이브 브랜드
순서가 디자인과 같으면 결과적으로 같은 색이 나오지만, 시드로 하드코딩하지 않는다.

## 3. 상태 매핑

| `content_items.status` | 로그 열 | 라벨 |
| --- | --- | --- |
| `idea` | `plan` | 기획 |
| `draft` / `review` / `scheduled` | `making` | 제작중 |
| `published` | `published` | 발행 |
| `archived` | — | 로그에서 제외 |

## 4. 성과 지표 — 정직한 자리표시자

라이브 성과 소스가 아직 없다. 모든 항목은 `metricValue: 0` / `metricLabel: "—"`.
"성과순" 정렬은 오늘은 사실상 무변화(안정 정렬로 원 순서 유지) — 지어낸 숫자보다
정직한 "—"가 낫다. Phase 2 백로그: 채널별 실제 지표 연동 후 `metricValue` 채움.

## 5. 다크 이식 표 (v5 → 토큰)

| v5 값 | 다크 적용 |
| --- | --- |
| `h1` 44px | 허브 `<h2>` 계약(20px/500) — §11 페이지 타이틀 규칙 |
| 2px 검정 룰(칩 구분선) | `1px solid var(--line-strong)` — DESIGN 보더 1px 상한 |
| 칩 10px | 10.5px(리포 최소 플로어), 인터랙티브 라벨은 11.5px |
| 브랜드 레일 3px | **유지** — §8.1의 1px 좌측 레일 규칙에 대한 운영자 결정 예외(이 표면 한정) |
| 라이트 표면(#fff/#111) | `--surface`/`--surface-2`/`--fg`/`--moon-200` 등 토큰 |

## 6. 미정/후속

- 워크스페이스 스코프(personal/classin) 필터링 없음 — 전 브랜드 통합 뷰가 v5 원안.
- 상태 필터는 리스트 뷰 전용(보드는 열 자체가 상태 분할).
