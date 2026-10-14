-- 확인할 것 — 끝내기 영수증과 보류·시간 잡기(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §4·§8.1).
-- 한 줄 = 운영자가 확인할 것 한 장을 저장까지 마친 한 번(연락 기록·할 일·날짜 다시·보류·막힘 풀기·결정·시간 잡기).
-- 억제의 정본은 대상 쪽이다: 고객·거래·리드의 보류는 대상 meta.nudges.snoozedUntil이 정본이고 여기 줄은 영수증일 뿐이다.
-- 그 밖의 대상(프로젝트·자동화·콘텐츠·리드 묶음·위험)은 이 줄의 snoozed_until·scheduled_start가 정본이다.
-- 행은 지우지 않는다 — 되돌리기는 undone_at으로 남긴다(오늘 끝낸 것·다 봤음 정리의 근거).
create table if not exists public.signal_outcomes (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  signal_key text not null check (length(signal_key) between 1 and 200),
  subject_type text not null check (subject_type in ('deal', 'lead', 'account', 'project', 'automation', 'content', 'lead-group', 'risk')),
  subject_id text check (subject_id is null or length(subject_id) <= 200),
  title text not null default '' check (length(title) <= 300),
  outcome text not null check (outcome in ('contact_logged', 'task_created', 'rescheduled', 'snoozed', 'unblocked', 'decision_logged', 'scheduled')),
  record_ref jsonb check (record_ref is null or jsonb_typeof(record_ref) = 'object'),
  snoozed_until date,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  calendar_event_id text check (calendar_event_id is null or length(calendar_event_id) <= 300),
  note text not null default '' check (length(note) <= 200),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  constraint signal_outcomes_snooze_shape check ((outcome = 'snoozed') = (snoozed_until is not null)),
  constraint signal_outcomes_schedule_shape check (
    (outcome = 'scheduled') = (scheduled_start is not null)
    and (scheduled_end is null or scheduled_start is not null and scheduled_end > scheduled_start)
  )
);
create unique index if not exists signal_outcomes_request_idx
  on public.signal_outcomes (workspace_id, request_id);
create index if not exists signal_outcomes_key_idx
  on public.signal_outcomes (workspace_id, signal_key, created_at desc);
create index if not exists signal_outcomes_day_idx
  on public.signal_outcomes (workspace_id, created_at desc);
alter table public.signal_outcomes enable row level security;
revoke all on public.signal_outcomes from public, anon, authenticated;
grant select, insert, update on public.signal_outcomes to service_role;
notify pgrst, 'reload schema';
