# Guru·Mentor·Legend 콘텐츠 심화 실행 계획

> 상태: 운영자의 2026-09-29 제작 요청에 따른 편집 작업 계획. 기존 확정 화면·요청형 상담·무자동업무 경계를 유지한다.
> 상위 정본: `docs/README.md` §4, `2026-09-25-guru-focus-atlas-floating-chat-design.md`, `2026-09-25-guru-internal-reading-articles-design.md`, `2026-09-24-agent-layer-direction.md`.

**목표:** 현재 23 Guru·3 Legend 카드와 카드별 읽기 글 26편을 인물 고유의 개념, 진단 분기, 적용·비적용 조건, 반례가 드러나도록 심화한다. Mentor는 별도 인물 카드가 아니라 선택한 Guru 카드로 상담하는 경험이며, 카드 요약이 실제 상담에도 전달되는지 확인한다.

**구조:** 카드 ID·개수·시간대 선택·상담 경로·인포그래픽의 핵심 주장을 유지한다. `packages/guru-guidance/index.ts`의 짧은 카드 문구와 `apps/hub/content/guru/<id>.md`의 긴 읽기 글을 같이 편집한다. 각 글의 새 원전 사실은 해당 인물의 1차 자료와 대조하고, 운영 업무 장면은 명시적 가상 사례와 Moonlight 응용으로 표시한다. 카드별 한 주장에 두 번째 인물·방법론을 혼합하지 않는다.

**검수 기준:** 원전 개념·Moonlight 응용·확인되지 않은 고객 사실이 분리되고, 비슷한 카드가 같은 상황에서 다른 진단 질문을 낸다. 인물의 직접 발언처럼 쓴 미검증 문장·효과 수치·성과 보장은 넣지 않는다. 상세 글은 읽을 만한 문단, 실제 판단 분기, 중단·수정 조건을 포함한다. 기존 26개 인포그래픽의 문구·도식과 모순되는 새 주장은 반영 전에 조정한다.

## 작업 1 — 출처·차별점 대조

- [x] `packages/guru-guidance/index.ts`의 26개 ID와 `apps/hub/content/guru/*.md`를 대조한다.
- [x] 세일즈 13·마케팅 5·콘텐츠 5·Legend 3의 각 카드에 대해 원전의 좁은 개념, Moonlight 응용, 확인할 사실, 질문 분기, 적용하지 않을 조건을 카드·글에서 정리한다.
- [x] MEDDIC·SPIN·Voss의 수동 전용 자격과 Ross의 `sales:new` 조건을 유지하고, GAP/Tracy/Ziglar, Godin/Ogilvy의 유사 질문을 차별화한다.

## 작업 2 — 카드·읽기 글 편집

- [x] `apps/hub/content/guru/sales-*.md` 13편에 인물별 판단 절차와 가상 학원·B2B 장면의 분기, 중단 조건을 집필한다.
- [x] `apps/hub/content/guru/marketing-*.md` 5편과 `content-*.md` 5편에 대상·약속·고객 언어, 독자의 기대·증거·매체 변환을 구분하는 편집 판단을 집필한다.
- [x] `apps/hub/content/guru/legend-*.md` 3편에 가치 충돌, 감수할 비용, 결론을 바꾸는 사실을 집필한다. 주간 Legend의 읽기 전용 성격을 유지한다.
- [x] `packages/guru-guidance/index.ts`의 `frame`, `text`, `useWhen`, `question`은 글의 결론과 일치하도록 다듬는다. 상담에 전달되는 `guidancePromptFrame`이 적용 조건과 경계를 잃지 않게 한다.

## 작업 3 — 검증과 기록

- [x] 카드 ID 26개, 문서 26편, 출처·한 주장·인포그래픽 핵심 메시지의 일치와 금지 표현을 수동 대조한다.
- [x] 관련 카드·상세 글·멘토 대화창 검사를 실행한다.
- [x] `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`를 실행하고 결과·한계를 기록한다. 실제 모델의 의미 품질과 운영자 채택률은 코드·콘텐츠 검증과 구분한다.

## 검수 기록

- 카드 26장과 같은 ID의 읽기 글 26편을 확인했다. 카드의 비적용 조건은 기존 인포그래픽 JSON의 `boundary`와 일치하며, 멘토 상담 프롬프트에도 전달된다.
- 등록 출처를 재검토해 Voss 카드의 참고 글은 Black Swan Group의 Derek Gaunt 글, Ziglar 카드는 공식 팟캐스트의 해설 자료로 표시했다. 직접 확인이 어려웠던 Carnegie·Hill 자료에서 새로운 사실 주장이나 직접 인용은 추가하지 않았다.
- 상세 글에서 렌더러가 지원하지 않는 인라인 굵게·링크·이미지 문법을 검사한다. 고정된 옛 질문을 기대하던 멘토 대화창 테스트는 선택 카드의 현재 질문을 확인하도록 바꿨다.
- `npm test`: 3,431건 중 3,418건 통과, 실패 0, DB 연결이 필요한 13건 건너뜀. `npm run typecheck`, `npm run build`, `git diff --check` 통과.
- 실제 모델 답변의 의미 품질과 운영자가 내용을 채택하는 정도는 이 검증 결과로 판단하지 않는다.
