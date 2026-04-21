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
| 8 | Notion read sync | 프로젝트/태스크/결정/노트 지식 소스 흡수 | P1 | High | Projects DB, Tasks DB read-only sync와 field mapping이 확정됨 |
| 9 | Slack failure alert | 실패 알림과 approval 요청 채널 | P2 | Mid | `error_logs`, `sync_runs` failure가 지정 채널로 알림됨 |

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

관련 코드:

- `apps/engine/app/api/health/route.ts`
- `apps/engine/app/api/webhook/telegram/route.ts`
- `apps/engine/app/api/webhook/project/route.ts`

### 현재 허브에서 이미 볼 수 있는 운영 화면

- `Automations > Webhooks`
- `Automations > Integrations`
- `Work OS > Projects`
- `Work OS > Rhythm`

## 연결 카탈로그

| Provider | 역할 | 연결 방식 | 현재 상태 | 내부 연결 지점 | 필요한 것 | 다음 액션 |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase | 시스템 원장, 로그, 프로젝트, task, sync 상태 저장 | REST + DB | Implemented | Hub, Engine, `packages/hub-gateway` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 또는 `SUPABASE_ANON_KEY`, `COM_MOON_DEFAULT_WORKSPACE_ID` | 실제 workspace 기준으로 env 채우고 live 데이터 연결 |
| Telegram | 인바운드 명령, 빠른 운영 입력 | Webhook intake | Ready | `/api/webhook/telegram`, `automation_runs`, `webhook_events` | 공개 Engine URL, Telegram bot webhook 등록 | 봇 webhook를 engine URL에 연결하고 smoke test 실행 |
| Project tools | 외부 PM/진행률 도구에서 progress/PMS 이벤트 수집 | Generic webhook | Ready | `/api/webhook/project`, `project_updates`, `routine_checks`, `projects` | 공개 Engine URL, 공급자 payload mapping | 먼저 하나의 PM 도구 payload를 webhook contract에 맞춤 |
| OpenClaw | 외부 agent workflow에서 프로젝트/운영 이벤트 전달 | Shared webhook alias | Ready | `/api/webhook/project/openclaw`, `project_updates`, `webhook_events` | 공개 Engine URL, `COM_MOON_SHARED_WEBHOOK_SECRET` 권장, payload field mapping | OpenClaw outbound webhook를 alias route에 연결하고 첫 smoke test 실행 |
| Moltbot | bot/operator workflow에서 PMS 또는 project 이벤트 전달 | Shared webhook alias | Ready | `/api/webhook/project/moltbot`, `project_updates`, `routine_checks`, `webhook_events` | 공개 Engine URL, `COM_MOON_SHARED_WEBHOOK_SECRET` 권장, payload field mapping | Moltbot payload를 alias route에 보내고 routine or progress event를 확인 |
| GitHub | 작업 히스토리, PR 리뷰 상태, 이슈 압력, milestone 기반 로드맵 | API read / sync | Ready | `Work OS > PMS`, `Work OS > Roadmap`, `integration_connections`, `sync_runs` | `GITHUB_TOKEN`, `GITHUB_REPOSITORIES` | 메인 repo부터 연결해서 PR/issue/milestone이 PMS와 로드맵에 보이게 만들기 |
| Notion | 프로젝트, task, 의사결정, 노트, 문서 허브화 | API sync | Planned | `integration_connections`, `field_mappings`, `sync_runs` | `NOTION_TOKEN`, database IDs | projects/tasks 2개 DB부터 매핑 설계 |
| Google Calendar | 일정, 마감일, cadence 블록 연결 | OAuth + sync + event write | Ready | `Work OS > Calendar`, `routine_checks`, `projects.due_at`, `tasks.due_at`, `sync_runs` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID` | Google OAuth env를 채우고 Work OS > Calendar에서 연결 후 실제 캘린더를 하나 붙이기 |
| Samsung Calendar | Galaxy 기기 일정 가시성 | Google account sync on device | Supported via Google sync | `Work OS > Calendar` | Google Calendar 연결, Samsung Calendar 앱에서 같은 Google 계정 sync | 허브에서는 Google Calendar를 source로 연결하고, Galaxy 기기에서는 그 캘린더를 표시 |
| Email | 리드 follow-up, 인바운드 메일, 캠페인/알림 발송 | Inbox sync + send provider | Planned | `leads`, `campaigns`, `campaign_runs`, `sync_runs` | Gmail API 또는 IMAP 선택, SMTP/Resend/Postmark 등 발송 provider 선택 | inbox sync와 outbound send 중 1차 범위를 먼저 결정 |
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

현재 구현 범위:

- Google OAuth 연결
- `Work OS > Calendar` 안에서 외부 Google 일정 읽기
- 허브에서 Google 일정 생성 / 수정
- sync 이력 `integration_connections`, `sync_runs` 기록

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
