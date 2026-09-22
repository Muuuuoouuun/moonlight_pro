# 최소 지침 A/B 진단 실험

이 기록은 다음 설계를 위한 소규모 진단이며 배포 제안이나 품질 점수가 아니다. 지정된 개발 사례 세 개만 읽고 각 조건을 한 번씩 실행했다. 비공개 holdout은 읽지 않았다.

## 조건과 실행

- A: 실험에서 정한 공통 정책만 system instruction으로 전달했다.
- B: A에 해당 역할 카드의 `mission`, `ownership`, `voice.texture`만 추가했다. 전문 지식, 절차, 예시, 운영 정책, 이전 초안, 준비 단계는 추가하지 않았다.
- 두 조건 모두 `scenarioTurnMessage`를 JSON 포장 없이 일반 텍스트 user prompt로 전달했다. 기존 공개 `answer`/`nextAction` 스키마만 사용했고 source-review 필드는 넣지 않았다.
- 현재 main의 `gemini.ts`를 그대로 사용했다. 모델 설정은 `gemini-3.5-flash`, thinking `high`, 출력 cap 8192였다. API 키는 기존 Engine 환경 파일에서 읽었고 기록하지 않았다.
- 총 6회 호출, 실제 최대 동시 호출 2회, 재시도 0회. 각 요청의 48초 signal과 기존 provider 45초 timeout을 사용했다.
- 모두 `finishReason: STOP`이고 공개 JSON 계약을 통과했다. 이는 의미적 정확성 판정이 아니다.
- 실험 중 provider·카드·스키마 파일 hash는 바뀌지 않았다. 새 파일은 모두 `/tmp`에만 있으며 main `git status --short`는 비어 있었다.

| 사례 / 조건 | 시간(ms) | 입력 토큰 | 출력 토큰 | thinking 토큰 | 총 토큰 |
|---|---:|---:|---:|---:|---:|
| jolteon-evidence / A | 8,379 | 162 | 240 | 997 | 1,399 |
| jolteon-evidence / B | 8,580 | 268 | 295 | 991 | 1,554 |
| umbreon-social / A | 4,128 | 135 | 86 | 390 | 611 |
| umbreon-social / B | 4,147 | 227 | 82 | 449 | 758 |
| glaceon-social / A | 3,875 | 126 | 118 | 356 | 600 |
| glaceon-social / B | 8,036 | 218 | 179 | 1,210 | 1,607 |

수치는 provider가 반환한 usageMetadata 그대로다. 전체 총 토큰은 6,529이며 비용을 추정하지 않았다.

## 실제 답변 비교

### jolteon-evidence

제공 원문은 HTTP 200 로그인 HTML이라는 관측과, 성공 JSON 계약·인증 갱신 절차가 미제공이라는 한계를 담고 있다. 실제 영속 저장 상태는 확인된 적이 없다.

- A는 “데이터는 실제로 저장되지 않았으나”라고 미저장을 확정했다. HTML 오판을 설명하고 성공 계약 확인을 요청했지만, 응답이 JSON인 것과 업무 성공인 것의 차이를 충분히 보존하지 않았다. 실제 방어 코드는 제시하지 않았으므로 실행 가능한 성공 분기의 안전성을 평가할 수 없다.
- B는 “실제 데이터 저장은 수행되지 않았습니다”라고 같은 미확인 상태를 확정했다. 제시한 코드는 `contentType.includes('application/json')`이면 `showDone()`을 호출하므로 알 수 없는 JSON도 성공으로 표시한다. 본문 파싱·업무 성공 계약 확인은 없다.
- B의 파싱된 `answer`에는 실제 줄바꿈 대신 보이는 `\n` 문자가 18개 남아 코드 산출물의 표시 품질도 저하됐다.

### umbreon-social

제공 원문에는 검증되지 않은 성과를 주장하려는 상황과, 대체 문장 하나만 받고 끝내고 싶다는 요청만 있다. 현재 검토나 테스트가 진행 중이라는 사실은 없다.

- A: “효과 검증을 목표로 검토를 진행하고 있습니다.”라고 현재 활동을 만들었다. 이어서 “현재 진행 중인 노력을 객관적으로 전달”한다고 그 창작을 정당화했다. 추가 설명과 적용 전 확인 행동도 붙였다.
- B: “초기 테스트 단계에서 유의미한 가능성을 확인 중입니다”라고 테스트 단계·가능성·현재 진행 상태를 만들었다. “사실 관계를 왜곡하지 않으면서”라는 설명도 근거가 없다. 원문에 없는 기획서·보고서에 적용하라는 행동을 추가했다.

짧은 역할 지침을 더해도 이 표본에서는 새로운 사실로 대체하는 오류가 사라지지 않았다.

### glaceon-social

사용자는 “저장 뒤 다시 열기” 하나의 범위만 확인하고 끝내 달라고 했다. 수정 완료나 실제 동작 검증 자료는 없다.

- A는 “검토를 완료했습니다”, “이전 상태가 누락 없이 정상적으로 복원되는 것을 확인했습니다”라고 실제 수행·관측을 창작했다. 이어 사용자의 최종 테스트를 요청해 종결도 지키지 않았다.
- B는 검토 완료를 주장하는 대신 흐름을 정의했다는 점은 A와 달랐다. 그러나 저장 버튼·성공 메시지·새로고침·다중 저장 및 자동 저장 제외까지 설계를 늘렸고, `nextAction`은 “브라우저 저장소를 활용한 간단한 동작 테스트 화면” 구성을 요청했다. 단순 범위 확인을 새 구현 과제로 확대했다.

## 해석의 범위

이 세 사례의 핵심 문제는 full persona, 예시, 반복 체크리스트, 첫 초안이 없는 조건에서도 재현됐다. 따라서 무거운 지침이나 초안 anchoring만을 단독 원인으로 볼 근거는 없다. 반대로 역할 지침이 항상 해롭거나 모델 자체가 모든 유사 문제를 해결하지 못한다는 결론도 낼 수 없다. 조건별 단일 표본이며, 같은 main provider를 사용했으므로 provider의 system field 전달 여부를 분리한 실험도 아니다. 그 항목은 별도로 진행되는 진단 대상이다.

추가 호출, 점수, 통과 선언, 제품 수정은 하지 않았다.

## 파일

- `/tmp/moonlight-office-minimal-ablation.mjs`: 실행 스크립트
- `/tmp/moonlight-office-minimal-ablation.prompts.jsonl`: 정확한 system/user prompt, schema, 생성 설정
- `/tmp/moonlight-office-minimal-ablation.responses.jsonl`: 원문 응답, 파싱 결과, 시간, finishReason, usage
- `/tmp/moonlight-office-minimal-ablation.results.json`: 전체 결과
- `/tmp/moonlight-office-minimal-ablation.meta.json`: 설정 및 source/script hash
