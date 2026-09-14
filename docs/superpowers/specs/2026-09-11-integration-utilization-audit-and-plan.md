# 외부 연결·API·OAuth·MCP 활용도 실사 및 최적화 기획

> 작성: 2026-09-11
> 상태: **분석 완료 + §7 결정 5건 운영자 확정(2026-09-11)**. 실행 계획은 [`../plans/2026-09-11-integration-cleanup-and-activation.md`](../plans/2026-09-11-integration-cleanup-and-activation.md).
> 상위 정본: [운영자 프로필](../../operator-workflow-profile.md), [개인 운영 OS 심화 설계](2026-07-13-moonlight-personal-operator-os-deep-design.md), [Agent·Council 운영 계획](../../agent-council-api-mcp-operating-plan-2026-09-09.md).
> 관계: [`docs/integration-inventory.md`](../../integration-inventory.md)의 연결 카탈로그와 권장 순서표는 2026-07-15 기준이다. 이 문서 §2 실측표가 09-11 기준으로 그 카탈로그를 보완하며, B4에서 카탈로그를 이 표로 교체할 것을 권장한다.
> 방법: 서브에이전트 5개(Engine 통합 / Hub OAuth / MCP·커맨드·스크립트 / 문서 주장 / 형제 저장소) 병렬 감사 + 라이브 Supabase 원장 읽기(`integration_connections`, `sync_runs`, `webhook_events`, `agent_runs`, `work_orders`, `error_logs`) + 핵심 주장 8건 코드 스팟체크 + Codex(gpt-5.6-sol, read-only sandbox) 독립 검토 1회(반박 4건 수용, §9). 모두 읽기 전용이며 파일·원장·설정을 바꾸지 않았다.

## 1. 한 줄 결론

연결은 많이 **만들어져** 있지만, 09-11 현재 실제로 작동하고 최근 30일 안에 쓰인 것은 **Supabase 원장과 Google Calendar OAuth 둘뿐**이다. 나머지는 네 부류로 나뉜다.

| 부류 | 항목 | 해법의 성격 |
| --- | --- | --- |
| 완성됐지만 켜지 않음 | Moonlight MCP 17도구, Gmail OAuth, Threads/Instagram OAuth, Notion sync 모듈, Slack alert 모듈 | 등록·버튼·앱 ID 한 줄 |
| 반쪽 | Telegram(수신만, 회신 없음), Google Sheets(env 토큰 경로만), GitHub(토큰 없음·1 repo), eeoCRM(서버 다운·Hub 라우트 삭제) | 결정 후 마감 또는 폐기 |
| 휴면 | Gemini 자문(마지막 07-12), OpenClaw(마지막 07-14, launchd 0), work_orders 26건 전부 dismissed | 통합 문제가 아니라 **사용 루프** 문제 |
| 드리프트·보안 | 삭제된 라우트를 부르는 스크립트, 미사용 env 2개, 중복 도구 1개, OAuth 토큰 평문 저장, Gmail 게이트 누락 | 정리 PR |

따라서 최적화의 순서는 **새 연결 추가가 아니라 (1) 있는 것 켜기 → (2) 죽은 것 지우기 → (3) "실제 연결됨"을 한 곳에서 말하는 진실 프로브 만들기 → (4) 자문→실행 루프 닫기**다.

## 2. 실측 인벤토리 (코드 × 라이브 원장 × 소비자)

판정 기준: `작동` = 코드 완결 + 최근 원장 기록 + 소비자 존재. `놀고 있음` = 코드 완결이나 등록/버튼/키가 없음. `반쪽` = 한쪽 방향만. `휴면` = 작동 가능하나 30일 이상 기록 없음. `죽음` = 호출 경로 없음.

| 연결 | 코드 상태 | 라이브 원장 (마지막 성공) | 소비자 | 판정 |
| --- | --- | --- | --- | --- |
| Supabase REST (`rwqe…`) | Hub·Engine·MCP 전부 사용 | 원장 자체 | 전 표면 | 작동 |
| Google Calendar OAuth (`calendar.events`) | connect/callback/status/event 완결, `GOOGLE_OAUTH_ENABLED_PROVIDERS=calendar` 게이트 | `google_calendar` connected, 토큰 갱신 09-04, sync 07-17 | Calendar 페이지, Daily Brief 오늘 일정 | **작동** (유일한 최근 사용) |
| Google Calendar iCal 폴백 | 허용 호스트·크기 제한 있음 | 없음(무상태) | Calendar 페이지 배지 | 작동 |
| Gemini (Engine `/api/ai/brief`·`sales-mentor`·`brand-mentor`) | 완결, shared secret 검증 | `gemini`·`council`·`guru` connected; `agent_runs` 26건, 마지막 07-12; council brand-strategy 9건 중 5건 실패(07-11 shared secret 미설정) | Hub Council/Guru 페이지, MCP 도구(미등록) | 휴면 |
| Gemini Vision (명함 OCR, `GEMINI_API_KEY`) | 완결 | 별도 원장 없음 | 명함 캡처 흐름 | 작동 추정 |
| Google Sheets OAuth (개인 리드 시트) | 완결, `sheets` 게이트 적용 | `sync_runs` 2건 마지막 07-07; `integration_connections` 행 없음 → env `GOOGLE_SHEETS_REFRESH_TOKEN` 경로 | `automations/sheets` 페이지, `/inbox` 커맨드 | 휴면 (import·push 양방향 코드는 완결) |
| Gmail OAuth + send | connect/callback/status + Engine send 완결. **`isGoogleOAuthProviderEnabled` 호출 0** (calendar·sheets는 호출) | `google_gmail` 행 없음 | `automations.jsx` 카드의 Connect 버튼이 `settings`로 가는데 settings에 Gmail 카드 없음 → **연결 버튼 실질 0** | 놀고 있음 + 게이트 버그 |
| Resend | preview 응답까지 완결 | env 키 빈 값 | `/api/email/send` 호출자 3파일 | 놀고 있음 (운영자 확정: 이메일 후순위) |
| Telegram webhook (수신) | secret 검증·중복 방지·커맨드 dispatch 완결 | `webhook_events` 108건, 마지막 06-15 | 외부 Telegram만 | 반쪽 |
| Telegram 회신 (발신) | **`TELEGRAM_BOT_TOKEN`·`sendMessage` 코드 0** | — | — | 누락 (회신은 n8n 경유 가정) |
| n8n fan-out | 코드 완결, `N8N_WEBHOOK_URL` 없으면 조용히 skip | env 없음 | Telegram 라우트 내부 | scaffold |
| OpenClaw 프로젝트 webhook | **현재 코드는 provider 허용목록이 `moltbot`뿐**(`apps/engine/lib/shared-webhook.ts:6`, Hub 타깃도 `generic`·`moltbot`). `openclaw` 참조는 readiness·health·`check-connections`에만 남음 | `openclaw` connected(local) 행과 07-14 배달 기록이 원장에 잔존. 07-15 문서의 launchd 2개는 **현재 0개** | 없음 | 죽음(코드)·원장 잔존 |
| GitHub read sync | Engine 완결, Hub는 프록시 | `github` connected, `tokenConfigured:false`, 1 repo, 마지막 06-05. env의 4 repo 중 2개(`sales_branding_dash`, `ai-command-pot`)는 이 머신에 없음 | Hub 프록시 라우트, 페이지 배선 미확인 | 휴면 |
| Meta Threads OAuth | connect/callback/status/deauthorize/data-deletion 완결 | 행 없음(앱 ID 미설정) | Settings 페이지 카드 | 놀고 있음 (운영자 확정: Threads가 콘텐츠 1순위 채널) |
| Instagram OAuth | Threads와 동일 패턴 | 행 없음 | Settings 페이지 카드 | 놀고 있음 |
| Notion read sync | Engine `lib/notion-sync.ts` 완결, **라우트 0·env 0** | `notion` pending, sync 실패 2건(06-15) | 없음. claude.ai Notion 커넥터도 미인증 | 죽음 |
| Slack failure alert | Engine `lib/slack-alert.ts` 완결, **라우트 0·env 0** | `slack` pending, sync 실패 2건(06-15) | 없음 | 죽음 |
| eeoCRM MCP (`localhost:3010` SSE) | Hub 라우트 `api/hub/eeocrm`·`integrations/eeocrm/sync`는 **08-05 `1dada12`에서 삭제**. `scripts/fill-crm-intake.mjs`는 아직 그 라우트를 호출 | `sync_runs` 22건(18 성공) 마지막 07-07 | `/morning` `/team` `/inbox` 커맨드가 MCP 도구에 의존(미연결 시 skip) | 반쪽·서버 다운 |
| Moonlight MCP (`packages/mcp-server`, stdio, 17 도구) | 완결, README·테스트 있음. `get_content`=`get_content_queue` 중복 | — | **등록 0** (`.mcp.json`·`~/.claude.json`·`~/.codex/config.toml` 모두 없음). 커맨드·스킬 호출 0 | **완전히 놀고 있음** |
| classin-dash MCP (`dash.classin.cloud`, http, 전역) | 읽기 전용 9도구 | 별도 Supabase 프로젝트(`xgab…`) | Claude 세션만. Moonlight 원장·문서와 무연계, `integration-inventory.md` 미기재 | 작동, 미연계 |
| claude.ai 커넥터 | Figma 인증됨(저장소 내 사용 근거 0), Notion·Google Drive 미인증 | — | — | 유휴 |
| Google 서비스 계정 / IAM | **없음**. 모든 Google 접근은 OAuth 사용자 동의. `scripts/sync-rev-ledger.mjs`만 `GOOGLE_SERVICE_ACCOUNT_*`를 요구하나 env 미설정 | — | 매출 원장 dry-run | 누락 |
| Operator session cookie / OAuth state | HMAC·timing-safe 완결. state 서명 로직이 `google-oauth.js` 외 4파일에 복제. state에 `iat`만 기록하고 **만료·재사용 검증 없음** | — | 전 OAuth 흐름 | 작동, 드리프트·replay 위험 |

원장 시간축 요약: calendar 09-04 → work_orders 08-04(최근 5건 전부 dismissed) → agent_runs 07-12 → eeocrm 07-07 → telegram 06-15 → github 06-05. 7월 중순 이후 Hub 사용은 캘린더·태스크·프로젝트·메모(최근 커밋 영역)에 집중되고, AI 자문·CRM 동기화·Telegram은 두 달 휴면이다.

## 3. 발견 상세

### 3.1 놀고 있는 자산 (켜기만 하면 됨)

1. **Moonlight MCP** — 17도구가 Hub 라우트 17개에 정확히 대응하고 라우트가 전부 존재한다. 어느 클라이언트에도 등록되지 않아 Claude Code·Codex 세션이 원장을 직접 읽거나 태스크를 만들 수 없다. 그래서 `/morning`·`/team`·`/inbox` 커맨드는 Supabase 테이블명을 산문으로 언급하는 방식으로 우회한다.
2. **Threads/Instagram OAuth** — 코드·데이터 삭제 콜백까지 Meta 앱 심사 요건을 갖췄다. 남은 것은 Meta 대시보드에서 앱 ID/secret 발급뿐이다.
3. **Gmail OAuth** — 흐름은 완결이나 UI 진입점이 끊겨 있고 `GOOGLE_OAUTH_ENABLED_PROVIDERS` 게이트를 읽지 않는다.
4. **Notion sync·Slack alert** — 모듈은 완성, 라우트 배선 0. 운영자 프로필에 Notion 유입 채널이 없으므로 Notion은 켤 이유가 약하다. Slack은 실패 알림 P2로만 의미가 있다.
5. **classin-dash MCP** — 학원 운영 데이터 읽기 도구가 연결돼 있으나 Moonlight의 고객·프로젝트 원장과 연결 지점이 없다.

### 3.2 누락

- **Telegram 회신 leg**: 수신·처리·원장 기록은 되는데 답장을 보낼 코드가 없다. `TELEGRAM_BOT_TOKEN`은 env 템플릿에만 있다.
- **Kakao**: 운영자 1순위 채널(메시지·전화)인데 통합이 없다. 다만 개인 카톡에는 API가 없고 알림톡(Aligo)은 사업자 채널·템플릿 승인 전제다. classin-toolkit 쪽에 Aligo dry-run 계층이 있다.
- **Google 서비스 계정**: 없음. 무인 배치(매출 원장 싱크)는 서비스 계정이 자연스러운데 사용자 OAuth만 있다.
- **외부 통합 테스트 0건**: Telegram·GitHub·Gmail·Resend·Gemini·Notion·Slack·webhook 인증 모두 자동 테스트 없음. 테스트는 내부 command 라우트에만 있다.
- **"실제 연결됨" 단일 프로브 없음**: `npm run check:connections`는 env·도달성만 본다. 토큰 존재 여부는 `/api/calendar/google/status` 등 status 라우트 5개를 따로 불러야 안다. Instagram·Threads·eeoCRM은 어느 프로브에도 없다.

### 3.3 죽은 것·드리프트

- `scripts/fill-crm-intake.mjs` → 삭제된 라우트 2개 호출 (08-05 이후 실행 불가).
- 미사용 env: `TELEGRAM_BOT_TOKEN`, `AI_DEFAULT_PROVIDER`(코드가 읽지 않음, Gemini 단일 구현).
- MCP 도구 중복: `get_content` = `get_content_queue`.
- 문서: `integration-inventory.md` 순서표는 Calendar를 P1로 두고 상세 절은 "확정·연결됨"이라 한다. 07-15 "launchd 2개 실행 중" 주장은 현재 0개. classin-dash MCP는 카탈로그에 없다. `docs/README.md`는 CRM 결합을 보류라 하는데 eeoCRM enrichment 플랜은 ACTIVE·16건 적용이다.
- `GITHUB_REPOSITORIES` 4개 중 2개는 이 머신에 없고 명칭도 문서(`sales_dash`)와 어긋난다.
- OpenClaw: 07-07 `cae3cdc` 이후 Engine provider 허용목록에서 빠졌는데 env 템플릿(`OPENCLAW_*` 7개)·readiness·health·문서 카탈로그("Connected (local)")는 그대로다.

### 3.4 보안

1. **OAuth 토큰 평문 저장** — `integration_connections.config` JSON 안에 Google access/refresh token이 그대로 있다. service role로 `select *` 하면 노출된다. status 라우트는 `hasRefreshToken` 불리언만 내보내므로 클라이언트 노출은 없지만, 로그·백업·감사 조회에서 샌다.
2. **Gmail connect 게이트 누락** — env로 "calendar만 허용"을 걸어도 `/api/email/gmail/connect`는 동의 URL을 만든다.
3. **OAuth state 서명 4곳 복제** — 한 곳만 고치면 나머지가 드리프트한다.
4. **OAuth state 만료 검증 없음** — 5개 provider 모두 `iat`를 넣지만 decode 시 TTL·재사용을 검사하지 않는다. 서명된 state를 재사용한 callback replay가 가능하다.
5. **`getVisionStatus()`가 `apiKey` 값을 반환** (`apps/hub/lib/google-vision.js:10`). 현재 외부 소비자는 없지만 health나 로그에 직렬화되는 순간 유출된다.
6. (다른 저장소) `classin_home/classin_secret/client_secret_*.json`은 04-15 감사에서 회전 대상으로 표시됐고 아직 있다.

## 4. 왜 휴면인가 — 통합이 아니라 루프의 문제

`work_orders` 26건 중 최근 기록은 전부 `dismissed`이고 `agent_runs`의 `outcome_id`는 전부 null이다. Council·Guru 자문은 생성됐지만 실행·결과로 이어진 기록이 없다. 09-09 운영 계획 §1의 진단("한 고객 → 한 판단 → 한 실행 → 한 결과를 닫는 것이 급하다")과 일치한다. Gemini·MCP·Telegram을 더 붙여도 이 루프가 닫히지 않으면 원장은 계속 조용하다. 그래서 Track C4를 통합 작업과 같은 무게로 둔다.

## 5. 최적화 기획

원칙: 운영자 확정 우선순위(메시지·전화 > 이메일, 캘린더 핵심, Threads 1순위, ClassIn 전체 동기화 하드게이트, 자동 발송 금지)를 그대로 따른다. 각 항목은 `권장`이며 표시된 것만 운영자 결정이 필요하다.

### Track A — 켜기 (약 1주, 코드 변경 소량)

| # | 작업 | 근거 | 결정 |
| --- | --- | --- | --- |
| A1 | Moonlight MCP를 `.mcp.json`(stdio, 절대 경로)과 `~/.codex/config.toml`에 등록. `get_content` 중복 제거. `/morning`·`/team`·`/inbox`를 MCP 도구명 기준으로 재작성 | 완성된 17도구가 0회 사용 | 권장 |
| A2 | Threads(우선)·Instagram Meta 앱 ID/secret 발급 후 Settings 카드로 연결. **연결 scope는 `threads_basic`/`instagram_business_basic`만** — 기본값(`DEFAULT_SCOPES`)에 `*_content_publish`가 들어 있으므로 env `COM_MOON_META_THREADS_SCOPES`·`COM_MOON_INSTAGRAM_SCOPES`로 제외한다. 발행 scope는 "콘텐츠 직접 발행" 하드게이트가 풀릴 때 별도 재동의 | 운영자 §12 Threads 1순위, 코드 완결, 심화 설계 §21 직접 발행 보류 | **Q1** |
| A3 | OAuth 토큰(Google calendar·gmail·sheets, Meta threads·instagram 전부)을 `config` JSON에서 빼서 **암호화 저장**(Supabase Vault 또는 pgsodium). 별도 평문 컬럼은 노출면만 줄일 뿐 보안 등급이 같으므로 과도기 조치로만 허용. status 라우트의 불리언 계약 유지 | §3.4-1 | **Q5** (방식) |
| A4 | `google-gmail.js`에 `isGoogleOAuthProviderEnabled("gmail")` 게이트 추가. 활성화 자체는 하지 않음 | §3.4-2 | 권장 |

### Track B — 정리 (약 1주, 삭제 위주)

| # | 작업 | 근거 |
| --- | --- | --- |
| B1 | `scripts/fill-crm-intake.mjs` 삭제. eeoCRM 유입은 "MCP evidence 파일 → `enrich-eeocrm-leads.mjs --evidence`" 경로만 정본으로 문서화 | 죽은 라우트 |
| B2 | `AI_DEFAULT_PROVIDER` env 제거(또는 실제 provider switch 구현 결정). `TELEGRAM_BOT_TOKEN`은 **Q2** 결과에 따라 삭제 또는 사용 | 미사용 env |
| B3 | Notion·Slack 모듈 처분 — 권장: Slack alert만 `error_logs`/`sync_runs` 실패에 배선(P2), Notion 모듈은 삭제 또는 파일 상단 `DEFERRED` 표시 | **Q3** |
| B4 | `integration-inventory.md` 카탈로그·순서표를 이 문서 §2로 교체, classin-dash MCP 추가, launchd 상태·GitHub repo 목록 갱신 | 문서 드리프트 |
| B5 | provider 중립 `oauth-state.js` 모듈 신설: HMAC 서명 + `iat` 기반 TTL(10분) + nonce 1회성 + provider 바인딩. Google 3개·Meta 2개 모두 이 모듈로 교체하고 replay·만료 테스트 추가. Google 전용 `google-oauth.js`로 Meta를 흡수하지 않는다 | §3.4-3·4 |
| B6 | `getVisionStatus()`에서 `apiKey` 값 제거(불리언만), secret 비직렬화 테스트 추가 | §3.4-5 |

### Track C — 진실 프로브와 루프 닫기 (약 2주)

| # | 작업 | 근거 |
| --- | --- | --- |
| C1 | `check-connections.mjs`가 상태 라우트 5개(`/api/calendar/google/status`, `/api/email/gmail/status`, `/api/hub/sheets`, `/api/social/instagram/status`, `/api/social/meta/threads/status`)를 호출하고, 토큰 존재만이 아니라 **갱신(refresh) 시도 결과**로 live·expired·missing을 판정해 한 표로 출력. Settings 페이지 각 카드에 `TruthBadge`(live·preview·error)로 동일 결과 노출 | §3.2 "단일 프로브 없음" |
| C2 | Telegram 회신 leg 결론 실행 — (a) `sendMessage` 직접 구현 (b) OpenClaw 경유 (c) 수신만 유지하고 회신 폐기. 운영자 "모바일 후순위" 확정과 두 달 휴면을 근거로 **(c) 권장** | **Q2** |
| C3 | 외부 통합 최소 계약 테스트: Gemini 응답 파싱, GitHub sync 요약, Calendar 토큰 갱신 — fixture 기반, 네트워크 없음 | 테스트 0건 |
| C4 | 자문→실행 루프: 활성 캠페인의 고객·오퍼·가격 가설·검증 지표 빈칸 채우기 → 하루 1 행동 → `work_orders` 승인 1건 → `outcome_id` 연결 1건을 실측. 통합 코드 변경 없음 | §4 |

### Track D — 보류·미정 (운영자 결정 전 착수 금지)

- Kakao 발송 통합: 개인 카톡 API 부재. 권장은 "기록만"(`outreach_outcomes.channel=kakao`) 유지, 알림톡은 classin-toolkit Aligo 계층에 남김.
- Gmail·Resend 활성화 시점: 이메일 후순위 확정과 충돌하지 않도록 **Q4**.
- Google 서비스 계정 도입: 매출 원장 무인 싱크가 필요해질 때. 지금은 dry-run 스크립트만 있어 미정.
- GitHub token·repo 목록 정정, n8n, OpenClaw 재가동: 각각 사용 근거가 생길 때.
- classin-dash ↔ Moonlight 연계: 별도 Supabase·별도 도메인(학원 운영). 심화 설계의 ClassIn Bridge 하드게이트에 묶여 있으므로 보류.
- Notion·Google Drive claude.ai 커넥터 인증: 유입 채널로 확정된 바 없음.

## 6. 에이전트·Codex 사용 최적화

현재 상태: 커맨드 3개가 "Codex 게이트"를 언급하지만 배선은 `/codex` 스킬 관행뿐이고, Moonlight MCP 미등록으로 Claude·Codex 어느 쪽도 원장에 닿지 못한다.

권장 스택 (A1 이후):

| 역할 | 도구 | 접근 |
| --- | --- | --- |
| 판단·오케스트레이션 | Claude Code 세션 | Moonlight MCP read 도구 + classin-dash MCP(읽기) |
| 원장 쓰기 | Moonlight MCP write 도구(`create_task`·`decide_work_order`) | `COM_MOON_HUB_WRITE_SECRET` |
| 회사 CRM 조회 | eeoCRM MCP | 서버 기동 시에만, evidence 파일로 고정 |
| 고객 대면 문안·코드 검토 | Codex CLI (`codex exec --sandbox read-only`) | 읽기 전용, 결과는 승인 큐로 |
| 저비용 탐색·감사 | 하위 모델 서브에이전트 | 이 문서와 같은 병렬 감사 패턴 |

규칙: 자문 생성(Engine Gemini)은 반복 판단에만 쓰고 단순 조회는 MCP read로 끝낸다(09-09 계획 §3 A). 같은 추천을 재생성하기 전에 이전 `runId`와 오더 상태를 읽는다.

## 7. 운영자 결정 (2026-09-11 확정)

| # | 질문 | 확정 | 실행 의미 |
| --- | --- | --- | --- |
| Q1 | Threads/Instagram Meta 앱 | **개인 브랜드(moon.classin) API로 연결 진행** | A2 실행. 연결 scope는 basic만. 발행 scope·직접 발행은 여전히 심화 설계 §21 보류(별도 결정) |
| Q2 | Telegram 회신 / OpenClaw | **둘 다 삭제** | Telegram 수신 라우트·lib·n8n fan-out·env, OpenClaw env·readiness·health·프로브 참조를 코드에서 제거. 원장 행(`webhook_events` 108건, `openclaw` connection)은 이력으로 보존 |
| Q3 | Notion·Slack | **Slack만** | Slack alert를 `sync_runs`·`error_logs` 실패에 배선. `notion-sync.ts`·Notion env·`notion` connection 처분(코드 삭제, 행 보존) |
| Q4 | Gmail·Resend | **삭제** | Hub Gmail OAuth·scan, Engine email send·Resend, 관련 UI 카드·work-order 이메일 실행 경로 제거. 이메일 후순위 확정과 일치 |
| Q5 | OAuth 토큰 저장 | **권장안(암호화)** | Supabase Vault/pgsodium으로 Google calendar·sheets, Meta threads·instagram 토큰 암호화 저장 |

## 8. 첫 실행 순서 (결정 없이 가능한 것만)

운영자 확정 목표(고객 연락·후속 누락 0, 인지 에너지 1/3)에 직접 닿는 순서로 둔다. 통합 켜기는 그 뒤다. §7 확정에 따라 A4(Gmail 게이트)는 삭제로 대체되고, C2(Telegram 회신)는 삭제로 종결된다. 상세 태스크는 실행 계획 문서에 있다.

1. C4 자문→실행 루프 실측 (코드 아님, 운영). 이번 주 승인 1건·결과 연결 1건
2. 보안 묶음: A4 Gmail 게이트, B5 state TTL·replay, B6 Vision apiKey — 작고 되돌리기 쉬움
3. A1 MCP 등록 + 중복 도구 제거 + 커맨드 재배선 — Claude·Codex가 원장을 읽게 만드는 유일한 배선
4. 정리: B1 죽은 스크립트, B2 미사용 env, OpenClaw 잔여 참조·env 정리, B4 문서 교체(표는 `코드 준비 / 로컬 설정 / 라이브 검증 / 최근 사용` 4축으로)
5. C1 진실 프로브 + Settings TruthBadge
6. C3 계약 테스트

## 9. 근거 기록

- 라이브 원장 조회: `integration_connections` 8행, `sync_runs` 61행, `webhook_events` 131행, `agent_runs` 26행, `work_orders` 26행, `error_logs` 239행 (2026-09-11, service role, 읽기 전용).
- 스팟체크: Gmail 게이트 호출 0 / Notion·Slack importer 0 / Telegram 발신 코드 0 / `fill-crm-intake` 라우트 부재 + 삭제 커밋 `1dada12` / MCP 등록 3개 설정 파일 모두 없음 / status 라우트가 토큰 값 아닌 불리언만 반환 / launchd moonlight·openclaw 잡 0.
- Codex 독립 검토(gpt-5.6-sol, read-only, 네트워크·원장 없음): §2 판정 24건 중 확인 ○ 11, 부분 △ 11(대부분 "원장 없이는 미검증" — 이 문서의 원장 근거로 보완), 반박 ✕ 1(OpenClaw → 수용, 판정을 "죽음"으로 정정). 계획 비판 5건 중 4건 수용: Sheets 상태 경로, Meta 발행 scope, 평문 컬럼의 보안 등급, state TTL. 추가 권장 3건 수용(4축 표, state replay 테스트, Vision apiKey).
- 서브에이전트 보고서와 Codex 출력은 세션 스크래치에만 있으며 저장소에 남기지 않았다. 개인정보·토큰 값은 이 문서에 기록하지 않았다.
