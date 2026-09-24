-- 수익형 제품 카탈로그 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §3·§4·§5.1).
-- 2026-09-24 운영자 확정: 제품은 PMS 컨테이너(brands)가 아니라 새 products 테이블에 둔다.
-- 제품 = 오래 사는 것(단계만 바뀐다), 프로젝트 = 끝나는 것(projects.product_id로 제품 아래에 붙는다).
-- 저장소는 제품 하나에만 속한다 — (workspace_id, full_name) unique가 webhook 라우팅 키다.
-- moonlight_ops.apply_migration executes this source and records its hash atomically.

create table if not exists public.products (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- 한 줄 설명. 이름과 함께 유일한 필수 칸(§4).
  summary text not null check (length(btrim(summary)) between 1 and 200),
  org_scope text not null check (org_scope in ('personal', 'classin')),
  stage text not null default 'idea'
    check (stage in ('idea', 'validation', 'mvp', 'launch', 'growth', 'maintain', 'sunset')),
  -- 해결하는 문제·대상 고객·제공 범위·필수 조건·가격·링크(§4 설명 계약).
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  -- 제공 범위·필수 조건이 바뀌면 +1 — 적합도 결정의 재확인 트리거(§4).
  version integer not null default 1 check (version > 0),
  stage_history jsonb not null default '[]'::jsonb check (jsonb_typeof(stage_history) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_workspace_stage_idx
  on public.products (workspace_id, stage, updated_at desc);
alter table public.products enable row level security;
revoke all on public.products from public, anon, authenticated;
grant select, insert, update, delete on public.products to service_role;

alter table public.projects
  add column if not exists product_id uuid references public.products(id) on delete set null;
create index if not exists projects_workspace_product_idx
  on public.projects (workspace_id, product_id)
  where product_id is not null;

create table if not exists public.product_repositories (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  -- owner/repo, 소문자로 저장한다(GitHub 이름은 대소문자를 가리지 않는다 — eq 필터로 라우팅).
  full_name text not null
    check (full_name = lower(full_name) and full_name ~ '^[a-z0-9_.-]+/[a-z0-9_.-]+$' and length(full_name) <= 200),
  role text not null default 'app' check (length(btrim(role)) between 1 and 30),
  default_branch text not null default 'main' check (length(btrim(default_branch)) between 1 and 100),
  deploy_url text check (deploy_url is null or (deploy_url ~ '^https?://' and length(deploy_url) <= 500)),
  status text not null default 'connected' check (status in ('connected', 'error', 'disabled')),
  -- 폴링과 webhook이 갱신하는 최신 요약(CI·PR·릴리스·마지막 push). 이력은 project_updates가 가진다.
  last_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(last_summary) = 'object'),
  last_synced_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_repositories_workspace_name_idx
  on public.product_repositories (workspace_id, full_name);
create index if not exists product_repositories_product_idx
  on public.product_repositories (workspace_id, product_id);
alter table public.product_repositories enable row level security;
revoke all on public.product_repositories from public, anon, authenticated;
grant select, insert, update, delete on public.product_repositories to service_role;

-- 개발 신호(CI·PR·릴리스)는 프로젝트가 아니라 제품에 떨어진다. 기존 project_updates에 열 하나만 더한다.
alter table public.project_updates
  add column if not exists product_id uuid references public.products(id) on delete set null;
create index if not exists project_updates_product_happened_idx
  on public.project_updates (workspace_id, product_id, happened_at desc)
  where product_id is not null;

notify pgrst, 'reload schema';
