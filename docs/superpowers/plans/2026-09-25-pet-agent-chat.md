# Pet Agent Chat Implementation Plan

**Goal:** 빨간 숫자 알림과 같은 창에서 담당 Office의 답변을 받는 흐름을 제공한다.
**Architecture:** 기존 Hub 세션을 공유하는 Office API, 담당·범위별 메모리 대화 저장소, 숫자 배지 공통 컴포넌트, 기존 알림함과 답변 도착 연결.
**Tech Stack:** SwiftUI, AppKit, Foundation/URLSession.

- [x] Office 요청·응답 정본과 9인 매핑 구현 및 계약 검사.
- [x] exact Office POST의 시간 제한 예외와 기존 인증/CRUD 회귀 검사.
- [x] 대화 저장소·입력 스냅샷·취소·세션 분리 검사.
- [x] 숫자 배지와 대화 UI, 응답 도착 알림 연결.
- [x] 빌드·자체 검사·실화면 확인.
- [ ] 커밋·통합·재실행.

## 2026-09-25 검증 결과

- `swift build -j 2`, `build_and_run.sh --verify`: 성공, 새 앱 프로세스 실행 확인.
- `swift run -j 2 MoonlightPetPreview --self-check`: Metal 렌더링·투명 외곽·프리즘·드래그 색상 복귀·레이아웃 기준점·집중 타이머·9종 자산 검사 통과.
- `test_hub_transport.sh`: 17 checks, 실패 0. 정확한 Office POST만 긴 시간 제한 및 동일한 비공개 세션 쿠키 사용.
- `test_hub_domain.sh`: 13 API 계약 및 모델/저장소 검사 통과.
- `test_hub_activity.sh`: 8 groups 통과.
- `test_office_chat_api.sh`: 7 groups 통과. 요청/응답 담당·범위·버전·Unicode 제한, preview/error/timeout·자동 재전송 없음 검증.
- `test_office_chat_store.sh`: 성공·실패·중복·취소·늦은 응답, 담당/범위/Hub별 초안·이력 분리, 전송 중 공백 편집 보존, 확인된 입력만 정리, 전송 예약 이후 범위 변경 보호 통과.
- `test_pet_activity_store.sh`: 11 groups 통과. 로컬 답변 배지·배너, 정확한 담당/범위 읽음, Hub 변경 시 알림 제거 포함.
- CUA 실제 앱: Council 460×580 창, 담당 9명 메뉴, 입력 시 전송 활성화, 업무 범위 이동 시 초안 분리/복원 확인. 검사용 미전송 초안은 정리했고 기존 사용자 할 일 입력은 유지.
- 코드 리뷰에서 발견한 전역 초안의 범위 간 이동 및 공백 편집 손실을 수정. 수정 후 재검토에서 추가 중대 문제 없음.
- 실제 AI 생성 호출과 운영 데이터 변경은 수행하지 않았다. 답변 렌더링·알림 전달은 격리된 응답으로 검증했으며 운영 AI 왕복/지연은 미검증이다.
