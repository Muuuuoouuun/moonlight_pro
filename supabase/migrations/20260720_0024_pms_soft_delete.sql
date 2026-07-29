-- Soft-delete for PMS records (projects · tasks · brands/containers).
--
-- The Hub 내 작업 / 프로젝트 EditDrawers needed a delete path, but a hard DELETE
-- would cascade milestones and orphan tasks/decisions (FK on delete set null), and
-- is unrecoverable. Instead every delete sets `deleted_at`; the read models filter
-- `deleted_at is null`, so a deleted record disappears from every surface but stays
-- recoverable by clearing the column. Nullable + no default → existing rows read as
-- "not deleted".
alter table if exists public.projects          add column if not exists deleted_at timestamptz;
alter table if exists public.tasks             add column if not exists deleted_at timestamptz;
alter table if exists public.brands            add column if not exists deleted_at timestamptz;
-- Content shares the same soft-delete contract: 'archived' is a visible lifecycle tab, so
-- removing an errant draft needs its own marker distinct from status.
alter table if exists public.content_items     add column if not exists deleted_at timestamptz;
alter table if exists public.content_variants  add column if not exists deleted_at timestamptz;

-- Partial indexes keep the "live rows" scan cheap (the only shape the read models use).
create index if not exists idx_projects_live on public.projects (workspace_id, updated_at desc) where deleted_at is null;
create index if not exists idx_tasks_live    on public.tasks (workspace_id, updated_at desc) where deleted_at is null;
create index if not exists idx_brands_live   on public.brands (workspace_id) where deleted_at is null;
create index if not exists idx_content_items_live    on public.content_items (workspace_id, updated_at desc) where deleted_at is null;
create index if not exists idx_content_variants_live on public.content_variants (workspace_id, updated_at desc) where deleted_at is null;
