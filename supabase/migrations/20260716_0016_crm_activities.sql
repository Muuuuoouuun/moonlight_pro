-- CRM 활동 원장 확장: crm_activities는 live DB에 이미 존재한다 (entity_type/kind 구조, 110행 실데이터).
-- 이 마이그레이션은 기존 스키마를 유지한 채 Accounts 상세 패널 영속화 + Phase 1C 컨택 완료 시트가
-- 필요로 하는 컬럼만 추가하고, kind 허용값에 카카오/견적/AI 자동기록을 넓힌다.
--
-- 기존 컬럼: id, workspace_id, lead_id, deal_id, account_id, company_id,
--            entity_type(lead|deal|account), kind, body, pinned, owner_id, occurred_at, created_at

alter table if exists public.crm_activities
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists reaction text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

-- 반응은 Phase 1C 컨택 완료 시트 계약 (긍정/중립/우려/거절/무응답)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_activities_reaction_check') then
    alter table public.crm_activities
      add constraint crm_activities_reaction_check
      check (reaction is null or reaction in ('positive', 'neutral', 'concern', 'rejected', 'no_response'));
  end if;
end $$;

-- kind 허용값 확장: 기존 값 유지 + kakao(주 영업 채널) / quote(견적) / ai(AI 자동기록)
alter table public.crm_activities drop constraint if exists crm_activities_kind_check;
alter table public.crm_activities
  add constraint crm_activities_kind_check
  check (kind in ('call', 'meeting', 'info_session', 'demo', 'visit', 'email', 'update', 'note', 'deal', 'kakao', 'quote', 'ai'));

create index if not exists idx_crm_activities_workspace_account_occurred
  on public.crm_activities (workspace_id, account_id, occurred_at desc);

create index if not exists idx_crm_activities_workspace_lead
  on public.crm_activities (workspace_id, lead_id)
  where lead_id is not null;
