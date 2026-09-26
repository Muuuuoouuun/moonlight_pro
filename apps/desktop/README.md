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
| 창 닫기 | 트레이로 숨는다(앱은 계속 실행) |
| 종료 | 트레이 메뉴 **종료** 또는 Ctrl+Q |
| 주소 바꾸기 | 앱 메뉴 또는 트레이 메뉴 **허브 주소 바꾸기** |

앱을 한 번 더 실행하면 새 창을 띄우지 않고 기존 창을 앞으로 가져온다.

**빠른 입력이 여는 것.** 허브의 공유 대상(`/dashboard?title=&text=&url=`, `hub-app.jsx`)은 세 값이 모두 비면
아무것도 열지 않는다. 그래서 `?text=`처럼 빈 값으로는 빈 캡처 창을 열 수 없다. 앱은 대신 `/dashboard`가 아니면
`/dashboard`로 이동한 뒤, 허브의 전역 단축키 `C`(입력 칸 밖에서 누르면 `GlobalQuickCapture`가 열림)와 같은
keydown 이벤트를 페이지에 보낸다. 로그인 화면에 있을 때는 아무것도 열리지 않는다.

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
npm --workspace @com-moon/desktop test                 # 주소 규칙 단위 테스트
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

## 코드 서명 없음

이 빌드는 코드 서명을 하지 않는다. 처음 실행하면 Windows SmartScreen이 "Windows의 PC 보호" 창을 띄운다 —
**추가 정보 → 실행**을 눌러야 한다. 인증서를 붙이려면 electron-builder의 `win.signtoolOptions`/`CSC_LINK`를 설정한다
(인증서·`.pfx`는 저장소에 넣지 않는다, `.gitignore`가 막는다).
