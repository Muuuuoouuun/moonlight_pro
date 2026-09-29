# 실행·심사 방법

## 고정 범위

- 기준 커밋: `944fac9e862b764adb010b629173a629466e83c0`.
- 역할 카드: `2026-09-23.v25-grounding-regression-fix`; Office 공개 계약 버전: `2026-09-22.v3`.
- 관리 worktree: `pet-office-baseline`. 실행 중 런타임·역할 카드·평가 시나리오·rubric을 수정하지 않았다. 새 파일은 이 평가 디렉터리에만 작성했다.
- Node `v24.18.0`, npm `11.16.0`; checkout에서 `npm install --ignore-scripts --no-audit --no-fund`를 수행했다. package-lock 변경은 없었다.
- 기존 로컬 Engine 환경 파일을 `node --env-file`로 불러왔다. 모델 override는 사용하지 않았으며 실제 선택은 `gemini-3-flash-preview`였다. 키는 명령줄 인수·문서·로그에 복사하지 않았다.
- 현재 source hash와 API 반환 modelVersion은 journal에 있다. 시나리오 본문 hash·20항목 rubric 버전과 별도 [평가 도구 hash](evaluation-tooling.sha256.json)도 보존했다.

## 원본 전체 실행

기존 `scripts/eval-office.mjs --suite quality --live --dataset-status development --concurrency 2`를 사용해 전체 33개 시나리오, 39개 Office 생성을 계획했다. 출력은 새 파일 `runs/v25-configured-full.jsonl`이며 결과를 덮어쓰지 않았다. 요청·원문·공개 응답·responseHash·모델 프롬프트 hash·호출 시간·실패·종속 차단·최종 소스 불변 검증을 기존 journal 형식으로 기록했다.

현재 모델과 기존 평가의 모델이 달라 과거 scope-v1 점수와의 차이를 v25 프롬프트 효과로 해석하지 않는다. 이 세트는 이미 개발에 사용된 회귀 자료여서 새로운 독립 holdout이라고 부르지 않는다.

이는 실제 Gemini 공급자를 사용하는 로컬 Office service 평가다. 가상 입력과 명시적인 provided/error context를 사용했으며 운영 업무 DB를 읽거나 쓰지 않았다. 브라우저·HTTP 인증·DB 저장·실제 운영자 성과를 검증하는 실행은 아니다. 외부 연락·메시지 발송도 하지 않았다.

## 한 번의 별도 복구

원본의 `offer-balanced/update` 제한 시간 오류 및 종속 close 차단, `delivery-urgent/initial` 공급자 503에 대해 운영 승인 범위에서 한 번만 별도 실행했다. `--only offer-balanced --only delivery-urgent --concurrency 1`로 새 `runs/v25-configured-recovery.jsonl`을 만들었으며 모든 나머지 설정과 frozen source는 같았다. 유실된 이전 대화를 꾸미지 않도록 offer는 새 initial부터 순서대로 실행했다.

두 journal의 run ID와 fingerprint는 서로 다르다. 기존 evaluator 계약이 run 사이 결과 결합을 지원하지 않으므로 복구 응답을 원본 점수·coverage에 넣지 않았다. 회복·반복 실패와 비채점 관찰은 [별도 문서](recovery-observations.md)에 있다.

## 의미 심사

심사는 기존 [rubric](../../../scripts/office-evaluation/rubric.mjs)의 5축×4항목, 0~5 anchor를 적용한다. generated·JSON schema 통과·호출 수를 품질 점수로 쓰지 않았다. 점수는 공개 응답의 정확한 자기 발언 pointer/quote에 연결하고, grounding은 응답 때 이미 제공된 source quote에도 연결했다.

심사 A/B/C는 각각 3역할을 읽는다. 각 심사자는 동결 v25 런타임·프롬프트·생성 응답 작성에 관여했는지 스스로 선언하며 다른 작업 참여 여부도 명시한다. 수집 및 점수 취합이 독립 사실 검증을 뜻하지 않는다. 같은 세트의 선행 관찰을 공유했으므로 평가자 간 맹검 일치도 실험도 아니다.

원본에서 생성되지 않은 협의 갱신·종결, 대조 실패는 `null`/`unassessed`다. 관찰되지 않은 항목을 0점으로 만들거나 다른 턴으로 대체하지 않았다. 총점은 20항목 전부 평가됐을 때만 합산한다. 총점 70, 매 축 14/20, 치명 gate 없음, 필요한 관찰·대조 충족을 모두 요구한다.

심사자는 정본 JSON에 항목별 근거를 썼고 기존 `--score` 명령으로 인용·source 연결·필수 관찰·fingerprint를 검증한다. 이 검증기는 의미 판단이나 독립성 선언의 진실을 인증하지 않는다. 결과는 이 생성 표본에 한정된다.

## 도구 검증

`node --import ./scripts/register-hub-alias.mjs --test scripts/office-quality.test.mjs apps/engine/lib/office/quality.test.mjs`가 **37/37 통과, 실패·skip 0**이었다. [전체 TAP](validation/evaluation-harness.tap)을 보존했다. 이 검증은 평가 도구의 계약 확인이며 역할 의미 품질 점수가 아니다.
