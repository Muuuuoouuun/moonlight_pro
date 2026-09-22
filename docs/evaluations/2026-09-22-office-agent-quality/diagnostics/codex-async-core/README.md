# Office 실행 코어와 Codex CLI 전체 평가

기존 HTTP wrapper에서 역할 생성·출처 검수·회의·합성 코어를 분리했다. `runOfficeResponse`와 `runOfficeWorkflow`는 caller의 취소 신호와 공급자를 필수로 받으며 자체 timeout이나 기본 공급자를 만들지 않는다. 실제 서비스는 기존 wrapper를 통해 Gemini와 공유 48초 제한을 그대로 사용한다.

이번 CLI는 `scripts/eval-office-codex-async.mjs`의 **평가 전용 실행기**다. HTTP를 호출하지 않고 동일 코어를 직접 실행한다. 요청당 최대 600초, 개별 CLI 호출 최대 45초이며 초안·검수·역할별 회의 단계를 생략하지 않는다. 영속 job·worker·Hub UI·운영 공급자 전환을 구현하거나 활성화한 것으로 해석하지 않는다. 원자 enqueue·lease 기반 finish·상태 polling 등 [운영 연결 설계](../codex-pipeline/async-review.md)의 잔여는 그대로다.

## 기록과 취소 계약

- 기본값은 목록 출력이며 `--live`를 명시해야 실제 호출한다. CLI의 기존 로그인만 사용하고 인증 파일을 읽거나 복사하지 않는다.
- run journal과 provider journal은 각각 새 파일로 열고 요청·응답마다 flush한다. provider 기록에 run ID와 소스 hash를 연결한다. 실패한 호출은 자동 재시도하지 않는다.
- 모든 실행 단계는 caller 취소를 확인한다. 늦은 정상 응답이나 `missing-api-key`가 취소된 작업을 성공·연결 대기로 바꾸지 않는다. 비협조적인 공급자도 종료될 때까지 기다려 기록을 정리한다.
- 기록 실패 시 다음 작업을 막고 병렬 공급자를 취소한다. 진행 중인 sibling이 종료·기록될 때까지 기다린 후 journal을 닫는다. 반복 SIGINT/SIGTERM도 이 정리를 중단하지 않는다.
- 재개한 구간의 파일 불변 확인으로 이전 미검증 결과를 소급 인증하지 않는다. 검증된 결과 구간의 hash와 개수를 기록하며 누락·불일치는 미검증으로 남긴다.
- CLI 프로토콜의 내부 계획·비치명 경고는 고정된 종류/횟수만 기록한다. 본문·추론·항목 ID는 저장하지 않는다. 외부 도구·알 수 없는 항목·치명 오류·미완료 turn은 실패다. 이 변경이 이전 미재현 오류의 원인을 확정한 것은 아니다.
- CLI가 정확한 실제 모델 ID를 보고하지 않으면 null로 보존한다. 기본 모델 alias와 실제 식별자를 혼동하지 않는다. CLI 내장 지침은 유지되며 요청한 출력 토큰 상한 적용 여부는 확인할 수 없다.

## 재현

```sh
node --import ./scripts/register-hub-alias.mjs scripts/eval-office-codex-async.mjs
node --import ./scripts/register-hub-alias.mjs scripts/eval-office-codex-async.mjs --live --output /tmp/office.run.jsonl --provider-output /tmp/office.provider.jsonl --dataset-status development --concurrency 2
```

개발용 33개 시나리오·39개 응답을 대상으로 한다. 생성 성공과 역할별 의미 품질 평가는 별개이며, 점수·gate는 기존 rubric을 변경하지 않는다. 비공개 holdout은 이 실행이나 구현 조정에 사용하지 않는다.

## 코드 검증

전체 테스트 2,024개 중 **2,013개 통과·11개 skip·실패 0**, 타입 검사 4개 workspace 및 Hub·Engine 빌드 2개를 통과했다. 실제 OS 신호 반복 취소, 병렬 journal 실패 정리, 늦은 성공/실패, 재개 구간 검증의 회귀를 포함한다. UI 변경과 운영 DB 적용은 없다.
