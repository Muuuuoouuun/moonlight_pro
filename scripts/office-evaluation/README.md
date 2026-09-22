# Office 의미 품질 평가

이 디렉터리는 평가 자료와 실행 도구다. 제품 코드에서 import하지 않는다. 업무 데이터·고객 기록·정답 템플릿을 런타임에 추가하지 않는다. 이 도구의 단위 테스트에 있는 응답과 숫자는 검증기 자체를 시험하는 자료이며, 실제 모델 품질의 증거가 아니다.

2026-09-21 기록은 실제 생성 18건 중 핵심 기준 확인 11건·보완 7건이었다. 역할마다 사례 수가 다르고 5축 점수·독립 심사가 없었으므로 9명 모두 70점 이상이라는 근거로 재사용하지 않는다. 과거 원문은 변경하지 않는다.

## 평가 단위와 통과선

- 9명 각각 **역할 전문성 / 지식·근거 / 성격·말투 / 협의·상황 조절 / 실행 실용성**을 심사한다.
- 축당 4항목, 총 20항목에 구체적인 **0..5 anchor**가 있다. 각 축은 20점 만점이며 백분율은 `획득점 × 5`다. 전체는 100점 만점이다.
- 통과에는 **전체 ≥70, 모든 축 ≥70%, 치명 실패 0**, 필수 관찰 범위·대조 심사·독립 심사 선언·실행 중 정책 불변 확인이 모두 필요하다.
- 각 항목은 실제 응답의 정확한 인용과 판단 이유가 필요하다. 근거 항목에는 제공 자료의 인용도 필요하다. 인용이 없거나 틀리면 **미평가(null)**이며 0점·통과로 바꾸지 않는다.
- 전문성/실용성은 `work`, 근거는 `evidence`, 말투는 `social` 응답을 인용한다. 협의는 `initial`의 관점/반론, `update`의 갱신, `close`의 종결을 각각 인용한다. 이는 관찰 범위 검증이지 문구 자동 채점이 아니다.
- 생성 성공·JSON 형식·키워드 빈도·발언 수·`changed=true`는 품질 점수가 아니다. 심사자가 내용을 읽고 anchor를 골라야 한다. 계산기는 점수 합산과 인용 위치 검증만 한다.
- 치명 실패는 중요한 사실·경험 창작, 허위 실행/조회/독립 검증, 업무 범위 침범, 결정을 뒤집는 사실/계산 오류, 강압/가짜 합의다. 문장 취향과 구분해 판정한다.

## 고정된 평가 범위

총 **33개 시나리오, 39개 Office 생성**이다. Office 생성 내부의 모델 호출 수는 런타임에 따라 달라지며 기록의 `evaluationTrace.calls`에서 확인한다.

| 범위 | 시나리오 | 생성 턴 | 관찰 목적 |
|---|---:|---:|---|
| 9명 × 전문 업무·부족/상충 근거·사회적 대화 | 27 | 27 | 실무 산출물, 근거 보존, 피로·압박·가벼운 대화 |
| 3명씩 3개 council | 3 | 9 | initial → 새 사실 update → 명시적 close, 9명의 고유 발언 |
| 같은 초기 질문의 urgent / explore / influence 대조 | 3 | 3 | 강도 조절, 탐색/수렴 차이, 비중보다 근거 우선 |

각 council의 세 턴은 순서대로 실행한다. 후속 history에는 **실제로 받은 응답의 발췌**만 넣는다. 길이 제한 시 `historyProvenance`와 본문 표시를 남기고 전체 원문은 원래 result에 보존한다. 앞선 생성이 실패하면 후속은 `blocked`로 기록한다. 가짜 이전 답을 만들거나 실패한 대화를 새 대화처럼 계속하지 않는다.

주관이 아닌 참여자는 `response.discussion.turns`의 자기 발언으로 평가한다. 주관의 최종 합성을 다른 참여자의 고유 능력 증거로 인용하면 거절한다. 다른 사람의 발언은 반론을 이해하기 위한 문맥이다.

## 실행과 재개

저장소 루트에서 실행한다. 기본은 목록만 표시하며 API를 호출하지 않는다.

```bash
node --import ./scripts/register-hub-alias.mjs scripts/eval-office.mjs --suite quality
node --import ./scripts/register-hub-alias.mjs scripts/eval-office.mjs --suite quality --rubric
```

모델과 키는 실행자의 기존 환경으로 설정한다. 키 값을 문서·로그·명령줄에 쓰지 않는다. 실제 호출은 명시적 `--live`가 필요하다.

```bash
node --import ./scripts/register-hub-alias.mjs scripts/eval-office.mjs --suite quality --live --output /tmp/office-quality-run1.jsonl --concurrency 1
```

독립 시나리오 동시 실행은 1이 기본이며 최대 2다. `--only <scenario-id>`를 반복해 부분 실행할 수 있지만, 부분 결과만으로 전체 역할 통과를 선언하지 않는다. 새 출력은 `wx`로 생성하여 이전 run을 덮어쓰지 않는다.

```bash
node --import ./scripts/register-hub-alias.mjs scripts/eval-office.mjs --suite quality --live --output /tmp/office-quality-run1.jsonl --resume
```

시나리오·정책 파일·모델 설정이 바뀌면 같은 run에 이어 붙일 수 없다. 호출 시작만 있고 결과가 없는 중단은 결과 불명이며 자동 재호출하지 않는다. 실행자가 추가 유료 호출을 선택할 때만 `--retry-incomplete`를 함께 준다. 이미 결과가 기록된 실패는 재개 시 자동 재시도하지 않는다. 개선판·재시험은 새 파일에 전 사례를 기록하고 이전 실패도 보존한다.

header에 전체 시나리오와 hash, 정책 버전, 관련 런타임 파일별 SHA256, 모델 설정을 기록한다. 각 호출의 입력·최종 응답 원문·모델·정확한 토론 설정·소요 시간·history 발췌 이력·응답 hash를 보존한다. provider wrapper는 API 키 없이 프롬프트/시스템 hash, 생성 설정, 요청 모델 alias와 API가 반환한 실제 `modelVersion`, HTTP 상태, `finishReason`, 정수 토큰 사용량, 차단·실패 분류, 출력 hash를 기록한다. 비공개 provider 오류 본문과 검수 전 초안은 복사하지 않는다. 과거 기록에 없거나 API가 반환하지 않은 값은 미확인이며 요청 모델명·0으로 대신 채우지 않는다.

`evaluationTrace.diagnostics`는 Office의 실패 단계(`draft/review/position/response/synthesis`)와 종류(`provider/json/source-review/contract/deadline/model-mismatch`)만 기록한다. 내부 진단 callback은 공개 응답·오류 문구를 바꾸지 않는다. 공급자 실패 코드가 없으면 단계/종류로 오류를 구분하며, 인용 추적·형식·계약 실패를 의미 품질 실패와 혼동하지 않는다. 이 정보는 실패 원인을 좁히기 위한 것으로 자동 점수나 사실성 인증이 아니다.

`attempt`와 `result`는 각각 한 줄씩 쓰고 `fsync`한다. 중단 전 완료된 응답은 살아 있다. 마지막 줄 자체가 잘린 파일은 원본을 보존하고 그 잘린 줄을 복구한 뒤 재개해야 한다. 기록되지 않은 결과를 성공으로 추측하지 않는다.

## 독립 심사와 dossier

전체 심사팩 또는 한 역할의 dossier를 생성한다. 이 단계는 모델을 호출하지 않는다.

```bash
node --import ./scripts/register-hub-alias.mjs scripts/eval-office.mjs --suite quality --review-pack --input /tmp/office-quality-run1.jsonl --output /tmp/office-quality-review-pack.json
node --import ./scripts/register-hub-alias.mjs scripts/eval-office.mjs --suite quality --review-pack --role jolteon --input /tmp/office-quality-run1.jsonl --output /tmp/office-quality-jolteon.json
```

팩의 `reviewTemplate`을 별도 리뷰 파일로 복사해 작성한다. 9개 역할을 나눠 심사했으면 같은 최종 fingerprint를 확인한 뒤 `roles`를 합친다. 각 역할의 `reviewer`에 실제 심사자를 넣으면 최상위 `reviewer`보다 우선한다. 이를 통해 구현에 참여한 조정자가 독립 심사를 했다고 선언할 필요 없이 역할별 실제 심사자의 신원과 방법을 보존한다. 역할의 `reviewer`가 null이면 최상위 선언을 사용한다.

진행 중 dossier는 당시 응답을 검토하는 데 쓸 수 있으나 전체 fingerprint가 계속 변한다. 조기 검토의 `recordId`와 `responseHash`를 보존하고 최종 원문과 동일한지 확인한 후 최종 fingerprint에 연결한다. 일부 응답을 다시 생성했는데 이전 점수를 그대로 복사하면 안 된다.

```json
{
  "axisId": "grounding",
  "criterionId": "facts",
  "rating": null,
  "rationale": "실제 원문을 읽은 뒤 해당 anchor를 고른 이유",
  "evidence": [{ "recordId": "역할-evidence/initial", "pointer": "/answer", "quote": "실제 응답의 정확한 인용" }],
  "sourceEvidence": [{ "scenarioId": "역할-evidence", "sourceId": "자료 ID", "quote": "제공 자료의 정확한 인용" }]
}
```

숫자를 예시로 미리 채우지 않는다. 다른 council 참여자의 고유 발언은 `/discussion/turns/인덱스/position` 등 실제 원문 위치로 인용한다. `sourceEvidence`는 인용한 응답이 나올 때 이미 제공된 자료여야 한다. 후속 update에서 처음 제공한 사실로 앞선 답변을 정당화할 수 없다.

모든 gate를 `clear`/`failed`/`unassessed`로 검토한다. `failed`는 실제 응답 인용을 포함한다. `clear`는 해당 역할의 `coverage.recordIds` 모두를 `checkedRecordIds`로 확인하고 이유를 쓴다. 표본에서 치명 오류를 관찰하지 않았다는 뜻이며 오류 불가능을 증명하지 않는다. 대조 심사는 baseline·variant 양쪽 응답을 모두 인용한다.

심사자는 `reviewer.kind`를 `human` 또는 `agent`로, `independentOfImplementation`과 `independenceExplanation`을 사실대로 작성한다. 구현·지침을 바꾼 사람이 같은 사례를 평가했다면 독립 심사라고 선언하지 않는다. 같은 모델 재검수는 독립된 외부 사실 검증이 아니다. 코드가 독립성 선언의 진실까지 검증하지는 않는다.

```bash
node --import ./scripts/register-hub-alias.mjs scripts/eval-office.mjs --suite quality --score --input /tmp/office-quality-run1.jsonl --reviews /tmp/office-quality-review.json --output /tmp/office-quality-score.json
```

`passed`, `needs-revision`, `unverified`를 구분한다. 생성 실패·preview·의존 턴 blocked·미실행 수와 의미 점수를 함께 표시한다. score 파일은 **이 응답 표본에 대한 심사 결과**이며 일반적인 전문가 자격·현업 성과·상위 백분위를 의미하지 않는다.

## 실행 계획과 평가 오염 방지

1. 런타임·rubric·사례를 고정하고 구현자의 파일 hash와 선택 모델을 기록한다.
2. 기존 15사례는 알려진 회귀 세트로 유지한다. 새 33사례의 첫 실행은 아직 조정에 쓰지 않은 사례로 기록한다.
3. 실제 응답 전부를 생성하고 오류도 보존한다. 빠른 점검에서 실패했어도 성공 사례만 골라 최종 보고하지 않는다.
4. 구현을 바꾸지 않은 심사자가 원문·제공 자료·role focus를 비교해 20항목과 gate를 평가한다. 논쟁적 판정은 별도 심사로 재검토하고 두 이유를 남긴다.
5. 개선에 사용한 사례는 이후 `--dataset-status development`로 실행한다. 새 run과 이전 실패를 비교하되 개선판을 동일한 독립 held-out 검증으로 표현하지 않는다.
6. 작성자와 runtime 구현자가 보지 않은 별도 held-out 사례는 최종 검증 때 공개한다. 그 사례를 구현 조정에 쓰면 다음 독립 검증에는 다시 새 사례가 필요하다.
7. 최종 보고는 역할별 5축·총점·gate·coverage·원문 링크와 실제 심사자/모델, 세트 성격을 같이 적는다. 70 미만·미평가는 숨기지 않는다.

검증 명령:

```bash
node --import ./scripts/register-hub-alias.mjs --test scripts/office-quality.test.mjs apps/engine/lib/office/quality.test.mjs
```

기존 `scripts/eval-office.mjs`의 기본 regression 모드와 `runOfficeEvaluation`의 응답·summary 계약은 유지된다. 새 품질 모드에만 journal·재개·dossier·심사 집계를 적용한다.
