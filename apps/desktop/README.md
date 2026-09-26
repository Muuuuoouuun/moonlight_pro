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
- **로그아웃 상태**: 세션이 없거나 끝나 허브가 `/login`으로 보내면 위젯은 로그인 폼을 그리지 않는다 — 위젯을 숨기고
  메인 창에서 그 로그인 주소를 연다. 로그인한 뒤 다시 Ctrl+Shift+M을 누르면 위젯이 뜬다.
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
npm --workspace @com-moon/desktop test                 # 주소·위젯 창 규칙 단위 테스트(hub-url.test.js·widget-window.test.js)
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
위젯이 숨은 채로 메인 창이 로그인 주소를 여는지 본다. 모두 통과하면 `smoke:widget ok`(실패하면 종료 코드 1).

## 코드 서명 없음

이 빌드는 코드 서명을 하지 않는다. 처음 실행하면 Windows SmartScreen이 "Windows의 PC 보호" 창을 띄운다 —
**추가 정보 → 실행**을 눌러야 한다. 인증서를 붙이려면 electron-builder의 `win.signtoolOptions`/`CSC_LINK`를 설정한다
(인증서·`.pfx`는 저장소에 넣지 않는다, `.gitignore`가 막는다).
