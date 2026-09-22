begin;
-- Moonlight-only completion and notes; never updates Google/shared calendar text.
create table if not exists public.calendar_event_outcomes (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_key text not null check (event_key collate "C" ~ '^[a-f0-9]{64}$'),
  done boolean not null default false,
  note text not null default '' check (length(note) <= 4000),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, event_key)
);
alter table public.calendar_event_outcomes enable row level security;
revoke all on public.calendar_event_outcomes from public, anon, authenticated;
grant select, insert, update, delete on public.calendar_event_outcomes to service_role;
notify pgrst, 'reload schema';
commit;
