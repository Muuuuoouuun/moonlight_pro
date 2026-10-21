# 남은 계약 인계 평가 — 긴 회의·미확인 생성 결과

**평가 범위:** 기존 `67eb1d9b316843f5acd70de513d5a7b8d823bfdc`의 격리 재현 증거를 읽어 정리했다. 아래는 다음 수정의 최소 제안이며 구현·운영 승인이나 새 후보 `7ba…`의 검증 결과가 아니다. 이번 작업은 문서 작성뿐이며 기존 6개 패치·해시를 변경하지 않았다.

## 1. 긴 회의 복원: 서버·클라이언트의 유한 페이지 계약 필요

기존 재현에서 7 turn/233,947 bytes는 Desktop에서 복원됐으나 8 turn/267,322 bytes는 Hub의 HTTP 200 `ready`에도 `invalid-response`였다. 한글 질문 1,000자·답변 10,000자씩 8회면 **필수 원문만 264,000 bytes**여서 262,144-byte 한도를 메타데이터 제거만으로 맞출 수 없다. 한도 삭제·무표시 본문 절삭은 해법에서 제외한다.

- **최소 응답 계약:** 새 형식을 명시적으로 선택하는 버전/기능 표시, meeting ID·scope·읽은 revision, 안정적인 turn 순서·ID, 다음 cursor·종료 여부, 페이지 바이트 예산을 정한다. 목록만 부분적으로 읽었다는 상태를 표시하고 기존 전체 응답 소비자와의 전환 방법을 함께 정한다. 한 turn 자체가 예산을 넘으면 별도 본문 조회 또는 명시적 크기 오류로 처리한다.
- **전송 금지 판단:** 현재 페이지에 unknown이 없다는 이유로 새 생성을 허용하면 안 된다. 서버가 **전체 회의 기준** 미확인 요청 존재 여부와 요청 ID를 별도 요약으로 제공하고, claim도 원장에서 다시 확인해야 한다.
- **중복·순서 회피:** cursor를 회의·scope·읽기 snapshot에 묶고, 후속 페이지는 ID로 중복 제거한다. 동시 변경으로 snapshot을 유지할 수 없으면 명시적으로 재조회한다. 연결 세대/회의 선택이 바뀐 뒤 온 응답은 버리며, 선택한 과거 turn과 초안을 보존한다.
- **수용 시험:** 기존 7/8 turn 경계, 예산 직전·직후 및 단일 큰 turn, 1,000/1,001 turn, 빈 마지막 페이지, 페이지 중복·역순·실패·재시도, 페이지 밖 unknown, 동시 추가/종료, 연결·scope 변경, 구형 클라이언트를 검증한다. 페이지를 모두 모으면 원문·ID·순서가 정확히 복원되고 누락을 완료로 표시하지 않아야 한다.

## 2. unknown 복구: 재조회와 새 생성의 권한을 분리

기존 계약에는 두 unknown이 있다. **running의 기한 초과 표시**는 늦은 정상 finish로 완료될 수 있다. **unknown을 finish로 저장하고 결과 hash까지 생긴 경우**는 같은 ID 재시도에도 unknown을 반환하고, 새 ID 역시 미해결 turn 때문에 차단된다. 회의 cancel/recover API는 없으며 `/office/requests/{id}/recover`는 다른 workflow 계약이다.

- **최소 상태 계약:** 원래 request ID·입력 hash·meeting revision과 함께 `관측 대기/결과 영구 미확인/완료`를 구분하고 마지막 확인 시각·허용 행동을 제공한다. UI 취소, 서버 요청 종료, provider 작업 중단을 같은 의미로 표시하지 않는다. 내부 attempt token은 클라이언트에 노출하지 않는다.
- **복구 명령 제안:** 필요 시 별도 명령 ID와 expected revision을 갖는 멱등 복구 결정을 설계한다. 원래 요청·미확인 사실을 보존하고, 늦은 완료와 복구 결정의 경합을 원자적으로 처리해야 한다. 재조회는 모델을 부르지 않는다. unknown을 임의 error로 바꾸거나 새 ID를 자동 발급하지 않으며, 새 생성은 중복 실행 가능성을 포함한 별도 사용자 결정이어야 한다.
- **오류 경계:** 현 `POST /meetings/{id}/turns`에서 HTTP 409 + `status:conflict` + `persisted:false` + 정확한 `meeting-revision-changed`/`meeting-closed`만 신규 ID의 미등록 거절 근거다. `meeting-request-id-reused`, finish 충돌, 일반 502 또는 `persisted:false` 단독은 그 근거가 아니다. 확인되지 않은 결과는 성공·빈 목록으로 바꾸지 않는다.
- **수용 시험:** 기한 초과 후 늦은 완료, 저장된 unknown 반복 조회, 동일/변경 본문의 ID 재사용, finish 충돌 후 완료 재조회, 응답 유실, 복구 명령 중복·역순·동시 완료, 취소 뒤 늦은 결과를 검사한다. 재조회/동일 명령에는 provider 호출 0회, 원래 기록 보존, 완료 단일 확정, 초안 보존을 요구한다.

**증거와 전달 한계:** `evidence/followup-hub/compatibility-probes.json`, `minimum-text-bound.json`, `original-three-patches/compatibility-probes.json`, `outcome-contract.tap`(기존 service→HTTP 격리 시험 6 pass)을 재사용했다. 원래 세 패치 적용본에서도 긴 회의 실패가 재현됐다는 범위까지만 확정한다. 이번에 재시험·새 제품 수정·DB/모델/원격 쓰기는 하지 않았으며 Windows/Mac 실기나 `7ba…` 성공을 주장하지 않는다.
