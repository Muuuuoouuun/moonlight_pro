# DB 최적화 · 안 쓰는 기능 감사 (2026-10-01)

> 상태: **조사 결과 + 권장안**. 아래 삭제·변경은 운영자 확정 전이며 이 커밋은 아무것도 지우지 않는다.
> 근거: `8cbc0ab` 트리의 정적 분석(코드가 테이블·RPC·라우트·파일을 어디서 부르는지).
> 한계: 운영 DB 통계(행 수·스캔 수)는 이 세션에서 볼 수 없었다. 확정 전에 `npm run db:usage`로
> 실제 값을 확인한다 — 아래 "코드 참조 0"은 "코드가 안 부른다"이지 "행이 없다"가 아니다.

## 0. 규모

| 대상 | 수 | 비고 |
| --- | --- | --- |
| 테이블 (`schema.sql` + 마이그레이션) | 104 | 이 중 39개는 `schema.sql`에만 정의 |
| SQL 함수 | 80 | 앱이 직접 부르지 않는 33개는 전부 트리거·내부 헬퍼로 확인 (예외 2건, §2) |
| 살아 있는 인덱스 | 135 | 0051 위생 패스 이후. 순수 중복 1건 (§3) |
| API 라우트 (Hub + Engine) | 208 | 저장소 안 호출처 없음 7건 (§4) |

## 1. 안 쓰는 테이블 — 코드·RPC 참조 0

앱 코드(문자열 리터럴·REST 호출)와 SQL 함수 본문 어디에서도 읽거나 쓰지 않는다.
대부분 `schema.sql` 초기 설계(`docs/supabase-db-strategy.md`의 "나중에" 목록)나 Sales OS 0005의 잔재다.

| 테이블 | 정의 | 의존 | 권장 |
| --- | --- | --- | --- |
| `api_keys`, `secret_rotations` | schema.sql | `secret_rotations → api_keys` FK | 함께 삭제 후보 |
| `export_logs` | schema.sql | 없음 | 삭제 후보 |
| `prompt_templates` | schema.sql | 없음 — 실사용은 `content_prompt_templates` | 삭제 후보 |
| `campaign_runs` | schema.sql | 없음 — `campaigns`는 사용 중 | 삭제 후보 |
| `activity_logs` | schema.sql | 없음 — 활동은 `crm_activities`·`project_updates` | 삭제 후보 |
| `documents` | schema.sql | 없음 — 보고서는 `report_documents` | 삭제 후보 |
| `issues` | schema.sql | 없음 (`"issues"`는 GitHub 이벤트 이름일 뿐) | 삭제 후보 |
| `sales_plays`, `sales_play_runs` | 0005 | `sales_play_runs → sales_plays` FK | 함께 삭제 후보 |
| `webhook_endpoints` | schema.sql | `webhook_events.endpoint_id` FK (set null) | 컬럼·FK 먼저 정리 후 삭제 후보 |
| `workspace_memberships` | 0001 | RLS 헬퍼 `is_workspace_member`·`has_workspace_role`만 사용 | **보류** — Hub·Engine이 service_role로 RLS를 우회해 지금은 효과 없지만, 다중 사용자·RLS 설계의 일부라 보안 결정 없이 지우지 않는다 |

**죽은 코드에서만 쓰이는 테이블** (§5의 파일을 지우면 같이 고아가 된다)

| 테이블 | 유일한 사용처 |
| --- | --- |
| `field_mappings` | `apps/engine/lib/notion-sync.ts` (어디서도 import 안 함) |
| `crm_xiaoshouyi_owner_names` | `apps/hub/lib/external-crm/owner-names.js` (어디서도 import 안 함) |

## 2. 안 쓰는 RPC

| 함수 | 상태 | 권장 |
| --- | --- | --- |
| `report_office_weeklies_v1` (0056, 0061에서 재정의) | 앱 호출 0 — 보고서 화면은 `report_archive_v1`을 쓴다. 테스트만 호출 | 쓸 계획이 없으면 삭제, 있으면 계획을 이 문서에 남긴다 |
| `office_requests_expire_v1` (0038) | 앱·크론 호출 0. 0038 주석이 "스케줄러를 설치하지 않는 명시적 유지보수 작업"이라고 적었다 | **보존 정책 공백** — §6 |

나머지 v1→v2 쌍(`meeting_review_*`)은 v2가 v1을 감싸 호출하므로 v1도 살아 있다.

## 3. 인덱스

**순수 중복 1건** — `idx_crm_activities_workspace_lead (workspace_id, lead_id) where lead_id is not null`은
`idx_crm_activities_lead (workspace_id, lead_id, occurred_at desc)`의 왼쪽 접두사다. 삭제 후보.

부분 인덱스 3건(`inquiries_workspace_unread_idx`, `idx_error_logs_workspace_unresolved`,
`journal_links_use_search_idx`)도 기계적으로는 접두사지만 조건이 선택적이라 의도된 것으로 본다 — 유지.

**인덱스 없이 정렬·필터되는 조회** (권장, 측정 후 판단)

| 테이블 | 조회 | 현재 인덱스 | 후보 |
| --- | --- | --- | --- |
| `deals` | `workspace_id` + `updated_at desc` (영업·매출, 오늘 연락, persona-chat) | `(workspace_id, stage, expected_close_at)` | `(workspace_id, updated_at desc)` |
| `routine_checks` | `workspace_id, project_id` + `created_at`/`checked_at` 정렬 (리듬 오늘·기록·체크 POST) | `(workspace_id, checked_at desc, …)`, idempotency unique | `(workspace_id, project_id, created_at desc)` |
| `webhook_events` | `source, status, event_type` + `received_at desc` (기록 후보) | `(workspace_id, received_at desc)`, provider unique | 행 수 확인 후 판단 |

단일 운영자 규모(수백~수천 행)에서는 순차 스캔이 더 싸서 위 인덱스가 체감 차이를 만들지 않을 수 있다.
`db:usage`에서 해당 테이블의 `seq_scan`이 높고 행이 1만을 넘을 때만 추가한다.

**`select: "*"` 18곳** — `work-orders.js`(3), `revenue-write.js`·`intake-inbox.js`·`crm-activities.js`·
`content-workflow-ledger.js`·`campaigns-ledger.js`(각 2) 등. `meta` jsonb를 통째로 실어 오므로
목록 조회부터 필요한 컬럼만 고르면 응답 크기가 준다. 인덱스보다 효과가 크다.

## 4. 저장소 안에 호출처가 없는 API 라우트

외부가 부르는 라우트(크론 6개, webhook·intake, `agent/v1/*` = MCP·Codex, OAuth 콜백)는 제외했다.
동적 경로(`/api/hub/revenue/${kind}`, `/api/hub/office/${path}`, `/api/social/<채널>/{status,connect}`)도 확인해 제외했다.

| 라우트 | 메모 |
| --- | --- |
| `GET /api/calendar/google/status` | 화면은 `event`·`connect`만 부른다 |
| `GET /api/hub/journal/contexts` | 화면 호출 없음 |
| `GET /api/hub/outcomes` | 화면 호출 없음 (결과 기록은 `revenue/contact-outcome`) |
| `POST /api/integrations/outcomes/record` | 화면 호출 없음 |
| `GET /api/social/youtube/status` | `social-brand-target.js`에 YouTube 대상이 없다 |
| `POST /api/hub/revenue/stalled-scan` | 크론·화면 어디서도 안 부른다 |
| `/api/cron/{chief-of-staff,content-flywheel,followup-autopilot}` | 2026-09-26 은퇴, 410 묘비. 의도된 상태 — 옛 호출자가 끊기면 삭제 |

운영자가 브라우저·단축어·외부 자동화에서 직접 부를 수도 있으니, 지우기 전 Vercel 로그에서 최근 호출을 확인한다.

## 5. import되지 않는 소스 파일 (테스트만 참조)

| 파일 | 줄 | 연결된 것 |
| --- | --- | --- |
| `apps/engine/lib/notion-sync.ts` | 475 | `field_mappings` |
| `apps/engine/lib/slack-alert.ts` | 278 | `error_logs`·`sync_runs` 읽기 — 알림 기능이 연결돼 있지 않다 |
| `apps/hub/lib/sales-os/work-order-executor.js` | 175 | |
| `apps/hub/lib/repositories/gmail-intake.js` | 162 | |
| `apps/hub/lib/dashboard-contexts.js` | 111 | |
| `apps/hub/lib/server-data.js` | 84 | |
| `apps/hub/lib/task-input.js` | 74 | |
| `apps/hub/lib/external-crm/owner-names.js` | 58 | `crm_xiaoshouyi_owner_names` |
| `apps/hub/lib/sales-os/draft-contract.js` | 41 | 은퇴한 두 크론의 계약 |
| `apps/hub/components/dashboard/section-card.jsx` | 24 | |
| `apps/engine/lib/multimodal-intake.ts` | 214 | 실사용은 `multimodal-intake-core` — 이 파일은 테스트만 |

(`scripts/`가 쓰는 `inbox-classify.js`·`office/evaluation-cases.mjs`는 살아 있다.)

## 6. 보존 정책 공백

크론은 6개(`vercel.json`)인데 어떤 로그성 테이블도 지우거나 줄이지 않는다.

- `office_requests`: 행마다 `expires_at = +30일`이 있고 만료 함수 `office_requests_expire_v1`도 있지만
  아무도 부르지 않는다 → 입력·맥락 스냅샷(jsonb)이 영구히 남는다. **가장 구체적인 개선점**:
  기존 `reports-sweep` 크론 끝에서 한 번 부르면 새 크론 없이 닫힌다. 0038이 일부러 스케줄러를 빼 두었으므로 운영자 확인 후 연결한다.
- `webhook_events`, `sync_runs`, `error_logs`, `automation_runs`, `ai_usage_log`, `agent_runs`,
  `crm_activities`, `lead_intake_raw`, `*_receipts`: 무기한 누적. 감사 기록 성격이라 지우는 것이
  정답은 아니다 — `db:usage`에서 크기가 수십 MB를 넘는 것만 보존 기간을 정한다.

## 7. 운영자 결정이 필요한 것

1. §1 삭제 후보 11개 테이블을 한 마이그레이션(0063)으로 지울지 — 지우기 전 `db:usage`로 행 0 확인.
2. `workspace_memberships`·RLS 헬퍼를 남길지 (다중 사용자 계획 여부).
3. `office_requests_expire_v1`을 `reports-sweep`에 연결할지.
4. §4 라우트·§5 파일 정리 (코드만 — DB 영향 없음).
5. `deals`·`routine_checks` 인덱스는 측정 결과를 보고 판단.

## 측정 방법

```bash
npm run db:usage           # 테이블별 추정 live/dead 행·seq/idx 스캔·쓰기·크기, 안 쓰인 인덱스
npm run db:usage -- --json
```

`SUPABASE_ACCESS_TOKEN`과 프로젝트 URL이 필요하다(`db:check`와 같은 env). SELECT만 보낸다.
행 수는 `pg_stat_user_tables`의 `n_live_tup`·`n_dead_tup` 추정치다. 출력의 0만으로 빈 테이블을 확정할 수 없으며 삭제 판단 전에 정확한 행 수를 별도로 확인해야 한다.
카운터는 마지막 통계 리셋 이후 값이라 출력 맨 위의 리셋 시각을 먼저 본다 — 2026-09-20 서울 이전
직후라면 "안 쓰인 인덱스"는 아직 근거가 약하다.
