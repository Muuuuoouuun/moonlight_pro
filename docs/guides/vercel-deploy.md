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

### 2026-10-01 리서치·보고서 연결 완성

- 보고서 `/dashboard/reports`를 홈의 보조 진입점에 연결했다. 개인·회사 완료 7일 스냅샷, Office 주간 AI 정리, 리서치 근거, QA·평가 문서를 한 목록에서 조회하며 개별 링크·커서 페이지·판단 revision 저장을 지원한다. 실측 누락은 `null`이고 재시도는 먼저 요청 receipt를 읽는다.
- 브랜드 자동 리서치는 공개 원문 확보 → 출처 줄·직접 인용 검증 → AI 초안 → 검토 대기 원장에 연결됐다. 서버가 workspace·브랜드를 정하고 같은 원문 버전의 유료 claim을 재발급하지 않는다. 전송 결과가 불확실하면 `unknown`을 유지하고, 확정 실패만 다음 원문의 준비 수량을 허용한다. 0058~0060은 초기 실사용에서 발견한 복구·인용 범위·실패 분류를 보강한다.
- 서울 DB `ncgpnqfulnlshegalmbd`에 `20261001_0056`~`0060` 다섯 파일을 적용하고 각 ledger 해시를 검증했다. `db:check`는 이력 포함 **38개 항목 전부 통과**했다. 이미 적용한 파일의 내용은 바꾸지 않았다.
- 기존 운영자 자격을 유지해 Hub 로그인 설정 누락을 해결했다. Hub·Engine의 공유 비밀과 서버 전용 설정을 맞추고 `COM_MOON_RESEARCH_ENABLED=true`, `COM_MOON_REPORTS_AI_ENABLED=true`를 프로덕션에 반영했다. 실제 토큰·비밀·비밀번호는 문서나 로그에 남기지 않는다.
- 코드 `59dc2268`을 Engine → Hub 순서로 CLI 프로덕션에 배포했다. Engine `moonlight-pro-engine-fy1a2p8dr-muuuuoouuuns-projects.vercel.app`, Hub `moonlight-pro-100e438ng-muuuuoouuuns-projects.vercel.app`이 `Ready`이며 고정 운영 URL에 연결됐다. Git 연동 배포로 다음 `main` 변경이 덮어쓰지 않도록 같은 날 기능 브랜치를 `main`에 통합한다.
- 운영 API 확인: 양쪽 health 200, 로그인 configured, 비로그인 보고서 화면 307 → 로그인, 인증 보고서 200·`live`·읽기 실패 0, 리서치 실행 200·`enabled=true`·`costCapUsd=null`, 무인증 조회 401, 인증한 두 크론 200. 야간 확인은 due slot 밖이므로 유료 생성을 요청하지 않았다.
- 실제 생성: politic_officer `522e385d-081c-4929-87fa-4b381d85073d`, class.moon `46db7856-9b22-4f69-a685-932f758aa5de`, 22nomad `ab8245eb-4d78-478f-a94d-71c407ad1e1a`를 저장하고 근거·조건·AI/미검토 표시를 브라우저로 확인했다. 회사 완료 주간(09-24~09-30)의 스냅샷 `e18e39f4-03b8-41a1-acc9-2e77d505380d`와 Office AI 정리 `a6862b57-3846-5586-baf3-024d2a8f4bc2`도 실제 생성했다. 초기 실패한 Nomad 원문은 재과금하지 않고 다른 원문에서 성공했다. source failure가 있는 실행은 성공 초안이 있어도 `partial`로 보인다.
- 비용은 운영자 결정에 따라 **현재 월 상한 없음**이다. 검증 생성 receipt 6건/실제 모델 API 7회(확정 실패 2회 포함)의 토큰 기반 추정 합계는 **$0.0809925**, Brave 검색은 **8회**다. Office 한 receipt는 초안·검수 2회의 토큰을 합산하며 비용을 다시 더하지 않는다. 모델 추정은 thinking을 출력에 포함하고 검색 요금·무료 할당량·청구서 조정은 포함하지 않는다. 근거: [Gemini 공식 가격](https://ai.google.dev/gemini-api/docs/pricing). 검색과 원문 실패에 모델 비용 0을 만들어 넣지 않는다.
- 실행 주기: politic_officer KST 08~22시 2시간 간격(최대 8개/일), class.moon 매일 08시 최대 3개, 22nomad 매일 08시 최대 1개. 개인 주간 월요일·회사 주간 목요일 08시 이후에 직전 완료 7일을 보관·해석한다. Vercel Hobby의 일일 크론을 두고, Mac `com.moonlight.research-reports` launchd가 15분마다 서버의 due slot을 확인한다. runner는 worktree 밖 `~/Library/Application Support/Moonlight`에 복사하고 env는 0600으로 보호했다. 최초 launchd 실행은 두 엔드포인트 정상 응답·새 생성 0건을 확인했다.
- **실행 조건:** Mac이 꺼지거나 잠들면 당일 2시간 간격 확인은 쉬며 Vercel의 일일 실행이 남는다. 원문 robots·권한·읽기 실패는 공개 원문 근거로 저장하지 않는다. Office AI receipt와 원문 근거는 기존 30일 보관 정책을 따르고, 주간 사실 스냅샷·등록 문서는 별도 원장에 남는다. AI 초안이 자동 승인·발행·업무 생성되지는 않는다.
- 실제 운영 화면 확인에서 상단 시계의 UTC 서버/KST 브라우저 초기 텍스트 차이(React hydration418)를 발견했다. 동일한 초기 표시 후 마운트에서 명시적으로 한국 시각을 갱신하도록 고쳤으며 경고를 숨기지 않는다. 재조회만 하는 리서치 sweep은 자동화 행을 추가하지 않고 기록 실패는 응답에 표시한다. 후속 수정은 [PR #20](https://github.com/Muuuuoouuun/moonlight_pro/pull/20)에 포함한다.
- 검증: root **3,848 tests · 통과 3,835 · 실패 0 · 조건부 건너뜀 13**, Desktop **345/345**; typecheck, contracts, ClassIn 체크, Next 16.3.8 Hub·Engine build, high-severity audit 통과. Next 보안 패치를 적용했으며 기존 moderate 2건은 이 작업 범위에서 임의 수정하지 않았다. 모델 claim·동시성·복구·RLS는 실제 로컬 PostgreSQL 테스트, 화면은 1440/390px·light/dark로 검증했다.

### 2026-10-01 보고서·인사이트 내용 품질

- 같은 범위·시간대의 직전 7일을 비교하고, 연락 활동/사람 수·딜/리드·계약/입금·개인/전체 집계를 구별하는 근거표를 전달한다. 주간 글은 핵심 판단→근거→해석·다른 설명→다음 확인→한계를 연결한다. 브랜드 원고에는 단일 줄 직접 인용·발표자/조건·반대 경우를 유지하며, 알려진 AI 요약·광고 꼬리와 허위 저자 경험을 제외한다.
- 주간/리서치 전용 `COM_MOON_CONTENT_QUALITY_MODEL`의 기본은 `gemini-3.1-pro-preview`·thinking low·최대 출력 16,384다. 기존 다른 AI의 기본 모델은 유지한다. 초안/검토 2회와 자동 재시도 없음, 동일 paid claim 재발급 없음은 그대로다. Office 신규 비 Council 주간만 Engine 95초·Hub 105초·DB claim 120초이며 그 외 업무의 기존 예산은 유지한다.
- 서울 DB 0061(판단 한계의 조회 보존)·0062(신규 주간 claim 기한)를 적용하고 해시 이력을 확인했다. readiness는 이력 포함 40개 항목 전부 통과했다. 이미 적용한 0056 이하 파일을 바꾸지 않았다.
- 실제 고정 원문/완료 주간 5건의 최종 자동 조합은 독립 검토에서 **4/5 채택 가능**했다. 정치 일정의 의도·원인·논의 시작 이력은 명확한 단일 일정일 때 서버가 예정 사실 범위로 축소한다. v6 실제 provider 응답을 재생해 보정후 일정형 검토 자료가 채택 가능함을 독립 대조했으며 추가 유료 호출은 0이다. 모호한 복수 주최·다른 브랜드·일정형이 아닌 기사·복수 근거 초안에는 이 보정을 적용하지 않는다. 위조/빈 인용은 보정으로 구제하지 않는다. 자동 결과와 [원문 대조 검토](../evaluations/2026-10-01-report-insight-content-quality/README.md), [사람이 편집한 5건](../evaluations/2026-10-01-report-insight-content-quality/examples.md)을 구분한다.
- 추가 평가 42 provider 요청 중 usage·단가가 있는 36회의 알려진 비용은 **$0.7018135**다. HTTP 404 6회는 usage가 없어 비용 불명이다. 실패 검수와 thinking은 알려진 합계에 포함했다. 실제 5건을 완성한 v4 한 묶음은 $0.307608이며 다른 입력의 고정 비용이나 청구액을 보장하지 않는다. 이전 파일럿 $0.0809925·7 provider 요청과 별개다. 현재 월 상한은 없고 실행별 사용량을 기록한다.
- 구현 `80e731ed`을 Engine `moonlight-pro-engine-67fmujtus-muuuuoouuuns-projects.vercel.app`→Hub `moonlight-pro-lom3f6ugz-muuuuoouuuns-projects.vercel.app` 순서로 배포했고 둘 다 Ready·고정 운영 URL alias를 확인했다. 인증 보고서 `live`·실패 출처 0, 월 비용 상한 `null`, 비로그인 차단·양쪽 health·야간 due 밖 크론 응답을 확인했다. 새 편집본은 [실제 보고서함](https://moonlight-pro-hub.vercel.app/dashboard/reports?report=stored%3A8654547f-3e9e-41a9-803f-d75609426d4b)에 새 문서로 보관했고 원문 본문·동일 receipt·빈 운영자 판단을 확인했다. 기존 기록을 덮어쓰지 않았다.
- 검증: root **3,890 tests · 3,877 pass · 13 conditional skips · 0 failures**, typecheck/contracts/ClassIn/Hub·Engine build 통과. 최종 정치 일정 축소·복수 주최 모호성·위조 인용 회귀 25/25, migration·Office 실제 PostgreSQL 23/23 통과. 독립 코드 리뷰의 복수 주최자 추출 P2를 회귀 테스트로 수정했다. 서버 원문 축소 전 CI와 양쪽 Vercel preview도 통과했으며 최종 commit은 다시 CI를 확인한다. 운영 이후 `main` Git 배포가 이 코드를 보존하는지는 [PR #21](https://github.com/Muuuuoouuun/moonlight_pro/pull/21)의 합병 후 확인한다.

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
