# Integration Inventory

## 목적

이 문서는 Com_Moon Hub에 붙여야 할 외부 시스템을 한 군데에서 관리하기 위한 운영 인벤토리다.

- 무엇을 연결할지
- 어디에 연결되는지
- 현재 코드가 얼마나 준비되어 있는지
- 어떤 시크릿과 매핑이 필요한지
- 어떤 순서로 붙이는 게 맞는지

## 현재 코드에 이미 있는 통합 뼈대

## 2026-04-20 Supabase 연결 이후 작업 예정

Supabase는 이제 Hub/Engine의 1차 원장으로 본다. 다음 연결들은 모두 "외부 서비스가 source of truth"가 아니라
`Engine -> Supabase ledger -> Hub`로 흘러 들어오는 입력/실행 채널이다.

### 권장 순서

| 순서 | 연결 | 역할 | 우선순위 | 난이도 | 1차 완료 조건 |
| ---: | --- | --- | --- | --- | --- |
| 1 | Engine public URL + shared secret | 외부 webhook/API가 들어오는 안전한 정문 | P0 | Low | `GET /api/health`가 공개 URL에서 응답하고 `COM_MOON_SHARED_WEBHOOK_SECRET`가 설정됨 |
| 2 | Project webhook smoke test | 외부 진행 이벤트를 `project_updates`, `webhook_events`에 남기는 공통 intake 검증 | P0 | Low-Mid | `/api/webhook/project/openclaw` 또는 `/moltbot`으로 보낸 테스트 이벤트가 Supabase에 기록됨 |
| 3 | Telegram | 모바일 운영 리모컨, 빠른 명령 입력 | P0 | Mid | `/ping`, `/projects`, `/webhooks`가 Telegram에서 실행되고 run/event ledger가 남음 |
| 4 | GitHub read sync | 실제 개발/배송 상태 source | P0.5 | Mid | repo/issue/PR/milestone 요약이 Work OS에 표시되고 `sync_runs`가 남음 |
| 5 | Google Calendar | 일정, 마감, cadence 관리 | P1 | Mid-High | OAuth 연결 후 테스트 이벤트 생성/조회가 되고 `sync_runs`가 남음 |
| 6 | Resend outbound email | 리드 follow-up, 운영/캠페인 메일 발송 | P1 | Mid | `/api/email/send` dry-run과 실제 테스트 발송 1건이 성공함 |
| 7 | Gmail send | 개인/운영 Gmail 발송 채널 | P1 | Mid | Gmail OAuth connection 저장 후 send 테스트가 성공함 |
| 8 | Instagram API | `moon.classin`/Classmooni Instagram 발행/상태 연결 | P1 | Mid | Instagram OAuth로 `instagram_api` connection과 sync run이 남음 |
| 9 | Meta Threads | `moon.classin` 브랜드 발행/상태 연결 | P1 | Mid | Threads OAuth로 `meta_threads` connection과 sync run이 남음 |
| 10 | Notion read sync | 프로젝트/태스크/결정/노트 지식 소스 흡수 | P1 | High | Projects DB, Tasks DB read-only sync와 field mapping이 확정됨 |
| 11 | Slack failure alert | 실패 알림과 approval 요청 채널 | P2 | Mid | `error_logs`, `sync_runs` failure가 지정 채널로 알림됨 |

### 바로 다음 실행 체크리스트

1. Engine 배포 URL을 정하고 Hub env의 `COM_MOON_ENGINE_URL`에 반영한다.
2. Hub/Engine env에 같은 `COM_MOON_SHARED_WEBHOOK_SECRET`를 설정한다.
3. 공개 URL에서 `GET /api/health`를 확인한다.
4. Hub의 webhook smoke test 또는 curl로 `/api/webhook/project/openclaw`에 테스트 payload를 보낸다.
5. Supabase에서 `webhook_events`, `project_updates`, `routine_checks` 기록을 확인한다.
6. 기록이 남으면 Telegram webhook을 등록하고 `/ping`, `/projects`, `/webhooks`를 테스트한다.
7. 그 다음 GitHub read sync를 붙여 Work OS의 실제 배송 상태를 가져온다.

### 보안상 먼저 막을 것

- `POST /api/webhook/project` 기본 라우트에도 shared secret 검증을 적용하거나 provider alias 경로로 통일한다.
- Telegram webhook에 `X-Telegram-Bot-Api-Secret-Token` 검증을 추가한다.
- `webhook_events`에 `provider_event_id` 또는 `external_id` 기반 중복 방지 전략을 적용한다.
- 실패/부분 성공 응답은 `accepted`로 뭉개지 말고 `partial`, `failed`, `duplicate`로 구분한다.

### 데이터 / 연결 레저

- `integration_connections`: 외부 시스템 연결 상태와 설정 저장
- `field_mappings`: 외부 필드와 내부 필드 매핑 저장
- `sync_runs`: 동기화 실행 이력 저장
- `webhook_endpoints`: 공개 webhook 엔드포인트 카탈로그
- `webhook_events`: 실제 webhook 수신 이력

관련 스키마:

- `supabase/schema.sql`

### 현재 공개된 엔진 라우트

- `GET /api/health`
- `POST /api/webhook/telegram`
- `POST /api/webhook/project`
- `POST /api/webhook/project/openclaw`
- `POST /api/webhook/project/moltbot`
- `POST /api/pms/command`

관련 코드:

- `apps/engine/app/api/health/route.ts`
- `apps/engine/app/api/webhook/telegram/route.ts`
- `apps/engine/app/api/webhook/project/route.ts`
- `apps/engine/app/api/pms/command/route.ts`

### 현재 허브에서 이미 볼 수 있는 운영 화면

- `Automations > Webhooks`
- `Automations > Integrations`
- `Work OS > Projects`
- `Work OS > Rhythm`

## 연결 카탈로그

| Provider | 역할 | 연결 방식 | 현재 상태 | 내부 연결 지점 | 필요한 것 | 다음 액션 |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase | 시스템 원장, 로그, 프로젝트, task, sync 상태 저장 | REST + DB | Implemented | Hub, Engine, `packages/hub-gateway` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 또는 `SUPABASE_ANON_KEY`, `COM_MOON_DEFAULT_WORKSPACE_ID` | 실제 workspace 기준으로 env 채우고 live 데이터 연결 |
| Moonlight PMS | 프로젝트·task 생성, project 편집, task 상태 이동 | Hub BFF + authenticated Engine command | Connected (local) | `/api/hub/projects`, `/api/hub/tasks`, `/api/pms/command`, `projects`, `tasks` | Hub/Engine shared secret, Hub write guard, live workspace | dependency·milestone·delete는 별도 Phase 3 계약 전까지 추가하지 않음 |
| Telegram | 인바운드 명령, 빠른 운영 입력 | Webhook intake | Ready | `/api/webhook/telegram`, `automation_runs`, `webhook_events` | 공개 Engine URL, Telegram bot webhook 등록 | 봇 webhook를 engine URL에 연결하고 smoke test 실행 |
| Project tools | 외부 PM/진행률 도구에서 progress/PMS 이벤트 수집 | Generic webhook | Ready | `/api/webhook/project`, `project_updates`, `routine_checks`, `projects` | 공개 Engine URL, 공급자 payload mapping | 먼저 하나의 PM 도구 payload를 webhook contract에 맞춤 |
| OpenClaw | 외부 agent workflow에서 프로젝트/운영 이벤트 전달 + Moonlight 상태 outbound sync | Shared webhook alias + local/Telegram/Slack relay | Connected (local) | `/api/webhook/project/openclaw`, `/api/integrations/openclaw/sync`, `project_updates`, `sync_runs`, `webhook_events` | 로컬 Engine·relay·gateway와 분리된 shared/sync secret | 로컬 sync와 inbound는 검증됨. 공개 Engine 배포 전까지 external provider route는 Ready로만 취급하고, 수정 후 첫 09:30 Telegram delivery를 확인 |
| Moltbot | bot/operator workflow에서 PMS 또는 project 이벤트 전달 | Shared webhook alias | Ready | `/api/webhook/project/moltbot`, `project_updates`, `routine_checks`, `webhook_events` | 공개 Engine URL, `COM_MOON_SHARED_WEBHOOK_SECRET` 권장, payload field mapping | Moltbot payload를 alias route에 보내고 routine or progress event를 확인 |
| GitHub | 작업 히스토리, PR 리뷰 상태, 이슈 압력, milestone 기반 로드맵 | API read / sync | Ready | `Work OS > PMS`, `Work OS > Roadmap`, `integration_connections`, `sync_runs` | `GITHUB_TOKEN`, `GITHUB_REPOSITORIES` | 메인 repo부터 연결해서 PR/issue/milestone이 PMS와 로드맵에 보이게 만들기 |
| Notion | 프로젝트, task, 의사결정, 노트, 문서 허브화 | API sync | Planned | `integration_connections`, `field_mappings`, `sync_runs` | `NOTION_TOKEN`, database IDs | projects/tasks 2개 DB부터 매핑 설계 |
| Google Calendar | 일정, 마감일, cadence 블록 연결 | OAuth + live read + event write, iCal read-only fallback | Connected (local) | `Work OS > Calendar`, `integration_connections`, `sync_runs` | 로컬 env 설정 완료. 배포 시 production callback URI와 동일한 OAuth env 필요 | 공개 Hub URL 확정 후 `https://<hub-host>/api/calendar/google/callback` 등록 및 배포 환경 연결 검증 |
| Samsung Calendar | Galaxy 기기 일정 가시성 | Google account sync on device | Supported via Google sync | `Work OS > Calendar` | Google Calendar 연결, Samsung Calendar 앱에서 같은 Google 계정 sync | 허브에서는 Google Calendar를 source로 연결하고, Galaxy 기기에서는 그 캘린더를 표시 |
| Email | 리드 follow-up, 인바운드 메일, 캠페인/알림 발송 | Inbox sync + send provider | Planned | `leads`, `campaigns`, `campaign_runs`, `sync_runs` | Gmail API 또는 IMAP 선택, SMTP/Resend/Postmark 등 발송 provider 선택 | inbox sync와 outbound send 중 1차 범위를 먼저 결정 |
| Instagram API | `moon.classin`/Classmooni Instagram content lane | Instagram Login OAuth + token ledger | Ready | `/api/social/instagram/connect`, `/api/social/instagram/callback`, `integration_connections`, `sync_runs`, Settings > Integrations | `COM_MOON_INSTAGRAM_APP_ID`, `COM_MOON_INSTAGRAM_APP_SECRET`, `COM_MOON_INSTAGRAM_BRAND_HANDLE`, `COM_MOON_OAUTH_STATE_SECRET`, 공개 Hub URL | Meta Dashboard의 Instagram OAuth redirect에 `/api/social/instagram/callback`를 등록하고 Settings에서 연결 |
| Meta Threads | `moon.classin` 브랜드 content lane | OAuth + token ledger + removal callbacks | Ready | `/api/social/meta/threads/connect`, `/api/social/meta/threads/callback`, `/api/social/meta/threads/deauthorize`, `/api/social/meta/threads/data-deletion`, `integration_connections`, `sync_runs`, Settings > Integrations | `COM_MOON_META_THREADS_APP_ID`, `COM_MOON_META_THREADS_APP_SECRET`, `COM_MOON_META_THREADS_BRAND_HANDLE`, `COM_MOON_OAUTH_STATE_SECRET`, 공개 Hub URL | Meta Dashboard의 Threads OAuth/제거/삭제 callback을 Settings URL로 등록하고 연결 |
| Slack | 에러 알림, approval loop, lightweight command | Bot + webhook | Planned | `error_logs`, `sync_runs`, `automation_runs`, `webhook_events` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, 채널 라우팅 규칙 | 실패 알림부터 시작하고 양방향 command는 나중에 추가 |

## 권장 연결 순서

### P0

- Supabase
- Telegram
- Generic project webhook
- GitHub

이 3개가 있어야 허브가 단순 UI가 아니라 운영 surface가 된다.

### P1

- Notion
- Google Calendar
- Email
- Instagram API
- Meta Threads

이 단계에서 업무, 리듬, 커뮤니케이션의 실제 운영 정보가 허브로 흘러들어온다.

### P2

- Slack

Slack은 강력하지만 쉽게 잡음 채널이 되기 때문에, 먼저 source of truth와 sync 구조를 안정화한 뒤 붙이는 편이 좋다.

## Provider별 상세 메모

### Supabase

현재 코드에서 가장 먼저 붙어야 하는 시스템이다.

- 허브 read: `apps/hub/lib/server-data.js`
- 허브 write: `apps/hub/lib/server-write.js`
- 엔진 read/write: `apps/engine/lib/supabase-rest.ts`
- 로그 저장: `packages/hub-gateway/logger.ts`

### Telegram

현재 구현은 webhook payload를 받아 slash-style command를 처리하는 구조다.

- `/cardnews`
- `/projects`
- `/pms`
- `/webhooks`

아직 봇 토큰 등록, 서명 검증, outbound reply 강화는 운영 수준으로 다듬어야 한다.

### Project webhook

외부 도구를 하나씩 직접 붙이는 대신, 우선 generic contract를 통해 progress 이벤트를 수집하는 방식이다.

받는 핵심 필드:

- `workspaceId`
- `projectId`
- `title`
- `summary`
- `status`
- `progress`
- `milestone`
- `nextAction`
- `checkType`

이 구조 덕분에 Notion, Slack workflow, Zapier, Make, ClickUp, Asana 같은 도구를 같은 intake lane으로 묶을 수 있다.

공유 agent alias:

- `POST /api/webhook/project/openclaw`
- `POST /api/webhook/project/moltbot`

권장 인증:

- `x-com-moon-shared-secret: <COM_MOON_SHARED_WEBHOOK_SECRET>`
- 또는 `Authorization: Bearer <COM_MOON_SHARED_WEBHOOK_SECRET>`

공유 alias는 nested payload도 받는다.

- `meta.workspaceId`, `meta.provider`, `meta.source`
- `project.id`, `project.title`, `project.status`, `project.progress`, `project.nextAction`
- `event.type`, `event.summary`, `event.note`
- `check.checkType`

### OpenClaw sync

Moonlight에서 OpenClaw로 상태를 밀어주는 outbound lane은 아래 route를 쓴다.

- `POST /api/integrations/openclaw/sync`

전송 방식은 `OPENCLAW_SYNC_TRANSPORT=auto`일 때 다음 순서로 선택한다.

1. `OPENCLAW_LOCAL_URL` — 로컬 OpenClaw 인스턴스
2. `OPENCLAW_REMOTE_URL` — 원격 OpenClaw 인스턴스
3. `TELEGRAM_BOT_TOKEN` + `OPENCLAW_TELEGRAM_CHAT_ID` — Telegram relay
4. `OPENCLAW_SLACK_WEBHOOK_URL` — Slack relay

OpenClaw가 Moonlight로 응답할 때는 기존 inbound lane을 그대로 쓴다.

- `POST /api/webhook/project/openclaw`

2026-07-15 로컬 runtime 상태:

- Gateway는 Homebrew Node 24.18.0 고정 경로로 launchd에서 실행되며 supervisor config audit와 RPC가 통과했다.
- Telegram/Slack channel은 둘 다 configured/running/probe success다. 이는 Moonlight Engine의 Telegram webhook 또는 Slack failure-alert 구현 상태와는 별도 연결이다.
- Telegram group inbound는 운영자 1명 allowlist + 4개 reachable group + mention-required다. native command 148개가 Telegram 한도 100개를 넘겨 native menu는 껐고 text command는 유지한다.
- OpenClaw static secret 6개는 macOS Keychain SecretRef로 이동했고 plaintext/unresolved/shadowed가 0이다. OpenAI Codex OAuth는 회전형 OAuth profile이라 static-secret migration 대상이 아니다.
- Main session은 1,030,410/200,000 tokens에서 공식 reset 후 0/200,000으로 정리했고 원문은 archive했다. session retention은 180일, disk budget은 500MB다.
- 평일 09:30 뉴스 cron은 Telegram target과 failure alert가 설정됐으나, 수정 뒤 첫 scheduled run의 `delivered=true`는 아직 미래 검증이다.

### Projects folder bridge

로컬 `~/Desktop/Projects` 아래의 여러 프로젝트는 아직 같은 원장에 직접 연결되어 있지 않다. 1차 연결은 각 프로젝트를 별도 API로 억지로 붙이는 방식이 아니라,
문서/설정/웹훅 계획을 Moonlight의 공통 project webhook contract로 정규화하는 방식으로 시작한다.

실행 명령:

```bash
npm run inventory:project-connections -- --output docs/projects-connection-inventory.md --json-output docs/projects-connection-payloads.json
```

이 명령은 다음을 생성한다.

- `docs/projects-connection-inventory.md` — 프로젝트별 연결 신호, 필요한 env key, 다음 액션
- `docs/projects-connection-payloads.json` — `/api/webhook/project/openclaw` 또는 generic project webhook로 보낼 수 있는 smoke payload

운영 원칙:

- 실제 `.env`는 읽지 않고 `.env.example` / `.env.local.example`의 변수명만 수집한다.
- 프로젝트별 외부 연결은 먼저 `project.connection.inventory` 이벤트로 레저에 기록한다.
- 그 다음 각 프로젝트의 실제 provider payload를 `OpenClaw`, `Moltbot`, 또는 generic project webhook route로 매핑한다.
- `COM_MOON_PROJECTS_ROOT` 기본값은 `/Users/bigmac_moon/Desktop/Projects`이며, 다른 머신에서는 env로 덮어쓴다.

### Notion

가장 먼저 붙일 만한 지식/프로젝트 시스템이다.

권장 1차 범위:

- Projects DB -> `projects`
- Tasks DB -> `tasks`
- Decisions DB -> `decisions`
- Notes DB -> `notes`

권장 원칙:

- DB를 한 번에 다 붙이지 말고 `projects`, `tasks`부터
- `field_mappings`를 먼저 확정한 뒤 sync 구현
- write-back보다 read/sync 먼저

### Google Calendar

Google Calendar는 이제 직접 연결 가능한 1차 일정 provider다.

#### 2026-07-15 연결 상태 — 확정

- Google Cloud의 기존 `classinproject-moon` 프로젝트를 사용한다.
- Hub 전용 웹 OAuth 클라이언트 이름은 `moonlight-hub-calendar`다.
- OAuth audience는 조직 내부용이며, 범위는 `https://www.googleapis.com/auth/calendar.events`다.
- 로컬 callback은 `http://localhost:3000/api/calendar/google/callback`으로 등록됐다.
- `integration_connections`의 `google_calendar` connection은 `connected`이며 access token과 refresh token이 저장됐다.
- Google Calendar API가 반환한 primary identity를 원장의 `external_account_id`에 보정했고, 다음 OAuth callback도 이를 자동 저장한다. 문서에는 `j***@classin.com`으로만 표기한다.
- Hub API smoke check는 `source: oauth`, `readOnly: false`로 성공했고, 2026-07-15~07-31 범위에서 실제 일정 11건을 읽었다.
- 실제 일정 생성·수정 smoke test는 사용자 캘린더에 불필요한 이벤트를 만들지 않기 위해 실행하지 않았다.
- `GOOGLE_CALENDAR_ICAL_URL`은 OAuth connection이 없을 때만 쓰는 읽기 전용 fallback으로 유지한다. 저장소 문서에는 실제 공개/비공개 URL을 기록하지 않는다.

상시 연결의 의미:

- Hub Calendar를 열거나 조회 주간을 바꿀 때 Google `primary` calendar를 live read한다.
- access token이 만료되면 저장된 refresh token으로 자동 갱신한다.
- 이벤트를 별도 Moonlight task로 전량 복제하는 background mirror는 두지 않는다.
- production 배포 전에는 실제 HTTPS Hub callback URI를 OAuth 클라이언트에 추가하고 같은 자격증명을 배포 환경의 secret으로 설정해야 한다.

현재 구현 범위:

- Google OAuth 연결
- `Work OS > Calendar` 안에서 외부 Google 일정 읽기
- 허브에서 Google 일정 생성 / 수정
- sync 이력 `integration_connections`, `sync_runs` 기록

#### 2026-07-15 control-plane 실행 상태 — 확정

| 경계 | 상태 | 확인 증거 |
| --- | --- | --- |
| Hub / Engine / relay | live | 각 health 200, `npm run check:connections` 전체 PASS, launchd 두 job running |
| OpenClaw cron | configured, target authenticated, delivery 검증 대기 | 평일 09:30 KST, Telegram announce 대상 명시. token probe와 대상 supergroup 조회 성공, bot administrator. 마지막 run은 00:40 수정 전 `not-delivered` |
| Moonlight MCP | Codex enabled, Claude Code connected | stdio 도구 13개, Claude `list_tasks` live 6건, SDK `create_task` 저장·재조회 성공. Desktop config는 별도 앱 재시작 확인 필요 |
| Google Calendar | live / writable | OAuth source, account identity 저장, 07-15~07-31 11건 read |
| iCal | fallback-only | OAuth 연결이 없을 때만 사용하는 read-only 경로, 현재 응답에 혼합되지 않음 |
| Gmail / Sheets OAuth | disabled | health와 개별 status API가 모두 `provider-not-enabled`; Supabase ledger 존재를 OAuth `live`로 표시하지 않음 |
| eeoCRM | snapshot | Moonlight 총 119 leads 중 117건이 eeoCRM snapshot. 문준혁 exact-owner bridge는 16건만 `Me`로 분리 |
| credential copies | quarantined + inbound cleaned | 동일 해시 2개는 `~/.moonlight/credential-quarantine/2026-07-15`에 `0600` 보존, OpenClaw inbound 원본은 참조 0건 확인 후 제거. 별도 retained client도 `0600` |
| Google Cloud IAM | previous audit only | 두 Owner, 미사용 Editor service account, broad API key가 기록됨. 이번 재검증은 로컬 `gcloud` 부재와 Cloud Console 로그인 부재로 미완료 |

권장 1차 범위:

- 정기 일정 -> `routine_checks`
- 프로젝트 마감 -> `projects.due_at`
- 작업 마감 -> `tasks.due_at`
- 외부 회의 / 일정 -> `Work OS > Calendar` shared schedule

피해야 할 것:

- 모든 캘린더 이벤트를 task로 복제
- 개인 일정과 운영 cadence를 같은 lane에 혼합
- 연결 전에 `GOOGLE_REFRESH_TOKEN` 같은 수동 토큰 주입을 전제로 설계

### Samsung Calendar

Samsung Calendar는 허브에서 직접 web API로 다루기보다, 같은 Google Calendar를 기기에서 동기화하는 경로가 현실적이다.

권장 흐름:

1. 허브에서 Google Calendar 연결
2. 허브에서 일정 생성 / 수정
3. Galaxy 기기의 Samsung Calendar에서 같은 Google 계정 calendar sync 활성화

이 방식이면 허브, Google Calendar, Samsung Calendar가 같은 일정 원본을 공유하게 된다.

### Email

이 영역은 먼저 범위를 결정해야 한다.

가능한 두 갈래:

1. inbox sync
- Gmail/IMAP에서 메일을 읽어 `leads`, `cases`, follow-up 큐에 반영

2. outbound send
- 뉴스레터, 후속 메일, 운영 알림 발송

권장:

- 첫 단계는 outbound send 또는 inbox sync 중 하나만
- 둘 다 동시에 시작하지 않기

### Instagram API

`moon.classin`/Classmooni Instagram professional account를 Instagram API with Instagram Login으로 연결하는 lane이다.
Meta Dashboard의 `Instagram 앱 ID`와 `Instagram 앱 시크릿 코드`를 사용하며, Facebook Login 기반 Instagram Graph API와는 callback과 권한 흐름이 다르다.

현재 구현 범위:

- `GET /api/social/instagram/status` — env/config/connection 상태와 Meta Dashboard 입력 URL 확인
- `GET /api/social/instagram/connect` — Instagram OAuth authorization window로 이동
- `GET /api/social/instagram/callback` — code 교환, long-lived token 교환, `/me` profile 확인, `integration_connections` 저장
- `/legal/privacy`, `/legal/terms`, `/legal/data-deletion` — Meta Basic settings 입력용 고지 URL

기본 scope:

- `instagram_business_basic`
- `instagram_business_content_publish`

필요하면 env에서 `COM_MOON_INSTAGRAM_SCOPES`로 `instagram_business_manage_comments`, `instagram_business_manage_messages`, `instagram_business_manage_insights` 등을 추가한다. 추가 권한은 App Review 또는 Advanced Access가 필요할 수 있다.

필요한 Meta Dashboard 값:

- 앱 도메인: Hub 공개 URL의 host
- 개인정보처리방침 URL: `https://<hub-host>/legal/privacy`
- 서비스 약관 URL: `https://<hub-host>/legal/terms`
- 데이터 삭제 안내 URL: `https://<hub-host>/legal/data-deletion`
- OAuth redirect URI: `https://<hub-host>/api/social/instagram/callback`

주의:

- Instagram token exchange는 authorization URL에 넣은 `redirect_uri`와 callback handler가 사용하는 `redirect_uri`가 byte-for-byte로 같아야 한다.
- callback이 저장하는 토큰은 Supabase `integration_connections.config.accessToken`에 들어간다. 운영에서는 service role 보호와 RLS 정책을 유지한다.
- 연결 계정 username이 `COM_MOON_INSTAGRAM_BRAND_HANDLE`과 다르면 저장은 하되 `sync_runs.payload.profileVerified=false`로 남긴다.

### Meta Threads

`moon.classin` 브랜드 계정을 Threads API로 연결하는 lane이다. 부모 Facebook 앱 자격증명과 Threads 앱 자격증명이 동시에 보일 수 있으므로,
OAuth에는 Meta Dashboard의 `Threads 앱 ID`와 `Threads 앱 시크릿 코드`를 사용한다.

현재 구현 범위:

- `GET /api/social/meta/threads/status` — env/config/connection 상태와 Meta Dashboard 입력 URL 확인
- `GET /api/social/meta/threads/connect` — Threads OAuth authorization window로 이동
- `GET /api/social/meta/threads/callback` — code 교환, long-lived token 교환, 프로필 확인, `integration_connections` 저장
- `POST /api/social/meta/threads/deauthorize` — 앱 제거 callback `signed_request` 검증 후 연결 disable
- `POST /api/social/meta/threads/data-deletion` — 데이터 삭제 callback `signed_request` 검증 후 연결 disable 및 `confirmation_code` 응답
- `/legal/privacy`, `/legal/terms`, `/legal/data-deletion` — Meta Basic settings 입력용 고지 URL

필요한 Meta Dashboard 값:

- 앱 도메인: Hub 공개 URL의 host
- 개인정보처리방침 URL: `https://<hub-host>/legal/privacy`
- 서비스 약관 URL: `https://<hub-host>/legal/terms`
- 데이터 삭제 안내 URL: `https://<hub-host>/legal/data-deletion`
- OAuth redirect URI: `https://<hub-host>/api/social/meta/threads/callback`
- 제거 callback URL: `https://<hub-host>/api/social/meta/threads/deauthorize`
- 삭제 callback URL: `https://<hub-host>/api/social/meta/threads/data-deletion`

주의:

- app secret이 노출되면 Meta Dashboard에서 rotate 후 `.env.local`을 다시 설정한다.
- callback이 저장하는 토큰은 Supabase `integration_connections.config.accessToken`에 들어간다. 운영에서는 service role 보호와 RLS 정책을 유지한다.
- 연결 시 반환된 Threads username이 `COM_MOON_META_THREADS_BRAND_HANDLE`과 다르면 저장하지 않고 `account-mismatch`로 되돌린다.
- 제거/삭제 callback은 Meta `signed_request`를 Threads app secret으로 검증한다. app secret이 빠져 있으면 callback은 400을 반환한다.

### Slack

Slack은 소통 채널이지 원장이 아니다. 원장은 계속 Hub + Supabase여야 한다.

권장 1차 범위:

- `error_logs` 실패 알림
- `sync_runs` failure 알림
- approval 요청

나중에 추가:

- slash command
- interactive action
- two-way state mutation

## 기본 운영 체크리스트

새 provider를 붙일 때는 아래 순서를 지킨다.

1. provider 역할을 정의한다.
2. read-only인지 write-back인지 먼저 정한다.
3. `integration_connections` row를 만든다.
4. `field_mappings`를 문서화한다.
5. 첫 sync 또는 webhook smoke test를 만든다.
6. `sync_runs` 또는 `webhook_events`에 이력이 남는지 확인한다.
7. 실패 시 `error_logs`에서 원인을 찾을 수 있게 만든다.

## 지금 바로 해야 하는 것

- Supabase live env는 채워진 상태로 보고, connection check를 커밋 전/배포 후에 다시 실행
- Engine public URL 확정
- Hub/Engine shared secret 설정
- 외부 PM/agent 도구 1개를 `/api/webhook/project/openclaw` 또는 `/api/webhook/project/moltbot`에 연결
- Telegram webhook 등록
- GitHub read sync를 다음 Work OS source로 연결
- Calendar, Email, Notion은 그 다음 순서로 1개씩 연결

이 순서대로 가면 연결이 늘어나도 시스템이 무너지지 않는다.
