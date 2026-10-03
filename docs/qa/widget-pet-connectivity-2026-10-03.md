# 위젯·펫·연결 상태 QA — 2026-10-03

| 항목 | 확인 내용 |
|---|---|
| 기준 | `d235372c`에서 시작한 `codex/widget-pet-connectivity-1003` |
| 요청 | 위젯·펫·연결 점검과 개발, 작은 빠른 입력 창과 캐릭터가 있는 펫 위젯의 겹침 확인 |
| 범위 | Mac 네이티브 펫, Electron 셸의 Mac 호출 경로, 비교용 빠른 입력 위젯, Hub·Engine 상태 |
| 실행 환경 | macOS 26.6.2 arm64, Node 24.18.0, Electron 44.4.5, Swift 6.3.3 |
| 쓰기 경계 | 격리된 테스트 저장소와 메모리 API에서만 업무 쓰기 검사. 운영 API는 상태와 비인증 read만 요청 |

수정 커밋은 `15aece1e`(인증 만료 순서)와 `b1328ee4`(창 전환 겹침)이다.

## 결과

| 계약 | 검사·근거 | 결과 |
|---|---|---|
| Mac 빠른 입력·할 일 위젯은 같은 네이티브 펫으로 전달 | `--smoke-mac`: memo/tasks, hidden Hub, no shell tray/widget | 통과. 기존 통합 경로가 정상이며 이번에 새로 만든 경로가 아님 |
| 메모·업무 모드를 바꿔도 지속 위젯 창을 재사용 | 네이티브 `--self-check`, 실제 NSPanel의 객체와 가시성 검사 | 통과 |
| 지속 위젯 ↔ 빠른 패널 전환 중 기능 창 하나만 표시 | 새 창 검사에서 수정 전 겹침 재현, 수정 후 통과 | ISSUE-002 수정 |
| 뒤늦은 read가 더 최근 인증 만료를 지우지 않음 | 메모 저장·할 일 생성 각각에서 오래된 성공 read와 401 write 순서 제어 | ISSUE-001 수정 |
| 연결 실패가 빈 목록·저장 성공으로 표시되지 않음 | Swift 전송·도메인 검사, 실제 `/widget` preview 화면의 Enter 동작 | 통과. 입력을 유지하고 저장하지 않았다고 표시 |
| 빠른 입력 비교 창의 창·IPC·로그인 규칙 | `--smoke-widget`: 380×200, 높이 제한, 고정, ESC, 화면 경계, 로그인 이동 | 통과 |
| 실제 빠른 입력 화면이 380×200에 맞음 | 별도 로컬 Hub `3147`의 `/widget`, overflow 0, 고정·닫기 표시 | 통과. Supabase 없는 preview 조건 |
| 운영 Hub 상태 | `GET /api/health`: HTTP 200, status ok, Supabase reachable | 통과 |
| 운영 Engine 상태 | `GET /api/health`: HTTP 200, status ok, Supabase reachable | 통과 |
| 운영 Hub 인증 게이트 | session은 anonymous/configured, 비인증 업무 read는 HTTP 401 | 통과. 로그인한 업무 데이터·쓰기 검사는 수행하지 않음 |
| 저장된 펫 Hub 주소 연결 | `petPreview.hubURL = http://127.0.0.1:3000`, 해당 포트 서버 응답 없음 | 설정상 연결 불가. 저장 주소를 자동 변경하지 않음 |
| 사용자가 보고한 작은 입력 창 + 펫 위젯의 지속적인 동시 표시 | 현재 Mac 일반 실행·프로세스에서 작은 입력 창 없음, 표준 진입점은 네이티브로 전달 | 재현 불충분. ISSUE-002의 짧은 전환 겹침과 구분 |
| Windows 실기 창·Acrylic | Mac 환경에서는 실행하지 않음 | 미검증. Mac 결과로 Windows 통과를 주장하지 않음 |

Mac 표준 실행에서 `⌘⇧Space`는 펫 메모, `⌘⇧M`은 같은 펫의 할 일 위젯으로 간다.
이미 지속 위젯을 열었다면 같은 창에서 내용만 전환한다.
`--smoke-widget`와 `--smoke-pet`은 별도 Electron 표면을 검사하기 위한 비교 실행이다.
Windows에서는 작은 빠른 입력 위젯과 펫이 각각 남아 있는 별도 플랫폼 계약이므로,
이번 Mac 수정으로 Windows의 진입점까지 합치지는 않았다.

## ISSUE-001 — 오래된 read가 인증 만료를 지우는 순서 문제

401로 메모 저장 또는 할 일 생성이 거절된 직후, 그보다 먼저 시작한 read가 성공하면
`needsLogin`을 다시 false로 바꾸고 쓰기 버튼을 활성화했다.
그 성공 응답은 최근 인증 상태를 증명하지 못한다.

- 수정: 인증 거절 시 상태 버전을 올린다. read가 시작한 이후 새로운 인증 거절이 없고
  업무·일정 read가 모두 성공한 경우에만 로그인 필요 상태를 해제한다.
- 영구 검사: `HubDomainTests.sessionExpiryChecks` — 메모·할 일 모두 로그인 요구,
  두 쓰기 차단, 미확인 입력 보존, 새로운 성공 read 뒤 복구를 확인한다.
- 수정 전: `/tmp/moonlight-session-expiry-red-1003.log`의
  `An older successful read must not clear the newer login requirement` 실패.
- 수정 후: `/tmp/moonlight-widget-pet-final-domain-1003.log`의
  `Session expiry ordering checks (8)` 통과.

## ISSUE-002 — 기능 창 전환 중 이전 창이 잠깐 남음

지속 위젯에서 빠른 패널로 전환할 때 이전 위젯을 fade로 닫는 동안
새 패널을 먼저 열어 두 기능 창이 동시에 보였다.
이는 사용자 보고의 별도 작은 입력 창 동시 실행과 동일한 원인이라고 확인한 것은 아니다.

- 수정: 새 기능 창을 표시하기 전에 보이거나 표시 예정인 다른 기능 창을 즉시 내린다.
  이전 fade의 완료 콜백도 버전 검증으로 무효화한다.
- 영구 검사: `SelfCheck.checkCompanionWindows` — 실제 AppKit 창에서 메모·업무
  창 재사용과 지속 위젯 ↔ 빠른 패널의 상호 배타적인 표시를 확인한다.
  이전 닫기 애니메이션이 끝난 뒤에도 다시 연 위젯의 표시·투명도·입력 상태가 유지되는지 확인한다.
- 수정 전: `/tmp/moonlight-window-red-1003.log`의
  `Quick panel overlaps the outgoing pet widget` 실패.
- 수정 후: `/tmp/moonlight-window-green-1003.log`의
  `companion window exclusivity and shared memo/task widget (5)` 통과.
- 캐릭터, 유리 재질, 창 크기·배치 계약은 변경하지 않았다.

## 검증

```sh
npm test
npm --workspace @com-moon/desktop test
bash prototypes/moonlight-pet-macos/script/test_hub_domain.sh
node apps/desktop/scripts/build-mac-pet.mjs
./prototypes/moonlight-pet-macos/dist/MoonlightPetPreview.app/Contents/MacOS/MoonlightPetPreview --self-check
```

| 검사 | 확인 결과 | 로컬 증거 |
|---|---|---|
| 루트 전체, 두 기능 수정 후 | 4,180개 중 4,167 통과, 실패 0, skip 13 | `/tmp/moonlight-widget-pet-final-root-1003.log` |
| 데스크톱 | 346 통과, 실패 0 | `/tmp/moonlight-desktop-baseline-1003.log` |
| Swift 도메인 | API 14, 주소 복구 6, 인증 만료 순서 8 및 기존 모델 검사 통과 | `/tmp/moonlight-widget-pet-final-domain-1003.log` |
| Swift 전송 | 17 통과 | `/tmp/moonlight-test_hub_transport-baseline-1003.log` |
| Hub activity | 8 통과 | `/tmp/moonlight-test_hub_activity-baseline-1003.log` |
| Pet activity | 업무 완료 8, activity·Council 초안 14 통과 | `/tmp/moonlight-test_pet_activity_store-baseline-1003.log` |
| Office | API 7, store 검사 통과 | `/tmp/moonlight-test_office_chat_api-baseline-1003.log`, `/tmp/moonlight-test_office_chat_store-baseline-1003.log` |
| 패널 조작 | 205 통과 | `/tmp/moonlight-test_panel_interaction-baseline-1003.log` |
| 네이티브 빌드·서명 | 빌드, strict 코드 서명 검증 통과 | `/tmp/moonlight-window-green-build-1003.log` |
| 네이티브 자체 점검 | Metal·글자·클릭·입력 보존·새 창 상호 배타 검사 통과 | `/tmp/moonlight-window-green-1003.log` |
| Mac 셸 | 메뉴·활성화·네이티브 메모/업무 위임 통과 | `/tmp/moonlight-mac-shell-1003.log` |
| 비교 위젯 | 창·IPC 검사 통과 | `/tmp/moonlight-widget-1003.log` |
| 실제 preview 위젯 | overflow 0, Enter 뒤 저장하지 않음·입력 유지 | `/tmp/moonlight-widget-preview-1003.log` |

네이티브와 Electron 검사는 루트 테스트 글롭에 포함되지 않아 별도로 실행했다.
데스크톱·전송·activity·Office·조작 검사의 대상 소스는 이후 변경하지 않았다.
루트 실행 뒤 네이티브 자체 점검에 애니메이션 완료 후 확인을 추가했으며,
최종 빌드·서명·자체 점검을 다시 통과했다.
임시 로그와 화면 이미지는 로컬 실행 증거이며 저장소에 개인정보나 인증 값을 넣지 않았다.

## 연결 복구와 한계

펫에서 **더보기 → Hub 연결 설정 → Hub 주소 설정 → 운영 Hub 주소 사용**을 선택한 뒤
운영자 계정으로 로그인하면 된다. 운영 주소는 `https://moonlight-pro-hub.vercel.app`이다.
주소는 로그인에 성공했을 때 저장된다. 취소하거나 로그인에 실패하면 기존 주소가 남는다.
Hub 앱 셸의 로그인 쿠키·주소와 네이티브 펫의 설정·세션은 별개다.

`3001`에서 실행 중인 서버도 확인했지만 Hub session/tasks API는 HTTP 404였으므로
정상 Hub 서버의 대체 주소로 쓰지 않았다.
운영자 인증으로 업무 데이터를 읽거나 운영 DB에 기록하는 검사는 실행하지 않았다.
따라서 서버 health 정상과 실제 로그인·저장 성공은 구분해야 한다.

별도 preview Hub 서버와 Electron 비교 스모크는 종료했다.
실행을 위해 만든 격리 테스트 UserDefaults와 Swift 임시 실행 파일은 테스트가 정리했다.
승인된 로컬 작업 브랜치와 빌드 산출물은 검토·실행을 위해 유지한다.
이 점검에서 띄웠던 개발용 펫만 종료하고 최종 빌드로 다시 실행했다.
현재 네이티브 펫 프로세스는 하나이며 저장 Hub 주소는 여전히 `127.0.0.1:3000`이다.
기존 사용자 초안·Hub 주소·다른 세션의 작업·서버는 변경하지 않았다.
프로덕션 배포나 전체 앱 설치본 교체는 수행하지 않았다.
