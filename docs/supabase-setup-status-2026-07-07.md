# Supabase 셋업 상태 — 2026-07-07

프로젝트 `rwqefdxalmbrkybxqwxj` (기존 prod). Management API + PAT(`SUPABASE_ACCESS_TOKEN`)로 마이그레이션 적용. Hub/Engine 둘 다 같은 프로젝트를 바라봄.

## 0. OpenClaw 통합 제거 (2026-07-07 추가 작업)

사용자 요청으로 미설정 상태였던 OpenClaw 연동을 코드에서 전부 제거(우선순위상 보류, 필요 시 git 히스토리에서 복원 가능).

**삭제한 파일(독립적, 다른 곳에서 참조 없었음):**
- `apps/engine/app/api/integrations/openclaw/sync/route.ts`
- `apps/hub/app/api/integrations/openclaw/sync/route.js`
- `apps/engine/lib/openclaw-sync.ts`
- `scripts/openclaw-local-relay.mjs`

**목록에서 항목만 제거** (moltbot 등 다른 provider는 그대로 유지):
- `apps/engine/lib/shared-webhook.ts` — `SHARED_PROJECT_WEBHOOK_PROVIDERS`에서 `"openclaw"` 제거
- `apps/hub/lib/server-write.js` — `PROJECT_WEBHOOK_TARGETS`에서 `"openclaw"` 제거 (2곳)
- `apps/engine/app/api/webhook/project/route.ts` — `sharedProviderRoutes` 목록에서 제거
- `apps/engine/app/api/health/route.ts`, `apps/hub/app/api/health/route.js` — OpenClaw 상태 필드·라우트 항목 제거
- `scripts/check-connections.mjs` — `checkOpenClawIntegration` 함수·호출 제거 (WARN 4개 소거)
- `scripts/inventory-project-connections.mjs`, `package.json`(`openclaw:relay` 스크립트), `.env.example` 3곳, `apps/engine/.env.local`(주석 블록) 정리

**의도적으로 안 건드림:** `docs/*.md`, `docs/projects-connection-payloads.json`, `supabase/setup/03_seed_dev_workspace.sql`, `supabase/setup/README.md` — 역사적 기록/DB 셋업 팩이라 이번 스코프 밖.

**검증:** 코드 전체에서 `openclaw` 참조 0건(문서·SQL 제외) 확인. `apps/engine`·`apps/hub` typecheck 통과(exit 0, 단 hub엔 typecheck 스크립트 자체가 없음 — 기존 상태, 이번 변경과 무관). Engine 재시작 후 `curl /api/health` 실응답에서 `openclaw` 필드 완전히 사라짐 확인. `check:connections` 재실행: OpenClaw WARN 4개 소거, critical 체크 전부 유지 PASS. 라우트 수 감소도 일치(Hub 11→10, Engine 9→7).

## 1. 완료한 작업

### 환경 변수 (.env.local)
- `apps/hub/.env.local` — `SUPABASE_ACCESS_TOKEN`(Management API PAT) 추가. `scripts/apply-migrations.mjs`가 이 값으로 DDL 실행.
- `.env.local` (루트, 신규 생성) — 루트 스크립트(`apply-migrations`, `check-connections`)가 먼저 읽는 공통 베이스. `SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY / ACCESS_TOKEN / COM_MOON_DEFAULT_WORKSPACE_ID`를 `apps/hub/.env.local`에서 미러. 앱별 `.env.local`이 이를 override.
- 세 파일 모두 `.gitignore`의 `.env.*` 규칙으로 커밋 제외 확인.

### 마이그레이션 — 19/19 적용 완료 (멱등)
`supabase/migrations/` 전체를 날짜순 적용. 적용 전 파괴적 구문(DROP TABLE/TRUNCATE/DELETE) 없음 확인.

```
0001 supabase_first_foundation          0011 work_orders_agent_runs
0002 webhook_event_idempotency          0012 work_orders_execution_claim
0003 content_os_variant_contract        0013 eeocrm_source
0004 canonical_brand_directory          0014 crm_activities            ← 신규
0003 content_variant_type_contract      0015 lead_intake_gmail_source  ← 신규
0004 live_setup_contracts               0016 campaigns_meta            ← 신규
0005 sales_os_sheets_sync               0017 work_orders_open_followup_unique ← 신규
0006 crm_xiaoshouyi_owner_names
0007 content_idea_cadence
0008 outreach_outcomes
0009 business_card_source
0010 agents_personas_inbox
```

> ⚠️ 주의: 첫 적용 시 워킹트리엔 0013까지 15개만 있었고, 세션 중 동시 작업으로 0014~0017(오늘 날짜)이 추가됨. codex 교차검토가 "15개보다 많다"고 잡아내 4개를 추가 적용함. **schema_migrations 추적 테이블이 없어 "전부"의 기준이 argv에만 의존** → 아래 해야 할 것 참고.

### 데이터 정리 (prod 변경 1건)
- 마이그레이션 0017(deal당 open followup 1개 유니크 인덱스)이 중복 데이터로 FAIL.
- deal `7777…771`에 **동일한** followup work_order 2건(둘 다 `proposed`, persona guru, 137ms 차이 — 0017이 막으려던 바로 그 race의 산물).
- 나중 것(`3e09c536…`)을 **`dismissed`로 변경**(삭제 아님, `decided_at` 스탬프), 먼저 것(`e6fc26a2…`) 활성 유지. 이후 0017 재적용 OK.
- **복구 방법**: `update work_orders set status='proposed', decided_at=null where id='3e09c536-c784-4291-b5d9-baeb34d171a0'` (단, 그러면 유니크 인덱스 위반이므로 인덱스를 먼저 drop해야 함).

### 검증 결과
- 필수 테이블 24/24 + 신규 `crm_activities` 존재
- `content_variants.variant_type` CHECK: `blog_insight/x_thread/reels_script/card_news/newsletter` 포함
- `webhook_events` 멱등 유니크 인덱스 존재
- `lead_intake_raw.source` CHECK: `business_card/inbox/eeocrm/gmail` 허용
- `uq_work_orders_open_followup` 부분 유니크 인덱스 존재
- 스토리지 버킷 `moonlight-content-assets`(private) + `moonlight-public`(public) 존재
- 원장: workspace 1, projects 4, brands 9, agents 6, leads 2, work_orders 15
- `npm run check:connections`: Hub/Engine Supabase REST 도달, workspace ID 일치

## 2. 기타 필요한 것 (상태별)

| 항목 | 상태 | 비고 |
|---|---|---|
| Supabase 스키마/마이그레이션 | ✅ 완료 | 19/19 |
| 스토리지 버킷 | ✅ 이미 존재 | `setup/01_storage.sql` 재적용 불필요 |
| Hub/Engine → Supabase 연결 | ✅ 정상 | service-role REST |
| 루트/앱 `.env.local` | ✅ 구성 | PAT·인프라 키 |
| RLS 정책 | ⏸ 의도적 보류 | `setup/02_rls_policies.sql` — Auth+`workspace_memberships` 준비 후 |
| Engine dev 서버 | ✅ 기동 | `.claude/launch.json`에 `engine-dev`(3001) 추가. `check:connections` 전 critical PASS |
| Gemini 키 | ✅ 완료 | 사용자가 발급한 키를 hub·engine `.env.local`에 배치, 실 API 호출로 검증(`models reachable`) |
| OpenClaw / Hub GITHUB_REPOSITORIES | ⚠️ 미설정 | 선택 통합, 이번 스코프 아님(요청 시 진행) |

## 3. 해야 할 것 (우선순위)

**P0 — 지금 막힌 것**
1. ~~Engine dev 서버 기동~~ ✅ **완료** — `.claude/launch.json`에 `engine-dev` 추가, 기동 후 `check:connections` 전 critical PASS. (Hub→Engine `/api/health` 9 routes 도달)
2. ~~Gemini API 키 채우기~~ ✅ **완료** — 사용자가 Google AI Studio 키를 발급해 전달. **주의**: 최초엔 루트 `.env.local`에 `GEMINI_KEY`(잘못된 이름)로 저장돼 코드가 못 읽는 상태였음. 코드가 실제로 읽는 이름은 `GEMINI_API_KEY`(`apps/hub/lib/google-vision.js`, `apps/engine/lib/gemini.ts` 둘 다 앱별로 독립적으로 읽음 — 루트 `.env.local`은 Next.js가 자동으로 안 읽고 내 node 스크립트만 읽음). `GEMINI_API_KEY`로 정정해 hub·engine `.env.local` 양쪽에 배치, engine dev 서버 재시작(Next.js는 env 변경 시 hot-reload 안 됨) 후 `check:connections`에서 실 API 호출로 검증: `[PASS] Hub/Engine Gemini integration: models reachable; default model gemini-3.5-flash`.
   - ⚠️ 남은 걸림돌: hub의 기존 `GOOGLE_API_KEY`(Sheets/Maps용으로 별도 존재)는 Gemini API 테스트 시 **400 API_KEY_INVALID**였음 — 이번에 채운 `GEMINI_API_KEY`와는 다른 키이므로 무관하지만, `GOOGLE_API_KEY`를 쓰는 다른 기능이 있다면 그쪽은 여전히 무효일 수 있음(미확인, 이번 스코프 아님).

**P1 — 마이그레이션 인프라 (이번에 실제로 물림)**
3. **`moonlight_schema_migrations` 추적 테이블 + 체크섬 러너 도입.** 지금은 적용 이력·checksum·actor 기록이 없어 "전부 적용"이 argv에만 의존. `apply-migrations.mjs`가 `supabase/migrations/*.sql`을 전체 정렬·적용하고 checksum drift를 거부하며 성공을 기록하도록. (codex 지적, 이번 15 vs 19 누락이 그 증거)
4. **`setup/99_smoke_checks.sql` 갱신** — 현재 Sales OS/CRM activity/work_orders 테이블을 커버 안 함. 신규 객체(crm_activities, sales_plays, sales_play_runs, outreach_outcomes, agent_runs, work_orders, uq_work_orders_open_followup 등)를 포함하도록.

**P1 — 기존 TODOS.md (요약)**
5. Today Actions read model, Route Response Taxonomy, Production Write Auth Boundary(=RLS/Auth 경계), Behavioral Test Harness, Today-First Decision Stack, Guided Repair Queue.

**P2 — 통합/정리**
6. Hub/Engine `GITHUB_REPOSITORIES`, OpenClaw project+transport 설정.
7. RLS 롤아웃 결정: 실제 auth `profiles`+`workspace_memberships` 생성 → anon/auth/service-role 분리 테스트 → `02_rls_policies.sql` 적용. (브라우저 직접 Supabase 접근이 있다면 이건 보안 갭)

## 4. 참고 — 워킹트리 상태 (내가 만든 것 아님)
세션 시작 시 clean이었으나 현재 트리에 대량의 동시 작업이 있음(33개 M + untracked: `apps/hub/**` 다수, `apps/engine/lib/gemini.ts`, 신규 migration 4개, `apps/hub/lib/external-crm/`, `apps/hub/lib/sales-os/`, `artifacts/`, `scripts/fill-crm-intake.mjs` 등). 마이그레이션 0014~0017도 이 동시 작업의 일부. **내 변경은 gitignore된 `.env.local` 2개와 이 문서뿐** — 소스/설정 파일은 건드리지 않음.
