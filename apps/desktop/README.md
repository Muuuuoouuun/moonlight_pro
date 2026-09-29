# Moonlight 데스크톱 (Windows·macOS)

Moonlight 허브를 Windows·macOS 앱 창으로 여는 Electron 셸이다(같은 코드, `process.platform === 'darwin'`에서만 갈라진다 — 아래 [macOS](#macos)). 허브 화면은 그대로 원격 주소에서 불러오고,
앱은 창·트레이·빠른 입력 단축키만 더한다. 허브 코드를 복사하지 않으므로 허브를 배포하면 앱도 바로 최신이다.

## 허브 주소 정하기

주소는 코드에 박지 않는다. 앱은 아래 순서로 찾는다.

1. 사용자 설정 `%APPDATA%\Moonlight\settings.json`의 `hubUrl` — 첫 실행 화면이나 메뉴 **허브 주소 바꾸기**에서 저장한 값
2. 앱 기본값 `apps/desktop/app.config.json`의 `hubUrl` — 저장소에는 빈 값(`""`)으로 둔다. 배포 주소가 정해지면 여기에 넣고 다시 빌드하면 첫 실행 화면 없이 바로 열린다
3. 둘 다 없으면 첫 실행 화면(주소 입력 하나, 저장 버튼)

받는 주소는 `https://…` 전부와 개발용 `http://localhost`·`http://127.0.0.1`뿐이다. 경로는 버리고 origin만 저장하며,
창은 `<허브 주소>/dashboard`를 연다. 허브를 열지 못하면 첫 실행 화면으로 돌아와 실패한 주소와 원인을 보여 준다.

- 로그인: 기본 영구 세션을 쓰므로 운영자 로그인 쿠키가 앱을 다시 켜도 남는다.
- 주소 정책: 허브 origin만 앱 창에서 연다. 다른 origin으로 가는 링크·`target=_blank`·`window.open`·리다이렉트는
  시스템 브라우저로 넘긴다(http·https·mailto만). 같은 origin의 새 창 요청은 현재 창에서 연다.
  그래서 Google 연결 같은 외부 OAuth 흐름은 시스템 브라우저에서 진행된다.
- 창 크기·위치는 `window-state.json`(같은 폴더)에 저장해 다음 실행에 되살린다. 최소 크기 390×600.

## 쓰는 법

| 동작 | 방법 |
| --- | --- |
| 빠른 입력 | 어디서든 **Ctrl+Shift+Space** · 트레이 메뉴 · 앱 메뉴 |
| 위젯 열기·숨기기 | 어디서든 **Ctrl+Shift+M** · 트레이/앱 메뉴 **위젯 열기**(떠 있으면 **위젯 숨기기**) · 위젯 안에서 **ESC** |
| 창 닫기 | 트레이로 숨는다(앱은 계속 실행) |
| 종료 | 트레이 메뉴 **종료** 또는 Ctrl+Q |
| 주소 바꾸기 | 앱 메뉴 또는 트레이 메뉴 **허브 주소 바꾸기** |

앱을 한 번 더 실행하면 새 창을 띄우지 않고 기존 창을 앞으로 가져온다.

**빠른 입력이 여는 것.** 허브의 공유 대상(`/dashboard?title=&text=&url=`, `hub-app.jsx`)은 세 값이 모두 비면
아무것도 열지 않는다. 그래서 `?text=`처럼 빈 값으로는 빈 캡처 창을 열 수 없다. 앱은 대신 `/dashboard`가 아니면
`/dashboard`로 이동한 뒤, 허브의 전역 단축키 `C`(입력 칸 밖에서 누르면 `GlobalQuickCapture`가 열림)와 같은
keydown 이벤트를 페이지에 보낸다. 로그인 화면에 있을 때는 아무것도 열리지 않는다.

## 위젯

메인 창과 별개인 작은 빠른 입력 창이다. 테두리 없는 380×200 창에 허브의 `<허브 주소>/widget` 페이지를 띄운다
(작업 표시줄에 나오지 않고, 크기 조절·최소화 없음). 화면 구성과 저장은 허브 페이지가 맡고, 앱은 창만 다룬다.

- **열기·숨기기**: **Ctrl+Shift+M**(어디서든) 또는 트레이·앱 메뉴. 열면 위젯에 포커스가 가서 페이지가 입력 칸에
  바로 커서를 둘 수 있다. **ESC**는 위젯을 숨긴다. 숨겨도 페이지는 살아 있어 다시 열면 바로 뜬다.
- **고정**: 기본은 다른 창 위에 떠 있음(항상 위). 페이지의 고정 버튼으로 끄고 켠다. 고정 여부는 저장된다.
- **위치 기억**: 끌어 놓은 자리를 `widget-state.json`(`%APPDATA%\Moonlight\`, `{ x, y, pinned }`)에 저장한다.
  처음에는 주 모니터 작업 영역 오른쪽 아래(가장자리에서 16px). 열 때마다 지금 모니터 배치의 작업 영역 안으로
  밀어 넣으므로, 모니터를 뺀 뒤에도 화면 밖에서 열리지 않는다. 끌 수 있는 영역은 페이지가 CSS로 정한다.
- **높이**: 페이지가 140–360px 사이로 높이를 바꿀 수 있다. 아래 끝을 고정한 채 위로 자란다.
- **로그아웃 상태**: 세션이 없거나 끝나 허브가 `/login?next=%2Fwidget`으로 보내면 위젯은 로그인 폼을 그리지 않는다 —
  위젯을 숨기고 메인 창에서 로그인 화면을 연다. 이때 `next`가 위젯 화면을 가리키면 지운다(`mainLoginUrl`,
  `widget-window.js`) — 그대로 두면 로그인 뒤 380px 위젯 페이지가 큰 메인 창에 뜬다. 그래서 메인 창은 `/login` →
  `/dashboard`로 간다(위젯이 아닌 `next`와 다른 쿼리는 남긴다). 로그인한 뒤 다시 Ctrl+Shift+M을 누르면 위젯이 뜬다.
- **허브 주소가 없을 때**: 위젯 대신 메인 창에 허브 주소 설정 화면을 연다.
- **허브를 열지 못할 때**: 메인 창과 같이 설정 화면에서 실패한 주소와 원인을 보여 준다.
- **주소 정책**: 메인 창과 같다. 다른 origin 링크는 시스템 브라우저로, 같은 origin의 새 창 요청은 메인 창에서 연다.

위젯 페이지가 쓰는 다리 `window.moonlightWidget`(프리로드 `widget-preload.js`, 위젯 창의 허브 페이지 최상위 프레임만 호출 가능):

| 함수 | 하는 일 |
| --- | --- |
| `pin(boolean)` | 항상 위 켜기·끄기(저장). Promise로 적용된 값 |
| `isPinned()` | 지금 고정 여부(동기, boolean) |
| `close()` | 위젯 숨기기(ESC와 같음) |
| `openMain(path)` | 메인 창을 `<허브 주소><path>`로 열고 앞으로. `/`로 시작하는 허브 안 경로만(스킴·호스트·`//`·역슬래시 거절), Promise로 `{ ok, reason? }` |
| `setHeight(px)` | 위젯 높이를 140–360px로 잘라 적용. Promise로 적용된 높이 |

허브 페이지는 `window.moonlightWidget`이 있는지 보고 쓴다(브라우저에서 `/widget`을 열면 없다).

## 펫

화면 가장자리(기본 오른쪽, 왼쪽으로 바꿀 수 있다)에 사는 작은 캐릭터(Office 담당자 9명 중 하나)와 그 옆에 뜨는 유리 패널이다. 할 일·메모·일정·Office·Council·
집중·알림 일곱 가지를 허브 창을 열지 않고 바로 쓰고, 새 문의·곧 시작할 일정은 짧은 말풍선으로 알린다. macOS 프로토타입
(`prototypes/moonlight-pet-macos`)의 승인 스펙을 같은 Electron 앱 안에 옮긴 것이다.
허브 창·위젯과 따로 떠 있고, 앱을 켜면 마지막 자리(처음에는 주 모니터 오른쪽 가장자리)에 대기 얼굴이 뜬다. 셸 코드는 `pet/main/`, 세 계층이 함께
쓰는 값(모드·크기·캐릭터 9종·유리 값·채널 이름)은 `pet/shared/contract.js` 하나다. 기준 결정은 2026-09-26 운영자 결정
(재질 = Windows 11 Acrylic 실제 블러, 로그인 = 메인 창 세션 공유, 집중 = 타이머 화면만)이다.

### 창

| 창 | 크기·자리 | 성질 |
| --- | --- | --- |
| 펫 | 56×56, 작업 영역 가장자리(기본 오른쪽, 왼쪽 가능)에서 8px·처음엔 아래쪽 1/3 | 투명, 포커스를 받지 않음(클릭은 받음). 자유롭게 끌고 놓으면 가까운 가장자리로 붙는다. 자리는 `pet.position`에 저장 |
| 빠른 패널 | `contract.glassSize(mode)`(할 일 320×488 …), 펫의 화면 가운데 쪽 10px(오른쪽 가장자리면 왼쪽)·펫 세로 중심 | Acrylic 유리. 밖을 누르거나 다른 앱으로 가면 접힌다 |
| 지속 위젯 | 같은 유리 창을 계속 띄운 것. 유리 + 위 54px 띠의 바깥쪽 위 모서리 = 펫의 바깥쪽 위 모서리(오른쪽 가장자리면 오른쪽 위, 왼쪽이면 왼쪽 위) | 펫은 숨는다. 모드·높이가 바뀌어도 그 모서리를 고정 |
| 걸친 캐릭터 | 72×72, 유리 바깥쪽(가장자리 쪽)에서 20px 안쪽, 유리 위로 54px(18px 겹침) | 패널이 소유한 투명 창. 위젯과 빠른 메모에서만 보이고 패널과 같이 움직인다 |
| 짧은 메시지 | 326×130, 펫의 화면 가운데 쪽 | Acrylic, `showInactive`로만 뜬다(포커스를 빼앗지 않음). 실제로 뜬 뒤 8초 보이고 다음 것은 1초 뒤. 패널·집중 화면이 열려 있거나 펫을 숨겼으면 기다린다 |
| 집중 화면 | 화면마다 하나, 그 화면 전체 | 불투명. 주 화면에만 타이머·진행선·중지. 앱 전환은 막지 않는다 |

모두 항상 위(`floating`, 집중 화면은 `screen-saver`)이고 작업 표시줄에 나오지 않는다. 왼쪽 가장자리에서는 오른쪽 숫자를 그대로
거울로 놓는다(`state.side`로 렌더러에도 알린다). 창 배치 규칙은 `pet-geometry.js`(순수 함수)에 있다.

**자리 저장·모니터.** `pet.position`은 `{ displayId, side, ratio, x, y }`다 — 모니터, 가장자리, 작업 영역 안 세로 비율(0 = 위 끝, 1 = 아래 끝),
마지막 좌표. 예전 모양 `{ x, y }`도 읽는다(오른쪽). 다른 모니터로 옮기면 같은 가장자리·같은 세로 비율에 선다(높이가 다른 화면이어도
같은 높이감). 모니터를 빼면 가장 가까운 모니터의 같은 가장자리로 가되 저장하지 않아서, 그 모니터를 다시 꽂으면 원래 자리로 돌아간다.
해상도가 바뀌어도 비율로 다시 선다. 숨김은 `pet.hidden`(메인 전용)에 둔다.
메모의 유리 높이는 Mac 크기(띠 54px 포함, `MEMO_ALREADY_HAS_STRIP`)에서 띠를 뺀 504×370이다 — 걸친 캐릭터는 별도 창이라서다.

**Acrylic + DWM.** 유리 창(빠른 패널·위젯·짧은 메시지)은 `backgroundMaterial: 'acrylic'`, `frame:false`, `transparent:false`,
`backgroundColor: '#00000000'`, `thickFrame:false`로 만든다. `thickFrame:false`는 Windows 11의 둥근 모서리를 없애므로 DWM 속성
두 개를 창마다 한 번 건다 — `DWMWA_WINDOW_CORNER_PREFERENCE(33) = 2`(둥글게), `DWMWA_BORDER_COLOR(34) = 0xFFFFFFFE`(테두리 없음).
이 둘이 있어야 창 크기가 요청과 정확히 같다. Electron에 API가 없어 숨긴 PowerShell 자식이
P/Invoke로 부른다(`pet-dwm.js`, `-EncodedCommand`, 숫자 HWND만). 실패하면 모서리가 각질 뿐 나머지는 그대로 동작한다.
초점을 받았다가 잃은 Acrylic 창은 DWM이 재질을 끄고 단색으로 그린다(한 번도 활성이 아니었던 말풍선은 블러가 남는다). 그래서
패널이 초점을 잃고도 남아 있으면(지속 위젯, 유예 안의 빠른 패널) 셸이 그 창에 `WM_NCACTIVATE(TRUE)`를 보내 블러를 되살린다 —
키보드 초점은 옮기지 않는다. 처음 필요할 때 숨긴 PowerShell 도우미 하나를 띄워 두고 표준 입력으로 HWND를 넘긴다
(`createActivationKeeper`, 앱이 끝나면 같이 끝난다). 도우미가 없으면 그 동안 단색일 뿐 기능은 그대로다.
중앙 음영·림·캐릭터 워시·글자 그림자는 렌더러 CSS가 Acrylic 위에 그린다. 시스템에서 투명 효과를 끄거나 고대비를 켜면
블러 대신 불투명 면(`setBackgroundMaterial('none')`)으로 바꾸고 `prefs`로 렌더러에 알린다.

### 단축키·조작

| 동작 | 방법 |
| --- | --- |
| 빠른 패널 열기·닫기 | 펫 한 번 클릭(두 번째 클릭을 기다리지 않고 바로) · 어디서든 **Ctrl+Alt+M** · 트레이 **펫 빠른 기능**. 위젯이 떠 있으면 위젯을 접어 펫을 위젯 위 끝에 맞춘 뒤 빠른 패널로 바꾼다 |
| 지속 위젯 | 펫 두 번 클릭(500ms 안) · 트레이 **할 일 위젯 열기** · 패널의 고정 버튼 |
| 접기 | **Esc**(한글 조합 중에는 입력기 몫) · 메모 아래 ⌄ · 걸친 캐릭터 한 번 클릭 · ⋯ → 펫으로 접기. 빠른 패널은 밖을 누르거나 다른 앱으로 가도 접힌다 |
| 모드 | 펫 창 안에서 **Ctrl+1~7** = 할 일·메모·일정·Office·Council·집중·알림 |
| 저장·주 동작 | **Ctrl+S** 메모 저장 · **Ctrl+Enter** 그 화면의 주 동작(할 일 = 적어 둔 할 일 추가, 메모 = 저장, Council = 질문 보내기, 집중 = 시작, 알림·Office = Hub 열기) |
| 캐릭터 바꾸기 | 펫 오른쪽 클릭 → 알림 보기 + 9종(20px 얼굴, 지금 캐릭터에 체크). 기본은 글레이시아, 선택은 저장되어 다음 실행에 바로 그 얼굴로 뜬다 |
| 펫 옮기기 | 펫 끌기 — 가로·세로 자유롭게, 다른 모니터로도(3px 넘게 움직여야 끌기). 놓으면 펫 가운데가 있는 화면의 가까운 가장자리(왼쪽·오른쪽)로 붙고 세로는 그 작업 영역 안. 포인터를 잃어도 같은 규칙으로 붙인다 |
| 패널 옮기기 | 패널 손잡이·걸친 캐릭터 끌기(세로만). 누르는 동안과 끄는 동안만 캐릭터색 워시. 포인터를 잃으면(창이 사라짐·15초 신호 없음) 클릭으로 치지 않고 워시를 끈다 |
| 가장자리·모니터 | 펫 오른쪽 클릭·트레이 **왼쪽 가장자리로** / **오른쪽 가장자리로**, **모니터로 옮기기** → `주 모니터 (1920×1080)`·`모니터 2 (…)`(모니터가 둘 이상일 때, 지금 모니터에 체크). 위젯이 떠 있었으면 새 자리에서 다시 연다 |
| 숨기기·보이기 | 펫 오른쪽 클릭·트레이 **펫 숨기기**(펫·패널·말풍선을 내리고 알림은 기다린다, 끄고 켜도 유지) → 트레이 **펫 보이기**. **Ctrl+Alt+M**(맥 ⌃⌥M)·트레이의 빠른 기능·위젯·짧은 메시지는 펫을 다시 보이며 연다 |
| 위치 초기화 | 펫 오른쪽 클릭·트레이 **펫 위치 초기화** → 주 모니터 오른쪽 가장자리·아래쪽 1/3(숨겨 두었으면 다시 보인다) |
| 로그인 시 자동 실행 | 트레이(맥은 앱 메뉴 **Moonlight**에도) 체크 항목 — `app.setLoginItemSettings`. 패키징한 앱에서만 보인다(개발 실행은 Electron 자체를 올리게 되고, 스모크는 로그인 항목을 건드리지 않는다) |
| 집중 중지 | 중지 버튼 → 확인, 또는 **Esc를 1.3초** 누르고 있으면 확인이 뜬다. 확인이 떠 있을 때 **Esc**·계속 집중은 확인만 닫는다 |

기존 **Ctrl+Shift+M** 빠른 입력 위젯(380×200)과 **Ctrl+Shift+Space**는 그대로다. 트레이 메뉴에는 펫 항목 여섯 개(펫 빠른 기능·할 일 위젯
열기·짧은 메시지 보기·알림 보기·Council 안건 준비·Hub 열기)와 자리 항목(모니터로 옮기기·왼쪽/오른쪽 가장자리로·펫 위치 초기화·
펫 숨기기/보이기)이 위젯 항목 아래에 붙는다. 자리·숨김·모니터 목록이 바뀌면 트레이 메뉴를 다시 만든다(`onMenusChanged`).

### 모드

| 모드 | 하는 일 |
| --- | --- |
| 할 일 | 빠른 추가(Enter·Ctrl+Enter), 행을 눌러 완료(허브가 `updatedAt`으로 확인 — 다른 곳에서 먼저 바뀌었으면 덮어쓰지 않고 새로 불러온다), 완료는 3초 유예 뒤 기본 목록에서 숨김·다시 누르면 취소. 확인이 안 됐던 앞 할 일이 있으면 그것부터 다시 보내고 지금 입력은 지킨다 |
| 메모 | 매 키 입력은 이 PC(`petPreview.memo`)에, Hub 저장은 Ctrl+S·버튼으로만. 저장 → 같은 id 재조회로 확인되면 입력을 비우고 다음 입력은 새 메모. 결과를 모르면 허브 모델이 같은 명령을 보관했다가 ‘저장 확인’으로 먼저 다시 보낸다. 다른 곳에서 먼저 바뀌었으면 덮어쓰지 않고 ⋯ → 새 항목으로 Hub에 저장 |
| 일정 | 월요일 시작 7일 띠와 그날의 시간·종일 일정(편집은 Hub) |
| Office | 지금 캐릭터(담당자)와 Hub의 Office 보드로 가는 카드 — 펫 안에서 일을 만들지 않는다 |
| Council | 담당 Office에게 바로 묻고 같은 자리에서 답을 읽는다(질문 6,000자). 보내는 중에는 담당·범위를 잠그고, 기다림 중단 뒤 다시 보내면 새 요청이다(앞 요청의 늦은 응답은 버린다). ⋯ → 브랜드 Council에서 검토는 메인 창을 `#moonlight-council=…` 조각이 붙은 허브 경로로 열 뿐이고, 실행은 웹에서 누를 때만 |
| 집중 | 15·25·50분 또는 1~120분을 골라 시작 → 화면마다 불투명 타이머 창(아래) |
| 알림 | 미확인 문의·10분 안에 시작하는 일정·보고 있지 않은 대화의 답. 확인·이 PC에서 숨기기(Hub 읽음 상태를 바꾸지 않는다)·모두 확인 |

모든 목록은 읽기 실패를 빈 목록으로 보이지 않는다 — `Preview · 연결 필요`·`로그인 필요`·`Hub 로그인 미설정`·`Hub 주소 필요`·
`연결 오류`를 이유와 함께 보여 주고, 쓰기 실패·preview는 `저장했어요`라고 말하지 않는다(입력은 남긴다).

### 짧은 메시지(말풍선)

허브 모델이 60초마다(창이 다 뜬 뒤부터) 알림 원천을 읽는다. 첫 연결의 기존 미확인 문의는 조용히 목록만 채우고, 그 뒤 새로 온
문의와 곧 시작하는 일정이 **한 번씩** 말풍선이 된다. 말풍선 줄은 셸이 가진다 — 8초 보이고 다음 것은 1초 뒤, 패널·집중 화면이
열려 있으면 기다린다. 기다린 알림은 보이기 직전에 허브 목록으로 다시 거른다: 그 사이 읽었거나(패널·메인 창) 이 PC에서 숨겼거나
일정이 이미 시작했거나 말풍선을 껐으면 건너뛴다. 알림 목록이 열려 있으면 새 알림이 바로 목록에 들어온다. 말풍선의 ✕는 그 말풍선만 내린다(읽음 아님, 알림 목록에 남는다). 내용 보기는 읽음으로 하고 목적지를 연다 — 일정 알림은 일정
모드를 그 날이 든 주·그 날 선택으로, 답변 알림은 Council 을 그 담당·범위 대화로 연다. 트레이 **짧은 메시지 보기**가 마지막 알림을
다시 띄울 때도 같은 허브 목록 재확인을 거치고, 그사이 읽음·숨김·시작한 일정이 됐으면 기본 인사를 띄운다.
펫의 숫자 배지는 이 PC 목록의 미확인 수다(99개 넘으면 99+). 잠자기·화면 잠금 동안은 60초 확인을 멈추고, 깨어나거나 잠금을 풀면
곧바로 한 번 확인한 뒤 다시 60초마다 돈다(`powerMonitor` — 확인이 돌고 있었을 때만). 말풍선 페이지를 불러오지 못하면 빈 말풍선을 띄우지 않는다.

### Hub 연결 — 메인 창 세션 공유

펫에는 로그인 폼이 없다. 허브 호출은 메인 프로세스(`pet/main/pet-hub.js` → `pet-hub-client.js`)가 메인 창과 같은 기본 세션의
쿠키(`com_moon_operator_session`)를 실어 보내고, GET이 아닌 요청에는 `Origin: <허브 origin>`을 붙여 허브 쓰기 가드를 통과한다.
주소는 메인 창의 허브 주소(`settings.json`)를 그대로 쓰고, 설정을 저장하면 펫도 곧바로 다시 확인한다(주소가 같으면 연결을
유지한 채 한 번 확인). 연결 상태는 패널 ⋯ → **Hub 연결 상태**에서 보고 다시 확인할 수 있다.

| 상태 | 뜻 | 할 일 |
| --- | --- | --- |
| 연결됨 | 메인 창 세션으로 허브에 닿았다 | — |
| 로그인 필요 | 401·세션 없음 | **메인 창에서 로그인** → 메인 창이 `/login`을 연다. 로그인하면 다음 확인부터 펫도 이어서 쓴다 |
| Hub 로그인 미설정 | 허브 서버에 운영자 로그인 환경 변수가 없다 | 서버 설정 |
| Hub 주소 필요 | 앱에 허브 주소가 없다 | 메인 창에서 주소를 정한다 |
| 연결 안 됨 | 네트워크·시간 초과 | 입력은 이 PC에 남는다 |

확인되지 않은 할 일·메모 명령과 알림 전달 기록은 허브 origin마다 `pet-store.json`의 `petHub.pending.v1.<origin>`·
`petNotices.delivery.v1.<origin>`에 메인 프로세스만 쓴다(렌더러는 이 키를 읽거나 쓰지 못한다).

### 집중 타이머

타이머 화면만 띄운다(운영자 결정) — 모니터마다 불투명 전체 화면 창 하나, 주 모니터에 남은 시간·진행선·중지. 앱 전환·Win 키·
Alt+Tab은 막지 않는다. 시작하면 패널·말풍선을 접고 펫을 숨긴다. 중지는 확인을 거친다: 중지 버튼, 또는 Esc 1.3초(메인이
`before-input-event`로 재고, 페이지는 누르는 동안 진행선만 그린다). 확인을 닫으면 메인의 확인 표시도 거둬 다른 상태 변화에
다시 뜨지 않는다. 확인이 떠 있을 때의 Esc 는 확인을 닫기만 하고, 그 누름은 뗄 때까지 잠겨 Esc 를 계속 누르고 있어도 확인이 다시
열리지 않는다(보조 모니터 창에서 누른 Esc 로도 닫힌다 — `state.focus.dismissRevision`). 시간이 다 되면 저절로 끝나고 펫과 기다리던 말풍선이 돌아온다.

### 페이지와 다리

펫 창의 화면은 `pet/renderer/`의 `pet.html`·`panel.html`·`perch.html`·`bubble.html`·`focus.html`이다(`?surface=`와 집중 화면의
`?primary=1|0&display=` 쿼리가 붙는다). 파일이 없으면 빈 화면으로 뜨고 로그에 남긴다. 캐릭터 이미지는 `pet/assets/`의
`portrait-<key>.png`·`cutout-<key>.png`이고, 글꼴은 패키징 때 허브의 `SUIT`·`JetBrains Mono`를 `pet/fonts/`로 복사한다
(개발 트리에서는 `apps/hub/public/fonts`를 직접 읽는다).

페이지가 쓰는 다리 `window.moonlightPet`(프리로드 `pet/main/pet-preload.js`, 로컬 `file:` 페이지 최상위 프레임만):

| 함수 | 하는 일 |
| --- | --- |
| `invoke(channel, payload)` | `contract.PET_INVOKE`의 채널만(메인은 채널마다 핸들러를 정확히 하나 둔다). 그 밖은 Promise 거절 |
| `on(event, handler)` | `contract.PET_EVENTS`의 이벤트만 구독. 해제 함수를 돌려준다 |

펫 창은 포인터 신호만 보낸다 — `pointerdown`에 `pet:press {pressed:true}` + `pet:drag {phase:'begin', screenY}`, `pointermove`에
`pet:drag {phase:'move'}`, `pointerup`에 `pet:drag {phase:'end'}` + `pet:press {pressed:false}`, 포인터를 잃으면 `pet:drag {phase:'cancel'}`.
한 번·두 번 클릭 판정과 3px 끌기 문턱, 화면 맞춤은 메인이 한다. 펫 끌기는 가로도 쓴다 — `screenX`를 함께 보내면 그 값을,
없으면 메인이 커서 위치로 채운다. 오른쪽 클릭은 `pet:context-menu`. 말풍선이 보낸 `pet:collapse`는
말풍선만 내린다. `pet:focus-state {dismissConfirm:true}`는 중지 확인을 거두고, 지금 눌린 Esc 를 뗄 때까지 잠근다.
`pet:set-mode`는 `{mode}` 외에 목적지를 받는다(채널 이름은 그대로, payload 만 넓혔다) — `{mode:'calendar', date:'YYYY-MM-DD'}`(ISO 날짜시각이면
이 PC 날짜로)는 그 날이 든 주·그 날 선택, `{mode:'council', ownerId, scope?}`(scope 없으면 `all`)는 그 담당·범위 대화. 셸은 이를
`state.modeTarget {seq, mode, date | ownerId, scope}`로 방송하고(같은 모드여도 새 seq), 패널은 새 seq 에만 그 날짜·대화를 고른다.
읽을 수 없는 목적지는 버리고 모드만 바꾼다(`pet-state.js`의 `modeTargetFrom`).

허브 채널(`pet:hub-session` … `pet:council-handoff`)은 셸이 `pet-hub.js`의 `createPetHub(ctx)`로 만든 허브 모델에 넘긴다
(`install({ hub })`로 바꿔 끼울 수 있고, `hub: null`이면 모든 허브 채널이 `{ kind: 'not-configured' }`). ctx는
`{ emit, store, getHubUrl, session, openMainUrl, getState, contract, log }`이고 `store`는 셸과 같은 `pet-store` 인스턴스다(파일마다 하나).
돌아온 값은 계약의 봉투 `{ kind, data, error, httpStatus }`로 맞춘다(모르는 `kind`는 `invalid`, 예외는 `error`). 연결 상태의 정본은
허브 모델(`hub.status`)이고, 허브는 `pet:hub-status`·`pet:badge`·`pet:chat-reply`를 보내며 `pet:notice`는 셸 말풍선 줄로 넘긴다
(열린 패널에도 같이 보낸다). 줄은 띄우기 직전에 `hub.isNoticePresentable(id)`로 아직 유효한지 묻는다.
패널이 Council 모드를 떠나거나 접히면 셸이 `hub.chatLeave()`를 불러 그 뒤의 답은 알림이 된다. `pet:council-handoff`가 성공하면 셸이
허브 경로를 메인 창에서 열고 `data.opened`를 싣는다. 채널별 응답 모양은 `pet/main/pet-integration.test.js`가 셸·허브 모델·렌더러
뷰 모델을 한 번에 이어 고정한다.

### 스모크

```bash
npx electron . --smoke-pet --smoke-out=pet.png --user-data-dir=<빈 폴더> [--smoke-pet-page=<페이지 폴더>]
dist\win-unpacked\Moonlight.exe --smoke-pet --smoke-out=pet.png --user-data-dir=<빈 폴더>   # 패키징한 앱
```

펫·빠른 패널(할 일)·위젯과 걸친 캐릭터·메모·짧은 메시지·집중 화면을 차례로 실제 화면에 띄워 크기·자리(계약 값), 클릭 모델,
세로 끌기와 저장, 다리(허용 채널·거절·Node 없음), DWM 두 속성, Esc 1.3초를 확인하고 실제 화면 영역을 `pet.png`·`-widget`·
`-memo`·`-bubble`·`-focus`로 남긴다. 이어서 자리 기능 — 왼쪽 가장자리 거울(빠른 패널·위젯·걸친 캐릭터, `-left-quick`·`-left-widget`),
다른 모니터로 옮기기와 끌어서 돌아오기(모니터가 둘 이상일 때), 가운데 선을 넘는 끌기 → 반대 가장자리, 숨기기 → 빠른 기능으로 다시
보이기, 위치 초기화 — 를 재고 `smoke:pet-side ok`, 마지막에 `smoke:pet ok`(실패하면 종료 코드 1). 운영자 포커스를 빼앗지 않도록 패널은 비활성으로
띄운다. 화면이 잠겨 있으면 캡처가 검게 나온다(`smoke:warn session locked`). 허브 모델은 기본 경로(`pet-hub.js`)로 싣되 주소를
비워 두므로 허브 채널은 `not-configured`(`hub-url-missing`)다 — 패키지 안의 허브 모듈이 실제로 읽히는지만 본다. 허브까지 이은
흐름은 `pet-integration.test.js`(허브 계약을 흉내 내는 프로세스 안 fetch 대역, 포트를 열지 않는다)와 설계 문서 §6의 E2E 기록을 본다.

### 알려진 빈틈

- 집중 화면은 앱 전환·웹사이트를 막지 않는다(운영자 결정).
- 창 등장·퇴장의 창 단위 페이드는 없다 — 레이어드 창 불투명도는 Acrylic을 끄므로 움직임은 페이지 CSS가 맡는다.
- 투명도 줄이기 감지는 Electron `nativeTheme.prefersReducedTransparency`에 기댄다. Windows ‘투명 효과’ 스위치를 따로 읽지 않는다.
- (Windows) 펫 오른쪽 클릭 메뉴는 Windows 기본 메뉴다 — 체크와 20px 얼굴이 함께 있는 항목에서 얼굴이 체크 자리를 대신할 수 있다.
- 말풍선에서 연 일정·답변 알림은 해당 모드를 열 뿐 날짜·대화를 고르지 않는다(알림 모드 안에서 열면 고른다).
- (Windows) 가상 데스크톱 전체에 띄우는 API가 없어 펫은 지금 데스크톱에만 뜬다. macOS는 모든 Space에 뜬다.
- 펫 페이지는 끌기 신호에 `screenY`만 보낸다 — 가로 위치는 메인이 커서 위치(`screen.getCursorScreenPoint`)로 채운다. 끄는 동안의
  캐릭터 축소 표시(`.dragging`)도 세로 3px 기준이라 가로로만 끌면 켜지지 않는다.
- 패널 손잡이·걸친 캐릭터 끌기는 세로만이다. 다른 모니터·가장자리로 옮기려면 펫을 끌거나 메뉴를 쓴다.
- (macOS) 숨긴 패널을 옮기고 곧바로 띄우면 AppKit 이 걸친 캐릭터(패널의 자식 창)를 옛 자리에 둔다 — 셸이 띄운 뒤와 밀려난 것을
  볼 때 60ms 뒤 1pt 비켰다가 제자리에 놓아 되돌린다. 그 사이 약 0.1~0.3초 옛 자리에 보일 수 있다.
- 로그인 시 자동 실행으로 켜지면 허브 창도 함께 뜬다(숨긴 채 시작하는 옵션은 아직 없다).

## 개발·빌드

저장소 루트에서:

```bash
npm install              # 루트 워크스페이스로 electron·electron-builder가 설치된다
npm run app:win:dev      # 개발 실행 (electron .)
npm run app:win:build    # NSIS 설치 파일 + 포터블 exe (x64)
```

결과물은 `apps/desktop/dist/`(커밋하지 않음):

- `Moonlight-Setup-0.1.0.exe` — 설치 파일(설치 위치 선택 가능, 바탕화면 바로가기 생성)
- `Moonlight-Portable-0.1.0.exe` — 설치 없이 실행
- `win-unpacked/` — 압축을 푼 앱 폴더

앱 폴더 안에서만 쓰는 명령:

```bash
npm --workspace @com-moon/desktop run icons:generate   # apps/hub/public/icon-512.png → build/icon.ico (256·128·64·48·32·16)
npm --workspace @com-moon/desktop test                 # 주소·위젯·펫 규칙 단위 테스트(*.test.js, pet/main/*.test.js 포함)
```

`build/icon.ico`는 생성 결과를 커밋해 두었다. 허브 아이콘이 바뀌었을 때만 다시 만든다.
트레이·창 아이콘은 `apps/hub/public/icon-192.png`를 빌드 때 앱 안(`assets/`)으로 복사해 쓴다.

### 스모크 테스트

```bash
cd apps/desktop
npx electron . --smoke-test --smoke-out=smoke.png --user-data-dir=<빈 폴더>
```

첫 화면(주소가 없으면 설정 화면)이 다 뜨면 PNG를 남기고 `smoke:ok`를 찍고 종료한다(실패하면 종료 코드 1).
허브 주소가 있으면 다른 origin 링크 클릭과 `window.open`이 창 안에서 열리지 않는지도 확인해 `smoke:policy ok`를 찍는다
(스모크에서는 시스템 브라우저를 실제로 열지 않고 `smoke:external <주소>`로만 남긴다). `--smoke-quick-capture`를 더하면
빠른 입력을 연 상태로 찍는다. `--user-data-dir`로 설정 폴더를 따로 주면 평소 설정·로그인과 섞이지 않는다.
패키징한 앱도 같다: `dist\win-unpacked\Moonlight.exe --smoke-test --smoke-out=smoke.png`.

위젯은 따로 확인한다:

```bash
npx electron . --smoke-widget --smoke-out=widget.png --user-data-dir=<빈 폴더>
```

허브 주소를 잠시 `https://example.com`으로 바꿔 끼워 `https://example.com/widget`을 위젯에 띄우고(허브 페이지가 아니라
창 모양만 보는 용도) PNG를 남긴다. 이어서 페이지 크기가 정확히 380×200인지, 기본 위치가 작업 영역 안인지,
`window.moonlightWidget`의 다섯 함수(고정 저장·높이 140–360 자르기·아래 끝 고정·`openMain`의 외부 주소 거절)와
ESC 숨기기·다시 열기·화면 밖 저장 위치 되돌리기를 확인한다. 마지막으로 로컬 서버가 `/widget`을 `/login`으로 보내게 해
위젯이 숨은 채로 메인 창이 로그인 주소를 여는지(그리고 메인 창 주소에 `next`가 남지 않는지) 본다. 모두 통과하면
`smoke:widget ok`(실패하면 종료 코드 1).

허브의 실제 `/widget` 화면을 위젯 창에서 보려면 허브 주소를 준다(개발 서버는 loopback이라 로그인이 필요 없다):

```bash
npx electron . --smoke-widget --smoke-hub=http://127.0.0.1:3141 --smoke-theme=dark --smoke-out=widget.png --user-data-dir=<빈 폴더>
```

창 규칙 검사 대신 그 허브의 위젯을 띄워 고정·닫기가 보이는지, 페이지가 380×200 안에 들어가는지 확인하고 `widget.png`를
남긴 뒤, 입력 칸에 한 줄을 적고 Enter를 눌러 영수증을 `widget-after-enter.png`로 찍는다(`smoke:widget-hub ok`).
`--smoke-theme`은 `light`·`dark`(생략하면 자동). 저장이 연결된 허브에서는 메모가 실제로 한 건 남으므로, Supabase를
연결하지 않은 개발 서버에서 돌린다 — 그러면 preview 영수증("저장하지 않았습니다")만 찍힌다.

## macOS

macOS(Apple Silicon)와 Windows는 별도 플랫폼 계약으로 취급한다(2026-09-29 운영자 지시). Hub 세션·데이터 모델은 공유하되 재질·글꼴·창·조작은 각 OS 기준으로 구현한다. Mac은 `prototypes/moonlight-pet-macos`의 승인 원본, Windows는 Acrylic 이식 스펙이 기준이다.

**셸**
- 메뉴 막대: 첫 메뉴 **Moonlight**(정보·설정…(허브 주소, ⌘,)·빠른 입력·위젯·서비스·숨기기·종료 ⌘Q) + **편집**(실행 취소·오려두기·복사·붙여넣기·모두 선택 역할 — 이 메뉴가 없으면 허브·펫 입력 칸에서 ⌘C/⌘V/⌘A가 동작하지 않는다) + **보기**(뒤로 ⌘[ · 앞으로 ⌘]) + **윈도우**. 메뉴 모양은 `menu-template.js`(순수 함수, `menu-template.test.js`)가 플랫폼별로 만든다.
- 메뉴 막대 아이콘: 템플릿 이미지(`build/trayTemplate.png`·`@2x`, 빌드 때 `assets/`로 복사) — 누르면 메뉴만 연다. Dock 아이콘 오른쪽 클릭에 열기·빠른 입력·위젯.
- 창을 닫아도 앱은 메뉴 막대·펫과 함께 남는다(`window-all-closed`에서 끝내지 않음). Dock 아이콘을 누르면 허브 창을 다시 띄운다(`activate`). 전체 화면 창은 전체 화면을 푼 뒤 숨겨 빈 Space를 남기지 않는다.
- 빠른 입력 **⌘⇧Space**, 위젯 **⌘⇧M**. 위젯은 비활성 패널(`type:'panel'`)이라 `showInactive()` → `focus()`(150·300ms 에 다시)로 띄워 허브 창을 앞으로 끌어오지 않고, 모든 Space와 전체 화면 앱 위에 뜬다.
- 앱 메뉴 **Moonlight**에 **로그인 시 자동 실행**(패키징한 앱만). 미디어 키·Now Playing 가로채기 끄기(`HardwareMediaKeyHandling`·`MediaSessionService`)는 맥에서만 건다.
- 설정·세션 폴더: `~/Library/Application Support/Moonlight`(`settings.json`·`window-state.json`·`widget-state.json`·`pet-store.json`). `electron .` 개발 실행도 `--user-data-dir`를 주지 않으면 설치본과 같은 폴더를 쓴다.

**빌드·설치**

```bash
npm run app:mac:dev      # 개발 실행
npm run app:mac:build    # dist/Moonlight-<버전>-arm64.dmg · .zip · mac-arm64/Moonlight.app
```

- 네이티브 빌드: Mac 개발 실행·패키징은 `scripts/build-mac-glass.mjs`를 먼저 실행한다. macOS 26+ SDK가 포함된 Xcode Command Line Tools가 필요하다. Node-API 8을 사용해 Electron ABI 재빌드 없이 로드하며, `.node`·원본 셰이더는 Mac 번들의 `Resources/native`에만 포함한다. `npm --workspace @com-moon/desktop run build:mac-glass`로 연결부만 빌드할 수 있다.
- 아이콘: `npm --workspace @com-moon/desktop run icons:generate`가 `build/icon.icns`(sips + iconutil)·`icon-dock.png`·`trayTemplate*.png`도 만든다. 맥 자산은 `sharp`가 필요하다(루트에 허브 의존성으로 설치돼 있다 — 없으면 경고만 남기고 건너뛴다).
- 서명: Developer ID가 없어 애드혹 서명(`identity: "-"`, `hardenedRuntime: false`)이다. `codesign --verify --deep --strict`는 통과하고 `spctl`은 거절한다. 직접 빌드해 `/Applications`로 복사한 앱은 바로 열린다. 브라우저로 받은 dmg·zip은 격리 속성이 붙으므로 처음 한 번 오른쪽 클릭 → **열기**(또는 `xattr -dr com.apple.quarantine /Applications/Moonlight.app`).
- 처음 실행할 때 키체인이 "Moonlight Safe Storage" 접근을 물으면 **항상 허용** — 로그인 쿠키 암호화 키다. 비밀번호를 넣을 필요는 없다.
- 설치본 교체: 앱을 종료(⌘Q)한 뒤 `dist/mac-arm64/Moonlight.app`을 `/Applications`에 덮어쓴다.
- `electronLanguages: ["ko","en"]`로 언어 리소스를 줄였다(약 48MB). x64·universal은 빌드하지 않는다.
- 스모크: `--smoke-test`·`--smoke-widget`는 그대로 돈다. `--smoke-mac`은 실제 메뉴·메뉴 막대 아이콘·Dock 활성화·빠른 입력·위젯 경로를 확인하고 `smoke:mac ok`를 찍는다(잠시 포커스를 가져간다).

**펫**
- macOS 26+ 유리: `pet/native/mac-glass.mm`이 공개 `NSGlassEffectView(.clear)` + `darkAqua`를 Chromium 아래 형제 뷰에 연결한다. 원본 최신 커밋 `97794923`의 확산 28%·중앙 음영 5.5%·패널 반경 26pt·말풍선 반경 14pt를 사용한다. 글자와 조작은 위에서 별도로 그려 유리 효과에 들어가지 않는다.
- 유리 단면: Mac 원본의 `GlassOptics.metal`을 빌드 때 그대로 복사하여 같은 `glassFragment`로 그린다. 네이티브 재질의 바깥 8pt를 마스킹하고 Metal이 9pt 안에서 반사·분광을 맡는다. `MTKView`는 paused이며 크기·포인터·접근성 변경 때만 다시 그린다. ScreenCaptureKit 캡처 경로는 사용하지 않는다.
- 대체 경로: macOS 26 미만/네이티브 연결 실패는 기존 `hud` 비브런시·CSS 베일(라이트 .48/다크 .24)·10px 모서리로 열린다. Metal만 실패하면 native clear의 기본 윤곽을 쓴다. 투명도 줄이기·대비 증가는 효과를 끄고 둥근 불투명 면으로 전환한다. Windows Acrylic에는 이 Mac 경로를 적용하지 않는다.
- Mac 조작·글꼴: 시스템 글꼴, 메모를 제외한 헤더의 닫기/위젯 접기, 할 일·일정 하단 새로고침을 원본대로 제공한다. 메모는 걸친 펫이나 더보기·Esc로 접는다. Windows의 기존 헤더·글꼴·조작은 유지한다.
- 창: 펫·패널·걸친 캐릭터·말풍선은 비활성 패널(`type:'panel'`, `acceptFirstMouse`, `hiddenInMissionControl`) — 패널을 열어도 허브 창이 앞으로 오지 않고, 다른 앱이 앞에 있어도 첫 클릭이 먹는다. 모든 Space와 전체 화면 앱 위에 뜬다(`setVisibleOnAllWorkspaces`, `skipTransformProcessType` — 빼면 Dock 아이콘이 사라진다). 패널은 `showInactive()` → `focus()`로 키 창이 되고, 안 되면 띄우는 유예(0.4초) 안에서 150·300ms 에 다시 잡는다. `app.focus({steal:true})`는 쓰지 않는다 — 다른 앱 뒤에 보이던 허브 창까지 앞으로 올라온다.
- 집중 화면은 `display.bounds` 그대로 메뉴 막대·Dock까지 덮는다(`enableLargerThanScreen`, 뜬 뒤 자리를 한 번 더 맞춘다). 앱 전환은 막지 않는다.
- 단축키: 빠른 패널 **⌃⌥M**(Windows Ctrl+Alt+M과 같은 키), 패널 안 **⌘1~7**·**⌘S**·**⌘Return**(Ctrl 대신 ⌘ — 메모에서만 원본의 ⌃Return 대안도 지원). 화면 문구는 `이 PC` 대신 `이 Mac`. 판정은 `pet/renderer/model/platform.js` 하나.
- 최적화: 맥에서는 걸친 캐릭터·말풍선 창을 처음 쓸 때 만든다 — 대기 상태 프로세스 7→5, 렌더러 4→2, 메모리 약 685→498MB(`app.getAppMetrics()` 실측). 처음 쓰는 걸친 캐릭터는 유리보다 100~200ms 늦게 뜰 수 있다. 패널이 접혀 있는 동안은 할 일·일정·날짜 줄 주기 새로고침을 멈추고 다시 열 때 한 번 따라잡는다(`backgroundThrottling:false`라 숨긴 창도 `visible`로 보여서 `state.panelOpen`으로 가른다).
- 스모크: `--smoke-pet`은 맥에서 DWM 대신 네이티브 유리/대체 비브런시·모든 Space·집중 창 = `display.bounds`를 보고 `smoke:metrics`를 찍는다. `--smoke-pet-eager`(창을 미리 다 만들기)·`--smoke-pet-hold=<ms>`(띄운 채 기다리기). 화면 캡처는 Electron에 화면 기록 권한이 있어야 찍히고, 없으면 경고로 넘어간다.

### Mac 원본 복원 검사 (2026-09-29)

```bash
npm --workspace @com-moon/desktop test
npm --workspace @com-moon/desktop run build:mac-glass
npx electron apps/desktop --smoke-pet --smoke-native-glass --smoke-out=/tmp/moonlight-pet.png --user-data-dir=/tmp/moonlight-pet-check
```

`--smoke-native-glass`는 HUD로 조용히 대체되면 실패한다. 네이티브 부착·26pt 반경·CSS 베일 제거와 기존 창/모니터/입력 계약을 검사한다. Windows 실기 검증은 Windows에서 별도로 수행하며 Mac 스모크 통과로 대체하지 않는다.


## 코드 서명 없음 (Windows)

이 빌드는 코드 서명을 하지 않는다. 처음 실행하면 Windows SmartScreen이 "Windows의 PC 보호" 창을 띄운다 —
**추가 정보 → 실행**을 눌러야 한다. 인증서를 붙이려면 electron-builder의 `win.signtoolOptions`/`CSC_LINK`를 설정한다
(인증서·`.pfx`는 저장소에 넣지 않는다, `.gitignore`가 막는다).
