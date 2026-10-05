# 개인 현금 흐름 — 첫 운영 원장

개인 범위의 **영업·매출 → 현금 흐름**(`/dashboard/revenue/cashflow?scope=personal`)에서 수집한 소비, 구독·고정비, 회사 청구 후보를 검토한다. 기존 매출 전망은 `/dashboard/revenue/overview`와 ⌘K의 `개인 매출 전망`으로 남아 있다.

## 현재 지원

- 원구매·환불·명시적으로 대조한 중복을 분리한 월별 순소비와 네이버 머니 이동.
- 자술 구독과 실제 결제 관측, 확인된 약정, 계정 별칭·사용 근거의 구분. 공동 관측 그룹은 한 번만 합산한다.
- 회사 목적·신청 상태·승인액·실제 회수액·검토 메모. 모르는 금액은 빈칸(null), 확인한 0원은 0이다. 확인된 일부 승인·회수 합계를 전체 정산 완료로 해석하지 않는다.
- 더보기의 수집 범위와 CFO 리피아 검토 자료. Office에는 운영자가 필요한 자료를 제공하며 자동 요청·도구 실행은 없다.
- 원본 관측은 수정하지 않는다. 검토 변경은 버전 충돌 시 입력을 보존하고 최신 기록과 비교한 뒤 재저장한다.

은행 계좌 입출금 원장과 잔액, 자동 금융 연결, 이용량 자동 수집, 회사 직접 지불·배분·일괄 정산, 통신사 납부 대사는 후속 범위다. 현재 순소비는 실제 은행 출금이나 월 고정비 합계가 아니다. 개인 금융을 ClassIn에 복제하지 않는다.

## 목록 읽기·정렬

거래·구독·회사 청구는 데스크톱에서 같은 열 축의 한 줄 목록으로 읽는다. 헤더의 날짜·이름·금액을 누르면 오름차순 → 내림차순 → 기본 순서로 바뀌고 미확인은 항상 마지막에 놓인다. 월별 표의 금액 제목과 값은 오른쪽으로 맞춘다.

월 선택은 합계·결제 관측에, 검색은 목록과 구독 결제 표에 적용된다. 구독은 결제월별 표의 각 칸에서 결제일·순소비를 함께 읽고 눌러 해당 월 원내역을 확인한다. 표 아래 계약 목록의 최근 결제일은 수집 전체 기간 기준이다. 자술 이용 기간 뒤에 계산한 ‘재확인’ 일정은 실제 청구 예정이 아니며 다음 청구일로 자동 저장하지 않는다.

구독 계약 자체는 모든 기간의 목록이다. 긴 자술 원문·계정·사용 메모는 행을 눌러 기존 검토 드로어에서 확인한다. 모바일은 구독 세 줄, 회사 청구 세 줄로 재배치하고 월별 표만 가로로 스크롤한다. [UI 설계](../superpowers/specs/2026-10-05-finance-compact-list-design.md).

## 가져오기

금융 원본은 저장소 밖 비공개 위치에 두고, 검토한 표준 JSON bundle만 가져온다. 임의 은행 CSV 열 매핑은 아직 제공하지 않는다. `scripts/import-finance.mjs`는 기본이 검증 전용이고 원문·시크릿을 출력하지 않는다.

```sh
node scripts/import-finance.mjs /absolute/private/finance-bundle.json
node scripts/import-finance.mjs /absolute/private/finance-bundle.json --apply --expect-ref ncgpnqfulnlshegalmbd
```

`version:1`, `importKey`, `from`, `through`, `coverage`, `entries`, `subscriptions`를 받는다. entry는 sourceKey/source/type/date/merchant/currency와 grossAmount/refundAmount/netAmount/movementAmount를 갖는다. type=expense의 net은 gross−refund, movement는 소비 금액이 0이며 walletKind와 이동액의 부호를 검증한다. duplicateOf는 같은 batch의 대조된 다른 출처 관측만 연결한다.

같은 importKey와 동일 입력은 duplicate로 재시도할 수 있다. 같은 키의 다른 입력이나 기존 sourceKey가 섞인 새 batch는 conflict로 멈춘다. 부분 취소 갱신·이미 검토한 자료의 교체·가져오기 되돌리기는 이 버전에서 자동 처리하지 않는다. 새 기간 자료는 기존 키와 겹치지 않는 검토된 batch로 가져온다.

`finance_imports`, `finance_entries`, `finance_subscriptions`는 RLS를 켜고 anon/authenticated 접근과 service_role 직접 쓰기를 막는다. 서버 workspace에서만 보호된 RPC로 저장한다. GET의 `status:error`는 HTTP 200이며 빈 장부로 처리하지 않는다.
