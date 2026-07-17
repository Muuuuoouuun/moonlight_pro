-- Project context links for the fast-create flow (after the 0019 routine and
-- 0020 nullable-progress migrations on real_v1.2).
-- Projects belong to one canonical area and may point at either a lead or a
-- customer account. Legacy areas remain untouched; canonical rows are only
-- inserted when their stable workspace slug is absent.

alter table if exists public.projects
  add column if not exists lead_id uuid,
  add column if not exists customer_account_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_lead_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_lead_id_fkey
      foreign key (lead_id) references public.leads(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_customer_account_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_customer_account_id_fkey
      foreign key (customer_account_id) references public.customer_accounts(id) on delete set null;
  end if;
end $$;

alter table public.projects
  drop constraint if exists projects_single_customer_context;
alter table public.projects
  add constraint projects_single_customer_context
  check (num_nonnulls(lead_id, customer_account_id) <= 1);

create index if not exists idx_projects_workspace_lead_updated
  on public.projects (workspace_id, lead_id, updated_at desc)
  where lead_id is not null;

create index if not exists idx_projects_workspace_customer_account_updated
  on public.projects (workspace_id, customer_account_id, updated_at desc)
  where customer_account_id is not null;

insert into public.areas (workspace_id, slug, name, kind, status)
select
  workspace.id,
  canonical.slug,
  canonical.name,
  canonical.kind,
  'active'
from public.workspaces as workspace
cross join (values
  ('sales', '영업', 'client'),
  ('marketing', '마케팅', 'growth'),
  ('content', '콘텐츠', 'brand'),
  ('it', 'IT', 'ops'),
  ('ai-third-party-development', 'AI 기반 서드파티 개발', 'ops'),
  ('personal-projects', '개인 프로젝트', 'personal')
) as canonical(slug, name, kind)
where not exists (
  select 1
  from public.areas as existing
  where existing.workspace_id = workspace.id
    and existing.slug = canonical.slug
);
