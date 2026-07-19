-- Free-text detail field for tasks (하위 항목 상세 · 참고 자료) — additive and nullable,
-- existing rows and writers are unaffected.
alter table if exists public.tasks
  add column if not exists description text;
