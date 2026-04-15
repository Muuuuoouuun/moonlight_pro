# Com_Moon Monorepo — Claude Code 지침

## 현재 기준 진실
- 이 저장소는 단일 Next 앱이 아니라 `apps/hub`, `apps/engine`, `apps/web`, `packages/*`로 나뉜 모노레포다.
- 현재 제품 우선순위는 `apps/hub` 완성이다.
- `apps/web`은 허브가 정리될 때까지 유지보수 전용 표면으로 둔다. 명시적 요청이 없으면 읽기 전용 참고면처럼 취급한다.
- `apps/engine`은 허브 자동화, 웹훅, 실행 경로를 붙일 때만 함께 수정한다.

## 표면 역할
- `apps/hub`: 프라이빗 운영 OS. 기본 라우트는 `/dashboard`.
- `apps/engine`: 웹훅, provider 실행, 자동화 API.
- `apps/web`: 퍼블릭 표면. 현재는 확장보다 보존이 우선.
- `packages/ui`: 허브와 웹이 공유할 수 있는 유일한 디자인 토큰/프리미티브 경계.
- `packages/content-manager`, `packages/hub-gateway`: 앱 간 공용 로직.

## 작업 기본 원칙
- 작업 기준점은 항상 `apps/hub`다.
- `apps/hub`와 `apps/web` 사이 직접 import는 금지하고, 공유가 필요하면 `packages/*`로 올린다.
- 공유 UI나 토큰을 바꿀 때는 허브를 먼저 맞추고, 웹 영향은 별도로 확인/보고한다.
- 세 앱 전체를 한 번에 정리하는 식의 광범위한 정리는 피한다.
- env, Supabase, provider가 없는 환경에서도 허브는 preview-safe하게 동작하도록 유지한다.

## 실제 코드 구조
- 허브 UI/라우트: `apps/hub/app/**`, `apps/hub/components/**`, `apps/hub/lib/**`
- 허브 API: `apps/hub/app/api/**`
- 엔진 API/연동: `apps/engine/app/api/**`, `apps/engine/lib/**`
- 공용 UI: `packages/ui/**`
- 공용 도메인 로직: `packages/content-manager/**`
- 스키마/마이그레이션: `supabase/**`

## 주의
- 예전 단일 앱 기준 규칙인 `app/api/admin`, `app/api/partner`, `lib/repositories`, `data/*.json`는 이 저장소의 정본 구조가 아니다.
- 그 경로들을 새 기준처럼 따르지 않는다.

## Hub UI 규칙
- 색상은 `DESIGN.md` 팔레트만 사용한다. 초록, 골드, 보라 계열을 다시 들여오지 않는다.
- 허브는 다크 기본값이다. void-black 캔버스, whisper border, 반투명 다크 카드가 기본이다.
- 허브 안에서 순백 배경 카드는 만들지 않는다.
- 보더는 두껍게 만들지 않는다. 기본은 `1px`와 DESIGN 토큰을 따른다.
- 모바일 우선으로 설계한다.
- `/dashboard`만 summary-first를 유지하고, 나머지 섹션 루트는 반복 overview보다 즉시 작업형 표면을 우선한다.
- 허브 IA/크롬 변경 전에는 `docs/hub-minimal-practical-redesign-plan.md`를 먼저 본다.

## Web 동결 규칙
- `apps/web`은 현재 보류 상태다.
- 별도 확인 없이 허용되는 웹 작업은 공유 패키지 호환성 유지, 빌드 unblocker, 사용자가 명시한 핫픽스 정도다.
- 기본적으로 새 섹션/라우트 추가, 시각 리디자인, 카피 전면 수정, IA 확장은 하지 않는다.
- 단순 웹 폴리시 작업은 허브 완료 전까지 미룬다.

## 참고 문서
- `DESIGN.md`
- `docs/master-roadmap.md`
- `docs/hub-minimal-practical-redesign-plan.md`
- `design-system/references/*/DESIGN.md`

## 누락된 레거시 툴링
- 예전 문서에 적힌 repo-local `ui-ux-pro-max` 검색 스크립트는 현재 저장소에 없다.
- `office-hours`, `investigate`, `qa`, `review` 같은 레거시 skill 이름도 이 저장소에 설치되어 있지 않다.
- 없는 도구를 전제로 멈추지 말고, 현재 세션에서 실제로 사용 가능한 도구/스킬 기준으로 진행한다.
