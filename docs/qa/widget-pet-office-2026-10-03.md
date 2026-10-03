# 펫 Office 1안·클릭 반응 QA — 2026-10-03

운영자가 `1안, 그리고 클릭 반응이 좀 느려`로 선택한 작업 중심 Office를 Mac 네이티브 펫에 구현했다. 기존 Mac 빠른 입력·펫은 하나의 companion 창을 재사용한다. Windows는 별도 계약이며 이번 실기 검증 범위 밖이다.

## 적용한 동작

- ⌘4 → Office의 작업/대화 두 탭. 개인·회사별 최근 요청을 최대 20개씩 읽고, 이전 요청은 명시적으로 추가 조회한다.
- 목록에는 주간 정리·고객 답장 요청 메타데이터만 나온다. 본문은 선택 뒤 `결과 읽기`로 조회한다. 생성 완료와 업무 반영을 구분하며 만료는 본문을 숨긴다.
- 결과는 같은 창에서 읽기·복사한다. 후속 질문 준비는 운영자가 더보기에서 누를 때만 자료를 가져오고 기존 질문을 덮거나 자동 전송하지 않는다.
- Hub 링크는 `/dashboard/agents/office-request?request=<uuid>`다. 인증된 receipt에서 출처·범위를 복원해 기존 검토 패널을 사용한다. 임의 주간 기간을 지원하고 최초 링크 ID 이후에는 현재 선택·수정 결과를 유지한다.
- 펫 단일 클릭의 `NSEvent.doubleClickInterval` 대기(이 Mac 500ms)를 제거했다. mouse-up에 즉시 열고, 메모 perch로 호스트가 바뀌어도 두 번째 클릭은 고정한다. 이동·드래그·우클릭은 고정 후보를 취소한다.

## 자동 검증

| 검사 | 결과 |
|---|---|
| 루트 npm test | 4,586건 · 통과 4,573 · 실패 0 · 조건부 skip 13 |
| desktop workspace test | 346/346 통과 |
| Native Office 요청 검사 | API/모델 9그룹 + Store 9그룹 통과 |
| 기존 Office 대화 | API 8그룹·Store 통과 |
| Native Hub transport | 17검사 통과 |
| Native Hub domain | 주소 복구 6·인증 순서 8·API 14검사 통과 |
| Native panel interaction | 205검사 통과 |
| Native SelfCheck | 즉시 클릭·더블클릭·드래그 취소·단일 창·Office 대화의 가시성별 읽음·광학 검사 통과 |
| Hub 타입/공유 계약/빌드 | typecheck·check:contracts·production build 통과 |
| Native 설치 | 최종 번들 strict codesign 검증·실행 바이너리 일치·단일 프로세스 확인 |

즉시 클릭, Office 작업/대화의 읽음 구분, 재시도 취소의 stale 유지, Hub 새로고침의 선택 유지에는 수정 전 실패와 수정 후 통과를 확인했다. 독립 리뷰에서 지적한 늦은 응답·오류 표시·perch 이동 취소·401 로그인 복귀도 수정 후 재검증했다. 최종 리뷰의 남은 P1/P2는 없다.

## 실제 화면 검증과 한계

Mac CUA에서 더블클릭 고정 → ⌘4 Office → 작업/대화 → 개인/회사 선택 → 같은 창 Hub 로그인 화면을 확인했다. 첫 클릭의 의도적인 500ms 대기 제거는 실제 AppKit 이벤트/창을 사용하는 SelfCheck로 증명했다. 평균·p95 사용자 체감 지연을 측정한 것은 아니다.

Hub의 격리된 Chromium 검증은 데스크톱/390px, 지정 UUID, 임의 주간 기간, 열기/접기, 만료·read 오류·메타 불일치·잘못된 UUID·401 로그인 후 동일 요청 복귀를 포함한다. 브라우저 JavaScript 오류 0·자동 업무 쓰기 0이었다.

새 설치본의 자체 세션은 재시작하며 초기화된다. 사용자 로그인 후 Mac 화면에서 실제 항목을 선택하고 본문 복사·Hub 왕복까지 진행하는 수동 확인은 남아 있다. Electron/브라우저 쿠키를 복사하거나 세션을 만들어 우회하지 않았다.

## 운영 연결

- 서울 DB `ncgpnqfulnlshegalmbd`에 `20261003_0066_office_request_inbox.sql` 적용, migration ledger SHA-256 검증 완료(`b0af0b174817…`). `db:check` 44개 항목 통과.
- 기존 테이블 권한은 닫혀 있으며 새 RPC는 서버 service_role만 실행한다. workspace·actor·scope를 고정하고 결과·스냅샷·토큰은 목록에서 제외한다. 새 라우트에 OPEN 예외는 추가하지 않았다.
- 코드 `a7461af4`의 Hub 배포 `dpl_5m54WywqijKuUH6Fnwq1c6AhcK32`가 Ready이고 `https://moonlight-pro-hub.vercel.app`에 연결됐다. Engine 코드는 변경하지 않았다.
- 운영 health 200/ok, 비인증 inbox 401. 기존 서버 자격으로 개인 0건·회사 1건을 200/ready/live로 읽었다. 회사의 생성된 요청 receipt는 ID·scope·intent 일치, persisted=true와 본문 존재를 확인했다.
- 이 실제 운영 응답을 앱의 `HubAPI.officeInbox/officeReceipt` decoder로 재생해 개인/회사 목록과 생성된 본문 모두 통과했다. 개인 데이터 임시 파일과 검증 실행 파일은 제거했으며 업무 레코드나 유료 생성은 추가하지 않았다.
- 최종 Mac 앱은 `~/Applications/MoonlightPetPreview.app`에 설치했다. Hub 셸이 별도 네이티브 설치본을 우선 재사용한다. 운영 주소와 기존 입력은 유지한다.

실행 로그는 `/tmp/moonlight-office-*.log`에 남긴다. 시크릿·세션 쿠키·결과 본문은 로그에 출력하지 않았다.
