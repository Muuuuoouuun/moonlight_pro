-- Sales OS 심화 v0 — 반자동 큐 + 에피소드 메모리 (Phase 0 토대).
--
-- 설계: docs/sales-os/ai-sales-system-deep-config.md (Phase 0)
-- 페르소나(/team)·인박스(/inbox)·Guru 가 산출하는 "제안"을 사람이 1클릭 승인하기 전까지
-- 머무는 큐(work_orders)와, 각 에이전트 실행 1건을 기억하는 로그(agent_runs)를 추가.
-- registry.json gates.no_auto_send=true → 모든 외부 액션은 status='approved' 이후에만.
--
-- 안전: 신규 테이블만 추가(additive). 멱등: create table/index if not exists.
-- 의존: workspaces·leads·deals·companies(0001~), outreach_outcomes(0008). 새 컬럼/제약 변경 없음.

-- (1) agent_runs — 에피소드 메모리. 페르소나/Guru 실행 1건 = 1행. 나중에 outcome 으로 귀속.
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent text not null,                       -- persona_id (order|sales|content|production|review) | 'guru'
  mode text,                                 -- guru 코칭 모드(deal-review 등) 또는 페르소나 단계
  ref text,                                  -- 대상 식별자(deal id / lead id / account name)
  input_summary text,                        -- 조립된 컨텍스트 지문(트림)
  recommendation jsonb,                      -- 에이전트가 제안한 내용
  emitted_count integer not null default 0,  -- 이 실행이 만든 work_orders 수
  result text not null default 'ok'
    check (result in ('ok', 'needs_human', 'error')),
  outcome_id uuid references public.outreach_outcomes(id) on delete set null,  -- 사후 성과 귀속(학습)
  ran_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_recent
  on public.agent_runs (workspace_id, ran_at desc);
create index if not exists idx_agent_runs_ref
  on public.agent_runs (workspace_id, ref);
create index if not exists idx_agent_runs_agent
  on public.agent_runs (workspace_id, agent, ran_at desc);

-- (2) work_orders — 반자동 승인 큐. 페르소나/인박스/Guru 가 'proposed' 로 적재.
--     데일리 브리프에서 1클릭 승인 → 'approved' → 실행 → 'executed'.
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  persona text not null,                     -- persona_id | 'guru' | 'inbox'
  kind text not null,                        -- emit 종류: next_action | followup | idea | skeleton | review | dispatch | note
  title text not null,                       -- 오퍼레이터용 짧은 라벨
  body jsonb not null default '{}'::jsonb,    -- 페르소나 emit 페이로드(next_action/objection/ideas/skeleton/...)
  -- 파이프라인 참조(모두 nullable: 딜/리드/회사 또는 콘텐츠 자산을 겨눔)
  lead_id uuid references public.leads(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  asset_id text,
  channel text,                              -- phone | visit | kakao | email | dm | publish | other
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'executed', 'dismissed')),
  gate text,                                 -- 페르소나 gate: outbound->codex | internal->auto | orchestrates | n/a
  source text not null default 'team'
    check (source in ('team', 'inbox', 'guru', 'manual')),
  run_id uuid references public.agent_runs(id) on delete set null,  -- 이 제안을 만든 실행
  outcome_id uuid references public.outreach_outcomes(id) on delete set null,  -- 실행 후 성과(루프 닫기)
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,                    -- 승인/기각 시각
  executed_at timestamptz,                   -- 외부 액션 발사 시각
  created_at timestamptz not null default now()
);

-- 승인 대기 큐(데일리 브리프 콕핏): 워크스페이스 × 상태 × 최신순.
create index if not exists idx_work_orders_queue
  on public.work_orders (workspace_id, status, proposed_at desc);
create index if not exists idx_work_orders_deal
  on public.work_orders (workspace_id, deal_id);
create index if not exists idx_work_orders_lead
  on public.work_orders (workspace_id, lead_id);
create index if not exists idx_work_orders_company
  on public.work_orders (workspace_id, company_id);
create index if not exists idx_work_orders_run
  on public.work_orders (run_id);
