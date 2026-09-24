begin;
-- Studio AI 템플릿: 운영자가 저장해 두고 골라 쓰는 'AI 요청문 + 글 틀'.
-- 요청문은 content transform의 operatorRequest(최대 2000자)로 들어가고, 글 틀은 빈 본문에만 채워진다.
create table if not exists public.content_prompt_templates (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  request text not null default '' check (length(request) <= 2000),
  skeleton text not null default '' check (length(skeleton) <= 4000),
  revision integer not null check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_prompt_templates_workspace_idx
  on public.content_prompt_templates (workspace_id, updated_at desc);
alter table public.content_prompt_templates enable row level security;
revoke all on public.content_prompt_templates from public, anon, authenticated;
grant select, insert, update, delete on public.content_prompt_templates to service_role;
notify pgrst, 'reload schema';
commit;
