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
- `capacitor.config.json`과 `www/hub-config.js`는 이 값에서 **생성되는 파일**이라 커밋하지 않는다.

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

- **대체 화면**: 허브를 열지 못하면(`server.errorPath`) 번들된 `www/index.html`이 뜬다. 주소가 placeholder면
  "허브 주소가 설정되지 않았습니다", 주소가 있으면 "허브에 연결하지 못했습니다"와 다시 열기 링크를 보여 준다.
- **로그인 유지**: 허브 세션 쿠키(`com_moon_operator_session`)는 Android WebView 기본 CookieManager에 저장되어 앱을 다시
  켜도 남는다. 이 셸은 쿠키 저장을 끄지 않는다.
- **뒤로 가기**: WebView 기록을 거슬러 가고, 더 갈 곳이 없을 때만 시스템 기본 동작(앱 닫기)으로 넘긴다(`MainActivity`).
- **상태바**: 어두운 면(#141C27) 위 밝은 아이콘. 허브가 라이트 테마여도 상태바는 어둡다.
- **아이콘·스플래시**: `apps/hub/public/icon-maskable-512.png`에서 `node scripts/generate-assets.mjs`로 만든 적응형
  아이콘과 어두운 스플래시(#141C27). 생성된 `android/app/src/main/res/` 파일을 커밋한다.

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
| `scripts/write-cap-config.mjs` | `capacitor.config.json`·`www/hub-config.js` 생성, `--sync`면 `cap sync android` |
| `scripts/gradle-build.mjs` | 동기화된 주소 확인 뒤 `gradlew assembleDebug assembleRelease` |
| `scripts/generate-assets.mjs` | 아이콘·스플래시 재생성(`@capacitor/assets@3.0.5`를 npx로 호출) |
| `scripts/create-keystore.mjs` | 릴리스 키·`keystore.properties` 1회 생성 |
| `www/index.html` | 허브를 못 열 때의 대체 화면 |
| `android/app/src/main/java/app/moonlight/hub/MainActivity.java` | 공유 인텐트 → 허브 경로, 뒤로 가기 |
