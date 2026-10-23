# Gemini 기본 모델·추정 비용 최신화

확인일: 2026-10-23 (Asia/Seoul). 범위는 기본 모델 식별자, 공개 단가 추정, 참고 환산값이다. 운영 환경 변수·역할 카드·프롬프트는 변경하지 않았고 실제 모델 호출·운영 DB 작업·배포는 하지 않았다.

## 공식 근거

- Google [2026-10-08 변경 기록](https://ai.google.dev/gemini-api/docs/changelog#october-8-2026)과 [폐기 일정](https://ai.google.dev/gemini-api/docs/deprecations#gemini-3-models)은 `gemini-3.5-flash`가 폐기 대상이며 API 요청은 `gemini-3.6-flash`로 자동 라우팅된다고 명시한다. 엔드포인트 종료와 구분한다. 따라서 기존 자동 전환의 목적지를 기본값에 명시했다. 더 최신인 다른 모델로의 성능·품질 이동은 이 변경의 범위가 아니다.
- [3.6 모델 문서](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash)는 stable 모델 코드, 텍스트·이미지·오디오 입력, 구조화 출력과 thinking 지원을 확인한다. 기존 요청 형식과 3 계열 thinking 설정 분기를 유지했다.
- [Google 가격표](https://ai.google.dev/gemini-api/docs/pricing.md)의 **Gemini 3.6 Flash → Standard → Paid Tier**를 확인했다. 100만 토큰당 입력/출력(생각 토큰 포함)은 2026-12-31까지 $0.75/$3.75, 2027-01-01부터 $1.50/$7.50이다. Batch·Flex·Priority 단가를 섞지 않는다.
- [연준 H.10](https://www.federalreserve.gov/releases/h10/current/)의 2026-10-19 발표에서 SOUTH KOREA / WON의 최신 관측일은 2026-10-16, USD 1당 1334.0300원이었다. `current` 페이지는 이후 발표로 바뀔 수 있으므로 관측일·발표일·확인일을 각각 보존한다.

## 적용 계약과 한계

- 기본 모델 네 곳: Engine `gemini.ts`, Hub `multimodal-intake-core.js`, `meeting-review-extractor.js`, `google-vision.js`를 3.6으로 바꿨다. `GEMINI_MODEL`과 Engine의 `AI_DEFAULT_MODEL` 우선순위, 함수 인자의 모델 선택은 그대로다. 운영 환경에 명시된 다른 모델은 이 코드 변경으로 바뀌지 않는다.
- 가격표는 정규 단가를 저장하고 `modelPricing`/`estimateCallCostUsd`가 시각에 따라 프로모션을 적용한다. 공식 표는 전환 시간대를 밝히지 않아 **추정 계산은 UTC 2027-01-01 00:00**을 경계로 삼는다. Google 청구 경계의 실측을 주장하지 않는다.
- 사용량은 `occurred_at`, 리서치는 `started_at`, 보고서는 Office 영수증 `createdAt`을 전달한다. 같은 기록의 재조회 시점이 달라져도 단가가 바뀌지 않는다. 후자의 둘은 실행 시작 기준의 집계 추정이며, 경계에 걸친 여러 호출의 정확한 청구 재구성은 아니다. 3.6 기록의 시각이 없거나 잘못되면 비용은 `null`이다. 현재 호출에서 시각을 생략한 경우에는 호출 시점의 시계를 사용한다.
- 기존 3.5 역사 단가 $1.50/$9.00과 다른 모델 단가를 소급 수정하지 않는다. 명시적 3.5 환경 설정이 자동 라우팅된 경우 이 역사 단가가 실제 제공 모델의 청구와 다를 수 있다. 전체 표의 `checkedAt`은 2026-09-26으로 유지하고 3.6의 확인일만 별도로 2026-10-23으로 기록한다.
- `USD_KRW`는 1334.03, `observedAt` 2026-10-16, `releasedAt` 2026-10-19, `checkedAt` 2026-10-23과 출처를 가진다. 읽기 API의 기존 `usdKrwCheckedAt` 계약은 유지하고 나머지 근거도 함께 반환한다. 원 단위 반올림을 유지하며 실시간 환율이나 과거 원화 결제액이 아니다.
- 입력 형식별 차등, 캐시·무료 한도·검색 등 부가요금은 기존 추정의 한계로 남는다. 다른 모델 가격을 이번에 전부 재검증했다는 뜻이 아니다.

## 로컬 검증

가격 경계와 기본 모델을 먼저 시험해 60개 중 12개의 예상 실패를 확인한 뒤 수정했다. 최종 관련 테스트 88개가 통과했다(실패·skip 0). 범위는 가격 계산, 사용량 집계, 리서치/보고서 재조회, 네 호출 표면의 기본값·환경 설정, Engine thinking/구조화 출력 계약, 기존 사용량 기록·초안 및 비용 UI 렌더링이다. API 응답은 테스트 대역이며 유료 추론의 품질 검증이 아니다.

Engine TypeScript 검사, 목업 데이터 방지 검사 2개, `git diff --check`도 통과했다. 저장소 전체 시험과 프로덕션 빌드는 통합 작업에서 별도로 검증한다.
