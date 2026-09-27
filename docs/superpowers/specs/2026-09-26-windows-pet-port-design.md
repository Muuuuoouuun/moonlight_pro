# Windows 펫 이식 설계 (Moonlight Pet → apps/desktop)

> 상태: **구현 완료**(2026-09-27 — 운영자 결정 3건 확정, 세 패키지 병합 뒤 통합·강화. 검증 결과는 §6, 남은 빈틈도 §6). 관계: macOS 프로토타입 [`prototypes/moonlight-pet-macos`](../../../prototypes/moonlight-pet-macos/README.md)의 승인 스펙([승인 시안 적용](2026-09-24-pet-approved-glass-design.md) · [허브 연결](2026-09-25-pet-hub-connection-design.md) · [담당자 대화](2026-09-25-pet-agent-chat-design.md) · [메모 퍼치·드래그](2026-09-25-pet-memo-perch-and-drag-design.md) · [알림·Council](2026-09-25-pet-notifications-council-design.md) · [중간값 매핑](../plans/2026-09-26-pet-balanced-glass.md))을 **그대로 유지**하고, macOS 전용 부분만 Windows 방식으로 바꾼다. 같은 Electron 앱의 380×200 빠른 입력 위젯(`/widget`, Ctrl+Shift+M)과 **공존**한다.

## 1. 운영자 결정 (2026-09-26, 확정)

| # | 항목 | 결정 | 근거 |
| --- | --- | --- | --- |
| 1 | 유리 재질 | **A · Acrylic 실제 블러** — `BrowserWindow({ backgroundMaterial:'acrylic', frame:false, transparent:false, backgroundColor:'#00000000', thickFrame:false })` + DWM 호출 2건(`DWMWA_WINDOW_CORNER_PREFERENCE=2`, `DWMWA_BORDER_COLOR=0xFFFFFFFE`). 걸친 캐릭터(72px)는 패널이 소유하는 **별도 투명 창**. 승인된 CSS 레이어(중앙 음영 9% · 림 그라데이션 · 캐릭터 워시 42/52% · 글자 그림자 73/37%)는 Acrylic 위에 그린다 | 실제 데스크톱 위 Electron 목업 두 종(A Acrylic / B 투명 CSS 26px)을 비교해 운영자가 A 선택. B는 배경 앱을 흐리지 못해 밝은 앱 위에서 글자가 비친다 |
| 2 | 로그인 | **메인 창 세션 공유** — 펫은 메인 프로세스에서 기본 세션 쿠키(`com_moon_operator_session`)로 허브 API를 부르고 비-GET에 `Origin: <허브 origin>`을 붙여 쓰기 가드를 통과한다. 펫 안에 로그인 폼 없음. 401이면 `로그인 필요` + "메인 창에서 로그인" | Mac은 앱 전용 메모리 세션(재시작마다 로그인)이었으나 Windows 앱은 메인 창이 이미 세션을 유지하므로 한 번 로그인으로 통일 |
| 3 | 집중 모드 | **타이머 화면만**(모니터마다 불투명 차단 창 + 타이머·진행선·중지 확인·Esc 1.3초). 앱 전환·Win 키·Alt+Tab 차단 없음 | Windows는 네이티브 훅 없이 시스템 키를 막지 못한다 |

이 세 줄이 Mac 스펙과 다른 전부다. 나머지(클릭 모델·크기표·7개 모드·알림 규칙·대화 계약·저장 확인 규칙·모션·접근성 대체)는 Mac 결정을 그대로 따른다.

## 2. 대응표 (macOS → Windows/Electron)

| macOS | Windows |
| --- | --- |
| `.floating` 비활성 패널, 모든 Spaces | `alwaysOnTop('floating')` + `skipTaskbar`, 펫은 `focusable:false`, 말풍선은 `showInactive()`. 가상 데스크톱 전체 표시 API 없음 |
| 전체 화면 앱 위 숨김 | 대응 없음 |
| ⌃⌥M 전역 핫키 | `Ctrl+Alt+M`(펫 빠른 기능). `Ctrl+Shift+M`은 빠른 입력 위젯 그대로 |
| ⌘1~7 / ⌘S / ⌘Return / Esc | `Ctrl+1~7` / `Ctrl+S` / `Ctrl+Enter` / `Esc` (펫 창 안에서만) |
| 메뉴 막대 ☾ | 기존 트레이 메뉴에 항목 추가 |
| 창 크기 애니메이션 | 즉시 크기 변경 + 내용 크로스페이드 |
| 투명 픽셀 클릭 통과 | `setIgnoreMouseEvents` 히트테스트(퍼치 창·여백) |
| NSGlassEffectView(.clear) + 12px 흐림 | Acrylic(시스템 블러, 모서리 8px). 26px 모서리는 포기 |
| UserDefaults | `userData/pet-store.json`(키 이름은 Mac과 동일) |
| Keychain | 쓰지 않음(Mac도 안 씀) |

## 3. 구조

`apps/desktop/pet/`
- `shared/contract.js` — 모드·크기표·캐릭터 9종(색·워시·자산)·유리 값·봉투 종류·허브 경로·한도·IPC 채널. 세 계층의 단일 계약.
- `main/` — `pet-main.js`(설치 진입점) · `pet-windows.js`(펫·패널·퍼치·말풍선·집중 창) · `pet-dwm.js` · `pet-geometry.js` · `pet-input.js` · `pet-state.js` · `pet-store.js` · `pet-tray.js` · `pet-preload.js` · 허브: `pet-hub-client.js`(전송·봉투) · `pet-hub-api.js`(10개 엔드포인트) · `pet-activity.js`(알림) · `pet-chat.js` · `pet-pending.js` · `pet-hub.js`(조합)
- `renderer/` — `pet.html` · `perch.html` · `panel.html/css/js` + 모드 모듈 7개 · `bubble.html` · `focus.html`
- `assets/` — `portrait-<key>.png`(224px) · `cutout-<key>.png`(216px) — `scripts/pet-assets.mjs`가 프로토타입 원본에서 생성

허브 API·DB는 새로 만들지 않는다(Mac 원칙 유지). 프리로드 다리는 `window.moonlightPet = { invoke(channel, payload), on(event, handler) }` 하나이고 채널 이름은 계약 파일이 정본이다.

## 4. 검증 기준

- 셸: 기하 순수 함수·저장소·프리로드 허용 목록 단위 테스트, `--smoke-pet` 실화면 캡처.
- 허브 클라이언트: Mac `Tests/*` 번역(봉투 매트릭스·영수증 검증·저장 후 재조회·주간 일정·문의 검증·알림 중복 제거·대화 계약·Council 핸드오프) + 로컬 http 서버로 `Origin`·쿠키 헤더 도달과 리다이렉트 거부 확인.
- UI: 가짜 다리 하네스로 7개 모드 × 봉투 상태 캡처, 투명도 감소 모드 캡처, 뷰 모델 단위 테스트.
- 통합: 로컬 허브 dev 서버(loopback)로 E2E — 할 일 추가·완료, 메모 저장·재조회, 주간 일정, 알림 말풍선, 담당자 대화(Engine 없으면 preview/오류 정직 표시), Council 핸드오프, 집중 타이머; 패키징 빌드 스모크.

## 5. v1 범위 밖

WebGL 프리즘 림(Mac Metal 셰이더 이식) · 글라스 랩 · "이 Mac에만 저장" 로컬 모드 · 앱 전환 차단 · 앱 종료 중 알림 · 로그인 시 자동 실행.

## 6. 검증 결과 (2026-09-27, 세 패키지 병합 뒤 통합·강화)

셸(`pet/main` 창·입력·상태)·허브 모델(`pet-hub.js` + 전송·보류·알림·대화)·렌더러(`pet/renderer`)를 따로 만든 세 패키지를 한 트리에서
이었다. 통합 중 고친 것은 아래와 같고, 각 줄은 자동 테스트나 E2E 단계 하나로 확인했다.

**통합에서 고친 것**
- 허브 모델 경로를 하나로: 셸은 `pet-hub.js`의 `createPetHub(ctx)`만 쓴다. 폴링은 창이 다 뜬 뒤 켠다. 연결 상태의 정본은 허브 모델이다.
- 말풍선: 허브가 첫 새 알림을 쥔 채 놓지 않아 그 뒤 알림이 멈추던 문제(다가오는 일정 알림 유실 포함) — 셸 ctx 에서는 셸 줄에 넘기고 바로 다음 후보로 간다.
- 같은 주소로 설정을 다시 저장하면 상태가 `unknown`에 멈추던 문제, 익명 세션이 잠깐 `연결됨`으로 보이던 문제.
- 대화 화면은 Council 모드다(허브는 Office 모드로 보고 있었다). 셸이 그 화면을 떠날 때 `chatLeave()`를 부른다.
- 메모: 렌더러가 따로 만들던 요청 ID·revision·보류 기록(허브와 같은 저장 키를 덮어썼다)을 걷어 내고 허브 모델의 보류·충돌 요약만 읽는다.
  새 캡처 메모가 첫 저장에서 부딪혀도 캡처 충돌로 막고 ‘새 항목으로 Hub에 저장’으로 푼다. origin 이 붙는 허브 키는 렌더러가 쓰지 못한다.
- 말풍선 ✕는 말풍선만 내린다. Council 안건 넘기기는 셸이 메인 창을 `#moonlight-council=…` 경로로 연다. 집중 중지 확인은 닫을 수 있고
  다시 뜨지 않으며, Esc 가 페이지에도 간다. 위젯 → 빠른 패널 전환, 포인터를 잃은 누름, 저장소 한 인스턴스.
- 렌더러: Council 요청 표·질문 → 답 순서·busy boolean, IME 조합 중 단축키 무시, 할 일 Ctrl+Enter = 추가, ‘이 PC에서 숨기기’는 읽음이 아님,
  집중 채널 봉투 읽기, 허브 사유 코드를 한국어로(‘server’ 같은 코드를 그대로 보이지 않는다), `Hub 로그인 미설정`과 `Hub 주소 필요` 구별.

**검증자 2차 뒤 고친 것**
- 말풍선 넘겨주기의 회귀: 허브가 알림을 셸 줄에 넘기며 전달로 기록하므로, 패널·집중 화면이 열린 동안 줄에 쌓인 알림이 그 사이 읽음·숨김·시작한
  일정이 되어도 나중에 떴다. 줄은 이제 띄우기 직전 허브 목록으로 다시 거른다(Mac `presentNext`가 목록을 다시 거르는 규칙과 같다). 셸이 직접 넣은
  말풍선(`pushNotice`)은 거르지 않는다. 열린 알림 목록도 새 알림을 바로 받는다(전에는 배지 수가 바뀔 때만 갱신).
- 집중 화면 Esc 길게 누르기가 끝난 뒤 계속 누르고 있으면 자동 반복이 다시 재던 것 — 뗄 때까지 한 번.
- `--smoke-pet`이 허브 모델 없이(`hub:null`) 돌던 것 — 기본 경로로 `pet-hub.js`를 실어 패키지 안에서 허브 모듈이 읽히는지 확인한다.
- 통합 테스트의 허브 대역을 로컬 http 서버에서 프로세스 안 fetch 대역으로 바꿨다(포트를 열지 않는다, 패키징 제외).
- 초점을 잃은 지속 위젯이 단색 회색이 되던 것(실화면 캡처로 발견 — 배경 줄무늬가 바로 뒤에 있는데도 블러 없음). 줄무늬 위 네 창 비교에서
  초점을 받았다가 잃은 Acrylic 창만 단색이 되고, 한 번도 활성이 아니었던 창(말풍선)은 블러가 남으며, 초점을 잃은 창에 `WM_NCACTIVATE(TRUE)`를
  보내면 키보드 초점을 옮기지 않고 블러가 돌아왔다. 셸은 패널이 초점을 잃고도 남아 있으면 숨긴 PowerShell 도우미(하나, 처음 필요할 때)로 이를 보낸다.

**자동 테스트** — `npm --workspace @com-moon/desktop test` 255 통과(병합 직후 225). `pet/main/pet-integration.test.js`가 Electron 대역과
허브 fetch 대역으로 `install()`을 띄워 채널표(계약의 invoke 채널마다 핸들러 하나), 허브 모델 연결, 저장소 한 인스턴스, 채널별 응답을
렌더러 뷰 모델이 그대로 읽는 모양(할 일·메모·일정·알림·Council·집중), 말풍선 줄(패널이 열린 동안 넘겨받은 알림을 다시 거름), 허브 열기 규칙
(조각 허용, 스킴·호스트 거절), 허브 주소 변경(닿지 않는 곳 → `offline`, 되돌리면 `connected`)을 고정한다.
루트 `npm test`는 알려진 Windows 전용 실패 31건(codex-worker·mcp-server·office-codex-*·office-quality)만 남는다. `scripts/no-mock-data.test.mjs` 통과.

**E2E (a) 스텁 허브 + 실제 앱** — `apps/desktop/main.js`를 그대로 띄우고(격리한 `--user-data-dir`, `settings.json` 허브 주소 = 스텁)
펫 창을 실제 IPC·실제 렌더러로 몰았다. 스텁은 10개 엔드포인트를 LIVE 봉투로 답하고 세션 쿠키가 없으면 401, 쓰기에 허브 Origin 이
없으면 403이다. 37/37 단계 통과(검증자 2차 뒤 다시 실행): 쿠키 없음 → `로그인 필요`(빈 목록 아님) → 메인 창 `/login`에서 로그인 → 같은 기본 세션 쿠키로 펫 연결 →
할 일 추가(Enter·Ctrl+Enter, POST에 Origin·쿠키)·완료(3초 유예 뒤 숨김)·낡은 완료는 충돌 안내 → 메모 저장·재조회 확인·충돌 → 새 항목 →
주간 일정(종일·5분 뒤 일정) → Council 질문·답(질문 → 답 순서)·안건 넘기기(메인 창이 조각 경로로) → 새 문의 두 건이 말풍선으로 차례로,
✕ 뒤 1초 간격으로 다음 것 → 알림 목록·배지(숫자) → 숨기기(숨긴 한 건만 목록에서 빠지고 다른 알림의 읽음·허브 미확인 수는 그대로,
허브에 쓰지 않음) → Esc 접기 → 위젯의 알림 목록을 연 채 새 문의 두 건·곧 시작 일정이 들어오면 목록이 바로 늘고 말풍선은 기다림 → 패널에서
한 건 읽고 일정이 시작한 뒤 접으면 남은 문의 하나만 말풍선 → 펫 클릭·두 번 클릭(실제 포인터 경로)·걸친 캐릭터 →
Ctrl+Alt+M 위젯 → 빠른 패널 → 캐릭터 바꾸기(저장) → 집중 시작·Esc 1.3초 확인·Esc 로 닫기(캐릭터를 바꿔도 다시 뜨지 않음)·중지 →
투명도 줄이기(불투명 면) → 허브 주소를 닿지 않는 곳으로 바꾸면 상태가 정확히 `offline`(연결 상태 화면 `연결 안 됨`), 되돌리면 `연결됨`. 스텁이 거절한 요청은 모두 쿠키나 Origin 이 없던 것.

**E2E (b) 실제 허브 개발 서버**(`apps/hub`, `NEXT_DIST_DIR=.next.pet`, `127.0.0.1:3151`, Supabase·운영자 로그인 환경 변수 없음) — 실제 앱으로
할 일·일정·알림은 `Preview · 연결 필요`(목록을 채우지 않음), 할 일 추가·Council 질문은 `아직 저장되지 않았어요`(입력 유지), 메모는 허브가
`missing-persistence`로 답해 `저장 확인`으로 남고, 연결 상태 화면은 `Hub 로그인 미설정`. 펫의 쓰기는 모두 허브 Origin 과 쿠키를 실었고,
쓰기 가드는 같은 origin POST 를 받아들이고(202 preview) Origin 이 없거나 다른 POST 는 403으로 막았다. 개발 서버와 `.next.pet`은 지웠다.

**패키징** — 마지막 코드 커밋 뒤 다시 빌드(`electron-builder --win --x64`): `Moonlight-Setup-0.1.0.exe` 113,070,081바이트,
`Moonlight-Portable-0.1.0.exe` 112,832,306바이트, `app.asar` 1,716,548바이트(99개 항목, `pet/**` 86개 — 페이지 5·자산 18·`pet/fonts/` 글꼴 2,
테스트·`test-support`·렌더러 README 없음, asar 안의 `pet-timing.js`·`bubble.css`가 HEAD 와 같다).
`dist\win-unpacked\Moonlight.exe --smoke-pet`(허브 모델을 싣고 `hub-url-missing` 답을 확인)·`--smoke-test`·`--smoke-widget` 모두 통과(DWM 두 속성 HRESULT 0).

**캡처** — 처음 실행들은 작업 스테이션이 잠겨 있어(LogonUI) 실화면이 검게 나왔고, 그동안 페이지 렌더(`webContents.capturePage`)로 레이아웃을 보며 Council 질문 → 답 순서 오류와 입력 칸의 네모 초점 윤곽을 찾아 고쳤다. 잠금이 풀린 뒤 E2E (a)를 다시 돌려(36/36) 바쁜 배경 창(색 줄무늬 + 글자) 위에서 `desktopCapturer` 실화면 캡처를 남겼다 — 대기 펫 + 배지(님피아), 빠른 패널 할 일(휴지·누름 워시·뗀 뒤 워시 사라짐), 위젯과 걸친 캐릭터, 메모(빠른 메모 + 걸친 캐릭터), 일정(종일·시각 일정), Council(질문 → 답), 알림, 말풍선, 집중 화면·중지 확인, 투명도 줄이기(불투명 면). 그 캡처에서 빠른 패널 할 일·메모·Council은 블러가 보였지만, 위젯·알림·말풍선은 바쁜 배경 창이 바로 뒤에 있지 않아 블러를 증명하지 못했다(검증자 2차 지적). 하네스를 고쳐 캡처마다 배경 창을 그 영역 바로 뒤에 두고, 위젯은 다른 창에 초점을 준 채(패널 `isFocused()=false` 기록) 찍었다. 첫 실행(잠금이 풀린 뒤)에서 초점을 잃은 위젯이 줄무늬 위에서 단색 회색으로 나와 결함을 찾았고(위 '검증자 2차 뒤 고친 것'), 고친 뒤 다시 돌린 E2E (a) 37/37의 실화면 캡처 13장을 모두 읽어 확인했다: 초점을 잃은 위젯·걸친 캐릭터, 한 번도 활성이 아니었던 말풍선, 알림, 빠른 패널 할 일(휴지·누름 워시·뗀 뒤)·메모·일정·Council 모두 줄무늬와 글자를 흐리는 Acrylic 블러 + 8px 둥근 모서리·림, 투명도 줄이기는 불투명 면, 대기 펫 + 숫자 배지, 집중 화면·중지 확인(전체 화면 타이머). 잘림·읽기 어려운 글자는 없었다. 패키징한 앱의 `--smoke-pet` 캡처도 실화면으로 남았다. 캡처 파일은 작업 스크래치에만 두고 저장소에 넣지 않는다.

**남은 빈틈**
- 초점을 잃은 패널의 블러는 `WM_NCACTIVATE(TRUE)`에 기댄다. 초점을 잃은 뒤 첫 도우미 기동(수백 ms) 동안은 단색으로 보일 수 있다.
- 허브 모델 단위 테스트(`pet/main/pet-hub.test.js`, 허브 패키지에서 들어옴)는 아직 파일 안에 로컬 http 대역 서버를 띄운다. 통합 테스트의 대역은 프로세스 안 fetch 로 바꿨다.
- 투명도 줄이기는 `nativeTheme` 갱신을 흉내 내 확인했다. Windows ‘투명 효과’ 스위치가 이 값을 실제로 바꾸는지는 보지 못했다.
- ~~펫 오른쪽 클릭(Windows 기본 메뉴)의 얼굴 아이콘 + 체크 표시는 화면으로 보지 못했다~~ — 2026-09-27 화면 확인 완료(아래 후속 마감).
- ~~말풍선에서 연 일정·답변 알림은 모드만 연다~~ — 후속 마감에서 고쳤다(그 날·그 대화로 연다).
- 운영자 로그인이 없는 개발 허브에서는 세션 확인(`not-configured`)과 loopback 읽기(preview → 연결됨)가 번갈아 상태를 바꿀 수 있다(운영 허브는 게이트가 둘 다 막아 한 상태).

**후속 마감(2026-09-27)** — 남은 빈틈과 검증자 지적 가운데 코드로 닫을 수 있는 것. 각 줄에 단위·통합 테스트를 더했다
(`npm --workspace @com-moon/desktop test` 264 통과).
- 트레이 ‘짧은 메시지 보기’(`toggleBubble` → 줄의 `toggle()`)가 마지막 알림을 다시 띄울 때도 `pump()`와 같은 `isValid`(허브 목록 재확인)를
  거친다. 그사이 읽음·숨김·시작한 일정이 됐으면 그 알림 대신 기본 인사를 띄우고 잊는다(`pet-timing.js`).
- 집중 중지 확인이 떠 있을 때 Esc keyDown 은 확인을 닫고, 그 누름은 keyUp 까지 잠긴다 — 닫은 뒤 Esc 를 계속 누르고 있어도 1.3초를 다시 재지
  않아 확인이 다시 열리지 않는다. 메인(`createEscHold`의 `isConfirming`·`onDismiss`·`latch()`)과 페이지(`focus-model.escDownAction`,
  진행선도 뗄 때까지 그리지 않음)가 같은 규칙을 쓴다. 페이지의 ‘중지’ 버튼으로 연 확인을 Esc 로 닫으면 `pet:focus-state {dismissConfirm}`이
  이미 재기 시작한 누름을 잠근다. 메인이 거둘 때는 `state.focus.dismissRevision`을 올려 보조 모니터 창에서 누른 Esc 로도 주 모니터의 확인이 닫힌다.
- 말풍선 ‘내용 보기’: 일정 알림은 일정 모드를 그 날이 든 주·그 날 선택으로, 답변 알림은 Council 을 그 담당·범위 대화로 연다.
  채널 이름은 그대로 두고 `pet:set-mode` payload 만 넓혔다 — `{mode:'calendar', date:'YYYY-MM-DD'}` · `{mode:'council', ownerId, scope?}`.
  셸은 `state.modeTarget {seq, …}`로 패널에 전하고(같은 모드여도 새 seq), 패널은 새 seq 에만 `selectDate`·`selectSession`을 부른 뒤 다시 그린다.
  목적지가 없는 일정 알림은 알림 시각(일정 시작)의 이 PC 날짜를 쓴다.
- 들여쓰기·괄호(`pet-pending.js` 캡처 충돌 분기), 낡은 주석(`pet-hub.js` ‘모드가 office’ → ‘council’).
- 오케스트레이터 시각 확인 — 펫 오른쪽 클릭 캐릭터 메뉴(얼굴 아이콘 + 체크): **확인(2026-09-27)**. 패키징 빌드를 실제 데스크톱에 띄워 펫을 오른쪽 클릭 — `알림 보기` + 캐릭터 9종이 얼굴 아이콘과 함께 나오고, 현재 캐릭터(글레이시아)에 체크가 아이콘 왼쪽에 따로 그려진다(아이콘이 체크를 대신하지 않음). 같은 실행에서 `--user-data-dir`가 쿠키까지 격리하지 않는 것을 발견해 `sessionData`도 함께 옮기도록 고쳤다(af702b0d).
