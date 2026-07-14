# Integration Control Plane 상속 계약

> 상태: ACTIVE INHERITANCE CONTRACT
>
> 검증 기준: 2026-07-15 KST 로컬 실행 상태와 현재 코드
>
> 목적: OAuth, webhook, OpenClaw, MCP, 로컬 서비스 후속 작업이 이미 확보한 경계와 정직한 상태 표현을 깨지 않게 한다.

이 문서는 새 통합을 설계하는 문서가 아니다. 아래 두 문서와 실제 로컬 검증 결과에서, 앞으로 반드시 보존해야 할 계약만 모은다.

- [Integration Control Plane Cleanup Plan](superpowers/plans/2026-07-15-integration-control-plane-cleanup.md)
- [Integration Inventory](integration-inventory.md)

시크릿 값, OAuth 토큰, 계정 이메일, 비공개 캘린더 URL은 이 문서와 로그에 남기지 않는다.

## 확정

### 1. 실행 경계

```mermaid
flowchart LR
  Operator["Operator / Codex / Claude"] --> Hub["Hub :3000\nreads + guarded local writes"]
  Hub --> Ledger["Supabase operational ledger"]
  Hub --> Engine["Engine :3001\nintake + execution records"]
  Engine --> Ledger
  Engine --> Relay["Local OpenClaw relay :4317"]
  Relay --> OpenClaw["OpenClaw gateway / CLI"]
  OpenClaw --> Webhook["Engine project webhook"]
  Webhook --> Ledger
  Ledger --> Hub
```

- **Hub**는 운영자 read surface와 승인된 로컬 write surface다. 외부 실행을 직접 가장하지 않고 Engine에 전달하며, 미연결 상태에서는 `preview` 또는 명시적 오류를 반환한다.
- **Engine**은 외부 webhook intake, OpenClaw outbound sync, PMS command validation·persistence, 실행·수신 이력을 맡는다. `webhook_events`, `project_updates`, `sync_runs`와 재조회된 durable project/task가 실행 증거다.
- **OpenClaw relay**는 로컬 transport adapter다. Engine snapshot을 OpenClaw CLI로 넘길 뿐 원장이 아니며, 독자적으로 프로젝트 상태를 확정하지 않는다.
- **Supabase**가 공유 운영 원장이다. OpenClaw가 만든 진행 정보도 Engine webhook을 거쳐 원장에 기록된 뒤 Hub가 읽는다.
- OpenClaw의 반환 경로는 `POST /api/webhook/project/openclaw`이다. Hub나 relay에 별도 반환 원장을 만들지 않는다.

### 2. 네 시크릿의 책임 분리

| 환경변수 | 한 가지 책임 | 공유 범위 |
|---|---|---|
| `COM_MOON_OAUTH_STATE_SECRET` | OAuth state 서명·검증 | Hub OAuth 코드만 |
| `COM_MOON_HUB_WRITE_SECRET` | Hub write route와 MCP write tool 보호 | Hub와 해당 로컬 MCP 프로세스 |
| `COM_MOON_SHARED_WEBHOOK_SECRET` | Hub↔Engine 호출 및 Engine inbound webhook 인증 | Hub와 Engine에서만 같은 값 |
| `OPENCLAW_SYNC_SECRET` | Engine→OpenClaw relay 요청 인증 | Engine과 relay |

- 네 값은 모두 별도 생성한다. 한 시크릿이 없을 때 다른 시크릿으로 fallback하지 않는다.
- 동일해야 하는 것은 Hub와 Engine이 사용하는 `COM_MOON_SHARED_WEBHOOK_SECRET` 한 쌍뿐이다.
- 원격 production Hub write는 `COM_MOON_HUB_WRITE_SECRET`를 요구한다. 로컬 production browser는 secret을 노출하지 않고 loopback(`localhost`, `127.0.0.1`, `::1`) same-origin 요청만 허용한다.
- readiness에는 설정 여부와 책임 간 중복 여부만 노출한다. 값이나 복원 가능한 fingerprint는 노출하지 않는다.
- 2026-07-15 로컬 확인에서는 네 시크릿이 모두 설정되어 있고 책임별 값이 분리되어 있었다. Hub와 Engine의 shared webhook 값도 일치했다.

### 3. Google provider와 캘린더 위상

- Google OAuth는 `GOOGLE_OAUTH_ENABLED_PROVIDERS`의 명시적 allowlist를 통과한 provider만 configured로 본다.
- 현재 로컬 allowlist는 **Calendar만 활성화**한다. Gmail과 Sheets는 같은 OAuth client ID가 있더라도 callback URI와 scope를 각각 검증하기 전까지 disabled다.
- Moonlight Hub가 읽고 쓰는 **회사/ClassIn Calendar**와 Codex의 별도 connector가 보는 **개인 Calendar**는 서로 다른 연결이다. 계정, source, 결과를 합치거나 같은 인증 상태로 추론하지 않는다.
- Calendar 응답은 `source: "oauth" | "ical"`과 `readOnly`를 보존한다. UI, MCP, 후속 API도 이 구분을 지우지 않는다.
- iCal은 OAuth connection 또는 access token이 없을 때만 쓰는 읽기 전용 fallback이다. OAuth API 오류를 iCal 성공으로 가리지 않으며 OAuth 결과와 iCal 결과를 한 응답에 merge하지 않는다.
- iCal fetch는 HTTPS Google Calendar feed, bounded time window, 크기 제한, `no-store` 조건을 유지한다. 비공개 feed URL은 응답·로그·문서에 포함하지 않는다.
- 2026-07-15 로컬 bounded read는 회사 Calendar에서 `status=live`, `source=oauth`, `readOnly=false`로 성공했다. iCal도 설정되어 있지만 이 성공 경로에서는 사용되지 않았다.

### 4. 로컬 상시 서비스

| launchd label | 역할 | 로컬 포트 | 2026-07-15 확인 |
|---|---|---:|---|
| `com.moonlight.engine` | Engine Next.js API | 3001 | plist 존재, `RunAtLoad`/`KeepAlive`, running |
| `com.moonlight.openclaw-relay` | Engine snapshot→OpenClaw CLI relay | 4317 | plist 존재, `RunAtLoad`/`KeepAlive`, running |

- plist는 `~/Library/LaunchAgents`의 local-only 운영 파일이다. 저장소에 시크릿을 복사하지 않는다.
- 확인된 plist의 `EnvironmentVariables`에는 시크릿 값이 직접 들어 있지 않았다. Engine은 app-local env 로딩 경계를, relay는 local env file 로딩 경계를 유지한다.
- Hub, Engine, relay, OpenClaw gateway는 각각 독립적으로 probe한다. 하나의 URL 설정 여부로 다른 서비스의 생존을 추론하지 않는다.
- 2026-07-15 확인 시 Hub `200/ok`, Engine `200/ok`, relay `200/ok`, OpenClaw gateway HTTP 200이었다. Hub는 Engine과 relay를 각각 `configured=true`, `reachable=true`, `status=live`로 보고했다.

### 5. webhook 인증과 멱등성

- Generic project route와 provider alias route는 `COM_MOON_SHARED_WEBHOOK_SECRET`를 header 또는 Bearer token으로 검증한다.
- 시크릿이 없으면 기본은 거부다. 인증 없는 webhook은 non-production에서 `COM_MOON_ALLOW_OPEN_WEBHOOKS=true`를 명시한 로컬 smoke 환경에만 허용한다.
- 멱등성 우선순위는 provider event ID, `Idempotency-Key`, stable payload digest다. 최종 `provider_event_id`는 source와 함께 정규화한다.
- DB는 `(workspace_id, source, provider_event_id)` unique index를 유지한다. 중복 이벤트는 새 `project_updates`를 만들지 않고 `status=duplicate`로 응답한다.
- 결과 상태 `accepted`, `partial`, `duplicate`, `failed`를 하나의 성공 상태로 뭉개지 않는다.
- 내부 PMS command는 `POST /api/pms/command`에서 shared secret을 검증한다. create는 client-generated UUID 재시도 시 기존 entity를 반환하고, update는 항상 `id + workspace_id` filter를 사용한다.

### 6. Codex/Claude 로컬 MCP

- Moonlight MCP는 **stdio 전용 로컬 child process**다. 원격 HTTP/SSE connector가 아니다.
- Codex local config와 Claude Code project `.mcp.json`은 모두 같은 `packages/mcp-server/src/index.js`를 실행하며 Hub의 `.env.local`을 process start 시 읽는다.
- 두 등록 모두 환경변수 값을 config에 직접 embed하지 않는다. `.mcp.json`은 local-only이며 Git에 포함하지 않는다.
- read tool은 Hub route의 `live`/`preview`/`error` 의미를 그대로 전달한다. write tool은 `COM_MOON_HUB_WRITE_SECRET`가 없으면 요청 전에 거부한다.
- 현재 등록 surface에는 projects, tasks, task creation, revenue, content queue, calendar, work orders, agents, daily brief가 포함된다.

### 7. 상태 언어

통합 상태는 아래 축을 섞지 않는다.

| 축 | 의미 | 증거 |
|---|---|---|
| `configured` | 필요한 URL·키·provider enable flag가 존재 | 설정 검사 |
| `reachable` | bounded network probe가 현재 성공 | health probe 시각과 결과 |
| `authenticated` | provider가 자격증명을 실제로 받아 요청을 처리 | 성공한 provider API call 또는 검증된 connection |
| `snapshot` | 특정 시각에 가져온 사본 | source, imported/synced timestamp, row count |

- `configured=true`는 `reachable=true`나 `authenticated=true`를 뜻하지 않는다.
- optional integration이 unreachable이면 Hub 전체를 실패로 만들지 않고 그 integration만 `degraded`로 표시한다.
- live, degraded, disabled, preview, snapshot을 구분한다. stale snapshot을 live connection처럼 표시하지 않는다.
- 가능하면 `account`는 redacted label로, 성공 이력은 `lastSuccessfulSyncAt`로 노출한다. 값이 없으면 추정하지 않고 `unknown` 또는 `null`로 둔다.

### 8. 2026-07-15 로컬 증거 스냅샷

| 항목 | 확인 결과 |
|---|---|
| Hub/Supabase | Hub 200/ok, Supabase reachable |
| Engine/OpenClaw | Engine, relay, gateway reachable; relay는 sync mode |
| Secret topology | 4/4 configured, separated; Hub↔Engine shared secret match |
| Google gate | Calendar enabled/configured, Gmail·Sheets disabled |
| Calendar auth | 2026-07-15~07-31 bounded OAuth read 성공, 11 events, writable source, redacted primary identity 저장 |
| iCal | configured, 현재 OAuth 성공 때문에 fallback 미사용 |
| MCP | Codex live read 성공, Claude project/Desktop config에 process-based stdio 등록. Claude Desktop은 앱 재시작 후 로딩 확인 필요 |
| PMS write | Hub BFF→Engine command→Supabase create/update/read-back 성공. 임시 project/task 삭제 후 기존 4 project·6 task 복구 |
| eeoCRM-derived ledger | Supabase 총 119 leads 중 117 eeoCRM snapshot, 문준혁 exact-owner 16건; live eeoCRM 연결 증거는 아님 |
| Credential hygiene | 동일 해시 Downloads 복사본 2개 격리, retained client files `0600` |
| OpenClaw cron | Telegram announce 경로와 실패 알림 설정 완료, 수정 후 첫 scheduled delivery는 아직 미실행 |
| 계약 테스트 | readiness, Hub write guard, PMS command/idempotency, iCal fallback, MCP, webhook contract 전체 통과 |

## 주의

- 계획 문서의 “signed webhook”은 현재 구현에서 shared-secret-authenticated request를 뜻한다. 현재 계약은 request body HMAC signature가 아니다. HMAC/재전송 방지 timestamp가 필요하다면 별도 계약으로 설계해야 한다.
- relay의 HTTP 성공은 relay가 요청을 수락·처리했다는 뜻이다. 비동기 모드를 다시 사용할 경우 OpenClaw child process의 최종 성공과 최초 queue 수락을 분리 기록해야 한다.
- launchd가 현재 running이라는 사실은 실제 재부팅 후 자동 복구 smoke를 대신하지 않는다. plist 변경 뒤에는 `kickstart`와 재부팅 후 probe를 각각 남긴다.
- Hub health는 현재 configured/reachable를 잘 분리하지만 모든 provider에 `authenticated`, redacted `account`, `lastSuccessfulSyncAt`를 일관되게 제공하지는 않는다. 후속 작업은 configured만 보고 “연결 완료”라고 쓰지 않는다.
- Calendar의 회사/개인 구분은 연결 경계다. 일정 제목·참석자·개인 계정 이메일을 readiness나 공용 로그에 넣지 않는다.
- MCP write는 로컬 프로세스라는 이유만으로 무인 승인하지 않는다. Hub write guard와 tool-level write-secret check를 모두 유지한다.
- eeoCRM 숫자는 변할 수 있는 ledger snapshot이다. 문서의 row count는 검증 날짜와 함께 쓰고, Mac에서 provider 인증이 확인되기 전까지 “sync”나 “MCP live”라고 부르지 않는다.
- OpenClaw/Telegram/Slack처럼 여러 outbound channel이 가능한 경우 channel이 생략된 요청을 임의 채널로 보내지 않는다. 명시적 routing policy가 없으면 disabled 또는 preview가 맞다.

## 미정 및 외부 blocker

| 항목 | 현재 미정/차단 이유 | 완료 증거 |
|---|---|---|
| Production Google callback | 공개 Hub host와 HTTPS callback 등록·배포 secret 주입이 아직 외부 설정에 의존 | production callback에서 OAuth code exchange 후 provider API read 성공 |
| Gmail/Sheets OAuth | provider별 callback URI, scope, consent가 end-to-end 검증되지 않음 | 각 provider를 allowlist에 따로 켜고 authenticated probe 성공 |
| eeoCRM Mac live connection | Mac-compatible MCP binary 또는 service OAuth credential이 없음 | read-only 인증 성공, source identity와 sync timestamp 확인 후에만 write 검토 |
| OpenClaw broad channel policy | multi-channel 환경의 기본 채널, 허용 대상, 실패 fallback 정책이 확정되지 않음 | channel allowlist와 명시적 routing/failure policy 승인 |
| Google Cloud IAM | 이전 감사의 두 Owner, 미사용 Editor/service account, broad API key 상태를 이번 세션에서 live 재확인하지 못함 (`gcloud`와 로그인된 Console 부재) | 로그인된 audit-log·runtime reference 검토와 명시적 owner/role 결정 |
| Public Engine exposure | 외부 provider가 호출할 production Engine URL과 배포 경계가 확정되지 않음 | 공개 health, shared-secret webhook, 중복 event smoke를 production에서 확인 |

IAM 변경은 문서 정리의 부수 작업으로 실행하지 않는다. Owner 제거, service account role 변경, API key restriction은 사용 흔적과 복구 경로를 확인한 뒤 별도 승인으로 수행한다.

## 후속 작업 체크리스트

- [ ] Hub/Engine/relay/Supabase 역할을 바꾸지 않았는가?
- [ ] 네 시크릿이 책임별로 분리되고 문서·로그·config에 값이 노출되지 않았는가?
- [ ] Google provider가 allowlist, callback, scope별로 독립 검증되는가?
- [ ] 회사 Calendar와 개인 Calendar의 account/source가 섞이지 않는가?
- [ ] iCal이 읽기 전용 fallback이며 OAuth 오류를 가리지 않는가?
- [ ] launchd 변경 뒤 service별 bounded probe와 restart 증거가 있는가?
- [ ] webhook 인증, `Idempotency-Key`, provider event ID, unique index가 함께 유지되는가?
- [ ] MCP가 stdio local adapter로 남고 write-secret 없이 쓰기를 수행하지 않는가?
- [ ] configured, reachable, authenticated, snapshot을 각각의 증거로 표시하는가?
- [ ] 외부 blocker를 구현 완료처럼 표시하지 않았는가?
