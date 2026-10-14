# 확인할 것 기존 작업 통합 검증 — 2026-10-07

검토 기준은 최신 main·이전 선별 통합·10월 6일 cloud 변경과 보안 패치를 포함한 `f1943fabdc7b801b0e791000ab719b1526eceeb9`이다. 기존 `claude/gifted-darwin-de0fsl`의 정확한 tip은 `27d569bfd44587244de62f81d72d563118315d06`이다. 원본 checkout·다른 세션의 미커밋 내용을 변경하지 않고 `codex/moonlight-check-items-sync-20261007` 전용 worktree에서 아래 7개 기존 커밋을 검토·선별 적용했다. 운영 DB·OAuth·자격·provider·푸시·배포는 실행하지 않았다.

| 기존 커밋 | 통합 커밋 | 내용 |
| --- | --- | --- |
| cd08ac2a | 7e1ab739 | 기존 운영자 선택과 화면 방향 문서 |
| 4b7bc2a2 | 3b4e8949 | 끊긴 신호 버튼·이동을 처리 완료로 세는 동작 정리 |
| b72de5cd | d42848dd | 끝내기 영수증·한 장씩 홈·보류 |
| ca71b513 | 53558a7d | 시간 잡기·일정 읽기·레일 |
| dee0c156 | 8a3d35f2 | 막힘 풀기·병목 이력·결정/할 일 연결 |
| e20c27f4 | a944c4ff | 결정 일지·출처·그래서 할 일 |
| 27d569bf | c6ef9806 | 확정·미정 문구 |

Home의 로그인 만료 표면과 최신 읽기 캐시, 오피스 한글 표기·금융 내비·목표 화면을 보존했다. AGENTS/CLAUDE의 옛 테스트 수·다음 마이그레이션 번호 변경은 가져오지 않았다. README 충돌에서는 이 기능의 행만 갱신하고 최신 Office·모바일·다른 정본을 유지했다. 부모 통합 브랜치의 후속 DailyBrief 캐시/401 보정과 병합할 때 `checkItems` 데이터 투영도 함께 보존해야 한다.

## 저장 결함 수선

안전 보정 커밋은 `45aef362`이다. 기존 branch의 `{ status }` 없는 HTTP200을 저장 성공으로 치환하는 로직과 Google 일정 생성 후 모든 receipt 실패에서 DELETE하는 보상 경로를 제거했다. 실제 저장됐지만 응답만 유실된 경우를 미저장으로 단정하지 않는다.

- `apps/hub/lib/check-write-ack.js`와 실제 action 모듈은 명시 `saved/duplicate`, 반환 ID·작업 범위·원본 정규화 입력을 확인한다. 부분 성공은 확인된 단계만 진행한다. 결정의 표시용 링크 ACK가 불명확하면 별도 문구로 알린다.
- `apps/hub/lib/check-write-intent.js`는 기존 QuickTask의 owner/workspace/session-expiry 판정과 로그아웃 알림을 재사용한다. 이 탭의 체크 항목/동작별 `sessionStorage`에 첫 쓰기 전에 입력·ID·진행 상태를 기록하고 readback한다. 같은 요청은 재탐색·reload 뒤에도 같은 ID를 쓴다. 복원은 자동 전송하지 않으며 변경된 폼은 먼저 이전 입력을 복원하고 운영자가 다시 확인한다.
- 텍스트 보관은 최대 15분과 로그인 만료 중 짧은 쪽이다. 만료·시계 역행에는 텍스트를 비우고 새 ID를 막는 marker를 로그인 만료까지 둔다. 브라우저 저장 API가 거부되면 첫 위험 쓰기를 보내지 않는다. 만료 이후 새 요청 기능을 추가하지 않았으므로 기존 기록을 직접 확인해야 한다.
- `use-check-write.js`는 즉시 busy 잠금·컴포넌트 세대·unmount와 소유자 읽기 사이의 재검사를 한다. 오래된 응답은 성공 callback을 실행하지 않는다. unblock 완료 callback을 기다리는 동안 같은 결정을 다시 만들지 않는다.
- 기존 tasks assertion을 새 영수증과 기존 프로젝트·결정·날짜 다시·CRM 보류의 선택적 recovery assertion에도 적용했다. 원래 assertion을 보내지 않던 호출의 가드·인증 계약은 유지한다.
- `repositories/signal-outcomes.js`는 같은 request ID의 **전체 정규화 payload와 workspace**를 대조한다. 다른 제목·대상·참조·예약 시간·provider ID·메모는 conflict다. 읽기 장애에서는 새 insert를 막고 미적용 테이블은 preview다. 날짜 경계를 지난 이미 저장된 보류는 duplicate로 확인하며, 이미 되돌린 receipt를 다시 활성 예약으로 성공 처리하지 않는다. undo의 응답 유실 재시도도 duplicate로 확인한다.

## 외부 일정 및 DB 경계

새 **확인할 것 → Google 일정 생성**은 안정 provider 생성 ID와 응답 유실 재조회가 구현·검증될 때까지 action과 UI에서 명시 차단했다. 숨은 Moonlight fallback·provider POST·보상 DELETE는 없다. 캘린더 읽기와 **Moonlight 내부 예약**은 유지하며 일반 캘린더의 기존 생성/갱신 경로는 차단하지 않았다. 기존 provider ID를 가진 예약의 변경/취소는 provider ACK를 확인하지 못하면 실제 반영 여부를 단정하지 않고 캘린더 확인을 요구한다. 테스트는 합성 응답만 사용했다.

옛 미적용 `20261001_0056_signal_outcomes.sql`은 **내용 변경 없이** `20261007_0070_signal_outcomes.sql`로 재번호했고 readiness 참조를 갱신했다. Office 담당의 0069와 겹치지 않는다. **운영 적용 0회**다. 운영 테이블 존재 여부는 이번 작업에서 조회하지 않았으므로 배포만으로 이 저장 기능이 운영에서 사용 가능하다고 주장하지 않는다.

## 검증 근거와 한계

최종 변경 관련 27개 테스트 파일 **252/252 통과**. 여기에는 실제 Engine PMS 모듈을 사용하는 lost-ACK task/decision 재시도, receipt 1행 재확인, 다른 ID/범위/본문 ACK 거부, storage 거부/readback 실패, owner/workspace 변경, TTL·시계 역행, 소유자 읽기 중 panel 종료, 실제 영수증 repository의 전체 duplicate 충돌·읽기 장애·undo·날짜 경계 사례가 들어 있다. 새 Google 생성은 provider·receipt 호출 **0회**를 검증했다.

Hub·Engine force build **2/2**, 후속 Hub 최종 force build **1/1**, typecheck **4/4**, syntax guard **1666파일/0문제**. 준비상태 SQL의 임시 PostgreSQL 읽기 검증도 통과했다. 첫 sandbox 실행은 `shmget Operation not permitted`였지만 운영 DB와 무관한 격리 임시 PostgreSQL로 재실행해 통과했다.

`npm install --offline --ignore-scripts`는 `undici-types` 캐시 메타데이터 `ENOTCACHED`로 끝나 설치 성공으로 세지 않는다. 검증에 사용한 기존 의존성의 workspace 링크가 이 worktree의 소스를 가리킴을 확인했고 lockfile 변경은 없다. 최종 깨끗한 CI 설치·전체 monorepo 회귀는 부모 통합 브랜치에서 확인한다.

원시 로그는 이 전용 worktree의 gitignore된 `output/check-items-sync-20261007/`에 있다. 실제 로그인된 운영 화면·provider·모델·고객 입력·운영 DB 검증을 한 것은 아니다. 연락 기록과 이미 완료된 막힘 풀기의 부가 표시용 receipt ACK 실패는 `receiptMissing`으로 알리며, 핵심 기록을 재생성하지 않는다. 새 저장 복구가 모든 기존 CRM·일반 Calendar·결정 생성 화면의 전역 복구를 대신한다고 주장하지 않는다.
