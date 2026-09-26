# Moonlight 데스크톱 (Windows)

Moonlight 허브를 Windows 앱 창으로 여는 Electron 셸이다. 허브 화면은 그대로 원격 주소에서 불러오고,
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

macOS 프로토타입(`prototypes/moonlight-pet-macos`)의 Moonlight 펫 — Office 담당자 이브이들 — 을 같은 앱 안에 옮긴 것이다.
허브 창·위젯과 따로 떠 있고, 앱을 켜면 화면 오른쪽 가장자리에 대기 얼굴이 뜬다. 셸 코드는 `pet/main/`, 세 계층이 함께
쓰는 값(모드·크기·캐릭터 9종·유리 값·채널 이름)은 `pet/shared/contract.js` 하나다. 기준 결정은 2026-09-26 운영자 결정
(재질 = Windows 11 Acrylic 실제 블러, 로그인 = 메인 창 세션 공유, 집중 = 타이머 화면만)이다.

### 창

| 창 | 크기·자리 | 성질 |
| --- | --- | --- |
| 펫 | 56×56, 작업 영역 오른쪽에서 8px·아래쪽 1/3 | 투명, 포커스를 받지 않음(클릭은 받음). 세로로만 끌 수 있고 자리는 `pet.position`에 저장 |
| 빠른 패널 | `contract.glassSize(mode)`(할 일 320×488 …), 펫 왼쪽 10px·펫 세로 중심 | Acrylic 유리. 밖을 누르거나 다른 앱으로 가면 접힌다 |
| 지속 위젯 | 같은 유리 창을 계속 띄운 것. 유리 + 위 54px 띠의 오른쪽 위 = 펫의 오른쪽 위 | 펫은 숨는다. 모드·높이가 바뀌어도 오른쪽 위를 고정 |
| 걸친 캐릭터 | 72×72, 유리 오른쪽에서 20px 안쪽, 유리 위로 54px(18px 겹침) | 패널이 소유한 투명 창. 위젯과 빠른 메모에서만 보이고 패널과 같이 움직인다 |
| 짧은 메시지 | 326×130, 펫 왼쪽 | Acrylic, `showInactive`로만 뜬다(포커스를 빼앗지 않음). 8초 보이고 다음 것은 1초 뒤. 패널·집중 화면이 열려 있으면 기다린다 |
| 집중 화면 | 화면마다 하나, 그 화면 전체 | 불투명. 주 화면에만 타이머·진행선·중지. 앱 전환은 막지 않는다 |

모두 항상 위(`floating`, 집중 화면은 `screen-saver`)이고 작업 표시줄에 나오지 않는다. 모니터를 빼거나 해상도가 바뀌면
펫은 가장 가까운 화면의 오른쪽 가장자리로 다시 맞춰진다. 창 배치 규칙은 `pet-geometry.js`(순수 함수)에 있다.
메모의 유리 높이는 Mac 크기(띠 54px 포함, `MEMO_ALREADY_HAS_STRIP`)에서 띠를 뺀 504×370이다 — 걸친 캐릭터는 별도 창이라서다.

**Acrylic + DWM.** 유리 창(빠른 패널·위젯·짧은 메시지)은 `backgroundMaterial: 'acrylic'`, `frame:false`, `transparent:false`,
`backgroundColor: '#00000000'`, `thickFrame:false`로 만든다. `thickFrame:false`는 Windows 11의 둥근 모서리를 없애므로 DWM 속성
두 개를 창마다 한 번 건다 — `DWMWA_WINDOW_CORNER_PREFERENCE(33) = 2`(둥글게), `DWMWA_BORDER_COLOR(34) = 0xFFFFFFFE`(테두리 없음).
이 둘이 있어야 포커스를 잃어도 블러가 살아 있고 창 크기가 요청과 정확히 같다. Electron에 API가 없어 숨긴 PowerShell 자식이
P/Invoke로 부른다(`pet-dwm.js`, `-EncodedCommand`, 숫자 HWND만). 실패하면 모서리가 각질 뿐 나머지는 그대로 동작한다.
중앙 음영·림·캐릭터 워시·글자 그림자는 렌더러 CSS가 Acrylic 위에 그린다. 시스템에서 투명 효과를 끄거나 고대비를 켜면
블러 대신 불투명 면(`setBackgroundMaterial('none')`)으로 바꾸고 `prefs`로 렌더러에 알린다.

### 조작

| 동작 | 방법 |
| --- | --- |
| 빠른 패널 열기·닫기 | 펫 한 번 클릭(두 번째 클릭을 기다리지 않고 바로) · 어디서든 **Ctrl+Alt+M** · 트레이 **펫 빠른 기능** |
| 지속 위젯 | 펫 두 번 클릭(500ms 안) · 트레이 **할 일 위젯 열기** · 패널의 고정 버튼(`pet:set-presentation`) |
| 캐릭터 바꾸기 | 펫 오른쪽 클릭 → 알림 보기 + 9종(20px 얼굴, 지금 캐릭터에 체크). 기본은 글레이시아, 선택은 저장 |
| 펫·패널 옮기기 | 끌기(세로만, 3px 넘게 움직여야 끌기로 본다). 누르는 동안과 끄는 동안만 캐릭터색 워시 |
| 모드 | 펫 창 안에서 **Ctrl+1~7**(할 일·메모·일정·Office·Council·집중·알림), **Ctrl+S** 메모 저장, **Ctrl+Enter** 주 동작, **Esc** 접기 — 렌더러가 처리 |
| 집중 중지 | 중지 버튼 → 확인, 또는 **Esc를 1.3초** 누르고 있으면 확인이 뜬다(메인이 `before-input-event`로 잰다) |

기존 **Ctrl+Shift+M** 빠른 입력 위젯과 **Ctrl+Shift+Space**는 그대로다. 트레이 메뉴에는 펫 항목 여섯 개(펫 빠른 기능·할 일 위젯
열기·짧은 메시지 보기·알림 보기·Council 안건 준비·Hub 열기)가 위젯 항목 아래에 붙는다.

### 페이지와 다리

펫 창의 화면은 `pet/renderer/`의 `pet.html`·`panel.html`·`perch.html`·`bubble.html`·`focus.html`이다(`?surface=`와 집중 화면의
`?primary=1|0&display=` 쿼리가 붙는다). 파일이 없으면 빈 화면으로 뜨고 로그에 남긴다. 캐릭터 이미지는 `pet/assets/`의
`portrait-<key>.png`·`cutout-<key>.png`이고, 상태의 `characters[].portrait`·`cutout`에 `file://` 주소로 실려 온다.

페이지가 쓰는 다리 `window.moonlightPet`(프리로드 `pet/main/pet-preload.js`, 로컬 `file:` 페이지 최상위 프레임만):

| 함수 | 하는 일 |
| --- | --- |
| `invoke(channel, payload)` | `contract.PET_INVOKE`의 채널만. 그 밖은 Promise 거절 |
| `on(event, handler)` | `contract.PET_EVENTS`의 이벤트만 구독. 해제 함수를 돌려준다 |

펫 창은 포인터 신호만 보낸다 — `pointerdown`에 `pet:press {pressed:true}` + `pet:drag {phase:'begin', screenY}`, `pointermove`에
`pet:drag {phase:'move'}`, `pointerup`에 `pet:drag {phase:'end'}` + `pet:press {pressed:false}`. 한 번·두 번 클릭 판정과 3px 끌기
문턱, 화면 맞춤은 메인이 한다. 오른쪽 클릭은 `pet:context-menu`. 로컬 저장은 `pet:store-get`·`pet:store-set`으로
`%APPDATA%\Moonlight\pet-store.json`에 남는다(Mac UserDefaults와 같은 키 이름만 허용).

허브 채널(`pet:hub-session` … `pet:council-handoff`)은 셸이 구현하지 않고 `install({ hub })`로 받은 객체에 넘긴다 —
`hub.invoke(channel, payload, { surface })` 또는 채널 이름을 키로 한 함수. 인자를 주지 않으면 `pet/main/pet-hub-client.js`가
있을 때 그것을 쓰고(`createPetHub(ctx)`·`create(ctx)`·함수 자체·`invoke`를 가진 객체), 없으면 모든 허브 채널이
`{ kind: 'not-configured' }`다. 돌아온 값은 계약의 봉투 `{ kind, data, error, httpStatus }`로 맞추고(모르는 `kind`는 `invalid`,
예외는 `error`), `unauthorized`면 상태를 `로그인 필요`로 바꾼다. 허브 모듈은 `ctx.emit(event, payload)`로 `pet:hub-status`·
`pet:badge`·`pet:chat-reply`를 보내고, `pet:notice`는 셸이 짧은 메시지 줄에 세운다. 허브 호출은 메인 창과 같은 기본 세션
쿠키로 메인 프로세스에서 한다(`ctx.session`) — 펫에는 로그인 폼이 없다.

### 스모크

```bash
npx electron . --smoke-pet --smoke-out=pet.png --user-data-dir=<빈 폴더> [--smoke-pet-page=<페이지 폴더>]
```

펫·빠른 패널(할 일)·위젯과 걸친 캐릭터·메모·짧은 메시지·집중 화면을 차례로 실제 화면에 띄워 크기·자리(계약 값), 클릭 모델,
세로 끌기와 저장, 다리(허용 채널·거절·Node 없음), DWM 두 속성, Esc 1.3초를 확인하고 실제 화면 영역을 `pet.png`·`-widget`·
`-memo`·`-bubble`·`-focus`로 남긴 뒤 `smoke:pet ok`(실패하면 종료 코드 1). 운영자 포커스를 빼앗지 않도록 패널은 비활성으로
띄운다. 화면이 잠겨 있으면 캡처가 검게 나온다(`smoke:warn session locked`).

### v1에 없는 것

집중 화면은 앱 전환·웹사이트를 막지 않는다(운영자 결정). 창 등장·퇴장의 창 단위 페이드는 없다 — 레이어드 창 불투명도는
Acrylic을 끄므로 움직임은 페이지 CSS가 맡는다. 투명도 줄이기 감지는 Electron `nativeTheme.prefersReducedTransparency`에 기댄다.

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

## 코드 서명 없음

이 빌드는 코드 서명을 하지 않는다. 처음 실행하면 Windows SmartScreen이 "Windows의 PC 보호" 창을 띄운다 —
**추가 정보 → 실행**을 눌러야 한다. 인증서를 붙이려면 electron-builder의 `win.signtoolOptions`/`CSC_LINK`를 설정한다
(인증서·`.pfx`는 저장소에 넣지 않는다, `.gitignore`가 막는다).
