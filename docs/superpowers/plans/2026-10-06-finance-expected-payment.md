# 예상 결제일 Implementation Plan

> For agentic workers: superpowers:executing-plans로 이 세션에서 진행한다. 운영자의 월결제 예상 요청을 기존 표에 적용한다.

**Goal:** 이용 중 구독의 다음 예상 결제일을 최근 관측으로 계산한다.
**Architecture:** financeSubscriptionDates의 화면 투영만 확장한다. 실제 결제·검토 필드·DB는 변경하지 않는다.
**Tech Stack:** React, Next.js, node:test.

- [x] `finance-view.test.mjs`에 active 월결제·월말/윤년·직접 입력 우선·분기/연간·최초 다개월/후속 월결제·상태/환불/미관측 제외 검사를 추가한다. `node --test apps/hub/components/hub/pages/finance-view.test.mjs`에서 새 검사 실패를 확인한다.
- [x] `finance-view.js`에 달력 월 가산과 예상 투영을 구현한다. `finance.jsx`의 다음 일정/상세에 예상 라벨과 근거를 연결한다. 같은 테스트가 통과하는지 확인한다.
- [x] 가이드에 예상 규칙을 기록한다. 전체 테스트·Hub/Engine 빌드·390px와 데스크톱의 실제 원장 표시를 검증한다. 금융 증거는 비공개 경로에 저장한다.

출시 검증과 배포·작업 트리 정리는 PR 및 비공개 검증 기록에 남긴다.
