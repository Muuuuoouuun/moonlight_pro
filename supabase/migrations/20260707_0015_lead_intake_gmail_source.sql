-- Allow Gmail-scanned lead candidates as a lead_intake_raw source (Sales OS).
-- Additive: widens the source check constraint. Safe after 0013 — the recreated
-- check must carry EVERY previously-allowed value ('business_card' from 0009,
-- 'inbox' from 0010, 'eeocrm' from 0013), or applying this migration would fail
-- on rows using them / silently break those intake paths.
-- Idempotent constraint recreation so re-running is a no-op.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.lead_intake_raw'::regclass
     and pg_get_constraintdef(oid) like '%source%';
  if c is not null then
    execute format('alter table public.lead_intake_raw drop constraint %I', c);
  end if;
end $$;

alter table public.lead_intake_raw
  add constraint lead_intake_raw_source_check
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card', 'inbox', 'eeocrm', 'gmail'));
