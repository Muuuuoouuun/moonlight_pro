# 캘린더 완료·특이사항 구현 계획

**Goal:** 오늘 일정과 캘린더에서 일정별 완료 체크 및 특이사항을 영속 저장한다.
**Architecture:** Google/iCal 일정은 원본을 유지하고 Moonlight의 `calendar_event_outcomes`에 기록한다. 서버가 소스+이벤트 ID를 SHA-256 키로 투영하고, Hub guarded API가 workspace 범위와 revision 비교로 저장한다. UI는 동일한 공용 컴포넌트를 사용한다.
**Tech Stack:** Next.js, React, Supabase REST, node:test.

- [x] 소스 분리·반복 회차·제목/시간 변경에도 동일 ID의 기록 유지 테스트 및 키 투영.
- [x] 0036 migration: workspace+event_key PK, done/note/revision/updated_at, RLS 및 service-role 전용 접근.
- [x] `calendar-outcomes-ledger.js`와 `/api/hub/calendar-outcomes`: 조회 실패 봉투, 입력 검증, 서버 workspace 고정, CAS 충돌, 동일 재시도 처리 테스트.
- [x] `calendar-outcome.jsx`: 완료 즉시 저장, 특이사항 펼침·명시 저장, 오류 입력 보존, 충돌 시 현재 기록 확인·재시도. 저장 중 중복 제출 및 닫기 방지.
- [x] daily-focus/API mapper에 키 전달, 오늘 일정 카드와 Calendar 일정 드로어 연결.
- [x] 관련 테스트 → 전체 npm test → Hub 빌드 → 브라우저 화면/저장 검증.

완료 체크는 체크 해제로 취소 가능하며 완료된 일정은 목록에 유지한다. 특이사항은 최대 4,000자, 빈 문자열 저장으로 지울 수 있다. 읽기 전용 iCal에도 기록 가능하다. 원본 일정/외부 캘린더 설명/회사 기록으로 전송하지 않는다. 일정 키는 연결 소스가 변경되면 별개로 취급한다.

## 검증·적용 결과

- node:test: 1,507건 중 1,496 통과, 실패 0, 기존 선택 실행 테스트 11 skip.
- Hub production build, workspace typecheck, contracts, DB readiness 통과.
- 별도 PostgreSQL에서 migration 재실행·RLS·권한·중복 PK·CAS·메모 길이 제한 검증.
- 서울 운영 DB에 0036 적용 완료. Google/iCal 원본은 변경하지 않음.
- 실제 브라우저: 오늘 일정 완료/특이사항 저장 → 새로고침 유지 → Calendar 상세의 동일 기록 → 완료 취소 및 메모 비우기 확인. 검증용 내용은 원상 복구.
- 390×844에서 오늘 일정·메모 입력·저장 배치 확인. Drawer ESC 닫기 확인.
- 독립 코드 리뷰의 반복 iCal 일정 이동 시 기록 유실을 재현 후 수정. RECURRENCE-ID 기반 원래 회차 ID를 사용하며 파서부터 outcomeKey까지 회귀 테스트 통과.
- 저장 전 입력은 탭 내 화면 이동 동안만 보존. 페이지 전체 새로고침 시에는 서버에 저장된 값이 정본.
