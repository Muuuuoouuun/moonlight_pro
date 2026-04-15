# Com_Moon Hub — Local Instructions

## 범위
- 현재 활성 제품 표면은 `apps/hub`다.
- 기본 작업 범위는 허브 안에 둔다.
- `packages/ui`, `packages/content-manager`, `apps/engine`, `supabase`는 허브 동작이 실제로 걸려 있을 때만 같이 수정한다.
- `apps/web`은 명시적 요청이나 공유 호환성 이슈가 아니면 끌어들이지 않는다.

## 제품 방향
- `/dashboard`는 summary/decision surface다.
- 그 외 섹션 루트는 overview 반복보다 즉시 작업형 표면을 우선한다.
- 허브 IA, 탭 구조, 셸 크롬을 바꿀 때는 `docs/hub-minimal-practical-redesign-plan.md`를 기준으로 삼는다.

## 구현 원칙
- env/Supabase/provider가 빠진 환경에서도 preview-safe 흐름을 유지한다.
- `apps/web`에서 직접 코드를 가져오지 않는다. 공유가 필요하면 `packages/*`로 올린다.
- 공용 토큰과 프리미티브는 `packages/ui`를 먼저 사용한다.
- 허브 안에는 순백 카드, 두꺼운 보더, 오프-팔레트 포인트 컬러를 넣지 않는다.

## 체크리스트
- 이 변경은 허브 우선순위를 직접 밀어주고 있는가?
- 설명형 박스나 중복 overview를 늘리기보다 줄이고 있는가?
- 공유 코드 수정이라면 웹 영향은 최소 범위로 제한했는가?
