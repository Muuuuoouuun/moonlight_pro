-- 콘텐츠 예약: 결과물(variant)마다 올릴 시각 하나. 알림 방식 — 올리는 것은 운영자다(자동 업로드는 보류 결정).
-- status: scheduled(예약됨·올릴 시각이 되면 화면에서 '지금') → published | missed(그날 밤 정리 때 미발행) | cancelled(예약 해제).
-- 행은 지우지 않는다 — 발행 로그의 예약·놓침 이력이다.
create table if not exists public.content_schedules (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  variant_id uuid not null references public.content_variants(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  title text not null default '' check (length(title) <= 200),
  channel text not null default '' check (length(channel) <= 40),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'published', 'missed', 'cancelled')),
  revision integer not null check (revision > 0),
  published_at timestamptz,
  missed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, variant_id)
);
create index if not exists content_schedules_action_idx
  on public.content_schedules (workspace_id, status, scheduled_at);
alter table public.content_schedules enable row level security;
revoke all on public.content_schedules from public, anon, authenticated;
grant select, insert, update, delete on public.content_schedules to service_role;
notify pgrst, 'reload schema';
