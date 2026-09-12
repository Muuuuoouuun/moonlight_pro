# Legend Persona Measurement Plan

> 실행 방식: 이 세션에서 순차 실행. 범위는 2026-09-13 사용자가 요청한 기존 문서 커밋과 실제 답변 측정이다.

**Goal:** 9개 가치관 카드와 Council 2개 조합의 실제 생성 답변을 같은 기준으로 비교하고 재현 자료와 한계를 남긴다.

**Architecture:** 앱에 연결하지 않는 Node 표준 라이브러리 CLI가 고정된 가상 입력으로 Gemini API를 호출한다. 생성, 이름을 가린 내용 평가, 이름을 공개한 사실·귀속 검증, 집계를 분리한다. 기존 Engine의 설정에서 API 키와 모델을 읽되 키·실제 고객 기록은 결과에 저장하지 않는다.

**Tech Stack:** Node.js, Gemini REST generateContent, JSON/JSONL, node:test.

## 고정한 측정 조건

- 기준 문서 커밋: `8605338`. 사용자가 승인한 것은 커밋과 측정이며 앱 활성화·배포 승인은 포함하지 않는다.
- A: 공통 지침과 업무 기록. B: A + 카드의 ‘원전 근거’ 문단. C: B + 개별 카드의 가치 우선순위·판단 규칙·수정 조건·한계. 원전 근거는 지정 출처를 검토한 편집자의 요약이며 이번 실행에서 원문 전체를 검색하는 RAG가 아니다.
- 9인 × 3조건 × 2턴 = 54개. Council 2조합 × 3조건 × 1턴 = 6개. 총 60개 답변, 11개 입력 시나리오, 20개 A/B/C 비교 묶음. 후속 입력은 모든 조건에 동일하지만 이전 답변은 각 조건의 실제 응답을 유지한다.
- 생성 모델: 로컬 Engine에 설정된 `gemini-3-flash-preview`. 판정 모델: 별도 호출의 `gemini-3.1-pro-preview`. 사용 가능 여부는 API 모델 목록 HTTP 200으로 확인했다. 동일 사업자·계열 모델의 편향은 남는다.
- 생성 조건: temperature 1, thinkingLevel low, maxOutputTokens 8192, 한국어 답변 700자 이내. 모델·입력·분량 지침은 A/B/C 동일하다. 실제 글자 수·토큰·지연·finishReason을 기록하며 초과 답변을 자르지 않는다.
- 판정 조건: temperature 0, thinkingLevel low, maxOutputTokens 8192, JSON 출력. 점수와 응답의 근거 문장, 하드 실패를 보존한다. 실제 인물의 상세 내부 사고를 요청하거나 저장하지 않는다.
- 최대 동시 API 호출 3개. 같은 대화의 두 턴은 순차 호출한다. 429·5xx·타임아웃에 한해 최대 2회 추가 시도하며 시도·소요시간을 남긴다. 빈 응답·잘림·판정 형식 오류는 성공으로 집계하지 않는다.
- 가중치: 사실·출처 25, 상황 20, 실행 15, 판단 15, 불확실성 10, 연속성 10, 읽기 부담 5. 첫 턴은 연속성을 N/A로 두며 분모는 90, 후속 턴은 100. 적용 항목은 생성 전에 고정한다.
- 내용 평가에서 A/B/C·인물·출처 이름을 치환하고 응답 순서를 고정 seed로 섞는다. 문체와 내용으로 조건을 추측할 가능성이 있으므로 완전 블라인드라고 주장하지 않는다. 원저자·출처 정확성은 별도 공개 검증에서 25점 항목으로 평가한다.
- C의 가치 충실도는 별도 0~4 진단으로 공통 점수에 합산하지 않는다. 모든 적용 항목 3점 이상, 하드 실패 없음, 분량 준수를 초기 통과 기준으로 사용한다. 인물별 표본은 두 답변뿐이며 통계적 우월성·순위나 실사용 유용성을 입증하지 않는다.
- 평가자는 사례의 기대 행동을 보되 생성 모델에는 평가 정답을 제공하지 않는다. 문서에 예시가 있는 유형을 사용하므로 이는 개발 세트 점검이며 미공개 독립 검증 세트가 아니다.
- 프롬프트, 원 응답, 메타데이터, 점수, 집계와 파일 해시를 보관한다. API 키는 환경 파일에서만 읽고 로그·Git에 기록하지 않는다.

## Task 1: 문서 커밋과 격리

- [x] 두 문서의 링크·공백·범위를 검증하고 명시 경로로만 커밋했다: `8605338`, 2파일 +543줄.
- [x] `../moonlight_pro-persona-values-eval`의 `codex/persona-values-eval-20260913`에서 측정한다. 기본 persona registry 검사는 통과했다. 앱·패키지 수정과 설치는 필요 없는 독립 CLI다.

## Task 2: 평가 입력과 집계 계약

Files: `scripts/fixtures/legend-persona-eval.json`, `scripts/evaluate-legend-personas.test.mjs`, `scripts/evaluate-legend-personas.mjs`.

- [x] 사례별 초기 입력·후속 입력·기대 행동·금지 행동과 Council 구성을 고정했다.
- [x] 점수 정규화, 하드 실패, N/A, 출처/페르소나 조건 분리, 이름·제목 치환, 미완료 생성 거부를 테스트했다.
- [x] `node --test scripts/evaluate-legend-personas.test.mjs`에서 실패를 확인한 뒤 CLI를 구현하고 통과시켰다. 비 JSON 503 재시도와 판정 실패 시 원 응답 보존 회귀 검사도 포함한다.

## Task 3: 생성과 별도 판정

- [x] `node scripts/evaluate-legend-personas.mjs prepare --out docs/evaluations/2026-09-13-legend-values-v1`로 manifest와 프롬프트를 고정했다.
- [x] `node scripts/evaluate-legend-personas.mjs generate --out docs/evaluations/2026-09-13-legend-values-v1 --env-file ../moonlight_pro/apps/engine/.env.local`로 60개 응답을 생성했다.
- [x] 첫 판정의 부분 결과를 `judge-attempt-1/`에 보존했다. 출처 부재 감점이라는 사전 기준 위반과 fidelity 형식의 모호함을 발견했다. 내용 단계에서 출처 요약을 제거하고 업무 사실 우선 검사·출처 부재 감점 금지를 명료화했으며, JSON schema를 추가했다. 생성 답변과 평가 가중치·통과 기준은 바꾸지 않았다.
- [x] `node scripts/evaluate-legend-personas.mjs calibrate --out docs/evaluations/2026-09-13-legend-values-v1 --env-file ../moonlight_pro/apps/engine/.env.local`로 별도 가상 교정 예제를 확인했다. 출처 없는 정확한 답변의 사실성 4/4, 기록을 조작한 답변 0/4 및 하드 실패를 확인했다. 전체 판정 재실행에 앞선 이 점검도 완전한 평가자 검증을 뜻하지 않는다.
- [x] `node scripts/evaluate-legend-personas.mjs judge --out docs/evaluations/2026-09-13-legend-values-v1 --env-file ../moonlight_pro/apps/engine/.env.local`로 내용 20회·사실/귀속 20회를 실행했다. 최종 40회 모두 정상 종료와 출력 schema 검증을 통과했다.
- [x] 원래 생성한 60개 답변을 유지했다. 기술적 오류는 기록했고 생성 지침·입력·가중치·분량 기준을 바꾸거나 유리한 답변으로 대체하지 않았다.

## Task 4: 결과 확인과 커밋

- [x] `node scripts/evaluate-legend-personas.mjs report --out docs/evaluations/2026-09-13-legend-values-v1`로 평균·조건별 통과·인물별 차이·토큰·지연을 계산했다. 자동 평균 A 88.55, B 87.44, C 85.44. 자동 평가자가 모든 답변에 사실성 4/4를 주면서 오류를 놓친 한계를 별도로 기록했다.
- [x] 자동 점수와 별도로 60개 답변을 입력에 대조했다. 별도 Codex 검토에서 8개 답변에 hard 9건, concern 46건을 남겼고 모든 인용·입력 근거를 확인했다. 자동 점수는 덮어쓰지 않았다. [원문 대조와 인물별 개선점](../../evaluations/2026-09-13-legend-values-v1/findings.md)에 한계와 권장 개발 순서를 남겼다.
- [x] 평가 회귀 테스트 10개와 기존 persona registry 검사를 통과했다. 원 응답 60개·판정 40개, 요청 해시 100개, 고정 소스 해시 2개, 후속 턴의 이전 답변 보존, 점수·통과·분량 집계의 독립 재계산을 확인했다. 내용 평가에서 출처 요약이 제외됐고, 저장된 결과에서 자격 증명 패턴을 찾지 못했다.
- [x] 실행 파일·입력·결과·보고서를 `64c651a`(17파일 +7,151/−1줄)로 커밋하고 현재 작업 checkout에 `cde819e`로 병합했다. `git show --stat`과 병합 전후 파일 일치를 확인했고, 병합 후 평가 테스트 10개·persona registry 검사도 통과했다. 전용 worktree를 제거했다.

## 완료 의미

실제 API 생성과 별도 평가가 실행되고 원 응답까지 확인할 수 있으면 측정 완료다. 점수가 높더라도 Legend 런타임 등록·배포·장기 유용성 검증은 완료로 표시하지 않는다. 접근 가능한 API가 실패하면 실패 기록과 완료한 범위를 보고하며 임의의 점수로 채우지 않는다.
