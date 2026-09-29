# Pet Notifications and Council Implementation Plan

**Goal:** 실제 문의·일정 알림과 검토 가능한 Council 안건 연결을 제공한다.
**Architecture:** 인증된 HubAPI를 재사용하는 독립 활동 저장소, 순수 안건 인코더, 기존 SwiftUI 패널과 비활성 AppKit 말풍선. Hub에는 명시 실행 전용 fragment 수신기를 추가한다.
**Tech Stack:** SwiftUI/AppKit/Foundation, Next.js/React, node:test.

- [x] 문의 DTO/API 계약 및 오류·순번 중복 키 검사.
- [x] origin별 알림 저장소: 첫 조회 baseline, 신규 수신, 일정 시간대, 집중 보류, 숨김/전달 중복 방지 검사.
- [x] Council 초안과 URL: Unicode roundtrip, 길이/출처/주소 검증. 메모·할 일에서 준비하는 UI.
- [x] Hub Council 수신기: 기존 입력 보호, 잘못된 fragment 제거, 로그인 경유 보존, 자동 실행 없음.
- [x] 네이티브 알림함·읽기 상태·포커스 없는 말풍선 연결.
- [x] Foundation/Node 관련 검사, Swift 빌드·self-check, 실제 UI 확인. 운영 AI 호출·시험 쓰기 없음.
- [x] 파일별 커밋, 메인 통합, 앱 재실행, 작업 worktree 정리.

## 검증 기록

- 문의 API 8개 계약 그룹, 알림 저장소·Council 초안 8개 그룹, 기존 Hub model/API 13개 계약 그룹 통과.
- 웹 수신·기존 Council/폼·모션·상태·인증 경계 관련 node:test 41개, no-mock-data 2개 통과.
- Swift build 및 --self-check 통과(기존 재질 GPU/입력/초안 회귀 포함).
- 네이티브 실화면에서 ⌘7 알림함의 정상 빈 상태와 ⌘5 Council 입력/비활성 버튼을 확인했다. 실제 문의/일정 읽기는 성공했다.
- 리뷰에서 발견한 일반 패널 닫기 후 보류 알림 재시도, 오래된 타이머의 새 배너 닫기, 기록 순서 보존, 로그인 인코딩 실패 시 초안 소실을 수정했다.
- 운영 API 쓰기·AI 자문 실행 없이 검증했다. 시스템 푸시/앱 종료 중 알림은 범위 밖이다.
- 메인 통합 후 실제 브라우저에서 안건 문자열의 입력란 복원과 fragment 제거를 확인했다. AI 버튼은 누르지 않았다. 메인 앱 빌드·실행 경로 검증 완료.
