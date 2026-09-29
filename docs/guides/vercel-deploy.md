# Vercel 배포 — Hub · Engine (클라우드 허브)

> 상태: 2026-09-26 운영자 결정 — 윈도우·안드로이드 앱이 접속할 허브를 **Vercel에 먼저 배포**한다(Mac Tailscale 허브 대신). Engine도 **별도 Vercel 프로젝트**로 함께 올린다(허브 33개 파일이 `COM_MOON_ENGINE_URL`로 Engine을 부르고, 클라우드 허브는 Mac의 Tailscale Engine에 닿을 수 없다).
> 관련: [`docs/README.md`](../README.md) §3 "Supabase 서울 리전 이관"(Vercel 환경 변수 0개 상태), 앱 셸 [`apps/desktop/README.md`](../../apps/desktop/README.md) · [`apps/android/README.md`](../../apps/android/README.md), 폰 캡처 [`galaxy-phone-capture.md`](galaxy-phone-capture.md).

## 1. 원칙

- **시크릿 값은 저장소에 두지 않는다.** 프로덕션 값의 원본은 gitignore된 `apps/hub/.env.production.local`·`apps/engine/.env.production.local` 한 곳이고, [`scripts/vercel-env-push.mjs`](../../scripts/vercel-env-push.mjs)가 그 파일을 읽어 Vercel에 올린다. 스크립트는 키 이름만 출력한다.
- **DB는 서울 프로젝트**(`ncgpnqfulnlshegalmbd`)다. 이 PC의 `.env.local`은 아직 구 싱가포르(`rwqefdxalmbrkybxqwxj`)를 가리키므로 값을 그대로 복사하면 안 된다 — 서울 값은 Mac의 `apps/hub/.env.local`에서 옮긴다.
- **허브 인증 게이트는 그대로다.** `COM_MOON_OPERATOR_USERNAME`·`PASSWORD_HASH`·`SESSION_SECRET` 셋 중 하나라도 없으면 미들웨어가 503으로 닫는다(CLAUDE.md). 세 값은 운영자가 `node scripts/generate-operator-login.mjs <아이디>`로 직접 만든다 — 비밀번호는 한 번만 출력되므로 비밀번호 관리자에 저장한다.
- **크론 인증**: 허브 `vercel.json`의 크론 3개는 Vercel이 `Authorization: Bearer $CRON_SECRET`을 붙여 부른다. 코드 주석대로 `CRON_SECRET = COM_MOON_HUB_WRITE_SECRET`로 같은 값을 둔다.

## 2. 준비물 체크리스트

| 항목 | 누가 | 어디에 |
| --- | --- | --- |
| Vercel CLI 로그인 | 운영자(브라우저 승인) | `npx vercel login` → 표시된 `https://vercel.com/oauth/device?user_code=…` 승인 |
| 서울 Supabase `SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_ANON_KEY` | 운영자 입력 완료(2026-09-26) | 두 env 파일 |
| 운영자 로그인 3줄 | 운영자 입력 완료(2026-09-26, `generate-operator-login.mjs`) | `apps/hub/.env.production.local` |
| `COM_MOON_HUB_WRITE_SECRET`·`CRON_SECRET`·`COM_MOON_OAUTH_STATE_SECRET`·`COM_MOON_PHONE_INTAKE_SECRET` | 생성 완료(2026-09-26) | 두 env 파일 |
| `COM_MOON_SHARED_WEBHOOK_SECRET`·`GEMINI_API_KEY`·`COM_MOON_DEFAULT_WORKSPACE_ID` | 이 PC `.env.local`에서 복사 완료 | 두 env 파일 |
| 도메인 3종(`COM_MOON_HUB_URL`·`NEXT_PUBLIC_APP_URL`·`COM_MOON_ENGINE_URL`) | 확정·반영 완료 | §3 표 |

## 3. 프로젝트 (2026-09-26 구성 완료)

| 프로젝트 | 도메인 | Root Directory | 비고 |
| --- | --- | --- | --- |
| `moonlight-pro-hub` | `https://moonlight-pro-hub.vercel.app` | `apps/hub` | 2026-06-19 생성, GitHub `Muuuuoouuun/moonlight_pro` 연동(프로덕션 브랜치 `main`) |
| `moonlight-pro-engine` | `https://moonlight-pro-engine.vercel.app` | `apps/engine` | 2026-09-26 `vercel project add`로 생성 후 REST API로 Root Directory·framework(nextjs)·GitHub 연동 설정 |

팀(스코프)은 `muuuuoouuuns-projects`(hobby), Node 24.x. 로컬 연결은 **저장소 루트에서 한 번**:

```bash
npx vercel link --repo --yes --scope muuuuoouuuns-projects   # .vercel/repo.json (gitignore) — 두 프로젝트를 디렉터리로 매핑
```

`apps/hub`·`apps/engine` 안에서 `vercel link`를 따로 하면 안 된다 — 그 디렉터리만 업로드돼 `packages/*` 워크스페이스 의존이 빠진다. 루트 repo 링크 상태에서 `apps/<app>`에서 `vercel deploy`를 실행하면 저장소 전체가 올라가고 서버의 Root Directory가 앱을 고른다.

## 4. 환경 변수 → 배포

```bash
# 값이 채워진 키만 올라간다(자리표시자는 건너뛰고 목록으로 알려준다). 값은 출력되지 않는다.
node scripts/vercel-env-push.mjs --app hub --dry-run
node scripts/vercel-env-push.mjs --app hub
node scripts/vercel-env-push.mjs --app engine

# 프로덕션 배포 — 저장소 파일이 15,000개를 넘어 --archive=tgz 가 필수. 루트 .vercelignore가 docs·design-system·테스트를 제외한다.
(cd apps/engine && npx vercel deploy --prod --yes --archive=tgz --scope muuuuoouuuns-projects)
(cd apps/hub    && npx vercel deploy --prod --yes --archive=tgz --scope muuuuoouuuns-projects)
```

PowerShell 5.1은 `&&`와 `(cd … && …)`를 읽지 못한다 — 거기서는 한 줄씩:

```powershell
Set-Location apps\engine; npx vercel deploy --prod --yes --archive=tgz --scope muuuuoouuuns-projects; Set-Location ..\..
Set-Location apps\hub;    npx vercel deploy --prod --yes --archive=tgz --scope muuuuoouuuns-projects; Set-Location ..\..
```

환경 변수를 바꾼 뒤에는 재배포해야 반영된다. Git 연동 자동 배포는 프로덕션 브랜치(`main`)에만 붙어 있으므로, 작업 브랜치(`09.WIN1.6`)를 올릴 때는 위 CLI `--prod` 배포를 쓴다(다른 브랜치 push는 프리뷰 배포만 만든다).

## 5. 확인

1. `https://<hub>/login` 이 **로그인 화면**을 보여야 한다. 503이면 운영자 로그인 3값 중 하나가 빠진 것이다.
2. 로그인 뒤 `/dashboard/home`이 `live`로 읽히는지(TruthBadge) — `preview`면 Supabase 값, `error`면 서울 프로젝트 권한(`npm run db:check`)을 본다.
3. Engine: `https://<engine>/api/health`(있으면) 또는 허브의 Guru 코칭이 "Engine 미설정" 문구 없이 동작.
4. 폰: MacroDroid 매크로의 URL을 `https://<engine>/api/intake/phone-events`로, 헤더 `x-com-moon-phone-secret`을 새 `COM_MOON_PHONE_INTAKE_SECRET`으로 바꾼다.

## 6. 앱 셸에 주소 반영

- Windows(Electron): 첫 실행 화면에 `https://<hub>` 입력 → `%APPDATA%/Moonlight/settings.json`에 저장. 기본값을 심으려면 `apps/desktop/app.config.json`의 `hubUrl`.
- Android(Capacitor): `apps/android/app.config.json`의 `hubUrl`을 바꾸고 `npm run app:android:sync && npm run app:android:build`.

## 7. 남은 결정

- 커스텀 도메인 여부(현재 `*.vercel.app`).
- Google/Meta OAuth 리다이렉트 URI를 새 도메인으로 등록(캘린더 연동을 클라우드에서 쓸 때).
- Mac Engine을 계속 둘지(로컬 스킬 실행 receipt는 Mac이 맡는다 — agent-layer-direction §2).
