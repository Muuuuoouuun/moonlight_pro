-- Overview lean read model indexes.
--
-- The Overview route now projects only the 15 bounded slices it renders instead
-- of composing five full ledgers (~37 REST reads). These additive indexes match
-- the remaining workspace + recency access paths. They are safe to rerun.

create index if not exists idx_tasks_workspace_updated
  on public.tasks (workspace_id, updated_at desc);

create index if not exists idx_decisions_workspace_decided
  on public.decisions (workspace_id, decided_at desc);

create index if not exists idx_publish_logs_workspace_created
  on public.publish_logs (workspace_id, created_at desc);

create index if not exists idx_automation_runs_workspace_created
  on public.automation_runs (workspace_id, created_at desc);

create index if not exists idx_routine_checks_workspace_checked
  on public.routine_checks (
    workspace_id,
    checked_at desc nulls last,
    created_at desc nulls last,
    id desc
  );
