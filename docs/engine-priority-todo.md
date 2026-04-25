# Com_Moon Engine Priority Todo

이 문서는 `apps/engine`(실행/intake 레이어)이 "받는 → 정규화 → 실행 → 원장 기록" 역할을
완결성 있게 수행하도록 다듬기 위한 실행용 체크리스트다.

원칙:

- Engine은 UI를 소유하지 않는다. 화면이 필요해지면 Hub로 밀어낸다.
  (근거: `docs/master-directive.md` §4, `docs/engine-os-separation-ui-plan.md` §4 원칙 1)
- Hub의 액션은 "직접 실행"이 아니라 "의도 전달"이다. Engine은 그 의도를 받아 실제 실행과
  ledger 기록을 책임진다. (근거: `docs/engine-os-separation-ui-plan.md` §4 원칙 4)
- 카드뉴스 같은 업무 로직은 `packages/content-manager` 등 shared domain에 있고, Engine은
  이를 호출만 한다. Engine에 업무 로직을 복제하지 않는다.
- 우선순위는 보안/데이터 무결성 > 운영 루프 닫기 > 구조 정리 순서로 둔다.

## P0 — 보안·무결성 구멍을 먼저 막는다

### 1. Telegram webhook 시크릿 검증

상태:
- `todo`

문제:
- `apps/engine/app/api/webhook/telegram/route.ts`는 POST 바디를 그대로 `runTelegramUpdate`에 전달한다.
- 누구나 Engine URL을 알면 `/cardnews`, `/pms` 같은 명령을 위조해 찔러넣을 수 있다.

MVP:
- Telegram이 지원하는 `X-Telegram-Bot-Api-Secret-Token` 헤더를 검증한다.
- 시크릿 불일치 시 401을 반환하고 `error_logs`에 source=telegram으로 기록한다.
- `apps/engine/.env.example`에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`을 추가한다.

후속:
- Hub의 `Automations > Integrations`에 Telegram 연결 상태 배지 연동.

### 2. `POST /api/webhook/project` 기본 라우트 인증

상태:
- `done`

문제:
- `apps/engine/app/api/webhook/project/route.ts`는 시크릿 검사 없이 `handleProjectWebhook`을 호출한다.
- `[provider]` 변형은 `validateSharedWebhookRequest`로 `COM_MOON_SHARED_WEBHOOK_SECRET`을 확인하는데 기본 라우트만 뚫려 있다.

MVP:
- 기본 라우트에도 `validateSharedWebhookRequest`를 적용한다.
- 또는 기본 라우트를 deprecate하고 모든 project webhook을 `/api/webhook/project/:provider`로 통일한다.
- 선택에 맞춰 `health/route.ts`의 라우트 목록도 업데이트한다.

후속:
- Hub `server-write.js`에서 남아 있는 Engine 호출을 새 경로로 이관.

### 3. `runTelegramUpdate`의 `/webhooks` 분기 ledger 누락 수정

상태:
- `done`

문제:
- `apps/engine/lib/run.ts`의 `/webhooks` 명령 분기는 다른 명령과 달리 `persistEngineArtifacts`를 호출하지 않고 바로 return한다.
- `automation_runs`와 `webhook_events`에 구멍이 생긴다.

MVP:
- 해당 분기에 `persistEngineArtifacts({ status: "completed", ... })` 호출 추가.
- 다른 명령 분기와 동일한 순서(logEvent → persist → return)로 맞춘다.

후속:
- 11번(명령 dispatcher 리팩터)에서 이런 누락이 구조적으로 불가능하게 만든다.

### 4. `handleProjectWebhook` 실패 응답 정직화

상태:
- `done`

문제:
- `apps/engine/lib/project-webhook.ts`는 모든 Supabase 쓰기가 `{ persisted: false }`여도 최상위 응답은 `status: "accepted"` 고정이다.
- Hub나 외부 호출자가 "받았음"을 "기록됐음"으로 오해한다.

MVP:
- persistence 결과 중 하나라도 `persisted === false`면 `status: "partial"`(또는 `"degraded"`)로 응답한다.
- 완전 실패 시 `status: "failed"` + 5xx.
- 응답 바디의 `persistence` 필드는 유지해 Hub가 상세 사유를 볼 수 있게 한다.

후속:
- Hub `Automations > Runs`에서 partial 상태를 별도 칩으로 렌더.

### 5. 멱등성(idempotency)

상태:
- `shipped`

문제:
- Telegram은 5xx 시 업데이트를 재전송한다. `update_id` dedup 없음 → `/cardnews`가 중복 실행 가능.
- Project webhook은 동일 payload가 두 번 들어오면 `webhook_events` / `project_updates`가 두 번 insert된다.

MVP:
- `webhook_events`에 `(workspace_id, source, provider_event_id)` partial unique index 추가.
  - Telegram: `provider_event_id = telegram:{update_id}`
  - Project provider: `provider_event_id = {provider}:{eventId}` 또는 payload hash
- `insertSupabaseRecord`가 PostgREST `23505`/409를 `reason: "duplicate"`로 분류.
- 중복 감지 시 Engine 응답은 `status: "duplicate"` + 200.

후속:
- `automation_runs`에도 동일 전략 적용(재시도 dedup).

현재 반영:
- Project webhook은 `provider_event_id`/`correlation_id`를 채우고 기존 `webhook_events`를 조회해 duplicate 응답을 반환한다.
- Project webhook은 DB unique conflict도 duplicate로 해석해 `project_updates` 추가 insert를 건너뛴다.
- Telegram은 command 실행 전에 `update_id` 기반 `webhook_events` reservation을 먼저 생성하고, duplicate면 side effect 없이 ignored 응답을 반환한다.
- `supabase/migrations/20260425_0002_webhook_event_idempotency.sql`가 기존 중복 provider id를 suffix 처리한 뒤 partial unique index를 생성한다.

## P1 — 운영 루프를 실제로 닫는다

### 6. Telegram 사용자에게 결과 회신

상태:
- `done`

문제:
- `runTelegramUpdate`는 결과를 호출자(HTTP 응답)에만 돌려준다.
- Telegram 유저 입장에서는 봇이 침묵한다.
- `apps/engine/lib/telegram.ts`는 타입만 있고 Bot API 호출 함수가 없다.

MVP:
- `sendTelegramMessage(chatId, text)` 유틸을 `apps/engine/lib/telegram.ts`에 추가.
- 각 명령 성공/실패 시 원본 `chat.id`로 요약 문구를 발송한다.
- 실패 시에도 "처리 중 오류, runId=..." 메시지를 돌려준다.
- `TELEGRAM_BOT_TOKEN` env 사용.

후속:
- 카드뉴스 초안은 텍스트 대신 preview 링크(Hub `Content > Queue` 항목)로 회신.

### 7. Hub → Engine intent dispatch 엔드포인트

상태:
- `in_progress`

문제:
- 지금 Engine은 intake만 있고, Hub가 "이 카드뉴스 다시 만들어줘", "이 run 재시도해줘"를 보낼 엔드포인트가 없다.
- 결과적으로 `apps/hub/lib/server-write.js`가 Supabase에 직접 쓰고 있고, 이는
  `docs/engine-os-separation-ui-plan.md` §6에서 이미 지적된 경계 위반이다.

MVP:
- `POST /api/run/cardnews` — Hub `Content > Studio` handoff용. body에 topic, templateId, brandId.
- `POST /api/run/retry/:runId` — `Automations > Runs` 재시도 버튼용.
- `POST /api/run/routine/:checkType` — Command Center Smoke Test용(morning/midday/evening/weekly).
- 인증은 Hub에서만 호출되므로 서버 간 shared secret 또는 Supabase service key 재사용.

후속:
- 새 엔드포인트가 자리잡으면 `apps/hub/lib/server-write.js`에서 직접 쓰기 제거.

### 8. 정기 체크(cron) 진입점

상태:
- `todo`

문제:
- `routine_checks` 테이블과 `checkType` 정규화까지 있는데, 외부에서 수동으로 webhook을 쏴야 한다.
- 사실상 죽은 코드.

MVP:
- `POST /api/cron/:checkType` 라우트 추가(Vercel Cron 또는 외부 스케줄러 대상).
- 시크릿 헤더(`x-com-moon-cron-secret`)로 보호.
- 성공/실패 모두 `routine_checks` + `automation_runs`에 기록.

후속:
- Hub `Command Center > Smoke Test`에서 같은 엔드포인트를 수동으로 찌르는 버튼 추가.

### 9. `/cardnews` 명령이 운영 루프까지 닫게 만든다

상태:
- `todo`

문제:
- 현재 `apps/engine/lib/run.ts`의 `/cardnews` 분기는 `generateCardNews` 결과를 `logEvent`에 박고 끝난다.
- 결과물이 `content_items`(또는 content queue 테이블)에 들어가지 않아 Hub `Content > Queue`에 뜨지 않는다.
- 카드뉴스가 "만들었지만 어디에도 없는 상태"가 된다.

MVP:
- `generateCardNews` 결과를 받아 `content_items` insert(상태 `draft`).
- `automation_runs.output_payload`에 생성된 `content_item_id`를 포함.
- Telegram 회신 메시지에 Hub Queue 링크 포함(6번과 연동).

후속:
- Shared domain 쪽에서 템플릿/채널 규칙 확장(`docs/engine-os-separation-ui-plan.md` §14 P2).

현재 반영:
- `/cardnews` 생성 결과를 `content_items`와 `content_variants` draft로 저장하고 `automation_runs.output_payload`에 id를 포함한다.
- Telegram 원문 채팅으로 직접 회신하는 단계는 6번과 함께 남아 있다.

### 10. Provider adapter 슬롯 확장

상태:
- `todo`

문제:
- `SHARED_PROJECT_WEBHOOK_PROVIDERS`가 `openclaw`, `moltbot` 둘뿐이며 if문 분기로 하드코딩돼 있다.
- `docs/integration-inventory.md`가 GitHub, Notion, Linear 등을 상정한다면 확장이 번거롭다.

MVP:
- provider → normalizer/adapter 매핑을 맵(객체) 기반 레지스트리로 추출.
- 신규 provider 추가 시 한 파일만 건드리게 구조화.
- 각 adapter는 순수 함수(`buildSharedProjectWebhookPayload`와 동급)로 유지.

후속:
- GitHub/Notion/Linear adapter 순차 추가(실제 integration 작업과 함께).

## P2 — 구조 정리와 관측성 강화

### 11. `run.ts` 명령 dispatcher 리팩터

상태:
- `todo`

문제:
- 각 명령마다 `buildResponse → logEvent → persistEngineArtifacts → return` 보일러플레이트가 복붙돼 600줄 중 대부분이 중복이다.
- 3번 같은 누락 버그가 구조적으로 쉽게 재발한다.

MVP:
- `Record<string, CommandHandler>` 형태의 dispatcher로 분리.
- 로깅/persist/에러 처리를 공통 wrapper 한 곳에 둔다.
- 명령별 파일 분리(`lib/commands/cardnews.ts` 등)는 선택.

후속:
- `/help` 명령 등 신규 명령 추가가 한 줄로 가능해지면 12번을 함께 처리.

### 12. `/help` 명령 추가

상태:
- `todo`

문제:
- `health/route.ts`는 명령 목록을 JSON으로 노출하지만 Telegram 유저가 쓸 수 있는 `/help`가 없다.

MVP:
- `/help`가 현재 지원 명령과 예시 인자를 Telegram 메시지로 회신.
- 명령 목록은 dispatcher에서 자동 생성(11번과 연동).

후속:
- 명령별 짧은 사용법(`/cardnews <topic>` 같은)도 dispatcher 메타데이터로 편입.

### 13. Supabase insert에서 실제 응답 받기 + 5xx 재시도

상태:
- `todo`

문제:
- `apps/engine/lib/supabase-rest.ts`의 `insertSupabaseRecord`는 `prefer: "return=minimal"`이라 서버 응답 row를 못 받는다.
- Engine이 본인이 만든 UUID를 "가정"하고 반환한다.
- 5xx 재시도가 없어 일시 장애에도 바로 실패 처리된다.

MVP:
- `prefer`를 `"return=representation"`으로 바꾸고, 반환된 row로 응답 구성.
- 5xx/네트워크 오류에 한해 1회 재시도(간단한 지수 백오프).
- 4xx는 재시도하지 않는다(재시도해도 결과 동일).

후속:
- 재시도 시도 자체를 `error_logs`에 info 레벨로 남겨 관측 가능하게.

### 14. `fetchSupabaseRows` / `countSupabaseRows` 실패 구분

상태:
- `todo`

문제:
- 두 함수 모두 네트워크 오류를 `null`로 삼켜서 "값 없음"과 구분되지 않는다.
- `/projects` 명령이 DB 장애 시에도 "still waiting for live records"를 출력한다.

MVP:
- 실패 시 throw(또는 `{ ok: false, reason }` 결과 객체 반환).
- 상위 호출자(`buildProjectsCommandResponse` 등)에서 try/catch 후 Telegram 회신과 `error_logs`에 반영.

후속:
- Hub `Overview` 카드에서 "Engine 읽기 실패" 상태를 구분해 보여줌.

### 15. `automation_runs`와 `webhook_events` 상관관계

상태:
- `todo`

문제:
- `persistEngineArtifacts`가 `automation_runs.id = runId`는 넣지만 `webhook_events` 쪽에는 `runId`를 넣지 않는다.
- Hub `Automations > Runs` 상세에서 해당 run의 원본 webhook을 역추적할 수 없다.

MVP:
- `webhook_events.run_id`(또는 `automation_runs.webhook_event_id`) 컬럼 추가.
- `persistEngineArtifacts`가 한 방향을 채우도록 수정.
- 기존 row는 마이그레이션 없이 신규 row부터 적용.

후속:
- Hub Runs 상세 UI에 "관련 webhook event" 링크 노출.

### 16. Health 라우트 실제 DB 도달성 체크

상태:
- `todo`

문제:
- `apps/engine/app/api/health/route.ts`는 하드코딩된 라우트 목록만 반환한다.
- "엔진 HTTP 살아있음"과 "엔진이 Supabase에 쓸 수 있음"은 다른 상태다.

MVP:
- Supabase에 가벼운 read(예: `select=id&limit=1`)를 실행해 reachable 여부를 응답에 포함.
- 실패 시 `status: "degraded"` + 해당 섹션만 `false`.

후속:
- Hub `Automations > Webhooks` 탭이 이 응답을 그대로 배지로 렌더.

### 17. 엔진 단위 테스트 도입

상태:
- `todo`

문제:
- `apps/engine`에 테스트가 하나도 없다.
- partner별로 payload 형태가 달라 `buildSharedProjectWebhookPayload` 회귀 위험이 가장 크다.

MVP:
- vitest 도입.
- 최소 커버리지: `project-webhook.ts`의 `normalizeStatus`, `normalizeRoutineStatus`, `normalizeCheckType`, `clampProgress`, `shared-webhook.ts`의 `buildSharedProjectWebhookPayload`.
- fixture는 각 provider별 실제 payload 예시 1개 이상.

후속:
- `runTelegramUpdate` 계약 테스트(Supabase/Telegram 호출은 mock 대신 인터페이스 주입).

### 18. `.env.example` 현실 반영

상태:
- `todo`

문제:
- 현재 `.env.example`에 Telegram 관련 변수와 cron/intent dispatch 관련 변수가 빠져 있다.

MVP:
- 아래 항목을 추가(기본값은 주석으로 설명):
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `COM_MOON_ENGINE_BASE_URL`(Hub가 intent dispatch할 때 쓸 대상 URL)
  - `COM_MOON_CRON_SECRET`(8번 cron 진입점 보호용)
- provider별 secret이 갈라지면 해당 슬롯도 추가.

후속:
- `docs/integration-inventory.md`의 connector secret 목록과 이 파일을 단일 소스로 수렴.

## 권장 실행 순서

1. **보안/버그 먼저**: 1 → 2 → 3 → 4 → 5
2. **운영 루프 닫기**: 6 → 9 → 7 → 8 → 10
3. **구조 정리/관측성**: 13 → 14 → 15 → 16 → 11 → 12 → 17 → 18

1~5는 실제 데이터 오염과 무단 실행 가능성이 있는 항목이라 가장 먼저 손본다.
6~10은 "Engine = 실행/intake, Hub = 운영/판단" 원칙을 실제 코드 흐름으로 닫는 작업이며,
이게 끝나야 `apps/hub/lib/server-write.js`의 경계 정리도 같이 가능해진다.
11 이후는 리팩터와 관측성 작업이라 언제 해도 되지만, 명령이 늘어나기 전에 11을 먼저 하면
이후 작업이 전부 가벼워진다.
