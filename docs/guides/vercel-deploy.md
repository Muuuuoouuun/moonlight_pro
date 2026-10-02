# Vercel 배포 — Hub · Engine (클라우드 허브)

> 상태: 2026-09-26 운영자 결정 — 윈도우·안드로이드 앱이 접속할 허브를 **Vercel에 먼저 배포**한다(Mac Tailscale 허브 대신). Engine도 **별도 Vercel 프로젝트**로 함께 올린다(허브 33개 파일이 `COM_MOON_ENGINE_URL`로 Engine을 부르고, 클라우드 허브는 Mac의 Tailscale Engine에 닿을 수 없다).
> 관련: [`docs/README.md`](../README.md) §3 "Supabase 서울 리전 이관"(2026-09-26 Hub·Engine 환경 변수 구성·배포 기록), 앱 셸 [`apps/desktop/README.md`](../../apps/desktop/README.md) · [`apps/android/README.md`](../../apps/android/README.md), 폰 캡처 [`galaxy-phone-capture.md`](galaxy-phone-capture.md).

## 1. 원칙

- **시크릿 값은 저장소에 두지 않는다.** 프로덕션 값의 원본은 gitignore된 `apps/hub/.env.production.local`·`apps/engine/.env.production.local` 한 곳이고, [`scripts/vercel-env-push.mjs`](../../scripts/vercel-env-push.mjs)가 그 파일을 읽어 Vercel에 올린다. 스크립트는 키 이름만 출력한다.
- **DB는 서울 프로젝트**(`ncgpnqfulnlshegalmbd`)다. 이 PC의 `.env.local`은 아직 구 싱가포르(`rwqefdxalmbrkybxqwxj`)를 가리키므로 값을 그대로 복사하면 안 된다 — 서울 값은 Mac의 `apps/hub/.env.local`에서 옮긴다.
- **허브 인증 게이트는 그대로다.** `COM_MOON_OPERATOR_USERNAME`·`PASSWORD_HASH`·`SESSION_SECRET` 셋 중 하나라도 없으면 미들웨어가 503으로 닫는다(CLAUDE.md). 세 값은 운영자가 `node scripts/generate-operator-login.mjs <아이디>`로 직접 만든다 — 비밀번호는 한 번만 출력되므로 비밀번호 관리자에 저장한다.
- **크론 인증**: 허브 `vercel.json`의 크론 4개는 Vercel이 `Authorization: Bearer $CRON_SECRET`을 붙여 부른다. 코드 주석대로 `CRON_SECRET = COM_MOON_HUB_WRITE_SECRET`로 같은 값을 둔다.

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

### 2026-09-29~30 운영 적용 기록

- `09.bigmac2.0`의 코드 커밋 `8f88824f`를 CLI로 Engine → Hub 순서로 프로덕션 배포했다. Engine `dpl_4EbvZLDfuj95BFZQReGF7RiZCT4L`, Hub `dpl_2MXaS4kxQCvtweZQEY23JochNs6V`가 `Ready`이고 각 고정 운영 URL에 연결됐다. `main` 병합은 하지 않았다.
- 서울 DB `ncgpnqfulnlshegalmbd`에 `20260929_0053_brand_identity_audience_promise_offer.sql` → `20260929_0054_brand_research_backfill.sql` → `20260929_0055_content_schedules.sql`을 적용했다. 세 파일의 migration ledger 해시를 재조회했고 `db:check` 전 항목이 통과했다. `content_schedules`는 적용 직후 0행이었다.
- 배포 뒤 Hub·Engine `/api/health`는 HTTP 200·`status: ok`이며 DB와 Hub→Engine 연결을 보고했다. Hub `/login`은 HTTP 200, 비로그인 `/dashboard/home`·`/dashboard/content/publish`는 `/login`으로 이동했다. 운영자 세션을 이용한 예약 저장·발행 로그 화면 왕복과 22:00 KST 크론 실행 결과는 아직 확인하지 않았다.
- 배포 직전 전체 테스트는 3,679건 중 통과 3,666·실패 0·조건부 건너뜀 13이었다. Vercel 빌드의 Turbo 환경 변수 경고는 있었으나 양쪽 프로덕션 빌드와 런타임 헬스는 통과했다.

### 2026-09-30 `main` ↔ `09.bigmac2.0` 통합 기록

- **경위:** 위 CLI 배포는 `main`에 병합하지 않은 브랜치에서 나갔다. 같은 날 오전 리서치함(#13·#14)이 `main`에 병합되면서 Git 연동이 `main`을 다시 프로덕션에 올렸고, `09.bigmac2.0`에만 있던 예약·발행 로그·Studio 형식 탭·홈 아침 브리핑이 운영에서 빠졌다. 2026-09-30 16:40 KST 실측: 운영 `/api/cron/schedule-sweep`가 404(같은 접두사의 `/api/cron/github-sync`는 401), `main`의 `vercel.json`에도 `schedule-sweep` 크론이 없었다.
- **조치:** `origin/main`에서 `claude/integrate-main-bigmac-0930`을 만들어 `origin/09.bigmac2.0`을 병합했다(충돌 4파일 — `hub-app.jsx`·`content-studio.jsx`·`database-readiness.mjs`·`ai-usage-log-migration.test.mjs`, 양쪽 기능 모두 유지). 함수 리전 `icn1`(아래)과 고객 목록 정렬 수정도 같은 PR에 담았다.
- **함수 리전:** 운영 응답 헤더가 `x-vercel-id: icn1::iad1::…`로, 함수가 미국 동부에서 돌며 서울 DB를 왕복하고 있었다. `apps/hub/vercel.json`·`apps/engine/vercel.json`에 `"regions": ["icn1"]`을 넣었다.
- **마이그레이션:** 번호 0053·0054가 두 파일씩 겹친다(브랜드 `20260929_*`, 리서치함 `20260930_*`). 다섯 파일 모두 이 파일명으로 서울 DB에 적용돼 있어 이름을 바꾸지 않았다. 다음 번호는 0056이다. 병합 트리의 `db:check`는 서울 DB에서 33개 항목 전부 통과했다(브랜드 0053·0054는 `DATABASE_FEATURES`에 등록돼 있지 않아 이 검사 범위 밖이고, 적용 근거는 위 09-29~30 기록의 ledger 해시 재조회다).
- **검증:** 루트 `npm test` 3,707건 중 통과 3,694·실패 0·조건부 건너뜀 13, `check:contracts`와 Hub·Engine 빌드 통과. 운영자 세션으로 본 리서치함·발행 로그 화면과 22:00 KST 크론 실행 결과는 이 기록 시점에 확인하지 않았다.
- **교훈:** `main`에 없는 브랜치를 CLI로 프로덕션에 올리면 다음 `main` 병합이 조용히 덮어쓴다. CLI `--prod` 배포를 했다면 같은 날 `main`에 병합한다.

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
