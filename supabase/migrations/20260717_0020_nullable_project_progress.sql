-- Preserve the difference between "no progress evidence" and a reported 0%.
-- Existing values remain unchanged; only future inserts may leave progress null.
alter table if exists public.projects
  alter column progress drop default,
  alter column progress drop not null;
