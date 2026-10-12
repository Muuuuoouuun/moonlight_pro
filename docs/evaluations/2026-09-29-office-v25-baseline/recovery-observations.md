# 단 한 번의 별도 복구 실행

[원본 전체 실행](runs/v25-configured-full.jsonl)을 보존한 뒤 같은 동결 소스·모델·rubric으로 [복구 실행](runs/v25-configured-recovery.jsonl)을 별도 생성했다. `offer-balanced`는 실제 새 initial을 받은 뒤 update→close를 순서대로 요청했고, `delivery-urgent`는 한 번 재시도했다. 새로운 실행의 응답을 원본으로 바꾸지 않았다.

원본과 복구의 runtime bundle hash는 모두 `3a12b29ecbe0bc8a4392122e1e93c095a8adccf718ffa3fc627a924022fab42c`이며 실행 전후 불변 검증을 통과했다. 복구 fingerprint는 `289953ff7d036a45a17a1639aa712a20655f64b63fd77ae12663ebd52c45d805`다.

| 관찰 | 원본 | 복구 |
|---|---|---|
| offer-balanced/initial | 생성 | 새 응답 생성 |
| offer-balanced/update | synthesis deadline, 48,008ms | synthesis deadline, 48,008ms |
| offer-balanced/close | 앞선 오류로 blocked | 앞선 오류로 blocked |
| delivery-urgent/initial | synthesis provider HTTP 503 | 생성, 20,434ms |

따라서 원본은 36/39 생성이며 복구는 별도의 2/4 생성이다. `38/39`처럼 합쳐 보고하지 않는다. offer 갱신·종결은 두 번의 제한된 시도 모두에서 공개 응답이 없어 여전히 미평가다. 실패 호출의 비공개 중간 초안을 능력 증거로 사용하지 않았다.

복구 urgent의 자기 발언을 읽은 관찰은 다음과 같다. 아래는 서로 다른 run 사이의 서술 비교이며 공식 rubric 대조 점수에 합산하지 않는다.

- 이브이 `/discussion/turns/0/position`: “자동화 수정은 30분이 소요되어 잔여 시간(45분) 내에 마칠 수 있지만”이라고 구분한 뒤 고객 약속의 수동 선행을 추천한다. 같은 발언에서 “수동 작성(20분)을 끝내고 남은 25분 동안 자동화 수정을 시도”하도록 하므로, 남은 25분 안에 수정 완료를 보장한 것은 아니다.
- 샤미드 `/discussion/turns/1/position`: “25분이 남는데, 이는 자동화 수정 추정치인 30분에 미치지 못합니다”라고 계산하고 수정은 다음 가용 슬롯으로 넘긴다. 실제 남은 용량을 가장 명시적으로 보존했다.
- 쥬피썬더 `/discussion/turns/2/position`: “검증 도구도 없는 상태에서 건드리면 18시 약속을 무조건 놓칩니다”, “지금은 무조건 약속부터” 같은 절대 표현이 남는다. 안전한 순서 권고와 과도한 확신이 함께 있어 생성 회복을 상황 조절의 품질 통과로 바꾸지 않는다.

긴급 설정은 실제로 depth 1, challenge 0, convergence 3으로 전달됐고 세 역할 position과 주관 synthesis의 4회 호출로 끝났다. 호출·라운드 수가 줄었다는 사실 자체는 의미 품질 점수가 아니다. 복구 offer 초기 발언은 원본 점수에 사용하지 않았고 별도 20항목 재채점도 하지 않았다.

## 반복 제한 시간의 관찰 근거

원본 update의 첫 병렬 호출 3개는 최대 17,838ms, 다음 병렬 호출 3개는 최대 20,396ms에 `STOP`으로 끝났다. 마지막 합성 호출은 9,766ms 후 전체 48,008ms 제한에서 취소됐다. 복구에서도 앞 3개 최대 28,791ms, 다음 3개 최대 11,998ms 후 마지막 합성이 7,208ms에서 취소됐다. 두 실행 모두 진단은 `phase:synthesis / category:deadline`이다.

이는 최종 합성 전에 시간이 대부분 소모됐다는 관찰이다. 제한 시간을 늘리면 해결된다는 실험이나, 앞선 비공개 초안의 의미 품질 평가는 수행하지 않았다.
