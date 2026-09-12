# 하루 리뷰 입력 간소화와 팝업

> 실행: 현재 세션에서 순차 구현·검증. 새 서브에이전트 구현 작업은 만들지 않는다.

**Goal:** 하루 리뷰를 에너지 선택과 선택 메모만 보이는 짧은 입력 팝업으로 바꾸고 동작에 부드러운 피드백을 준다.

**근거:** 2026-09-12 운영자가 ‘입력창 더 심플하게, 디자인 애니메이션 디벨롭, 팝업 형식’ 개선을 요청했다. 중앙 팝업/모바일 하단 패널을 권장 기본값으로 제시했다. 기존 독립 페이지는 기록 조회를 맡는다.

**Architecture:** 기존 Drawer에 선택형 compact presentation을 추가한다. side 기본값과 ESC·focus trap·focus restore를 재사용한다. 하루 리뷰의 읽기/저장 상태는 use-daily-review.js로 분리하고 페이지와 popup 입력을 연결한다. 기존 API·revision·draft 복구·저장 상태 계약은 유지한다.

**Tech Stack:** 기존 Next.js/React, Hub tokens/primitives, Node tests, bundled Playwright. Browser plugin not available. 새 의존성 없음.

## 화면과 동작

- 페이지: h2 ‘하루 리뷰’, 날짜 선택, 작은 기록 요약/‘기록 남기기’ 버튼, 월별 목록. 행을 누르면 해당 날짜 입력창이 열린다.
- PC: 약 460px 중앙 팝업. 모바일: 화면 하단 패널, 화면/키보드 높이 안에서 body만 스크롤하고 footer 접근 가능.
- 기본 입력: 에너지 1~5와 선택 메모. 긴 설명과 반복 상태 문구를 줄인다.
- ‘진척도 남기기’에서 기존 목표·진척을 펼친다. 기존 목표/진척이 있으면 열어 표시한다. 접어도 값은 보존한다.
- 기존 값0/null/대상 없음, 부분 답변, 숫자 진척에 목표 필수, 실패 재시도·충돌·날짜별 복구는 유지한다.
- 닫기: X/ESC/배경. 닫아도 미저장 입력을 복구할 수 있다. 저장 중에는 닫기·중복 제출 방지.
- 저장 성공: 실제 saved/duplicate 응답을 확인한 뒤 체크 표시와 짧은 닫힘 모션, 페이지 목록/피드백 갱신. 실패·preview에서는 성공 모션 없음.
- 모션: 기존 --dur-panel/overlay/hover, --ease-hub 사용. 선택/열림/펼침/닫힘에만 적용하며 reduced-motion에서는 즉시 전환한다.

## 구현 순서

- [x] 기준선 확인. 브라우저 회귀를 먼저 작성해 popup 부재 실패 확인.
- [x] Drawer에 presentation=compact 및 exiting data attribute, root props의 최소 확장. CSS는 별도 hub-compact-drawer.css, 기존 side 기본 경로 검증.
- [x] 기존 상태/네트워크 로직을 pages/use-daily-review.js로 옮기고 저장 결과를 반환하도록 한다. 페이지에 목록/날짜 선택과 compact composer 연결.
- [x] pages/daily-review-composer.jsx에서 에너지·메모 기본, 진척 disclosure, 실패·충돌 복구·닫힘 모션 연결.
- [x] 날짜 이동 및 편집, 부분 저장/duplicate/실패/충돌, 닫기와 다시 열기, 키보드/포커스, desktop·390px·320px·reduced-motion 검증.
- [x] 관련 Node 테스트, 전체 회귀, build. 실제 DB 미적용 상태와 UI fixture 검증을 구분.
- [ ] 변경 파일만 커밋하고 다른 세션의 원본 변경을 보존해 반영, 임시 worktree 정리.

## 검증 흐름

내 작업 → 하루 리뷰 → 기록 남기기 → 에너지/메모 → 진척 펼침/접힘 → 저장 확인 → 목록 재열기. X/ESC/배경 닫힘, 다시 열 때 입력 복구, 다른 날짜 응답 지연, 실패 상태, 진척0, 미설정, focus trap/restore, 모션 축소를 확인한다. UI 변경만으로 운영 DB가 준비됐다고 표시하지 않는다.

## 검증 결과

- 기존 화면에서 ‘기록 남기기’가 없어 브라우저 검증이 실패하는 것을 확인한 뒤 구현했다.
- `npm test`: 749/749 통과. Hub production build 통과.
- `scripts/qa-daily-review-popup.cjs`: 실제 페이지에 API fixture를 주입하여 입력·저장·수정·0/미설정·재시도·충돌의 두 선택·닫기 복구·날짜별 복구·지연 응답·모션·키보드·390/320px 화면을 검증했다. 운영 DB 쓰기는 하지 않는다.
- 독립 코드 리뷰에서 저장 중, 로딩 중, 충돌 기록 사용, 재조회 시 포커스 이탈을 찾아 수정했다. 리뷰어가 네 경로의 Tab/Shift+Tab 유지 확인을 마쳤다.
- 430px 높이에서 내부 스크롤과 저장 버튼을 확인했다. 실제 휴대폰 소프트웨어 키보드는 검증하지 않았다.
- 운영 DB migration은 기존 관리 토큰 인증 문제로 아직 미적용이다. 이번 변경은 그 상태를 성공 저장으로 표시하지 않는다.

재실행: Hub dev 서버를 시작하고 `PLAYWRIGHT_MODULE=<Playwright module path> HUB_QA_URL=http://localhost:<port>/dashboard/work/daily-review node scripts/qa-daily-review-popup.cjs`.
