-- Allow Gmail-scanned lead candidates as a lead_intake_raw source (Sales OS).
-- Additive: widens the source check constraint. Safe after 0009.
-- Mirrors 20260618_0009_business_card_source.sql's idempotent constraint
-- recreation so re-running this migration is a no-op.
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
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card', 'gmail'));
