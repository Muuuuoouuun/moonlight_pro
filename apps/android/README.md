# Moonlight 안드로이드 앱 (갤럭시)

Moonlight 허브(`apps/hub`)를 **원격 사이트로 여는 얇은 Capacitor 셸**이다. 앱 안에 허브 화면을 번들하지 않는다 —
WebView가 배포된 허브 주소를 그대로 열고, 로그인·데이터·화면은 모두 허브가 가진다.

- 패키지 `app.moonlight.hub` · 앱 이름 `Moonlight` · 버전 `0.1.0`(versionCode 1)
- Capacitor 8 (`@capacitor/core`·`@capacitor/android`, 개발 도구 `@capacitor/cli`) — 추가 플러그인 없음
- minSdk 24 · target/compileSdk 36 · HTTPS 전용(`usesCleartextTraffic=false`, `server.androidScheme=https`)
- Play 스토어 배포는 범위 밖이다. APK를 직접 설치한다(아래 "갤럭시에 설치").

## 허브 주소 — 한 곳에서만 바꾼다

허브 주소의 정본은 `apps/android/app.config.json`의 `hubUrl` 하나다.

```json
{ "hubUrl": "https://moonlight.invalid" }
```

- 커밋된 값 `https://moonlight.invalid`는 **placeholder**다. 배포 주소(예: Vercel)가 정해지면 origin만 적는다
  (경로·쿼리 없이 `https://…`). `http://`는 거부된다.
- `capacitor.config.json`·`www/hub-config.js`·`android/app/src/main/res/values/hub_config.xml`(App Links host)·
  `android/app/src/main/res/xml/shortcuts.xml`(런처 바로가기 URL)은 이 값에서 **생성되는 파일**이라 커밋하지 않는다.
  `npm run app:android:build`는 이 생성물이 동기화된 주소와 다르면 멈춘다.

주소를 바꾸는 순서:

```bash
# 1) apps/android/app.config.json 의 hubUrl 수정
# 2) 설정 생성 + 네이티브 프로젝트 동기화 (placeholder 이면 여기서 멈춘다)
npm run app:android:sync
# 3) debug·release APK 빌드 (JAVA_HOME = JDK 17 이상, ANDROID_HOME = Android SDK)
npm run app:android:build
```

placeholder 주소로 개발용 APK만 만들 때는 두 명령 모두에 `-- --allow-placeholder`를 붙인다.

```bash
npm run app:android:sync -- --allow-placeholder
npm run app:android:build -- --allow-placeholder
```

Windows PowerShell 예시: `$env:JAVA_HOME = "C:\Program Files\RedHat\java-17-openjdk-17.0.18.0.8-1"` 후 위 명령.
Capacitor 8은 JDK 21을 기준으로 하지만, JDK 21 미만에서 빌드하면 `android/build.gradle`이 모든 모듈을 Java 17로
낮춰 컴파일한다(JDK 21 이상에서는 아무것도 바꾸지 않는다).

## 산출물

| 파일 | 서명 |
| --- | --- |
| `apps/android/android/app/build/outputs/apk/debug/app-debug.apk` | 디버그 키(개발 전용) |
| `apps/android/android/app/build/outputs/apk/release/app-release.apk` | 릴리스 키(`keystore.properties`가 있을 때) |
| `apps/android/android/app/build/outputs/apk/release/app-release-unsigned.apk` | `keystore.properties`가 없을 때 — 서명 없음, 설치 불가 |

## 릴리스 서명 키

- 키: `apps/android/keystore/moonlight-release.jks` (PKCS12, 별칭 `moonlight`)
- 비밀번호: `apps/android/keystore.properties`에만 있다. 형식은 `keystore.properties.example`.
- 둘 다 `.gitignore` 대상이다. **키를 잃으면 같은 앱으로 업데이트할 수 없다** — 저장소 밖(비밀번호 관리자 등)에 백업한다.
- 새 PC에서 키를 처음 만들 때: `cd apps/android && node scripts/create-keystore.mjs` (이미 있으면 덮어쓰지 않는다).
- `keystore.properties`가 없으면 release 빌드는 서명 없는 APK를 만든다.

## 동작

- **대체 화면**: 허브를 열지 못하면 번들된 `www/index.html`이 뜬다 — 아래 "오프라인·다시 시도".
- **로그인 유지**: 허브 세션 쿠키(`com_moon_operator_session`)는 Android WebView 기본 CookieManager에 저장되어 앱을 다시
  켜도 남는다. 이 셸은 쿠키 저장을 끄지 않는다.
- **뒤로 가기**: WebView 기록을 거슬러 가고, 더 갈 곳이 없거나 대체 화면이면 시스템 기본 동작(앱 닫기)으로 넘긴다
  (`MainActivity` — 대체 화면에서 뒤로 가면 실패한 주소를 다시 열어 같은 화면으로 돌아오는 고리를 끊는다).
- **상태바·내비게이션 바**: 어두운 면(#141C27) 위 밝은 아이콘. 허브가 라이트 테마여도 바는 어둡다. Capacitor 8 코어
  `SystemBars`(`style: DARK`)가 아이콘 색을 정하고, 허브가 `viewport-fit=cover`를 쓰지 않으므로 decor view에 시스템 바·
  키보드 inset만큼 padding을 주고 그 뒤를 `windowBackground`(#141C27)로 칠한다 — targetSdk 36의 강제 edge-to-edge에서도
  허브 화면이 상태바·제스처 바 아래로 들어가지 않는다(에뮬레이터 API 35 스크린샷으로 확인). 허브 쪽 변경은 없다.
- **아이콘·스플래시**: `apps/hub/public/icon-maskable-512.png`에서 `node scripts/generate-assets.mjs`로 만든 적응형
  아이콘과 어두운 스플래시(#141C27). 생성된 `android/app/src/main/res/` 파일을 커밋한다.
- **스플래시·첫 화면**: `core-splashscreen`의 `installSplashScreen`으로 시스템 스플래시(#141C27 + 아이콘)를 첫 프레임까지
  두고, 걷힐 때 200ms 동안 흐려진다(추가 대기 없음 — 콜드 스타트 시간을 늘리지 않는다). 창 배경·WebView 배경
  (`capacitor.config.json`의 `backgroundColor`)이 모두 #141C27이라 허브가 그려지기 전에 흰 화면이 번쩍이지 않는다.
- **WebView**: 캐시 `LOAD_DEFAULT`(HTTP 캐시 헤더를 따른다). 원격 디버깅(`webContentsDebuggingEnabled`)은 설정에 적지 않아
  Capacitor 기본값 = 앱이 debuggable일 때만 켜진다 — release APK는 꺼져 있다(`dumpsys package` flags에 DEBUGGABLE 없음).
  에뮬레이터처럼 `ro.debuggable=1`인 userdebug 이미지에서는 WebView가 모든 앱의 devtools 소켓을 여므로 거기서의 소켓
  존재는 판단 근거가 아니다.

## 공유 시트 → 빠른 입력

다른 앱에서 텍스트나 링크를 **공유 → Moonlight**로 보내면(`ACTION_SEND`, `text/plain`) 앱이 허브의 공유 대상 경로를 연다.
콜드 스타트와 이미 켜진 상태(`onNewIntent`) 모두 같은 경로다.

```
<hubUrl>/dashboard?title=<EXTRA_SUBJECT>&text=<EXTRA_TEXT>&url=<링크>
```

- 허브 쪽 계약(`apps/hub/components/hub/hub-app.jsx`): `/dashboard`의 `title`·`text`·`url` 쿼리를 읽어 빈 값은 버리고
  줄바꿈으로 이어 붙인 뒤, 빠른 입력(`GlobalQuickCapture`)을 그 내용으로 한 번 연다. PWA manifest의 `share_target`과 같은 계약이다.
- `EXTRA_TEXT`가 링크 하나뿐이면 `url`로만 넘긴다 — 허브가 세 값을 이어 붙이므로 `text`와 `url`에 같이 넣으면 같은 링크가
  두 줄로 적힌다. 문장 안에 링크가 섞여 있으면 `text`로 그대로 넘긴다.
- 값은 URL 인코딩된다. 비어 있는 공유는 무시한다.
- 로그인이 풀려 있으면 허브가 `/login?next=/dashboard?…`로 보내고, 로그인 뒤 같은 공유 내용으로 돌아온다.
- 공유 본문은 디버그 빌드에서만 logcat(`MoonlightShare`)에 남는다.

## App Links — 허브 링크를 앱으로 열기

`https://<허브 host>/…` 링크(메신저·메일·브라우저)를 누르면 브라우저 대신 앱이 **그 경로 그대로** 연다.
콜드 스타트(`BridgeActivity.load` → `onNewIntent`)와 이미 켜진 상태 모두 `MainActivity.openLink`가 처리하고, 허브 host의
https 주소가 아니면 무시한다(포트·userinfo가 붙은 주소도 무시).

- 매니페스트: `ACTION_VIEW` + `BROWSABLE` + `https` + `android:host="@string/hub_host"`, `android:autoVerify="true"`.
  `hub_host`는 `write-cap-config.mjs`가 `app.config.json`에서 생성한다(host가 저장소 한 곳에만 있다).
- 허브: `apps/hub/public/.well-known/assetlinks.json`이 패키지 `app.moonlight.hub`와 서명 지문 두 개를 내준다 —
  릴리스 키(`A2:C4:EC:CE:…:1A:D7`)와 이 PC의 디버그 키(`61:73:16:8E:…:57:38`, `~/.android/debug.keystore`).
  허브 미들웨어는 이 파일 한 경로만 세션 없이 연다(`apps/hub/lib/route-access.js`의 `OPEN_EXACT`,
  `route-access.test.mjs`가 고정 — `/.well-known/` 접두사 전체는 열지 않는다).
- 릴리스 키를 바꾸면 지문을 다시 읽어 `assetlinks.json`을 고친다(비밀번호는 출력하지 않는다):
  `keytool -list -v -keystore apps/android/keystore/moonlight-release.jks -storepass:env KSPASS` 의 `SHA256:` 줄.
- **검증은 허브를 다시 배포해야 성립한다.** 배포 전에는 `/.well-known/assetlinks.json`이 로그인으로 리다이렉트되어
  검증이 실패한다. 배포 뒤 확인:

  ```bash
  curl -sI https://moonlight-pro-hub.vercel.app/.well-known/assetlinks.json   # 200 + application/json, 리다이렉트 없음
  adb shell pm verify-app-links --re-verify app.moonlight.hub
  adb shell pm get-app-links app.moonlight.hub                                 # moonlight-pro-hub.vercel.app: verified
  ```

  2026-09-26 에뮬레이터(API 35) 실측: 설치 직후 `none`, `--re-verify` 뒤 `1024`(검증기 정의 실패 코드) — 허브가 아직
  파일을 내주지 않기 때문이다. 검증 전에도 앱을 지정한 인텐트(런처 바로가기·`am start -n`)는 앱으로 열리고, 일반 링크는
  브라우저/앱 선택 창이 뜬다.

## 런처 바로가기 (아이콘 길게 누르기)

| 바로가기 | 여는 경로 |
| --- | --- |
| 빠른 입력 | `/dashboard/home` |
| 오늘 연락 | `/dashboard/revenue/followups` |
| 리듬 | `/dashboard/work/rhythm` |

- 각 바로가기는 허브 전체 URL의 `ACTION_VIEW` 인텐트이고 `targetClass`가 `MainActivity`라서 App Links와 같은 경로로
  열린다(검증 전에도 선택 창 없이 앱으로 간다).
- `res/xml/shortcuts.xml`은 **생성 파일**이다(`SHORTCUTS` in `write-cap-config.mjs`). 바로가기 인텐트의 `android:data`는
  `@string` 참조를 쓸 수 없다 — 시스템이 앱이 아니라 시스템 리소스로 풀어 빈 값이 된다(`dumpsys shortcut`에서 `dat=` 빈 값으로
  실측). 라벨(`values/strings.xml`)과 아이콘(`drawable/ic_shortcut_*`, API 26+는 `drawable-anydpi-v26`의 적응형 아이콘 —
  #141C27 바탕 + #BCC4D0 글리프)은 커밋된 리소스다.
- 확인: `adb shell dumpsys shortcut | grep -A12 "id=capture"` (intents에 `dat=https://<허브>/...`),
  바로가기와 같은 인텐트로 열기:
  `adb shell am start -W -a android.intent.action.VIEW -d https://moonlight-pro-hub.vercel.app/dashboard/work/rhythm -n app.moonlight.hub/.MainActivity`

## 오프라인·다시 시도

허브를 열지 못하면(`server.errorPath` = `www/index.html`, `https://localhost/index.html`) 어두운 카드가 뜬다.

- 제목 "허브에 연결하지 못했습니다" + 이유 한 줄(오프라인·DNS·연결·시간 초과·SSL·HTTP 상태를 운영자 말로) +
  "다시 열 화면"(실패한 허브 경로) + **다시 시도** 버튼. 다시 시도는 `<허브>/<실패한 경로>`로 `location.replace`한다.
- 실패한 경로는 `MainActivity`의 `HubWebViewClient`가 기억한다: Capacitor 기본 클라이언트는 메인 프레임 오류에서
  errorPath만 열기 때문에, 이 클라이언트가 같은 화면을 연 뒤 `onPageFinished`에서
  `window.moonlightShowFailure({ from, reason, hub })`로 건넨다. URL(쿼리·`#fragment`)에 싣지 않는 이유는 Capacitor
  로컬 서버가 요청 URL 전체가 errorPath와 같을 때만 번들 파일을 내주기 때문이다(무엇이든 붙이면 요청이 네트워크로 새어
  실패한다). 같은 이유로 `www/hub-config.js`는 대체 화면에서 읽히지 않아(이전 버전은 오프라인에서 "허브 주소가 설정되지
  않았습니다"를 잘못 띄웠다) 허브 주소도 네이티브가 건넨다. 경로를 알 수 없으면 `/dashboard`를 열고 그렇다고 말한다.
- 자동 재시도: 네트워크 오류일 때만 — `online` 이벤트와 화면이 보이는 동안 15초마다, 허브의 정적 `/icon.svg`에
  `no-cors` 요청으로 닿는지 먼저 확인하고 닿으면 연다(쿠키·기록 없음). HTTP 오류(허브가 응답은 함)는 같은 오류로
  돌아오는 고리를 만들지 않도록 자동으로 되풀이하지 않는다. `navigator.onLine`·`online` 이벤트를 위해
  `ACCESS_NETWORK_STATE`(일반 권한, 사용자 확인 없음)를 선언한다.
- 2026-09-26 실측: 비행기 모드로 리듬 링크를 열면 "기기가 오프라인입니다 · 다시 열 화면 /dashboard/work/rhythm",
  비행기 모드를 끄면 20초 안에 스스로 허브(로그인 화면)로 돌아갔다.

## 성능 (에뮬레이터 API 35, release APK)

`adb shell am start -W -n app.moonlight.hub/.MainActivity`의 `TotalTime`(첫 프레임까지), 앱 강제 종료 뒤 콜드 스타트,
변경 전·후 APK를 번갈아 설치해 같은 조건에서 3회씩 두 바퀴(워밍업 1회 제외):

| | 측정값(ms) | 중앙값 |
| --- | --- | --- |
| 변경 전 | 843 · 881 · 803 · 815 · 872 · 700 | 829 |
| 변경 후 | 785 · 713 · 775 · 809 · 769 · 870 | 780 |

- 차이(약 −6%)는 에뮬레이터 잡음 범위 안이다 — 이번 변경의 목표는 수치보다 흰 화면 없는 전환·스플래시 페이드였다.
  에뮬레이터 부팅 직후 첫 측정(변경 전 5회 중앙값 1726ms)은 시스템이 바빠 부풀려진 값이라 비교에서 뺐다.
- 허브 첫 화면이 실제로 그려지는 시점은 logcat `MoonlightPerf`(`first hub paint <ms>`, 프로세스 시작부터 첫
  `onPageCommitVisible`까지, 경로·내용 없음)로 본다 — 변경 후 5회 1619–1733ms(중앙값 1688ms), 네트워크가 대부분이다.
- 다시 재기: `adb shell am force-stop app.moonlight.hub` → `adb shell am start -W -n app.moonlight.hub/.MainActivity`.

## 갤럭시에 설치

1. 휴대폰 **설정 → 휴대전화 정보 → 소프트웨어 정보 → 빌드번호** 7번 탭 → 개발자 옵션 → **USB 디버깅** 켜기.
2. USB로 PC에 연결하고 휴대폰의 디버깅 허용 창에서 허용.
3. `adb install -r apps/android/android/app/build/outputs/apk/release/app-release.apk`
   (`adb`는 `%ANDROID_HOME%\platform-tools\adb.exe`)

케이블 없이 설치할 때는 APK 파일을 휴대폰으로 옮겨(내 파일 앱) 연 뒤, 그 앱에 **출처를 알 수 없는 앱 설치**를 한 번 허용한다.
debug APK와 release APK는 서명이 달라 서로 덮어 설치되지 않는다 — 바꿀 때는 먼저 지운다.

## 파일 지도

| 경로 | 역할 |
| --- | --- |
| `app.config.json` | 허브 주소 정본 |
| `scripts/write-cap-config.mjs` | `capacitor.config.json`·`www/hub-config.js`·`res/values/hub_config.xml`·`res/xml/shortcuts.xml` 생성, `--sync`면 `cap sync android` |
| `scripts/gradle-build.mjs` | 동기화된 주소·생성 리소스 확인 뒤 `gradlew assembleDebug assembleRelease` |
| `scripts/generate-assets.mjs` | 아이콘·스플래시 재생성(`@capacitor/assets@3.0.5`를 npx로 호출) |
| `scripts/create-keystore.mjs` | 릴리스 키·`keystore.properties` 1회 생성 |
| `www/index.html` | 허브를 못 열 때의 대체 화면(이유·다시 시도·자동 재시도) |
| `android/app/src/main/java/app/moonlight/hub/MainActivity.java` | 공유·App Links·바로가기 인텐트 → 허브 경로, 실패 경로 전달, 뒤로 가기, 스플래시 |
| `android/app/src/main/res/drawable*/ic_shortcut_*.xml` | 런처 바로가기 아이콘 |
| `../hub/public/.well-known/assetlinks.json` | App Links 검증 파일(허브가 내준다) |
