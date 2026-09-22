# Opportunity discovery 2A Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Follow the approved v2 spec; implementation is limited to 2A.

**Goal:** 작업 중심 탐색과 전체 검색 및 읽기 중심 상세를 제공한다.
**Architecture:** 기존 discovery snapshot과 REST 필터를 재사용. UI에서 목록 조건과 읽기/편집을 분리하고 기존 쓰기 영수증을 유지.
**Tech Stack:** Next.js, React, Supabase REST, node:test.

## Task 1 — 서버 조회
Files: apps/hub/lib/repositories/discovery-ledger.js 및 test, apps/hub/app/api/hub/discovery/route.js 및 route test.
- [x] q/scope/view/status 검증과 페이지 이전 DB 필터 테스트 작성·실패 확인.
- [x] JSON text 필드에 escape된 imatch OR 적용. view별 상태/날짜 필터, KST 날짜,40+1 페이징. id 상세는 기존 계약 유지.
- [x] 필터 조합/특수문자/오류/상세 회귀 테스트 실행.

## Task 2 — 목록과 읽기 중심 상세
Files: apps/hub/components/hub/pages/discovery.jsx, discovery.css, apps/hub/lib/discovery-client.js 및 test.
- [x] 조건 URL·view 매핑·검토 이유 helper 테스트 작성·실패 확인.
- [x] 발견/키움/다시보기 전환, 서버 검색,상태 보조필터,요청 취소,3개 날짜 도래 제안 구현.
- [x] 상세는 기존 EditDrawer 안에 읽기 요약/편집을 전환하고 저장·충돌·이력 계약을 보존.
- [x] UIUX 패턴 검색과 기존 DESIGN 토큰 적용,모바일 확인.

## Task 3 — 검증·통합
- [x] 독립 spec/code 검토,문제 수정.
- [x] 관련 테스트,전체 테스트,계약 검사,Hub build,브라우저 desktop/mobile 확인.
- [x] 문서에 실제 완료/미구현/운영 미배포 구분. 명시 경로 commit,현재 통합 브랜치와 병합 및 worktree 정리.


## 실행 결과
- 2A만 완료. 2B 검증별 기록/출처 연결·생성 복귀, 2C 넛지 반복 억제/AI는 후속이다. 운영 배포·문의 크론 변경 없음.
- 전체 테스트 1033 passed / 0 failed / 4 skipped (1037 tests). 관련 client/repository/route 33개 통과. contracts·typecheck·Hub build 통과.
- 독립 spec 검토에서 서버/브라우저 날짜 불일치 발견 후 수정, 재검토 승인. 별도 코드 품질 검토 승인.
- 브라우저 390×844·1280×800, dark/light: 작업 전환, 검색 빈 결과/초기화, 읽기→편집→저장, 질문 방식 생성·새로고침, 키보드 입력 포커스 확인. 가로 넘침 없음, 모바일 작업 토글 한 줄, 콘솔 error/warn 0.
- 브라우저는 임시 로컬 REST 어댑터와 명시적 검증용 가상 데이터로 수행했다. 저장 검증 데이터는 운영 DB에 쓰지 않았다. 전역 문의 알림은 이 어댑터에 문의 기록이 없어 실패 표시였고 기회 탐색 오류와 구분했다.
- 운영 Supabase에서는 read-only로 특수문자 검색+다시보기 조합, 회사/개인+진행상태 조합, 날짜 도래 조회가 모두 live(0건)임을 확인했다. 실제 대용량 성능 측정은 하지 않았다.
