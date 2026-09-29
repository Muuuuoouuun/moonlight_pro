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

## 첫 전체 개발 실행 — 호출당 45초

`fbb371d`의 고정된 실행 코어와 평가 코드를 사용했다. 실행 ID는 `1b656f4f-9dc1-46bd-9e47-be3cee47520b`, 소스·공급자 설정 bundle hash는 `97796457998253e76a6e8ab10e9ee86b3c1ebea0e41cf8d80500e11632a5444c`다. 개발용 33개 시나리오의 39개 요청과 모든 공급자 시도·결과를 [Office journal](first-45s.run.jsonl)과 [CLI 공급자 journal](first-45s.provider.jsonl)에 보존했다. 두 journal의 run ID·bundle hash가 같고, 결과 39건 및 공급자 시도/결과 각 120건을 확인했다. 종료 검사에서 소스 hash가 변하지 않았고 39건 모두의 기록 범위가 `verified`였다. 이는 파일 정합성 검사이며 답변 품질 인증은 아니다.

| 구분 | 건수 | 관찰 |
| --- | ---: | --- |
| Office 응답 생성 | 33/39 | 프롬프트·출처·계약을 통과한 결과 |
| Office 오류 | 5/39 | 쥬피썬더 업무와 `offer-balanced/update`는 45초 호출 제한, 나머지 3건은 공급자 오류 |
| 종속 차단 | 1/39 | 실패한 `offer-balanced/update` 뒤의 종결 턴 |
| CLI 호출 완료 | 111/120 | 공급자 자체의 `ok` 결과 |
| CLI 비완료 | 9/120 | timeout 2, `cli-turn-failed` 3, 병렬 단계 취소 4 |

역할별 필수 관찰에는 쥬피썬더의 업무 사례, 일부 회의의 수정·종결 발언이 빠졌다. 탐색·영향력 설정 대조도 완성되지 않았다. 따라서 이번 실행은 **미채점 개발 자료**이며 9명 전원 70점 이상 또는 의미 품질 개선의 근거가 아니다. CLI 이벤트가 실제 모델 버전을 제공하지 않아 그 값은 120회 모두 `null`이다. 오류를 자동 재시도하거나 이전 실패 기록을 덮어쓰지 않았다. 운영자용 Office 경로, DB, worker, UI의 비동기 상태는 이 실행으로 바뀌지 않았다.

첫 journal의 SHA256은 `844cd3494c155a0238b6cd453d284a7a308ce558ba839adfa978a99d680fccc4`, 공급자 journal은 `4455484a8f7b02fb9ffc264e9bb434baedc7554b1f30ba15463304ed91307ef7`다. 각각 개발용 가상 상황의 원문이며, 인증 파일이나 운영 원장을 읽은 결과가 아니다.
