# Windows 펫 이식 설계 (Moonlight Pet → apps/desktop)

> 상태: **구현 중**(2026-09-26 운영자 결정 3건 확정, 병렬 구현 진행). 관계: macOS 프로토타입 [`prototypes/moonlight-pet-macos`](../../../prototypes/moonlight-pet-macos/README.md)의 승인 스펙([승인 시안 적용](2026-09-24-pet-approved-glass-design.md) · [허브 연결](2026-09-25-pet-hub-connection-design.md) · [담당자 대화](2026-09-25-pet-agent-chat-design.md) · [메모 퍼치·드래그](2026-09-25-pet-memo-perch-and-drag-design.md) · [알림·Council](2026-09-25-pet-notifications-council-design.md) · [중간값 매핑](../plans/2026-09-26-pet-balanced-glass.md))을 **그대로 유지**하고, macOS 전용 부분만 Windows 방식으로 바꾼다. 같은 Electron 앱의 380×200 빠른 입력 위젯(`/widget`, Ctrl+Shift+M)과 **공존**한다.

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
